import { describe, expect, it, vi } from "vitest";
import {
  buildCompensatoryExport,
  exportMonths,
  loadCompensatoryExport,
} from "./compensatory-export";

const period = (month: number | null, netMinutes: number, status = "active") => ({
  year: 2026,
  month,
  netMinutes,
  status,
});
const staff = [
  { id: "b", name: "Zeta" },
  { id: "a", name: "Álvarez" },
];

describe("consolidated compensatory export", () => {
  it("selects months chronologically or the annual extract using the service day", () => {
    expect(exportMonths(2026, "selected", [3, 1, 3], "2026-11-11")).toEqual([1, 3]);
    expect(exportMonths(2026, "to-date", [], "2026-03-01")).toEqual([1, 2, 3]);
    expect(exportMonths(2025, "to-date", [], "2026-03-01")).toEqual([]);
    expect(() => exportMonths(2026, "selected", [], "2026-11-11")).toThrow();
    expect(() => exportMonths(2026, "selected", [13], "2026-11-11")).toThrow();
    expect(() => exportMonths(2027, "to-date", [], "2026-11-11")).toThrow();
  });

  it("includes all agents, uses active monthly net unchanged and totals only selected months", () => {
    const report = buildCompensatoryExport(2026, [1, 3], staff, {
      a: { periods: [period(1, 90), period(2, 600), period(3, -30), period(1, 999, "reversed")] },
      b: { periods: [] },
    });
    expect(report.rows).toEqual([
      { name: "Álvarez", minutes: [90, -30], totalMinutes: 60 },
      { name: "Zeta", minutes: [null, null], totalMinutes: null },
    ]);
  });

  it("distinguishes zero from missing liquidations and warns about unliquidated consumption", () => {
    const report = buildCompensatoryExport(2026, [1, 2], staff, {
      a: { periods: [period(1, 0)], registeredTakenByMonth: { "1": 60, "2": 120 } },
      b: { periods: [] },
    });
    expect(report.rows[0]).toEqual({ name: "Álvarez", minutes: [0, null], totalMinutes: 0 });
    expect(report.warnings.join(" ")).toContain("Álvarez");
    expect(report.warnings.join(" ")).toContain("Febrero");
  });

  it("exports historical annual net without inventing monthly history", () => {
    const report = buildCompensatoryExport(2024, [], staff, {
      a: { periods: [{ ...period(null, 721), year: 2024 }] },
      b: { periods: [] },
    });
    expect(report.months).toEqual([]);
    expect(report.rows[0]?.totalMinutes).toBe(721);
    expect(report.rows[1]?.totalMinutes).toBeNull();
  });

  it("refuses ambiguous active periods rather than silently picking or summing duplicates", () => {
    expect(() =>
      buildCompensatoryExport(2026, [1], staff, {
        a: { periods: [period(1, 60), period(1, 120)] },
        b: { periods: [] },
      }),
    ).toThrow(/duplicad/i);
  });

  it("fetches a fresh complete roster and never creates a partial file after a read failure", async () => {
    const api = {
      listStaff: vi.fn(async () => staff),
      listPeriods: vi.fn(async ({ data }: { data: { staffId: string; year: number } }) => {
        if (data.staffId === "b") throw new Error("Lectura fallida");
        return { periods: [period(1, 60)] };
      }),
    };
    await expect(loadCompensatoryExport(2026, [1], api)).rejects.toThrow("Lectura fallida");
    expect(api.listStaff).toHaveBeenCalledOnce();
    expect(api.listPeriods).toHaveBeenCalledWith({ data: { staffId: "a", year: 2026 } });
  });
});
