export function ensureClientOperationId(
  currentId: string | null,
  createId: () => string = () => crypto.randomUUID(),
): string {
  return currentId ?? createId();
}

export function operationIdAfterIntentChange<T>(
  currentId: string | null,
  previousValue: T,
  nextValue: T,
): string | null {
  return Object.is(previousValue, nextValue) ? currentId : null;
}

export function localDateString(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function isPastCompensatoryDate(value: string, today = new Date()) {
  return /^\d{4}-\d{2}-\d{2}$/.test(value) && value < localDateString(today);
}

export function isWholeMinuteHours(value: string) {
  const normalized = value.trim();
  if (normalized.length > 100) return false;
  const match = /^(\d+)(?:[.,](\d+))?$/.exec(normalized);
  if (!match) return false;

  const fraction = match[2] ?? "";
  const denominator = 10n ** BigInt(fraction.length);
  const numeratorHours = BigInt(match[1]!) * denominator + BigInt(fraction || "0");
  const numeratorMinutes = numeratorHours * 60n;
  if (numeratorMinutes === 0n || numeratorMinutes % denominator !== 0n) return false;
  return numeratorMinutes / denominator <= 2_147_483_647n;
}

export function permanentSubmissionRejectionMessage(error: unknown): string | null {
  const message = error instanceof Error ? error.message : typeof error === "string" ? error : "";
  if (message.includes("La fecha solicitada no puede ser una fecha pasada.")) {
    return "La fecha quedó antes del día de servicio actual. Elegí hoy o una fecha posterior y volvé a revisar la solicitud.";
  }
  if (message.includes("La cantidad de horas debe equivaler a un número entero de minutos.")) {
    return "La cantidad debe equivaler a un número entero de minutos. Ajustá las horas (por ejemplo, 0,5) y volvé a revisar la solicitud.";
  }
  return null;
}
