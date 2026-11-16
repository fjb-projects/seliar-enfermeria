import { renderToStaticMarkup } from "react-dom/server";
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";
import { EfaPanelHome, type EfaPanelSummary } from "./EfaPanelHome";

vi.mock("@tanstack/react-router", () => ({
  Link: ({ to, children, ...props }: { to: string; children: ReactNode; [key: string]: unknown }) =>
    <a href={to} {...props}>{children}</a>,
}));

const summary = (value: Partial<EfaPanelSummary> = {}): EfaPanelSummary => ({
  canWrite: false,
  isAdmin: false,
  openGuard: null,
  ...value,
});
function render(value: EfaPanelSummary) {
  return renderToStaticMarkup(<EfaPanelHome summary={value} />);
}

describe("EfaPanelHome", () => {
  it("guides an EFA writer without a guard through the three steps", () => {
    const html = render(summary({ canWrite: true }));
    expect(html).toContain("Iniciar guardia EFA");
    expect(html).toContain("Registra cada atención");
    expect(html).toContain("Selecciona las bases");
    expect(html).toContain('href="/guardia-efa"');
  });

  it("prioritizes episode work when the writer has an open guard and shows only aggregate status", () => {
    const html = render(summary({
      canWrite: true,
      openGuard: { startedAt: "2026-10-06T10:00:00.000Z", baseCount: 2, activeEpisodeCount: 3 },
    }));
    expect(html).toContain("Registrar o continuar atenciones");
    expect(html).toContain("Bases y dotación");
    expect(html).toContain("2 bases");
    expect(html).toContain("3 atenciones activas");
    expect(html).not.toMatch(/address|motive|episodeId/);
    expect(html).toContain("min-h-11");
  });

  it("prioritizes own guard history and limits episode consultation to an open guard", () => {
    const html = render(summary());
    expect(html).toContain("Solo consulta");
    expect(html).toContain("no cuenta con permisos de escritura EFA");
    expect(html).toContain('href="/guardia-efa"');
    expect(html).toContain("Consultar mis guardias");
    expect(html).not.toContain('href="/episodios-efa"');
    expect(html).not.toContain("historial de guardias y episodios");
    expect(html).not.toContain("Iniciar guardia EFA");
  });

  it("keeps read-only home navigation focused on guard history even if an open guard is supplied", () => {
    const html = render(summary({
      openGuard: { startedAt: "2026-10-06T10:00:00.000Z", baseCount: 1, activeEpisodeCount: 2 },
    }));
    expect(html).toContain("Consultar mis guardias");
    expect(html).toContain("historial de tus guardias");
    expect(html).not.toContain('href="/episodios-efa"');
    expect(html).not.toContain("historial de guardias y episodios");
  });

  it("shows admin navigation only to administrators", () => {
    const html = render(summary({ isAdmin: true }));
    expect(html).toContain('href="/admin-usuarios"');
    expect(html).toContain("Bases y dotación");
  });
});
