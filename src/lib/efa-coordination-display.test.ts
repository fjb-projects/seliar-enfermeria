import { describe, expect, it } from "vitest";
import {
  dispatchBreakdown,
  formatCompactDateTime,
  formatGuardSpan,
  formatRelativeElapsed,
  guardMetrics,
  initials,
  metricDisplay,
  ownerColor,
  ownerGroupSummary,
  ownerPalette,
  serviceBreakdown,
  shortName,
  sortGuardsOpenFirst,
} from "./efa-coordination-display";

const totals = (draft = 0, closed = 0, cancelled = 0, dispatches = 0, cancelledDispatches = 0) => ({
  episodes: { draft, closed, cancelled },
  dispatches: { total: dispatches, cancelled: cancelledDispatches },
});

describe("owner identity", () => {
  it("gives each user a stable color from the palette", () => {
    expect(ownerColor("ana")).toBe(ownerColor("ana"));
    expect(ownerPalette).toContain(ownerColor("ana"));
    const ids = ["ana", "bruno", "carla", "diego", "elena", "fede", "gabi", "hugo"];
    expect(new Set(ids.map(ownerColor)).size).toBeGreaterThan(2);
  });

  it("builds initials from the first and last names", () => {
    expect(initials("Ana Pérez")).toBe("AP");
    expect(initials("  maría del Carmen López ")).toBe("ML");
    expect(initials("Ana")).toBe("A");
    expect(initials("")).toBe("?");
  });

  it("shortens names to the first name and the last initial", () => {
    expect(shortName("Ana Pérez")).toBe("Ana P.");
    expect(shortName("María del Carmen López")).toBe("María L.");
    expect(shortName("Ana")).toBe("Ana");
  });
});

describe("guard order and times", () => {
  it("puts open guards first and then the newest", () => {
    const guards = [
      { id: "old", startedAt: "2026-10-07T11:00:00.000Z", endedAt: "2026-10-07T19:00:00.000Z" },
      { id: "open-old", startedAt: "2026-10-05T11:00:00.000Z", endedAt: null },
      { id: "new", startedAt: "2026-10-09T11:00:00.000Z", endedAt: "2026-10-09T19:00:00.000Z" },
      { id: "open-new", startedAt: "2026-10-08T11:00:00.000Z", endedAt: null },
    ];
    expect(sortGuardsOpenFirst(guards).map((guard) => guard.id)).toEqual([
      "open-new",
      "open-old",
      "new",
      "old",
    ]);
    expect(guards[0]!.id).toBe("old");
  });

  it("describes the elapsed time since a start", () => {
    const now = new Date("2026-10-16T17:00:00.000Z");
    expect(formatRelativeElapsed("2026-10-16T16:59:40.000Z", now)).toBe("recién");
    expect(formatRelativeElapsed("2026-10-16T16:45:00.000Z", now)).toBe("hace 15 min");
    expect(formatRelativeElapsed("2026-10-16T14:50:00.000Z", now)).toBe("hace 2 h");
    expect(formatRelativeElapsed("2026-10-13T17:00:00.000Z", now)).toBe("hace 3 d");
  });

  it("formats compact Buenos Aires dates and guard spans", () => {
    expect(formatCompactDateTime("2026-10-09T11:00:00.000Z")).toBe("09/10 08:00");
    expect(formatGuardSpan("2026-10-09T11:00:00.000Z", "2026-10-09T19:30:00.000Z")).toBe(
      "09/10 08:00 → 16:30",
    );
    expect(formatGuardSpan("2026-10-09T23:00:00.000Z", "2026-10-10T11:00:00.000Z")).toBe(
      "09/10 20:00 → 10/10 08:00",
    );
    expect(formatGuardSpan("2026-10-09T11:00:00.000Z", null)).toBe("09/10 08:00 → …");
  });
});

describe("guard metrics", () => {
  it("reads zero as a muted dash", () => {
    expect(metricDisplay(0)).toBe("—");
    expect(metricDisplay(7)).toBe("7");
  });

  it("explains the service and dispatch figures", () => {
    expect(serviceBreakdown(totals(1, 2, 0))).toBe("1 en borrador · 2 cerrados · 0 cancelados");
    expect(serviceBreakdown(totals())).toBeNull();
    expect(dispatchBreakdown(totals(0, 0, 0, 3, 1))).toBe("1 cancelado");
    expect(dispatchBreakdown(totals(0, 0, 0, 3, 0))).toBeNull();
  });

  it("summarizes the guards of one owner", () => {
    const guards = [
      { endedAt: null, totals: totals(1, 2, 0) },
      { endedAt: "2026-10-08T19:00:00.000Z", totals: totals(0, 3, 0) },
      { endedAt: "2026-10-07T19:00:00.000Z", totals: totals() },
    ];
    expect(ownerGroupSummary(guards)).toBe("3 guardias · 1 en curso · 6 servicios");
    expect(ownerGroupSummary([guards[2]!])).toBe("1 guardia · 0 servicios");
    expect(ownerGroupSummary([{ endedAt: null, totals: totals(0, 1, 0) }])).toBe(
      "1 guardia · 1 en curso · 1 servicio",
    );
  });
});

describe("guard metric columns", () => {
  it("lists services, dispatches, arrivals and hygiene with their breakdowns", () => {
    expect(
      guardMetrics({ ...totals(1, 2, 0, 3, 1), mobileArrivals: 2, hygienePeriods: 0 }),
    ).toEqual([
      {
        id: "services",
        label: "Servicios",
        value: 3,
        detail: "1 en borrador · 2 cerrados · 0 cancelados",
      },
      { id: "dispatches", label: "Despachos", value: 3, detail: "1 cancelado" },
      { id: "arrivals", label: "Arribos", value: 2, detail: null },
      { id: "hygiene", label: "Higiene", value: 0, detail: null },
    ]);
  });
});
