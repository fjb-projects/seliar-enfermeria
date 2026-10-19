import { formatTimeMinutes } from "./efa-labels";

/**
 * Form-agnostic autosave core for the EFA work-area forms (calls, dispatches, episode header,
 * police coordination). Everything here is pure or takes injected timers so it can be unit
 * tested without a DOM; `use-efa-autosave.ts` adapts it to React.
 */

/** Inactivity before an autosave fires. */
export const EFA_AUTOSAVE_DELAY_MS = 4000;

/** Conditions a form reports to decide whether an autosave may run now. */
export type AutosaveInput = {
  /** The user may write in this area at all. */
  canWrite: boolean;
  /** The record exists on the server (autosave never creates records). */
  recordExists: boolean;
  /**
   * The record still accepts draft edits: `state === "draft"` for calls, dispatches and
   * episodes; for police coordinations (no draft state) pass `true` while it is editable.
   */
  isDraft: boolean;
  /** The editor owns the record; admins editing other users' records get no autosave. */
  editorIsOwner: boolean;
  /** The form differs from the last saved value. */
  dirty: boolean;
  /** An operation is pending, uncertain or paused in the form's queue. */
  pending: boolean;
  /** The form's local queue (IndexedDB) can accept an operation. */
  queueUsable: boolean;
  /** The form is running another action (manual save, finalize, conflict resolution…). */
  busy: boolean;
  /** The browser reports a connection. */
  online: boolean;
};

/** Stable codes for why an autosave cannot run, in precedence order. */
export type AutosaveBlockReason =
  | "cannot_write"
  | "no_record"
  | "not_draft"
  | "not_owner"
  | "not_dirty"
  | "offline"
  | "queue_unavailable"
  | "pending"
  | "busy";

export type AutosaveDecision = { ok: true } | { ok: false; reason: AutosaveBlockReason };

/** Decides whether an autosave may run. Static reasons are reported before transient ones. */
export function shouldAutosave(input: AutosaveInput): AutosaveDecision {
  const blocked = (reason: AutosaveBlockReason): AutosaveDecision => ({ ok: false, reason });
  if (!input.canWrite) return blocked("cannot_write");
  if (!input.recordExists) return blocked("no_record");
  if (!input.isDraft) return blocked("not_draft");
  if (!input.editorIsOwner) return blocked("not_owner");
  if (!input.dirty) return blocked("not_dirty");
  if (!input.online) return blocked("offline");
  if (!input.queueUsable) return blocked("queue_unavailable");
  if (input.pending) return blocked("pending");
  if (input.busy) return blocked("busy");
  return { ok: true };
}

type SetTimer = (fn: () => void, ms: number) => unknown;
type ClearTimer = (handle: unknown) => void;

type TimerOptions = {
  delayMs?: number;
  now?: () => number;
  setTimer?: SetTimer;
  clearTimer?: ClearTimer;
};

const defaultSetTimer: SetTimer = (fn, ms) => globalThis.setTimeout(fn, ms);
const defaultClearTimer: ClearTimer = (handle) =>
  globalThis.clearTimeout(handle as ReturnType<typeof setTimeout>);

export type AutosaveScheduler = {
  /** Activity: (re)start the countdown. */
  touch(): void;
  /** Fire now if armed; returns whether it fired. Used on step change and blur. */
  flush(): boolean;
  /** Disarm without firing. */
  cancel(): void;
  /** Disarm permanently; later calls are no-ops. */
  dispose(): void;
  readonly armed: boolean;
};

/**
 * Inactivity countdown. `touch()` only moves a deadline, so typing does not churn timers: when
 * the timer wakes up before the deadline it sleeps for the remainder.
 */
export function createAutosaveScheduler(
  options: TimerOptions & { onFire: () => void },
): AutosaveScheduler {
  const delayMs = options.delayMs ?? EFA_AUTOSAVE_DELAY_MS;
  const now = options.now ?? (() => Date.now());
  const setTimer = options.setTimer ?? defaultSetTimer;
  const clearTimer = options.clearTimer ?? defaultClearTimer;
  let deadline: number | null = null;
  let handle: unknown = null;
  let disposed = false;

  const clear = () => {
    if (handle !== null) clearTimer(handle);
    handle = null;
    deadline = null;
  };
  const wake = () => {
    handle = null;
    if (deadline === null) return;
    const remaining = deadline - now();
    if (remaining > 0) {
      handle = setTimer(wake, remaining);
      return;
    }
    deadline = null;
    options.onFire();
  };

  return {
    touch() {
      if (disposed) return;
      deadline = now() + delayMs;
      if (handle === null) handle = setTimer(wake, delayMs);
    },
    flush() {
      if (deadline === null) return false;
      clear();
      options.onFire();
      return true;
    },
    cancel: clear,
    dispose() {
      clear();
      disposed = true;
    },
    get armed() {
      return deadline !== null;
    },
  };
}

/** Value sent by a save; the form keeps typing while the save runs. */
export type SaveSnapshot<T> = { readonly value: T };

export function createSaveSnapshot<T>(form: T): SaveSnapshot<T> {
  return { value: structuredClone(form) };
}

/** True when the form changed after the snapshot was taken, so it must stay dirty. */
export function isDirtyAfterSave<T>(
  snapshot: SaveSnapshot<T>,
  current: T,
  equals: (saved: T, current: T) => boolean = deepEqualJson,
): boolean {
  return !equals(snapshot.value, current);
}

const isPlainObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value) && !(value instanceof Date);

/**
 * Deep equality for JSON-like values (plain objects, arrays, primitives, Dates). Key order is
 * ignored and a key holding `undefined` equals a missing key, matching JSON serialization.
 */
export function deepEqualJson(a: unknown, b: unknown): boolean {
  if (Object.is(a, b)) return true;
  if (a instanceof Date || b instanceof Date) {
    return a instanceof Date && b instanceof Date && a.getTime() === b.getTime();
  }
  if (Array.isArray(a) || Array.isArray(b)) {
    if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length) return false;
    return a.every((item, index) => deepEqualJson(item, b[index]));
  }
  if (!isPlainObject(a) || !isPlainObject(b)) return false;
  const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
  for (const key of keys) {
    if (!deepEqualJson(a[key], b[key])) return false;
  }
  return true;
}

export type AutosaveStatus =
  | { kind: "idle" }
  | { kind: "dirty" }
  | { kind: "saving" }
  | { kind: "saved"; at: Date }
  | { kind: "offline" }
  | { kind: "blocked"; reason: AutosaveBlockReason }
  | { kind: "error"; message: string };

export function autosaveStatusLabel(status: AutosaveStatus): string {
  switch (status.kind) {
    case "idle":
      return "";
    case "dirty":
      return "Sin guardar";
    case "saving":
      return "Guardando…";
    case "saved":
      return `Guardado ${formatTimeMinutes(status.at)}`;
    case "offline":
      return "Sin conexión: se guardará al reconectar";
    case "blocked":
      if (status.reason === "not_dirty") return "";
      if (status.reason === "offline") return "Sin conexión: se guardará al reconectar";
      if (status.reason === "pending") return "Pendiente";
      return "Sin guardar";
    case "error":
      return status.message;
  }
}

/** Mutable state owned by the autosave controller. */
export type AutosaveControllerState = {
  saving: boolean;
  lastSavedAt: Date | null;
  error: string | null;
};

/** Maps the decision and controller state to what the status line shows. */
export function deriveAutosaveStatus(
  input: AutosaveControllerState & { enabled: boolean; dirty: boolean; decision: AutosaveDecision },
): AutosaveStatus {
  if (!input.enabled) return { kind: "idle" };
  if (input.saving) return { kind: "saving" };
  if (input.error) return { kind: "error", message: input.error };
  if (input.decision.ok) return { kind: "dirty" };
  const { reason } = input.decision;
  if (reason === "offline") return { kind: "offline" };
  if (!input.dirty || reason === "not_dirty") {
    return input.lastSavedAt ? { kind: "saved", at: input.lastSavedAt } : { kind: "idle" };
  }
  return { kind: "blocked", reason };
}

export const AUTOSAVE_ERROR_MESSAGE =
  "No se pudo guardar automáticamente; tus cambios siguen en el formulario.";

export type AutosaveController = {
  /** Activity: restart the countdown (no-op while inactive). */
  touch(): void;
  /**
   * Save now: cancels the countdown, waits for an in-flight save, then saves what is still dirty.
   * Resolves `true` when nothing is left unsaved or the save succeeded, `false` when the save
   * failed or was blocked while dirty.
   */
  flush(): Promise<boolean>;
  /** Report a save done outside the controller (e.g. the manual "Guardar" button). */
  markSaved(at?: Date): void;
  /** Mount/unmount switch; inactive controllers never schedule nor save. */
  setActive(active: boolean): void;
  dispose(): void;
  subscribe(listener: () => void): () => void;
  getSnapshot(): AutosaveControllerState;
};

/**
 * Stateful autosave loop: one save in flight at most, re-armed after a successful save while the
 * form is still dirty, and no retry after a failure until the next activity. `canSave` and
 * `isDirty` are read lazily at fire time, so they may come from refs.
 */
export function createAutosaveController(
  options: TimerOptions & {
    save: () => Promise<boolean>;
    canSave: () => boolean;
    isDirty: () => boolean;
  },
): AutosaveController {
  const now = options.now ?? (() => Date.now());
  const listeners = new Set<() => void>();
  let state: AutosaveControllerState = { saving: false, lastSavedAt: null, error: null };
  let inFlight: Promise<boolean> | null = null;
  let active = false;
  let disposed = false;

  const update = (patch: Partial<AutosaveControllerState>) => {
    state = { ...state, ...patch };
    for (const listener of listeners) listener();
  };

  const run = (): Promise<boolean> => {
    if (inFlight) return inFlight;
    if (!active) return Promise.resolve(!options.isDirty());
    if (!options.isDirty()) return Promise.resolve(true);
    if (!options.canSave()) return Promise.resolve(false);
    update({ saving: true, error: null });
    const attempt = Promise.resolve()
      .then(() => options.save())
      .then(
        (ok) => ({ ok, error: null }),
        () => ({ ok: false, error: AUTOSAVE_ERROR_MESSAGE }),
      )
      .then(({ ok, error }) => {
        inFlight = null;
        update({
          saving: false,
          error,
          lastSavedAt: ok ? new Date(now()) : state.lastSavedAt,
        });
        if (ok && active && options.isDirty()) scheduler.touch();
        return ok;
      });
    inFlight = attempt;
    return attempt;
  };

  const scheduler = createAutosaveScheduler({
    ...options,
    onFire: () => {
      void run();
    },
  });

  return {
    touch() {
      if (active) scheduler.touch();
    },
    async flush() {
      scheduler.cancel();
      if (inFlight) await inFlight;
      scheduler.cancel();
      return run();
    },
    markSaved(at = new Date(now())) {
      update({ lastSavedAt: at, error: null });
    },
    setActive(next) {
      active = next && !disposed;
      if (!active) scheduler.cancel();
    },
    dispose() {
      disposed = true;
      active = false;
      scheduler.dispose();
      listeners.clear();
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    getSnapshot: () => state,
  };
}
