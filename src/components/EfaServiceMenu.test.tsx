import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { EfaServiceMenu, EfaServiceMenuContent } from "@/components/EfaServiceMenu";

const base = {
  capturedAt: "6/10/2026, 06:30:00",
  updatedAt: "6/10/2026, 06:45:00",
  version: 1,
  history: { disabled: false, onSelect: vi.fn() },
};

describe("EfaServiceMenu", () => {
  it("lists record details, history and edit for an editable service", () => {
    const html = renderToStaticMarkup(
      <EfaServiceMenuContent {...base} edit={{ disabled: false, onSelect: vi.fn() }} />,
    );
    expect(html).toContain("Capturado 6/10/2026, 06:30:00");
    expect(html).toContain("actualizado 6/10/2026, 06:45:00");
    expect(html).toContain("versión 1");
    expect(html).toContain("Ver historial");
    expect(html).toContain("Editar");
  });

  it("offers cancellation with its accessible name, and only when allowed", () => {
    const withCancel = renderToStaticMarkup(
      <EfaServiceMenuContent
        {...base}
        cancellation={{
          label: "Reactivar",
          ariaLabel: "Reactivar episodio Servicio",
          destructive: false,
          disabled: false,
          onSelect: vi.fn(),
        }}
      />,
    );
    expect(withCancel).toContain('aria-label="Reactivar episodio Servicio"');
    const readOnly = renderToStaticMarkup(<EfaServiceMenuContent {...base} />);
    expect(readOnly).not.toContain("Anular");
    expect(readOnly).not.toContain("Reactivar");
    expect(readOnly).not.toContain("Editar");
  });

  it("renders one labelled trigger and keeps the content closed", () => {
    const html = renderToStaticMarkup(<EfaServiceMenu {...base} />);
    expect(html).toContain('aria-label="Más acciones y detalles del servicio"');
    expect(html).not.toContain("Capturado");
  });
});
