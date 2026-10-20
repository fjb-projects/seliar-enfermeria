import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const router = vi.hoisted(() => ({ invalidate: vi.fn() }));

vi.mock("@tanstack/react-router", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@tanstack/react-router")>()),
  useRouter: () => router,
}));
vi.mock("@/lib/auth.functions", () => ({ readSession: vi.fn(), signOut: vi.fn() }));
vi.mock("@/lib/efa-guards.functions", () => ({ endEfaGuard: vi.fn(), listEfaGuards: vi.fn() }));
vi.mock("@/lib/efa-panel.functions", () => ({ getEfaPanelSummary: vi.fn() }));

import { ErrorComponent } from "./__root";

describe("root error component", () => {
  beforeEach(() => {
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  it("explains the failure and offers reload and home actions", () => {
    const html = renderToStaticMarkup(<ErrorComponent error={new Error("boom")} reset={vi.fn()} />);

    expect(html).toContain("Esta página no se cargó");
    expect(html).toContain("Hubo un error. presione en Recargar o vuelva a la Home.");
    expect(html).toContain("Recargar</button>");
    expect(html).toContain('<a href="/"');
  });

  it("accepts any thrown value, as the router hands boundaries an unknown error", () => {
    const html = renderToStaticMarkup(
      <ErrorComponent error="not an Error instance" reset={vi.fn()} />,
    );

    expect(html).toContain("Esta página no se cargó");
  });
});
