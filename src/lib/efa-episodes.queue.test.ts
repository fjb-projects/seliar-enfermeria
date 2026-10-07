import { describe, expect, it, vi } from "vitest";
import {
  createEpisodeQueueController,
  createEpisodeQueueOwnerFence,
  isSelectedEpisodeQueueOperation,
  runEpisodeQueueOwnerAction,
  restoreQueuedEpisode,
  runWithEpisodeQueueBusy,
  selectEpisodeQueueEntry,
  shouldSyncEpisodeOperationToEditor,
  setEpisodeEventAtForCurrentOwner,
  type EpisodeQueueEntry,
  type EpisodeQueueStore,
} from "./efa-episodes.queue";
import { dispatchEpisodeCloseWithFreshWriter } from "./efa-episodes.client";

function entry(
  ownerUserId: string,
  operationId: string,
  overrides: Partial<EpisodeQueueEntry> = {},
): EpisodeQueueEntry {
  return {
    ownerUserId,
    operationId,
    kind: "create",
    payload: {
      clientCreationKey: operationId,
      guardId: "guard-1",
      eventAt: "2026-10-06T09:30:00.000Z",
      motive: "Traslado",
      address: "Calle privada 12",
      interventionNumber: "00017",
    },
    status: "pending",
    createdAt: "2026-10-06T09:30:00.000Z",
    ...overrides,
  };
}

function closeEntry(operationId = "close-op", overrides: Partial<EpisodeQueueEntry> = {}) {
  return entry("owner-a", operationId, {
    kind: "close",
    payload: { episodeId: "episode-1", expectedVersion: 4, operationId },
    ...overrides,
  });
}

function closeReceipt(operationId: string, overrides: Record<string, unknown> = {}) {
  return {
    episode: {
      id: "episode-1",
      state: "closed",
      closedAt: "2026-10-07T10:00:00.000Z",
      version: 5,
    },
    operation: {
      id: operationId,
      action: "closed",
      appliedVersion: 5,
      changed: true,
      replayed: false,
    },
    ...overrides,
  };
}

function fakeStore(initial: EpisodeQueueEntry[] = []) {
  const records = new Map<string, EpisodeQueueEntry>();
  const key = (owner: string, operationId: string) => `${owner}:${operationId}`;
  for (const item of initial) records.set(key(item.ownerUserId, item.operationId), item);
  let failPut = false;
  let failDelete = false;
  let failStatus = false;
  const store: EpisodeQueueStore = {
    async list(ownerUserId) {
      return [...records.values()].filter((item) => item.ownerUserId === ownerUserId);
    },
    async get(ownerUserId, operationId) {
      return records.get(key(ownerUserId, operationId)) ?? null;
    },
    async put(item) {
      if (failPut) throw new Error("storage quota unavailable");
      const storageKey = key(item.ownerUserId, item.operationId);
      const prior = records.get(storageKey);
      if (prior && JSON.stringify(prior.payload) !== JSON.stringify(item.payload)) {
        throw new Error("Operation payload is immutable");
      }
      if (!prior) records.set(storageKey, item);
      return prior ?? item;
    },
    async setStatus(ownerUserId, operationId, status) {
      if (failStatus) throw new Error("storage status write unavailable");
      const storageKey = key(ownerUserId, operationId);
      const prior = records.get(storageKey);
      if (prior) records.set(storageKey, { ...prior, status });
    },
    async delete(ownerUserId, operationId) {
      if (failDelete) throw new Error("storage cleanup unavailable");
      records.delete(key(ownerUserId, operationId));
    },
  };
  return {
    store,
    records,
    failPut(value = true) {
      failPut = value;
    },
    failDelete(value = true) {
      failDelete = value;
    },
    failStatus(value = true) {
      failStatus = value;
    },
  };
}

describe("EFA episode browser queue controller", () => {
  it("persists the exact payload before dispatch and never replaces the same key", async () => {
    const db = fakeStore();
    const events: string[] = [];
    const payload = entry("owner-a", "op-1");
    const controller = createEpisodeQueueController(db.store, async (queued) => {
      events.push(`dispatch:${queued.operationId}`);
      throw new Error("network timeout");
    });
    const originalPut = db.store.put.bind(db.store);
    vi.spyOn(db.store, "put").mockImplementation(async (item) => {
      events.push("persist");
      return originalPut(item);
    });

    expect((await controller.enqueue(payload)).status).toBe("uncertain");
    expect(events).toEqual(["persist", "dispatch:op-1"]);
    await expect(
      controller.enqueue({ ...payload, payload: { ...payload.payload, address: "changed" } }),
    ).rejects.toThrow(/immutable/i);
  });

  it("restores a queued close without converting it into an edit or create payload", async () => {
    const closeEntry: EpisodeQueueEntry = {
      ownerUserId: "owner-a",
      operationId: "close-1",
      kind: "close",
      payload: { episodeId: "episode-1", expectedVersion: 4, operationId: "close-1" },
      status: "pending",
      createdAt: "2026-10-06T09:30:00.000Z",
    };
    const restored = restoreQueuedEpisode(closeEntry);
    expect(restored.operation).toEqual({
      kind: "close",
      operationId: "close-1",
      payload: closeEntry.payload,
    });
    expect(restored.form).toBeNull();

    const db = fakeStore();
    db.failPut();
    const events: string[] = [];
    const dispatch = vi.fn(async (queued: EpisodeQueueEntry) => {
      events.push(`dispatch:${queued.operationId}`);
      return closeReceipt(queued.operationId);
    });
    const storePut = db.store.put.bind(db.store);
    vi.spyOn(db.store, "put").mockImplementation(async (queued) => {
      events.push(`persist:${queued.operationId}`);
      return storePut(queued);
    });
    const controller = createEpisodeQueueController(db.store, dispatch);
    await expect(controller.enqueue(closeEntry)).rejects.toThrow(/quota/i);
    expect(dispatch).not.toHaveBeenCalled();
    db.failPut(false);
    expect((await controller.enqueue(closeEntry)).status).toBe("confirmed");
    expect(dispatch).toHaveBeenCalledWith(closeEntry);
    expect(events).toEqual(["persist:close-1", "persist:close-1", "dispatch:close-1"]);
  });

  it("pauses malformed close receipts and never dispatches them again", async () => {
    const db = fakeStore([closeEntry("close-bad")]);
    const dispatch = vi.fn(async () =>
      closeReceipt("close-bad", {
        operation: {
          id: "close-bad",
          action: "updated",
          appliedVersion: 5,
          changed: true,
          replayed: false,
        },
      }),
    );
    const controller = createEpisodeQueueController(db.store, dispatch);
    const close = closeEntry("close-bad");

    const first = await controller.retry(close);
    expect(first.status).toBe("mismatched");
    expect(await db.store.get("owner-a", "close-bad")).toMatchObject({
      status: "paused-mismatch",
    });
    expect((await controller.retry(close)).status).toBe("mismatched");
    expect(await controller.reconcile("owner-a")).toEqual([]);
    expect(dispatch).toHaveBeenCalledTimes(1);
  });

  it("rejects close receipts with mismatched entity, version, timestamp, or flags", async () => {
    const invalidReceipts = [
      closeReceipt("close-invalid", {
        episode: { id: "other", state: "closed", version: 5, closedAt: "2026-10-07T10:00:00.000Z" },
      }),
      closeReceipt("close-invalid", {
        episode: { id: "episode-1", state: "closed", version: 5, closedAt: null },
      }),
      closeReceipt("close-invalid", {
        operation: {
          id: "close-invalid",
          action: "closed",
          appliedVersion: 6,
          changed: true,
          replayed: false,
        },
      }),
      closeReceipt("close-invalid", {
        operation: {
          id: "close-invalid",
          action: "closed",
          appliedVersion: 5,
          changed: "yes",
          replayed: false,
        },
      }),
    ];

    for (const [index, receipt] of invalidReceipts.entries()) {
      const operationId = `close-invalid-${index}`;
      const close = closeEntry(operationId);
      const db = fakeStore([close]);
      const dispatch = vi.fn(async () => ({
        ...receipt,
        operation: { ...(receipt.operation as Record<string, unknown>), id: operationId },
      }));
      const controller = createEpisodeQueueController(db.store, dispatch);
      expect((await controller.retry(close)).status).toBe("mismatched");
      expect(db.records.get(`owner-a:${operationId}`)?.status).toBe("paused-mismatch");
    }
  });

  it("accepts a no-change close replay with a newer current entity and original applied version", async () => {
    const close = closeEntry("close-replay");
    const db = fakeStore();
    const dispatch = vi.fn(async () =>
      closeReceipt("close-replay", {
        episode: {
          id: "episode-1",
          state: "closed",
          closedAt: "2026-10-07T10:00:00.000Z",
          version: 9,
        },
        operation: {
          id: "close-replay",
          action: "closed",
          appliedVersion: 5,
          changed: false,
          replayed: true,
        },
      }),
    );
    const controller = createEpisodeQueueController(db.store, dispatch);

    const outcome = await controller.enqueue(close);
    expect(outcome.status).toBe("confirmed");
    expect(outcome).toMatchObject({
      result: { operation: { appliedVersion: 5, replayed: true }, episode: { version: 9 } },
    });
  });

  it("keeps an in-memory fence when a mismatched receipt cannot be persisted", async () => {
    const close = closeEntry("close-unstored-mismatch");
    const db = fakeStore([close]);
    db.failStatus();
    const dispatch = vi.fn(async () =>
      closeReceipt("close-unstored-mismatch", {
        operation: {
          id: "close-unstored-mismatch",
          action: "updated",
          appliedVersion: 5,
          changed: true,
          replayed: false,
        },
      }),
    );
    const controller = createEpisodeQueueController(db.store, dispatch);

    expect((await controller.retry(close)).status).toBe("pause-storage-failed");
    db.failStatus(false);
    expect((await controller.retry(close)).status).toBe("pause-storage-failed");
    expect(await controller.reconcile("owner-a")).toEqual([]);
    expect(dispatch).toHaveBeenCalledTimes(1);
  });

  it("cleans a confirmed close without redispatching after cleanup recovers", async () => {
    const db = fakeStore([closeEntry("close-cleanup")]);
    db.failDelete();
    const stateAtDelete: string[] = [];
    const deleteEntry = db.store.delete.bind(db.store);
    vi.spyOn(db.store, "delete").mockImplementation(async (owner, operationId) => {
      stateAtDelete.push(db.records.get(`${owner}:${operationId}`)?.status ?? "missing");
      return deleteEntry(owner, operationId);
    });
    const dispatch = vi.fn(async (queued: EpisodeQueueEntry) => closeReceipt(queued.operationId));
    const controller = createEpisodeQueueController(db.store, dispatch);
    const close = closeEntry("close-cleanup");

    expect((await controller.retry(close)).status).toBe("confirmed-cleanup-failed");
    expect(stateAtDelete).toEqual(["confirmed-cleanup"]);
    expect(await db.store.get("owner-a", "close-cleanup")).toMatchObject({
      status: "confirmed-cleanup",
    });
    db.failDelete(false);
    const afterReloadDispatch = vi.fn(async (queued: EpisodeQueueEntry) =>
      closeReceipt(queued.operationId),
    );
    const afterReload = createEpisodeQueueController(db.store, afterReloadDispatch);
    const reconciled = await afterReload.reconcile("owner-a");
    expect(reconciled).toMatchObject([
      { status: "cleaned", entry: { operationId: "close-cleanup" } },
    ]);
    expect(dispatch).toHaveBeenCalledTimes(1);
    expect(afterReloadDispatch).not.toHaveBeenCalled();
    expect(await db.store.get("owner-a", "close-cleanup")).toBeNull();
  });

  it("retains an in-memory confirmed receipt if the terminal marker cannot be written", async () => {
    const db = fakeStore([closeEntry("close-status-failure")]);
    db.failDelete();
    db.failStatus();
    const dispatch = vi.fn(async (queued: EpisodeQueueEntry) => closeReceipt(queued.operationId));
    const controller = createEpisodeQueueController(db.store, dispatch);
    const close = closeEntry("close-status-failure");

    expect((await controller.retry(close)).status).toBe("confirmed-cleanup-failed");
    db.failStatus(false);
    db.failDelete(false);
    expect((await controller.retry(close)).status).toBe("confirmed");
    expect(dispatch).toHaveBeenCalledTimes(1);
    expect(await db.store.get("owner-a", "close-status-failure")).toBeNull();
  });

  it("rechecks the queued actor after storage yields and blocks a revoked close", async () => {
    const close = closeEntry("close-revoked");
    const db = fakeStore([close]);
    const storedGet = db.store.get.bind(db.store);
    let releaseGet!: (value: EpisodeQueueEntry | null) => void;
    vi.spyOn(db.store, "get").mockImplementation(
      () => new Promise((resolve) => (releaseGet = resolve)),
    );
    const currentSession = {
      user: { id: "owner-a" },
      roles: ["efa"],
      expiresAt: "2026-10-07T13:00:00.000Z",
    };
    const closeApi = vi.fn(async () => closeReceipt("close-revoked"));
    const controller = createEpisodeQueueController(db.store, async (queued) =>
      dispatchEpisodeCloseWithFreshWriter(
        queued.payload as { episodeId: string; expectedVersion: number; operationId: string },
        queued.ownerUserId,
        async () => currentSession,
        closeApi,
        Date.parse("2026-10-07T12:00:00.000Z"),
      ),
    );

    const retry = controller.retry(close);
    currentSession.roles = [];
    releaseGet(await storedGet("owner-a", "close-revoked"));
    expect((await retry).status).toBe("paused-permission");
    expect(closeApi).not.toHaveBeenCalled();
    expect(db.records.get("owner-a:close-revoked")).toMatchObject({
      status: "paused-permission",
    });
  });

  it("does not dispatch if local persistence fails and retains entered operation data", async () => {
    const db = fakeStore();
    db.failPut();
    const dispatch = vi.fn();
    const controller = createEpisodeQueueController(db.store, dispatch);

    await expect(controller.enqueue(entry("owner-a", "op-1"))).rejects.toThrow(/quota/i);
    expect(dispatch).not.toHaveBeenCalled();
  });

  it("re-persists a failed submission with the same operation ID and exact payload", async () => {
    const db = fakeStore();
    db.failPut();
    const operation = entry("owner-a", "op-recover");
    const dispatch = vi.fn(async (queued: EpisodeQueueEntry) => ({
      operation: { id: queued.operationId },
    }));
    const controller = createEpisodeQueueController(db.store, dispatch);

    await expect(controller.enqueue(operation)).rejects.toThrow(/quota/i);
    expect(dispatch).not.toHaveBeenCalled();
    db.failPut(false);
    expect((await controller.enqueue(operation)).status).toBe("confirmed");
    expect(dispatch).toHaveBeenCalledTimes(1);
    expect(dispatch.mock.calls[0]![0]).toMatchObject({
      operationId: "op-recover",
      payload: operation.payload,
    });
  });

  it("deletes only the matching owner's operation after a matching server receipt", async () => {
    const db = fakeStore([entry("owner-a", "op-1"), entry("owner-b", "op-1")]);
    const controller = createEpisodeQueueController(db.store, async (queued) => ({
      operation: { id: queued.operationId },
    }));

    const outcome = await controller.retry((await db.store.get("owner-a", "op-1"))!);
    expect(outcome.status).toBe("confirmed");
    await expect(db.store.list("owner-a")).resolves.toEqual([]);
    await expect(db.store.list("owner-b")).resolves.toHaveLength(1);
  });

  it("keeps mismatched receipts and confirmed writes whose local cleanup fails", async () => {
    const mismatchDb = fakeStore([entry("owner-a", "op-1")]);
    const mismatch = createEpisodeQueueController(mismatchDb.store, async () => ({
      operation: { id: "different-op" },
    }));
    expect((await mismatch.retry((await mismatchDb.store.get("owner-a", "op-1"))!)).status).toBe(
      "mismatched",
    );
    await expect(mismatchDb.store.list("owner-a")).resolves.toHaveLength(1);

    const cleanupDb = fakeStore([entry("owner-a", "op-2")]);
    cleanupDb.failDelete();
    const cleanup = createEpisodeQueueController(cleanupDb.store, async (queued) => ({
      operation: { id: queued.operationId },
    }));
    expect((await cleanup.retry((await cleanupDb.store.get("owner-a", "op-2"))!)).status).toBe(
      "confirmed-cleanup-failed",
    );
    await expect(cleanupDb.store.list("owner-a")).resolves.toHaveLength(1);
  });

  it("pauses conflicts and permissions and retries uncertain operations only with the same identity", async () => {
    const db = fakeStore([entry("owner-a", "op-conflict"), entry("owner-a", "op-permission")]);
    const dispatch = vi
      .fn()
      .mockRejectedValueOnce(new Error("episode-version-conflict"))
      .mockRejectedValueOnce(new Error("Se requiere acceso EFA vigente."));
    const controller = createEpisodeQueueController(db.store, dispatch);

    expect((await controller.retry((await db.store.get("owner-a", "op-conflict"))!)).status).toBe(
      "paused-conflict",
    );
    expect((await controller.retry((await db.store.get("owner-a", "op-permission"))!)).status).toBe(
      "paused-permission",
    );
    await expect(db.store.get("owner-a", "op-conflict")).resolves.toMatchObject({
      status: "paused-conflict",
    });
    await expect(db.store.get("owner-a", "op-permission")).resolves.toMatchObject({
      status: "paused-permission",
    });

    const uncertainDb = fakeStore([entry("owner-a", "op-uncertain")]);
    const uncertainDispatch = vi
      .fn()
      .mockRejectedValueOnce(new Error("network timeout"))
      .mockResolvedValueOnce({ operation: { id: "op-uncertain" } });
    const uncertain = createEpisodeQueueController(uncertainDb.store, uncertainDispatch);
    const original = (await uncertainDb.store.get("owner-a", "op-uncertain"))!;
    expect((await uncertain.retry(original)).status).toBe("uncertain");
    expect((await uncertain.retry(original)).status).toBe("confirmed");
    expect(uncertainDispatch.mock.calls.map(([queued]) => queued)).toEqual([original, original]);
  });

  it("reconciles only one owner's eligible pending entries per call", async () => {
    const db = fakeStore([
      entry("owner-a", "op-a"),
      entry("owner-b", "op-b"),
      entry("owner-a", "op-paused", { status: "paused-permission" }),
    ]);
    const dispatch = vi.fn(async (queued: EpisodeQueueEntry) => ({
      operation: { id: queued.operationId },
    }));
    const controller = createEpisodeQueueController(db.store, dispatch);

    const outcomes = await controller.reconcile("owner-a");
    expect(outcomes).toHaveLength(1);
    expect(dispatch).toHaveBeenCalledTimes(1);
    expect(dispatch.mock.calls[0]![0].ownerUserId).toBe("owner-a");
    expect(dispatch.mock.calls[0]![0].operationId).toBe("op-a");
  });

  it("allows at most one concurrent dispatch for a pending operation", async () => {
    const db = fakeStore([entry("owner-a", "op-race")]);
    let resolveDispatch!: (result: { operation: { id: string } }) => void;
    const dispatch = vi.fn(
      () => new Promise<{ operation: { id: string } }>((resolve) => (resolveDispatch = resolve)),
    );
    const controller = createEpisodeQueueController(db.store, dispatch);
    const queued = (await db.store.get("owner-a", "op-race"))!;

    const first = controller.retry(queued);
    await vi.waitFor(() => expect(dispatch).toHaveBeenCalledTimes(1));
    const second = await controller.retry(queued);
    expect(second.status).toBe("already-in-flight");
    expect(dispatch).toHaveBeenCalledTimes(1);
    resolveDispatch({ operation: { id: "op-race" } });
    expect((await first).status).toBe("confirmed");
  });

  it("releases busy state when a manual retry cannot read its stored entry", async () => {
    const db = fakeStore([entry("owner-a", "op-read-failure")]);
    const failingStore: EpisodeQueueStore = {
      ...db.store,
      async get() {
        throw new Error("local read unavailable");
      },
    };
    const controller = createEpisodeQueueController(failingStore, async (queued) => ({
      operation: { id: queued.operationId },
    }));
    const fence = createEpisodeQueueOwnerFence();
    const ticket = fence.enter("owner-a");
    let busy = false;

    await expect(
      runWithEpisodeQueueBusy(
        ticket,
        fence.isCurrent,
        (value) => (busy = value),
        () => controller.retry(entry("owner-a", "op-read-failure")),
      ),
    ).rejects.toThrow(/read unavailable/i);
    expect(busy).toBe(false);
  });

  it("restores a remaining operation after another entry confirms and the next is uncertain", async () => {
    const second = entry("owner-a", "op-second", {
      kind: "update",
      payload: {
        episodeId: "episode-2",
        expectedVersion: 4,
        operationId: "op-second",
        eventAt: "2026-10-06T10:10:00.000Z",
        motive: "Second draft",
        address: null,
        interventionNumber: null,
      },
    });
    const db = fakeStore([entry("owner-a", "op-first"), second]);
    const controller = createEpisodeQueueController(db.store, async (queued) => {
      if (queued.operationId === "op-second") throw new Error("network timeout");
      return { operation: { id: queued.operationId } };
    });

    const outcomes = await controller.reconcile("owner-a");
    expect(outcomes.map((outcome) => outcome.status)).toEqual(["confirmed", "uncertain"]);
    const remaining = await db.store.list("owner-a");
    expect(remaining).toHaveLength(1);
    const selected = selectEpisodeQueueEntry(remaining, "owner-a", "op-second");
    expect(selected).toEqual(second);
    expect(shouldSyncEpisodeOperationToEditor("op-first", null, null)).toBe(false);
    expect(shouldSyncEpisodeOperationToEditor("op-second", null, selected!.operationId)).toBe(true);
    expect(restoreQueuedEpisode(selected!).operation).toEqual({
      kind: "update",
      operationId: "op-second",
      payload: second.payload,
    });
  });

  it("resolves only the explicitly selected conflict and preserves another uncertain operation", async () => {
    const conflictA = entry("owner-a", "op-a", {
      kind: "update",
      status: "paused-conflict",
      payload: {
        episodeId: "episode-a",
        expectedVersion: 2,
        operationId: "op-a",
        eventAt: "2026-10-06T09:30:00.000Z",
        motive: "Conflict A",
        address: null,
        interventionNumber: null,
      },
    });
    const uncertainB = entry("owner-a", "op-b", {
      kind: "update",
      payload: {
        episodeId: "episode-b",
        expectedVersion: 7,
        operationId: "op-b",
        eventAt: "2026-10-06T10:30:00.000Z",
        motive: "Uncertain B",
        address: "Private B address",
        interventionNumber: "B-17",
      },
    });
    const db = fakeStore([conflictA, uncertainB]);
    const controller = createEpisodeQueueController(db.store, async (queued) => ({
      operation: { id: queued.operationId },
    }));
    const targetA = { ownerUserId: "owner-a", operationId: "op-a", episodeId: "episode-a" };

    expect(isSelectedEpisodeQueueOperation(targetA, "owner-a", "op-b", "op-b")).toBe(false);
    const entriesBeforeSelection = await db.store.list("owner-a");
    expect(entriesBeforeSelection).toEqual([conflictA, uncertainB]);
    expect(
      restoreQueuedEpisode(selectEpisodeQueueEntry(entriesBeforeSelection, "owner-a", "op-b")!)
        .form,
    ).toMatchObject({ motive: "Uncertain B", address: "Private B address" });

    expect(isSelectedEpisodeQueueOperation(targetA, "owner-a", "op-a", "op-a")).toBe(true);
    await controller.removeResolved(targetA.ownerUserId, targetA.operationId);
    await expect(db.store.list("owner-a")).resolves.toEqual([uncertainB]);
    expect(restoreQueuedEpisode(uncertainB)).toMatchObject({
      operation: { operationId: "op-b", payload: uncertainB.payload },
      form: { motive: "Uncertain B", address: "Private B address" },
    });
    expect(isSelectedEpisodeQueueOperation(targetA, "owner-b", "op-a", "op-a")).toBe(false);
  });

  it("restores a pending update without changing its operation identity or expected version", () => {
    const queued = entry("owner-a", "op-update", {
      kind: "update",
      payload: {
        episodeId: "episode-1",
        expectedVersion: 7,
        operationId: "op-update",
        eventAt: "2026-10-06T09:30:00.000Z",
        motive: "Private event",
        address: "Private address",
        interventionNumber: "00018",
      },
    });
    const restored = restoreQueuedEpisode(queued);

    expect(restored.operation).toEqual({
      kind: "update",
      operationId: "op-update",
      payload: queued.payload,
    });
    expect(restored.operation.payload).toMatchObject({
      expectedVersion: 7,
      address: "Private address",
    });
    expect(restored.form?.motive).toBe("Private event");
  });

  it("fences late asynchronous state callbacks after the active account changes", async () => {
    const fence = createEpisodeQueueOwnerFence();
    const accountA = fence.enter("owner-a");
    let resolve!: () => void;
    const load = new Promise<void>((done) => (resolve = done));
    let exposedOwnerData = "";
    const pendingRead = load.then(() =>
      fence.commitIfCurrent(accountA, () => {
        exposedOwnerData = "owner-a address";
      }),
    );
    fence.enter("owner-b");
    resolve();
    await pendingRead;
    expect(exposedOwnerData).toBe("");
  });

  it("does not commit an owner-scoped async read after its ticket becomes stale", async () => {
    const fence = createEpisodeQueueOwnerFence();
    const ticket = fence.enter("owner-a");
    let resolveRead!: (value: string) => void;
    const read = new Promise<string>((resolve) => (resolveRead = resolve));
    let committed = "";
    const work = runEpisodeQueueOwnerAction(
      ticket,
      fence.isCurrent,
      () => read,
      (value) => (committed = value),
    );
    fence.enter("owner-b");
    resolveRead("owner-a queue");

    expect(await work).toBe(false);
    expect(committed).toBe("");
  });

  it("updates only the event time after helper loading and fences a changed owner", async () => {
    const fence = createEpisodeQueueOwnerFence();
    const ticket = fence.enter("owner-a");
    let resolveHelpers!: (helpers: { isoToLocalDateTimeValue: () => string }) => void;
    const loadHelpers = () =>
      new Promise<{ isoToLocalDateTimeValue: () => string }>((resolve) => {
        resolveHelpers = resolve;
      });
    let form = {
      eventAt: "old-time",
      motive: "initial",
      address: "address",
      interventionNumber: "001",
    };
    const updateForm = (updater: (current: typeof form) => typeof form) => {
      form = updater(form);
    };
    const update = setEpisodeEventAtForCurrentOwner(
      ticket,
      fence.isCurrent,
      loadHelpers,
      new Date("2026-10-06T10:00:00.000Z"),
      updateForm,
    );
    form = { ...form, motive: "typed while helper loads" };
    resolveHelpers({ isoToLocalDateTimeValue: () => "new-time" });
    expect(await update).toBe(true);
    expect(form).toMatchObject({ eventAt: "new-time", motive: "typed while helper loads" });

    let resolveStale!: (helpers: { isoToLocalDateTimeValue: () => string }) => void;
    const stale = setEpisodeEventAtForCurrentOwner(
      ticket,
      fence.isCurrent,
      () => new Promise((resolve) => (resolveStale = resolve)),
      new Date(),
      updateForm,
    );
    fence.enter("owner-b");
    resolveStale({ isoToLocalDateTimeValue: () => "wrong-account-time" });
    expect(await stale).toBe(false);
    expect(form.eventAt).toBe("new-time");
  });
});
