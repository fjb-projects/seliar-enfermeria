import { describe, expect, it, vi } from "vitest";
import { canEditQueuedDispatch } from "./efa-dispatches.client";
import {
  dispatchQueueErrorStatus,
  dispatchStoredOperation,
  persistDispatchOperation,
  type DispatchQueueEntry,
  type DispatchQueueStore,
} from "./efa-dispatches.queue";

function makeStore() {
  const entries = new Map<string, DispatchQueueEntry>();
  const key = (owner: string, episode: string, operation: string) =>
    JSON.stringify([owner, episode, operation]);
  const store: DispatchQueueStore = {
    async get(owner, episode, operation) {
      return entries.get(key(owner, episode, operation)) ?? null;
    },
    async list(owner, episode) {
      return [...entries.values()].filter(
        (entry) => entry.ownerUserId === owner && entry.episodeId === episode,
      );
    },
    async put(entry) {
      const id = key(entry.ownerUserId, entry.episodeId, entry.operationId);
      const current = entries.get(id);
      if (current && JSON.stringify(current.payload) !== JSON.stringify(entry.payload))
        throw new Error("key-conflict");
      if (!current) entries.set(id, structuredClone(entry));
      return structuredClone(entries.get(id)!);
    },
    async setStatus(owner, episode, operation, status) {
      const id = key(owner, episode, operation);
      const current = entries.get(id);
      if (current) entries.set(id, { ...current, status });
    },
    async remove(owner, episode, operation) {
      entries.delete(key(owner, episode, operation));
    },
  };
  return { store, entries };
}

function entry(
  operationId: string,
  ownerUserId = "owner",
  episodeId = "episode",
): DispatchQueueEntry {
  return {
    ownerUserId,
    episodeId,
    operationId,
    kind: "create",
    payload: {
      clientCreationKey: operationId,
      episodeId,
      baseId: "base",
      institutionId: "institution-active",
      communicationId: null,
      priority: null,
      t0At: null,
      t0Status: "not_observed",
      t1At: null,
      t1Status: "not_observed",
      t2At: null,
      t2Status: "not_observed",
      t3At: null,
      t3Status: "not_observed",
      t4At: null,
      t4Status: "not_observed",
      t5At: null,
      t5Status: "not_observed",
      t6At: null,
      t6Status: "not_observed",
      firstResponseRole: null,
      firstResponseAt: null,
      note: null,
      result: null,
      resultClarification: null,
    },
    status: "pending",
    createdAt: "2026-10-06T10:00:00.000Z",
  };
}

describe("EFA dispatch queue", () => {
  it("persists frozen exact operations independently by owner and episode", async () => {
    const { store } = makeStore();
    const first = entry("op-a");
    await persistDispatchOperation(store, first);
    expect((await store.get("owner", "episode", "op-a"))?.payload).toMatchObject({
      institutionId: "institution-active",
    });
    const second = entry("op-b");
    await persistDispatchOperation(store, second);
    await persistDispatchOperation(store, entry("op-a", "other-owner"));
    expect(await store.list("owner", "episode")).toHaveLength(2);
    expect(first.payload).toEqual(expect.objectContaining({ clientCreationKey: "op-a" }));
    await expect(
      persistDispatchOperation(store, {
        ...first,
        payload: { ...first.payload, baseId: "changed" },
      }),
    ).rejects.toThrow();
  });

  it("requires a matching server receipt and never resends after confirmed cleanup fails", async () => {
    const { store, entries } = makeStore();
    await persistDispatchOperation(store, entry("op-a"));
    const send = async () => ({ operation: { id: "op-a" } });
    const confirmed = await dispatchStoredOperation(store, "owner", "episode", "op-a", send);
    expect(confirmed.status).toBe("confirmed");
    expect(await store.get("owner", "episode", "op-a")).toBeNull();

    await persistDispatchOperation(store, entry("op-b"));
    const mismatch = await dispatchStoredOperation(store, "owner", "episode", "op-b", async () => ({
      operation: { id: "wrong" },
    }));
    expect(mismatch).toMatchObject({ status: "paused", queueStatus: "paused-mismatch" });
    expect(entries.size).toBe(1);
  });

  it("keeps a confirmed operation fenced while local cleanup is retried", async () => {
    const { store } = makeStore();
    await persistDispatchOperation(store, entry("op-cleanup"));
    let failRemove = true;
    const remove = store.remove.bind(store);
    store.remove = async (...args) => {
      if (failRemove) throw new Error("storage unavailable");
      await remove(...args);
    };
    const send = vi.fn(async () => ({ operation: { id: "op-cleanup" } }));
    const first = await dispatchStoredOperation(store, "owner", "episode", "op-cleanup", send);
    expect(first.status).toBe("confirmed-cleanup-failed");
    failRemove = false;
    const second = await dispatchStoredOperation(store, "owner", "episode", "op-cleanup", send);
    expect(second.status).toBe("cleaned");
    expect(send).toHaveBeenCalledTimes(1);
  });

  it("awaits latest entity permission before sending a queued operation", async () => {
    const { store } = makeStore();
    const update = {
      ...entry("op-locked"),
      kind: "update" as const,
      payload: { dispatchId: "dispatch", operationId: "op-locked", expectedVersion: 1 },
    } as DispatchQueueEntry;
    await persistDispatchOperation(store, update);
    const send = vi.fn(async () => ({ operation: { id: "op-locked" } }));
    const outcome = await dispatchStoredOperation(
      store,
      "owner",
      "episode",
      "op-locked",
      send,
      async (stored) => canEditQueuedDispatch(stored, true, true, false),
    );
    expect(outcome.status).toBe("cancelled");
    expect(send).not.toHaveBeenCalled();
  });

  it("classifies version and permission rejections for explicit resolution", () => {
    expect(dispatchQueueErrorStatus(new Error("version conflict"))).toBe("paused-conflict");
    expect(dispatchQueueErrorStatus(new Error("Se requiere acceso EFA vigente."))).toBe(
      "paused-permission",
    );
    expect(dispatchQueueErrorStatus(new Error("connection reset"))).toBe("uncertain");
  });
});
