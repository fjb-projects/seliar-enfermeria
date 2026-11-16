import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { CoordinationAdminLayout } from "./CoordinationAdminLayout";

vi.mock("@tanstack/react-router", () => ({
  Link: ({ children, to, ...props }: { children: unknown; to: string }) => (
    <a href={to} {...props}>
      {children as never}
    </a>
  ),
}));

describe("coordination admin layout", () => {
  it("groups admin links and exposes collapse and mobile navigation", () => {
    const html = renderToStaticMarkup(
      <CoordinationAdminLayout active="compensatorios">
        <p>Content</p>
      </CoordinationAdminLayout>,
    );
    expect(html).toContain("Usuarios y accesos");
    expect(html).toContain("Compensatorios");
    expect(html).toContain("Coordinación EFA");
    expect(html).toContain('aria-label="Contraer o expandir el panel lateral"');
    expect(html).toContain("Navegación de coordinación");
    expect(html).toContain("Coordinación");
    expect(html).not.toContain("Secciones");
    expect(html).not.toContain("Panel");
    expect(html).toContain("sticky");
    expect(html).toContain("calc(100svh");
    expect(html).toContain("Content");
  });

  it("marks users as the current section without losing the other tools", () => {
    const html = renderToStaticMarkup(
      <CoordinationAdminLayout active="users">
        <p>Accounts</p>
      </CoordinationAdminLayout>,
    );
    expect(html).toMatch(/href="\/admin-usuarios"[^>]*aria-current="page"/);
    expect(html).toContain('href="/coordinacion/compensatorios"');
    expect(html).toContain('href="/coordinacion-efa"');
    expect(html).toContain("Accounts");
  });
});
