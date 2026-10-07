export type CommunicationPriority = "red" | "yellow" | "green";
export type CommunicationDirection = "incoming" | "outgoing";

export type CommunicationPayload =
  | {
      clientCreationKey: string;
      episodeId: string;
      direction: CommunicationDirection;
      startedAt: string | null;
      endedAt: string | null;
      priority: CommunicationPriority | null;
    }
  | {
      communicationId: string;
      expectedVersion: number;
      operationId: string;
      direction: CommunicationDirection;
      startedAt: string | null;
      endedAt: string | null;
      priority: CommunicationPriority | null;
    }
  | {
      communicationId: string;
      expectedVersion: number;
      operationId: string;
      priority: CommunicationPriority;
    };

export type CommunicationQueueKind = "create" | "update" | "finalize";
export type CommunicationQueueStatus =
  | "pending"
  | "uncertain"
  | "paused-conflict"
  | "paused-permission"
  | "paused-mismatch"
  | "confirmed-cleanup-failed";

export type CommunicationQueueEntry = {
  ownerUserId: string;
  episodeId: string;
  operationId: string;
  kind: CommunicationQueueKind;
  payload: Readonly<CommunicationPayload>;
  status: CommunicationQueueStatus;
  createdAt: string;
};

export interface CommunicationQueueStore {
  get(
    ownerUserId: string,
    episodeId: string,
    operationId: string,
  ): Promise<CommunicationQueueEntry | null>;
  list(ownerUserId: string, episodeId: string): Promise<CommunicationQueueEntry[]>;
  put(entry: CommunicationQueueEntry): Promise<CommunicationQueueEntry>;
  setStatus(
    ownerUserId: string,
    episodeId: string,
    operationId: string,
    status: CommunicationQueueStatus,
  ): Promise<void>;
  remove(ownerUserId: string, episodeId: string, operationId: string): Promise<void>;
}

export type CommunicationQueueResult<Result> =
  | { status: "confirmed"; result: Result }
  | { status: "confirmed-cleanup-failed"; result: Result }
  | { status: "cleaned" }
  | { status: "paused"; queueStatus: CommunicationQueueStatus; error: string }
  | { status: "stored"; error: string }
  | { status: "cancelled" };

type TerminalReceipt<Result> = { kind: "confirmed"; result: Result } | { kind: "mismatch" };
const terminalReceipts = new WeakMap<
  CommunicationQueueStore,
  Map<string, TerminalReceipt<unknown>>
>();
const operationKey = (owner: string, episode: string, operation: string) =>
  JSON.stringify([owner, episode, operation]);

const sameRequest = (left: CommunicationQueueEntry, right: CommunicationQueueEntry) =>
  left.ownerUserId === right.ownerUserId &&
  left.episodeId === right.episodeId &&
  left.operationId === right.operationId &&
  left.kind === right.kind &&
  JSON.stringify(left.payload) === JSON.stringify(right.payload);

export async function persistCommunicationOperation(
  store: CommunicationQueueStore,
  entry: CommunicationQueueEntry,
): Promise<CommunicationQueueEntry> {
  const frozen = Object.freeze({ ...entry, payload: Object.freeze({ ...entry.payload }) });
  const saved = await store.put(frozen);
  if (!sameRequest(saved, frozen)) {
    throw new Error("La identidad local ya pertenece a otra solicitud.");
  }
  return saved;
}

export async function removeSelectedCommunicationConflict(
  store: CommunicationQueueStore,
  entry: CommunicationQueueEntry,
  isStillSelected: () => boolean,
): Promise<boolean> {
  if (entry.status !== "paused-conflict" || !isStillSelected()) return false;
  await store.remove(entry.ownerUserId, entry.episodeId, entry.operationId);
  return true;
}

export function communicationQueueErrorStatus(error: unknown): CommunicationQueueStatus {
  const message = error instanceof Error ? error.message : String(error);
  if (/cambi[oó]|version-conflict|stale/i.test(message)) return "paused-conflict";
  if (/EFA|inactiva|permiso|administraci[oó]n/i.test(message)) return "paused-permission";
  return "uncertain";
}

export async function dispatchStoredCommunicationOperation<
  Result extends { operation: { id: string } },
>(
  store: CommunicationQueueStore,
  ownerUserId: string,
  episodeId: string,
  operationId: string,
  send: (entry: CommunicationQueueEntry) => Promise<Result>,
  canDispatch: () => boolean = () => true,
): Promise<CommunicationQueueResult<Result>> {
  const key = operationKey(ownerUserId, episodeId, operationId);
  const terminal = terminalReceipts.get(store)?.get(key) as TerminalReceipt<Result> | undefined;
  if (terminal?.kind === "mismatch") {
    return {
      status: "paused",
      queueStatus: "paused-mismatch",
      error: "El recibo no coincide; la operación queda pausada.",
    };
  }
  if (terminal?.kind === "confirmed") {
    try {
      await store.remove(ownerUserId, episodeId, operationId);
      terminalReceipts.get(store)?.delete(key);
      return { status: "cleaned" };
    } catch {
      return { status: "confirmed-cleanup-failed", result: terminal.result };
    }
  }
  const current = await store.get(ownerUserId, episodeId, operationId);
  if (!current) return { status: "stored", error: "No se encontró la operación local." };
  if (current.status === "confirmed-cleanup-failed") {
    try {
      await store.remove(ownerUserId, episodeId, operationId);
      return { status: "cleaned" };
    } catch {
      return {
        status: "stored",
        error: "El servidor ya confirmó la llamada; no se repetirá el envío.",
      };
    }
  }
  if (current.status !== "pending" && current.status !== "uncertain") {
    return {
      status: "paused",
      queueStatus: current.status,
      error: "La operación requiere una acción explícita.",
    };
  }
  if (!canDispatch()) return { status: "cancelled" };

  let result: Result;
  try {
    result = await send(current);
  } catch (error) {
    const status = communicationQueueErrorStatus(error);
    try {
      await store.setStatus(ownerUserId, episodeId, operationId, status);
    } catch {
      // The unchanged frozen entry remains retryable after an uncertain transport failure.
    }
    return {
      status: "paused",
      queueStatus: status,
      error: error instanceof Error ? error.message : "No se pudo confirmar la llamada.",
    };
  }
  if (result.operation.id !== operationId) {
    const receipts = terminalReceipts.get(store) ?? new Map();
    receipts.set(key, { kind: "mismatch" });
    terminalReceipts.set(store, receipts);
    try {
      await store.setStatus(ownerUserId, episodeId, operationId, "paused-mismatch");
    } catch {
      // Keep the in-memory terminal fence even when IndexedDB cannot persist it.
    }
    return {
      status: "paused",
      queueStatus: "paused-mismatch",
      error: "El recibo no coincide; la operación queda pausada.",
    };
  }
  const receipts = terminalReceipts.get(store) ?? new Map();
  receipts.set(key, { kind: "confirmed", result });
  terminalReceipts.set(store, receipts);
  try {
    await store.remove(ownerUserId, episodeId, operationId);
    receipts.delete(key);
    return { status: "confirmed", result };
  } catch {
    try {
      await store.setStatus(ownerUserId, episodeId, operationId, "confirmed-cleanup-failed");
    } catch {
      // The in-memory receipt fence prevents a second send for this live store.
    }
    return { status: "confirmed-cleanup-failed", result };
  }
}

export function createIndexedDbCommunicationQueueStore(
  databaseName = "efa-communications-queue",
): CommunicationQueueStore {
  let database: Promise<IDBDatabase> | null = null;
  const open = () => {
    if (!database) {
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
          reject(request.error ?? new Error("No se pudo abrir el almacenamiento local."));
      });
    }
    return database;
  };
  const read = async (ownerUserId: string, episodeId: string, operationId: string) => {
    const db = await open();
    return new Promise<CommunicationQueueEntry | null>((resolve, reject) => {
      const request = db
        .transaction("operations", "readonly")
        .objectStore("operations")
        .get([ownerUserId, episodeId, operationId]);
      request.onsuccess = () =>
        resolve((request.result as CommunicationQueueEntry | undefined) ?? null);
      request.onerror = () =>
        reject(request.error ?? new Error("No se pudo leer la operación local."));
    });
  };

  return {
    get: read,
    async list(ownerUserId, episodeId) {
      const db = await open();
      return new Promise((resolve, reject) => {
        const request = db
          .transaction("operations", "readonly")
          .objectStore("operations")
          .index("ownerEpisode")
          .getAll(IDBKeyRange.only([ownerUserId, episodeId]));
        request.onsuccess = () => resolve(request.result as CommunicationQueueEntry[]);
        request.onerror = () =>
          reject(request.error ?? new Error("No se pudo leer la cola local."));
      });
    },
    async put(entry) {
      const db = await open();
      return new Promise((resolve, reject) => {
        const transaction = db.transaction("operations", "readwrite");
        const objectStore = transaction.objectStore("operations");
        const key = [entry.ownerUserId, entry.episodeId, entry.operationId];
        const getRequest = objectStore.get(key);
        let result: CommunicationQueueEntry = entry;
        getRequest.onsuccess = () => {
          const existing = getRequest.result as CommunicationQueueEntry | undefined;
          if (existing) {
            result = existing;
            if (!sameRequest(existing, entry)) transaction.abort();
          } else {
            objectStore.add(entry);
          }
        };
        getRequest.onerror = () => transaction.abort();
        transaction.oncomplete = () => resolve(result);
        transaction.onerror = () =>
          reject(transaction.error ?? new Error("No se pudo guardar la operación local."));
        transaction.onabort = () =>
          reject(new Error("La operación local ya existe con otro contenido."));
      });
    },
    async setStatus(ownerUserId, episodeId, operationId, status) {
      const db = await open();
      await new Promise<void>((resolve, reject) => {
        const transaction = db.transaction("operations", "readwrite");
        const objectStore = transaction.objectStore("operations");
        const key = [ownerUserId, episodeId, operationId];
        const request = objectStore.get(key);
        request.onsuccess = () => {
          if (request.result) objectStore.put({ ...request.result, status });
        };
        request.onerror = () => transaction.abort();
        transaction.oncomplete = () => resolve();
        transaction.onerror = () =>
          reject(transaction.error ?? new Error("No se pudo actualizar la cola."));
      });
    },
    async remove(ownerUserId, episodeId, operationId) {
      const db = await open();
      await new Promise<void>((resolve, reject) => {
        const transaction = db.transaction("operations", "readwrite");
        transaction.objectStore("operations").delete([ownerUserId, episodeId, operationId]);
        transaction.oncomplete = () => resolve();
        transaction.onerror = () =>
          reject(transaction.error ?? new Error("No se pudo limpiar la cola."));
      });
    },
  };
}
