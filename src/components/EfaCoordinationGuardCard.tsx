import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Badge } from "@/components/ui/badge";
import {
  listEfaGuardServices,
  type EfaGuardServiceTotals,
  type EfaOversightEpisodeView,
  type EfaOversightGuardView,
} from "@/lib/efa-guard-oversight.functions";
import {
  dispatchResultLabel,
  dispatchTimeSteps,
  formatDateTimeMinutes,
  formatDispatchPriority,
  formatHygieneDuration,
  formatTimeMinutes,
} from "@/lib/efa-labels";

export const coordinationServicesQueryKey = (guardId: string) =>
  ["efa-coordination-services", guardId] as const;

const plural = (count: number, singular: string, many: string) =>
  `${count} ${count === 1 ? singular : many}`;

/** Readable badges for the per-guard totals; zero totals read as "Sin …". */
export function guardTotalBadges(totals: EfaGuardServiceTotals) {
  const { draft, closed, cancelled } = totals.episodes;
  const services = draft + closed + cancelled;
  return [
    {
      id: "services",
      label: services ? `Servicios: ${services}` : "Sin servicios",
      detail: services
        ? `${plural(draft, "en borrador", "en borrador")} · ${plural(closed, "cerrado", "cerrados")} · ${plural(cancelled, "cancelado", "cancelados")}`
        : null,
    },
    {
      id: "dispatches",
      label: totals.dispatches.total ? `Despachos: ${totals.dispatches.total}` : "Sin despachos",
      detail: totals.dispatches.cancelled
        ? plural(totals.dispatches.cancelled, "cancelado", "cancelados")
        : null,
    },
    {
      id: "arrivals",
      label: totals.mobileArrivals ? `Arribos: ${totals.mobileArrivals}` : "Sin arribos",
      detail: null,
    },
    {
      id: "hygiene",
      label: totals.hygienePeriods ? `Higiene: ${totals.hygienePeriods}` : "Sin higiene",
      detail: null,
    },
  ];
}

function episodeStateLabel(episode: EfaOversightEpisodeView) {
  if (episode.cancelledAt) return "Cancelado";
  return episode.state === "closed" ? "Cerrado" : "Borrador";
}

const dispatchStateLabels: Record<string, string> = {
  draft: "Borrador",
  finalized: "Finalizado",
  cancelled: "Cancelado",
};

type ShownDispatchStep = "t0At" | "t1At" | "t2At" | "t3At" | "t4At";
const shownDispatchSteps = dispatchTimeSteps.slice(0, 5) as ReadonlyArray<
  readonly [ShownDispatchStep, string]
>;

/** Services of one guard with their dispatches. Presentational, so it renders in tests. */
export function EfaCoordinationServiceList({ episodes }: { episodes: EfaOversightEpisodeView[] }) {
  if (episodes.length === 0) {
    return (
      <p className="rounded border border-dashed p-3 text-sm text-muted-foreground">
        No hubo servicios en esta guardia.
      </p>
    );
  }
  return (
    <ul className="space-y-3">
      {episodes.map((episode) => (
        <li key={episode.id} className="min-w-0 space-y-2 rounded-md border p-3 text-sm">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <span className="font-medium">{formatDateTimeMinutes(episode.eventAt)}</span>
            <span className="inline-flex min-h-6 items-center rounded-full bg-muted px-2 text-xs">
              {episodeStateLabel(episode)}
            </span>
            {episode.interventionNumber && (
              <span className="text-muted-foreground">
                Intervención {episode.interventionNumber}
              </span>
            )}
          </div>
          <p className="break-words">{episode.motive || "Sin motivo registrado"}</p>
          <p className="break-words text-muted-foreground">
            {episode.address || "Sin dirección registrada"}
          </p>
          {episode.dispatches.length > 0 ? (
            <ul className="space-y-2 border-t pt-2">
              {episode.dispatches.map((dispatch) => (
                <li key={dispatch.id} className="min-w-0 space-y-1">
                  <p>
                    <span className="font-medium">{dispatch.baseName}</span> ·{" "}
                    {dispatch.priority
                      ? `Prioridad ${formatDispatchPriority(dispatch.priority)}`
                      : "Sin prioridad"}{" "}
                    · {dispatchResultLabel(dispatch.result)} ·{" "}
                    {dispatchStateLabels[dispatch.state] ?? dispatch.state}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {shownDispatchSteps
                      .map(([key, label]) => `${label} ${formatTimeMinutes(dispatch[key])}`)
                      .join(" · ")}
                  </p>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-xs text-muted-foreground">Sin despachos.</p>
          )}
        </li>
      ))}
    </ul>
  );
}

function GuardServices({ guardId }: { guardId: string }) {
  const listServices = useServerFn(listEfaGuardServices);
  const query = useQuery({
    queryKey: coordinationServicesQueryKey(guardId),
    queryFn: async () => (await listServices({ data: { guardId } })) as EfaOversightEpisodeView[],
  });
  if (query.isPending) {
    return (
      <p role="status" className="text-sm text-muted-foreground">
        Cargando servicios…
      </p>
    );
  }
  if (query.isError) {
    return (
      <p role="alert" className="text-sm text-destructive">
        No se pudieron cargar los servicios de esta guardia. Inténtalo nuevamente.
      </p>
    );
  }
  return <EfaCoordinationServiceList episodes={query.data} />;
}

export function EfaCoordinationGuardCard({
  guard,
  showOwner = true,
}: {
  guard: EfaOversightGuardView;
  showOwner?: boolean;
}) {
  const [detailsOpen, setDetailsOpen] = useState(false);
  const open = !guard.endedAt;
  const duration = guard.endedAt ? formatHygieneDuration(guard.startedAt, guard.endedAt) : null;
  return (
    <article
      className={`min-w-0 space-y-3 rounded-lg border p-4 ${open ? "border-l-4 border-l-primary bg-primary/5" : ""}`}
    >
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <span
          className={`inline-flex min-h-7 items-center rounded-full px-2 text-xs font-medium ${
            open ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground"
          }`}
        >
          {open ? "En curso" : "Finalizada"}
        </span>
        {showOwner && <p className="font-medium">{guard.owner.name}</p>}
      </div>
      <div className="grid gap-1 text-sm sm:grid-cols-2">
        <p>Inicio: {formatDateTimeMinutes(guard.startedAt)}</p>
        <p>Fin: {guard.endedAt ? formatDateTimeMinutes(guard.endedAt) : "En curso"}</p>
        {duration && <p>Duración: {duration}</p>}
        <p className="break-words">
          Bases:{" "}
          {guard.bases.length ? guard.bases.map((base) => base.name).join(", ") : "Sin base activa"}
        </p>
      </div>
      <ul className="flex flex-wrap gap-2" aria-label="Totales de la guardia">
        {guardTotalBadges(guard.totals).map((badge) => (
          <li key={badge.id}>
            <Badge variant="secondary" className="min-h-7 gap-1 font-medium">
              {badge.label}
              {badge.detail && <span className="font-normal">({badge.detail})</span>}
            </Badge>
          </li>
        ))}
      </ul>
      <details
        className="min-w-0 space-y-3"
        open={detailsOpen}
        onToggle={(event) => setDetailsOpen(event.currentTarget.open)}
      >
        <summary className="min-h-11 cursor-pointer py-2 text-sm font-medium">
          {detailsOpen ? "Ocultar servicios" : "Ver servicios"}
        </summary>
        {detailsOpen && <GuardServices guardId={guard.id} />}
      </details>
    </article>
  );
}
