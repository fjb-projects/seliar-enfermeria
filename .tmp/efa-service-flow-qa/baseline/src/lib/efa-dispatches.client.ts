import type { DispatchQueueEntry, DispatchQueuePayload } from "./efa-dispatches.queue";

export type DispatchTimeForm = { [Key in `t${0 | 1 | 2 | 3 | 4 | 5 | 6}At`]: string };
export type DispatchTimeSource = { [Key in keyof DispatchTimeForm]: string | Date | null };
export type DispatchObservation = "observed" | "not_observed" | "not_informed" | "not_applicable";
export type DispatchForm = DispatchTimeForm & {
  t0Status: DispatchObservation;
  t1Status: DispatchObservation;
  t2Status: DispatchObservation;
  t3Status: DispatchObservation;
  t4Status: DispatchObservation;
  t5Status: DispatchObservation;
  t6Status: DispatchObservation;
  baseId: string;
  institutionId: string;
  communicationId: string;
  priority: "red" | "yellow" | "green" | "";
  note: string;
  result:
    | "transported"
    | "treated_at_home"
    | "refused"
    | "not_located"
    | "cancelled"
    | "death"
    | "not_informed"
    | "";
  resultClarification: string;
  firstResponseRole: string;
  firstResponseAt: string;
};

export type DispatchLifecycleOperation = { key: string; operationId: string };

export function reuseDispatchLifecycleOperation(
  current: DispatchLifecycleOperation | null,
  action: "cancel" | "reactivate",
  dispatchId: string,
  expectedVersion: number,
  createOperationId: () => string,
): DispatchLifecycleOperation {
  const key = `${action}:${dispatchId}:${expectedVersion}`;
  return current?.key === key ? current : { key, operationId: createOperationId() };
}

export const emptyDispatchForm = (): DispatchForm => ({
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

export function formatDispatchDate(value: string | Date): string {
  return new Date(value).toLocaleString("es-AR", { timeZone: "America/Argentina/Buenos_Aires" });
}

export function dateToDispatchInput(value: string | Date | null): string {
  if (!value) return "";
  const date = value instanceof Date ? value : new Date(value);
  if (!Number.isFinite(date.getTime())) return "";
  return new Date(date.getTime() - date.getTimezoneOffset() * 60_000).toISOString().slice(0, 23);
}

export function dispatchInputToIso(value: string): string | null {
  if (!value) return null;
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? date.toISOString() : null;
}

export function captureDispatchTime(now = new Date()): string {
  return dateToDispatchInput(now);
}

export function canAdoptConfirmedDispatch(
  kind: DispatchQueueEntry["kind"],
  dispatchId: string,
  submitted: { selectedId: string | null; form: string },
  selectedId: string | null,
  currentForm: string,
): boolean {
  if (submitted.form !== currentForm) return false;
  return kind === "create"
    ? submitted.selectedId === null && selectedId === null
    : submitted.selectedId === dispatchId && selectedId === dispatchId;
}

export function shouldAdoptRefreshedDispatch(
  selectedId: string | null,
  refreshedId: string,
  dirty: boolean,
): boolean {
  return selectedId === refreshedId && !dirty;
}

export function canEditQueuedDispatch(
  entry: DispatchQueueEntry,
  canWrite: boolean,
  episodeCanEdit: boolean,
  entityCanEdit: boolean,
): boolean {
  if (!canWrite || !episodeCanEdit) return false;
  return entry.kind === "create" || entityCanEdit;
}

export function canApplyConfirmedMutation(input: {
  mounted: boolean;
  ownerMatches: boolean;
  episodeMatches: boolean;
  operationInFlight: boolean;
  kind: DispatchQueueEntry["kind"];
  dispatchId: string;
  submitted: { selectedId: string | null; form: string };
  currentSelectedId: string | null;
  currentForm: string;
}): boolean {
  return (
    input.mounted &&
    input.ownerMatches &&
    input.episodeMatches &&
    input.operationInFlight &&
    canAdoptConfirmedDispatch(
      input.kind,
      input.dispatchId,
      input.submitted,
      input.currentSelectedId,
      input.currentForm,
    )
  );
}

type DispatchContactAttempt = { id: string; occurredAt: string; note: string | null };
type PriorDispatchContactAttempt = Omit<DispatchContactAttempt, "occurredAt"> & {
  occurredAt: string | Date;
};
export function normalizeConfirmedDispatch<T extends { id: string }>(
  dispatch: T & { contactAttempts?: DispatchContactAttempt[] },
  previous: { contactAttempts: PriorDispatchContactAttempt[] } | null,
): T & { contactAttempts: DispatchContactAttempt[] } {
  return {
    ...dispatch,
    contactAttempts:
      dispatch.contactAttempts ??
      previous?.contactAttempts.map((attempt) => ({
        ...attempt,
        occurredAt:
          attempt.occurredAt instanceof Date
            ? attempt.occurredAt.toISOString()
            : attempt.occurredAt,
      })) ??
      [],
  };
}

export function restoreDispatchForm(
  source: Partial<DispatchForm> & DispatchTimeSource,
): DispatchForm {
  const form = emptyDispatchForm();
  for (const key of Object.keys(form) as Array<keyof DispatchForm>) {
    if (key.endsWith("At"))
      (form as unknown as Record<string, string>)[key] = dateToDispatchInput(
        source[key as keyof DispatchTimeSource] ?? null,
      );
    else if (key in source && typeof source[key as keyof typeof source] === "string")
      (form as unknown as Record<string, string>)[key] = source[
        key as keyof typeof source
      ] as string;
  }
  return form;
}

export function dispatchFormChanged(form: DispatchForm, source: DispatchForm | null): boolean {
  return source !== null && JSON.stringify(form) !== JSON.stringify(source);
}

export function dispatchFormTimes(form: DispatchForm, source: DispatchTimeSource) {
  const result = {} as Record<keyof DispatchTimeForm, string | null>;
  for (const key of Object.keys(form).filter((name) => name.endsWith("At")) as Array<
    keyof DispatchTimeForm
  >) {
    const value = form[key];
    const original = source[key];
    result[key] =
      value && original && value === dateToDispatchInput(original)
        ? original instanceof Date
          ? original.toISOString()
          : original
        : dispatchInputToIso(value);
  }
  return result;
}

export function makeDispatchQueueEntry(
  input: Omit<DispatchQueueEntry, "createdAt" | "status">,
  now = new Date(),
): DispatchQueueEntry {
  return {
    ...input,
    payload: Object.freeze({ ...input.payload }) as DispatchQueuePayload,
    status: "pending",
    createdAt: now.toISOString(),
  };
}

export function restoreDispatchQueueForm(
  entry: DispatchQueueEntry,
  current: DispatchForm,
): DispatchForm | null {
  if (
    entry.kind === "contact-attempt" ||
    entry.kind === "support-create" ||
    entry.kind === "support-update"
  )
    return null;
  if (entry.kind === "finalize") {
    const payload = entry.payload as Record<string, unknown>;
    return {
      ...current,
      priority: payload["priority"] as DispatchForm["priority"],
      result: payload["result"] as DispatchForm["result"],
      resultClarification: (payload["resultClarification"] as string | null) ?? "",
    };
  }
  const payload = entry.payload as Record<string, unknown>;
  const form = emptyDispatchForm();
  form.baseId = String(payload["baseId"] ?? "");
  form.institutionId = String(payload["institutionId"] ?? "");
  form.communicationId = String(payload["communicationId"] ?? "");
  form.priority = (payload["priority"] as DispatchForm["priority"]) ?? "";
  form.note = String(payload["note"] ?? "");
  form.result = (payload["result"] as DispatchForm["result"]) ?? "";
  form.resultClarification = String(payload["resultClarification"] ?? "");
  form.firstResponseRole = String(payload["firstResponseRole"] ?? "");
  form.firstResponseAt = dateToDispatchInput(payload["firstResponseAt"] as string | null);
  for (const key of ["t0At", "t1At", "t2At", "t3At", "t4At", "t5At", "t6At"] as const) {
    form[key] = dateToDispatchInput(payload[key] as string | null);
    const statusKey = `${key.slice(0, 2)}Status` as keyof DispatchForm;
    if (typeof payload[statusKey] === "string")
      (form as unknown as Record<string, string>)[statusKey] = payload[statusKey] as string;
  }
  return form;
}

export function rebaseDispatchQueueEntry(
  entry: DispatchQueueEntry,
  expectedVersion: number,
  operationId: string,
  now = new Date(),
): DispatchQueueEntry {
  if (entry.kind !== "update" && entry.kind !== "finalize" && entry.kind !== "support-update")
    throw new Error("Esta operación no admite rebase de versión.");
  return {
    ...entry,
    operationId,
    createdAt: now.toISOString(),
    status: "pending",
    payload: Object.freeze({ ...entry.payload, expectedVersion, operationId }),
  };
}
