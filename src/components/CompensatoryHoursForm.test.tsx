import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { CompensatoryHoursForm, type CompensatoryHoursApi } from "./CompensatoryHoursForm";
import type { StaffView } from "@/lib/compensatory-bank.functions";

const staff: StaffView = {
  id: "staff-1",
  dni: "12345678",
  name: "Agente de prueba",
  email: null,
  isActive: true,
  monthlyLimitMinutes: 600,
  version: 1,
  balanceMinutes: 300,
  createdAt: "2026-01-01T00:00:00.000Z",
};

const api: CompensatoryHoursApi = {
  getHistory: async () => ({ entries: [], changes: [] }),
  recordMovement: async () => ({ id: "movement-1" }),
  listPeriods: async () => ({ periods: [], registeredTakenByMonth: {} }),
  recordPeriod: async () => ({ id: "period-1" }),
};

describe("CompensatoryHoursForm", () => {
  it("starts with one compact mode choice and the Datos to Revisar flow", () => {
    const html = renderToStaticMarkup(
      <CompensatoryHoursForm staff={staff} onSaved={() => undefined} api={api} />,
    );

    expect(html).toContain('aria-label="Gestionar horas de Agente de prueba"');
    expect(html).not.toContain("<h2>Gestionar horas</h2>");
    expect(html).toContain("Paso 1 de 2 · Datos");
    expect(html).toContain("Liquidación por período");
    expect(html).toContain("Ajuste manual");
    expect(html).toContain("Horas generadas");
    expect(html).toContain("Horas externas tomadas");
    expect(html).toContain("no se descuentan otra vez");
    expect(html).toContain("Revisar");
    expect(html).not.toContain("Historial de movimientos");
    expect(html).not.toContain("<table");
  });
});
