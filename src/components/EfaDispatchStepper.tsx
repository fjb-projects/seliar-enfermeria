import { useEffect, useRef, useState, type ComponentType, type ReactNode } from "react";
import {
  EfaActionConfirmation,
  isActionConfirmationCurrent,
} from "@/components/EfaActionConfirmation";
import {
  DispatchFollowUpModal,
  FollowUpFeedback,
  FollowUpNoteField,
  FollowUpOpenButton,
  FollowUpTimeField,
  followUpButtonState,
} from "@/components/EfaDispatchFollowUpModal";
import { Check, Circle, CircleDot } from "lucide-react";
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
import type { EfaEpisodeSectionPosition } from "@/lib/efa-episode-position";
import {
  dispatchResultOptions,
  dispatchTimeSteps,
  formatDispatchPriority,
  timeStatusLabel,
} from "@/lib/efa-labels";
import {
  createSaveSnapshot,
  isDirtyAfterSave,
  type AutosaveInput,
  type AutosaveStatus,
  type SaveSnapshot,
} from "@/lib/efa-autosave";
import { useEfaAutosave } from "@/lib/use-efa-autosave";
import {
  createRecordSwitchSequence,
  prepareRecordSwitch,
  recordSwitchConfirmationCopy,
} from "@/lib/efa-record-switch";
import { EfaAutosaveStatus } from "@/components/EfaAutosaveStatus";

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
type DispatchErrorSurface = "global" | "form" | "lifecycle" | "contact" | "support" | "queue";
// eslint-disable-next-line react-refresh/only-export-components -- Shared with focused feedback-routing regression tests.
export function dispatchErrorSurfaceForKind(
  kind: DispatchQueueEntry["kind"],
): DispatchErrorSurface {
  if (kind === "contact-attempt") return "contact";
  if (kind === "support-create" || kind === "support-update") return "support";
  return "form";
}
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
const timeSteps = dispatchTimeSteps;
const dispatchStepTitles = [
  "Base y vínculo",
  ...timeSteps.map(([, title]) => title),
  "Prioridad",
  "Resultado",
  "Revisión",
] as const;

// eslint-disable-next-line react-refresh/only-export-components -- Shared with focused review-step regression tests.
export function isDispatchReviewStep(step: number): boolean {
  return step === dispatchStepTitles.length - 1;
}

/**
 * Decides whether a remembered position can be restored: only a dispatch that still exists and the
 * user can still edit (same rule as the editor), with its step clamped to the valid range.
 */
// eslint-disable-next-line react-refresh/only-export-components -- Pure helper exported for deterministic tests.
export function resolveDispatchRestore<T extends { id: string; canEdit: boolean }>(
  position: EfaEpisodeSectionPosition | null | undefined,
  dispatches: readonly T[],
  canWrite: boolean,
): { record: T; step: number } | null {
  if (!position || position.recordId === null || !canWrite) return null;
  const record = dispatches.find((row) => row.id === position.recordId);
  if (!record?.canEdit) return null;
  const lastStep = dispatchStepTitles.length - 1;
  const step = Number.isInteger(position.step) ? Math.min(Math.max(position.step, 0), lastStep) : 0;
  return { record, step };
}

type DispatchStepState = "complete" | "current" | "pending";

/** Progress is derived from the index only: every step before the current one counts as completed. */
// eslint-disable-next-line react-refresh/only-export-components -- Pure helper exported for deterministic tests.
export function dispatchStepState(index: number, currentStep: number): DispatchStepState {
  if (index === currentStep) return "current";
  return index < currentStep ? "complete" : "pending";
}

const dispatchStepStyles: Record<DispatchStepState, string> = {
  current: "border border-primary bg-primary font-semibold text-primary-foreground",
  complete:
    "border border-emerald-300 bg-emerald-50 text-emerald-900 dark:border-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-100",
  pending: "border bg-background text-foreground",
};
const dispatchStepBarStyles: Record<DispatchStepState, string> = {
  current: "bg-primary",
  complete: "bg-emerald-300 dark:bg-emerald-700",
  pending: "bg-muted",
};
const dispatchStepStateText: Record<DispatchStepState, string | null> = {
  current: "Actual",
  complete: "Completado",
  pending: null,
};

function DispatchStepIcon({ state }: { state: DispatchStepState }) {
  const className = "size-4 shrink-0";
  if (state === "complete") return <Check aria-hidden="true" className={className} />;
  if (state === "current") return <CircleDot aria-hidden="true" className={className} />;
  return <Circle aria-hidden="true" className={className} />;
}

export function DispatchStepNavigation({
  step,
  onStepChange,
  action,
}: {
  step: number;
  onStepChange: (step: number) => void;
  /** Optional extra control rendered in the same row, next to "Ver pasos". */
  action?: ReactNode;
}) {
  const title = dispatchStepTitles[step] ?? "Paso del despacho";
  const headingRef = useRef<HTMLParagraphElement>(null);
  const previousStepRef = useRef(step);

  useEffect(() => {
    if (previousStepRef.current === step) return;
    previousStepRef.current = step;
    const heading = headingRef.current;
    if (!heading) return;
    heading.focus({ preventScroll: true });
    heading.scrollIntoView({
      block: "start",
      behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth",
    });
  }, [step]);

  return (
    <div className="flex min-w-0 flex-wrap items-center justify-between gap-2">
      <p
        ref={headingRef}
        aria-live="polite"
        tabIndex={-1}
        className="min-w-0 flex-1 basis-40 scroll-mt-20 rounded bg-primary px-3 py-2 text-sm font-medium text-primary-foreground outline-none"
      >
        Paso {step + 1} de {dispatchStepTitles.length}: {title}
      </p>
      {action}
      <details className="relative shrink-0">
        <summary className="flex min-h-11 cursor-pointer items-center rounded border px-3 text-sm font-medium">
          Ver pasos
        </summary>
        <div className="absolute right-0 z-10 grid min-w-52 max-w-[calc(100vw-2rem)] gap-1 rounded border bg-background p-2 shadow-lg">
          {dispatchStepTitles.map((stepTitle, index) => {
            const state = dispatchStepState(index, step);
            const stateText = dispatchStepStateText[state];
            return (
              <button
                type="button"
                key={stepTitle}
                aria-label={`Ir al paso ${index + 1}: ${stepTitle}${state === "complete" ? " (completado)" : ""}`}
                aria-current={state === "current" ? "step" : undefined}
                data-step-state={state}
                className={`flex min-h-11 min-w-0 items-center gap-2 rounded px-3 text-left text-sm ${dispatchStepStyles[state]}`}
                onClick={(event) => {
                  onStepChange(index);
                  const details = event.currentTarget.closest("details");
                  if (details) details.open = false;
                }}
              >
                <DispatchStepIcon state={state} />
                <span className="min-w-0 flex-1">
                  {index + 1}. {stepTitle}
                </span>
                {stateText && <span className="shrink-0 text-xs">{stateText}</span>}
              </button>
            );
          })}
        </div>
      </details>
      <div aria-hidden="true" className="flex basis-full gap-1">
        {dispatchStepTitles.map((stepTitle, index) => (
          <span
            key={stepTitle}
            className={`h-1.5 flex-1 rounded-full ${dispatchStepBarStyles[dispatchStepState(index, step)]}`}
          />
        ))}
      </div>
    </div>
  );
}

const statuses = ["not_observed", "not_informed", "not_applicable", "observed"] as const;
const resultOptions = dispatchResultOptions;
type DispatchCallChoice = {
  id: string;
  direction: string;
  startedAt: string | Date | null;
  createdAt: string | Date | null;
  priority: "red" | "yellow" | "green" | null;
  state: "draft" | "finalized" | "cancelled";
};
function formatLinkedCallTime(value: string | Date | null | undefined) {
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
function dispatchCallOptionLabel(call: DispatchCallChoice) {
  const direction =
    call.direction === "incoming"
      ? "Entrante"
      : call.direction === "outgoing"
        ? "Saliente"
        : "Llamada";
  const time = formatLinkedCallTime(call.startedAt) ?? formatLinkedCallTime(call.createdAt);
  const state =
    call.state === "cancelled" ? "Anulada" : call.state === "finalized" ? "Finalizada" : "En curso";
  const priority = formatDispatchPriority(call.priority);
  const priorityLabel = priority === "sin prioridad" ? "Sin prioridad" : `Prioridad ${priority}`;
  return [direction, time, state, priorityLabel].filter(Boolean).join(" · ");
}
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

/**
 * The editor differs from what the server holds: a new dispatch against the pristine form, an
 * existing one against its saved record. A selection whose record is not loaded is not dirty.
 */
// eslint-disable-next-line react-refresh/only-export-components -- Pure helper exported for deterministic tests.
export function dispatchEditorDirty(input: {
  selectedId: string | null;
  form: DispatchForm;
  record: DispatchForm | null;
}) {
  if (input.selectedId === null) return dispatchFormChanged(input.form, emptyDispatchForm());
  return input.record ? dispatchFormChanged(input.form, input.record) : false;
}

/** A queue entry that still has to reach the server; a confirmed one only waits for cleanup. */
function isLiveDispatchQueueEntry(entry: Pick<DispatchQueueEntry, "status">) {
  return entry.status !== "confirmed-cleanup-failed";
}

/**
 * Status of the live queued save (create, update or finalize) behind the editor: any create for
 * a new dispatch, or an update or finalize of the selected one.
 */
// eslint-disable-next-line react-refresh/only-export-components -- Pure helper exported for deterministic tests.
export function dispatchEditorPendingStatus(
  entries: readonly (Pick<DispatchQueueEntry, "kind" | "status"> & { payload: unknown })[],
  selectedId: string | null,
): DispatchQueueEntry["status"] | null {
  const entry = entries.find((item) => {
    if (!isLiveDispatchQueueEntry(item)) return false;
    if (selectedId === null) return item.kind === "create";
    return (
      (item.kind === "update" || item.kind === "finalize") &&
      (item.payload as Record<string, unknown>)["dispatchId"] === selectedId
    );
  });
  return entry?.status ?? null;
}

/**
 * Maps the stepper state to the autosave conditions; the online flag is tracked by the hook. The
 * dispatch queue sends one operation at a time for the whole episode, so any live entry blocks.
 */
// eslint-disable-next-line react-refresh/only-export-components -- Pure helper exported for deterministic tests.
export function dispatchAutosaveConditions(input: {
  canWrite: boolean;
  episodeCanEdit: boolean;
  selected: Pick<DispatchView, "state" | "ownerUserId" | "canEdit"> | null;
  currentUserId: string;
  dirty: boolean;
  queueEntries: readonly Pick<DispatchQueueEntry, "status">[];
  storageRetry: boolean;
  queueUsable: boolean;
  busy: boolean;
}): Omit<AutosaveInput, "online"> {
  const { selected } = input;
  return {
    canWrite: input.canWrite && input.episodeCanEdit && (selected ? selected.canEdit : true),
    recordExists: selected !== null,
    isDraft: selected?.state === "draft",
    editorIsOwner: selected?.ownerUserId === input.currentUserId,
    dirty: input.dirty,
    pending: input.storageRetry || input.queueEntries.some(isLiveDispatchQueueEntry),
    queueUsable: input.queueUsable,
    busy: input.busy,
  };
}

/**
 * "Siguiente" creates the draft of a new dispatch owned by the editor once a base is chosen and
 * the form holds more than the defaults; admins on another user's episode keep saving by hand.
 */
// eslint-disable-next-line react-refresh/only-export-components -- Pure helper exported for deterministic tests.
export function shouldCreateDispatchDraftOnNext(input: {
  hasRecord: boolean;
  canCreate: boolean;
  editorIsOwner: boolean;
  baseChosen: boolean;
  pristine: boolean;
  pending: boolean;
}) {
  return (
    !input.hasRecord &&
    input.canCreate &&
    input.editorIsOwner &&
    input.baseChosen &&
    !input.pristine &&
    !input.pending
  );
}

/**
 * A confirmed save applies the server values unless the user typed after the snapshot was taken:
 * then the newer values stay in the form and it remains dirty for the next save.
 */
// eslint-disable-next-line react-refresh/only-export-components -- Pure helper exported for deterministic tests.
export function mergeConfirmedDispatch(
  snapshot: SaveSnapshot<DispatchForm> | null,
  current: DispatchForm,
  server: DispatchForm,
): { keepLocal: boolean; form: DispatchForm; dirty: boolean } {
  const keepLocal = snapshot !== null && isDirtyAfterSave(snapshot, current);
  return keepLocal
    ? { keepLocal, form: current, dirty: true }
    : { keepLocal, form: server, dirty: false };
}

/**
 * Status line for the dispatch editor: a queued operation outranks the autosave state, and a
 * clean dispatch without an autosave yet shows the time it was last saved on the server.
 */
// eslint-disable-next-line react-refresh/only-export-components -- Pure helper exported for deterministic tests.
export function dispatchSaveStatus(input: {
  autosave: AutosaveStatus;
  pendingStatus: DispatchQueueEntry["status"] | null;
  busy: boolean;
  dirty: boolean;
  savedAt: string | null;
}): AutosaveStatus {
  if (input.pendingStatus) {
    if (input.busy) return { kind: "saving" };
    if (input.autosave.kind === "offline") return input.autosave;
    return { kind: "blocked", reason: "pending" };
  }
  if (input.autosave.kind !== "idle") return input.autosave;
  if (input.dirty) return { kind: "dirty" };
  const savedAt = input.savedAt ? new Date(input.savedAt) : null;
  return savedAt && Number.isFinite(savedAt.getTime())
    ? { kind: "saved", at: savedAt }
    : input.autosave;
}

/**
 * Field inputs follow permission only, so a queued or running save never freezes typing; the
 * save, finalize, lifecycle and "Nuevo despacho" actions still wait for the queue to drain.
 */
// eslint-disable-next-line react-refresh/only-export-components -- Pure helper exported for deterministic tests.
export function dispatchEditorAccess(input: {
  editable: boolean;
  queueLocked: boolean;
  busy: boolean;
}) {
  return {
    fieldsEditable: input.editable,
    actionsEnabled: input.editable && !input.queueLocked && !input.busy,
  };
}

/** The fields a create or update sends for the form; times keep the record's exact instants. */
function dispatchSaveFields(form: DispatchForm, record: DispatchView | null) {
  const source = record ?? {
    t0At: null,
    t1At: null,
    t2At: null,
    t3At: null,
    t4At: null,
    t5At: null,
    t6At: null,
  };
  const preserveLegacyFirstResponseRole =
    record &&
    !!record.firstResponseRole &&
    !firstResponseRoleValues.some((role) => role === record.firstResponseRole) &&
    form.firstResponseRole === record.firstResponseRole;
  return {
    baseId: form.baseId,
    institutionId: form.institutionId || null,
    communicationId: form.communicationId || null,
    priority: form.priority || null,
    ...dispatchFormTimes(form, source),
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
}

/** The follow-up block opens by itself once arrival on scene (t2) has a recorded time. */
// eslint-disable-next-line react-refresh/only-export-components -- Pure helper exported for deterministic tests.
export function isFollowUpOpen(dispatch: { t2At: string | Date | null }) {
  return Boolean(dispatch.t2At);
}

/** History line for one mobile follow-up entry (contact or news). */
// eslint-disable-next-line react-refresh/only-export-components -- Pure helper exported for deterministic tests.
export function followUpHistoryLine(item: { occurredAt: string | Date; note: string | null }) {
  const note = item.note?.trim();
  return ["Seguimiento", formatDispatchDate(item.occurredAt), note].filter(Boolean).join(" · ");
}

export function DispatchFollowUpBlock({
  open,
  busy,
  note,
  at,
  onNoteChange,
  onAtChange,
  onRegisterNow,
  onRegisterAt,
  error,
  message,
}: {
  open: boolean;
  busy: boolean;
  note: string;
  at: string;
  onNoteChange: (value: string) => void;
  onAtChange: (value: string) => void;
  onRegisterNow: () => void;
  onRegisterAt: () => void;
  error: string | null;
  message: string | null;
}) {
  return (
    <details className="min-w-0 border-t pt-3" open={open}>
      <summary className="min-h-11 cursor-pointer py-3 font-medium">Seguimiento del móvil</summary>
      <div className="min-w-0 space-y-3 pb-3">
        <p className="text-sm text-muted-foreground">
          Registrá contactos y novedades con hora y nota.
        </p>
        <FollowUpNoteField note={note} onNoteChange={onNoteChange} />
        <FollowUpTimeField at={at} onAtChange={onAtChange} />
        <button className="min-h-11 rounded border px-4" disabled={busy} onClick={onRegisterNow}>
          Registrar novedad · Ahora
        </button>
        <button
          className="min-h-11 rounded border px-4"
          disabled={busy || !inputToIso(at)}
          onClick={onRegisterAt}
        >
          Registrar novedad con hora ingresada
        </button>
        <FollowUpFeedback error={error} message={message} />
      </div>
    </details>
  );
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
      className="mt-1 h-11 w-full min-w-0 max-w-full rounded border px-3"
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
  episodeOwnerUserId,
  canWrite,
  episodeCanEdit,
  initialPosition,
  onPositionChange,
}: {
  episodeId: string;
  episodeLabel: string;
  currentUserId: string;
  /** Owner of the episode; only the owner gets the draft created on "Siguiente". */
  episodeOwnerUserId?: string | undefined;
  canWrite: boolean;
  episodeCanEdit: boolean;
  /** Remembered dispatch and step, restored once after the dispatches load when still editable. */
  initialPosition?: EfaEpisodeSectionPosition | null;
  /** Reports the selected dispatch and step after the initial restore. */
  onPositionChange?: (position: EfaEpisodeSectionPosition) => void;
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
  const [calls, setCalls] = useState<DispatchCallChoice[]>([]);
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
  const [finalizeConfirmationTarget, setFinalizeConfirmationTarget] = useState<string | null>(null);
  // Asked when the dispatch in the editor still has unsaved typing and another one replaces it.
  const [switchConfirmation, setSwitchConfirmation] = useState<{
    key: string;
    apply: () => void;
  } | null>(null);
  const [switchSequence] = useState(createRecordSwitchSequence);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState("");
  const [errorSurface, setErrorSurface] = useState<DispatchErrorSurface>("global");
  const [message, setMessage] = useState("");
  const [messageSurface, setMessageSurface] = useState<DispatchErrorSurface>("global");
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
  const [followUpModalOpen, setFollowUpModalOpen] = useState(false);
  const confirmedOperations = useRef(new Set<string>());
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
  // The editor and values each operation sent, to keep typing done while it was in flight.
  const editorSnapshots = useRef(
    new Map<string, { selectedId: string | null; snapshot: SaveSnapshot<DispatchForm> }>(),
  );
  const markSavedRef = useRef<() => void>(() => {});
  const retryQueueRef = useRef<() => Promise<void>>(async () => {});
  const selectedQueueRef = useRef<string | null>(null);
  const inFlightOperations = useRef(new Set<string>());
  const initialPositionRef = useRef(initialPosition ?? null);
  const onPositionChangeRef = useRef(onPositionChange);
  const positionReadyRef = useRef(false);
  onPositionChangeRef.current = onPositionChange;
  owner.current = currentUserId;
  canWriteRef.current = canWrite;
  episodeCanEditRef.current = episodeCanEdit;
  rowsRef.current = rows;
  supportRequestsRef.current = supportRequests;
  const selected = rows.find((row) => row.id === selectedId) ?? null;
  const selectedCall = calls.find((call) => call.id === form.communicationId) ?? null;
  const selectedQueueEntry =
    queueEntries.find((entry) => entry.operationId === selectedQueueId) ?? null;
  const editable = canWrite && (selected ? selected.canEdit : episodeCanEdit);
  // Actions (save, finalize, lifecycle, new dispatch) wait for the queue; typing never does.
  const queueLocked = storageRetry !== null || queueEntries.length > 0;
  const hasLiveQueueEntry = storageRetry !== null || queueEntries.some(isLiveDispatchQueueEntry);
  const dirty = dispatchEditorDirty({
    selectedId,
    form,
    record: selected ? restoreDispatchForm(selected) : null,
  });
  const editorRef = useRef({ selectedId, form, dirty });
  const selectedIdRef = useRef(selectedId);
  editorRef.current = { selectedId, form, dirty };
  selectedIdRef.current = selectedId;
  // Read by `save()` and the autosave gate, so a save right after a confirmation sees the queue
  // as it is now, not as it was rendered while that save ran.
  const queueEntriesRef = useRef(queueEntries);
  const storageRetryRef = useRef(storageRetry);
  queueEntriesRef.current = queueEntries;
  storageRetryRef.current = storageRetry;
  const setQueueEntriesTracked = (next: DispatchQueueEntry[]) => {
    queueEntriesRef.current = next;
    setQueueEntries(next);
  };
  const setStorageRetryTracked = (next: DispatchQueueEntry | null) => {
    storageRetryRef.current = next;
    setStorageRetry(next);
  };
  const liveQueueBlocks = () =>
    storageRetryRef.current !== null || queueEntriesRef.current.some(isLiveDispatchQueueEntry);
  const setForm = (value: DispatchForm | ((current: DispatchForm) => DispatchForm)) => {
    const next = typeof value === "function" ? value(editorRef.current.form) : value;
    const currentId = selectedIdRef.current;
    const currentRecord = rowsRef.current.find((row) => row.id === currentId);
    editorRef.current = {
      selectedId: currentId,
      form: next,
      dirty: dispatchEditorDirty({
        selectedId: currentId,
        form: next,
        record: currentRecord ? restoreDispatchForm(currentRecord) : null,
      }),
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
          if (!positionReadyRef.current) {
            positionReadyRef.current = true;
            const restore = resolveDispatchRestore(
              initialPositionRef.current,
              dispatches as unknown as DispatchView[],
              canWriteRef.current,
            );
            // Never replace a selection or a typed new form made while the dispatches loaded.
            if (
              restore &&
              selectedIdRef.current === null &&
              selectedQueueRef.current === null &&
              !dispatchFormChanged(editorRef.current.form, emptyDispatchForm())
            ) {
              selectedIdRef.current = restore.record.id;
              setSelectedId(restore.record.id);
              setForm(restoreDispatchForm(restore.record));
              setStep(restore.step);
            }
          }
          setQueueReady(true);
          setReady(true);
        },
      )
      .catch((reason: unknown) => {
        if (active && owner.current === ticket) {
          positionReadyRef.current = true;
          setErrorSurface("global");
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
    // Mount defaults are not a position: report only once the remembered one had its chance.
    if (!positionReadyRef.current) return;
    onPositionChangeRef.current?.({ recordId: selectedId, step });
  }, [selectedId, step]);

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
    setErrorSurface(dispatchErrorSurfaceForKind(kind));
    setMessage("");
    setMessageSurface(dispatchErrorSurfaceForKind(kind));
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
        snapshot: createSaveSnapshot(editorRef.current.form),
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
      setStorageRetryTracked(null);
      const existing = queueEntriesRef.current;
      if (!existing.some((item) => item.operationId === entry.operationId))
        setQueueEntriesTracked([...existing, entry]);
      await runEntry(entry, dispatchErrorSurfaceForKind(kind));
    } catch (reason) {
      setStorageRetryTracked(entry);
      setError(
        `No se pudo guardar la solicitud local. Conservamos la operación ${operationId}; reintenta exactamente la misma solicitud cuando se restablezca el almacenamiento.`,
      );
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  };

  const followUpButton = followUpButtonState({
    hasDispatch: selected !== null,
    canEdit: editable,
    cancelled: selected?.state === "cancelled",
    busy,
  });

  /** Registers one follow-up entry through the queue; resets the draft once the server confirmed it. */
  const registerFollowUp = async (occurredAt: string, closeModal: boolean) => {
    if (!selected) return;
    const clientEventId = crypto.randomUUID();
    await freeze("contact-attempt", {
      dispatchId: selected.id,
      clientEventId,
      occurredAt,
      note: contactNote || null,
    });
    if (!confirmedOperations.current.delete(clientEventId)) return;
    if (!mounted.current) return;
    setContactNote("");
    setContactAt("");
    if (closeModal) setFollowUpModalOpen(false);
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
      confirmedOperations.current.add(entry.operationId);
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
        const now = editorRef.current;
        const previous = rowsRef.current.find((row) => row.id === mutationDto.id) ?? null;
        const confirmed = helpers.normalizeConfirmedDispatch(mutationDto, previous);
        rowsRef.current = [...rowsRef.current.filter((row) => row.id !== confirmed.id), confirmed];
        setRows((existing) => [...existing.filter((row) => row.id !== confirmed.id), confirmed]);
        // The editor still shows what this operation sent: the new dispatch it created, or the
        // dispatch it changed. Values typed after the snapshot stay in the form.
        const targetsEditor =
          submitted !== undefined &&
          (entry.kind === "create"
            ? submitted.selectedId === null && now.selectedId === null
            : submitted.selectedId === confirmed.id && now.selectedId === confirmed.id);
        if (submitted && targetsEditor) {
          const merge = mergeConfirmedDispatch(
            submitted.snapshot,
            now.form,
            restoreDispatchForm(confirmed),
          );
          editorRef.current = { selectedId: confirmed.id, form: merge.form, dirty: merge.dirty };
          selectedIdRef.current = confirmed.id;
          setSelectedId(confirmed.id);
          if (!merge.keepLocal) setFormState(merge.form);
          if (entry.kind === "create" || entry.kind === "update" || entry.kind === "finalize")
            markSavedRef.current();
        }
        // A plain confirmed save is announced by the status line ("Guardado HH:MM") only.
        if (!targetsEditor || (entry.kind !== "create" && entry.kind !== "update"))
          setMessage("El despacho quedó confirmado.");
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
        setQueueEntriesTracked(remaining);
    } catch {
      /* Keep the frozen form and existing queue state. */
    }
  };

  const runEntry = async (
    entry: DispatchQueueEntry,
    feedbackSurface: DispatchErrorSurface = "queue",
  ) => {
    const key = JSON.stringify([currentUserId, episodeId, entry.operationId]);
    if (inFlightOperations.current.has(key)) return;
    inFlightOperations.current.add(key);
    setErrorSurface(feedbackSurface);
    setError("");
    setMessage("");
    setMessageSurface(feedbackSurface);
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
    setErrorSurface("queue");
    setError("");
    setMessage("");
    setMessageSurface("queue");
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
      if (isCurrent()) {
        setErrorSurface("queue");
        setMessageSurface("queue");
        setMessage("");
        setError(reason instanceof Error ? reason.message : "No se pudo comparar con el servidor.");
      }
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
    setQueueEntriesTracked(remaining);
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
      const editor = editorRef.current;
      // An update rebased from the dispatch on screen sends the current form, including what was
      // typed while the conflict was paused; other operations keep their stored payload.
      const useCurrentForm =
        entry.kind === "update" &&
        snapshot.dispatch !== undefined &&
        editor.selectedId === snapshot.dispatch.id;
      const rebasedEntry = helpers.rebaseDispatchQueueEntry(entry, nextVersion, nextOperationId);
      const rebased: DispatchQueueEntry =
        useCurrentForm && snapshot.dispatch
          ? {
              ...rebasedEntry,
              payload: Object.freeze({
                dispatchId: snapshot.dispatch.id,
                expectedVersion: nextVersion,
                operationId: nextOperationId,
                ...dispatchSaveFields(editor.form, snapshot.dispatch),
              }) as unknown as DispatchQueueEntry["payload"],
            }
          : rebasedEntry;
      const previousSnapshot = editorSnapshots.current.get(entry.operationId);
      if (useCurrentForm)
        editorSnapshots.current.set(nextOperationId, {
          selectedId: editor.selectedId,
          snapshot: createSaveSnapshot(editor.form),
        });
      else if (previousSnapshot) editorSnapshots.current.set(nextOperationId, previousSnapshot);
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
      setQueueEntriesTracked(remaining);
      selectedQueueRef.current = nextOperationId;
      setSelectedQueueId(nextOperationId);
      setConflictSnapshot(null);
      setMessage(
        useCurrentForm
          ? "Se confirmó el rebase explícito con una identidad nueva y los valores actuales del formulario."
          : "Se confirmó el rebase explícito con una identidad nueva; la solicitud anterior fue reemplazada sin editar su payload.",
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

  /**
   * Sends a snapshot of the form while typing continues. Resolves `true` only when the server
   * confirmed this save; `false` when nothing changed, it was refused, failed or stayed queued.
   */
  const save = async (): Promise<boolean> => {
    const editor = editorRef.current;
    const record = editor.selectedId
      ? (rowsRef.current.find((row) => row.id === editor.selectedId) ?? null)
      : null;
    if (
      !editable ||
      busyRef.current ||
      !ready ||
      !queueReady ||
      !editor.form.baseId ||
      liveQueueBlocks() ||
      (editor.selectedId !== null && (!record || !editor.dirty))
    )
      return false;
    const operationId = crypto.randomUUID();
    const fields = dispatchSaveFields(editor.form, record);
    if (record)
      await freeze("update", {
        dispatchId: record.id,
        expectedVersion: record.version,
        operationId,
        ...fields,
      } as unknown as DispatchQueueEntry["payload"]);
    else
      await freeze("create", {
        clientCreationKey: operationId,
        episodeId,
        ...fields,
      } as unknown as DispatchQueueEntry["payload"]);
    return confirmedOperations.current.delete(operationId);
  };

  const finalize = async (confirmedTargetKey: string) => {
    const currentTargetKey = selected
      ? `${currentUserId}:${episodeId}:${selected.id}:${selected.version}`
      : null;
    const latest = selectedIdRef.current
      ? (rowsRef.current.find((row) => row.id === selectedIdRef.current) ?? null)
      : null;
    const latestForm = editorRef.current.form;
    if (
      !isDispatchReviewStep(step) ||
      !isActionConfirmationCurrent(confirmedTargetKey, currentTargetKey) ||
      !mounted.current ||
      owner.current !== currentUserId ||
      !canWriteRef.current ||
      !episodeCanEditRef.current ||
      !selected ||
      !latest ||
      latest.id !== selected.id ||
      latest.version !== selected.version ||
      selectedIdRef.current !== selected.id ||
      !editable ||
      editorRef.current.dirty ||
      !latestForm.priority ||
      !latestForm.result ||
      queueLocked ||
      busyRef.current
    )
      return;
    await freeze("finalize", {
      dispatchId: latest.id,
      expectedVersion: latest.version,
      operationId: crypto.randomUUID(),
      priority: latestForm.priority,
      result: latestForm.result,
      resultClarification: latestForm.resultClarification || null,
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
    setErrorSurface("lifecycle");
    setMessageSurface("lifecycle");
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
    setMessage("");
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

  const access = dispatchEditorAccess({ editable, queueLocked, busy });
  const autosave = useEfaAutosave({
    enabled: canWrite,
    conditions: dispatchAutosaveConditions({
      canWrite,
      episodeCanEdit,
      selected,
      currentUserId,
      dirty,
      queueEntries,
      storageRetry: storageRetry !== null,
      queueUsable: ready && queueReady && queueStore.current !== null,
      busy,
    }),
    // The same conditions from refs, read when a save would fire (a confirmation updates them).
    getConditions: () =>
      dispatchAutosaveConditions({
        canWrite: canWriteRef.current,
        episodeCanEdit: episodeCanEditRef.current,
        selected: rowsRef.current.find((row) => row.id === editorRef.current.selectedId) ?? null,
        currentUserId: owner.current,
        dirty: editorRef.current.dirty,
        queueEntries: queueEntriesRef.current,
        storageRetry: storageRetryRef.current !== null,
        queueUsable: ready && queueReady && queueStore.current !== null,
        busy: busyRef.current,
      }),
    save,
    changeKey: JSON.stringify(form),
    isDirty: () => editorRef.current.dirty,
  });
  markSavedRef.current = autosave.markSaved;
  const saveStatus = dispatchSaveStatus({
    autosave: autosave.status,
    pendingStatus: dispatchEditorPendingStatus(
      storageRetry ? [...queueEntries, storageRetry] : queueEntries,
      selectedId,
    ),
    busy,
    dirty,
    savedAt: selected?.updatedAt ?? null,
  });

  /**
   * Saves before every step change and then always moves; the status line shows "Sin guardar"
   * when the save failed or could not run. "Siguiente" also creates the draft of a new dispatch.
   */
  const navigateToStep = async (nextStep: number, via: "previous" | "next" | "direct") => {
    const targetOwner = currentUserId;
    const targetEpisode = episodeId;
    const editor = editorRef.current;
    const createDraft =
      via === "next" &&
      shouldCreateDispatchDraftOnNext({
        hasRecord: editor.selectedId !== null,
        canCreate: canWrite && episodeCanEdit && ready && queueReady,
        editorIsOwner: episodeOwnerUserId === currentUserId,
        baseChosen: Boolean(editor.form.baseId),
        pristine: !dispatchFormChanged(editor.form, emptyDispatchForm()),
        pending: hasLiveQueueEntry || busyRef.current,
      });
    if (createDraft) await autosave.runExclusive(save);
    else await autosave.flush();
    if (!mounted.current || owner.current !== targetOwner || episodeId !== targetEpisode) return;
    setStep(Math.min(Math.max(nextStep, 0), dispatchStepTitles.length - 1));
  };

  const editorKey = (dispatchId: string | null) =>
    `${currentUserId}:${episodeId}:${dispatchId ?? "new"}`;
  /**
   * Replaces the dispatch in the editor only after saving the current one. When typing could not
   * be saved (new dispatch, another user's record, offline, pending or a failed save) it asks
   * before discarding it.
   */
  const requestEditorSwitch = async (apply: () => void) => {
    const targetOwner = currentUserId;
    const fromId = editorRef.current.selectedId;
    const isLatest = switchSequence.begin();
    const decision = await prepareRecordSwitch({
      flush: autosave.flush,
      isDirty: () => editorRef.current.dirty,
      isCurrent: () =>
        isLatest() &&
        mounted.current &&
        owner.current === targetOwner &&
        editorRef.current.selectedId === fromId,
    });
    if (decision === "switch") apply();
    else if (decision === "confirm") setSwitchConfirmation({ key: editorKey(fromId), apply });
  };
  const openDispatch = (dispatchId: string) => {
    const row = rowsRef.current.find((item) => item.id === dispatchId);
    if (!row) return;
    selectedIdRef.current = row.id;
    setSelectedId(row.id);
    setForm(restoreDispatchForm(row));
    setStep(0);
  };
  const startNewDispatch = () => {
    selectedIdRef.current = null;
    editorRef.current = { selectedId: null, form: emptyDispatchForm(), dirty: false };
    setSelectedId(null);
    setForm(emptyDispatchForm());
    setStep(0);
  };
  const switchCopy = recordSwitchConfirmationCopy("despacho");

  const quickTime = (key: keyof DispatchForm) => {
    const time = captureDispatchTime(new Date());
    const statusKey = `${String(key).slice(0, 2)}Status` as keyof DispatchForm;
    setForm((old) => ({ ...old, [key]: time, [statusKey]: "observed" }));
  };
  const stepTitle = dispatchStepTitles[step] ?? "Paso del despacho";

  return (
    <div className="min-w-0 space-y-3">
      <section className="min-w-0 space-y-3" aria-label={`Despachos del episodio ${episodeLabel}`}>
        <h2 className="text-lg font-semibold">Despachos</h2>
        {!canWrite && <p role="status">Solo lectura: el acceso EFA no está vigente.</p>}
        {!ready && <p role="status">Cargando despachos…</p>}
        {error &&
          (errorSurface === "global" ||
            !editable ||
            (errorSurface === "queue" && queueEntries.length === 0)) && (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          )}
        {message &&
          (messageSurface === "global" ||
            !editable ||
            (messageSurface === "queue" && queueEntries.length === 0)) && (
            <p role="status">{message}</p>
          )}
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
        <div className="min-w-0 space-y-2">
          {rows.map((row) => (
            <button
              key={row.id}
              type="button"
              className="min-h-11 w-full min-w-0 rounded border p-3 text-left"
              aria-pressed={selectedId === row.id}
              onClick={() => {
                // The dispatch already in the editor keeps its typing; it only returns to step 1.
                if (row.id === editorRef.current.selectedId) void navigateToStep(0, "direct");
                else void requestEditorSwitch(() => openDispatch(row.id));
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
              <span className="block break-all text-xs text-muted-foreground">ID {row.id}</span>
              {row.institutionName && (
                <span className="block text-sm">
                  Destino: {row.institutionName}
                  {row.institutionIsActive === false ? " · histórico/inactivo" : ""}
                </span>
              )}
            </button>
          ))}
          {rows.length === 0 && (
            <p className="text-sm text-muted-foreground">
              Todavía no hay despachos; el formulario permite registrar el primero.
            </p>
          )}
        </div>
        {selected?.canManage && canWrite && episodeCanEdit && (
          <details className="min-w-0 border-t pt-2">
            <summary className="min-h-11 cursor-pointer py-2 font-medium">Más acciones</summary>
            <div className="flex min-w-0 flex-wrap gap-2" aria-label="Estado del despacho">
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
                  Anulado el {formatDispatchDate(selected.cancelledAt)}; reactiva para editar o
                  finalizar.
                </p>
              )}
              {error && errorSurface === "lifecycle" && (
                <p role="alert" className="w-full text-sm text-destructive" aria-live="assertive">
                  {error}
                </p>
              )}
              {message && messageSurface === "lifecycle" && (
                <p role="status" className="w-full text-sm" aria-live="polite">
                  {message}
                </p>
              )}
            </div>
          </details>
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
            onClick={() => void requestEditorSwitch(startNewDispatch)}
          >
            Nuevo despacho independiente
          </button>
        )}
        {selected && (
          <details className="min-w-0 border-t pt-3">
            <summary className="min-h-11 cursor-pointer py-2 font-medium">
              Historial del despacho · {history.length} cambios, {selected.contactAttempts.length}{" "}
              seguimientos
            </summary>
            <div className="space-y-2">
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
                  {followUpHistoryLine(item)}
                </p>
              ))}
            </div>
          </details>
        )}
        {editable && (
          <div className="min-w-0 border-t pb-3 pt-3">
            <DispatchStepNavigation
              step={step}
              onStepChange={(nextStep) => void navigateToStep(nextStep, "direct")}
              action={
                followUpButton === "hidden" ? null : (
                  <FollowUpOpenButton
                    disabled={followUpButton === "disabled"}
                    onClick={() => {
                      // Do not show a previous follow-up result as if it belonged to this entry.
                      if (errorSurface === "contact") setError("");
                      if (messageSurface === "contact") setMessage("");
                      setFollowUpModalOpen(true);
                    }}
                  />
                )
              }
            />
          </div>
        )}
        {editable && (
          <fieldset disabled={!access.fieldsEditable} className="min-w-0 space-y-3">
            {step === 0 && (
              <div className="space-y-3">
                <label className="block">
                  Base / móvil
                  <select
                    className="mt-1 h-11 w-full min-w-0 max-w-full rounded border px-3"
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
                    className="mt-1 h-11 w-full min-w-0 max-w-full rounded border px-3"
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
                          {dispatchCallOptionLabel(call)}
                        </option>
                      ),
                    )}
                  </select>
                  {selectedCall && (
                    <p className="break-words text-sm text-muted-foreground">
                      Llamada seleccionada:{" "}
                      {selectedCall.state === "cancelled"
                        ? "anulada"
                        : selectedCall.state === "finalized"
                          ? "finalizada"
                          : "en curso"}
                      .
                    </p>
                  )}
                </label>
                <p className="text-sm text-muted-foreground">
                  La prioridad se copia al crear; cambiar después el vínculo no la modifica. Se
                  permiten borradores parciales y las horas son opcionales.
                </p>
                <label className="block">
                  Primera respuesta (rol anónimo)
                  <FirstResponseRoleSelect
                    value={form.firstResponseRole}
                    onChange={(value) => setForm({ ...form, firstResponseRole: value })}
                  />
                </label>
                <div className="grid min-w-0 grid-cols-1 items-end gap-2 min-[360px]:grid-cols-[minmax(0,1fr)_auto]">
                  <label className="min-w-0">
                    Hora de primera respuesta
                    <input
                      type="datetime-local"
                      step="0.001"
                      className="mt-1 h-11 w-full min-w-0 max-w-full rounded border px-2 sm:px-3"
                      value={form.firstResponseAt}
                      onChange={(event) =>
                        setForm({ ...form, firstResponseAt: event.target.value })
                      }
                    />
                  </label>
                  <button
                    type="button"
                    className="min-h-11 shrink-0 rounded border px-3 text-sm"
                    onClick={() =>
                      setForm({ ...form, firstResponseAt: captureDispatchTime(new Date()) })
                    }
                  >
                    Ahora
                  </button>
                </div>
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
                      <div className="grid min-w-0 grid-cols-1 items-end gap-2 min-[360px]:grid-cols-[minmax(0,1fr)_auto]">
                        <label className="min-w-0">
                          Hora observada
                          <input
                            type="datetime-local"
                            step="0.001"
                            className="mt-1 h-11 w-full min-w-0 max-w-full rounded border px-2 sm:px-3"
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
                          aria-label={`Usar ahora para ${title.toLowerCase()}`}
                          className="min-h-11 shrink-0 justify-self-start rounded border px-3 text-sm"
                          onClick={() => quickTime(key)}
                        >
                          Ahora
                        </button>
                      </div>
                      <label className="block">
                        Estado
                        <select
                          className="mt-1 h-11 w-full min-w-0 max-w-full rounded border px-3"
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
                              {timeStatusLabel(value)}
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
                        Las horas son independientes; no se valida el orden cronológico.
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
                  className="h-12 w-full min-w-0 max-w-full rounded border px-3"
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
                  className="min-h-24 w-full min-w-0 max-w-full rounded border p-3"
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
                  className="h-12 w-full min-w-0 max-w-full rounded border px-3"
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
                  className="min-h-24 w-full min-w-0 max-w-full rounded border p-3"
                  placeholder="Aclaración breve opcional"
                  value={form.resultClarification}
                  onChange={(event) =>
                    setForm({ ...form, resultClarification: event.target.value })
                  }
                />
              </div>
            )}
            {step === 10 && (
              <div className="min-w-0 space-y-3">
                <p>
                  La finalización es manual y exige prioridad y resultado. Ninguna hora cierra el
                  despacho automáticamente.
                </p>
                <ul className="space-y-1 text-sm">
                  {!selected && (
                    <li>
                      Guarda el despacho como borrador antes de finalizar.
                      <button
                        type="button"
                        className="ml-1 inline-flex min-h-11 items-center px-1 underline"
                        onClick={() => void navigateToStep(0, "direct")}
                      >
                        Ir a Base
                      </button>
                    </li>
                  )}
                  {!form.baseId && (
                    <li>
                      Selecciona una base para guardar el despacho.
                      <button
                        type="button"
                        className="ml-1 inline-flex min-h-11 items-center px-1 underline"
                        onClick={() => void navigateToStep(0, "direct")}
                      >
                        Ir a Base
                      </button>
                    </li>
                  )}
                  {!form.priority && (
                    <li>
                      Falta registrar la prioridad.
                      <button
                        type="button"
                        className="ml-1 inline-flex min-h-11 items-center px-1 underline"
                        onClick={() => void navigateToStep(8, "direct")}
                      >
                        Ir a Prioridad
                      </button>
                    </li>
                  )}
                  {!form.result && (
                    <li>
                      Falta registrar el resultado.
                      <button
                        type="button"
                        className="ml-1 inline-flex min-h-11 items-center px-1 underline"
                        onClick={() => void navigateToStep(9, "direct")}
                      >
                        Ir a Resultado
                      </button>
                    </li>
                  )}
                  {selected && dirty && <li>Guarda los cambios antes de finalizar.</li>}
                  {queueLocked && <li>Hay operaciones pendientes en la cola local.</li>}
                  {busy && <li>Espera a que termine la operación en curso.</li>}
                  {!ready && <li>Espera a que se carguen los despachos.</li>}
                  {!queueReady && <li>La cola local todavía no está lista.</li>}
                  {!canWrite && <li>El acceso actual no permite escribir.</li>}
                  {!episodeCanEdit && <li>El episodio no está habilitado para cambios.</li>}
                  {selected && !selected.canEdit && (
                    <li>Este despacho no está habilitado para edición.</li>
                  )}
                </ul>
                {selected?.state === "finalized" && (
                  <p>
                    Finalizado el{" "}
                    {selected.finalizedAt ? formatDispatchDate(selected.finalizedAt) : "—"}; las
                    correcciones conservan el cierre.
                  </p>
                )}
              </div>
            )}
            <div className="grid min-w-0 grid-cols-2 gap-2">
              <button
                type="button"
                disabled={step === 0}
                className="min-h-11 min-w-0 rounded border px-2 text-sm sm:px-4"
                onClick={() => void navigateToStep(step - 1, "previous")}
              >
                Anterior
              </button>
              <button
                type="button"
                disabled={step === 10}
                className="min-h-11 min-w-0 rounded bg-primary px-2 text-sm text-primary-foreground sm:px-4"
                onClick={() => void navigateToStep(step + 1, "next")}
              >
                Siguiente
              </button>
            </div>
            <EfaAutosaveStatus status={saveStatus} />
            <div className="flex min-w-0 items-center gap-2">
              <button
                type="button"
                className={`min-h-11 rounded bg-primary text-sm text-primary-foreground ${isDispatchReviewStep(step) && selected?.state !== "finalized" ? "min-w-0 flex-1 px-2" : "shrink-0 px-4"}`}
                disabled={
                  !access.actionsEnabled ||
                  !queueReady ||
                  !form.baseId ||
                  (selected !== null && !dirty)
                }
                onClick={() => void autosave.runExclusive(save)}
              >
                {selected ? "Guardar cambios" : "Guardar borrador"}
              </button>
              {isDispatchReviewStep(step) && selected?.state !== "finalized" && (
                <button
                  type="button"
                  className="min-h-11 min-w-0 flex-1 rounded border px-2 text-sm"
                  disabled={
                    busy ||
                    !ready ||
                    !queueReady ||
                    queueLocked ||
                    !canWrite ||
                    !episodeCanEdit ||
                    !selected ||
                    !selected.canEdit ||
                    !form.priority ||
                    !form.result ||
                    dirty
                  }
                  onClick={() =>
                    selected &&
                    setFinalizeConfirmationTarget(
                      `${currentUserId}:${episodeId}:${selected.id}:${selected.version}`,
                    )
                  }
                >
                  Finalizar despacho
                </button>
              )}
            </div>
            {error && errorSurface === "form" && (
              <p role="alert" className="text-sm text-destructive">
                {error}
              </p>
            )}
            {message && messageSurface === "form" && (
              <p role="status" className="text-sm">
                {message}
              </p>
            )}
          </fieldset>
        )}
        {selected && editable && (
          <DispatchFollowUpBlock
            open={isFollowUpOpen(selected)}
            busy={busy}
            note={contactNote}
            at={contactAt}
            onNoteChange={setContactNote}
            onAtChange={setContactAt}
            onRegisterNow={() => void registerFollowUp(captureActionTimestamp(new Date()), false)}
            onRegisterAt={() => void registerFollowUp(inputToIso(contactAt)!, false)}
            error={errorSurface === "contact" && error ? error : null}
            message={messageSurface === "contact" && message ? message : null}
          />
        )}
        {selected && editable && followUpButton !== "hidden" && (
          <DispatchFollowUpModal
            open={followUpModalOpen}
            onOpenChange={setFollowUpModalOpen}
            busy={busy}
            note={contactNote}
            at={contactAt}
            onNoteChange={setContactNote}
            onAtChange={setContactAt}
            onRegisterNow={() => void registerFollowUp(captureActionTimestamp(new Date()), true)}
            onRegisterAt={() => void registerFollowUp(inputToIso(contactAt)!, true)}
            error={errorSurface === "contact" && error ? error : null}
            message={messageSurface === "contact" && message ? message : null}
          />
        )}
        {selected && editable && (
          <details className="min-w-0 border-t pt-3">
            <summary className="min-h-11 cursor-pointer py-3 font-medium">
              Solicitudes de apoyo
            </summary>
            <div className="min-w-0 space-y-3 pb-3">
              <label className="block">
                Motivo de apoyo
                <input
                  className="mt-1 h-11 w-full min-w-0 max-w-full rounded border px-3"
                  value={supportReason}
                  onChange={(event) => setSupportReason(event.target.value)}
                />
              </label>
              <label className="block">
                Hora de solicitud
                <input
                  type="datetime-local"
                  step="0.001"
                  className="mt-1 h-11 w-full min-w-0 max-w-full rounded border px-3"
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
              {error && errorSurface === "support" && (
                <p role="alert" className="text-sm text-destructive" aria-live="assertive">
                  {error}
                </p>
              )}
              {message && messageSurface === "support" && (
                <p role="status" className="text-sm" aria-live="polite">
                  {message}
                </p>
              )}
              {supportRequests.map((request) => (
                <div key={request.id} className="rounded border p-3">
                  <p>
                    Apoyo solicitado · {formatDispatchDate(request.requestedAt)} · {request.reason}
                  </p>
                  <label className="mt-2 block">
                    Despacho de respuesta
                    <select
                      className="mt-1 h-11 w-full min-w-0 max-w-full rounded border px-3"
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
                        const latestDispatch = rowsRef.current.find(
                          (row) => row.id === selected.id,
                        );
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
          </details>
        )}
        {queueEntries.length > 0 && (
          <div className="space-y-2 border-t pt-3">
            <h3>Operaciones locales pendientes</h3>
            {error && errorSurface === "queue" && (
              <p role="alert" className="text-sm text-destructive" aria-live="assertive">
                {error}
              </p>
            )}
            {message && messageSurface === "queue" && (
              <p role="status" className="text-sm" aria-live="polite">
                {message}
              </p>
            )}
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
                      setErrorSurface("queue");
                      setMessageSurface("queue");
                      setError("");
                      setMessage("");
                      const targetOwner = currentUserId;
                      void queueStore.current
                        ?.remove(targetOwner, episodeId, entry.operationId)
                        .then(async () => {
                          if (!mounted.current || owner.current !== targetOwner) return;
                          setQueueEntriesTracked(
                            await queueStore.current!.list(targetOwner, episodeId),
                          );
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
        <EfaActionConfirmation
          open={finalizeConfirmationTarget !== null}
          onOpenChange={(open) => {
            if (!open) setFinalizeConfirmationTarget(null);
          }}
          capturedTargetKey={finalizeConfirmationTarget}
          currentTargetKey={
            selected ? `${currentUserId}:${episodeId}:${selected.id}:${selected.version}` : null
          }
          title="Finalizar despacho"
          description="El despacho pasará a estado finalizado con el resultado registrado."
          confirmLabel="Finalizar despacho"
          onConfirm={(targetKey) => void finalize(targetKey)}
        />
        <EfaActionConfirmation
          open={switchConfirmation !== null}
          onOpenChange={(open) => {
            if (!open) setSwitchConfirmation(null);
          }}
          capturedTargetKey={switchConfirmation?.key ?? null}
          currentTargetKey={editorKey(selectedId)}
          title={switchCopy.title}
          description={switchCopy.description}
          confirmLabel={switchCopy.confirmLabel}
          onConfirm={() => {
            const pendingSwitch = switchConfirmation;
            setSwitchConfirmation(null);
            pendingSwitch?.apply();
          }}
        />
      </section>
    </div>
  );
}
