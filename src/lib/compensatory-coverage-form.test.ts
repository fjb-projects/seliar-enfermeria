import { describe, expect, it } from "vitest";
import {
  coverageStatusFor,
  formatArgentinaDateTime,
  formatCoverageHistorySnapshot,
  toArgentinaTimestamp,
  validateCoveragePlan,
} from "./compensatory-coverage-form";

describe("compensatory coverage form rules", () => {
  it("converts local coordination times with Argentina's explicit offset", () => {
    expect(toArgentinaTimestamp("2026-10-30T09:15")).toBe("2026-10-30T09:15:00-03:00");
    expect(toArgentinaTimestamp("2026-02-30T09:15")).toBeNull();
  });

  it("requires the plan to begin on the requested day and match its exact duration", () => {
    expect(
      validateCoveragePlan({
        requestedDate: "2026-10-30",
        requestedMinutes: 90,
        plannedStart: "2026-10-30T23:30",
        plannedEnd: "2026-10-31T01:00",
        assignments: [],
      }),
    ).toBeNull();
    expect(
      validateCoveragePlan({
        requestedDate: "2026-10-30",
        requestedMinutes: 90,
        plannedStart: "2026-10-31T00:00",
        plannedEnd: "2026-10-31T01:30",
        assignments: [],
      }),
    ).toContain("fecha solicitada");
  });

  it("keeps partial coverage distinct from confirmed coverage", () => {
    expect(coverageStatusFor(120, [])).toBe("pending");
    expect(coverageStatusFor(120, [{ start: 0, end: 120, confirmed: false }])).toBe("partial");
    expect(coverageStatusFor(120, [{ start: 0, end: 60, confirmed: true }])).toBe("partial");
    expect(
      coverageStatusFor(120, [
        { start: 0, end: 60, confirmed: true },
        { start: 60, end: 120, confirmed: true },
      ]),
    ).toBe("confirmed");
  });

  it("formats audit snapshots without internal identifiers", () => {
    const snapshot = formatCoverageHistorySnapshot({
      plannedStart: "2026-10-30T12:00:00.000Z",
      plannedEnd: "2026-10-30T13:30:00.000Z",
      status: "partial",
      assignments: [
        {
          staffName: "Ana Ejemplo",
          start: "2026-10-30T12:00:00.000Z",
          end: "2026-10-30T12:30:00.000Z",
          confirmed: true,
          verificationMethod: "Llamada",
        },
      ],
    });
    expect(snapshot).toEqual({
      plan: "30/10/2026, 09:00–10:30",
      status: "Falta confirmar parte del horario",
      emptyAssignmentsLabel: null,
      assignments: [
        {
          label: "Ana Ejemplo",
          interval: "30/10/2026, 09:00–09:30",
          confirmation: "Confirmada manualmente",
          verification: "Llamada",
        },
      ],
    });
    expect(JSON.stringify(snapshot)).not.toContain("private-staff-id");
  });

  it("labels empty audit plans without leaking the browser timezone", () => {
    const snapshot = formatCoverageHistorySnapshot({
      plannedStart: null,
      plannedEnd: null,
      status: "pending",
      assignments: [],
    });
    expect(snapshot.plan).toBe("Sin horario registrado");
    expect(snapshot.assignments).toEqual([]);
    expect(formatArgentinaDateTime("2026-10-30T12:00:00.000Z")).toBe("30/10/2026, 09:00");
  });
});
