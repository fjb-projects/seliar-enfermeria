import {
  formatRelativeElapsed,
  initials,
  metricDisplay,
  ownerColor,
  type GuardMetric,
} from "@/lib/efa-coordination-display";
import { cn } from "@/lib/utils";

/** Initials on a stable per-user tone, so people are recognizable at a glance. */
export function EfaOwnerAvatar({
  userId,
  name,
  size = "sm",
}: {
  userId: string;
  name: string;
  size?: "sm" | "md";
}) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        "inline-flex shrink-0 select-none items-center justify-center rounded-full font-semibold",
        size === "sm" ? "size-7 text-[11px]" : "size-9 text-xs",
        ownerColor(userId),
      )}
    >
      {initials(name)}
    </span>
  );
}

/** Live dot plus elapsed time for an open guard; quiet text for a finished one. */
export function EfaGuardStatus({
  startedAt,
  endedAt,
  now,
}: {
  startedAt: Date | string;
  endedAt: Date | string | null;
  now: Date;
}) {
  if (endedAt) return <span className="text-muted-foreground">Finalizada</span>;
  return (
    <span className="inline-flex items-center gap-2 font-medium text-primary">
      <span aria-hidden="true" className="relative flex size-2">
        <span className="absolute inline-flex size-full rounded-full bg-primary opacity-60 motion-safe:animate-ping" />
        <span className="relative inline-flex size-2 rounded-full bg-primary" />
      </span>
      <span suppressHydrationWarning>En curso · {formatRelativeElapsed(startedAt, now)}</span>
    </span>
  );
}

/** One numeric figure; zero reads as a muted dash and screen readers still hear the number. */
export function EfaMetricValue({ metric }: { metric: GuardMetric }) {
  if (!metric.value) {
    return (
      <span className="text-muted-foreground/70">
        <span aria-hidden="true">{metricDisplay(0)}</span>
        <span className="sr-only">0</span>
      </span>
    );
  }
  return (
    <span
      className={cn("tabular-nums", metric.detail && "cursor-help")}
      title={metric.detail ?? undefined}
    >
      {metric.value}
      {metric.detail && <span className="sr-only"> ({metric.detail})</span>}
    </span>
  );
}
