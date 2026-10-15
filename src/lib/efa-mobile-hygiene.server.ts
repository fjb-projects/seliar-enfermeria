import { createHash } from "node:crypto";
import { z } from "zod";
import { effectiveRoles, type AccountRole } from "./access";

/** Manual times may be slightly ahead of the database clock because browsers and servers drift. */
export const hygieneFutureToleranceMs = 5 * 60_000;
export const hygieneNoteMaxLength = 300;

type Actor = { isActive: boolean; roles: AccountRole[] };

export type MobileHygieneRecord = {
  id: string;
  guardId: string;
  baseId: string;
  baseNameSnapshot: string;
  requestedAt: Date;
  availableAt: Date | null;
  notInformed: boolean;
  note: string | null;
  deletedAt: Date | null;
  clientCreationKey: string;
  version: number;
  createdByUserId: string;
  createdAt: Date;
  updatedAt: Date;
};
export type MobileHygieneState = {
  requestedAt: string;
  availableAt: string | null;
  notInformed: boolean;
  note: string | null;
  deletedAt: string | null;
};
export type MobileHygieneAudit = {
  id: string;
  periodId: string;
  guardId: string;
  actorUserId: string;
  operationId: string;
  action: "created" | "updated" | "available" | "deleted" | "not_informed";
  versionBefore: number | null;
  versionAfter: number;
  beforeState: MobileHygieneState | null;
  afterState: MobileHygieneState;
  occurredAt: Date;
};
export type MobileHygieneOperation = {
  periodId: string;
  guardId: string;
  actorUserId: string;
  clientOperationId: string;
  action: "created" | "updated" | "available" | "deleted";
  requestHash: string;
  appliedVersion: number;
  changed: boolean;
};
type EditableFields = Pick<
  MobileHygieneRecord,
  "requestedAt" | "availableAt" | "notInformed" | "note" | "deletedAt" | "version"
>;

export interface MobileHygieneTransaction {
  findActor(userId: string): Promise<Actor | null>;
  findGuard(
    guardId: string,
    lock?: boolean,
  ): Promise<{ id: string; ownerUserId: string; startedAt: Date; endedAt: Date | null } | null>;
  findSelectedBase(guardId: string, baseId: string): Promise<{ id: string; name: string } | null>;
  findPeriod(periodId: string, lock?: boolean): Promise<MobileHygieneRecord | null>;
  /** The open period of a mobile: no available time, not deleted and not flagged "not informed". */
  findOpenForBase(
    guardId: string,
    baseId: string,
    lock?: boolean,
  ): Promise<MobileHygieneRecord | null>;
  findByCreationKey(
    guardId: string,
    creationKey: string,
    lock?: boolean,
  ): Promise<MobileHygieneRecord | null>;
  findOperation(guardId: string, operationId: string): Promise<MobileHygieneOperation | null>;
  listForGuard(guardId: string): Promise<MobileHygieneRecord[]>;
  listAudit(periodId: string): Promise<MobileHygieneAudit[]>;
  insertPeriod(record: Omit<MobileHygieneRecord, "createdAt" | "updatedAt">): Promise<void>;
  updatePeriod(periodId: string, expectedVersion: number, fields: EditableFields): Promise<void>;
  appendAudit(record: Omit<MobileHygieneAudit, "id" | "occurredAt">): Promise<void>;
  insertOperation(record: MobileHygieneOperation): Promise<void>;
  databaseNow(): Promise<unknown>;
}
export interface MobileHygieneStore {
  transaction<T>(work: (tx: MobileHygieneTransaction) => Promise<T>): Promise<T>;
}

const newId = () => crypto.randomUUID();
const canonical = (value: unknown): unknown => {
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === "object")
    return Object.fromEntries(
      Object.entries(value)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, entry]) => [key, canonical(entry)]),
    );
  return value;
};
const requestHash = (value: unknown) =>
  createHash("sha256")
    .update(JSON.stringify(canonical(value)))
    .digest("hex");

const explicitTimestamp = z.iso.datetime({ offset: true });
function parseTimestamp(value: string, label: string): Date {
  if (!explicitTimestamp.safeParse(value).success)
    throw new Error(`${label} debe incluir fecha, hora y zona horaria.`);
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) throw new Error(`${label} no es válida.`);
  return date;
}

function databaseTimestamp(value: unknown) {
  const date = value instanceof Date ? value : typeof value === "string" ? new Date(value) : null;
  if (!date || !Number.isFinite(date.getTime()))
    throw new Error("No se pudo obtener una hora válida de la base de datos.");
  return date;
}

function normalizeNote(note: string | null | undefined): string | null {
  const trimmed = note?.trim() ?? "";
  if (!trimmed) return null;
  if (trimmed.length > hygieneNoteMaxLength)
    throw new Error(`La nota no puede superar ${hygieneNoteMaxLength} caracteres.`);
  return trimmed;
}

export const hygieneAuditState = (
  period: Pick<
    MobileHygieneRecord,
    "requestedAt" | "availableAt" | "notInformed" | "note" | "deletedAt"
  >,
): MobileHygieneState => ({
  requestedAt: period.requestedAt.toISOString(),
  availableAt: period.availableAt?.toISOString() ?? null,
  notInformed: period.notInformed,
  note: period.note,
  deletedAt: period.deletedAt?.toISOString() ?? null,
});

const view = (period: MobileHygieneRecord, canEdit: boolean) => ({
  ...period,
  requestedAt: period.requestedAt.toISOString(),
  availableAt: period.availableAt?.toISOString() ?? null,
  deletedAt: period.deletedAt?.toISOString() ?? null,
  createdAt: period.createdAt.toISOString(),
  updatedAt: period.updatedAt.toISOString(),
  canEdit,
});
const visible = (owner: string, user: string, roles: readonly AccountRole[]) =>
  owner === user || roles.includes("admin");

function assertOperation(
  operation: MobileHygieneOperation | null,
  actorUserId: string,
  action: MobileHygieneOperation["action"],
  hash: string,
) {
  if (!operation) return;
  if (
    operation.actorUserId !== actorUserId ||
    operation.action !== action ||
    operation.requestHash !== hash
  )
    throw new Error("La operación ya fue procesada con otros datos.");
}

/** An explicit time must fall between the guard start and the database clock (plus drift). */
function assertWithinGuardWindow(
  guard: { startedAt: Date; endedAt: Date | null },
  value: Date,
  now: Date,
  label: string,
) {
  if (value.getTime() < guard.startedAt.getTime())
    throw new Error(`${label} no puede ser anterior al inicio de la guardia.`);
  const limit = guard.endedAt ?? new Date(now.getTime() + hygieneFutureToleranceMs);
  if (value.getTime() > limit.getTime())
    throw new Error(`${label} no puede ser posterior a la hora actual.`);
}

export function createEfaMobileHygieneService(
  store: MobileHygieneStore,
  deps: { newId?: () => string } = {},
) {
  const id = deps.newId ?? newId;
  const notFound = "No se encontró el período de higiene.";
  const staleVersion = "El período cambió; actualiza la lista antes de continuar.";

  async function access(tx: MobileHygieneTransaction, userId: string, write: boolean) {
    const actor = await tx.findActor(userId);
    if (!actor?.isActive) throw new Error("La cuenta está inactiva.");
    const roles = effectiveRoles(actor.roles);
    if (write && !roles.includes("efa")) throw new Error("Se requiere acceso EFA vigente.");
    return { roles, canWrite: roles.includes("efa") };
  }

  async function ownedGuard(
    tx: MobileHygieneTransaction,
    userId: string,
    guardId: string,
    lock: boolean,
  ) {
    const guard = await tx.findGuard(guardId, lock);
    if (!guard) throw new Error("No se encontró la guardia.");
    if (guard.ownerUserId !== userId) throw new Error("La guardia no pertenece a la cuenta.");
    return guard;
  }

  function assertOpen(guard: { endedAt: Date | null }) {
    if (guard.endedAt) throw new Error("No se puede modificar una guardia finalizada.");
  }

  async function assertSelected(tx: MobileHygieneTransaction, guardId: string, baseId: string) {
    if (!(await tx.findSelectedBase(guardId, baseId)))
      throw new Error("La base ya no está seleccionada en esta guardia.");
  }

  async function lockedPeriod(tx: MobileHygieneTransaction, userId: string, periodId: string) {
    const initial = await tx.findPeriod(periodId);
    if (!initial) throw new Error(notFound);
    const guard = await ownedGuard(tx, userId, initial.guardId, true);
    const current = await tx.findPeriod(initial.id, true);
    if (!current) throw new Error(notFound);
    return { guard, current };
  }

  const receipt = (
    operation: Pick<
      MobileHygieneOperation,
      "clientOperationId" | "action" | "appliedVersion" | "changed"
    >,
    replayed: boolean,
  ) => ({
    id: operation.clientOperationId,
    action: operation.action,
    appliedVersion: operation.appliedVersion,
    changed: operation.changed,
    replayed,
  });

  async function replayResult(
    tx: MobileHygieneTransaction,
    operation: MobileHygieneOperation,
    canEdit: boolean,
  ) {
    const period = await tx.findPeriod(operation.periodId);
    if (!period) throw new Error("No se pudo confirmar el período de higiene.");
    return {
      period: view(period, canEdit && period.deletedAt === null && !period.notInformed),
      operation: receipt(operation, true),
    };
  }

  async function saveOperation(
    tx: MobileHygieneTransaction,
    period: Pick<MobileHygieneRecord, "id" | "guardId">,
    actorUserId: string,
    operationId: string,
    action: MobileHygieneOperation["action"],
    hash: string,
    version: number,
    changed: boolean,
  ) {
    const operation = {
      periodId: period.id,
      guardId: period.guardId,
      actorUserId,
      clientOperationId: operationId,
      action,
      requestHash: hash,
      appliedVersion: version,
      changed,
    } satisfies MobileHygieneOperation;
    await tx.insertOperation(operation);
    return operation;
  }

  async function savedResult(
    tx: MobileHygieneTransaction,
    periodId: string,
    operation: MobileHygieneOperation,
    canEdit: boolean,
  ) {
    const saved = await tx.findPeriod(periodId);
    if (!saved) throw new Error("No se pudo confirmar el período de higiene.");
    return {
      period: view(saved, canEdit),
      operation: receipt(operation, false),
    };
  }

  return {
    async listForGuard(userId: string, guardId: string) {
      return store.transaction(async (tx) => {
        const permission = await access(tx, userId, false);
        const guard = await tx.findGuard(guardId);
        if (!guard || !visible(guard.ownerUserId, userId, permission.roles))
          throw new Error("No se encontró la guardia.");
        const periods = (await tx.listForGuard(guardId)).filter(
          (period) => period.deletedAt === null,
        );
        return Promise.all(
          periods.map(async (period) =>
            view(
              period,
              permission.canWrite &&
                guard.ownerUserId === userId &&
                guard.endedAt === null &&
                !period.notInformed &&
                (await tx.findSelectedBase(guardId, period.baseId)) !== null,
            ),
          ),
        );
      });
    },

    /** Opens a period: the mobile asked by radio for hygiene and restocking. */
    async request(
      userId: string,
      input: {
        guardId: string;
        baseId: string;
        clientCreationKey: string;
        operationId: string;
        requestedAt?: string | undefined;
      },
    ) {
      const explicitRequestedAt =
        input.requestedAt === undefined
          ? undefined
          : parseTimestamp(input.requestedAt, "La hora de la solicitud");
      const hash = requestHash({
        actor: userId,
        action: "created",
        guardId: input.guardId,
        baseId: input.baseId,
        clientCreationKey: input.clientCreationKey,
        requestedAt: explicitRequestedAt,
      });
      return store.transaction(async (tx) => {
        const permission = await access(tx, userId, true);
        const guard = await ownedGuard(tx, userId, input.guardId, true);
        const priorOperation = await tx.findOperation(guard.id, input.operationId);
        if (priorOperation) {
          assertOperation(priorOperation, userId, "created", hash);
          const selected = await tx.findSelectedBase(guard.id, input.baseId);
          return replayResult(
            tx,
            priorOperation,
            permission.canWrite && guard.endedAt === null && selected !== null,
          );
        }

        const priorCreation = await tx.findByCreationKey(guard.id, input.clientCreationKey, true);
        if (priorCreation) {
          const originalAudit = (await tx.listAudit(priorCreation.id)).find(
            (audit) => audit.action === "created",
          );
          const originalOperation = originalAudit
            ? await tx.findOperation(guard.id, originalAudit.operationId)
            : null;
          if (
            priorCreation.baseId !== input.baseId ||
            !originalOperation ||
            originalOperation.actorUserId !== userId ||
            originalOperation.action !== "created" ||
            originalOperation.requestHash !== hash
          )
            throw new Error("La clave de creación ya se usó con otros datos.");
          const operation = await saveOperation(
            tx,
            priorCreation,
            userId,
            input.operationId,
            "created",
            hash,
            priorCreation.version,
            false,
          );
          return replayResult(
            tx,
            operation,
            permission.canWrite &&
              guard.endedAt === null &&
              (await tx.findSelectedBase(guard.id, priorCreation.baseId)) !== null,
          );
        }

        assertOpen(guard);
        const selectedBase = await tx.findSelectedBase(guard.id, input.baseId);
        if (!selectedBase) throw new Error("La base no está seleccionada en esta guardia.");
        if (await tx.findOpenForBase(guard.id, input.baseId, true))
          throw new Error("Ya hay una solicitud de higiene abierta para este móvil.");

        const now = databaseTimestamp(await tx.databaseNow());
        const requestedAt = explicitRequestedAt ?? now;
        if (explicitRequestedAt)
          assertWithinGuardWindow(guard, explicitRequestedAt, now, "La hora de la solicitud");

        const record: Omit<MobileHygieneRecord, "createdAt" | "updatedAt"> = {
          id: id(),
          guardId: guard.id,
          baseId: selectedBase.id,
          baseNameSnapshot: selectedBase.name,
          requestedAt,
          availableAt: null,
          notInformed: false,
          note: null,
          deletedAt: null,
          clientCreationKey: input.clientCreationKey,
          version: 1,
          createdByUserId: userId,
        };
        await tx.insertPeriod(record);
        await tx.appendAudit({
          periodId: record.id,
          guardId: record.guardId,
          actorUserId: userId,
          operationId: input.operationId,
          action: "created",
          versionBefore: null,
          versionAfter: 1,
          beforeState: null,
          afterState: hygieneAuditState(record),
        });
        const operation = await saveOperation(
          tx,
          record,
          userId,
          input.operationId,
          "created",
          hash,
          1,
          true,
        );
        return savedResult(tx, record.id, operation, true);
      });
    },

    /** Closes the open period: the mobile was declared available again by handheld radio. */
    async markAvailable(
      userId: string,
      input: {
        periodId: string;
        expectedVersion: number;
        operationId: string;
        availableAt?: string | undefined;
      },
    ) {
      const explicitAvailableAt =
        input.availableAt === undefined
          ? undefined
          : parseTimestamp(input.availableAt, "La hora de disponible");
      return store.transaction(async (tx) => {
        await access(tx, userId, true);
        const { guard, current } = await lockedPeriod(tx, userId, input.periodId);
        const hash = requestHash({
          actor: userId,
          action: "available",
          periodId: input.periodId,
          expectedVersion: input.expectedVersion,
          availableAt: explicitAvailableAt,
        });
        const priorOperation = await tx.findOperation(guard.id, input.operationId);
        if (priorOperation) {
          assertOperation(priorOperation, userId, "available", hash);
          const selected = await tx.findSelectedBase(guard.id, current.baseId);
          return replayResult(tx, priorOperation, guard.endedAt === null && selected !== null);
        }
        assertOpen(guard);
        await assertSelected(tx, guard.id, current.baseId);
        if (current.deletedAt) throw new Error("El período de higiene fue eliminado.");
        if (current.version !== input.expectedVersion) throw new Error(staleVersion);
        if (current.notInformed) throw new Error("El período quedó como no informado.");
        if (current.availableAt) throw new Error("El móvil ya figura como disponible.");

        const now = databaseTimestamp(await tx.databaseNow());
        const availableAt = explicitAvailableAt ?? now;
        if (explicitAvailableAt)
          assertWithinGuardWindow(guard, explicitAvailableAt, now, "La hora de disponible");
        if (availableAt.getTime() < current.requestedAt.getTime())
          throw new Error("La hora de disponible no puede ser anterior a la solicitud.");

        const version = current.version + 1;
        const next = { ...current, availableAt, version };
        await tx.updatePeriod(current.id, current.version, {
          requestedAt: current.requestedAt,
          availableAt,
          notInformed: false,
          note: current.note,
          deletedAt: null,
          version,
        });
        await tx.appendAudit({
          periodId: current.id,
          guardId: current.guardId,
          actorUserId: userId,
          operationId: input.operationId,
          action: "available",
          versionBefore: current.version,
          versionAfter: version,
          beforeState: hygieneAuditState(current),
          afterState: hygieneAuditState(next),
        });
        const operation = await saveOperation(
          tx,
          current,
          userId,
          input.operationId,
          "available",
          hash,
          version,
          true,
        );
        return savedResult(tx, current.id, operation, true);
      });
    },

    /** Corrects the times or the note of a period (radio calls are often logged after the fact). */
    async update(
      userId: string,
      input: {
        periodId: string;
        expectedVersion: number;
        operationId: string;
        requestedAt: string;
        availableAt: string | null;
        note?: string | null | undefined;
      },
    ) {
      const requestedAt = parseTimestamp(input.requestedAt, "La hora de la solicitud");
      const availableAt =
        input.availableAt === null
          ? null
          : parseTimestamp(input.availableAt, "La hora de disponible");
      const note = normalizeNote(input.note);
      return store.transaction(async (tx) => {
        await access(tx, userId, true);
        const { guard, current } = await lockedPeriod(tx, userId, input.periodId);
        const hash = requestHash({
          actor: userId,
          action: "updated",
          periodId: input.periodId,
          expectedVersion: input.expectedVersion,
          requestedAt,
          availableAt,
          note,
        });
        const priorOperation = await tx.findOperation(guard.id, input.operationId);
        if (priorOperation) {
          assertOperation(priorOperation, userId, "updated", hash);
          const selected = await tx.findSelectedBase(guard.id, current.baseId);
          return replayResult(tx, priorOperation, guard.endedAt === null && selected !== null);
        }
        assertOpen(guard);
        await assertSelected(tx, guard.id, current.baseId);
        if (current.deletedAt) throw new Error("El período de higiene fue eliminado.");
        if (current.version !== input.expectedVersion) throw new Error(staleVersion);
        if (current.notInformed) throw new Error("El período quedó como no informado.");
        if (current.availableAt && !availableAt)
          throw new Error(
            "No se puede quitar la hora de disponible; elimina el período y registra uno nuevo.",
          );
        if (availableAt && availableAt.getTime() < requestedAt.getTime())
          throw new Error("La hora de disponible no puede ser anterior a la solicitud.");

        const requestedChanged = requestedAt.getTime() !== current.requestedAt.getTime();
        const availableChanged = availableAt?.getTime() !== current.availableAt?.getTime();
        if (requestedChanged || availableChanged) {
          const now = databaseTimestamp(await tx.databaseNow());
          if (requestedChanged)
            assertWithinGuardWindow(guard, requestedAt, now, "La hora de la solicitud");
          if (availableAt && availableChanged)
            assertWithinGuardWindow(guard, availableAt, now, "La hora de disponible");
        }

        const changed = requestedChanged || availableChanged || note !== current.note;
        const version = current.version + (changed ? 1 : 0);
        if (changed) {
          const next = { ...current, requestedAt, availableAt, note, version };
          await tx.updatePeriod(current.id, current.version, {
            requestedAt,
            availableAt,
            notInformed: false,
            note,
            deletedAt: null,
            version,
          });
          await tx.appendAudit({
            periodId: current.id,
            guardId: current.guardId,
            actorUserId: userId,
            operationId: input.operationId,
            action: "updated",
            versionBefore: current.version,
            versionAfter: version,
            beforeState: hygieneAuditState(current),
            afterState: hygieneAuditState(next),
          });
        }
        const operation = await saveOperation(
          tx,
          current,
          userId,
          input.operationId,
          "updated",
          hash,
          version,
          changed,
        );
        return savedResult(tx, current.id, operation, true);
      });
    },

    /** Soft-deletes a period; an open period frees the mobile for a new request. */
    async delete(
      userId: string,
      input: { periodId: string; expectedVersion: number; operationId: string },
    ) {
      return store.transaction(async (tx) => {
        await access(tx, userId, true);
        const { guard, current } = await lockedPeriod(tx, userId, input.periodId);
        const hash = requestHash({
          actor: userId,
          action: "deleted",
          periodId: input.periodId,
          expectedVersion: input.expectedVersion,
        });
        const priorOperation = await tx.findOperation(guard.id, input.operationId);
        if (priorOperation) {
          assertOperation(priorOperation, userId, "deleted", hash);
          return replayResult(tx, priorOperation, false);
        }
        assertOpen(guard);
        await assertSelected(tx, guard.id, current.baseId);
        if (current.deletedAt) throw new Error("El período de higiene ya fue eliminado.");
        if (current.version !== input.expectedVersion) throw new Error(staleVersion);

        const deletedAt = databaseTimestamp(await tx.databaseNow());
        const version = current.version + 1;
        const next = { ...current, deletedAt, version };
        await tx.updatePeriod(current.id, current.version, {
          requestedAt: current.requestedAt,
          availableAt: current.availableAt,
          notInformed: current.notInformed,
          note: current.note,
          deletedAt,
          version,
        });
        await tx.appendAudit({
          periodId: current.id,
          guardId: current.guardId,
          actorUserId: userId,
          operationId: input.operationId,
          action: "deleted",
          versionBefore: current.version,
          versionAfter: version,
          beforeState: hygieneAuditState(current),
          afterState: hygieneAuditState(next),
        });
        const operation = await saveOperation(
          tx,
          current,
          userId,
          input.operationId,
          "deleted",
          hash,
          version,
          true,
        );
        return savedResult(tx, current.id, operation, false);
      });
    },
  };
}
