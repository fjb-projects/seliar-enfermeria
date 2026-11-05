import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import type { StaffView } from "@/lib/compensatory-bank.functions";
import { CompensatoryAdminRequestForm } from "./CompensatoryAdminRequestForm";

const activeStaff: StaffView = {
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

describe("CompensatoryAdminRequestForm", () => {
  it("renders a compact Datos step with the selected agent context and request-only fields", () => {
    const html = renderToStaticMarkup(
      <CompensatoryAdminRequestForm
        staff={[activeStaff]}
        initialStaffId={activeStaff.id}
        onSaved={vi.fn()}
        api={{ createRequest: vi.fn(async () => ({ state: "submitted" as const })) }}
      />,
    );

    expect(html).toContain('aria-label="Cargar solicitud de compensatorios"');
    expect(html).toContain("Paso 1 de 2 · Datos");
    expect(html).toContain("Agente activo");
    expect(html).toContain("DNI 12345678");
    expect(html).toContain("Correo de contacto");
    expect(html).toContain("Fecha del servicio");
    expect(html).toContain("Motivo de la carga manual");
    expect(html).toContain("Revisar");
    expect(html).toContain("Móvil Flotante");
    expect(html).toContain("no aprueba ni reserva horas");
    expect(html).not.toContain("<h2");
    expect(html).not.toContain("<table");
    expect(html).not.toContain('role="dialog"');
  });

  it("does not expose inactive agents as selectable options", () => {
    const html = renderToStaticMarkup(
      <CompensatoryAdminRequestForm
        staff={[{ ...activeStaff, id: "inactive", name: "Agente inactivo", isActive: false }]}
        onSaved={vi.fn()}
        api={{ createRequest: vi.fn(async () => ({ state: "submitted" as const })) }}
      />,
    );

    expect(html).toContain('role="combobox"');
    expect(html).toContain('value=""');
    expect(html).not.toContain("Agente inactivo");
  });
});
