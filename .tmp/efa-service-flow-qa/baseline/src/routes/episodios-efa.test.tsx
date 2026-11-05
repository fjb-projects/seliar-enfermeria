import { beforeEach, describe, expect, it, vi } from "vitest";

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

import { loadEpisodeRouteData } from "./episodios-efa";

describe("EFA episode route data", () => {
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
