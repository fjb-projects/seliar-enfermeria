import { describe, expect, it } from "vitest";
import { getEfaPanelAccess } from "./efa-panel.functions";

describe("EFA panel access display", () => {
  it("grants the guided writer path to current EFA and administrator roles", () => {
    expect(getEfaPanelAccess(["efa"])).toEqual({ canWrite: true, isAdmin: false });
    expect(getEfaPanelAccess(["admin"])).toEqual({ canWrite: true, isAdmin: true });
    expect(getEfaPanelAccess([])).toEqual({ canWrite: false, isAdmin: false });
  });
});
