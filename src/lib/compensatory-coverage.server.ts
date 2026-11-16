import { createHash } from "node:crypto";

export type CompensatoryCoverageAssignment = {
  staffId: string;
  staffName: string;
  start: string;
  end: string;
  confirmed: boolean;
  verificationMethod: string | null;
};
export type CompensatoryCoverageHistory = {
  actorName: string;
  reason: string;
  occurredAt: string;
  version: number;
  before: CompensatoryCoverageState;
  after: CompensatoryCoverageState;
};
export type CompensatoryCoverageState = {
  version: number;
  plannedStart: string | null;
  plannedEnd: string | null;
  assignments: CompensatoryCoverageAssignment[];
  status: "pending" | "partial" | "confirmed";
  history: CompensatoryCoverageHistory[];
};
export type CompensatoryCoverageSaveInput = {
  requestId: string;
  expectedVersion: number;
  clientOperationId: string;
  plannedStart: string;
  plannedEnd: string;
  assignments: Array<Omit<CompensatoryCoverageAssignment, "staffName">>;
  reason: string;
};
export type CoverageRequest = {
  id: string;
  staffId: string;
  phase: string;
  requestedDate: string | null;
  requestedMinutes: number | null;
};
export type CoverageAssignmentRecord = CompensatoryCoverageAssignment & { requestId: string };
export type CoverageAuditRecord = {
  requestId: string;
  version: number;
  actorUserId: string;
  actorName: string;
  reason: string;
  occurredAt: Date;
  before: CompensatoryCoverageState;
  after: CompensatoryCoverageState;
};
export interface CompensatoryCoverageTransaction {
  findActor(userId: string): Promise<{ isActive: boolean; isAdmin: boolean; name: string } | null>;
  lockOperation(actorUserId: string, requestId: string, operationId: string): Promise<void>;
  findOperation(
    actorUserId: string,
    requestId: string,
    operationId: string,
  ): Promise<{ payloadHash: string; result: CompensatoryCoverageState } | null>;
  lockStaffIds(staffIds: string[]): Promise<void>;
  findRequest(requestId: string): Promise<CoverageRequest | null>;
  lockRequest(requestId: string): Promise<CoverageRequest | null>;
  listAssignments(requestId: string): Promise<CoverageAssignmentRecord[]>;
  getPlan(
    requestId: string,
  ): Promise<Omit<CompensatoryCoverageState, "assignments" | "history"> | null>;
  listHistory(requestId: string): Promise<CompensatoryCoverageHistory[]>;
  findStaff(staffIds: string[]): Promise<Array<{ id: string; name: string; isActive: boolean }>>;
  findOverlappingAssignments(
    staffId: string,
    start: string,
    end: string,
    excludeRequestId: string,
  ): Promise<Array<{ requestId: string; phase: string; start: string; end: string }>>;
  savePlan(
    requestId: string,
    state: Omit<CompensatoryCoverageState, "assignments" | "history">,
  ): Promise<void>;
  replaceAssignments(
    requestId: string,
    assignments: CompensatoryCoverageAssignment[],
  ): Promise<void>;
  insertAudit(audit: CoverageAuditRecord): Promise<void>;
  insertOperation(
    actorUserId: string,
    requestId: string,
    operationId: string,
    payloadHash: string,
    result: CompensatoryCoverageState,
  ): Promise<void>;
}
export interface CompensatoryCoverageStore {
  transaction<T>(work: (tx: CompensatoryCoverageTransaction) => Promise<T>): Promise<T>;
}

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const timestampPattern =
  /^(\d{4}-\d{2}-\d{2})T(\d{2}):(\d{2})(?::(\d{2})(?:\.(\d{1,3}))?)?(Z|[+-]\d{2}:\d{2})$/;

function timestamp(value: string) {
  const match = timestampPattern.exec(value);
  if (
    !match ||
    Number(match[2]) > 23 ||
    Number(match[3]) > 59 ||
    Number(match[4] ?? "0") !== 0 ||
    Number(match[5] ?? "0") !== 0
  )
    throw new Error("La fecha y hora debe tener precisión de minutos y zona horaria explícita.");
  const day = new Date(`${match[1]}T00:00:00.000Z`);
  if (!Number.isFinite(day.getTime()) || day.toISOString().slice(0, 10) !== match[1])
    throw new Error("La fecha y hora no es válida.");
  const instant = new Date(value);
  if (!Number.isFinite(instant.getTime())) throw new Error("La fecha y hora no es válida.");
  return instant.toISOString();
}

function validDate(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00.000Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

function baServiceDate(value: string) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Argentina/Buenos_Aires",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date(value));
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values["year"]}-${values["month"]}-${values["day"]}`;
}

function normalize(raw: CompensatoryCoverageSaveInput) {
  const input = {
    ...raw,
    requestId: raw.requestId.toLowerCase(),
    clientOperationId: raw.clientOperationId.toLowerCase(),
    plannedStart: timestamp(raw.plannedStart),
    plannedEnd: timestamp(raw.plannedEnd),
    reason: raw.reason.trim(),
    assignments: raw.assignments.map((assignment) => ({
      ...assignment,
      staffId: assignment.staffId.toLowerCase(),
      start: timestamp(assignment.start),
      end: timestamp(assignment.end),
      verificationMethod: assignment.verificationMethod?.trim() || null,
    })),
  };
  if (!uuidPattern.test(input.requestId) || !uuidPattern.test(input.clientOperationId))
    throw new Error("El identificador no es válido.");
  if (!Number.isSafeInteger(input.expectedVersion) || input.expectedVersion < 0)
    throw new Error("La versión de cobertura no es válida.");
  if (!input.reason || input.reason.length > 1000)
    throw new Error("El motivo es obligatorio y debe tener hasta 1000 caracteres.");
  if (new Date(input.plannedEnd).getTime() <= new Date(input.plannedStart).getTime())
    throw new Error("El intervalo planificado debe finalizar después de comenzar.");
  const ids = input.assignments.map((a) => a.staffId);
  if (ids.some((id) => !uuidPattern.test(id)))
    throw new Error("No se encontró el agente asociado.");
  const sorted = [...input.assignments].sort(
    (a, b) => a.start.localeCompare(b.start) || a.end.localeCompare(b.end),
  );
  for (let i = 0; i < sorted.length; i++) {
    const assignment = sorted[i]!;
    if (new Date(assignment.end).getTime() <= new Date(assignment.start).getTime())
      throw new Error("El intervalo de cobertura debe finalizar después de comenzar.");
    if (assignment.start < input.plannedStart || assignment.end > input.plannedEnd)
      throw new Error("Las asignaciones deben estar dentro del intervalo planificado.");
    if (
      assignment.confirmed &&
      (!assignment.verificationMethod || assignment.verificationMethod.length > 500)
    )
      throw new Error("La verificación manual es obligatoria para confirmar una cobertura.");
    if (i > 0 && sorted[i - 1]!.end > assignment.start)
      throw new Error("Las asignaciones de una solicitud no pueden superponerse.");
  }
  return { ...input, assignments: sorted };
}

function hash(input: ReturnType<typeof normalize>) {
  return createHash("sha256").update(JSON.stringify(input)).digest("hex");
}

function coveredStatus(
  assignments: Array<Omit<CompensatoryCoverageAssignment, "staffName">>,
  start: string,
  end: string,
) {
  const confirmed = assignments
    .filter((a) => a.confirmed)
    .sort((a, b) => a.start.localeCompare(b.start));
  if (!confirmed.length) return assignments.length ? "partial" : "pending";
  let cursor = start;
  for (const assignment of confirmed) {
    if (assignment.start > cursor) return "partial";
    if (assignment.end > cursor) cursor = assignment.end;
    if (cursor >= end) return "confirmed";
  }
  return "partial";
}

export function emptyCompensatoryCoverage(): CompensatoryCoverageState {
  return {
    version: 0,
    plannedStart: null,
    plannedEnd: null,
    assignments: [],
    status: "pending",
    history: [],
  };
}

async function readState(
  tx: CompensatoryCoverageTransaction,
  requestId: string,
): Promise<CompensatoryCoverageState> {
  const plan = await tx.getPlan(requestId);
  if (!plan) return emptyCompensatoryCoverage();
  const [assignments, history] = await Promise.all([
    tx.listAssignments(requestId),
    tx.listHistory(requestId),
  ]);
  return {
    ...plan,
    assignments: assignments.map(({ requestId: _id, ...assignment }) => assignment),
    history,
  };
}

export function createCompensatoryCoverageService(store: CompensatoryCoverageStore) {
  return {
    async getCompensatoryCoverage(
      actorUserId: string,
      requestId: string,
    ): Promise<CompensatoryCoverageState> {
      if (!uuidPattern.test(requestId)) throw new Error("El identificador no es válido.");
      return store.transaction(async (tx) => {
        const actor = await tx.findActor(actorUserId);
        if (!actor?.isActive || !actor.isAdmin)
          throw new Error("Se requiere administración vigente.");
        const request = await tx.lockRequest(requestId);
        if (!request) throw new Error("No se encontró la solicitud.");
        return readState(tx, requestId);
      });
    },
    async saveCompensatoryCoverage(
      actorUserId: string,
      raw: CompensatoryCoverageSaveInput,
    ): Promise<CompensatoryCoverageState> {
      const input = normalize(raw);
      const payloadHash = hash(input);
      return store.transaction(async (tx) => {
        const actor = await tx.findActor(actorUserId);
        if (!actor?.isActive || !actor.isAdmin)
          throw new Error("Se requiere administración vigente.");
        await tx.lockOperation(actorUserId, input.requestId, input.clientOperationId);
        const prior = await tx.findOperation(actorUserId, input.requestId, input.clientOperationId);
        if (prior) {
          if (prior.payloadHash !== payloadHash)
            throw new Error("La clave de operación ya fue usada con otros datos.");
          return prior.result;
        }
        const unlockedRequest = await tx.findRequest(input.requestId);
        if (!unlockedRequest) throw new Error("No se encontró la solicitud.");
        const staffIds = [
          ...new Set([unlockedRequest.staffId, ...input.assignments.map((a) => a.staffId)]),
        ].sort();
        // Staff locks are acquired in a stable order before the request lock.
        await tx.lockStaffIds(staffIds);
        const request = await tx.lockRequest(input.requestId);
        if (!request) throw new Error("No se encontró la solicitud.");
        if (request.phase !== "approved" && request.phase !== "consumed")
          throw new Error(
            "Solo se puede registrar cobertura para una solicitud aprobada o consumida.",
          );
        if (
          !request.requestedDate ||
          !request.requestedMinutes ||
          !validDate(request.requestedDate)
        )
          throw new Error("La solicitud no tiene una franja horaria clasificada.");
        if (baServiceDate(input.plannedStart) !== request.requestedDate)
          throw new Error(
            "El inicio de la cobertura debe corresponder a la fecha de servicio solicitada.",
          );
        if (
          new Date(input.plannedEnd).getTime() - new Date(input.plannedStart).getTime() !==
          request.requestedMinutes * 60_000
        )
          throw new Error(
            "La duración de la cobertura debe coincidir con los minutos solicitados.",
          );
        const plan = await tx.getPlan(request.id);
        const currentVersion = plan?.version ?? 0;
        if (currentVersion !== input.expectedVersion)
          throw new Error("La cobertura cambió. Actualizá los datos e intentá de nuevo.");
        const staffIdsAll = [
          ...new Set([request.staffId, ...input.assignments.map((a) => a.staffId)]),
        ];
        const staff = await tx.findStaff(staffIdsAll);
        const byId = new Map(staff.map((member) => [member.id.toLowerCase(), member]));
        for (const staffId of input.assignments.map((assignment) => assignment.staffId)) {
          const member = byId.get(staffId.toLowerCase());
          if (!member?.isActive) throw new Error("El agente seleccionado no está activo.");
          if (staffId.toLowerCase() === request.staffId.toLowerCase())
            throw new Error("La persona solicitante no puede cubrir su propia solicitud.");
        }
        for (const assignment of input.assignments) {
          const conflicts = await tx.findOverlappingAssignments(
            assignment.staffId,
            assignment.start,
            assignment.end,
            request.id,
          );
          if (
            conflicts.some(
              (conflict) =>
                ["approved", "consumed"].includes(conflict.phase) &&
                conflict.start < assignment.end &&
                conflict.end > assignment.start,
            )
          )
            throw new Error("El agente tiene otra cobertura asignada en ese intervalo.");
        }
        const previous = await readState(tx, request.id);
        // Keep audit snapshots bounded; chronological history belongs only at the response root.
        const before: CompensatoryCoverageState = { ...previous, history: [] };
        const status = coveredStatus(input.assignments, input.plannedStart, input.plannedEnd);
        const nextPlan = {
          version: currentVersion + 1,
          plannedStart: input.plannedStart,
          plannedEnd: input.plannedEnd,
          status: status as CompensatoryCoverageState["status"],
        };
        const assignments: CompensatoryCoverageAssignment[] = input.assignments.map(
          (assignment) => ({ ...assignment, staffName: byId.get(assignment.staffId)!.name }),
        );
        const occurredAt = new Date();
        const after: CompensatoryCoverageState = { ...nextPlan, assignments, history: [] };
        await tx.savePlan(request.id, nextPlan);
        await tx.replaceAssignments(request.id, assignments);
        await tx.insertAudit({
          requestId: request.id,
          version: nextPlan.version,
          actorUserId,
          actorName: actor.name,
          reason: input.reason,
          occurredAt,
          before,
          after,
        });
        const result = {
          ...after,
          history: [
            ...previous.history,
            {
              actorName: actor.name,
              reason: input.reason,
              occurredAt: occurredAt.toISOString(),
              version: nextPlan.version,
              before,
              after,
            },
          ],
        };
        await tx.insertOperation(
          actorUserId,
          request.id,
          input.clientOperationId,
          payloadHash,
          result,
        );
        return result;
      });
    },
  };
}
