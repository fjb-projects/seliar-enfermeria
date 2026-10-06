import { and, asc, desc, eq, isNull, sql } from "drizzle-orm";
import { createHash } from "node:crypto";
import { getDatabase } from "../db/index.server";
import {
  accountAccess,
  accountRoleGrant,
  efaEpisode,
  efaEpisodeAudit,
  efaEpisodeNotice,
  efaEpisodeOperation,
  efaGuard,
} from "../db/schema";
import { effectiveRoles, type AccountRole } from "./access";

export type EfaEpisodeState = {
  eventAt: string;
  motive: string | null;
  address: string | null;
  interventionNumber: string | null;
  state: "draft";
};
export type EfaEpisodeRecord = {
  id: string;
  clientCreationKey: string;
  ownerUserId: string;
  originGuardId: string;
  eventAt: Date;
  motive: string | null;
  address: string | null;
  interventionNumber: string | null;
  state: "draft";
  version: number;
  createdAt: Date;
  updatedAt: Date;
};
type EfaEpisodeActor = { isActive: boolean; roles: AccountRole[] };
type EfaEpisodeGuard = { id: string; ownerUserId: string; endedAt: Date | null };
export type EfaEpisodeOperationRecord = {
  id: string;
  episodeId: string;
  actorUserId: string;
  clientOperationId: string;
  action: "created" | "updated";
  requestHash: string;
  appliedVersion: number;
  changed: boolean;
};
export type EfaEpisodeAuditRecord = {
  id: string;
  episodeId: string;
  actorUserId: string;
  action: "created" | "updated";
  versionBefore: number | null;
  versionAfter: number;
  beforeState: EfaEpisodeState | null;
  afterState: EfaEpisodeState;
  occurredAt: Date;
};
export type EfaEpisodeNoticeRecord = {
  id: string;
  episodeId: string;
  auditId: string;
  recipientUserId: string;
  createdAt: Date;
  readAt: Date | null;
};

export interface EfaEpisodeTransaction {
  findActor(userId: string): Promise<EfaEpisodeActor | null>;
  findGuard(guardId: string, lock?: boolean): Promise<EfaEpisodeGuard | null>;
  listEpisodes(ownerUserId: string | null): Promise<EfaEpisodeRecord[]>;
  findEpisode(episodeId: string, lock?: boolean): Promise<EfaEpisodeRecord | null>;
  findEpisodeByCreationKey(userId: string, key: string): Promise<EfaEpisodeRecord | null>;
  findOperation(
    episodeId: string,
    clientOperationId: string,
  ): Promise<EfaEpisodeOperationRecord | null>;
  insertEpisode(
    input: Omit<EfaEpisodeRecord, "version" | "createdAt" | "updatedAt">,
  ): Promise<void>;
  updateEpisode(
    episodeId: string,
    expectedVersion: number,
    next: Pick<
      EfaEpisodeRecord,
      "eventAt" | "motive" | "address" | "interventionNumber" | "version"
    >,
  ): Promise<void>;
  appendAudit(input: {
    episodeId: string;
    actorUserId: string;
    operationId: string;
    action: "created" | "updated";
    versionBefore: number | null;
    versionAfter: number;
    beforeState: EfaEpisodeState | null;
    afterState: EfaEpisodeState;
  }): Promise<string>;
  appendNotice(input: {
    episodeId: string;
    auditId: string;
    recipientUserId: string;
  }): Promise<void>;
  insertOperation(input: Omit<EfaEpisodeOperationRecord, "id">): Promise<void>;
  listAudits(episodeId: string): Promise<EfaEpisodeAuditRecord[]>;
  listNotices(recipientUserId: string): Promise<EfaEpisodeNoticeRecord[]>;
  markNoticeRead(noticeId: string, recipientUserId: string): Promise<EfaEpisodeNoticeRecord | null>;
}
export interface EfaEpisodeStore {
  transaction<T>(work: (tx: EfaEpisodeTransaction) => Promise<T>): Promise<T>;
}

export type EfaEpisodeView = Omit<EfaEpisodeRecord, "eventAt" | "createdAt" | "updatedAt"> & {
  eventAt: string;
  createdAt: string;
  updatedAt: string;
  canEdit: boolean;
};
export type EfaEpisodeMutationResult = {
  episode: EfaEpisodeView;
  operation: {
    id: string;
    action: "created" | "updated";
    appliedVersion: number;
    changed: boolean;
    replayed: boolean;
  };
};
export type EfaEpisodesServiceDependencies = { newId?: () => string };
const randomId = () => crypto.randomUUID();
const toState = (
  record: Pick<EfaEpisodeRecord, "eventAt" | "motive" | "address" | "interventionNumber">,
): EfaEpisodeState => ({
  eventAt: record.eventAt.toISOString(),
  motive: record.motive,
  address: record.address,
  interventionNumber: record.interventionNumber,
  state: "draft",
});
const requestHash = (action: "created" | "updated", values: Record<string, unknown>) =>
  createHash("sha256")
    .update(JSON.stringify({ action, ...values }))
    .digest("hex");
const asDate = (value: string | Date) => {
  const parsed = value instanceof Date ? new Date(value) : new Date(value);
  if (!Number.isFinite(parsed.getTime())) throw new Error("La fecha del episodio no es válida.");
  return parsed;
};
const cleanOptional = (value: string | null | undefined) => {
  const cleaned = value?.trim() ?? "";
  return cleaned.length ? cleaned : null;
};

function view(record: EfaEpisodeRecord, canEdit: boolean): EfaEpisodeView {
  return {
    ...record,
    eventAt: record.eventAt.toISOString(),
    createdAt: record.createdAt.toISOString(),
    updatedAt: record.updatedAt.toISOString(),
    canEdit,
  };
}

export function createEfaEpisodesService(
  store: EfaEpisodeStore,
  dependencies: EfaEpisodesServiceDependencies = {},
) {
  const newId = dependencies.newId ?? randomId;

  async function actor(tx: EfaEpisodeTransaction, userId: string, write: boolean) {
    const current = await tx.findActor(userId);
    if (!current?.isActive) throw new Error("La cuenta está inactiva.");
    const roles = effectiveRoles(current.roles);
    if (write && !roles.includes("efa")) throw new Error("Se requiere acceso EFA vigente.");
    return { roles, canEdit: roles.includes("efa") };
  }

  function replayResult(
    record: EfaEpisodeRecord,
    operation: EfaEpisodeOperationRecord,
  ): EfaEpisodeMutationResult {
    return {
      episode: view(record, true),
      operation: {
        id: operation.clientOperationId,
        action: operation.action,
        appliedVersion: operation.appliedVersion,
        changed: operation.changed,
        replayed: true,
      },
    };
  }

  function assertOperation(
    operation: EfaEpisodeOperationRecord | null,
    actorUserId: string,
    action: "created" | "updated",
    hash: string,
  ): asserts operation is EfaEpisodeOperationRecord {
    if (
      !operation ||
      operation.actorUserId !== actorUserId ||
      operation.action !== action ||
      operation.requestHash !== hash
    ) {
      throw new Error("La identidad de operación ya se usó para otro cambio.");
    }
  }

  return {
    async list(userId: string) {
      return store.transaction(async (tx) => {
        const { roles, canEdit } = await actor(tx, userId, false);
        const records = await tx.listEpisodes(roles.includes("admin") ? null : userId);
        return records.map((record) => view(record, canEdit));
      });
    },

    async get(userId: string, episodeId: string) {
      return store.transaction(async (tx) => {
        const { roles, canEdit } = await actor(tx, userId, false);
        const record = await tx.findEpisode(episodeId);
        if (!record || (record.ownerUserId !== userId && !roles.includes("admin"))) {
          throw new Error("No se encontró el episodio.");
        }
        return view(record, canEdit);
      });
    },

    async history(userId: string, episodeId: string) {
      return store.transaction(async (tx) => {
        const { roles } = await actor(tx, userId, false);
        const record = await tx.findEpisode(episodeId);
        if (!record || (record.ownerUserId !== userId && !roles.includes("admin"))) {
          throw new Error("No se encontró el episodio.");
        }
        return tx.listAudits(episodeId).then((history) =>
          history.map((item) => ({
            ...item,
            occurredAt: item.occurredAt.toISOString(),
          })),
        );
      });
    },

    async listNotices(userId: string) {
      return store.transaction(async (tx) => {
        await actor(tx, userId, false);
        const notices = await tx.listNotices(userId);
        return notices.map(({ id, episodeId, createdAt, readAt }) => ({
          id,
          episodeId,
          createdAt: createdAt.toISOString(),
          readAt: readAt?.toISOString() ?? null,
        }));
      });
    },

    async markNoticeRead(userId: string, noticeId: string) {
      return store.transaction(async (tx) => {
        await actor(tx, userId, false);
        const notice = await tx.markNoticeRead(noticeId, userId);
        if (!notice) throw new Error("No se encontró el aviso.");
        return {
          id: notice.id,
          episodeId: notice.episodeId,
          createdAt: notice.createdAt.toISOString(),
          readAt: notice.readAt?.toISOString() ?? null,
        };
      });
    },

    async create(
      userId: string,
      input: {
        clientCreationKey: string;
        guardId: string;
        eventAt: string | Date;
        motive?: string | null;
        address?: string | null;
        interventionNumber?: string | null;
      },
    ) {
      const eventAt = asDate(input.eventAt);
      const motive = cleanOptional(input.motive);
      const address = cleanOptional(input.address);
      const interventionNumber = cleanOptional(input.interventionNumber);
      const hash = requestHash("created", {
        actorUserId: userId,
        clientCreationKey: input.clientCreationKey,
        guardId: input.guardId,
        eventAt: eventAt.toISOString(),
        motive,
        address,
        interventionNumber,
      });
      return store.transaction(async (tx) => {
        await actor(tx, userId, true);
        const replayExisting = async (existing: EfaEpisodeRecord | null) => {
          if (!existing) return null;
          const operation = await tx.findOperation(existing.id, input.clientCreationKey);
          assertOperation(operation, userId, "created", hash);
          return replayResult(existing, operation);
        };
        const prior = await replayExisting(
          await tx.findEpisodeByCreationKey(userId, input.clientCreationKey),
        );
        if (prior) return prior;
        const guard = await tx.findGuard(input.guardId, true);
        // Re-read the creation key after acquiring the origin guard row lock to serialize duplicate submissions.
        const afterLock = await replayExisting(
          await tx.findEpisodeByCreationKey(userId, input.clientCreationKey),
        );
        if (afterLock) return afterLock;
        if (!guard || guard.ownerUserId !== userId)
          throw new Error("Solo puedes crear episodios desde una guardia propia.");
        if (guard.endedAt) throw new Error("La guardia debe estar abierta para crear un episodio.");
        const id = newId();
        const record = {
          id,
          clientCreationKey: input.clientCreationKey,
          ownerUserId: userId,
          originGuardId: input.guardId,
          eventAt,
          motive,
          address,
          interventionNumber,
          state: "draft" as const,
        };
        await tx.insertEpisode(record);
        await tx.appendAudit({
          episodeId: id,
          actorUserId: userId,
          operationId: input.clientCreationKey,
          action: "created",
          versionBefore: null,
          versionAfter: 1,
          beforeState: null,
          afterState: toState(record),
        });
        await tx.insertOperation({
          episodeId: id,
          actorUserId: userId,
          clientOperationId: input.clientCreationKey,
          action: "created",
          requestHash: hash,
          appliedVersion: 1,
          changed: true,
        });
        const inserted = await tx.findEpisode(id);
        if (!inserted) throw new Error("No se pudo confirmar el episodio guardado.");
        return {
          episode: view(inserted, true),
          operation: {
            id: input.clientCreationKey,
            action: "created" as const,
            appliedVersion: 1,
            changed: true,
            replayed: false,
          },
        };
      });
    },

    async update(
      userId: string,
      input: {
        episodeId: string;
        expectedVersion: number;
        operationId: string;
        eventAt: string | Date;
        motive: string | null;
        address: string | null;
        interventionNumber: string | null;
      },
    ) {
      const eventAt = asDate(input.eventAt);
      const next = {
        eventAt: eventAt.toISOString(),
        motive: cleanOptional(input.motive),
        address: cleanOptional(input.address),
        interventionNumber: cleanOptional(input.interventionNumber),
        state: "draft" as const,
      };
      const hash = requestHash("updated", {
        actorUserId: userId,
        episodeId: input.episodeId,
        expectedVersion: input.expectedVersion,
        eventAt: next.eventAt,
        motive: next.motive,
        address: next.address,
        interventionNumber: next.interventionNumber,
      });
      return store.transaction(async (tx) => {
        const { roles } = await actor(tx, userId, true);
        const current = await tx.findEpisode(input.episodeId, true);
        if (!current || (current.ownerUserId !== userId && !roles.includes("admin"))) {
          throw new Error("No se encontró el episodio.");
        }
        const existingOperation = await tx.findOperation(input.episodeId, input.operationId);
        if (existingOperation) {
          assertOperation(existingOperation, userId, "updated", hash);
          return replayResult(current, existingOperation);
        }
        if (current.version !== input.expectedVersion) {
          throw new Error("El episodio cambió; actualiza el historial antes de continuar.");
        }
        const beforeState = toState(current);
        const noChange =
          beforeState.eventAt === next.eventAt &&
          beforeState.motive === next.motive &&
          beforeState.address === next.address &&
          beforeState.interventionNumber === next.interventionNumber;
        if (noChange) {
          await tx.insertOperation({
            episodeId: current.id,
            actorUserId: userId,
            clientOperationId: input.operationId,
            action: "updated",
            requestHash: hash,
            appliedVersion: current.version,
            changed: false,
          });
          return {
            episode: view(current, true),
            operation: {
              id: input.operationId,
              action: "updated" as const,
              appliedVersion: current.version,
              changed: false,
              replayed: false,
            },
          };
        }
        const version = current.version + 1;
        await tx.updateEpisode(current.id, current.version, {
          eventAt,
          motive: next.motive,
          address: next.address,
          interventionNumber: next.interventionNumber,
          version,
        });
        const auditId = await tx.appendAudit({
          episodeId: current.id,
          actorUserId: userId,
          operationId: input.operationId,
          action: "updated",
          versionBefore: current.version,
          versionAfter: version,
          beforeState,
          afterState: next,
        });
        if (current.ownerUserId !== userId) {
          await tx.appendNotice({
            episodeId: current.id,
            auditId,
            recipientUserId: current.ownerUserId,
          });
        }
        await tx.insertOperation({
          episodeId: current.id,
          actorUserId: userId,
          clientOperationId: input.operationId,
          action: "updated",
          requestHash: hash,
          appliedVersion: version,
          changed: true,
        });
        const updated = await tx.findEpisode(current.id);
        if (!updated) throw new Error("No se pudo confirmar el episodio actualizado.");
        return {
          episode: view(updated, true),
          operation: {
            id: input.operationId,
            action: "updated" as const,
            appliedVersion: version,
            changed: true,
            replayed: false,
          },
        };
      });
    },
  };
}

const drizzleStore: EfaEpisodeStore = {
  async transaction(work) {
    return getDatabase().transaction(async (db) => {
      const tx: EfaEpisodeTransaction = {
        async findActor(userId) {
          const rows = await db
            .select({ isActive: accountAccess.isActive, role: accountRoleGrant.role })
            .from(accountAccess)
            .leftJoin(accountRoleGrant, eq(accountRoleGrant.userId, accountAccess.userId))
            .where(eq(accountAccess.userId, userId));
          if (!rows.length) return null;
          return {
            isActive: rows[0]!.isActive,
            roles: rows.flatMap((row) => (row.role ? [row.role as AccountRole] : [])),
          };
        },
        async findGuard(guardId, lock = false) {
          let query = db
            .select({
              id: efaGuard.id,
              ownerUserId: efaGuard.ownerUserId,
              endedAt: efaGuard.endedAt,
            })
            .from(efaGuard)
            .where(eq(efaGuard.id, guardId))
            .limit(1);
          if (lock) query = query.for("update") as typeof query;
          const rows = await query;
          return rows[0] ?? null;
        },
        async listEpisodes(ownerUserId) {
          const query = db.select().from(efaEpisode);
          const rows = ownerUserId
            ? await query
                .where(eq(efaEpisode.ownerUserId, ownerUserId))
                .orderBy(desc(efaEpisode.eventAt), desc(efaEpisode.createdAt))
            : await query.orderBy(desc(efaEpisode.eventAt), desc(efaEpisode.createdAt));
          return rows as EfaEpisodeRecord[];
        },
        async findEpisode(episodeId, lock = false) {
          let query = db.select().from(efaEpisode).where(eq(efaEpisode.id, episodeId)).limit(1);
          if (lock) query = query.for("update") as typeof query;
          const rows = await query;
          return (rows[0] as EfaEpisodeRecord | undefined) ?? null;
        },
        async findEpisodeByCreationKey(userId, key) {
          const rows = await db
            .select()
            .from(efaEpisode)
            .where(and(eq(efaEpisode.ownerUserId, userId), eq(efaEpisode.clientCreationKey, key)))
            .limit(1);
          return (rows[0] as EfaEpisodeRecord | undefined) ?? null;
        },
        async findOperation(episodeId, clientOperationId) {
          const rows = await db
            .select({
              id: efaEpisodeOperation.id,
              actorUserId: efaEpisodeOperation.actorUserId,
              clientOperationId: efaEpisodeOperation.clientOperationId,
              action: efaEpisodeOperation.action,
              requestHash: efaEpisodeOperation.requestHash,
              appliedVersion: efaEpisodeOperation.appliedVersion,
              changed: efaEpisodeOperation.changed,
            })
            .from(efaEpisodeOperation)
            .where(
              and(
                eq(efaEpisodeOperation.episodeId, episodeId),
                eq(efaEpisodeOperation.clientOperationId, clientOperationId),
              ),
            )
            .limit(1);
          return (rows[0] as EfaEpisodeOperationRecord | undefined) ?? null;
        },
        async insertEpisode(input) {
          await db.insert(efaEpisode).values(input);
        },
        async updateEpisode(episodeId, expectedVersion, next) {
          const rows = await db
            .update(efaEpisode)
            .set({ ...next, updatedAt: sql`now()` })
            .where(and(eq(efaEpisode.id, episodeId), eq(efaEpisode.version, expectedVersion)))
            .returning({ id: efaEpisode.id });
          if (!rows.length)
            throw new Error("El episodio cambió; actualiza el historial antes de continuar.");
        },
        async appendAudit(input) {
          const rows = await db
            .insert(efaEpisodeAudit)
            .values(input)
            .returning({ id: efaEpisodeAudit.id });
          if (!rows[0]) throw new Error("No se pudo confirmar el historial del episodio.");
          return rows[0].id;
        },
        async appendNotice(input) {
          await db.insert(efaEpisodeNotice).values(input);
        },
        async insertOperation(input) {
          await db.insert(efaEpisodeOperation).values(input);
        },
        async listAudits(episodeId) {
          const rows = await db
            .select()
            .from(efaEpisodeAudit)
            .where(eq(efaEpisodeAudit.episodeId, episodeId))
            .orderBy(asc(efaEpisodeAudit.versionAfter));
          return rows as unknown as EfaEpisodeAuditRecord[];
        },
        async listNotices(recipientUserId) {
          const rows = await db
            .select()
            .from(efaEpisodeNotice)
            .where(eq(efaEpisodeNotice.recipientUserId, recipientUserId))
            .orderBy(desc(efaEpisodeNotice.createdAt));
          return rows;
        },
        async markNoticeRead(noticeId, recipientUserId) {
          const updated = await db
            .update(efaEpisodeNotice)
            .set({ readAt: sql`coalesce(${efaEpisodeNotice.readAt}, now())` })
            .where(
              and(
                eq(efaEpisodeNotice.id, noticeId),
                eq(efaEpisodeNotice.recipientUserId, recipientUserId),
                isNull(efaEpisodeNotice.readAt),
              ),
            )
            .returning();
          if (updated[0]) return updated[0];
          const existing = await db
            .select()
            .from(efaEpisodeNotice)
            .where(
              and(
                eq(efaEpisodeNotice.id, noticeId),
                eq(efaEpisodeNotice.recipientUserId, recipientUserId),
              ),
            )
            .limit(1);
          return existing[0] ?? null;
        },
      };
      return work(tx);
    });
  },
};

export const efaEpisodes = createEfaEpisodesService(drizzleStore);
