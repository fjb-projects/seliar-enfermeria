import { renderToStaticMarkup as renderMarkup } from "react-dom/server";
import type { ReactNode } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { describe, expect, it, vi } from "vitest";
import {
  EfaQuickGuardEndDesktop,
  EfaQuickGuardEndSpacer,
  EfaQuickGuardEndStrip,
  type QuickGuardEndController,
} from "./EfaQuickGuardEnd";

function renderToStaticMarkup(node: ReactNode) {
  return renderMarkup(<QueryClientProvider client={new QueryClient()}>{node}</QueryClientProvider>);
}

vi.mock("@tanstack/react-start", () => ({ useServerFn: () => vi.fn(async () => []) }));
vi.mock("@tanstack/react-router", () => ({ useRouter: () => ({ invalidate: vi.fn() }) }));
vi.mock("@/lib/efa-guards.functions", () => ({ endEfaGuard: vi.fn(), listEfaGuards: vi.fn() }));

function controller(overrides: Partial<QuickGuardEndController> = {}): QuickGuardEndController {
  return {
    visible: true,
    openGuard: { startedAt: "2026-10-16T11:09:00.000Z", baseCount: 1, activeEpisodeCount: 0 },
    pending: false,
    confirmTarget: null,
    currentTarget: "user-1:2026-10-16T11:09:00.000Z",
    requestEnd: vi.fn(),
    cancel: vi.fn(),
    confirm: vi.fn(),
    end: vi.fn(async () => null),
    ...overrides,
  };
}

describe("quick guard end strip", () => {
  it("shows the open guard and an accessible end button", () => {
    const html = renderToStaticMarkup(<EfaQuickGuardEndStrip controller={controller()} />);
    expect(html).toContain("Guardia en curso · 08:09");
    expect(html).toContain('aria-label="Terminar la guardia iniciada a las 08:09"');
    expect(html).toContain(">Terminar</button>");
  });

  it("renders nothing without an open guard or when hidden on the route", () => {
    expect(
      renderToStaticMarkup(
        <EfaQuickGuardEndStrip controller={controller({ visible: false, openGuard: null })} />,
      ),
    ).toBe("");
    expect(
      renderToStaticMarkup(<EfaQuickGuardEndStrip controller={controller({ visible: false })} />),
    ).toBe("");
  });

  it("disables the button while ending", () => {
    const html = renderToStaticMarkup(
      <EfaQuickGuardEndStrip controller={controller({ pending: true })} />,
    );
    expect(html).toContain("disabled");
    expect(html).toContain("Terminando…");
  });
});

describe("quick guard end desktop element", () => {
  it("shows the compact label only with an open guard", () => {
    expect(renderToStaticMarkup(<EfaQuickGuardEndDesktop controller={controller()} />)).toContain(
      "Guardia en curso · 08:09",
    );
    expect(
      renderToStaticMarkup(
        <EfaQuickGuardEndDesktop controller={controller({ visible: false, openGuard: null })} />,
      ),
    ).toBe("");
  });
});

describe("quick guard end spacer", () => {
  it("reserves mobile space only while the strip is visible", () => {
    expect(renderToStaticMarkup(<EfaQuickGuardEndSpacer controller={controller()} />)).toContain(
      "h-12 md:hidden",
    );
    expect(
      renderToStaticMarkup(<EfaQuickGuardEndSpacer controller={controller({ visible: false })} />),
    ).toBe("");
  });
});
