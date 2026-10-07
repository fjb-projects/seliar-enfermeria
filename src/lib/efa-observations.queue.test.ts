import { describe, expect, it, vi } from "vitest";
import {
  dispatchObservationOperation,
  persistObservationOperation,
  type ObservationQueueEntry,
  type ObservationQueueStore,
} from "./efa-observations.queue";

function memoryStore(failRemove = false): ObservationQueueStore & {
  failRemove(value: boolean): void;
} {
  const entries = new Map<string, ObservationQueueEntry>();
  let removeFails = failRemove;
  const key = (owner: string, context: string, entity: string, operation: string) =>
    JSON.stringify([owner, context, entity, operation]);
  return {
    get: async (owner, context, entity, operation) =>
      entries.get(key(owner, context, entity, operation)) ?? null,
    list: async (owner, context) =>
      [...entries.values()].filter(
        (entry) => entry.actorUserId === owner && entry.contextKey === context,
      ),
    put: async (entry) => {
      const id = key(entry.actorUserId, entry.contextKey, entry.entityId, entry.operationId);
      const saved = entries.get(id) ?? entry;
      entries.set(id, saved);
      return saved;
    },
    setStatus: async (owner, context, entity, operation, status) => {
      const id = key(owner, context, entity, operation);
      const entry = entries.get(id);
      if (entry) entries.set(id, { ...entry, status });
    },
    remove: async (owner, context, entity, operation) => {
      if (removeFails) throw new Error("storage unavailable");
      entries.delete(key(owner, context, entity, operation));
    },
    failRemove(value) {
      removeFails = value;
    },
  };
}

const entry: ObservationQueueEntry = {
  actorUserId: "actor",
  guardId: "guard-1",
  contextKey: "episode:episode-1",
  entityId: "create:key-1",
  operationId: "operation-1",
  kind: "create",
  payload: { clientCreationKey: "key-1", comment: "private" },
  status: "pending",
  createdAt: "2026-10-07T00:00:00.000Z",
};

describe("observation queue", () => {
  it("persists a frozen request before sending and requires its exact receipt", async () => {
    const store = memoryStore();
    const order: string[] = [];
    const originalPut = store.put;
    store.put = async (request) => {
      order.push("persist");
      return originalPut(request);
    };
    await persistObservationOperation(store, entry);
    const send = vi.fn(async () => {
      order.push("send");
      return { operation: { id: entry.operationId }, observation: { id: "observation-1" } };
    });
    const outcome = await dispatchObservationOperation(
      store,
      entry.actorUserId,
      entry.contextKey,
      entry.entityId,
      entry.operationId,
      send,
      () => true,
    );
    expect(order).toEqual(["persist", "send"]);
    expect(outcome.status).toBe("confirmed");
    expect(send).toHaveBeenCalledOnce();
  });

  it("keeps operations isolated by actor and typed context", async () => {
    const store = memoryStore();
    await persistObservationOperation(store, entry);
    await persistObservationOperation(store, {
      ...entry,
      actorUserId: "admin-actor",
      contextKey: "episode:episode-2",
    });
    expect(await store.list("actor", "episode:episode-1")).toHaveLength(1);
    expect(await store.list("admin-actor", "episode:episode-2")).toHaveLength(1);
    expect(await store.list("actor", "episode:episode-2")).toHaveLength(0);
  });

  it("cleans a confirmed operation later without resending it", async () => {
    const store = memoryStore(true);
    await persistObservationOperation(store, entry);
    const send = vi.fn(async () => ({ operation: { id: entry.operationId } }));
    const first = await dispatchObservationOperation(
      store,
      entry.actorUserId,
      entry.contextKey,
      entry.entityId,
      entry.operationId,
      send,
      () => true,
    );
    store.failRemove(false);
    const second = await dispatchObservationOperation(
      store,
      entry.actorUserId,
      entry.contextKey,
      entry.entityId,
      entry.operationId,
      send,
      () => true,
    );
    expect(first.status).toBe("confirmed-cleanup-failed");
    expect(second.status).toBe("cleaned");
    expect(send).toHaveBeenCalledOnce();
  });

  it("pauses a mismatched receipt and never dispatches that identity again", async () => {
    const store = memoryStore();
    await persistObservationOperation(store, entry);
    const send = vi.fn(async () => ({ operation: { id: "different-operation" } }));
    const first = await dispatchObservationOperation(
      store,
      entry.actorUserId,
      entry.contextKey,
      entry.entityId,
      entry.operationId,
      send,
      () => true,
    );
    const second = await dispatchObservationOperation(
      store,
      entry.actorUserId,
      entry.contextKey,
      entry.entityId,
      entry.operationId,
      send,
      () => true,
    );
    expect(first.status).toBe("paused");
    expect(second.status).toBe("paused");
    expect(send).toHaveBeenCalledOnce();
  });

  it("rejects reuse of a stored operation key with a different frozen payload", async () => {
    const store = memoryStore();
    await persistObservationOperation(store, entry);
    await expect(
      persistObservationOperation(store, {
        ...entry,
        payload: { ...entry.payload, comment: "changed" },
      }),
    ).rejects.toThrow("ya pertenece a otra solicitud");
  });
});
