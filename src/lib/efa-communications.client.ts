import type { CommunicationQueueEntry } from "./efa-communications.queue";

export type CommunicationTimeForm = { startedAt: string; endedAt: string };
export type CommunicationTimeSource = {
  startedAt: string | Date | null;
  endedAt: string | Date | null;
};
export type CommunicationFormState = {
  direction: "incoming" | "outgoing";
  priority: "red" | "yellow" | "green" | "";
  times: CommunicationTimeForm;
};

export function restoreCommunicationOperationForm(
  entry: CommunicationQueueEntry,
  current:
    | (CommunicationTimeSource & {
        direction: "incoming" | "outgoing";
        priority: "red" | "yellow" | "green" | null;
      })
    | null,
): CommunicationFormState | null {
  if (entry.kind === "finalize") {
    if (!current) return null;
    return {
      direction: current.direction,
      priority: entry.payload.priority ?? "",
      times: communicationToFormTimes(current),
    };
  }
  const payload = entry.payload as {
    direction: "incoming" | "outgoing";
    priority: "red" | "yellow" | "green" | null;
    startedAt: string | null;
    endedAt: string | null;
  };
  return {
    direction: payload.direction,
    priority: payload.priority ?? "",
    times: communicationToFormTimes(payload),
  };
}

export async function loadCurrentConflictVersion<T extends { id: string }>(
  fetchRows: () => Promise<T[]>,
  communicationId: string,
  isStillSelected: () => boolean,
): Promise<
  { status: "loaded"; communication: T; rows: T[] } | { status: "missing" | "cancelled" }
> {
  if (!isStillSelected()) return { status: "cancelled" };
  const rows = await fetchRows();
  if (!isStillSelected()) return { status: "cancelled" };
  const communication = rows.find((row) => row.id === communicationId);
  return communication ? { status: "loaded", communication, rows } : { status: "missing" };
}

function dateToLocalInput(value: Date | string | null): string {
  if (value === null) return "";
  const date = value instanceof Date ? value : new Date(value);
  if (!Number.isFinite(date.getTime())) return "";
  const localDate = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return localDate.toISOString().slice(0, 23);
}

function localInputToIso(value: string): string | null {
  if (!value) return null;
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? date.toISOString() : null;
}

export function communicationToFormTimes(source: CommunicationTimeSource): CommunicationTimeForm {
  return {
    startedAt: dateToLocalInput(source.startedAt),
    endedAt: dateToLocalInput(source.endedAt),
  };
}

export function communicationFormToPayloadTimes(
  form: CommunicationTimeForm,
  original: CommunicationTimeSource,
): { startedAt: string | null; endedAt: string | null } {
  const preserveOriginal = (value: string, originalValue: string | Date | null) => {
    if (!value) return null;
    if (originalValue !== null && value === dateToLocalInput(originalValue)) {
      return originalValue instanceof Date ? originalValue.toISOString() : originalValue;
    }
    return localInputToIso(value);
  };
  return {
    startedAt: preserveOriginal(form.startedAt, original.startedAt),
    endedAt: preserveOriginal(form.endedAt, original.endedAt),
  };
}

export function captureCommunicationTime(now: Date = new Date()): string {
  return dateToLocalInput(now);
}
