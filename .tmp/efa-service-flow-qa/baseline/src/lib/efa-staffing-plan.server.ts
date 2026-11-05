import { getOperationalDate } from "./efa-staffing-plan.date";
export { getOperationalDate } from "./efa-staffing-plan.date";

export const plannedRoles = ["nurse", "driver", "doctor"] as const;
export type PlannedRole = (typeof plannedRoles)[number];
export type CoverageTarget = { kind: "base"; baseId: string; name: string };
export type CycleSlot = {
  dayOffset: number;
  role: PlannedRole;
  start: string;
  end: string;
  endDayOffset: 0 | 1;
  label: string | null;
};
export type DatedSlot = {
  date: string;
  endDate: string;
  role: PlannedRole;
  start: string;
  end: string;
  endDayOffset: 0 | 1;
  label: string | null;
};
export type StaffingPlan = {
  id: string;
  target: CoverageTarget;
  targetKey: string;
  effectiveFrom: string;
  cycleAnchor: string;
  cycleLengthDays: number;
  slots: CycleSlot[];
  version: number;
  clientOperationId: string;
};
export type StaffingPlanException = {
  id: string;
  target: CoverageTarget;
  targetKey: string;
  date: string;
  slots: Array<Omit<DatedSlot, "date" | "endDate">>;
  version: number;
  clientOperationId: string;
};

type Actor = { isActive: boolean; roles: string[] };
export interface StaffingPlanTransaction {
  findActor(userId: string): Promise<Actor | null>;
  findBaseById(baseId: string): Promise<{ name: string } | null>;
  listPlans(targetKey: string): Promise<StaffingPlan[]>;
  insertPlan(plan: StaffingPlan & { createdByUserId: string }): Promise<void>;
  listExceptions(targetKey: string, from: string, to: string): Promise<StaffingPlanException[]>;
  insertException(exception: StaffingPlanException & { createdByUserId: string }): Promise<void>;
  appendAudit(input: {
    entityId: string;
    entity: "plan" | "exception";
    actorUserId: string;
    version: number;
    state: Record<string, unknown>;
  }): Promise<void>;
}
export interface StaffingPlanStore {
  transaction<T>(work: (tx: StaffingPlanTransaction) => Promise<T>): Promise<T>;
}

function validDate(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/u.test(value)) return false;
  const date = new Date(`${value}T00:00:00.000Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}
function dayNumber(date: string) {
  if (!validDate(date)) throw new Error("La fecha de planificación no es válida.");
  return Math.floor(Date.parse(`${date}T00:00:00.000Z`) / 86_400_000);
}
function validTime(value: string) {
  return /^([01]\d|2[0-3]):[0-5]\d$/u.test(value);
}
function assertTarget(target: CoverageTarget) {
  if (!target || target.kind !== "base")
    throw new Error("La planificación debe usar una base del catálogo.");
  const name = target.name.normalize("NFKC").trim().replace(/\s+/gu, " ");
  if (!name || name.length > 120)
    throw new Error("El nombre de la base o móvil debe tener entre 1 y 120 caracteres.");
  if (
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu.test(
      target.baseId,
    )
  )
    throw new Error("La base seleccionada no es válida.");
  return {
    kind: "base" as const,
    name,
    baseId: target.baseId.toLowerCase(),
    key: `base:${target.baseId.toLowerCase()}`,
    target: { kind: "base" as const, baseId: target.baseId.toLowerCase(), name },
  };
}
function assertSlots(
  slots: readonly {
    role: PlannedRole;
    start: string;
    end: string;
    endDayOffset: number;
    label?: string | null;
  }[],
  offsets?: readonly number[],
) {
  if (!Array.isArray(slots) || slots.length > 1000)
    throw new Error("La planificación contiene demasiados tramos.");
  return slots.map((slot, index) => {
    if (!plannedRoles.includes(slot.role)) throw new Error("El rol planificado no es válido.");
    if (!validTime(slot.start) || !validTime(slot.end) || ![0, 1].includes(slot.endDayOffset))
      throw new Error("Cada tramo debe tener un horario válido.");
    if (
      (slot.endDayOffset === 0 && slot.end <= slot.start) ||
      (slot.endDayOffset === 1 && slot.end > slot.start)
    )
      throw new Error("El tramo debe terminar después de comenzar y no superar las 24 horas.");
    const label = slot.label?.trim() ?? "";
    if (label.length > 40) throw new Error("La etiqueta del turno no puede superar 40 caracteres.");
    const dayOffset = offsets?.[index];
    return {
      ...(dayOffset === undefined ? {} : { dayOffset }),
      role: slot.role,
      start: slot.start,
      end: slot.end,
      endDayOffset: slot.endDayOffset as 0 | 1,
      label: label || null,
    };
  });
}

export function expandStaffingPlan(
  plan: Pick<StaffingPlan, "cycleAnchor" | "cycleLengthDays" | "slots"> & { slots: CycleSlot[] },
  from: string,
  to: string,
): DatedSlot[] {
  const first = dayNumber(from);
  const last = dayNumber(to);
  const anchor = dayNumber(plan.cycleAnchor);
  if (last < first || last - first > 370)
    throw new Error("El período de vista previa no es válido.");
  if (
    !Number.isInteger(plan.cycleLengthDays) ||
    plan.cycleLengthDays < 1 ||
    plan.cycleLengthDays > 366
  )
    throw new Error("La duración del ciclo no es válida.");
  return Array.from({ length: last - first + 1 }, (_, index) => {
    const date = new Date((first + index) * 86_400_000).toISOString().slice(0, 10);
    const cycleDay =
      (((first + index - anchor) % plan.cycleLengthDays) + plan.cycleLengthDays) %
      plan.cycleLengthDays;
    return plan.slots
      .filter((slot) => slot.dayOffset === cycleDay)
      .map(({ role, start, end, endDayOffset, label }) => ({
        date,
        endDate: new Date((first + index + endDayOffset) * 86_400_000).toISOString().slice(0, 10),
        role,
        start,
        end,
        endDayOffset,
        label: label ?? null,
      }));
  }).flat();
}

const targetIdentity = (target: CoverageTarget) => ({
  kind: target.kind,
  baseId: target.baseId,
});
const planState = (plan: StaffingPlan) => ({
  target: targetIdentity(plan.target),
  effectiveFrom: plan.effectiveFrom,
  cycleAnchor: plan.cycleAnchor,
  cycleLengthDays: plan.cycleLengthDays,
  slots: plan.slots,
});
const exceptionState = (exception: StaffingPlanException) => ({
  target: targetIdentity(exception.target),
  date: exception.date,
  slots: exception.slots,
});
const sameState = (left: Record<string, unknown>, right: Record<string, unknown>) =>
  JSON.stringify(left) === JSON.stringify(right);

export function createEfaStaffingPlanService(
  store: StaffingPlanStore,
  newId: () => string = () => crypto.randomUUID(),
  now: () => Date = () => new Date(),
) {
  async function authorize(tx: StaffingPlanTransaction, userId: string, admin: boolean) {
    const actor = await tx.findActor(userId);
    if (!actor?.isActive) throw new Error("La cuenta está inactiva.");
    if (
      admin
        ? !actor.roles.includes("admin")
        : !actor.roles.some((role) => role === "efa" || role === "admin")
    ) {
      throw new Error(
        admin ? "Se requiere administración vigente." : "Se requiere acceso EFA vigente.",
      );
    }
  }
  async function resolveTarget(
    tx: StaffingPlanTransaction,
    target: ReturnType<typeof assertTarget>,
  ) {
    const base = await tx.findBaseById(target.baseId);
    if (!base) throw new Error("La planificación debe usar una base del catálogo existente.");
    return { ...target.target, name: base.name };
  }
  return {
    async list(userId: string, target: CoverageTarget) {
      const normalized = assertTarget(target);
      return store.transaction(async (tx) => {
        await authorize(tx, userId, false);
        const resolvedTarget = await resolveTarget(tx, normalized);
        return (await tx.listPlans(normalized.key)).map((plan) => ({
          ...plan,
          target: resolvedTarget,
        }));
      });
    },
    async savePlan(
      userId: string,
      input: Omit<StaffingPlan, "id" | "targetKey" | "version"> & { target: CoverageTarget },
    ) {
      const normalized = assertTarget(input.target);
      if (!validDate(input.effectiveFrom) || !validDate(input.cycleAnchor))
        throw new Error("La fecha de vigencia o anclaje no es válida.");
      if (
        !Number.isInteger(input.cycleLengthDays) ||
        input.cycleLengthDays < 1 ||
        input.cycleLengthDays > 366
      )
        throw new Error("La duración del ciclo debe ser de 1 a 366 días.");
      if (!input.clientOperationId || !/^[0-9a-f-]{36}$/iu.test(input.clientOperationId))
        throw new Error("El identificador de operación no es válido.");
      const slots = assertSlots(
        input.slots,
        input.slots.map((slot) => slot.dayOffset),
      ) as CycleSlot[];
      if (
        slots.some(
          (slot) =>
            !Number.isInteger(slot.dayOffset) ||
            slot.dayOffset! < 0 ||
            slot.dayOffset! >= input.cycleLengthDays,
        )
      )
        throw new Error("Un tramo está fuera del ciclo configurado.");
      return store.transaction(async (tx) => {
        await authorize(tx, userId, true);
        const resolvedTarget = await resolveTarget(tx, normalized);
        const versions = await tx.listPlans(normalized.key);
        const replay = versions.find((item) => item.clientOperationId === input.clientOperationId);
        if (replay) {
          const requested = {
            target: targetIdentity(resolvedTarget),
            effectiveFrom: input.effectiveFrom,
            cycleAnchor: input.cycleAnchor,
            cycleLengthDays: input.cycleLengthDays,
            slots,
          };
          if (!sameState(planState(replay), requested))
            throw new Error("El identificador de operación ya se usó con otros datos.");
          return { ...replay, target: resolvedTarget };
        }
        if (input.effectiveFrom <= getOperationalDate(now()))
          throw new Error("La nueva vigencia debe comenzar después de hoy operativo.");
        if (versions.some((item) => item.effectiveFrom === input.effectiveFrom))
          throw new Error("Ya existe una versión para esa fecha de vigencia.");
        if (versions.some((item) => item.effectiveFrom > input.effectiveFrom))
          throw new Error("La nueva vigencia no puede preceder una versión ya registrada.");
        const plan: StaffingPlan = {
          id: newId(),
          target: resolvedTarget,
          targetKey: normalized.key,
          effectiveFrom: input.effectiveFrom,
          cycleAnchor: input.cycleAnchor,
          cycleLengthDays: input.cycleLengthDays,
          slots,
          version: versions.length + 1,
          clientOperationId: input.clientOperationId,
        };
        await tx.insertPlan({ ...plan, createdByUserId: userId });
        await tx.appendAudit({
          entity: "plan",
          entityId: plan.id,
          actorUserId: userId,
          version: plan.version,
          state: planState(plan),
        });
        return plan;
      });
    },
    async saveException(
      userId: string,
      input: {
        target: CoverageTarget;
        date: string;
        slots: Array<Omit<DatedSlot, "date" | "endDate">>;
        clientOperationId: string;
      },
    ) {
      const normalized = assertTarget(input.target);
      if (!validDate(input.date)) throw new Error("La fecha de excepción no es válida.");
      if (!input.clientOperationId || !/^[0-9a-f-]{36}$/iu.test(input.clientOperationId))
        throw new Error("El identificador de operación no es válido.");
      const slots = assertSlots(input.slots) as StaffingPlanException["slots"];
      return store.transaction(async (tx) => {
        await authorize(tx, userId, true);
        const resolvedTarget = await resolveTarget(tx, normalized);
        const versions = await tx.listExceptions(normalized.key, input.date, input.date);
        const replay = versions.find((item) => item.clientOperationId === input.clientOperationId);
        if (replay) {
          const requested = {
            target: targetIdentity(resolvedTarget),
            date: input.date,
            slots,
          };
          if (!sameState(exceptionState(replay), requested))
            throw new Error("El identificador de operación ya se usó con otros datos.");
          return { ...replay, target: resolvedTarget };
        }
        if (input.date <= getOperationalDate(now()))
          throw new Error(
            "Las excepciones solo se pueden crear o revisar después de hoy operativo.",
          );
        const exception: StaffingPlanException = {
          id: newId(),
          target: resolvedTarget,
          targetKey: normalized.key,
          date: input.date,
          slots,
          version: Math.max(0, ...versions.map((item) => item.version)) + 1,
          clientOperationId: input.clientOperationId,
        };
        await tx.insertException({ ...exception, createdByUserId: userId });
        await tx.appendAudit({
          entity: "exception",
          entityId: exception.id,
          actorUserId: userId,
          version: exception.version,
          state: exceptionState(exception),
        });
        return exception;
      });
    },
    async preview(userId: string, input: { target: CoverageTarget; from: string; to: string }) {
      const normalized = assertTarget(input.target);
      dayNumber(input.from);
      dayNumber(input.to);
      if (
        dayNumber(input.to) < dayNumber(input.from) ||
        dayNumber(input.to) - dayNumber(input.from) > 370
      )
        throw new Error("El período de vista previa no es válido.");
      return store.transaction(async (tx) => {
        await authorize(tx, userId, false);
        const resolvedTarget = await resolveTarget(tx, normalized);
        const plans = (await tx.listPlans(normalized.key)).sort((a, b) =>
          a.effectiveFrom.localeCompare(b.effectiveFrom),
        );
        const firstRequestedDay = dayNumber(input.from);
        const lastRequestedDay = dayNumber(input.to);
        const firstStartDay = firstRequestedDay - 1;
        const exceptions = await tx.listExceptions(
          normalized.key,
          new Date(firstStartDay * 86_400_000).toISOString().slice(0, 10),
          input.to,
        );
        const slots: DatedSlot[] = [];
        for (let day = firstStartDay; day <= lastRequestedDay; day += 1) {
          const date = new Date(day * 86_400_000).toISOString().slice(0, 10);
          const plan = plans.filter((item) => item.effectiveFrom <= date).at(-1);
          if (!plan) continue;
          const exception = exceptions
            .filter((item) => item.date === date)
            .sort((a, b) => a.version - b.version)
            .at(-1);
          const daySlots = exception
            ? exception.slots.map((slot) => ({
                ...slot,
                date,
                endDate: new Date((dayNumber(date) + slot.endDayOffset) * 86_400_000)
                  .toISOString()
                  .slice(0, 10),
              }))
            : expandStaffingPlan(plan, date, date);
          const windowStart = firstRequestedDay * 86_400_000;
          const windowEnd = (lastRequestedDay + 1) * 86_400_000;
          slots.push(
            ...daySlots.filter((slot) => {
              const start =
                dayNumber(slot.date) * 86_400_000 +
                (Number(slot.start.slice(0, 2)) * 60 + Number(slot.start.slice(3))) * 60_000;
              const end =
                dayNumber(slot.endDate) * 86_400_000 +
                (Number(slot.end.slice(0, 2)) * 60 + Number(slot.end.slice(3))) * 60_000;
              return start < windowEnd && end > windowStart;
            }),
          );
        }
        return {
          target: resolvedTarget,
          from: input.from,
          to: input.to,
          slots,
          actualStaffing: false as const,
        };
      });
    },
  };
}
