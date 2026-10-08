import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createClientOnlyFn, useServerFn } from "@tanstack/react-start";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
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

const loadObservationQueue = createClientOnlyFn(() => import("@/lib/efa-observations.queue"));
type ContextKind =
  "guard" | "episode" | "communication" | "dispatch" | "coordination" | "police_event";
type ObservationRoot = {
  guardId: string;
  episodeId?: string;
  ownerUserId?: string;
  guardEndedAt?: string | Date | null;
};
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
  catalogItemKey: string | null;
  catalogKeySnapshot: string;
  catalogLabelSnapshot: string;
  catalogGroupSnapshot: ObservationCatalogItem["group"];
  otherDescription: string | null;
  classification: "adequate" | "needs_improvement";
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
const groupForContext: Record<ContextKind, ObservationCatalogItem["group"]> = {
  guard: "record",
  episode: "record",
  communication: "phone",
  dispatch: "radio",
  coordination: "coordination",
  police_event: "coordination",
};
const contextLabels: Record<ContextKind, string> = {
  guard: "Guardia",
  episode: "Episodio",
  communication: "Llamada",
  dispatch: "Despacho",
  coordination: "Coordinación",
  police_event: "Evento policial",
};
const groupLabels: Record<ObservationCatalogItem["group"], string> = {
  phone: "Teléfono",
  radio: "Radio",
  coordination: "Coordinación",
  duty: "Relevo y colaboración",
  record: "Registro",
};
const observationDate = (value: string | null) =>
  value
    ? new Intl.DateTimeFormat("es-AR", {
        dateStyle: "short",
        timeStyle: "medium",
        timeZone: "America/Argentina/Buenos_Aires",
      }).format(new Date(value))
    : "Sin hora observada";
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
}: {
  root: ObservationRoot;
  title: string;
  currentUserId: string;
  canWrite: boolean;
  isAdmin: boolean;
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
  const [groupFilter, setGroupFilter] = useState<ObservationCatalogItem["group"] | "all">("all");
  const [form, setForm] = useState<ObservationForm>(emptyForm);
  const [editing, setEditing] = useState<ObservationView | null>(null);
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
  const [message, setMessage] = useState("");
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
  const busyRef = useRef(false);
  const conflictGateRef = useRef(createObservationConflictGate());
  const queueScope = root.episodeId ? `episode:${root.episodeId}` : `guard:${root.guardId}`;
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
          root.episodeId
            ? listEpisodeFn({ data: root.episodeId })
            : listGuardFn({ data: root.guardId }),
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
          setError("El almacenamiento local no está disponible; las operaciones no se enviarán.");
        }
        setQueueReady(true);
        if (!root.episodeId) {
          const episodeRows = (await episodesFn()) as Array<Record<string, unknown>>;
          if (live && mounted.current)
            setEpisodes(episodeRows.filter((row) => row["originGuardId"] === root.guardId));
        }
      } catch (cause) {
        if (live && mounted.current)
          setError(
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
    root,
  ]);

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
          setError(cause instanceof Error ? cause.message : "No se pudieron cargar los contextos.");
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
  const availableCatalog = catalog.filter(
    (item) => groupFilter === "all" || item.group === groupFilter,
  );

  const loadHistory = async (observationId: string) => {
    const ticket = ++selectionTicket.current;
    try {
      const rows = (await historyFn({ data: observationId })) as ObservationAuditView[];
      if (!mounted.current || ticket !== selectionTicket.current) return;
      setHistory(rows);
      setHistoryFor(observationId);
    } catch (cause) {
      if (mounted.current)
        setError(cause instanceof Error ? cause.message : "No se pudo cargar el historial.");
    }
  };

  function observationFormFromRecord(item: ObservationView): ObservationForm {
    return {
      catalogItemKey: item.catalogKeySnapshot === "other" ? "other" : (item.catalogItemKey ?? ""),
      classification: item.classification,
      otherDescription: item.otherDescription ?? "",
      otherGroup: item.catalogGroupSnapshot,
      comment: item.comment ?? "",
      observedAt: localDateTimeValue(item.observedAt),
    };
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

  function resetAfterConfirmedCreate() {
    setEditing(null);
    setForm({ ...emptyForm(), otherGroup: groupForContext[contextType] });
  }

  const sendEntry = async (entry: ObservationQueueEntry) => {
    if (entry.kind === "create") return createFn({ data: entry.payload as never });
    return updateFn({ data: entry.payload as never });
  };

  async function processEntry(entry: ObservationQueueEntry, lockHeld = false, background = false) {
    if (!queueStoreRef.current || (!lockHeld && busyRef.current)) return;
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
          return (
            mounted.current &&
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
          if (entry.kind === "create") resetAfterConfirmedCreate();
          else {
            setEditing(saved);
            setForm(observationFormFromRecord(saved));
          }
        }
        setMessage(
          result.status === "confirmed"
            ? `Observación confirmada · versión aplicada ${acknowledgement.operation.appliedVersion}.`
            : "Observación confirmada; solo falta limpiar el pendiente local.",
        );
        try {
          await refreshList();
        } catch {
          setMessage(
            "Observación confirmada. No se pudo actualizar la lista; el registro ya está guardado.",
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
          if (entry.kind === "create") resetAfterConfirmedCreate();
        }
        setMessage("La operación ya estaba confirmada; se limpió el pendiente sin reenviarla.");
      } else if (result.status === "paused") {
        setError(result.error);
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
        setError("La operación quedó pausada porque no hay permisos vigentes para editar.");
      } else if (result.status === "stored") setError(result.error);
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
        setError(
          cause instanceof Error ? cause.message : "La operación sigue pendiente de confirmación.",
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
    busyRef.current = true;
    setBusy(true);
    setPendingOperationId(operationId);
    setSelectedQueueOperationId(operationId);
    selectedQueueRef.current = operationId;
    setError("");
    try {
      const queue = await loadObservationQueue();
      if (!mounted.current || contextRef.current.currentUserId !== entry.actorUserId) return;
      queueStoreRef.current = queueStoreRef.current ?? queue.createObservationQueueStore();
      await queue.persistObservationOperation(queueStoreRef.current, entry);
      setQueueEntries(await queueStoreRef.current.list(currentUserId, queueScope));
      await processEntry(entry, true);
    } catch (cause) {
      setUnpersisted(entry);
      setError(
        `No se pudo guardar el envío local. Conservamos la misma operación para reintentar. ${cause instanceof Error ? cause.message : ""}`,
      );
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
      setError(cause instanceof Error ? cause.message : "No se pudo persistir el reintento local.");
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
      setError("El contexto pendiente no coincide con esta pantalla; la operación no se enviará.");
      return;
    }
    setSelectedQueueOperationId(entry.operationId);
    selectedQueueRef.current = entry.operationId;
    setPendingOperationId(entry.operationId);
    setEditing(null);
    if (entry.kind === "create") {
      const selection = createSelection!;
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
            setError("El registro no pertenece a este contexto o ya no admite correcciones.");
            return;
          }
          setEditing(current);
          const selection = contextForObservation(current);
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
          const restored = observationFormFromRecord(current);
          setForm(restoreObservationUpdateForm(restored, payload as Record<string, unknown>));
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
            setError(
              cause instanceof Error ? cause.message : "No se pudo restaurar la observación.",
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
      setError(cause instanceof Error ? cause.message : "No se pudo comparar con el servidor.");
      return;
    }
    if (
      !mounted.current ||
      contextRef.current.currentUserId !== entry.actorUserId ||
      selectedQueueRef.current !== operationId ||
      (choice === "keep" && !latest.canEdit)
    ) {
      setError("La cuenta, selección o permiso cambió; la operación pausada se conservó.");
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
        setEditing(latest);
        setForm(observationFormFromRecord(latest));
        setPendingOperationId("");
        setSelectedQueueOperationId("");
        selectedQueueRef.current = "";
        setConflictRemote(null);
        setError("");
        setMessage("Se cargó la versión del servidor y se descartó solo esta operación pausada.");
      } catch (cause) {
        setError(
          cause instanceof Error ? cause.message : "No se pudo resolver la operación local.",
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
      setError("");
      await dispatchObservationRebasedEntry(rebased, processEntry);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "No se pudo rebasar la operación.");
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
  const labelFor = (item: Record<string, unknown>, fallback: string) =>
    String(item["baseName"] ?? item["motive"] ?? item["placeType"] ?? fallback);

  const validContext = currentContext !== null;
  const allowedToSave = editing ? effectiveCanWrite && editing.canEdit : canCreateHere;
  const canSubmit =
    canChangeForm &&
    allowedToSave &&
    validContext &&
    Boolean(form.catalogItemKey) &&
    (isOther ? Boolean(form.otherDescription.trim()) : Boolean(selectedCatalogItem));

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

  async function markNotice(noticeId: string) {
    if (busy) return;
    setBusy(true);
    try {
      const saved = (await markNoticeFn({ data: noticeId })) as ObservationNoticeView;
      if (mounted.current && contextRef.current.currentUserId === currentUserId)
        setNotices((rows) => rows.map((item) => (item.id === saved.id ? saved : item)));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "No se pudo marcar el aviso.");
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
  };

  const quickObservedAt = () => {
    const clickedAt = captureObservationNow();
    setForm((current) => ({ ...current, observedAt: localDateTimeValue(clickedAt) }));
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        <p className="text-sm text-muted-foreground">
          {effectiveCanWrite ? "Acceso de escritura vigente" : "Solo lectura"} · Capturas
          opcionales, anónimas y sin evaluación de personas.
        </p>
      </CardHeader>
      <CardContent className="space-y-4">
        {error && (
          <p
            role="alert"
            className="rounded-md border border-destructive p-3 text-sm text-destructive"
          >
            {error}
          </p>
        )}
        {message && (
          <p role="status" className="rounded-md bg-muted p-3 text-sm">
            {message}
          </p>
        )}
        {loading && <p className="text-sm text-muted-foreground">Cargando catálogo e historial…</p>}
        {!loading && (
          <>
            <section className="space-y-3 rounded-md border p-3">
              <h3 className="font-medium">Contexto de observación</h3>
              {!root.episodeId && (
                <div className="space-y-2">
                  <Label htmlFor={`observation-episode-${root.guardId}`}>
                    Episodio de esta guardia (opcional)
                  </Label>
                  <select
                    id={`observation-episode-${root.guardId}`}
                    className="min-h-11 w-full rounded-md border bg-background px-3"
                    value={contextEpisodeId}
                    disabled={busy || Boolean(pendingOperationId) || Boolean(editing)}
                    onChange={(event) => selectEpisode(event.target.value)}
                  >
                    <option value="">Solo guardia</option>
                    {episodes.map((episode) => (
                      <option key={String(episode["id"])} value={String(episode["id"])}>
                        Episodio ·{" "}
                        {String(episode["motive"] ?? episode["address"] ?? episode["id"])}
                      </option>
                    ))}
                  </select>
                </div>
              )}
              {activeEpisodeId && (
                <div className="space-y-2">
                  <Label htmlFor={`observation-context-${root.guardId}`}>Tipo de contexto</Label>
                  <select
                    id={`observation-context-${root.guardId}`}
                    className="min-h-11 w-full rounded-md border bg-background px-3"
                    value={contextType}
                    disabled={busy || Boolean(pendingOperationId) || Boolean(editing)}
                    onChange={(event) => handleContextType(event.target.value as ContextKind)}
                  >
                    {!root.episodeId && <option value="guard">Guardia</option>}
                    <option value="episode">Episodio</option>
                    <option value="communication">Llamada</option>
                    <option value="dispatch">Despacho</option>
                    <option value="coordination">Coordinación</option>
                    <option value="police_event">Evento policial</option>
                  </select>
                </div>
              )}
              {contextType === "communication" && (
                <ContextSelect
                  id={`observation-leaf-${root.guardId}`}
                  label="Llamada"
                  value={leafId}
                  rows={communications}
                  disabled={Boolean(editing)}
                  onChange={setLeafId}
                  renderLabel={(item) =>
                    `Llamada · ${observationDate(String(item["createdAt"] ?? ""))}`
                  }
                />
              )}
              {contextType === "dispatch" && (
                <ContextSelect
                  id={`observation-leaf-${root.guardId}`}
                  label="Despacho"
                  value={leafId}
                  rows={dispatches}
                  disabled={Boolean(editing)}
                  onChange={setLeafId}
                  renderLabel={(item) => `Despacho · ${labelFor(item, "Base")}`}
                />
              )}
              {(contextType === "coordination" || contextType === "police_event") && (
                <ContextSelect
                  id={`observation-coordination-${root.guardId}`}
                  label="Coordinación"
                  value={coordinationId}
                  rows={coordinations}
                  disabled={Boolean(editing)}
                  onChange={(id) => {
                    setCoordinationId(id);
                    setLeafId("");
                  }}
                  renderLabel={(item) => `Coordinación · ${labelFor(item, "registro")}`}
                />
              )}
              {contextType === "police_event" && coordinationId && (
                <ContextSelect
                  id={`observation-event-${root.guardId}`}
                  label="Evento policial"
                  value={leafId}
                  rows={events}
                  disabled={Boolean(editing)}
                  onChange={setLeafId}
                  renderLabel={(item) => `Evento · ${String(item["kind"] ?? "registro")}`}
                />
              )}
              {contextType === "police_event" && !coordinationId && (
                <p className="text-sm text-muted-foreground">
                  Selecciona una coordinación para ver sus eventos.
                </p>
              )}
              {!guardIsOpen && (
                <p className="text-sm text-muted-foreground">
                  La guardia terminó: puedes leer el historial y corregir observaciones existentes
                  con permisos vigentes, pero no agregar nuevas.
                </p>
              )}
            </section>

            {effectiveCanWrite && !guardIsOpen && !editing && (
              <p className="text-sm text-muted-foreground">
                La guardia cerrada no admite observaciones nuevas.
              </p>
            )}
            {effectiveCanWrite && !isRootOwner && !editing && (
              <p className="text-sm text-muted-foreground">
                Solo el responsable del contexto puede crear observaciones; la administración
                conserva autoría original al corregir registros existentes.
              </p>
            )}

            {effectiveCanWrite && (canCreateHere || editing?.canEdit) && (
              <section className="space-y-3 rounded-md border p-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h3 className="font-medium">
                    {editing
                      ? `Corregir observación · v${editing.version}`
                      : "Agregar una observación"}
                  </h3>
                  {editing && canCreateHere && (
                    <Button
                      type="button"
                      variant="outline"
                      className="min-h-11"
                      disabled={busy || Boolean(pendingOperationId)}
                      onClick={startNewObservation}
                    >
                      Nueva observación
                    </Button>
                  )}
                </div>
                <p className="text-sm text-muted-foreground">
                  Registra solo una conducta observada; no seleccionar una conducta no implica una
                  valoración negativa.
                </p>
                <div className="space-y-2">
                  <Label htmlFor={`observation-group-${root.guardId}`}>
                    Grupo del catálogo (filtro opcional)
                  </Label>
                  <select
                    id={`observation-group-${root.guardId}`}
                    className="min-h-11 w-full rounded-md border bg-background px-3"
                    value={groupFilter}
                    disabled={!canChangeForm}
                    onChange={(event) =>
                      setGroupFilter(event.target.value as ObservationCatalogItem["group"] | "all")
                    }
                  >
                    <option value="all">Todos los grupos</option>
                    {Object.entries(groupLabels).map(([key, label]) => (
                      <option key={key} value={key}>
                        {label}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor={`observation-item-${root.guardId}`}>Conducta concreta</Label>
                  <select
                    id={`observation-item-${root.guardId}`}
                    className="min-h-11 w-full rounded-md border bg-background px-3"
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
                    {availableCatalog.map((item) => (
                      <option key={item.key} value={item.key}>
                        {item.label} · {groupLabels[item.group]}
                      </option>
                    ))}
                    <option value="other">Otra conducta</option>
                  </select>
                </div>
                {isOther && (
                  <>
                    <div className="space-y-2">
                      <Label htmlFor={`observation-other-${root.guardId}`}>
                        Descripción local de la conducta
                      </Label>
                      <Textarea
                        id={`observation-other-${root.guardId}`}
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
                    <div className="space-y-2">
                      <Label htmlFor={`observation-other-group-${root.guardId}`}>
                        Grupo de esta observación
                      </Label>
                      <select
                        id={`observation-other-group-${root.guardId}`}
                        className="min-h-11 w-full rounded-md border bg-background px-3"
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
                  </>
                )}
                <fieldset className="space-y-2" disabled={!canChangeForm}>
                  <legend className="text-sm font-medium">Clasificación requerida</legend>
                  <label className="flex min-h-11 items-center gap-3">
                    <input
                      type="radio"
                      name={`observation-class-${root.guardId}`}
                      checked={form.classification === "adequate"}
                      onChange={() =>
                        setForm((current) => ({ ...current, classification: "adequate" }))
                      }
                    />
                    Adecuada
                  </label>
                  <label className="flex min-h-11 items-center gap-3">
                    <input
                      type="radio"
                      name={`observation-class-${root.guardId}`}
                      checked={form.classification === "needs_improvement"}
                      onChange={() =>
                        setForm((current) => ({ ...current, classification: "needs_improvement" }))
                      }
                    />
                    A mejorar
                  </label>
                </fieldset>
                <div className="space-y-2">
                  <Label htmlFor={`observation-time-${root.guardId}`}>
                    Hora real observada (opcional)
                  </Label>
                  <Input
                    id={`observation-time-${root.guardId}`}
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
                    className="min-h-11"
                    disabled={!canChangeForm}
                    onClick={quickObservedAt}
                  >
                    Ahora
                  </Button>
                </div>
                <div className="space-y-2">
                  <Label htmlFor={`observation-comment-${root.guardId}`}>
                    Comentario breve (opcional)
                  </Label>
                  <Textarea
                    id={`observation-comment-${root.guardId}`}
                    value={form.comment}
                    maxLength={1000}
                    disabled={!canChangeForm}
                    onChange={(event) =>
                      setForm((current) => ({ ...current, comment: event.target.value }))
                    }
                  />
                </div>
                <Button
                  type="button"
                  className="min-h-11 w-full sm:w-auto"
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
              </section>
            )}

            {conflictRemote && selectedQueueEntry?.kind === "update" && (
              <section
                className="space-y-3 rounded-md border border-destructive p-4"
                aria-labelledby={`observation-conflict-${root.guardId}`}
              >
                <h3 id={`observation-conflict-${root.guardId}`} className="font-medium">
                  La observación cambió en el servidor
                </h3>
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="rounded-md bg-muted p-3 text-sm">
                    <p className="font-medium">
                      Versión enviada · v
                      {String(selectedQueueEntry.payload["expectedVersion"] ?? "—")}
                    </p>
                    <p>
                      {String(
                        selectedQueueEntry.payload["catalogItemKey"] ?? "Conducta sin cambios",
                      )}
                    </p>
                    <p>
                      {String(selectedQueueEntry.payload["comment"] ?? "Sin comentario enviado")}
                    </p>
                  </div>
                  <div className="rounded-md bg-muted p-3 text-sm">
                    <p className="font-medium">Versión actual · v{conflictRemote.version}</p>
                    <p>{conflictRemote.catalogLabelSnapshot}</p>
                    <p>{conflictRemote.comment ?? "Sin comentario"}</p>
                  </div>
                </div>
                <p className="text-sm">
                  Elegí explícitamente qué conservar. La opción local crea una nueva operación
                  contra la versión actual; no cambia el pendiente automáticamente.
                </p>
                <div className="flex flex-wrap gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    className="min-h-11"
                    disabled={busy}
                    onClick={() => void resolveConflict("server")}
                  >
                    Usar versión del servidor
                  </Button>
                  <Button
                    type="button"
                    className="min-h-11"
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
                <Button
                  type="button"
                  className="min-h-11"
                  disabled={busy || !queueAvailable}
                  onClick={() => void retryUnpersisted()}
                >
                  Reintentar con la misma solicitud
                </Button>
              </section>
            )}
            {queueEntries.length > 0 && (
              <section className="space-y-3 rounded-md border p-4">
                <h3 className="font-medium">Operaciones locales pendientes</h3>
                {queueEntries.map((entry) => (
                  <div
                    key={entry.operationId}
                    className="flex flex-col gap-2 rounded-md border p-3 sm:flex-row sm:items-center sm:justify-between"
                  >
                    <p className="text-sm">
                      {entry.kind === "create" ? "Nueva observación" : "Corrección"} ·{" "}
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
                        className="min-h-11"
                        disabled={busy || Boolean(pendingOperationId)}
                        onClick={() => restoreEntry(entry)}
                      >
                        Restaurar
                      </Button>
                      <Button
                        type="button"
                        className="min-h-11"
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

            <section className="space-y-3 rounded-md border p-4">
              <h3 className="font-medium">Historial de conductas observadas</h3>
              {visibleObservations.length === 0 && (
                <p className="text-sm text-muted-foreground">
                  No hay observaciones en este contexto. La ausencia de registros no es una
                  valoración.
                </p>
              )}
              {visibleObservations.map((item) => (
                <article key={item.id} className="space-y-2 rounded-md border p-3">
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                    <div>
                      <p className="font-medium">
                        {item.catalogLabelSnapshot}
                        {item.otherDescription ? ` · ${item.otherDescription}` : ""}
                      </p>
                      <p className="text-sm">
                        {item.classification === "adequate" ? "Adecuada" : "A mejorar"} ·{" "}
                        {groupLabels[item.catalogGroupSnapshot]}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {contextLabels[item.contextType]} · observada{" "}
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
                        className="min-h-11"
                        disabled={busy}
                        onClick={() => void loadHistory(item.id)}
                      >
                        Historial
                      </Button>
                      {effectiveCanWrite && item.canEdit && (
                        <Button
                          type="button"
                          variant="secondary"
                          className="min-h-11"
                          disabled={busy || Boolean(pendingOperationId)}
                          onClick={() => editObservation(item)}
                        >
                          Corregir
                        </Button>
                      )}
                    </div>
                  </div>
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
                            {row.beforeState
                              ? JSON.stringify(row.beforeState)
                              : "Sin estado previo"}
                          </p>
                          <p>Después: {JSON.stringify(row.afterState)}</p>
                        </div>
                      ))}
                    </div>
                  )}
                </article>
              ))}
            </section>

            <section className="space-y-2 rounded-md border p-4">
              <h3 className="font-medium">Avisos de corrección</h3>
              {notices.length === 0 && (
                <p className="text-sm text-muted-foreground">No tienes avisos pendientes.</p>
              )}
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
                      className="min-h-11"
                      disabled={busy}
                      onClick={() => void markNotice(notice.id)}
                    >
                      Marcar leído
                    </Button>
                  )}
                </div>
              ))}
            </section>
            <p className="text-xs text-muted-foreground">
              Las operaciones enviadas sin conexión permanecen temporalmente como texto privado en
              este dispositivo. No son una copia de seguridad; los campos todavía no enviados no
              quedan guardados.
            </p>
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
    <div className="space-y-2">
      <Label htmlFor={id}>{label}</Label>
      <select
        id={id}
        className="min-h-11 w-full rounded-md border bg-background px-3"
        value={value}
        disabled={disabled}
        onChange={(event) => onChange(event.target.value)}
      >
        <option value="">Selecciona un registro existente</option>
        {rows.map((item) => (
          <option key={String(item["id"])} value={String(item["id"])}>
            {renderLabel(item)}
          </option>
        ))}
      </select>
    </div>
  );
}
