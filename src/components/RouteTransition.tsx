import { useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import { useRouterState } from "@tanstack/react-router";
import { RoutePending } from "@/components/RoutePending";
import { planOverlayStep, type OverlayPhase } from "@/lib/route-transition";

export function RouteTransition({ children }: { children: ReactNode }) {
  const routerState = useRouterState({
    select: (state) => ({
      isLoading: state.isLoading,
      hasCommittedView: state.matches.length > 1,
    }),
  });
  const pageIsBusy = routerState.isLoading && routerState.hasCommittedView;
  const [overlayPhase, setOverlayPhase] = useState<OverlayPhase>("hidden");
  const timerRef = useRef<number | null>(null);

  useEffect(() => {
    if (timerRef.current !== null) {
      window.clearTimeout(timerRef.current);
      timerRef.current = null;
    }

    const prefersReducedMotion =
      window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;

    const step = planOverlayStep({ phase: overlayPhase, pageIsBusy, prefersReducedMotion });
    if (step.kind === "set") {
      setOverlayPhase(step.phase);
    } else if (step.kind === "after") {
      timerRef.current = window.setTimeout(() => setOverlayPhase(step.phase), step.delayMs);
    }

    return () => {
      if (timerRef.current !== null) {
        window.clearTimeout(timerRef.current);
        timerRef.current = null;
      }
    };
  }, [overlayPhase, pageIsBusy]);

  return (
    <>
      <div
        aria-busy={routerState.isLoading || undefined}
        inert={pageIsBusy || undefined}
        className="min-h-screen"
      >
        {children}
      </div>
      {overlayPhase !== "hidden" && (
        <div
          aria-hidden={overlayPhase === "exiting" || undefined}
          className={`fixed inset-0 z-[100] grid place-items-center bg-background/30 backdrop-blur-sm transition-opacity duration-200 ease-out motion-reduce:transition-none ${
            overlayPhase === "exiting"
              ? "pointer-events-none opacity-0"
              : "animate-in fade-in duration-150 motion-reduce:animate-none"
          }`}
        >
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-0 opacity-20"
            style={{ backgroundImage: "var(--workflow-background)" }}
          />
          <div className="relative z-10 h-full w-full">
            <RoutePending overlay />
          </div>
        </div>
      )}
    </>
  );
}
