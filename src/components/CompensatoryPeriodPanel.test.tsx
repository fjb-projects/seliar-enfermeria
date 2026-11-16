import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { CompensatoryPeriodPanel, parsePeriodMinutes } from "./CompensatoryPeriodPanel";

describe("compensatory period history", () => {
  it("validates integer hours and minute values before submitting", () => {
    expect(parsePeriodMinutes("24", "0")).toBe(1440);
    expect(parsePeriodMinutes("0", "59")).toBe(59);
    expect(parsePeriodMinutes("1.5", "0")).toBeNull();
    expect(parsePeriodMinutes("1", "60")).toBeNull();
    expect(parsePeriodMinutes("-1", "0")).toBeNull();
  });

  it("offers a reconciled annual net without inventing a generated/taken breakdown", () => {
    const html = renderToStaticMarkup(
      <CompensatoryPeriodPanel staffId="staff-1" initialYear={2024} />,
    );

    expect(html).toContain("Historial por período");
    expect(html).toContain("Saldo anual neto");
    expect(html).toContain("2024");
    expect(html).toContain("2025");
    expect(html).not.toContain("Horas generadas</legend>");
    expect(html).not.toContain("Horas externas tomadas</legend>");
    expect(html).toContain("Filtrar por año");
  });

  it("offers monthly generated and external taken amounts with no double-deduction claim", () => {
    const html = renderToStaticMarkup(<CompensatoryPeriodPanel staffId="staff-1" initialYear={2026} />);

    expect(html).toContain("Horas generadas");
    expect(html).toContain("Horas externas tomadas");
    expect(html).toContain("Los consumos registrados por el sistema son informativos");
    expect(html).toContain("no se descuentan nuevamente del saldo");
  });

  it("renders period rows with system-recorded consumption separate from net", () => {
    const html = renderToStaticMarkup(
      <CompensatoryPeriodPanel
        staffId="staff-1"
        initialPeriods={[
          {
            id: "period-1",
            year: 2026,
            month: 8,
            generatedMinutes: 1440,
            externalTakenMinutes: 0,
            registeredTakenMinutes: 720,
            netMinutes: 720,
            effectiveDate: "2026-08-31",
            reason: "Registro mensual",
            actorName: "Coordinación",
            createdAt: "2026-08-31T12:00:00Z",
            revision: 1,
            status: "active",
            reversedAt: null,
            reversedByName: null,
            reversalReason: null,
          },
        ]}
        initialRegisteredTakenByMonth={{ "8": 720 }}
      />,
    );

    expect(html).toContain("Agosto 2026");
    expect(html).toContain("Registradas por el sistema");
    expect(html).toContain("Horas netas del período");
    expect(html).toContain("24 h 0 min");
    expect(html).toContain("12 h 0 min");
  });

  it("exposes period revisions and an explicit audited reversal for active records", () => {
    const html = renderToStaticMarkup(
      <CompensatoryPeriodPanel
        staffId="staff-1"
        initialPeriods={[
          {
            id: "period-rev-1",
            year: 2026,
            month: 8,
            generatedMinutes: 1440,
            externalTakenMinutes: 0,
            registeredTakenMinutes: 0,
            netMinutes: 1440,
            effectiveDate: "2026-08-31",
            status: "reversed",
            revision: 1,
            reason: "Carga inicial",
            actorName: "Coordinación",
            createdAt: "2026-08-31T12:00:00Z",
            reversedAt: "2026-09-01T12:00:00Z",
            reversedByName: "Coordinación",
            reversalReason: "Corrección respaldada",
          },
          {
            id: "period-rev-2",
            year: 2026,
            month: 8,
            generatedMinutes: 1500,
            externalTakenMinutes: 0,
            registeredTakenMinutes: 0,
            netMinutes: 1500,
            effectiveDate: "2026-08-31",
            status: "active",
            revision: 2,
            reason: "Carga corregida",
            actorName: "Coordinación",
            createdAt: "2026-09-01T13:00:00Z",
            reversedAt: null,
            reversedByName: null,
            reversalReason: null,
          },
        ]}
      />,
    );

    expect(html).toContain("Revisión 1");
    expect(html).toContain("Revisión 2");
    expect(html).toContain("Revertido");
    expect(html).toContain("Corrección respaldada");
    expect(html).toContain("Revertir período");
  });
});
