export const staffingRoles = ["nurse", "driver", "doctor"] as const;
export type StaffingRole = (typeof staffingRoles)[number];
export const staffingCauses = ["medical_request", "coordination", "temporary", "other"] as const;
export type StaffingCause = (typeof staffingCauses)[number];
export type StaffingMovementKind = "transfer" | "temporary";

export type StaffingPeriod = {
  id: string;
  guardId: string;
  role: StaffingRole;
  enteredAt: Date;
  exitedAt: Date | null;
  exitCause: StaffingCause | null;
  exitDescription: string | null;
  version: number;
};
export type StaffingMovement = {
  id: string;
  periodId: string;
  kind: StaffingMovementKind;
  departedAt: Date;
  arrivedAt: Date | null;
  cause: StaffingCause | null;
  description: string | null;
  version: number;
};
export type StaffingView = StaffingPeriod & { movements: StaffingMovement[] };
export type StaffingActor = { isActive: boolean; roles: string[] };

export function assertStaffingRole(value: string): asserts value is StaffingRole {
  if (!staffingRoles.includes(value as StaffingRole)) throw new Error("Rol de dotación no válido.");
}

export function assertStaffingCause(cause: string | null | undefined, description?: string | null) {
  if (cause != null && !staffingCauses.includes(cause as StaffingCause)) {
    throw new Error("La causa de salida no es válida.");
  }
  const normalized = description?.trim() ?? "";
  if (cause === "other" && !normalized) throw new Error("Describe la causa indicada como otra.");
  if (cause !== "other" && normalized)
    throw new Error("La descripción solo corresponde a otra causa.");
  return normalized || null;
}

export function assertStaffingTimestampOrder(departedAt: Date, arrivedAt: Date | null) {
  if (
    !Number.isFinite(departedAt.getTime()) ||
    (arrivedAt && !Number.isFinite(arrivedAt.getTime()))
  ) {
    throw new Error("La hora ingresada no es válida.");
  }
  if (arrivedAt && arrivedAt < departedAt)
    throw new Error("La llegada no puede ser anterior a la salida.");
}

export interface StaffingTransaction {
  findActor(userId: string): Promise<StaffingActor | null>;
  findGuard(
    guardId: string,
  ): Promise<{ id: string; ownerUserId: string; endedAt: Date | null } | null>;
  listPeriods(guardId: string): Promise<StaffingPeriod[]>;
  findPeriod(periodId: string): Promise<StaffingPeriod | null>;
  findPeriodByCreationKey(guardId: string, key: string): Promise<StaffingPeriod | null>;
  insertPeriod(input: StaffingPeriod & { clientCreationKey: string }): Promise<void>;
  updatePeriod(
    periodId: string,
    version: number,
    input: Pick<StaffingPeriod, "exitedAt" | "exitCause" | "exitDescription" | "version">,
  ): Promise<void>;
  listMovements(periodId: string): Promise<StaffingMovement[]>;
  findMovementByCreationKey(periodId: string, key: string): Promise<StaffingMovement | null>;
  findMovement(movementId: string): Promise<StaffingMovement | null>;
  insertMovement(
    input: StaffingMovement & { clientCreationKey: string; createdByUserId: string },
  ): Promise<void>;
  completeMovement(
    movementId: string,
    version: number,
    arrivedAt: Date,
    actorUserId: string,
  ): Promise<void>;
  appendAudit(input: {
    periodId: string;
    actorUserId: string;
    action: "entered" | "exited" | "movement_started" | "movement_completed";
    versionBefore: number | null;
    versionAfter: number;
    beforeState: Record<string, unknown> | null;
    afterState: Record<string, unknown>;
  }): Promise<void>;
  databaseNow(): Promise<Date>;
}
export interface StaffingStore {
  transaction<T>(work: (tx: StaffingTransaction) => Promise<T>): Promise<T>;
}

const asDate = (value: Date | string | undefined, fallback: Date) => {
  const date = value === undefined ? fallback : value instanceof Date ? value : new Date(value);
  if (!Number.isFinite(date.getTime())) throw new Error("La hora ingresada no es válida.");
  return date;
};
const periodState = (period: StaffingPeriod) => ({
  role: period.role,
  enteredAt: period.enteredAt.toISOString(),
  exitedAt: period.exitedAt?.toISOString() ?? null,
  exitCause: period.exitCause,
  exitDescription: period.exitDescription,
});
const latestCompletedArrival = (movements: readonly StaffingMovement[]) =>
  movements.reduce<Date | null>(
    (latest, movement) =>
      movement.arrivedAt && (!latest || movement.arrivedAt > latest) ? movement.arrivedAt : latest,
    null,
  );

export function createEfaStaffingService(
  store: StaffingStore,
  newId: () => string = () => crypto.randomUUID(),
) {
  async function authorize(tx: StaffingTransaction, userId: string, guardId: string) {
    const actor = await tx.findActor(userId);
    if (!actor?.isActive) throw new Error("La cuenta está inactiva.");
    const roles = new Set(actor.roles);
    if (!roles.has("efa") && !roles.has("admin"))
      throw new Error("Se requiere acceso EFA vigente.");
    const guard = await tx.findGuard(guardId);
    if (!guard) throw new Error("No se encontró la guardia.");
    if (guard.ownerUserId !== userId && !roles.has("admin")) {
      throw new Error("Solo puedes consultar o modificar dotaciones de tus guardias.");
    }
    return { actor, guard };
  }

  return {
    async list(userId: string, guardId: string): Promise<StaffingView[]> {
      return store.transaction(async (tx) => {
        await authorize(tx, userId, guardId);
        const periods = await tx.listPeriods(guardId);
        return Promise.all(
          periods.map(async (period) => ({
            ...period,
            movements: await tx.listMovements(period.id),
          })),
        );
      });
    },
    async enter(
      userId: string,
      input: {
        guardId: string;
        role: string;
        enteredAt?: string | undefined;
        clientOperationId: string;
      },
    ) {
      const role = input.role;
      assertStaffingRole(role);
      return store.transaction(async (tx) => {
        const { guard } = await authorize(tx, userId, input.guardId);
        if (guard.endedAt) {
          throw new Error("La guardia terminó; no se pueden iniciar nuevos períodos de dotación.");
        }
        const replay = await tx.findPeriodByCreationKey(input.guardId, input.clientOperationId);
        if (replay) return { id: replay.id };
        const enteredAt = asDate(input.enteredAt, await tx.databaseNow());
        const id = newId();
        const period: StaffingPeriod = {
          id,
          guardId: input.guardId,
          role,
          enteredAt,
          exitedAt: null,
          exitCause: null,
          exitDescription: null,
          version: 1,
        };
        await tx.insertPeriod({ ...period, clientCreationKey: input.clientOperationId });
        await tx.appendAudit({
          periodId: id,
          actorUserId: userId,
          action: "entered",
          versionBefore: null,
          versionAfter: 1,
          beforeState: null,
          afterState: periodState(period),
        });
        return { id };
      });
    },
    async exit(
      userId: string,
      input: {
        periodId: string;
        exitedAt?: string | undefined;
        cause?: StaffingCause | null | undefined;
        description?: string | null | undefined;
        expectedVersion: number;
      },
    ) {
      const exitDescription = assertStaffingCause(input.cause, input.description);
      return store.transaction(async (tx) => {
        const period = await tx.findPeriod(input.periodId);
        if (!period) throw new Error("No se encontró el período de dotación.");
        await authorize(tx, userId, period.guardId);
        if (period.exitedAt) {
          if (
            period.exitedAt.getTime() === new Date(input.exitedAt ?? period.exitedAt).getTime() &&
            period.exitCause === (input.cause ?? null) &&
            period.exitDescription === exitDescription
          )
            return;
          throw new Error("El período de dotación ya terminó.");
        }
        if (period.version !== input.expectedVersion)
          throw new Error("La dotación cambió; actualiza la lista.");
        const exitedAt = asDate(input.exitedAt, await tx.databaseNow());
        if (exitedAt < period.enteredAt)
          throw new Error("La salida no puede ser anterior al ingreso.");
        const movements = await tx.listMovements(period.id);
        if (movements.some((movement) => !movement.arrivedAt)) {
          throw new Error(
            "Completa el traslado o regreso pendiente antes de finalizar el período.",
          );
        }
        const lastArrival = latestCompletedArrival(movements);
        if (lastArrival && exitedAt < lastArrival) {
          throw new Error("La hora de egreso no puede ser anterior a la última llegada o regreso.");
        }
        await tx.updatePeriod(period.id, period.version, {
          exitedAt,
          exitCause: input.cause ?? null,
          exitDescription,
          version: period.version + 1,
        });
        await tx.appendAudit({
          periodId: period.id,
          actorUserId: userId,
          action: "exited",
          versionBefore: period.version,
          versionAfter: period.version + 1,
          beforeState: periodState(period),
          afterState: periodState({
            ...period,
            exitedAt,
            exitCause: input.cause ?? null,
            exitDescription,
            version: period.version + 1,
          }),
        });
      });
    },
    async depart(
      userId: string,
      input: {
        periodId: string;
        kind: StaffingMovementKind;
        departedAt?: string | undefined;
        cause?: StaffingCause | null | undefined;
        description?: string | null | undefined;
        clientOperationId: string;
      },
    ) {
      const description = assertStaffingCause(input.cause, input.description);
      return store.transaction(async (tx) => {
        const period = await tx.findPeriod(input.periodId);
        if (!period) throw new Error("No se encontró el período de dotación.");
        await authorize(tx, userId, period.guardId);
        if (period.exitedAt)
          throw new Error("No se puede registrar una salida en un período terminado.");
        const replay = await tx.findMovementByCreationKey(period.id, input.clientOperationId);
        if (replay) return { id: replay.id };
        const movements = await tx.listMovements(period.id);
        if (movements.some((movement) => !movement.arrivedAt)) {
          throw new Error("Completa la salida pendiente antes de registrar otra.");
        }
        const departedAt = asDate(input.departedAt, await tx.databaseNow());
        if (departedAt < period.enteredAt)
          throw new Error("La salida no puede ser anterior al ingreso.");
        const lastArrival = latestCompletedArrival(movements);
        if (lastArrival && departedAt < lastArrival) {
          throw new Error("La salida no puede ser anterior a la llegada previa.");
        }
        const movement: StaffingMovement = {
          id: newId(),
          periodId: period.id,
          kind: input.kind,
          departedAt,
          arrivedAt: null,
          cause: input.cause ?? null,
          description,
          version: 1,
        };
        await tx.insertMovement({
          ...movement,
          clientCreationKey: input.clientOperationId,
          createdByUserId: userId,
        });
        await tx.updatePeriod(period.id, period.version, {
          exitedAt: null,
          exitCause: null,
          exitDescription: null,
          version: period.version + 1,
        });
        await tx.appendAudit({
          periodId: period.id,
          actorUserId: userId,
          action: "movement_started",
          versionBefore: period.version,
          versionAfter: period.version + 1,
          beforeState: periodState(period),
          afterState: {
            ...periodState(period),
            movement: {
              kind: movement.kind,
              departedAt: departedAt.toISOString(),
              arrivedAt: null,
              cause: movement.cause,
              description,
            },
          },
        });
        return { id: movement.id };
      });
    },
    async arrive(userId: string, input: { movementId: string; arrivedAt?: string | undefined }) {
      return store.transaction(async (tx) => {
        const movement = await tx.findMovement(input.movementId);
        if (!movement) throw new Error("No se encontró la salida pendiente.");
        const period = await tx.findPeriod(movement.periodId);
        if (!period) throw new Error("No se encontró el período de dotación.");
        await authorize(tx, userId, period.guardId);
        const arrivedAt = asDate(input.arrivedAt, movement.arrivedAt ?? (await tx.databaseNow()));
        assertStaffingTimestampOrder(movement.departedAt, arrivedAt);
        if (movement.arrivedAt) {
          if (movement.arrivedAt.getTime() === arrivedAt.getTime()) return;
          throw new Error("La llegada o el regreso ya fue registrado.");
        }
        if (period.exitedAt)
          throw new Error("No se puede completar una salida de un período terminado.");
        await tx.completeMovement(movement.id, movement.version, arrivedAt, userId);
        await tx.updatePeriod(period.id, period.version, {
          exitedAt: null,
          exitCause: null,
          exitDescription: null,
          version: period.version + 1,
        });
        await tx.appendAudit({
          periodId: period.id,
          actorUserId: userId,
          action: "movement_completed",
          versionBefore: period.version,
          versionAfter: period.version + 1,
          beforeState: {
            ...periodState(period),
            movement: {
              kind: movement.kind,
              departedAt: movement.departedAt.toISOString(),
              arrivedAt: null,
              cause: movement.cause,
              description: movement.description,
            },
          },
          afterState: {
            ...periodState(period),
            movement: {
              kind: movement.kind,
              departedAt: movement.departedAt.toISOString(),
              arrivedAt: arrivedAt.toISOString(),
              cause: movement.cause,
              description: movement.description,
            },
          },
        });
      });
    },
  };
}
