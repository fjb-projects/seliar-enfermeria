export function getOperationalDate(date: Date) {
  if (!Number.isFinite(date.getTime())) throw new Error("La fecha de operación no es válida.");
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Argentina/Buenos_Aires",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const values: Record<string, string> = Object.fromEntries(
    parts.map(({ type, value }) => [type, value]),
  );
  return `${values["year"]}-${values["month"]}-${values["day"]}`;
}

export function addOperationalDays(date: string, days: number) {
  if (!/^\d{4}-\d{2}-\d{2}$/u.test(date) || !Number.isInteger(days))
    throw new Error("La fecha de operación no es válida.");
  const timestamp = Date.parse(`${date}T00:00:00.000Z`);
  if (!Number.isFinite(timestamp) || new Date(timestamp).toISOString().slice(0, 10) !== date)
    throw new Error("La fecha de operación no es válida.");
  return new Date(timestamp + days * 86_400_000).toISOString().slice(0, 10);
}

export function getOperationalDateRange(date: Date, daysAfter: number) {
  const from = getOperationalDate(date);
  return { from, to: addOperationalDays(from, daysAfter) };
}
