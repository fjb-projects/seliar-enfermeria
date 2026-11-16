import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import {
  CompensatoryWorkspaceScope,
  CompensatoryWorkspaceTabs,
  CompensatoryWorkspaceTabPanel,
  compensatoryWorkspacePanelId,
} from "./CompensatoryWorkspaceControls";

const staffOptions = [
  { id: "agent-1", label: "Laura Pérez · DNI 30123456" },
  { id: "agent-2", label: "Marcos Soto · DNI 30987654" },
];

describe("compensatory workspace controls", () => {
  it("renders controlled accessible tabs with stable panel wiring and desktop-sized labels", () => {
    const onValueChange = vi.fn();
    const html = renderToStaticMarkup(
      <>
        <CompensatoryWorkspaceTabs
          value="scheduled"
          onValueChange={onValueChange}
          idPrefix="requests"
        />
        <CompensatoryWorkspaceTabPanel value="scheduled" activeTab="scheduled" idPrefix="requests">
          Scheduled requests
        </CompensatoryWorkspaceTabPanel>
      </>,
    );

    expect(html).toContain('role="tablist" aria-label="Vistas de compensatorios"');
    expect(html).toContain('id="requests-tab-scheduled"');
    expect(html).toContain('aria-selected="true"');
    expect(html).toContain('aria-controls="requests-panel-scheduled"');
    expect(html).toContain('id="requests-panel-scheduled" role="tabpanel"');
    expect(html).toContain('aria-labelledby="requests-tab-scheduled"');
    expect(html).toContain("Pendientes");
    expect(html).toContain("Programados");
    expect(html).toContain("Historial");
    expect(onValueChange).not.toHaveBeenCalled();
  });

  it("exposes deterministic panel IDs and an externally controlled initial tab", () => {
    expect(compensatoryWorkspacePanelId("external", "history")).toBe("external-panel-history");
    const html = renderToStaticMarkup(
      <CompensatoryWorkspaceTabs value="history" onValueChange={() => undefined} />,
    );
    expect(html).toContain('id="compensatory-workspace-tab-history"');
    expect(html).toContain('aria-selected="true"');
  });

  it("renders a controlled general scope and preserves exact staff identity in the desktop picker", () => {
    const onSelect = vi.fn();
    const html = renderToStaticMarkup(
      <CompensatoryWorkspaceScope
        staffOptions={staffOptions}
        selectedStaffId="agent-2"
        onSelectStaff={onSelect}
      />,
    );

    expect(html).toContain('aria-label="Alcance de las solicitudes"');
    expect(html).toContain('value="agent-2" selected=""');
    expect(html).toContain("Marcos Soto · DNI 30987654");
    expect(html).toContain("Vista general");
    expect(onSelect).not.toHaveBeenCalled();
  });

  it("keeps tabs and scope controls disabled when the workspace is unavailable", () => {
    const html = renderToStaticMarkup(
      <>
        <CompensatoryWorkspaceTabs value="pending" onValueChange={() => undefined} disabled />
        <CompensatoryWorkspaceScope
          staffOptions={staffOptions}
          selectedStaffId="agent-1"
          onSelectStaff={() => undefined}
          disabled
        />
      </>,
    );
    expect((html.match(/disabled=""/g) ?? []).length).toBeGreaterThanOrEqual(4);
  });
});
