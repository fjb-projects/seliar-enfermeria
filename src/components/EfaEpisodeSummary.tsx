import { useCallback, useEffect, useState, type ReactNode } from "react";
import {
  Ambulance,
  ClipboardList,
  Eye,
  History,
  MessageSquareText,
  Phone,
  ShieldCheck,
  type LucideIcon,
} from "lucide-react";
import { useServerFn } from "@tanstack/react-start";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { listEfaCommunicationsForEpisode } from "@/lib/efa-communications.functions";
import { listEfaDispatchesForEpisode } from "@/lib/efa-dispatches.functions";
import { listEfaObservationsForEpisode } from "@/lib/efa-observations.functions";
import { listEfaPoliceCoordinationsForEpisode } from "@/lib/efa-police-coordination.functions";
import {
  dispatchResultLabel,
  dispatchTimeSteps,
  directionLabel,
  formatDateTimeMinutes,
  formatDispatchPriority,
  formatTimeMinutes,
  observationClassificationLabel,
  policeEventLabel,
  policeInitiatorLabel,
  policePlaceTypeLabel,
  timeStatusLabel,
  timelineKindLabels,
  type CommunicationDirection,
  type CommunicationPriority,
  type ObservationClassification,
  type PoliceEventKind,
  type TimeStatus,
  type TimelineKind,
} from "@/lib/efa-labels";
import { buildEpisodeTimeline, type EpisodeTimelineItem } from "@/lib/efa-episode-timeline";
import type { EpisodeView } from "@/components/EfaEpisodePanel";

type SummaryCommunication = {
  id: string;
  direction: CommunicationDirection;
  priority: CommunicationPriority | null;
  state: "draft" | "finalized" | "cancelled";
  startedAt: string | null;
  createdAt: string;
};
type SummaryDispatch = {
  id: string;
  baseName?: string | null;
  institutionName?: string | null;
  priority: string | null;
  result: string | null;
  resultClarification?: string | null;
  finalizedAt?: string | null;
  state: "draft" | "finalized" | "cancelled";
  contactAttempts?: Array<{ id: string; occurredAt?: string | null; note?: string | null }>;
} & Record<(typeof dispatchTimeSteps)[number][0], string | null>;
type SummaryPoliceEvent = {
  id: string;
  kind: PoliceEventKind;
  occurredAt: string | null;
  timeStatus: TimeStatus;
};
type SummaryPoliceCoordination = {
  id: string;
  initiator: "central" | "ambulance";
  placeType: "incident" | "meeting_point";
  state: "draft" | "finalized";
  dispatchIds?: string[];
  events: SummaryPoliceEvent[];
};
type SummaryObservation = {
  id: string;
  recordKind?: "conduct" | "participation";
  catalogLabelSnapshot: string | null;
  otherDescription: string | null;
  classification: ObservationClassification | null;
  comment: string | null;
  observedAt?: string | null;
  createdAt?: string | null;
};

export type EpisodeSummaryData = {
  communications: SummaryCommunication[];
  dispatches: SummaryDispatch[];
  coordinations: SummaryPoliceCoordination[];
  observations: SummaryObservation[];
};
export type EpisodeSummaryState =
  { status: "loading" } | { status: "error" } | { status: "ready"; data: EpisodeSummaryData };

type SummaryEpisode = Pick<
  EpisodeView,
  | "id"
  | "eventAt"
  | "motive"
  | "address"
  | "interventionNumber"
  | "state"
  | "closedAt"
  | "cancelledAt"
  | "cancelledFromState"
  | "updatedAt"
>;

const dayPart = (value: string) => formatDateTimeMinutes(value).split(" ")[0];

/** Shows only the time when it falls on the same day as the reference moment. */
function updatedAtText(updatedAt: string, reference: string | null | undefined) {
  return reference && dayPart(reference) === dayPart(updatedAt)
    ? formatTimeMinutes(updatedAt)
    : formatDateTimeMinutes(updatedAt);
}

/** One human line describing where the service ended up, instead of a version list. */
// eslint-disable-next-line react-refresh/only-export-components -- Pure formatter tested beside its UI.
export function episodeFinalStateLine(episode: SummaryEpisode) {
  if (episode.cancelledAt) {
    return `Anulado el ${formatDateTimeMinutes(episode.cancelledAt)} · última actualización ${updatedAtText(episode.updatedAt, episode.cancelledAt)}`;
  }
  if (episode.state === "closed") {
    const closedAt = episode.closedAt ?? episode.updatedAt;
    return `Cerrado el ${formatDateTimeMinutes(closedAt)} · última actualización ${updatedAtText(episode.updatedAt, closedAt)}`;
  }
  return `Servicio en curso · última actualización ${formatDateTimeMinutes(episode.updatedAt)}`;
}

const episodeStatusText = (episode: SummaryEpisode) =>
  episode.cancelledAt
    ? `Anulado (estaba ${episode.cancelledFromState === "closed" ? "cerrado" : "activo"})`
    : episode.state === "closed"
      ? "Cerrado"
      : "Activo";

const recordStateText = (state: "draft" | "finalized" | "cancelled") =>
  state === "cancelled" ? "Anulada" : state === "draft" ? "En curso" : null;

/** A dispatch that was not finalized is "Sin finalizar": it does not mean the mobile is on scene. */
const dispatchStateText = (state: "draft" | "finalized" | "cancelled") =>
  state === "cancelled" ? "Anulada" : state === "draft" ? "Sin finalizar" : null;

/** One line with the outcome of a dispatch: result, optional clarification and finalization time. */
// eslint-disable-next-line react-refresh/only-export-components -- Pure formatter tested beside its UI.
export function dispatchResultLine(dispatch: {
  state?: "draft" | "finalized" | "cancelled";
  result: string | null;
  resultClarification?: string | null;
  finalizedAt?: string | null;
}) {
  const cancelled = dispatch.state === "cancelled";
  if (!dispatch.result) return cancelled ? "Resultado: Anulada" : "Resultado: Pendiente";
  const clarification = dispatch.resultClarification?.trim();
  return [
    `Resultado: ${dispatchResultLabel(dispatch.result)}`,
    clarification,
    dispatch.finalizedAt && !cancelled
      ? `Finalizado ${formatTimeMinutes(dispatch.finalizedAt)}`
      : null,
  ]
    .filter(Boolean)
    .join(" · ");
}

const priorityTone: Record<string, string> = {
  red: "border-red-300 bg-red-100 text-red-900 dark:border-red-800 dark:bg-red-950 dark:text-red-100",
  yellow:
    "border-amber-300 bg-amber-100 text-amber-900 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-100",
  green:
    "border-emerald-300 bg-emerald-100 text-emerald-900 dark:border-emerald-800 dark:bg-emerald-950 dark:text-emerald-100",
};

function PriorityBadge({ priority }: { priority: string | null | undefined }) {
  const known = priority && priority in priorityTone ? priority : null;
  return (
    <Badge
      variant="secondary"
      className={cn(
        "font-medium",
        known ? priorityTone[known] : "border-border bg-muted text-muted-foreground",
      )}
    >
      {known ? `Prioridad ${formatDispatchPriority(known)}` : "Sin prioridad"}
    </Badge>
  );
}

type Tone = {
  card: string;
  icon: string;
};
const tones: Record<string, Tone> = {
  service: {
    card: "border-l-sky-500",
    icon: "bg-sky-100 text-sky-800 dark:bg-sky-950 dark:text-sky-100",
  },
  calls: {
    card: "border-l-violet-500",
    icon: "bg-violet-100 text-violet-800 dark:bg-violet-950 dark:text-violet-100",
  },
  dispatches: {
    card: "border-l-orange-500",
    icon: "bg-orange-100 text-orange-800 dark:bg-orange-950 dark:text-orange-100",
  },
  police: {
    card: "border-l-indigo-500",
    icon: "bg-indigo-100 text-indigo-800 dark:bg-indigo-950 dark:text-indigo-100",
  },
  conducts: {
    card: "border-l-teal-500",
    icon: "bg-teal-100 text-teal-800 dark:bg-teal-950 dark:text-teal-100",
  },
  timeline: {
    card: "border-l-slate-500",
    icon: "bg-slate-100 text-slate-800 dark:bg-slate-900 dark:text-slate-100",
  },
};

const timelineIcons: Record<TimelineKind, LucideIcon> = {
  service: ClipboardList,
  call: Phone,
  dispatch: Ambulance,
  follow_up: MessageSquareText,
  police: ShieldCheck,
  conduct: Eye,
};

function SummarySection({
  id,
  tone,
  icon: Icon,
  title,
  children,
}: {
  id: string;
  tone: keyof typeof tones;
  icon: LucideIcon;
  title: string;
  children: ReactNode;
}) {
  const styles = tones[tone] as Tone;
  return (
    <Card
      role="region"
      aria-labelledby={id}
      className={cn("min-w-0 border-l-4 shadow-none", styles.card)}
    >
      <CardHeader className="flex-row items-center gap-2 space-y-0 px-3 py-3 sm:px-4">
        <span
          aria-hidden="true"
          className={cn(
            "flex size-8 shrink-0 items-center justify-center rounded-full",
            styles.icon,
          )}
        >
          <Icon className="size-4" />
        </span>
        <h4 id={id} className="min-w-0 break-words font-semibold leading-5">
          {title}
        </h4>
      </CardHeader>
      <CardContent className="space-y-2 px-3 pb-3 pt-0 text-sm sm:px-4">{children}</CardContent>
    </Card>
  );
}

const Muted = ({ children }: { children: ReactNode }) => (
  <p className="text-muted-foreground">{children}</p>
);

/** Shared loading and error body for the sections that need fetched data. */
function renderRemote(
  state: EpisodeSummaryState,
  ready: (data: EpisodeSummaryData) => ReactNode,
): ReactNode {
  if (state.status === "loading") return <Muted>Cargando…</Muted>;
  if (state.status === "error") return <Muted>No disponible por ahora.</Muted>;
  return ready(state.data);
}

const count = (value: number, singular: string, plural: string) =>
  `${value} ${value === 1 ? singular : plural}`;

function ServiceSection({ episode }: { episode: SummaryEpisode }) {
  const rows: Array<[string, string]> = [
    ["Motivo", episode.motive?.trim() || "Sin motivo registrado"],
    ["Dirección", episode.address?.trim() || "Sin dirección registrada"],
    ["Hora del hecho", formatDateTimeMinutes(episode.eventAt)],
    ["N° de intervención", episode.interventionNumber?.trim() || "Sin número registrado"],
    ["Estado", episodeStatusText(episode)],
  ];
  return (
    <SummarySection
      id={`summary-service-${episode.id}`}
      tone="service"
      icon={ClipboardList}
      title="Servicio"
    >
      <dl className="grid gap-x-4 gap-y-1.5 sm:grid-cols-2">
        {rows.map(([label, value]) => (
          <div key={label} className="min-w-0">
            <dt className="text-xs text-muted-foreground">{label}</dt>
            <dd className="break-words font-medium">{value}</dd>
          </div>
        ))}
      </dl>
    </SummarySection>
  );
}

function CommunicationsSection({ id, state }: { id: string; state: EpisodeSummaryState }) {
  return (
    <SummarySection id={id} tone="calls" icon={Phone} title="Llamadas">
      {renderRemote(state, ({ communications }) =>
        communications.length === 0 ? (
          <Muted>Sin llamadas todavía</Muted>
        ) : (
          <>
            <p>{count(communications.length, "llamada registrada", "llamadas registradas")}</p>
            <ul className="space-y-2">
              {communications.map((call) => {
                const status = recordStateText(call.state);
                return (
                  <li key={call.id} className="flex flex-wrap items-center gap-x-2 gap-y-1">
                    <span className="font-medium">{directionLabel(call.direction)}</span>
                    <span>{formatTimeMinutes(call.startedAt ?? call.createdAt)}</span>
                    <PriorityBadge priority={call.priority} />
                    {status && <span className="text-muted-foreground">({status})</span>}
                  </li>
                );
              })}
            </ul>
          </>
        ),
      )}
    </SummarySection>
  );
}

function DispatchesSection({ id, state }: { id: string; state: EpisodeSummaryState }) {
  return (
    <SummarySection id={id} tone="dispatches" icon={Ambulance} title="Despachos">
      {renderRemote(state, ({ dispatches }) =>
        dispatches.length === 0 ? (
          <Muted>Sin despachos todavía</Muted>
        ) : (
          <>
            <p>{count(dispatches.length, "despacho registrado", "despachos registrados")}</p>
            <ul className="space-y-3">
              {dispatches.map((dispatch) => {
                const status = dispatchStateText(dispatch.state);
                const times = dispatchTimeSteps
                  .filter(([key]) => dispatch[key])
                  .map(([key, label]) => `${label} ${formatTimeMinutes(dispatch[key])}`);
                const attempts = dispatch.contactAttempts?.length ?? 0;
                const destination = dispatch.institutionName?.trim();
                return (
                  <li key={dispatch.id} className="space-y-1 rounded-md bg-muted/50 p-2">
                    <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                      <span className="break-words font-medium">
                        {dispatch.baseName?.trim() || "Base histórica"}
                      </span>
                      <PriorityBadge priority={dispatch.priority} />
                      {status && <span className="text-muted-foreground">({status})</span>}
                    </div>
                    {destination && <p className="break-words">Destino: {destination}</p>}
                    <p className="break-words">{dispatchResultLine(dispatch)}</p>
                    <p className="text-muted-foreground">
                      {times.length > 0 ? times.join(" · ") : "Sin horarios registrados"}
                    </p>
                    {attempts > 0 && (
                      <p className="text-muted-foreground">
                        {count(attempts, "registro de seguimiento", "registros de seguimiento")}
                      </p>
                    )}
                  </li>
                );
              })}
            </ul>
          </>
        ),
      )}
    </SummarySection>
  );
}

function PoliceSection({ id, state }: { id: string; state: EpisodeSummaryState }) {
  return (
    <SummarySection id={id} tone="police" icon={ShieldCheck} title="Apoyo policial">
      {renderRemote(state, ({ coordinations }) =>
        coordinations.length === 0 ? (
          <Muted>Sin apoyo policial todavía</Muted>
        ) : (
          <ul className="space-y-3">
            {coordinations.map((coordination) => {
              const status = recordStateText(
                coordination.state === "draft" ? "draft" : "finalized",
              );
              return (
                <li key={coordination.id} className="space-y-1 rounded-md bg-muted/50 p-2">
                  <p>
                    <span className="font-medium">
                      Inició: {policeInitiatorLabel(coordination.initiator)}
                    </span>{" "}
                    · {policePlaceTypeLabel(coordination.placeType)}
                    {status && <span className="text-muted-foreground"> ({status})</span>}
                  </p>
                  {coordination.events.length === 0 ? (
                    <Muted>Sin eventos todavía</Muted>
                  ) : (
                    <ul className="space-y-0.5">
                      {coordination.events.map((event) => (
                        <li key={event.id}>
                          {policeEventLabel(event.kind)} ·{" "}
                          {event.occurredAt
                            ? formatTimeMinutes(event.occurredAt)
                            : timeStatusLabel(event.timeStatus)}
                        </li>
                      ))}
                    </ul>
                  )}
                </li>
              );
            })}
          </ul>
        ),
      )}
    </SummarySection>
  );
}

function ConductsSection({ id, state }: { id: string; state: EpisodeSummaryState }) {
  return (
    <SummarySection id={id} tone="conducts" icon={Eye} title="Conductas observadas">
      {renderRemote(state, ({ observations }) => {
        const conducts = observations.filter((item) => item.recordKind !== "participation");
        if (conducts.length === 0) return <Muted>Sin conductas registradas todavía</Muted>;
        const adequate = conducts.filter((item) => item.classification === "adequate").length;
        const improve = conducts.filter(
          (item) => item.classification === "needs_improvement",
        ).length;
        return (
          <>
            <p>
              {count(adequate, "adecuada", "adecuadas")} · {improve} a mejorar
            </p>
            <ul className="space-y-2">
              {conducts.map((item) => (
                <li key={item.id} className="space-y-0.5">
                  <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                    <span className="break-words font-medium">
                      {item.catalogLabelSnapshot?.trim() ||
                        item.otherDescription?.trim() ||
                        "Conducta observada"}
                    </span>
                    <Badge
                      variant="secondary"
                      className={cn(
                        "font-medium",
                        item.classification === "needs_improvement"
                          ? "border-amber-300 bg-amber-100 text-amber-900 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-100"
                          : "border-emerald-300 bg-emerald-100 text-emerald-900 dark:border-emerald-800 dark:bg-emerald-950 dark:text-emerald-100",
                      )}
                    >
                      {observationClassificationLabel(item.classification)}
                    </Badge>
                  </div>
                  {item.comment?.trim() && (
                    <p className="break-words text-muted-foreground">{item.comment.trim()}</p>
                  )}
                </li>
              ))}
            </ul>
          </>
        );
      })}
    </SummarySection>
  );
}

function TimelineEntry({ item }: { item: EpisodeTimelineItem }) {
  const Icon = timelineIcons[item.kind];
  return (
    <li className="flex min-w-0 gap-2">
      <span
        aria-hidden="true"
        className="mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full bg-muted text-muted-foreground"
      >
        <Icon className="size-3.5" />
      </span>
      <div className="min-w-0 space-y-0.5">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          {item.at && (
            <time dateTime={item.at} className="text-xs text-muted-foreground">
              {formatDateTimeMinutes(item.at)}
            </time>
          )}
          <Badge variant="outline" className="font-medium">
            {timelineKindLabels[item.kind]}
          </Badge>
        </div>
        <p className="break-words font-medium">{item.title}</p>
        {item.detail && <p className="break-words text-muted-foreground">{item.detail}</p>}
      </div>
    </li>
  );
}

function TimelineSection({
  id,
  episode,
  state,
}: {
  id: string;
  episode: SummaryEpisode;
  state: EpisodeSummaryState;
}) {
  return (
    <SummarySection id={id} tone="timeline" icon={History} title="Cronología del servicio">
      {renderRemote(state, ({ communications, dispatches, coordinations, observations }) => {
        const timeline = buildEpisodeTimeline({
          episode,
          communications,
          dispatches,
          coordinations,
          observations,
        });
        return (
          <>
            <ol className="space-y-3">
              {timeline.items.map((item, index) => (
                <TimelineEntry key={`${item.kind}-${item.at}-${index}`} item={item} />
              ))}
            </ol>
            {timeline.withoutTime.length > 0 && (
              <div className="space-y-2 border-t pt-2">
                <h5 className="text-xs font-semibold text-muted-foreground">Sin hora</h5>
                <ul className="space-y-3">
                  {timeline.withoutTime.map((item, index) => (
                    <TimelineEntry key={`${item.kind}-untimed-${index}`} item={item} />
                  ))}
                </ul>
              </div>
            )}
          </>
        );
      })}
    </SummarySection>
  );
}

/** Presentational summary: every state is derived from props so it can be rendered statically. */
export function EfaEpisodeSummaryView({
  episode,
  state,
  onRetry,
}: {
  episode: SummaryEpisode;
  state: EpisodeSummaryState;
  onRetry?: () => void;
}) {
  return (
    <div
      className="min-w-0 space-y-3"
      role="group"
      aria-label="Resumen del servicio"
      aria-busy={state.status === "loading"}
    >
      <p className="rounded-md bg-muted p-3 text-sm font-medium" data-testid="episode-final-state">
        {episodeFinalStateLine(episode)}
      </p>
      {state.status === "error" && (
        <div
          role="alert"
          className="flex flex-wrap items-center gap-2 rounded-md border border-rose-200 bg-rose-50 p-3 text-sm text-rose-950 dark:border-rose-900 dark:bg-rose-950/30 dark:text-rose-100"
        >
          <span>No se pudo cargar el resumen.</span>
          {onRetry && (
            <Button type="button" variant="outline" className="min-h-11 px-3" onClick={onRetry}>
              Reintentar
            </Button>
          )}
        </div>
      )}
      <ServiceSection episode={episode} />
      <CommunicationsSection id={`summary-calls-${episode.id}`} state={state} />
      <DispatchesSection id={`summary-dispatches-${episode.id}`} state={state} />
      <PoliceSection id={`summary-police-${episode.id}`} state={state} />
      <ConductsSection id={`summary-conducts-${episode.id}`} state={state} />
      <TimelineSection id={`summary-timeline-${episode.id}`} episode={episode} state={state} />
      <p className="text-xs text-muted-foreground">
        Puede haber cambios sin sincronizar que todavía no aparecen en este resumen.
      </p>
    </div>
  );
}

/**
 * Read-only episode summary. Mount it only when the user asks for it: it fetches the four
 * per-episode lists once on mount and keeps them in component state (no shared cache, so nothing
 * survives a sign-out or an account switch).
 */
export function EfaEpisodeSummary({ episode }: { episode: SummaryEpisode }) {
  const listCommunications = useServerFn(listEfaCommunicationsForEpisode);
  const listDispatches = useServerFn(listEfaDispatchesForEpisode);
  const listCoordinations = useServerFn(listEfaPoliceCoordinationsForEpisode);
  const listObservations = useServerFn(listEfaObservationsForEpisode);
  const episodeId = episode.id;
  const [state, setState] = useState<EpisodeSummaryState>({ status: "loading" });
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let current = true;
    void Promise.all([
      listCommunications({ data: episodeId }),
      listDispatches({ data: episodeId }),
      listCoordinations({ data: episodeId }),
      listObservations({ data: episodeId }),
    ])
      .then(([communications, dispatches, coordinations, observations]) => {
        if (!current) return;
        setState({
          status: "ready",
          data: {
            communications: communications as unknown as SummaryCommunication[],
            dispatches: dispatches as unknown as SummaryDispatch[],
            coordinations: coordinations as unknown as SummaryPoliceCoordination[],
            observations: observations as unknown as SummaryObservation[],
          },
        });
      })
      .catch(() => {
        if (current) setState({ status: "error" });
      });
    return () => {
      current = false;
    };
    // The server function wrappers are stable per mount; reload only for a new episode or retry.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [episodeId, attempt]);

  const retry = useCallback(() => {
    setState({ status: "loading" });
    setAttempt((value) => value + 1);
  }, []);

  return <EfaEpisodeSummaryView episode={episode} state={state} onRetry={retry} />;
}
