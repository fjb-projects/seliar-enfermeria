import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createClientOnlyFn, useServerFn } from "@tanstack/react-start";
import { Check, Clock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { ctaClasses } from "@/lib/cta-classes";
import {
  createEfaObservation,
  getEfaObservation,
  getEfaObservationCatalog,
  getEfaObservationHistory,
  listEfaObservationNotices,
  listEfaObservationsForEpisode,
  listEfaObservationsForGuard,
  markEfaObservationNoticeRead,
  updateEfaObservation,
} from "@/lib/efa-observations.functions";
import { listEfaEpisodes } from "@/lib/efa-episodes.functions";
import { listEfaCommunicationsForEpisode } from "@/lib/efa-communications.functions";
import { listEfaDispatchesForEpisode } from "@/lib/efa-dispatches.functions";
import {
  getEfaPoliceCoordination,
  listEfaPoliceCoordinationsForEpisode,
} from "@/lib/efa-police-coordination.functions";
import { listActiveEfaGuardBases, listEfaGuards } from "@/lib/efa-guards.functions";
import { observationContextLabels, observationGroupLabels } from "@/lib/efa-labels";
import {
  evaluatorParticipationLevelLabels,
  evaluatorParticipationLevels,
  type EvaluatorParticipationLevel,
  type ObservationRecordKind,
} from "@/lib/efa-observations.record-types";

const loadObservationQueue = createClientOnlyFn(() => import("@/lib/efa-observations.queue"));
type ContextKind =
  "guard" | "episode" | "communication" | "dispatch" | "coordination" | "police_event";
type ObservationRoot = {
  guardId: string;
  episodeId?: string;
  ownerUserId?: string;
  guardEndedAt?: string | Date | null;
};
// eslint-disable-next-line react-refresh/only-export-components -- Used by the initial-load scope regression test.
export function observationRootScopeKey(root: ObservationRoot) {
  const endedAt = root.guardEndedAt;
  const normalizedEndedAt =
    endedAt instanceof Date
      ? Number.isFinite(endedAt.getTime())
        ? endedAt.toISOString()
        : "invalid-date"
      : (endedAt ?? null);
  return JSON.stringify([
    root.guardId,
    root.episodeId || null,
    root.ownerUserId ?? null,
    normalizedEndedAt,
  ]);
}
type ContextSelection =
  | { kind: "guard" }
  | { kind: "episode"; episodeId: string }
  | { kind: "communication"; episodeId: string; id: string }
  | { kind: "dispatch"; episodeId: string; id: string }
  | { kind: "coordination"; episodeId: string; id: string }
  | { kind: "police_event"; episodeId: string; coordinationId: string; eventId: string };
type ObservationCatalogItem = {
  key: string;
  label: string;
  group: "phone" | "radio" | "coordination" | "duty" | "record";
  competencyReference: string | null;
};
type ObservationView = {
  id: string;
  ownerUserId: string;
  guardId: string;
  episodeId: string | null;
  contextType: ContextKind;
  communicationId: string | null;
  dispatchId: string | null;
  coordinationId: string | null;
  policeEventId: string | null;
  recordKind?: ObservationRecordKind;
  participationLevel?: EvaluatorParticipationLevel | null;
  catalogItemKey: string | null;
  catalogKeySnapshot: string | null;
  catalogLabelSnapshot: string | null;
  catalogGroupSnapshot: ObservationCatalogItem["group"] | null;
  otherDescription: string | null;
  classification: "adequate" | "needs_improvement" | null;
  comment: string | null;
  observedAt: string | null;
  clientCreationKey: string;
  version: number;
  createdAt: string;
  updatedAt: string;
  canEdit: boolean;
};
type ObservationForm = {
  catalogItemKey: string;
  classification: "adequate" | "needs_improvement";
  otherDescription: string;
  otherGroup: ObservationCatalogItem["group"];
  comment: string;
  observedAt: string;
};
type ParticipationForm = {
  level: EvaluatorParticipationLevel | "";
  comment: string;
  observedAt: string;
};
type ObservationAuditView = {
  id: string;
  actorUserId: string;
  action: "created" | "updated";
  versionBefore: number | null;
  versionAfter: number;
  beforeState: Record<string, string | null> | null;
  afterState: Record<string, string | null>;
  occurredAt: string;
};
type ObservationErrorSurface = "global" | "submit" | "queue" | "history" | "notice";
// eslint-disable-next-line react-refresh/only-export-components -- Shared with a focused unavailable-target fallback regression.
export function observationFeedbackNeedsGlobalFallback(
  area: ObservationErrorSurface,
  targetAvailable: boolean,
) {
  return area === "global" || !targetAvailable;
}
type ObservationNoticeView = {
  id: string;
  observationId: string;
  createdAt: string;
  readAt: string | null;
};
type ObservationQueueEntry = import("@/lib/efa-observations.queue").ObservationQueueEntry;
const emptyForm = (): ObservationForm => ({
  catalogItemKey: "",
  classification: "adequate",
  otherDescription: "",
  otherGroup: "record",
  comment: "",
  observedAt: "",
});
const emptyParticipationForm = (): ParticipationForm => ({
  level: "",
  comment: "",
  observedAt: "",
});
/** True when a draft holds anything that changing the context would silently discard. */
// eslint-disable-next-line react-refresh/only-export-components -- Pure helper exported for deterministic tests.
export function observationDraftDirty(
  conduct: Pick<
    ObservationForm,
    "catalogItemKey" | "classification" | "otherDescription" | "comment" | "observedAt"
  >,
  participation: ParticipationForm,
) {
  return Boolean(
    conduct.catalogItemKey ||
    conduct.otherDescription.trim() ||
    conduct.comment.trim() ||
    conduct.observedAt ||
    conduct.classification !== "adequate" ||
    participation.level ||
    participation.comment.trim() ||
    participation.observedAt,
  );
}
/** Groups catalog items in a fixed group order, dropping empty groups (one <optgroup> each). */
// eslint-disable-next-line react-refresh/only-export-components -- Pure helper exported for deterministic tests.
export function groupObservationCatalog<G extends string, T extends { group: G }>(
  items: readonly T[],
  order: readonly G[],
) {
  return order
    .map((group) => ({ group, items: items.filter((item) => item.group === group) }))
    .filter((entry) => entry.items.length > 0);
}
const classificationOptions = [
  {
    value: "adequate",
    label: "Adecuada",
    tone: "border-emerald-300/60 bg-emerald-300/20 text-emerald-100",
  },
  {
    value: "needs_improvement",
    label: "A mejorar",
    tone: "border-amber-300/60 bg-amber-300/20 text-amber-100",
  },
] as const;
const isParticipationRecord = (record: Pick<ObservationView, "recordKind">) =>
  record.recordKind === "participation";
const isParticipationEntry = (entry: ObservationQueueEntry) =>
  entry.payload["recordKind"] === "participation";
const participationLevelLabel = (value: unknown) =>
  typeof value === "string" && evaluatorParticipationLevels.includes(value as EvaluatorParticipationLevel)
    ? evaluatorParticipationLevelLabels[value as EvaluatorParticipationLevel]
    : "Nivel sin registrar";
const observationAuditStateLabel = (state: Record<string, string | null> | null) => {
  if (!state) return "Sin estado previo";
  const recordKind = state["recordKind"] ?? "conduct";
  return JSON.stringify({
    ...state,
    recordKind:
      recordKind === "participation" ? "Participación del evaluador" : "Conducta observada",
    participationLevel:
      recordKind === "participation" ? participationLevelLabel(state["participationLevel"]) : null,
    classification:
      recordKind === "participation"
        ? null
        : state["classification"] === "adequate"
          ? "Adecuada"
          : state["classification"] === "needs_improvement"
            ? "A mejorar"
            : null,
  });
};
const groupForContext: Record<ContextKind, ObservationCatalogItem["group"]> = {
  guard: "record",
  episode: "record",
  communication: "phone",
  dispatch: "radio",
  coordination: "coordination",
  police_event: "coordination",
};
const chipClassName =
  "inline-flex min-h-11 max-w-full items-center rounded-lg border border-white/15 px-3 text-left text-sm hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-60";
const chipActiveClassName = "bg-white/15 ring-1 ring-inset ring-white/30";
const segmentClassName =
  "inline-flex min-h-11 w-full items-center justify-center whitespace-nowrap rounded-lg border border-white/15 px-2.5 text-sm hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-60";
const contextLabels: Record<ContextKind, string> = observationContextLabels;
const groupLabels: Record<ObservationCatalogItem["group"], string> = observationGroupLabels;
const observationDate = (value: string | null) =>
  value
    ? new Intl.DateTimeFormat("es-AR", {
        dateStyle: "short",
        timeStyle: "medium",
        timeZone: "America/Argentina/Buenos_Aires",
      }).format(new Date(value))
    : "Sin hora observada";
const linkedOptionDate = (value: unknown) => {
  if (!(typeof value === "string" || value instanceof Date)) return null;
  const date = value instanceof Date ? value : new Date(value);
  if (!Number.isFinite(date.getTime())) return null;
  return new Intl.DateTimeFormat("es-AR", {
    timeZone: "America/Argentina/Buenos_Aires",
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).format(date);
};
const linkedOptionState = (value: unknown) =>
  value === "cancelled"
    ? "Anulado"
    : value === "finalized"
      ? "Finalizado"
      : value === "draft"
        ? "En curso"
        : null;
const linkedOptionPriority = (value: unknown) =>
  value === "red"
    ? "Prioridad roja"
    : value === "yellow"
      ? "Prioridad amarilla"
      : value === "green"
        ? "Prioridad verde"
        : "Sin prioridad";
const localDateTimeValue = (value: string | null) => {
  if (!value) return "";
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return "";
  const pad = (number: number, length = 2) => String(number).padStart(length, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}.${pad(date.getMilliseconds(), 3)}`;
};
const isoFromLocalDateTime = (value: string) => {
  if (!value) return null;
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? date.toISOString() : null;
};
const nextId = () => crypto.randomUUID();

// eslint-disable-next-line react-refresh/only-export-components -- Builds only valid typed contexts for the O1 server contract.
export function buildObservationContext(root: ObservationRoot, selection: ContextSelection) {
  if (selection.kind === "guard") return { contextType: "guard" as const, guardId: root.guardId };
  const episodeId = root.episodeId ?? selection.episodeId;
  if (selection.kind === "episode")
    return { contextType: "episode" as const, guardId: root.guardId, episodeId };
  if (selection.kind === "communication")
    return {
      contextType: "communication" as const,
      guardId: root.guardId,
      episodeId,
      communicationId: selection.id,
    };
  if (selection.kind === "dispatch")
    return {
      contextType: "dispatch" as const,
      guardId: root.guardId,
      episodeId,
      dispatchId: selection.id,
    };
  if (selection.kind === "coordination")
    return {
      contextType: "coordination" as const,
      guardId: root.guardId,
      episodeId,
      coordinationId: selection.id,
    };
  return {
    contextType: "police_event" as const,
    guardId: root.guardId,
    episodeId,
    coordinationId: selection.coordinationId,
    policeEventId: selection.eventId,
  };
}

// eslint-disable-next-line react-refresh/only-export-components -- Used by the actual quick-time button.
export function captureObservationNow(now: () => Date = () => new Date()) {
  return now().toISOString();
}

// eslint-disable-next-line react-refresh/only-export-components -- Shared by create gating and its deterministic tests.
export function observationCanCreate(input: {
  canWrite: boolean;
  isOwner: boolean;
  guardEndedAt: string | Date | null | undefined;
}) {
  return input.canWrite && input.isOwner && input.guardEndedAt == null;
}

// eslint-disable-next-line react-refresh/only-export-components -- Used by queued writes and their deterministic permission tests.
export async function withCurrentEfaWriteAccess<T>(input: {
  canWrite: boolean;
  verifyCurrentEfa: () => Promise<unknown>;
  write: () => Promise<T>;
}) {
  if (!input.canWrite) throw new Error("Se requiere acceso EFA vigente.");
  await input.verifyCurrentEfa();
  return input.write();
}

// eslint-disable-next-line react-refresh/only-export-components -- Shared by the pending-operation button and deterministic tests.
export function observationQueueEntryCanContinue(input: {
  actorUserId: string;
  currentUserId: string;
  contextKey: string;
  currentContextKey: string;
  operationId: string;
  pendingOperationId: string;
  status: ObservationQueueEntry["status"];
  busy: boolean;
}) {
  return (
    !input.busy &&
    input.actorUserId === input.currentUserId &&
    input.contextKey === input.currentContextKey &&
    (!input.pendingOperationId || input.pendingOperationId === input.operationId) &&
    ["pending", "uncertain", "confirmed-cleanup-failed"].includes(input.status)
  );
}

// eslint-disable-next-line react-refresh/only-export-components -- Guards retry of the same frozen request after initial persistence failure.
export function observationFrozenOperationMatches(input: {
  actorUserId: string;
  currentUserId: string;
  contextKey: string;
  currentContextKey: string;
  operationId: string;
  selectedOperationId: string;
  canWrite: boolean;
}) {
  return (
    input.actorUserId === input.currentUserId &&
    input.contextKey === input.currentContextKey &&
    input.operationId === input.selectedOperationId &&
    input.canWrite
  );
}

// eslint-disable-next-line react-refresh/only-export-components -- Same lock is used by conflict resolution and its concurrency test.
export function createObservationConflictGate() {
  let inFlight = false;
  return {
    async run<T>(work: () => Promise<T>) {
      if (inFlight) return { accepted: false as const };
      inFlight = true;
      try {
        return { accepted: true as const, value: await work() };
      } finally {
        inFlight = false;
      }
    },
  };
}

// eslint-disable-next-line react-refresh/only-export-components -- Shares the conflict retry lock contract with its regression test.
export function dispatchObservationRebasedEntry<T>(
  entry: ObservationQueueEntry,
  processEntry: (entry: ObservationQueueEntry, lockHeld?: boolean) => Promise<T>,
) {
  return processEntry(entry, true);
}

// eslint-disable-next-line react-refresh/only-export-components -- Applies optional patch fields during actual queue restoration.
export function restoreObservationUpdateForm(
  current: ObservationForm,
  payload: Record<string, unknown>,
): ObservationForm {
  const restored = { ...current };
  if (payload["catalogItemKey"] !== undefined)
    restored.catalogItemKey = String(payload["catalogItemKey"]);
  if (payload["classification"] !== undefined)
    restored.classification = payload["classification"] as ObservationForm["classification"];
  if (payload["otherDescription"] !== undefined)
    restored.otherDescription =
      payload["otherDescription"] === null ? "" : String(payload["otherDescription"]);
  if (payload["otherGroup"] !== undefined)
    restored.otherGroup = payload["otherGroup"] as ObservationForm["otherGroup"];
  if (payload["comment"] !== undefined)
    restored.comment = payload["comment"] === null ? "" : String(payload["comment"]);
  if (payload["observedAt"] !== undefined)
    restored.observedAt =
      payload["observedAt"] === null
        ? ""
        : typeof payload["observedAt"] === "string"
          ? localDateTimeValue(payload["observedAt"])
          : "";
  return restored;
}

// eslint-disable-next-line react-refresh/only-export-components -- Typed predicate used by the editor and queue preflight.
export function observationQueueContextAllows(input: {
  actorUserId: string;
  currentUserId: string;
  queueContextKey: string;
  currentQueueContextKey: string;
  operationId: string;
  selectedOperationId: string;
  canWrite: boolean;
}) {
  return (
    input.actorUserId === input.currentUserId &&
    input.queueContextKey === input.currentQueueContextKey &&
    input.operationId === input.selectedOperationId &&
    input.canWrite
  );
}

function serializeLocalContext(context: ReturnType<typeof buildObservationContext>) {
  return JSON.stringify(context);
}

function contextForObservation(observation: ObservationView): ContextSelection {
  if (observation.contextType === "guard") return { kind: "guard" };
  const episodeId = observation.episodeId ?? "";
  if (observation.contextType === "episode") return { kind: "episode", episodeId };
  if (observation.contextType === "communication")
    return { kind: "communication", episodeId, id: observation.communicationId ?? "" };
  if (observation.contextType === "dispatch")
    return { kind: "dispatch", episodeId, id: observation.dispatchId ?? "" };
  if (observation.contextType === "coordination")
    return { kind: "coordination", episodeId, id: observation.coordinationId ?? "" };
  return {
    kind: "police_event",
    episodeId,
    coordinationId: observation.coordinationId ?? "",
    eventId: observation.policeEventId ?? "",
  };
}

// eslint-disable-next-line react-refresh/only-export-components -- Shared by queue restoration and its deterministic tests.
export function observationContextSelectionFromPayload(
  payload: Record<string, unknown>,
): ContextSelection | null {
  const episodeId = typeof payload["episodeId"] === "string" ? payload["episodeId"] : "";
  const id = (field: string) => (typeof payload[field] === "string" ? String(payload[field]) : "");
  switch (payload["contextType"]) {
    case "guard":
      return { kind: "guard" };
    case "episode":
      return episodeId ? { kind: "episode", episodeId } : null;
    case "communication":
      return episodeId && id("communicationId")
        ? { kind: "communication", episodeId, id: id("communicationId") }
        : null;
    case "dispatch":
      return episodeId && id("dispatchId")
        ? { kind: "dispatch", episodeId, id: id("dispatchId") }
        : null;
    case "coordination":
      return episodeId && id("coordinationId")
        ? { kind: "coordination", episodeId, id: id("coordinationId") }
        : null;
    case "police_event":
      return episodeId && id("coordinationId") && id("policeEventId")
        ? {
            kind: "police_event",
            episodeId,
            coordinationId: id("coordinationId"),
            eventId: id("policeEventId"),
          }
        : null;
    default:
      return null;
  }
}

export function EfaObservationPanel({
  root,
  title,
  currentUserId,
  canWrite,
  isAdmin,
  compact = false,
}: {
  root: ObservationRoot;
  title: string;
  currentUserId: string;
  canWrite: boolean;
  isAdmin: boolean;
  compact?: boolean;
}) {
  const catalogFn = useServerFn(getEfaObservationCatalog);
  const listGuardFn = useServerFn(listEfaObservationsForGuard);
  const listEpisodeFn = useServerFn(listEfaObservationsForEpisode);
  const getObservationFn = useServerFn(getEfaObservation);
  const historyFn = useServerFn(getEfaObservationHistory);
  const noticesFn = useServerFn(listEfaObservationNotices);
  const markNoticeFn = useServerFn(markEfaObservationNoticeRead);
  const createFn = useServerFn(createEfaObservation);
  const updateFn = useServerFn(updateEfaObservation);
  const episodesFn = useServerFn(listEfaEpisodes);
  const communicationsFn = useServerFn(listEfaCommunicationsForEpisode);
  const dispatchesFn = useServerFn(listEfaDispatchesForEpisode);
  const coordinationsFn = useServerFn(listEfaPoliceCoordinationsForEpisode);
  const getCoordinationFn = useServerFn(getEfaPoliceCoordination);
  const guardsFn = useServerFn(listEfaGuards);
  const activeBasesFn = useServerFn(listActiveEfaGuardBases);
  const [catalog, setCatalog] = useState<ObservationCatalogItem[]>([]);
  const [observations, setObservations] = useState<ObservationView[]>([]);
  const [notices, setNotices] = useState<ObservationNoticeView[]>([]);
  const [episodes, setEpisodes] = useState<Array<Record<string, unknown>>>([]);
  const [communications, setCommunications] = useState<Array<Record<string, unknown>>>([]);
  const [dispatches, setDispatches] = useState<Array<Record<string, unknown>>>([]);
  const [coordinations, setCoordinations] = useState<Array<Record<string, unknown>>>([]);
  const [events, setEvents] = useState<Array<Record<string, unknown>>>([]);
  const [contextType, setContextType] = useState<ContextKind>(root.episodeId ? "episode" : "guard");
  const [contextEpisodeId, setContextEpisodeId] = useState(root.episodeId ?? "");
  const [leafId, setLeafId] = useState("");
  const [coordinationId, setCoordinationId] = useState("");
  const [optionalOpen, setOptionalOpen] = useState(false);
  const [form, setForm] = useState<ObservationForm>(emptyForm);
  const [editing, setEditing] = useState<ObservationView | null>(null);
  const [participationForm, setParticipationForm] = useState<ParticipationForm>(
    emptyParticipationForm,
  );
  const [participationEditing, setParticipationEditing] = useState<ObservationView | null>(null);
  const [participationError, setParticipationError] = useState("");
  const [participationMessage, setParticipationMessage] = useState("");
  const [history, setHistory] = useState<ObservationAuditView[]>([]);
  const [historyFor, setHistoryFor] = useState("");
  const [queueEntries, setQueueEntries] = useState<ObservationQueueEntry[]>([]);
  const [queueReady, setQueueReady] = useState(false);
  const [queueAvailable, setQueueAvailable] = useState(false);
  const [currentEfaAccess, setCurrentEfaAccess] = useState(false);
  const [pendingOperationId, setPendingOperationId] = useState("");
  const [selectedQueueOperationId, setSelectedQueueOperationId] = useState("");
  const [unpersisted, setUnpersisted] = useState<ObservationQueueEntry | null>(null);
  const [conflictRemote, setConflictRemote] = useState<ObservationView | null>(null);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [errorSurface, setErrorSurface] = useState<{
    area: ObservationErrorSurface;
    id?: string;
  }>({ area: "global" });
  const [message, setMessage] = useState("");
  const [messageSurface, setMessageSurface] = useState<ObservationErrorSurface>("global");
  const mounted = useRef(false);
  const contextRef = useRef({ currentUserId, root, canWrite: false });
  const queueStoreRef = useRef<import("@/lib/efa-observations.queue").ObservationQueueStore | null>(
    null,
  );
  const pendingRef = useRef(pendingOperationId);
  const selectedQueueRef = useRef(selectedQueueOperationId);
  const selectedContextRef = useRef("");
  const observationsRef = useRef(observations);
  const formRef = useRef(form);
  const selectionTicket = useRef(0);
  const operationSelectionKeys = useRef(new Map<string, string>());
  const busyRef = useRef(false);
  const conflictGateRef = useRef(createObservationConflictGate());
  const queueScope = root.episodeId ? `episode:${root.episodeId}` : `guard:${root.guardId}`;
  const rootScopeKey = observationRootScopeKey(root);
  const rootGuardId = root.guardId;
  const rootEpisodeId = root.episodeId;
  const selectedParticipationEntry = (entry: ObservationQueueEntry) =>
    isParticipationEntry(entry) &&
    operationSelectionKeys.current.get(entry.operationId) === selectedContextRef.current;
  const reportEntryError = (
    entry: ObservationQueueEntry,
    text: string,
    area: ObservationErrorSurface = "queue",
  ) => {
    if (selectedParticipationEntry(entry)) setParticipationError(text);
    else reportError(text, isParticipationEntry(entry) ? "queue" : area);
  };
  const reportEntryMessage = (
    entry: ObservationQueueEntry,
    text: string,
    area: ObservationErrorSurface,
  ) => {
    if (selectedParticipationEntry(entry)) setParticipationMessage(text);
    else if (!isParticipationEntry(entry)) reportMessage(text, area);
  };
  const reportError = (text: string, area: ObservationErrorSurface = "global", id?: string) => {
    setError(text);
    setErrorSurface(id === undefined ? { area } : { area, id });
  };
  const clearError = () => {
    setError("");
    setErrorSurface({ area: "global" });
  };
  const clearErrorAt = (area: ObservationErrorSurface, id?: string) => {
    if (errorSurface.area === area && (id === undefined || errorSurface.id === id)) clearError();
  };
  const reportMessage = (text: string, area: ObservationErrorSurface) => {
    setMessage(text);
    setMessageSurface(area);
  };
  const activeEpisodeId = root.episodeId ?? contextEpisodeId;
  const effectiveCanWrite = canWrite && currentEfaAccess;
  const isRootOwner = root.ownerUserId === currentUserId;
  const guardIsOpen = root.guardEndedAt == null;
  const canCreateHere = observationCanCreate({
    canWrite: effectiveCanWrite,
    isOwner: isRootOwner,
    guardEndedAt: root.guardEndedAt,
  });
  const currentContext = useMemo(() => {
    if (contextType === "guard") return buildObservationContext(root, { kind: "guard" });
    if (!activeEpisodeId) return null;
    if (contextType === "episode")
      return buildObservationContext(root, { kind: "episode", episodeId: activeEpisodeId });
    if (contextType === "communication" && leafId)
      return buildObservationContext(root, {
        kind: "communication",
        episodeId: activeEpisodeId,
        id: leafId,
      });
    if (contextType === "dispatch" && leafId)
      return buildObservationContext(root, {
        kind: "dispatch",
        episodeId: activeEpisodeId,
        id: leafId,
      });
    if (contextType === "coordination" && leafId)
      return buildObservationContext(root, {
        kind: "coordination",
        episodeId: activeEpisodeId,
        id: leafId,
      });
    if (!coordinationId || !leafId) return null;
    return buildObservationContext(root, {
      kind: "police_event",
      episodeId: activeEpisodeId,
      coordinationId,
      eventId: leafId,
    });
  }, [root, contextType, activeEpisodeId, leafId, coordinationId]);
  const currentContextKey = currentContext ? serializeLocalContext(currentContext) : "";
  selectedContextRef.current = currentContextKey;
  contextRef.current = { currentUserId, root, canWrite: effectiveCanWrite };
  pendingRef.current = pendingOperationId;
  selectedQueueRef.current = selectedQueueOperationId;
  observationsRef.current = observations;
  formRef.current = form;

  const refreshList = useCallback(async () => {
    const ticket = selectionTicket.current;
    const request = { actor: currentUserId, root };
    const rows = root.episodeId
      ? await listEpisodeFn({ data: root.episodeId })
      : await listGuardFn({ data: root.guardId });
    if (
      !mounted.current ||
      contextRef.current.currentUserId !== request.actor ||
      contextRef.current.root.guardId !== request.root.guardId ||
      contextRef.current.root.episodeId !== request.root.episodeId ||
      ticket !== selectionTicket.current
    )
      return;
    setObservations(rows as ObservationView[]);
    const store = queueStoreRef.current;
    if (store) setQueueEntries(await store.list(request.actor, queueScope));
  }, [currentUserId, root, listEpisodeFn, listGuardFn, queueScope]);

  useEffect(() => {
    let live = true;
    const initialSelectionTicket = selectionTicket.current;
    mounted.current = true;
    setLoading(true);
    setQueueReady(false);
    setQueueAvailable(false);
    setCurrentEfaAccess(false);
    void (async () => {
      try {
        const [catalogRows, rows, noticeRows, queueModule] = await Promise.all([
          catalogFn(),
          rootEpisodeId
            ? listEpisodeFn({ data: rootEpisodeId })
            : listGuardFn({ data: rootGuardId }),
          noticesFn(),
          loadObservationQueue(),
        ]);
        if (!live || !mounted.current) return;
        setCatalog(catalogRows as ObservationCatalogItem[]);
        setObservations(rows as ObservationView[]);
        setNotices(noticeRows as ObservationNoticeView[]);
        try {
          if (!canWrite) throw new Error("Read-only observation access");
          await activeBasesFn();
          if (live && mounted.current) setCurrentEfaAccess(true);
        } catch {
          if (live && mounted.current) setCurrentEfaAccess(false);
        }
        try {
          queueStoreRef.current = queueModule.createObservationQueueStore();
          setQueueEntries(await queueStoreRef.current.list(currentUserId, queueScope));
          setQueueAvailable(true);
        } catch {
          setQueueAvailable(false);
          reportError(
            "El almacenamiento local no está disponible; las operaciones no se enviarán.",
          );
        }
        setQueueReady(true);
        if (!rootEpisodeId) {
          const episodeRows = (await episodesFn()) as Array<Record<string, unknown>>;
          if (live && mounted.current)
            setEpisodes(episodeRows.filter((row) => row["originGuardId"] === rootGuardId));
        }
      } catch (cause) {
        if (live && mounted.current)
          reportError(
            cause instanceof Error ? cause.message : "No se pudieron cargar las observaciones.",
          );
      } finally {
        if (live && mounted.current) setLoading(false);
      }
    })();
    return () => {
      live = false;
      mounted.current = false;
      selectionTicket.current = initialSelectionTicket + 1;
    };
  }, [
    catalogFn,
    episodesFn,
    guardsFn,
    activeBasesFn,
    listEpisodeFn,
    listGuardFn,
    noticesFn,
    canWrite,
    currentUserId,
    queueScope,
    rootScopeKey,
    rootGuardId,
    rootEpisodeId,
  ]);

  useEffect(() => {
    setParticipationEditing(null);
    setParticipationForm(emptyParticipationForm());
    setParticipationError("");
    setParticipationMessage("");
    operationSelectionKeys.current.clear();
  }, [currentUserId, rootScopeKey]);

  const processEntryRef = useRef(processEntry);
  processEntryRef.current = processEntry;

  useEffect(() => {
    let active = true;
    const episodeId = activeEpisodeId;
    setCommunications([]);
    setDispatches([]);
    setCoordinations([]);
    setEvents([]);
    if (!episodeId || contextType === "guard" || contextType === "episode") return;
    void (async () => {
      try {
        if (contextType === "communication") {
          const rows = (await communicationsFn({ data: episodeId })) as Array<
            Record<string, unknown>
          >;
          if (active && mounted.current && contextRef.current.root.guardId === root.guardId)
            setCommunications(rows);
        }
        if (contextType === "dispatch") {
          const rows = (await dispatchesFn({ data: episodeId })) as Array<Record<string, unknown>>;
          if (active && mounted.current && contextRef.current.root.guardId === root.guardId)
            setDispatches(rows);
        }
        if (contextType === "coordination" || contextType === "police_event") {
          const rows = (await coordinationsFn({ data: episodeId })) as Array<
            Record<string, unknown>
          >;
          if (!active || !mounted.current || contextRef.current.root.guardId !== root.guardId)
            return;
          setCoordinations(rows);
          if (contextType === "police_event" && coordinationId) {
            const detail = (await getCoordinationFn({ data: coordinationId })) as Record<
              string,
              unknown
            >;
            if (active && mounted.current)
              setEvents((detail["events"] as Array<Record<string, unknown>>) ?? []);
          }
        }
      } catch (cause) {
        if (active && mounted.current)
          reportError(
            cause instanceof Error ? cause.message : "No se pudieron cargar los contextos.",
          );
      }
    })();
    return () => {
      active = false;
    };
  }, [
    activeEpisodeId,
    contextType,
    coordinationId,
    communicationsFn,
    dispatchesFn,
    coordinationsFn,
    getCoordinationFn,
    root.guardId,
  ]);

  const visibleObservations = observations.filter((item) => {
    if (root.episodeId) return true;
    if (contextType === "guard") return item.contextType === "guard";
    if (item.episodeId !== activeEpisodeId) return false;
    if (contextType === "episode") return item.contextType === "episode";
    if (contextType === "communication") return item.communicationId === leafId;
    if (contextType === "dispatch") return item.dispatchId === leafId;
    if (contextType === "coordination")
      return item.contextType === "coordination" && item.coordinationId === leafId;
    return item.policeEventId === leafId;
  });
  const groupedCatalog = groupObservationCatalog(
    catalog,
    Object.keys(groupLabels) as ObservationCatalogItem["group"][],
  );

  const loadHistory = async (observationId: string) => {
    clearErrorAt("history", observationId);
    const ticket = ++selectionTicket.current;
    try {
      const rows = (await historyFn({ data: observationId })) as ObservationAuditView[];
      if (!mounted.current || ticket !== selectionTicket.current) return;
      setHistory(rows);
      setHistoryFor(observationId);
    } catch (cause) {
      if (mounted.current)
        reportError(
          cause instanceof Error ? cause.message : "No se pudo cargar el historial.",
          "history",
          observationId,
        );
    }
  };

  function observationFormFromRecord(item: ObservationView): ObservationForm {
    return {
      catalogItemKey: item.catalogKeySnapshot === "other" ? "other" : (item.catalogItemKey ?? ""),
      classification: item.classification ?? "adequate",
      otherDescription: item.otherDescription ?? "",
      otherGroup: item.catalogGroupSnapshot ?? groupForContext[item.contextType],
      comment: item.comment ?? "",
      observedAt: localDateTimeValue(item.observedAt),
    };
  }

  function participationFormFromRecord(item: ObservationView): ParticipationForm {
    return {
      level: item.participationLevel ?? "",
      comment: item.comment ?? "",
      observedAt: localDateTimeValue(item.observedAt),
    };
  }

  function clearParticipationDraft() {
    setParticipationEditing(null);
    setParticipationForm(emptyParticipationForm());
    setParticipationError("");
    setParticipationMessage("");
  }

  function editObservation(item: ObservationView) {
    if (!effectiveCanWrite || !item.canEdit || pendingOperationId || busy) return;
    const selection = contextForObservation(item);
    if (selection.kind !== "guard") {
      setContextEpisodeId(selection.episodeId);
      setContextType(selection.kind);
      setCoordinationId(selection.kind === "police_event" ? selection.coordinationId : "");
      setLeafId(
        selection.kind === "communication" ||
          selection.kind === "dispatch" ||
          selection.kind === "coordination"
          ? selection.id
          : selection.kind === "police_event"
            ? selection.eventId
            : "",
      );
    } else {
      setContextEpisodeId("");
      setContextType("guard");
      setLeafId("");
      setCoordinationId("");
    }
    setEditing(item);
    setForm(observationFormFromRecord(item));
    setOptionalOpen(Boolean(item.comment || item.observedAt));
    setHistoryFor("");
    setMessage("");
  }

  function startNewObservation() {
    if (!canCreateHere || pendingOperationId || busy || !currentContext) return;
    setEditing(null);
    setForm({ ...emptyForm(), otherGroup: groupForContext[contextType] });
    setHistoryFor("");
    setMessage("");
  }

  function editParticipation(item: ObservationView) {
    if (
      !isParticipationRecord(item) ||
      !effectiveCanWrite ||
      !item.canEdit ||
      pendingOperationId ||
      busy
    )
      return;
    const selection = contextForObservation(item);
    const itemContextKey = serializeLocalContext(buildObservationContext(root, selection));
    const hasConductDraft =
      editing !== null ||
      Boolean(
        form.catalogItemKey ||
          form.otherDescription.trim() ||
          form.comment.trim() ||
          form.observedAt,
      );
    if (itemContextKey !== currentContextKey && hasConductDraft) {
      reportError(
        "Guarda o termina el borrador de conducta antes de cambiar el contexto para corregir esta participación.",
        "history",
        item.id,
      );
      return;
    }
    if (itemContextKey !== currentContextKey) {
      selectionTicket.current++;
      setContextType(selection.kind);
      setContextEpisodeId(selection.kind === "guard" ? "" : selection.episodeId);
      setCoordinationId(selection.kind === "police_event" ? selection.coordinationId : "");
      setLeafId(
        selection.kind === "communication" ||
          selection.kind === "dispatch" ||
          selection.kind === "coordination"
          ? selection.id
          : selection.kind === "police_event"
            ? selection.eventId
            : "",
      );
      setParticipationError("");
      setParticipationMessage("");
    }
    setParticipationEditing(item);
    setParticipationForm(participationFormFromRecord(item));
  }

  function resetAfterConfirmedCreate() {
    setEditing(null);
    setOptionalOpen(false);
    setForm({ ...emptyForm(), otherGroup: groupForContext[contextType] });
  }

  const sendEntry = async (entry: ObservationQueueEntry) => {
    if (entry.kind === "create") return createFn({ data: entry.payload as never });
    return updateFn({ data: entry.payload as never });
  };

  async function processEntry(
    entry: ObservationQueueEntry,
    lockHeld = false,
    background = false,
    errorArea: "submit" | "queue" = "queue",
  ) {
    if (!queueStoreRef.current || (!lockHeld && busyRef.current)) return;
    if (isParticipationEntry(entry) && !operationSelectionKeys.current.has(entry.operationId)) {
      if (entry.kind === "create") {
        const selection = observationContextSelectionFromPayload(
          entry.payload as Record<string, unknown>,
        );
        if (selection)
          operationSelectionKeys.current.set(
            entry.operationId,
            serializeLocalContext(buildObservationContext(root, selection)),
          );
      } else {
        const record = observationsRef.current.find((item) => item.id === entry.entityId);
        if (record)
          operationSelectionKeys.current.set(
            entry.operationId,
            serializeLocalContext(buildObservationContext(root, contextForObservation(record))),
          );
      }
    }
    if (!lockHeld) {
      busyRef.current = true;
      setBusy(true);
    }
    const expected = { actorUserId: entry.actorUserId, contextKey: entry.contextKey };
    try {
      const queue = await loadObservationQueue();
      if (
        !mounted.current ||
        contextRef.current.currentUserId !== expected.actorUserId ||
        queueScope !== expected.contextKey
      )
        return;
      const result = await queue.dispatchObservationOperation(
        queueStoreRef.current,
        entry.actorUserId,
        entry.contextKey,
        entry.entityId,
        entry.operationId,
        async (fresh) => {
          if (
            !observationQueueContextAllows({
              actorUserId: fresh.actorUserId,
              currentUserId: contextRef.current.currentUserId,
              queueContextKey: fresh.contextKey,
              currentQueueContextKey: queueScope,
              operationId: fresh.operationId,
              selectedOperationId: background ? fresh.operationId : selectedQueueRef.current,
              canWrite: contextRef.current.canWrite,
            })
          )
            throw new Error("La cuenta o el contexto cambió; selecciona de nuevo la operación.");
          const guardRows = (await guardsFn()) as Array<Record<string, unknown>>;
          if (
            !mounted.current ||
            !observationQueueContextAllows({
              actorUserId: fresh.actorUserId,
              currentUserId: contextRef.current.currentUserId,
              queueContextKey: fresh.contextKey,
              currentQueueContextKey: queueScope,
              operationId: fresh.operationId,
              selectedOperationId: background ? fresh.operationId : selectedQueueRef.current,
              canWrite: contextRef.current.canWrite,
            })
          )
            throw new Error("La operación ya no está seleccionada.");
          const guard = guardRows.find((item) => item["id"] === fresh.guardId);
          if (
            !guard ||
            (fresh.kind === "create" &&
              (guard["ownerUserId"] !== fresh.actorUserId || guard["endedAt"] != null))
          )
            throw new Error("La guardia terminó o ya no pertenece a esta cuenta.");
          if (fresh.kind === "update") {
            const current = (await getObservationFn({ data: fresh.entityId })) as ObservationView;
            if (isParticipationEntry(fresh))
              operationSelectionKeys.current.set(
                fresh.operationId,
                serializeLocalContext(buildObservationContext(root, contextForObservation(current))),
              );
            if (isParticipationEntry(fresh) !== isParticipationRecord(current))
              throw new Error("El tipo del registro no coincide con la operación pendiente.");
            if (
              !mounted.current ||
              current.guardId !== fresh.guardId ||
              (root.episodeId !== undefined && current.episodeId !== root.episodeId) ||
              !observationQueueContextAllows({
                actorUserId: fresh.actorUserId,
                currentUserId: contextRef.current.currentUserId,
                queueContextKey: fresh.contextKey,
                currentQueueContextKey: queueScope,
                operationId: fresh.operationId,
                selectedOperationId: background ? fresh.operationId : selectedQueueRef.current,
                canWrite: contextRef.current.canWrite && current.canEdit,
              })
            )
              throw new Error(
                "La observación ya no admite correcciones con tus permisos actuales.",
              );
          }
          return withCurrentEfaWriteAccess({
            canWrite: contextRef.current.canWrite,
            verifyCurrentEfa: async () => {
              await activeBasesFn();
              if (
                !mounted.current ||
                !observationQueueContextAllows({
                  actorUserId: fresh.actorUserId,
                  currentUserId: contextRef.current.currentUserId,
                  queueContextKey: fresh.contextKey,
                  currentQueueContextKey: queueScope,
                  operationId: fresh.operationId,
                  selectedOperationId: background ? fresh.operationId : selectedQueueRef.current,
                  canWrite: contextRef.current.canWrite,
                })
              )
                throw new Error("La cuenta, el permiso o el contexto cambió antes del envío.");
            },
            write: () => sendEntry(fresh),
          });
        },
        async (fresh) => {
          if (
            !observationQueueContextAllows({
              actorUserId: fresh.actorUserId,
              currentUserId: contextRef.current.currentUserId,
              queueContextKey: fresh.contextKey,
              currentQueueContextKey: queueScope,
              operationId: fresh.operationId,
              selectedOperationId: background ? fresh.operationId : selectedQueueRef.current,
              canWrite: contextRef.current.canWrite,
            })
          )
            return false;
          const guardRows = (await guardsFn()) as Array<Record<string, unknown>>;
          if (
            !mounted.current ||
            !observationQueueContextAllows({
              actorUserId: fresh.actorUserId,
              currentUserId: contextRef.current.currentUserId,
              queueContextKey: fresh.contextKey,
              currentQueueContextKey: queueScope,
              operationId: fresh.operationId,
              selectedOperationId: background ? fresh.operationId : selectedQueueRef.current,
              canWrite: contextRef.current.canWrite,
            })
          )
            return false;
          const guard = guardRows.find((item) => item["id"] === fresh.guardId);
          if (
            !guard ||
            (fresh.kind === "create" &&
              (guard["ownerUserId"] !== fresh.actorUserId || guard["endedAt"] != null))
          )
            return false;
          if (fresh.kind === "create") {
            const payload = fresh.payload;
            return (
              payload["guardId"] === fresh.guardId &&
              (root.episodeId === undefined || payload["episodeId"] === root.episodeId)
            );
          }
          const current = (await getObservationFn({ data: fresh.entityId })) as ObservationView;
          if (isParticipationEntry(fresh))
            operationSelectionKeys.current.set(
              fresh.operationId,
              serializeLocalContext(buildObservationContext(root, contextForObservation(current))),
            );
          return (
            mounted.current &&
            isParticipationEntry(fresh) === isParticipationRecord(current) &&
            current.canEdit &&
            current.guardId === fresh.guardId &&
            (root.episodeId === undefined || current.episodeId === root.episodeId) &&
            observationQueueContextAllows({
              actorUserId: fresh.actorUserId,
              currentUserId: contextRef.current.currentUserId,
              queueContextKey: fresh.contextKey,
              currentQueueContextKey: queueScope,
              operationId: fresh.operationId,
              selectedOperationId: background ? fresh.operationId : selectedQueueRef.current,
              canWrite: contextRef.current.canWrite,
            })
          );
        },
      );
      if (
        !mounted.current ||
        contextRef.current.currentUserId !== expected.actorUserId ||
        queueScope !== expected.contextKey
      )
        return;
      if (result.status === "confirmed" || result.status === "confirmed-cleanup-failed") {
        const acknowledgement = result.result as {
          observation: ObservationView;
          operation: { id: string; appliedVersion: number; changed: boolean; replayed: boolean };
        };
        const saved = acknowledgement.observation;
        setObservations((rows) =>
          rows.some((row) => row.id === saved.id)
            ? rows.map((row) => (row.id === saved.id ? saved : row))
            : [saved, ...rows],
        );
        if (pendingRef.current === entry.operationId) {
          setPendingOperationId("");
          setSelectedQueueOperationId("");
          if (isParticipationEntry(entry) && selectedParticipationEntry(entry)) {
            if (entry.kind === "create") {
              setParticipationEditing(null);
              setParticipationForm(emptyParticipationForm());
            } else {
              setParticipationEditing(saved);
              setParticipationForm(participationFormFromRecord(saved));
            }
          } else if (!isParticipationEntry(entry) && entry.kind === "create")
            resetAfterConfirmedCreate();
          else if (!isParticipationEntry(entry)) {
            setEditing(saved);
            setForm(observationFormFromRecord(saved));
          }
        }
        reportEntryMessage(
          entry,
          result.status === "confirmed"
            ? `${isParticipationEntry(entry) ? "Participación" : "Observación"} confirmada · versión aplicada ${acknowledgement.operation.appliedVersion}.`
            : `${isParticipationEntry(entry) ? "Participación" : "Observación"} confirmada; solo falta limpiar el pendiente local.`,
          errorArea,
        );
        try {
          await refreshList();
        } catch {
          reportEntryMessage(
            entry,
            `${isParticipationEntry(entry) ? "Participación" : "Observación"} confirmada. No se pudo actualizar la lista; el registro ya está guardado.`,
            errorArea,
          );
        }
      } else if (result.status === "cleaned") {
        const remaining = await queueStoreRef.current
          .list(entry.actorUserId, queueScope)
          .catch(() => []);
        if (
          !mounted.current ||
          contextRef.current.currentUserId !== expected.actorUserId ||
          queueScope !== expected.contextKey
        )
          return;
        setQueueEntries(remaining);
        if (pendingRef.current === entry.operationId) {
          setPendingOperationId("");
          setSelectedQueueOperationId("");
          if (
            isParticipationEntry(entry) &&
            selectedParticipationEntry(entry) &&
            entry.kind === "create"
          ) {
            setParticipationEditing(null);
            setParticipationForm(emptyParticipationForm());
          } else if (!isParticipationEntry(entry) && entry.kind === "create")
            resetAfterConfirmedCreate();
        }
        reportEntryMessage(
          entry,
          `La ${isParticipationEntry(entry) ? "participación" : "observación"} ya estaba confirmada; se limpió el pendiente sin reenviarla.`,
          errorArea,
        );
      } else if (result.status === "paused") {
        reportEntryError(entry, result.error, errorArea);
        if (
          result.queueStatus === "paused-conflict" ||
          result.queueStatus === "paused-permission"
        ) {
          if (entry.kind === "update") {
            const remote = (await getObservationFn({ data: entry.entityId }).catch(
              () => null,
            )) as ObservationView | null;
            if (
              mounted.current &&
              contextRef.current.currentUserId === expected.actorUserId &&
              queueScope === expected.contextKey &&
              selectedQueueRef.current === entry.operationId
            )
              setConflictRemote(remote);
          }
        }
      } else if (result.status === "cancelled") {
        reportEntryError(
          entry,
          "La operación quedó pausada porque no hay permisos vigentes para editar.",
          errorArea,
        );
      } else if (result.status === "stored") reportEntryError(entry, result.error, errorArea);
      const latest = await queueStoreRef.current
        .list(entry.actorUserId, queueScope)
        .catch(() => []);
      if (
        mounted.current &&
        contextRef.current.currentUserId === expected.actorUserId &&
        queueScope === expected.contextKey
      )
        setQueueEntries(latest);
    } catch (cause) {
      if (
        mounted.current &&
        contextRef.current.currentUserId === expected.actorUserId &&
        queueScope === expected.contextKey
      )
        reportEntryError(
          entry,
          cause instanceof Error ? cause.message : "La operación sigue pendiente de confirmación.",
          errorArea,
        );
    } finally {
      if (!lockHeld) {
        busyRef.current = false;
        if (mounted.current && contextRef.current.currentUserId === expected.actorUserId)
          setBusy(false);
      }
    }
  }

  useEffect(() => {
    if (!effectiveCanWrite) return;
    const retryEligible = async () => {
      if (!navigator.onLine || busyRef.current || !mounted.current || !queueStoreRef.current)
        return;
      let entries: ObservationQueueEntry[];
      try {
        entries = await queueStoreRef.current.list(currentUserId, queueScope);
      } catch {
        return;
      }
      if (
        !mounted.current ||
        contextRef.current.currentUserId !== currentUserId ||
        contextRef.current.canWrite !== true
      )
        return;
      setQueueEntries(entries);
      for (const entry of entries) {
        if (entry.status !== "pending" && entry.status !== "uncertain") continue;
        if (busyRef.current) break;
        await processEntryRef.current(entry, false, true);
      }
    };
    window.addEventListener("online", retryEligible);
    return () => window.removeEventListener("online", retryEligible);
  }, [effectiveCanWrite, currentUserId, queueScope]);

  async function submit(kind: "create" | "update", payload: Record<string, unknown>) {
    if (
      !queueStoreRef.current ||
      !queueAvailable ||
      !effectiveCanWrite ||
      busyRef.current ||
      pendingOperationId
    )
      return;
    const operationId = nextId();
    const clientCreationKey =
      kind === "create" ? String(payload["clientCreationKey"] ?? nextId()) : "";
    const frozenPayload = {
      ...payload,
      operationId,
      ...(kind === "create" ? { clientCreationKey } : {}),
    };
    const entry: ObservationQueueEntry = {
      actorUserId: currentUserId,
      guardId: root.guardId,
      contextKey: queueScope,
      entityId:
        kind === "create" ? `create:${clientCreationKey}` : String(payload["observationId"]),
      operationId,
      kind,
      payload: frozenPayload,
      status: "pending",
      createdAt: new Date().toISOString(),
    };
    operationSelectionKeys.current.set(operationId, currentContextKey);
    busyRef.current = true;
    setBusy(true);
    setPendingOperationId(operationId);
    setSelectedQueueOperationId(operationId);
    selectedQueueRef.current = operationId;
    if (isParticipationEntry(entry)) {
      setParticipationError("");
      setParticipationMessage("");
    } else {
      clearError();
      setMessage("");
      setMessageSurface("submit");
      setErrorSurface({ area: "submit" });
    }
    try {
      const queue = await loadObservationQueue();
      if (!mounted.current || contextRef.current.currentUserId !== entry.actorUserId) return;
      queueStoreRef.current = queueStoreRef.current ?? queue.createObservationQueueStore();
      await queue.persistObservationOperation(queueStoreRef.current, entry);
      setQueueEntries(await queueStoreRef.current.list(currentUserId, queueScope));
      await processEntry(entry, true, false, "submit");
    } catch (cause) {
      setUnpersisted(entry);
      const text = `No se pudo guardar el envío local. Conservamos la misma operación para reintentar. ${cause instanceof Error ? cause.message : ""}`;
      if (isParticipationEntry(entry) && selectedParticipationEntry(entry))
        setParticipationError(text);
      else if (!isParticipationEntry(entry)) reportError(text, "submit");
    } finally {
      busyRef.current = false;
      if (mounted.current && contextRef.current.currentUserId === entry.actorUserId) setBusy(false);
    }
  }

  async function retryUnpersisted() {
    const entry = unpersisted;
    if (!entry || !queueStoreRef.current || busyRef.current) return;
    const stillSelected = () =>
      mounted.current &&
      observationFrozenOperationMatches({
        actorUserId: entry.actorUserId,
        currentUserId: contextRef.current.currentUserId,
        contextKey: entry.contextKey,
        currentContextKey: queueScope,
        operationId: entry.operationId,
        selectedOperationId: selectedQueueRef.current,
        canWrite: contextRef.current.canWrite,
      });
    if (!stillSelected()) return;
    busyRef.current = true;
    setBusy(true);
    try {
      const queue = await loadObservationQueue();
      if (!stillSelected()) return;
      await queue.persistObservationOperation(queueStoreRef.current, entry);
      if (!stillSelected()) return;
      const entries = await queueStoreRef.current.list(entry.actorUserId, entry.contextKey);
      if (!stillSelected()) return;
      setUnpersisted(null);
      setQueueEntries(entries);
      setSelectedQueueOperationId(entry.operationId);
      selectedQueueRef.current = entry.operationId;
      setPendingOperationId(entry.operationId);
      await processEntry(entry, true);
    } catch (cause) {
      reportError(
        cause instanceof Error ? cause.message : "No se pudo persistir el reintento local.",
        "queue",
      );
    } finally {
      busyRef.current = false;
      if (mounted.current) setBusy(false);
    }
  }

  function restoreEntry(entry: ObservationQueueEntry) {
    if (
      entry.actorUserId !== currentUserId ||
      entry.contextKey !== queueScope ||
      pendingOperationId
    )
      return;
    const payload = entry.payload;
    const createSelection =
      entry.kind === "create"
        ? observationContextSelectionFromPayload(payload as Record<string, unknown>)
        : null;
    if (
      entry.kind === "create" &&
      (!createSelection ||
        (createSelection.kind !== "guard" &&
          root.episodeId &&
          createSelection.episodeId !== root.episodeId))
    ) {
      reportError(
        "El contexto pendiente no coincide con esta pantalla; la operación no se enviará.",
        "queue",
      );
      return;
    }
    setSelectedQueueOperationId(entry.operationId);
    selectedQueueRef.current = entry.operationId;
    setPendingOperationId(entry.operationId);
    if (entry.kind === "create") {
      const selection = createSelection!;
      const restoredContextKey = serializeLocalContext(buildObservationContext(root, selection));
      if (
        (isParticipationEntry(entry) &&
          restoredContextKey !== currentContextKey &&
          Boolean(
            editing ||
              form.catalogItemKey ||
              form.comment.trim() ||
              form.otherDescription.trim() ||
              form.observedAt,
          )) ||
        (!isParticipationEntry(entry) &&
          restoredContextKey !== currentContextKey &&
          Boolean(
            participationEditing ||
              participationForm.level ||
              participationForm.comment.trim() ||
              participationForm.observedAt,
          ))
      ) {
        setPendingOperationId("");
        setSelectedQueueOperationId("");
        pendingRef.current = "";
        selectedQueueRef.current = "";
        reportError(
          "Guarda o termina el borrador del otro formulario antes de cambiar el contexto pendiente.",
          "queue",
        );
        return;
      }
      operationSelectionKeys.current.set(entry.operationId, restoredContextKey);
      setContextType(selection.kind);
      setContextEpisodeId(selection.kind === "guard" ? "" : selection.episodeId);
      setCoordinationId(selection.kind === "police_event" ? selection.coordinationId : "");
      setLeafId(
        selection.kind === "communication" ||
          selection.kind === "dispatch" ||
          selection.kind === "coordination"
          ? selection.id
          : selection.kind === "police_event"
            ? selection.eventId
            : "",
      );
      if (isParticipationEntry(entry)) {
        setParticipationEditing(null);
        setParticipationForm({
          level: payload["participationLevel"] as EvaluatorParticipationLevel,
          comment: String(payload["comment"] ?? ""),
          observedAt:
            typeof payload["observedAt"] === "string"
              ? localDateTimeValue(payload["observedAt"] as string)
              : "",
        });
      } else {
        setEditing(null);
        if (restoredContextKey !== currentContextKey) clearParticipationDraft();
        setForm({
          catalogItemKey: String(payload["catalogItemKey"] ?? ""),
          classification: payload["classification"] as ObservationForm["classification"],
          otherDescription: String(payload["otherDescription"] ?? ""),
          otherGroup:
            (payload["otherGroup"] as ObservationForm["otherGroup"]) ?? groupForContext[contextType],
          comment: String(payload["comment"] ?? ""),
          observedAt:
            typeof payload["observedAt"] === "string"
              ? localDateTimeValue(payload["observedAt"] as string)
              : "",
        });
      }
    } else {
      void getObservationFn({ data: entry.entityId })
        .then((record) => {
          if (
            !mounted.current ||
            contextRef.current.currentUserId !== entry.actorUserId ||
            selectedQueueRef.current !== entry.operationId
          )
            return;
          const current = record as ObservationView;
          if (
            current.guardId !== entry.guardId ||
            (root.episodeId !== undefined && current.episodeId !== root.episodeId) ||
            !current.canEdit
          ) {
            setPendingOperationId("");
            setSelectedQueueOperationId("");
            pendingRef.current = "";
            selectedQueueRef.current = "";
            reportError(
              "El registro no pertenece a este contexto o ya no admite correcciones.",
              "queue",
            );
            return;
          }
          if (isParticipationEntry(entry) !== isParticipationRecord(current)) {
            setPendingOperationId("");
            setSelectedQueueOperationId("");
            pendingRef.current = "";
            selectedQueueRef.current = "";
            reportError("El tipo del registro cambió; no se restauró la operación pendiente.", "queue");
            return;
          }
          const selection = contextForObservation(current);
          const restoredContextKey = serializeLocalContext(buildObservationContext(root, selection));
          if (
            (isParticipationEntry(entry) &&
              restoredContextKey !== currentContextKey &&
              Boolean(
                editing ||
                  form.catalogItemKey ||
                  form.comment.trim() ||
                  form.otherDescription.trim() ||
                  form.observedAt,
              )) ||
            (!isParticipationEntry(entry) &&
              restoredContextKey !== currentContextKey &&
              Boolean(
                participationEditing ||
                  participationForm.level ||
                  participationForm.comment.trim() ||
                  participationForm.observedAt,
              ))
          ) {
            setPendingOperationId("");
            setSelectedQueueOperationId("");
            pendingRef.current = "";
            selectedQueueRef.current = "";
            reportError(
              "Guarda o termina el borrador del otro formulario antes de cambiar el contexto pendiente.",
              "queue",
            );
            return;
          }
          operationSelectionKeys.current.set(entry.operationId, restoredContextKey);
          setContextType(selection.kind);
          setContextEpisodeId(selection.kind === "guard" ? "" : selection.episodeId);
          setCoordinationId(selection.kind === "police_event" ? selection.coordinationId : "");
          setLeafId(
            selection.kind === "communication" ||
              selection.kind === "dispatch" ||
              selection.kind === "coordination"
              ? selection.id
              : selection.kind === "police_event"
                ? selection.eventId
                : "",
          );
          if (isParticipationEntry(entry)) {
            setParticipationEditing(current);
            setParticipationForm({
              level:
                (payload["participationLevel"] as EvaluatorParticipationLevel | undefined) ??
                current.participationLevel ??
                "",
              comment: String(payload["comment"] ?? ""),
              observedAt:
                typeof payload["observedAt"] === "string"
                  ? localDateTimeValue(payload["observedAt"] as string)
                  : localDateTimeValue(current.observedAt),
            });
          } else {
            if (restoredContextKey !== currentContextKey) clearParticipationDraft();
            setEditing(current);
            const restored = observationFormFromRecord(current);
            setForm(restoreObservationUpdateForm(restored, payload as Record<string, unknown>));
          }
        })
        .catch((cause) => {
          if (
            mounted.current &&
            contextRef.current.currentUserId === entry.actorUserId &&
            selectedQueueRef.current === entry.operationId
          ) {
            setPendingOperationId("");
            setSelectedQueueOperationId("");
            pendingRef.current = "";
            selectedQueueRef.current = "";
            reportError(
              cause instanceof Error ? cause.message : "No se pudo restaurar la observación.",
              "queue",
            );
          }
        });
    }
  }

  async function resolveConflict(choice: "server" | "keep") {
    if (busyRef.current) return;
    await conflictGateRef.current.run(async () => {
      if (busyRef.current) return;
      busyRef.current = true;
      setBusy(true);
      try {
        await resolveConflictUnlocked(choice);
      } finally {
        busyRef.current = false;
        if (mounted.current) setBusy(false);
      }
    });
  }

  async function resolveConflictUnlocked(choice: "server" | "keep") {
    const operationId = selectedQueueOperationId;
    const entry = queueEntries.find((row) => row.operationId === operationId);
    if (
      !entry ||
      entry.kind !== "update" ||
      !conflictRemote ||
      !queueStoreRef.current ||
      !effectiveCanWrite
    )
      return;
    let latest: ObservationView;
    try {
      latest = (await getObservationFn({ data: entry.entityId })) as ObservationView;
    } catch (cause) {
      reportEntryError(
        entry,
        cause instanceof Error ? cause.message : "No se pudo comparar con el servidor.",
        "queue",
      );
      return;
    }
    if (
      !mounted.current ||
      contextRef.current.currentUserId !== entry.actorUserId ||
      selectedQueueRef.current !== operationId ||
      isParticipationEntry(entry) !== isParticipationRecord(latest) ||
      (choice === "keep" && !latest.canEdit)
    ) {
      reportEntryError(
        entry,
        "La cuenta, selección o permiso cambió; la operación pausada se conservó.",
        "queue",
      );
      return;
    }
    if (choice === "server") {
      try {
        await queueStoreRef.current.remove(
          entry.actorUserId,
          entry.contextKey,
          entry.entityId,
          entry.operationId,
        );
        if (!mounted.current || selectedQueueRef.current !== operationId) return;
        setQueueEntries((rows) => rows.filter((row) => row.operationId !== operationId));
        if (isParticipationEntry(entry)) {
          setParticipationEditing(latest);
          setParticipationForm(participationFormFromRecord(latest));
        } else {
          setEditing(latest);
          setForm(observationFormFromRecord(latest));
        }
        setPendingOperationId("");
        setSelectedQueueOperationId("");
        selectedQueueRef.current = "";
        setConflictRemote(null);
        clearError();
        reportEntryMessage(
          entry,
          "Se cargó la versión del servidor y se descartó solo esta operación pausada.",
          "queue",
        );
      } catch (cause) {
        reportEntryError(
          entry,
          cause instanceof Error ? cause.message : "No se pudo resolver la operación local.",
          "queue",
        );
      }
      return;
    }
    const payload = {
      ...(entry.payload as Record<string, unknown>),
      expectedVersion: latest.version,
      operationId: nextId(),
    };
    try {
      const queue = await loadObservationQueue();
      const rebased: ObservationQueueEntry = {
        ...entry,
        operationId: String(payload["operationId"]),
        payload,
        status: "pending",
        createdAt: new Date().toISOString(),
      };
      const selectionKey = operationSelectionKeys.current.get(entry.operationId);
      if (selectionKey) operationSelectionKeys.current.set(rebased.operationId, selectionKey);
      await queue.persistObservationOperation(queueStoreRef.current, rebased);
      await queueStoreRef.current.remove(
        entry.actorUserId,
        entry.contextKey,
        entry.entityId,
        entry.operationId,
      );
      if (!mounted.current || selectedQueueRef.current !== operationId) return;
      setQueueEntries(await queueStoreRef.current.list(entry.actorUserId, entry.contextKey));
      setSelectedQueueOperationId(rebased.operationId);
      selectedQueueRef.current = rebased.operationId;
      setPendingOperationId(rebased.operationId);
      setConflictRemote(null);
      clearError();
      await dispatchObservationRebasedEntry(rebased, processEntry);
    } catch (cause) {
      reportEntryError(
        entry,
        cause instanceof Error ? cause.message : "No se pudo rebasar la operación.",
        "queue",
      );
    }
  }

  const selectedQueueEntry = queueEntries.find(
    (entry) => entry.operationId === selectedQueueOperationId,
  );
  const selectedCatalogItem = catalog.find((item) => item.key === form.catalogItemKey);
  const isOther = form.catalogItemKey === "other";
  const canEditCurrent = editing?.canEdit === true;
  const canChangeForm =
    effectiveCanWrite && !busy && !pendingOperationId && (editing ? canEditCurrent : canCreateHere);
  const canEditParticipation = participationEditing?.canEdit === true;
  const canRenderParticipationForm =
    effectiveCanWrite && (canCreateHere || canEditParticipation);
  const canChangeParticipation =
    canRenderParticipationForm &&
    !busy &&
    !pendingOperationId &&
    (participationEditing ? canEditParticipation : canCreateHere);
  const dispatchLabelFor = (item: Record<string, unknown>) =>
    [
      String(item["baseName"] ?? "").trim() || "Base institucional",
      linkedOptionDate(item["createdAt"]),
      linkedOptionState(item["state"]),
      linkedOptionPriority(item["priority"]),
    ]
      .filter(Boolean)
      .join(" · ");
  const coordinationLabelFor = (item: Record<string, unknown>) => {
    const place =
      item["placeType"] === "meeting_point"
        ? "Punto de encuentro"
        : item["placeType"] === "incident"
          ? "Incidente"
          : null;
    const initiator =
      item["initiator"] === "central"
        ? "Central"
        : item["initiator"] === "ambulance"
          ? "Ambulancia"
          : null;
    return [
      "Apoyo policial",
      place,
      String(item["meetingReference"] ?? "").trim() || null,
      initiator,
      linkedOptionDate(item["createdAt"]),
      linkedOptionState(item["state"]),
    ]
      .filter(Boolean)
      .join(" · ");
  };

  const validContext = currentContext !== null;
  const allowedToSave = editing ? effectiveCanWrite && editing.canEdit : canCreateHere;
  const canRenderObservationForm =
    effectiveCanWrite && (canCreateHere || editing?.canEdit === true);
  const hasFeedbackTarget = (area: ObservationErrorSurface, id?: string) => {
    if (area === "global") return true;
    if (area === "submit") return canRenderObservationForm;
    if (area === "queue") return queueEntries.length > 0 || unpersisted !== null;
    if (area === "history") return !loading && visibleObservations.some((item) => item.id === id);
    return !loading && notices.some((notice) => notice.id === id);
  };
  const showErrorGlobally = observationFeedbackNeedsGlobalFallback(
    errorSurface.area,
    hasFeedbackTarget(errorSurface.area, errorSurface.id),
  );
  const showMessageGlobally = observationFeedbackNeedsGlobalFallback(
    messageSurface,
    hasFeedbackTarget(messageSurface),
  );
  const canSubmit =
    canChangeForm &&
    allowedToSave &&
    validContext &&
    Boolean(form.catalogItemKey) &&
    (isOther ? Boolean(form.otherDescription.trim()) : Boolean(selectedCatalogItem));

  const canSubmitParticipation =
    canChangeParticipation &&
    validContext &&
    (!participationEditing ||
      serializeLocalContext(
        buildObservationContext(root, contextForObservation(participationEditing)),
      ) === currentContextKey) &&
    Boolean(participationForm.level) &&
    queueReady &&
    queueAvailable;

  function saveObservation() {
    if (!canSubmit || !currentContext || !queueAvailable) return;
    const fields = {
      catalogItemKey: form.catalogItemKey,
      classification: form.classification,
      ...(isOther
        ? { otherDescription: form.otherDescription.trim(), otherGroup: form.otherGroup }
        : {}),
      comment: form.comment.trim() || null,
      observedAt: isoFromLocalDateTime(form.observedAt),
    };
    if (editing) {
      void submit("update", {
        observationId: editing.id,
        expectedVersion: editing.version,
        ...fields,
      });
    } else {
      void submit("create", {
        ...currentContext,
        clientCreationKey: nextId(),
        ...fields,
      });
    }
  }

  function saveParticipation() {
    if (!canSubmitParticipation || !currentContext || !participationForm.level) return;
    const fields = {
      recordKind: "participation" as const,
      participationLevel: participationForm.level,
      comment: participationForm.comment.trim() || null,
      observedAt: isoFromLocalDateTime(participationForm.observedAt),
    };
    if (participationEditing) {
      void submit("update", {
        observationId: participationEditing.id,
        expectedVersion: participationEditing.version,
        ...fields,
      });
    } else {
      void submit("create", {
        ...currentContext,
        clientCreationKey: nextId(),
        ...fields,
      });
    }
  }

  async function markNotice(noticeId: string) {
    if (busy) return;
    clearErrorAt("notice", noticeId);
    setMessage("");
    setBusy(true);
    try {
      const saved = (await markNoticeFn({ data: noticeId })) as ObservationNoticeView;
      if (mounted.current && contextRef.current.currentUserId === currentUserId)
        setNotices((rows) => rows.map((item) => (item.id === saved.id ? saved : item)));
    } catch (cause) {
      reportError(
        cause instanceof Error ? cause.message : "No se pudo marcar el aviso.",
        "notice",
        noticeId,
      );
    } finally {
      if (mounted.current) setBusy(false);
    }
  }

  const handleContextType = (value: ContextKind) => {
    selectionTicket.current++;
    setContextType(value);
    setLeafId("");
    setCoordinationId("");
    setEditing(null);
    setForm({ ...emptyForm(), otherGroup: groupForContext[value] });
    clearParticipationDraft();
    setHistoryFor("");
  };

  const selectEpisode = (id: string) => {
    selectionTicket.current++;
    setContextEpisodeId(id);
    setContextType(id ? "episode" : "guard");
    setLeafId("");
    setCoordinationId("");
    setEditing(null);
    setForm({ ...emptyForm(), otherGroup: "record" });
    clearParticipationDraft();
  };

  const quickObservedAt = () => {
    const clickedAt = captureObservationNow();
    setForm((current) => ({ ...current, observedAt: localDateTimeValue(clickedAt) }));
  };
  const draftDirty = observationDraftDirty(form, participationForm);
  const contextLocked =
    busy || Boolean(pendingOperationId) || Boolean(editing) || Boolean(participationEditing);
  const contextTypeOptions: Array<{ value: ContextKind; label: string; short?: string }> = [
    ...(root.episodeId ? [] : [{ value: "guard" as const, label: "Guardia" }]),
    { value: "episode", label: "Episodio" },
    { value: "communication", label: "Llamada" },
    { value: "dispatch", label: "Despacho" },
    { value: "coordination", label: "Apoyo policial", short: "Apoyo" },
    { value: "police_event", label: "Evento policial", short: "Evento" },
  ];
  const discardDraft = () => {
    setForm({ ...emptyForm(), otherGroup: groupForContext[contextType] });
    clearParticipationDraft();
  };
  const contextTypeSelector = activeEpisodeId ? (
    <div className="grid min-w-0 gap-1" role="group" aria-label="Tipo de contexto">
      <ul className="flex min-w-0 gap-1 overflow-x-auto">
        {contextTypeOptions.map((option) => (
          <li key={option.value} className="min-w-fit flex-1">
            <button
              type="button"
              aria-pressed={contextType === option.value}
              aria-label={option.label}
              title={option.label}
              disabled={contextLocked || draftDirty}
              className={`${segmentClassName} ${contextType === option.value ? chipActiveClassName : ""}`}
              onClick={() => handleContextType(option.value)}
            >
              {option.short ?? option.label}
            </button>
          </li>
        ))}
      </ul>
      {draftDirty && !editing && !participationEditing && (
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          <p className="text-[13px] text-muted-foreground">
            Hay un borrador sin guardar: guardalo o descartalo para cambiar de contexto.
          </p>
          <Button
            type="button"
            variant="outline"
            className={ctaClasses.ghost}
            disabled={busy || Boolean(pendingOperationId)}
            onClick={discardDraft}
          >
            Descartar borrador
          </Button>
        </div>
      )}
    </div>
  ) : null;
  const contextControls = (
    <>
      {!root.episodeId && (
        <div className="min-w-0 space-y-2">
          <Label htmlFor={`observation-episode-${root.guardId}`}>
            Episodio de esta guardia (opcional)
          </Label>
          <select
            id={`observation-episode-${root.guardId}`}
            className="min-h-11 w-full min-w-0 max-w-full rounded-md border bg-background px-3"
            value={contextEpisodeId}
            disabled={contextLocked || draftDirty}
            onChange={(event) => selectEpisode(event.target.value)}
          >
            <option value="">Solo guardia</option>
            {episodes.map((episode) => (
              <option key={String(episode["id"])} value={String(episode["id"])}>
                Episodio {String(episode["id"]).slice(0, 8)} ·{" "}
                {String(episode["motive"] ?? episode["address"] ?? episode["id"])}
              </option>
            ))}
          </select>
        </div>
      )}
      {contextType === "communication" && (
        <ContextSelect
          id={`observation-leaf-${root.guardId}`}
          label="Llamada"
          value={leafId}
          rows={communications}
          disabled={Boolean(editing || participationEditing || pendingOperationId) || draftDirty}
          onChange={(id) => {
            clearParticipationDraft();
            setLeafId(id);
          }}
          renderLabel={(item) => {
            const direction =
              item["direction"] === "incoming"
                ? "Entrante"
                : item["direction"] === "outgoing"
                  ? "Saliente"
                  : "Llamada";
            const time =
              linkedOptionDate(item["startedAt"]) ?? linkedOptionDate(item["createdAt"]);
            return [
              direction,
              time,
              linkedOptionState(item["state"]),
              linkedOptionPriority(item["priority"]),
            ]
              .filter(Boolean)
              .join(" · ");
          }}
        />
      )}
      {contextType === "dispatch" && (
        <ContextSelect
          id={`observation-leaf-${root.guardId}`}
          label="Despacho"
          value={leafId}
          rows={dispatches}
          disabled={Boolean(editing || participationEditing || pendingOperationId) || draftDirty}
          onChange={(id) => {
            clearParticipationDraft();
            setLeafId(id);
          }}
          renderLabel={dispatchLabelFor}
        />
      )}
      {(contextType === "coordination" || contextType === "police_event") && (
        <ContextSelect
          id={`observation-coordination-${root.guardId}`}
          label="Apoyo policial"
          value={coordinationId}
          rows={coordinations}
          disabled={Boolean(editing || participationEditing || pendingOperationId) || draftDirty}
          onChange={(id) => {
            clearParticipationDraft();
            setCoordinationId(id);
            setLeafId("");
          }}
          renderLabel={coordinationLabelFor}
        />
      )}
      {contextType === "police_event" && coordinationId && (
        <ContextSelect
          id={`observation-event-${root.guardId}`}
          label="Evento policial"
          value={leafId}
          rows={events}
          disabled={Boolean(editing || participationEditing || pendingOperationId) || draftDirty}
          onChange={(id) => {
            clearParticipationDraft();
            setLeafId(id);
          }}
          renderLabel={(item) => `Evento · ${String(item["kind"] ?? "registro")}`}
        />
      )}
      {contextType === "police_event" && !coordinationId && (
        <p className="text-sm text-muted-foreground">
          Selecciona un registro de apoyo policial para ver sus eventos.
        </p>
      )}
      {!guardIsOpen && (
        <p className="text-sm text-muted-foreground">
          La guardia terminó: puedes leer el historial y corregir observaciones existentes con
          permisos vigentes, pero no agregar nuevas.
        </p>
      )}
      {effectiveCanWrite && !isRootOwner && !editing && (
        <p className="text-sm text-muted-foreground">
          Solo el responsable del contexto puede crear observaciones; la administración conserva
          autoría original al corregir registros existentes.
        </p>
      )}
    </>
  );

  return (
    <Card className={compact ? "min-w-0 border-0 bg-transparent p-0 shadow-none" : undefined}>
      <CardHeader className={compact ? "space-y-1 p-0 pb-1" : undefined}>
        <div className="flex min-w-0 flex-wrap items-center justify-between gap-2">
          <CardTitle>{title}</CardTitle>
          {!effectiveCanWrite && (
            <span role="status" className="text-sm text-muted-foreground">
              Solo lectura
            </span>
          )}
        </div>
        <p className="text-[13px] text-muted-foreground">
          Registrar es opcional; la ausencia de registros no evalúa a ninguna persona.
        </p>
      </CardHeader>
      <CardContent className={compact ? "min-w-0 space-y-3 p-0" : "space-y-4"}>
        {error && (!compact || showErrorGlobally) && (
          <p
            role="alert"
            className="rounded-md border border-destructive p-3 text-sm text-destructive"
          >
            {error}
          </p>
        )}
        {message && (!compact || showMessageGlobally) && (
          <p role="status" className="rounded-md bg-muted p-3 text-sm">
            {message}
          </p>
        )}
        {loading && <p className="text-sm text-muted-foreground">Cargando catálogo e historial…</p>}
        {!loading && (
          <>
            <section className={compact ? "min-w-0 space-y-2" : "space-y-3 rounded-md border p-3"}>
              {(editing || !canRenderObservationForm) && (
                <div className="flex min-w-0 flex-wrap items-center justify-between gap-2">
                  <h3
                    className={
                      canRenderObservationForm
                        ? "min-w-0 text-base font-semibold leading-snug"
                        : "min-w-0 font-medium"
                    }
                  >
                    {editing
                      ? `Corregir observación · v${editing.version}`
                      : "Contexto de observación"}
                  </h3>
                  {canRenderObservationForm && editing && canCreateHere && (
                    <Button
                      type="button"
                      variant="outline"
                      className={ctaClasses.indigo}
                      disabled={busy || Boolean(pendingOperationId)}
                      onClick={startNewObservation}
                    >
                      Nueva observación
                    </Button>
                  )}
                </div>
              )}
              {contextTypeSelector}
              <div className="min-w-0 space-y-3">{contextControls}</div>
            </section>

            {canRenderObservationForm && (
              <section
                className={compact ? "min-w-0 space-y-2" : "space-y-3 rounded-md border p-3"}
              >
                <div className="flex min-w-0 flex-col gap-2 sm:flex-row sm:items-center">
                  <div className="min-w-0 sm:flex-1">
                    <Label htmlFor={`observation-item-${root.guardId}`} className="sr-only">
                      Conducta concreta
                    </Label>
                    <select
                      id={`observation-item-${root.guardId}`}
                      className="min-h-11 w-full min-w-0 max-w-full rounded-md border bg-background px-3 text-sm"
                      value={form.catalogItemKey}
                      disabled={!canChangeForm || !validContext}
                      onChange={(event) =>
                        setForm((current) => ({
                          ...current,
                          catalogItemKey: event.target.value,
                          otherGroup: groupForContext[contextType],
                        }))
                      }
                    >
                      <option value="">Selecciona una conducta observada</option>
                      {groupedCatalog.map((entry) => (
                        <optgroup key={entry.group} label={groupLabels[entry.group]}>
                          {entry.items.map((item) => (
                            <option key={item.key} value={item.key}>
                              {item.label}
                            </option>
                          ))}
                        </optgroup>
                      ))}
                      <option value="other">Otra conducta</option>
                    </select>
                  </div>
                  <fieldset className="min-w-0 sm:w-72 sm:shrink-0" disabled={!canChangeForm}>
                    <legend className="sr-only">Clasificación requerida</legend>
                    <div className="grid grid-cols-2 gap-1">
                      {classificationOptions.map((option) => {
                        const checked = form.classification === option.value;
                        return (
                          <label
                            key={option.value}
                            className={`flex min-h-11 min-w-0 cursor-pointer items-center justify-center gap-1.5 rounded-lg border px-3 text-sm font-medium has-[:disabled]:cursor-not-allowed has-[:disabled]:opacity-60 has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-[#a9b2ff] ${checked ? option.tone : "border-white/15 hover:bg-white/10"}`}
                          >
                            <input
                              type="radio"
                              className="sr-only"
                              name={`observation-class-${root.guardId}`}
                              checked={checked}
                              onChange={() =>
                                setForm((current) => ({
                                  ...current,
                                  classification: option.value,
                                }))
                              }
                            />
                            {checked && <Check aria-hidden="true" className="size-4 shrink-0" />}
                            <span className="min-w-0 break-words">{option.label}</span>
                          </label>
                        );
                      })}
                    </div>
                  </fieldset>
                </div>
                {isOther && (
                  <div className="grid min-w-0 gap-2 sm:grid-cols-[minmax(0,1fr)_14rem]">
                    <div className="min-w-0 space-y-1">
                      <Label
                        htmlFor={`observation-other-${root.guardId}`}
                        className="text-xs font-normal text-muted-foreground"
                      >
                        Descripción local de la conducta
                      </Label>
                      <Textarea
                        id={`observation-other-${root.guardId}`}
                        rows={2}
                        value={form.otherDescription}
                        maxLength={1000}
                        disabled={!canChangeForm}
                        onChange={(event) =>
                          setForm((current) => ({
                            ...current,
                            otherDescription: event.target.value,
                          }))
                        }
                      />
                    </div>
                    <div className="min-w-0 space-y-1">
                      <Label
                        htmlFor={`observation-other-group-${root.guardId}`}
                        className="text-xs font-normal text-muted-foreground"
                      >
                        Grupo de esta observación
                      </Label>
                      <select
                        id={`observation-other-group-${root.guardId}`}
                        className="min-h-11 w-full min-w-0 max-w-full rounded-md border bg-background px-3"
                        value={form.otherGroup}
                        disabled={!canChangeForm}
                        onChange={(event) =>
                          setForm((current) => ({
                            ...current,
                            otherGroup: event.target.value as ObservationForm["otherGroup"],
                          }))
                        }
                      >
                        {Object.entries(groupLabels).map(([key, label]) => (
                          <option key={key} value={key}>
                            {label}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>
                )}
                {optionalOpen && (
                  <div className="grid min-w-0 gap-2 sm:grid-cols-2">
                    <div className="min-w-0 space-y-1">
                      <Label
                        htmlFor={`observation-time-${root.guardId}`}
                        className="text-xs font-normal text-muted-foreground"
                      >
                        Hora real observada
                      </Label>
                      <div className="grid min-w-0 grid-cols-[minmax(0,1fr)_auto] items-center gap-2">
                        <Input
                          id={`observation-time-${root.guardId}`}
                          className="h-11 min-h-11 min-w-0 w-full"
                          type="datetime-local"
                          step="0.001"
                          value={form.observedAt}
                          disabled={!canChangeForm}
                          onChange={(event) =>
                            setForm((current) => ({ ...current, observedAt: event.target.value }))
                          }
                        />
                        <Button
                          type="button"
                          variant="outline"
                          className={ctaClasses.indigo}
                          disabled={!canChangeForm}
                          onClick={quickObservedAt}
                        >
                          <Clock aria-hidden="true" className="size-4" />
                          Ahora
                        </Button>
                      </div>
                    </div>
                    <div className="min-w-0 space-y-1">
                      <Label
                        htmlFor={`observation-comment-${root.guardId}`}
                        className="text-xs font-normal text-muted-foreground"
                      >
                        Comentario breve
                      </Label>
                      <Textarea
                        id={`observation-comment-${root.guardId}`}
                        rows={2}
                        className="min-w-0 max-w-full"
                        value={form.comment}
                        maxLength={1000}
                        disabled={!canChangeForm}
                        onChange={(event) =>
                          setForm((current) => ({ ...current, comment: event.target.value }))
                        }
                      />
                    </div>
                  </div>
                )}
                <div className="grid min-w-0 grid-cols-[auto_minmax(0,1fr)] items-center gap-2 sm:grid-cols-[auto_auto] sm:justify-between">
                  <Button
                    type="button"
                    variant="outline"
                    className={`${ctaClasses.ghost} relative`}
                    aria-label="Hora y comentario"
                    aria-expanded={optionalOpen}
                    onClick={() => setOptionalOpen((open) => !open)}
                  >
                    <Clock aria-hidden="true" className="size-4" />
                    <span className="max-[420px]:sr-only">Hora y comentario</span>
                    {!optionalOpen && (form.comment.trim() || form.observedAt) && (
                      <span
                        aria-hidden="true"
                        className="absolute right-1.5 top-1.5 size-2 rounded-full bg-[var(--brand-orange)]"
                      />
                    )}
                  </Button>
                  <Button
                    type="button"
                    className={`${ctaClasses.save} min-w-0`}
                    disabled={
                      !canSubmit ||
                      !queueReady ||
                      !queueAvailable ||
                      busy ||
                      Boolean(pendingOperationId)
                    }
                    onClick={saveObservation}
                  >
                    {editing ? "Guardar corrección" : "Guardar observación"}
                  </Button>
                </div>
                {compact && error && errorSurface.area === "submit" && (
                  <p role="alert" className="text-sm text-destructive" aria-live="assertive">
                    {error}
                  </p>
                )}
                {compact && message && messageSurface === "submit" && (
                  <p role="status" className="text-sm text-muted-foreground" aria-live="polite">
                    {message}
                  </p>
                )}
              </section>
            )}

            {canRenderParticipationForm && (
              <section
                className={compact ? "min-w-0 border-t pt-1" : "min-w-0 rounded-md border p-3"}
                aria-labelledby={`participation-title-${root.guardId}`}
              >
                <details open={participationEditing ? true : undefined} className="min-w-0">
                  <summary className="flex min-h-11 cursor-pointer items-center text-sm font-semibold">
                    <span id={`participation-title-${root.guardId}`}>
                      Participación del evaluador{" "}
                      <span className="font-normal text-muted-foreground">· opcional</span>
                    </span>
                  </summary>
                  <div className="min-w-0 space-y-2 pt-1">
                    <div className="min-w-0">
                      <Label htmlFor={`participation-level-${root.guardId}`} className="sr-only">
                        Nivel registrado
                      </Label>
                      <select
                        id={`participation-level-${root.guardId}`}
                        className="h-11 min-h-11 w-full min-w-0 max-w-full rounded-md border bg-background px-3"
                        value={participationForm.level}
                        disabled={!canChangeParticipation || !validContext}
                        onChange={(event) =>
                          setParticipationForm((current) => ({
                            ...current,
                            level: event.target.value as EvaluatorParticipationLevel | "",
                          }))
                        }
                      >
                        <option value="">Selecciona un nivel</option>
                        {evaluatorParticipationLevels.map((level) => (
                          <option key={level} value={level}>
                            {evaluatorParticipationLevelLabels[level]}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div className="grid min-w-0 gap-2 sm:grid-cols-2">
                      <div className="min-w-0 space-y-1">
                        <Label
                          htmlFor={`participation-time-${root.guardId}`}
                          className="text-xs font-normal text-muted-foreground"
                        >
                          Hora real (opcional)
                        </Label>
                        <Input
                          id={`participation-time-${root.guardId}`}
                          className="h-11 min-h-11 min-w-0 w-full"
                          type="datetime-local"
                          step="0.001"
                          value={participationForm.observedAt}
                          disabled={!canChangeParticipation || !validContext}
                          onChange={(event) =>
                            setParticipationForm((current) => ({
                              ...current,
                              observedAt: event.target.value,
                            }))
                          }
                        />
                      </div>
                      <div className="min-w-0 space-y-1">
                        <Label
                          htmlFor={`participation-comment-${root.guardId}`}
                          className="text-xs font-normal text-muted-foreground"
                        >
                          Comentario breve (opcional)
                        </Label>
                        <Textarea
                          id={`participation-comment-${root.guardId}`}
                          rows={2}
                          className="min-w-0 max-w-full"
                          value={participationForm.comment}
                          maxLength={1000}
                          disabled={!canChangeParticipation || !validContext}
                          onChange={(event) =>
                            setParticipationForm((current) => ({
                              ...current,
                              comment: event.target.value,
                            }))
                          }
                        />
                      </div>
                    </div>
                    <div className="flex min-w-0 flex-wrap items-center gap-2">
                      <Button
                        type="button"
                        className={`${ctaClasses.save} w-fit max-w-full`}
                        disabled={!canSubmitParticipation}
                        onClick={saveParticipation}
                      >
                        {participationEditing ? "Guardar corrección" : "Guardar participación"}
                      </Button>
                      {participationEditing && (
                        <Button
                          type="button"
                          variant="outline"
                          className={`${ctaClasses.ghost} w-fit max-w-full`}
                          disabled={busy || Boolean(pendingOperationId)}
                          onClick={() => {
                            setParticipationEditing(null);
                            setParticipationForm(emptyParticipationForm());
                          }}
                        >
                          Cancelar corrección
                        </Button>
                      )}
                      {participationError && (
                        <p role="alert" className="w-full text-sm text-destructive" aria-live="assertive">
                          {participationError}
                        </p>
                      )}
                      {participationMessage && (
                        <p role="status" className="w-full text-sm text-muted-foreground" aria-live="polite">
                          {participationMessage}
                        </p>
                      )}
                    </div>
                  </div>
                </details>
              </section>
            )}

            {conflictRemote && selectedQueueEntry?.kind === "update" && (
              <section
                className="space-y-3 rounded-md border border-destructive p-4"
                aria-labelledby={`observation-conflict-${root.guardId}`}
              >
                <h3 id={`observation-conflict-${root.guardId}`} className="font-medium">
                  {isParticipationEntry(selectedQueueEntry)
                    ? "La participación cambió en el servidor"
                    : "La observación cambió en el servidor"}
                </h3>
                <div className="grid min-w-0 gap-3 sm:grid-cols-2">
                  <div className="rounded-md bg-muted p-3 text-sm">
                    <p className="font-medium">
                      Versión enviada · v
                      {String(selectedQueueEntry.payload["expectedVersion"] ?? "—")}
                    </p>
                    <p>
                      {isParticipationEntry(selectedQueueEntry)
                        ? participationLevelLabel(
                            selectedQueueEntry.payload["participationLevel"],
                          )
                        : String(
                            selectedQueueEntry.payload["catalogItemKey"] ?? "Conducta sin cambios",
                          )}
                    </p>
                    <p>
                      {String(selectedQueueEntry.payload["comment"] ?? "Sin comentario enviado")}
                    </p>
                  </div>
                  <div className="rounded-md bg-muted p-3 text-sm">
                    <p className="font-medium">Versión actual · v{conflictRemote.version}</p>
                    <p>
                      {isParticipationRecord(conflictRemote)
                        ? participationLevelLabel(conflictRemote.participationLevel)
                        : conflictRemote.catalogLabelSnapshot ?? "Conducta observada"}
                    </p>
                    <p>{conflictRemote.comment ?? "Sin comentario"}</p>
                  </div>
                </div>
                <p className="text-sm">
                  Elegí qué versión conservar. La opción local crea una nueva operación contra la
                  versión actual.
                </p>
                <div className="flex flex-wrap gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    className={ctaClasses.ghost}
                    disabled={busy}
                    onClick={() => void resolveConflict("server")}
                  >
                    Usar versión del servidor
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    className={ctaClasses.indigo}
                    disabled={busy || !effectiveCanWrite || !conflictRemote.canEdit}
                    onClick={() => void resolveConflict("keep")}
                  >
                    Conservar mi corrección enviada
                  </Button>
                </div>
              </section>
            )}
            {unpersisted && (
              <section className="space-y-2 rounded-md border border-destructive p-3">
                <p className="text-sm">
                  El envío no pudo persistirse localmente. El payload y su identidad permanecen
                  congelados; los campos quedan bloqueados.
                </p>
                {compact && error && errorSurface.area === "queue" && (
                  <p role="alert" className="text-sm text-destructive" aria-live="assertive">
                    {error}
                  </p>
                )}
                {compact && message && messageSurface === "queue" && (
                  <p role="status" className="text-sm text-muted-foreground" aria-live="polite">
                    {message}
                  </p>
                )}
                <Button
                  type="button"
                  variant="outline"
                  className={ctaClasses.indigo}
                  disabled={busy || !queueAvailable}
                  onClick={() => void retryUnpersisted()}
                >
                  Reintentar con la misma solicitud
                </Button>
              </section>
            )}
            {queueEntries.length > 0 && (
              <section
                className={
                  compact
                    ? "min-w-0 space-y-3 border-l-2 border-amber-500 pl-3"
                    : "space-y-3 rounded-md border p-4"
                }
              >
                <h3 className="font-medium">Operaciones locales pendientes</h3>
                {compact && error && errorSurface.area === "queue" && !unpersisted && (
                  <p role="alert" className="text-sm text-destructive" aria-live="assertive">
                    {error}
                  </p>
                )}
                {compact && message && messageSurface === "queue" && (
                  <p role="status" className="text-sm text-muted-foreground" aria-live="polite">
                    {message}
                  </p>
                )}
                {queueEntries.map((entry) => (
                  <div
                    key={entry.operationId}
                    className="flex flex-col gap-2 rounded-md border p-3 sm:flex-row sm:items-center sm:justify-between"
                  >
                    <p className="text-sm">
                      {isParticipationEntry(entry)
                        ? entry.kind === "create"
                          ? "Nueva participación"
                          : "Corrección de participación"
                        : entry.kind === "create"
                          ? "Nueva observación"
                          : "Corrección"} ·{" "}
                      {entry.status === "pending"
                        ? "pendiente"
                        : entry.status === "uncertain"
                          ? "sin confirmar"
                          : entry.status === "confirmed-cleanup-failed"
                            ? "confirmada; limpieza pendiente"
                            : "pausada; requiere resolución"}
                    </p>
                    <div className="flex gap-2">
                      <Button
                        type="button"
                        variant="outline"
                        className={ctaClasses.ghost}
                        disabled={busy || Boolean(pendingOperationId)}
                        onClick={() => restoreEntry(entry)}
                      >
                        Restaurar
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        className={ctaClasses.indigo}
                        disabled={
                          !observationQueueEntryCanContinue({
                            actorUserId: entry.actorUserId,
                            currentUserId,
                            contextKey: entry.contextKey,
                            currentContextKey: queueScope,
                            operationId: entry.operationId,
                            pendingOperationId,
                            status: entry.status,
                            busy,
                          }) ||
                          !effectiveCanWrite ||
                          !["pending", "uncertain", "confirmed-cleanup-failed"].includes(
                            entry.status,
                          )
                        }
                        onClick={() => {
                          setSelectedQueueOperationId(entry.operationId);
                          selectedQueueRef.current = entry.operationId;
                          setPendingOperationId(entry.operationId);
                          void processEntry(entry);
                        }}
                      >
                        Reintentar
                      </Button>
                    </div>
                  </div>
                ))}
              </section>
            )}

            <section
              className={
                compact
                  ? "min-w-0 space-y-3 border-t pt-3"
                  : "space-y-3 rounded-md border p-4"
              }
            >
              <h3 className="text-sm font-medium text-muted-foreground">
                Historial de registros ({visibleObservations.length})
              </h3>
              {visibleObservations.length === 0 && !compact && (
                <p className="text-sm text-muted-foreground">
                  No hay registros en este contexto. La ausencia de registros no es una
                  valoración.
                </p>
              )}
              {visibleObservations.map((item) => (
                <article
                  key={item.id}
                  className={
                    isParticipationRecord(item)
                      ? compact
                        ? "min-w-0 space-y-2 border-t border-l-2 border-primary/40 py-2 pl-3"
                        : "space-y-2 rounded-md border border-primary/20 bg-muted/20 p-3"
                      : compact
                        ? "min-w-0 space-y-2 border-t py-2"
                        : "space-y-2 rounded-md border p-3"
                  }
                >
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                    <div>
                      <p className="font-medium">
                        {isParticipationRecord(item)
                          ? "Participación del evaluador"
                          : item.catalogLabelSnapshot ?? "Conducta observada"}
                        {!isParticipationRecord(item) && item.otherDescription
                          ? ` · ${item.otherDescription}`
                          : ""}
                      </p>
                      {isParticipationRecord(item) ? (
                        <p className="text-sm">
                          {item.participationLevel
                            ? evaluatorParticipationLevelLabels[item.participationLevel]
                            : "Nivel sin registrar"}
                        </p>
                      ) : (
                        <p className="text-sm">
                          {item.classification === "adequate"
                            ? "Adecuada"
                            : item.classification === "needs_improvement"
                              ? "A mejorar"
                              : "Sin clasificación"} ·{" "}
                          {item.catalogGroupSnapshot
                            ? groupLabels[item.catalogGroupSnapshot]
                            : "Conducta"}
                        </p>
                      )}
                      <p className="text-xs text-muted-foreground">
                        {contextLabels[item.contextType]} · {isParticipationRecord(item) ? "registrada" : "observada"}{" "}
                        {observationDate(item.observedAt)} · capturada{" "}
                        {observationDate(item.createdAt)} · v{item.version}
                      </p>
                      {item.comment && (
                        <p className="whitespace-pre-wrap text-sm">{item.comment}</p>
                      )}
                    </div>
                    <div className="flex gap-2">
                      <Button
                        type="button"
                        variant="outline"
                        className={ctaClasses.ghost}
                        disabled={busy}
                        onClick={() => void loadHistory(item.id)}
                      >
                        Historial
                      </Button>
                      {effectiveCanWrite && item.canEdit && (
                        <Button
                          type="button"
                          variant="outline"
                          className={ctaClasses.indigo}
                          disabled={busy || Boolean(pendingOperationId)}
                          onClick={() =>
                            isParticipationRecord(item)
                              ? editParticipation(item)
                              : editObservation(item)
                          }
                        >
                          Corregir
                        </Button>
                      )}
                    </div>
                  </div>
                  {(compact || isParticipationRecord(item)) &&
                    error &&
                    errorSurface.area === "history" &&
                    errorSurface.id === item.id && (
                      <p role="alert" className="text-sm text-destructive" aria-live="assertive">
                        {error}
                      </p>
                    )}
                  {historyFor === item.id && (
                    <div className="space-y-2 border-t pt-2">
                      <h4 className="font-medium">Versiones previas</h4>
                      {history.map((row) => (
                        <div key={row.id} className="rounded bg-muted p-2 text-sm">
                          <p>
                            {row.action === "created" ? "Creación" : "Corrección"} ·{" "}
                            {row.versionBefore ?? "—"} → {row.versionAfter} ·{" "}
                            {observationDate(row.occurredAt)}
                          </p>
                          <p>
                            Antes:{" "}
                            {observationAuditStateLabel(row.beforeState)}
                          </p>
                          <p>Después: {observationAuditStateLabel(row.afterState)}</p>
                        </div>
                      ))}
                    </div>
                  )}
                </article>
              ))}
            </section>

            {notices.length > 0 && (
              <section
                className={
                  compact ? "min-w-0 space-y-2 border-t pt-3" : "space-y-2 rounded-md border p-4"
                }
              >
                <h3 className="font-medium">Avisos de corrección</h3>
                {notices.map((notice) => (
                  <div
                    key={notice.id}
                    className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between"
                  >
                    <p className="text-sm">
                      Un administrador corrigió una observación · {observationDate(notice.createdAt)}
                    </p>
                    {!notice.readAt && (
                      <Button
                        type="button"
                        variant="outline"
                        className={ctaClasses.ghost}
                        disabled={busy}
                        onClick={() => void markNotice(notice.id)}
                      >
                        Marcar leído
                      </Button>
                    )}
                    {compact &&
                      error &&
                      errorSurface.area === "notice" &&
                      errorSurface.id === notice.id && (
                        <p role="alert" className="text-sm text-destructive" aria-live="assertive">
                          {error}
                        </p>
                      )}
                  </div>
                ))}
              </section>
            )}
            {compact ? (
              <details className="text-xs text-muted-foreground">
                <summary className="min-h-11 cursor-pointer py-2 font-medium">
                  Guardado y privacidad
                </summary>
                <p>
                  Las operaciones enviadas sin conexión permanecen temporalmente como texto privado
                  en este dispositivo. No son una copia de seguridad; los campos todavía no enviados
                  no quedan guardados.
                </p>
              </details>
            ) : (
              <p className="text-xs text-muted-foreground">
                Las operaciones enviadas sin conexión permanecen temporalmente como texto privado en
                este dispositivo. No son una copia de seguridad; los campos todavía no enviados no
                quedan guardados.
              </p>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}

function ContextSelect({
  id,
  label,
  value,
  rows,
  disabled = false,
  onChange,
  renderLabel,
}: {
  id: string;
  label: string;
  value: string;
  rows: Array<Record<string, unknown>>;
  disabled?: boolean;
  onChange: (id: string) => void;
  renderLabel: (item: Record<string, unknown>) => string;
}) {
  return (
    <div className="grid min-w-0 gap-1" role="group" aria-labelledby={`${id}-label`}>
      <span id={`${id}-label`} className="text-xs font-normal text-muted-foreground">
        {label}
      </span>
      {rows.length === 0 ? (
        <p className="text-sm text-muted-foreground">No hay registros para elegir.</p>
      ) : (
        <ul id={id} className="flex min-w-0 flex-wrap gap-2">
          {rows.map((item) => {
            const itemId = String(item["id"]);
            const active = value === itemId;
            return (
              <li key={itemId} className="min-w-0 max-w-full">
                <button
                  type="button"
                  aria-pressed={active}
                  disabled={disabled}
                  className={`${chipClassName} ${active ? chipActiveClassName : ""}`}
                  onClick={() => onChange(active ? "" : itemId)}
                >
                  <span className="min-w-0 break-words">{renderLabel(item)}</span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
