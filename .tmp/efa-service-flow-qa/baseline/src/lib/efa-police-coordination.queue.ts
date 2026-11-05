export type PoliceQueueStatus =
  | "pending"
  | "uncertain"
  | "paused-conflict"
  | "paused-permission"
  | "paused-mismatch"
  | "confirmed-cleanup-failed";
export type PoliceQueueKind = "create" | "update" | "dispatches" | "event-create" | "event-update";
export type PoliceQueueEntry = {
  ownerUserId: string;
  episodeId: string;
  entityId: string;
  operationId: string;
  kind: PoliceQueueKind;
  payload: Readonly<Record<string, unknown>>;
  status: PoliceQueueStatus;
  createdAt: string;
};
export interface PoliceQueueStore {
  get(
    owner: string,
    episode: string,
    entity: string,
    operation: string,
  ): Promise<PoliceQueueEntry | null>;
  list(owner: string, episode: string): Promise<PoliceQueueEntry[]>;
  put(entry: PoliceQueueEntry): Promise<PoliceQueueEntry>;
  setStatus(
    owner: string,
    episode: string,
    entity: string,
    operation: string,
    status: PoliceQueueStatus,
  ): Promise<void>;
  remove(owner: string, episode: string, entity: string, operation: string): Promise<void>;
}
export type PoliceQueueResult<Result> =
  | { status: "confirmed"; result: Result }
  | { status: "confirmed-cleanup-failed"; result: Result }
  | { status: "cleaned" }
  | { status: "paused"; queueStatus: PoliceQueueStatus; error: string }
  | { status: "stored"; error: string }
  | { status: "cancelled" };

const terminalByStore = new WeakMap<PoliceQueueStore, Map<string, unknown>>();
const key = (
  entry: Pick<PoliceQueueEntry, "ownerUserId" | "episodeId" | "entityId" | "operationId">,
) => JSON.stringify([entry.ownerUserId, entry.episodeId, entry.entityId, entry.operationId]);
const sameRequest = (left: PoliceQueueEntry, right: PoliceQueueEntry) =>
  key(left) === key(right) &&
  left.kind === right.kind &&
  JSON.stringify(left.payload) === JSON.stringify(right.payload);

export async function persistPoliceOperation(store: PoliceQueueStore, entry: PoliceQueueEntry) {
  const frozen = Object.freeze({ ...entry, payload: Object.freeze({ ...entry.payload }) });
  const stored = await store.put(frozen);
  if (!sameRequest(stored, frozen))
    throw new Error("La identidad local ya pertenece a otra solicitud.");
  return stored;
}

export function policeQueueErrorStatus(error: unknown): PoliceQueueStatus {
  const message = error instanceof Error ? error.message : String(error);
  if (/cambi[oó]|conflict|version|stale/i.test(message)) return "paused-conflict";
  if (/EFA|permiso|administraci[oó]n|edit/i.test(message)) return "paused-permission";
  return "uncertain";
}

export async function dispatchPoliceOperation<Result extends { operation: { id: string } }>(
  store: PoliceQueueStore,
  owner: string,
  episode: string,
  entity: string,
  operation: string,
  send: (entry: PoliceQueueEntry) => Promise<Result>,
  canDispatch: (entry: PoliceQueueEntry) => boolean | Promise<boolean>,
): Promise<PoliceQueueResult<Result>> {
  const storageKey = JSON.stringify([owner, episode, entity, operation]);
  const terminals = terminalByStore.get(store) ?? new Map<string, unknown>();
  terminalByStore.set(store, terminals);
  const terminal = terminals?.get(storageKey) as
    { kind: "confirmed"; result: Result } | { kind: "mismatch" } | undefined;
  if (terminal?.kind === "mismatch")
    return {
      status: "paused",
      queueStatus: "paused-mismatch",
      error: "El recibo no coincide; la operación queda pausada.",
    };
  if (terminal?.kind === "confirmed") {
    try {
      await store.remove(owner, episode, entity, operation);
      terminals?.delete(storageKey);
      return { status: "cleaned" };
    } catch {
      return { status: "confirmed-cleanup-failed", result: terminal.result };
    }
  }
  let entry: PoliceQueueEntry | null;
  try {
    entry = await store.get(owner, episode, entity, operation);
  } catch {
    return { status: "stored", error: "No se pudo leer la operación local; no se enviará." };
  }
  if (!entry) return { status: "stored", error: "No se encontró la operación local." };
  if (entry.status === "confirmed-cleanup-failed") {
    try {
      await store.remove(owner, episode, entity, operation);
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
    await store.setStatus(owner, episode, entity, operation, "paused-permission").catch(() => {});
    return { status: "cancelled" };
  }
  let result: Result;
  try {
    result = await send(entry);
  } catch (error) {
    const status = policeQueueErrorStatus(error);
    await store.setStatus(owner, episode, entity, operation, status).catch(() => {});
    return {
      status: "paused",
      queueStatus: status,
      error: error instanceof Error ? error.message : "No se pudo confirmar la operación.",
    };
  }
  if (result.operation.id !== operation) {
    terminals.set(storageKey, { kind: "mismatch" });
    await store.setStatus(owner, episode, entity, operation, "paused-mismatch").catch(() => {});
    return {
      status: "paused",
      queueStatus: "paused-mismatch",
      error: "El recibo no coincide; la operación queda pausada.",
    };
  }
  terminals.set(storageKey, { kind: "confirmed", result });
  try {
    await store.remove(owner, episode, entity, operation);
    return { status: "confirmed", result };
  } catch {
    await store
      .setStatus(owner, episode, entity, operation, "confirmed-cleanup-failed")
      .catch(() => {});
    return { status: "confirmed-cleanup-failed", result };
  }
}

export function createPoliceQueueStore(): PoliceQueueStore {
  const database = () =>
    new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open("efa-police-coordination-queue", 1);
      request.onupgradeneeded = () => {
        const store = request.result.createObjectStore("operations", {
          keyPath: ["ownerUserId", "episodeId", "entityId", "operationId"],
        });
        store.createIndex("ownerEpisode", ["ownerUserId", "episodeId"]);
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
    get: (owner, episode, entity, operation) =>
      run("readonly", (store) => store.get([owner, episode, entity, operation])),
    list: async (owner, episode) =>
      (
        await run<PoliceQueueEntry[]>("readonly", (store) =>
          store.index("ownerEpisode").getAll([owner, episode]),
        )
      ).sort((a, b) => a.createdAt.localeCompare(b.createdAt)),
    put: async (entry) => {
      const db = await database();
      return new Promise<PoliceQueueEntry>((resolve, reject) => {
        const tx = db.transaction("operations", "readwrite");
        const objectStore = tx.objectStore("operations");
        const request = objectStore.get([
          entry.ownerUserId,
          entry.episodeId,
          entry.entityId,
          entry.operationId,
        ]);
        let result = entry;
        request.onsuccess = () => {
          const prior = request.result as PoliceQueueEntry | undefined;
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
    setStatus: async (owner, episode, entity, operation, status) => {
      const db = await database();
      await new Promise<void>((resolve, reject) => {
        const tx = db.transaction("operations", "readwrite");
        const objectStore = tx.objectStore("operations");
        const request = objectStore.get([owner, episode, entity, operation]);
        request.onsuccess = () => {
          if (request.result) objectStore.put({ ...request.result, status });
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
    remove: async (owner, episode, entity, operation) => {
      await run("readwrite", (store) => store.delete([owner, episode, entity, operation]));
    },
  };
}
