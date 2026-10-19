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

  it("keeps the account heading by default and accepts an area title", () => {
    const session = {
      user: { id: "user-1", name: "Ana Example", email: "ana@example.test" },
      roles: ["admin"],
      expiresAt: "2026-10-07T12:00:00.000Z",
    };
    const defaultHtml = renderToStaticMarkup(
      <PrivateAccountShell session={session}>
        <p>Contenido</p>
      </PrivateAccountShell>,
    );
    const areaHtml = renderToStaticMarkup(
      <PrivateAccountShell
        session={session}
        title="Coordinación EFA"
        description="Guardias de todos los usuarios"
      >
        <p>Contenido</p>
      </PrivateAccountShell>,
    );

    expect(defaultHtml).toContain("Acceso seguro");
    expect(defaultHtml).toContain("Gestión de cuentas y permisos");
    expect(areaHtml).toContain("Coordinación EFA</h1>");
    expect(areaHtml).toContain("Guardias de todos los usuarios");
    expect(areaHtml).not.toContain("Acceso seguro");
  });

  it("keeps the wide page by default and opts into the full width", () => {
    const session = {
      user: { id: "user-1", name: "Ana Example", email: "ana@example.test" },
      roles: ["admin"],
      expiresAt: "2026-10-07T12:00:00.000Z",
    };
    const defaultHtml = renderToStaticMarkup(
      <PrivateAccountShell session={session}>
        <p>Contenido</p>
      </PrivateAccountShell>,
    );
    const fullHtml = renderToStaticMarkup(
      <PrivateAccountShell session={session} contentWidth="full">
        <p>Contenido</p>
      </PrivateAccountShell>,
    );

    expect(defaultHtml).toContain('class="mx-auto w-full max-w-5xl px-4 pt-4 sm:px-6 sm:pt-6"');
    expect(defaultHtml).toContain(
      'class="mx-auto hidden w-full max-w-5xl px-4 pt-4 sm:px-6 md:block"',
    );
    expect(defaultHtml).not.toContain("max-w-[1600px]");
    expect(fullHtml).toContain('class="mx-auto w-full max-w-[1600px] px-4 pt-4 sm:px-6 sm:pt-6"');
    expect(fullHtml).toContain(
      'class="mx-auto hidden w-full max-w-[1600px] px-4 pt-4 sm:px-6 md:block"',
    );
  });

  it("keeps the gradient surface by default and passes the calm surface through", () => {
    const session = {
      user: { id: "user-1", name: "Ana Example", email: "ana@example.test" },
      roles: ["admin"],
      expiresAt: "2026-10-07T12:00:00.000Z",
    };
    const defaultHtml = renderToStaticMarkup(
      <PrivateAccountShell session={session}>
        <p>Contenido</p>
      </PrivateAccountShell>,
    );
    const calmHtml = renderToStaticMarkup(
      <PrivateAccountShell session={session} surface="calm">
        <p>Contenido</p>
      </PrivateAccountShell>,
    );

    expect(defaultHtml).toContain('<main class="workflow-background min-h-screen');
    expect(defaultHtml).not.toContain('alt=""');
    expect(calmHtml).toContain('<main class="workflow-background-mobile-only');
    expect(calmHtml).toContain('<img src="/logoSIES.jpg" alt="" aria-hidden="true"');
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
