import type { DispatchPriority, DispatchResult, ObservationStatus } from "./efa-dispatches.server";

export type DispatchQueueStatus =
  | "pending"
  | "uncertain"
  | "paused-conflict"
  | "paused-permission"
  | "paused-mismatch"
  | "confirmed-cleanup-failed";

type DispatchFieldsPayload = {
  baseId: string;
  institutionId: string | null;
  communicationId: string | null;
  priority: DispatchPriority | null;
  t0At: string | null;
  t0Status: ObservationStatus;
  t1At: string | null;
  t1Status: ObservationStatus;
  t2At: string | null;
  t2Status: ObservationStatus;
  t3At: string | null;
  t3Status: ObservationStatus;
  t4At: string | null;
  t4Status: ObservationStatus;
  t5At: string | null;
  t5Status: ObservationStatus;
  t6At: string | null;
  t6Status: ObservationStatus;
  firstResponseRole: string | null;
  firstResponseAt: string | null;
  note: string | null;
  result: DispatchResult | null;
  resultClarification: string | null;
};

export type DispatchQueuePayload =
  | (DispatchFieldsPayload & { clientCreationKey: string; episodeId: string })
  | (DispatchFieldsPayload & { dispatchId: string; expectedVersion: number; operationId: string })
  | {
      dispatchId: string;
      expectedVersion: number;
      operationId: string;
      priority: DispatchPriority;
      result: DispatchResult;
      resultClarification: string | null;
    }
  | { dispatchId: string; clientEventId: string; occurredAt: string; note: string | null }
  | {
      clientCreationKey: string;
      sourceDispatchId: string;
      requestedAt: string;
      reason: string;
      responseDispatchId: string | null;
    }
  | {
      supportRequestId: string;
      expectedVersion: number;
      operationId: string;
      requestedAt: string;
      reason: string;
      responseDispatchId: string | null;
    };

export type DispatchQueueKind =
  "create" | "update" | "finalize" | "contact-attempt" | "support-create" | "support-update";
export type DispatchQueueEntry = {
  ownerUserId: string;
  episodeId: string;
  operationId: string;
  kind: DispatchQueueKind;
  payload: Readonly<DispatchQueuePayload>;
  status: DispatchQueueStatus;
  createdAt: string;
};

export interface DispatchQueueStore {
  get(owner: string, episode: string, operation: string): Promise<DispatchQueueEntry | null>;
  list(owner: string, episode: string): Promise<DispatchQueueEntry[]>;
  put(entry: DispatchQueueEntry): Promise<DispatchQueueEntry>;
  setStatus(
    owner: string,
    episode: string,
    operation: string,
    status: DispatchQueueStatus,
  ): Promise<void>;
  remove(owner: string, episode: string, operation: string): Promise<void>;
}

export type DispatchQueueResult<Result> =
  | { status: "confirmed"; result: Result }
  | { status: "confirmed-cleanup-failed"; result: Result }
  | { status: "cleaned" }
  | { status: "paused"; queueStatus: DispatchQueueStatus; error: string }
  | { status: "stored"; error: string }
  | { status: "cancelled" };

type TerminalReceipt<Result> = { kind: "confirmed"; result: Result } | { kind: "mismatch" };
const terminalReceipts = new WeakMap<DispatchQueueStore, Map<string, TerminalReceipt<unknown>>>();
const entryKey = (owner: string, episode: string, operation: string) =>
  JSON.stringify([owner, episode, operation]);
const sameRequest = (left: DispatchQueueEntry, right: DispatchQueueEntry) =>
  left.ownerUserId === right.ownerUserId &&
  left.episodeId === right.episodeId &&
  left.operationId === right.operationId &&
  left.kind === right.kind &&
  JSON.stringify(left.payload) === JSON.stringify(right.payload);

export async function persistDispatchOperation(
  store: DispatchQueueStore,
  entry: DispatchQueueEntry,
) {
  const frozen = Object.freeze({ ...entry, payload: Object.freeze({ ...entry.payload }) });
  const saved = await store.put(frozen);
  if (!sameRequest(saved, frozen))
    throw new Error("La identidad local ya pertenece a otra solicitud.");
  return saved;
}

export function dispatchQueueErrorStatus(error: unknown): DispatchQueueStatus {
  const message = error instanceof Error ? error.message : String(error);
  if (/cambi[oó]|version conflict|stale/i.test(message)) return "paused-conflict";
  if (/EFA|inactiva|permiso|administraci[oó]n/i.test(message)) return "paused-permission";
  return "uncertain";
}

export async function dispatchStoredOperation<Result extends { operation: { id: string } }>(
  store: DispatchQueueStore,
  owner: string,
  episode: string,
  operation: string,
  send: (entry: DispatchQueueEntry) => Promise<Result>,
  canDispatch: (entry: DispatchQueueEntry) => boolean | Promise<boolean> = () => true,
): Promise<DispatchQueueResult<Result>> {
  const key = entryKey(owner, episode, operation);
  const terminals = terminalReceipts.get(store);
  const terminal = terminals?.get(key) as TerminalReceipt<Result> | undefined;
  if (terminal?.kind === "mismatch")
    return {
      status: "paused",
      queueStatus: "paused-mismatch",
      error: "El recibo no coincide; la operación queda pausada.",
    };
  if (terminal?.kind === "confirmed") {
    try {
      await store.remove(owner, episode, operation);
      terminals?.delete(key);
      return { status: "cleaned" };
    } catch {
      return { status: "confirmed-cleanup-failed", result: terminal.result };
    }
  }

  let current: DispatchQueueEntry | null;
  try {
    current = await store.get(owner, episode, operation);
  } catch {
    return { status: "stored", error: "No se pudo leer la operación local; no se enviará." };
  }
  if (!current) return { status: "stored", error: "No se encontró la operación local." };
  if (current.status === "confirmed-cleanup-failed") {
    try {
      await store.remove(owner, episode, operation);
      return { status: "cleaned" };
    } catch {
      return {
        status: "stored",
        error: "El servidor confirmó la operación; solo se reintentará la limpieza local.",
      };
    }
  }
  if (current.status !== "pending" && current.status !== "uncertain")
    return {
      status: "paused",
      queueStatus: current.status,
      error: "La operación requiere una resolución explícita.",
    };
  if (!(await canDispatch(current))) return { status: "cancelled" };

  let result: Result;
  try {
    result = await send(current);
  } catch (error) {
    const status = dispatchQueueErrorStatus(error);
    try {
      await store.setStatus(owner, episode, operation, status);
    } catch {
      /* Keep exact frozen request for manual recovery. */
    }
    return {
      status: "paused",
      queueStatus: status,
      error: error instanceof Error ? error.message : "No se pudo confirmar el despacho.",
    };
  }
  if (result.operation.id !== operation) {
    const receipts = terminals ?? new Map<string, TerminalReceipt<unknown>>();
    receipts.set(key, { kind: "mismatch" });
    terminalReceipts.set(store, receipts);
    try {
      await store.setStatus(owner, episode, operation, "paused-mismatch");
    } catch {
      /* The in-memory fence blocks resend for this live store. */
    }
    return {
      status: "paused",
      queueStatus: "paused-mismatch",
      error: "El recibo no coincide; la operación queda pausada.",
    };
  }
  const receipts = terminals ?? new Map<string, TerminalReceipt<unknown>>();
  receipts.set(key, { kind: "confirmed", result });
  terminalReceipts.set(store, receipts);
  try {
    await store.remove(owner, episode, operation);
    receipts.delete(key);
    return { status: "confirmed", result };
  } catch {
    try {
      await store.setStatus(owner, episode, operation, "confirmed-cleanup-failed");
    } catch {
      /* Never resend while this store remains mounted. */
    }
    return { status: "confirmed-cleanup-failed", result };
  }
}

export function createIndexedDbDispatchQueueStore(
  databaseName = "efa-dispatches-queue",
): DispatchQueueStore {
  let database: Promise<IDBDatabase> | null = null;
  const open = () => {
    if (!database)
      database = new Promise((resolve, reject) => {
        const request = indexedDB.open(databaseName, 1);
        request.onupgradeneeded = () => {
          const db = request.result;
          if (!db.objectStoreNames.contains("operations")) {
            const store = db.createObjectStore("operations", {
              keyPath: ["ownerUserId", "episodeId", "operationId"],
            });
            store.createIndex("ownerEpisode", ["ownerUserId", "episodeId"]);
          }
        };
        request.onsuccess = () => resolve(request.result);
        request.onerror = () =>
          reject(request.error ?? new Error("No se pudo abrir la cola local."));
      });
    return database;
  };
  const transaction = async <T>(
    mode: IDBTransactionMode,
    work: (store: IDBObjectStore) => IDBRequest<T>,
  ) => {
    const db = await open();
    return new Promise<T>((resolve, reject) => {
      const tx = db.transaction("operations", mode);
      const request = work(tx.objectStore("operations"));
      let value: T;
      request.onsuccess = () => {
        value = request.result;
      };
      request.onerror = () => tx.abort();
      tx.oncomplete = () => resolve(value!);
      tx.onerror = () => reject(tx.error ?? new Error("No se pudo completar la cola local."));
      tx.onabort = () => reject(tx.error ?? new Error("No se pudo guardar la cola local."));
    });
  };
  return {
    async get(owner, episode, operation) {
      return (
        ((await transaction("readonly", (store) => store.get([owner, episode, operation]))) as
          DispatchQueueEntry | undefined) ?? null
      );
    },
    async list(owner, episode) {
      return (await transaction("readonly", (store) =>
        store.index("ownerEpisode").getAll(IDBKeyRange.only([owner, episode])),
      )) as DispatchQueueEntry[];
    },
    async put(entry) {
      const db = await open();
      return new Promise<DispatchQueueEntry>((resolve, reject) => {
        const tx = db.transaction("operations", "readwrite");
        const objectStore = tx.objectStore("operations");
        const key = [entry.ownerUserId, entry.episodeId, entry.operationId];
        const request = objectStore.get(key);
        let saved = entry;
        request.onsuccess = () => {
          const existing = request.result as DispatchQueueEntry | undefined;
          if (existing) {
            if (!sameRequest(existing, entry)) {
              tx.abort();
              reject(new Error("La identidad local ya pertenece a otra solicitud."));
              return;
            }
            saved = existing;
          } else objectStore.add(entry);
        };
        request.onerror = () => tx.abort();
        tx.oncomplete = () => resolve(saved);
        tx.onerror = () => reject(tx.error ?? new Error("No se pudo guardar la cola local."));
        tx.onabort = () => reject(tx.error ?? new Error("No se pudo guardar la cola local."));
      });
    },
    async setStatus(owner, episode, operation, status) {
      const db = await open();
      await new Promise<void>((resolve, reject) => {
        const tx = db.transaction("operations", "readwrite");
        const store = tx.objectStore("operations");
        const request = store.get([owner, episode, operation]);
        request.onsuccess = () => {
          if (request.result) store.put({ ...request.result, status });
        };
        request.onerror = () => tx.abort();
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error ?? new Error("No se pudo actualizar la cola local."));
        tx.onabort = () => reject(tx.error ?? new Error("No se pudo actualizar la cola local."));
      });
    },
    async remove(owner, episode, operation) {
      await transaction("readwrite", (store) => store.delete([owner, episode, operation]));
    },
  };
}
