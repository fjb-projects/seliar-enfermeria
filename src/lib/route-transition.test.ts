import { describe, expect, it } from "vitest";
import {
  ROUTE_OVERLAY_DELAY_MS,
  ROUTE_OVERLAY_EXIT_MS,
  planOverlayStep,
  type OverlayPhase,
} from "./route-transition";

const plan = (phase: OverlayPhase, pageIsBusy: boolean, prefersReducedMotion = false) =>
  planOverlayStep({ phase, pageIsBusy, prefersReducedMotion });

describe("route transition overlay plan", () => {
  it("waits before showing the overlay for a busy page", () => {
    expect(plan("hidden", true)).toEqual({
      kind: "after",
      delayMs: ROUTE_OVERLAY_DELAY_MS,
      phase: "visible",
    });
    expect(ROUTE_OVERLAY_DELAY_MS).toBe(120);
  });

  it("keeps a visible overlay while the page stays busy", () => {
    expect(plan("visible", true)).toEqual({ kind: "idle" });
  });

  it("brings an exiting overlay back when the page becomes busy again", () => {
    expect(plan("exiting", true)).toEqual({ kind: "set", phase: "visible" });
  });

  it("starts the exit animation when the page settles", () => {
    expect(plan("visible", false)).toEqual({ kind: "set", phase: "exiting" });
  });

  it("finishes the exit after its delay", () => {
    expect(plan("exiting", false)).toEqual({
      kind: "after",
      delayMs: ROUTE_OVERLAY_EXIT_MS,
      phase: "hidden",
    });
    expect(ROUTE_OVERLAY_EXIT_MS).toBe(180);
  });

  it("skips the exit animation for reduced motion", () => {
    expect(plan("visible", false, true)).toEqual({ kind: "set", phase: "hidden" });
    expect(plan("exiting", false, true)).toEqual({ kind: "set", phase: "hidden" });
  });

  it("does nothing while hidden and idle", () => {
    expect(plan("hidden", false)).toEqual({ kind: "idle" });
    expect(plan("hidden", false, true)).toEqual({ kind: "idle" });
  });
});
