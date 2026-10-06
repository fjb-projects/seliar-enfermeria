import { and, asc, desc, eq, sql } from "drizzle-orm";
import { getDatabase } from "../db/index.server";
import {
  accountAccess,
  accountRoleGrant,
  efaBase,
  efaGuard,
  efaGuardAudit,
  efaGuardBaseEvent,
} from "../db/schema";
import { effectiveRoles, type AccountRole } from "./access";

export type EfaGuardRecord = {
  id: string;
  ownerUserId: string;
  startedAt: Date;
  endedAt: Date | null;
  declaredAtCentral: boolean;
  version: number;
};
export type EfaGuardBase = { id: string; name: string; isActive: boolean };
export type EfaGuardBaseEvent = {
  guardId: string;
  baseId: string;
  baseName: string;
  actorUserId: string;
  sequence: number;
  action: "added" | "removed";
  occurredAt: Date;
};
export type EfaGuardAuditInput = {
  guardId: string;
  actorUserId: string;
  action: "started" | "ended" | "end_corrected";
  versionBefore: number | null;
  versionAfter: number;
  beforeState: { startedAt: string; endedAt: string | null } | null;
  afterState: { startedAt: string; endedAt: string | null };
};

type EfaActorRecord = { isActive: boolean; roles: AccountRole[] };
export interface EfaGuardTransaction {
  findActor(userId: string): Promise<EfaActorRecord | null>;
  listBases(activeOnly: boolean): Promise<EfaGuardBase[]>;
  listGuards(ownerUserId: string | null): Promise<EfaGuardRecord[]>;
  findGuard(guardId: string): Promise<EfaGuardRecord | null>;
  insertGuard(input: {
    id: string;
    ownerUserId: string;
    declaredAtCentral: boolean;
    startedAt: Date;
  }): Promise<void>;
  updateGuard(
    guardId: string,
    expectedVersion: number,
    next: Pick<EfaGuardRecord, "startedAt" | "endedAt" | "version">,
  ): Promise<void>;
  listBaseEvents(guardId: string): Promise<EfaGuardBaseEvent[]>;
  appendBaseEvent(input: Omit<EfaGuardBaseEvent, "baseName" | "occurredAt">): Promise<void>;
  appendGuardAudit(input: EfaGuardAuditInput): Promise<void>;
  databaseNow(): Promise<Date>;
}
export interface EfaGuardStore {
  transaction<T>(work: (tx: EfaGuardTransaction) => Promise<T>): Promise<T>;
}

export type EfaGuardServiceDependencies = { newId?: () => string };
const randomId = () => crypto.randomUUID();
const toState = (guard: EfaGuardRecord) => ({
  startedAt: guard.startedAt.toISOString(),
  endedAt: guard.endedAt?.toISOString() ?? null,
});

export function createEfaGuardsService(
  store: EfaGuardStore,
  dependencies: EfaGuardServiceDependencies = {},
) {
  const newId = dependencies.newId ?? randomId;

  async function actor(tx: EfaGuardTransaction, userId: string, role: "efa" | "admin") {
    const current = await tx.findActor(userId);
    if (!current?.isActive) throw new Error("La cuenta está inactiva.");
    const roles = effectiveRoles(current.roles);
    if (!roles.includes(role)) {
      throw new Error(
        role === "admin"
          ? "Se requiere administración vigente."
          : "Se requiere acceso EFA vigente.",
      );
    }
    return roles;
  }

  async function ownedOrAdmin(tx: EfaGuardTransaction, userId: string, guardId: string) {
    const roles = await actor(tx, userId, "efa");
    const current = await tx.findGuard(guardId);
    if (!current) throw new Error("No se encontró la guardia.");
    const guard = { ...current };
    if (guard.ownerUserId !== userId && !roles.includes("admin")) {
      throw new Error("Solo puedes consultar o modificar tus propias guardias.");
    }
    return guard;
  }

  function assertVersion(guard: EfaGuardRecord, expectedVersion: number) {
    if (guard.version !== expectedVersion)
      throw new Error("La guardia cambió; actualiza la lista antes de continuar.");
  }

  async function withEvents(tx: EfaGuardTransaction, guard: EfaGuardRecord) {
    const [events, bases] = await Promise.all([tx.listBaseEvents(guard.id), tx.listBases(false)]);
    const names = new Map(bases.map((base) => [base.id, base.name]));
    const selected = new Map<string, EfaGuardBase>();
    for (const event of events) {
      if (event.action === "added") {
        selected.set(event.baseId, {
          id: event.baseId,
          name: event.baseName || names.get(event.baseId) || "Base histórica",
          isActive: names.has(event.baseId)
            ? bases.find((base) => base.id === event.baseId)!.isActive
            : false,
        });
      } else {
        selected.delete(event.baseId);
      }
    }
    return { ...guard, bases: [...selected.values()], baseEvents: events };
  }

  return {
    async listActiveBases(userId: string) {
      return store.transaction(async (tx) => {
        await actor(tx, userId, "efa");
        return tx.listBases(true);
      });
    },

    async list(userId: string) {
      return store.transaction(async (tx) => {
        const roles = await actor(tx, userId, "efa");
        const guards = await tx.listGuards(roles.includes("admin") ? null : userId);
        return Promise.all(guards.map((guard) => withEvents(tx, guard)));
      });
    },

    async start(userId: string, input: { declaredAtCentral: true }) {
      return store.transaction(async (tx) => {
        await actor(tx, userId, "efa");
        if ((await tx.listGuards(userId)).some((guard) => guard.endedAt === null)) {
          throw new Error("Ya tienes una guardia abierta. Termínala antes de iniciar otra.");
        }
        const id = newId();
        const startedAt = await tx.databaseNow();
        await tx.insertGuard({
          id,
          ownerUserId: userId,
          declaredAtCentral: input.declaredAtCentral,
          startedAt,
        });
        await tx.appendGuardAudit({
          guardId: id,
          actorUserId: userId,
          action: "started",
          versionBefore: null,
          versionAfter: 1,
          beforeState: null,
          afterState: { startedAt: startedAt.toISOString(), endedAt: null },
        });
        return { id };
      });
    },

    async setBases(
      userId: string,
      input: { guardId: string; expectedVersion: number; baseIds: string[] },
    ) {
      return store.transaction(async (tx) => {
        const guard = await ownedOrAdmin(tx, userId, input.guardId);
        assertVersion(guard, input.expectedVersion);
        if (guard.endedAt) throw new Error("No se pueden cambiar bases de una guardia terminada.");
        const requested = [...new Set(input.baseIds)];
        if (!requested.length) throw new Error("Selecciona al menos una base activa.");
        const activeBases = await tx.listBases(true);
        if (requested.some((id) => !activeBases.some((base) => base.id === id))) {
          throw new Error("Solo puedes seguir bases activas del catálogo.");
        }
        const history = await tx.listBaseEvents(guard.id);
        const current = new Set<string>();
        for (const event of history) {
          if (event.action === "added") current.add(event.baseId);
          else current.delete(event.baseId);
        }
        const next = new Set(requested);
        const add = requested.filter((id) => !current.has(id));
        const remove = [...current].filter((id) => !next.has(id));
        if (!add.length && !remove.length) return;
        let sequence = guard.version;
        for (const baseId of [...add, ...remove]) {
          sequence += 1;
          await tx.updateGuard(guard.id, sequence - 1, {
            startedAt: guard.startedAt,
            endedAt: null,
            version: sequence,
          });
          await tx.appendBaseEvent({
            guardId: guard.id,
            baseId,
            actorUserId: userId,
            sequence,
            action: add.includes(baseId) ? "added" : "removed",
          });
        }
      });
    },

    async end(userId: string, input: { guardId: string; expectedVersion: number }) {
      return store.transaction(async (tx) => {
        const guard = await ownedOrAdmin(tx, userId, input.guardId);
        assertVersion(guard, input.expectedVersion);
        if (guard.endedAt) throw new Error("La guardia ya está terminada.");
        const endedAt = await tx.databaseNow();
        if (endedAt < guard.startedAt)
          throw new Error("La hora de cierre no puede ser anterior al inicio.");
        await tx.updateGuard(guard.id, guard.version, {
          startedAt: guard.startedAt,
          endedAt,
          version: guard.version + 1,
        });
        await tx.appendGuardAudit({
          guardId: guard.id,
          actorUserId: userId,
          action: "ended",
          versionBefore: guard.version,
          versionAfter: guard.version + 1,
          beforeState: toState(guard),
          afterState: { ...toState(guard), endedAt: endedAt.toISOString() },
        });
      });
    },

    async correctEnd(
      userId: string,
      input: { guardId: string; expectedVersion: number; endedAt: Date },
    ) {
      return store.transaction(async (tx) => {
        await actor(tx, userId, "admin");
        const current = await tx.findGuard(input.guardId);
        if (!current) throw new Error("No se encontró la guardia.");
        const guard = { ...current };
        assertVersion(guard, input.expectedVersion);
        if (input.endedAt < guard.startedAt)
          throw new Error("La hora de cierre no puede ser anterior al inicio.");
        if (guard.endedAt?.getTime() === input.endedAt.getTime()) return;
        await tx.updateGuard(guard.id, guard.version, {
          startedAt: guard.startedAt,
          endedAt: input.endedAt,
          version: guard.version + 1,
        });
        await tx.appendGuardAudit({
          guardId: guard.id,
          actorUserId: userId,
          action: "end_corrected",
          versionBefore: guard.version,
          versionAfter: guard.version + 1,
          beforeState: toState(guard),
          afterState: { ...toState(guard), endedAt: input.endedAt.toISOString() },
        });
      });
    },
  };
}

const drizzleStore: EfaGuardStore = {
  async transaction(work) {
    return getDatabase().transaction(async (db) => {
      const tx: EfaGuardTransaction = {
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
        async listBases(activeOnly) {
          const query = db
            .select({ id: efaBase.id, name: efaBase.name, isActive: efaBase.isActive })
            .from(efaBase);
          return activeOnly
            ? query.where(eq(efaBase.isActive, true)).orderBy(asc(efaBase.name))
            : query.orderBy(asc(efaBase.name));
        },
        async listGuards(ownerUserId) {
          const query = db.select().from(efaGuard);
          return ownerUserId
            ? query.where(eq(efaGuard.ownerUserId, ownerUserId)).orderBy(desc(efaGuard.startedAt))
            : query.orderBy(desc(efaGuard.startedAt));
        },
        async findGuard(guardId) {
          const rows = await db.select().from(efaGuard).where(eq(efaGuard.id, guardId)).limit(1);
          return rows[0] ?? null;
        },
        async insertGuard(input) {
          await db.insert(efaGuard).values(input);
        },
        async updateGuard(guardId, expectedVersion, next) {
          const changed = await db
            .update(efaGuard)
            .set({ ...next, updatedAt: sql`now()` })
            .where(and(eq(efaGuard.id, guardId), eq(efaGuard.version, expectedVersion)))
            .returning({ id: efaGuard.id });
          if (!changed.length)
            throw new Error("La guardia cambió; actualiza la lista antes de continuar.");
        },
        async listBaseEvents(guardId) {
          return db
            .select({
              guardId: efaGuardBaseEvent.guardId,
              baseId: efaGuardBaseEvent.baseId,
              baseName: efaBase.name,
              actorUserId: efaGuardBaseEvent.actorUserId,
              sequence: efaGuardBaseEvent.sequence,
              action: efaGuardBaseEvent.action,
              occurredAt: efaGuardBaseEvent.occurredAt,
            })
            .from(efaGuardBaseEvent)
            .innerJoin(efaBase, eq(efaBase.id, efaGuardBaseEvent.baseId))
            .where(eq(efaGuardBaseEvent.guardId, guardId))
            .orderBy(asc(efaGuardBaseEvent.sequence)) as Promise<EfaGuardBaseEvent[]>;
        },
        async appendBaseEvent(input) {
          await db.insert(efaGuardBaseEvent).values(input);
        },
        async appendGuardAudit(input) {
          await db.insert(efaGuardAudit).values(input);
        },
        async databaseNow() {
          const result = await db.execute(sql`select now() as now`);
          return result.rows[0]!["now"] as Date;
        },
      };
      return work(tx);
    });
  },
};

export const efaGuards = createEfaGuardsService(drizzleStore);
