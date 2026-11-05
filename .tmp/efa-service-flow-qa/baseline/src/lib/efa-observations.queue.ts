export type ObservationQueueStatus =
  | "pending"
  | "uncertain"
  | "paused-conflict"
  | "paused-permission"
  | "paused-mismatch"
  | "confirmed-cleanup-failed";
export type ObservationQueueKind = "create" | "update";
export type ObservationQueueEntry = {
  actorUserId: string;
  guardId: string;
  contextKey: string;
  entityId: string;
  operationId: string;
  kind: ObservationQueueKind;
  payload: Readonly<Record<string, unknown>>;
  status: ObservationQueueStatus;
  createdAt: string;
};
export interface ObservationQueueStore {
  get(
    actor: string,
    context: string,
    entity: string,
    operation: string,
  ): Promise<ObservationQueueEntry | null>;
  list(actor: string, context: string): Promise<ObservationQueueEntry[]>;
  put(entry: ObservationQueueEntry): Promise<ObservationQueueEntry>;
  setStatus(
    actor: string,
    context: string,
    entity: string,
    operation: string,
    status: ObservationQueueStatus,
  ): Promise<void>;
  remove(actor: string, context: string, entity: string, operation: string): Promise<void>;
}
export type ObservationQueueOutcome<Result> =
  | { status: "confirmed"; result: Result }
  | { status: "confirmed-cleanup-failed"; result: Result }
  | { status: "cleaned" }
  | { status: "paused"; queueStatus: ObservationQueueStatus; error: string }
  | { status: "stored"; error: string }
  | { status: "cancelled" };

const terminalByStore = new WeakMap<ObservationQueueStore, Map<string, unknown>>();
const key = (
  entry: Pick<ObservationQueueEntry, "actorUserId" | "contextKey" | "entityId" | "operationId">,
) => JSON.stringify([entry.actorUserId, entry.contextKey, entry.entityId, entry.operationId]);
const sameRequest = (left: ObservationQueueEntry, right: ObservationQueueEntry) =>
  key(left) === key(right) &&
  left.kind === right.kind &&
  JSON.stringify(left.payload) === JSON.stringify(right.payload);

export async function persistObservationOperation(
  store: ObservationQueueStore,
  entry: ObservationQueueEntry,
) {
  const frozen = Object.freeze({ ...entry, payload: Object.freeze({ ...entry.payload }) });
  const stored = await store.put(frozen);
  if (!sameRequest(stored, frozen))
    throw new Error("La identidad local ya pertenece a otra solicitud.");
  return stored;
}

function errorStatus(error: unknown): ObservationQueueStatus {
  const message = error instanceof Error ? error.message : String(error);
  if (/cambi[oó]|conflict|version|stale/i.test(message)) return "paused-conflict";
  if (/EFA|permiso|administraci[oó]n|edit/i.test(message)) return "paused-permission";
  return "uncertain";
}

export async function dispatchObservationOperation<Result extends { operation: { id: string } }>(
  store: ObservationQueueStore,
  actor: string,
  context: string,
  entity: string,
  operation: string,
  send: (entry: ObservationQueueEntry) => Promise<Result>,
  canDispatch: (entry: ObservationQueueEntry) => boolean | Promise<boolean>,
): Promise<ObservationQueueOutcome<Result>> {
  const storageKey = JSON.stringify([actor, context, entity, operation]);
  const terminals = terminalByStore.get(store) ?? new Map<string, unknown>();
  terminalByStore.set(store, terminals);
  const terminal = terminals.get(storageKey) as
    { kind: "confirmed"; result: Result } | { kind: "mismatch" } | undefined;
  if (terminal?.kind === "mismatch")
    return {
      status: "paused",
      queueStatus: "paused-mismatch",
      error: "El recibo no coincide; la operación queda pausada.",
    };
  if (terminal?.kind === "confirmed") {
    try {
      await store.remove(actor, context, entity, operation);
      terminals.delete(storageKey);
      return { status: "cleaned" };
    } catch {
      return { status: "confirmed-cleanup-failed", result: terminal.result };
    }
  }
  let entry: ObservationQueueEntry | null;
  try {
    entry = await store.get(actor, context, entity, operation);
  } catch {
    return { status: "stored", error: "No se pudo leer la operación local; no se enviará." };
  }
  if (!entry) return { status: "stored", error: "No se encontró la operación local." };
  if (entry.status === "confirmed-cleanup-failed") {
    try {
      await store.remove(actor, context, entity, operation);
      return { status: "cleaned" };
    } catch {
      return {
        status: "stored",
        error: "El servidor confirmó la operación; solo se reintentará la limpieza local.",
      };
    }
  }
  if (entry.status !== "pending" && entry.status !== "uncertain")
    return {
      status: "paused",
      queueStatus: entry.status,
      error: "La operación requiere resolución explícita.",
    };
  let allowed = false;
  try {
    allowed = await canDispatch(entry);
  } catch {
    /* fail closed */
  }
  if (!allowed) {
    await store.setStatus(actor, context, entity, operation, "paused-permission").catch(() => {});
    return { status: "cancelled" };
  }
  let result: Result;
  try {
    result = await send(entry);
  } catch (error) {
    const status = errorStatus(error);
    await store.setStatus(actor, context, entity, operation, status).catch(() => {});
    return {
      status: "paused",
      queueStatus: status,
      error: error instanceof Error ? error.message : "No se pudo confirmar la operación.",
    };
  }
  if (result.operation.id !== operation) {
    terminals.set(storageKey, { kind: "mismatch" });
    await store.setStatus(actor, context, entity, operation, "paused-mismatch").catch(() => {});
    return {
      status: "paused",
      queueStatus: "paused-mismatch",
      error: "El recibo no coincide; la operación queda pausada.",
    };
  }
  terminals.set(storageKey, { kind: "confirmed", result });
  try {
    await store.remove(actor, context, entity, operation);
    return { status: "confirmed", result };
  } catch {
    await store
      .setStatus(actor, context, entity, operation, "confirmed-cleanup-failed")
      .catch(() => {});
    return { status: "confirmed-cleanup-failed", result };
  }
}

export function createObservationQueueStore(): ObservationQueueStore {
  const database = () =>
    new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open("efa-observations-queue", 1);
      request.onupgradeneeded = () => {
        const store = request.result.createObjectStore("operations", {
          keyPath: ["actorUserId", "contextKey", "entityId", "operationId"],
        });
        store.createIndex("actorContext", ["actorUserId", "contextKey"]);
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  const run = async <T>(
    mode: IDBTransactionMode,
    work: (store: IDBObjectStore) => IDBRequest<T>,
  ) => {
    const db = await database();
    return new Promise<T>((resolve, reject) => {
      const tx = db.transaction("operations", mode);
      const request = work(tx.objectStore("operations"));
      let result: T;
      request.onsuccess = () => {
        result = request.result;
      };
      request.onerror = () => {
        db.close();
        reject(request.error);
      };
      tx.oncomplete = () => {
        db.close();
        resolve(result!);
      };
      tx.onerror = () => {
        db.close();
        reject(tx.error);
      };
    });
  };
  return {
    get: (actor, context, entity, operation) =>
      run("readonly", (store) => store.get([actor, context, entity, operation])),
    list: async (actor, context) =>
      (
        await run<ObservationQueueEntry[]>("readonly", (store) =>
          store.index("actorContext").getAll([actor, context]),
        )
      ).sort((left, right) => left.createdAt.localeCompare(right.createdAt)),
    put: async (entry) => {
      const db = await database();
      return new Promise<ObservationQueueEntry>((resolve, reject) => {
        const tx = db.transaction("operations", "readwrite");
        const objectStore = tx.objectStore("operations");
        const request = objectStore.get([
          entry.actorUserId,
          entry.contextKey,
          entry.entityId,
          entry.operationId,
        ]);
        let result = entry;
        request.onsuccess = () => {
          const prior = request.result as ObservationQueueEntry | undefined;
          if (prior) result = prior;
          else objectStore.add(entry);
        };
        tx.oncomplete = () => {
          db.close();
          resolve(result);
        };
        tx.onerror = () => {
          db.close();
          reject(tx.error);
        };
      });
    },
    setStatus: async (actor, context, entity, operation, status) => {
      const db = await database();
      await new Promise<void>((resolve, reject) => {
        const tx = db.transaction("operations", "readwrite");
        const store = tx.objectStore("operations");
        const request = store.get([actor, context, entity, operation]);
        request.onsuccess = () => {
          if (request.result) store.put({ ...request.result, status });
        };
        tx.oncomplete = () => {
          db.close();
          resolve();
        };
        tx.onerror = () => {
          db.close();
          reject(tx.error);
        };
      });
    },
    remove: async (actor, context, entity, operation) =>
      run("readwrite", (store) => store.delete([actor, context, entity, operation])),
  };
}
