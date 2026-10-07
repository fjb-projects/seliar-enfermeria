import { Button } from "@/components/ui/button";
import { useEffect, useRef, useState } from "react";
import { createClientOnlyFn, useServerFn } from "@tanstack/react-start";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  createEfaCommunication,
  cancelEfaCommunication,
  finalizeEfaCommunication,
  getEfaCommunicationHistory,
  listEfaCommunicationsForEpisode,
  listEfaCommunicationNotices,
  markEfaCommunicationNoticeRead,
  reactivateEfaCommunication,
  updateEfaCommunication,
} from "@/lib/efa-communications.functions";
import type {
  EfaCommunicationAuditRecord,
  EfaCommunicationMutationResult,
  EfaCommunicationStatus,
  EfaCommunicationView,
} from "@/lib/efa-communications.server";
import type {
  CommunicationQueueEntry,
  CommunicationQueueStore,
} from "@/lib/efa-communications.queue";

const loadCommunicationClient = createClientOnlyFn(() => import("@/lib/efa-communications.client"));
const loadCommunicationQueue = createClientOnlyFn(() => import("@/lib/efa-communications.queue"));

// eslint-disable-next-line react-refresh/only-export-components
export const communicationSteps = [
  "Dirección",
  "Inicio real",
  "Fin real",
  "Prioridad",
  "Revisión",
] as const;

// eslint-disable-next-line react-refresh/only-export-components
export function createCommunicationSubmissionGate() {
  let submitting = false;
  return {
    acquire(): (() => void) | null {
      if (submitting) return null;
      submitting = true;
      let released = false;
      return () => {
        if (released) return;
        released = true;
        submitting = false;
      };
    },
  };
}

export function communicationLifecycleAction(
  state: EfaCommunicationStatus,
): "cancel" | "reactivate" {
  return state === "cancelled" ? "reactivate" : "cancel";
}

export function EfaCommunicationStepper({
  step,
  onStepChange,
  children,
}: {
  step: number;
  onStepChange: (step: number) => void;
  children: React.ReactNode;
}) {
  const currentStep = Math.min(Math.max(step, 0), communicationSteps.length - 1);
  const stepName = communicationSteps[currentStep];

  return (
    <section aria-labelledby="communication-step-heading" className="space-y-4">
      <div className="space-y-3">
        <div className="flex items-center justify-between gap-3">
          <h3 id="communication-step-heading" className="text-base font-semibold">
            Paso {currentStep + 1} de {communicationSteps.length}: {stepName}
          </h3>
          <span className="text-sm text-muted-foreground" aria-hidden="true">
            {currentStep + 1}/{communicationSteps.length}
          </span>
        </div>
        <progress
          className="h-2 w-full accent-primary"
          aria-label="Progreso de la llamada"
          value={currentStep + 1}
          max={communicationSteps.length}
        />
        <ol aria-label="Pasos para registrar la llamada" className="flex gap-1.5">
          {communicationSteps.map((label, index) => (
            <li key={label} className="min-w-0 flex-1">
              <button
                type="button"
                className={`min-h-11 w-full rounded-md border px-1 text-xs sm:text-sm ${
                  index === currentStep ? "border-primary bg-primary/10 font-semibold" : ""
                }`}
                aria-current={index === currentStep ? "step" : undefined}
                aria-label={`Ir al paso ${index + 1}: ${label}`}
                onClick={() => onStepChange(index)}
              >
                <span className="hidden sm:inline">{label}</span>
                <span className="sm:hidden">{index + 1}</span>
              </button>
            </li>
          ))}
        </ol>
      </div>

      <div aria-live="polite">{children}</div>

      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-between">
        <Button
          type="button"
          variant="outline"
          className="min-h-11"
          disabled={currentStep === 0}
          onClick={() => onStepChange(currentStep - 1)}
        >
          Paso anterior
        </Button>
        <Button
          type="button"
          className="min-h-11"
          disabled={currentStep === communicationSteps.length - 1}
          onClick={() => onStepChange(currentStep + 1)}
        >
          Siguiente paso
        </Button>
      </div>
    </section>
  );
}

type CommunicationStep = (typeof communicationSteps)[number];
type CommunicationNotice = {
  id: string;
  communicationId: string;
  createdAt: string;
  readAt: string | null;
};
type CommunicationHistory = Omit<EfaCommunicationAuditRecord, "occurredAt"> & {
  occurredAt: string;
};
type FormTimes = { startedAt: string; endedAt: string };
type Direction = "incoming" | "outgoing";
type Priority = "red" | "yellow" | "green";

const nowBue = (value: string) =>
  new Date(value).toLocaleString("es-AR", { timeZone: "America/Argentina/Buenos_Aires" });
const priorityLabel = (value: Priority | null) =>
  value === "red"
    ? "Roja"
    : value === "yellow"
      ? "Amarilla"
      : value === "green"
        ? "Verde"
        : "Sin prioridad";
const directionLabel = (value: Direction) => (value === "incoming" ? "Entrante" : "Saliente");
// eslint-disable-next-line react-refresh/only-export-components -- Keep the tested permission gate beside its UI use.
export const canEditCommunication = (canWrite: boolean, communication: { canEdit: boolean }) =>
  canWrite && communication.canEdit;
// eslint-disable-next-line react-refresh/only-export-components -- Keep the tested permission gate beside its UI use.
export const canCreateCommunication = (canWrite: boolean, episodeCanEdit: boolean) =>
  canWrite && episodeCanEdit;
// eslint-disable-next-line react-refresh/only-export-components -- The recovery visibility predicate is tested and used by this render path.
export function shouldShowCommunicationEditor(input: {
  hasSelectedCall: boolean;
  canEditSelected: boolean;
  dirty: boolean;
  canCreateCall: boolean;
  pendingCreateRecovery: boolean;
}) {
  return input.hasSelectedCall
    ? input.canEditSelected
    : (input.dirty && input.canCreateCall) || input.pendingCreateRecovery;
}
const queueStatusLabel = (status: CommunicationQueueEntry["status"]) =>
  status === "pending"
    ? "pendiente"
    : status === "uncertain"
      ? "sin confirmación"
      : status === "paused-conflict"
        ? "pausada por conflicto"
        : status === "paused-permission"
          ? "pausada por permisos"
          : status === "paused-mismatch"
            ? "pausada por recibo distinto"
            : "confirmada; falta limpiar copia local";

export function EfaCommunicationPanel({
  episodeId,
  episodeLabel,
  currentUserId,
  canWrite,
  episodeCanEdit,
}: {
  episodeId: string;
  episodeLabel: string;
  currentUserId: string;
  canWrite: boolean;
  episodeCanEdit: boolean;
}) {
  const listForEpisode = useServerFn(listEfaCommunicationsForEpisode);
  const listNotices = useServerFn(listEfaCommunicationNotices);
  const markNoticeRead = useServerFn(markEfaCommunicationNoticeRead);
  const createCall = useServerFn(createEfaCommunication);
  const updateCall = useServerFn(updateEfaCommunication);
  const finalizeCall = useServerFn(finalizeEfaCommunication);
  const cancelCall = useServerFn(cancelEfaCommunication);
  const reactivateCall = useServerFn(reactivateEfaCommunication);
  const getHistory = useServerFn(getEfaCommunicationHistory);
  const [calls, setCalls] = useState<EfaCommunicationView[]>([]);
  const [notices, setNotices] = useState<CommunicationNotice[]>([]);
  const [history, setHistory] = useState<CommunicationHistory[]>([]);
  const [historyFor, setHistoryFor] = useState<string | null>(null);
  const [selected, setSelected] = useState<EfaCommunicationView | null>(null);
  const [direction, setDirection] = useState<Direction>("incoming");
  const [priority, setPriority] = useState<Priority | "">("");
  const [times, setTimes] = useState<FormTimes>({ startedAt: "", endedAt: "" });
  const [step, setStep] = useState(0);
  const [queueEntries, setQueueEntries] = useState<CommunicationQueueEntry[]>([]);
  const [selectedOperationId, setSelectedOperationId] = useState("");
  const [pendingEntry, setPendingEntry] = useState<CommunicationQueueEntry | null>(null);
  const [conflictCurrent, setConflictCurrent] = useState<EfaCommunicationView | null>(null);
  const [conflictOperationId, setConflictOperationId] = useState("");
  const [queueReady, setQueueReady] = useState(false);
  const [callsReady, setCallsReady] = useState(false);
  const [queueError, setQueueError] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [confirmingLifecycle, setConfirmingLifecycle] = useState<"cancel" | "reactivate" | null>(
    null,
  );
  const [refreshWarning, setRefreshWarning] = useState("");
  const [dirty, setDirty] = useState(false);
  const activeRef = useRef(true);
  const ownerRef = useRef(currentUserId);
  const episodeRef = useRef(episodeId);
  const canWriteRef = useRef(canWrite);
  const busyRef = useRef(false);
  const storeRef = useRef<CommunicationQueueStore | null>(null);
  const callsRef = useRef(calls);
  const queueEntriesRef = useRef(queueEntries);
  const selectedOperationRef = useRef(selectedOperationId);
  const selectedCallRef = useRef(selected);
  const lifecycleOperationRef = useRef<{ key: string; operationId: string } | null>(null);
  const historyRequestRef = useRef<string | null>(null);
  const pendingRef = useRef(pendingEntry);
  const originalTimesRef = useRef<{ startedAt: string | null; endedAt: string | null }>({
    startedAt: null,
    endedAt: null,
  });
  const submissionGateRef = useRef(createCommunicationSubmissionGate());
  queueEntriesRef.current = queueEntries;
  selectedOperationRef.current = selectedOperationId;
  selectedCallRef.current = selected;
  callsRef.current = calls;
  pendingRef.current = pendingEntry;
  ownerRef.current = currentUserId;
  episodeRef.current = episodeId;
  canWriteRef.current = canWrite;

  const currentContext = () =>
    activeRef.current && ownerRef.current === currentUserId && episodeRef.current === episodeId;

  async function reloadCalls() {
    const [nextCalls, nextNotices] = await Promise.all([
      listForEpisode({ data: episodeId }),
      listNotices(),
    ]);
    if (!currentContext()) return;
    setCalls(nextCalls as EfaCommunicationView[]);
    callsRef.current = nextCalls as EfaCommunicationView[];
    const refreshedSelected = (nextCalls as EfaCommunicationView[]).find(
      (call) => call.id === selectedCallRef.current?.id,
    );
    if (refreshedSelected) {
      if (selectedCallRef.current?.id === refreshedSelected.id) {
        selectedCallRef.current = {
          ...selectedCallRef.current,
          canEdit: refreshedSelected.canEdit,
        };
      }
      setSelected((current) =>
        current?.id === refreshedSelected.id
          ? { ...current, canEdit: refreshedSelected.canEdit }
          : current,
      );
    }
    const allowedIds = new Set((nextCalls as EfaCommunicationView[]).map((call) => call.id));
    setNotices(
      (nextNotices as CommunicationNotice[]).filter((notice) =>
        allowedIds.has(notice.communicationId),
      ),
    );
  }

  async function restorePending(entry: CommunicationQueueEntry) {
    setPendingEntry(entry);
    pendingRef.current = entry;
    setSelectedOperationId(entry.operationId);
    selectedOperationRef.current = entry.operationId;
    setConflictCurrent(null);
    setConflictOperationId("");
    const stillCurrent = () =>
      currentContext() &&
      selectedOperationRef.current === entry.operationId &&
      pendingRef.current?.operationId === entry.operationId;
    try {
      const client = await loadCommunicationClient();
      if (!stillCurrent()) return;
      const payload = entry.payload as Record<string, unknown>;
      let currentCall =
        entry.kind === "create"
          ? null
          : (callsRef.current.find((call) => call.id === payload["communicationId"]) ?? null);
      if (entry.kind === "finalize" && !currentCall) {
        const latest = (await listForEpisode({ data: episodeId })) as EfaCommunicationView[];
        if (!stillCurrent()) return;
        callsRef.current = latest;
        setCalls(latest);
        currentCall = latest.find((call) => call.id === payload["communicationId"]) ?? null;
      }
      const restored = client.restoreCommunicationOperationForm(entry, currentCall);
      if (!restored) {
        setError(
          "No se encontró la llamada actual; la operación se conserva sin restaurar el formulario.",
        );
        return;
      }
      setDirection(restored.direction);
      setPriority(restored.priority);
      setTimes(restored.times);
      if (currentCall) {
        originalTimesRef.current = {
          startedAt: currentCall.startedAt,
          endedAt: currentCall.endedAt,
        };
      }
      setSelected(currentCall);
      selectedCallRef.current = currentCall;
    } catch {
      if (stillCurrent())
        setError("No se pudo cargar la llamada actual; la operación local se conserva.");
      return;
    }
    setError(
      entry.status === "paused-conflict"
        ? "La llamada cambió en el servidor. Conserva esta operación y actualiza el historial antes de resolverla."
        : entry.status === "paused-permission"
          ? "La operación quedó pausada por permisos; no se reenviará automáticamente."
          : entry.status === "paused-mismatch"
            ? "El recibo no coincide con la operación guardada. Quedó pausada y no se reenviará."
            : "",
    );
  }

  async function dispatchEntry(entry: CommunicationQueueEntry) {
    if (
      !currentContext() ||
      !storeRef.current ||
      (!canWriteRef.current && entry.status !== "confirmed-cleanup-failed")
    )
      return;
    const queue = await loadCommunicationQueue();
    if (!currentContext()) return;
    if (entry.kind !== "create" && entry.status !== "confirmed-cleanup-failed") {
      try {
        const latest = (await listForEpisode({ data: episodeId })) as EfaCommunicationView[];
        if (!currentContext() || !canWriteRef.current) return;
        callsRef.current = latest;
        setCalls(latest);
        const communicationId = (entry.payload as { communicationId: string }).communicationId;
        if (!latest.some((call) => call.id === communicationId && call.canEdit)) {
          if (selectedOperationRef.current === entry.operationId)
            setError("La llamada actual no permite edición; no se envió la operación guardada.");
          return;
        }
      } catch {
        if (currentContext() && selectedOperationRef.current === entry.operationId)
          setError("No se pudo confirmar el permiso actual; no se envió la operación guardada.");
        return;
      }
    }
    const send = async (stored: CommunicationQueueEntry) => {
      if (stored.kind === "create")
        return createCall({
          data: stored.payload as {
            clientCreationKey: string;
            episodeId: string;
            direction: Direction;
            startedAt: string | null;
            endedAt: string | null;
            priority: Priority | null;
          },
        });
      if (stored.kind === "update")
        return updateCall({
          data: stored.payload as {
            communicationId: string;
            expectedVersion: number;
            operationId: string;
            direction: Direction;
            startedAt: string | null;
            endedAt: string | null;
            priority: Priority | null;
          },
        });
      return finalizeCall({
        data: stored.payload as {
          communicationId: string;
          expectedVersion: number;
          operationId: string;
          priority: Priority;
        },
      });
    };
    const result = await queue.dispatchStoredCommunicationOperation(
      storeRef.current,
      entry.ownerUserId,
      entry.episodeId,
      entry.operationId,
      send,
      () =>
        currentContext() &&
        canWriteRef.current &&
        (entry.kind === "create" ||
          entry.status === "confirmed-cleanup-failed" ||
          callsRef.current.some(
            (call) =>
              call.id === (entry.payload as { communicationId: string }).communicationId &&
              call.canEdit,
          )) &&
        entry.ownerUserId === currentUserId &&
        entry.episodeId === episodeId,
    );
    if (!currentContext()) return;
    try {
      const nextEntries = await storeRef.current.list(currentUserId, episodeId);
      if (!currentContext()) return;
      queueEntriesRef.current = nextEntries;
      setQueueEntries(nextEntries);
      setQueueError("");
    } catch {
      if (currentContext()) setQueueError("No se pudo actualizar la lista local de operaciones.");
    }
    const ownsEditor = selectedOperationRef.current === entry.operationId;
    if (result.status === "confirmed" || result.status === "confirmed-cleanup-failed") {
      const saved = (result as { result: EfaCommunicationMutationResult }).result;
      setCalls((current) => [
        saved.communication,
        ...current.filter((call) => call.id !== saved.communication.id),
      ]);
      callsRef.current = [
        saved.communication,
        ...callsRef.current.filter((call) => call.id !== saved.communication.id),
      ];
      if (ownsEditor) {
        setSelected(saved.communication);
        selectedCallRef.current = saved.communication;
        const client = await loadCommunicationClient();
        if (!currentContext() || selectedOperationRef.current !== entry.operationId) return;
        const restored = client.communicationToFormTimes(saved.communication);
        setTimes(restored);
        originalTimesRef.current = {
          startedAt: saved.communication.startedAt,
          endedAt: saved.communication.endedAt,
        };
        setDirection(saved.communication.direction);
        setPriority(saved.communication.priority ?? "");
        setPendingEntry(null);
        pendingRef.current = null;
        setSelectedOperationId("");
        selectedOperationRef.current = "";
        setDirty(false);
      }
      if (ownsEditor) {
        if (result.status === "confirmed-cleanup-failed") {
          setMessage(
            "El servidor confirmó la llamada; no se repetirá el envío. La copia local requiere limpieza.",
          );
        } else {
          setMessage(
            saved.communication.version === saved.operation.appliedVersion
              ? `Guardado confirmado (versión ${saved.operation.appliedVersion}).`
              : `Operación confirmada en versión ${saved.operation.appliedVersion}; versión actual ${saved.communication.version}.`,
          );
        }
      }
      try {
        await reloadCalls();
      } catch {
        if (currentContext() && ownsEditor)
          setRefreshWarning(
            "El guardado quedó confirmado, pero no se pudo actualizar el historial.",
          );
      }
    } else if (result.status === "cleaned") {
      if (ownsEditor) {
        try {
          await reloadCalls();
        } catch {
          if (currentContext())
            setRefreshWarning(
              "La operación ya estaba confirmada, pero no se pudo actualizar el historial.",
            );
        }
        if (!currentContext() || selectedOperationRef.current !== entry.operationId) return;
        const payload = entry.payload as Record<string, unknown>;
        const saved =
          entry.kind === "create"
            ? callsRef.current.find(
                (call) => call.clientCreationKey === payload["clientCreationKey"],
              )
            : callsRef.current.find((call) => call.id === payload["communicationId"]);
        if (saved) {
          setSelected(saved);
          selectedCallRef.current = saved;
          const client = await loadCommunicationClient();
          if (!currentContext() || selectedOperationRef.current !== entry.operationId) return;
          setTimes(client.communicationToFormTimes(saved));
          originalTimesRef.current = { startedAt: saved.startedAt, endedAt: saved.endedAt };
          setDirection(saved.direction);
          setPriority(saved.priority ?? "");
        }
        setPendingEntry(null);
        pendingRef.current = null;
        setSelectedOperationId("");
        selectedOperationRef.current = "";
        setDirty(false);
        setError("");
        setMessage("La llamada ya estaba confirmada; se limpió su copia local.");
      }
    } else if (result.status === "cancelled" && ownsEditor) {
      setError("Cambió la cuenta, el episodio o el permiso; no se envió la operación.");
    } else if (ownsEditor && "error" in result) {
      setError(result.error);
      setMessage("");
    }
  }

  async function submitPayload(
    kind: CommunicationQueueEntry["kind"],
    payload: CommunicationQueueEntry["payload"],
  ) {
    if (
      busyRef.current ||
      !queueReady ||
      !callsReady ||
      !storeRef.current ||
      !canWrite ||
      pendingRef.current
    )
      return;
    busyRef.current = true;
    setBusy(true);
    setError("");
    setMessage("");
    setRefreshWarning("");
    const operationId =
      kind === "create"
        ? (payload as { clientCreationKey: string }).clientCreationKey
        : (payload as { operationId: string }).operationId;
    const entry: CommunicationQueueEntry = {
      ownerUserId: currentUserId,
      episodeId,
      operationId,
      kind,
      payload: Object.freeze({ ...payload }),
      status: "pending",
      createdAt: new Date().toISOString(),
    };
    setPendingEntry(entry);
    pendingRef.current = entry;
    setSelectedOperationId(operationId);
    selectedOperationRef.current = operationId;
    try {
      const queue = await loadCommunicationQueue();
      if (!currentContext()) return;
      const frozen = await queue.persistCommunicationOperation(storeRef.current, entry);
      if (!currentContext()) return;
      setQueueError("");
      const nextEntries = await storeRef.current.list(currentUserId, episodeId);
      if (!currentContext()) return;
      queueEntriesRef.current = nextEntries;
      setQueueEntries(nextEntries);
      await dispatchEntry(frozen);
    } catch {
      if (currentContext())
        setQueueError(
          "No se pudo guardar la copia local. Conserva esta pantalla y reintenta la misma operación antes del envío.",
        );
    } finally {
      if (currentContext()) {
        busyRef.current = false;
        setBusy(false);
      }
    }
  }

  async function retryQueueEntry(entry: CommunicationQueueEntry) {
    if (busyRef.current || !storeRef.current) return;
    busyRef.current = true;
    setBusy(true);
    try {
      if (entry.status !== "confirmed-cleanup-failed") {
        if (!canWriteRef.current) return;
        const queue = await loadCommunicationQueue();
        if (!currentContext()) return;
        const frozen = await queue.persistCommunicationOperation(storeRef.current, entry);
        if (!currentContext()) return;
        setQueueError("");
        const entries = await storeRef.current.list(currentUserId, episodeId);
        if (!currentContext()) return;
        queueEntriesRef.current = entries;
        setQueueEntries(entries);
        await dispatchEntry(frozen);
      } else {
        await dispatchEntry(entry);
      }
    } catch {
      if (currentContext())
        setQueueError("No se pudo guardar o reintentar la misma operación local.");
    } finally {
      if (currentContext()) {
        busyRef.current = false;
        setBusy(false);
      }
    }
  }

  async function loadCurrentConflictVersion(entry: CommunicationQueueEntry) {
    const payload = entry.payload as Record<string, unknown>;
    const communicationId = payload["communicationId"];
    if (
      entry.status !== "paused-conflict" ||
      typeof communicationId !== "string" ||
      !currentContext() ||
      selectedOperationRef.current !== entry.operationId
    )
      return;
    const ticket = {
      owner: currentUserId,
      episode: episodeId,
      operation: entry.operationId,
      communication: communicationId,
    };
    const stillSelected = () =>
      currentContext() &&
      ownerRef.current === ticket.owner &&
      episodeRef.current === ticket.episode &&
      selectedOperationRef.current === ticket.operation &&
      pendingRef.current?.operationId === ticket.operation;
    setBusy(true);
    busyRef.current = true;
    setError("");
    try {
      const client = await loadCommunicationClient();
      if (!stillSelected()) return;
      const outcome = await client.loadCurrentConflictVersion(
        async () => (await listForEpisode({ data: ticket.episode })) as EfaCommunicationView[],
        ticket.communication,
        stillSelected,
      );
      if (!stillSelected() || outcome.status === "cancelled") return;
      if (outcome.status !== "loaded") {
        setError("No se encontró la llamada actual; la operación local se conserva.");
        return;
      }
      const found = outcome.communication;
      const latest = outcome.rows;
      callsRef.current = latest;
      setCalls(latest);
      setConflictCurrent(found);
      setConflictOperationId(ticket.operation);
    } catch {
      if (stillSelected())
        setError("No se pudo cargar la versión actual; se conservó el borrador local.");
    } finally {
      if (stillSelected()) {
        busyRef.current = false;
        setBusy(false);
      }
    }
  }

  async function resolveConflict(
    entry: CommunicationQueueEntry,
    choice: "keep-local" | "use-server",
  ) {
    const payload = entry.payload as Record<string, unknown>;
    const communicationId = payload["communicationId"];
    const latest = conflictCurrent;
    const ticket = { owner: currentUserId, episode: episodeId, operation: entry.operationId };
    const isCurrentTicket = () =>
      currentContext() &&
      ownerRef.current === ticket.owner &&
      episodeRef.current === ticket.episode &&
      selectedOperationRef.current === ticket.operation &&
      pendingRef.current?.operationId === ticket.operation &&
      conflictOperationId === ticket.operation &&
      latest?.id === communicationId;
    if (entry.status !== "paused-conflict" || !latest || !isCurrentTicket() || !storeRef.current)
      return;
    setBusy(true);
    busyRef.current = true;
    try {
      const client = await loadCommunicationClient();
      if (!isCurrentTicket()) return;
      const queue = await loadCommunicationQueue();
      if (!isCurrentTicket()) return;
      const removed = await queue.removeSelectedCommunicationConflict(
        storeRef.current,
        entry,
        isCurrentTicket,
      );
      if (!removed) return;
      if (!isCurrentTicket()) return;
      const entries = queueEntriesRef.current.filter(
        (queued) => queued.operationId !== ticket.operation,
      );
      queueEntriesRef.current = entries;
      setQueueEntries(entries);
      setPendingEntry(null);
      pendingRef.current = null;
      setSelectedOperationId("");
      selectedOperationRef.current = "";
      setConflictCurrent(null);
      setConflictOperationId("");
      setSelected(latest);
      selectedCallRef.current = latest;
      if (choice === "use-server") {
        setTimes(client.communicationToFormTimes(latest));
        originalTimesRef.current = { startedAt: latest.startedAt, endedAt: latest.endedAt };
        setDirection(latest.direction);
        setPriority(latest.priority ?? "");
        setDirty(false);
      } else if (entry.kind === "finalize") {
        setTimes(client.communicationToFormTimes(latest));
        originalTimesRef.current = { startedAt: latest.startedAt, endedAt: latest.endedAt };
        setDirection(latest.direction);
        setPriority((entry.payload as { priority: Priority }).priority);
        setDirty(true);
      } else {
        originalTimesRef.current = { startedAt: latest.startedAt, endedAt: latest.endedAt };
        setDirty(true);
      }
      setError("");
      setMessage(
        choice === "use-server"
          ? "Se descartó la operación conflictiva y se cargó la versión actual."
          : "Se descartó la operación conflictiva; tus datos quedan en el formulario para una nueva revisión.",
      );
      busyRef.current = false;
      setBusy(false);
    } catch {
      if (isCurrentTicket())
        setError("No se pudo resolver la operación local; se conservó el borrador.");
    } finally {
      if (isCurrentTicket()) {
        busyRef.current = false;
        setBusy(false);
      }
    }
  }

  async function saveCurrent() {
    if (
      !canWrite ||
      (selected
        ? !canEditCommunication(canWrite, selected)
        : !canCreateCommunication(canWrite, episodeCanEdit)) ||
      !callsReady ||
      (dirty === false && selected) ||
      pendingRef.current
    )
      return;
    const release = submissionGateRef.current.acquire();
    if (!release) return;
    try {
      const client = await loadCommunicationClient();
      if (!currentContext()) return;
      const payloadTimes = client.communicationFormToPayloadTimes(times, originalTimesRef.current);
      if (selected) {
        await submitPayload("update", {
          communicationId: selected.id,
          expectedVersion: selected.version,
          operationId: crypto.randomUUID(),
          direction,
          ...payloadTimes,
          priority: priority || null,
        });
      } else {
        const clientCreationKey = crypto.randomUUID();
        await submitPayload("create", {
          clientCreationKey,
          episodeId,
          direction,
          ...payloadTimes,
          priority: priority || null,
        });
      }
    } finally {
      release();
    }
  }

  async function finalizeCurrent() {
    if (
      !canWrite ||
      !callsReady ||
      !selected ||
      !canEditCommunication(canWrite, selected) ||
      dirty ||
      pendingRef.current ||
      selected.state !== "draft" ||
      !priority
    )
      return;
    const release = submissionGateRef.current.acquire();
    if (!release) return;
    try {
      await submitPayload("finalize", {
        communicationId: selected.id,
        expectedVersion: selected.version,
        operationId: crypto.randomUUID(),
        priority,
      });
    } finally {
      release();
    }
  }

  async function confirmLifecycleTransition() {
    if (
      !confirmingLifecycle ||
      !selected ||
      !canWrite ||
      !callsReady ||
      !(selected.canManageLifecycle ?? selected.canEdit) ||
      dirty ||
      pendingRef.current ||
      busyRef.current
    )
      return;
    const action = confirmingLifecycle;
    busyRef.current = true;
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const client = await loadCommunicationClient();
      if (!currentContext()) return;
      const operation = client.reuseCommunicationLifecycleOperation(
        lifecycleOperationRef.current,
        action,
        selected.id,
        selected.version,
        () => crypto.randomUUID(),
      );
      lifecycleOperationRef.current = operation;
      const result =
        action === "cancel"
          ? await cancelCall({
              data: {
                communicationId: selected.id,
                expectedVersion: selected.version,
                operationId: operation.operationId,
              },
            })
          : await reactivateCall({
              data: {
                communicationId: selected.id,
                expectedVersion: selected.version,
                operationId: operation.operationId,
              },
            });
      if (!currentContext()) return;
      const updated = (result as EfaCommunicationMutationResult).communication;
      callsRef.current = [updated, ...callsRef.current.filter((call) => call.id !== updated.id)];
      setCalls(callsRef.current);
      selectedCallRef.current = updated;
      setSelected(updated);
      setConfirmingLifecycle(null);
      lifecycleOperationRef.current = null;
      setMessage(
        action === "cancel"
          ? "La llamada quedó anulada; su historial se conserva."
          : "La llamada se reactivó con su estado anterior.",
      );
      await reloadCalls();
    } catch {
      if (currentContext()) {
        setError(
          "No se pudo confirmar el cambio. Reintentá la misma acción para consultar el resultado sin duplicarlo.",
        );
        setMessage("");
      }
    } finally {
      if (currentContext()) {
        busyRef.current = false;
        setBusy(false);
      }
    }
  }

  async function selectCall(call: EfaCommunicationView) {
    if (pendingRef.current || busyRef.current) return;
    const client = await loadCommunicationClient();
    if (!currentContext()) return;
    setSelected(call);
    selectedCallRef.current = call;
    setConfirmingLifecycle(null);
    setDirection(call.direction);
    setPriority(call.priority ?? "");
    const nextTimes = client.communicationToFormTimes(call);
    setTimes(nextTimes);
    originalTimesRef.current = { startedAt: call.startedAt, endedAt: call.endedAt };
    setDirty(false);
    setStep(0);
    setMessage("");
    setError("");
  }

  async function startNew() {
    if (
      !canCreateCommunication(canWrite, episodeCanEdit) ||
      !callsReady ||
      pendingRef.current ||
      busyRef.current
    )
      return;
    setSelected(null);
    selectedCallRef.current = null;
    setDirection("incoming");
    setPriority("");
    setTimes({ startedAt: "", endedAt: "" });
    originalTimesRef.current = { startedAt: null, endedAt: null };
    setDirty(true);
    setStep(0);
    setError("");
    setMessage("");
  }

  async function captureTime(field: keyof FormTimes) {
    const clickedAt = new Date();
    const client = await loadCommunicationClient();
    if (!currentContext()) return;
    const value = client.captureCommunicationTime(clickedAt);
    setTimes((current) => ({ ...current, [field]: value }));
    setDirty(true);
  }

  async function showHistory(call: EfaCommunicationView) {
    const callId = call.id;
    historyRequestRef.current = callId;
    try {
      const rows = (await getHistory({ data: callId })) as CommunicationHistory[];
      if (!currentContext() || historyRequestRef.current !== callId) return;
      setHistory(rows);
      setHistoryFor(callId);
    } catch {
      if (currentContext() && historyRequestRef.current === callId)
        setError("No se pudo cargar el historial de la llamada.");
    }
  }

  async function acknowledgeNotice(noticeId: string) {
    try {
      const updated = (await markNoticeRead({ data: noticeId })) as CommunicationNotice;
      if (!currentContext()) return;
      setNotices((current) =>
        current.map((notice) => (notice.id === updated.id ? updated : notice)),
      );
    } catch {
      if (currentContext()) setError("No se pudo marcar el aviso como leído.");
    }
  }

  useEffect(() => {
    activeRef.current = true;
    let active = true;
    void (async () => {
      let entries: CommunicationQueueEntry[] = [];
      try {
        const queue = await loadCommunicationQueue();
        if (!active) return;
        const store = queue.createIndexedDbCommunicationQueueStore();
        storeRef.current = store;
        entries = await store.list(currentUserId, episodeId);
        if (!active || !currentContext()) return;
        queueEntriesRef.current = entries;
        setQueueEntries(entries);
      } catch {
        if (active && currentContext()) {
          setQueueError(
            "El almacenamiento local no está disponible; no se enviarán llamadas sin persistir primero la operación.",
          );
        }
      }
      if (!active || !currentContext()) return;
      setQueueReady(true);
      try {
        const [nextCalls, nextNotices] = await Promise.all([
          listForEpisode({ data: episodeId }),
          listNotices(),
        ]);
        if (!active || !currentContext()) return;
        setCalls(nextCalls as EfaCommunicationView[]);
        callsRef.current = nextCalls as EfaCommunicationView[];
        const ids = new Set((nextCalls as EfaCommunicationView[]).map((call) => call.id));
        setNotices(
          (nextNotices as CommunicationNotice[]).filter((notice) =>
            ids.has(notice.communicationId),
          ),
        );
        setCallsReady(true);
        if (entries.length === 1) await restorePending(entries[0]!);
      } catch {
        if (active && currentContext())
          setError("No se pudo cargar el historial de llamadas del episodio.");
      }
    })();
    const onOnline = () => {
      if (!active || !currentContext() || !canWriteRef.current || !storeRef.current) return;
      const attemptOnce = async () => {
        try {
          const entries = await storeRef.current?.list(currentUserId, episodeId);
          if (!active || !currentContext()) return;
          const eligible = (entries ?? []).filter(
            (entry) => entry.status === "pending" || entry.status === "uncertain",
          );
          for (const entry of eligible) {
            if (!active || !currentContext()) return;
            if (busyRef.current) return;
            busyRef.current = true;
            setBusy(true);
            try {
              await dispatchEntry(entry);
            } finally {
              if (active && currentContext()) {
                busyRef.current = false;
                setBusy(false);
              }
            }
          }
        } catch {
          if (active && currentContext())
            setQueueError("No se pudo revisar la cola local al recuperar la conexión.");
        }
      };
      void attemptOnce();
    };
    window.addEventListener("online", onOnline);
    return () => {
      active = false;
      activeRef.current = false;
      window.removeEventListener("online", onOnline);
    };
    // The component is keyed by account/episode; its async callbacks use refs for all changing state.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentUserId, episodeId]);

  const canCreateCall =
    canCreateCommunication(canWrite, episodeCanEdit) &&
    queueReady &&
    callsReady &&
    Boolean(storeRef.current) &&
    !pendingEntry &&
    !busy;
  const canEditSelected = Boolean(selected && canEditCommunication(canWrite, selected));
  const pendingCreateRecovery =
    canWrite && episodeCanEdit && Boolean(queueError) && pendingEntry?.kind === "create";
  const selectedQueued =
    queueEntries.find((entry) => entry.operationId === selectedOperationId) ?? null;
  const formatState = (state: CommunicationHistory["afterState"]) => {
    const details = state as Record<string, unknown>;
    const directionText = details["direction"] === "incoming" ? "Entrante" : "Saliente";
    const startText =
      typeof details["startedAt"] === "string"
        ? nowBue(details["startedAt"] as string)
        : "sin inicio observado";
    const endText =
      typeof details["endedAt"] === "string"
        ? nowBue(details["endedAt"] as string)
        : "sin fin observado";
    return `${directionText}; inicio: ${startText}; fin: ${endText}; prioridad: ${priorityLabel((details["priority"] as Priority | null) ?? null)}; estado: ${details["state"] === "finalized" ? "finalizada" : "borrador"}`;
  };

  return (
    <div className="space-y-4" aria-label={`Llamadas de ${episodeLabel}`}>
      <Card>
        <CardHeader>
          <CardTitle>Llamadas · {episodeLabel}</CardTitle>
          <p className="text-sm text-muted-foreground">
            Se guardan llamadas enviadas en este dispositivo. Los campos aún no enviados no son un
            respaldo; la cola temporal contiene datos privados del episodio.
          </p>
          {!canWrite && (
            <p className="rounded-md border p-3 text-sm">
              Solo lectura: tu acceso vigente no permite editar llamadas.
            </p>
          )}
        </CardHeader>
        <CardContent className="space-y-4">
          {queueError && (
            <p role="alert" className="rounded-md border p-3 text-sm">
              {queueError}
            </p>
          )}
          {!queueReady && (
            <p className="text-sm text-muted-foreground">Preparando almacenamiento local…</p>
          )}
          {queueEntries.length > 0 && (
            <div className="space-y-2">
              <Label htmlFor={`communication-pending-${episodeId}`}>
                Operaciones locales pendientes
              </Label>
              <select
                id={`communication-pending-${episodeId}`}
                className="min-h-11 w-full rounded-md border bg-background px-3"
                value={selectedOperationId}
                disabled={busy}
                onChange={(event) => {
                  const entry = queueEntries.find(
                    (candidate) => candidate.operationId === event.target.value,
                  );
                  if (entry) void restorePending(entry);
                }}
              >
                <option value="">Selecciona una operación</option>
                {queueEntries.map((entry) => (
                  <option key={entry.operationId} value={entry.operationId}>
                    {entry.kind === "create"
                      ? "Nueva llamada"
                      : entry.kind === "update"
                        ? "Corrección"
                        : "Finalización"}{" "}
                    · {queueStatusLabel(entry.status)}
                  </option>
                ))}
              </select>
              {selectedQueued &&
                selectedQueued.status !== "paused-conflict" &&
                selectedQueued.status !== "paused-permission" &&
                selectedQueued.status !== "paused-mismatch" && (
                  <Button
                    type="button"
                    variant="outline"
                    className="min-h-11 w-full"
                    disabled={
                      busy || (!canWrite && selectedQueued.status !== "confirmed-cleanup-failed")
                    }
                    onClick={() => void retryQueueEntry(selectedQueued)}
                  >
                    {selectedQueued.status === "confirmed-cleanup-failed"
                      ? "Reintentar limpieza local"
                      : "Reintentar la misma llamada"}
                  </Button>
                )}
              {selectedQueued?.status === "paused-conflict" && (
                <div className="space-y-2 rounded-md border p-3">
                  <p className="text-sm">
                    El servidor rechazó esta versión por conflicto; la operación no se aplicó. Carga
                    la versión actual para elegir cómo resolver solo esta operación.
                  </p>
                  <Button
                    type="button"
                    variant="outline"
                    className="min-h-11 w-full"
                    disabled={busy}
                    onClick={() => void loadCurrentConflictVersion(selectedQueued)}
                  >
                    Cargar versión actual
                  </Button>
                  {conflictCurrent && conflictOperationId === selectedQueued.operationId && (
                    <div className="space-y-2 text-sm">
                      <p>Versión actual del servidor: {conflictCurrent.version}.</p>
                      <Button
                        type="button"
                        variant="outline"
                        className="min-h-11 w-full"
                        disabled={busy}
                        onClick={() => void resolveConflict(selectedQueued, "use-server")}
                      >
                        Usar versión del servidor y descartar esta operación
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        className="min-h-11 w-full"
                        disabled={busy}
                        onClick={() => void resolveConflict(selectedQueued, "keep-local")}
                      >
                        Conservar mis datos y descartar esta operación
                      </Button>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
          {calls.length > 0 ? (
            <ul className="space-y-2" aria-label="Llamadas registradas">
              {calls.map((call) => (
                <li key={call.id} className="rounded-lg border p-3">
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                    <p className="font-medium">
                      {directionLabel(call.direction)} ·{" "}
                      {call.state === "finalized"
                        ? "Finalizada"
                        : call.state === "cancelled"
                          ? "Anulada"
                          : "Borrador"}{" "}
                      · {priorityLabel(call.priority)}
                    </p>
                    <div className="flex flex-wrap gap-2">
                      <Button
                        type="button"
                        variant="outline"
                        className="min-h-11"
                        disabled={busy || Boolean(pendingEntry)}
                        onClick={() => void selectCall(call)}
                      >
                        {canWrite && call.canEdit ? "Ver / editar" : "Ver llamada"}
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        className="min-h-11"
                        disabled={busy}
                        onClick={() => void showHistory(call)}
                      >
                        Historial
                      </Button>
                    </div>
                  </div>
                  <p className="mt-2 text-sm text-muted-foreground">
                    Inicio real: {call.startedAt ? nowBue(call.startedAt) : "sin registrar"} · fin
                    real: {call.endedAt ? nowBue(call.endedAt) : "sin registrar"}
                  </p>
                  {historyFor === call.id && (
                    <ol className="mt-3 space-y-3 border-l pl-4" aria-label="Historial de cambios">
                      {history.map((audit) => (
                        <li key={audit.id}>
                          <p className="text-sm font-medium">
                            {audit.action === "created"
                              ? "Llamada registrada"
                              : audit.action === "updated"
                                ? "Datos corregidos"
                                : "Llamada finalizada"}{" "}
                            · versión {audit.versionBefore ?? "—"} → {audit.versionAfter} ·{" "}
                            {nowBue(audit.occurredAt)}
                          </p>
                          {audit.beforeState && (
                            <p className="text-xs text-muted-foreground">
                              Antes: {formatState(audit.beforeState)}
                            </p>
                          )}
                          <p className="text-xs text-muted-foreground">
                            Después: {formatState(audit.afterState)}
                          </p>
                        </li>
                      ))}
                    </ol>
                  )}
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-muted-foreground">
              Todavía no hay llamadas en este episodio.
            </p>
          )}
          {notices.map((notice) =>
            notice.readAt ? null : (
              <div key={notice.id} className="rounded-md border p-3 text-sm">
                Una persona administradora corrigió una llamada de este episodio.
                <Button
                  type="button"
                  variant="outline"
                  className="ml-2 min-h-11"
                  onClick={() => void acknowledgeNotice(notice.id)}
                >
                  Marcar aviso como leído
                </Button>
              </div>
            ),
          )}
          {canWrite && (
            <Button
              type="button"
              className="min-h-11 w-full sm:w-auto"
              disabled={!canCreateCall}
              onClick={() => void startNew()}
            >
              Nueva llamada
            </Button>
          )}
        </CardContent>
      </Card>

      {shouldShowCommunicationEditor({
        hasSelectedCall: Boolean(selected),
        canEditSelected,
        dirty,
        canCreateCall,
        pendingCreateRecovery,
      }) && (
        <Card>
          <CardHeader>
            <CardTitle>
              {selected
                ? selected.state === "cancelled"
                  ? `Ver llamada anulada · versión ${selected.version}`
                  : `Editar llamada · versión ${selected.version}`
                : "Nueva llamada"}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <EfaCommunicationStepper step={step} onStepChange={setStep}>
              {step === 0 && (
                <fieldset className="space-y-3">
                  <legend className="text-sm font-medium">
                    Selecciona el sentido de la llamada
                  </legend>
                  {(["incoming", "outgoing"] as const).map((value) => (
                    <label
                      key={value}
                      className="flex min-h-12 items-center gap-3 rounded-md border p-3"
                    >
                      <input
                        type="radio"
                        name={`communication-direction-${episodeId}`}
                        checked={direction === value}
                        disabled={
                          !(selected ? canEditSelected : canCreateCall) ||
                          Boolean(pendingEntry) ||
                          busy
                        }
                        onChange={() => {
                          setDirection(value);
                          setDirty(true);
                        }}
                      />
                      <span>{directionLabel(value)}</span>
                    </label>
                  ))}
                </fieldset>
              )}
              {(step === 1 || step === 2) && (
                <div className="space-y-3">
                  <p className="text-sm text-muted-foreground">
                    La hora es opcional. La captura rápida registra el instante del clic. El campo
                    manual usa la zona horaria local del dispositivo.
                  </p>
                  <Label htmlFor={`communication-time-${episodeId}-${step}`}>
                    {step === 1 ? "Inicio real (opcional)" : "Fin real (opcional)"}
                  </Label>
                  <Input
                    id={`communication-time-${episodeId}-${step}`}
                    type="datetime-local"
                    step="0.001"
                    value={step === 1 ? times.startedAt : times.endedAt}
                    disabled={
                      !(selected ? canEditSelected : canCreateCall) || Boolean(pendingEntry) || busy
                    }
                    onChange={(event) => {
                      const field = step === 1 ? "startedAt" : "endedAt";
                      setTimes((current) => ({ ...current, [field]: event.target.value }));
                      setDirty(true);
                    }}
                  />
                  <div className="flex flex-col gap-2 sm:flex-row">
                    <Button
                      type="button"
                      variant="outline"
                      className="min-h-11"
                      disabled={
                        !(selected ? canEditSelected : canCreateCall) ||
                        Boolean(pendingEntry) ||
                        busy
                      }
                      onClick={() => void captureTime(step === 1 ? "startedAt" : "endedAt")}
                    >
                      Registrar ahora
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      className="min-h-11"
                      disabled={
                        !(selected ? canEditSelected : canCreateCall) ||
                        Boolean(pendingEntry) ||
                        busy
                      }
                      onClick={() => {
                        const field = step === 1 ? "startedAt" : "endedAt";
                        setTimes((current) => ({ ...current, [field]: "" }));
                        setDirty(true);
                      }}
                    >
                      Dejar sin hora
                    </Button>
                  </div>
                </div>
              )}
              {step === 3 && (
                <fieldset className="space-y-3">
                  <legend className="text-sm font-medium">
                    Prioridad observada (opcional para borrador)
                  </legend>
                  {[
                    { value: "red", label: "Roja" },
                    { value: "yellow", label: "Amarilla" },
                    { value: "green", label: "Verde" },
                  ].map(({ value, label }) => (
                    <label
                      key={value}
                      className="flex min-h-12 items-center gap-3 rounded-md border p-3"
                    >
                      <input
                        type="radio"
                        name={`communication-priority-${episodeId}`}
                        checked={priority === value}
                        disabled={
                          !(selected ? canEditSelected : canCreateCall) ||
                          Boolean(pendingEntry) ||
                          busy
                        }
                        onChange={() => {
                          setPriority(value as Priority);
                          setDirty(true);
                        }}
                      />
                      <span>{label}</span>
                    </label>
                  ))}
                  <Button
                    type="button"
                    variant="outline"
                    className="min-h-11 w-full"
                    disabled={
                      !(selected ? canEditSelected : canCreateCall) || Boolean(pendingEntry) || busy
                    }
                    onClick={() => {
                      setPriority("");
                      setDirty(true);
                    }}
                  >
                    Sin prioridad observada
                  </Button>
                </fieldset>
              )}
              {step === 4 && (
                <div className="space-y-3 rounded-md border p-4">
                  <h3 className="font-medium">Revisa los datos de la llamada</h3>
                  <p>Dirección: {directionLabel(direction)}</p>
                  <p>Inicio real: {times.startedAt || "Sin registrar"}</p>
                  <p>Fin real: {times.endedAt || "Sin registrar"}</p>
                  <p>Prioridad: {priorityLabel(priority || null)}</p>
                  {selected?.state === "finalized" && (
                    <p>La llamada conservará su estado finalizada al guardar correcciones.</p>
                  )}
                </div>
              )}
            </EfaCommunicationStepper>

            {error && (
              <p role="alert" className="rounded-md border border-destructive p-3 text-sm">
                {error}
              </p>
            )}
            {message && (
              <p role="status" className="rounded-md border p-3 text-sm">
                {message}
              </p>
            )}
            {refreshWarning && (
              <p role="status" className="rounded-md border p-3 text-sm">
                {refreshWarning}
              </p>
            )}
            {queueError && pendingEntry && (
              <Button
                type="button"
                variant="outline"
                className="min-h-11 w-full"
                disabled={busy || !queueReady}
                onClick={() => void retryQueueEntry(pendingEntry)}
              >
                Reintentar guardar la misma operación local
              </Button>
            )}
            <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
              <Button
                type="button"
                className="min-h-11"
                disabled={
                  !(selected ? canEditSelected : canCreateCall) ||
                  !queueReady ||
                  !callsReady ||
                  busy ||
                  Boolean(pendingEntry) ||
                  (Boolean(selected) && !dirty)
                }
                onClick={() => void saveCurrent()}
              >
                {busy ? "Guardando…" : "Guardar llamada"}
              </Button>
              {selected?.state === "draft" && (
                <Button
                  type="button"
                  variant="outline"
                  className="min-h-11"
                  disabled={
                    !canEditSelected ||
                    !queueReady ||
                    !callsReady ||
                    busy ||
                    Boolean(pendingEntry) ||
                    dirty ||
                    !priority
                  }
                  onClick={() => void finalizeCurrent()}
                >
                  Finalizar llamada
                </Button>
              )}
              {!priority && selected?.state === "draft" && (
                <p className="self-center text-sm text-muted-foreground">
                  Selecciona una prioridad y guarda los cambios antes de finalizar.
                </p>
              )}
              {selected &&
                (selected.canManageLifecycle ?? selected.canEdit) &&
                !confirmingLifecycle && (
                  <Button
                    type="button"
                    variant="outline"
                    className="min-h-11"
                    disabled={!canWrite || !callsReady || busy || Boolean(pendingEntry) || dirty}
                    onClick={() =>
                      setConfirmingLifecycle(communicationLifecycleAction(selected.state))
                    }
                  >
                    {selected.state === "cancelled"
                      ? "Reactivar comunicación"
                      : "Anular comunicación"}
                  </Button>
                )}
              {selected && confirmingLifecycle && (
                <div
                  className="flex flex-col gap-2 rounded-md border border-amber-500/50 p-3 sm:flex-row sm:items-center"
                  aria-live="polite"
                >
                  <p className="text-sm">
                    {confirmingLifecycle === "cancel"
                      ? "La comunicación quedará anulada, pero su historial y despachos vinculados se conservarán."
                      : "Se restaurará el estado que tenía antes de la anulación."}
                  </p>
                  <Button
                    type="button"
                    className="min-h-11"
                    disabled={busy}
                    onClick={() => void confirmLifecycleTransition()}
                  >
                    {confirmingLifecycle === "cancel"
                      ? "Confirmar anulación"
                      : "Confirmar reactivación"}
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    className="min-h-11"
                    disabled={busy}
                    onClick={() => setConfirmingLifecycle(null)}
                  >
                    Cancelar acción
                  </Button>
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
