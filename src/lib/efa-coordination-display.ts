// Pure display helpers for the coordination guard list: user identity, order, compact times
// and numeric metrics. No React or server dependencies, so they are unit-tested directly.
import { guardDateKey } from "@/lib/efa-coordination-filters";
import { guardServiceCount } from "@/lib/efa-coordination-summary";
import { BUENOS_AIRES_TIME_ZONE } from "@/lib/efa-labels";

/** Avatar tones with AA contrast for the initials in light and dark themes. */
export const ownerPalette = [
  "bg-sky-100 text-sky-900 dark:bg-sky-900 dark:text-sky-100",
  "bg-emerald-100 text-emerald-900 dark:bg-emerald-900 dark:text-emerald-100",
  "bg-amber-100 text-amber-900 dark:bg-amber-900 dark:text-amber-100",
  "bg-rose-100 text-rose-900 dark:bg-rose-900 dark:text-rose-100",
  "bg-violet-100 text-violet-900 dark:bg-violet-900 dark:text-violet-100",
  "bg-teal-100 text-teal-900 dark:bg-teal-900 dark:text-teal-100",
  "bg-orange-100 text-orange-900 dark:bg-orange-900 dark:text-orange-100",
  "bg-indigo-100 text-indigo-900 dark:bg-indigo-900 dark:text-indigo-100",
] as const;

/** FNV-1a, so a user keeps the same tone on every render and device. */
function hash(value: string) {
  let result = 0x811c9dc5;
  for (let index = 0; index < value.length; index += 1) {
    result ^= value.charCodeAt(index);
    result = Math.imul(result, 0x01000193);
  }
  return result >>> 0;
}

export function ownerColor(userId: string) {
  return ownerPalette[hash(userId) % ownerPalette.length]!;
}

const nameParts = (name: string) => name.trim().split(/\s+/).filter(Boolean);

export function initials(name: string) {
  const parts = nameParts(name);
  if (parts.length === 0) return "?";
  const first = parts[0]!.charAt(0);
  const last = parts.length > 1 ? parts[parts.length - 1]!.charAt(0) : "";
  return `${first}${last}`.toLocaleUpperCase("es");
}

/** "Ana Pérez" → "Ana P.", so the table column stays narrow. */
export function shortName(name: string) {
  const parts = nameParts(name);
  if (parts.length < 2) return parts[0] ?? name;
  return `${parts[0]} ${parts[parts.length - 1]!.charAt(0).toLocaleUpperCase("es")}.`;
}

type TimedGuard = { startedAt: Date | string; endedAt: Date | string | null };

const time = (value: Date | string) => new Date(value).getTime();

/** Open guards first, then the most recent start; returns a new array. */
export function sortGuardsOpenFirst<T extends TimedGuard>(guards: readonly T[]): T[] {
  return [...guards].sort((left, right) => {
    const openOrder = Number(Boolean(left.endedAt)) - Number(Boolean(right.endedAt));
    return openOrder || time(right.startedAt) - time(left.startedAt);
  });
}

export function formatRelativeElapsed(start: Date | string, now: Date) {
  const minutes = Math.floor((now.getTime() - time(start)) / 60_000);
  if (minutes < 1) return "recién";
  if (minutes < 60) return `hace ${minutes} min`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `hace ${hours} h`;
  return `hace ${Math.floor(hours / 24)} d`;
}

const compactFormat = new Intl.DateTimeFormat("es-AR", {
  day: "2-digit",
  month: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
  timeZone: BUENOS_AIRES_TIME_ZONE,
});
const timeFormat = new Intl.DateTimeFormat("es-AR", {
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
  timeZone: BUENOS_AIRES_TIME_ZONE,
});

/** "09/10 08:00" in Buenos Aires time; built from parts because es-AR drops the day's zero. */
export function formatCompactDateTime(value: Date | string) {
  const parts = Object.fromEntries(
    compactFormat.formatToParts(new Date(value)).map((part) => [part.type, part.value]),
  );
  const pad = (part: string | undefined) => (part ?? "").padStart(2, "0");
  return `${pad(parts["day"])}/${pad(parts["month"])} ${pad(parts["hour"])}:${pad(parts["minute"])}`;
}

/** "09/10 08:00 → 16:30"; the end repeats the date only when the guard crossed midnight. */
export function formatGuardSpan(start: Date | string, end: Date | string | null) {
  const from = formatCompactDateTime(start);
  if (!end) return `${from} → …`;
  const to =
    guardDateKey(start) === guardDateKey(end)
      ? timeFormat.format(new Date(end))
      : formatCompactDateTime(end);
  return `${from} → ${to}`;
}

/** Zero reads as a muted dash so the non-zero figures stand out. */
export function metricDisplay(value: number) {
  return value ? String(value) : "—";
}

type ListTotals = {
  episodes: { draft: number; closed: number; cancelled: number };
  dispatches: { total: number; cancelled: number };
};

const plural = (count: number, singular: string, many: string) =>
  `${count} ${count === 1 ? singular : many}`;

export function serviceBreakdown(totals: ListTotals) {
  const { draft, closed, cancelled } = totals.episodes;
  if (!guardServiceCount(totals)) return null;
  return `${draft} en borrador · ${plural(closed, "cerrado", "cerrados")} · ${plural(cancelled, "cancelado", "cancelados")}`;
}

export function dispatchBreakdown(totals: ListTotals) {
  const { cancelled } = totals.dispatches;
  return cancelled ? plural(cancelled, "cancelado", "cancelados") : null;
}

/** "4 guardias · 1 en curso · 6 servicios" for an owner group header. */
export function ownerGroupSummary(
  guards: ReadonlyArray<{ endedAt: Date | string | null; totals: Pick<ListTotals, "episodes"> }>,
) {
  const open = guards.filter((guard) => !guard.endedAt).length;
  const services = guards.reduce((sum, guard) => sum + guardServiceCount(guard.totals), 0);
  return [
    plural(guards.length, "guardia", "guardias"),
    open ? `${open} en curso` : null,
    plural(services, "servicio", "servicios"),
  ]
    .filter(Boolean)
    .join(" · ");
}

export type GuardMetric = {
  id: "services" | "dispatches" | "arrivals" | "hygiene";
  label: string;
  value: number;
  /** Breakdown for a tooltip or title, when there is one. */
  detail: string | null;
};

/** The four numeric columns of a guard, in display order. */
export function guardMetrics(
  totals: ListTotals & { mobileArrivals: number; hygienePeriods: number },
): GuardMetric[] {
  return [
    {
      id: "services",
      label: "Servicios",
      value: guardServiceCount(totals),
      detail: serviceBreakdown(totals),
    },
    {
      id: "dispatches",
      label: "Despachos",
      value: totals.dispatches.total,
      detail: dispatchBreakdown(totals),
    },
    { id: "arrivals", label: "Arribos", value: totals.mobileArrivals, detail: null },
    { id: "hygiene", label: "Higiene", value: totals.hygienePeriods, detail: null },
  ];
}
