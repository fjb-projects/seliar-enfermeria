import { describe, expect, it, vi } from "vitest";
import {
  dispatchStoredCommunicationOperation,
  persistCommunicationOperation,
  removeSelectedCommunicationConflict,
  type CommunicationQueueEntry,
  type CommunicationQueueStore,
} from "./efa-communications.queue";

function memoryStore(): CommunicationQueueStore & {
  entries: CommunicationQueueEntry[];
  failPut: boolean;
  failRemove: boolean;
  failSetStatus: boolean;
} {
  const entries: CommunicationQueueEntry[] = [];
  const store = {
    entries,
    failPut: false,
    failRemove: false,
    failSetStatus: false,
    async get(owner: string, episode: string, operation: string) {
      return (
        entries.find(
          (entry) =>
            entry.ownerUserId === owner &&
            entry.episodeId === episode &&
            entry.operationId === operation,
        ) ?? null
      );
    },
    async list(owner: string, episode: string) {
      return entries.filter((entry) => entry.ownerUserId === owner && entry.episodeId === episode);
    },
    async put(entry: CommunicationQueueEntry) {
      if (this.failPut) throw new Error("quota");
      const existing = await this.get(entry.ownerUserId, entry.episodeId, entry.operationId);
      if (existing) return existing;
      entries.push(entry);
      return entry;
    },
    async setStatus(
      owner: string,
      episode: string,
      operation: string,
      status: CommunicationQueueEntry["status"],
    ) {
      if (this.failSetStatus) throw new Error("quota");
      const index = entries.findIndex(
        (entry) =>
          entry.ownerUserId === owner &&
          entry.episodeId === episode &&
          entry.operationId === operation,
      );
      if (index >= 0) entries[index] = { ...entries[index]!, status };
    },
    async remove(owner: string, episode: string, operation: string) {
      if (this.failRemove) throw new Error("quota");
      const index = entries.findIndex(
        (entry) =>
          entry.ownerUserId === owner &&
          entry.episodeId === episode &&
          entry.operationId === operation,
      );
      if (index >= 0) entries.splice(index, 1);
    },
  };
  return store;
}

function entry(overrides: Partial<CommunicationQueueEntry> = {}): CommunicationQueueEntry {
  return {
    ownerUserId: "owner-a",
    episodeId: "episode-a",
    operationId: "operation-a",
    kind: "create",
    payload: {
      clientCreationKey: "operation-a",
      episodeId: "episode-a",
      direction: "incoming",
      startedAt: null,
      endedAt: null,
      priority: null,
    },
    status: "pending",
    createdAt: "2026-10-06T12:00:00.000Z",
    ...overrides,
  };
}

describe("EFA communication IndexedDB queue contract", () => {
  it("isolates operations by account and episode and freezes the exact payload", async () => {
    const store = memoryStore();
    const frozen = await persistCommunicationOperation(store, entry());
    await persistCommunicationOperation(store, entry({ ownerUserId: "owner-b" }));
    await persistCommunicationOperation(store, entry({ episodeId: "episode-b" }));
    expect(await store.list("owner-a", "episode-a")).toEqual([frozen]);
    await expect(
      persistCommunicationOperation(
        store,
        entry({ payload: { ...entry().payload, direction: "outgoing" } }),
      ),
    ).rejects.toThrow(/otra solicitud/i);
  });

  it("persists before dispatch and removes only a matching receipt", async () => {
    const store = memoryStore();
    const frozen = await persistCommunicationOperation(store, entry());
    const send = vi.fn(async (saved: CommunicationQueueEntry) => {
      expect(await store.get(saved.ownerUserId, saved.episodeId, saved.operationId)).toEqual(saved);
      return { operation: { id: saved.operationId } };
    });
    await expect(
      dispatchStoredCommunicationOperation(store, "owner-a", "episode-a", "operation-a", send),
    ).resolves.toMatchObject({ status: "confirmed" });
    expect(send).toHaveBeenCalledWith(frozen);
    expect(await store.list("owner-a", "episode-a")).toEqual([]);

    await persistCommunicationOperation(store, entry({ operationId: "operation-b" }));
    const mismatch = await dispatchStoredCommunicationOperation(
      store,
      "owner-a",
      "episode-a",
      "operation-b",
      async () => ({ operation: { id: "other" } }),
    );
    expect(mismatch).toMatchObject({ status: "paused", queueStatus: "paused-mismatch" });
    expect(await store.get("owner-a", "episode-a", "operation-b")).not.toBeNull();
  });

  it("blocks dispatch after local storage failure and re-persists the same operation identity", async () => {
    const store = memoryStore();
    const frozen = entry();
    const send = vi.fn(async (saved: CommunicationQueueEntry) => ({
      operation: { id: saved.operationId },
    }));
    store.failPut = true;
    await expect(persistCommunicationOperation(store, frozen)).rejects.toThrow(/quota/i);
    expect(send).not.toHaveBeenCalled();

    store.failPut = false;
    const persisted = await persistCommunicationOperation(store, frozen);
    expect(persisted.operationId).toBe(frozen.operationId);
    await expect(
      dispatchStoredCommunicationOperation(store, "owner-a", "episode-a", "operation-a", send),
    ).resolves.toMatchObject({ status: "confirmed" });
    expect(send).toHaveBeenCalledWith(persisted);
  });

  it("pauses uncertain delivery for same-operation manual retry and does not resend after confirmed cleanup failure", async () => {
    const store = memoryStore();
    await persistCommunicationOperation(store, entry());
    const firstSend = vi.fn(async () => {
      throw new Error("network response lost");
    });
    await expect(
      dispatchStoredCommunicationOperation(store, "owner-a", "episode-a", "operation-a", firstSend),
    ).resolves.toMatchObject({ queueStatus: "uncertain" });
    expect((await store.get("owner-a", "episode-a", "operation-a"))?.status).toBe("uncertain");
    const retried = await dispatchStoredCommunicationOperation(
      store,
      "owner-a",
      "episode-a",
      "operation-a",
      async (saved) => ({ operation: { id: saved.operationId } }),
    );
    expect(retried.status).toBe("confirmed");

    await persistCommunicationOperation(store, entry({ operationId: "operation-c" }));
    store.failRemove = true;
    const send = vi.fn(async (saved: CommunicationQueueEntry) => ({
      operation: { id: saved.operationId },
    }));
    await expect(
      dispatchStoredCommunicationOperation(store, "owner-a", "episode-a", "operation-c", send),
    ).resolves.toMatchObject({ status: "confirmed-cleanup-failed" });
    store.failRemove = false;
    await expect(
      dispatchStoredCommunicationOperation(store, "owner-a", "episode-a", "operation-c", send),
    ).resolves.toEqual({ status: "cleaned" });
    expect(send).toHaveBeenCalledTimes(1);
  });

  it("does not automatically dispatch permission or conflict pauses", async () => {
    const store = memoryStore();
    await persistCommunicationOperation(store, entry({ status: "paused-conflict" }));
    const send = vi.fn();
    await expect(
      dispatchStoredCommunicationOperation(store, "owner-a", "episode-a", "operation-a", send),
    ).resolves.toMatchObject({ status: "paused", queueStatus: "paused-conflict" });
    expect(send).not.toHaveBeenCalled();
  });

  it("does not send after an awaited queue read when the caller context was revoked", async () => {
    const store = memoryStore();
    await persistCommunicationOperation(store, entry());
    let allowed = true;
    const originalGet = store.get.bind(store);
    store.get = async (...args) => {
      const found = await originalGet(...args);
      allowed = false;
      return found;
    };
    const send = vi.fn(async (saved: CommunicationQueueEntry) => ({
      operation: { id: saved.operationId },
    }));
    const result = await dispatchStoredCommunicationOperation(
      store,
      "owner-a",
      "episode-a",
      "operation-a",
      send,
      () => allowed,
    );
    expect(result.status).toBe("cancelled");
    expect(send).not.toHaveBeenCalled();
    expect((await store.get("owner-a", "episode-a", "operation-a"))?.status).toBe("pending");
  });

  it("keeps known receipts terminal when both removal and status persistence fail", async () => {
    const store = memoryStore();
    await persistCommunicationOperation(store, entry());
    store.failRemove = true;
    store.failSetStatus = true;
    const send = vi.fn(async (saved: CommunicationQueueEntry) => ({
      operation: { id: saved.operationId },
    }));
    const first = await dispatchStoredCommunicationOperation(
      store,
      "owner-a",
      "episode-a",
      "operation-a",
      send,
    );
    const second = await dispatchStoredCommunicationOperation(
      store,
      "owner-a",
      "episode-a",
      "operation-a",
      send,
    );
    expect(first.status).toBe("confirmed-cleanup-failed");
    expect(second.status).toBe("confirmed-cleanup-failed");
    expect(send).toHaveBeenCalledTimes(1);
  });

  it("keeps mismatched receipts terminal when pause persistence fails", async () => {
    const store = memoryStore();
    await persistCommunicationOperation(store, entry());
    store.failSetStatus = true;
    const send = vi.fn(async () => ({ operation: { id: "other" } }));
    const first = await dispatchStoredCommunicationOperation(
      store,
      "owner-a",
      "episode-a",
      "operation-a",
      send,
    );
    const second = await dispatchStoredCommunicationOperation(
      store,
      "owner-a",
      "episode-a",
      "operation-a",
      send,
    );
    expect(first).toMatchObject({ status: "paused", queueStatus: "paused-mismatch" });
    expect(second).toMatchObject({ status: "paused", queueStatus: "paused-mismatch" });
    expect(send).toHaveBeenCalledTimes(1);
  });

  it("resolves only the explicitly selected conflict and preserves other operations", async () => {
    const store = memoryStore();
    const conflictA = entry({ operationId: "operation-a", status: "paused-conflict" });
    const uncertainB = entry({ operationId: "operation-b", status: "uncertain" });
    await persistCommunicationOperation(store, conflictA);
    await persistCommunicationOperation(store, uncertainB);
    let selectedOperation = "operation-b";
    const staleA = await removeSelectedCommunicationConflict(
      store,
      conflictA,
      () => selectedOperation === "operation-a",
    );
    expect(staleA).toBe(false);
    expect(await store.list("owner-a", "episode-a")).toHaveLength(2);

    selectedOperation = "operation-a";
    await expect(
      removeSelectedCommunicationConflict(
        store,
        conflictA,
        () => selectedOperation === "operation-a",
      ),
    ).resolves.toBe(true);
    expect(await store.list("owner-a", "episode-a")).toEqual([uncertainB]);
  });
});
