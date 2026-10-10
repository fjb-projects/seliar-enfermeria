import type { WorkflowContentWidth } from "@/components/WorkflowShell";
import { useEffect, useRef } from "react";
import type { HTMLAttributes, ReactNode } from "react";

const contentWidths: Record<WorkflowContentWidth, string> = {
  narrow: "max-w-2xl",
  wide: "max-w-5xl",
};

type WorkflowHeaderProps = {
  contentWidth?: WorkflowContentWidth;
  description: string;
  eyebrow: string;
  title: string;
  accountSlot?: ReactNode;
  accountDetails?: ReactNode;
  accountInteractionHandlers?: Pick<
    HTMLAttributes<HTMLElement>,
    "onPointerEnter" | "onPointerLeave" | "onFocusCapture" | "onBlurCapture"
  >;
  compactLogo?: boolean;
};

export function WorkflowHeader({
  contentWidth = "wide",
  description,
  eyebrow,
  title,
  accountSlot,
  accountDetails,
  accountInteractionHandlers,
  compactLogo = false,
}: WorkflowHeaderProps) {
  const mobileHeaderRef = useRef<HTMLElement>(null);

  useEffect(() => {
    const header = mobileHeaderRef.current;
    if (!header) return;

    const root = document.documentElement;
    const previousHeight = root.style.getPropertyValue("--workflow-header-height");
    const previousPriority = root.style.getPropertyPriority("--workflow-header-height");
    const updateHeight = () => {
      root.style.setProperty(
        "--workflow-header-height",
        `${header.getBoundingClientRect().height}px`,
      );
    };

    updateHeight();
    const observer = new ResizeObserver(updateHeight);
    observer.observe(header);

    return () => {
      observer.disconnect();
      if (previousHeight) {
        root.style.setProperty("--workflow-header-height", previousHeight, previousPriority);
      } else {
        root.style.removeProperty("--workflow-header-height");
      }
    };
  }, []);

  return (
    <>
      <header
        ref={mobileHeaderRef}
        {...accountInteractionHandlers}
        className="sticky top-0 z-40 border-b-4 border-[var(--brand-orange)] bg-primary text-primary-foreground shadow-md md:hidden"
      >
        <div
          className={`mx-auto w-full ${contentWidths[contentWidth]} ${compactLogo ? "px-3 py-1.5 sm:px-6 sm:py-3" : "px-4 py-1.5 sm:px-6 sm:py-3"}`}
        >
          <div
            className={`flex min-w-0 items-center ${compactLogo ? "gap-2 sm:gap-2.5" : "gap-2.5"}`}
          >
            <span
              className={`flex shrink-0 items-center justify-center overflow-hidden rounded-[3px] bg-white p-1 ${compactLogo ? "h-8 w-12 sm:h-10 sm:w-16" : "h-10 w-16"}`}
            >
              <img src="/logoSIES.jpg" alt="Logo SIES" className="h-full w-full object-contain" />
            </span>
            <div className="min-w-0">
              <p className="text-[9px] font-bold uppercase leading-3 tracking-[0.18em] text-primary-foreground/65 sm:text-[10px] sm:leading-normal">
                {eyebrow}
              </p>
              <h1 className="font-display text-base font-semibold leading-5 text-primary-foreground sm:text-lg sm:leading-normal">
                {title}
              </h1>
              <p className="mt-0 text-[11px] font-medium leading-3 text-primary-foreground/70 sm:mt-0.5 sm:text-xs sm:leading-4">
                {description}
              </p>
            </div>
            {accountSlot && <div className="ml-auto shrink-0">{accountSlot}</div>}
          </div>
        </div>
        {accountDetails}
      </header>
      <div
        className={`mx-auto hidden w-full ${contentWidths[contentWidth]} px-4 pt-4 sm:px-6 md:block`}
      >
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          {eyebrow}
        </p>
        <h1 className="font-display text-xl font-semibold leading-tight text-foreground">
          {title}
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">{description}</p>
      </div>
    </>
  );
}
