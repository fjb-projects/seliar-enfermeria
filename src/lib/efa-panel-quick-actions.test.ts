import { describe, expect, it } from "vitest";
import type { EfaPanelSummary } from "@/components/EfaPanelHome";
import { getEfaPanelQuickActions } from "./efa-panel-quick-actions";

const summary = (value: Partial<EfaPanelSummary> = {}): EfaPanelSummary => ({
  canWrite: false,
  isAdmin: false,
  openGuard: null,
  ...value,
});

describe("EFA panel quick actions", () => {
  it("offers the coordination view to administrators", () => {
    const actions = getEfaPanelQuickActions(summary({ canWrite: true, isAdmin: true }));

    expect(actions.find((action) => action.id === "coordinate-guards")).toMatchObject({
      to: "/coordinacion-efa",
      label: "Coordinación EFA",
    });
  });

  it("names every link to /guardia-efa 'Mi guardia' in the navigation", () => {
    const guardActions = [
      summary(),
      summary({ canWrite: true }),
      summary({ isAdmin: true }),
      summary({
        canWrite: true,
        isAdmin: true,
        openGuard: { startedAt: "2026-10-06T10:00:00.000Z", baseCount: 1, activeEpisodeCount: 0 },
      }),
    ]
      .flatMap((value) => getEfaPanelQuickActions(value))
      .filter((action) => action.to === "/guardia-efa");

    expect(guardActions.map((action) => action.id).sort()).toEqual(
      expect.arrayContaining(["consult-guards", "manage-guard", "start-guard"]),
    );
    for (const action of guardActions) expect(action.navLabel).toBe("Mi guardia");
  });

  it("hides the coordination view from non-administrators", () => {
    for (const value of [summary(), summary({ canWrite: true })]) {
      const ids = getEfaPanelQuickActions(value).map((action) => action.id);
      expect(ids).not.toContain("coordinate-guards");
      expect(ids).not.toContain("manage-accounts");
    }
  });
});
