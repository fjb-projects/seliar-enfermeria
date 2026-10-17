import { useEffect, useMemo, useState } from "react";
import { EfaCoordinationGuardCards } from "@/components/EfaCoordinationGuardCard";
import { EfaCoordinationGuardTable } from "@/components/EfaCoordinationGuardTable";
import { EfaCoordinationLayout } from "@/components/EfaCoordinationLayout";
import type { EfaOversightGuardView } from "@/lib/efa-guard-oversight.functions";
import {
  filterOversightGuards,
  isGroupedByOwner,
  listGuardOwners,
  type CoordinationSearch,
} from "@/lib/efa-coordination-filters";
import { sortGuardsOpenFirst } from "@/lib/efa-coordination-display";
import { summarizeGuards, type CoordinationSummary } from "@/lib/efa-coordination-summary";

function plural(count: number) {
  return `${count} ${count === 1 ? "guardia" : "guardias"}`;
}

/** Today's situation in three figures; typography carries the hierarchy, not boxes. */
export function EfaCoordinationSummaryStrip({ summary }: { summary: CoordinationSummary }) {
  const figures = [
    { id: "open", label: "En curso ahora", value: summary.openNow, live: summary.openNow > 0 },
    { id: "guards", label: "Guardias hoy", value: summary.guardsToday, live: false },
    { id: "services", label: "Servicios hoy", value: summary.servicesToday, live: false },
  ];
  return (
    <dl aria-label="Resumen de hoy" className="flex flex-wrap gap-x-8 gap-y-2 border-b pb-3">
      {figures.map((figure) => (
        <div key={figure.id} className="flex flex-col-reverse">
          <dt className="text-xs text-muted-foreground">{figure.label}</dt>
          <dd className="flex items-center gap-2 text-2xl font-semibold tabular-nums leading-tight">
            {figure.live && <span aria-hidden="true" className="size-2 rounded-full bg-primary" />}
            {figure.value}
          </dd>
        </div>
      ))}
    </dl>
  );
}

/** Admin oversight of every EFA guard, inside the "Coordinación EFA" area layout. */
export function EfaCoordinationPanel({
  guards,
  search,
  onSearchChange,
  onGuardsChanged,
  now: fixedNow,
}: {
  guards: EfaOversightGuardView[];
  search: CoordinationSearch;
  onSearchChange: (next: CoordinationSearch) => void;
  /** Reloads the loaded guard list, e.g. after an end-time correction. */
  onGuardsChanged: () => Promise<unknown>;
  /** Fixed clock for tests; otherwise the page clock ticks every minute. */
  now?: Date;
}) {
  const [clock, setClock] = useState(() => new Date());
  useEffect(() => {
    if (fixedNow) return;
    const timer = window.setInterval(() => setClock(new Date()), 60_000);
    return () => window.clearInterval(timer);
  }, [fixedNow]);
  const now = fixedNow ?? clock;
  const owners = useMemo(() => listGuardOwners(guards), [guards]);
  const visible = useMemo(() => filterOversightGuards(guards, search), [guards, search]);
  const sorted = useMemo(() => sortGuardsOpenFirst(visible), [visible]);
  const summary = useMemo(() => summarizeGuards(guards, now), [guards, now]);
  const grouped = isGroupedByOwner(search);

  return (
    <EfaCoordinationLayout
      active="guards"
      owners={owners}
      search={search}
      onSearchChange={onSearchChange}
      meta={
        visible.length === guards.length
          ? plural(guards.length)
          : `${plural(visible.length)} de ${guards.length}`
      }
    >
      <EfaCoordinationSummaryStrip summary={summary} />
      <section aria-label="Lista de guardias" className="min-w-0 space-y-4">
        {guards.length === 0 ? (
          <p className="py-8 text-center text-sm text-muted-foreground">
            Todavía no hay guardias registradas.
          </p>
        ) : visible.length === 0 ? (
          <p className="py-8 text-center text-sm text-muted-foreground">
            No hay guardias con estos filtros.
          </p>
        ) : (
          <>
            <div className="hidden lg:block">
              <EfaCoordinationGuardTable
                guards={sorted}
                grouped={grouped}
                now={now}
                onGuardChanged={onGuardsChanged}
              />
            </div>
            <div className="lg:hidden">
              <EfaCoordinationGuardCards
                guards={sorted}
                grouped={grouped}
                now={now}
                onGuardChanged={onGuardsChanged}
              />
            </div>
          </>
        )}
      </section>
    </EfaCoordinationLayout>
  );
}
