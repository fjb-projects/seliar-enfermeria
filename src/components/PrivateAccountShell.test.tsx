import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import {
  canExpandAccountHeaderOnPointerHover,
  PrivateAccountShell,
  reduceAccountHeaderInteraction,
} from "./PrivateAccountShell";

vi.mock("@tanstack/react-router", () => ({
  Link: ({ children, to, ...props }: { children: unknown; to: string }) => (
    <a href={to} {...props}>
      {children as never}
    </a>
  ),
}));
vi.mock("@/components/SeliarNavigationProvider", () => ({
  useSeliarNavigation: () => ({ requestLogout: vi.fn(), logoutPending: false, logoutError: "" }),
}));

describe("private account header", () => {
  it("keeps the name visible while initially collapsing account details", () => {
    const html = renderToStaticMarkup(
      <PrivateAccountShell
        session={{
          user: { id: "user-1", name: "Ana Example", email: "ana@example.test" },
          roles: ["efa", "admin"],
          expiresAt: "2026-10-07T12:00:00.000Z",
        }}
      >
        <main>Contenido</main>
      </PrivateAccountShell>,
    );

    expect(html).toContain("Ana Example");
    expect(html).toContain('aria-label="Cuenta de Ana Example"');
    expect(html).toContain("chevron-down");
    expect(html).toContain('aria-expanded="false"');
    expect(html).toContain('aria-controls="private-account-details"');
    expect(html).toContain('id="private-account-details" aria-hidden="true" inert=""');
    expect(html).toContain("Contenido");
    expect(html.indexOf('id="private-account-details"')).toBeGreaterThan(html.indexOf("<header"));
    expect(html.indexOf('id="private-account-details"')).toBeLessThan(html.indexOf("</header>"));
  });

  it("links the coordination view only for administrators", () => {
    const render = (roles: string[]) =>
      renderToStaticMarkup(
        <PrivateAccountShell
          session={{
            user: { id: "user-1", name: "Ana Example", email: "ana@example.test" },
            roles,
            expiresAt: "2026-10-07T12:00:00.000Z",
          }}
        >
          <main>Contenido</main>
        </PrivateAccountShell>,
      );

    expect(render(["admin"])).toContain('href="/coordinacion-efa"');
    expect(render(["efa"])).not.toContain('href="/coordinacion-efa"');
  });

  it("expands for mouse hover but preserves focus and permits an explicit close", () => {
    const initial = { expanded: false, mouseInside: false, focusInside: false };
    const hovered = reduceAccountHeaderInteraction(initial, {
      type: "pointer-enter",
      pointerType: "mouse",
      fineHoverCapability: true,
    });
    expect(hovered.expanded).toBe(true);

    const focused = reduceAccountHeaderInteraction(hovered, { type: "focus-enter" });
    const leftWhileFocused = reduceAccountHeaderInteraction(focused, {
      type: "pointer-leave",
      pointerType: "mouse",
    });
    expect(leftWhileFocused.expanded).toBe(true);

    const explicitlyClosed = reduceAccountHeaderInteraction(leftWhileFocused, { type: "toggle" });
    expect(explicitlyClosed.expanded).toBe(false);
  });

  it("does not treat touch pointer events as hover expansion", () => {
    const initial = { expanded: false, mouseInside: false, focusInside: false };
    const touchEntered = reduceAccountHeaderInteraction(initial, {
      type: "pointer-enter",
      pointerType: "touch",
      fineHoverCapability: true,
    });
    expect(touchEntered).toEqual(initial);
  });

  it("requires both mouse input and fine-pointer hover capability", () => {
    expect(canExpandAccountHeaderOnPointerHover("mouse", true)).toBe(true);
    expect(canExpandAccountHeaderOnPointerHover("mouse", false)).toBe(false);
    expect(canExpandAccountHeaderOnPointerHover("mouse", undefined)).toBe(false);
    expect(canExpandAccountHeaderOnPointerHover("touch", true)).toBe(false);
  });
});
