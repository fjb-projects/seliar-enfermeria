import { renderToStaticMarkup } from "react-dom/server";
import type { ComponentProps } from "react";
import { describe, expect, it, vi } from "vitest";
import type { QuickGuardEndController } from "./EfaQuickGuardEnd";
import { SeliarMobileNav } from "./SeliarMobileNav";

const navigationState = vi.hoisted(() => ({ current: {} as Record<string, unknown> }));

vi.mock("@tanstack/react-start", () => ({ useServerFn: () => vi.fn(async () => []) }));
vi.mock("@tanstack/react-router", () => ({
  Link: ({ children, to, ...props }: ComponentProps<"a"> & { to: string }) => (
    <a href={to} {...props}>
      {children}
    </a>
  ),
  useLocation: () => ({ pathname: "/panel" }),
  useRouter: () => ({ invalidate: vi.fn() }),
}));
vi.mock("@/lib/efa-guards.functions", () => ({ endEfaGuard: vi.fn(), listEfaGuards: vi.fn() }));
vi.mock("@/components/SeliarNavigationProvider", () => ({
  useSeliarNavigation: () => navigationState.current,
}));

function quickGuardEnd(open: boolean): QuickGuardEndController {
  return {
    visible: open,
    openGuard: open
      ? { startedAt: "2026-10-16T11:09:00.000Z", baseCount: 1, activeEpisodeCount: 0 }
      : null,
    pending: false,
    confirmTarget: null,
    currentTarget: open ? "user-1:2026-10-16T11:09:00.000Z" : null,
    requestEnd: vi.fn(),
    cancel: vi.fn(),
    confirm: vi.fn(),
    end: vi.fn(async () => null),
  };
}

function renderNav(open: boolean) {
  navigationState.current = {
    sessionStatus: "authenticated",
    session: {
      user: { id: "user-1", name: "Ana Example", email: "ana@example.test" },
      roles: ["efa"],
      expiresAt: "2026-10-17T12:00:00.000Z",
    },
    summary: undefined,
    openGuard: quickGuardEnd(open).openGuard,
    quickGuardEnd: quickGuardEnd(open),
    summaryLoading: false,
    summaryError: false,
    retrySession: vi.fn(),
    retrySummary: vi.fn(),
    logout: vi.fn(),
    requestLogout: vi.fn(),
    logoutPending: false,
    logoutError: "",
  };
  return renderToStaticMarkup(<SeliarMobileNav />);
}

describe("SeliarMobileNav open guard controls", () => {
  it("shows the strip in the bottom nav and the compact element in the top nav", () => {
    const html = renderNav(true);
    expect(html).toContain('data-testid="quick-guard-end-strip"');
    expect(html).toContain('data-testid="quick-guard-end-desktop"');
    expect(html.indexOf('data-testid="quick-guard-end-strip"')).toBeLessThan(
      html.indexOf("<span>Inicio</span>"),
    );
  });

  it("keeps the nav unchanged without an open guard", () => {
    const html = renderNav(false);
    expect(html).not.toContain("quick-guard-end");
    expect(html).not.toContain("Guardia en curso");
    expect(html).toContain("<span>Logout</span>");
  });

  it("names the guard page 'Mi guardia' before the panel summary loads", () => {
    const html = renderNav(false);
    expect(html).toMatch(/href="\/guardia-efa"[^>]*>[\s\S]*?<\/svg>(<span>)?Mi guardia</);
    expect(html).not.toContain("Consulta EFA");
  });
});
