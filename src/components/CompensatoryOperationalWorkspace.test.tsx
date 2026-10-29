import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { CompensatoryOperationalWorkspace } from "./CompensatoryOperationalWorkspace";
import { CompensatoryBankPanel } from "./CompensatoryBankPanel";

describe("CompensatoryOperationalWorkspace", () => {
  it("renders compact navigation without duplicating the page title", () => {
    const html = renderToStaticMarkup(<CompensatoryOperationalWorkspace initialStaff={[]} />);
    expect(html).toContain('aria-label="Actualizar solicitudes"');
    expect(html).toContain('role="tablist"');
    expect(html).toContain("Pendientes");
    expect(html).toContain("Programados");
    expect(html).toContain("Historial");
    expect(html).not.toContain(">Compensatorios</h");
    expect(html).not.toContain("Aprobar solicitud");
  });
  it("keeps the existing movement form isolated from unrelated agent actions", () => {
    const html = renderToStaticMarkup(
      <CompensatoryBankPanel
        initialStaff={[
          {
            id: "staff-one",
            dni: "00000001",
            name: "Synthetic Agent",
            email: null,
            isActive: true,
            balanceMinutes: 120,
            monthlyLimitMinutes: 1440,
            version: 1,
            createdAt: "2026-10-01",
          },
        ]}
        initialSelectedId="staff-one"
        tool="movement"
      />,
    );
    expect(html).toContain("movement-kind");
    expect(html).not.toContain("new-dni");
    expect(html).not.toContain("profile-name");
    expect(html).not.toContain('id="staff-select"');
    expect(html).not.toContain(">Compensatorios</h");
  });
  it("retains the standalone import workflow without the old bank navigation", () => {
    const html = renderToStaticMarkup(<CompensatoryBankPanel initialStaff={[]} tool="import" />);
    expect(html).toContain("source-requests");
    expect(html).toContain("source-roster");
    expect(html).not.toContain("movement-kind");
    expect(html).not.toContain(">Compensatorios</h");
  });
});
