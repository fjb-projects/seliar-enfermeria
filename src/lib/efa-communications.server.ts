import { createHash } from "node:crypto";
import { and, asc, desc, eq, isNull, sql } from "drizzle-orm";
import { getDatabase } from "../db/index.server";
import {
  accountAccess,
  accountRoleGrant,
  efaCommunication,
  efaCommunicationAudit,
  efaCommunicationNotice,
  efaCommunicationOperation,
  efaEpisode,
} from "../db/schema";
import { effectiveRoles, type AccountRole } from "./access";

export type EfaCommunicationDirection = "incoming" | "outgoing";
export type EfaCommunicationPriority = "red" | "yellow" | "green";
export type EfaCommunicationStatus = "draft" | "finalized" | "cancelled";
export type EfaCommunicationState = {
  direction: EfaCommunicationDirection;
  startedAt: string | null;
  endedAt: string | null;
  priority: EfaCommunicationPriority | null;
  state: EfaCommunicationStatus;
  finalizedAt: string | null;
  cancelledAt: string | null;
  cancelledFromState: "draft" | "finalized" | null;
};
export type EfaCommunicationRecord = {
  id: string;
  episodeId: string;
  ownerUserId: string;
  clientCreationKey: string;
  direction: EfaCommunicationDirection;
  startedAt: Date | null;
  endedAt: Date | null;
  priority: EfaCommunicationPriority | null;
  state: EfaCommunicationStatus;
  version: number;
  finalizedAt: Date | null;
  cancelledAt: Date | null;
  cancelledFromState: "draft" | "finalized" | null;
  createdAt: Date;
  updatedAt: Date;
};
type Actor = { isActive: boolean; roles: AccountRole[] };
export type EfaCommunicationEpisode = {
  id: string;
  ownerUserId: string;
  cancelledAt?: Date | null;
};
export type EfaCommunicationOperationRecord = {
  id: string;
  communicationId: string;
  ownerUserId: string;
  actorUserId: string;
  clientOperationId: string;
  action: "created" | "updated" | "finalized" | "cancelled" | "reactivated";
  requestHash: string;
  appliedVersion: number;
  changed: boolean;
};
export type EfaCommunicationAuditRecord = {
  id: string;
  communicationId: string;
  ownerUserId: string;
  actorUserId: string;
  operationId: string;
  action: "created" | "updated" | "finalized" | "cancelled" | "reactivated";
  versionBefore: number | null;
  versionAfter: number;
  beforeState: EfaCommunicationState | null;
  afterState: EfaCommunicationState;
  occurredAt: Date;
};
export type EfaCommunicationNoticeRecord = {
  id: string;
  communicationId: string;
  ownerUserId: string;
  auditId: string;
  recipientUserId: string;
  createdAt: Date;
  readAt: Date | null;
};
export interface EfaCommunicationTransaction {
  findActor(userId: string): Promise<Actor | null>;
  findEpisode(episodeId: string, lock?: boolean): Promise<EfaCommunicationEpisode | null>;
  listCommunications(ownerUserId: string | null): Promise<EfaCommunicationRecord[]>;
  listCommunicationsForEpisode(episodeId: string): Promise<EfaCommunicationRecord[]>;
  findCommunication(
    communicationId: string,
    lock?: boolean,
  ): Promise<EfaCommunicationRecord | null>;
  findCommunicationByCreationKey(
    ownerUserId: string,
    clientCreationKey: string,
  ): Promise<EfaCommunicationRecord | null>;
  findOperation(
    communicationId: string,
    clientOperationId: string,
  ): Promise<EfaCommunicationOperationRecord | null>;
  currentTimestamp(): Promise<Date>;
  insertCommunication(
    input: Omit<
      EfaCommunicationRecord,
      "version" | "createdAt" | "updatedAt" | "finalizedAt" | "cancelledAt" | "cancelledFromState"
    >,
  ): Promise<void>;
  updateCommunication(
    communicationId: string,
    expectedVersion: number,
    next: Pick<
      EfaCommunicationRecord,
      | "direction"
      | "startedAt"
      | "endedAt"
      | "priority"
      | "state"
      | "version"
      | "finalizedAt"
      | "cancelledAt"
      | "cancelledFromState"
    >,
  ): Promise<void>;
  appendAudit(input: {
    communicationId: string;
    ownerUserId: string;
    actorUserId: string;
    operationId: string;
    action: "created" | "updated" | "finalized" | "cancelled" | "reactivated";
    versionBefore: number | null;
    versionAfter: number;
    beforeState: EfaCommunicationState | null;
    afterState: EfaCommunicationState;
  }): Promise<string>;
  insertOperation(input: Omit<EfaCommunicationOperationRecord, "id">): Promise<void>;
  appendNotice(input: {
    communicationId: string;
    ownerUserId: string;
    auditId: string;
    recipientUserId: string;
  }): Promise<void>;
  listAudits(communicationId: string): Promise<EfaCommunicationAuditRecord[]>;
  listNotices(recipientUserId: string): Promise<EfaCommunicationNoticeRecord[]>;
  markNoticeRead(
    noticeId: string,
    recipientUserId: string,
  ): Promise<EfaCommunicationNoticeRecord | null>;
}
export interface EfaCommunicationStore {
  transaction<T>(work: (tx: EfaCommunicationTransaction) => Promise<T>): Promise<T>;
}
export type EfaCommunicationView = Omit<
  EfaCommunicationRecord,
  "startedAt" | "endedAt" | "finalizedAt" | "cancelledAt" | "createdAt" | "updatedAt"
> & {
  startedAt: string | null;
  endedAt: string | null;
  finalizedAt: string | null;
  cancelledAt: string | null;
  createdAt: string;
  updatedAt: string;
  canEdit: boolean;
  canManageLifecycle?: boolean;
};
export type EfaCommunicationMutationResult = {
  communication: EfaCommunicationView;
  operation: {
    id: string;
    action: "created" | "updated" | "finalized" | "cancelled" | "reactivated";
    appliedVersion: number;
    changed: boolean;
    replayed: boolean;
  };
};
export type EfaCommunicationServiceDependencies = { newId?: () => string };

const randomId = () => crypto.randomUUID();
const priorities = ["red", "yellow", "green"] as const;
const requestHash = (values: Record<string, unknown>) =>
  createHash("sha256").update(JSON.stringify(values)).digest("hex");
const parseOptionalDate = (value: string | Date | null | undefined, label: string) => {
  if (value === null || value === undefined) return null;
  const parsed = value instanceof Date ? new Date(value.getTime()) : new Date(value);
  if (!Number.isFinite(parsed.getTime())) throw new Error(`La hora de ${label} no es válida.`);
  return parsed;
};
const validDirection = (value: string): value is EfaCommunicationDirection =>
  value === "incoming" || value === "outgoing";
const validPriority = (value: string | null): value is EfaCommunicationPriority =>
  priorities.includes(value as EfaCommunicationPriority);
const cleanPriority = (value: string | null | undefined) => value ?? null;
const toState = (
  record: Pick<
    EfaCommunicationRecord,
    | "direction"
    | "startedAt"
    | "endedAt"
    | "priority"
    | "state"
    | "finalizedAt"
    | "cancelledAt"
    | "cancelledFromState"
  >,
): EfaCommunicationState => ({
  direction: record.direction,
  startedAt: record.startedAt?.toISOString() ?? null,
  endedAt: record.endedAt?.toISOString() ?? null,
  priority: record.priority,
  state: record.state,
  finalizedAt: record.finalizedAt?.toISOString() ?? null,
  cancelledAt: record.cancelledAt?.toISOString() ?? null,
  cancelledFromState: record.cancelledFromState,
});
const asView = (record: EfaCommunicationRecord, canEdit: boolean): EfaCommunicationView => ({
  ...record,
  startedAt: record.startedAt?.toISOString() ?? null,
  endedAt: record.endedAt?.toISOString() ?? null,
  finalizedAt: record.finalizedAt?.toISOString() ?? null,
  cancelledAt: record.cancelledAt?.toISOString() ?? null,
  createdAt: record.createdAt.toISOString(),
  updatedAt: record.updatedAt.toISOString(),
  canEdit: canEdit && record.state !== "cancelled",
  canManageLifecycle: canEdit,
});

export function createEfaCommunicationsService(
  store: EfaCommunicationStore,
  dependencies: EfaCommunicationServiceDependencies = {},
) {
  const newId = dependencies.newId ?? randomId;

  async function actor(tx: EfaCommunicationTransaction, userId: string, write: boolean) {
    const current = await tx.findActor(userId);
    if (!current?.isActive) throw new Error("La cuenta está inactiva.");
    const roles = effectiveRoles(current.roles);
    if (write && !roles.includes("efa")) throw new Error("Se requiere acceso EFA vigente.");
    return { roles, canEdit: roles.includes("efa") };
  }

  function replay(
    record: EfaCommunicationRecord,
    operation: EfaCommunicationOperationRecord,
  ): EfaCommunicationMutationResult {
    return {
      communication: asView(record, true),
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
    operation: EfaCommunicationOperationRecord | null,
    actorUserId: string,
    action: EfaCommunicationOperationRecord["action"],
    hash: string,
  ): asserts operation is EfaCommunicationOperationRecord {
    if (
      !operation ||
      operation.actorUserId !== actorUserId ||
      operation.action !== action ||
      operation.requestHash !== hash
    ) {
      throw new Error("La identidad de operación ya se usó para otro cambio.");
    }
  }

  function visible(record: EfaCommunicationRecord, userId: string, roles: AccountRole[]) {
    return record.ownerUserId === userId || roles.includes("admin");
  }

  async function transitionCancellation(
    userId: string,
    input: { communicationId: string; expectedVersion: number; operationId: string },
    kind: "cancel" | "reactivate",
  ): Promise<EfaCommunicationMutationResult> {
    const action = kind === "cancel" ? "cancelled" : "reactivated";
    const hash = requestHash({ action, actorUserId: userId, ...input });
    return store.transaction(async (tx) => {
      const { roles } = await actor(tx, userId, true);
      let current = await tx.findCommunication(input.communicationId, false);
      if (!current || !visible(current, userId, roles))
        throw new Error("No se encontró la comunicación.");
      if (kind === "reactivate") {
        const episode = await tx.findEpisode(current.episodeId, true);
        if (!episode || episode.cancelledAt)
          throw new Error("Reactiva primero el episodio cancelado.");
      }
      current = await tx.findCommunication(input.communicationId, true);
      if (!current || !visible(current, userId, roles)) {
        throw new Error("No se encontró la comunicación.");
      }
      const existing = await tx.findOperation(current.id, input.operationId);
      if (existing) {
        assertOperation(existing, userId, action, hash);
        return replay(current, existing);
      }
      if (current.version !== input.expectedVersion) {
        throw new Error("La comunicación cambió; actualiza el historial antes de continuar.");
      }

      const alreadyInRequestedState =
        (kind === "cancel" && current.state === "cancelled") ||
        (kind === "reactivate" && current.state !== "cancelled");
      if (alreadyInRequestedState) {
        await tx.insertOperation({
          communicationId: current.id,
          ownerUserId: current.ownerUserId,
          actorUserId: userId,
          clientOperationId: input.operationId,
          action,
          requestHash: hash,
          appliedVersion: current.version,
          changed: false,
        });
        return {
          communication: asView(current, true),
          operation: {
            id: input.operationId,
            action,
            appliedVersion: current.version,
            changed: false,
            replayed: false,
          },
        };
      }

      if (kind === "reactivate" && !current.cancelledFromState) {
        throw new Error("No se puede restaurar el estado anterior de la comunicación.");
      }
      const beforeState = toState(current);
      const next =
        kind === "cancel"
          ? {
              ...current,
              state: "cancelled" as const,
              cancelledAt: await tx.currentTimestamp(),
              cancelledFromState: current.state as "draft" | "finalized",
            }
          : {
              ...current,
              state: current.cancelledFromState as "draft" | "finalized",
              cancelledAt: null,
              cancelledFromState: null,
            };
      const versionAfter = current.version + 1;
      await tx.updateCommunication(current.id, current.version, {
        ...next,
        version: versionAfter,
      });
      const auditId = await tx.appendAudit({
        communicationId: current.id,
        ownerUserId: current.ownerUserId,
        actorUserId: userId,
        operationId: input.operationId,
        action,
        versionBefore: current.version,
        versionAfter,
        beforeState,
        afterState: toState(next),
      });
      if (current.ownerUserId !== userId) {
        await tx.appendNotice({
          communicationId: current.id,
          ownerUserId: current.ownerUserId,
          auditId,
          recipientUserId: current.ownerUserId,
        });
      }
      await tx.insertOperation({
        communicationId: current.id,
        ownerUserId: current.ownerUserId,
        actorUserId: userId,
        clientOperationId: input.operationId,
        action,
        requestHash: hash,
        appliedVersion: versionAfter,
        changed: true,
      });
      const updated = await tx.findCommunication(current.id);
      if (!updated) throw new Error("No se pudo confirmar el cambio de estado.");
      return {
        communication: asView(updated, true),
        operation: {
          id: input.operationId,
          action,
          appliedVersion: versionAfter,
          changed: true,
          replayed: false,
        },
      };
    });
  }

  return {
    cancel(
      userId: string,
      input: { communicationId: string; expectedVersion: number; operationId: string },
    ) {
      return transitionCancellation(userId, input, "cancel");
    },

    reactivate(
      userId: string,
      input: { communicationId: string; expectedVersion: number; operationId: string },
    ) {
      return transitionCancellation(userId, input, "reactivate");
    },

    async list(userId: string) {
      return store.transaction(async (tx) => {
        const { roles, canEdit } = await actor(tx, userId, false);
        const records = await tx.listCommunications(roles.includes("admin") ? null : userId);
        return records.map((record) => asView(record, canEdit));
      });
    },

    async listForEpisode(userId: string, episodeId: string) {
      return store.transaction(async (tx) => {
        const { roles, canEdit } = await actor(tx, userId, false);
        const episode = await tx.findEpisode(episodeId);
        if (!episode || (episode.ownerUserId !== userId && !roles.includes("admin"))) {
          throw new Error("No se encontró el episodio.");
        }
        const records = await tx.listCommunicationsForEpisode(episodeId);
        return records.map((record) => asView(record, canEdit));
      });
    },

    async get(userId: string, communicationId: string) {
      return store.transaction(async (tx) => {
        const { roles, canEdit } = await actor(tx, userId, false);
        const record = await tx.findCommunication(communicationId);
        if (!record || !visible(record, userId, roles)) {
          throw new Error("No se encontró la comunicación.");
        }
        return asView(record, canEdit);
      });
    },

    async history(userId: string, communicationId: string) {
      return store.transaction(async (tx) => {
        const { roles } = await actor(tx, userId, false);
        const record = await tx.findCommunication(communicationId);
        if (!record || !visible(record, userId, roles)) {
          throw new Error("No se encontró la comunicación.");
        }
        return (await tx.listAudits(communicationId)).map((item) => ({
          ...item,
          occurredAt: item.occurredAt.toISOString(),
        }));
      });
    },

    async listNotices(userId: string) {
      return store.transaction(async (tx) => {
        await actor(tx, userId, false);
        return (await tx.listNotices(userId)).map(({ id, communicationId, createdAt, readAt }) => ({
          id,
          communicationId,
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
          communicationId: notice.communicationId,
          createdAt: notice.createdAt.toISOString(),
          readAt: notice.readAt?.toISOString() ?? null,
        };
      });
    },

    async create(
      userId: string,
      input: {
        clientCreationKey: string;
        episodeId: string;
        direction: EfaCommunicationDirection;
        startedAt?: string | Date | null;
        endedAt?: string | Date | null;
        priority?: EfaCommunicationPriority | null;
      },
    ) {
      if (!validDirection(input.direction))
        throw new Error("La dirección de la llamada no es válida.");
      const startedAt = parseOptionalDate(input.startedAt, "inicio");
      const endedAt = parseOptionalDate(input.endedAt, "fin");
      const priority = cleanPriority(input.priority);
      if (priority !== null && !validPriority(priority))
        throw new Error("La prioridad no es válida.");
      const hash = requestHash({
        action: "created",
        actorUserId: userId,
        clientCreationKey: input.clientCreationKey,
        episodeId: input.episodeId,
        direction: input.direction,
        startedAt: startedAt?.toISOString() ?? null,
        endedAt: endedAt?.toISOString() ?? null,
        priority,
      });
      return store.transaction(async (tx) => {
        const { roles } = await actor(tx, userId, true);
        const episode = await tx.findEpisode(input.episodeId, true);
        if (!episode || (episode.ownerUserId !== userId && !roles.includes("admin"))) {
          throw new Error("No se encontró el episodio.");
        }
        if (episode.cancelledAt)
          throw new Error("No se puede agregar una comunicación a un episodio anulado.");
        const replayExisting = async (existing: EfaCommunicationRecord | null) => {
          if (!existing) return null;
          const operation = await tx.findOperation(existing.id, input.clientCreationKey);
          assertOperation(operation, userId, "created", hash);
          return replay(existing, operation);
        };
        const prior = await replayExisting(
          await tx.findCommunicationByCreationKey(episode.ownerUserId, input.clientCreationKey),
        );
        if (prior) return prior;
        const communicationId = newId();
        const record = {
          id: communicationId,
          episodeId: episode.id,
          ownerUserId: episode.ownerUserId,
          clientCreationKey: input.clientCreationKey,
          direction: input.direction,
          startedAt,
          endedAt,
          priority,
          state: "draft" as const,
          version: 1,
          finalizedAt: null,
          cancelledAt: null,
          cancelledFromState: null,
          createdAt: new Date(0),
          updatedAt: new Date(0),
        };
        await tx.insertCommunication({
          id: communicationId,
          episodeId: episode.id,
          ownerUserId: episode.ownerUserId,
          clientCreationKey: input.clientCreationKey,
          direction: input.direction,
          startedAt,
          endedAt,
          priority,
          state: "draft",
        });
        await tx.appendAudit({
          communicationId,
          ownerUserId: episode.ownerUserId,
          actorUserId: userId,
          operationId: input.clientCreationKey,
          action: "created",
          versionBefore: null,
          versionAfter: 1,
          beforeState: null,
          afterState: toState(record),
        });
        await tx.insertOperation({
          communicationId,
          ownerUserId: episode.ownerUserId,
          actorUserId: userId,
          clientOperationId: input.clientCreationKey,
          action: "created",
          requestHash: hash,
          appliedVersion: 1,
          changed: true,
        });
        const inserted = await tx.findCommunication(communicationId);
        if (!inserted) throw new Error("No se pudo confirmar la llamada guardada.");
        return {
          communication: asView(inserted, true),
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
        communicationId: string;
        expectedVersion: number;
        operationId: string;
        direction: EfaCommunicationDirection;
        startedAt: string | Date | null;
        endedAt: string | Date | null;
        priority: EfaCommunicationPriority | null;
      },
    ) {
      if (!validDirection(input.direction))
        throw new Error("La dirección de la llamada no es válida.");
      const startedAt = parseOptionalDate(input.startedAt, "inicio");
      const endedAt = parseOptionalDate(input.endedAt, "fin");
      const priority = cleanPriority(input.priority);
      if (priority !== null && !validPriority(priority))
        throw new Error("La prioridad no es válida.");
      const hash = requestHash({
        action: "updated",
        actorUserId: userId,
        communicationId: input.communicationId,
        expectedVersion: input.expectedVersion,
        direction: input.direction,
        startedAt: startedAt?.toISOString() ?? null,
        endedAt: endedAt?.toISOString() ?? null,
        priority,
      });
      return store.transaction(async (tx) => {
        const { roles } = await actor(tx, userId, true);
        const current = await tx.findCommunication(input.communicationId, true);
        if (!current || !visible(current, userId, roles)) {
          throw new Error("No se encontró la comunicación.");
        }
        const existing = await tx.findOperation(current.id, input.operationId);
        if (existing) {
          assertOperation(existing, userId, "updated", hash);
          return replay(current, existing);
        }
        if (current.version !== input.expectedVersion) {
          throw new Error("La comunicación cambió; actualiza el historial antes de continuar.");
        }
        if (current.state === "cancelled") {
          throw new Error("La comunicación está anulada; reactivala antes de editarla.");
        }
        if (current.state === "finalized" && priority === null) {
          throw new Error("Una llamada finalizada debe conservar una prioridad válida.");
        }
        const next = {
          direction: input.direction,
          startedAt,
          endedAt,
          priority,
          state: current.state,
          finalizedAt: current.finalizedAt,
          cancelledAt: current.cancelledAt,
          cancelledFromState: current.cancelledFromState,
        };
        const beforeState = toState(current);
        const afterState = toState(next);
        const changed = JSON.stringify(beforeState) !== JSON.stringify(afterState);
        const versionAfter = changed ? current.version + 1 : current.version;
        if (!changed) {
          await tx.insertOperation({
            communicationId: current.id,
            ownerUserId: current.ownerUserId,
            actorUserId: userId,
            clientOperationId: input.operationId,
            action: "updated",
            requestHash: hash,
            appliedVersion: current.version,
            changed: false,
          });
          return {
            communication: asView(current, true),
            operation: {
              id: input.operationId,
              action: "updated" as const,
              appliedVersion: current.version,
              changed: false,
              replayed: false,
            },
          };
        }
        await tx.updateCommunication(current.id, current.version, {
          ...next,
          version: versionAfter,
        });
        const auditId = await tx.appendAudit({
          communicationId: current.id,
          ownerUserId: current.ownerUserId,
          actorUserId: userId,
          operationId: input.operationId,
          action: "updated",
          versionBefore: current.version,
          versionAfter,
          beforeState,
          afterState,
        });
        if (current.ownerUserId !== userId) {
          await tx.appendNotice({
            communicationId: current.id,
            ownerUserId: current.ownerUserId,
            auditId,
            recipientUserId: current.ownerUserId,
          });
        }
        await tx.insertOperation({
          communicationId: current.id,
          ownerUserId: current.ownerUserId,
          actorUserId: userId,
          clientOperationId: input.operationId,
          action: "updated",
          requestHash: hash,
          appliedVersion: versionAfter,
          changed: true,
        });
        const updated = await tx.findCommunication(current.id);
        if (!updated) throw new Error("No se pudo confirmar la llamada actualizada.");
        return {
          communication: asView(updated, true),
          operation: {
            id: input.operationId,
            action: "updated" as const,
            appliedVersion: versionAfter,
            changed: true,
            replayed: false,
          },
        };
      });
    },

    async finalize(
      userId: string,
      input: {
        communicationId: string;
        expectedVersion: number;
        operationId: string;
        priority: EfaCommunicationPriority;
      },
    ) {
      if (!validPriority(input.priority))
        throw new Error("La prioridad es obligatoria para finalizar la llamada.");
      const hash = requestHash({
        action: "finalized",
        actorUserId: userId,
        communicationId: input.communicationId,
        expectedVersion: input.expectedVersion,
        priority: input.priority,
      });
      return store.transaction(async (tx) => {
        const { roles } = await actor(tx, userId, true);
        const current = await tx.findCommunication(input.communicationId, true);
        if (!current || !visible(current, userId, roles)) {
          throw new Error("No se encontró la comunicación.");
        }
        const existing = await tx.findOperation(current.id, input.operationId);
        if (existing) {
          assertOperation(existing, userId, "finalized", hash);
          return replay(current, existing);
        }
        if (current.version !== input.expectedVersion) {
          throw new Error("La comunicación cambió; actualiza el historial antes de continuar.");
        }
        if (current.state === "cancelled") {
          throw new Error("La comunicación está anulada; reactivala antes de finalizarla.");
        }
        if (current.state === "finalized") {
          if (current.priority !== input.priority) {
            throw new Error(
              "La llamada ya está finalizada; corrige la prioridad mediante una edición.",
            );
          }
          await tx.insertOperation({
            communicationId: current.id,
            ownerUserId: current.ownerUserId,
            actorUserId: userId,
            clientOperationId: input.operationId,
            action: "finalized",
            requestHash: hash,
            appliedVersion: current.version,
            changed: false,
          });
          return {
            communication: asView(current, true),
            operation: {
              id: input.operationId,
              action: "finalized" as const,
              appliedVersion: current.version,
              changed: false,
              replayed: false,
            },
          };
        }
        const finalizedAt = await tx.currentTimestamp();
        const next = {
          direction: current.direction,
          startedAt: current.startedAt,
          endedAt: current.endedAt,
          priority: input.priority,
          state: "finalized" as const,
          finalizedAt,
          cancelledAt: null,
          cancelledFromState: null,
        };
        const versionAfter = current.version + 1;
        await tx.updateCommunication(current.id, current.version, {
          ...next,
          version: versionAfter,
        });
        const auditId = await tx.appendAudit({
          communicationId: current.id,
          ownerUserId: current.ownerUserId,
          actorUserId: userId,
          operationId: input.operationId,
          action: "finalized",
          versionBefore: current.version,
          versionAfter,
          beforeState: toState(current),
          afterState: toState(next),
        });
        if (current.ownerUserId !== userId) {
          await tx.appendNotice({
            communicationId: current.id,
            ownerUserId: current.ownerUserId,
            auditId,
            recipientUserId: current.ownerUserId,
          });
        }
        await tx.insertOperation({
          communicationId: current.id,
          ownerUserId: current.ownerUserId,
          actorUserId: userId,
          clientOperationId: input.operationId,
          action: "finalized",
          requestHash: hash,
          appliedVersion: versionAfter,
          changed: true,
        });
        const finalized = await tx.findCommunication(current.id);
        if (!finalized) throw new Error("No se pudo confirmar el cierre de la llamada.");
        return {
          communication: asView(finalized, true),
          operation: {
            id: input.operationId,
            action: "finalized" as const,
            appliedVersion: versionAfter,
            changed: true,
            replayed: false,
          },
        };
      });
    },
  };
}

const drizzleStore: EfaCommunicationStore = {
  async transaction(work) {
    return getDatabase().transaction(async (db) => {
      const tx: EfaCommunicationTransaction = {
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
            .select({
              id: efaEpisode.id,
              ownerUserId: efaEpisode.ownerUserId,
              cancelledAt: efaEpisode.cancelledAt,
            })
            .from(efaEpisode)
            .where(eq(efaEpisode.id, episodeId))
            .limit(1);
          if (lock) query = query.for("update") as typeof query;
          const rows = await query;
          return rows[0] ?? null;
        },
        async listCommunications(ownerUserId) {
          const query = db.select().from(efaCommunication);
          const rows = ownerUserId
            ? await query
                .where(eq(efaCommunication.ownerUserId, ownerUserId))
                .orderBy(desc(efaCommunication.createdAt))
            : await query.orderBy(desc(efaCommunication.createdAt));
          return rows as EfaCommunicationRecord[];
        },
        async listCommunicationsForEpisode(episodeId) {
          const rows = await db
            .select()
            .from(efaCommunication)
            .where(eq(efaCommunication.episodeId, episodeId))
            .orderBy(desc(efaCommunication.createdAt));
          return rows as EfaCommunicationRecord[];
        },
        async findCommunication(communicationId, lock = false) {
          let query = db
            .select()
            .from(efaCommunication)
            .where(eq(efaCommunication.id, communicationId))
            .limit(1);
          if (lock) query = query.for("update") as typeof query;
          const rows = await query;
          return (rows[0] as EfaCommunicationRecord | undefined) ?? null;
        },
        async findCommunicationByCreationKey(ownerUserId, clientCreationKey) {
          const rows = await db
            .select()
            .from(efaCommunication)
            .where(
              and(
                eq(efaCommunication.ownerUserId, ownerUserId),
                eq(efaCommunication.clientCreationKey, clientCreationKey),
              ),
            )
            .limit(1);
          return (rows[0] as EfaCommunicationRecord | undefined) ?? null;
        },
        async findOperation(communicationId, clientOperationId) {
          const rows = await db
            .select()
            .from(efaCommunicationOperation)
            .where(
              and(
                eq(efaCommunicationOperation.communicationId, communicationId),
                eq(efaCommunicationOperation.clientOperationId, clientOperationId),
              ),
            )
            .limit(1);
          return (rows[0] as EfaCommunicationOperationRecord | undefined) ?? null;
        },
        async currentTimestamp() {
          const result = await db.execute<{ now: Date | string }>(sql`select now() as now`);
          const value = result.rows[0]?.now;
          const parsed = value instanceof Date ? value : new Date(value ?? Number.NaN);
          if (!Number.isFinite(parsed.getTime()))
            throw new Error("No se pudo obtener la hora del servidor.");
          return parsed;
        },
        async insertCommunication(input) {
          await db.insert(efaCommunication).values(input);
        },
        async updateCommunication(communicationId, expectedVersion, next) {
          const rows = await db
            .update(efaCommunication)
            .set({ ...next, updatedAt: sql`now()` })
            .where(
              and(
                eq(efaCommunication.id, communicationId),
                eq(efaCommunication.version, expectedVersion),
              ),
            )
            .returning({ id: efaCommunication.id });
          if (!rows.length)
            throw new Error("La comunicación cambió; actualiza el historial antes de continuar.");
        },
        async appendAudit(input) {
          const rows = await db
            .insert(efaCommunicationAudit)
            .values(input)
            .returning({ id: efaCommunicationAudit.id });
          if (!rows[0]) throw new Error("No se pudo confirmar el historial de la llamada.");
          return rows[0].id;
        },
        async insertOperation(input) {
          await db.insert(efaCommunicationOperation).values(input);
        },
        async appendNotice(input) {
          await db.insert(efaCommunicationNotice).values(input);
        },
        async listAudits(communicationId) {
          const rows = await db
            .select()
            .from(efaCommunicationAudit)
            .where(eq(efaCommunicationAudit.communicationId, communicationId))
            .orderBy(asc(efaCommunicationAudit.versionAfter));
          return rows as unknown as EfaCommunicationAuditRecord[];
        },
        async listNotices(recipientUserId) {
          return db
            .select()
            .from(efaCommunicationNotice)
            .where(eq(efaCommunicationNotice.recipientUserId, recipientUserId))
            .orderBy(desc(efaCommunicationNotice.createdAt));
        },
        async markNoticeRead(noticeId, recipientUserId) {
          const updated = await db
            .update(efaCommunicationNotice)
            .set({ readAt: sql`coalesce(${efaCommunicationNotice.readAt}, now())` })
            .where(
              and(
                eq(efaCommunicationNotice.id, noticeId),
                eq(efaCommunicationNotice.recipientUserId, recipientUserId),
                isNull(efaCommunicationNotice.readAt),
              ),
            )
            .returning();
          if (updated[0]) return updated[0];
          const existing = await db
            .select()
            .from(efaCommunicationNotice)
            .where(
              and(
                eq(efaCommunicationNotice.id, noticeId),
                eq(efaCommunicationNotice.recipientUserId, recipientUserId),
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

export const efaCommunications = createEfaCommunicationsService(drizzleStore);
