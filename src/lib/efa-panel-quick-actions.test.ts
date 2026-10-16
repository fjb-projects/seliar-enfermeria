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

  it("hides the coordination view from non-administrators", () => {
    for (const value of [summary(), summary({ canWrite: true })]) {
      const ids = getEfaPanelQuickActions(value).map((action) => action.id);
      expect(ids).not.toContain("coordinate-guards");
      expect(ids).not.toContain("manage-accounts");
    }
  });
});
