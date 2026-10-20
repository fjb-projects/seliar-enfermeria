import { Check, Circle, CircleAlert, CloudOff, Loader2 } from "lucide-react";
import { autosaveStatusLabel, type AutosaveStatus } from "@/lib/efa-autosave";
import { cn } from "@/lib/utils";

const iconClass = "size-3.5 shrink-0";

function StatusIcon({ status }: { status: AutosaveStatus }) {
  switch (status.kind) {
    case "saved":
      return <Check className={iconClass} aria-hidden="true" />;
    case "saving":
      return <Loader2 className={`${iconClass} motion-safe:animate-spin`} aria-hidden="true" />;
    case "offline":
      return <CloudOff className={iconClass} aria-hidden="true" />;
    case "error":
      return <CircleAlert className={iconClass} aria-hidden="true" />;
    default:
      return <Circle className="size-2 shrink-0 fill-current" aria-hidden="true" />;
  }
}

/**
 * Autosave status line shown next to a form. The live region stays mounted (empty) when there is
 * nothing to say, because some screen readers ignore a live region inserted after page load.
 */
export function EfaAutosaveStatus({ status }: { status: AutosaveStatus }) {
  const label = autosaveStatusLabel(status);
  return (
    <span
      role="status"
      aria-live="polite"
      className={cn(
        "inline-flex items-center gap-1.5 text-xs text-muted-foreground",
        status.kind === "error" && "text-destructive",
      )}
    >
      {label && <StatusIcon status={status} />}
      {label}
    </span>
  );
}
