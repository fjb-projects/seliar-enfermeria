export type PeriodPreviewInput = {
  generatedMinutes?: number | null;
  externalTakenMinutes?: number | null;
  annualNetMinutes?: number | null;
  registeredTakenMinutes: number;
};

export type PeriodPreview = {
  netMinutes: number;
  balanceDeltaMinutes: number;
  registeredTakenMinutes: number;
};

export type WorkflowOperation = { fingerprint: string; id: string };

export type BalanceReviewRow = { label: string; minutes: number };

export function buildBalanceReviewRows(input: {
  balanceMinutes: number;
  availableMinutes?: number;
  reservedMinutes?: number;
  monthlyReferenceMinutes?: number;
  balanceDeltaMinutes: number;
}): BalanceReviewRow[] {
  return [
    { label: "Saldo contable actual", minutes: input.balanceMinutes },
    ...(input.availableMinutes === undefined
      ? []
      : [{ label: "Disponible actual", minutes: input.availableMinutes }]),
    ...(input.reservedMinutes === undefined
      ? []
      : [{ label: "Reservado", minutes: input.reservedMinutes }]),
    { label: "Cambio exacto en el saldo", minutes: input.balanceDeltaMinutes },
    {
      label: "Saldo contable resultante",
      minutes: input.balanceMinutes + input.balanceDeltaMinutes,
    },
    ...(input.availableMinutes === undefined
      ? []
      : [
          {
            label: "Disponible resultante",
            minutes: input.availableMinutes + input.balanceDeltaMinutes,
          },
        ]),
    ...(input.monthlyReferenceMinutes === undefined || input.monthlyReferenceMinutes <= 0
      ? []
      : [{ label: "Referencia mensual", minutes: input.monthlyReferenceMinutes }]),
  ];
}

export function getWorkflowOperation(
  previous: WorkflowOperation | null,
  payload: unknown,
  createId: () => string,
): WorkflowOperation {
  const fingerprint = JSON.stringify(payload);
  return previous?.fingerprint === fingerprint ? previous : { fingerprint, id: createId() };
}

export function parseWorkflowMinutes(hours: string, minutes: string): number | null {
  if (!/^\d+$/.test(hours) || !/^\d+$/.test(minutes)) return null;
  const hourCount = Number(hours);
  const minuteCount = Number(minutes);
  if (!Number.isSafeInteger(hourCount) || !Number.isSafeInteger(minuteCount) || minuteCount > 59)
    return null;
  const total = hourCount * 60 + minuteCount;
  return Number.isSafeInteger(total) ? total : null;
}

export function calculatePeriodPreview(input: PeriodPreviewInput): PeriodPreview {
  const balanceDeltaMinutes =
    input.annualNetMinutes ?? (input.generatedMinutes ?? 0) - (input.externalTakenMinutes ?? 0);
  const netMinutes =
    input.annualNetMinutes === undefined || input.annualNetMinutes === null
      ? balanceDeltaMinutes - input.registeredTakenMinutes
      : balanceDeltaMinutes;
  return {
    netMinutes,
    balanceDeltaMinutes,
    registeredTakenMinutes: input.registeredTakenMinutes,
  };
}

export function validateManualMovement(input: {
  kind: "opening" | "credit" | "debit";
  minutes: number;
  balanceMinutes: number;
  hasMovements: boolean;
}): string | null {
  if (!Number.isSafeInteger(input.minutes) || input.minutes < 1)
    return "La cantidad debe ser de al menos un minuto.";
  if (input.kind === "opening" && input.hasMovements)
    return "El saldo inicial solo se puede registrar antes del primer movimiento.";
  if (input.kind === "debit" && input.minutes > input.balanceMinutes)
    return "El débito supera el saldo disponible.";
  return null;
}

export function formatWorkflowMinutes(totalMinutes: number): string {
  const sign = totalMinutes < 0 ? "−" : "";
  const absolute = Math.abs(totalMinutes);
  return `${sign}${Math.floor(absolute / 60)} h ${absolute % 60} min`;
}

export function getArgentinaToday(date = new Date()): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Argentina/Buenos_Aires",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const values = Object.fromEntries(parts.map(({ type, value }) => [type, value]));
  return `${values["year"]}-${values["month"]}-${values["day"]}`;
}
