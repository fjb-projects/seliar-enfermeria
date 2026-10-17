// Pure situational summary for the coordination area. It is the seed of the future statistics
// section, so it stays free of React and server dependencies.
import { guardDateKey } from "@/lib/efa-coordination-filters";

type GuardTotals = { episodes: { draft: number; closed: number; cancelled: number } };
type SummarizedGuard = {
  startedAt: Date | string;
  endedAt: Date | string | null;
  totals: GuardTotals;
};

export type CoordinationSummary = {
  /** Guards without an end. */
  openNow: number;
  /** Guards that started, ended or are still running on today's Buenos Aires calendar day. */
  guardsToday: number;
  /** Every service of today's guards, cancelled ones included. */
  servicesToday: number;
};

/** Services registered in one guard, matching the per-guard "Servicios" figure. */
export function guardServiceCount(totals: GuardTotals) {
  const { draft, closed, cancelled } = totals.episodes;
  return draft + closed + cancelled;
}

/** A guard touches a day when it started on or before it and is open or ended on or after it. */
function touchesDay(guard: SummarizedGuard, day: string) {
  if (guardDateKey(guard.startedAt) > day) return false;
  return !guard.endedAt || guardDateKey(guard.endedAt) >= day;
}

export function summarizeGuards(
  guards: readonly SummarizedGuard[],
  now: Date,
): CoordinationSummary {
  const today = guardDateKey(now);
  const todays = guards.filter((guard) => touchesDay(guard, today));
  return {
    openNow: guards.filter((guard) => !guard.endedAt).length,
    guardsToday: todays.length,
    servicesToday: todays.reduce((sum, guard) => sum + guardServiceCount(guard.totals), 0),
  };
}
