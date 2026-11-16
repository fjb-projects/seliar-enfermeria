export type CompensatoryHistoryPeriod = {
  id: string;
  year: number;
  month: number | null;
  generatedMinutes: number | null;
  externalTakenMinutes: number | null;
  registeredTakenMinutes: number | null;
  netMinutes: number;
  effectiveDate: string;
  reason: string;
  actorName: string;
  createdAt: string;
  revision: number;
  status: "active" | "reversed";
  reversedAt: string | null;
  reversedByName: string | null;
  reversalReason: string | null;
};

export type CompensatoryHistoryLedgerEntry = {
  id: string;
  kind?: string;
  minutes: number;
  effectiveDate?: string;
  reason?: string;
  actorName?: string;
  createdAt?: string;
  balanceBeforeMinutes?: number;
  balanceAfterMinutes?: number;
  reversesEntryId?: string | null;
  compensatoryPeriodId?: string | null;
  periodEffect?: "record" | "reversal" | null;
};

export function canReverseCompensatoryHistoryMovement(
  entry: CompensatoryHistoryLedgerEntry,
  entries: readonly CompensatoryHistoryLedgerEntry[],
) {
  if (
    entry.compensatoryPeriodId ||
    entry.reversesEntryId ||
    !["opening", "credit", "debit"].includes(entry.kind ?? "")
  ) {
    return false;
  }
  return !entries.some((candidate) => candidate.reversesEntryId === entry.id);
}

export type CompensatoryHistoryRequest = {
  id: string;
  requesterName?: string;
  requesterMobile?: string;
  compensatoryDate?: string;
  submittedAt?: string;
  createdAt?: string | Date;
  hours?: string;
  requestedMinutes?: number | null;
  requestedDate?: string | null;
  phase?: string;
  decisionReason?: string | null;
  cancellationReason?: string | null;
};

export type CompensatoryHistoryRow = {
  id: string;
  kind: "period" | "movement" | "request";
  date: string;
  year: number;
  label: string;
  details: string;
  snapshotMinutes: number | null;
  balanceImpactMinutes: number | null;
  actor: string;
  revision: number | null;
  sourceId: string;
};

const requestPhaseLabels: Record<string, string> = {
  unclassified: "Sin resolución registrada",
  pending: "Pendiente de decisión",
  approved: "Aprobada · consumo programado",
  rejected: "Rechazada",
  cancelled: "Cancelada",
  consumed: "Efectivizada",
};

export function isExpiredPendingRequest(
  request: { phase?: string | undefined; requestedDate?: string | null | undefined },
  serviceDay?: string,
) {
  return request.phase === "pending" && Boolean(
    request.requestedDate && serviceDay &&
    /^\d{4}-\d{2}-\d{2}$/.test(request.requestedDate) &&
    /^\d{4}-\d{2}-\d{2}$/.test(serviceDay) && request.requestedDate < serviceDay,
  );
}

export function compensatoryRequestPhaseLabel(phase?: string, requestedDate?: string | null, serviceDay?: string) {
  if (isExpiredPendingRequest({ phase, requestedDate }, serviceDay)) return "Sin resolución · Fecha vencida";
  return phase ? (requestPhaseLabels[phase] ?? "Estado no disponible") : "Estado no informado";
}

export function compensatoryRequestActionLabel(phase?: string, requestedDate?: string | null, serviceDay?: string) {
  if (isExpiredPendingRequest({ phase, requestedDate }, serviceDay)) return "Ver solicitud";
  return phase === "unclassified" || phase === "pending" ? "Revisar solicitud" : "Ver solicitud";
}

function yearOf(value: string | Date | undefined, fallback = new Date().getFullYear()) {
  const match = String(value ?? "").match(/\b(\d{4})\b/);
  return match ? Number(match[1]) : fallback;
}

function dateValue(value: string | Date | undefined) {
  if (!value) return "";
  return value instanceof Date ? value.toISOString() : value;
}

function periodLabel(period: CompensatoryHistoryPeriod) {
  return period.month === null
    ? `Saldo anual ${period.year}`
    : `Período ${String(period.month).padStart(2, "0")}/${period.year}`;
}

export function buildCompensatoryHistoryRows({
  periods,
  entries,
  requests,
  serviceDay,
}: {
  periods: readonly CompensatoryHistoryPeriod[];
  entries: readonly CompensatoryHistoryLedgerEntry[];
  requests: readonly CompensatoryHistoryRequest[];
  serviceDay?: string | undefined;
}): CompensatoryHistoryRow[] {
  const periodRows = periods.map((period): CompensatoryHistoryRow => {
    const effects = entries.filter((entry) => entry.compensatoryPeriodId === period.id);
    const balanceImpactMinutes = effects.reduce((sum, entry) => sum + entry.minutes, 0);
    const reversalDetail =
      period.status === "reversed"
        ? [period.reversedAt, period.reversedByName, period.reversalReason]
            .filter(Boolean)
            .join(" · ")
        : "Período activo";
    const snapshot = period.netMinutes;
    const details = [
      period.reason,
      `Neto informado: ${snapshot} min`,
      `Impacto en saldo: ${balanceImpactMinutes} min`,
      reversalDetail,
    ]
      .filter(Boolean)
      .join(" · ");
    return {
      id: `period:${period.id}`,
      kind: "period",
      date: period.effectiveDate,
      year: period.year,
      label: periodLabel(period),
      details,
      snapshotMinutes: snapshot,
      balanceImpactMinutes,
      actor: period.actorName,
      revision: period.revision,
      sourceId: period.id,
    };
  });

  const movementRows = entries
    .filter((entry) => !entry.compensatoryPeriodId)
    .map((entry): CompensatoryHistoryRow => ({
      id: `movement:${entry.id}`,
      kind: "movement",
      date: entry.effectiveDate ?? dateValue(entry.createdAt),
      year: yearOf(entry.effectiveDate ?? dateValue(entry.createdAt)),
      label:
        entry.kind === "reversal"
          ? "Reversión de movimiento"
          : entry.kind === "request_consumption"
            ? "Consumo de solicitud"
            : "Ajuste de saldo",
      details: entry.reason ?? "Movimiento registrado",
      snapshotMinutes: null,
      balanceImpactMinutes: entry.minutes,
      actor: entry.actorName ?? "",
      revision: null,
      sourceId: entry.id,
    }));

  const requestRows = requests.map((request): CompensatoryHistoryRow => {
    const date =
      request.requestedDate ??
      request.compensatoryDate ??
      request.submittedAt ??
      dateValue(request.createdAt);
    const amount = request.requestedMinutes ?? null;
    const details = [
      request.requesterName,
      amount === null
        ? request.hours
          ? `Solicitado: ${request.hours} h`
          : ""
        : `Solicitado: ${amount} min`,
      request.phase ? `Estado: ${compensatoryRequestPhaseLabel(request.phase, request.requestedDate, serviceDay)}` : "",
      request.decisionReason,
      request.cancellationReason,
    ]
      .filter(Boolean)
      .join(" · ");
    return {
      id: `request:${request.id}`,
      kind: "request",
      date,
      year: yearOf(date),
      label: "Solicitud",
      details,
      snapshotMinutes: null,
      balanceImpactMinutes: null,
      actor: request.requesterName ?? "",
      revision: null,
      sourceId: request.id,
    };
  });

  return [...periodRows, ...movementRows, ...requestRows].sort(
    (a, b) => b.date.localeCompare(a.date) || b.id.localeCompare(a.id),
  );
}

function csvCell(value: string | number | null) {
  let safe = String(value ?? "");
  if (/^[\s\u0000-\u001f]*[=+\-@]/.test(safe)) safe = `'${safe}`;
  return `"${safe.replace(/"/g, '""')}"`;
}

export function buildCompensatoryHistoryCsv(rows: readonly CompensatoryHistoryRow[]) {
  const header = [
    "Tipo",
    "Fecha",
    "Detalle",
    "Snapshot neto (min)",
    "Impacto real en saldo (min)",
    "Actor",
    "Revisión",
  ];
  const typeNames = { period: "Período", movement: "Movimiento", request: "Solicitud" };
  return [
    header.map(csvCell).join(","),
    ...rows.map((row) =>
      [
        typeNames[row.kind],
        row.date,
        row.details,
        row.snapshotMinutes,
        row.balanceImpactMinutes === null ? "Sin efecto contable" : row.balanceImpactMinutes,
        row.actor,
        row.revision,
      ]
        .map(csvCell)
        .join(","),
    ),
  ].join("\r\n");
}
