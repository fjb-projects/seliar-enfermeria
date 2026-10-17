import { describe, expect, it } from "vitest";
import { guardServiceCount, summarizeGuards } from "./efa-coordination-summary";

const totals = (draft = 0, closed = 0, cancelled = 0) => ({
  episodes: { draft, closed, cancelled },
});

const guard = (startedAt: string, endedAt: string | null, services = totals()) => ({
  startedAt,
  endedAt,
  totals: services,
});

// 16/10/2026 14:00 in Buenos Aires (UTC-3).
const now = new Date("2026-10-16T17:00:00.000Z");

describe("coordination summary", () => {
  it("counts every service of a guard, cancelled included", () => {
    expect(guardServiceCount(totals(1, 2, 3))).toBe(6);
    expect(guardServiceCount(totals())).toBe(0);
  });

  it("is empty without guards", () => {
    expect(summarizeGuards([], now)).toEqual({ openNow: 0, guardsToday: 0, servicesToday: 0 });
  });

  it("counts open guards and the guards that touch today in Buenos Aires", () => {
    const summary = summarizeGuards(
      [
        // Open since yesterday evening: still today's work.
        guard("2026-10-15T22:00:00.000Z", null, totals(1, 1, 0)),
        // Started and ended today.
        guard("2026-10-16T11:00:00.000Z", "2026-10-16T15:00:00.000Z", totals(0, 2, 1)),
        // Ended after midnight in Buenos Aires (00:30 on the 16th).
        guard("2026-10-15T12:00:00.000Z", "2026-10-16T03:30:00.000Z", totals(0, 1, 0)),
        // Ended at 23:30 on the 15th in Buenos Aires, although it is the 16th in UTC.
        guard("2026-10-15T12:00:00.000Z", "2026-10-16T02:30:00.000Z", totals(0, 5, 0)),
        // An older guard.
        guard("2026-10-10T11:00:00.000Z", "2026-10-10T19:00:00.000Z", totals(0, 4, 0)),
      ],
      now,
    );

    expect(summary).toEqual({ openNow: 1, guardsToday: 3, servicesToday: 6 });
  });
});
