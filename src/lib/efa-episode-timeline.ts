// Pure builder for the chronological timeline shown in the read-only episode summary. It never
// reads private police notes or meeting references: only the fields typed below are consumed.
import {
  directionLabel,
  dispatchTimeSteps,
  formatDispatchPriority,
  observationClassificationLabel,
  policeEventLabel,
  policePlaceTypeLabel,
  timeStatusLabel,
  type CommunicationDirection,
  type CommunicationPriority,
  type ObservationClassification,
  type PoliceEventKind,
  type TimeStatus,
  type TimelineKind,
} from "@/lib/efa-labels";

export type EpisodeTimelineItem = {
  at: string | null;
  kind: TimelineKind;
  title: string;
  detail?: string;
};

export type EpisodeTimeline = {
  /** Items with a valid time, ascending. */
  items: EpisodeTimelineItem[];
  /** Items that have no usable time ("Sin hora"), in source order. */
  withoutTime: EpisodeTimelineItem[];
};

export type EpisodeTimelineInput = {
  episode: { eventAt: string; closedAt?: string | null; cancelledAt?: string | null };
  communications: Array<{
    id: string;
    direction: CommunicationDirection;
    priority: CommunicationPriority | null;
    state: "draft" | "finalized" | "cancelled";
    startedAt: string | null;
    createdAt: string;
  }>;
  dispatches: Array<
    {
      id: string;
      baseName?: string | null;
      state?: "draft" | "finalized" | "cancelled";
      contactAttempts?: Array<{ id: string; occurredAt?: string | null; note?: string | null }>;
    } & Record<(typeof dispatchTimeSteps)[number][0], string | null>
  >;
  coordinations: Array<{
    id: string;
    placeType: "incident" | "meeting_point";
    events: Array<{
      id: string;
      kind: PoliceEventKind;
      occurredAt: string | null;
      timeStatus: TimeStatus;
    }>;
  }>;
  observations: Array<{
    id: string;
    recordKind?: "conduct" | "participation";
    catalogLabelSnapshot: string | null;
    otherDescription: string | null;
    classification: ObservationClassification | null;
    comment: string | null;
    observedAt?: string | null;
    createdAt?: string | null;
  }>;
};

const validTime = (value: string | null | undefined) => {
  if (!value) return null;
  const time = new Date(value).getTime();
  return Number.isFinite(time) ? time : null;
};

const joinDetail = (...parts: Array<string | null | undefined>) => {
  const text = parts.filter((part): part is string => Boolean(part)).join(" · ");
  return text || undefined;
};

export function buildEpisodeTimeline(input: EpisodeTimelineInput): EpisodeTimeline {
  const raw: Array<{ item: EpisodeTimelineItem; time: string | null | undefined }> = [];
  const add = (
    kind: TimelineKind,
    title: string,
    time: string | null | undefined,
    detail?: string,
  ) => raw.push({ item: { at: null, kind, title, ...(detail ? { detail } : {}) }, time });

  add("service", "Hora del hecho", input.episode.eventAt);
  if (input.episode.closedAt) add("service", "Servicio cerrado", input.episode.closedAt);
  if (input.episode.cancelledAt) add("service", "Servicio anulado", input.episode.cancelledAt);

  for (const call of input.communications) {
    add(
      "call",
      `Llamada ${directionLabel(call.direction).toLowerCase()}`,
      call.startedAt ?? call.createdAt,
      joinDetail(
        call.priority ? `Prioridad ${formatDispatchPriority(call.priority)}` : null,
        call.state === "cancelled" ? "Anulada" : null,
      ),
    );
  }

  for (const dispatch of input.dispatches) {
    const base = dispatch.baseName?.trim() || "Base histórica";
    const cancelled = dispatch.state === "cancelled" ? "Anulada" : null;
    for (const [key, label] of dispatchTimeSteps) {
      if (dispatch[key])
        add("dispatch", `${label} · ${base}`, dispatch[key], cancelled ?? undefined);
    }
    for (const attempt of dispatch.contactAttempts ?? []) {
      add(
        "follow_up",
        `Seguimiento · ${base}`,
        attempt.occurredAt,
        joinDetail(attempt.note?.trim(), cancelled),
      );
    }
  }

  for (const coordination of input.coordinations) {
    const place = policePlaceTypeLabel(coordination.placeType);
    for (const event of coordination.events) {
      add(
        "police",
        policeEventLabel(event.kind),
        event.occurredAt,
        joinDetail(place, event.occurredAt ? null : timeStatusLabel(event.timeStatus)),
      );
    }
  }

  for (const observation of input.observations) {
    if (observation.recordKind === "participation") continue;
    add(
      "conduct",
      observation.catalogLabelSnapshot?.trim() ||
        observation.otherDescription?.trim() ||
        "Conducta observada",
      observation.observedAt ?? observation.createdAt,
      joinDetail(
        observationClassificationLabel(observation.classification),
        observation.comment?.trim(),
      ),
    );
  }

  const timed: Array<{ item: EpisodeTimelineItem; at: number; index: number }> = [];
  const withoutTime: EpisodeTimelineItem[] = [];
  raw.forEach(({ item, time }, index) => {
    const at = validTime(time);
    if (at === null || !time) withoutTime.push(item);
    else timed.push({ item: { ...item, at: time }, at, index });
  });
  timed.sort((a, b) => a.at - b.at || a.index - b.index);
  return { items: timed.map(({ item }) => item), withoutTime };
}
