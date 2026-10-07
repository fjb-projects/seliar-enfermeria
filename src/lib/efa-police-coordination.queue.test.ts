import { describe, expect, it, vi } from "vitest";
import {
  dispatchPoliceOperation,
  persistPoliceOperation,
  type PoliceQueueEntry,
  type PoliceQueueStore,
} from "./efa-police-coordination.queue";

function makeStore(failRemove = false): PoliceQueueStore & { failRemove(value: boolean): void } {
  const items = new Map<string, PoliceQueueEntry>();
  let removeFails = failRemove;
  const key = (o: string, e: string, id: string, op: string) => [o, e, id, op].join(":");
  return {
    get: async (o, e, id, op) => items.get(key(o, e, id, op)) ?? null,
    list: async (o, e) =>
      [...items.values()].filter((item) => item.ownerUserId === o && item.episodeId === e),
    put: async (entry) => {
      const id = key(entry.ownerUserId, entry.episodeId, entry.entityId, entry.operationId);
      const saved = items.get(id) ?? entry;
      items.set(id, saved);
      return saved;
    },
    setStatus: async (o, e, id, op, status) => {
      const entry = items.get(key(o, e, id, op));
      if (entry) items.set(key(o, e, id, op), { ...entry, status });
    },
    remove: async (o, e, id, op) => {
      if (removeFails) throw new Error("storage unavailable");
      items.delete(key(o, e, id, op));
    },
    failRemove: (value) => {
      removeFails = value;
    },
  };
}
const entry: PoliceQueueEntry = {
  ownerUserId: "owner",
  episodeId: "episode",
  entityId: "coord",
  operationId: "op",
  kind: "event-create",
  payload: { note: "private" },
  status: "pending",
  createdAt: "2026-10-07T00:00:00.000Z",
};

describe("police coordination queue", () => {
  it("stores a frozen operation before dispatch and requires the exact receipt", async () => {
    const store = makeStore();
    await persistPoliceOperation(store, entry);
    const send = vi.fn(async () => ({ operation: { id: "other" } }));
    const result = await dispatchPoliceOperation(
      store,
      "owner",
      "episode",
      "coord",
      "op",
      send,
      () => true,
    );
    expect(send).toHaveBeenCalledOnce();
    expect(result).toMatchObject({ status: "paused", queueStatus: "paused-mismatch" });
    expect((await store.get("owner", "episode", "coord", "op"))?.payload).toEqual({
      note: "private",
    });
  });

  it("does not send when fresh permission is denied", async () => {
    const store = makeStore();
    await persistPoliceOperation(store, entry);
    const send = vi.fn();
    const result = await dispatchPoliceOperation(
      store,
      "owner",
      "episode",
      "coord",
      "op",
      send,
      () => false,
    );
    expect(result.status).toBe("cancelled");
    expect(send).not.toHaveBeenCalled();
  });

  it("keeps a confirmed receipt terminal when local cleanup fails", async () => {
    const store = makeStore(true);
    await persistPoliceOperation(store, entry);
    const send = vi.fn(async () => ({ operation: { id: "op" }, coordination: { id: "coord" } }));
    const first = await dispatchPoliceOperation(
      store,
      "owner",
      "episode",
      "coord",
      "op",
      send,
      () => true,
    );
    const second = await dispatchPoliceOperation(
      store,
      "owner",
      "episode",
      "coord",
      "op",
      send,
      () => true,
    );
    expect(first.status).toBe("confirmed-cleanup-failed");
    expect(second.status).toBe("confirmed-cleanup-failed");
    expect(send).toHaveBeenCalledOnce();
  });

  it("cleans a confirmed operation later without sending it again", async () => {
    const store = makeStore(true);
    await persistPoliceOperation(store, entry);
    const send = vi.fn(async () => ({ operation: { id: "op" }, coordination: { id: "coord" } }));
    const first = await dispatchPoliceOperation(
      store,
      "owner",
      "episode",
      "coord",
      "op",
      send,
      () => true,
    );
    store.failRemove(false);
    const second = await dispatchPoliceOperation(
      store,
      "owner",
      "episode",
      "coord",
      "op",
      send,
      () => true,
    );
    expect(first.status).toBe("confirmed-cleanup-failed");
    expect(second.status).toBe("cleaned");
    expect(send).toHaveBeenCalledOnce();
    expect(await store.get("owner", "episode", "coord", "op")).toBeNull();
  });

  it("rejects reuse of an operation identity with changed payload", async () => {
    const store = makeStore();
    await persistPoliceOperation(store, entry);
    await expect(
      persistPoliceOperation(store, { ...entry, payload: { note: "changed" } }),
    ).rejects.toThrow("identidad");
  });
});
