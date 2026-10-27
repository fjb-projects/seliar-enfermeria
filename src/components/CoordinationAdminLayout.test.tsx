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
    expect(html).toContain("Content");
  });
});
