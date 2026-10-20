import { useId, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Button } from "@/components/ui/button";
import { listEfaEpisodes } from "@/lib/efa-episodes.functions";
import { listEfaObservationsForGuard } from "@/lib/efa-observations.functions";
import {
  buildGuardTimeline,
  type GuardTimeline,
  type GuardTimelineConductItem,
  type GuardTimelineFilter,
  type GuardTimelineItem,
} from "@/lib/efa-guard-timeline";
import { observationClassificationLabel } from "@/lib/efa-labels";
import { cn } from "@/lib/utils";

export const GUARD_TIMELINE_TITLE = "Cronología de la guardia";
export const GUARD_TIMELINE_EMPTY = "Todavía no registraste conductas en esta guardia.";

/** Shared with "Mi guardia", which invalidates it after the conduct sheet saves. */
// eslint-disable-next-line react-refresh/only-export-components -- The query key is the refresh contract with the guard panel.
export const efaGuardTimelineQueryKey = (userId: string, guardId: string) =>
  ["efa-guard-timeline", userId, guardId] as const;

export type GuardTimelineState =
  { status: "pending" } | { status: "error" } | { status: "ready"; timeline: GuardTimeline };

const filters: ReadonlyArray<readonly [GuardTimelineFilter, string]> = [
  ["all", "Todas"],
  ["needs_improvement", "A mejorar"],
];

function ClassificationBadge({ value }: { value: GuardTimelineConductItem["classification"] }) {
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center rounded-md border px-1.5 py-0.5 text-xs font-medium",
        value === "needs_improvement"
          ? "border-amber-300 bg-amber-50 text-amber-900 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-100"
          : value === "adequate"
            ? "border-emerald-300 bg-emerald-50 text-emerald-900 dark:border-emerald-800 dark:bg-emerald-950/30 dark:text-emerald-100"
            : "border-input text-muted-foreground",
      )}
    >
      {observationClassificationLabel(value)}
    </span>
  );
}

function ConductEntry({ item }: { item: GuardTimelineConductItem }) {
  return (
    <li className="flex min-w-0 gap-3 py-2">
      <div className="w-12 shrink-0">
        {item.at ? (
          <time dateTime={item.at} className="text-sm font-medium tabular-nums">
            {item.time}
          </time>
        ) : (
          <span className="text-sm text-muted-foreground">{item.time}</span>
        )}
        {item.at && item.timeSource === "recorded" && (
          <span className="block text-[11px] leading-tight text-muted-foreground">
            hora de carga
          </span>
        )}
      </div>
      <div className="min-w-0 flex-1 space-y-1">
        <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
          <p className="min-w-0 break-words text-sm font-medium">{item.title}</p>
          <ClassificationBadge value={item.classification} />
        </div>
        {item.comment && (
          <p className="line-clamp-2 break-words text-sm text-muted-foreground">{item.comment}</p>
        )}
      </div>
    </li>
  );
}

function TimelineEntry({ item }: { item: GuardTimelineItem }) {
  if (item.kind === "conduct") return <ConductEntry item={item} />;
  // Service markers are context, so they stay lighter than the conducts.
  return (
    <li className="flex min-w-0 items-center gap-3 py-1 text-xs text-muted-foreground">
      <time dateTime={item.at} className="w-12 shrink-0 tabular-nums">
        {item.time}
      </time>
      <span className="min-w-0 flex-1 break-words border-l border-dashed pl-2">{item.title}</span>
    </li>
  );
}

function TimelineBody({
  timeline,
  filter,
  canWrite,
}: {
  timeline: GuardTimeline;
  filter: GuardTimelineFilter;
  canWrite: boolean;
}) {
  if (timeline.conductCount === 0) {
    return (
      <div className="space-y-1">
        <p className="text-sm text-muted-foreground">{GUARD_TIMELINE_EMPTY}</p>
        {canWrite && (
          <p className="text-xs text-muted-foreground">
            Usá «Registrar conducta» para sumar problemas u oportunidades de mejora.
          </p>
        )}
      </div>
    );
  }
  if (timeline.shownConductCount === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        {filter === "needs_improvement"
          ? "No hay conductas a mejorar en esta guardia."
          : GUARD_TIMELINE_EMPTY}
      </p>
    );
  }
  return (
    <>
      {timeline.items.length > 0 && (
        <ol className="divide-y">
          {timeline.items.map((item) => (
            <TimelineEntry key={`${item.kind}-${item.id}`} item={item} />
          ))}
        </ol>
      )}
      {timeline.withoutTime.length > 0 && (
        <div className="space-y-1 border-t pt-2">
          <h4 className="text-xs font-semibold text-muted-foreground">Sin hora</h4>
          <ul className="divide-y">
            {timeline.withoutTime.map((item) => (
              <ConductEntry key={item.id} item={item} />
            ))}
          </ul>
        </div>
      )}
    </>
  );
}

/** Presentational chronology: every state comes from props so it renders statically in tests. */
export function EfaGuardTimelineView({
  state,
  filter,
  onFilterChange,
  canWrite,
}: {
  state: GuardTimelineState;
  filter: GuardTimelineFilter;
  onFilterChange: (filter: GuardTimelineFilter) => void;
  canWrite: boolean;
}) {
  const headingId = useId();
  return (
    <section aria-labelledby={headingId} className="min-w-0 space-y-3 pt-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3
          id={headingId}
          className="text-xs font-medium tracking-wide text-muted-foreground uppercase"
        >
          {GUARD_TIMELINE_TITLE}
        </h3>
        {state.status === "ready" && state.timeline.conductCount > 0 && (
          <div role="group" aria-label="Filtrar conductas" className="flex gap-2">
            {filters.map(([value, label]) => (
              <Button
                key={value}
                type="button"
                variant="ghost"
                size="sm"
                aria-pressed={filter === value}
                className="min-h-11 rounded-full border border-input px-4 aria-pressed:border-primary aria-pressed:bg-primary/10 aria-pressed:font-semibold"
                onClick={() => onFilterChange(value)}
              >
                {label}
              </Button>
            ))}
          </div>
        )}
      </div>
      {state.status === "pending" ? (
        <p role="status" className="text-sm text-muted-foreground">
          Cargando la cronología…
        </p>
      ) : state.status === "error" ? (
        <p role="alert" className="text-sm text-destructive">
          No se pudo cargar la cronología. Intentá nuevamente.
        </p>
      ) : (
        <TimelineBody timeline={state.timeline} filter={filter} canWrite={canWrite} />
      )}
    </section>
  );
}

/** Guard-level conducts of the open guard with its services as markers, read-only. */
export function EfaGuardTimeline({
  guardId,
  currentUserId,
  canWrite,
}: {
  guardId: string;
  currentUserId: string;
  canWrite: boolean;
}) {
  const listObservations = useServerFn(listEfaObservationsForGuard);
  const listEpisodes = useServerFn(listEfaEpisodes);
  const [filter, setFilter] = useState<GuardTimelineFilter>("all");
  const query = useQuery({
    queryKey: efaGuardTimelineQueryKey(currentUserId, guardId),
    queryFn: async () => {
      const [observations, services] = await Promise.all([
        listObservations({ data: guardId }),
        listEpisodes(),
      ]);
      return {
        observations,
        services,
      };
    },
  });
  const data = query.data;
  const timeline = useMemo(
    () => (data ? buildGuardTimeline({ guardId, filter, ...data }) : null),
    [data, guardId, filter],
  );
  const state: GuardTimelineState = timeline
    ? { status: "ready", timeline }
    : query.isError
      ? { status: "error" }
      : { status: "pending" };
  return (
    <EfaGuardTimelineView
      state={state}
      filter={filter}
      onFilterChange={setFilter}
      canWrite={canWrite}
    />
  );
}
