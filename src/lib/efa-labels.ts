// Shared Spanish labels and formatters for EFA records. Pure functions only, so both the
// editing components and the read-only episode summary render the same wording.

export const BUENOS_AIRES_TIME_ZONE = "America/Argentina/Buenos_Aires";

export type CommunicationPriority = "red" | "yellow" | "green";
export type CommunicationDirection = "incoming" | "outgoing";
export type TimeStatus = "observed" | "not_observed" | "not_informed" | "not_applicable";
export type PoliceEventKind =
  | "request"
  | "response"
  | "reiteration"
  | "arrival_meeting_point"
  | "waiting"
  | "actual_meeting";
export type ObservationContextKind =
  "guard" | "episode" | "communication" | "dispatch" | "coordination" | "police_event";
export type ObservationGroup = "phone" | "radio" | "coordination" | "duty" | "record";
export type ObservationClassification = "adequate" | "needs_improvement";
export type DispatchResult =
  | "transported"
  | "treated_at_home"
  | "refused"
  | "not_located"
  | "cancelled"
  | "death"
  | "not_informed";

export const priorityLabel = (value: CommunicationPriority | null | undefined) =>
  value === "red"
    ? "Roja"
    : value === "yellow"
      ? "Amarilla"
      : value === "green"
        ? "Verde"
        : "Sin prioridad";

export const directionLabel = (value: CommunicationDirection) =>
  value === "incoming" ? "Entrante" : "Saliente";

const dispatchPriorityLabels = { red: "roja", yellow: "amarilla", green: "verde" } as const;
export function formatDispatchPriority(priority: string | null | undefined) {
  return priority && priority in dispatchPriorityLabels
    ? dispatchPriorityLabels[priority as keyof typeof dispatchPriorityLabels]
    : "sin prioridad";
}

export const timeStatusLabel = (status: TimeStatus) =>
  ({
    observed: "Observado",
    not_observed: "No observado",
    not_informed: "No informado",
    not_applicable: "No aplica",
  })[status];

export const dispatchResultOptions = [
  ["transported", "Con traslado"],
  ["treated_at_home", "Atención en domicilio sin traslado"],
  ["refused", "Rechazo"],
  ["not_located", "No ubicado"],
  ["cancelled", "Cancelado"],
  ["death", "Óbito"],
  ["not_informed", "No informado"],
] as const;

export const dispatchResultLabel = (value: string | null | undefined) =>
  dispatchResultOptions.find(([key]) => key === value)?.[1] ?? "Sin resultado";

export const dispatchTimeSteps = [
  ["t0At", "Despacho"],
  ["t1At", "En camino"],
  ["t2At", "Llegada a escena"],
  ["t3At", "Sale de escena"],
  ["t4At", "Llegada a destino"],
  ["t5At", "Entrega efectiva"],
  ["t6At", "Disponible"],
] as const;

export const policeEventLabel = (kind: PoliceEventKind) =>
  ({
    request: "Solicitud",
    response: "Respuesta",
    reiteration: "Reiteración",
    arrival_meeting_point: "Llegada al punto de encuentro",
    waiting: "Espera",
    actual_meeting: "Encuentro realizado",
  })[kind];

export const policeInitiatorLabel = (value: "central" | "ambulance") =>
  value === "central" ? "Central" : "Ambulancia";

export const policePlaceTypeLabel = (value: "incident" | "meeting_point") =>
  value === "incident" ? "Lugar del hecho" : "Punto de encuentro";

export const observationContextLabels: Record<ObservationContextKind, string> = {
  guard: "Guardia",
  episode: "Episodio",
  communication: "Llamada",
  dispatch: "Despacho",
  coordination: "Apoyo policial",
  police_event: "Evento policial",
};

export const observationGroupLabels: Record<ObservationGroup, string> = {
  phone: "Teléfono",
  radio: "Radio",
  coordination: "Coordinación",
  duty: "Relevo y colaboración",
  record: "Registro",
};

export const observationClassificationLabel = (value: ObservationClassification | null) =>
  value === "adequate" ? "Adecuada" : value === "needs_improvement" ? "A mejorar" : "Sin clasificar";

function toValidDate(value: Date | string | null | undefined) {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isFinite(date.getTime()) ? date : null;
}

/** Short date and time with seconds, or a fallback when the moment was not observed. */
export const formatObservedDateTime = (
  value: Date | string | null | undefined,
  fallback = "Sin hora observada",
) => {
  const date = toValidDate(value);
  return date
    ? new Intl.DateTimeFormat("es-AR", {
        dateStyle: "short",
        timeStyle: "medium",
        timeZone: BUENOS_AIRES_TIME_ZONE,
      }).format(date)
    : fallback;
};

/** Compact "14/10/2026 11:09" (Buenos Aires time) for human summaries. */
export const formatDateTimeMinutes = (value: Date | string | null | undefined, fallback = "—") => {
  const date = toValidDate(value);
  return date
    ? new Intl.DateTimeFormat("es-AR", {
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
        hourCycle: "h23",
        timeZone: BUENOS_AIRES_TIME_ZONE,
      })
        .format(date)
        .replace(",", "")
    : fallback;
};

/** Compact "11:09" (Buenos Aires time). */
export const formatTimeMinutes = (value: Date | string | null | undefined, fallback = "—") => {
  const date = toValidDate(value);
  return date
    ? new Intl.DateTimeFormat("es-AR", {
        hour: "2-digit",
        minute: "2-digit",
        hourCycle: "h23",
        timeZone: BUENOS_AIRES_TIME_ZONE,
      }).format(date)
    : fallback;
};
