import type { ReactNode } from "react";

export type WorkflowContentWidth = "narrow" | "wide";

const contentWidths: Record<WorkflowContentWidth, string> = {
  narrow: "max-w-2xl",
  wide: "max-w-5xl",
};

type WorkflowShellProps = {
  children: ReactNode;
  contentWidth?: WorkflowContentWidth;
  header: ReactNode;
};

export function WorkflowShell({ children, contentWidth = "wide", header }: WorkflowShellProps) {
  return (
    <main className="workflow-background min-h-screen pb-24 motion-safe:animate-in motion-safe:fade-in motion-safe:duration-300 motion-reduce:animate-none md:pb-0">
      {header}
      <div className={`mx-auto w-full ${contentWidths[contentWidth]} px-4 pt-4 sm:px-6 sm:pt-6`}>
        {children}
      </div>
    </main>
  );
}
