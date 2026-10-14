import { useCallback, useEffect, useRef, useState } from "react";
import { createClientOnlyFn, useServerFn } from "@tanstack/react-start";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  addEfaPoliceCoordinationEvent,
  createEfaPoliceCoordination,
  getEfaPoliceCoordination,
  getEfaPoliceCoordinationHistory,
  listEfaPoliceCoordinationNotices,
  listEfaPoliceCoordinationsForEpisode,
  markEfaPoliceCoordinationNoticeRead,
  setEfaPoliceCoordinationDispatches,
  updateEfaPoliceCoordination,
  updateEfaPoliceCoordinationEvent,
} from "@/lib/efa-police-coordination.functions";
import { listEfaDispatchesForEpisode } from "@/lib/efa-dispatches.functions";
import { getEfaEpisode } from "@/lib/efa-episodes.functions";
import { formatObservedDateTime, policeEventLabel, timeStatusLabel } from "@/lib/efa-labels";

const loadQueue = createClientOnlyFn(() => import("@/lib/efa-police-coordination.queue"));
type DispatchChoice = {
  id: string;
  baseName: string;
  version: number;
  canEdit: boolean;
  createdAt: string | Date | null;
  state: string;
  priority: string | null;
};
function mapDispatchChoices(rows: Array<Record<string, unknown>>): DispatchChoice[] {
  return rows.map((item) => ({
    id: String(item["id"]),
    baseName: String(item["baseName"] ?? "").trim() || "Base institucional",
    version: Number(item["version"]),
    canEdit: Boolean(item["canEdit"]),
    createdAt:
      typeof item["createdAt"] === "string" || item["createdAt"] instanceof Date
        ? item["createdAt"]
        : null,
    state: String(item["state"] ?? ""),
    priority: typeof item["priority"] === "string" ? item["priority"] : null,
  }));
}
function formatLinkedDispatchDate(value: string | Date | null | undefined) {
  if (!value) return null;
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
}
function dispatchChoiceLabel(dispatch: DispatchChoice) {
  const state =
    dispatch.state === "cancelled"
      ? "Anulado"
      : dispatch.state === "finalized"
        ? "Finalizado"
        : dispatch.state === "draft"
          ? "En curso"
          : "";
  const priority =
    dispatch.priority === "red"
      ? "Prioridad roja"
      : dispatch.priority === "yellow"
        ? "Prioridad amarilla"
        : dispatch.priority === "green"
          ? "Prioridad verde"
          : "";
  return [dispatch.baseName, formatLinkedDispatchDate(dispatch.createdAt), state, priority]
    .filter(Boolean)
    .join(" · ");
}
type CoordinationForm = {
  initiator: "central" | "ambulance";
  initiatingDispatchId: string;
  placeType: "incident" | "meeting_point";
  meetingReference: string;
  notes: string;
};
type EventForm = {
  kind: PoliceEventKind;
  dispatchId: string;
  occurredAt: string;
  timeStatus: PoliceTimeStatus;
  note: string;
};
type PoliceTimeStatus = "observed" | "not_observed" | "not_informed" | "not_applicable";
type PoliceEventKind =
  "request" | "response" | "reiteration" | "arrival_meeting_point" | "waiting" | "actual_meeting";
type PoliceEventView = {
  id: string;
  coordinationId: string;
  episodeId: string;
  ownerUserId: string;
  dispatchId: string | null;
  actorUserId: string;
  clientEventId: string;
  kind: PoliceEventKind;
  occurredAt: string | null;
  timeStatus: PoliceTimeStatus;
  note: string | null;
  version: number;
  createdAt: string;
  updatedAt: string;
};
type PoliceCoordinationView = {
  id: string;
  episodeId: string;
  ownerUserId: string;
  clientCreationKey: string;
  initiator: "central" | "ambulance";
  initiatingDispatchId: string | null;
  placeType: "incident" | "meeting_point";
  meetingReference: string | null;
  notes: string | null;
  state: "draft" | "finalized";
  version: number;
  createdAt: string;
  updatedAt: string;
  canEdit: boolean;
  dispatchIds: string[];
  events: PoliceEventView[];
};
type PoliceCoordinationMutation = Omit<PoliceCoordinationView, "events"> & {
  events?: PoliceEventView[];
};
const blankForm = (): CoordinationForm => ({
  initiator: "central",
  initiatingDispatchId: "",
  placeType: "incident",
  meetingReference: "",
  notes: "",
});
const blankEvent = (): EventForm => ({
  kind: "request",
  dispatchId: "",
  occurredAt: "",
  timeStatus: "not_observed",
  note: "",
});
const eventKinds: PoliceEventKind[] = [
  "request",
  "response",
  "reiteration",
  "arrival_meeting_point",
  "waiting",
  "actual_meeting",
];
const timeStatuses: PoliceTimeStatus[] = [
  "not_observed",
  "not_informed",
  "not_applicable",
  "observed",
];
const eventLabel = policeEventLabel;
const formatDate = (value: string | null) => formatObservedDateTime(value);
const nextId = () => crypto.randomUUID();
const coordinationSteps = ["Datos", "Despachos", "Eventos e historial"] as const;

// eslint-disable-next-line react-refresh/only-export-components -- Shared with focused navigation regression tests.
export function CoordinationStepNavigation({
  activeStep,
  onStepChange,
}: {
  activeStep: number;
  onStepChange: (step: number) => void;
}) {
  const label = coordinationSteps[activeStep] ?? "Coordinación";
  return (
    <nav className="min-w-0 space-y-2" aria-label="Pasos de coordinación">
      <div className="flex min-w-0 items-center justify-between gap-2">
        <p aria-live="polite" className="min-w-0 text-sm font-medium">
          Paso {activeStep + 1} de {coordinationSteps.length} · {label}
        </p>
        <details className="relative shrink-0">
          <summary className="flex min-h-11 cursor-pointer items-center rounded-md border px-3 text-sm">
            Ver pasos
          </summary>
          <div className="absolute right-0 z-10 grid min-w-52 max-w-[calc(100vw-2rem)] gap-1 rounded-md border bg-background p-2 shadow-lg">
            {coordinationSteps.map((stepLabel, index) => (
              <Button
                key={stepLabel}
                type="button"
                variant={index === activeStep ? "secondary" : "outline"}
                className="min-h-11 min-w-0 justify-start whitespace-normal text-left"
                aria-label={`Ir a ${stepLabel}`}
                aria-current={index === activeStep ? "step" : undefined}
                onClick={(event) => {
                  onStepChange(index);
                  const details = event.currentTarget.closest("details");
                  if (details) details.open = false;
                }}
              >
                {stepLabel}
              </Button>
            ))}
          </div>
        </details>
      </div>
      <div
        className="grid min-w-0 grid-cols-2 gap-2"
        role="group"
        aria-label="Navegación entre pasos"
      >
        <Button
          type="button"
          variant="outline"
          className="min-h-11 min-w-0"
          disabled={activeStep === 0}
          onClick={() => onStepChange(Math.max(0, activeStep - 1))}
        >
          Anterior
        </Button>
        <Button
          type="button"
          className="min-h-11 min-w-0"
          disabled={activeStep === coordinationSteps.length - 1}
          onClick={() => onStepChange(Math.min(coordinationSteps.length - 1, activeStep + 1))}
        >
          Siguiente
        </Button>
      </div>
    </nav>
  );
}

// eslint-disable-next-line react-refresh/only-export-components -- Pure test seam used by the component's quick-time action.
export function capturePoliceNow(now: () => Date = () => new Date()) {
  return now().toISOString();
}

function localTimeInput(value: string | null) {
  if (!value) return "";
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return "";
  const pad = (number: number, length = 2) => String(number).padStart(length, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}.${pad(date.getMilliseconds(), 3)}`;
}

function inputTimeIso(value: string) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? date.toISOString() : null;
}

// eslint-disable-next-line react-refresh/only-export-components -- Restores the frozen event payload into the component editor.
export function restorePoliceEventDraft(payload: Record<string, unknown>): EventForm {
  return {
    kind: payload["kind"] as PoliceEventKind,
    dispatchId: String(payload["dispatchId"] ?? ""),
    occurredAt:
      typeof payload["occurredAt"] === "string" ? localTimeInput(payload["occurredAt"]) : "",
    timeStatus: payload["timeStatus"] as PoliceTimeStatus,
    note: String(payload["note"] ?? ""),
  };
}

// eslint-disable-next-line react-refresh/only-export-components -- Permission predicate directly gates the component's queue send path.
export function policeQueueContextAllows(input: {
  entry: { ownerUserId: string; episodeId: string; entityId: string; kind: string };
  ownerUserId: string;
  episodeId: string;
  selectedEntityId: string;
  canWrite: boolean;
  episodeCanEdit: boolean;
  entityCanEdit: boolean;
}) {
  return (
    input.entry.ownerUserId === input.ownerUserId &&
    input.entry.episodeId === input.episodeId &&
    input.canWrite &&
    input.episodeCanEdit &&
    (input.entry.kind === "create"
      ? input.selectedEntityId === ""
      : input.selectedEntityId === input.entry.entityId && input.entityCanEdit)
  );
}

// eslint-disable-next-line react-refresh/only-export-components -- Shared form validation used by event submission handlers.
export function policeEventRequiresDispatch(kind: PoliceEventKind) {
  return kind === "arrival_meeting_point" || kind === "waiting" || kind === "actual_meeting";
}

// eslint-disable-next-line react-refresh/only-export-components -- Normalizes the component's real mutation acknowledgements.
export function mergePoliceMutationResult(
  current: PoliceCoordinationView,
  acknowledgement: { coordination: PoliceCoordinationMutation; event?: PoliceEventView | null },
): PoliceCoordinationView {
  const mutation = acknowledgement.coordination;
  const merged = {
    ...current,
    ...mutation,
    dispatchIds: mutation.dispatchIds ?? current.dispatchIds,
    events: mutation.events ?? current.events,
  };
  if (!acknowledgement.event) return merged;
  const event = acknowledgement.event;
  return {
    ...merged,
    events: merged.events.some((item) => item.id === event.id)
      ? merged.events.map((item) => (item.id === event.id ? event : item))
      : [...merged.events, event],
  };
}

// eslint-disable-next-line react-refresh/only-export-components -- Applies the component's real save acknowledgement to independent editor areas.
export function acknowledgePoliceCoordinationSave(
  dirty: { coordination: boolean; dispatches: boolean },
  entry: { kind: string; payload: Record<string, unknown> },
  current: { form: CoordinationForm; dispatchIds: string[] },
) {
  const payload = entry.payload;
  let coordination = dirty.coordination;
  let dispatches = dirty.dispatches;
  if (entry.kind === "create" || entry.kind === "update") {
    const submittedForm = {
      initiator: payload["initiator"],
      initiatingDispatchId: payload["initiatingDispatchId"] ?? "",
      placeType: payload["placeType"],
      meetingReference: payload["meetingReference"] ?? "",
      notes: payload["notes"] ?? "",
    };
    coordination = JSON.stringify(current.form) !== JSON.stringify(submittedForm);
  }
  if (entry.kind === "create" || entry.kind === "dispatches") {
    dispatches =
      JSON.stringify(current.dispatchIds) !==
      JSON.stringify((payload["dispatchIds"] as string[] | undefined) ?? []);
  }
  return { coordination, dispatches };
}

// eslint-disable-next-line react-refresh/only-export-components -- The component uses this identity-scoped queue cleanup transition directly.
export function completePoliceQueueOutcome<
  Entry extends {
    ownerUserId: string;
    episodeId: string;
    entityId: string;
    operationId: string;
    kind?: string;
    payload?: Record<string, unknown>;
  },
>(
  state: {
    ownerUserId: string;
    episodeId: string;
    selectedId: string;
    pendingOperationId: string;
    entries: Entry[];
    coordinationDirty: boolean;
    dispatchesDirty: boolean;
  },
  outcome: { status: "cleaned"; entry: Entry },
) {
  const entry = outcome.entry;
  const matchesContext =
    entry.ownerUserId === state.ownerUserId && entry.episodeId === state.episodeId;
  const releasesEditor =
    matchesContext &&
    state.pendingOperationId === entry.operationId &&
    (entry.kind === "create" ? state.selectedId === "" : state.selectedId === entry.entityId);
  return {
    ...state,
    entries: matchesContext
      ? state.entries.filter(
          (item) =>
            !(
              item.ownerUserId === entry.ownerUserId &&
              item.episodeId === entry.episodeId &&
              item.entityId === entry.entityId &&
              item.operationId === entry.operationId
            ),
        )
      : state.entries,
    pendingOperationId: releasesEditor ? "" : state.pendingOperationId,
    completedCreate: releasesEditor && entry.kind === "create",
  };
}

// eslint-disable-next-line react-refresh/only-export-components -- Chooses the actual terminal UI action for a confirmed create cleanup.
export function resolvePoliceCreateCleanup(
  entry: { kind: string; payload: Record<string, unknown> },
  records: PoliceCoordinationView[],
) {
  const creationKey = String(entry.payload["clientCreationKey"] ?? "");
  const record = records.find((item) => item.clientCreationKey === creationKey);
  return record ? { kind: "adopt" as const, record } : { kind: "clear" as const };
}

export function EfaPoliceCoordinationPanel({
  episodeId,
  episodeLabel,
  currentUserId,
  canWrite,
  episodeCanEdit,
  isActive = true,
}: {
  episodeId: string;
  episodeLabel: string;
  currentUserId: string;
  canWrite: boolean;
  episodeCanEdit: boolean;
  isActive?: boolean;
}) {
  const listFn = useServerFn(listEfaPoliceCoordinationsForEpisode);
  const getFn = useServerFn(getEfaPoliceCoordination);
  const getEpisodeFn = useServerFn(getEfaEpisode);
  const createFn = useServerFn(createEfaPoliceCoordination);
  const updateFn = useServerFn(updateEfaPoliceCoordination);
  const linksFn = useServerFn(setEfaPoliceCoordinationDispatches);
  const addEventFn = useServerFn(addEfaPoliceCoordinationEvent);
  const updateEventFn = useServerFn(updateEfaPoliceCoordinationEvent);
  const historyFn = useServerFn(getEfaPoliceCoordinationHistory);
  const noticesFn = useServerFn(listEfaPoliceCoordinationNotices);
  const readNoticeFn = useServerFn(markEfaPoliceCoordinationNoticeRead);
  const listDispatchesFn = useServerFn(listEfaDispatchesForEpisode);
  const [items, setItems] = useState<PoliceCoordinationView[]>([]);
  const [dispatches, setDispatches] = useState<DispatchChoice[]>([]);
  const [notices, setNotices] = useState<
    Array<{ id: string; coordinationId: string; createdAt: string; readAt: string | null }>
  >([]);
  const [selectedId, setSelectedId] = useState("");
  const [form, setForm] = useState<CoordinationForm>(blankForm);
  const [eventForm, setEventForm] = useState<EventForm>(blankEvent);
  const [links, setLinks] = useState<string[]>([]);
  const [coordinationDirty, setCoordinationDirty] = useState(false);
  const [dispatchesDirty, setDispatchesDirty] = useState(false);
  const dirty = coordinationDirty || dispatchesDirty;
  const [dirtyEventId, setDirtyEventId] = useState("");
  const [eventEdits, setEventEdits] = useState<Record<string, EventForm>>({});
  const [auditRows, setAuditRows] = useState<Array<Record<string, unknown>>>([]);
  const [activeStep, setActiveStep] = useState(0);
  const activeStepTargetRef = useRef<HTMLElement>(null);
  const previousActiveStepRef = useRef(activeStep);
  useEffect(() => {
    if (previousActiveStepRef.current === activeStep) return;
    previousActiveStepRef.current = activeStep;
    const target = activeStepTargetRef.current;
    if (!target) return;
    target.focus({ preventScroll: true });
    target.scrollIntoView({
      block: "start",
      behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth",
    });
  }, [activeStep]);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");
  const [queueEntries, setQueueEntries] = useState<
    import("@/lib/efa-police-coordination.queue").PoliceQueueEntry[]
  >([]);
  const [unpersisted, setUnpersisted] = useState<
    import("@/lib/efa-police-coordination.queue").PoliceQueueEntry | null
  >(null);
  const [pendingOperationId, setPendingOperationId] = useState("");
  const [conflict, setConflict] = useState<{
    operationId: string;
    entry: import("@/lib/efa-police-coordination.queue").PoliceQueueEntry;
    remote: PoliceCoordinationView | null;
  } | null>(null);
  const mounted = useRef(false);
  const dispatchChoicesRequestRef = useRef(0);
  const context = useRef({ currentUserId, episodeId, canWrite, episodeCanEdit });
  const selectionTicket = useRef(0);
  const formDirtyRef = useRef(false);
  const coordinationFormRef = useRef(form);
  const dispatchIdsRef = useRef(links);
  const coordinationDirtyRef = useRef(coordinationDirty);
  const dispatchesDirtyRef = useRef(dispatchesDirty);
  const pendingOperationIdRef = useRef(pendingOperationId);
  const busyRef = useRef(false);
  const storeRef = useRef<import("@/lib/efa-police-coordination.queue").PoliceQueueStore | null>(
    null,
  );
  const processEntryRef = useRef<
    (entry: import("@/lib/efa-police-coordination.queue").PoliceQueueEntry) => Promise<void>
  >(async () => {});
  const selectedRef = useRef(selectedId);
  const entriesRef = useRef(queueEntries);
  const writeAllowed = canWrite && episodeCanEdit;
  context.current = { currentUserId, episodeId, canWrite, episodeCanEdit };
  selectedRef.current = selectedId;
  entriesRef.current = queueEntries;
  formDirtyRef.current = dirty;
  coordinationFormRef.current = form;
  dispatchIdsRef.current = links;
  coordinationDirtyRef.current = coordinationDirty;
  dispatchesDirtyRef.current = dispatchesDirty;
  pendingOperationIdRef.current = pendingOperationId;
  const setCoordinationDirtyTracked = (value: boolean) => {
    coordinationDirtyRef.current = value;
    setCoordinationDirty(value);
  };
  const setDispatchesDirtyTracked = (value: boolean) => {
    dispatchesDirtyRef.current = value;
    setDispatchesDirty(value);
  };
  const updateCoordinationForm = (next: CoordinationForm) => {
    coordinationFormRef.current = next;
    setForm(next);
  };
  const updateDispatchLinks = (next: string[] | ((current: string[]) => string[])) => {
    const value = typeof next === "function" ? next(dispatchIdsRef.current) : next;
    dispatchIdsRef.current = value;
    setLinks(value);
  };

  const refreshDispatchChoices = useCallback(async () => {
    const requestId = ++dispatchChoicesRequestRef.current;
    const requestContext = { ...context.current };
    const isCurrentRequest = () =>
      mounted.current &&
      dispatchChoicesRequestRef.current === requestId &&
      context.current.currentUserId === requestContext.currentUserId &&
      context.current.episodeId === requestContext.episodeId;

    try {
      const rows = await listDispatchesFn({ data: requestContext.episodeId });
      if (isCurrentRequest()) {
        setDispatches(mapDispatchChoices(rows as Array<Record<string, unknown>>));
      }
    } catch (error) {
      if (isCurrentRequest()) {
        setMessage(
          error instanceof Error ? error.message : "No se pudieron actualizar los despachos.",
        );
      }
    }
  }, [listDispatchesFn]);

  const refreshLists = useCallback(
    async (adopt?: PoliceCoordinationView) => {
      const ticket = selectionTicket.current;
      const requestContext = { ...context.current };
      const [rows, noticesResult] = await Promise.all([
        listFn({ data: requestContext.episodeId }),
        noticesFn(),
      ]);
      if (
        !mounted.current ||
        context.current.currentUserId !== requestContext.currentUserId ||
        context.current.episodeId !== requestContext.episodeId
      )
        return;
      setItems(rows as PoliceCoordinationView[]);
      setNotices(noticesResult as typeof notices);
      await refreshDispatchChoices();
      if (
        !mounted.current ||
        context.current.currentUserId !== requestContext.currentUserId ||
        context.current.episodeId !== requestContext.episodeId
      )
        return;
      if (
        adopt &&
        selectedRef.current === adopt.id &&
        !formDirtyRef.current &&
        ticket === selectionTicket.current
      ) {
        setItems((current) => current.map((item) => (item.id === adopt.id ? adopt : item)));
        updateCoordinationForm({
          initiator: adopt.initiator,
          initiatingDispatchId: adopt.initiatingDispatchId ?? "",
          placeType: adopt.placeType,
          meetingReference: adopt.meetingReference ?? "",
          notes: adopt.notes ?? "",
        });
        updateDispatchLinks(adopt.dispatchIds);
        setCoordinationDirtyTracked(false);
        setDispatchesDirtyTracked(false);
      }
    },
    [listFn, noticesFn, refreshDispatchChoices],
  );

  useEffect(() => {
    let live = true;
    mounted.current = true;
    setLoading(true);
    void (async () => {
      try {
        const queue = await loadQueue();
        if (!live || !mounted.current) return;
        const store = queue.createPoliceQueueStore();
        storeRef.current = store;
        const [rows, noticeRows, pending] = await Promise.all([
          listFn({ data: episodeId }),
          noticesFn(),
          store.list(currentUserId, episodeId),
        ]);
        if (
          !live ||
          context.current.currentUserId !== currentUserId ||
          context.current.episodeId !== episodeId
        )
          return;
        setItems(rows as PoliceCoordinationView[]);
        setNotices(noticeRows as typeof notices);
        setQueueEntries(pending);
        setLoading(false);
      } catch (error) {
        if (live) {
          setMessage(error instanceof Error ? error.message : "No se pudo cargar la coordinación.");
          setLoading(false);
        }
      }
    })();
    return () => {
      live = false;
      mounted.current = false;
    };
  }, [currentUserId, episodeId, listFn, noticesFn]);

  useEffect(() => {
    if (!isActive) {
      dispatchChoicesRequestRef.current += 1;
      return;
    }

    void refreshDispatchChoices();
    return () => {
      dispatchChoicesRequestRef.current += 1;
    };
  }, [currentUserId, episodeId, isActive, refreshDispatchChoices]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const onOnline = () => {
      const selected = selectedRef.current;
      for (const entry of entriesRef.current) {
        if (
          (entry.status === "pending" || entry.status === "uncertain") &&
          (entry.kind === "create" ? selected === "" : selected === entry.entityId)
        ) {
          void processEntryRef.current(entry);
          break;
        }
      }
    };
    window.addEventListener("online", onOnline);
    return () => window.removeEventListener("online", onOnline);
  }, []);

  const applyAcknowledgement = (
    coordinationId: string,
    acknowledgement: { coordination: PoliceCoordinationMutation; event?: PoliceEventView | null },
  ) => {
    const raw = acknowledgement.coordination;
    setItems((current) => {
      const existing = current.find((item) => item.id === coordinationId);
      if (!existing)
        return [
          ...current,
          {
            ...raw,
            events: acknowledgement.event ? [acknowledgement.event] : (raw.events ?? []),
            dispatchIds: raw.dispatchIds ?? [],
          } as PoliceCoordinationView,
        ];
      return current.map((item) =>
        item.id === coordinationId ? mergePoliceMutationResult(item, acknowledgement) : item,
      );
    });
  };

  const sendEntry = async (
    entry: import("@/lib/efa-police-coordination.queue").PoliceQueueEntry,
  ) => {
    const payload = entry.payload as Record<string, unknown>;
    switch (entry.kind) {
      case "create":
        return createFn({ data: payload as never });
      case "update":
        return updateFn({ data: payload as never });
      case "dispatches":
        return linksFn({ data: payload as never });
      case "event-create":
        return addEventFn({ data: payload as never });
      case "event-update":
        return updateEventFn({ data: payload as never });
    }
  };

  const processEntry = async (
    entry: import("@/lib/efa-police-coordination.queue").PoliceQueueEntry,
    lockHeld = false,
  ) => {
    if (!storeRef.current || (!lockHeld && busyRef.current)) return;
    if (!lockHeld) {
      busyRef.current = true;
      setBusy(true);
    }
    const expected = {
      ownerUserId: entry.ownerUserId,
      episodeId: entry.episodeId,
      selected: selectedRef.current,
    };
    try {
      const queue = await loadQueue();
      if (
        !mounted.current ||
        context.current.currentUserId !== expected.ownerUserId ||
        context.current.episodeId !== expected.episodeId
      )
        return;
      const result = await queue.dispatchPoliceOperation(
        storeRef.current,
        entry.ownerUserId,
        entry.episodeId,
        entry.entityId,
        entry.operationId,
        async (fresh) => {
          if (
            !mounted.current ||
            !policeQueueContextAllows({
              entry: fresh,
              ownerUserId: context.current.currentUserId,
              episodeId: context.current.episodeId,
              selectedEntityId: selectedRef.current,
              canWrite: context.current.canWrite,
              episodeCanEdit: context.current.episodeCanEdit,
              entityCanEdit: true,
            })
          )
            throw new Error("EFA vigente requerida y coordinación seleccionada.");
          const episode = await getEpisodeFn({ data: fresh.episodeId });
          if (
            !mounted.current ||
            !policeQueueContextAllows({
              entry: fresh,
              ownerUserId: context.current.currentUserId,
              episodeId: context.current.episodeId,
              selectedEntityId: selectedRef.current,
              canWrite: context.current.canWrite,
              episodeCanEdit: Boolean((episode as { canEdit?: boolean }).canEdit),
              entityCanEdit: true,
            })
          )
            throw new Error("El episodio requiere permisos vigentes para editar.");
          const payload = fresh.payload as Record<string, unknown>;
          if (fresh.kind !== "create") {
            const current = await getFn({ data: fresh.entityId });
            if (
              !mounted.current ||
              !policeQueueContextAllows({
                entry: fresh,
                ownerUserId: context.current.currentUserId,
                episodeId: context.current.episodeId,
                selectedEntityId: selectedRef.current,
                canWrite: context.current.canWrite,
                episodeCanEdit: context.current.episodeCanEdit,
                entityCanEdit: (current as PoliceCoordinationView).canEdit,
              })
            )
              throw new Error("No tienes permiso para corregir esta coordinación.");
            if (fresh.kind === "event-update") {
              const eventId = String(payload["eventId"]);
              if (!(current as PoliceCoordinationView).events.some((event) => event.id === eventId))
                throw new Error("No se encontró el evento.");
            }
          }
          return sendEntry(fresh);
        },
        async (fresh) => {
          if (
            !mounted.current ||
            !policeQueueContextAllows({
              entry: fresh,
              ownerUserId: context.current.currentUserId,
              episodeId: context.current.episodeId,
              selectedEntityId: selectedRef.current,
              canWrite: context.current.canWrite,
              episodeCanEdit: context.current.episodeCanEdit,
              entityCanEdit: true,
            })
          )
            return false;
          const episode = await getEpisodeFn({ data: fresh.episodeId });
          if (
            !mounted.current ||
            !policeQueueContextAllows({
              entry: fresh,
              ownerUserId: context.current.currentUserId,
              episodeId: context.current.episodeId,
              selectedEntityId: selectedRef.current,
              canWrite: context.current.canWrite,
              episodeCanEdit: Boolean((episode as { canEdit?: boolean }).canEdit),
              entityCanEdit: true,
            })
          )
            return false;
          if (fresh.kind === "create") return true;
          const current = await getFn({ data: fresh.entityId });
          return (
            mounted.current &&
            policeQueueContextAllows({
              entry: fresh,
              ownerUserId: context.current.currentUserId,
              episodeId: context.current.episodeId,
              selectedEntityId: selectedRef.current,
              canWrite: context.current.canWrite,
              episodeCanEdit: context.current.episodeCanEdit,
              entityCanEdit: (current as PoliceCoordinationView).canEdit,
            })
          );
        },
      );
      if (
        !mounted.current ||
        context.current.currentUserId !== expected.ownerUserId ||
        context.current.episodeId !== expected.episodeId
      )
        return;
      if (result.status === "cleaned") {
        const currentEntries = await storeRef.current
          .list(expected.ownerUserId, expected.episodeId)
          .catch(() => entriesRef.current.filter((item) => item.operationId !== entry.operationId));
        if (
          mounted.current &&
          context.current.currentUserId === expected.ownerUserId &&
          context.current.episodeId === expected.episodeId
        ) {
          const state = completePoliceQueueOutcome(
            {
              ownerUserId: context.current.currentUserId,
              episodeId: context.current.episodeId,
              selectedId: selectedRef.current,
              pendingOperationId: pendingOperationIdRef.current,
              entries: currentEntries,
              coordinationDirty: coordinationDirtyRef.current,
              dispatchesDirty: dispatchesDirtyRef.current,
            },
            { status: "cleaned", entry },
          );
          setQueueEntries(state.entries);
          if (state.pendingOperationId !== pendingOperationIdRef.current)
            setPendingOperationId(state.pendingOperationId);
          if (state.completedCreate) {
            const resolution = resolvePoliceCreateCleanup(
              { kind: entry.kind, payload: entry.payload as Record<string, unknown> },
              items,
            );
            selectionTicket.current++;
            if (resolution.kind === "adopt") {
              const confirmed = resolution.record;
              selectedRef.current = confirmed.id;
              setSelectedId(confirmed.id);
              updateCoordinationForm({
                initiator: confirmed.initiator,
                initiatingDispatchId: confirmed.initiatingDispatchId ?? "",
                placeType: confirmed.placeType,
                meetingReference: confirmed.meetingReference ?? "",
                notes: confirmed.notes ?? "",
              });
              updateDispatchLinks(confirmed.dispatchIds);
              setCoordinationDirtyTracked(false);
              setDispatchesDirtyTracked(false);
              setMessage(
                "La coordinación ya estaba confirmada; se abrió el registro existente sin repetir el alta.",
              );
            } else {
              selectedRef.current = "";
              setSelectedId("");
              updateCoordinationForm(blankForm());
              updateDispatchLinks([]);
              setCoordinationDirtyTracked(false);
              setDispatchesDirtyTracked(false);
              setMessage(
                "La solicitud ya estaba confirmada. Se limpió el formulario para evitar un alta duplicada.",
              );
            }
          } else {
            setMessage("La limpieza local terminó; no se volvió a enviar al servidor.");
          }
        }
      } else if (result.status === "confirmed" || result.status === "confirmed-cleanup-failed") {
        const acknowledgement = result.result as {
          coordination: PoliceCoordinationMutation;
          event?: PoliceEventView | null;
        };
        const raw = acknowledgement.coordination;
        applyAcknowledgement(raw.id, acknowledgement);
        const nextDirty = acknowledgePoliceCoordinationSave(
          {
            coordination: coordinationDirtyRef.current,
            dispatches: dispatchesDirtyRef.current,
          },
          entry,
          { form: coordinationFormRef.current, dispatchIds: dispatchIdsRef.current },
        );
        if (entry.kind === "create" && selectedRef.current === "") {
          selectionTicket.current++;
          selectedRef.current = raw.id;
          setSelectedId(raw.id);
          if (!nextDirty.coordination) {
            const savedForm = {
              initiator: raw.initiator,
              initiatingDispatchId: raw.initiatingDispatchId ?? "",
              placeType: raw.placeType,
              meetingReference: raw.meetingReference ?? "",
              notes: raw.notes ?? "",
            };
            coordinationFormRef.current = savedForm;
            updateCoordinationForm(savedForm);
          }
          if (!nextDirty.dispatches) {
            const savedLinks = raw.dispatchIds ?? [];
            dispatchIdsRef.current = savedLinks;
            updateDispatchLinks(savedLinks);
          }
          setCoordinationDirtyTracked(nextDirty.coordination);
          setDispatchesDirtyTracked(nextDirty.dispatches);
        } else if (
          (entry.kind === "update" || entry.kind === "dispatches") &&
          selectedRef.current === raw.id
        ) {
          setCoordinationDirtyTracked(nextDirty.coordination);
          setDispatchesDirtyTracked(nextDirty.dispatches);
        } else if (entry.kind === "event-create" && selectedRef.current === raw.id) {
          setEventForm(blankEvent());
        } else if (entry.kind === "event-update" && selectedRef.current === raw.id) {
          const eventId = String((entry.payload as Record<string, unknown>)["eventId"]);
          setDirtyEventId("");
          setEventEdits((value) => {
            const next = { ...value };
            delete next[eventId];
            return next;
          });
        }
        if (pendingOperationIdRef.current === entry.operationId) setPendingOperationId("");
        setMessage(
          `${result.status === "confirmed" ? "Cambios confirmados." : "Cambios confirmados; la limpieza local quedó pendiente."}${nextDirty.coordination || nextDirty.dispatches ? " Los demás cambios siguen sin guardar." : ""}`,
        );
        const currentEntries = await storeRef.current
          .list(expected.ownerUserId, expected.episodeId)
          .catch(() => []);
        if (
          mounted.current &&
          context.current.currentUserId === expected.ownerUserId &&
          context.current.episodeId === expected.episodeId
        )
          setQueueEntries(currentEntries);
        try {
          await refreshLists();
        } catch {
          setMessage(
            `Cambios confirmados. No se pudo actualizar la lista; vuelve a cargarla cuando tengas conexión.${nextDirty.coordination || nextDirty.dispatches ? " Los demás cambios siguen sin guardar." : ""}`,
          );
        }
      } else if (result.status === "paused") {
        setMessage(result.error);
        if (
          result.queueStatus === "paused-conflict" ||
          result.queueStatus === "paused-permission"
        ) {
          const remote =
            entry.kind === "create"
              ? null
              : ((await getFn({ data: entry.entityId }).catch(
                  () => null,
                )) as PoliceCoordinationView | null);
          if (
            mounted.current &&
            context.current.currentUserId === expected.ownerUserId &&
            context.current.episodeId === expected.episodeId &&
            (entry.kind === "create" || selectedRef.current === entry.entityId)
          ) {
            const latest = await storeRef.current
              .list(expected.ownerUserId, expected.episodeId)
              .catch(() => []);
            if (
              !mounted.current ||
              context.current.currentUserId !== expected.ownerUserId ||
              context.current.episodeId !== expected.episodeId
            )
              return;
            setQueueEntries(latest);
            setConflict({
              operationId: entry.operationId,
              entry: { ...entry, status: result.queueStatus },
              remote,
            });
          }
        }
      } else if (result.status === "cancelled") {
        const latest = await storeRef.current
          .list(expected.ownerUserId, expected.episodeId)
          .catch(() => []);
        if (
          mounted.current &&
          context.current.currentUserId === expected.ownerUserId &&
          context.current.episodeId === expected.episodeId
        ) {
          setQueueEntries(latest);
          setMessage("La operación quedó pausada porque ya no hay permisos vigentes para editar.");
        }
      } else if (result.status === "stored") setMessage(result.error);
    } catch (error) {
      if (
        mounted.current &&
        context.current.currentUserId === expected.ownerUserId &&
        context.current.episodeId === expected.episodeId
      )
        setMessage(
          error instanceof Error ? error.message : "La operación quedó pendiente de confirmación.",
        );
    } finally {
      if (!lockHeld) {
        busyRef.current = false;
        if (
          mounted.current &&
          context.current.currentUserId === expected.ownerUserId &&
          context.current.episodeId === expected.episodeId
        )
          setBusy(false);
      }
    }
  };
  processEntryRef.current = processEntry;

  const submit = async (
    kind: import("@/lib/efa-police-coordination.queue").PoliceQueueKind,
    entityId: string,
    payload: Record<string, unknown>,
    opId = nextId(),
  ) => {
    if (!writeAllowed || busyRef.current || !storeRef.current) return;
    busyRef.current = true;
    setBusy(true);
    setPendingOperationId(opId);
    let frozenEntry: import("@/lib/efa-police-coordination.queue").PoliceQueueEntry | null = null;
    try {
      const queue = await loadQueue();
      const entry: import("@/lib/efa-police-coordination.queue").PoliceQueueEntry = {
        ownerUserId: currentUserId,
        episodeId,
        entityId,
        operationId: opId,
        kind,
        payload: Object.freeze({ ...payload, operationId: opId }),
        status: "pending",
        createdAt: new Date().toISOString(),
      };
      frozenEntry = entry;
      await queue.persistPoliceOperation(storeRef.current, entry);
      setUnpersisted(null);
      const entries = await storeRef.current.list(currentUserId, episodeId);
      if (
        !mounted.current ||
        context.current.currentUserId !== currentUserId ||
        context.current.episodeId !== episodeId
      )
        return;
      setQueueEntries(entries);
      await processEntry(entry, true);
    } catch (error) {
      if (
        mounted.current &&
        context.current.currentUserId === currentUserId &&
        context.current.episodeId === episodeId
      ) {
        if (frozenEntry) setUnpersisted(frozenEntry);
        setMessage(
          `La operación no se guardó localmente; conserva el formulario y reintenta con la misma identidad. ${error instanceof Error ? error.message : ""}`,
        );
      }
    } finally {
      busyRef.current = false;
      if (
        mounted.current &&
        context.current.currentUserId === currentUserId &&
        context.current.episodeId === episodeId
      )
        setBusy(false);
    }
  };

  const selectCoordination = async (id: string) => {
    const ticket = ++selectionTicket.current;
    selectedRef.current = id;
    setSelectedId(id);
    setConflict(null);
    setCoordinationDirtyTracked(false);
    setDispatchesDirtyTracked(false);
    setDirtyEventId("");
    setAuditRows([]);
    setEventEdits({});
    if (!id) {
      updateCoordinationForm(blankForm());
      updateDispatchLinks([]);
      return;
    }
    try {
      const current = (await getFn({ data: id })) as PoliceCoordinationView;
      if (!mounted.current || ticket !== selectionTicket.current || selectedRef.current !== id)
        return;
      setItems((rows) => rows.map((row) => (row.id === id ? current : row)));
      updateCoordinationForm({
        initiator: current.initiator,
        initiatingDispatchId: current.initiatingDispatchId ?? "",
        placeType: current.placeType,
        meetingReference: current.meetingReference ?? "",
        notes: current.notes ?? "",
      });
      updateDispatchLinks(current.dispatchIds);
    } catch (error) {
      if (ticket === selectionTicket.current)
        setMessage(error instanceof Error ? error.message : "No se pudo abrir la coordinación.");
    }
  };

  const beginCreate = () => {
    selectionTicket.current++;
    setActiveStep(0);
    selectedRef.current = "";
    setSelectedId("");
    updateCoordinationForm(blankForm());
    updateDispatchLinks([]);
    setCoordinationDirtyTracked(false);
    setDispatchesDirtyTracked(false);
    setConflict(null);
    setAuditRows([]);
    setEventEdits({});
    setDirtyEventId("");
  };
  const discardCoordinationChanges = () => {
    if (!current) {
      updateCoordinationForm(blankForm());
      setCoordinationDirtyTracked(false);
      return;
    }
    const savedForm = {
      initiator: current.initiator,
      initiatingDispatchId: current.initiatingDispatchId ?? "",
      placeType: current.placeType,
      meetingReference: current.meetingReference ?? "",
      notes: current.notes ?? "",
    };
    coordinationFormRef.current = savedForm;
    updateCoordinationForm(savedForm);
    setCoordinationDirtyTracked(false);
  };
  const discardDispatchChanges = () => {
    if (!current) {
      updateDispatchLinks([]);
      setDispatchesDirtyTracked(false);
      return;
    }
    dispatchIdsRef.current = current.dispatchIds;
    updateDispatchLinks(current.dispatchIds);
    setDispatchesDirtyTracked(false);
  };
  const saveCoordination = () => {
    if (!writeAllowed || busy || pendingOperationId || !coordinationDirty) return;
    const current = items.find((item) => item.id === selectedId);
    if (!current) {
      const clientCreationKey = nextId();
      void submit("create", `create:${clientCreationKey}`, {
        episodeId,
        clientCreationKey,
        operationId: "",
        initiator: form.initiator,
        initiatingDispatchId: form.initiatingDispatchId || null,
        placeType: form.placeType,
        meetingReference: form.meetingReference || null,
        notes: form.notes || null,
        dispatchIds: links,
      });
      return;
    }
    void submit("update", current.id, {
      coordinationId: current.id,
      expectedVersion: current.version,
      operationId: "",
      initiator: form.initiator,
      initiatingDispatchId: form.initiatingDispatchId || null,
      placeType: form.placeType,
      meetingReference: form.meetingReference || null,
      notes: form.notes || null,
    });
  };
  const saveLinks = () => {
    const current = items.find((item) => item.id === selectedId);
    if (!current || !writeAllowed || !dispatchesDirty) return;
    void submit("dispatches", current.id, {
      coordinationId: current.id,
      expectedVersion: current.version,
      operationId: "",
      dispatchIds: links,
    });
  };
  const addEvent = () => {
    const current = items.find((item) => item.id === selectedId);
    if (!current || !writeAllowed || !current.canEdit || busy) return;
    if (
      policeEventRequiresDispatch(eventForm.kind)
        ? !eventForm.dispatchId || !current.dispatchIds.includes(eventForm.dispatchId)
        : Boolean(eventForm.dispatchId)
    ) {
      setMessage(
        "Los eventos compartidos no llevan despacho; llegada, espera y encuentro requieren un despacho asociado.",
      );
      return;
    }
    void submit("event-create", current.id, {
      coordinationId: current.id,
      expectedVersion: current.version,
      operationId: "",
      clientEventId: nextId(),
      kind: eventForm.kind,
      ...(eventForm.dispatchId ? { dispatchId: eventForm.dispatchId } : {}),
      occurredAt: inputTimeIso(eventForm.occurredAt),
      timeStatus: eventForm.timeStatus,
      note: eventForm.note || null,
    });
  };
  const saveEvent = (event: PoliceEventView) => {
    const current = items.find((item) => item.id === selectedId);
    const edited = eventEdits[event.id];
    if (!current || !edited || !writeAllowed || !current.canEdit || busy) return;
    if (
      policeEventRequiresDispatch(edited.kind)
        ? !edited.dispatchId || !current.dispatchIds.includes(edited.dispatchId)
        : Boolean(edited.dispatchId)
    ) {
      setMessage(
        "Los eventos compartidos no llevan despacho; llegada, espera y encuentro requieren un despacho asociado.",
      );
      return;
    }
    void submit("event-update", current.id, {
      coordinationId: current.id,
      eventId: event.id,
      expectedVersion: event.version,
      expectedCoordinationVersion: current.version,
      operationId: "",
      kind: edited.kind,
      dispatchId: edited.dispatchId || null,
      ...(edited.occurredAt ? { occurredAt: inputTimeIso(edited.occurredAt) } : {}),
      timeStatus: edited.timeStatus,
      note: edited.note || null,
    });
  };

  const retryUnpersisted = async () => {
    if (!unpersisted || !storeRef.current || busyRef.current || !writeAllowed) return;
    busyRef.current = true;
    setBusy(true);
    try {
      const queue = await loadQueue();
      if (
        !mounted.current ||
        context.current.currentUserId !== unpersisted.ownerUserId ||
        context.current.episodeId !== unpersisted.episodeId
      )
        return;
      await queue.persistPoliceOperation(storeRef.current, unpersisted);
      const latest = await storeRef.current.list(unpersisted.ownerUserId, unpersisted.episodeId);
      if (
        !mounted.current ||
        context.current.currentUserId !== unpersisted.ownerUserId ||
        context.current.episodeId !== unpersisted.episodeId
      )
        return;
      setQueueEntries(latest);
      setUnpersisted(null);
      await processEntry(unpersisted, true);
    } catch (error) {
      if (
        mounted.current &&
        context.current.currentUserId === unpersisted.ownerUserId &&
        context.current.episodeId === unpersisted.episodeId
      )
        setMessage(
          `No se pudo guardar localmente. La misma operación sigue disponible para reintentar. ${error instanceof Error ? error.message : ""}`,
        );
    } finally {
      busyRef.current = false;
      if (
        mounted.current &&
        context.current.currentUserId === unpersisted.ownerUserId &&
        context.current.episodeId === unpersisted.episodeId
      )
        setBusy(false);
    }
  };

  const restoreEntry = async (
    entry: import("@/lib/efa-police-coordination.queue").PoliceQueueEntry,
  ) => {
    const payload = entry.payload as Record<string, unknown>;
    if (entry.ownerUserId !== currentUserId || entry.episodeId !== episodeId) return;
    if (entry.kind === "create") {
      selectedRef.current = "";
      setSelectedId("");
      updateCoordinationForm({
        initiator: payload["initiator"] as CoordinationForm["initiator"],
        initiatingDispatchId: String(payload["initiatingDispatchId"] ?? ""),
        placeType: payload["placeType"] as CoordinationForm["placeType"],
        meetingReference: String(payload["meetingReference"] ?? ""),
        notes: String(payload["notes"] ?? ""),
      });
      updateDispatchLinks((payload["dispatchIds"] as string[] | undefined) ?? []);
      setActiveStep(0);
    } else {
      const ticket = ++selectionTicket.current;
      selectedRef.current = entry.entityId;
      setSelectedId(entry.entityId);
      try {
        const remote = (await getFn({ data: entry.entityId })) as PoliceCoordinationView;
        if (
          !mounted.current ||
          context.current.currentUserId !== entry.ownerUserId ||
          context.current.episodeId !== entry.episodeId ||
          selectedRef.current !== entry.entityId ||
          ticket !== selectionTicket.current
        )
          return;
        setItems((rows) => rows.map((row) => (row.id === remote.id ? remote : row)));
        updateCoordinationForm({
          initiator: remote.initiator,
          initiatingDispatchId: remote.initiatingDispatchId ?? "",
          placeType: remote.placeType,
          meetingReference: remote.meetingReference ?? "",
          notes: remote.notes ?? "",
        });
        updateDispatchLinks(remote.dispatchIds);
        if (entry.kind === "update") {
          updateCoordinationForm({
            initiator: payload["initiator"] as CoordinationForm["initiator"],
            initiatingDispatchId: String(payload["initiatingDispatchId"] ?? ""),
            placeType: payload["placeType"] as CoordinationForm["placeType"],
            meetingReference: String(payload["meetingReference"] ?? ""),
            notes: String(payload["notes"] ?? ""),
          });
          setActiveStep(0);
        } else if (entry.kind === "dispatches") {
          updateDispatchLinks(
            (payload["dispatchIds"] as string[] | undefined) ?? remote.dispatchIds,
          );
          setActiveStep(1);
        } else if (entry.kind === "event-create") {
          setEventForm(restorePoliceEventDraft(payload));
          setActiveStep(2);
        }
        if (entry.kind === "event-update") {
          const event = remote.events.find((item) => item.id === payload["eventId"]);
          if (event) {
            setEventEdits((items) => ({ ...items, [event.id]: restorePoliceEventDraft(payload) }));
            setDirtyEventId(event.id);
            setActiveStep(2);
          }
        }
        if (entry.status === "paused-conflict" || entry.status === "paused-permission")
          setConflict({ operationId: entry.operationId, entry, remote });
      } catch (error) {
        setMessage(
          error instanceof Error ? error.message : "No se pudo recuperar el registro pendiente.",
        );
        return;
      }
    }
    setPendingOperationId(entry.operationId);
    setCoordinationDirtyTracked(false);
    setDispatchesDirtyTracked(false);
    setMessage(
      "Se restauró la solicitud exacta; sus campos quedan bloqueados hasta confirmar o resolverla.",
    );
  };

  const rebaseConflict = async () => {
    if (
      !conflict ||
      !conflict.remote ||
      !writeAllowed ||
      busyRef.current ||
      selectedRef.current !== conflict.remote.id
    )
      return;
    const previous = conflict.entry;
    const payload = { ...(previous.payload as Record<string, unknown>) };
    const nextId = crypto.randomUUID();
    if (previous.kind === "event-update") {
      const remoteEvent = conflict.remote.events.find((event) => event.id === payload["eventId"]);
      if (!remoteEvent) {
        setMessage("El evento ya no está disponible; conserva la solicitud para revisión.");
        return;
      }
      payload["expectedVersion"] = remoteEvent.version;
      payload["expectedCoordinationVersion"] = conflict.remote.version;
    } else {
      payload["expectedVersion"] = conflict.remote.version;
      if (previous.kind === "event-create") payload["expectedVersion"] = conflict.remote.version;
    }
    payload["operationId"] = nextId;
    const rebased = {
      ...previous,
      operationId: nextId,
      payload: Object.freeze(payload),
      status: "pending" as const,
      createdAt: new Date().toISOString(),
    };
    if (!storeRef.current) return;
    setBusy(true);
    busyRef.current = true;
    try {
      const queue = await loadQueue();
      if (
        !mounted.current ||
        context.current.currentUserId !== previous.ownerUserId ||
        context.current.episodeId !== previous.episodeId ||
        selectedRef.current !== conflict.remote.id ||
        !context.current.canWrite ||
        !context.current.episodeCanEdit
      )
        return;
      await queue.persistPoliceOperation(storeRef.current, rebased);
      if (
        !mounted.current ||
        context.current.currentUserId !== previous.ownerUserId ||
        context.current.episodeId !== previous.episodeId ||
        selectedRef.current !== conflict.remote.id
      )
        return;
      await storeRef.current.remove(
        previous.ownerUserId,
        previous.episodeId,
        previous.entityId,
        previous.operationId,
      );
      const rows = await storeRef.current.list(previous.ownerUserId, previous.episodeId);
      if (!mounted.current || selectedRef.current !== conflict.remote.id) return;
      setQueueEntries(rows);
      setConflict(null);
      setPendingOperationId(nextId);
      await processEntry(rebased, true);
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : "No se pudo preparar la corrección local.",
      );
    } finally {
      busyRef.current = false;
      if (mounted.current) setBusy(false);
    }
  };

  const current = items.find((item) => item.id === selectedId) ?? null;
  const pending = queueEntries;

  return (
    <Card className="min-w-0 border-0 bg-transparent p-0 shadow-none">
      <CardHeader className="space-y-2 p-0 pb-1">
        <CardTitle>Apoyo policial</CardTitle>
        <p className="text-sm text-muted-foreground">
          {canWrite ? "Acceso EFA vigente" : "Solo lectura"}
        </p>
        <p className="text-sm text-muted-foreground">
          Puede iniciar una coordinación antes de registrar una llamada o un despacho. Más adelante
          podrá asociar los despachos de este episodio, incluso si siguen como borrador.
        </p>
      </CardHeader>
      <CardContent
        className="min-w-0 space-y-3 p-0"
        role="region"
        aria-label={"Apoyo policial del episodio " + episodeLabel}
      >
        {loading && <p className="text-sm text-muted-foreground">Cargando coordinación…</p>}
        {!loading && (
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              variant={selectedId ? "outline" : "secondary"}
              className="min-h-11"
              disabled={!writeAllowed || busy || dirty || Boolean(pendingOperationId)}
              onClick={beginCreate}
            >
              Nueva coordinación
            </Button>
            {items.map((item) => (
              <Button
                type="button"
                key={item.id}
                variant={selectedId === item.id ? "secondary" : "outline"}
                className="min-h-11"
                disabled={busy || dirty || Boolean(pendingOperationId)}
                onClick={() => void selectCoordination(item.id)}
              >
                {item.placeType === "incident" ? "Incidente" : "Punto de encuentro"} · v
                {item.version}
              </Button>
            ))}
            {items.length === 0 && (
              <p className="text-sm text-muted-foreground">Sin coordinaciones registradas.</p>
            )}
          </div>
        )}
        {unpersisted && (
          <section className="space-y-2 rounded-md border border-destructive p-3">
            <p className="text-sm">
              La solicitud no pudo guardarse en el dispositivo. Se conserva el mismo identificador y
              contenido; no inicies una operación nueva.
            </p>
            <Button
              type="button"
              className="min-h-11"
              disabled={busy || !writeAllowed}
              onClick={() => void retryUnpersisted()}
            >
              Reintentar guardado y envío
            </Button>
          </section>
        )}
        {pending.length > 0 && (
          <section className="space-y-2 rounded-md border p-3" aria-label="Operaciones pendientes">
            <h3 className="font-medium">Operaciones pendientes en este dispositivo</h3>
            <p className="text-sm text-muted-foreground">
              Solo se guarda aquí el contenido enviado. El almacenamiento local puede borrarse o
              compartirse con este dispositivo.
            </p>
            {pending.map((entry) => (
              <div
                key={entry.operationId}
                className="flex flex-wrap items-center justify-between gap-2 text-sm"
              >
                <span>
                  {entry.kind} · {entry.status}
                </span>
                <div className="flex gap-2">
                  <Button
                    type="button"
                    className="min-h-11"
                    variant="outline"
                    disabled={busy}
                    onClick={() => void restoreEntry(entry)}
                  >
                    Restaurar formulario
                  </Button>
                  <Button
                    type="button"
                    className="min-h-11"
                    variant="outline"
                    disabled={
                      busy ||
                      (entry.status !== "confirmed-cleanup-failed" && !writeAllowed) ||
                      (entry.kind !== "create" && selectedId !== entry.entityId)
                    }
                    onClick={() => void processEntry(entry)}
                  >
                    {entry.status === "confirmed-cleanup-failed"
                      ? "Limpiar recibo confirmado"
                      : "Reintentar esta operación"}
                  </Button>
                </div>
              </div>
            ))}
          </section>
        )}
        {selectedId === "" && activeStep > 0 && (
          <section className="min-w-0 space-y-2 border-t pt-3">
            <p className="text-sm text-muted-foreground">
              Guarda primero la coordinación para asociar despachos y registrar eventos.
            </p>
            <Button
              type="button"
              variant="outline"
              className="min-h-11"
              onClick={() => setActiveStep(0)}
            >
              Volver a Datos
            </Button>
            <CoordinationStepNavigation activeStep={activeStep} onStepChange={setActiveStep} />
          </section>
        )}
        {message && activeStep === 2 && !current && (
          <p role="status" className="bg-muted p-2 text-sm" aria-live="polite">
            {message}
          </p>
        )}
        {(selectedId === "" || current) &&
        activeStep === 0 &&
        (selectedId === "" ? writeAllowed : current?.canEdit && writeAllowed) ? (
          <section className="min-w-0 space-y-3">
            <h3
              ref={(node) => {
                activeStepTargetRef.current = node;
              }}
              tabIndex={-1}
              className="scroll-mt-20 font-medium outline-none"
            >
              {current ? "Editar coordinación" : "Nueva coordinación"}
            </h3>
            <fieldset disabled={busy || Boolean(pendingOperationId)} className="space-y-4">
              <div className="grid min-w-0 grid-cols-1 gap-3 min-[380px]:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="police-initiator">Iniciador</Label>
                  <select
                    id="police-initiator"
                    className="min-h-11 w-full min-w-0 max-w-full rounded-md border bg-background px-3"
                    value={form.initiator}
                    onChange={(e) => {
                      const next = {
                        ...form,
                        initiator: e.target.value as CoordinationForm["initiator"],
                      };
                      coordinationFormRef.current = next;
                      setForm(next);
                      setCoordinationDirtyTracked(true);
                    }}
                  >
                    <option value="central">Central</option>
                    <option value="ambulance">Ambulancia</option>
                  </select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="police-place">Lugar</Label>
                  <select
                    id="police-place"
                    className="min-h-11 w-full min-w-0 max-w-full rounded-md border bg-background px-3"
                    value={form.placeType}
                    onChange={(e) => {
                      const next = {
                        ...form,
                        placeType: e.target.value as CoordinationForm["placeType"],
                      };
                      coordinationFormRef.current = next;
                      setForm(next);
                      setCoordinationDirtyTracked(true);
                    }}
                  >
                    <option value="incident">Incidente</option>
                    <option value="meeting_point">Punto de encuentro</option>
                  </select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="police-start-dispatch">Despacho iniciador (opcional)</Label>
                  <select
                    id="police-start-dispatch"
                    className="min-h-11 w-full min-w-0 max-w-full rounded-md border bg-background px-3"
                    value={form.initiatingDispatchId}
                    onChange={(e) => {
                      const next = { ...form, initiatingDispatchId: e.target.value };
                      coordinationFormRef.current = next;
                      setForm(next);
                      setCoordinationDirtyTracked(true);
                    }}
                  >
                    <option value="">Sin despacho</option>
                    {dispatches
                      .filter((dispatch) => !current || current.dispatchIds.includes(dispatch.id))
                      .map((dispatch) => (
                        <option value={dispatch.id} key={dispatch.id}>
                          {dispatchChoiceLabel(dispatch)}
                        </option>
                      ))}
                  </select>
                </div>
              </div>
              <details className="min-w-0">
                <summary className="min-h-11 cursor-pointer py-2 font-medium">
                  Referencia y notas opcionales
                </summary>
                <div className="mt-2 grid min-w-0 gap-3">
                  <div className="space-y-2">
                    <Label htmlFor="police-reference">Referencia privada</Label>
                    <Input
                      id="police-reference"
                      className="min-h-11 min-w-0 max-w-full"
                      value={form.meetingReference}
                      maxLength={500}
                      onChange={(e) => {
                        const next = { ...form, meetingReference: e.target.value };
                        coordinationFormRef.current = next;
                        setForm(next);
                        setCoordinationDirtyTracked(true);
                      }}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="police-notes">Notas privadas</Label>
                    <Textarea
                      id="police-notes"
                      value={form.notes}
                      maxLength={2000}
                      onChange={(e) => {
                        const next = { ...form, notes: e.target.value };
                        coordinationFormRef.current = next;
                        setForm(next);
                        setCoordinationDirtyTracked(true);
                      }}
                    />
                  </div>
                </div>
              </details>
              <div className="flex flex-wrap gap-2">
                <Button
                  type="button"
                  className="min-h-11"
                  disabled={!coordinationDirty || busy || Boolean(pendingOperationId)}
                  onClick={saveCoordination}
                >
                  {current ? "Guardar cambios" : "Guardar coordinación"}
                </Button>
                {coordinationDirty && (
                  <Button
                    type="button"
                    variant="outline"
                    className="min-h-11"
                    disabled={busy || Boolean(pendingOperationId)}
                    onClick={discardCoordinationChanges}
                  >
                    Descartar cambios
                  </Button>
                )}
              </div>
            </fieldset>
            <CoordinationStepNavigation activeStep={activeStep} onStepChange={setActiveStep} />
          </section>
        ) : null}
        {!current && activeStep > 0 && (
          <section className="min-w-0 space-y-2 rounded-md border p-3">
            <p
              ref={(node) => {
                activeStepTargetRef.current = node;
              }}
              tabIndex={-1}
              className="scroll-mt-20 text-sm outline-none"
            >
              {selectedId
                ? "La coordinación seleccionada no está disponible."
                : writeAllowed
                  ? "Guarda la coordinación en Datos para habilitar despachos y eventos."
                  : "No hay una coordinación guardada; se requieren permisos vigentes para crearla."}
            </p>
            <Button
              type="button"
              variant="outline"
              className="min-h-11"
              onClick={() => setActiveStep(0)}
            >
              Volver a Datos
            </Button>
          </section>
        )}
        {activeStep === 0 &&
          (selectedId === "" || current) &&
          (!writeAllowed || Boolean(current && !current.canEdit)) && (
            <CoordinationStepNavigation activeStep={activeStep} onStepChange={setActiveStep} />
          )}
        {message && activeStep === 0 && (
          <p role="status" className="bg-muted p-2 text-sm" aria-live="polite">
            {message}
          </p>
        )}
        {current && activeStep === 1 && (
          <section className="min-w-0 space-y-3 border-t pt-3">
            <fieldset disabled={busy || Boolean(pendingOperationId)} className="min-w-0 space-y-2">
              <legend
                ref={(node) => {
                  activeStepTargetRef.current = node;
                }}
                tabIndex={-1}
                className="scroll-mt-20 font-medium outline-none"
              >
                Despachos asociados
              </legend>
              <p className="text-sm text-muted-foreground">
                La coordinación guardada permite asociar los despachos de este episodio.
              </p>
              {dispatches.length === 0 && (
                <p className="text-sm text-muted-foreground">
                  No hay despachos registrados para este episodio.
                </p>
              )}
              {dispatches.map((dispatch) => (
                <label key={dispatch.id} className="flex min-h-11 min-w-0 items-center gap-3">
                  <input
                    type="checkbox"
                    checked={links.includes(dispatch.id)}
                    onChange={(e) => {
                      updateDispatchLinks((values) => {
                        const next = e.target.checked
                          ? [...values, dispatch.id]
                          : values.filter((id) => id !== dispatch.id);
                        dispatchIdsRef.current = next;
                        return next;
                      });
                      setDispatchesDirtyTracked(true);
                    }}
                  />
                  <span className="min-w-0 break-words">{dispatchChoiceLabel(dispatch)}</span>
                </label>
              ))}
            </fieldset>
            <Button
              type="button"
              variant="outline"
              className="min-h-11"
              disabled={!dispatchesDirty || busy || !current.canEdit || !writeAllowed}
              onClick={saveLinks}
            >
              Guardar asociaciones
            </Button>
            {dispatchesDirty && (
              <Button
                type="button"
                variant="outline"
                className="min-h-11"
                disabled={busy}
                onClick={discardDispatchChanges}
              >
                Descartar cambios de asociación
              </Button>
            )}
            <CoordinationStepNavigation activeStep={activeStep} onStepChange={setActiveStep} />
          </section>
        )}
        {message && activeStep === 1 && (
          <p role="status" className="bg-muted p-2 text-sm" aria-live="polite">
            {message}
          </p>
        )}
        {current && activeStep === 2 && (
          <>
            <section className="min-w-0 space-y-3 border-t pt-3">
              <h3
                ref={(node) => {
                  activeStepTargetRef.current = node;
                }}
                tabIndex={-1}
                className="scroll-mt-20 font-medium outline-none"
              >
                Registrar evento de coordinación
              </h3>
              <p className="text-sm text-muted-foreground">
                Los eventos por despacho requieren asociarlo primero en el paso Despachos.
              </p>
              {!current.canEdit || !writeAllowed ? (
                <p className="text-sm text-muted-foreground">
                  Solo lectura. La asociación de respuesta requiere permisos vigentes.
                </p>
              ) : (
                <fieldset
                  disabled={busy || Boolean(pendingOperationId)}
                  className="grid min-w-0 grid-cols-1 gap-3 min-[380px]:grid-cols-2"
                >
                  <div className="min-w-0 space-y-2">
                    <Label htmlFor="police-event-kind">Evento compartido o por despacho</Label>
                    <select
                      id="police-event-kind"
                      className="min-h-11 w-full min-w-0 max-w-full rounded-md border bg-background px-3"
                      value={eventForm.kind}
                      onChange={(e) => {
                        const kind = e.target.value as PoliceEventKind;
                        setEventForm({
                          ...eventForm,
                          kind,
                          dispatchId:
                            kind === "request" || kind === "response" || kind === "reiteration"
                              ? ""
                              : eventForm.dispatchId,
                        });
                      }}
                    >
                      {eventKinds.map((kind) => (
                        <option key={kind} value={kind}>
                          {eventLabel(kind)}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="min-w-0 space-y-2">
                    <Label htmlFor="police-event-dispatch">
                      Despacho (solo para llegada, espera o encuentro)
                    </Label>
                    <select
                      id="police-event-dispatch"
                      className="min-h-11 w-full min-w-0 max-w-full rounded-md border bg-background px-3"
                      value={eventForm.dispatchId}
                      onChange={(e) => setEventForm({ ...eventForm, dispatchId: e.target.value })}
                    >
                      <option value="">Evento compartido</option>
                      {dispatches
                        .filter((item) => current.dispatchIds.includes(item.id))
                        .map((item) => (
                          <option key={item.id} value={item.id}>
                            {item.baseName}
                          </option>
                        ))}
                    </select>
                  </div>
                  <div className="min-w-0 space-y-2 min-[380px]:col-span-2">
                    <div className="flex min-w-0 flex-col gap-2 min-[380px]:flex-row min-[380px]:items-end">
                      <div className="min-w-0 flex-1 space-y-2">
                        <Label htmlFor="police-event-time">
                          Hora local observada del dispositivo (opcional)
                        </Label>
                        <Input
                          id="police-event-time"
                          type="datetime-local"
                          step="0.001"
                          className="min-h-11 min-w-0 max-w-full"
                          value={eventForm.occurredAt}
                          onChange={(e) =>
                            setEventForm({
                              ...eventForm,
                              occurredAt: e.target.value,
                              timeStatus: e.target.value ? "observed" : "not_observed",
                            })
                          }
                        />
                      </div>
                      <Button
                        type="button"
                        className="min-h-11 min-w-0 self-start whitespace-normal min-[380px]:shrink-0"
                        onClick={() => {
                          if (
                            policeEventRequiresDispatch(eventForm.kind)
                              ? !eventForm.dispatchId ||
                                !current.dispatchIds.includes(eventForm.dispatchId)
                              : Boolean(eventForm.dispatchId)
                          ) {
                            setMessage(
                              "Los eventos compartidos no llevan despacho; los eventos por móvil requieren un despacho asociado.",
                            );
                            return;
                          }
                          const captured = capturePoliceNow();
                          setEventForm((value) => ({
                            ...value,
                            occurredAt: localTimeInput(captured),
                            timeStatus: "observed",
                          }));
                          void submit("event-create", current.id, {
                            coordinationId: current.id,
                            expectedVersion: current.version,
                            clientEventId: nextId(),
                            kind: eventForm.kind,
                            ...(eventForm.dispatchId ? { dispatchId: eventForm.dispatchId } : {}),
                            occurredAt: captured,
                            timeStatus: "observed",
                            note: eventForm.note || null,
                          });
                        }}
                      >
                        Ahora y guardar
                      </Button>
                    </div>
                  </div>
                  <div className="min-w-0 space-y-2">
                    <Label htmlFor="police-event-status">Estado de la hora</Label>
                    <select
                      id="police-event-status"
                      className="min-h-11 w-full min-w-0 max-w-full rounded-md border bg-background px-3"
                      value={eventForm.timeStatus}
                      onChange={(e) => {
                        const timeStatus = e.target.value as PoliceTimeStatus;
                        setEventForm({
                          ...eventForm,
                          timeStatus,
                          occurredAt: timeStatus === "observed" ? eventForm.occurredAt : "",
                        });
                      }}
                    >
                      {timeStatuses.map((status) => (
                        <option
                          key={status}
                          value={status}
                          disabled={status === "observed" && !eventForm.occurredAt}
                        >
                          {timeStatusLabel(status)}
                        </option>
                      ))}
                    </select>
                  </div>
                  <details className="min-w-0 min-[380px]:col-span-2">
                    <summary className="min-h-11 cursor-pointer py-2 font-medium">
                      Nota breve opcional
                    </summary>
                    <div className="mt-2 space-y-2">
                      <Label htmlFor="police-event-note">Nota del evento</Label>
                      <Textarea
                        id="police-event-note"
                        maxLength={2000}
                        value={eventForm.note}
                        onChange={(e) => setEventForm({ ...eventForm, note: e.target.value })}
                      />
                    </div>
                  </details>
                  <div className="flex min-w-0 flex-wrap gap-2 min-[380px]:col-span-2">
                    <Button
                      type="button"
                      variant="outline"
                      className="min-h-11 min-w-0 whitespace-normal"
                      onClick={addEvent}
                    >
                      Guardar hora manual
                    </Button>
                  </div>
                </fieldset>
              )}
            </section>
            <CoordinationStepNavigation activeStep={activeStep} onStepChange={setActiveStep} />
            {message && (
              <p role="status" className="bg-muted p-2 text-sm" aria-live="polite">
                {message}
              </p>
            )}
            <section className="space-y-3">
              <h3 className="font-medium">Eventos registrados</h3>
              {current.events.map((event) => {
                const edited = eventEdits[event.id] ?? {
                  kind: event.kind,
                  dispatchId: event.dispatchId ?? "",
                  occurredAt: "",
                  timeStatus: event.timeStatus,
                  note: event.note ?? "",
                };
                return (
                  <article className="min-w-0 space-y-2 border-t py-2" key={event.id}>
                    <p className="font-medium">
                      {eventLabel(event.kind)} · {formatDate(event.occurredAt)} ·{" "}
                      {timeStatusLabel(event.timeStatus)}
                    </p>
                    <p className="whitespace-pre-wrap text-sm">{event.note || "Sin nota"}</p>
                    {current.canEdit && writeAllowed && (
                      <details>
                        <summary className="min-h-11 cursor-pointer py-2">Corregir evento</summary>
                        <fieldset
                          disabled={busy || Boolean(pendingOperationId)}
                          className="grid min-w-0 gap-3 sm:grid-cols-2"
                          onChange={() => setDirtyEventId(event.id)}
                        >
                          <div className="space-y-2">
                            <Label>Tipo</Label>
                            <select
                              className="min-h-11 w-full min-w-0 max-w-full rounded-md border bg-background px-3"
                              value={edited.kind}
                              onChange={(e) =>
                                setEventEdits((value) => ({
                                  ...value,
                                  [event.id]: {
                                    ...edited,
                                    kind: e.target.value as PoliceEventKind,
                                    dispatchId: ["request", "response", "reiteration"].includes(
                                      e.target.value,
                                    )
                                      ? ""
                                      : edited.dispatchId,
                                  },
                                }))
                              }
                            >
                              {eventKinds.map((kind) => (
                                <option key={kind} value={kind}>
                                  {eventLabel(kind)}
                                </option>
                              ))}
                            </select>
                          </div>
                          <div className="space-y-2">
                            <Label>Despacho asociado</Label>
                            <select
                              className="min-h-11 w-full min-w-0 max-w-full rounded-md border bg-background px-3"
                              value={edited.dispatchId}
                              onChange={(e) =>
                                setEventEdits((value) => ({
                                  ...value,
                                  [event.id]: { ...edited, dispatchId: e.target.value },
                                }))
                              }
                            >
                              <option value="">Compartido</option>
                              {dispatches
                                .filter((item) => current.dispatchIds.includes(item.id))
                                .map((item) => (
                                  <option value={item.id} key={item.id}>
                                    {item.baseName}
                                  </option>
                                ))}
                            </select>
                          </div>
                          <div className="space-y-2">
                            <Label>Hora manual (dejar sin cambio para conservar precisión)</Label>
                            <Input
                              type="datetime-local"
                              step="0.001"
                              className="min-h-11 min-w-0 max-w-full"
                              value={edited.occurredAt}
                              onChange={(e) =>
                                setEventEdits((value) => ({
                                  ...value,
                                  [event.id]: {
                                    ...edited,
                                    occurredAt: e.target.value,
                                    timeStatus: e.target.value ? "observed" : "not_observed",
                                  },
                                }))
                              }
                            />
                          </div>
                          <div className="space-y-2">
                            <Label>Estado de la hora</Label>
                            <select
                              className="min-h-11 w-full min-w-0 max-w-full rounded-md border bg-background px-3"
                              value={edited.timeStatus}
                              onChange={(e) => {
                                const timeStatus = e.target.value as PoliceTimeStatus;
                                setEventEdits((value) => ({
                                  ...value,
                                  [event.id]: {
                                    ...edited,
                                    timeStatus,
                                    occurredAt: timeStatus === "observed" ? edited.occurredAt : "",
                                  },
                                }));
                              }}
                            >
                              {timeStatuses.map((status) => (
                                <option
                                  key={status}
                                  value={status}
                                  disabled={
                                    status === "observed" && !edited.occurredAt && !event.occurredAt
                                  }
                                >
                                  {timeStatusLabel(status)}
                                </option>
                              ))}
                            </select>
                          </div>
                          <div className="space-y-2 sm:col-span-2">
                            <Label>Nota</Label>
                            <Textarea
                              value={edited.note}
                              maxLength={2000}
                              onChange={(e) =>
                                setEventEdits((value) => ({
                                  ...value,
                                  [event.id]: { ...edited, note: e.target.value },
                                }))
                              }
                            />
                          </div>
                          <Button
                            type="button"
                            className="min-h-11"
                            disabled={dirtyEventId !== event.id}
                            onClick={() => saveEvent(event)}
                          >
                            Guardar corrección
                          </Button>
                        </fieldset>
                      </details>
                    )}
                  </article>
                );
              })}
              {current.events.length === 0 && (
                <p className="text-sm text-muted-foreground">Todavía no hay eventos registrados.</p>
              )}
            </section>
            <section className="space-y-3">
              <Button
                type="button"
                variant="outline"
                className="min-h-11"
                disabled={busy}
                onClick={async () => {
                  const ticket = selectionTicket.current;
                  const identity = { currentUserId, episodeId, selectedId: current.id };
                  try {
                    const history = await historyFn({ data: current.id });
                    if (
                      !mounted.current ||
                      context.current.currentUserId !== identity.currentUserId ||
                      context.current.episodeId !== identity.episodeId ||
                      selectedRef.current !== identity.selectedId ||
                      ticket !== selectionTicket.current
                    )
                      return;
                    setAuditRows(history as Array<Record<string, unknown>>);
                  } catch (error) {
                    setMessage(
                      error instanceof Error ? error.message : "No se pudo cargar el historial.",
                    );
                  }
                }}
              >
                Consultar historial
              </Button>
              {auditRows.length > 0 && (
                <div className="space-y-2">
                  {auditRows.map((audit, index) => (
                    <article
                      key={String(audit["id"] ?? index)}
                      className="rounded border p-3 text-sm"
                    >
                      <p>
                        Versión {String(audit["versionBefore"] ?? "—")} →{" "}
                        {String(audit["versionAfter"])} ·{" "}
                        {formatDate(String(audit["occurredAt"] ?? ""))}
                      </p>
                      <p>Antes: {JSON.stringify(audit["beforeState"] ?? "Sin estado previo")}</p>
                      <p>Después: {JSON.stringify(audit["afterState"])}</p>
                    </article>
                  ))}
                </div>
              )}
            </section>
          </>
        )}
        {notices
          .filter((notice) => items.some((item) => item.id === notice.coordinationId))
          .map((notice) => (
            <div
              key={notice.id}
              className="flex flex-wrap items-center justify-between gap-2 rounded border p-3 text-sm"
            >
              <span>
                Un administrador corrigió una coordinación · {formatDate(notice.createdAt)}
              </span>
              {!notice.readAt && (
                <Button
                  type="button"
                  variant="outline"
                  className="min-h-11"
                  onClick={async () => {
                    const identity = { currentUserId, episodeId };
                    try {
                      await readNoticeFn({ data: notice.id });
                      if (
                        !mounted.current ||
                        context.current.currentUserId !== identity.currentUserId ||
                        context.current.episodeId !== identity.episodeId
                      )
                        return;
                      setNotices((rows) =>
                        rows.map((row) =>
                          row.id === notice.id ? { ...row, readAt: new Date().toISOString() } : row,
                        ),
                      );
                    } catch (error) {
                      if (
                        context.current.currentUserId === identity.currentUserId &&
                        context.current.episodeId === identity.episodeId
                      )
                        setMessage(
                          error instanceof Error
                            ? error.message
                            : "No se pudo actualizar el aviso.",
                        );
                    }
                  }}
                >
                  Marcar como leído
                </Button>
              )}
            </div>
          ))}
        {conflict && (
          <section className="space-y-3 rounded-md border border-destructive p-4">
            <h3 className="font-medium">La coordinación requiere resolución</h3>
            <p className="text-sm">
              La operación local conserva su identidad y contenido; compara la versión del servidor
              antes de elegir.
            </p>
            {conflict.remote && (
              <p className="text-sm">
                Servidor v{conflict.remote.version}:{" "}
                {conflict.remote.placeType === "incident" ? "Incidente" : "Punto de encuentro"} ·{" "}
                {conflict.remote.initiator === "central" ? "Central" : "Ambulancia"}
              </p>
            )}
            <details>
              <summary className="min-h-11 cursor-pointer py-2">Solicitud local congelada</summary>
              <pre className="overflow-auto whitespace-pre-wrap break-words rounded bg-muted p-3 text-xs">
                {JSON.stringify(conflict.entry.payload, null, 2)}
              </pre>
            </details>
            <Button
              type="button"
              className="min-h-11"
              variant="outline"
              disabled={busy || !conflict.remote}
              onClick={async () => {
                try {
                  const remote =
                    conflict.remote ??
                    ((await getFn({ data: conflict.entry.entityId })) as PoliceCoordinationView);
                  if (
                    !mounted.current ||
                    selectedRef.current !== conflict.entry.entityId ||
                    context.current.currentUserId !== conflict.entry.ownerUserId ||
                    context.current.episodeId !== conflict.entry.episodeId
                  )
                    return;
                  if (conflict.entry.status === "paused-conflict" && storeRef.current) {
                    await storeRef.current.remove(
                      conflict.entry.ownerUserId,
                      conflict.entry.episodeId,
                      conflict.entry.entityId,
                      conflict.entry.operationId,
                    );
                    if (
                      !mounted.current ||
                      selectedRef.current !== remote.id ||
                      context.current.currentUserId !== conflict.entry.ownerUserId
                    )
                      return;
                    setQueueEntries((rows) =>
                      rows.filter((entry) => entry.operationId !== conflict.entry.operationId),
                    );
                  }
                  setItems((rows) => rows.map((row) => (row.id === remote.id ? remote : row)));
                  updateCoordinationForm({
                    initiator: remote.initiator,
                    initiatingDispatchId: remote.initiatingDispatchId ?? "",
                    placeType: remote.placeType,
                    meetingReference: remote.meetingReference ?? "",
                    notes: remote.notes ?? "",
                  });
                  updateDispatchLinks(remote.dispatchIds);
                  setCoordinationDirtyTracked(false);
                  setDispatchesDirtyTracked(false);
                  if (conflict.entry.status === "paused-conflict") {
                    setPendingOperationId("");
                    setConflict(null);
                    setMessage(
                      "Se cargó la versión actual y se descartó únicamente la operación rechazada por conflicto.",
                    );
                  } else
                    setMessage(
                      "Se cargó la versión actual; la solicitud pausada por permisos permanece guardada.",
                    );
                } catch {
                  setMessage(
                    "No se pudo cargar la versión actual; se conservó la operación local.",
                  );
                }
              }}
            >
              Usar versión del servidor
            </Button>
            {conflict.entry.status === "paused-conflict" && (
              <Button
                type="button"
                className="min-h-11"
                disabled={busy || !writeAllowed || !conflict.remote}
                onClick={() => void rebaseConflict()}
              >
                Comparé ambas versiones; conservar mis cambios con una nueva operación
              </Button>
            )}
            {conflict.entry.status === "paused-permission" && (
              <Button
                type="button"
                className="min-h-11"
                disabled={busy || !writeAllowed}
                onClick={async () => {
                  if (!storeRef.current) return;
                  await storeRef.current.setStatus(
                    conflict.entry.ownerUserId,
                    conflict.entry.episodeId,
                    conflict.entry.entityId,
                    conflict.entry.operationId,
                    "pending",
                  );
                  const rows = await storeRef.current.list(
                    conflict.entry.ownerUserId,
                    conflict.entry.episodeId,
                  );
                  if (
                    !mounted.current ||
                    context.current.currentUserId !== conflict.entry.ownerUserId ||
                    selectedRef.current !== conflict.entry.entityId
                  )
                    return;
                  setQueueEntries(rows);
                  setConflict(null);
                  setPendingOperationId(conflict.entry.operationId);
                  void processEntry({ ...conflict.entry, status: "pending" });
                }}
              >
                Recuperé el permiso; reintentar la misma solicitud
              </Button>
            )}
          </section>
        )}
      </CardContent>
    </Card>
  );
}
