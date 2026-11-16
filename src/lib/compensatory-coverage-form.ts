export type CoverageAssignmentDraft = {
  staffId: string;
  start: string;
  end: string;
  confirmed: boolean;
  verificationMethod: string;
};

export type CoveragePlanDraft = {
  requestedDate: string | null;
  requestedMinutes: number | null;
  plannedStart: string;
  plannedEnd: string;
  assignments: CoverageAssignmentDraft[];
};

const argentinaOffset = "-03:00";

function parseLocalDateTime(value: string): number | null {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value)) return null;
  const timestamp = new Date(`${value}:00${argentinaOffset}`);
  if (!Number.isFinite(timestamp.getTime())) return null;
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Argentina/Buenos_Aires",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(timestamp);
  const output = Object.fromEntries(parts.map(({ type, value: part }) => [type, part]));
  return `${output["year"]}-${output["month"]}-${output["day"]}T${output["hour"]}:${output["minute"]}` ===
    value
    ? timestamp.getTime()
    : null;
}

export function toArgentinaTimestamp(value: string): string | null {
  return parseLocalDateTime(value) === null ? null : `${value}:00${argentinaOffset}`;
}

export function argentinaLocalValue(value: string | null): string {
  if (!value) return "";
  const timestamp = new Date(value);
  if (!Number.isFinite(timestamp.getTime())) return "";
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Argentina/Buenos_Aires",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(timestamp);
  const output = Object.fromEntries(parts.map(({ type, value: part }) => [type, part]));
  return `${output["year"]}-${output["month"]}-${output["day"]}T${output["hour"]}:${output["minute"]}`;
}

export function formatArgentinaDateTime(value: string): string {
  const timestamp = new Date(value);
  if (!Number.isFinite(timestamp.getTime())) return "Fecha no disponible";
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Argentina/Buenos_Aires",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(timestamp);
  const output = Object.fromEntries(parts.map(({ type, value: part }) => [type, part]));
  return `${output["day"]}/${output["month"]}/${output["year"]}, ${output["hour"]}:${output["minute"]}`;
}

function formatArgentinaInterval(start: string, end: string): string {
  const formattedStart = formatArgentinaDateTime(start);
  const formattedEnd = formatArgentinaDateTime(end);
  if (formattedStart === "Fecha no disponible" || formattedEnd === "Fecha no disponible")
    return "Horario no disponible";
  const [startDate, startTime] = formattedStart.split(", ");
  const [endDate, endTime] = formattedEnd.split(", ");
  return startDate === endDate
    ? `${startDate}, ${startTime}–${endTime}`
    : `${formattedStart}–${formattedEnd}`;
}

export function formatCoverageHistorySnapshot(snapshot: {
  plannedStart: string | null;
  plannedEnd: string | null;
  status: "pending" | "partial" | "confirmed";
  assignments: Array<{
    staffName: string;
    start: string;
    end: string;
    confirmed: boolean;
    verificationMethod: string | null;
  }>;
}) {
  const status =
    snapshot.status === "confirmed"
      ? "Horario completo confirmado"
      : snapshot.status === "partial"
        ? "Falta confirmar parte del horario"
        : "Sin personas asignadas";
  return {
    plan:
      snapshot.plannedStart && snapshot.plannedEnd
        ? formatArgentinaInterval(snapshot.plannedStart, snapshot.plannedEnd)
        : "Sin horario registrado",
    status,
    emptyAssignmentsLabel: snapshot.assignments.length ? null : "Sin personas asignadas",
    assignments: snapshot.assignments.map((assignment) => ({
      label: assignment.staffName,
      interval: formatArgentinaInterval(assignment.start, assignment.end),
      confirmation: assignment.confirmed ? "Confirmada manualmente" : "Pendiente de confirmación",
      verification: assignment.confirmed ? assignment.verificationMethod : null,
    })),
  };
}

export function validateCoveragePlan(draft: CoveragePlanDraft): string | null {
  if (!draft.requestedDate || !/^\d{4}-\d{2}-\d{2}$/.test(draft.requestedDate))
    return "La solicitud no tiene una fecha válida para coordinar la cobertura.";
  if (
    !Number.isInteger(draft.requestedMinutes) ||
    !draft.requestedMinutes ||
    draft.requestedMinutes < 1
  )
    return "La solicitud no tiene una duración válida para coordinar la cobertura.";
  const start = parseLocalDateTime(draft.plannedStart);
  const end = parseLocalDateTime(draft.plannedEnd);
  if (start === null || end === null || end <= start)
    return "Indica una franja válida; el fin debe ser posterior al inicio.";
  if (draft.plannedStart.slice(0, 10) !== draft.requestedDate)
    return "El inicio debe corresponder a la fecha solicitada.";
  if (end - start !== draft.requestedMinutes * 60_000)
    return "La franja debe durar exactamente el tiempo solicitado.";
  const intervals: Array<[number, number]> = [];
  for (const assignment of draft.assignments) {
    const assignmentStart = parseLocalDateTime(assignment.start);
    const assignmentEnd = parseLocalDateTime(assignment.end);
    if (!assignment.staffId) return "Selecciona un agente para cada tramo de cobertura.";
    if (assignmentStart === null || assignmentEnd === null || assignmentEnd <= assignmentStart)
      return "Cada tramo debe tener un intervalo válido.";
    if (assignmentStart < start || assignmentEnd > end)
      return "Cada tramo debe quedar dentro de la franja planificada.";
    if (assignment.confirmed && !assignment.verificationMethod.trim())
      return "Indica cómo se verificó cada cobertura confirmada.";
    intervals.push([assignmentStart, assignmentEnd]);
  }
  intervals.sort((a, b) => a[0] - b[0]);
  if (
    intervals.some(
      ([currentStart, currentEnd], index) => index > 0 && currentStart < intervals[index - 1]![1],
    )
  )
    return "Los tramos de cobertura no pueden superponerse.";
  return null;
}

export function coverageStatusFor(
  durationMinutes: number,
  assignments: Array<{ start: number; end: number; confirmed: boolean }>,
): "pending" | "partial" | "confirmed" {
  const confirmed = assignments.filter((assignment) => assignment.confirmed);
  if (!assignments.length) return "pending";
  if (!confirmed.length) return "partial";
  const ranges = confirmed
    .map(({ start, end }) => [Math.max(0, start), Math.min(durationMinutes, end)] as const)
    .filter(([start, end]) => end > start)
    .sort((a, b) => a[0] - b[0]);
  let covered = 0;
  let cursor = 0;
  for (const [start, end] of ranges) {
    if (start > cursor) break;
    if (end > cursor) {
      covered += end - Math.max(start, cursor);
      cursor = end;
    }
  }
  return covered >= durationMinutes ? "confirmed" : "partial";
}
