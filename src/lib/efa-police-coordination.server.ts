import { createHash } from "node:crypto";
import { and, asc, desc, eq, isNull, sql } from "drizzle-orm";
import { getDatabase } from "../db/index.server";
import {
  accountAccess,
  accountRoleGrant,
  efaEpisode,
  efaDispatch,
  efaPoliceCoordination,
  efaPoliceCoordinationAudit,
  efaPoliceCoordinationDispatch,
  efaPoliceCoordinationEvent,
  efaPoliceCoordinationNotice,
  efaPoliceCoordinationOperation,
} from "../db/schema";
import { effectiveRoles, type AccountRole } from "./access";

export type PoliceEventKind =
  "request" | "response" | "reiteration" | "arrival_meeting_point" | "waiting" | "actual_meeting";
export type PoliceTimeStatus = "observed" | "not_observed" | "not_informed" | "not_applicable";
export type PoliceInitiator = "central" | "ambulance";
export type PolicePlace = "incident" | "meeting_point";

export type PoliceCoordinationRecord = {
  id: string;
  episodeId: string;
  ownerUserId: string;
  clientCreationKey: string;
  initiator: PoliceInitiator;
  initiatingDispatchId: string | null;
  placeType: PolicePlace;
  meetingReference: string | null;
  notes: string | null;
  state: "draft" | "finalized";
  version: number;
  createdAt: Date;
  updatedAt: Date;
};
export type PoliceEventRecord = {
  id: string;
  coordinationId: string;
  episodeId: string;
  ownerUserId: string;
  dispatchId: string | null;
  actorUserId: string;
  clientEventId: string;
  kind: PoliceEventKind;
  occurredAt: Date | null;
  timeStatus: PoliceTimeStatus;
  note: string | null;
  version: number;
  createdAt: Date;
  updatedAt: Date;
};
type JsonValue = string | number | boolean | null | JsonValue[] | { [key: string]: JsonValue };
export type PoliceAuditRecord = {
  id: string;
  coordinationId: string;
  ownerUserId: string;
  actorUserId: string;
  operationId: string;
  action: string;
  versionBefore: number | null;
  versionAfter: number;
  beforeState: { [key: string]: JsonValue } | null;
  afterState: { [key: string]: JsonValue };
  occurredAt: Date;
};
export type PoliceOperationRecord = {
  id: string;
  coordinationId: string;
  ownerUserId: string;
  actorUserId: string;
  clientOperationId: string;
  action: string;
  requestHash: string;
  appliedVersion: number;
  changed: boolean;
};
type RolesActor = { isActive: boolean; roles: AccountRole[] };
type PoliceEpisode = { id: string; ownerUserId: string };
type PoliceDispatch = { id: string; episodeId: string; ownerUserId: string };

export interface PoliceCoordinationTransaction {
  findActor(id: string): Promise<RolesActor | null>;
  findEpisode(id: string, lock?: boolean): Promise<PoliceEpisode | null>;
  findDispatch(id: string, lock?: boolean): Promise<PoliceDispatch | null>;
  listForEpisode(id: string): Promise<PoliceCoordinationRecord[]>;
  findCoordination(id: string, lock?: boolean): Promise<PoliceCoordinationRecord | null>;
  findByCreationKey(owner: string, key: string): Promise<PoliceCoordinationRecord | null>;
  findOperation(coordinationId: string, operationId: string): Promise<PoliceOperationRecord | null>;
  findEvent(
    coordinationId: string,
    eventId: string,
    lock?: boolean,
  ): Promise<PoliceEventRecord | null>;
  findEventByClientId(
    coordinationId: string,
    clientEventId: string,
  ): Promise<PoliceEventRecord | null>;
  listEvents(coordinationId: string): Promise<PoliceEventRecord[]>;
  listDispatchIds(coordinationId: string): Promise<string[]>;
  insertCoordination(
    record: Omit<PoliceCoordinationRecord, "createdAt" | "updatedAt">,
  ): Promise<void>;
  updateCoordination(
    id: string,
    expectedVersion: number,
    fields: Partial<PoliceCoordinationRecord>,
  ): Promise<void>;
  associateDispatch(record: {
    coordinationId: string;
    episodeId: string;
    ownerUserId: string;
    dispatchId: string;
  }): Promise<void>;
  removeDispatch(coordinationId: string, dispatchId: string): Promise<void>;
  insertEvent(record: Omit<PoliceEventRecord, "createdAt" | "updatedAt">): Promise<void>;
  updateEvent(id: string, version: number, fields: Partial<PoliceEventRecord>): Promise<void>;
  appendAudit(record: Omit<PoliceAuditRecord, "id" | "occurredAt">): Promise<string>;
  listAudits(id: string): Promise<PoliceAuditRecord[]>;
  insertOperation(record: Omit<PoliceOperationRecord, "id">): Promise<void>;
  listNotices(
    userId: string,
  ): Promise<Array<{ id: string; coordinationId: string; createdAt: Date; readAt: Date | null }>>;
  appendNotice(input: {
    coordinationId: string;
    ownerUserId: string;
    auditId: string;
    recipientUserId: string;
  }): Promise<void>;
  markNoticeRead(
    id: string,
    recipient: string,
  ): Promise<{ id: string; coordinationId: string; createdAt: Date; readAt: Date | null } | null>;
  currentTimestamp(): Promise<Date>;
}
export interface PoliceCoordinationStore {
  transaction<T>(work: (tx: PoliceCoordinationTransaction) => Promise<T>): Promise<T>;
}

const uuid = () => crypto.randomUUID();
const hash = (input: unknown) =>
  createHash("sha256")
    .update(JSON.stringify(canonical(input)))
    .digest("hex");
function canonical(input: unknown): unknown {
  if (input instanceof Date) return input.toISOString();
  if (Array.isArray(input)) return input.map(canonical);
  if (input && typeof input === "object")
    return Object.fromEntries(
      Object.entries(input)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([key, value]) => [key, canonical(value)]),
    );
  return input;
}
function parseDate(input: string | Date | null | undefined) {
  if (input == null) return null;
  const value = input instanceof Date ? new Date(input) : new Date(input);
  if (!Number.isFinite(value.getTime())) throw new Error("La hora observada no es válida.");
  return value;
}
const visible = (owner: string, user: string, roles: AccountRole[]) =>
  owner === user || roles.includes("admin");
const eventKinds: PoliceEventKind[] = [
  "request",
  "response",
  "reiteration",
  "arrival_meeting_point",
  "waiting",
  "actual_meeting",
];
export function omitDatabaseTimestamps<T extends object>(
  record: T,
): Omit<T, "createdAt" | "updatedAt"> {
  const persisted = { ...record } as T & { createdAt?: unknown; updatedAt?: unknown };
  delete persisted.createdAt;
  delete persisted.updatedAt;
  return persisted as Omit<T, "createdAt" | "updatedAt">;
}
const sharedKinds = new Set<PoliceEventKind>(["request", "response", "reiteration"]);
const timeStatuses: PoliceTimeStatus[] = [
  "observed",
  "not_observed",
  "not_informed",
  "not_applicable",
];
const clean = (value: unknown, limit: number, name: string): string | null => {
  if (value == null) return null;
  if (typeof value !== "string") throw new Error(`${name} no es válido.`);
  const result = value.trim();
  if (result.length > limit) throw new Error(`${name} supera el límite permitido.`);
  return result || null;
};
const scopeState = (record: PoliceCoordinationRecord, dispatchIds: string[]) => ({
  initiator: record.initiator,
  initiatingDispatchId: record.initiatingDispatchId,
  placeType: record.placeType,
  meetingReference: record.meetingReference,
  notes: record.notes,
  state: record.state,
  dispatchIds: [...dispatchIds].sort(),
});
const coordinationView = (
  record: PoliceCoordinationRecord,
  dispatchIds: string[],
  canEdit: boolean,
) => ({
  ...record,
  createdAt: record.createdAt.toISOString(),
  updatedAt: record.updatedAt.toISOString(),
  dispatchIds,
  canEdit,
});
const eventView = (record: PoliceEventRecord) => ({
  ...record,
  occurredAt: record.occurredAt?.toISOString() ?? null,
  createdAt: record.createdAt.toISOString(),
  updatedAt: record.updatedAt.toISOString(),
});

export function createEfaPoliceCoordinationService(
  store: PoliceCoordinationStore,
  deps: { newId?: () => string } = {},
) {
  const newId = deps.newId ?? uuid;
  async function actor(tx: PoliceCoordinationTransaction, userId: string, write: boolean) {
    const current = await tx.findActor(userId);
    if (!current?.isActive) throw new Error("La cuenta está inactiva.");
    const roles = effectiveRoles(current.roles);
    if (write && !roles.includes("efa")) throw new Error("Se requiere acceso EFA vigente.");
    return { roles, canEdit: roles.includes("efa") };
  }
  async function readable(tx: PoliceCoordinationTransaction, userId: string, id: string) {
    const access = await actor(tx, userId, false);
    const record = await tx.findCoordination(id);
    if (!record || !visible(record.ownerUserId, userId, access.roles))
      throw new Error("No se encontró la coordinación.");
    return { access, record };
  }
  function assertReplay(
    prior: PoliceOperationRecord | null,
    userId: string,
    action: string,
    requestHash: string,
  ) {
    if (
      !prior ||
      prior.actorUserId !== userId ||
      prior.action !== action ||
      prior.requestHash !== requestHash
    )
      throw new Error("La identidad de operación ya se usó para otro cambio.");
  }
  async function verifyDispatches(
    tx: PoliceCoordinationTransaction,
    episode: PoliceEpisode,
    ids: string[],
  ) {
    for (const dispatchId of ids) {
      const dispatch = await tx.findDispatch(dispatchId);
      if (
        !dispatch ||
        dispatch.episodeId !== episode.id ||
        dispatch.ownerUserId !== episode.ownerUserId
      )
        throw new Error("El despacho no pertenece al episodio.");
    }
  }
  async function receipt(
    tx: PoliceCoordinationTransaction,
    input: {
      coordinationId: string;
      ownerUserId: string;
      actorUserId: string;
      operationId: string;
      action: string;
      requestHash: string;
      appliedVersion: number;
      changed: boolean;
    },
  ) {
    await tx.insertOperation({
      coordinationId: input.coordinationId,
      ownerUserId: input.ownerUserId,
      actorUserId: input.actorUserId,
      clientOperationId: input.operationId,
      action: input.action,
      requestHash: input.requestHash,
      appliedVersion: input.appliedVersion,
      changed: input.changed,
    });
  }
  async function recordAudit(
    tx: PoliceCoordinationTransaction,
    record: PoliceCoordinationRecord,
    actorUserId: string,
    operationId: string,
    action: string,
    beforeState: { [key: string]: JsonValue } | null,
    afterState: { [key: string]: JsonValue },
    versionBefore: number | null,
    versionAfter: number,
  ) {
    return tx.appendAudit({
      coordinationId: record.id,
      ownerUserId: record.ownerUserId,
      actorUserId,
      operationId,
      action,
      versionBefore,
      versionAfter,
      beforeState,
      afterState,
    });
  }
  async function updateAggregate(
    tx: PoliceCoordinationTransaction,
    current: PoliceCoordinationRecord,
    next: PoliceCoordinationRecord,
    userId: string,
    operationId: string,
    action: string,
    requestHash: string,
    before: { [key: string]: JsonValue },
    after: { [key: string]: JsonValue },
    afterCas?: () => Promise<void>,
  ) {
    const changed = JSON.stringify(before) !== JSON.stringify(after);
    const version = changed ? current.version + 1 : current.version;
    if (changed) {
      await tx.updateCoordination(current.id, current.version, { ...next, version });
      await afterCas?.();
    }
    const auditId = changed
      ? await recordAudit(
          tx,
          current,
          userId,
          operationId,
          action,
          before,
          after,
          current.version,
          version,
        )
      : null;
    if (auditId && current.ownerUserId !== userId)
      await tx.appendNotice({
        coordinationId: current.id,
        ownerUserId: current.ownerUserId,
        auditId,
        recipientUserId: current.ownerUserId,
      });
    await receipt(tx, {
      coordinationId: current.id,
      ownerUserId: current.ownerUserId,
      actorUserId: userId,
      operationId,
      action,
      requestHash,
      appliedVersion: version,
      changed,
    });
    const saved = await tx.findCoordination(current.id);
    if (!saved) throw new Error("No se pudo confirmar la coordinación.");
    return {
      coordination: coordinationView(saved, await tx.listDispatchIds(saved.id), true),
      operation: { id: operationId, action, appliedVersion: version, changed, replayed: false },
      ...(auditId ? { auditId } : {}),
    };
  }
  return {
    async listForEpisode(userId: string, episodeId: string) {
      return store.transaction(async (tx) => {
        const access = await actor(tx, userId, false);
        const episode = await tx.findEpisode(episodeId);
        if (!episode || !visible(episode.ownerUserId, userId, access.roles))
          throw new Error("No se encontró el episodio.");
        return Promise.all(
          (await tx.listForEpisode(episodeId)).map(async (row) => ({
            ...coordinationView(row, await tx.listDispatchIds(row.id), access.canEdit),
            events: (await tx.listEvents(row.id)).map(eventView),
          })),
        );
      });
    },
    async get(userId: string, coordinationId: string) {
      return store.transaction(async (tx) => {
        const { access, record } = await readable(tx, userId, coordinationId);
        return {
          ...coordinationView(record, await tx.listDispatchIds(record.id), access.canEdit),
          events: (await tx.listEvents(record.id)).map(eventView),
        };
      });
    },
    async history(userId: string, coordinationId: string) {
      return store.transaction(async (tx) => {
        await readable(tx, userId, coordinationId);
        return (await tx.listAudits(coordinationId)).map((item) => ({
          ...item,
          occurredAt: item.occurredAt.toISOString(),
        }));
      });
    },
    async create(
      userId: string,
      input: {
        episodeId: string;
        clientCreationKey: string;
        operationId: string;
        initiator: PoliceInitiator;
        initiatingDispatchId?: string | null | undefined;
        placeType: PolicePlace;
        meetingReference?: string | null | undefined;
        notes?: string | null | undefined;
        dispatchIds?: string[] | undefined;
      },
    ) {
      const dispatchIds = [...new Set(input.dispatchIds ?? [])].sort();
      if (dispatchIds.length !== (input.dispatchIds ?? []).length)
        throw new Error("La lista de despachos contiene duplicados.");
      if (
        !(["central", "ambulance"] as unknown[]).includes(input.initiator) ||
        !(["incident", "meeting_point"] as unknown[]).includes(input.placeType)
      )
        throw new Error("La coordinación tiene datos inválidos.");
      const normalized = {
        ...input,
        meetingReference: clean(input.meetingReference, 500, "La referencia"),
        notes: clean(input.notes, 2000, "Las notas"),
        dispatchIds,
      };
      const requestHash = hash({ action: "created", userId, normalized });
      return store.transaction(async (tx) => {
        const access = await actor(tx, userId, true);
        const episode = await tx.findEpisode(input.episodeId, true);
        if (!episode || !visible(episode.ownerUserId, userId, access.roles))
          throw new Error("No se encontró el episodio.");
        const prior = await tx.findByCreationKey(episode.ownerUserId, input.clientCreationKey);
        if (prior) {
          const operation = await tx.findOperation(prior.id, input.operationId);
          assertReplay(operation, userId, "created", requestHash);
          return {
            coordination: coordinationView(prior, await tx.listDispatchIds(prior.id), true),
            operation: {
              id: input.operationId,
              action: "created",
              appliedVersion: operation!.appliedVersion,
              changed: operation!.changed,
              replayed: true,
            },
          };
        }
        if (input.initiatingDispatchId && !dispatchIds.includes(input.initiatingDispatchId))
          dispatchIds.push(input.initiatingDispatchId);
        await verifyDispatches(tx, episode, dispatchIds);
        const record: PoliceCoordinationRecord = {
          id: newId(),
          episodeId: episode.id,
          ownerUserId: episode.ownerUserId,
          clientCreationKey: input.clientCreationKey,
          initiator: input.initiator,
          initiatingDispatchId: input.initiatingDispatchId ?? null,
          placeType: input.placeType,
          meetingReference: normalized.meetingReference,
          notes: normalized.notes,
          state: "draft",
          version: 1,
          createdAt: new Date(0),
          updatedAt: new Date(0),
        };
        await tx.insertCoordination(record);
        for (const dispatchId of dispatchIds)
          await tx.associateDispatch({
            coordinationId: record.id,
            episodeId: record.episodeId,
            ownerUserId: record.ownerUserId,
            dispatchId,
          });
        const ids = await tx.listDispatchIds(record.id);
        const after = scopeState(record, ids);
        const auditId = await recordAudit(
          tx,
          record,
          userId,
          input.operationId,
          "created",
          null,
          after,
          null,
          1,
        );
        await receipt(tx, {
          coordinationId: record.id,
          ownerUserId: record.ownerUserId,
          actorUserId: userId,
          operationId: input.operationId,
          action: "created",
          requestHash,
          appliedVersion: 1,
          changed: true,
        });
        const saved = await tx.findCoordination(record.id);
        if (!saved) throw new Error("No se pudo confirmar la coordinación.");
        return {
          coordination: coordinationView(saved, ids, true),
          operation: {
            id: input.operationId,
            action: "created",
            appliedVersion: 1,
            changed: true,
            replayed: false,
          },
          auditId,
        };
      });
    },
    async update(
      userId: string,
      input: {
        coordinationId: string;
        expectedVersion: number;
        operationId: string;
        initiator: PoliceInitiator;
        initiatingDispatchId: string | null;
        placeType: PolicePlace;
        meetingReference: string | null;
        notes: string | null;
      },
    ) {
      const requestHash = hash({ action: "updated", userId, input });
      return store.transaction(async (tx) => {
        const access = await actor(tx, userId, true);
        const current = await tx.findCoordination(input.coordinationId, true);
        if (!current || !visible(current.ownerUserId, userId, access.roles))
          throw new Error("No se encontró la coordinación.");
        const prior = await tx.findOperation(current.id, input.operationId);
        if (prior) {
          assertReplay(prior, userId, "updated", requestHash);
          return {
            coordination: coordinationView(current, await tx.listDispatchIds(current.id), true),
            operation: {
              id: input.operationId,
              action: "updated",
              appliedVersion: prior.appliedVersion,
              changed: prior.changed,
              replayed: true,
            },
          };
        }
        if (current.version !== input.expectedVersion)
          throw new Error("La coordinación cambió; actualiza el historial.");
        if (
          !(["central", "ambulance"] as unknown[]).includes(input.initiator) ||
          !(["incident", "meeting_point"] as unknown[]).includes(input.placeType)
        )
          throw new Error("La coordinación tiene datos inválidos.");
        const episode = await tx.findEpisode(current.episodeId, true);
        if (!episode) throw new Error("No se encontró el episodio.");
        if (input.initiatingDispatchId) {
          await verifyDispatches(tx, episode, [input.initiatingDispatchId]);
          if (!(await tx.listDispatchIds(current.id)).includes(input.initiatingDispatchId))
            throw new Error("El despacho iniciador debe estar asociado a la coordinación.");
        }
        const next = {
          ...current,
          initiator: input.initiator,
          initiatingDispatchId: input.initiatingDispatchId,
          placeType: input.placeType,
          meetingReference: clean(input.meetingReference, 500, "La referencia"),
          notes: clean(input.notes, 2000, "Las notas"),
        };
        const ids = await tx.listDispatchIds(current.id);
        return updateAggregate(
          tx,
          current,
          next,
          userId,
          input.operationId,
          "updated",
          requestHash,
          scopeState(current, ids),
          scopeState(next, ids),
        );
      });
    },
    async setDispatches(
      userId: string,
      input: {
        coordinationId: string;
        expectedVersion: number;
        operationId: string;
        dispatchIds: string[];
      },
    ) {
      const desired = [...new Set(input.dispatchIds)].sort();
      if (desired.length !== input.dispatchIds.length)
        throw new Error("La lista de despachos contiene duplicados.");
      const requestHash = hash({
        action: "dispatches_set",
        userId,
        input: { ...input, dispatchIds: desired },
      });
      return store.transaction(async (tx) => {
        const access = await actor(tx, userId, true);
        const current = await tx.findCoordination(input.coordinationId, true);
        if (!current || !visible(current.ownerUserId, userId, access.roles))
          throw new Error("No se encontró la coordinación.");
        const prior = await tx.findOperation(current.id, input.operationId);
        if (prior) {
          assertReplay(prior, userId, "dispatches_set", requestHash);
          return {
            coordination: coordinationView(current, await tx.listDispatchIds(current.id), true),
            operation: {
              id: input.operationId,
              action: prior.action,
              appliedVersion: prior.appliedVersion,
              changed: prior.changed,
              replayed: true,
            },
          };
        }
        if (current.version !== input.expectedVersion)
          throw new Error("La coordinación cambió; actualiza el historial.");
        const episode = await tx.findEpisode(current.episodeId, true);
        if (!episode) throw new Error("No se encontró el episodio.");
        await verifyDispatches(tx, episode, desired);
        if (current.initiatingDispatchId && !desired.includes(current.initiatingDispatchId))
          throw new Error(
            "No se puede retirar el despacho iniciador sin corregir primero el iniciador.",
          );
        const beforeIds = (await tx.listDispatchIds(current.id)).sort();
        const before = scopeState(current, beforeIds);
        const removed = beforeIds.filter((id) => !desired.includes(id));
        for (const dispatchId of removed) {
          const dependent = (await tx.listEvents(current.id)).some(
            (event) => event.dispatchId === dispatchId,
          );
          if (dependent) throw new Error("No se puede retirar un despacho con eventos asociados.");
        }
        const next = { ...current, version: current.version + 1 };
        if (JSON.stringify(beforeIds) !== JSON.stringify(desired)) {
          const additions = desired.filter((id) => !beforeIds.includes(id));
          const changeLinks = async () => {
            for (const dispatchId of removed) await tx.removeDispatch(current.id, dispatchId);
            for (const dispatchId of additions)
              await tx.associateDispatch({
                coordinationId: current.id,
                episodeId: current.episodeId,
                ownerUserId: current.ownerUserId,
                dispatchId,
              });
          };
          const after = scopeState(next, desired);
          return updateAggregate(
            tx,
            current,
            next,
            userId,
            input.operationId,
            "dispatches_set",
            requestHash,
            before,
            after,
            changeLinks,
          );
        }
        return updateAggregate(
          tx,
          current,
          current,
          userId,
          input.operationId,
          "dispatches_set",
          requestHash,
          before,
          before,
        );
      });
    },
    async addEvent(
      userId: string,
      input: {
        coordinationId: string;
        expectedVersion: number;
        operationId: string;
        clientEventId: string;
        kind: PoliceEventKind;
        dispatchId?: string | null | undefined;
        occurredAt?: string | Date | null | undefined;
        timeStatus?: PoliceTimeStatus | undefined;
        note?: string | null | undefined;
      },
    ) {
      return this.mutateEvent(userId, input, false);
    },
    async updateEvent(
      userId: string,
      input: {
        coordinationId: string;
        eventId: string;
        expectedVersion: number;
        expectedCoordinationVersion: number;
        operationId: string;
        kind: PoliceEventKind;
        dispatchId?: string | null | undefined;
        occurredAt?: string | Date | null | undefined;
        timeStatus?: PoliceTimeStatus | undefined;
        note?: string | null | undefined;
      },
    ) {
      return this.mutateEvent(userId, input, true);
    },
    async mutateEvent(
      userId: string,
      input: {
        coordinationId: string;
        eventId?: string | undefined;
        expectedVersion: number;
        expectedCoordinationVersion?: number | undefined;
        operationId: string;
        clientEventId?: string | undefined;
        kind: PoliceEventKind;
        dispatchId?: string | null | undefined;
        occurredAt?: string | Date | null | undefined;
        timeStatus?: PoliceTimeStatus | undefined;
        note?: string | null | undefined;
      },
      editing: boolean,
    ) {
      if (!eventKinds.includes(input.kind)) throw new Error("El tipo de evento no es válido.");
      const action = editing ? "event_updated" : "event_created";
      const requestHash = hash({ action, userId, input });
      return store.transaction(async (tx) => {
        const access = await actor(tx, userId, true);
        const current = await tx.findCoordination(input.coordinationId, true);
        if (!current || !visible(current.ownerUserId, userId, access.roles))
          throw new Error("No se encontró la coordinación.");
        const prior = await tx.findOperation(current.id, input.operationId);
        if (prior) {
          assertReplay(prior, userId, action, requestHash);
          const savedEvent =
            editing && input.eventId
              ? await tx.findEvent(current.id, input.eventId)
              : input.clientEventId
                ? await tx.findEventByClientId(current.id, input.clientEventId)
                : null;
          return {
            coordination: coordinationView(current, await tx.listDispatchIds(current.id), true),
            event: savedEvent ? eventView(savedEvent) : null,
            operation: {
              id: input.operationId,
              action,
              appliedVersion: prior.appliedVersion,
              changed: prior.changed,
              replayed: true,
            },
          };
        }
        const expectedAggregateVersion = editing
          ? input.expectedCoordinationVersion
          : input.expectedVersion;
        if (current.version !== expectedAggregateVersion)
          throw new Error("La coordinación cambió; actualiza el historial.");
        const episode = await tx.findEpisode(current.episodeId, true);
        if (!episode) throw new Error("No se encontró el episodio.");
        let event: PoliceEventRecord | null = null;
        if (editing) {
          event = await tx.findEvent(current.id, input.eventId!, true);
          if (!event || event.version !== input.expectedVersion)
            throw new Error("El evento cambió; actualiza el historial.");
        } else {
          const clientEventId = input.clientEventId!;
          const existingEvent = await tx.findEventByClientId(current.id, clientEventId);
          if (existingEvent) throw new Error("La identidad del evento ya fue utilizada.");
        }
        const dispatchId =
          input.dispatchId === undefined ? (event?.dispatchId ?? null) : input.dispatchId;
        let eventAt: Date | null;
        let timeStatus: PoliceTimeStatus;
        if (input.occurredAt !== undefined) {
          eventAt = parseDate(input.occurredAt);
          timeStatus = input.timeStatus ?? (eventAt ? "observed" : "not_observed");
        } else if (input.timeStatus !== undefined) {
          timeStatus = input.timeStatus;
          eventAt = timeStatus === "observed" ? (event?.occurredAt ?? null) : null;
        } else {
          eventAt = event?.occurredAt ?? null;
          timeStatus = event?.timeStatus ?? "not_observed";
        }
        if (
          !timeStatuses.includes(timeStatus) ||
          (timeStatus === "observed") !== (eventAt !== null)
        )
          throw new Error("La hora observada y su estado no coinciden.");
        const note =
          input.note === undefined ? (event?.note ?? null) : clean(input.note, 2000, "La nota");
        if (!event) {
          event = {
            id: newId(),
            coordinationId: current.id,
            episodeId: current.episodeId,
            ownerUserId: current.ownerUserId,
            dispatchId,
            actorUserId: userId,
            clientEventId: input.clientEventId!,
            kind: input.kind,
            occurredAt: eventAt,
            timeStatus,
            note,
            version: 1,
            createdAt: new Date(0),
            updatedAt: new Date(0),
          };
        }
        if (sharedKinds.has(input.kind) ? dispatchId != null : !dispatchId)
          throw new Error("El evento requiere un alcance de despacho válido.");
        if (dispatchId && !(await tx.listDispatchIds(current.id)).includes(dispatchId))
          throw new Error("El despacho debe estar asociado a la coordinación.");
        const eventChanged =
          !editing ||
          event.kind !== input.kind ||
          event.dispatchId !== dispatchId ||
          event.occurredAt?.getTime() !== eventAt?.getTime() ||
          event.timeStatus !== timeStatus ||
          event.note !== note;
        const nextEvent = {
          ...event,
          kind: input.kind,
          dispatchId,
          occurredAt: eventAt,
          timeStatus,
          note,
          version: editing && eventChanged ? event.version + 1 : event.version,
        };
        const before = scopeState(current, await tx.listDispatchIds(current.id));
        const changed = !editing || eventChanged;
        const nextCoordination = {
          ...current,
          version: changed ? current.version + 1 : current.version,
        };
        if (changed) {
          await tx.updateCoordination(current.id, current.version, {
            version: nextCoordination.version,
          });
          if (editing) await tx.updateEvent(event.id, event.version, nextEvent);
          else await tx.insertEvent(nextEvent);
        }
        const eventState = (item: PoliceEventRecord) => ({
          id: item.id,
          actorUserId: item.actorUserId,
          clientEventId: item.clientEventId,
          kind: item.kind,
          dispatchId: item.dispatchId,
          occurredAt: item.occurredAt?.toISOString() ?? null,
          timeStatus: item.timeStatus,
          note: item.note,
          version: item.version,
        });
        const auditId = changed
          ? await recordAudit(
              tx,
              current,
              userId,
              input.operationId,
              action,
              editing ? { ...before, event: eventState(event) } : before,
              { ...before, event: eventState(nextEvent) },
              current.version,
              nextCoordination.version,
            )
          : null;
        if (auditId && current.ownerUserId !== userId)
          await tx.appendNotice({
            coordinationId: current.id,
            ownerUserId: current.ownerUserId,
            auditId,
            recipientUserId: current.ownerUserId,
          });
        await receipt(tx, {
          coordinationId: current.id,
          ownerUserId: current.ownerUserId,
          actorUserId: userId,
          operationId: input.operationId,
          action,
          requestHash,
          appliedVersion: nextCoordination.version,
          changed,
        });
        const saved = await tx.findCoordination(current.id);
        const savedEvent = editing
          ? await tx.findEvent(current.id, event.id)
          : await tx.findEventByClientId(current.id, nextEvent.clientEventId);
        if (!saved || !savedEvent) throw new Error("No se pudo confirmar el evento.");
        return {
          coordination: coordinationView(saved, await tx.listDispatchIds(saved.id), true),
          event: eventView(savedEvent),
          operation: {
            id: input.operationId,
            action,
            appliedVersion: nextCoordination.version,
            changed,
            replayed: false,
          },
          ...(auditId ? { auditId } : {}),
        };
      });
    },
    async listNotices(userId: string) {
      return store.transaction(async (tx) => {
        await actor(tx, userId, false);
        return (await tx.listNotices(userId)).map((item) => ({
          ...item,
          createdAt: item.createdAt.toISOString(),
          readAt: item.readAt?.toISOString() ?? null,
        }));
      });
    },
    async markNoticeRead(userId: string, noticeId: string) {
      return store.transaction(async (tx) => {
        await actor(tx, userId, false);
        const notice = await tx.markNoticeRead(noticeId, userId);
        if (!notice) throw new Error("No se encontró el aviso.");
        return {
          ...notice,
          createdAt: notice.createdAt.toISOString(),
          readAt: notice.readAt?.toISOString() ?? null,
        };
      });
    },
  };
}

const drizzleStore: PoliceCoordinationStore = {
  async transaction(work) {
    return getDatabase().transaction(async (db) => {
      const tx: PoliceCoordinationTransaction = {
        async findActor(id) {
          const rows = await db
            .select({ isActive: accountAccess.isActive, role: accountRoleGrant.role })
            .from(accountAccess)
            .leftJoin(accountRoleGrant, eq(accountRoleGrant.userId, accountAccess.userId))
            .where(eq(accountAccess.userId, id));
          return rows.length
            ? {
                isActive: rows[0]!.isActive,
                roles: rows.flatMap((row) => (row.role ? [row.role as AccountRole] : [])),
              }
            : null;
        },
        async findEpisode(id, lock = false) {
          let query = db
            .select({ id: efaEpisode.id, ownerUserId: efaEpisode.ownerUserId })
            .from(efaEpisode)
            .where(eq(efaEpisode.id, id))
            .limit(1);
          if (lock) query = query.for("update") as typeof query;
          return (await query)[0] ?? null;
        },
        async findDispatch(id, lock = false) {
          let query = db
            .select({
              id: efaDispatch.id,
              episodeId: efaDispatch.episodeId,
              ownerUserId: efaDispatch.ownerUserId,
            })
            .from(efaDispatch)
            .where(eq(efaDispatch.id, id))
            .limit(1);
          if (lock) query = query.for("update") as typeof query;
          return (await query)[0] ?? null;
        },
        async listForEpisode(id) {
          return (await db
            .select()
            .from(efaPoliceCoordination)
            .where(eq(efaPoliceCoordination.episodeId, id))
            .orderBy(desc(efaPoliceCoordination.createdAt))) as PoliceCoordinationRecord[];
        },
        async findCoordination(id, lock = false) {
          let query = db
            .select()
            .from(efaPoliceCoordination)
            .where(eq(efaPoliceCoordination.id, id))
            .limit(1);
          if (lock) query = query.for("update") as typeof query;
          return ((await query)[0] as PoliceCoordinationRecord | undefined) ?? null;
        },
        async findByCreationKey(owner, key) {
          return (
            ((
              await db
                .select()
                .from(efaPoliceCoordination)
                .where(
                  and(
                    eq(efaPoliceCoordination.ownerUserId, owner),
                    eq(efaPoliceCoordination.clientCreationKey, key),
                  ),
                )
                .limit(1)
            )[0] as PoliceCoordinationRecord | undefined) ?? null
          );
        },
        async findOperation(id, operationId) {
          return (
            ((
              await db
                .select()
                .from(efaPoliceCoordinationOperation)
                .where(
                  and(
                    eq(efaPoliceCoordinationOperation.coordinationId, id),
                    eq(efaPoliceCoordinationOperation.clientOperationId, operationId),
                  ),
                )
                .limit(1)
            )[0] as PoliceOperationRecord | undefined) ?? null
          );
        },
        async findEvent(coordinationId, eventId, lock = false) {
          let query = db
            .select()
            .from(efaPoliceCoordinationEvent)
            .where(
              and(
                eq(efaPoliceCoordinationEvent.coordinationId, coordinationId),
                eq(efaPoliceCoordinationEvent.id, eventId),
              ),
            )
            .limit(1);
          if (lock) query = query.for("update") as typeof query;
          return ((await query)[0] as PoliceEventRecord | undefined) ?? null;
        },
        async findEventByClientId(coordinationId, clientEventId) {
          return (
            ((
              await db
                .select()
                .from(efaPoliceCoordinationEvent)
                .where(
                  and(
                    eq(efaPoliceCoordinationEvent.coordinationId, coordinationId),
                    eq(efaPoliceCoordinationEvent.clientEventId, clientEventId),
                  ),
                )
                .limit(1)
            )[0] as PoliceEventRecord | undefined) ?? null
          );
        },
        async listEvents(id) {
          return (await db
            .select()
            .from(efaPoliceCoordinationEvent)
            .where(eq(efaPoliceCoordinationEvent.coordinationId, id))
            .orderBy(asc(efaPoliceCoordinationEvent.createdAt))) as PoliceEventRecord[];
        },
        async listDispatchIds(id) {
          return (
            await db
              .select({ dispatchId: efaPoliceCoordinationDispatch.dispatchId })
              .from(efaPoliceCoordinationDispatch)
              .where(eq(efaPoliceCoordinationDispatch.coordinationId, id))
              .orderBy(asc(efaPoliceCoordinationDispatch.createdAt))
          ).map((row) => row.dispatchId);
        },
        async insertCoordination(record) {
          await db
            .insert(efaPoliceCoordination)
            .values(omitDatabaseTimestamps(record) as typeof efaPoliceCoordination.$inferInsert);
        },
        async updateCoordination(id, version, fields) {
          const rows = await db
            .update(efaPoliceCoordination)
            .set({ ...fields, updatedAt: sql`now()` })
            .where(
              and(eq(efaPoliceCoordination.id, id), eq(efaPoliceCoordination.version, version)),
            )
            .returning({ id: efaPoliceCoordination.id });
          if (!rows.length) throw new Error("La coordinación cambió; actualiza el historial.");
        },
        async associateDispatch(record) {
          await db.insert(efaPoliceCoordinationDispatch).values(record);
        },
        async removeDispatch(coordinationId, dispatchId) {
          await db
            .delete(efaPoliceCoordinationDispatch)
            .where(
              and(
                eq(efaPoliceCoordinationDispatch.coordinationId, coordinationId),
                eq(efaPoliceCoordinationDispatch.dispatchId, dispatchId),
              ),
            );
        },
        async insertEvent(record) {
          await db
            .insert(efaPoliceCoordinationEvent)
            .values(
              omitDatabaseTimestamps(record) as typeof efaPoliceCoordinationEvent.$inferInsert,
            );
        },
        async updateEvent(id, version, fields) {
          const rows = await db
            .update(efaPoliceCoordinationEvent)
            .set({ ...fields, updatedAt: sql`now()` })
            .where(
              and(
                eq(efaPoliceCoordinationEvent.id, id),
                eq(efaPoliceCoordinationEvent.version, version),
              ),
            )
            .returning({ id: efaPoliceCoordinationEvent.id });
          if (!rows.length) throw new Error("El evento cambió; actualiza el historial.");
        },
        async appendAudit(record) {
          const rows = await db
            .insert(efaPoliceCoordinationAudit)
            .values(record)
            .returning({ id: efaPoliceCoordinationAudit.id });
          if (!rows[0]) throw new Error("No se pudo guardar el historial.");
          return rows[0].id;
        },
        async listAudits(id) {
          return (await db
            .select()
            .from(efaPoliceCoordinationAudit)
            .where(eq(efaPoliceCoordinationAudit.coordinationId, id))
            .orderBy(asc(efaPoliceCoordinationAudit.versionAfter))) as PoliceAuditRecord[];
        },
        async insertOperation(record) {
          await db.insert(efaPoliceCoordinationOperation).values(record);
        },
        async listNotices(id) {
          return await db
            .select({
              id: efaPoliceCoordinationNotice.id,
              coordinationId: efaPoliceCoordinationNotice.coordinationId,
              createdAt: efaPoliceCoordinationNotice.createdAt,
              readAt: efaPoliceCoordinationNotice.readAt,
            })
            .from(efaPoliceCoordinationNotice)
            .where(eq(efaPoliceCoordinationNotice.recipientUserId, id))
            .orderBy(desc(efaPoliceCoordinationNotice.createdAt));
        },
        async appendNotice(input) {
          await db.insert(efaPoliceCoordinationNotice).values(input);
        },
        async markNoticeRead(id, recipient) {
          const updated = await db
            .update(efaPoliceCoordinationNotice)
            .set({ readAt: sql`coalesce(${efaPoliceCoordinationNotice.readAt}, now())` })
            .where(
              and(
                eq(efaPoliceCoordinationNotice.id, id),
                eq(efaPoliceCoordinationNotice.recipientUserId, recipient),
                isNull(efaPoliceCoordinationNotice.readAt),
              ),
            )
            .returning();
          if (updated[0]) return updated[0];
          return (
            (
              await db
                .select()
                .from(efaPoliceCoordinationNotice)
                .where(
                  and(
                    eq(efaPoliceCoordinationNotice.id, id),
                    eq(efaPoliceCoordinationNotice.recipientUserId, recipient),
                  ),
                )
                .limit(1)
            )[0] ?? null
          );
        },
        async currentTimestamp() {
          const result = await db.execute<{ now: Date | string }>(sql`select now() as now`);
          const time = result.rows[0]?.now;
          const date = time instanceof Date ? time : new Date(time ?? Number.NaN);
          if (!Number.isFinite(date.getTime()))
            throw new Error("No se pudo obtener la hora del servidor.");
          return date;
        },
      };
      return work(tx);
    });
  },
};

export const efaPoliceCoordinationService = createEfaPoliceCoordinationService(drizzleStore);
