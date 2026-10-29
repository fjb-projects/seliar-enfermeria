import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { CompensatoryBankPanel, StaffAuditHistory } from "./CompensatoryBankPanel";
import type { StaffAuditView, StaffView } from "@/lib/compensatory-bank.functions";

const staff: StaffView = {
  id: "staff-1",
  dni: "30123456",
  name: "Ana Ejemplo",
  email: null,
  isActive: true,
  monthlyLimitMinutes: 1440,
  version: 1,
  balanceMinutes: 0,
  createdAt: "2026-10-27T12:00:00Z",
};

describe("compensatory bank panel", () => {
  it("shows staff identity, monthly reference, and no-login policy", () => {
    const html = renderToStaticMarkup(<CompensatoryBankPanel initialStaff={[staff]} />);
    expect(html).toContain("DNI");
    expect(html).toContain("Referencia mensual");
    expect(html).toContain("sin cuenta de acceso");
    expect(html).toContain("No hay movimientos registrados");
    expect(html).toContain("Solicitudes guardadas");
  });

  it("shows the actor, reason, and before/after values in the profile audit", () => {
    const change: StaffAuditView = {
      id: "audit-1",
      staffId: staff.id,
      actorUserId: "admin-1",
      actorName: "Coordinación",
      createdAt: "2026-10-27T13:00:00Z",
      reason: "Actualización de referencia mensual acordada",
      before: { monthlyLimitMinutes: 1440 },
      after: { monthlyLimitMinutes: 1530 },
    };
    const html = renderToStaticMarkup(<StaffAuditHistory changes={[change]} />);

    expect(html).toContain("Auditoría del perfil");
    expect(html).toContain("Coordinación");
    expect(html).toContain("Actualización de referencia mensual acordada");
    expect(html).toContain("Antes:");
    expect(html).toContain("{&quot;monthlyLimitMinutes&quot;:1440}");
    expect(html).toContain("Después:");
    expect(html).toContain("{&quot;monthlyLimitMinutes&quot;:1530}");
  });

  it("offers guarded deletion separately from deactivation and retains history warnings", () => {
    const html = renderToStaticMarkup(<CompensatoryBankPanel initialStaff={[staff]} />);
    expect(html).toContain("Registrar horas");
    expect(html).toContain("Motivo y respaldo");
    expect(html).toContain("Movimientos recientes");
    expect(html).toContain("Importar agentes seleccionados");
    expect(html).not.toContain("Aprobar solicitud");
    expect(html).toContain("Eliminar agente definitivamente");
    expect(html).toContain("Escribe el DNI exacto 30123456 para confirmar");
    expect(html).toContain("Motivo de la eliminación");
    expect(html).toContain("Si tiene historial, desactívalo para conservarlo.");
    expect(html).toContain('disabled=""');
  });

  it("keeps secondary bank sections collapsed by default", () => {
    const html = renderToStaticMarkup(<CompensatoryBankPanel initialStaff={[staff]} />);
    expect(html).toContain('id="staff-select" role="combobox"');
    expect(html).toContain('aria-label="Mostrar opciones de Seleccionar agente"');
    expect(html).toContain('<details class="');
    expect(html).not.toContain('<details open="">');
    expect(html).toContain("Movimientos recientes");
    expect(html).toContain("Auditoría");
  });

  it("keeps the local review view mounted beside the bank and offers profile directory fields", () => {
    const html = renderToStaticMarkup(<CompensatoryBankPanel initialStaff={[staff]} />);
    expect(html).toContain("Revisar vinculaciones");
    expect(html).toContain("Volver al banco");
    expect(html).toContain("Datos laborales y contacto");
    expect(html).toContain("Función laboral");
    expect(html).toContain("Función operativa");
    expect(html).toContain("Licenciatura");
  });
});
