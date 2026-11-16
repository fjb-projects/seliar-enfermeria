export const compensatoryMonthNames = [
  "Enero",
  "Febrero",
  "Marzo",
  "Abril",
  "Mayo",
  "Junio",
  "Julio",
  "Agosto",
  "Septiembre",
  "Octubre",
  "Noviembre",
  "Diciembre",
];

type ExportStaff = { id: string; name: string };
type ExportPeriod = { year: number; month: number | null; netMinutes: number; status: string };
type PeriodResult = { periods: ExportPeriod[]; registeredTakenByMonth?: Record<string, number> };
export type CompensatoryExport = {
  year: number;
  months: number[];
  rows: { name: string; minutes: (number | null)[]; totalMinutes: number | null }[];
  warnings: string[];
};

export function exportMonths(
  year: number,
  mode: "to-date" | "selected",
  selected: number[],
  serviceDay: string,
) {
  const currentYear = Number(serviceDay.slice(0, 4));
  const currentMonth = Number(serviceDay.slice(5, 7));
  if (!Number.isInteger(year) || year < 2024 || year > currentYear)
    throw new Error("Selecciona un año entre 2024 y el año actual.");
  if (year < 2026) return [];
  const months =
    mode === "to-date"
      ? Array.from({ length: year === currentYear ? currentMonth : 12 }, (_, index) => index + 1)
      : [...new Set(selected)].sort((a, b) => a - b);
  if (!months.length || months.some((month) => !Number.isInteger(month) || month < 1 || month > 12))
    throw new Error("Selecciona al menos un mes válido.");
  return months;
}

export function buildCompensatoryExport(
  year: number,
  months: number[],
  staff: ExportStaff[],
  results: Record<string, PeriodResult>,
): CompensatoryExport {
  const warnings: string[] = [];
  const rows = [...staff]
    .sort((a, b) => a.name.localeCompare(b.name, "es"))
    .map((person) => {
      const result = results[person.id];
      if (!result) throw new Error(`No se pudieron leer los períodos de ${person.name}.`);
      const active = result.periods.filter(
        (period) => period.status === "active" && period.year === year,
      );
      const byMonth = new Map<number | null, number>();
      for (const period of active) {
        if (byMonth.has(period.month))
          throw new Error(
            `Hay períodos activos duplicados para ${person.name}. Revisa su historial.`,
          );
        byMonth.set(period.month, period.netMinutes);
      }
      const minutes = months.map((month) => {
        if (!byMonth.has(month) && (result.registeredTakenByMonth?.[String(month)] ?? 0) !== 0)
          warnings.push(
            `${person.name} · ${compensatoryMonthNames[month - 1]}: hay consumos sin liquidación mensual; no se incluyen en el total.`,
          );
        return byMonth.get(month) ?? null;
      });
      const known = minutes.filter((value): value is number => value !== null);
      const totalMinutes =
        year < 2026
          ? (byMonth.get(null) ?? null)
          : known.length
            ? known.reduce((sum, value) => sum + value, 0)
            : null;
      return { name: person.name, minutes, totalMinutes };
    });
  return { year, months, rows, warnings };
}

export async function loadCompensatoryExport(
  year: number,
  months: number[],
  api: {
    listStaff: (input: { data: Record<string, never> }) => Promise<ExportStaff[]>;
    listPeriods: (input: { data: { staffId: string; year: number } }) => Promise<PeriodResult>;
  },
) {
  const staff = await api.listStaff({ data: {} });
  if (!staff.length) throw new Error("No hay agentes registrados para exportar.");
  const results: Record<string, PeriodResult> = {};
  let next = 0;
  const workers = await Promise.allSettled(
    Array.from({ length: Math.min(4, staff.length) }, async () => {
      while (next < staff.length) {
        const person = staff[next++]!;
        results[person.id] = await api.listPeriods({ data: { staffId: person.id, year } });
      }
    }),
  );
  const failure = workers.find((worker) => worker.status === "rejected");
  if (failure?.status === "rejected") throw failure.reason;
  return buildCompensatoryExport(year, months, staff, results);
}
