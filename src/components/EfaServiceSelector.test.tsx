import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { EfaServiceSelector, type ServiceSelectorItem } from "./EfaServiceSelector";

const item: ServiceSelectorItem = {
  id: "service-1",
  label: "Servicio de prueba",
  priority: "red",
  mobiles: [],
  status: "ready",
};

function render(items: ServiceSelectorItem[], canCreate = true) {
  return renderToStaticMarkup(
    <EfaServiceSelector
      items={items}
      selectedId="service-1"
      onSelect={vi.fn()}
      onCreate={vi.fn()}
      canCreate={canCreate}
      onHistory={vi.fn()}
      historyCount={3}
      onRetry={vi.fn()}
    />,
  );
}

describe("EfaServiceSelector", () => {
  it("reserves a compact rail and names the selected service without relying on color", () => {
    const markup = render([item]);
    expect(markup).toContain('data-service-selector="rail"');
    expect(markup).toContain("w-20");
    expect(markup).toContain('aria-pressed="true"');
    expect(markup).toContain("Servicio de prueba. Prioridad roja. Sin móvil asignado");
    expect(markup).toContain('data-priority="red"');
    expect(markup).toContain(">?</span>");
  });

  it("keeps all assigned mobiles accessible while abbreviating the compact label", () => {
    const markup = render([{ ...item, mobiles: ["Móvil 21", "Móvil 44", "Base Norte"] }]);
    expect(markup).toContain("Móvil 21");
    expect(markup).toContain(">21</span>");
    expect(markup).toContain(">+2</span>");
    expect(markup).toContain("Móviles: Móvil 21, Móvil 44, Base Norte");
    expect(markup).not.toContain(">?</span>");
  });

  it("uses a neutral priority before call metadata is known", () => {
    const markup = render([{ ...item, priority: null }]);
    expect(markup).toContain("Prioridad sin definir");
    expect(markup).toContain('data-priority="unknown"');
  });

  it("does not present loading as an unassigned mobile", () => {
    const markup = render([{ ...item, status: "loading" }]);
    expect(markup).toContain("Cargando móviles");
    expect(markup).toContain('aria-busy="true"');
    expect(markup).not.toContain(">?</span>");
  });

  it("shows an explicit retry action when service metadata fails", () => {
    const markup = render([{ ...item, status: "error" }]);
    expect(markup).toContain("No se pudieron cargar los móviles");
    expect(markup).toContain('aria-label="Reintentar Servicio de prueba"');
    expect(markup).not.toContain(">?</span>");
  });

  it("does not present a failed load as a service without priority", () => {
    const markup = render([{ ...item, priority: null, status: "error" }]);
    expect(markup).toContain('data-priority="unavailable"');
    expect(markup).toContain(">!</span>");
    expect(markup).not.toContain('data-priority="unknown"');
    expect(markup).toContain("Prioridad no disponible");
    expect(markup).toContain("No se pudieron cargar prioridad ni móviles");
    expect(markup).not.toContain("Prioridad sin definir");
  });

  it("keeps a known priority visible when only the mobiles failed to load", () => {
    const markup = render([{ ...item, priority: "red", status: "error" }]);
    expect(markup).toContain('data-priority="red"');
    expect(markup).toContain("No se pudieron cargar los móviles");
  });

  it("keeps create and history discoverable when there are no active services", () => {
    const markup = render([]);
    expect(markup).toContain("No hay servicios activos");
    expect(markup).toContain('aria-label="Crear servicio"');
    expect(markup).toContain('aria-label="Ver historial de servicios (3)"');
  });

  it("disables creation without hiding active services or history", () => {
    const markup = render([item], false);
    expect(markup).toMatch(/aria-label="Crear servicio"[^>]*disabled=""/);
    expect(markup).toContain("Servicio de prueba");
    expect(markup).toContain('aria-label="Ver historial de servicios (3)"');
  });

  it("reserves a fixed empty-message height so expansion cannot move the create action", () => {
    const markup = render([]);
    const emptyMessage = markup.match(/<p class="([^"]*)">No hay servicios activos<\/p>/);
    expect(emptyMessage).not.toBeNull();
    expect(emptyMessage?.[1]?.split(" ")).toContain("h-20");
  });

  it("keeps selection and retry targets at fixed heights across metadata states", () => {
    for (const status of ["ready", "loading", "error"] as const) {
      const markup = render([{ ...item, status }]);
      const buttons = [...markup.matchAll(/<button\b[^>]*>/g)].map(([tag]) => tag);
      const selection = buttons.find((tag) => tag.includes('aria-label="Servicio de prueba.'))!;
      const selectionClasses = selection.match(/class="([^"]*)"/)?.[1]?.split(" ") ?? [];
      expect(selectionClasses).toContain("h-14");
      expect(selectionClasses).not.toContain("h-auto");
      if (status === "error") {
        const retry = buttons.find((tag) => tag.includes('aria-label="Reintentar '))!;
        expect(retry.match(/class="([^"]*)"/)?.[1]?.split(" ")).toContain("h-11");
        expect(markup).toContain('<li class="flex flex-col gap-1">');
      }
    }
  });
});
