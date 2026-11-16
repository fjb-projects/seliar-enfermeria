import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ComponentProps, ReactElement } from "react";
import { PrivateAccountShell } from "@/components/PrivateAccountShell";

const mocks = vi.hoisted(() => ({
  listEfaEpisodes: vi.fn(),
  listEfaEpisodeNotices: vi.fn(),
  listEfaGuards: vi.fn(),
}));

vi.mock("@/lib/efa-episodes.functions", () => ({
  listEfaEpisodes: mocks.listEfaEpisodes,
  listEfaEpisodeNotices: mocks.listEfaEpisodeNotices,
}));
vi.mock("@/lib/efa-guards.functions", () => ({ listEfaGuards: mocks.listEfaGuards }));

import { loadEpisodeRouteData, Route } from "./episodios-efa";

describe("EFA episode route data", () => {
  it("identifies the operational task with a route-scoped neutral surface", () => {
    vi.spyOn(Route, "useRouteContext").mockReturnValue({
      session: { user: { id: "owner" }, roles: ["efa"] },
    } as never);
    vi.spyOn(Route, "useLoaderData").mockReturnValue({
      episodes: [],
      notices: [],
      openOwnGuard: null,
    } as never);
    const page = (
      Route.options.component as () => ReactElement<ComponentProps<typeof PrivateAccountShell>>
    )();
    expect(page.type).toBe(PrivateAccountShell);
    expect(page.props.title).toBe("Atenciones de la guardia");
    expect(page.props.description).toBe("Registro y seguimiento de servicios");
    expect(page.props.surface).toBe("santafe-focus");
    expect(page.props.eyebrow).toBe("");
    expect(page.props.contentWidth).toBe("full");
  });

  beforeEach(() => {
    mocks.listEfaEpisodes.mockReset().mockResolvedValue([]);
    mocks.listEfaEpisodeNotices.mockReset().mockResolvedValue([]);
    mocks.listEfaGuards.mockReset().mockResolvedValue([
      { id: "own-open", ownerUserId: "owner", endedAt: null },
      { id: "foreign-open", ownerUserId: "other", endedAt: null },
      { id: "own-closed", ownerUserId: "owner", endedAt: "2026-10-06T18:00:00.000Z" },
    ]);
  });

  it("loads the active account's own open guard without requiring the EFA writer flag", async () => {
    const data = await loadEpisodeRouteData("owner");

    expect(mocks.listEfaGuards).toHaveBeenCalledOnce();
    expect(data.openOwnGuard).toMatchObject({ id: "own-open", ownerUserId: "owner" });
  });
});
