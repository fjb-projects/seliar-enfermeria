import { createHash } from "node:crypto";
import { and, asc, desc, eq, isNull, sql } from "drizzle-orm";
import { getDatabase } from "../db/index.server";
import {
  accountAccess,
  accountRoleGrant,
  efaBase,
  efaCommunication,
  efaDispatch,
  efaDispatchAudit,
  efaDispatchContactAttempt,
  efaDispatchNotice,
  efaDispatchOperation,
  efaEpisode,
  efaSupportRequest,
  efaSupportRequestAudit,
  efaSupportRequestNotice,
  efaSupportRequestOperation,
} from "../db/schema";
import { effectiveRoles, type AccountRole } from "./access";

export type DispatchPriority = "red" | "yellow" | "green";
export type DispatchResult =
  | "transported"
  | "treated_at_home"
  | "refused"
  | "not_located"
  | "cancelled"
  | "death"
  | "not_informed";
export type ObservationStatus = "observed" | "not_observed" | "not_informed" | "not_applicable";
type TimingKey = "t0" | "t1" | "t2" | "t3" | "t4" | "t5" | "t6";
export type DispatchFields = {
  baseId: string;
  communicationId: string | null;
  priority: DispatchPriority | null;
  t0At: Date | null;
  t0Status: ObservationStatus;
  t1At: Date | null;
  t1Status: ObservationStatus;
  t2At: Date | null;
  t2Status: ObservationStatus;
  t3At: Date | null;
  t3Status: ObservationStatus;
  t4At: Date | null;
  t4Status: ObservationStatus;
  t5At: Date | null;
  t5Status: ObservationStatus;
  t6At: Date | null;
  t6Status: ObservationStatus;
  firstResponseRole: string | null;
  firstResponseAt: Date | null;
  note: string | null;
  result: DispatchResult | null;
  resultClarification: string | null;
};
type DispatchInputFields = Partial<{
  [K in keyof DispatchFields]: DispatchFields[K] | string | undefined;
}>;
export type DispatchRecord = DispatchFields & {
  id: string;
  episodeId: string;
  ownerUserId: string;
  clientCreationKey: string;
  state: "draft" | "finalized";
  version: number;
  finalizedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
};
export type DispatchAudit = {
  id: string;
  dispatchId: string;
  ownerUserId: string;
  actorUserId: string;
  operationId: string;
  action: "created" | "updated" | "finalized";
  versionBefore: number | null;
  versionAfter: number;
  beforeState: Record<string, string | null> | null;
  afterState: Record<string, string | null>;
  occurredAt: Date;
};
export type DispatchOperation = {
  id: string;
  dispatchId: string;
  ownerUserId: string;
  actorUserId: string;
  clientOperationId: string;
  action: "created" | "updated" | "finalized";
  requestHash: string;
  appliedVersion: number;
  changed: boolean;
};
export type SupportRequestRecord = {
  id: string;
  ownerUserId: string;
  episodeId: string;
  sourceDispatchId: string;
  responseDispatchId: string | null;
  clientCreationKey: string;
  requestedAt: Date;
  reason: string;
  version: number;
  createdAt: Date;
  updatedAt: Date;
};
export type SupportOperation = {
  id: string;
  supportRequestId: string;
  ownerUserId: string;
  actorUserId: string;
  clientOperationId: string;
  action: "created" | "updated";
  requestHash: string;
  appliedVersion: number;
  changed: boolean;
};
type Actor = { isActive: boolean; roles: AccountRole[] };
type Episode = { id: string; ownerUserId: string };
type Base = { id: string; isActive: boolean };
type Communication = {
  id: string;
  episodeId: string;
  ownerUserId: string;
  priority: DispatchPriority | null;
};
export interface DispatchTransaction {
  findActor(id: string): Promise<Actor | null>;
  findEpisode(id: string, lock?: boolean): Promise<Episode | null>;
  findBase(id: string): Promise<Base | null>;
  findCommunication(id: string): Promise<Communication | null>;
  listDispatches(episodeId: string): Promise<DispatchRecord[]>;
  findDispatch(id: string, lock?: boolean): Promise<DispatchRecord | null>;
  findDispatchByKey(owner: string, key: string): Promise<DispatchRecord | null>;
  findDispatchOperation(dispatchId: string, operationId: string): Promise<DispatchOperation | null>;
  insertDispatch(
    input: Omit<DispatchRecord, "version" | "createdAt" | "updatedAt" | "finalizedAt">,
  ): Promise<void>;
  updateDispatch(
    id: string,
    version: number,
    fields: Partial<DispatchFields> & {
      state: "draft" | "finalized";
      version: number;
      finalizedAt: Date | null;
    },
  ): Promise<void>;
  appendDispatchAudit(input: Omit<DispatchAudit, "id" | "occurredAt">): Promise<string>;
  insertDispatchOperation(input: Omit<DispatchOperation, "id">): Promise<void>;
  listDispatchAudits(id: string): Promise<DispatchAudit[]>;
  listDispatchNotices(
    userId: string,
  ): Promise<Array<{ id: string; dispatchId: string; createdAt: Date; readAt: Date | null }>>;
  appendDispatchNotice(input: {
    dispatchId: string;
    ownerUserId: string;
    auditId: string;
    recipientUserId: string;
  }): Promise<void>;
  markDispatchNoticeRead(
    id: string,
    recipient: string,
  ): Promise<{ id: string; dispatchId: string; createdAt: Date; readAt: Date | null } | null>;
  findContactAttempt(
    dispatchId: string,
    eventId: string,
  ): Promise<{
    id: string;
    dispatchId: string;
    ownerUserId: string;
    actorUserId: string;
    clientEventId: string;
    occurredAt: Date;
    note: string | null;
    createdAt: Date;
  } | null>;
  insertContactAttempt(input: {
    id: string;
    dispatchId: string;
    ownerUserId: string;
    actorUserId: string;
    clientEventId: string;
    occurredAt: Date;
    note: string | null;
  }): Promise<void>;
  listContactAttempts(dispatchId: string): Promise<
    Array<{
      id: string;
      dispatchId: string;
      ownerUserId: string;
      actorUserId: string;
      clientEventId: string;
      occurredAt: Date;
      note: string | null;
      createdAt: Date;
    }>
  >;
  listSupportRequests(episodeId: string): Promise<SupportRequestRecord[]>;
  findSupportRequest(id: string, lock?: boolean): Promise<SupportRequestRecord | null>;
  findSupportByKey(owner: string, key: string): Promise<SupportRequestRecord | null>;
  findSupportOperation(id: string, key: string): Promise<SupportOperation | null>;
  insertSupportRequest(
    input: Omit<SupportRequestRecord, "version" | "createdAt" | "updatedAt">,
  ): Promise<void>;
  updateSupportRequest(
    id: string,
    version: number,
    next: Pick<SupportRequestRecord, "requestedAt" | "reason" | "responseDispatchId" | "version">,
  ): Promise<void>;
  appendSupportAudit(
    input: Omit<DispatchAudit, "id" | "dispatchId" | "occurredAt"> & { supportRequestId: string },
  ): Promise<string>;
  insertSupportOperation(input: Omit<SupportOperation, "id">): Promise<void>;
  listSupportAudits(
    id: string,
  ): Promise<Array<Omit<DispatchAudit, "dispatchId"> & { supportRequestId: string }>>;
  appendSupportNotice(input: {
    supportRequestId: string;
    ownerUserId: string;
    auditId: string;
    recipientUserId: string;
  }): Promise<void>;
  listSupportNotices(
    userId: string,
  ): Promise<Array<{ id: string; supportRequestId: string; createdAt: Date; readAt: Date | null }>>;
  markSupportNoticeRead(
    id: string,
    recipient: string,
  ): Promise<{ id: string; supportRequestId: string; createdAt: Date; readAt: Date | null } | null>;
  currentTimestamp(): Promise<Date>;
}
export interface DispatchStore {
  transaction<T>(work: (tx: DispatchTransaction) => Promise<T>): Promise<T>;
}

const id = () => crypto.randomUUID();
const canonicalize = (value: unknown): unknown => {
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value && typeof value === "object")
    return Object.fromEntries(
      Object.entries(value)
        .sort(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0))
        .map(([key, item]) => [key, canonicalize(item)]),
    );
  return value;
};
const hash = (value: unknown) =>
  createHash("sha256")
    .update(JSON.stringify(canonicalize(value)))
    .digest("hex");
const priorities = ["red", "yellow", "green"];
const results: DispatchResult[] = [
  "transported",
  "treated_at_home",
  "refused",
  "not_located",
  "cancelled",
  "death",
  "not_informed",
];
const parseDate = (value: string | Date | null | undefined, label: string): Date | null => {
  if (value == null) return null;
  const parsed = value instanceof Date ? new Date(value) : new Date(value);
  if (!Number.isFinite(parsed.getTime())) throw new Error(`La hora de ${label} no es válida.`);
  return parsed;
};
const visible = (owner: string, user: string, roles: AccountRole[]) =>
  owner === user || roles.includes("admin");
const fieldKeys = [
  "baseId",
  "communicationId",
  "priority",
  ...Array.from({ length: 7 }, (_, i) => [`t${i}At`, `t${i}Status`]).flat(),
  "firstResponseRole",
  "firstResponseAt",
  "note",
  "result",
  "resultClarification",
] as const;
const dispatchState = (record: DispatchRecord): Record<string, string | null> => ({
  ...Object.fromEntries(
    fieldKeys.map((key) => {
      const value = (record as unknown as Record<string, unknown>)[key];
      return [
        key,
        value instanceof Date
          ? value.toISOString()
          : ((value as string | null | undefined) ?? null),
      ];
    }),
  ),
  state: record.state,
  finalizedAt: record.finalizedAt?.toISOString() ?? null,
});
const view = (record: DispatchRecord, canEdit: boolean) => ({
  ...record,
  ...Object.fromEntries(
    fieldKeys
      .filter((key) => key.endsWith("At"))
      .map((key) => [
        key,
        (record as unknown as Record<string, Date | null>)[key]?.toISOString() ?? null,
      ]),
  ),
  finalizedAt: record.finalizedAt?.toISOString() ?? null,
  createdAt: record.createdAt.toISOString(),
  updatedAt: record.updatedAt.toISOString(),
  canEdit,
});
const viewRequest = (record: SupportRequestRecord, canEdit: boolean) => ({
  ...record,
  requestedAt: record.requestedAt.toISOString(),
  createdAt: record.createdAt.toISOString(),
  updatedAt: record.updatedAt.toISOString(),
  canEdit,
});

export function createEfaDispatchesService(
  store: DispatchStore,
  dependencies: { newId?: () => string } = {},
) {
  const newId = dependencies.newId ?? id;
  async function actor(tx: DispatchTransaction, userId: string, write: boolean) {
    const current = await tx.findActor(userId);
    if (!current?.isActive) throw new Error("La cuenta está inactiva.");
    const roles = effectiveRoles(current.roles);
    if (write && !roles.includes("efa")) throw new Error("Se requiere acceso EFA vigente.");
    return { roles, canEdit: roles.includes("efa") };
  }
  function assertOperation(
    existing: { actorUserId: string; action: string; requestHash: string } | null | undefined,
    user: string,
    action: string,
    requestHash: string,
  ): asserts existing is { actorUserId: string; action: string; requestHash: string } {
    if (
      !existing ||
      existing.actorUserId !== user ||
      existing.action !== action ||
      existing.requestHash !== requestHash
    )
      throw new Error("La identidad de operación ya se usó para otro cambio.");
  }
  async function baseAndLink(
    tx: DispatchTransaction,
    episode: Episode,
    fields: DispatchFields,
    currentBaseId?: string,
  ) {
    if (fields.baseId !== currentBaseId) {
      const base = await tx.findBase(fields.baseId);
      if (!base?.isActive) throw new Error("La base no está disponible para nuevos despachos.");
    }
    if (fields.communicationId) {
      const call = await tx.findCommunication(fields.communicationId);
      if (!call || call.episodeId !== episode.id || call.ownerUserId !== episode.ownerUserId)
        throw new Error("La llamada no pertenece al episodio.");
    }
  }
  return {
    async listForEpisode(userId: string, episodeId: string) {
      return store.transaction(async (tx) => {
        const access = await actor(tx, userId, false);
        const episode = await tx.findEpisode(episodeId);
        if (!episode || !visible(episode.ownerUserId, userId, access.roles))
          throw new Error("No se encontró el episodio.");
        const records = await tx.listDispatches(episodeId);
        return Promise.all(
          records.map(async (record) => ({
            ...view(record, access.canEdit),
            contactAttempts: await tx.listContactAttempts(record.id),
          })),
        );
      });
    },
    async get(userId: string, dispatchId: string) {
      return store.transaction(async (tx) => {
        const access = await actor(tx, userId, false);
        const record = await tx.findDispatch(dispatchId);
        if (!record || !visible(record.ownerUserId, userId, access.roles))
          throw new Error("No se encontró el despacho.");
        return {
          ...view(record, access.canEdit),
          contactAttempts: await tx.listContactAttempts(record.id),
          supportRequests: (await tx.listSupportRequests(record.episodeId))
            .filter((r) => r.sourceDispatchId === record.id)
            .map((r) => viewRequest(r, access.canEdit)),
        };
      });
    },
    async history(userId: string, dispatchId: string) {
      return store.transaction(async (tx) => {
        const access = await actor(tx, userId, false);
        const record = await tx.findDispatch(dispatchId);
        if (!record || !visible(record.ownerUserId, userId, access.roles))
          throw new Error("No se encontró el despacho.");
        return (await tx.listDispatchAudits(dispatchId)).map((a) => ({
          ...a,
          occurredAt: a.occurredAt.toISOString(),
        }));
      });
    },
    async listSupportRequests(userId: string, episodeId: string) {
      return store.transaction(async (tx) => {
        const access = await actor(tx, userId, false);
        const episode = await tx.findEpisode(episodeId);
        if (!episode || !visible(episode.ownerUserId, userId, access.roles))
          throw new Error("No se encontró el episodio.");
        return (await tx.listSupportRequests(episodeId)).map((r) => viewRequest(r, access.canEdit));
      });
    },
    async supportHistory(userId: string, supportRequestId: string) {
      return store.transaction(async (tx) => {
        const access = await actor(tx, userId, false);
        const request = await tx.findSupportRequest(supportRequestId);
        if (!request || !visible(request.ownerUserId, userId, access.roles))
          throw new Error("No se encontró la solicitud de apoyo.");
        return (await tx.listSupportAudits(supportRequestId)).map((audit) => ({
          ...audit,
          occurredAt: audit.occurredAt.toISOString(),
        }));
      });
    },
    async listNotices(userId: string) {
      return store.transaction(async (tx) => {
        await actor(tx, userId, false);
        const [dispatch, support] = await Promise.all([
          tx.listDispatchNotices(userId),
          tx.listSupportNotices(userId),
        ]);
        return [
          ...dispatch.map((n) => ({
            id: n.id,
            type: "dispatch" as const,
            dispatchId: n.dispatchId,
            createdAt: n.createdAt.toISOString(),
            readAt: n.readAt?.toISOString() ?? null,
          })),
          ...support.map((n) => ({
            id: n.id,
            type: "support_request" as const,
            supportRequestId: n.supportRequestId,
            createdAt: n.createdAt.toISOString(),
            readAt: n.readAt?.toISOString() ?? null,
          })),
        ];
      });
    },
    async markNoticeRead(userId: string, noticeId: string) {
      return store.transaction(async (tx) => {
        await actor(tx, userId, false);
        const dispatch = await tx.markDispatchNoticeRead(noticeId, userId);
        if (dispatch)
          return {
            id: dispatch.id,
            type: "dispatch" as const,
            dispatchId: dispatch.dispatchId,
            createdAt: dispatch.createdAt.toISOString(),
            readAt: dispatch.readAt?.toISOString() ?? null,
          };
        const support = await tx.markSupportNoticeRead(noticeId, userId);
        if (support)
          return {
            id: support.id,
            type: "support_request" as const,
            supportRequestId: support.supportRequestId,
            createdAt: support.createdAt.toISOString(),
            readAt: support.readAt?.toISOString() ?? null,
          };
        throw new Error("No se encontró el aviso.");
      });
    },
    async create(
      userId: string,
      input: { clientCreationKey: string; episodeId: string } & DispatchInputFields,
    ) {
      const fields = normalizeFields(input);
      const payloadHash = hash({
        action: "created",
        userId,
        input: {
          ...fields,
          episodeId: input.episodeId,
          clientCreationKey: input.clientCreationKey,
        },
      });
      return store.transaction(async (tx) => {
        const access = await actor(tx, userId, true);
        const episode = await tx.findEpisode(input.episodeId, true);
        if (!episode || !visible(episode.ownerUserId, userId, access.roles))
          throw new Error("No se encontró el episodio.");
        const prior = await tx.findDispatchByKey(episode.ownerUserId, input.clientCreationKey);
        if (prior) {
          const operation = await tx.findDispatchOperation(prior.id, input.clientCreationKey);
          assertOperation(operation, userId, "created", payloadHash);
          return mutation(prior, operation, true);
        }
        await baseAndLink(tx, episode, fields);
        if (fields.communicationId) {
          const call = await tx.findCommunication(fields.communicationId);
          fields.priority = call?.priority ?? null;
        }
        const dispatchId = newId();
        const record = {
          ...fields,
          id: dispatchId,
          episodeId: episode.id,
          ownerUserId: episode.ownerUserId,
          clientCreationKey: input.clientCreationKey,
          state: "draft" as const,
          version: 1,
          finalizedAt: null,
          createdAt: new Date(0),
          updatedAt: new Date(0),
        };
        const {
          createdAt: _createdAt,
          updatedAt: _updatedAt,
          version: _version,
          finalizedAt: _finalizedAt,
          ...insert
        } = record;
        await tx.insertDispatch(insert);
        const auditId = await tx.appendDispatchAudit({
          dispatchId,
          ownerUserId: episode.ownerUserId,
          actorUserId: userId,
          operationId: input.clientCreationKey,
          action: "created",
          versionBefore: null,
          versionAfter: 1,
          beforeState: null,
          afterState: dispatchState(record),
        });
        await tx.insertDispatchOperation({
          dispatchId,
          ownerUserId: episode.ownerUserId,
          actorUserId: userId,
          clientOperationId: input.clientCreationKey,
          action: "created",
          requestHash: payloadHash,
          appliedVersion: 1,
          changed: true,
        });
        const saved = await tx.findDispatch(dispatchId);
        if (!saved) throw new Error("No se pudo confirmar el despacho.");
        return mutation(
          saved,
          {
            id: "",
            dispatchId,
            ownerUserId: saved.ownerUserId,
            actorUserId: userId,
            clientOperationId: input.clientCreationKey,
            action: "created",
            requestHash: payloadHash,
            appliedVersion: 1,
            changed: true,
          },
          false,
          auditId,
        );
      });
    },
    async update(
      userId: string,
      input: {
        dispatchId: string;
        expectedVersion: number;
        operationId: string;
      } & DispatchInputFields,
    ) {
      const payloadHash = hash({ action: "updated", userId, ...input });
      return store.transaction(async (tx) => {
        const access = await actor(tx, userId, true);
        const current = await tx.findDispatch(input.dispatchId, true);
        if (!current || !visible(current.ownerUserId, userId, access.roles))
          throw new Error("No se encontró el despacho.");
        const existing = await tx.findDispatchOperation(current.id, input.operationId);
        if (existing) {
          assertOperation(existing, userId, "updated", payloadHash);
          return mutation(current, existing, true);
        }
        if (current.version !== input.expectedVersion)
          throw new Error("El despacho cambió; actualiza el historial.");
        const requested = normalizeFields({ ...current, ...input });
        const episode = await tx.findEpisode(current.episodeId, true);
        if (!episode) throw new Error("No se encontró el episodio.");
        await baseAndLink(tx, episode, requested, current.baseId);
        const next = { ...current, ...requested };
        if (current.state === "finalized" && (!next.priority || !next.result))
          throw new Error("Un despacho finalizado debe conservar prioridad y resultado.");
        const before = dispatchState(current);
        const after = dispatchState(next);
        const changed = JSON.stringify(before) !== JSON.stringify(after);
        const versionAfter = changed ? current.version + 1 : current.version;
        if (changed)
          await tx.updateDispatch(current.id, current.version, {
            ...requested,
            state: current.state,
            version: versionAfter,
            finalizedAt: current.finalizedAt,
          });
        const auditId = changed
          ? await tx.appendDispatchAudit({
              dispatchId: current.id,
              ownerUserId: current.ownerUserId,
              actorUserId: userId,
              operationId: input.operationId,
              action: "updated",
              versionBefore: current.version,
              versionAfter,
              beforeState: before,
              afterState: after,
            })
          : null;
        if (auditId && current.ownerUserId !== userId)
          await tx.appendDispatchNotice({
            dispatchId: current.id,
            ownerUserId: current.ownerUserId,
            auditId,
            recipientUserId: current.ownerUserId,
          });
        await tx.insertDispatchOperation({
          dispatchId: current.id,
          ownerUserId: current.ownerUserId,
          actorUserId: userId,
          clientOperationId: input.operationId,
          action: "updated",
          requestHash: payloadHash,
          appliedVersion: versionAfter,
          changed,
        });
        const saved = await tx.findDispatch(current.id);
        if (!saved) throw new Error("No se pudo leer el despacho actualizado.");
        return mutation(
          saved,
          {
            id: "",
            dispatchId: current.id,
            ownerUserId: current.ownerUserId,
            actorUserId: userId,
            clientOperationId: input.operationId,
            action: "updated",
            requestHash: payloadHash,
            appliedVersion: versionAfter,
            changed,
          },
          false,
          auditId ?? undefined,
        );
      });
    },
    async finalize(
      userId: string,
      input: {
        dispatchId: string;
        expectedVersion: number;
        operationId: string;
        priority: DispatchPriority;
        result: DispatchResult;
        resultClarification?: string | null | undefined;
      },
    ) {
      if (!priorities.includes(input.priority) || !results.includes(input.result))
        throw new Error("La prioridad y el resultado son obligatorios para finalizar.");
      const payloadHash = hash({ action: "finalized", userId, ...input });
      return store.transaction(async (tx) => {
        const access = await actor(tx, userId, true);
        const current = await tx.findDispatch(input.dispatchId, true);
        if (!current || !visible(current.ownerUserId, userId, access.roles))
          throw new Error("No se encontró el despacho.");
        const existing = await tx.findDispatchOperation(current.id, input.operationId);
        if (existing) {
          assertOperation(existing, userId, "finalized", payloadHash);
          return mutation(current, existing, true);
        }
        if (current.version !== input.expectedVersion)
          throw new Error("El despacho cambió; actualiza el historial.");
        if (current.state === "finalized") throw new Error("El despacho ya está finalizado.");
        const finalizedAt = await tx.currentTimestamp();
        const next = {
          ...current,
          priority: input.priority,
          result: input.result,
          resultClarification: input.resultClarification ?? null,
          state: "finalized" as const,
          version: current.version + 1,
          finalizedAt,
        };
        await tx.updateDispatch(current.id, current.version, {
          priority: next.priority,
          result: next.result,
          resultClarification: next.resultClarification,
          state: next.state,
          version: next.version,
          finalizedAt,
        });
        const auditId = await tx.appendDispatchAudit({
          dispatchId: current.id,
          ownerUserId: current.ownerUserId,
          actorUserId: userId,
          operationId: input.operationId,
          action: "finalized",
          versionBefore: current.version,
          versionAfter: next.version,
          beforeState: dispatchState(current),
          afterState: dispatchState(next),
        });
        if (current.ownerUserId !== userId)
          await tx.appendDispatchNotice({
            dispatchId: current.id,
            ownerUserId: current.ownerUserId,
            auditId,
            recipientUserId: current.ownerUserId,
          });
        await tx.insertDispatchOperation({
          dispatchId: current.id,
          ownerUserId: current.ownerUserId,
          actorUserId: userId,
          clientOperationId: input.operationId,
          action: "finalized",
          requestHash: payloadHash,
          appliedVersion: next.version,
          changed: true,
        });
        const saved = await tx.findDispatch(current.id);
        if (!saved) throw new Error("No se pudo confirmar el despacho finalizado.");
        return mutation(
          saved,
          {
            id: "",
            dispatchId: current.id,
            ownerUserId: current.ownerUserId,
            actorUserId: userId,
            clientOperationId: input.operationId,
            action: "finalized",
            requestHash: payloadHash,
            appliedVersion: next.version,
            changed: true,
          },
          false,
          auditId,
        );
      });
    },
    async addContactAttempt(
      userId: string,
      input: {
        dispatchId: string;
        clientEventId: string;
        occurredAt: string;
        note?: string | null | undefined;
      },
    ) {
      return store.transaction(async (tx) => {
        const access = await actor(tx, userId, true);
        const dispatch = await tx.findDispatch(input.dispatchId, true);
        if (!dispatch || !visible(dispatch.ownerUserId, userId, access.roles))
          throw new Error("No se encontró el despacho.");
        const eventAt = parseDate(input.occurredAt, "intento de contacto")!;
        const prior = await tx.findContactAttempt(dispatch.id, input.clientEventId);
        if (prior) {
          if (
            prior.actorUserId !== userId ||
            prior.occurredAt.getTime() !== eventAt.getTime() ||
            prior.note !== (input.note ?? null)
          )
            throw new Error("La identidad del evento ya se usó para otro contenido.");
          return contactView(prior);
        }
        const attempt = {
          id: newId(),
          dispatchId: dispatch.id,
          ownerUserId: dispatch.ownerUserId,
          actorUserId: userId,
          clientEventId: input.clientEventId,
          occurredAt: eventAt,
          note: input.note ?? null,
        };
        await tx.insertContactAttempt(attempt);
        const saved = await tx.findContactAttempt(dispatch.id, input.clientEventId);
        if (!saved) throw new Error("No se pudo confirmar el intento.");
        return contactView(saved);
      });
    },
    async createSupportRequest(
      userId: string,
      input: {
        clientCreationKey: string;
        sourceDispatchId: string;
        requestedAt: string;
        reason: string;
        responseDispatchId?: string | null | undefined;
      },
    ) {
      const requestedAt = parseDate(input.requestedAt, "solicitud de apoyo")!;
      const reason = input.reason.trim();
      const responseDispatchId = input.responseDispatchId ?? null;
      const requestHash = hash({
        action: "created",
        userId,
        ...input,
        requestedAt: requestedAt.toISOString(),
        reason,
        responseDispatchId,
      });
      return store.transaction(async (tx) => {
        const access = await actor(tx, userId, true);
        const source = await tx.findDispatch(input.sourceDispatchId, true);
        if (!source || !visible(source.ownerUserId, userId, access.roles))
          throw new Error("No se encontró el despacho solicitante.");
        const prior = await tx.findSupportByKey(source.ownerUserId, input.clientCreationKey);
        if (prior) {
          const op = await tx.findSupportOperation(prior.id, input.clientCreationKey);
          assertOperation(op, userId, "created", requestHash);
          return supportMutation(prior, op!, true);
        }
        if (responseDispatchId) {
          const response = await tx.findDispatch(responseDispatchId);
          if (
            !response ||
            response.episodeId !== source.episodeId ||
            response.ownerUserId !== source.ownerUserId
          )
            throw new Error("El refuerzo debe pertenecer al mismo episodio.");
        }
        const record = {
          id: newId(),
          ownerUserId: source.ownerUserId,
          episodeId: source.episodeId,
          sourceDispatchId: source.id,
          responseDispatchId,
          clientCreationKey: input.clientCreationKey,
          requestedAt,
          reason,
          version: 1,
          createdAt: new Date(0),
          updatedAt: new Date(0),
        };
        const {
          createdAt: _createdAt,
          updatedAt: _updatedAt,
          version: _version,
          ...insert
        } = record;
        await tx.insertSupportRequest(insert);
        const auditId = await tx.appendSupportAudit({
          supportRequestId: record.id,
          ownerUserId: record.ownerUserId,
          actorUserId: userId,
          operationId: input.clientCreationKey,
          action: "created",
          versionBefore: null,
          versionAfter: 1,
          beforeState: null,
          afterState: supportState(record),
        });
        await tx.insertSupportOperation({
          supportRequestId: record.id,
          ownerUserId: record.ownerUserId,
          actorUserId: userId,
          clientOperationId: input.clientCreationKey,
          action: "created",
          requestHash,
          appliedVersion: 1,
          changed: true,
        });
        const saved = await tx.findSupportRequest(record.id);
        if (!saved) throw new Error("No se pudo confirmar la solicitud de apoyo.");
        return supportMutation(
          saved,
          {
            id: "",
            supportRequestId: saved.id,
            ownerUserId: saved.ownerUserId,
            actorUserId: userId,
            clientOperationId: input.clientCreationKey,
            action: "created",
            requestHash,
            appliedVersion: 1,
            changed: true,
          },
          false,
          auditId,
        );
      });
    },
    async updateSupportRequest(
      userId: string,
      input: {
        supportRequestId: string;
        expectedVersion: number;
        operationId: string;
        requestedAt: string;
        reason: string;
        responseDispatchId: string | null;
      },
    ) {
      const requestedAt = parseDate(input.requestedAt, "solicitud de apoyo")!;
      const reason = input.reason.trim();
      const requestHash = hash({
        action: "updated",
        userId,
        ...input,
        requestedAt: requestedAt.toISOString(),
        reason,
      });
      return store.transaction(async (tx) => {
        const access = await actor(tx, userId, true);
        const current = await tx.findSupportRequest(input.supportRequestId, true);
        if (!current || !visible(current.ownerUserId, userId, access.roles))
          throw new Error("No se encontró la solicitud de apoyo.");
        const prior = await tx.findSupportOperation(current.id, input.operationId);
        if (prior) {
          assertOperation(prior, userId, "updated", requestHash);
          return supportMutation(current, prior!, true);
        }
        if (current.version !== input.expectedVersion)
          throw new Error("La solicitud de apoyo cambió; actualiza el historial.");
        if (input.responseDispatchId) {
          const response = await tx.findDispatch(input.responseDispatchId);
          if (
            !response ||
            response.episodeId !== current.episodeId ||
            response.ownerUserId !== current.ownerUserId
          )
            throw new Error("El refuerzo debe pertenecer al mismo episodio.");
        }
        const next = {
          ...current,
          requestedAt,
          reason,
          responseDispatchId: input.responseDispatchId,
        };
        const changed =
          JSON.stringify(supportState(current)) !== JSON.stringify(supportState(next));
        const versionAfter = current.version + Number(changed);
        if (changed)
          await tx.updateSupportRequest(current.id, current.version, {
            requestedAt,
            reason,
            responseDispatchId: input.responseDispatchId,
            version: versionAfter,
          });
        const auditId = changed
          ? await tx.appendSupportAudit({
              supportRequestId: current.id,
              ownerUserId: current.ownerUserId,
              actorUserId: userId,
              operationId: input.operationId,
              action: "updated",
              versionBefore: current.version,
              versionAfter,
              beforeState: supportState(current),
              afterState: supportState(next),
            })
          : null;
        if (auditId && current.ownerUserId !== userId)
          await tx.appendSupportNotice({
            supportRequestId: current.id,
            ownerUserId: current.ownerUserId,
            auditId,
            recipientUserId: current.ownerUserId,
          });
        await tx.insertSupportOperation({
          supportRequestId: current.id,
          ownerUserId: current.ownerUserId,
          actorUserId: userId,
          clientOperationId: input.operationId,
          action: "updated",
          requestHash,
          appliedVersion: versionAfter,
          changed,
        });
        const saved = await tx.findSupportRequest(current.id);
        if (!saved) throw new Error("No se pudo leer la solicitud actualizada.");
        return supportMutation(
          saved,
          {
            id: "",
            supportRequestId: current.id,
            ownerUserId: current.ownerUserId,
            actorUserId: userId,
            clientOperationId: input.operationId,
            action: "updated",
            requestHash,
            appliedVersion: versionAfter,
            changed,
          },
          false,
          auditId ?? undefined,
        );
      });
    },
  };
}

function normalizeFields(input: object): DispatchFields {
  const source = input as Record<string, unknown>;
  const fields: Record<string, unknown> = { ...source };
  for (let i = 0; i <= 6; i++) {
    const key = `t${i}`;
    const status = (fields[`${key}Status`] ?? "not_observed") as ObservationStatus;
    const date = parseDate(fields[`${key}At`] as string | Date | null | undefined, key);
    if (
      !["observed", "not_observed", "not_informed", "not_applicable"].includes(status) ||
      (status === "observed") !== Boolean(date)
    )
      throw new Error(`La observación ${key} no coincide con su estado.`);
    fields[`${key}At`] = date;
    fields[`${key}Status`] = status;
  }
  fields["baseId"] = source["baseId"];
  fields["communicationId"] = source["communicationId"] ?? null;
  fields["priority"] = source["priority"] ?? null;
  fields["firstResponseRole"] =
    typeof source["firstResponseRole"] === "string"
      ? source["firstResponseRole"].trim() || null
      : null;
  fields["firstResponseAt"] = parseDate(
    source["firstResponseAt"] as string | Date | null | undefined,
    "primera respuesta",
  );
  fields["note"] = typeof source["note"] === "string" ? source["note"].trim() || null : null;
  fields["result"] = source["result"] ?? null;
  fields["resultClarification"] =
    typeof source["resultClarification"] === "string"
      ? source["resultClarification"].trim() || null
      : null;
  if (!fields["baseId"]) throw new Error("Debe seleccionarse una base.");
  return fields as unknown as DispatchFields;
}
function mutation(
  record: DispatchRecord,
  op: DispatchOperation,
  replayed: boolean,
  auditId?: string,
) {
  return {
    dispatch: view(record, true),
    operation: {
      id: op.clientOperationId,
      action: op.action,
      appliedVersion: op.appliedVersion,
      changed: op.changed,
      replayed,
    },
    ...(auditId ? { auditId } : {}),
  };
}
function supportState(
  record: Pick<
    SupportRequestRecord,
    "sourceDispatchId" | "responseDispatchId" | "requestedAt" | "reason"
  >,
) {
  return {
    sourceDispatchId: record.sourceDispatchId,
    responseDispatchId: record.responseDispatchId,
    requestedAt: record.requestedAt.toISOString(),
    reason: record.reason,
  };
}
function supportMutation(
  record: SupportRequestRecord,
  op: SupportOperation,
  replayed: boolean,
  auditId?: string,
) {
  return {
    supportRequest: viewRequest(record, true),
    operation: {
      id: op.clientOperationId,
      action: op.action,
      appliedVersion: op.appliedVersion,
      changed: op.changed,
      replayed,
    },
    ...(auditId ? { auditId } : {}),
  };
}
function contactView(record: {
  id: string;
  dispatchId: string;
  clientEventId: string;
  occurredAt: Date;
  note: string | null;
  createdAt: Date;
}) {
  return {
    id: record.id,
    dispatchId: record.dispatchId,
    clientEventId: record.clientEventId,
    occurredAt: record.occurredAt.toISOString(),
    note: record.note,
    createdAt: record.createdAt.toISOString(),
  };
}

const drizzleStore: DispatchStore = {
  async transaction(work) {
    return getDatabase().transaction(async (db) => {
      const tx: DispatchTransaction = {
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
        async findEpisode(episodeId, lock = false) {
          let query = db
            .select({ id: efaEpisode.id, ownerUserId: efaEpisode.ownerUserId })
            .from(efaEpisode)
            .where(eq(efaEpisode.id, episodeId))
            .limit(1);
          if (lock) query = query.for("update") as typeof query;
          return (await query)[0] ?? null;
        },
        async findBase(baseId) {
          return (
            (
              await db
                .select({ id: efaBase.id, isActive: efaBase.isActive })
                .from(efaBase)
                .where(eq(efaBase.id, baseId))
                .limit(1)
            )[0] ?? null
          );
        },
        async findCommunication(communicationId) {
          return (
            ((
              await db
                .select({
                  id: efaCommunication.id,
                  episodeId: efaCommunication.episodeId,
                  ownerUserId: efaCommunication.ownerUserId,
                  priority: efaCommunication.priority,
                })
                .from(efaCommunication)
                .where(eq(efaCommunication.id, communicationId))
                .limit(1)
            )[0] as Communication | undefined) ?? null
          );
        },
        async listDispatches(episodeId) {
          return (await db
            .select()
            .from(efaDispatch)
            .where(eq(efaDispatch.episodeId, episodeId))
            .orderBy(desc(efaDispatch.createdAt))) as DispatchRecord[];
        },
        async findDispatch(dispatchId, lock = false) {
          let query = db.select().from(efaDispatch).where(eq(efaDispatch.id, dispatchId)).limit(1);
          if (lock) query = query.for("update") as typeof query;
          return ((await query)[0] as DispatchRecord | undefined) ?? null;
        },
        async findDispatchByKey(owner, key) {
          return (
            ((
              await db
                .select()
                .from(efaDispatch)
                .where(
                  and(eq(efaDispatch.ownerUserId, owner), eq(efaDispatch.clientCreationKey, key)),
                )
                .limit(1)
            )[0] as DispatchRecord | undefined) ?? null
          );
        },
        async findDispatchOperation(dispatchId, operationId) {
          return (
            ((
              await db
                .select()
                .from(efaDispatchOperation)
                .where(
                  and(
                    eq(efaDispatchOperation.dispatchId, dispatchId),
                    eq(efaDispatchOperation.clientOperationId, operationId),
                  ),
                )
                .limit(1)
            )[0] as DispatchOperation | undefined) ?? null
          );
        },
        async insertDispatch(input) {
          await db.insert(efaDispatch).values(input as typeof efaDispatch.$inferInsert);
        },
        async updateDispatch(dispatchId, expectedVersion, fields) {
          const updated = await db
            .update(efaDispatch)
            .set({ ...fields, updatedAt: sql`now()` })
            .where(and(eq(efaDispatch.id, dispatchId), eq(efaDispatch.version, expectedVersion)))
            .returning({ id: efaDispatch.id });
          if (!updated.length) throw new Error("El despacho cambió; actualiza el historial.");
        },
        async appendDispatchAudit(input) {
          const rows = await db
            .insert(efaDispatchAudit)
            .values(input)
            .returning({ id: efaDispatchAudit.id });
          if (!rows[0]) throw new Error("No se pudo confirmar el historial del despacho.");
          return rows[0].id;
        },
        async insertDispatchOperation(input) {
          await db.insert(efaDispatchOperation).values(input);
        },
        async listDispatchAudits(dispatchId) {
          return (await db
            .select()
            .from(efaDispatchAudit)
            .where(eq(efaDispatchAudit.dispatchId, dispatchId))
            .orderBy(asc(efaDispatchAudit.versionAfter))) as DispatchAudit[];
        },
        async listDispatchNotices(userId) {
          return db
            .select({
              id: efaDispatchNotice.id,
              dispatchId: efaDispatchNotice.dispatchId,
              createdAt: efaDispatchNotice.createdAt,
              readAt: efaDispatchNotice.readAt,
            })
            .from(efaDispatchNotice)
            .where(eq(efaDispatchNotice.recipientUserId, userId))
            .orderBy(desc(efaDispatchNotice.createdAt));
        },
        async appendDispatchNotice(input) {
          await db.insert(efaDispatchNotice).values(input);
        },
        async markDispatchNoticeRead(noticeId, recipient) {
          return markRead(efaDispatchNotice, noticeId, recipient);
        },
        async findContactAttempt(dispatchId, eventId) {
          return (
            ((
              await db
                .select()
                .from(efaDispatchContactAttempt)
                .where(
                  and(
                    eq(efaDispatchContactAttempt.dispatchId, dispatchId),
                    eq(efaDispatchContactAttempt.clientEventId, eventId),
                  ),
                )
                .limit(1)
            )[0] as Awaited<ReturnType<DispatchTransaction["findContactAttempt"]>>) ?? null
          );
        },
        async insertContactAttempt(input) {
          await db.insert(efaDispatchContactAttempt).values(input);
        },
        async listContactAttempts(dispatchId) {
          return (await db
            .select()
            .from(efaDispatchContactAttempt)
            .where(eq(efaDispatchContactAttempt.dispatchId, dispatchId))
            .orderBy(asc(efaDispatchContactAttempt.occurredAt))) as Awaited<
            ReturnType<DispatchTransaction["listContactAttempts"]>
          >;
        },
        async listSupportRequests(episodeId) {
          return (await db
            .select()
            .from(efaSupportRequest)
            .where(eq(efaSupportRequest.episodeId, episodeId))
            .orderBy(desc(efaSupportRequest.createdAt))) as SupportRequestRecord[];
        },
        async findSupportRequest(requestId, lock = false) {
          let query = db
            .select()
            .from(efaSupportRequest)
            .where(eq(efaSupportRequest.id, requestId))
            .limit(1);
          if (lock) query = query.for("update") as typeof query;
          return ((await query)[0] as SupportRequestRecord | undefined) ?? null;
        },
        async findSupportByKey(owner, key) {
          return (
            ((
              await db
                .select()
                .from(efaSupportRequest)
                .where(
                  and(
                    eq(efaSupportRequest.ownerUserId, owner),
                    eq(efaSupportRequest.clientCreationKey, key),
                  ),
                )
                .limit(1)
            )[0] as SupportRequestRecord | undefined) ?? null
          );
        },
        async findSupportOperation(requestId, operationId) {
          return (
            ((
              await db
                .select()
                .from(efaSupportRequestOperation)
                .where(
                  and(
                    eq(efaSupportRequestOperation.supportRequestId, requestId),
                    eq(efaSupportRequestOperation.clientOperationId, operationId),
                  ),
                )
                .limit(1)
            )[0] as SupportOperation | undefined) ?? null
          );
        },
        async insertSupportRequest(input) {
          await db.insert(efaSupportRequest).values(input as typeof efaSupportRequest.$inferInsert);
        },
        async updateSupportRequest(requestId, expectedVersion, fields) {
          const rows = await db
            .update(efaSupportRequest)
            .set({ ...fields, updatedAt: sql`now()` })
            .where(
              and(
                eq(efaSupportRequest.id, requestId),
                eq(efaSupportRequest.version, expectedVersion),
              ),
            )
            .returning({ id: efaSupportRequest.id });
          if (!rows.length)
            throw new Error("La solicitud de apoyo cambió; actualiza el historial.");
        },
        async appendSupportAudit(input) {
          const rows = await db
            .insert(efaSupportRequestAudit)
            .values(input)
            .returning({ id: efaSupportRequestAudit.id });
          if (!rows[0]) throw new Error("No se pudo confirmar el historial de apoyo.");
          return rows[0].id;
        },
        async insertSupportOperation(input) {
          await db.insert(efaSupportRequestOperation).values(input);
        },
        async listSupportAudits(requestId) {
          return (await db
            .select()
            .from(efaSupportRequestAudit)
            .where(eq(efaSupportRequestAudit.supportRequestId, requestId))
            .orderBy(asc(efaSupportRequestAudit.versionAfter))) as Awaited<
            ReturnType<DispatchTransaction["listSupportAudits"]>
          >;
        },
        async appendSupportNotice(input) {
          await db.insert(efaSupportRequestNotice).values(input);
        },
        async listSupportNotices(userId) {
          return db
            .select({
              id: efaSupportRequestNotice.id,
              supportRequestId: efaSupportRequestNotice.supportRequestId,
              createdAt: efaSupportRequestNotice.createdAt,
              readAt: efaSupportRequestNotice.readAt,
            })
            .from(efaSupportRequestNotice)
            .where(eq(efaSupportRequestNotice.recipientUserId, userId))
            .orderBy(desc(efaSupportRequestNotice.createdAt));
        },
        async markSupportNoticeRead(noticeId, recipient) {
          return markRead(efaSupportRequestNotice, noticeId, recipient);
        },
        async currentTimestamp() {
          const result = await db.execute<{ now: Date | string }>(sql`select now() as now`);
          const value = result.rows[0]?.now;
          const parsed = value instanceof Date ? value : new Date(value ?? Number.NaN);
          if (!Number.isFinite(parsed.getTime()))
            throw new Error("No se pudo obtener la hora del servidor.");
          return parsed;
        },
      };
      async function markRead(
        table: typeof efaDispatchNotice | typeof efaSupportRequestNotice,
        noticeId: string,
        recipient: string,
      ) {
        const updated = await db
          .update(table)
          .set({ readAt: sql`coalesce(${table.readAt}, now())` })
          .where(
            and(eq(table.id, noticeId), eq(table.recipientUserId, recipient), isNull(table.readAt)),
          )
          .returning();
        if (updated[0]) return updated[0] as never;
        return (
          ((
            await db
              .select()
              .from(table)
              .where(and(eq(table.id, noticeId), eq(table.recipientUserId, recipient)))
              .limit(1)
          )[0] as never) ?? null
        );
      }
      return work(tx);
    });
  },
};

export const efaDispatches = createEfaDispatchesService(drizzleStore);
