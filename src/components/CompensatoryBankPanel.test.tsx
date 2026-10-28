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
    expect(html).toContain("no se crea una cuenta de acceso");
    expect(html).toContain("No hay movimientos registrados");
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

  it("offers manual hours and history without import, request, or delete controls", () => {
    const html = renderToStaticMarkup(<CompensatoryBankPanel initialStaff={[staff]} />);
    expect(html).toContain("Registrar horas");
    expect(html).toContain("Motivo y respaldo");
    expect(html).toContain("Historial de saldo");
    expect(html).not.toContain("Importar");
    expect(html).not.toContain("Aprobar solicitud");
    expect(html).not.toContain("Eliminar agente");
  });

  it("keeps the local review view mounted beside the bank and offers profile directory fields", () => {
    const html = renderToStaticMarkup(<CompensatoryBankPanel initialStaff={[staff]} />);
    expect(html).toContain("Revisar vinculaciones");
    expect(html).toContain("Volver al banco");
    expect(html).toContain("Datos laborales y contacto");
    expect(html).toContain("Función laboral");
    expect(html).toContain("Función operativa");
  });
});
