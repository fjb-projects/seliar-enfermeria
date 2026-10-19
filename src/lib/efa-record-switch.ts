/**
 * Switching the editor of an EFA form (calls, dispatches, police coordinations, episode header)
 * to another record: save first, and ask before discarding what could not be saved. Pure, so it
 * is unit tested without a DOM.
 */

export type RecordSwitchDecision = "switch" | "confirm";

/** After the flush: switch when nothing is left unsaved, otherwise ask before discarding. */
export function decideRecordSwitch(input: { dirtyAfterFlush: boolean }): RecordSwitchDecision {
  return input.dirtyAfterFlush ? "confirm" : "switch";
}

export type RecordSwitchNoun = "despacho" | "llamada" | "coordinación" | "servicio";

export function recordSwitchConfirmationCopy(noun: RecordSwitchNoun) {
  const article = noun === "llamada" || noun === "coordinación" ? "esta" : "este";
  return {
    title: "Cambios sin guardar",
    description: `Tenés cambios sin guardar en ${article} ${noun}. Si cambiás ahora, se pierden.`,
    confirmLabel: "Descartar y cambiar",
  };
}

/** Orders switch requests: a newer request (or `cancel`) supersedes the ones still flushing. */
export function createRecordSwitchSequence() {
  let latest = 0;
  return {
    /** Starts a request; the returned check stays true until a newer request or `cancel`. */
    begin(): () => boolean {
      const ticket = ++latest;
      return () => ticket === latest;
    },
    cancel() {
      latest += 1;
    },
  };
}

/**
 * Awaits the form's autosave flush (which waits for an in-flight save and then saves what is
 * still dirty when allowed) and decides from the dirty state afterwards. Resolves `"stale"` when
 * the request stopped being current while the flush ran (newer request, unmount, other record).
 */
export async function prepareRecordSwitch(input: {
  flush: () => Promise<boolean>;
  isDirty: () => boolean;
  isCurrent: () => boolean;
}): Promise<RecordSwitchDecision | "stale"> {
  try {
    await input.flush();
  } catch {
    // A failed save leaves the form dirty; the dirty check below decides.
  }
  if (!input.isCurrent()) return "stale";
  return decideRecordSwitch({ dirtyAfterFlush: input.isDirty() });
}
