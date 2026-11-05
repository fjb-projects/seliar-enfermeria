import type { ReactNode } from "react";

type WorkflowIntroProps = {
  children?: ReactNode;
  description?: string;
  eyebrow?: string;
};

export function WorkflowIntro({ children, description, eyebrow }: WorkflowIntroProps) {
  return (
    <section className="border-l-4 border-[var(--brand-orange)] bg-card px-4 py-4 shadow-[0_2px_10px_oklch(0.27_0.035_202/0.05)]">
      {eyebrow && (
        <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-[var(--brand-orange)]">
          {eyebrow}
        </p>
      )}
      {description && <p className="mt-1 text-sm leading-relaxed text-foreground">{description}</p>}
      {children && <div className="mt-4">{children}</div>}
    </section>
  );
}
