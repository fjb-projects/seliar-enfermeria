// Pure builder for "Cronología de la guardia": guard-level conducts (records without a service)
// ordered by when they were observed, with the guard's services as context markers. It follows
// the episode chronology (`buildEpisodeTimeline`): oldest first, stable ties, untimed items apart.
import { formatTimeMinutes, type ObservationClassification } from "@/lib/efa-labels";

export type GuardTimelineFilter = "all" | "needs_improvement";

export type GuardTimelineObservation = {
  id: string;
  guardId: string;
  contextType: string;
  episodeId: string | null;
  recordKind?: "conduct" | "participation";
  catalogLabelSnapshot: string | null;
  otherDescription: string | null;
  classification: ObservationClassification | null;
  comment: string | null;
  observedAt: string | null;
  createdAt: string;
};

export type GuardTimelineService = {
  id: string;
  originGuardId: string;
  eventAt: string;
  interventionNumber: string | null;
  motive: string | null;
  cancelledAt: string | null;
};

export type GuardTimelineConductItem = {
  kind: "conduct";
  id: string;
  at: string | null;
  time: string;
  /** "recorded" when no observed time was given and the record time stands in for it. */
  timeSource: "observed" | "recorded";
  title: string;
  classification: ObservationClassification | null;
  comment: string | null;
};

export type GuardTimelineServiceItem = {
  kind: "service";
  id: string;
  at: string;
  time: string;
  title: string;
};

export type GuardTimelineItem = GuardTimelineConductItem | GuardTimelineServiceItem;

export type GuardTimeline = {
  /** Timed conducts and service markers, oldest first. */
  items: GuardTimelineItem[];
  /** Conducts without any usable time ("Sin hora"), in source order. */
  withoutTime: GuardTimelineConductItem[];
  /** Guard-level conducts before the filter, to tell an empty guard from an empty filter. */
  conductCount: number;
  /** Conducts left after the filter, timed or not. */
  shownConductCount: number;
};

const validTime = (value: string | null | undefined) => {
  if (!value) return null;
  const time = new Date(value).getTime();
  return Number.isFinite(time) ? time : null;
};

const serviceTitle = (service: GuardTimelineService) => {
  const number = service.interventionNumber?.trim();
  if (number) return `Servicio · Intervención ${number}`;
  const motive = service.motive?.trim();
  return motive ? `Servicio · ${motive}` : "Servicio sin motivo registrado";
};

export function buildGuardTimeline(input: {
  guardId: string;
  observations: GuardTimelineObservation[];
  services: GuardTimelineService[];
  filter: GuardTimelineFilter;
}): GuardTimeline {
  const timed: Array<{ item: GuardTimelineItem; at: number; index: number }> = [];
  const withoutTime: GuardTimelineConductItem[] = [];

  // Markers go first so a service and a conduct at the same minute read service → conduct.
  for (const service of input.services) {
    if (service.originGuardId !== input.guardId || service.cancelledAt) continue;
    const at = validTime(service.eventAt);
    if (at === null) continue;
    timed.push({
      item: {
        kind: "service",
        id: service.id,
        at: service.eventAt,
        time: formatTimeMinutes(service.eventAt),
        title: serviceTitle(service),
      },
      at,
      index: timed.length,
    });
  }

  let conductCount = 0;
  let shownConductCount = 0;
  for (const observation of input.observations) {
    if (
      observation.guardId !== input.guardId ||
      observation.contextType !== "guard" ||
      observation.episodeId !== null ||
      observation.recordKind === "participation"
    )
      continue;
    conductCount++;
    if (input.filter === "needs_improvement" && observation.classification !== "needs_improvement")
      continue;
    shownConductCount++;
    const observedAt = validTime(observation.observedAt);
    const recordedAt = validTime(observation.createdAt);
    const source = observedAt !== null ? observation.observedAt : observation.createdAt;
    const at = observedAt ?? recordedAt;
    const base = {
      kind: "conduct" as const,
      id: observation.id,
      timeSource: observedAt !== null ? ("observed" as const) : ("recorded" as const),
      title:
        observation.catalogLabelSnapshot?.trim() ||
        observation.otherDescription?.trim() ||
        "Conducta observada",
      classification: observation.classification,
      comment: observation.comment?.trim() || null,
    };
    if (at === null || !source) {
      withoutTime.push({ ...base, at: null, time: "Sin hora" });
      continue;
    }
    timed.push({
      item: { ...base, at: source, time: formatTimeMinutes(source) },
      at,
      index: timed.length,
    });
  }

  timed.sort((a, b) => a.at - b.at || a.index - b.index);
  return { items: timed.map(({ item }) => item), withoutTime, conductCount, shownConductCount };
}
