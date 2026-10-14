import { useEffect, useRef, useState } from "react";
import { History, LockKeyhole, PanelsTopLeft, Pencil, X } from "lucide-react";
import { Link } from "@tanstack/react-router";
import { createClientOnlyFn, useServerFn } from "@tanstack/react-start";
import { Button } from "@/components/ui/button";
import {
  EfaActionConfirmation,
  isActionConfirmationCurrent,
} from "@/components/EfaActionConfirmation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { EfaCommunicationPanel } from "@/components/EfaCommunicationStepper";
import { EfaDispatchStepper } from "@/components/EfaDispatchStepper";
import { EfaPoliceCoordinationPanel } from "@/components/EfaPoliceCoordinationPanel";
import { EfaObservationPanel } from "@/components/EfaObservationPanel";
import { EfaEpisodeSummary } from "@/components/EfaEpisodeSummary";
import { readSession } from "@/lib/auth.functions";
import {
  createEfaEpisode,
  closeEfaEpisode,
  cancelEfaEpisode,
  reactivateEfaEpisode,
  getEfaEpisode,
  listEfaEpisodes,
  listEfaEpisodeNotices,
  markEfaEpisodeNoticeRead,
  updateEfaEpisode,
} from "@/lib/efa-episodes.functions";
import type {
  EpisodeFormValues,
  EpisodeFormSource,
  PendingEpisodeClose,
  PendingEpisodeCreate,
  PendingEpisodeOperation,
  PendingEpisodeUpdate,
} from "@/lib/efa-episodes.client";
import type {
  EpisodeQueueEntry,
  EpisodeQueueOwnerTicket,
  EpisodeQueueOutcome,
  EpisodeQueueStore,
} from "@/lib/efa-episodes.queue";
import {
  EfaEpisodeWorkspace,
  planEpisodeWorkspaceSelection,
  selectGuardWorkspaceEpisodes,
  type EfaEpisodeWorkspaceSection,
} from "@/components/EfaEpisodeWorkspace";

const loadEpisodeClientHelpers = createClientOnlyFn(() => import("@/lib/efa-episodes.client"));
const loadEpisodeQueue = createClientOnlyFn(() => import("@/lib/efa-episodes.queue"));

// eslint-disable-next-line react-refresh/only-export-components
export function createEpisodeSubmissionGate() {
  let submitting = false;
  return {
    async run<T>(work: () => Promise<T>) {
      if (submitting) return { accepted: false as const };
      submitting = true;
      try {
        return { accepted: true as const, value: await work() };
      } finally {
        submitting = false;
      }
    },
  };
}

export type EpisodeView = {
  id: string;
  clientCreationKey: string;
  ownerUserId: string;
  originGuardId: string;
  eventAt: string;
  motive: string | null;
  address: string | null;
  interventionNumber: string | null;
  state: "draft" | "closed";
  closedAt?: string | null;
  cancelledAt?: string | null;
  cancelledFromState?: "draft" | "closed" | null;
  version: number;
  createdAt: string;
  updatedAt: string;
  canEdit: boolean;
  canManage?: boolean;
};
type ActiveEpisodeConflict = {
  ownerUserId: string;
  operationId: string;
  episodeId: string;
};
export type EpisodeNoticeView = {
  id: string;
  episodeId: string;
  createdAt: string;
  readAt: string | null;
};
type EpisodeMutationResult = {
  episode: EpisodeView;
  operation: {
    id: string;
    action: "created" | "updated" | "closed" | "cancelled" | "reactivated";
    appliedVersion: number;
    changed: boolean;
    replayed: boolean;
  };
  initialCall?: {
    communication: {
      id: string;
      episodeId: string;
      ownerUserId: string;
      clientCreationKey: string;
    };
    creationReceipt: {
      communicationId: string;
      episodeId: string;
      ownerUserId: string;
      clientCreationKey: string;
      operationId: string;
      direction: "incoming";
      action: "created";
      requestHash: string;
      appliedVersion: 1;
      changed: true;
    };
    replayed: boolean;
  };
};
type EpisodeQueueController = {
  enqueue(entry: EpisodeQueueEntry): Promise<EpisodeQueueOutcome<EpisodeMutationResult>>;
  retry(entry: EpisodeQueueEntry): Promise<EpisodeQueueOutcome<EpisodeMutationResult>>;
  reconcile(ownerUserId: string): Promise<Array<EpisodeQueueOutcome<EpisodeMutationResult>>>;
  removeResolved(ownerUserId: string, operationId: string): Promise<void>;
};
type EpisodeQueueOwnerFence = ReturnType<
  typeof import("@/lib/efa-episodes.queue").createEpisodeQueueOwnerFence
>;
type OpenGuard = { id: string; startedAt: Date | string; endedAt: Date | string | null };
const emptyForm = (): EpisodeFormValues => ({
  eventAt: "",
  motive: "",
  address: "",
  interventionNumber: "",
});
type InitialCallContinuation = {
  operationId: string;
  episodeId: string;
  communicationId: string;
  guardId: string;
};
type InitialCallIntentSnapshot = {
  ownerUserId: string;
  operationId: string;
  guardId: string;
  navigationRevision: number;
  form: EpisodeFormValues;
};
// eslint-disable-next-line react-refresh/only-export-components
export function episodeSaveActionLabel(isEditing: boolean, registerFirstCall: boolean) {
  if (isEditing) return "Guardar cambios";
  return registerFirstCall ? "Abrir servicio y registrar llamada" : "Abrir servicio";
}
// eslint-disable-next-line react-refresh/only-export-components
export function episodeFormTitle(selected: { version: number } | null) {
  return selected ? `Editar servicio · versión ${selected.version}` : "Nuevo servicio";
}
// eslint-disable-next-line react-refresh/only-export-components
export function canBeginNewService(state: {
  queueReady: boolean;
  queueAvailable: boolean;
  pending: boolean;
  hasSelection: boolean;
}) {
  return state.queueReady && state.queueAvailable && !state.pending && state.hasSelection;
}
// What the panel does with the editor once a write is confirmed. A confirmed create always
// hands the editor back as a blank "new service" form, even when the first-call continuation
// stays reachable; a write whose local cleanup failed keeps its frozen form untouched.
// eslint-disable-next-line react-refresh/only-export-components
export function resolvePostCreateState(state: {
  operationKind: "create" | "update" | "close";
  syncEditor: boolean;
  cleanupFailed: boolean;
  hasContinuation: boolean;
}) {
  return {
    exposeContinuation: state.syncEditor && state.hasContinuation,
    resetForm: state.operationKind === "create" && state.syncEditor && !state.cleanupFailed,
  };
}
// eslint-disable-next-line react-refresh/only-export-components
export function hasFirstCallCreateIntent(
  payload: Pick<PendingEpisodeCreate["payload"], "childCreateKey" | "direction"> | null,
) {
  return Boolean(payload?.childCreateKey && payload.direction === "incoming");
}
// eslint-disable-next-line react-refresh/only-export-components
export async function applyAfterEpisodeNavigationStable<T>(
  refresh: Promise<T>,
  capturedRevision: number,
  currentRevision: () => number,
  apply: (result: T) => void,
): Promise<boolean> {
  const result = await refresh;
  if (currentRevision() !== capturedRevision) return false;
  apply(result);
  return true;
}
type InitialCallRefreshEligibility = {
  navigationStayedStable: boolean;
  hasContinuation: boolean;
  syncEditor: boolean;
  activeOwnerMatches: boolean;
  guardMatches: boolean;
  selectedOperationId: string | null;
  pendingOperationId: string | null;
  expectedOperationId: string;
  intentMatches: boolean;
  formMatches: boolean;
};
// eslint-disable-next-line react-refresh/only-export-components
export function canAutoOpenInitialCallAfterRefresh(eligibility: InitialCallRefreshEligibility) {
  return Boolean(
    eligibility.navigationStayedStable &&
    eligibility.hasContinuation &&
    eligibility.syncEditor &&
    eligibility.activeOwnerMatches &&
    eligibility.guardMatches &&
    eligibility.selectedOperationId === eligibility.expectedOperationId &&
    (eligibility.pendingOperationId === null ||
      eligibility.pendingOperationId === eligibility.expectedOperationId) &&
    eligibility.intentMatches &&
    eligibility.formMatches,
  );
}
// eslint-disable-next-line react-refresh/only-export-components
export const formatEpisodeDate = (value: Date | string) =>
  new Date(value).toLocaleString("es-AR", { timeZone: "America/Argentina/Buenos_Aires" });
type EpisodeClientHelpers = typeof import("@/lib/efa-episodes.client");

const SERVICE_INTRO_NOTICE_VERSION = "v1";
const SERVICE_INTRO_NOTICE_DURATION_MS = 7 * 24 * 60 * 60 * 1000;

function serviceIntroNoticeStorageKey(userId: string) {
  return `efa-service-intro:${SERVICE_INTRO_NOTICE_VERSION}:${encodeURIComponent(userId)}`;
}

export function EfaEpisodePanel({
  initialEpisodes,
  initialNotices,
  openOwnGuard,
  currentUserId,
  canWrite,
  isAdmin,
}: {
  initialEpisodes: EpisodeView[];
  initialNotices: EpisodeNoticeView[];
  openOwnGuard: OpenGuard | null;
  currentUserId: string;
  canWrite: boolean;
  isAdmin: boolean;
}) {
  const createEpisode = useServerFn(createEfaEpisode);
  const closeEpisodeFn = useServerFn(closeEfaEpisode);
  const cancelEpisodeFn = useServerFn(cancelEfaEpisode);
  const reactivateEpisodeFn = useServerFn(reactivateEfaEpisode);
  const readSessionFn = useServerFn(readSession);
  const updateEpisode = useServerFn(updateEfaEpisode);
  const listEpisodes = useServerFn(listEfaEpisodes);
  const listNotices = useServerFn(listEfaEpisodeNotices);
  const getEpisode = useServerFn(getEfaEpisode);
  const acknowledgeNotice = useServerFn(markEfaEpisodeNoticeRead);
  const [serviceIntroNotice, setServiceIntroNotice] = useState({
    ownerUserId: currentUserId,
    visible: true,
    feedback: "",
  });
  const [episodes, setEpisodes] = useState(initialEpisodes);
  const [notices, setNotices] = useState(initialNotices);
  const [form, setForm] = useState<EpisodeFormValues>(emptyForm);
  const [registerFirstCall, setRegisterFirstCall] = useState(true);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [historyFor, setHistoryFor] = useState<string | null>(null);
  const [workspaceEpisodeId, setWorkspaceEpisodeId] = useState<string | null>(null);
  const [activeWorkspaceSection, setActiveWorkspaceSection] =
    useState<EfaEpisodeWorkspaceSection>("communications");
  const [visitedWorkspaceSections, setVisitedWorkspaceSections] = useState<
    Set<EfaEpisodeWorkspaceSection>
  >(() => new Set());
  const [pending, setPending] = useState<PendingEpisodeOperation | null>(null);
  const [conflict, setConflict] = useState<ActiveEpisodeConflict | null>(null);
  const [busy, setBusy] = useState(false);
  const [closingServiceTarget, setClosingServiceTarget] = useState<{
    key: string;
    episodeId: string;
  } | null>(null);
  const [error, setError] = useState("");
  const [saveError, setSaveError] = useState("");
  const [message, setMessage] = useState("");
  const [refreshWarning, setRefreshWarning] = useState("");
  const [initialCallContinuation, setInitialCallContinuation] =
    useState<InitialCallContinuation | null>(null);
  const lifecycleOperationRef = useRef<{ key: string; operationId: string } | null>(null);
  const submissionGate = useRef(createEpisodeSubmissionGate());
  const [queueEntries, setQueueEntries] = useState<EpisodeQueueEntry[]>([]);
  const [queueReady, setQueueReady] = useState(false);
  const [queueAvailable, setQueueAvailable] = useState(false);
  const [queueOwnerId, setQueueOwnerId] = useState<string | null>(currentUserId);
  const [queueError, setQueueError] = useState("");
  const [serverConfirmedOperationId, setServerConfirmedOperationId] = useState<string | null>(null);
  const queueEntriesRef = useRef(queueEntries);
  queueEntriesRef.current = queueEntries;
  const pendingRef = useRef(pending);
  pendingRef.current = pending;
  const conflictRef = useRef(conflict);
  conflictRef.current = conflict;
  const episodesRef = useRef(episodes);
  episodesRef.current = episodes;
  const activeUserRef = useRef(currentUserId);
  activeUserRef.current = currentUserId;
  const canWriteRef = useRef(canWrite);
  canWriteRef.current = canWrite;
  const ownerFenceRef = useRef<EpisodeQueueOwnerFence | null>(null);
  const ownerTicketRef = useRef<EpisodeQueueOwnerTicket | null>(null);
  const queueStoreRef = useRef<EpisodeQueueStore | null>(null);
  const queueControllerRef = useRef<EpisodeQueueController | null>(null);
  const queueModuleRef = useRef<typeof import("@/lib/efa-episodes.queue") | null>(null);
  const episodeHelpersRef = useRef<EpisodeClientHelpers | null>(null);
  const selectedQueueOperationId = useRef<string | null>(null);
  const episodeNavigationRevisionRef = useRef(0);
  const formRef = useRef(form);
  const initialCallIntentRef = useRef<InitialCallIntentSnapshot | null>(null);
  const initialCallContinuationRef = useRef(initialCallContinuation);
  const openOwnGuardRef = useRef(openOwnGuard);
  const workspaceEpisodeIdRef = useRef(workspaceEpisodeId);
  const activeWorkspaceSectionRef = useRef(activeWorkspaceSection);
  const visitedWorkspaceSectionsRef = useRef(visitedWorkspaceSections);
  formRef.current = form;
  initialCallContinuationRef.current = initialCallContinuation;
  openOwnGuardRef.current = openOwnGuard;
  workspaceEpisodeIdRef.current = workspaceEpisodeId;
  activeWorkspaceSectionRef.current = activeWorkspaceSection;
  visitedWorkspaceSectionsRef.current = visitedWorkspaceSections;
  const serviceIntroNoticeVisible =
    serviceIntroNotice.ownerUserId !== currentUserId || serviceIntroNotice.visible;
  const serviceIntroNoticeFeedback =
    serviceIntroNotice.ownerUserId === currentUserId ? serviceIntroNotice.feedback : "";

  useEffect(() => {
    const storageKey = serviceIntroNoticeStorageKey(currentUserId);
    try {
      const storedValue = window.localStorage.getItem(storageKey);
      const closedAt = storedValue === null ? Number.NaN : Number(storedValue);
      const now = Date.now();
      const validTimestamp =
        storedValue !== null &&
        /^\d+$/.test(storedValue) &&
        Number.isFinite(closedAt) &&
        Number.isSafeInteger(closedAt) &&
        closedAt > 0 &&
        closedAt <= now;

      if (!validTimestamp) {
        if (storedValue !== null) window.localStorage.removeItem(storageKey);
        setServiceIntroNotice({ ownerUserId: currentUserId, visible: true, feedback: "" });
        return;
      }

      const isWithinDismissalPeriod = now - closedAt < SERVICE_INTRO_NOTICE_DURATION_MS;
      if (!isWithinDismissalPeriod) window.localStorage.removeItem(storageKey);
      setServiceIntroNotice({
        ownerUserId: currentUserId,
        visible: !isWithinDismissalPeriod,
        feedback: "",
      });
    } catch {
      setServiceIntroNotice({
        ownerUserId: currentUserId,
        visible: true,
        feedback:
          "No se pudo consultar el almacenamiento del navegador; el aviso permanecerá visible.",
      });
    }
  }, [currentUserId]);

  function dismissServiceIntroNotice() {
    const storageKey = serviceIntroNoticeStorageKey(currentUserId);
    const closedAt = Date.now();
    try {
      window.localStorage.setItem(storageKey, String(closedAt));
      setServiceIntroNotice({ ownerUserId: currentUserId, visible: false, feedback: "" });
    } catch {
      setServiceIntroNotice({
        ownerUserId: currentUserId,
        visible: false,
        feedback:
          "No se pudo recordar esta preferencia; el aviso volverá a mostrarse al regresar a esta sección.",
      });
    }
  }

  function setActiveConflict(next: ActiveEpisodeConflict | null) {
    conflictRef.current = next;
    setConflict(next);
  }

  function advanceEpisodeNavigationRevision() {
    episodeNavigationRevisionRef.current += 1;
  }

  function isActiveConflict(target: ActiveEpisodeConflict, ticket: EpisodeQueueOwnerTicket) {
    const queue = queueModuleRef.current;
    return (
      ownerFenceRef.current?.isCurrent(ticket) === true &&
      activeUserRef.current === target.ownerUserId &&
      target.ownerUserId === ticket.ownerUserId &&
      conflictRef.current?.ownerUserId === target.ownerUserId &&
      conflictRef.current?.operationId === target.operationId &&
      conflictRef.current?.episodeId === target.episodeId &&
      queue?.isSelectedEpisodeQueueOperation(
        target,
        activeUserRef.current,
        pendingRef.current?.operationId ?? null,
        selectedQueueOperationId.current,
      ) === true
    );
  }

  const selected = episodes.find((episode) => episode.id === selectedId) ?? null;
  const episodeCloseTargetKey = (episode: EpisodeView) =>
    [
      currentUserId,
      openOwnGuard?.id ?? "no-guard",
      workspaceEpisodeId ?? "no-workspace",
      ownerTicketRef.current?.generation ?? "no-owner-ticket",
      episode.ownerUserId,
      episode.originGuardId,
      episode.id,
      episode.version,
    ].join(":");
  const activeGuardEpisodes = selectGuardWorkspaceEpisodes(episodes, openOwnGuard?.id ?? null);
  const pendingQueueEntry = pending
    ? (queueEntries.find(
        (entry) => entry.ownerUserId === currentUserId && entry.operationId === pending.operationId,
      ) ?? null)
    : null;
  const displayName = (episode: EpisodeView) => episode.motive || episode.address || "Servicio";
  const accessibleDisplayName = (episode: EpisodeView) =>
    `${displayName(episode)} · ${formatEpisodeDate(episode.eventAt)}`;
  const formDirty = selected
    ? form.eventAt !==
        (() => {
          const date = new Date(selected.eventAt);
          return new Date(date.getTime() - date.getTimezoneOffset() * 60_000)
            .toISOString()
            .slice(0, 16);
        })() ||
      form.motive !== (selected.motive ?? "") ||
      form.address !== (selected.address ?? "") ||
      form.interventionNumber !== (selected.interventionNumber ?? "")
    : Boolean(form.eventAt || form.motive || form.address || form.interventionNumber);
  const queueStatusLabel = (status: EpisodeQueueEntry["status"]) =>
    status === "pending"
      ? "pendiente"
      : status === "paused-conflict"
        ? "pausada por conflicto"
        : status === "paused-permission"
          ? "pausada por permisos"
          : status === "paused-mismatch"
            ? "pausada por respuesta no válida"
            : "confirmada, en limpieza local";
  const queueOperationLabel = (entry: EpisodeQueueEntry) =>
    entry.kind === "create"
      ? "Creación de servicio"
      : entry.kind === "update"
        ? "Corrección de servicio"
        : "Cierre de servicio";

  function beginCreate() {
    if (
      !canBeginNewService({
        queueReady,
        queueAvailable,
        pending: Boolean(pendingRef.current),
        hasSelection: Boolean(selectedId),
      })
    )
      return;
    if (
      formDirty &&
      !window.confirm("¿Descartar los cambios sin guardar y empezar un servicio nuevo?")
    )
      return;
    advanceEpisodeNavigationRevision();
    setSelectedId(null);
    setRegisterFirstCall(true);
    setActiveConflict(null);
    setForm(emptyForm());
    setError("");
    setSaveError("");
    setMessage("");
  }

  function editEpisode(episode: EpisodeView) {
    if (!canWrite || !queueReady || !episode.canEdit) return;
    if (selectedId !== episode.id && formDirty) {
      if (!window.confirm("¿Descartar el formulario actual para editar otro servicio?")) return;
    }
    advanceEpisodeNavigationRevision();
    setSelectedId(episode.id);
    setActiveConflict(null);
    const ticket = ownerTicketRef.current;
    void loadEpisodeClientHelpers().then(({ isoToLocalDateTimeValue }) => {
      if (!ticket || !ownerFenceRef.current?.isCurrent(ticket)) return;
      setForm({
        eventAt: isoToLocalDateTimeValue(episode.eventAt),
        motive: episode.motive ?? "",
        address: episode.address ?? "",
        interventionNumber: episode.interventionNumber ?? "",
      });
    });
    setError("");
    setSaveError("");
    setMessage("");
  }

  function openWorkspace(episodeId: string, section: EfaEpisodeWorkspaceSection) {
    const selection = planEpisodeWorkspaceSelection(
      {
        episodeId: workspaceEpisodeIdRef.current,
        section: activeWorkspaceSectionRef.current,
        visited: visitedWorkspaceSectionsRef.current,
        requiresDiscardConfirmation: false,
      },
      episodeId,
      section,
    );
    if (selection.requiresDiscardConfirmation) {
      if (
        !window.confirm(
          "Al cambiar de servicio se cerrarán los editores relacionados que no enviaste. ¿Continuar?",
        )
      )
        return false;
    }
    advanceEpisodeNavigationRevision();
    setVisitedWorkspaceSections(selection.visited);
    setWorkspaceEpisodeId(selection.episodeId);
    setActiveWorkspaceSection(selection.section);
    visitedWorkspaceSectionsRef.current = selection.visited;
    workspaceEpisodeIdRef.current = selection.episodeId;
    activeWorkspaceSectionRef.current = selection.section;
    return true;
  }

  function continueToInitialCall() {
    const target = initialCallContinuationRef.current;
    if (!target) return;
    if (openWorkspace(target.episodeId, "communications")) {
      setMessage("Servicio abierto. Preparando la primera llamada registrada.");
    }
  }

  async function refreshAfterWrite(
    saved: EpisodeView,
    operationVersion: number,
    operationKind: PendingEpisodeOperation["kind"],
    operationChanged: boolean,
    helpers: EpisodeClientHelpers,
    ticket: EpisodeQueueOwnerTicket,
    operationId: string,
  ) {
    const immediatelyAdopted = helpers.adoptConfirmedEpisodeToState(
      episodesRef.current,
      saved,
      (next) => {
        episodesRef.current = next;
        setEpisodes(next);
      },
    );
    try {
      const [nextEpisodes, nextNotices] = await Promise.all([listEpisodes(), listNotices()]);
      if (!ownerFenceRef.current?.isCurrent(ticket)) return;
      const baseline = helpers.confirmedEpisodeBaseline(saved, nextEpisodes as EpisodeFormSource[]);
      const operationSelected = Boolean(
        queueModuleRef.current?.shouldSyncEpisodeOperationToEditor(
          operationId,
          pendingRef.current?.operationId ?? null,
          selectedQueueOperationId.current,
        ),
      );
      const syncEditor = operationSelected && operationKind !== "close";
      const mergedEpisodes = helpers.mergeConfirmedEpisodeSnapshot(
        episodesRef.current,
        nextEpisodes as EpisodeView[],
        saved,
      );
      episodesRef.current = mergedEpisodes;
      setEpisodes(mergedEpisodes);
      setNotices(nextNotices as EpisodeNoticeView[]);
      if (syncEditor) {
        setError("");
        setRefreshWarning("");
        setForm(baseline.form);
      }
    } catch {
      if (!ownerFenceRef.current?.isCurrent(ticket)) return;
      const baseline = helpers.confirmedEpisodeBaseline(saved, []);
      const operationSelected = Boolean(
        queueModuleRef.current?.shouldSyncEpisodeOperationToEditor(
          operationId,
          pendingRef.current?.operationId ?? null,
          selectedQueueOperationId.current,
        ),
      );
      const syncEditor = operationSelected && operationKind !== "close";
      setEpisodes((current) => [saved, ...current.filter((item) => item.id !== saved.id)]);
      if (operationSelected) {
        setError("");
        setRefreshWarning(
          `${operationKind === "close" ? "El cierre" : "El guardado"} quedó confirmado, pero no se pudo actualizar el historial.`,
        );
      }
      if (syncEditor) {
        setForm(baseline.form);
      }
    }
    setMessage(
      operationKind === "close" && !operationChanged
        ? `El servicio ya estaba cerrado (versión ${operationVersion}).`
        : `${operationKind === "close" ? "Cierre" : "Guardado"} confirmado (versión ${operationVersion}).`,
    );
    if (
      queueModuleRef.current?.shouldSyncEpisodeOperationToEditor(
        operationId,
        pendingRef.current?.operationId ?? null,
        selectedQueueOperationId.current,
      )
    ) {
      if (operationKind !== "close") setSelectedId(saved.id);
      setActiveConflict(null);
      setPending(null);
      pendingRef.current = null;
    }
  }

  async function reloadQueueEntries(ticket: EpisodeQueueOwnerTicket) {
    const owner = ticket.ownerUserId;
    const store = queueStoreRef.current;
    const queue = queueModuleRef.current;
    if (!store || !queue) return [] as EpisodeQueueEntry[];
    let entries: EpisodeQueueEntry[] = [];
    const committed = await queue.runEpisodeQueueOwnerAction(
      ticket,
      (currentTicket) => Boolean(ownerFenceRef.current?.isCurrent(currentTicket)),
      () => store.list(owner),
      (loaded) => {
        entries = loaded;
        queueEntriesRef.current = loaded;
        setQueueEntries(loaded);
      },
    );
    return committed ? entries : [];
  }

  function restoreQueueEntry(entry: EpisodeQueueEntry) {
    const queue = queueModuleRef.current;
    if (!queue) return;
    advanceEpisodeNavigationRevision();
    const restored = queue.restoreQueuedEpisode(entry);
    selectedQueueOperationId.current = entry.operationId;
    setPending(restored.operation);
    pendingRef.current = restored.operation;
    if (restored.form) setForm(restored.form);
    const createPayload =
      entry.kind === "create" ? (entry.payload as PendingEpisodeCreate["payload"]) : null;
    if (entry.kind === "create") {
      setRegisterFirstCall(hasFirstCallCreateIntent(createPayload));
    }
    initialCallIntentRef.current =
      createPayload?.childCreateKey && createPayload.direction === "incoming" && restored.form
        ? {
            ownerUserId: entry.ownerUserId,
            operationId: entry.operationId,
            guardId: createPayload.guardId,
            navigationRevision: episodeNavigationRevisionRef.current,
            form: { ...restored.form },
          }
        : null;
    setError("");
    setSaveError("");
    setMessage("");
    setServerConfirmedOperationId(entry.status === "confirmed-cleanup" ? entry.operationId : null);
    const episodeId =
      entry.kind === "create"
        ? null
        : (entry.payload as PendingEpisodeUpdate["payload"] | PendingEpisodeClose["payload"])
            .episodeId;
    if (entry.kind === "update") setSelectedId(episodeId);
    setActiveConflict(
      entry.status === "paused-conflict" && episodeId
        ? { ownerUserId: entry.ownerUserId, operationId: entry.operationId, episodeId }
        : null,
    );
    if (entry.status === "paused-conflict") {
      setError(
        "La operación está pausada por conflicto. Conserva tus datos hasta elegir cómo resolverla.",
      );
    } else if (entry.status === "paused-permission") {
      setError("La operación está pausada por permisos. No se enviará hasta una acción explícita.");
    } else if (entry.status === "paused-mismatch") {
      setError(
        "La respuesta no coincide con la operación esperada. Se conserva y no se reenviará automáticamente.",
      );
    }
  }

  async function applyQueueOutcome(
    outcome: EpisodeQueueOutcome<EpisodeMutationResult>,
    ticket: EpisodeQueueOwnerTicket,
    operation: PendingEpisodeOperation,
  ) {
    if (!ownerFenceRef.current?.isCurrent(ticket)) return;
    const queue = queueModuleRef.current;
    if (!queue) return;
    const helpers = episodeHelpersRef.current ?? (await loadEpisodeClientHelpers());
    episodeHelpersRef.current = helpers;
    if (
      (outcome.status === "confirmed" || outcome.status === "confirmed-cleanup-failed") &&
      operation.kind === "close"
    ) {
      helpers.adoptConfirmedEpisodeToState(
        episodesRef.current,
        outcome.result.episode,
        (adopted) => {
          episodesRef.current = adopted;
          setEpisodes(adopted);
        },
      );
    }
    try {
      await reloadQueueEntries(ticket);
    } catch {
      if (ownerFenceRef.current?.isCurrent(ticket)) {
        setQueueError(
          "No se pudo actualizar la lista local; el resultado del servidor se conserva por separado.",
        );
      }
    }
    if (!ownerFenceRef.current?.isCurrent(ticket)) return;
    if (outcome.status === "cleaned" || outcome.status === "cleanup-failed") {
      const operationSelected = queue.shouldSyncEpisodeOperationToEditor(
        operation.operationId,
        pendingRef.current?.operationId ?? null,
        selectedQueueOperationId.current,
      );
      if (!operationSelected) {
        if (outcome.status === "cleaned" && operation.kind === "close") {
          try {
            const refreshed = (await listEpisodes()) as EpisodeView[];
            if (!ownerFenceRef.current?.isCurrent(ticket)) return;
            const merged = refreshed.reduce(
              (current, episode) => helpers.mergeConfirmedEpisodeSnapshot(current, [], episode),
              episodesRef.current,
            );
            episodesRef.current = merged;
            setEpisodes(merged);
          } catch {
            // An unselected background close must not overwrite another editor with refresh errors.
          }
        }
        return;
      }
      if (operation.kind === "close") {
        try {
          const refreshed = (await listEpisodes()) as EpisodeView[];
          if (!ownerFenceRef.current?.isCurrent(ticket)) return;
          const merged = refreshed.reduce(
            (current, episode) => helpers.mergeConfirmedEpisodeSnapshot(current, [], episode),
            episodesRef.current,
          );
          episodesRef.current = merged;
          setEpisodes(merged);
        } catch {
          setRefreshWarning(
            "El estado confirmado no se pudo volver a consultar; revisa el servicio al recuperar conexión.",
          );
        }
      }
      if (outcome.status === "cleanup-failed") {
        setPending(operation);
        pendingRef.current = operation;
        setServerConfirmedOperationId(operation.operationId);
        setMessage(
          "La operación ya estaba confirmada y no se reenviará; falta limpiar la cola local.",
        );
        return;
      }
      selectedQueueOperationId.current = null;
      if (pendingRef.current?.operationId === operation.operationId) {
        setPending(null);
        pendingRef.current = null;
      }
      setServerConfirmedOperationId(null);
      setActiveConflict(null);
      setMessage("La confirmación anterior quedó limpia de la cola local.");
      return;
    }
    if (outcome.status === "confirmed" || outcome.status === "confirmed-cleanup-failed") {
      const result = outcome.result;
      const createPayload =
        operation.kind === "create" ? (operation.payload as PendingEpisodeCreate["payload"]) : null;
      const intentSnapshot = initialCallIntentRef.current;
      const formStillMatchesIntent = Boolean(
        intentSnapshot &&
        formRef.current.eventAt === intentSnapshot.form.eventAt &&
        formRef.current.motive === intentSnapshot.form.motive &&
        formRef.current.address === intentSnapshot.form.address &&
        formRef.current.interventionNumber === intentSnapshot.form.interventionNumber,
      );
      const firstCall = result.initialCall;
      const receipt = firstCall?.creationReceipt;
      const communication = firstCall?.communication;
      const canContinueToInitialCall = Boolean(
        operation.kind === "create" &&
        createPayload?.childCreateKey &&
        createPayload.direction === "incoming" &&
        intentSnapshot?.ownerUserId === ticket.ownerUserId &&
        intentSnapshot.operationId === operation.operationId &&
        intentSnapshot.guardId === createPayload.guardId &&
        formStillMatchesIntent &&
        activeUserRef.current === ticket.ownerUserId &&
        openOwnGuardRef.current?.id === createPayload.guardId &&
        selectedQueueOperationId.current === operation.operationId &&
        pendingRef.current?.operationId === operation.operationId &&
        result.operation.id === operation.operationId &&
        result.operation.action === "created" &&
        result.operation.appliedVersion === 1 &&
        result.operation.changed &&
        result.episode.ownerUserId === ticket.ownerUserId &&
        result.episode.originGuardId === createPayload.guardId &&
        communication?.id &&
        communication.episodeId === result.episode.id &&
        communication.ownerUserId === ticket.ownerUserId &&
        communication.clientCreationKey === createPayload.childCreateKey &&
        receipt?.communicationId === communication.id &&
        receipt.episodeId === result.episode.id &&
        receipt.ownerUserId === ticket.ownerUserId &&
        receipt.clientCreationKey === createPayload.childCreateKey &&
        receipt.operationId === createPayload.childCreateKey &&
        receipt.direction === "incoming" &&
        receipt.action === "created" &&
        receipt.appliedVersion === 1 &&
        receipt.changed &&
        /^[0-9a-f]{64}$/.test(receipt.requestHash),
      );
      const continuation =
        canContinueToInitialCall && createPayload && communication
          ? {
              operationId: operation.operationId,
              episodeId: result.episode.id,
              communicationId: communication.id,
              guardId: createPayload.guardId,
            }
          : null;
      const exposeInitialCallContinuation = (shouldAutoOpen: boolean) => {
        if (!continuation) return;
        initialCallIntentRef.current = null;
        initialCallContinuationRef.current = continuation;
        setInitialCallContinuation(continuation);
        if (shouldAutoOpen && openWorkspace(result.episode.id, "communications")) {
          setMessage("Servicio abierto. Preparando la primera llamada registrada.");
        } else {
          setMessage(
            "El servicio y su primera llamada están guardados. Puedes continuar cuando quieras.",
          );
        }
      };
      const helpers = episodeHelpersRef.current ?? (await loadEpisodeClientHelpers());
      episodeHelpersRef.current = helpers;
      if (!ownerFenceRef.current?.isCurrent(ticket)) return;
      let navigationStayedStable = false;
      await applyAfterEpisodeNavigationStable(
        refreshAfterWrite(
          result.episode,
          result.operation.appliedVersion,
          operation.kind,
          result.operation.changed,
          helpers,
          ticket,
          operation.operationId,
        ),
        intentSnapshot?.navigationRevision ?? episodeNavigationRevisionRef.current,
        () => episodeNavigationRevisionRef.current,
        () => {
          navigationStayedStable = true;
        },
      );
      if (!ownerFenceRef.current?.isCurrent(ticket)) return;
      const syncEditor = queue.shouldSyncEpisodeOperationToEditor(
        operation.operationId,
        pendingRef.current?.operationId ?? null,
        selectedQueueOperationId.current,
      );
      const latestIntent = initialCallIntentRef.current;
      const latestFormMatchesIntent = Boolean(
        intentSnapshot &&
        formRef.current.eventAt === intentSnapshot.form.eventAt &&
        formRef.current.motive === intentSnapshot.form.motive &&
        formRef.current.address === intentSnapshot.form.address &&
        formRef.current.interventionNumber === intentSnapshot.form.interventionNumber,
      );
      const mayAutoOpenInitialCall = canAutoOpenInitialCallAfterRefresh({
        navigationStayedStable,
        hasContinuation: Boolean(continuation),
        syncEditor,
        activeOwnerMatches: activeUserRef.current === ticket.ownerUserId,
        guardMatches: openOwnGuardRef.current?.id === continuation?.guardId,
        selectedOperationId: selectedQueueOperationId.current,
        pendingOperationId: pendingRef.current?.operationId ?? null,
        expectedOperationId: operation.operationId,
        intentMatches: Boolean(
          latestIntent?.ownerUserId === ticket.ownerUserId &&
          latestIntent.operationId === operation.operationId &&
          latestIntent.guardId === continuation?.guardId &&
          latestIntent.navigationRevision === intentSnapshot?.navigationRevision,
        ),
        formMatches: latestFormMatchesIntent,
      });
      if (outcome.status === "confirmed-cleanup-failed") {
        if (syncEditor) {
          setPending(operation);
          pendingRef.current = operation;
          setServerConfirmedOperationId(operation.operationId);
          setMessage(
            `${operation.kind === "close" ? "Cierre" : "Guardado"} confirmado en el servidor; no se pudo limpiar la cola local. No vuelvas a enviarlo.`,
          );
          if (continuation) exposeInitialCallContinuation(mayAutoOpenInitialCall);
        }
      } else if (syncEditor) {
        selectedQueueOperationId.current = null;
        if (operation.kind === "create") {
          const postCreate = resolvePostCreateState({
            operationKind: operation.kind,
            syncEditor,
            cleanupFailed: false,
            hasContinuation: Boolean(continuation),
          });
          // The continuation and its auto-open decision were computed against the submitted
          // form above; only afterwards does the editor go back to a blank new service.
          if (postCreate.exposeContinuation) exposeInitialCallContinuation(mayAutoOpenInitialCall);
          if (postCreate.resetForm) {
            initialCallIntentRef.current = null;
            setForm(emptyForm());
            setRegisterFirstCall(true);
            setSelectedId(null);
            setServerConfirmedOperationId(null);
          }
        }
      }
      return;
    }
    const operationIsSelected = queue.isSelectedEpisodeQueueOperation(
      {
        ownerUserId: ticket.ownerUserId,
        operationId: operation.operationId,
        episodeId: operation.kind === "create" ? "" : operation.payload.episodeId,
      },
      activeUserRef.current,
      pendingRef.current?.operationId ?? null,
      selectedQueueOperationId.current,
    );
    if (outcome.status === "paused-conflict" && operation.kind !== "create") {
      if (!operationIsSelected) return;
      setActiveConflict({
        ownerUserId: ticket.ownerUserId,
        operationId: operation.operationId,
        episodeId: operation.payload.episodeId,
      });
      setError(
        operation.kind === "close"
          ? "El servicio cambió en otra sesión. El cierre sigue pendiente; carga la versión actual antes de confirmar otra vez."
          : "El servicio cambió en otra sesión. Tus datos locales siguen pendientes; carga la versión actual para resolver el conflicto.",
      );
    } else if (outcome.status === "paused-permission") {
      if (operationIsSelected) {
        setError("La operación quedó pausada por permisos. No se reintentará automáticamente.");
      }
    } else if (outcome.status === "pause-storage-failed") {
      if (operationIsSelected) {
        setQueueError(
          "No se pudo guardar el estado de pausa. La operación local se conserva y requiere revisión manual.",
        );
      }
    } else if (outcome.status === "mismatched") {
      if (operationIsSelected) {
        setError(
          "La respuesta no coincide con esta operación. Se conserva localmente y no se enviará otra vez automáticamente.",
        );
      }
    } else if (outcome.status === "uncertain") {
      if (operationIsSelected) {
        setError(
          "No se pudo confirmar la respuesta. La misma operación sigue pendiente y puede reintentarse sin cambiar sus datos.",
        );
      }
    }
  }

  async function dispatchQueuedEntry(entry: EpisodeQueueEntry): Promise<EpisodeMutationResult> {
    if (activeUserRef.current !== entry.ownerUserId || !canWriteRef.current) {
      throw new Error("Se requiere acceso EFA vigente para enviar esta operación.");
    }
    if (entry.kind === "create") {
      return (await createEpisode({
        data: entry.payload as PendingEpisodeCreate["payload"],
      })) as EpisodeMutationResult;
    }
    if (entry.kind === "update") {
      return (await updateEpisode({
        data: entry.payload as PendingEpisodeUpdate["payload"],
      })) as EpisodeMutationResult;
    }
    const ticket = ownerTicketRef.current;
    if (!ticket || ticket.ownerUserId !== entry.ownerUserId) {
      throw new Error("La identidad de la cola cambió antes de enviar el cierre.");
    }
    const helpers = episodeHelpersRef.current ?? (await loadEpisodeClientHelpers());
    episodeHelpersRef.current = helpers;
    return helpers.dispatchEpisodeCloseWithFreshWriter(
      entry.payload as PendingEpisodeClose["payload"],
      entry.ownerUserId,
      async () => {
        const session = await readSessionFn();
        if (
          !ownerFenceRef.current?.isCurrent(ticket) ||
          activeUserRef.current !== entry.ownerUserId
        ) {
          throw new Error("La identidad de la cola cambió durante la comprobación de permisos.");
        }
        return session;
      },
      async (payload) => {
        const result = (await closeEpisodeFn({ data: payload })) as EpisodeMutationResult;
        if (!ownerFenceRef.current?.isCurrent(ticket)) {
          throw new Error("La identidad de la cola cambió durante el cierre.");
        }
        return result;
      },
    );
  }

  async function runQueueEntry(entry: EpisodeQueueEntry, mode: "retry" | "enqueue") {
    const ticket = ownerTicketRef.current;
    const controller = queueControllerRef.current;
    if (
      !ticket ||
      !controller ||
      ticket.ownerUserId !== currentUserId ||
      entry.ownerUserId !== ticket.ownerUserId ||
      !canWriteRef.current
    )
      return;
    const queue = queueModuleRef.current;
    if (!queue) return;
    await queue.runWithEpisodeQueueBusy(
      ticket,
      (currentTicket) => Boolean(ownerFenceRef.current?.isCurrent(currentTicket)),
      setBusy,
      async () => {
        setError("");
        setMessage("");
        setRefreshWarning("");
        let outcome: EpisodeQueueOutcome<EpisodeMutationResult>;
        try {
          outcome =
            mode === "enqueue" ? await controller.enqueue(entry) : await controller.retry(entry);
        } catch (cause) {
          if (!ownerFenceRef.current?.isCurrent(ticket)) return;
          setQueueError(
            "No se pudo guardar en este dispositivo. La operación no se envió; conserva estos datos y vuelve a intentar cuando el almacenamiento esté disponible.",
          );
          setError(
            cause instanceof Error && /quota|IndexedDB|storage/i.test(cause.message)
              ? "No se pudo persistir la operación local; el envío se bloqueó para evitar perderla."
              : "No se pudo preparar la operación local. Tus datos siguen en pantalla.",
          );
          return;
        }
        try {
          await applyQueueOutcome(outcome, ticket, {
            kind: entry.kind,
            operationId: entry.operationId,
            payload: entry.payload,
          } as PendingEpisodeOperation);
        } catch {
          if (!ownerFenceRef.current?.isCurrent(ticket)) return;
          if (outcome.status === "confirmed" || outcome.status === "confirmed-cleanup-failed") {
            const restored = {
              kind: entry.kind,
              operationId: entry.operationId,
              payload: entry.payload,
            } as PendingEpisodeOperation;
            setPending(restored);
            pendingRef.current = restored;
            setServerConfirmedOperationId(entry.operationId);
            setMessage(
              `${entry.kind === "close" ? "Cierre" : "Guardado"} confirmado en el servidor; falló una actualización visual. No se reenviará.`,
            );
          } else {
            setQueueError(
              "No se pudo actualizar la vista local de la operación. La operación permanece en la cola.",
            );
          }
        }
      },
    );
  }

  useEffect(() => {
    let cancelled = false;
    let onlineHandler: (() => void) | null = null;
    setQueueReady(false);
    setQueueAvailable(false);
    setQueueOwnerId(null);
    setQueueEntries([]);
    queueEntriesRef.current = [];
    setPending(null);
    pendingRef.current = null;
    initialCallIntentRef.current = null;
    initialCallContinuationRef.current = null;
    setInitialCallContinuation(null);
    setSelectedId(null);
    setWorkspaceEpisodeId(null);
    setVisitedWorkspaceSections(new Set());
    setActiveConflict(null);
    setHistoryFor(null);
    setEpisodes(initialEpisodes);
    setNotices(initialNotices);
    setForm(emptyForm());
    setRegisterFirstCall(true);
    setQueueError("");
    setError("");
    setSaveError("");
    setMessage("");
    setRefreshWarning("");
    setBusy(false);
    setServerConfirmedOperationId(null);
    selectedQueueOperationId.current = null;

    void (async () => {
      try {
        const queue = await loadEpisodeQueue();
        if (cancelled) return;
        queueModuleRef.current = queue;
        episodeHelpersRef.current = await loadEpisodeClientHelpers();
        if (cancelled) return;
        const activeFence =
          ownerFenceRef.current ?? (ownerFenceRef.current = queue.createEpisodeQueueOwnerFence());
        const ticket = activeFence.enter(currentUserId);
        ownerTicketRef.current = ticket;
        const store = queue.createIndexedDbEpisodeQueueStore();
        const entries = await store.list(currentUserId);
        if (cancelled || !activeFence.isCurrent(ticket) || activeUserRef.current !== currentUserId)
          return;
        queueStoreRef.current = store;
        queueControllerRef.current = queue.createEpisodeQueueController(store, dispatchQueuedEntry);
        queueEntriesRef.current = entries;
        setQueueEntries(entries);
        setQueueOwnerId(currentUserId);
        setQueueAvailable(true);
        setQueueReady(true);
        if (entries.length === 1) restoreQueueEntry(entries[0]!);
        onlineHandler = () => {
          if (!canWriteRef.current || activeUserRef.current !== currentUserId) return;
          const controller = queueControllerRef.current;
          if (!controller || !activeFence.isCurrent(ticket)) return;
          void controller
            .reconcile(currentUserId)
            .then((outcomes) => {
              outcomes.forEach((outcome) => {
                const restored = queue.restoreQueuedEpisode(outcome.entry).operation;
                void applyQueueOutcome(outcome, ticket, restored).catch(() => {
                  if (activeFence.isCurrent(ticket)) {
                    setQueueError(
                      "No se pudo refrescar el estado local después de recuperar una operación.",
                    );
                  }
                });
              });
            })
            .catch(() => {
              if (activeFence.isCurrent(ticket)) {
                setQueueError(
                  "No se pudo consultar la cola local durante la recuperación en línea.",
                );
              }
            });
        };
        window.addEventListener("online", onlineHandler);
        if (canWriteRef.current && navigator.onLine && entries.length > 0) onlineHandler();
      } catch {
        if (cancelled || activeUserRef.current !== currentUserId) return;
        setQueueOwnerId(currentUserId);
        setQueueReady(true);
        setQueueAvailable(false);
        setQueueError(
          "El almacenamiento local para la cola no está disponible en este navegador. No se enviará ninguna operación pendiente.",
        );
      }
    })();

    return () => {
      cancelled = true;
      if (onlineHandler) window.removeEventListener("online", onlineHandler);
      const ticket = ownerTicketRef.current;
      if (ticket?.ownerUserId === currentUserId) ownerFenceRef.current?.leave(ticket);
      if (ticket?.ownerUserId === currentUserId) ownerTicketRef.current = null;
      queueStoreRef.current = null;
      queueControllerRef.current = null;
      queueModuleRef.current = null;
      episodeHelpersRef.current = null;
    };
    // Rehydrate only on owner changes; callbacks fence asynchronous writes with the current ticket.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentUserId]);

  function save() {
    if (
      !canWrite ||
      !queueReady ||
      !queueAvailable ||
      pending ||
      conflict ||
      serverConfirmedOperationId
    )
      return;
    let preparationStage = "client helpers";
    const ticket = ownerTicketRef.current;
    if (!ticket || ticket.ownerUserId !== currentUserId) return;
    const requestedNavigationRevision = episodeNavigationRevisionRef.current;
    void submissionGate.current
      .run(async () => {
        if (!ownerFenceRef.current?.isCurrent(ticket)) return;
        setBusy(true);
        setSaveError("");
        try {
          const helpers = episodeHelpersRef.current ?? (await loadEpisodeClientHelpers());
          episodeHelpersRef.current = helpers;
          if (!ownerFenceRef.current?.isCurrent(ticket)) return;
          preparationStage = "form validation";
          const validation = helpers.validateEpisodeForm(form);
          if (!validation.valid) {
            setSaveError("Indica una fecha y hora válidas para el episodio.");
            return;
          }
          const normalized = { ...form, eventAt: validation.eventAt };
          preparationStage = "operation creation";
          const operation = selected
            ? helpers.createPendingUpdate({
                episodeId: selected.id,
                expectedVersion: selected.version,
                eventAt: validation.eventAt,
                motive: normalized.motive,
                address: normalized.address,
                interventionNumber: normalized.interventionNumber,
              })
            : openOwnGuard
              ? helpers.createPendingCreate(openOwnGuard.id, normalized, undefined, {
                  registerFirstCall,
                })
              : null;
          if (!operation) {
            setSaveError("Para crear un episodio necesitas una guardia propia abierta.");
            return;
          }
          initialCallIntentRef.current =
            operation.kind === "create" &&
            operation.payload.childCreateKey &&
            operation.payload.direction === "incoming"
              ? {
                  ownerUserId: currentUserId,
                  operationId: operation.operationId,
                  guardId: operation.payload.guardId,
                  navigationRevision: requestedNavigationRevision,
                  form: { ...form },
                }
              : null;
          const entry: EpisodeQueueEntry = {
            ownerUserId: currentUserId,
            operationId: operation.operationId,
            kind: operation.kind,
            payload: structuredClone(operation.payload),
            status: "pending",
            createdAt: new Date().toISOString(),
          };
          selectedQueueOperationId.current = operation.operationId;
          setPending(operation);
          pendingRef.current = operation;
          preparationStage = "local queue";
          await runQueueEntry(entry, "enqueue");
        } catch (cause) {
          if (ownerFenceRef.current?.isCurrent(ticket)) {
            console.error("EFA draft save failed", {
              stage: preparationStage,
              errorType: cause instanceof Error ? "Error" : "NonError",
            });
            setSaveError(
              "No se pudo preparar el borrador para guardar. Tus datos permanecen en esta pantalla.",
            );
          }
        } finally {
          if (ownerFenceRef.current?.isCurrent(ticket)) setBusy(false);
        }
      })
      .catch((cause) => {
        if (ownerFenceRef.current?.isCurrent(ticket)) {
          console.error("EFA draft save submission failed", {
            stage: preparationStage,
            errorType: cause instanceof Error ? "Error" : "NonError",
          });
          setSaveError("No se pudo preparar el borrador para guardar.");
        }
      });
  }

  function closeService(episodeId: string, confirmedTargetKey: string) {
    const episode = episodesRef.current.find((item) => item.id === episodeId);
    const currentTargetKey = episode ? episodeCloseTargetKey(episode) : null;
    if (
      !isActionConfirmationCurrent(confirmedTargetKey, currentTargetKey) ||
      !canWriteRef.current ||
      activeUserRef.current !== currentUserId ||
      !episode ||
      !episode.canEdit ||
      episode.state !== "draft" ||
      !queueReady ||
      !queueAvailable ||
      busy ||
      pendingRef.current ||
      conflictRef.current ||
      formDirty
    )
      return;
    const ticket = ownerTicketRef.current;
    if (
      !ticket ||
      ticket.ownerUserId !== currentUserId ||
      ownerFenceRef.current?.isCurrent(ticket) !== true
    )
      return;
    void submissionGate.current
      .run(async () => {
        if (!ownerFenceRef.current?.isCurrent(ticket)) return;
        setBusy(true);
        setError("");
        setMessage("");
        setRefreshWarning("");
        try {
          const helpers = episodeHelpersRef.current ?? (await loadEpisodeClientHelpers());
          episodeHelpersRef.current = helpers;
          if (!ownerFenceRef.current?.isCurrent(ticket)) return;
          const operation = helpers.createPendingClose(episode.id, episode.version);
          const entry: EpisodeQueueEntry = {
            ownerUserId: currentUserId,
            operationId: operation.operationId,
            kind: operation.kind,
            payload: structuredClone(operation.payload),
            status: "pending",
            createdAt: new Date().toISOString(),
          };
          setPending(operation);
          pendingRef.current = operation;
          selectedQueueOperationId.current = operation.operationId;
          await runQueueEntry(entry, "enqueue");
        } catch {
          if (ownerFenceRef.current?.isCurrent(ticket)) {
            setError("No se pudo preparar el cierre. El servicio permanece sin cambios.");
          }
        } finally {
          if (ownerFenceRef.current?.isCurrent(ticket)) setBusy(false);
        }
      })
      .catch(() => {
        if (ownerFenceRef.current?.isCurrent(ticket)) {
          setError("No se pudo preparar el cierre del servicio.");
        }
      });
  }

  async function changeEpisodeCancellation(episode: EpisodeView, action: "cancel" | "reactivate") {
    if (!canWrite || !episode.canManage || busy || pending || conflict) return;
    const confirmation =
      action === "cancel"
        ? "¿Anular este episodio? No se eliminarán sus llamadas ni despachos. Primero deben estar anulados todos los hijos."
        : "¿Reactivar este episodio y restaurar su estado anterior? Sus llamadas y despachos no cambiarán.";
    if (!window.confirm(confirmation)) return;
    const key = `${episode.id}:${episode.version}:${action}`;
    if (lifecycleOperationRef.current?.key !== key)
      lifecycleOperationRef.current = { key, operationId: crypto.randomUUID() };
    const operationId = lifecycleOperationRef.current.operationId;
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const input = { episodeId: episode.id, expectedVersion: episode.version, operationId };
      const result = (
        action === "cancel"
          ? await cancelEpisodeFn({ data: input })
          : await reactivateEpisodeFn({ data: input })
      ) as EpisodeMutationResult;
      lifecycleOperationRef.current = null;
      setEpisodes((current) =>
        current.map((item) =>
          item.id === result.episode.id && result.episode.version >= item.version
            ? result.episode
            : item,
        ),
      );
      setMessage(
        action === "cancel"
          ? "Episodio anulado; su historial permanece disponible."
          : "Episodio reactivado con su estado anterior.",
      );
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "No se pudo confirmar el cambio. Reintentar conservará el mismo identificador de operación.",
      );
    } finally {
      setBusy(false);
    }
  }

  async function retryPending() {
    if (!pending) return;
    const ticket = ownerTicketRef.current;
    if (!ticket || !queueStoreRef.current) return;
    if (serverConfirmedOperationId === pending.operationId) {
      setBusy(true);
      try {
        await queueControllerRef.current?.removeResolved(ticket.ownerUserId, pending.operationId);
        if (!ownerFenceRef.current?.isCurrent(ticket)) return;
        const remaining = queueEntriesRef.current.filter(
          (entry) =>
            entry.ownerUserId !== ticket.ownerUserId || entry.operationId !== pending.operationId,
        );
        queueEntriesRef.current = remaining;
        setQueueEntries(remaining);
        setPending(null);
        pendingRef.current = null;
        setServerConfirmedOperationId(null);
        selectedQueueOperationId.current = null;
        setMessage("La cola local quedó limpia; la escritura ya estaba confirmada en el servidor.");
      } catch {
        setQueueError(
          "No se pudo limpiar la operación confirmada en este dispositivo. No se reenvió.",
        );
      } finally {
        if (ownerFenceRef.current?.isCurrent(ticket)) setBusy(false);
      }
      return;
    }
    const entry = queueEntriesRef.current.find(
      (item) => item.ownerUserId === ticket.ownerUserId && item.operationId === pending.operationId,
    );
    if (entry?.status === "pending") await runQueueEntry(entry, "retry");
    else if (!entry && queueControllerRef.current && queueAvailable) {
      await runQueueEntry(
        {
          ownerUserId: ticket.ownerUserId,
          operationId: pending.operationId,
          kind: pending.kind,
          payload: structuredClone(pending.payload),
          status: "pending",
          createdAt: new Date().toISOString(),
        },
        "enqueue",
      );
    }
  }

  function selectQueuedOperation(operationId: string) {
    const queue = queueModuleRef.current;
    const entry = queue?.selectEpisodeQueueEntry(
      queueEntriesRef.current,
      currentUserId,
      operationId,
    );
    if (!entry) return;
    const currentPending = pendingRef.current;
    const currentIsPersisted =
      !currentPending ||
      queueEntriesRef.current.some(
        (item) =>
          item.ownerUserId === currentUserId && item.operationId === currentPending.operationId,
      );
    if (currentPending && currentPending.operationId !== operationId && !currentIsPersisted) {
      setError(
        "Primero vuelve a guardar localmente la operación actual; sus datos aún no están en la cola.",
      );
      return;
    }
    restoreQueueEntry(entry);
  }

  async function discardPausedOperation(entry: EpisodeQueueEntry) {
    if (
      entry.ownerUserId !== currentUserId ||
      !window.confirm(
        "¿Descartar esta operación pausada? Se perderán los datos locales de este cambio.",
      )
    )
      return;
    const ticket = ownerTicketRef.current;
    if (!ticket || !queueControllerRef.current) return;
    setBusy(true);
    try {
      await queueControllerRef.current.removeResolved(entry.ownerUserId, entry.operationId);
      if (!ownerFenceRef.current?.isCurrent(ticket)) return;
      await reloadQueueEntries(ticket);
      if (!ownerFenceRef.current?.isCurrent(ticket)) return;
      if (pendingRef.current?.operationId === entry.operationId) {
        setPending(null);
        pendingRef.current = null;
        setActiveConflict(null);
        selectedQueueOperationId.current = null;
      }
      setMessage("Se descartó únicamente la operación local seleccionada.");
    } catch {
      setQueueError("No se pudo descartar la operación local; sigue pendiente en el dispositivo.");
    } finally {
      if (ownerFenceRef.current?.isCurrent(ticket)) setBusy(false);
    }
  }

  async function loadServerVersion() {
    const selectedConflict = conflictRef.current;
    if (!selectedConflict) return;
    const ticket = ownerTicketRef.current;
    if (!ticket || !isActiveConflict(selectedConflict, ticket)) return;
    if (
      !window.confirm(
        "Al cargar la versión del servidor, reemplazarás los datos locales de esta operación. ¿Continuar?",
      )
    )
      return;
    setBusy(true);
    setError("");
    try {
      const latest = (await getEpisode({ data: selectedConflict.episodeId })) as EpisodeView;
      if (!isActiveConflict(selectedConflict, ticket)) return;
      if (latest.id !== selectedConflict.episodeId) throw new Error("episode-identity-mismatch");
      const helpers = await loadEpisodeClientHelpers();
      if (!isActiveConflict(selectedConflict, ticket)) return;
      const queue = queueModuleRef.current;
      const queuedEntry = queue?.selectEpisodeQueueEntry(
        queueEntriesRef.current,
        selectedConflict.ownerUserId,
        selectedConflict.operationId,
      );
      const controller = queueControllerRef.current;
      const matchesConflictEpisode =
        queuedEntry &&
        queuedEntry.kind !== "create" &&
        (queuedEntry.payload as PendingEpisodeUpdate["payload"] | PendingEpisodeClose["payload"])
          .episodeId === selectedConflict.episodeId;
      if (!queuedEntry || !matchesConflictEpisode || !controller) return;
      await helpers.removeEpisodeOperationAfterFreshWriter(
        selectedConflict.ownerUserId,
        readSessionFn,
        () => isActiveConflict(selectedConflict, ticket),
        () => controller.removeResolved(selectedConflict.ownerUserId, selectedConflict.operationId),
      );
      if (!isActiveConflict(selectedConflict, ticket)) return;
      {
        const remaining = queueEntriesRef.current.filter(
          (entry) =>
            entry.ownerUserId !== selectedConflict.ownerUserId ||
            entry.operationId !== selectedConflict.operationId,
        );
        queueEntriesRef.current = remaining;
        setQueueEntries(remaining);
      }
      setEpisodes((current) => current.map((item) => (item.id === latest.id ? latest : item)));
      if (queuedEntry.kind === "update") {
        setSelectedId(latest.id);
        setForm({
          eventAt: helpers.isoToLocalDateTimeValue(latest.eventAt),
          motive: latest.motive ?? "",
          address: latest.address ?? "",
          interventionNumber: latest.interventionNumber ?? "",
        });
      }
      setActiveConflict(null);
      if (pendingRef.current?.operationId === selectedConflict.operationId) {
        setPending(null);
        pendingRef.current = null;
      }
      if (selectedQueueOperationId.current === selectedConflict.operationId) {
        selectedQueueOperationId.current = null;
      }
      setMessage(
        queuedEntry.kind === "close"
          ? latest.state === "closed"
            ? "El servicio ya figura cerrado en la versión actual del servidor."
            : `Se cargó la versión ${latest.version}. Si deseas cerrarlo, confirma el cierre nuevamente.`
          : "Se cargó la versión actual del servidor. Revisa los datos antes de guardar.",
      );
    } catch {
      if (!isActiveConflict(selectedConflict, ticket)) return;
      setError("No se pudo cargar la versión actual. Tus datos no se modificaron.");
    } finally {
      if (ownerFenceRef.current?.isCurrent(ticket)) setBusy(false);
    }
  }

  // The summary reads each section on its own once it mounts, so opening it needs no request here.
  function showHistory(episodeId: string) {
    if (!ownerTicketRef.current) return;
    setError("");
    setHistoryFor(episodeId);
  }

  async function markRead(noticeId: string) {
    const ticket = ownerTicketRef.current;
    if (!ticket) return;
    setBusy(true);
    setError("");
    try {
      const saved = (await acknowledgeNotice({ data: noticeId })) as EpisodeNoticeView;
      if (!ownerFenceRef.current?.isCurrent(ticket)) return;
      setNotices((current) => current.map((item) => (item.id === saved.id ? saved : item)));
    } catch {
      if (!ownerFenceRef.current?.isCurrent(ticket)) return;
      setError("No se pudo actualizar el aviso. Puedes volver a intentarlo.");
    } finally {
      if (ownerFenceRef.current?.isCurrent(ticket)) setBusy(false);
    }
  }

  if (queueOwnerId !== currentUserId) {
    return (
      <Card>
        <CardContent className="p-5 text-sm text-muted-foreground">
          Cargando el historial y las operaciones locales de la cuenta activa…
        </CardContent>
      </Card>
    );
  }

  return (
    <div
      className="min-w-0 space-y-3 sm:space-y-4"
      onClickCapture={advanceEpisodeNavigationRevision}
    >
      <Card>
        <CardHeader className="px-3 py-3 sm:px-6 sm:py-6">
          <CardTitle>Servicios de la guardia</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 px-3 pb-3 pt-0 sm:px-6 sm:pb-6">
          {serviceIntroNoticeVisible ? (
            <aside
              aria-label="Información sobre los servicios y el guardado"
              className="flex items-start gap-2 rounded-lg border border-sky-200 bg-sky-50 p-3 text-sky-950"
            >
              <p className="min-w-0 flex-1 text-sm">
                Los servicios activos aparecen primero. Solo se conservan las operaciones enviadas;
                el texto que aún no enviaste puede perderse.
              </p>
              <Button
                type="button"
                variant="ghost"
                className="min-h-11 min-w-11 shrink-0 px-2 text-sky-950 hover:bg-sky-100"
                aria-label="Cerrar aviso"
                title="Cerrar aviso"
                onClick={dismissServiceIntroNotice}
              >
                <X aria-hidden="true" className="size-4" />
              </Button>
            </aside>
          ) : (
            <details className="rounded-md border border-sky-200 bg-sky-50/60 px-3 text-sm text-sky-950">
              <summary className="min-h-11 cursor-pointer py-3 font-medium">
                Información sobre la lista y los datos no enviados
              </summary>
              <p className="pb-3">
                Los servicios activos aparecen primero. Solo se conservan las operaciones enviadas;
                el texto que aún no enviaste puede perderse.
              </p>
            </details>
          )}
          {serviceIntroNoticeFeedback && (
            <p role="status" className="text-sm text-muted-foreground">
              {serviceIntroNoticeFeedback}
            </p>
          )}
          {!canWrite && (
            <p className="rounded-md bg-muted p-3 text-sm">
              Solo lectura: se requiere acceso EFA vigente para editar.
            </p>
          )}
          <div className="flex min-w-0 flex-col gap-2 rounded-md border p-2 sm:flex-row sm:items-center sm:justify-between sm:p-3">
            <p className="text-sm">
              {openOwnGuard
                ? `Guardia propia abierta desde ${formatEpisodeDate(openOwnGuard.startedAt)}.`
                : "Sin guardia propia abierta."}{" "}
              Solo se muestran servicios de la guardia abierta; no es el historial completo.
            </p>
            <Button asChild variant="outline" className="min-h-11 w-full sm:w-auto">
              <Link to="/guardia-efa">Volver a mi guardia EFA</Link>
            </Button>
          </div>
          {!queueReady && (
            <p role="status" className="rounded-md border p-3 text-sm">
              Preparando el almacenamiento local antes de habilitar guardados…
            </p>
          )}
          {!queueAvailable && queueReady && (
            <p role="alert" className="rounded-md border border-destructive/50 p-3 text-sm">
              La cola local no está disponible. No se enviará ninguna operación hasta poder
              conservarla primero en este dispositivo.
            </p>
          )}
          <p className="rounded-md bg-muted p-1 text-xs text-muted-foreground">
            Las operaciones enviadas y sus datos privados, incluida la dirección, se guardan en
            IndexedDB legible por este origen.
          </p>
          {queueError && (
            <p role="alert" className="text-sm text-destructive">
              {queueError}
            </p>
          )}
          {queueEntries.length > 0 && (
            <details className="rounded-md border p-3 text-sm">
              <summary className="min-h-11 cursor-pointer py-2 font-medium">
                Operaciones conservadas en este dispositivo ({queueEntries.length})
              </summary>
              <div className="space-y-2 pt-2">
                <Label htmlFor="episode-pending-operation">Seleccionar operación</Label>
                <select
                  id="episode-pending-operation"
                  className="min-h-11 w-full rounded-md border bg-background px-3"
                  value={selectedQueueOperationId.current ?? ""}
                  onChange={(event) => selectQueuedOperation(event.target.value)}
                  disabled={busy}
                >
                  <option value="">Selecciona una operación</option>
                  {queueEntries.map((entry) => (
                    <option
                      key={`${entry.ownerUserId}:${entry.operationId}`}
                      value={entry.operationId}
                    >
                      {queueOperationLabel(entry)} · {entry.createdAt} ·{" "}
                      {queueStatusLabel(entry.status)}
                    </option>
                  ))}
                </select>
                {queueEntries.map((entry) => (
                  <div
                    key={`${entry.ownerUserId}:${entry.operationId}`}
                    className="flex flex-col gap-2 border-t pt-2 sm:flex-row sm:items-center sm:justify-between"
                  >
                    <span>
                      {queueOperationLabel(entry)} · {queueStatusLabel(entry.status)}
                    </span>
                    {entry.status !== "pending" && (
                      <Button
                        type="button"
                        variant="outline"
                        className="min-h-11"
                        disabled={busy}
                        onClick={() => void discardPausedOperation(entry)}
                      >
                        Descartar esta operación pausada
                      </Button>
                    )}
                  </div>
                ))}
              </div>
            </details>
          )}
          {error && (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          )}
          {message && (
            <p role="status" className="text-sm text-green-700">
              {message}
            </p>
          )}
          {refreshWarning && (
            <p role="status" className="text-sm text-amber-800">
              {refreshWarning}
            </p>
          )}
          {pending && (
            <div className="rounded-md border border-amber-500/50 bg-amber-50 p-3 text-sm">
              Operación pendiente de confirmación. Los campos están congelados para conservar la
              misma identidad y el mismo contenido.
              {pendingQueueEntry?.status !== "pending" &&
                serverConfirmedOperationId !== pending.operationId && (
                  <span className="mt-1 block">
                    Estado pausado: requiere resolver el conflicto o el permiso antes de cualquier
                    reintento.
                  </span>
                )}
              <Button
                className="mt-3 min-h-11 w-full sm:w-auto"
                disabled={
                  busy ||
                  !canWrite ||
                  !queueReady ||
                  (serverConfirmedOperationId !== pending.operationId && !queueAvailable) ||
                  (serverConfirmedOperationId !== pending.operationId &&
                    pendingQueueEntry !== null &&
                    pendingQueueEntry?.status !== "pending")
                }
                onClick={() => void retryPending()}
              >
                {serverConfirmedOperationId === pending.operationId
                  ? "Limpiar cola local ya confirmada"
                  : pendingQueueEntry
                    ? "Reintentar misma operación"
                    : "Guardar operación localmente y reintentar"}
              </Button>
            </div>
          )}
          {conflict && (
            <Button
              variant="outline"
              className="min-h-11"
              disabled={busy}
              onClick={() => void loadServerVersion()}
            >
              Cargar versión actual del servidor
            </Button>
          )}
          {canWrite && !selected && !openOwnGuard && !pending && (
            <p className="rounded-md border p-3 text-sm">
              Para registrar un servicio, abre primero tu guardia EFA. Esta vista no muestra
              servicios de guardias anteriores.
            </p>
          )}
          {selected && canWrite && openOwnGuard && (
            <Button
              variant="outline"
              className="min-h-11"
              onClick={beginCreate}
              disabled={Boolean(pending) || Boolean(conflict)}
            >
              Nuevo servicio
            </Button>
          )}
        </CardContent>
      </Card>

      {canWrite && (selected || openOwnGuard) && (
        <Card>
          <CardHeader className="px-3 py-3 sm:px-6 sm:py-6">
            <CardTitle>{episodeFormTitle(selected)}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 px-3 pb-3 pt-0 sm:px-6 sm:pb-6">
            <div className="space-y-2">
              <Label htmlFor="episode-event-at">Fecha y hora del hecho</Label>
              <Input
                id="episode-event-at"
                className="h-11 min-h-11 w-full min-w-0 max-w-full"
                type="datetime-local"
                value={form.eventAt}
                disabled={!queueReady || busy || Boolean(pending) || Boolean(conflict)}
                onChange={(event) => setForm({ ...form, eventAt: event.target.value })}
              />
              <Button
                type="button"
                variant="outline"
                className="min-h-11"
                disabled={!queueReady || busy || Boolean(pending) || Boolean(conflict)}
                onClick={() => {
                  const ticket = ownerTicketRef.current;
                  const queue = queueModuleRef.current;
                  if (!ticket || !queue) return;
                  void queue
                    .setEpisodeEventAtForCurrentOwner(
                      ticket,
                      (currentTicket) => Boolean(ownerFenceRef.current?.isCurrent(currentTicket)),
                      () =>
                        episodeHelpersRef.current
                          ? Promise.resolve(episodeHelpersRef.current)
                          : loadEpisodeClientHelpers(),
                      new Date(),
                      setForm,
                    )
                    .catch(() => {
                      if (ownerFenceRef.current?.isCurrent(ticket)) {
                        setError(
                          "No se pudo completar la fecha actual; los demás datos no se modificaron.",
                        );
                      }
                    });
                }}
              >
                Usar ahora
              </Button>
              <p className="text-xs text-muted-foreground">
                Se interpreta en la zona horaria local del dispositivo y se conserva como un
                instante.
              </p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="episode-motive">Motivo (opcional)</Label>
              <Textarea
                id="episode-motive"
                maxLength={2000}
                value={form.motive}
                disabled={!queueReady || busy || Boolean(pending) || Boolean(conflict)}
                onChange={(event) => setForm({ ...form, motive: event.target.value })}
                placeholder="Describe brevemente la atención"
              />
            </div>
            <details className="rounded-md border p-3">
              <summary className="min-h-11 cursor-pointer py-2 font-medium">
                Datos opcionales de ubicación e intervención
              </summary>
              <div className="space-y-3 pt-3">
                <div className="space-y-2">
                  <Label htmlFor="episode-address">Dirección exacta (dato privado)</Label>
                  <Textarea
                    id="episode-address"
                    maxLength={1000}
                    value={form.address}
                    disabled={!queueReady || busy || Boolean(pending) || Boolean(conflict)}
                    onChange={(event) => setForm({ ...form, address: event.target.value })}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="episode-intervention">Número de intervención (opcional)</Label>
                  <Input
                    id="episode-intervention"
                    maxLength={100}
                    value={form.interventionNumber}
                    disabled={!queueReady || busy || Boolean(pending) || Boolean(conflict)}
                    onChange={(event) =>
                      setForm({ ...form, interventionNumber: event.target.value })
                    }
                  />
                </div>
              </div>
            </details>
            <p className="text-xs text-muted-foreground">
              Si no completas motivo ni dirección, el borrador se identifica por fecha y hora. El
              número de intervención conserva ceros iniciales.
            </p>
            {!selected && openOwnGuard && (
              <label
                htmlFor="episode-register-first-call"
                className="flex min-h-11 items-center gap-3 rounded-md border px-3 py-2 text-sm"
              >
                <input
                  id="episode-register-first-call"
                  type="checkbox"
                  className="size-4 shrink-0"
                  checked={registerFirstCall}
                  disabled={!queueReady || busy || Boolean(pending) || Boolean(conflict)}
                  onChange={(event) => setRegisterFirstCall(event.target.checked)}
                />
                <span>Registrar primera llamada</span>
              </label>
            )}
            <Button
              className="min-h-11 w-full sm:w-auto"
              disabled={
                !queueReady ||
                !queueAvailable ||
                busy ||
                Boolean(pending) ||
                Boolean(conflict) ||
                Boolean(serverConfirmedOperationId)
              }
              onClick={save}
            >
              {episodeSaveActionLabel(Boolean(selected), registerFirstCall)}
            </Button>
            {saveError && (
              <p role="alert" className="text-sm text-destructive">
                {saveError}
              </p>
            )}
          </CardContent>
        </Card>
      )}

      {initialCallContinuation &&
        (workspaceEpisodeId !== initialCallContinuation.episodeId ||
          activeWorkspaceSection !== "communications") && (
          <div role="status" className="rounded-md border border-sky-300 bg-sky-50 p-3 text-sm">
            El servicio y su primera llamada están guardados. Puedes continuar cuando quieras.
            <Button
              type="button"
              variant="outline"
              className="mt-2 min-h-11 w-full sm:w-auto"
              onClick={continueToInitialCall}
            >
              Continuar al servicio y su primera llamada
            </Button>
          </div>
        )}

      <Card>
        <CardHeader className="px-3 py-3 sm:px-6 sm:py-6">
          <CardTitle>Servicios de esta guardia</CardTitle>
        </CardHeader>
        <CardContent className="min-w-0 space-y-3 px-3 pb-3 pt-0 sm:px-6 sm:pb-6">
          {activeGuardEpisodes.length === 0 && (
            <p className="text-sm text-muted-foreground">
              {openOwnGuard
                ? "Todavía no hay servicios registrados en esta guardia."
                : "No hay una guardia EFA abierta para mostrar servicios."}
            </p>
          )}
          {activeGuardEpisodes.map((episode) => (
            <article
              key={episode.id}
              className={`min-w-0 space-y-2 rounded-lg border p-2 sm:space-y-2.5 sm:p-4 ${
                episode.cancelledAt
                  ? "border-rose-200 bg-rose-50/70 dark:border-rose-900 dark:bg-rose-950/20"
                  : episode.state === "closed"
                    ? "border-slate-200 bg-slate-50 dark:border-slate-800 dark:bg-slate-950/40"
                    : "border-sky-200 bg-sky-50/60 dark:border-sky-900 dark:bg-sky-950/20"
              }`}
            >
              <div className="space-y-1.5">
                <div className="flex min-w-0 flex-wrap items-center justify-between gap-x-3 gap-y-2">
                  <div className="flex min-w-0 flex-1 flex-wrap items-baseline gap-x-2 gap-y-1">
                    <h3 className="min-w-0 break-words font-semibold leading-5">
                      {displayName(episode)}
                    </h3>
                    <span
                      className={`inline-flex rounded-full px-2 py-1 text-xs font-medium ${
                        episode.cancelledAt
                          ? "bg-rose-100 text-rose-900 dark:bg-rose-950 dark:text-rose-100"
                          : episode.state === "closed"
                            ? "bg-muted text-muted-foreground"
                            : "bg-sky-50 text-sky-800"
                      }`}
                    >
                      {episode.cancelledAt
                        ? `Anulado · ${episode.cancelledFromState === "closed" ? "Cerrado" : "Activo"}`
                        : episode.state === "closed"
                          ? "Cerrado"
                          : "Activo"}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      Hecho {formatEpisodeDate(episode.eventAt)}
                    </span>
                  </div>
                  {canWrite && episode.canEdit && episode.state === "draft" && (
                    <Button
                      variant="outline"
                      className="min-h-11 max-w-full shrink-0 whitespace-normal border-slate-300 bg-slate-100 px-2.5 text-sm text-slate-900 hover:bg-slate-200 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100 dark:hover:bg-slate-700 sm:px-3"
                      disabled={
                        !queueReady ||
                        !queueAvailable ||
                        busy ||
                        Boolean(pending) ||
                        Boolean(conflict) ||
                        formDirty ||
                        Boolean(serverConfirmedOperationId)
                      }
                      onClick={() =>
                        setClosingServiceTarget({
                          key: episodeCloseTargetKey(episode),
                          episodeId: episode.id,
                        })
                      }
                    >
                      <LockKeyhole aria-hidden="true" className="size-4" />
                      Cerrar servicio
                    </Button>
                  )}
                </div>
                {workspaceEpisodeId !== episode.id && (
                  <div className="flex min-w-0">
                    <Button
                      variant="outline"
                      className="min-h-11 max-w-full border-sky-200 bg-sky-50 px-2.5 text-sm text-sky-950 hover:bg-sky-100 dark:border-sky-800 dark:bg-sky-950/40 dark:text-sky-100 dark:hover:bg-sky-950/60 sm:px-3"
                      aria-label={`Abrir área de trabajo de ${accessibleDisplayName(episode)}`}
                      onClick={() => openWorkspace(episode.id, "communications")}
                    >
                      <PanelsTopLeft aria-hidden="true" className="size-4" />
                      Abrir área
                    </Button>
                  </div>
                )}
                <EfaActionConfirmation
                  open={closingServiceTarget?.episodeId === episode.id}
                  onOpenChange={(open) => {
                    if (!open) setClosingServiceTarget(null);
                  }}
                  capturedTargetKey={
                    closingServiceTarget?.episodeId === episode.id ? closingServiceTarget.key : null
                  }
                  currentTargetKey={episodeCloseTargetKey(episode)}
                  title="Cerrar servicio"
                  description="El servicio quedará cerrado y no podrá reabrirse. La guardia y sus llamadas, despachos y otros registros se conservarán sin cambios."
                  confirmLabel="Cerrar servicio"
                  onConfirm={(targetKey) => closeService(episode.id, targetKey)}
                />
                <details className="border-t pt-2">
                  <summary className="min-h-11 cursor-pointer py-3 font-medium">
                    Ver detalles
                  </summary>
                  <div className="space-y-3 pt-1">
                    <p className="text-xs text-muted-foreground">
                      Capturado {formatEpisodeDate(episode.createdAt)} · actualizado{" "}
                      {formatEpisodeDate(episode.updatedAt)} · versión {episode.version}
                    </p>
                    <div className="flex flex-wrap gap-1.5">
                      <Button
                        variant="outline"
                        className="min-h-11 border-indigo-200 bg-indigo-50 px-3 text-indigo-950 hover:bg-indigo-100 dark:border-indigo-800 dark:bg-indigo-950/40 dark:text-indigo-100 dark:hover:bg-indigo-950/60"
                        disabled={busy}
                        onClick={() => showHistory(episode.id)}
                      >
                        <History aria-hidden="true" className="size-4" />
                        Ver historial
                      </Button>
                      {canWrite &&
                        episode.canManage &&
                        (episode.cancelledAt ? (
                          <Button
                            variant="outline"
                            className="min-h-11 border-emerald-200 bg-emerald-50 px-3 text-emerald-950 hover:bg-emerald-100"
                            disabled={busy || Boolean(pending) || Boolean(conflict)}
                            aria-label={`Reactivar episodio ${displayName(episode)}`}
                            onClick={() => void changeEpisodeCancellation(episode, "reactivate")}
                          >
                            Reactivar
                          </Button>
                        ) : (
                          <Button
                            variant="outline"
                            className="min-h-11 border-rose-200 bg-rose-50 px-3 text-rose-950 hover:bg-rose-100"
                            disabled={busy || Boolean(pending) || Boolean(conflict)}
                            aria-label={`Anular episodio ${displayName(episode)}`}
                            onClick={() => void changeEpisodeCancellation(episode, "cancel")}
                          >
                            Anular
                          </Button>
                        ))}
                      {canWrite && episode.canEdit && (
                        <Button
                          variant="outline"
                          className="min-h-11 border-amber-200 bg-amber-50 px-3 text-amber-950 hover:bg-amber-100 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-100"
                          disabled={!queueReady || busy || Boolean(pending) || Boolean(conflict)}
                          onClick={() => editEpisode(episode)}
                        >
                          <Pencil aria-hidden="true" className="size-4" />
                          Editar
                        </Button>
                      )}
                    </div>
                  </div>
                </details>
              </div>
              {workspaceEpisodeId === episode.id && (
                <EfaEpisodeWorkspace
                  key={`${currentUserId}:${episode.id}`}
                  episodeLabel={accessibleDisplayName(episode)}
                  activeSection={activeWorkspaceSection}
                  onSelectSection={(section) => openWorkspace(episode.id, section)}
                >
                  {visitedWorkspaceSections.has("communications") && (
                    <div hidden={activeWorkspaceSection !== "communications"}>
                      <EfaCommunicationPanel
                        episodeId={episode.id}
                        episodeLabel={accessibleDisplayName(episode)}
                        currentUserId={currentUserId}
                        canWrite={canWrite}
                        episodeCanEdit={episode.canEdit}
                        episode={{ eventAt: episode.eventAt, address: episode.address }}
                        initialCallTarget={
                          initialCallContinuation?.episodeId === episode.id &&
                          activeWorkspaceSection === "communications"
                            ? {
                                operationId: initialCallContinuation.operationId,
                                communicationId: initialCallContinuation.communicationId,
                              }
                            : null
                        }
                        onContinueToDispatches={() => {
                          openWorkspace(episode.id, "dispatches");
                        }}
                        onInitialCallSelected={(operationId, communicationId) => {
                          setInitialCallContinuation((current) => {
                            if (
                              current?.operationId !== operationId ||
                              current.communicationId !== communicationId
                            )
                              return current;
                            initialCallContinuationRef.current = null;
                            return null;
                          });
                        }}
                      />
                    </div>
                  )}
                  {visitedWorkspaceSections.has("dispatches") && (
                    <div hidden={activeWorkspaceSection !== "dispatches"}>
                      <EfaDispatchStepper
                        episodeId={episode.id}
                        episodeLabel={accessibleDisplayName(episode)}
                        currentUserId={currentUserId}
                        canWrite={canWrite}
                        episodeCanEdit={episode.canEdit}
                      />
                    </div>
                  )}
                  {visitedWorkspaceSections.has("police") && (
                    <div hidden={activeWorkspaceSection !== "police"}>
                      <EfaPoliceCoordinationPanel
                        episodeId={episode.id}
                        episodeLabel={accessibleDisplayName(episode)}
                        currentUserId={currentUserId}
                        canWrite={canWrite}
                        episodeCanEdit={episode.canEdit}
                        isActive={activeWorkspaceSection === "police"}
                      />
                    </div>
                  )}
                  {visitedWorkspaceSections.has("observations") && (
                    <div hidden={activeWorkspaceSection !== "observations"}>
                      <EfaObservationPanel
                        root={{
                          guardId: episode.originGuardId,
                          episodeId: episode.id,
                          ownerUserId: episode.ownerUserId,
                          guardEndedAt: null,
                        }}
                        title="Conductas observadas"
                        compact
                        currentUserId={currentUserId}
                        canWrite={canWrite}
                        isAdmin={isAdmin}
                      />
                    </div>
                  )}
                </EfaEpisodeWorkspace>
              )}
              {historyFor === episode.id && (
                <details className="border-t pt-3" open>
                  <summary className="min-h-11 cursor-pointer py-2 font-medium">
                    Resumen del servicio
                  </summary>
                  <div className="pt-2">
                    <EfaEpisodeSummary key={episode.id} episode={episode} />
                  </div>
                </details>
              )}
            </article>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="px-3 py-3 sm:px-6 sm:py-6">
          <CardTitle>Avisos de corrección</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 px-3 pb-3 pt-0 sm:px-6 sm:pb-6">
          {notices.length === 0 && (
            <p className="text-sm text-muted-foreground">No tienes avisos pendientes.</p>
          )}
          {notices.map((notice) => (
            <div
              key={notice.id}
              className="flex flex-col gap-3 rounded-md border p-3 sm:flex-row sm:items-center sm:justify-between"
            >
              <div>
                <p className="text-sm">Un administrador corrigió un episodio.</p>
                <p className="text-xs text-muted-foreground">
                  Aviso del {formatEpisodeDate(notice.createdAt)}
                  {notice.readAt ? ` · leído ${formatEpisodeDate(notice.readAt)}` : ""}
                </p>
              </div>
              {!notice.readAt && (
                <Button
                  variant="outline"
                  className="min-h-11"
                  disabled={busy}
                  onClick={() => void markRead(notice.id)}
                >
                  Marcar como leído
                </Button>
              )}
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
