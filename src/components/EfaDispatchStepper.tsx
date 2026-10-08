import { useEffect, useRef, useState, type ComponentType } from "react";
import { createClientOnlyFn, useServerFn } from "@tanstack/react-start";
import { listEfaBases } from "@/lib/efa-bases.functions";
import { listEfaCommunicationsForEpisode } from "@/lib/efa-communications.functions";
import { getEfaEpisode } from "@/lib/efa-episodes.functions";
import { listEfaInstitutions } from "@/lib/efa-institutions.functions";
import type { EfaInstitutionChoice } from "@/lib/efa-institutions.client";
import {
  addEfaDispatchContactAttempt,
  cancelEfaDispatch,
  createEfaDispatch,
  createEfaSupportRequest,
  firstResponseRoleValues,
  finalizeEfaDispatch,
  getEfaDispatch,
  getEfaDispatchHistory,
  listEfaDispatchNotices,
  listEfaDispatchesForEpisode,
  markEfaDispatchNoticeRead,
  reactivateEfaDispatch,
  updateEfaDispatch,
  updateEfaSupportRequest,
} from "@/lib/efa-dispatches.functions";
import type { DispatchForm, DispatchLifecycleOperation } from "@/lib/efa-dispatches.client";
import type { DispatchQueueEntry, DispatchQueueStore } from "@/lib/efa-dispatches.queue";

const loadQueue = createClientOnlyFn(() => import("@/lib/efa-dispatches.queue"));
const loadClient = createClientOnlyFn(() => import("@/lib/efa-dispatches.client"));
const loadInstitutionPicker = createClientOnlyFn(async () => {
  const module = await import("@/lib/efa-institutions.client");
  return module.EfaInstitutionPicker;
});
type DispatchView = DispatchForm & {
  id: string;
  episodeId: string;
  ownerUserId: string;
  version: number;
  state: "draft" | "finalized" | "cancelled";
  createdAt: string;
  updatedAt: string;
  finalizedAt: string | null;
  cancelledAt: string | null;
  cancelledFromState: "draft" | "finalized" | null;
  canEdit: boolean;
  canManage: boolean;
  institutionName?: string | null;
  institutionIsActive?: boolean | null;
  contactAttempts: Array<{ id: string; occurredAt: string; note: string | null }>;
};
type DispatchMutationDto = Omit<DispatchView, "contactAttempts"> & {
  contactAttempts?: DispatchView["contactAttempts"];
};
function isDispatchMutationDto(value: unknown): value is DispatchMutationDto {
  if (!value || typeof value !== "object") return false;
  const dto = value as Record<string, unknown>;
  const requiredText = [
    "id",
    "episodeId",
    "ownerUserId",
    "clientCreationKey",
    "baseId",
    "createdAt",
    "updatedAt",
  ];
  if (
    !requiredText.every((key) => typeof dto[key] === "string") ||
    typeof dto["version"] !== "number" ||
    typeof dto["canEdit"] !== "boolean" ||
    !["draft", "finalized", "cancelled"].includes(String(dto["state"])) ||
    (dto["finalizedAt"] !== null && typeof dto["finalizedAt"] !== "string") ||
    (dto["cancelledAt"] !== null && typeof dto["cancelledAt"] !== "string") ||
    (dto["cancelledFromState"] !== null &&
      !["draft", "finalized"].includes(String(dto["cancelledFromState"]))) ||
    typeof dto["canManage"] !== "boolean"
  )
    return false;
  const nullableText = [
    "communicationId",
    "institutionId",
    "priority",
    "firstResponseRole",
    "note",
    "result",
    "resultClarification",
  ];
  const timeKeys = ["t0At", "t1At", "t2At", "t3At", "t4At", "t5At", "t6At", "firstResponseAt"];
  const statusKeys = [
    "t0Status",
    "t1Status",
    "t2Status",
    "t3Status",
    "t4Status",
    "t5Status",
    "t6Status",
  ];
  return (
    nullableText.every((key) => dto[key] === null || typeof dto[key] === "string") &&
    (dto["priority"] === null || ["red", "yellow", "green"].includes(String(dto["priority"]))) &&
    (dto["result"] === null ||
      [
        "transported",
        "treated_at_home",
        "refused",
        "not_located",
        "cancelled",
        "death",
        "not_informed",
      ].includes(String(dto["result"]))) &&
    timeKeys.every((key) => dto[key] === null || typeof dto[key] === "string") &&
    statusKeys.every((key) =>
      ["observed", "not_observed", "not_informed", "not_applicable"].includes(String(dto[key])),
    ) &&
    (dto["contactAttempts"] === undefined ||
      (Array.isArray(dto["contactAttempts"]) &&
        dto["contactAttempts"].every(
          (item) =>
            !!item &&
            typeof item === "object" &&
            typeof (item as Record<string, unknown>)["id"] === "string",
        )))
  );
}
type BaseChoice = { id: string; name: string };
const timeSteps = [
  ["t0At", "Despacho"],
  ["t1At", "En camino"],
  ["t2At", "Llegada a escena"],
  ["t3At", "Sale de escena"],
  ["t4At", "Llegada a destino"],
  ["t5At", "Entrega efectiva"],
  ["t6At", "Disponible"],
] as const;
const statuses = ["not_observed", "not_informed", "not_applicable", "observed"] as const;
const statusLabel: Record<(typeof statuses)[number], string> = {
  not_observed: "No observado",
  not_informed: "No informado",
  not_applicable: "No aplica",
  observed: "Observado",
};
const resultOptions = [
  ["transported", "Con traslado"],
  ["treated_at_home", "Atención en domicilio sin traslado"],
  ["refused", "Rechazo"],
  ["not_located", "No ubicado"],
  ["cancelled", "Cancelado"],
  ["death", "Óbito"],
  ["not_informed", "No informado"],
] as const;
const emptyDispatchForm = (): DispatchForm => ({
  baseId: "",
  institutionId: "",
  communicationId: "",
  priority: "",
  note: "",
  result: "",
  resultClarification: "",
  firstResponseRole: "",
  firstResponseAt: "",
  t0At: "",
  t1At: "",
  t2At: "",
  t3At: "",
  t4At: "",
  t5At: "",
  t6At: "",
  t0Status: "not_observed",
  t1Status: "not_observed",
  t2Status: "not_observed",
  t3Status: "not_observed",
  t4Status: "not_observed",
  t5Status: "not_observed",
  t6Status: "not_observed",
});
function dateToLocalInput(value: string | Date | null) {
  if (!value) return "";
  const date = value instanceof Date ? value : new Date(value);
  return Number.isFinite(date.getTime())
    ? new Date(date.getTime() - date.getTimezoneOffset() * 60_000).toISOString().slice(0, 23)
    : "";
}
function inputToIso(value: string) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? date.toISOString() : null;
}
function restoreDispatchForm(source: DispatchView): DispatchForm {
  return {
    ...emptyDispatchForm(),
    ...source,
    institutionId: source.institutionId ?? "",
    t0At: dateToLocalInput(source.t0At),
    t1At: dateToLocalInput(source.t1At),
    t2At: dateToLocalInput(source.t2At),
    t3At: dateToLocalInput(source.t3At),
    t4At: dateToLocalInput(source.t4At),
    t5At: dateToLocalInput(source.t5At),
    t6At: dateToLocalInput(source.t6At),
    firstResponseAt: dateToLocalInput(source.firstResponseAt),
  };
}
function dispatchFormChanged(form: DispatchForm, source: DispatchForm) {
  return JSON.stringify(form) !== JSON.stringify(source);
}
type DispatchTimesInput = {
  t0At: string | Date | null;
  t1At: string | Date | null;
  t2At: string | Date | null;
  t3At: string | Date | null;
  t4At: string | Date | null;
  t5At: string | Date | null;
  t6At: string | Date | null;
};
function dispatchFormTimes(form: DispatchForm, source: DispatchTimesInput) {
  const serialize = (key: keyof DispatchTimesInput) => {
    const original = source[key];
    return form[key] && original && form[key] === dateToLocalInput(original)
      ? original instanceof Date
        ? original.toISOString()
        : original
      : inputToIso(form[key]);
  };
  return {
    t0At: serialize("t0At"),
    t1At: serialize("t1At"),
    t2At: serialize("t2At"),
    t3At: serialize("t3At"),
    t4At: serialize("t4At"),
    t5At: serialize("t5At"),
    t6At: serialize("t6At"),
  };
}
function formatDispatchDate(value: string | Date) {
  return new Date(value).toLocaleString("es-AR", { timeZone: "America/Argentina/Buenos_Aires" });
}
function captureDispatchTime(now: Date) {
  return dateToLocalInput(now);
}
// eslint-disable-next-line react-refresh/only-export-components -- exported for deterministic tests; this helper is used by the quick-action handlers.
export function captureActionTimestamp(now = new Date()) {
  return inputToIso(captureDispatchTime(now)) ?? now.toISOString();
}

export function FirstResponseRoleSelect({
  value,
  onChange,
}: {
  value: string;
  onChange: (value: string) => void;
}) {
  const legacyValue = value && !firstResponseRoleValues.some((role) => role === value);
  return (
    <select
      className="mt-1 h-11 w-full rounded border px-3"
      aria-label="Rol anónimo de primera respuesta"
      value={value}
      onChange={(event) => onChange(event.target.value)}
    >
      <option value="">Sin dato</option>
      <option value="driver">Conductor</option>
      <option value="nurse">Enfermería</option>
      <option value="doctor">Médico/a</option>
      <option value="other">Otro rol anónimo</option>
      <option value="not_observed">No observado</option>
      {legacyValue && (
        <option value={value} disabled>
          Valor histórico (solo lectura): {value}
        </option>
      )}
    </select>
  );
}
// eslint-disable-next-line react-refresh/only-export-components -- exported for deterministic tests; this predicate is bound to the support selector and handler.
export function canEditSupportAssociation(
  canWrite: boolean,
  episodeCanEdit: boolean,
  dispatchCanEdit: boolean,
  requestCanEdit: boolean,
) {
  return canWrite && episodeCanEdit && dispatchCanEdit && requestCanEdit;
}

export function availableDispatchOrigins<T extends { id: string; state: string }>(
  communications: T[],
  currentCommunicationId: string | null,
) {
  return communications.filter(
    (communication) =>
      communication.state !== "cancelled" || communication.id === currentCommunicationId,
  );
}

export function DispatchInstitutionField({
  institutions,
  institutionsLoaded,
  value,
  historicalInstitution,
  onChange,
  onInstitutionsChanged,
}: {
  institutions: EfaInstitutionChoice[];
  institutionsLoaded: boolean;
  value: string;
  historicalInstitution: { id: string; name: string | null } | null;
  onChange: (institutionId: string) => void;
  onInstitutionsChanged: (institutions: EfaInstitutionChoice[]) => void;
}) {
  const retainingHistorical = historicalInstitution?.id === value;
  const [picker, setPicker] = useState<ComponentType<{
    initialInstitutions: EfaInstitutionChoice[];
    value: string;
    onChange: (institutionId: string) => void;
    onInstitutionsChanged?: (institutions: EfaInstitutionChoice[]) => void;
  }> | null>(null);
  useEffect(() => {
    let active = true;
    void loadInstitutionPicker().then((component) => {
      if (active && component) setPicker(() => component);
    });
    return () => {
      active = false;
    };
  }, []);
  const Picker = picker;
  return (
    <div className="space-y-2">
      {retainingHistorical && (
        <p className="text-sm" role="status">
          Destino histórico: {historicalInstitution.name ?? "Institución inactiva"}. Se conserva si
          no se cambia la selección.
        </p>
      )}
      {Picker ? (
        <Picker
          key={institutionsLoaded ? "institutions-loaded" : "institutions-loading"}
          initialInstitutions={institutions}
          value={retainingHistorical ? "" : value}
          onChange={onChange}
          onInstitutionsChanged={onInstitutionsChanged}
        />
      ) : (
        <p className="text-sm" role="status">
          Cargando el catálogo institucional…
        </p>
      )}
    </div>
  );
}

export function EfaDispatchStepper({
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
  const listForEpisode = useServerFn(listEfaDispatchesForEpisode);
  const getHistory = useServerFn(getEfaDispatchHistory);
  const getDispatch = useServerFn(getEfaDispatch);
  const createDispatch = useServerFn(createEfaDispatch);
  const updateDispatch = useServerFn(updateEfaDispatch);
  const finalizeDispatch = useServerFn(finalizeEfaDispatch);
  const cancelDispatch = useServerFn(cancelEfaDispatch);
  const reactivateDispatch = useServerFn(reactivateEfaDispatch);
  const addContact = useServerFn(addEfaDispatchContactAttempt);
  const createSupport = useServerFn(createEfaSupportRequest);
  const updateSupport = useServerFn(updateEfaSupportRequest);
  const listNotices = useServerFn(listEfaDispatchNotices);
  const markNoticeRead = useServerFn(markEfaDispatchNoticeRead);
  const listBases = useServerFn(listEfaBases);
  const listInstitutions = useServerFn(listEfaInstitutions);
  const listCalls = useServerFn(listEfaCommunicationsForEpisode);
  const getEpisode = useServerFn(getEfaEpisode);
  const [rows, setRows] = useState<DispatchView[]>([]);
  const [bases, setBases] = useState<BaseChoice[]>([]);
  const [institutions, setInstitutions] = useState<EfaInstitutionChoice[]>([]);
  const [institutionsLoaded, setInstitutionsLoaded] = useState(false);
  const [calls, setCalls] = useState<
    Array<{
      id: string;
      priority: "red" | "yellow" | "green" | null;
      state: "draft" | "finalized" | "cancelled";
    }>
  >([]);
  const [notices, setNotices] = useState<
    Array<{
      id: string;
      type: string;
      dispatchId?: string;
      supportRequestId?: string;
      createdAt: string;
      readAt: string | null;
    }>
  >([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [form, setFormState] = useState<DispatchForm>(emptyDispatchForm);
  const [step, setStep] = useState(0);
  const [busy, setBusy] = useState(false);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [history, setHistory] = useState<
    Array<{
      action: string;
      versionBefore: number | null;
      versionAfter: number;
      occurredAt: string;
      beforeState: Record<string, unknown> | null;
      afterState: Record<string, unknown>;
    }>
  >([]);
  const [supportRequests, setSupportRequests] = useState<
    Array<{
      id: string;
      version: number;
      requestedAt: string;
      reason: string;
      responseDispatchId: string | null;
      sourceDispatchId: string;
      canEdit: boolean;
    }>
  >([]);
  const [contactNote, setContactNote] = useState("");
  const [contactAt, setContactAt] = useState("");
  const [supportReason, setSupportReason] = useState("");
  const [supportAt, setSupportAt] = useState("");
  const [queueEntries, setQueueEntries] = useState<DispatchQueueEntry[]>([]);
  const [selectedQueueId, setSelectedQueueId] = useState<string | null>(null);
  const [conflictSnapshot, setConflictSnapshot] = useState<{
    operationId: string;
    ownerUserId: string;
    episodeId: string;
    dispatch?: DispatchView;
    supportRequest?: {
      id: string;
      version: number;
      requestedAt: string;
      reason: string;
      responseDispatchId: string | null;
      sourceDispatchId: string;
    };
  } | null>(null);
  const [storageRetry, setStorageRetry] = useState<DispatchQueueEntry | null>(null);
  const [queueReady, setQueueReady] = useState(false);
  const queueStore = useRef<DispatchQueueStore | null>(null);
  const lifecycleRetryRef = useRef<DispatchLifecycleOperation | null>(null);
  const busyRef = useRef(false);
  const mounted = useRef(true);
  const owner = useRef(currentUserId);
  const canWriteRef = useRef(canWrite);
  const episodeCanEditRef = useRef(episodeCanEdit);
  const rowsRef = useRef(rows);
  const supportRequestsRef = useRef(supportRequests);
  const editorSnapshots = useRef(new Map<string, { selectedId: string | null; form: string }>());
  const retryQueueRef = useRef<() => Promise<void>>(async () => {});
  const selectedQueueRef = useRef<string | null>(null);
  const inFlightOperations = useRef(new Set<string>());
  owner.current = currentUserId;
  canWriteRef.current = canWrite;
  episodeCanEditRef.current = episodeCanEdit;
  rowsRef.current = rows;
  supportRequestsRef.current = supportRequests;
  const selected = rows.find((row) => row.id === selectedId) ?? null;
  const selectedQueueEntry =
    queueEntries.find((entry) => entry.operationId === selectedQueueId) ?? null;
  const editable = canWrite && (selected ? selected.canEdit : episodeCanEdit);
  const queueLocked = storageRetry !== null || queueEntries.length > 0;
  const dirty = selected ? dispatchFormChanged(form, restoreDispatchForm(selected)) : false;
  const editorRef = useRef({ selectedId, form, dirty });
  const selectedIdRef = useRef(selectedId);
  editorRef.current = { selectedId, form, dirty };
  selectedIdRef.current = selectedId;
  const setForm = (value: DispatchForm | ((current: DispatchForm) => DispatchForm)) => {
    const next = typeof value === "function" ? value(editorRef.current.form) : value;
    const currentId = selectedIdRef.current;
    const currentRecord = rowsRef.current.find((row) => row.id === currentId);
    editorRef.current = {
      selectedId: currentId,
      form: next,
      dirty: currentRecord ? dispatchFormChanged(next, restoreDispatchForm(currentRecord)) : false,
    };
    setFormState(next);
  };

  async function refresh() {
    const targetOwner = currentUserId;
    const targetEpisode = episodeId;
    const selectedAtStart = editorRef.current.selectedId;
    const helpers = await loadClient();
    if (!mounted.current || owner.current !== targetOwner || episodeId !== targetEpisode) return;
    const result = (await listForEpisode({ data: targetEpisode })) as unknown as DispatchView[];
    if (!mounted.current || owner.current !== targetOwner || episodeId !== targetEpisode) return;
    setRows(result);
    const currentEditor = editorRef.current;
    const targetDispatchId = currentEditor.selectedId;
    const currentRecord = result.find((row) => row.id === targetDispatchId);
    if (
      currentRecord &&
      targetDispatchId === selectedAtStart &&
      helpers.shouldAdoptRefreshedDispatch(
        currentEditor.selectedId,
        currentRecord.id,
        currentEditor.dirty,
      )
    ) {
      const restored = restoreDispatchForm(currentRecord);
      editorRef.current = { selectedId: currentRecord.id, form: restored, dirty: false };
      setForm(restored);
    }
    if (targetDispatchId) {
      try {
        const details = (await getDispatch({ data: targetDispatchId })) as {
          supportRequests?: typeof supportRequests;
        };
        if (
          mounted.current &&
          owner.current === targetOwner &&
          episodeId === targetEpisode &&
          editorRef.current.selectedId === targetDispatchId
        )
          setSupportRequests(details.supportRequests ?? []);
      } catch {
        /* The confirmed dispatch remains valid even if its support detail cannot refresh. */
      }
    }
    if (targetDispatchId && !result.some((row) => row.id === targetDispatchId)) {
      if (!editorRef.current.dirty) {
        selectedIdRef.current = null;
        editorRef.current = { ...editorRef.current, selectedId: null };
        setSelectedId(null);
      }
    }
    const noticeResult = (await listNotices()) as typeof notices;
    if (mounted.current && owner.current === targetOwner && episodeId === targetEpisode)
      setNotices(noticeResult);
  }

  useEffect(() => {
    mounted.current = true;
    const ticket = currentUserId;
    let active = true;
    void Promise.all([
      listForEpisode({ data: episodeId }),
      canWrite ? listBases() : Promise.resolve([]),
      canWrite ? listInstitutions() : Promise.resolve([]),
      listCalls({ data: episodeId }),
      listNotices(),
      loadQueue(),
    ])
      .then(
        async ([
          dispatches,
          activeBases,
          activeInstitutions,
          callRows,
          noticeRows,
          queueModule,
        ]) => {
          if (!active || owner.current !== ticket) return;
          setRows(dispatches as unknown as DispatchView[]);
          setBases(activeBases as BaseChoice[]);
          setInstitutions(activeInstitutions as EfaInstitutionChoice[]);
          setInstitutionsLoaded(true);
          setCalls(callRows as typeof calls);
          setNotices(noticeRows as typeof notices);
          const store = queueModule.createIndexedDbDispatchQueueStore();
          queueStore.current = store;
          const pending = await store.list(ticket, episodeId);
          if (!active || owner.current !== ticket) return;
          setQueueEntries(pending);
          setQueueReady(true);
          setReady(true);
        },
      )
      .catch((reason: unknown) => {
        if (active && owner.current === ticket) {
          setError(
            reason instanceof Error ? reason.message : "No se pudieron cargar los despachos.",
          );
          setReady(true);
        }
      });
    return () => {
      active = false;
      mounted.current = false;
    };
  }, [
    episodeId,
    currentUserId,
    canWrite,
    listBases,
    listInstitutions,
    listCalls,
    listForEpisode,
    listNotices,
  ]);

  useEffect(() => {
    if (!selected) {
      if (editorRef.current.selectedId === null) setForm(emptyDispatchForm());
      return;
    }
    if (!editorRef.current.dirty) setForm(restoreDispatchForm(selected));
    let active = true;
    const targetUser = currentUserId;
    void getHistory({ data: selected.id })
      .then((result) => {
        if (active && owner.current === targetUser && selectedId === selected.id)
          setHistory(result as typeof history);
      })
      .catch(() => {
        if (active && owner.current === targetUser && selectedId === selected.id) setHistory([]);
      });
    void getDispatch({ data: selected.id })
      .then((result) => {
        if (active && owner.current === targetUser && selectedId === selected.id)
          setSupportRequests(
            (result as { supportRequests?: typeof supportRequests }).supportRequests ?? [],
          );
      })
      .catch(() => {
        if (active && owner.current === targetUser && selectedId === selected.id)
          setSupportRequests([]);
      });
    return () => {
      active = false;
    };
  }, [selected, selectedId, currentUserId, getDispatch, getHistory]);

  const freeze = async (
    kind: DispatchQueueEntry["kind"],
    payload: DispatchQueueEntry["payload"],
  ) => {
    if (!queueStore.current || !queueReady || busyRef.current) return;
    busyRef.current = true;
    setBusy(true);
    setError("");
    setMessage("");
    const operationId =
      "operationId" in payload
        ? payload.operationId
        : "clientEventId" in payload
          ? payload.clientEventId
          : "clientCreationKey" in payload
            ? payload.clientCreationKey
            : crypto.randomUUID();
    const targetOwner = currentUserId;
    if (!editorSnapshots.current.has(operationId))
      editorSnapshots.current.set(operationId, {
        selectedId: editorRef.current.selectedId,
        form: JSON.stringify(editorRef.current.form),
      });
    let entry: DispatchQueueEntry = {
      ownerUserId: targetOwner,
      episodeId,
      operationId,
      kind,
      payload,
      status: "pending",
      createdAt: new Date().toISOString(),
    };
    try {
      const helpers = await loadClient();
      if (!mounted.current || owner.current !== targetOwner || !canWriteRef.current) {
        setError("La cuenta o el permiso cambió antes de guardar; no se envió la solicitud.");
        return;
      }
      entry = helpers.makeDispatchQueueEntry({
        ownerUserId: targetOwner,
        episodeId,
        operationId,
        kind,
        payload,
      });
      await (await loadQueue()).persistDispatchOperation(queueStore.current, entry);
      setStorageRetry(null);
      setQueueEntries((existing) =>
        existing.some((item) => item.operationId === entry.operationId)
          ? existing
          : [...existing, entry],
      );
      await runEntry(entry);
    } catch (reason) {
      setStorageRetry(entry);
      setError(
        `No se pudo guardar la solicitud local. Conservamos la operación ${operationId}; reintenta exactamente la misma solicitud cuando se restablezca el almacenamiento.`,
      );
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  };

  const executeEntry = async (entry: DispatchQueueEntry) => {
    const targetOwner = currentUserId;
    const ticketEpisode = episodeId;
    const module = await loadQueue();
    const outcome = await module.dispatchStoredOperation(
      queueStore.current!,
      targetOwner,
      ticketEpisode,
      entry.operationId,
      async (stored) => {
        if (!mounted.current || owner.current !== targetOwner || !canWriteRef.current)
          throw new Error("Se requiere acceso EFA vigente.");
        const p = stored.payload as Record<string, unknown>;
        const episode = (await getEpisode({ data: ticketEpisode })) as { canEdit?: boolean };
        if (
          !mounted.current ||
          owner.current !== targetOwner ||
          episodeId !== ticketEpisode ||
          !canWriteRef.current ||
          !episodeCanEditRef.current ||
          !episode.canEdit
        )
          throw new Error("El episodio ya no admite cambios con el acceso actual.");
        let entityCanEdit = true;
        if (stored.kind !== "create") {
          let dispatchId = "dispatchId" in p ? String(p["dispatchId"]) : "";
          let supportCanEdit: boolean | undefined;
          if (stored.kind === "support-create") dispatchId = String(p["sourceDispatchId"]);
          if (stored.kind === "support-update") {
            supportCanEdit = false;
            for (const row of rowsRef.current) {
              const details = (await getDispatch({ data: row.id })) as {
                canEdit?: boolean;
                supportRequests?: Array<{ id: string; canEdit: boolean }>;
              };
              if (
                !mounted.current ||
                owner.current !== targetOwner ||
                episodeId !== ticketEpisode ||
                !canWriteRef.current ||
                !episodeCanEditRef.current
              )
                throw new Error("La cuenta o el permiso cambió antes del envío.");
              const request = details.supportRequests?.find(
                (item) => item.id === p["supportRequestId"],
              );
              if (request) {
                entityCanEdit = details.canEdit === true;
                supportCanEdit = request.canEdit;
                break;
              }
            }
            entityCanEdit = entityCanEdit && supportCanEdit === true;
          } else {
            const fresh = (await getDispatch({ data: dispatchId })) as { canEdit?: boolean };
            if (
              !mounted.current ||
              owner.current !== targetOwner ||
              episodeId !== ticketEpisode ||
              !canWriteRef.current ||
              !episodeCanEditRef.current
            )
              throw new Error("La cuenta o el permiso cambió antes del envío.");
            entityCanEdit = fresh.canEdit === true;
          }
        }
        const helpers = await loadClient();
        if (
          !mounted.current ||
          owner.current !== targetOwner ||
          episodeId !== ticketEpisode ||
          !canWriteRef.current ||
          !episodeCanEditRef.current ||
          !helpers.canEditQueuedDispatch(stored, canWriteRef.current, true, entityCanEdit)
        )
          throw new Error("El registro ya no admite cambios con el acceso actual.");
        if (stored.kind === "create")
          return createDispatch({ data: p }) as Promise<{ operation: { id: string } }>;
        if (stored.kind === "update")
          return updateDispatch({ data: p }) as Promise<{ operation: { id: string } }>;
        if (stored.kind === "finalize")
          return finalizeDispatch({ data: p }) as Promise<{ operation: { id: string } }>;
        if (stored.kind === "contact-attempt") {
          const result = (await addContact({ data: p as never })) as { clientEventId: string };
          return { operation: { id: result.clientEventId } };
        }
        if (stored.kind === "support-create")
          return createSupport({ data: p }) as Promise<{ operation: { id: string } }>;
        if (stored.kind === "support-update")
          return updateSupport({ data: p }) as Promise<{ operation: { id: string } }>;
        throw new Error("La operación de apoyo requiere actualización explícita.");
      },
      async (stored) => {
        if (
          !mounted.current ||
          owner.current !== targetOwner ||
          episodeId !== ticketEpisode ||
          !canWriteRef.current ||
          !episodeCanEditRef.current
        )
          return false;
        const helpers = await loadClient();
        if (
          !mounted.current ||
          owner.current !== targetOwner ||
          episodeId !== ticketEpisode ||
          !canWriteRef.current ||
          !episodeCanEditRef.current
        )
          return false;
        const episode = (await getEpisode({ data: ticketEpisode })) as { canEdit?: boolean };
        if (
          !mounted.current ||
          owner.current !== targetOwner ||
          episodeId !== ticketEpisode ||
          !canWriteRef.current ||
          !episodeCanEditRef.current ||
          !episode.canEdit
        )
          return false;
        let entityCanEdit = true;
        if (stored.kind !== "create") {
          const p = stored.payload as Record<string, unknown>;
          if (stored.kind === "support-update") {
            entityCanEdit = false;
            for (const row of rowsRef.current) {
              const dispatch = (await getDispatch({ data: row.id })) as {
                canEdit?: boolean;
                supportRequests?: Array<{ id: string; canEdit: boolean }>;
              };
              if (
                !mounted.current ||
                owner.current !== targetOwner ||
                episodeId !== ticketEpisode ||
                !canWriteRef.current ||
                !episodeCanEditRef.current
              )
                return false;
              const request = dispatch.supportRequests?.find(
                (item) => item.id === p["supportRequestId"],
              );
              if (request) {
                entityCanEdit = dispatch.canEdit === true && request.canEdit;
                break;
              }
            }
          } else {
            const dispatchId =
              stored.kind === "support-create"
                ? String(p["sourceDispatchId"])
                : String(p["dispatchId"] ?? "");
            const dispatch = (await getDispatch({ data: dispatchId })) as { canEdit?: boolean };
            if (
              !mounted.current ||
              owner.current !== targetOwner ||
              episodeId !== ticketEpisode ||
              !canWriteRef.current ||
              !episodeCanEditRef.current
            )
              return false;
            entityCanEdit = dispatch.canEdit === true;
          }
        }
        return helpers.canEditQueuedDispatch(
          stored,
          canWriteRef.current,
          episode.canEdit === true,
          entityCanEdit,
        );
      },
    );
    if (!mounted.current || owner.current !== targetOwner || episodeId !== ticketEpisode) return;
    if (outcome.status === "confirmed" || outcome.status === "confirmed-cleanup-failed") {
      const rawResult: unknown = outcome.result;
      const rawDispatch =
        rawResult && typeof rawResult === "object" && "dispatch" in rawResult
          ? rawResult.dispatch
          : undefined;
      const mutationDto = isDispatchMutationDto(rawDispatch) ? rawDispatch : undefined;
      const submitted = editorSnapshots.current.get(entry.operationId);
      if (mutationDto) {
        const helpers = await loadClient();
        const operationKey = JSON.stringify([targetOwner, ticketEpisode, entry.operationId]);
        if (
          !mounted.current ||
          owner.current !== targetOwner ||
          episodeId !== ticketEpisode ||
          !inFlightOperations.current.has(operationKey)
        )
          return;
        setMessage("El despacho quedó confirmado.");
        const now = editorRef.current;
        const previous = rowsRef.current.find((row) => row.id === mutationDto.id) ?? null;
        const confirmed = helpers.normalizeConfirmedDispatch(mutationDto, previous);
        setRows((existing) => [...existing.filter((row) => row.id !== confirmed.id), confirmed]);
        if (
          submitted &&
          helpers.canApplyConfirmedMutation({
            mounted: mounted.current,
            ownerMatches: owner.current === targetOwner,
            episodeMatches: episodeId === ticketEpisode,
            operationInFlight: inFlightOperations.current.has(operationKey),
            kind: entry.kind,
            dispatchId: confirmed.id,
            submitted,
            currentSelectedId: now.selectedId,
            currentForm: JSON.stringify(now.form),
          })
        ) {
          const restored = restoreDispatchForm(confirmed);
          editorRef.current = { selectedId: confirmed.id, form: restored, dirty: false };
          selectedIdRef.current = confirmed.id;
          setSelectedId(confirmed.id);
          setForm(restored);
        }
      } else {
        setMessage("La operación quedó confirmada.");
      }
      editorSnapshots.current.delete(entry.operationId);
      if (outcome.status === "confirmed") {
        try {
          await refresh();
        } catch {
          if (!mounted.current || owner.current !== targetOwner || episodeId !== ticketEpisode)
            return;
          setMessage(
            "El despacho quedó confirmado, pero no se pudo actualizar la vista. Recarga para ver el estado actual.",
          );
        }
      } else {
        setMessage(
          "El despacho quedó confirmado. Solo queda limpiar la solicitud local; no se volverá a enviar.",
        );
      }
    } else if (outcome.status === "paused") setError(outcome.error);
    else if (outcome.status === "stored") setError(outcome.error);
    try {
      const remaining = await queueStore.current!.list(targetOwner, ticketEpisode);
      if (
        mounted.current &&
        owner.current === targetOwner &&
        episodeId === ticketEpisode &&
        inFlightOperations.current.has(
          JSON.stringify([targetOwner, ticketEpisode, entry.operationId]),
        )
      )
        setQueueEntries(remaining);
    } catch {
      /* Keep the frozen form and existing queue state. */
    }
  };

  const runEntry = async (entry: DispatchQueueEntry) => {
    const key = JSON.stringify([currentUserId, episodeId, entry.operationId]);
    if (inFlightOperations.current.has(key)) return;
    inFlightOperations.current.add(key);
    try {
      await executeEntry(entry);
    } catch (reason) {
      if (mounted.current && owner.current === currentUserId)
        setError(
          reason instanceof Error ? reason.message : "No se pudo procesar la operación local.",
        );
    } finally {
      inFlightOperations.current.delete(key);
    }
  };

  const selectQueueEntry = async (entry: DispatchQueueEntry) => {
    const targetOwner = currentUserId;
    const targetEpisode = episodeId;
    selectedQueueRef.current = entry.operationId;
    setSelectedQueueId(entry.operationId);
    setConflictSnapshot(null);
    try {
      let currentForm = form;
      if (entry.kind === "finalize" && "dispatchId" in entry.payload) {
        const record = (await getDispatch({
          data: entry.payload["dispatchId"],
        })) as unknown as DispatchView;
        if (
          !mounted.current ||
          owner.current !== targetOwner ||
          episodeId !== targetEpisode ||
          selectedQueueRef.current !== entry.operationId
        )
          return;
        currentForm = restoreDispatchForm(record);
      }
      const helpers = await loadClient();
      if (
        !mounted.current ||
        owner.current !== targetOwner ||
        episodeId !== targetEpisode ||
        selectedQueueRef.current !== entry.operationId
      )
        return;
      const restored = helpers.restoreDispatchQueueForm(entry, currentForm);
      if (restored) {
        if (entry.kind === "update" && !("firstResponseRole" in entry.payload)) {
          const existing = rowsRef.current.find(
            (row) =>
              row.id === String((entry.payload as Record<string, unknown>)["dispatchId"] ?? ""),
          );
          if (
            existing?.firstResponseRole &&
            !firstResponseRoleValues.some((role) => role === existing.firstResponseRole)
          )
            restored.firstResponseRole = existing.firstResponseRole;
        }
        setForm(restored);
      }
    } catch {
      if (
        mounted.current &&
        owner.current === targetOwner &&
        selectedQueueRef.current === entry.operationId
      )
        setError(
          "No se pudo restaurar la vista local; la solicitud congelada sigue disponible para reintentar.",
        );
    }
  };

  const compareConflictWithServer = async (entry: DispatchQueueEntry) => {
    if (entry.status !== "paused-conflict") return;
    const targetOwner = currentUserId;
    const targetEpisode = episodeId;
    const isCurrent = () =>
      mounted.current &&
      owner.current === targetOwner &&
      episodeId === targetEpisode &&
      selectedQueueRef.current === entry.operationId;
    try {
      if (entry.kind === "update" || entry.kind === "finalize") {
        const dispatch = (await getDispatch({
          data: (entry.payload as { dispatchId: string }).dispatchId,
        })) as unknown as DispatchView;
        if (!isCurrent()) return;
        setConflictSnapshot({
          operationId: entry.operationId,
          ownerUserId: targetOwner,
          episodeId: targetEpisode,
          dispatch,
        });
      } else if (entry.kind === "support-update") {
        let found:
          | {
              id: string;
              version: number;
              requestedAt: string;
              reason: string;
              responseDispatchId: string | null;
              sourceDispatchId: string;
            }
          | undefined;
        for (const row of rows) {
          const details = (await getDispatch({ data: row.id })) as unknown as {
            supportRequests?: typeof supportRequests;
          };
          if (!isCurrent()) return;
          const request = details.supportRequests?.find(
            (candidate) =>
              candidate.id === (entry.payload as { supportRequestId: string }).supportRequestId,
          );
          if (request) {
            found = { ...request, sourceDispatchId: row.id };
            break;
          }
        }
        if (!isCurrent()) return;
        if (!found)
          throw new Error("No se encontró la solicitud de apoyo actual en este episodio.");
        setConflictSnapshot({
          operationId: entry.operationId,
          ownerUserId: targetOwner,
          episodeId: targetEpisode,
          supportRequest: found,
        });
      } else return;
    } catch (reason) {
      if (isCurrent())
        setError(reason instanceof Error ? reason.message : "No se pudo comparar con el servidor.");
    }
  };

  const applyServerConflictResolution = async (entry: DispatchQueueEntry) => {
    const snapshot = conflictSnapshot;
    if (
      !snapshot ||
      snapshot.operationId !== entry.operationId ||
      snapshot.ownerUserId !== currentUserId ||
      snapshot.episodeId !== episodeId
    )
      return;
    if (
      !window.confirm(
        "Descartar únicamente esta solicitud rechazada y continuar con la versión actual del servidor?",
      )
    )
      return;
    const targetOwner = currentUserId;
    const targetEpisode = episodeId;
    await queueStore.current?.remove(targetOwner, targetEpisode, entry.operationId);
    if (
      !mounted.current ||
      owner.current !== targetOwner ||
      episodeId !== targetEpisode ||
      selectedQueueRef.current !== entry.operationId
    )
      return;
    const remaining = await queueStore.current!.list(targetOwner, targetEpisode);
    if (
      !mounted.current ||
      owner.current !== targetOwner ||
      selectedQueueRef.current !== entry.operationId
    )
      return;
    setQueueEntries(remaining);
    selectedQueueRef.current = null;
    setSelectedQueueId(null);
    setConflictSnapshot(null);
    if (snapshot.dispatch) {
      setRows((current) =>
        current.map((row) => (row.id === snapshot.dispatch!.id ? snapshot.dispatch! : row)),
      );
      selectedIdRef.current = snapshot.dispatch.id;
      setSelectedId(snapshot.dispatch.id);
      setForm(restoreDispatchForm(snapshot.dispatch));
      setMessage("Se descartó la solicitud rechazada y se cargó la versión actual del servidor.");
    } else
      setMessage(
        "Se descartó la solicitud de apoyo rechazada; la versión del servidor queda como referencia.",
      );
  };

  const rebaseConflict = async (entry: DispatchQueueEntry) => {
    const snapshot = conflictSnapshot;
    if (
      entry.status !== "paused-conflict" ||
      !canWriteRef.current ||
      !snapshot ||
      snapshot.operationId !== entry.operationId ||
      snapshot.ownerUserId !== currentUserId ||
      snapshot.episodeId !== episodeId
    )
      return;
    const nextVersion = snapshot.dispatch?.version ?? snapshot.supportRequest?.version;
    if (!nextVersion) return;
    const targetOwner = currentUserId;
    const targetEpisode = episodeId;
    const nextOperationId = crypto.randomUUID();
    try {
      const helpers = await loadClient();
      if (
        !mounted.current ||
        owner.current !== targetOwner ||
        episodeId !== targetEpisode ||
        selectedQueueRef.current !== entry.operationId ||
        !canWriteRef.current
      )
        return;
      const freshEpisode = (await getEpisode({ data: targetEpisode })) as { canEdit?: boolean };
      if (
        !mounted.current ||
        owner.current !== targetOwner ||
        episodeId !== targetEpisode ||
        selectedQueueRef.current !== entry.operationId ||
        !canWriteRef.current ||
        !episodeCanEditRef.current ||
        !freshEpisode.canEdit
      ) {
        setError("El episodio ya no admite cambios; no se rebasó la solicitud.");
        return;
      }
      let entityCanEdit = false;
      const payload = entry.payload as Record<string, unknown>;
      const dispatchId = String(payload["dispatchId"] ?? "");
      for (const row of rowsRef.current) {
        const id = entry.kind === "support-update" ? row.id : dispatchId;
        if (!id) break;
        const details = (await getDispatch({ data: id })) as {
          canEdit?: boolean;
          supportRequests?: Array<{ id: string; canEdit: boolean }>;
        };
        if (
          !mounted.current ||
          owner.current !== targetOwner ||
          episodeId !== targetEpisode ||
          selectedQueueRef.current !== entry.operationId ||
          !canWriteRef.current ||
          !episodeCanEditRef.current
        )
          return;
        if (entry.kind === "support-update") {
          const support = details.supportRequests?.find(
            (item) => item.id === payload["supportRequestId"],
          );
          if (support) {
            entityCanEdit = details.canEdit === true && support.canEdit;
            break;
          }
        } else {
          entityCanEdit = details.canEdit === true;
          break;
        }
      }
      if (
        !helpers.canEditQueuedDispatch(
          entry,
          canWriteRef.current,
          freshEpisode.canEdit === true,
          entityCanEdit,
        )
      ) {
        setError("El registro ya no admite cambios; no se rebasó la solicitud.");
        return;
      }
      const rebased = helpers.rebaseDispatchQueueEntry(entry, nextVersion, nextOperationId);
      await (await loadQueue()).persistDispatchOperation(queueStore.current!, rebased);
      if (
        !mounted.current ||
        owner.current !== targetOwner ||
        episodeId !== targetEpisode ||
        selectedQueueRef.current !== entry.operationId ||
        !canWriteRef.current
      )
        return;
      await queueStore.current!.remove(targetOwner, targetEpisode, entry.operationId);
      if (
        !mounted.current ||
        owner.current !== targetOwner ||
        episodeId !== targetEpisode ||
        !canWriteRef.current
      )
        return;
      const remaining = await queueStore.current!.list(targetOwner, targetEpisode);
      if (
        !mounted.current ||
        owner.current !== targetOwner ||
        selectedQueueRef.current !== entry.operationId ||
        !canWriteRef.current
      )
        return;
      setQueueEntries(remaining);
      selectedQueueRef.current = nextOperationId;
      setSelectedQueueId(nextOperationId);
      setConflictSnapshot(null);
      setMessage(
        "Se confirmó el rebase explícito con una identidad nueva; la solicitud anterior fue reemplazada sin editar su payload.",
      );
      await runEntry(rebased);
    } catch (reason) {
      if (
        mounted.current &&
        owner.current === targetOwner &&
        selectedQueueRef.current === entry.operationId
      )
        setError(reason instanceof Error ? reason.message : "No se pudo guardar el rebase local.");
    }
  };

  retryQueueRef.current = async () => {
    const ticket = currentUserId;
    if (!queueStore.current || !canWriteRef.current) return;
    let pending: DispatchQueueEntry[];
    try {
      pending = await queueStore.current.list(ticket, episodeId);
    } catch {
      return;
    }
    if (!mounted.current || owner.current !== ticket || !canWriteRef.current) return;
    for (const entry of pending) {
      if (entry.status !== "pending" && entry.status !== "uncertain") continue;
      if (!mounted.current || owner.current !== ticket || !canWriteRef.current) return;
      await runEntry(entry);
    }
  };

  useEffect(() => {
    const onOnline = () => {
      void retryQueueRef.current();
    };
    window.addEventListener("online", onOnline);
    return () => window.removeEventListener("online", onOnline);
  }, []);

  const save = async () => {
    if (!editable || busy || !ready || !queueReady || !form.baseId) return;
    const source = selected ?? {
      t0At: null,
      t1At: null,
      t2At: null,
      t3At: null,
      t4At: null,
      t5At: null,
      t6At: null,
    };
    const times = dispatchFormTimes(form, source);
    const preserveLegacyFirstResponseRole =
      selected &&
      !!selected.firstResponseRole &&
      !firstResponseRoleValues.some((role) => role === selected.firstResponseRole) &&
      form.firstResponseRole === selected.firstResponseRole;
    const fields = {
      baseId: form.baseId,
      institutionId: form.institutionId || null,
      communicationId: form.communicationId || null,
      priority: form.priority || null,
      ...times,
      t0Status: form.t0Status,
      t1Status: form.t1Status,
      t2Status: form.t2Status,
      t3Status: form.t3Status,
      t4Status: form.t4Status,
      t5Status: form.t5Status,
      t6Status: form.t6Status,
      ...(!preserveLegacyFirstResponseRole
        ? { firstResponseRole: form.firstResponseRole || null }
        : {}),
      firstResponseAt: form.firstResponseAt ? new Date(form.firstResponseAt).toISOString() : null,
      note: form.note || null,
      result: form.result || null,
      resultClarification: form.resultClarification || null,
    };
    if (selected)
      await freeze("update", {
        dispatchId: selected.id,
        expectedVersion: selected.version,
        operationId: crypto.randomUUID(),
        ...fields,
      } as unknown as DispatchQueueEntry["payload"]);
    else
      await freeze("create", {
        clientCreationKey: crypto.randomUUID(),
        episodeId,
        ...fields,
      } as unknown as DispatchQueueEntry["payload"]);
  };

  const finalize = async () => {
    if (!selected || !editable || dirty || !form.priority || !form.result || busy) return;
    await freeze("finalize", {
      dispatchId: selected.id,
      expectedVersion: selected.version,
      operationId: crypto.randomUUID(),
      priority: form.priority,
      result: form.result,
      resultClarification: form.resultClarification || null,
    });
  };

  const transitionLifecycle = async (action: "cancel" | "reactivate") => {
    if (!selected || !canWrite || !episodeCanEdit || !selected.canManage || busy || queueLocked)
      return;
    const prompt =
      action === "cancel"
        ? "¿Anular este despacho? Se conservarán sus datos, resultado y vínculos."
        : "¿Reactivar este despacho y restaurar su estado anterior?";
    if (!window.confirm(prompt)) return;
    const helpers = await loadClient();
    const pendingOperation = helpers.reuseDispatchLifecycleOperation(
      lifecycleRetryRef.current,
      action,
      selected.id,
      selected.version,
      () => crypto.randomUUID(),
    );
    lifecycleRetryRef.current = pendingOperation;
    setBusy(true);
    setError("");
    try {
      const input = {
        dispatchId: selected.id,
        expectedVersion: selected.version,
        operationId: pendingOperation.operationId,
      };
      const response = (action === "cancel"
        ? await cancelDispatch({ data: input })
        : await reactivateDispatch({ data: input })) as unknown as {
        dispatch: DispatchMutationDto;
      };
      const helpers = await loadClient();
      const current = rowsRef.current.find((row) => row.id === selected.id) ?? null;
      const updated = helpers.normalizeConfirmedDispatch(response.dispatch, current);
      setRows((existing) => existing.map((row) => (row.id === updated.id ? updated : row)));
      setMessage(
        action === "cancel" ? "El despacho quedó anulado." : "El despacho quedó reactivado.",
      );
      await refresh();
      lifecycleRetryRef.current = null;
    } catch (reason) {
      setError(
        reason instanceof Error ? reason.message : "No se pudo confirmar el cambio del despacho.",
      );
    } finally {
      setBusy(false);
    }
  };

  const quickTime = (key: keyof DispatchForm) => {
    const time = captureDispatchTime(new Date());
    const statusKey = `${String(key).slice(0, 2)}Status` as keyof DispatchForm;
    setForm((old) => ({ ...old, [key]: time, [statusKey]: "observed" }));
  };
  const stepTitle =
    step === 0
      ? "Base y vínculo"
      : step <= 7
        ? timeSteps[step - 1]?.[1]
        : step === 8
          ? "Prioridad"
          : step === 9
            ? "Resultado"
            : "Revisión";

  return (
    <div className="space-y-3">
      <section
        className="space-y-3 rounded-lg border p-3"
        aria-label={`Despachos del episodio ${episodeLabel}`}
      >
        <h2 className="text-lg font-semibold">Despachos · {episodeLabel}</h2>
        {!canWrite && <p role="status">Solo lectura: el acceso EFA no está vigente.</p>}
        {!ready && <p role="status">Cargando despachos…</p>}
        {error && <p role="alert">{error}</p>}
        {message && <p role="status">{message}</p>}
        {notices
          .filter(
            (n) =>
              !n.readAt &&
              ((n.dispatchId && rows.some((row) => row.id === n.dispatchId)) ||
                (n.supportRequestId &&
                  supportRequests.some((request) => request.id === n.supportRequestId))),
          )
          .map((notice) => (
            <p key={notice.id} className="rounded bg-amber-50 p-3">
              Un administrador corrigió un despacho.{" "}
              <button
                className="underline"
                onClick={() => void markNoticeRead({ data: notice.id }).then(refresh)}
              >
                Marcar como leído
              </button>
            </p>
          ))}
        <div className="space-y-2">
          {rows.map((row) => (
            <button
              key={row.id}
              type="button"
              className="w-full rounded border p-3 text-left"
              aria-pressed={selectedId === row.id}
              onClick={() => {
                selectedIdRef.current = row.id;
                setSelectedId(row.id);
                setForm(restoreDispatchForm(row));
                setStep(0);
              }}
            >
              <span className="font-medium">
                {bases.find((base) => base.id === row.baseId)?.name ?? "Base histórica"}
              </span>{" "}
              ·{" "}
              {row.state === "cancelled"
                ? "Anulado"
                : row.state === "finalized"
                  ? "Finalizado"
                  : "Borrador"}{" "}
              · versión {row.version}
              {row.t0At && (
                <span className="block text-sm">Despacho: {formatDispatchDate(row.t0At)}</span>
              )}
              {row.institutionName && (
                <span className="block text-sm">
                  Destino: {row.institutionName}
                  {row.institutionIsActive === false ? " · histórico/inactivo" : ""}
                </span>
              )}
            </button>
          ))}
        </div>
        {selected?.canManage && canWrite && episodeCanEdit && (
          <div className="flex flex-wrap gap-2" aria-label="Estado del despacho">
            {selected.state === "cancelled" ? (
              <button
                type="button"
                className="min-h-11 rounded border px-4"
                disabled={busy || queueLocked}
                onClick={() => void transitionLifecycle("reactivate")}
              >
                Reactivar despacho
              </button>
            ) : (
              <button
                type="button"
                className="min-h-11 rounded border border-amber-300 px-4"
                disabled={busy || queueLocked}
                onClick={() => void transitionLifecycle("cancel")}
              >
                Anular despacho
              </button>
            )}
            {selected.state === "cancelled" && selected.cancelledAt && (
              <p role="status" className="self-center text-sm">
                Anulado el {formatDispatchDate(selected.cancelledAt)}; reactivá para editar o
                finalizar.
              </p>
            )}
          </div>
        )}
        {selected?.state === "cancelled" && (
          <dl
            className="grid gap-2 rounded border bg-muted/30 p-3 text-sm sm:grid-cols-2"
            aria-label="Datos del despacho anulado, solo lectura"
          >
            {[
              ["Prioridad", selected.priority],
              ["Resultado", selected.result],
              ["Llamada vinculada", selected.communicationId],
              ["Destino", selected.institutionName ?? selected.institutionId],
              ...timeSteps.map(([key, label]) => [label, selected[key]]),
              ["Primera respuesta", selected.firstResponseAt],
              ["Nota", selected.note],
              ["Aclaración del resultado", selected.resultClarification],
            ].map(([label, value]) => (
              <div key={label}>
                <dt className="font-medium">{label}</dt>
                <dd>{value ? String(value) : "Sin dato"}</dd>
              </div>
            ))}
          </dl>
        )}
        {editable && (
          <button
            type="button"
            className="min-h-11 rounded border px-4"
            disabled={queueLocked}
            onClick={() => {
              selectedIdRef.current = null;
              editorRef.current = { selectedId: null, form: emptyDispatchForm(), dirty: false };
              setSelectedId(null);
              setForm(emptyDispatchForm());
              setStep(0);
            }}
          >
            Nuevo despacho independiente
          </button>
        )}
        {selected && (
          <div className="space-y-2 border-t pt-3">
            <h3 className="font-medium">Historial del despacho</h3>
            {history.map((item, index) => (
              <div key={`${item.versionAfter}-${index}`} className="text-sm">
                {item.action} · versión {item.versionBefore ?? "—"} → {item.versionAfter} ·{" "}
                {formatDispatchDate(item.occurredAt)}
                <details className="mt-1">
                  <summary className="cursor-pointer">Ver valores anteriores y nuevos</summary>
                  <dl className="grid gap-2 sm:grid-cols-2">
                    {[
                      "baseId",
                      "communicationId",
                      "priority",
                      "t0At",
                      "t1At",
                      "t2At",
                      "t3At",
                      "t4At",
                      "t5At",
                      "t6At",
                      "firstResponseRole",
                      "firstResponseAt",
                      "note",
                      "result",
                      "resultClarification",
                    ].map((key) => (
                      <div key={key}>
                        <dt className="font-medium">{key}</dt>
                        <dd>
                          Antes: {String(item.beforeState?.[key] ?? "—")} · Después:{" "}
                          {String(item.afterState?.[key] ?? "—")}
                        </dd>
                      </div>
                    ))}
                  </dl>
                </details>
              </div>
            ))}
            {selected.contactAttempts.map((item) => (
              <p key={item.id} className="text-sm">
                Intento de contacto · {formatDispatchDate(item.occurredAt)} {item.note}
              </p>
            ))}
          </div>
        )}
        {editable && (
          <fieldset disabled={queueLocked} className="space-y-3 border-t pt-3">
            <div className="flex flex-wrap gap-2" aria-label="Progreso del despacho">
              {[
                "Base",
                ...timeSteps.map(([, title]) => title),
                "Prioridad",
                "Resultado",
                "Revisión",
              ].map((title, index) => (
                <button
                  type="button"
                  key={title}
                  aria-current={step === index ? "step" : undefined}
                  className={`min-h-11 rounded px-2 text-xs ${step === index ? "bg-primary text-primary-foreground" : "border"}`}
                  onClick={() => setStep(index)}
                >
                  {index + 1}
                </button>
              ))}
            </div>
            <p aria-live="polite">
              Paso {step + 1} de 11: {stepTitle}
            </p>
            {step === 0 && (
              <div className="space-y-3">
                <label className="block">
                  Base / móvil
                  <select
                    className="mt-1 h-11 w-full rounded border px-3"
                    value={form.baseId}
                    onChange={(event) => setForm({ ...form, baseId: event.target.value })}
                  >
                    <option value="">Seleccionar</option>
                    {selected && !bases.some((base) => base.id === selected.baseId) && (
                      <option value={selected.baseId}>Base histórica (inactiva)</option>
                    )}
                    {bases.map((base) => (
                      <option key={base.id} value={base.id}>
                        {base.name}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="block">
                  Llamada vinculada
                  <select
                    className="mt-1 h-11 w-full rounded border px-3"
                    value={form.communicationId}
                    onChange={(event) => {
                      const call = calls.find((item) => item.id === event.target.value);
                      setForm({
                        ...form,
                        communicationId: event.target.value,
                        ...(!selected && call ? { priority: call.priority ?? "" } : {}),
                      });
                    }}
                  >
                    <option value="">Sin llamada</option>
                    {availableDispatchOrigins(calls, selected?.communicationId ?? null).map(
                      (call) => (
                        <option key={call.id} value={call.id}>
                          Llamada {call.id.slice(0, 8)}
                          {call.state === "cancelled" ? " · anulada (vínculo histórico)" : ""} ·
                          prioridad {call.priority ?? "sin prioridad"}
                        </option>
                      ),
                    )}
                  </select>
                </label>
                <p className="text-sm">
                  Al crear desde una llamada, su prioridad se copia una vez. Después se puede
                  corregir aquí; una vinculación tardía no la modifica.
                </p>
                <label className="block">
                  Primera respuesta (rol anónimo)
                  <FirstResponseRoleSelect
                    value={form.firstResponseRole}
                    onChange={(value) => setForm({ ...form, firstResponseRole: value })}
                  />
                </label>
                <label className="block">
                  Hora de primera respuesta
                  <input
                    type="datetime-local"
                    step="0.001"
                    className="mt-1 h-11 w-full rounded border px-3"
                    value={form.firstResponseAt}
                    onChange={(event) => setForm({ ...form, firstResponseAt: event.target.value })}
                  />
                </label>
                <button
                  type="button"
                  className="min-h-11 rounded border px-4"
                  onClick={() =>
                    setForm({ ...form, firstResponseAt: captureDispatchTime(new Date()) })
                  }
                >
                  Ahora primera respuesta
                </button>
              </div>
            )}
            {step >= 1 && step <= 7 && (
              <div className="space-y-3">
                <h3 className="font-medium">{stepTitle}</h3>
                {(() => {
                  const [key, title] = timeSteps[step - 1]!;
                  const statusKey = `${key.slice(0, 2)}Status` as keyof DispatchForm;
                  return (
                    <>
                      <label className="block">
                        Hora observada
                        <input
                          type="datetime-local"
                          step="0.001"
                          className="mt-1 h-12 w-full rounded border px-3"
                          value={form[key]}
                          onChange={(event) =>
                            setForm({
                              ...form,
                              [key]: event.target.value,
                              [statusKey]: event.target.value
                                ? "observed"
                                : form[statusKey] === "observed"
                                  ? "not_observed"
                                  : form[statusKey],
                            })
                          }
                        />
                      </label>
                      <button
                        type="button"
                        className="min-h-11 rounded border px-4"
                        onClick={() => quickTime(key)}
                      >
                        Ahora: {title}
                      </button>
                      <label className="block">
                        Estado
                        <select
                          className="mt-1 h-11 w-full rounded border px-3"
                          value={form[statusKey]}
                          onChange={(event) =>
                            setForm({
                              ...form,
                              [statusKey]: event.target.value as DispatchForm[typeof statusKey],
                              ...((event.target.value as DispatchForm[typeof statusKey]) ===
                              "observed"
                                ? {}
                                : { [key]: "" }),
                            })
                          }
                        >
                          {statuses.map((value) => (
                            <option key={value} value={value}>
                              {statusLabel[value]}
                            </option>
                          ))}
                        </select>
                      </label>
                      {key === "t4At" && (
                        <DispatchInstitutionField
                          institutions={institutions}
                          institutionsLoaded={institutionsLoaded}
                          value={form.institutionId}
                          historicalInstitution={
                            selected?.institutionIsActive === false
                              ? {
                                  id: selected.institutionId,
                                  name: selected.institutionName ?? null,
                                }
                              : null
                          }
                          onChange={(institutionId) => setForm({ ...form, institutionId })}
                          onInstitutionsChanged={setInstitutions}
                        />
                      )}
                      <p className="text-sm">
                        Los horarios se registran por separado; no se deduce ni valida una secuencia
                        cronológica.
                      </p>
                    </>
                  );
                })()}
              </div>
            )}
            {step === 8 && (
              <div className="space-y-3">
                <h3>Prioridad</h3>
                <select
                  className="h-12 w-full rounded border px-3"
                  value={form.priority}
                  onChange={(event) =>
                    setForm({ ...form, priority: event.target.value as DispatchForm["priority"] })
                  }
                >
                  <option value="">Sin prioridad por ahora</option>
                  <option value="red">Roja</option>
                  <option value="yellow">Amarilla</option>
                  <option value="green">Verde</option>
                </select>
                <textarea
                  className="min-h-24 w-full rounded border p-3"
                  placeholder="Nota operativa opcional"
                  value={form.note}
                  onChange={(event) => setForm({ ...form, note: event.target.value })}
                />
              </div>
            )}
            {step === 9 && (
              <div className="space-y-3">
                <h3>Resultado</h3>
                <select
                  className="h-12 w-full rounded border px-3"
                  value={form.result}
                  onChange={(event) =>
                    setForm({ ...form, result: event.target.value as DispatchForm["result"] })
                  }
                >
                  <option value="">Sin resultado (borrador)</option>
                  {resultOptions.map(([value, label]) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  ))}
                </select>
                <textarea
                  className="min-h-24 w-full rounded border p-3"
                  placeholder="Aclaración breve opcional"
                  value={form.resultClarification}
                  onChange={(event) =>
                    setForm({ ...form, resultClarification: event.target.value })
                  }
                />
              </div>
            )}
            {step === 10 && (
              <div className="space-y-3">
                <p>
                  La finalización es manual y exige prioridad y resultado. Ninguna hora cierra el
                  despacho automáticamente.
                </p>
                {selected?.state === "finalized" && (
                  <p>
                    Finalizado el{" "}
                    {selected.finalizedAt ? formatDispatchDate(selected.finalizedAt) : "—"}; las
                    correcciones conservan el cierre.
                  </p>
                )}
              </div>
            )}
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                disabled={step === 0}
                className="min-h-11 rounded border px-4"
                onClick={() => setStep((value) => Math.max(0, value - 1))}
              >
                Anterior
              </button>
              <button
                type="button"
                disabled={step === 10}
                className="min-h-11 rounded border px-4"
                onClick={() => setStep((value) => Math.min(10, value + 1))}
              >
                Siguiente
              </button>
              <button
                type="button"
                className="min-h-11 rounded bg-primary px-4 text-primary-foreground"
                disabled={busy || !queueReady || !form.baseId}
                onClick={() => void save()}
              >
                {selected ? "Guardar cambios" : "Guardar despacho"}
              </button>
              {selected?.state !== "finalized" && (
                <button
                  type="button"
                  className="min-h-11 rounded border px-4"
                  disabled={busy || !form.priority || !form.result || !selected || dirty}
                  onClick={() => void finalize()}
                >
                  Finalizar despacho
                </button>
              )}
            </div>
          </fieldset>
        )}
        {selected && editable && (
          <div className="space-y-3 border-t pt-3">
            <h3 className="font-medium">Eventos relacionados</h3>
            <label className="block">
              Nota del intento de contacto
              <input
                className="mt-1 h-11 w-full rounded border px-3"
                value={contactNote}
                onChange={(event) => setContactNote(event.target.value)}
              />
            </label>
            <label className="block">
              Hora del intento
              <input
                type="datetime-local"
                step="0.001"
                className="mt-1 h-11 w-full rounded border px-3"
                value={contactAt}
                onChange={(event) => setContactAt(event.target.value)}
              />
            </label>
            <button
              className="min-h-11 rounded border px-4"
              disabled={busy}
              onClick={() => {
                const occurredAt = captureActionTimestamp(new Date());
                void freeze("contact-attempt", {
                  dispatchId: selected.id,
                  clientEventId: crypto.randomUUID(),
                  occurredAt,
                  note: contactNote || null,
                });
              }}
            >
              Registrar intento de contacto · Ahora
            </button>
            <button
              className="min-h-11 rounded border px-4"
              disabled={busy || !inputToIso(contactAt)}
              onClick={() =>
                void freeze("contact-attempt", {
                  dispatchId: selected.id,
                  clientEventId: crypto.randomUUID(),
                  occurredAt: inputToIso(contactAt)!,
                  note: contactNote || null,
                })
              }
            >
              Registrar intento con hora ingresada
            </button>
            <label className="block">
              Motivo de apoyo
              <input
                className="mt-1 h-11 w-full rounded border px-3"
                value={supportReason}
                onChange={(event) => setSupportReason(event.target.value)}
              />
            </label>
            <label className="block">
              Hora de solicitud
              <input
                type="datetime-local"
                step="0.001"
                className="mt-1 h-11 w-full rounded border px-3"
                value={supportAt}
                onChange={(event) => setSupportAt(event.target.value)}
              />
            </label>
            <button
              className="min-h-11 rounded border px-4"
              disabled={busy || !supportReason.trim()}
              onClick={() => {
                const requestedAt = captureActionTimestamp(new Date());
                void freeze("support-create", {
                  clientCreationKey: crypto.randomUUID(),
                  sourceDispatchId: selected.id,
                  requestedAt,
                  reason: supportReason.trim(),
                  responseDispatchId: null,
                });
              }}
            >
              Solicitar apoyo · Ahora
            </button>
            <button
              className="min-h-11 rounded border px-4"
              disabled={busy || !supportReason.trim() || !inputToIso(supportAt)}
              onClick={() =>
                void freeze("support-create", {
                  clientCreationKey: crypto.randomUUID(),
                  sourceDispatchId: selected.id,
                  requestedAt: inputToIso(supportAt)!,
                  reason: supportReason.trim(),
                  responseDispatchId: null,
                })
              }
            >
              Solicitar apoyo con hora ingresada
            </button>
            {supportRequests.map((request) => (
              <div key={request.id} className="rounded border p-3">
                <p>
                  Apoyo solicitado · {formatDispatchDate(request.requestedAt)} · {request.reason}
                </p>
                <label className="mt-2 block">
                  Despacho de respuesta
                  <select
                    className="mt-1 h-11 w-full rounded border px-3"
                    value={request.responseDispatchId ?? ""}
                    disabled={
                      busy ||
                      queueLocked ||
                      !canEditSupportAssociation(
                        canWrite,
                        episodeCanEdit,
                        selected.canEdit,
                        request.canEdit,
                      )
                    }
                    onChange={(event) => {
                      const latestDispatch = rowsRef.current.find((row) => row.id === selected.id);
                      const latestRequest = supportRequestsRef.current.find(
                        (item) => item.id === request.id,
                      );
                      if (
                        busy ||
                        queueLocked ||
                        !canEditSupportAssociation(
                          canWriteRef.current,
                          episodeCanEditRef.current,
                          latestDispatch?.canEdit === true,
                          latestRequest?.canEdit === true,
                        )
                      )
                        return;
                      void freeze("support-update", {
                        supportRequestId: request.id,
                        expectedVersion: request.version,
                        operationId: crypto.randomUUID(),
                        requestedAt: request.requestedAt,
                        reason: request.reason,
                        responseDispatchId: event.target.value || null,
                      });
                    }}
                  >
                    <option value="">Sin asociar</option>
                    {rows.map((row) => (
                      <option key={row.id} value={row.id}>
                        {bases.find((base) => base.id === row.baseId)?.name ?? "Despacho"} ·{" "}
                        {row.id.slice(0, 8)}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
            ))}
          </div>
        )}
        {queueEntries.length > 0 && (
          <div className="space-y-2 border-t pt-3">
            <h3>Operaciones locales pendientes</h3>
            {queueEntries.map((entry) => (
              <div
                key={entry.operationId}
                className="flex flex-wrap items-center gap-2 rounded border p-3"
              >
                <span>
                  {entry.kind} · {entry.status}
                </span>
                <button
                  className="min-h-11 rounded border px-4"
                  onClick={() => void selectQueueEntry(entry)}
                >
                  Restaurar vista congelada
                </button>
                {(entry.status === "pending" || entry.status === "uncertain") && (
                  <button
                    className="min-h-11 rounded border px-4"
                    disabled={!canWrite || busy}
                    onClick={() => void runEntry(entry)}
                  >
                    Reintentar misma operación
                  </button>
                )}
                {entry.status === "paused-conflict" && (
                  <button
                    className="min-h-11 rounded border px-4"
                    disabled={busy}
                    onClick={() => {
                      selectedQueueRef.current = entry.operationId;
                      setSelectedQueueId(entry.operationId);
                      void compareConflictWithServer(entry);
                    }}
                  >
                    Comparar con el servidor
                  </button>
                )}
                {entry.status === "paused-permission" && (
                  <button
                    className="min-h-11 rounded border px-4"
                    disabled={busy}
                    onClick={() => {
                      if (
                        !window.confirm(
                          "El servidor rechazó esta solicitud sin confirmarla. ¿Querés descartarla y volver a editar?",
                        )
                      )
                        return;
                      const targetOwner = currentUserId;
                      void queueStore.current
                        ?.remove(targetOwner, episodeId, entry.operationId)
                        .then(async () => {
                          if (!mounted.current || owner.current !== targetOwner) return;
                          setQueueEntries(await queueStore.current!.list(targetOwner, episodeId));
                          setMessage(
                            "Se descartó la solicitud rechazada; el registro del servidor no se modificó.",
                          );
                        })
                        .catch(() =>
                          setError("No se pudo resolver la solicitud local; permanece bloqueada."),
                        );
                    }}
                  >
                    Descartar solicitud rechazada
                  </button>
                )}
                {entry.status === "confirmed-cleanup-failed" && (
                  <button
                    className="min-h-11 rounded border px-4"
                    disabled={busy}
                    onClick={() => void runEntry(entry)}
                  >
                    Reintentar solo la limpieza local
                  </button>
                )}
              </div>
            ))}
            {selectedQueueEntry && (
              <div className="space-y-2 rounded border p-3" aria-live="polite">
                <h4 className="font-medium">Solicitud congelada · {selectedQueueEntry.kind}</h4>
                <p className="text-sm">
                  La identidad y el contenido de esta solicitud no se editan al restaurarla. El
                  reintento usa exactamente el payload guardado.
                </p>
                <details>
                  <summary className="cursor-pointer">Ver contenido guardado</summary>
                  <pre className="overflow-auto whitespace-pre-wrap text-xs">
                    {JSON.stringify(selectedQueueEntry.payload, null, 2)}
                  </pre>
                </details>
                {selectedQueueEntry.status === "paused-conflict" && (
                  <button
                    className="min-h-11 rounded border px-4"
                    disabled={
                      !conflictSnapshot ||
                      conflictSnapshot.operationId !== selectedQueueEntry.operationId
                    }
                    onClick={() => void applyServerConflictResolution(selectedQueueEntry)}
                  >
                    Usar la versión actual y descartar esta solicitud
                  </button>
                )}
                {selectedQueueEntry.status === "paused-conflict" &&
                  conflictSnapshot?.operationId === selectedQueueEntry.operationId && (
                    <button
                      className="min-h-11 rounded border px-4"
                      disabled={!canWrite || !conflictSnapshot}
                      onClick={() => void rebaseConflict(selectedQueueEntry)}
                    >
                      Conservar mis valores y crear una nueva versión de operación
                    </button>
                  )}
                {conflictSnapshot?.operationId === selectedQueueEntry.operationId && (
                  <details>
                    <summary className="cursor-pointer">Comparación con el servidor</summary>
                    <pre className="overflow-auto whitespace-pre-wrap text-xs">
                      {JSON.stringify(
                        conflictSnapshot.dispatch ?? conflictSnapshot.supportRequest,
                        null,
                        2,
                      )}
                    </pre>
                  </details>
                )}
              </div>
            )}
            <p className="text-xs">
              Solo se conserva localmente lo enviado; queda en texto legible del navegador y no es
              una bóveda segura.
            </p>
          </div>
        )}
        {storageRetry && (
          <div className="rounded border border-amber-500 p-3">
            <p>
              La solicitud no se pudo guardar localmente. Se conserva en esta pantalla con la misma
              identidad; no cierres ni cambies de cuenta antes de resolverla.
            </p>
            <button
              type="button"
              className="mt-2 min-h-11 rounded border px-4"
              disabled={busy || !canWrite}
              onClick={() => void freeze(storageRetry.kind, storageRetry.payload)}
            >
              Reintentar guardar y enviar la misma operación
            </button>
          </div>
        )}
      </section>
    </div>
  );
}
