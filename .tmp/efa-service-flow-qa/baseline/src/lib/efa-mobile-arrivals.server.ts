import { createHash } from "node:crypto";
import { z } from "zod";
import { effectiveRoles, type AccountRole } from "./access";

export const mobileArrivalRoles = ["nurse", "driver", "doctor"] as const;
export type MobileArrivalRole = (typeof mobileArrivalRoles)[number];
type Actor = { isActive: boolean; roles: AccountRole[] };

export type MobileArrivalRecord = {
  id: string;
  guardId: string;
  baseId: string;
  baseNameSnapshot: string;
  role: MobileArrivalRole;
  arrivedAt: Date;
  deletedAt: Date | null;
  clientCreationKey: string;
  version: number;
  createdByUserId: string;
  createdAt: Date;
  updatedAt: Date;
};
export type MobileArrivalAudit = {
  id: string;
  arrivalId: string;
  guardId: string;
  actorUserId: string;
  operationId: string;
  action: "created" | "updated" | "deleted" | "restored";
  versionBefore: number | null;
  versionAfter: number;
  beforeState: { arrivedAt: string; deletedAt: string | null } | null;
  afterState: { arrivedAt: string; deletedAt: string | null };
  occurredAt: Date;
};
export type MobileArrivalOperation = {
  arrivalId: string;
  guardId: string;
  actorUserId: string;
  clientOperationId: string;
  action: "created" | "updated" | "deleted";
  requestHash: string;
  appliedVersion: number;
  changed: boolean;
};

export interface MobileArrivalTransaction {
  findActor(userId: string): Promise<Actor | null>;
  findGuard(
    guardId: string,
    lock?: boolean,
  ): Promise<{ id: string; ownerUserId: string; endedAt: Date | null } | null>;
  findSelectedBase(guardId: string, baseId: string): Promise<{ id: string; name: string } | null>;
  findArrival(arrivalId: string, lock?: boolean): Promise<MobileArrivalRecord | null>;
  findArrivalByKey(
    guardId: string,
    baseId: string,
    role: MobileArrivalRole,
    lock?: boolean,
  ): Promise<MobileArrivalRecord | null>;
  findByCreationKey(
    guardId: string,
    creationKey: string,
    lock?: boolean,
  ): Promise<MobileArrivalRecord | null>;
  findOperation(guardId: string, operationId: string): Promise<MobileArrivalOperation | null>;
  listForGuard(guardId: string): Promise<MobileArrivalRecord[]>;
  listAudit(arrivalId: string): Promise<MobileArrivalAudit[]>;
  insertArrival(record: Omit<MobileArrivalRecord, "createdAt" | "updatedAt">): Promise<void>;
  updateArrival(
    arrivalId: string,
    expectedVersion: number,
    fields: Pick<MobileArrivalRecord, "arrivedAt" | "deletedAt" | "version">,
  ): Promise<void>;
  appendAudit(record: Omit<MobileArrivalAudit, "id" | "occurredAt">): Promise<void>;
  insertOperation(record: MobileArrivalOperation): Promise<void>;
  databaseNow(): Promise<unknown>;
}
export interface MobileArrivalStore {
  transaction<T>(work: (tx: MobileArrivalTransaction) => Promise<T>): Promise<T>;
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

const explicitArrivalTimestamp = z.iso.datetime({ offset: true });
function parseArrivalAt(value: string | undefined, fallback?: Date): Date {
  if (value === undefined) {
    if (fallback && Number.isFinite(fallback.getTime())) return fallback;
    throw new Error("No se pudo obtener una hora válida de la base de datos.");
  }
  if (!explicitArrivalTimestamp.safeParse(value).success) {
    throw new Error("La hora de ingreso debe incluir fecha, hora y zona horaria.");
  }
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) throw new Error("La hora de ingreso no es válida.");
  return date;
}
const state = (arrival: Pick<MobileArrivalRecord, "arrivedAt" | "deletedAt">) => ({
  arrivedAt: arrival.arrivedAt.toISOString(),
  deletedAt: arrival.deletedAt?.toISOString() ?? null,
});
const view = (arrival: MobileArrivalRecord, canEdit: boolean) => ({
  ...arrival,
  arrivedAt: arrival.arrivedAt.toISOString(),
  deletedAt: arrival.deletedAt?.toISOString() ?? null,
  createdAt: arrival.createdAt.toISOString(),
  updatedAt: arrival.updatedAt.toISOString(),
  canEdit,
});
const visible = (owner: string, user: string, roles: readonly AccountRole[]) =>
  owner === user || roles.includes("admin");

function assertOperation(
  operation: MobileArrivalOperation | null,
  actorUserId: string,
  action: MobileArrivalOperation["action"],
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

function databaseTimestamp(value: unknown) {
  const date = value instanceof Date ? value : typeof value === "string" ? new Date(value) : null;
  if (!date || !Number.isFinite(date.getTime()))
    throw new Error("No se pudo obtener una hora válida de la base de datos.");
  return date;
}

export function createEfaMobileArrivalService(
  store: MobileArrivalStore,
  deps: { newId?: () => string } = {},
) {
  const id = deps.newId ?? newId;

  async function access(tx: MobileArrivalTransaction, userId: string, write: boolean) {
    const actor = await tx.findActor(userId);
    if (!actor?.isActive) throw new Error("La cuenta está inactiva.");
    const roles = effectiveRoles(actor.roles);
    if (write && !roles.includes("efa")) throw new Error("Se requiere acceso EFA vigente.");
    return { roles, canWrite: roles.includes("efa") };
  }

  async function ownedGuard(
    tx: MobileArrivalTransaction,
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

  async function findOperationResult(
    tx: MobileArrivalTransaction,
    operation: MobileArrivalOperation,
    canEdit: boolean,
  ) {
    const arrival = await tx.findArrival(operation.arrivalId);
    if (!arrival) throw new Error("No se pudo confirmar la marca de ingreso.");
    return {
      arrival: view(arrival, canEdit && arrival.deletedAt === null),
      operation: {
        id: operation.clientOperationId,
        action: operation.action,
        appliedVersion: operation.appliedVersion,
        changed: operation.changed,
        replayed: true,
      },
    };
  }

  async function saveOperation(
    tx: MobileArrivalTransaction,
    arrival: MobileArrivalRecord,
    actorUserId: string,
    operationId: string,
    action: MobileArrivalOperation["action"],
    hash: string,
    version: number,
    changed: boolean,
  ) {
    const operation = {
      arrivalId: arrival.id,
      guardId: arrival.guardId,
      actorUserId,
      clientOperationId: operationId,
      action,
      requestHash: hash,
      appliedVersion: version,
      changed,
    } satisfies MobileArrivalOperation;
    await tx.insertOperation(operation);
    return operation;
  }

  return {
    async listForGuard(userId: string, guardId: string) {
      return store.transaction(async (tx) => {
        const permission = await access(tx, userId, false);
        const guard = await tx.findGuard(guardId);
        if (!guard || !visible(guard.ownerUserId, userId, permission.roles))
          throw new Error("No se encontró la guardia.");
        const arrivals = await tx.listForGuard(guardId);
        return Promise.all(
          arrivals.map(async (arrival) => {
            const selected = await tx.findSelectedBase(guardId, arrival.baseId);
            return view(
              arrival,
              permission.canWrite &&
                guard.ownerUserId === userId &&
                guard.endedAt === null &&
                arrival.deletedAt === null &&
                selected !== null,
            );
          }),
        );
      });
    },

    async history(userId: string, arrivalId: string) {
      return store.transaction(async (tx) => {
        const permission = await access(tx, userId, false);
        const arrival = await tx.findArrival(arrivalId);
        if (!arrival) throw new Error("No se encontró la marca de ingreso.");
        const guard = await tx.findGuard(arrival.guardId);
        if (!guard || !visible(guard.ownerUserId, userId, permission.roles))
          throw new Error("No se encontró la marca de ingreso.");
        return (await tx.listAudit(arrival.id)).map((audit) => ({
          ...audit,
          occurredAt: audit.occurredAt.toISOString(),
        }));
      });
    },

    async create(
      userId: string,
      input: {
        guardId: string;
        baseId: string;
        role: string;
        clientCreationKey: string;
        operationId: string;
        arrivedAt?: string | undefined;
      },
    ) {
      if (!mobileArrivalRoles.includes(input.role as MobileArrivalRole))
        throw new Error("El rol del móvil no es válido.");
      const role = input.role as MobileArrivalRole;
      const explicitArrivedAt =
        input.arrivedAt === undefined ? undefined : parseArrivalAt(input.arrivedAt);
      const hash = requestHash({
        actor: userId,
        action: "created",
        guardId: input.guardId,
        baseId: input.baseId,
        role,
        clientCreationKey: input.clientCreationKey,
        arrivedAt: explicitArrivedAt,
      });
      return store.transaction(async (tx) => {
        const permission = await access(tx, userId, true);
        const guard = await ownedGuard(tx, userId, input.guardId, true);
        const priorOperation = await tx.findOperation(guard.id, input.operationId);
        if (priorOperation) {
          assertOperation(priorOperation, userId, "created", hash);
          const selected = await tx.findSelectedBase(guard.id, input.baseId);
          return findOperationResult(
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
            priorCreation.role !== role ||
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
          return findOperationResult(
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
        const existing = await tx.findArrivalByKey(guard.id, input.baseId, role, true);
        if (existing && existing.deletedAt === null)
          throw new Error("Ya existe una marca de ingreso para ese móvil y rol.");

        const arrivedAt = explicitArrivedAt ?? databaseTimestamp(await tx.databaseNow());
        if (existing) {
          const nextVersion = existing.version + 1;
          await tx.updateArrival(existing.id, existing.version, {
            arrivedAt,
            deletedAt: null,
            version: nextVersion,
          });
          const restored = { ...existing, arrivedAt, deletedAt: null, version: nextVersion };
          await tx.appendAudit({
            arrivalId: existing.id,
            guardId: existing.guardId,
            actorUserId: userId,
            operationId: input.operationId,
            action: "restored",
            versionBefore: existing.version,
            versionAfter: nextVersion,
            beforeState: state(existing),
            afterState: state(restored),
          });
          const operation = await saveOperation(
            tx,
            restored,
            userId,
            input.operationId,
            "created",
            hash,
            nextVersion,
            true,
          );
          const saved = await tx.findArrival(existing.id);
          if (!saved) throw new Error("No se pudo confirmar la marca de ingreso.");
          return {
            arrival: view(saved, true),
            operation: {
              id: operation.clientOperationId,
              action: operation.action,
              appliedVersion: operation.appliedVersion,
              changed: operation.changed,
              replayed: false,
            },
          };
        }

        const record: Omit<MobileArrivalRecord, "createdAt" | "updatedAt"> = {
          id: id(),
          guardId: guard.id,
          baseId: selectedBase.id,
          baseNameSnapshot: selectedBase.name,
          role,
          arrivedAt,
          deletedAt: null,
          clientCreationKey: input.clientCreationKey,
          version: 1,
          createdByUserId: userId,
        };
        await tx.insertArrival(record);
        await tx.appendAudit({
          arrivalId: record.id,
          guardId: record.guardId,
          actorUserId: userId,
          operationId: input.operationId,
          action: "created",
          versionBefore: null,
          versionAfter: 1,
          beforeState: null,
          afterState: state(record),
        });
        const operation = await saveOperation(
          tx,
          { ...record, createdAt: new Date(0), updatedAt: new Date(0) },
          userId,
          input.operationId,
          "created",
          hash,
          1,
          true,
        );
        const saved = await tx.findArrival(record.id);
        if (!saved) throw new Error("No se pudo confirmar la marca de ingreso.");
        return {
          arrival: view(saved, true),
          operation: {
            id: operation.clientOperationId,
            action: operation.action,
            appliedVersion: operation.appliedVersion,
            changed: operation.changed,
            replayed: false,
          },
        };
      });
    },

    async update(
      userId: string,
      input: { arrivalId: string; expectedVersion: number; operationId: string; arrivedAt: string },
    ) {
      const arrivedAt = parseArrivalAt(input.arrivedAt);
      return store.transaction(async (tx) => {
        await access(tx, userId, true);
        const initial = await tx.findArrival(input.arrivalId);
        if (!initial) throw new Error("No se encontró la marca de ingreso.");
        const guard = await ownedGuard(tx, userId, initial.guardId, true);
        const current = await tx.findArrival(initial.id, true);
        if (!current) throw new Error("No se encontró la marca de ingreso.");
        const hash = requestHash({
          actor: userId,
          action: "updated",
          arrivalId: input.arrivalId,
          expectedVersion: input.expectedVersion,
          arrivedAt,
        });
        const priorOperation = await tx.findOperation(guard.id, input.operationId);
        if (priorOperation) {
          assertOperation(priorOperation, userId, "updated", hash);
          const selected = await tx.findSelectedBase(guard.id, current.baseId);
          return findOperationResult(
            tx,
            priorOperation,
            guard.endedAt === null && selected !== null,
          );
        }
        assertOpen(guard);
        if (!(await tx.findSelectedBase(guard.id, current.baseId)))
          throw new Error("La base ya no está seleccionada en esta guardia.");
        if (current.deletedAt) throw new Error("La marca de ingreso fue eliminada.");
        if (current.version !== input.expectedVersion)
          throw new Error("La marca cambió; actualiza la lista antes de continuar.");
        const changed = current.arrivedAt.getTime() !== arrivedAt.getTime();
        const version = current.version + (changed ? 1 : 0);
        const next = { ...current, arrivedAt, version };
        if (changed) {
          await tx.updateArrival(current.id, current.version, {
            arrivedAt,
            deletedAt: null,
            version,
          });
          await tx.appendAudit({
            arrivalId: current.id,
            guardId: current.guardId,
            actorUserId: userId,
            operationId: input.operationId,
            action: "updated",
            versionBefore: current.version,
            versionAfter: version,
            beforeState: state(current),
            afterState: state(next),
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
        const saved = await tx.findArrival(current.id);
        if (!saved) throw new Error("No se pudo confirmar la marca de ingreso.");
        return {
          arrival: view(saved, true),
          operation: {
            id: operation.clientOperationId,
            action: operation.action,
            appliedVersion: operation.appliedVersion,
            changed: operation.changed,
            replayed: false,
          },
        };
      });
    },

    async delete(
      userId: string,
      input: { arrivalId: string; expectedVersion: number; operationId: string },
    ) {
      return store.transaction(async (tx) => {
        await access(tx, userId, true);
        const initial = await tx.findArrival(input.arrivalId);
        if (!initial) throw new Error("No se encontró la marca de ingreso.");
        const guard = await ownedGuard(tx, userId, initial.guardId, true);
        const current = await tx.findArrival(initial.id, true);
        if (!current) throw new Error("No se encontró la marca de ingreso.");
        const hash = requestHash({
          actor: userId,
          action: "deleted",
          arrivalId: input.arrivalId,
          expectedVersion: input.expectedVersion,
        });
        const priorOperation = await tx.findOperation(guard.id, input.operationId);
        if (priorOperation) {
          assertOperation(priorOperation, userId, "deleted", hash);
          return findOperationResult(tx, priorOperation, false);
        }
        assertOpen(guard);
        if (!(await tx.findSelectedBase(guard.id, current.baseId)))
          throw new Error("La base ya no está seleccionada en esta guardia.");
        if (current.deletedAt) throw new Error("La marca de ingreso ya fue eliminada.");
        if (current.version !== input.expectedVersion)
          throw new Error("La marca cambió; actualiza la lista antes de continuar.");
        const deletedAt = databaseTimestamp(await tx.databaseNow());
        const version = current.version + 1;
        const next = { ...current, deletedAt, version };
        await tx.updateArrival(current.id, current.version, {
          arrivedAt: current.arrivedAt,
          deletedAt,
          version,
        });
        await tx.appendAudit({
          arrivalId: current.id,
          guardId: current.guardId,
          actorUserId: userId,
          operationId: input.operationId,
          action: "deleted",
          versionBefore: current.version,
          versionAfter: version,
          beforeState: state(current),
          afterState: state(next),
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
        const saved = await tx.findArrival(current.id);
        if (!saved) throw new Error("No se pudo confirmar la marca de ingreso.");
        return {
          arrival: view(saved, false),
          operation: {
            id: operation.clientOperationId,
            action: operation.action,
            appliedVersion: operation.appliedVersion,
            changed: operation.changed,
            replayed: false,
          },
        };
      });
    },
  };
}
