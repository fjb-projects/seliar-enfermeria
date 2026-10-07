import { describe, expect, it } from "vitest";
import { createEfaPanelService, type EfaPanelTransaction } from "./efa-panel.server";

function createStore() {
  let actor: { isActive: boolean; roles: Array<"efa" | "admin"> } | null = {
    isActive: true,
    roles: ["efa"],
  };
  let openGuard: { id: string; startedAt: Date; ownerUserId: string } | null = null;
  let baseEvents: Array<{ baseId: string; sequence: number; action: "added" | "removed" }> = [];
  let activeEpisodeCount = 0;
  const queriedOwners: string[] = [];
  const tx = {
    async findActor() { return actor; },
    async findOpenGuard(ownerUserId: string) {
      queriedOwners.push(ownerUserId);
      return openGuard?.ownerUserId === ownerUserId ? openGuard : null;
    },
    async listBaseEvents() { return baseEvents; },
    async countActiveEpisodes(ownerUserId: string, guardId: string) {
      return openGuard?.ownerUserId === ownerUserId && openGuard.id === guardId ? activeEpisodeCount : 0;
    },
  } satisfies EfaPanelTransaction;
  return {
    store: { async transaction<T>(work: (tx: EfaPanelTransaction) => Promise<T>) { return work(tx); } },
    queriedOwners,
    setActor(next: typeof actor) { actor = next; },
    setOpenGuard(next: typeof openGuard) { openGuard = next; },
    setBaseEvents(next: typeof baseEvents) { baseEvents = next; },
    setActiveEpisodeCount(next: number) { activeEpisodeCount = next; },
  };
}

describe("EFA panel summary", () => {
  it("returns the start state when an EFA writer has no own open guard", async () => {
    const fixture = createStore();
    const result = await createEfaPanelService(fixture.store).summary("efa-user");
    expect(result).toEqual({ canWrite: true, isAdmin: false, openGuard: null });
    expect(fixture.queriedOwners).toEqual(["efa-user"]);
  });

  it("summarizes only the authenticated writer's open guard without episode payload", async () => {
    const fixture = createStore();
    fixture.setOpenGuard({ id: "own-open", ownerUserId: "efa-user", startedAt: new Date("2026-10-06T10:00:00Z") });
    fixture.setBaseEvents([
      { baseId: "base-a", sequence: 1, action: "added" },
      { baseId: "base-b", sequence: 2, action: "added" },
      { baseId: "base-a", sequence: 3, action: "removed" },
    ]);
    fixture.setActiveEpisodeCount(2);
    const result = await createEfaPanelService(fixture.store).summary("efa-user");
    expect(result).toEqual({
      canWrite: true,
      isAdmin: false,
      openGuard: { startedAt: "2026-10-06T10:00:00.000Z", baseCount: 1, activeEpisodeCount: 2 },
    });
    expect(JSON.stringify(result)).not.toMatch(/address|motive|episodeId|ownerUserId/);
  });

  it("does not borrow another user's open guard when the admin has none", async () => {
    const fixture = createStore();
    fixture.setActor({ isActive: true, roles: ["admin"] });
    fixture.setOpenGuard({ id: "other-open", ownerUserId: "another-user", startedAt: new Date() });
    const result = await createEfaPanelService(fixture.store).summary("admin-user");
    expect(result).toEqual({ canWrite: true, isAdmin: true, openGuard: null });
    expect(fixture.queriedOwners).toEqual(["admin-user"]);
  });

  it("keeps active accounts with revoked EFA in read-only state and omits guard data", async () => {
    const fixture = createStore();
    fixture.setActor({ isActive: true, roles: [] });
    fixture.setOpenGuard({ id: "own-open", ownerUserId: "efa-user", startedAt: new Date() });
    const result = await createEfaPanelService(fixture.store).summary("efa-user");
    expect(result).toEqual({ canWrite: false, isAdmin: false, openGuard: null });
    expect(fixture.queriedOwners).toEqual([]);
  });

  it("rejects inactive accounts rather than exposing a stale EFA summary", async () => {
    const fixture = createStore();
    fixture.setActor({ isActive: false, roles: ["efa"] });
    await expect(createEfaPanelService(fixture.store).summary("efa-user")).rejects.toThrow(/inactiva/i);
  });
});
