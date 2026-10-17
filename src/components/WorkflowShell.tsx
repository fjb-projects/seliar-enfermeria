import type { ReactNode } from "react";

/** "full" spans the page (with a generous cap) for dense, desktop-heavy areas. */
export type WorkflowContentWidth = "narrow" | "wide" | "full";

const contentWidths: Record<WorkflowContentWidth, string> = {
  narrow: "max-w-2xl",
  wide: "max-w-5xl",
  full: "max-w-[1600px]",
};

/**
 * "gradient" paints the workflow gradient behind the whole page. "calm" keeps it on phones only:
 * from `md` the page is the plain theme background, with a decorative blurred logo behind the
 * content and the gradient left to the area's own sidebar.
 */
export type WorkflowSurface = "gradient" | "calm";

const mainMotion =
  "min-h-screen pb-24 motion-safe:animate-in motion-safe:fade-in motion-safe:duration-300 motion-reduce:animate-none md:pb-0";

type WorkflowShellProps = {
  children: ReactNode;
  contentWidth?: WorkflowContentWidth;
  header: ReactNode;
  surface?: WorkflowSurface;
};

/**
 * Decorative backdrop, desktop and light theme only. The sticky layer keeps the logo in view while
 * the page scrolls without a fixed-position filter. `mix-blend-multiply` sits on that layer (not
 * on the image) so its white half multiplies away against the page background; `overflow-clip`
 * (not `hidden`) clips the blur without turning the layer into a scroll container for the sticky.
 */
function CalmBackdrop() {
  return (
    <div
      aria-hidden="true"
      className="pointer-events-none absolute inset-0 hidden overflow-clip md:block dark:hidden"
    >
      <div className="sticky top-0 h-svh overflow-clip opacity-15 mix-blend-multiply">
        <img
          src="/logoSIES.jpg"
          alt=""
          aria-hidden="true"
          loading="lazy"
          decoding="async"
          className="absolute -bottom-24 -right-24 aspect-square w-[44rem] max-w-none blur-3xl"
        />
      </div>
    </div>
  );
}

export function WorkflowShell({
  children,
  contentWidth = "wide",
  header,
  surface = "gradient",
}: WorkflowShellProps) {
  const calm = surface === "calm";
  return (
    <main
      className={`${calm ? "workflow-background-mobile-only relative" : "workflow-background"} ${mainMotion}`}
    >
      {calm && <CalmBackdrop />}
      {header}
      <div className={`mx-auto w-full ${contentWidths[contentWidth]} px-4 pt-4 sm:px-6 sm:pt-6`}>
        {children}
      </div>
    </main>
  );
}
