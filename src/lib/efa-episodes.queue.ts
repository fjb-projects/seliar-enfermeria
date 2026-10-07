import {
  episodeErrorKind,
  isoToLocalDateTimeValue,
  type EpisodeFormValues,
  type PendingEpisodeCreate,
  type PendingEpisodeClose,
  type PendingEpisodeOperation,
  type PendingEpisodeUpdate,
} from "./efa-episodes.client";

export type EpisodeQueueStatus =
  "pending" | "paused-conflict" | "paused-permission" | "paused-mismatch" | "confirmed-cleanup";
export type EpisodeQueueEntry = {
  ownerUserId: string;
  operationId: string;
  kind: "create" | "update" | "close";
  payload:
    | PendingEpisodeCreate["payload"]
    | PendingEpisodeUpdate["payload"]
    | PendingEpisodeClose["payload"];
  status: EpisodeQueueStatus;
  createdAt: string;
};
export interface EpisodeQueueStore {
  list(ownerUserId: string): Promise<EpisodeQueueEntry[]>;
  get(ownerUserId: string, operationId: string): Promise<EpisodeQueueEntry | null>;
  put(entry: EpisodeQueueEntry): Promise<EpisodeQueueEntry>;
  setStatus(ownerUserId: string, operationId: string, status: EpisodeQueueStatus): Promise<void>;
  delete(ownerUserId: string, operationId: string): Promise<void>;
}
export type EpisodeQueueOutcome<TResult> =
  | { status: "confirmed"; entry: EpisodeQueueEntry; result: TResult }
  | { status: "confirmed-cleanup-failed"; entry: EpisodeQueueEntry; result: TResult }
  | { status: "cleaned" | "cleanup-failed"; entry: EpisodeQueueEntry }
  | {
      status: "mismatched" | "uncertain" | "already-in-flight" | "missing" | "paused";
      entry: EpisodeQueueEntry;
    }
  | { status: "paused-conflict" | "paused-permission"; entry: EpisodeQueueEntry }
  | { status: "pause-storage-failed"; entry: EpisodeQueueEntry };

const queueKey = (entry: EpisodeQueueEntry) => `${entry.ownerUserId}\u0000${entry.operationId}`;
const freezeEntry = (entry: EpisodeQueueEntry): EpisodeQueueEntry => {
  const payload = Object.freeze(structuredClone(entry.payload));
  return Object.freeze({ ...entry, payload });
};
const samePayload = (left: EpisodeQueueEntry, right: EpisodeQueueEntry) =>
  left.kind === right.kind && JSON.stringify(left.payload) === JSON.stringify(right.payload);
const payloadOperationId = (entry: EpisodeQueueEntry) => {
  if (entry.kind === "create")
    return (entry.payload as PendingEpisodeCreate["payload"]).clientCreationKey;
  return (entry.payload as PendingEpisodeUpdate["payload"] | PendingEpisodeClose["payload"])
    .operationId;
};

export type RestoredEpisodeQueueEntry = {
  operation: PendingEpisodeOperation;
  form: EpisodeFormValues | null;
};

export function restoreQueuedEpisode(entry: EpisodeQueueEntry): RestoredEpisodeQueueEntry {
  if (entry.kind === "close") {
    const payload = structuredClone(entry.payload);
    return {
      operation: {
        kind: "close",
        operationId: entry.operationId,
        payload: payload as PendingEpisodeClose["payload"],
      },
      form: null,
    };
  }
  const payload = structuredClone(entry.payload) as
    PendingEpisodeCreate["payload"] | PendingEpisodeUpdate["payload"];
  const eventAt = payload.eventAt;
  const operation: PendingEpisodeCreate | PendingEpisodeUpdate =
    entry.kind === "create"
      ? {
          kind: "create",
          operationId: entry.operationId,
          payload: payload as PendingEpisodeCreate["payload"],
        }
      : {
          kind: "update",
          operationId: entry.operationId,
          payload: payload as PendingEpisodeUpdate["payload"],
        };
  return {
    operation: Object.freeze(operation),
    form: {
      eventAt: isoToLocalDateTimeValue(eventAt),
      motive: payload.motive ?? "",
      address: payload.address ?? "",
      interventionNumber: payload.interventionNumber ?? "",
    },
  };
}

export type EpisodeQueueOwnerTicket = { ownerUserId: string; generation: number };
export async function runEpisodeQueueOwnerAction<T>(
  ticket: EpisodeQueueOwnerTicket | null,
  isCurrent: (ticket: EpisodeQueueOwnerTicket) => boolean,
  action: () => Promise<T>,
  commit: (value: T) => void,
): Promise<boolean> {
  if (!ticket || !isCurrent(ticket)) return false;
  const value = await action();
  if (!isCurrent(ticket)) return false;
  commit(value);
  return true;
}

export async function runWithEpisodeQueueBusy<T>(
  ticket: EpisodeQueueOwnerTicket | null,
  isCurrent: (ticket: EpisodeQueueOwnerTicket) => boolean,
  setBusy: (busy: boolean) => void,
  action: () => Promise<T>,
): Promise<T | undefined> {
  if (!ticket || !isCurrent(ticket)) return undefined;
  setBusy(true);
  try {
    return await action();
  } finally {
    if (isCurrent(ticket)) setBusy(false);
  }
}

export function selectEpisodeQueueEntry(
  entries: EpisodeQueueEntry[],
  ownerUserId: string,
  operationId: string,
): EpisodeQueueEntry | null {
  return (
    entries.find(
      (entry) => entry.ownerUserId === ownerUserId && entry.operationId === operationId,
    ) ?? null
  );
}

export function isValidEpisodeQueueReceipt(entry: EpisodeQueueEntry, result: unknown): boolean {
  if (!result || typeof result !== "object") return false;
  const mutation = result as {
    operation?: Record<string, unknown>;
    episode?: Record<string, unknown>;
  };
  const operation = mutation.operation;
  if (operation?.["id"] !== entry.operationId) return false;
  if (entry.kind !== "close") return true;

  const payload = entry.payload as PendingEpisodeClose["payload"];
  const episode = mutation.episode;
  const appliedVersion = operation["appliedVersion"];
  const version = episode?.["version"];
  const closedAt = episode?.["closedAt"];
  return Boolean(
    operation["action"] === "closed" &&
    Number.isInteger(appliedVersion) &&
    Number(appliedVersion) > 0 &&
    Number.isInteger(version) &&
    Number(version) >= Number(appliedVersion) &&
    typeof operation["changed"] === "boolean" &&
    typeof operation["replayed"] === "boolean" &&
    episode?.["id"] === payload.episodeId &&
    episode?.["state"] === "closed" &&
    typeof closedAt === "string" &&
    Number.isFinite(Date.parse(closedAt)),
  );
}

export function shouldSyncEpisodeOperationToEditor(
  operationId: string,
  pendingOperationId: string | null,
  selectedOperationId: string | null,
): boolean {
  return pendingOperationId === operationId || selectedOperationId === operationId;
}

export function isSelectedEpisodeQueueOperation(
  operation: { ownerUserId: string; operationId: string; episodeId: string },
  activeOwnerUserId: string,
  pendingOperationId: string | null,
  selectedOperationId: string | null,
): boolean {
  return (
    operation.ownerUserId === activeOwnerUserId &&
    shouldSyncEpisodeOperationToEditor(
      operation.operationId,
      pendingOperationId,
      selectedOperationId,
    )
  );
}

export async function setEpisodeEventAtForCurrentOwner(
  ticket: EpisodeQueueOwnerTicket | null,
  isCurrent: (ticket: EpisodeQueueOwnerTicket) => boolean,
  loadHelpers: () => Promise<{
    isoToLocalDateTimeValue(value: Date | string): string;
  }>,
  now: Date,
  setForm: (update: (current: EpisodeFormValues) => EpisodeFormValues) => void,
): Promise<boolean> {
  if (!ticket || !isCurrent(ticket)) return false;
  const { isoToLocalDateTimeValue } = await loadHelpers();
  if (!isCurrent(ticket)) return false;
  const eventAt = isoToLocalDateTimeValue(now);
  setForm((current) => ({ ...current, eventAt }));
  return true;
}

export function createEpisodeQueueOwnerFence() {
  let ownerUserId: string | null = null;
  let generation = 0;
  return {
    enter(nextOwnerUserId: string): EpisodeQueueOwnerTicket {
      ownerUserId = nextOwnerUserId;
      generation += 1;
      return { ownerUserId, generation };
    },
    isCurrent(ticket: EpisodeQueueOwnerTicket) {
      return ownerUserId === ticket.ownerUserId && generation === ticket.generation;
    },
    commitIfCurrent(ticket: EpisodeQueueOwnerTicket, commit: () => void) {
      if (ownerUserId !== ticket.ownerUserId || generation !== ticket.generation) return false;
      commit();
      return true;
    },
    leave(ticket: EpisodeQueueOwnerTicket) {
      if (ownerUserId === ticket.ownerUserId && generation === ticket.generation) {
        ownerUserId = null;
        generation += 1;
      }
    },
  };
}

export function createEpisodeQueueController<TResult extends { operation?: { id?: string } }>(
  store: EpisodeQueueStore,
  dispatch: (entry: EpisodeQueueEntry) => Promise<TResult>,
) {
  const inFlight = new Set<string>();
  const pausedAfterStorageFailure = new Set<string>();
  const confirmedResults = new Map<string, TResult>();

  async function cleanConfirmed(
    entry: EpisodeQueueEntry,
    result?: TResult,
  ): Promise<EpisodeQueueOutcome<TResult>> {
    try {
      await store.delete(entry.ownerUserId, entry.operationId);
      confirmedResults.delete(queueKey(entry));
      return result ? { status: "confirmed", entry, result } : { status: "cleaned", entry };
    } catch {
      return result
        ? { status: "confirmed-cleanup-failed", entry, result }
        : { status: "cleanup-failed", entry };
    }
  }

  async function pauseMismatched(entry: EpisodeQueueEntry): Promise<EpisodeQueueOutcome<TResult>> {
    const key = queueKey(entry);
    try {
      await store.setStatus(entry.ownerUserId, entry.operationId, "paused-mismatch");
      return { status: "mismatched", entry: { ...entry, status: "paused-mismatch" } };
    } catch {
      pausedAfterStorageFailure.add(key);
      return { status: "pause-storage-failed", entry };
    }
  }

  async function attempt(entry: EpisodeQueueEntry): Promise<EpisodeQueueOutcome<TResult>> {
    const key = queueKey(entry);
    if (inFlight.has(key)) return { status: "already-in-flight", entry };
    inFlight.add(key);
    try {
      // Reconciliation lists are snapshots. Re-read the stored entry immediately before
      // dispatch so an earlier operation cannot make this stale copy newly ineligible.
      const persisted = await store.get(entry.ownerUserId, entry.operationId);
      if (!persisted) return { status: "missing", entry };
      if (!samePayload(persisted, entry)) throw new Error("Operation payload is immutable.");

      const confirmed = confirmedResults.get(key);
      if (confirmed) return cleanConfirmed(persisted, confirmed);
      if (persisted.status === "confirmed-cleanup") return cleanConfirmed(persisted);
      if (persisted.status === "paused-mismatch") return { status: "mismatched", entry: persisted };
      if (persisted.status !== "pending") return { status: "paused", entry: persisted };
      if (pausedAfterStorageFailure.has(key)) {
        return { status: "pause-storage-failed", entry: persisted };
      }

      let result: TResult;
      try {
        result = await dispatch(persisted);
      } catch (error) {
        const kind = episodeErrorKind(error);
        if (kind === "conflict" || kind === "permission") {
          const status = kind === "conflict" ? "paused-conflict" : "paused-permission";
          try {
            await store.setStatus(persisted.ownerUserId, persisted.operationId, status);
            return { status, entry: { ...persisted, status } };
          } catch {
            pausedAfterStorageFailure.add(key);
            return { status: "pause-storage-failed", entry: persisted };
          }
        }
        return { status: "uncertain", entry: persisted };
      }

      try {
        if (!isValidEpisodeQueueReceipt(persisted, result)) return await pauseMismatched(persisted);
        confirmedResults.set(key, result);
        await store.setStatus(persisted.ownerUserId, persisted.operationId, "confirmed-cleanup");
      } catch {
        // The server receipt is already known; keep an in-memory fence if its local marker fails.
      }
      return cleanConfirmed({ ...persisted, status: "confirmed-cleanup" }, result);
    } finally {
      inFlight.delete(key);
    }
  }

  return {
    async enqueue(entry: EpisodeQueueEntry): Promise<EpisodeQueueOutcome<TResult>> {
      if (!entry.ownerUserId || payloadOperationId(entry) !== entry.operationId) {
        throw new Error("Queued operation identity does not match its payload.");
      }
      const persisted = await store.put(freezeEntry(entry));
      if (!samePayload(persisted, entry)) throw new Error("Operation payload is immutable.");
      return attempt(persisted);
    },
    async retry(entry: EpisodeQueueEntry): Promise<EpisodeQueueOutcome<TResult>> {
      const persisted = await store.get(entry.ownerUserId, entry.operationId);
      if (!persisted) return { status: "missing", entry };
      if (!samePayload(persisted, entry)) throw new Error("Operation payload is immutable.");
      const confirmed = confirmedResults.get(queueKey(entry));
      if (confirmed || persisted.status === "confirmed-cleanup") {
        return cleanConfirmed(persisted, confirmed);
      }
      if (persisted.status === "paused-mismatch") return { status: "mismatched", entry: persisted };
      if (pausedAfterStorageFailure.has(queueKey(entry))) {
        return { status: "pause-storage-failed", entry };
      }
      return attempt(persisted);
    },
    async reconcile(ownerUserId: string): Promise<Array<EpisodeQueueOutcome<TResult>>> {
      const entries = await store.list(ownerUserId);
      const outcomes: Array<EpisodeQueueOutcome<TResult>> = [];
      for (const entry of entries) {
        if (entry.ownerUserId !== ownerUserId) continue;
        const confirmed = confirmedResults.get(queueKey(entry));
        if (confirmed || entry.status === "confirmed-cleanup") {
          outcomes.push(await cleanConfirmed(entry, confirmed));
          continue;
        }
        if (entry.status !== "pending") continue;
        if (pausedAfterStorageFailure.has(queueKey(entry))) continue;
        outcomes.push(await attempt(entry));
      }
      return outcomes;
    },
    async removeResolved(ownerUserId: string, operationId: string): Promise<void> {
      await store.delete(ownerUserId, operationId);
      const key = `${ownerUserId}\u0000${operationId}`;
      pausedAfterStorageFailure.delete(key);
      confirmedResults.delete(key);
    },
  };
}

let databasePromise: Promise<IDBDatabase> | undefined;
function openEpisodeQueueDatabase(): Promise<IDBDatabase> {
  if (typeof indexedDB === "undefined") {
    return Promise.reject(new Error("IndexedDB is unavailable in this browser."));
  }
  if (!databasePromise) {
    databasePromise = new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open("seliar-efa-episode-queue", 1);
      request.onupgradeneeded = () => {
        const database = request.result;
        if (!database.objectStoreNames.contains("operations")) {
          database.createObjectStore("operations", { keyPath: ["ownerUserId", "operationId"] });
        }
      };
      request.onsuccess = () => {
        request.result.onversionchange = () => request.result.close();
        resolve(request.result);
      };
      request.onerror = () => reject(request.error ?? new Error("Could not open episode queue."));
      request.onblocked = () => reject(new Error("Episode queue is blocked by another tab."));
    }).catch((error): never => {
      databasePromise = undefined;
      throw error;
    });
  }
  return databasePromise;
}

function requestValue<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("IndexedDB request failed."));
  });
}

function transactionDone(transaction: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onerror = () =>
      reject(transaction.error ?? new Error("IndexedDB transaction failed."));
    transaction.onabort = () =>
      reject(transaction.error ?? new Error("IndexedDB transaction aborted."));
  });
}

export function createIndexedDbEpisodeQueueStore(): EpisodeQueueStore {
  return {
    async list(ownerUserId) {
      const database = await openEpisodeQueueDatabase();
      const transaction = database.transaction("operations", "readonly");
      const done = transactionDone(transaction);
      const range = IDBKeyRange.bound([ownerUserId, ""], [ownerUserId, "\uffff"]);
      const entries = await requestValue(
        transaction.objectStore("operations").getAll(range) as IDBRequest<EpisodeQueueEntry[]>,
      );
      await done;
      return entries
        .sort((left, right) => left.createdAt.localeCompare(right.createdAt))
        .map(freezeEntry);
    },
    async get(ownerUserId, operationId) {
      const database = await openEpisodeQueueDatabase();
      const transaction = database.transaction("operations", "readonly");
      const done = transactionDone(transaction);
      const entry = await requestValue(
        transaction.objectStore("operations").get([ownerUserId, operationId]) as IDBRequest<
          EpisodeQueueEntry | undefined
        >,
      );
      await done;
      return entry ? freezeEntry(entry) : null;
    },
    async put(entry) {
      const database = await openEpisodeQueueDatabase();
      const transaction = database.transaction("operations", "readwrite");
      const done = transactionDone(transaction);
      const objectStore = transaction.objectStore("operations");
      const prior = await requestValue(
        objectStore.get([entry.ownerUserId, entry.operationId]) as IDBRequest<
          EpisodeQueueEntry | undefined
        >,
      );
      if (prior) {
        if (!samePayload(prior, entry)) {
          transaction.abort();
          await done.catch(() => undefined);
          throw new Error("Operation payload is immutable.");
        }
        await done;
        return freezeEntry(prior);
      }
      objectStore.add(freezeEntry(entry));
      await done;
      return freezeEntry(entry);
    },
    async setStatus(ownerUserId, operationId, status) {
      const database = await openEpisodeQueueDatabase();
      const transaction = database.transaction("operations", "readwrite");
      const done = transactionDone(transaction);
      const objectStore = transaction.objectStore("operations");
      const prior = await requestValue(
        objectStore.get([ownerUserId, operationId]) as IDBRequest<EpisodeQueueEntry | undefined>,
      );
      if (prior) objectStore.put({ ...prior, status });
      await done;
    },
    async delete(ownerUserId, operationId) {
      const database = await openEpisodeQueueDatabase();
      const transaction = database.transaction("operations", "readwrite");
      const done = transactionDone(transaction);
      transaction.objectStore("operations").delete([ownerUserId, operationId]);
      await done;
    },
  };
}
