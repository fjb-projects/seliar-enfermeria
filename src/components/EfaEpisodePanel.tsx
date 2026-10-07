import { useEffect, useRef, useState } from "react";
import { createClientOnlyFn, useServerFn } from "@tanstack/react-start";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { EfaCommunicationPanel } from "@/components/EfaCommunicationStepper";
import { EfaDispatchStepper } from "@/components/EfaDispatchStepper";
import { EfaPoliceCoordinationPanel } from "@/components/EfaPoliceCoordinationPanel";
import {
  createEfaEpisode,
  getEfaEpisode,
  getEfaEpisodeHistory,
  listEfaEpisodes,
  listEfaEpisodeNotices,
  markEfaEpisodeNoticeRead,
  updateEfaEpisode,
} from "@/lib/efa-episodes.functions";
import type {
  EpisodeFormValues,
  EpisodeFormSource,
  PendingEpisodeCreate,
  PendingEpisodeUpdate,
} from "@/lib/efa-episodes.client";
import type {
  EpisodeQueueEntry,
  EpisodeQueueOwnerTicket,
  EpisodeQueueOutcome,
  EpisodeQueueStore,
} from "@/lib/efa-episodes.queue";

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
  state: "draft";
  version: number;
  createdAt: string;
  updatedAt: string;
  canEdit: boolean;
};
type ActiveEpisodeConflict = {
  ownerUserId: string;
  operationId: string;
  episodeId: string;
};
export type EpisodeAuditView = {
  id: string;
  episodeId: string;
  actorUserId: string;
  action: "created" | "updated";
  versionBefore: number | null;
  versionAfter: number;
  beforeState: Record<string, unknown> | null;
  afterState: Record<string, unknown>;
  occurredAt: string;
};
export type EpisodeNoticeView = {
  id: string;
  episodeId: string;
  createdAt: string;
  readAt: string | null;
};
type EpisodeMutationResult = {
  episode: EpisodeView;
  operation: { id: string; appliedVersion: number; changed: boolean; replayed: boolean };
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
// eslint-disable-next-line react-refresh/only-export-components
export const formatEpisodeDate = (value: Date | string) =>
  new Date(value).toLocaleString("es-AR", { timeZone: "America/Argentina/Buenos_Aires" });
type EpisodeClientHelpers = typeof import("@/lib/efa-episodes.client");

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
  const updateEpisode = useServerFn(updateEfaEpisode);
  const listEpisodes = useServerFn(listEfaEpisodes);
  const listNotices = useServerFn(listEfaEpisodeNotices);
  const getEpisode = useServerFn(getEfaEpisode);
  const getHistory = useServerFn(getEfaEpisodeHistory);
  const acknowledgeNotice = useServerFn(markEfaEpisodeNoticeRead);
  const [episodes, setEpisodes] = useState(initialEpisodes);
  const [notices, setNotices] = useState(initialNotices);
  const [form, setForm] = useState<EpisodeFormValues>(emptyForm);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [history, setHistory] = useState<EpisodeAuditView[]>([]);
  const [historyFor, setHistoryFor] = useState<string | null>(null);
  const [selectedCommunicationEpisodeId, setSelectedCommunicationEpisodeId] = useState<
    string | null
  >(null);
  const [selectedDispatchEpisodeId, setSelectedDispatchEpisodeId] = useState<string | null>(null);
  const [selectedPoliceEpisodeId, setSelectedPoliceEpisodeId] = useState<string | null>(null);
  const [pending, setPending] = useState<PendingEpisodeCreate | PendingEpisodeUpdate | null>(null);
  const [conflict, setConflict] = useState<ActiveEpisodeConflict | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [refreshWarning, setRefreshWarning] = useState("");
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

  function setActiveConflict(next: ActiveEpisodeConflict | null) {
    conflictRef.current = next;
    setConflict(next);
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
  const pendingQueueEntry = pending
    ? (queueEntries.find(
        (entry) => entry.ownerUserId === currentUserId && entry.operationId === pending.operationId,
      ) ?? null)
    : null;
  const displayName = (episode: EpisodeView) =>
    episode.motive || episode.address || `Episodio del ${formatEpisodeDate(episode.eventAt)}`;
  const queueStatusLabel = (status: EpisodeQueueEntry["status"]) =>
    status === "pending"
      ? "pendiente"
      : status === "paused-conflict"
        ? "pausada por conflicto"
        : "pausada por permisos";

  function beginCreate() {
    if (!queueReady || !queueAvailable || pendingRef.current) return;
    setSelectedId(null);
    setActiveConflict(null);
    setForm(emptyForm());
    setError("");
    setMessage("");
  }

  function editEpisode(episode: EpisodeView) {
    if (!canWrite || !queueReady || !episode.canEdit) return;
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
    setMessage("");
  }

  async function refreshAfterWrite(
    saved: EpisodeView,
    operationVersion: number,
    helpers: EpisodeClientHelpers,
    ticket: EpisodeQueueOwnerTicket,
    operationId: string,
  ) {
    try {
      const [nextEpisodes, nextNotices] = await Promise.all([listEpisodes(), listNotices()]);
      if (!ownerFenceRef.current?.isCurrent(ticket)) return;
      const baseline = helpers.confirmedEpisodeBaseline(saved, nextEpisodes as EpisodeFormSource[]);
      const syncEditor = Boolean(
        queueModuleRef.current?.shouldSyncEpisodeOperationToEditor(
          operationId,
          pendingRef.current?.operationId ?? null,
          selectedQueueOperationId.current,
        ),
      );
      setEpisodes(nextEpisodes as EpisodeView[]);
      setNotices(nextNotices as EpisodeNoticeView[]);
      if (syncEditor) {
        setError("");
        setRefreshWarning("");
        setForm(baseline.form);
      }
    } catch {
      if (!ownerFenceRef.current?.isCurrent(ticket)) return;
      const baseline = helpers.confirmedEpisodeBaseline(saved, []);
      const syncEditor = Boolean(
        queueModuleRef.current?.shouldSyncEpisodeOperationToEditor(
          operationId,
          pendingRef.current?.operationId ?? null,
          selectedQueueOperationId.current,
        ),
      );
      setEpisodes((current) => [saved, ...current.filter((item) => item.id !== saved.id)]);
      if (syncEditor) {
        setError("");
        setForm(baseline.form);
        setRefreshWarning("El guardado quedó confirmado, pero no se pudo actualizar el historial.");
      }
    }
    setMessage(`Guardado confirmado (versión ${operationVersion}).`);
    if (
      queueModuleRef.current?.shouldSyncEpisodeOperationToEditor(
        operationId,
        pendingRef.current?.operationId ?? null,
        selectedQueueOperationId.current,
      )
    ) {
      setSelectedId(saved.id);
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
    const restored = queue.restoreQueuedEpisode(entry);
    selectedQueueOperationId.current = entry.operationId;
    setPending(restored.operation);
    pendingRef.current = restored.operation;
    setForm(restored.form);
    setError("");
    setMessage("");
    setServerConfirmedOperationId(null);
    const episodeId =
      entry.kind === "update" ? (entry.payload as PendingEpisodeUpdate["payload"]).episodeId : null;
    setSelectedId(episodeId);
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
    }
  }

  async function applyQueueOutcome(
    outcome: EpisodeQueueOutcome<EpisodeMutationResult>,
    ticket: EpisodeQueueOwnerTicket,
    operation: PendingEpisodeCreate | PendingEpisodeUpdate,
  ) {
    if (!ownerFenceRef.current?.isCurrent(ticket)) return;
    const queue = queueModuleRef.current;
    if (!queue) return;
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
    if (outcome.status === "confirmed" || outcome.status === "confirmed-cleanup-failed") {
      const result = outcome.result;
      const helpers = episodeHelpersRef.current ?? (await loadEpisodeClientHelpers());
      episodeHelpersRef.current = helpers;
      if (!ownerFenceRef.current?.isCurrent(ticket)) return;
      await refreshAfterWrite(
        result.episode,
        result.operation.appliedVersion,
        helpers,
        ticket,
        operation.operationId,
      );
      if (!ownerFenceRef.current?.isCurrent(ticket)) return;
      const syncEditor = queue.shouldSyncEpisodeOperationToEditor(
        operation.operationId,
        pendingRef.current?.operationId ?? null,
        selectedQueueOperationId.current,
      );
      if (outcome.status === "confirmed-cleanup-failed") {
        if (syncEditor) {
          setPending(operation);
          pendingRef.current = operation;
          setServerConfirmedOperationId(operation.operationId);
          setMessage(
            "Guardado confirmado en el servidor; no se pudo limpiar la cola local. No vuelvas a enviarlo.",
          );
        }
      } else if (syncEditor) {
        selectedQueueOperationId.current = null;
        if (operation.kind === "create") {
          setForm(emptyForm());
          setSelectedId(null);
        }
      }
      return;
    }
    const operationIsSelected = queue.isSelectedEpisodeQueueOperation(
      {
        ownerUserId: ticket.ownerUserId,
        operationId: operation.operationId,
        episodeId: operation.kind === "update" ? operation.payload.episodeId : "",
      },
      activeUserRef.current,
      pendingRef.current?.operationId ?? null,
      selectedQueueOperationId.current,
    );
    if (outcome.status === "paused-conflict" && operation.kind === "update") {
      if (!operationIsSelected) return;
      setActiveConflict({
        ownerUserId: ticket.ownerUserId,
        operationId: operation.operationId,
        episodeId: operation.payload.episodeId,
      });
      setError(
        "El borrador cambió en otra sesión. Tus datos locales siguen pendientes; carga la versión actual para resolver el conflicto.",
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
    return entry.kind === "create"
      ? ((await createEpisode({
          data: entry.payload as PendingEpisodeCreate["payload"],
        })) as EpisodeMutationResult)
      : ((await updateEpisode({
          data: entry.payload as PendingEpisodeUpdate["payload"],
        })) as EpisodeMutationResult);
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
          } as PendingEpisodeCreate | PendingEpisodeUpdate);
        } catch {
          if (!ownerFenceRef.current?.isCurrent(ticket)) return;
          if (outcome.status === "confirmed" || outcome.status === "confirmed-cleanup-failed") {
            const restored = {
              kind: entry.kind,
              operationId: entry.operationId,
              payload: entry.payload,
            } as PendingEpisodeCreate | PendingEpisodeUpdate;
            setPending(restored);
            pendingRef.current = restored;
            setServerConfirmedOperationId(entry.operationId);
            setMessage(
              "Guardado confirmado en el servidor; falló una actualización visual. No se reenviará.",
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
    setSelectedId(null);
    setActiveConflict(null);
    setHistory([]);
    setHistoryFor(null);
    setEpisodes(initialEpisodes);
    setNotices(initialNotices);
    setForm(emptyForm());
    setQueueError("");
    setError("");
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
    const ticket = ownerTicketRef.current;
    if (!ticket || ticket.ownerUserId !== currentUserId) return;
    void submissionGate.current
      .run(async () => {
        if (!ownerFenceRef.current?.isCurrent(ticket)) return;
        setBusy(true);
        setError("");
        try {
          const helpers = episodeHelpersRef.current ?? (await loadEpisodeClientHelpers());
          episodeHelpersRef.current = helpers;
          if (!ownerFenceRef.current?.isCurrent(ticket)) return;
          const validation = helpers.validateEpisodeForm(form);
          if (!validation.valid) {
            setError("Indica una fecha y hora válidas para el episodio.");
            return;
          }
          const normalized = { ...form, eventAt: validation.eventAt };
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
              ? helpers.createPendingCreate(openOwnGuard.id, normalized)
              : null;
          if (!operation) {
            setError("Para crear un episodio necesitas una guardia propia abierta.");
            return;
          }
          setPending(operation);
          pendingRef.current = operation;
          const entry: EpisodeQueueEntry = {
            ownerUserId: currentUserId,
            operationId: operation.operationId,
            kind: operation.kind,
            payload: structuredClone(operation.payload),
            status: "pending",
            createdAt: new Date().toISOString(),
          };
          selectedQueueOperationId.current = operation.operationId;
          await runQueueEntry(entry, "enqueue");
        } catch {
          setError(
            "No se pudo preparar el borrador para guardar. Tus datos permanecen en esta pantalla.",
          );
        } finally {
          if (ownerFenceRef.current?.isCurrent(ticket)) setBusy(false);
        }
      })
      .catch(() => {
        if (ownerFenceRef.current?.isCurrent(ticket))
          setError("No se pudo preparar el borrador para guardar.");
      });
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
      const { isoToLocalDateTimeValue } = await loadEpisodeClientHelpers();
      if (!isActiveConflict(selectedConflict, ticket)) return;
      const queue = queueModuleRef.current;
      const queuedEntry = queue?.selectEpisodeQueueEntry(
        queueEntriesRef.current,
        selectedConflict.ownerUserId,
        selectedConflict.operationId,
      );
      const controller = queueControllerRef.current;
      if (
        !queuedEntry ||
        queuedEntry.kind !== "update" ||
        (queuedEntry.payload as PendingEpisodeUpdate["payload"]).episodeId !==
          selectedConflict.episodeId ||
        !controller
      )
        return;
      await controller.removeResolved(selectedConflict.ownerUserId, selectedConflict.operationId);
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
      setSelectedId(latest.id);
      setForm({
        eventAt: isoToLocalDateTimeValue(latest.eventAt),
        motive: latest.motive ?? "",
        address: latest.address ?? "",
        interventionNumber: latest.interventionNumber ?? "",
      });
      setActiveConflict(null);
      if (pendingRef.current?.operationId === selectedConflict.operationId) {
        setPending(null);
        pendingRef.current = null;
      }
      if (selectedQueueOperationId.current === selectedConflict.operationId) {
        selectedQueueOperationId.current = null;
      }
      setMessage("Se cargó la versión actual del servidor. Revisa los datos antes de guardar.");
    } catch {
      if (!isActiveConflict(selectedConflict, ticket)) return;
      setError("No se pudo cargar la versión actual. Tus datos no se modificaron.");
    } finally {
      if (ownerFenceRef.current?.isCurrent(ticket)) setBusy(false);
    }
  }

  async function showHistory(episodeId: string) {
    const ticket = ownerTicketRef.current;
    if (!ticket) return;
    setBusy(true);
    setError("");
    try {
      const rows = (await getHistory({ data: episodeId })) as EpisodeAuditView[];
      if (!ownerFenceRef.current?.isCurrent(ticket)) return;
      setHistory(rows);
      setHistoryFor(episodeId);
    } catch {
      if (!ownerFenceRef.current?.isCurrent(ticket)) return;
      setError("No se pudo cargar el historial autorizado.");
    } finally {
      if (ownerFenceRef.current?.isCurrent(ticket)) setBusy(false);
    }
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
    <div className="space-y-5">
      <Card>
        <CardHeader>
          <CardTitle>Episodios de atención</CardTitle>
          <p className="text-sm text-muted-foreground">
            Los episodios se guardan como borradores. Solo las operaciones enviadas se conservan en
            este dispositivo; el texto que aún no enviaste puede perderse.
          </p>
        </CardHeader>
        <CardContent className="space-y-4">
          {!canWrite && (
            <p className="rounded-md bg-muted p-3 text-sm">
              Solo lectura: conservas el acceso a tu historial, pero se requiere acceso EFA vigente
              para editar.
            </p>
          )}
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
          <p className="rounded-md bg-muted p-3 text-xs text-muted-foreground">
            Las operaciones enviadas y sus datos privados, incluida la dirección, se guardan en
            IndexedDB legible por este origen. No es una bóveda segura; evita usar dispositivos
            compartidos. No se almacenan credenciales ni sesiones.
          </p>
          {queueError && (
            <p role="alert" className="text-sm text-destructive">
              {queueError}
            </p>
          )}
          {queueEntries.length > 0 && (
            <div className="space-y-2">
              <Label htmlFor="episode-pending-operation">Operación local pendiente</Label>
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
                    {entry.kind === "create" ? "Creación" : "Actualización"} · {entry.createdAt} ·{" "}
                    {queueStatusLabel(entry.status)} · {entry.operationId.slice(-6)}
                  </option>
                ))}
              </select>
            </div>
          )}
          {queueEntries.length > 0 && (
            <div className="space-y-2 rounded-md border p-3 text-sm">
              <p className="font-medium">Operaciones conservadas en este dispositivo</p>
              {queueEntries.map((entry) => (
                <div
                  key={`${entry.ownerUserId}:${entry.operationId}`}
                  className="flex flex-col gap-2 border-t pt-2 sm:flex-row sm:items-center sm:justify-between"
                >
                  <span>
                    {entry.kind === "create" ? "Creación" : "Actualización"} · {entry.createdAt} ·{" "}
                    {queueStatusLabel(entry.status)}
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
          {canWrite && !selected && openOwnGuard && !pending && !conflict && (
            <Button
              className="min-h-11 w-full sm:w-auto"
              disabled={!queueReady || !queueAvailable}
              onClick={beginCreate}
            >
              Nuevo episodio
            </Button>
          )}
          {canWrite && !selected && !openOwnGuard && !pending && (
            <p className="rounded-md border p-3 text-sm">
              Para iniciar un episodio nuevo, abre primero tu guardia EFA. Los borradores existentes
              pueden completarse aunque su guardia haya terminado.
            </p>
          )}
          {selected && canWrite && selected.canEdit && (
            <Button
              variant="outline"
              className="min-h-11"
              onClick={beginCreate}
              disabled={Boolean(pending) || Boolean(conflict)}
            >
              Dejar de editar
            </Button>
          )}
        </CardContent>
      </Card>

      {canWrite && (selected || (!selected && openOwnGuard && message === "")) && (
        <Card>
          <CardHeader>
            <CardTitle>
              {selected ? `Editar borrador · versión ${selected.version}` : "Nuevo borrador"}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="episode-event-at">Fecha y hora del hecho</Label>
              <Input
                id="episode-event-at"
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
              <div className="space-y-4 pt-3">
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
              Guardar borrador
            </Button>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>{isAdmin ? "Historial de episodios" : "Mis episodios"}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {episodes.length === 0 && (
            <p className="text-sm text-muted-foreground">Todavía no hay episodios guardados.</p>
          )}
          {episodes.map((episode) => (
            <article key={episode.id} className="space-y-3 rounded-lg border p-4">
              <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                <div className="min-w-0">
                  <h3 className="font-medium">{displayName(episode)}</h3>
                  <p className="text-sm text-muted-foreground">
                    Borrador · hecho {formatEpisodeDate(episode.eventAt)}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Capturado {formatEpisodeDate(episode.createdAt)} · actualizado{" "}
                    {formatEpisodeDate(episode.updatedAt)} · versión {episode.version}
                  </p>
                  {isAdmin && (
                    <p className="text-xs text-muted-foreground">Autor: {episode.ownerUserId}</p>
                  )}
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button
                    variant="outline"
                    className="min-h-11"
                    onClick={() => setSelectedCommunicationEpisodeId(episode.id)}
                  >
                    Ver llamadas
                  </Button>
                  <Button
                    variant="outline"
                    className="min-h-11"
                    onClick={() => setSelectedDispatchEpisodeId(episode.id)}
                  >
                    Ver despachos
                  </Button>
                  <Button
                    variant="outline"
                    className="min-h-11"
                    onClick={() => setSelectedPoliceEpisodeId(episode.id)}
                  >
                    Ver coordinación policial
                  </Button>
                  <Button
                    variant="outline"
                    className="min-h-11"
                    disabled={busy}
                    onClick={() => void showHistory(episode.id)}
                  >
                    Ver historial
                  </Button>
                  {canWrite && episode.canEdit && (
                    <Button
                      variant="secondary"
                      className="min-h-11"
                      disabled={!queueReady || busy || Boolean(pending) || Boolean(conflict)}
                      onClick={() => editEpisode(episode)}
                    >
                      Editar
                    </Button>
                  )}
                </div>
              </div>
              {historyFor === episode.id && (
                <div className="space-y-3 border-t pt-3">
                  <h4 className="font-medium">Cambios registrados</h4>
                  {history.map((item) => (
                    <div key={item.id} className="rounded-md bg-muted p-3 text-sm">
                      <p>
                        {item.action === "created" ? "Creación" : "Corrección"} · versión{" "}
                        {item.versionBefore ?? "—"} → {item.versionAfter} ·{" "}
                        {formatEpisodeDate(item.occurredAt)}
                      </p>
                      <dl className="mt-2 grid gap-2 sm:grid-cols-2">
                        <div>
                          <dt className="font-medium">Antes</dt>
                          <dd className="break-words">
                            {item.beforeState
                              ? JSON.stringify(item.beforeState)
                              : "Sin estado previo"}
                          </dd>
                        </div>
                        <div>
                          <dt className="font-medium">Después</dt>
                          <dd className="break-words">{JSON.stringify(item.afterState)}</dd>
                        </div>
                      </dl>
                    </div>
                  ))}
                </div>
              )}
            </article>
          ))}
        </CardContent>
      </Card>

      {selectedCommunicationEpisodeId &&
        (() => {
          const communicationEpisode = episodes.find(
            (episode) => episode.id === selectedCommunicationEpisodeId,
          );
          return communicationEpisode ? (
            <section key={`${currentUserId}:${communicationEpisode.id}`} className="space-y-3">
              <Button
                type="button"
                variant="outline"
                className="min-h-11"
                onClick={() => setSelectedCommunicationEpisodeId(null)}
              >
                Cerrar llamadas
              </Button>
              <EfaCommunicationPanel
                episodeId={communicationEpisode.id}
                episodeLabel={displayName(communicationEpisode)}
                currentUserId={currentUserId}
                canWrite={canWrite}
                episodeCanEdit={communicationEpisode.canEdit}
              />
            </section>
          ) : null;
        })()}

      {selectedDispatchEpisodeId &&
        (() => {
          const dispatchEpisode = episodes.find(
            (episode) => episode.id === selectedDispatchEpisodeId,
          );
          return dispatchEpisode ? (
            <section key={`${currentUserId}:${dispatchEpisode.id}`} className="space-y-3">
              <Button
                type="button"
                variant="outline"
                className="min-h-11"
                onClick={() => setSelectedDispatchEpisodeId(null)}
              >
                Cerrar despachos
              </Button>
              <EfaDispatchStepper
                episodeId={dispatchEpisode.id}
                episodeLabel={displayName(dispatchEpisode)}
                currentUserId={currentUserId}
                canWrite={canWrite}
                episodeCanEdit={dispatchEpisode.canEdit}
              />
            </section>
          ) : null;
        })()}

      {selectedPoliceEpisodeId &&
        (() => {
          const policeEpisode = episodes.find((episode) => episode.id === selectedPoliceEpisodeId);
          return policeEpisode ? (
            <section key={`${currentUserId}:${policeEpisode.id}`} className="space-y-3">
              <Button
                type="button"
                variant="outline"
                className="min-h-11"
                onClick={() => setSelectedPoliceEpisodeId(null)}
              >
                Cerrar coordinación policial
              </Button>
              <EfaPoliceCoordinationPanel
                episodeId={policeEpisode.id}
                episodeLabel={displayName(policeEpisode)}
                currentUserId={currentUserId}
                canWrite={canWrite}
                episodeCanEdit={policeEpisode.canEdit}
              />
            </section>
          ) : null;
        })()}

      <Card>
        <CardHeader>
          <CardTitle>Avisos de corrección</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
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
