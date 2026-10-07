import { createHash } from "node:crypto";
import { and, asc, desc, eq, isNull, sql } from "drizzle-orm";
import { getDatabase } from "../db/index.server";
import {
  accountAccess,
  accountRoleGrant,
  efaGuard,
  efaEpisode,
  efaCommunication,
  efaDispatch,
  efaPoliceCoordination,
  efaPoliceCoordinationEvent,
  efaObservation,
  efaObservationAudit,
  efaObservationCatalog,
  efaObservationNotice,
  efaObservationOperation,
} from "../db/schema";
import { effectiveRoles, type AccountRole } from "./access";
import type { ObservationGroup } from "./efa-observations.catalog";

export type ObservationContextType =
  "guard" | "episode" | "communication" | "dispatch" | "coordination" | "police_event";
export type ObservationClassification = "adequate" | "needs_improvement";
export type ObservationRecord = {
  id: string;
  ownerUserId: string;
  guardId: string;
  episodeId: string | null;
  contextType: ObservationContextType;
  communicationId: string | null;
  dispatchId: string | null;
  coordinationId: string | null;
  policeEventId: string | null;
  catalogItemKey: string | null;
  catalogKeySnapshot: string;
  catalogLabelSnapshot: string;
  catalogGroupSnapshot: ObservationGroup;
  otherDescription: string | null;
  classification: ObservationClassification;
  comment: string | null;
  observedAt: Date | null;
  clientCreationKey: string;
  version: number;
  createdAt: Date;
  updatedAt: Date;
};
export type ObservationContext = {
  contextType: ObservationContextType;
  guardId: string;
  episodeId?: string;
  communicationId?: string;
  dispatchId?: string;
  coordinationId?: string;
  policeEventId?: string;
};
export type ObservationAudit = {
  id: string;
  observationId: string;
  ownerUserId: string;
  actorUserId: string;
  operationId: string;
  action: "created" | "updated";
  versionBefore: number | null;
  versionAfter: number;
  beforeState: Record<string, string | null> | null;
  afterState: Record<string, string | null>;
  occurredAt: Date;
};
export type ObservationOperation = {
  id?: string;
  observationId: string;
  ownerUserId: string;
  actorUserId: string;
  clientOperationId: string;
  action: "created" | "updated";
  requestHash: string;
  appliedVersion: number;
  changed: boolean;
};
export type ObservationNotice = {
  id: string;
  observationId: string;
  createdAt: Date;
  readAt: Date | null;
};
type Actor = { isActive: boolean; roles: AccountRole[] };
type ContextRecord = Omit<ObservationContext, "episodeId"> & {
  ownerUserId: string;
  episodeId: string | null;
};

export interface ObservationTransaction {
  findActor(id: string): Promise<Actor | null>;
  findGuard(
    id: string,
    lock?: boolean,
  ): Promise<{ id: string; ownerUserId: string; endedAt: Date | null } | null>;
  findEpisode(
    id: string,
    lock?: boolean,
  ): Promise<{ id: string; ownerUserId: string; originGuardId: string } | null>;
  findCommunication(
    id: string,
  ): Promise<{ id: string; ownerUserId: string; episodeId: string } | null>;
  findDispatch(id: string): Promise<{ id: string; ownerUserId: string; episodeId: string } | null>;
  findCoordination(
    id: string,
  ): Promise<{ id: string; ownerUserId: string; episodeId: string } | null>;
  findPoliceEvent(
    id: string,
  ): Promise<{ id: string; ownerUserId: string; episodeId: string; coordinationId: string } | null>;
  findCatalogItem(key: string): Promise<{
    key: string;
    label: string;
    group: ObservationGroup;
    competencyReference: string | null;
    isActive: boolean;
  } | null>;
  listCatalog(): Promise<
    Array<{
      key: string;
      label: string;
      group: ObservationGroup;
      competencyReference: string | null;
      isActive: boolean;
    }>
  >;
  findObservation(id: string, lock?: boolean): Promise<ObservationRecord | null>;
  findByCreation(owner: string, key: string, lock?: boolean): Promise<ObservationRecord | null>;
  findOperation(observationId: string, operationId: string): Promise<ObservationOperation | null>;
  listForGuard(id: string): Promise<ObservationRecord[]>;
  listForEpisode(id: string): Promise<ObservationRecord[]>;
  listAudit(id: string): Promise<ObservationAudit[]>;
  listNotices(userId: string): Promise<ObservationNotice[]>;
  insertObservation(record: Omit<ObservationRecord, "createdAt" | "updatedAt">): Promise<void>;
  updateObservation(id: string, version: number, fields: Partial<ObservationRecord>): Promise<void>;
  appendAudit(record: Omit<ObservationAudit, "id" | "occurredAt">): Promise<string>;
  insertOperation(record: ObservationOperation): Promise<void>;
  appendNotice(record: {
    observationId: string;
    ownerUserId: string;
    auditId: string;
    recipientUserId: string;
  }): Promise<void>;
  markNoticeRead(id: string, userId: string): Promise<ObservationNotice | null>;
}
export interface ObservationStore {
  transaction<T>(work: (tx: ObservationTransaction) => Promise<T>): Promise<T>;
}

const newId = () => crypto.randomUUID();
const sha256 = (input: unknown) =>
  createHash("sha256")
    .update(JSON.stringify(canonical(input)))
    .digest("hex");
function canonical(value: unknown): unknown {
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === "object")
    return Object.fromEntries(
      Object.entries(value)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([key, entry]) => [key, canonical(entry)]),
    );
  return value;
}
export function omitObservationDatabaseTimestamps<T extends object>(
  record: T,
): Omit<T, "createdAt" | "updatedAt"> {
  const result = { ...record } as T & { createdAt?: unknown; updatedAt?: unknown };
  delete result.createdAt;
  delete result.updatedAt;
  return result as Omit<T, "createdAt" | "updatedAt">;
}
function parseObservedAt(value: Date | string | null | undefined) {
  if (value == null) return null;
  const parsed = value instanceof Date ? new Date(value) : new Date(value);
  if (!Number.isFinite(parsed.getTime())) throw new Error("La hora observada no es válida.");
  return parsed;
}
function clean(value: unknown, max: number, field: string): string | null {
  if (value == null) return null;
  if (typeof value !== "string") throw new Error(`${field} no es válido.`);
  const text = value.trim();
  if (text.length > max) throw new Error(`${field} supera el límite permitido.`);
  return text || null;
}
const groupByContext: Record<ObservationContextType, ObservationGroup> = {
  guard: "record",
  episode: "record",
  communication: "phone",
  dispatch: "radio",
  coordination: "coordination",
  police_event: "coordination",
};
const visible = (owner: string, user: string, roles: AccountRole[]) =>
  owner === user || roles.includes("admin");
function state(
  record: Pick<
    ObservationRecord,
    | "guardId"
    | "episodeId"
    | "contextType"
    | "communicationId"
    | "dispatchId"
    | "coordinationId"
    | "policeEventId"
    | "catalogItemKey"
    | "catalogKeySnapshot"
    | "catalogLabelSnapshot"
    | "catalogGroupSnapshot"
    | "otherDescription"
    | "classification"
    | "comment"
    | "observedAt"
  >,
): Record<string, string | null> {
  return {
    guardId: record.guardId,
    episodeId: record.episodeId,
    contextType: record.contextType,
    communicationId: record.communicationId,
    dispatchId: record.dispatchId,
    coordinationId: record.coordinationId,
    policeEventId: record.policeEventId,
    catalogItemKey: record.catalogItemKey,
    catalogKeySnapshot: record.catalogKeySnapshot,
    catalogLabelSnapshot: record.catalogLabelSnapshot,
    catalogGroupSnapshot: record.catalogGroupSnapshot,
    otherDescription: record.otherDescription,
    classification: record.classification,
    comment: record.comment,
    observedAt: record.observedAt?.toISOString() ?? null,
  };
}
function view(record: ObservationRecord, canEdit: boolean) {
  return {
    ...record,
    observedAt: record.observedAt?.toISOString() ?? null,
    createdAt: record.createdAt.toISOString(),
    updatedAt: record.updatedAt.toISOString(),
    canEdit,
  };
}

export function createEfaObservationService(
  store: ObservationStore,
  deps: { newId?: () => string } = {},
) {
  const id = deps.newId ?? newId;
  async function access(tx: ObservationTransaction, userId: string, write: boolean) {
    const current = await tx.findActor(userId);
    if (!current?.isActive) throw new Error("La cuenta está inactiva.");
    const roles = effectiveRoles(current.roles);
    if (write && !roles.includes("efa")) throw new Error("Se requiere acceso EFA vigente.");
    return { roles, canEdit: roles.includes("efa") };
  }
  async function validateContext(
    tx: ObservationTransaction,
    context: ObservationContext,
    owner: string,
    creating: boolean,
  ): Promise<ContextRecord> {
    const guard = await tx.findGuard(context.guardId, creating);
    if (!guard || guard.ownerUserId !== owner)
      throw new Error("La guardia no pertenece a la cuenta.");
    if (creating && guard.endedAt)
      throw new Error("No se pueden crear observaciones en una guardia finalizada.");
    const episodeId = context.episodeId ?? null;
    if (context.contextType === "guard") {
      if (
        episodeId ||
        context.communicationId ||
        context.dispatchId ||
        context.coordinationId ||
        context.policeEventId
      )
        throw new Error("El contexto de guardia no admite otro vínculo.");
      return { ...context, episodeId: null, ownerUserId: owner };
    }
    if (!episodeId) throw new Error("El episodio del contexto es obligatorio.");
    const episode = await tx.findEpisode(episodeId, creating);
    if (!episode || episode.ownerUserId !== owner || episode.originGuardId !== guard.id)
      throw new Error("El episodio no corresponde a la guardia.");
    const expectedKey: Record<ObservationContextType, string | undefined> = {
      guard: undefined,
      episode: undefined,
      communication: context.communicationId,
      dispatch: context.dispatchId,
      coordination: context.coordinationId,
      police_event: context.policeEventId,
    };
    const expected = expectedKey[context.contextType];
    const leaves = [
      context.communicationId,
      context.dispatchId,
      context.coordinationId,
      context.policeEventId,
    ].filter(Boolean);
    if (
      (context.contextType === "episode" && leaves.length) ||
      (context.contextType !== "episode" &&
        (leaves.length !== (context.contextType === "police_event" ? 2 : 1) || !expected))
    )
      throw new Error("El contexto tipado está incompleto o es ambiguo.");
    if (context.contextType === "communication") {
      const item = await tx.findCommunication(expected!);
      if (!item || item.episodeId !== episode.id || item.ownerUserId !== owner)
        throw new Error("La llamada no pertenece al episodio.");
    } else if (context.contextType === "dispatch") {
      const item = await tx.findDispatch(expected!);
      if (!item || item.episodeId !== episode.id || item.ownerUserId !== owner)
        throw new Error("El despacho no pertenece al episodio.");
    } else if (context.contextType === "coordination") {
      const item = await tx.findCoordination(expected!);
      if (!item || item.episodeId !== episode.id || item.ownerUserId !== owner)
        throw new Error("La coordinación no pertenece al episodio.");
    } else if (context.contextType === "police_event") {
      const event = await tx.findPoliceEvent(expected!);
      if (
        !event ||
        event.episodeId !== episode.id ||
        event.ownerUserId !== owner ||
        event.coordinationId !== context.coordinationId
      )
        throw new Error("El evento policial no pertenece a la coordinación y episodio.");
      const coordination = await tx.findCoordination(context.coordinationId!);
      if (
        !coordination ||
        coordination.episodeId !== episode.id ||
        coordination.ownerUserId !== owner
      )
        throw new Error("La coordinación del evento no pertenece al episodio.");
    }
    return { ...context, episodeId, ownerUserId: owner };
  }
  async function validateItem(
    tx: ObservationTransaction,
    contextType: ObservationContextType,
    key: string,
    description: unknown,
    otherGroup?: ObservationGroup,
  ) {
    if (key === "other") {
      const text = clean(description, 1000, "La descripción de otra conducta");
      if (!text) throw new Error("La descripción de otra conducta es obligatoria.");
      return {
        catalogItemKey: null,
        catalogKeySnapshot: "other",
        catalogLabelSnapshot: "Otra conducta",
        catalogGroupSnapshot: otherGroup ?? groupByContext[contextType],
        otherDescription: text,
      };
    }
    const item = await tx.findCatalogItem(key);
    if (!item?.isActive) throw new Error("La conducta no está disponible en el catálogo.");
    if (otherGroup !== undefined)
      throw new Error("El grupo solo se puede definir para otra conducta.");
    if (description != null && clean(description, 1000, "La descripción"))
      throw new Error("La descripción propia solo se admite para otra conducta.");
    return {
      catalogItemKey: item.key,
      catalogKeySnapshot: item.key,
      catalogLabelSnapshot: item.label,
      catalogGroupSnapshot: item.group,
      otherDescription: null,
    };
  }
  function assertOperation(
    prior: ObservationOperation | null,
    userId: string,
    action: string,
    hash: string,
  ) {
    if (
      !prior ||
      prior.actorUserId !== userId ||
      prior.action !== action ||
      prior.requestHash !== hash
    )
      throw new Error("La identidad de operación ya se usó para otro cambio.");
  }
  async function authorizeRecord(
    tx: ObservationTransaction,
    userId: string,
    observationId: string,
    write: boolean,
  ) {
    const permission = await access(tx, userId, write);
    const record = await tx.findObservation(observationId, write);
    if (!record || !visible(record.ownerUserId, userId, permission.roles))
      throw new Error("No se encontró la observación.");
    await validateContext(
      tx,
      {
        contextType: record.contextType,
        guardId: record.guardId,
        ...(record.episodeId ? { episodeId: record.episodeId } : {}),
        ...(record.communicationId ? { communicationId: record.communicationId } : {}),
        ...(record.dispatchId ? { dispatchId: record.dispatchId } : {}),
        ...(record.coordinationId ? { coordinationId: record.coordinationId } : {}),
        ...(record.policeEventId ? { policeEventId: record.policeEventId } : {}),
      },
      record.ownerUserId,
      false,
    );
    return { permission, record };
  }
  async function saveOperation(
    tx: ObservationTransaction,
    record: ObservationRecord,
    actorUserId: string,
    operationId: string,
    action: "created" | "updated",
    requestHash: string,
    version: number,
    changed: boolean,
  ) {
    await tx.insertOperation({
      observationId: record.id,
      ownerUserId: record.ownerUserId,
      actorUserId,
      clientOperationId: operationId,
      action,
      requestHash,
      appliedVersion: version,
      changed,
    });
  }
  return {
    async catalog(userId: string) {
      return store.transaction(async (tx) => {
        await access(tx, userId, false);
        return tx.listCatalog();
      });
    },
    async listForGuard(userId: string, guardId: string) {
      return store.transaction(async (tx) => {
        const permission = await access(tx, userId, false);
        const guard = await tx.findGuard(guardId);
        if (!guard || !visible(guard.ownerUserId, userId, permission.roles))
          throw new Error("No se encontró la guardia.");
        return (await tx.listForGuard(guardId)).map((record) =>
          view(record, permission.canEdit && visible(record.ownerUserId, userId, permission.roles)),
        );
      });
    },
    async listForEpisode(userId: string, episodeId: string) {
      return store.transaction(async (tx) => {
        const permission = await access(tx, userId, false);
        const episode = await tx.findEpisode(episodeId);
        if (!episode || !visible(episode.ownerUserId, userId, permission.roles))
          throw new Error("No se encontró el episodio.");
        return (await tx.listForEpisode(episodeId)).map((record) =>
          view(record, permission.canEdit && visible(record.ownerUserId, userId, permission.roles)),
        );
      });
    },
    async get(userId: string, observationId: string) {
      return store.transaction(async (tx) => {
        const { permission, record } = await authorizeRecord(tx, userId, observationId, false);
        return view(
          record,
          permission.canEdit && visible(record.ownerUserId, userId, permission.roles),
        );
      });
    },
    async history(userId: string, observationId: string) {
      return store.transaction(async (tx) => {
        await authorizeRecord(tx, userId, observationId, false);
        return (await tx.listAudit(observationId)).map((audit) => ({
          ...audit,
          occurredAt: audit.occurredAt.toISOString(),
        }));
      });
    },
    async create(
      userId: string,
      input: ObservationContext & {
        clientCreationKey: string;
        operationId: string;
        catalogItemKey: string;
        classification: ObservationClassification;
        otherDescription?: string | null | undefined;
        otherGroup?: ObservationGroup | undefined;
        comment?: string | null | undefined;
        observedAt?: string | Date | null | undefined;
      },
    ) {
      return store.transaction(async (tx) => {
        const permission = await access(tx, userId, true);
        const guard = await tx.findGuard(input.guardId, true);
        if (!guard || guard.ownerUserId !== userId)
          throw new Error("La guardia no pertenece a la cuenta.");
        const requestHash = sha256({ actor: userId, action: "created", input });
        const priorRecord = await tx.findByCreation(userId, input.clientCreationKey, true);
        if (priorRecord) {
          await validateContext(
            tx,
            {
              contextType: priorRecord.contextType,
              guardId: priorRecord.guardId,
              ...(priorRecord.episodeId ? { episodeId: priorRecord.episodeId } : {}),
              ...(priorRecord.communicationId
                ? { communicationId: priorRecord.communicationId }
                : {}),
              ...(priorRecord.dispatchId ? { dispatchId: priorRecord.dispatchId } : {}),
              ...(priorRecord.coordinationId ? { coordinationId: priorRecord.coordinationId } : {}),
              ...(priorRecord.policeEventId ? { policeEventId: priorRecord.policeEventId } : {}),
            },
            userId,
            false,
          );
          const operation = await tx.findOperation(priorRecord.id, input.operationId);
          assertOperation(operation, userId, "created", requestHash);
          return {
            observation: view(priorRecord, permission.canEdit),
            operation: {
              id: input.operationId,
              action: "created",
              appliedVersion: operation!.appliedVersion,
              changed: operation!.changed,
              replayed: true,
            },
          };
        }
        const context = await validateContext(tx, input, userId, true);
        const item = await validateItem(
          tx,
          context.contextType,
          input.catalogItemKey,
          input.otherDescription,
          input.otherGroup,
        );
        if (input.classification !== "adequate" && input.classification !== "needs_improvement")
          throw new Error("La clasificación es obligatoria.");
        const observationId = id();
        const draft = {
          id: observationId,
          ownerUserId: userId,
          guardId: context.guardId,
          episodeId: context.episodeId,
          contextType: context.contextType,
          communicationId: context.communicationId ?? null,
          dispatchId: context.dispatchId ?? null,
          coordinationId: context.coordinationId ?? null,
          policeEventId: context.policeEventId ?? null,
          ...item,
          classification: input.classification,
          comment: clean(input.comment, 1000, "El comentario"),
          observedAt: parseObservedAt(input.observedAt),
          clientCreationKey: input.clientCreationKey,
          version: 1,
        } satisfies Omit<ObservationRecord, "createdAt" | "updatedAt">;
        await tx.insertObservation(draft);
        const auditId = await tx.appendAudit({
          observationId,
          ownerUserId: userId,
          actorUserId: userId,
          operationId: input.operationId,
          action: "created",
          versionBefore: null,
          versionAfter: 1,
          beforeState: null,
          afterState: state(draft),
        });
        await saveOperation(
          tx,
          { ...draft, createdAt: new Date(0), updatedAt: new Date(0) },
          userId,
          input.operationId,
          "created",
          requestHash,
          1,
          true,
        );
        const saved = await tx.findObservation(observationId);
        if (!saved) throw new Error("No se pudo confirmar la observación.");
        return {
          observation: view(saved, true),
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
        observationId: string;
        expectedVersion: number;
        operationId: string;
        catalogItemKey?: string | undefined;
        classification?: ObservationClassification | undefined;
        otherDescription?: string | null | undefined;
        otherGroup?: ObservationGroup | undefined;
        comment?: string | null | undefined;
        observedAt?: string | Date | null | undefined;
      },
    ) {
      return store.transaction(async (tx) => {
        const { permission, record: current } = await authorizeRecord(
          tx,
          userId,
          input.observationId,
          true,
        );
        const requestHash = sha256({ actor: userId, action: "updated", input });
        const prior = await tx.findOperation(current.id, input.operationId);
        if (prior) {
          assertOperation(prior, userId, "updated", requestHash);
          return {
            observation: view(current, permission.canEdit),
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
          throw new Error("La observación cambió; actualiza el historial.");
        if (
          input.classification !== undefined &&
          input.classification !== "adequate" &&
          input.classification !== "needs_improvement"
        )
          throw new Error("La clasificación no es válida.");
        const item =
          input.catalogItemKey === undefined
            ? current.catalogKeySnapshot === "other"
              ? {
                  catalogItemKey: null,
                  catalogKeySnapshot: current.catalogKeySnapshot,
                  catalogLabelSnapshot: current.catalogLabelSnapshot,
                  catalogGroupSnapshot: input.otherGroup ?? current.catalogGroupSnapshot,
                  otherDescription:
                    input.otherDescription === undefined
                      ? current.otherDescription
                      : clean(input.otherDescription, 1000, "La descripción de otra conducta"),
                }
              : (() => {
                  if (input.otherGroup !== undefined)
                    throw new Error("El grupo solo se puede definir para otra conducta.");
                  return {
                    catalogItemKey: current.catalogItemKey,
                    catalogKeySnapshot: current.catalogKeySnapshot,
                    catalogLabelSnapshot: current.catalogLabelSnapshot,
                    catalogGroupSnapshot: current.catalogGroupSnapshot,
                    otherDescription:
                      input.otherDescription === undefined
                        ? current.otherDescription
                        : clean(input.otherDescription, 1000, "La descripción de otra conducta"),
                  };
                })()
            : await validateItem(
                tx,
                current.contextType,
                input.catalogItemKey,
                input.otherDescription === undefined && input.catalogItemKey === "other"
                  ? current.otherDescription
                  : input.otherDescription,
                input.catalogItemKey === "other"
                  ? (input.otherGroup ?? current.catalogGroupSnapshot)
                  : input.otherGroup,
              );
        if (item.catalogKeySnapshot === "other" && !item.otherDescription)
          throw new Error("La descripción de otra conducta es obligatoria.");
        const next = {
          ...current,
          ...item,
          classification: input.classification ?? current.classification,
          comment:
            input.comment === undefined
              ? current.comment
              : clean(input.comment, 1000, "El comentario"),
          observedAt:
            input.observedAt === undefined ? current.observedAt : parseObservedAt(input.observedAt),
        };
        const before = state(current);
        const after = state(next);
        const changed = JSON.stringify(before) !== JSON.stringify(after);
        const appliedVersion = changed ? current.version + 1 : current.version;
        if (changed) {
          await tx.updateObservation(current.id, current.version, {
            ...next,
            version: appliedVersion,
          });
        }
        const auditId = changed
          ? await tx.appendAudit({
              observationId: current.id,
              ownerUserId: current.ownerUserId,
              actorUserId: userId,
              operationId: input.operationId,
              action: "updated",
              versionBefore: current.version,
              versionAfter: appliedVersion,
              beforeState: before,
              afterState: after,
            })
          : null;
        if (auditId && current.ownerUserId !== userId)
          await tx.appendNotice({
            observationId: current.id,
            ownerUserId: current.ownerUserId,
            auditId,
            recipientUserId: current.ownerUserId,
          });
        await saveOperation(
          tx,
          current,
          userId,
          input.operationId,
          "updated",
          requestHash,
          appliedVersion,
          changed,
        );
        const saved = await tx.findObservation(current.id);
        if (!saved) throw new Error("No se pudo confirmar la observación.");
        return {
          observation: view(saved, permission.canEdit),
          operation: {
            id: input.operationId,
            action: "updated",
            appliedVersion,
            changed,
            replayed: false,
          },
          ...(auditId ? { auditId } : {}),
        };
      });
    },
    async listNotices(userId: string) {
      return store.transaction(async (tx) => {
        await access(tx, userId, false);
        return (await tx.listNotices(userId)).map((item) => ({
          ...item,
          createdAt: item.createdAt.toISOString(),
          readAt: item.readAt?.toISOString() ?? null,
        }));
      });
    },
    async markNoticeRead(userId: string, noticeId: string) {
      return store.transaction(async (tx) => {
        await access(tx, userId, false);
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

const drizzleStore: ObservationStore = {
  async transaction(work) {
    return getDatabase().transaction(async (db) => {
      const tx: ObservationTransaction = {
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
        async findGuard(id, lock = false) {
          let query = db
            .select({
              id: efaGuard.id,
              ownerUserId: efaGuard.ownerUserId,
              endedAt: efaGuard.endedAt,
            })
            .from(efaGuard)
            .where(eq(efaGuard.id, id))
            .limit(1);
          if (lock) query = query.for("update") as typeof query;
          return (await query)[0] ?? null;
        },
        async findEpisode(id, lock = false) {
          let query = db
            .select({
              id: efaEpisode.id,
              ownerUserId: efaEpisode.ownerUserId,
              originGuardId: efaEpisode.originGuardId,
            })
            .from(efaEpisode)
            .where(eq(efaEpisode.id, id))
            .limit(1);
          if (lock) query = query.for("update") as typeof query;
          return (await query)[0] ?? null;
        },
        async findCommunication(id) {
          return (
            (
              await db
                .select({
                  id: efaCommunication.id,
                  ownerUserId: efaCommunication.ownerUserId,
                  episodeId: efaCommunication.episodeId,
                })
                .from(efaCommunication)
                .where(eq(efaCommunication.id, id))
                .limit(1)
            )[0] ?? null
          );
        },
        async findDispatch(id) {
          return (
            (
              await db
                .select({
                  id: efaDispatch.id,
                  ownerUserId: efaDispatch.ownerUserId,
                  episodeId: efaDispatch.episodeId,
                })
                .from(efaDispatch)
                .where(eq(efaDispatch.id, id))
                .limit(1)
            )[0] ?? null
          );
        },
        async findCoordination(id) {
          return (
            (
              await db
                .select({
                  id: efaPoliceCoordination.id,
                  ownerUserId: efaPoliceCoordination.ownerUserId,
                  episodeId: efaPoliceCoordination.episodeId,
                })
                .from(efaPoliceCoordination)
                .where(eq(efaPoliceCoordination.id, id))
                .limit(1)
            )[0] ?? null
          );
        },
        async findPoliceEvent(id) {
          return (
            (
              await db
                .select({
                  id: efaPoliceCoordinationEvent.id,
                  ownerUserId: efaPoliceCoordinationEvent.ownerUserId,
                  episodeId: efaPoliceCoordinationEvent.episodeId,
                  coordinationId: efaPoliceCoordinationEvent.coordinationId,
                })
                .from(efaPoliceCoordinationEvent)
                .where(eq(efaPoliceCoordinationEvent.id, id))
                .limit(1)
            )[0] ?? null
          );
        },
        async findCatalogItem(key) {
          const row = (
            await db
              .select()
              .from(efaObservationCatalog)
              .where(
                and(eq(efaObservationCatalog.key, key), eq(efaObservationCatalog.isActive, true)),
              )
              .limit(1)
          )[0];
          return row ? { ...row, group: row.group as ObservationGroup } : null;
        },
        async listCatalog() {
          return (await db
            .select()
            .from(efaObservationCatalog)
            .where(eq(efaObservationCatalog.isActive, true))
            .orderBy(asc(efaObservationCatalog.group), asc(efaObservationCatalog.key))) as Awaited<
            ReturnType<ObservationTransaction["listCatalog"]>
          >;
        },
        async findObservation(id, lock = false) {
          let query = db.select().from(efaObservation).where(eq(efaObservation.id, id)).limit(1);
          if (lock) query = query.for("update") as typeof query;
          return ((await query)[0] as ObservationRecord | undefined) ?? null;
        },
        async findByCreation(owner, key, lock = false) {
          let query = db
            .select()
            .from(efaObservation)
            .where(
              and(eq(efaObservation.ownerUserId, owner), eq(efaObservation.clientCreationKey, key)),
            )
            .limit(1);
          if (lock) query = query.for("update") as typeof query;
          return ((await query)[0] as ObservationRecord | undefined) ?? null;
        },
        async findOperation(observationId, operationId) {
          return (
            ((
              await db
                .select()
                .from(efaObservationOperation)
                .where(
                  and(
                    eq(efaObservationOperation.observationId, observationId),
                    eq(efaObservationOperation.clientOperationId, operationId),
                  ),
                )
                .limit(1)
            )[0] as ObservationOperation | undefined) ?? null
          );
        },
        async listForGuard(id) {
          return (await db
            .select()
            .from(efaObservation)
            .where(eq(efaObservation.guardId, id))
            .orderBy(desc(efaObservation.createdAt))) as ObservationRecord[];
        },
        async listForEpisode(id) {
          return (await db
            .select()
            .from(efaObservation)
            .where(eq(efaObservation.episodeId, id))
            .orderBy(desc(efaObservation.createdAt))) as ObservationRecord[];
        },
        async listAudit(id) {
          return (await db
            .select()
            .from(efaObservationAudit)
            .where(eq(efaObservationAudit.observationId, id))
            .orderBy(asc(efaObservationAudit.versionAfter))) as ObservationAudit[];
        },
        async listNotices(userId) {
          return (await db
            .select({
              id: efaObservationNotice.id,
              observationId: efaObservationNotice.observationId,
              createdAt: efaObservationNotice.createdAt,
              readAt: efaObservationNotice.readAt,
            })
            .from(efaObservationNotice)
            .where(eq(efaObservationNotice.recipientUserId, userId))
            .orderBy(desc(efaObservationNotice.createdAt))) as ObservationNotice[];
        },
        async insertObservation(record) {
          await db
            .insert(efaObservation)
            .values(
              omitObservationDatabaseTimestamps(record) as typeof efaObservation.$inferInsert,
            );
        },
        async updateObservation(id, version, fields) {
          const rows = await db
            .update(efaObservation)
            .set({ ...fields, updatedAt: sql`now()` })
            .where(and(eq(efaObservation.id, id), eq(efaObservation.version, version)))
            .returning({ id: efaObservation.id });
          if (!rows.length) throw new Error("La observación cambió; actualiza el historial.");
        },
        async appendAudit(record) {
          const rows = await db
            .insert(efaObservationAudit)
            .values(record)
            .returning({ id: efaObservationAudit.id });
          if (!rows[0]) throw new Error("No se pudo guardar el historial.");
          return rows[0].id;
        },
        async insertOperation(record) {
          await db.insert(efaObservationOperation).values(record);
        },
        async appendNotice(input) {
          await db.insert(efaObservationNotice).values(input);
        },
        async markNoticeRead(id, userId) {
          const rows = await db
            .update(efaObservationNotice)
            .set({ readAt: sql`coalesce(${efaObservationNotice.readAt}, now())` })
            .where(
              and(
                eq(efaObservationNotice.id, id),
                eq(efaObservationNotice.recipientUserId, userId),
                isNull(efaObservationNotice.readAt),
              ),
            )
            .returning();
          if (rows[0]) return rows[0];
          return (
            (
              await db
                .select({
                  id: efaObservationNotice.id,
                  observationId: efaObservationNotice.observationId,
                  createdAt: efaObservationNotice.createdAt,
                  readAt: efaObservationNotice.readAt,
                })
                .from(efaObservationNotice)
                .where(
                  and(
                    eq(efaObservationNotice.id, id),
                    eq(efaObservationNotice.recipientUserId, userId),
                  ),
                )
                .limit(1)
            )[0] ?? null
          );
        },
      };
      return work(tx);
    });
  },
};
export const efaObservationService = createEfaObservationService(drizzleStore);
