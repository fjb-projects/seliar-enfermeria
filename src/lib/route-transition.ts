export const ROUTE_OVERLAY_DELAY_MS = 120;
export const ROUTE_OVERLAY_EXIT_MS = 180;

export type OverlayPhase = "hidden" | "visible" | "exiting";

/** What the route transition overlay must do next, given the current phase. */
export type OverlayStep =
  | { kind: "idle" }
  | { kind: "set"; phase: OverlayPhase }
  | { kind: "after"; delayMs: number; phase: OverlayPhase };

export function planOverlayStep({
  phase,
  pageIsBusy,
  prefersReducedMotion,
}: {
  phase: OverlayPhase;
  pageIsBusy: boolean;
  prefersReducedMotion: boolean;
}): OverlayStep {
  if (pageIsBusy) {
    if (phase === "hidden") {
      return { kind: "after", delayMs: ROUTE_OVERLAY_DELAY_MS, phase: "visible" };
    }
    if (phase === "exiting") return { kind: "set", phase: "visible" };
    return { kind: "idle" };
  }
  if (phase === "visible") {
    return { kind: "set", phase: prefersReducedMotion ? "hidden" : "exiting" };
  }
  if (phase === "exiting") {
    return prefersReducedMotion
      ? { kind: "set", phase: "hidden" }
      : { kind: "after", delayMs: ROUTE_OVERLAY_EXIT_MS, phase: "hidden" };
  }
  return { kind: "idle" };
}
