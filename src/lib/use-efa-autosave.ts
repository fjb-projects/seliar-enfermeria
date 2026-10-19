import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import {
  createAutosaveController,
  deriveAutosaveStatus,
  shouldAutosave,
  type AutosaveController,
  type AutosaveDecision,
  type AutosaveInput,
  type AutosaveStatus,
} from "./efa-autosave";

const subscribeOnline = (onChange: () => void) => {
  window.addEventListener("online", onChange);
  window.addEventListener("offline", onChange);
  return () => {
    window.removeEventListener("online", onChange);
    window.removeEventListener("offline", onChange);
  };
};

/** Browser connectivity; assumes online during SSR and hydration. */
export function useOnlineStatus(): boolean {
  return useSyncExternalStore(
    subscribeOnline,
    () => navigator.onLine,
    () => true,
  );
}

export type UseEfaAutosaveOptions = {
  /** Master switch for this form (e.g. off while a dialog owns the record). */
  enabled: boolean;
  /** Everything `shouldAutosave` needs except `online`, which the hook tracks itself. */
  conditions: Omit<AutosaveInput, "online">;
  /**
   * Saves the current form; resolves `true` only when the server or queue accepted it. It should
   * send a snapshot (`createSaveSnapshot`) and keep the form editable while it runs.
   */
  save: () => Promise<boolean>;
  /** Any value that changes on user activity (e.g. the form object); each change restarts the countdown. */
  changeKey?: unknown;
  /**
   * Synchronous dirty reader (e.g. a ref the save updates). Defaults to the last rendered
   * `conditions.dirty`, which can lag one render behind a save that just resolved.
   */
  isDirty?: () => boolean;
  /** Inactivity delay; read once on mount. */
  delayMs?: number;
};

export type UseEfaAutosaveResult = {
  status: AutosaveStatus;
  decision: AutosaveDecision;
  online: boolean;
  /** Save now and resolve after it (and any in-flight save) settles; await it before a step change. */
  flush: AutosaveController["flush"];
  /** Restart the countdown manually (for activity not captured by `changeKey`). */
  touch: AutosaveController["touch"];
  /** Report a manual save so the status shows "Guardado HH:MM". */
  markSaved: AutosaveController["markSaved"];
};

/** Thin React adapter over `createAutosaveController`; all decisions live in the pure core. */
export function useEfaAutosave(options: UseEfaAutosaveOptions): UseEfaAutosaveResult {
  const { enabled, conditions, changeKey } = options;
  const online = useOnlineStatus();
  const decision = shouldAutosave({ ...conditions, online });
  const latest = useRef({ options, decision });
  latest.current = { options, decision };

  const [controller] = useState(() =>
    createAutosaveController({
      ...(options.delayMs === undefined ? {} : { delayMs: options.delayMs }),
      save: () => latest.current.options.save(),
      canSave: () => latest.current.options.enabled && latest.current.decision.ok,
      isDirty: () => {
        const current = latest.current.options;
        return current.isDirty ? current.isDirty() : current.conditions.dirty;
      },
    }),
  );

  useEffect(() => {
    controller.setActive(true);
    return () => controller.setActive(false);
  }, [controller]);

  // Activity, or a blocker clearing (back online, queue drained), restarts the countdown.
  useEffect(() => {
    if (enabled && conditions.dirty) controller.touch();
  }, [controller, enabled, conditions.dirty, decision.ok, changeKey]);

  const state = useSyncExternalStore(
    controller.subscribe,
    controller.getSnapshot,
    controller.getSnapshot,
  );

  return {
    status: deriveAutosaveStatus({ ...state, enabled, dirty: conditions.dirty, decision }),
    decision,
    online,
    flush: controller.flush,
    touch: controller.touch,
    markSaved: controller.markSaved,
  };
}
