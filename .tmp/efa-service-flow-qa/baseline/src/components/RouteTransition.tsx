import { useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import { useRouterState } from "@tanstack/react-router";
import { RoutePending } from "@/components/RoutePending";

const ROUTE_OVERLAY_DELAY_MS = 120;
const ROUTE_OVERLAY_EXIT_MS = 180;

type OverlayPhase = "hidden" | "visible" | "exiting";

export function RouteTransition({ children }: { children: ReactNode }) {
  const routerState = useRouterState({
    select: (state) => ({
      isLoading: state.isLoading,
      hasCommittedView: state.matches.length > 1,
    }),
  });
  const pageIsBusy = routerState.isLoading && routerState.hasCommittedView;
  const [overlayPhase, setOverlayPhase] = useState<OverlayPhase>("hidden");
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (timerRef.current !== null) {
      window.clearTimeout(timerRef.current);
      timerRef.current = null;
    }

    const prefersReducedMotion =
      window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;

    if (pageIsBusy) {
      if (overlayPhase === "hidden") {
        timerRef.current = window.setTimeout(
          () => setOverlayPhase("visible"),
          ROUTE_OVERLAY_DELAY_MS,
        );
      } else if (overlayPhase === "exiting") {
        setOverlayPhase("visible");
      }
    } else if (overlayPhase === "visible") {
      setOverlayPhase(prefersReducedMotion ? "hidden" : "exiting");
    } else if (overlayPhase === "exiting") {
      if (prefersReducedMotion) {
        setOverlayPhase("hidden");
      } else {
        timerRef.current = window.setTimeout(
          () => setOverlayPhase("hidden"),
          ROUTE_OVERLAY_EXIT_MS,
        );
      }
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
