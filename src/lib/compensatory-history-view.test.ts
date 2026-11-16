import { describe, expect, it } from "vitest";
import {
  buildCompensatoryHistoryRows,
  buildCompensatoryHistoryCsv,
  canReverseCompensatoryHistoryMovement,
  compensatoryRequestActionLabel,
  compensatoryRequestPhaseLabel,
  isExpiredPendingRequest,
  type CompensatoryHistoryPeriod,
} from "./compensatory-history-view";

const period: CompensatoryHistoryPeriod = {
  id: "period-1",
  year: 2026,
  month: 4,
  generatedMinutes: 600,
  externalTakenMinutes: 120,
  registeredTakenMinutes: 0,
  netMinutes: 480,
  effectiveDate: "2026-04-30",
  reason: "Abril",
  actorName: "Coordinación",
  createdAt: "2026-05-01T12:00:00.000Z",
  revision: 2,
  status: "reversed",
  reversedAt: "2026-05-02T12:00:00.000Z",
  reversedByName: "Administración",
  reversalReason: "Corrección autorizada",
};

describe("compensatory history view model", () => {
  it("combines linked period ledger effects into one row and keeps the snapshot distinct", () => {
    const rows = buildCompensatoryHistoryRows({
      periods: [period],
      entries: [
        {
          id: "ledger-record",
          compensatoryPeriodId: period.id,
          periodEffect: "record",
          minutes: 480,
        },
        {
          id: "ledger-reversal",
          compensatoryPeriodId: period.id,
          periodEffect: "reversal",
          minutes: -480,
        },
      ],
      requests: [],
    });

    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      kind: "period",
      snapshotMinutes: 480,
      balanceImpactMinutes: 0,
    });
    expect(rows[0]?.details).toContain("Corrección autorizada");
  });

  it("keeps request rows distinct from balance effects and exports safe filtered CSV", () => {
    const rows = buildCompensatoryHistoryRows({
      periods: [],
      entries: [],
      requests: [
        {
          id: "request-1",
          requesterName: '=HYPERLINK("x")',
          compensatoryDate: "2026-04-10",
          submittedAt: "2026-04-01",
          createdAt: "2026-04-01T12:00:00.000Z",
          hours: "2",
          requestedMinutes: 120,
          requestedDate: "2026-04-10",
          phase: "pending",
        },
      ],
    });

    expect(rows[0]).toMatchObject({ kind: "request", balanceImpactMinutes: null });
    const csv = buildCompensatoryHistoryCsv(rows);
    expect(csv).toContain('"Snapshot neto (min)","Impacto real en saldo (min)"');
    expect(csv).toContain("'=HYPERLINK(");
    expect(csv).toContain("Sin efecto contable");
  });

  it("allows generic reversal only for an unreversed manual movement", () => {
    const manual = { id: "manual-1", kind: "debit", minutes: -60, compensatoryPeriodId: null };
    expect(canReverseCompensatoryHistoryMovement(manual, [manual])).toBe(true);
    expect(
      canReverseCompensatoryHistoryMovement(
        { ...manual, id: "consumption", kind: "request_consumption" },
        [{ ...manual, id: "consumption", kind: "request_consumption" }],
      ),
    ).toBe(false);
    expect(
      canReverseCompensatoryHistoryMovement(
        { ...manual, id: "period", compensatoryPeriodId: "period-1", periodEffect: "record" },
        [],
      ),
    ).toBe(false);
    expect(
      canReverseCompensatoryHistoryMovement({ ...manual, id: "already-reversed" }, [
        { ...manual, id: "already-reversed" },
        { id: "reversal", kind: "reversal", minutes: 60, reversesEntryId: "already-reversed" },
      ]),
    ).toBe(false);
    expect(canReverseCompensatoryHistoryMovement({ ...manual, kind: "reversal" }, [])).toBe(false);
  });

  it("shows Spanish request states and offers review only while classification is open", () => {
    expect(compensatoryRequestPhaseLabel("unclassified")).toBe("Sin resolución registrada");
    expect(compensatoryRequestPhaseLabel("pending")).toBe("Pendiente de decisión");
    expect(compensatoryRequestPhaseLabel("approved")).toBe("Aprobada · consumo programado");
    expect(compensatoryRequestActionLabel("unclassified")).toBe("Revisar solicitud");
    expect(compensatoryRequestActionLabel("pending")).toBe("Revisar solicitud");
    expect(compensatoryRequestActionLabel("consumed")).toBe("Ver solicitud");
  });
  it("classifies expired pending requests using the supplied service day only", () => {
    const request = { phase: "pending", requestedDate: "2026-11-04" };
    expect(isExpiredPendingRequest(request, "2026-11-05")).toBe(true);
    expect(isExpiredPendingRequest(request, "2026-11-04")).toBe(false);
    expect(isExpiredPendingRequest(request, "2026-11-03")).toBe(false);
    expect(isExpiredPendingRequest({ ...request, phase: "approved" }, "2026-11-05")).toBe(false);
    expect(isExpiredPendingRequest({ phase: "pending", requestedDate: null }, "2026-11-05")).toBe(false);
    expect(isExpiredPendingRequest(request, undefined)).toBe(false);
    expect(compensatoryRequestPhaseLabel("pending", request.requestedDate, "2026-11-05")).toBe("Sin resolución · Fecha vencida");
    expect(compensatoryRequestActionLabel("pending", request.requestedDate, "2026-11-05")).toBe("Ver solicitud");
    const rows = buildCompensatoryHistoryRows({ periods: [], entries: [], requests: [{ id: "expired", ...request }], serviceDay: "2026-11-05" });
    expect(rows[0]?.details).toContain("Sin resolución · Fecha vencida");
    expect(rows[0]?.balanceImpactMinutes).toBeNull();
    expect(request.phase).toBe("pending");
  });
});
