import { describe, expect, it, vi } from "vitest";
import {
  createEfaServiceMetadataStore,
  deriveEfaServiceMetadata,
  type EfaMetadataCall,
  type EfaMetadataDispatch,
} from "./efa-service-metadata";

const call = (overrides: Partial<EfaMetadataCall> = {}): EfaMetadataCall => ({
  id: "call-1",
  episodeId: "episode-1",
  ownerUserId: "owner-1",
  version: 1,
  createdAt: "2026-11-13T10:00:00Z",
  priority: "red",
  state: "draft",
  ...overrides,
});
const dispatch = (overrides: Partial<EfaMetadataDispatch> = {}): EfaMetadataDispatch => ({
  id: "dispatch-1",
  episodeId: "episode-1",
  ownerUserId: "owner-1",
  version: 1,
  createdAt: "2026-11-13T10:00:00Z",
  baseId: "base-1",
  baseName: "Móvil 12",
  state: "draft",
  ...overrides,
});
function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: Error) => void;
  const promise = new Promise<T>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}

describe("deriveEfaServiceMetadata", () => {
  it("uses creation time rather than array order, severity or dispatch priority", () => {
    const rows = [
      call({ id: "newer", priority: "green", createdAt: "2026-11-13T11:00:00Z" }),
      call(),
    ];
    expect(deriveEfaServiceMetadata(rows, []).priority).toBe("green");
    expect(deriveEfaServiceMetadata([...rows].reverse(), []).priority).toBe("green");
    expect(
      deriveEfaServiceMetadata(
        [
          ...rows,
          call({
            id: "server-date",
            priority: "yellow",
            createdAt: new Date("2026-11-13T12:00:00Z"),
          }),
        ],
        [],
      ).priority,
    ).toBe("yellow");
    expect(deriveEfaServiceMetadata([], [dispatch()]).priority).toBeNull();
  });

  it("ignores cancelled and unknown-priority calls and breaks timestamp ties by id", () => {
    const rows = [
      call({ id: "a", priority: "yellow" }),
      call({ id: "b", priority: "green" }),
      call({ id: "cancelled", state: "cancelled", createdAt: "2026-11-14T10:00:00Z" }),
      call({
        id: "timestamp-cancelled",
        cancelledAt: "2026-11-13T12:00:00Z",
        createdAt: "2026-11-14T10:00:00Z",
      }),
      call({ id: "unknown", priority: null, createdAt: "2026-11-14T10:00:00Z" }),
    ];
    expect(deriveEfaServiceMetadata(rows, []).priority).toBe("green");
    expect(deriveEfaServiceMetadata([...rows].reverse(), []).priority).toBe("green");
  });

  it("keeps each active assigned base once and never treats finalized records as active", () => {
    expect(
      deriveEfaServiceMetadata(
        [],
        [
          dispatch(),
          dispatch({ id: "duplicate" }),
          dispatch({ id: "finished", baseId: "b2", state: "finalized" }),
          dispatch({ id: "cancelled", baseId: "b3", state: "cancelled" }),
          dispatch({ id: "finished-at", baseId: "b4", finalizedAt: "2026-11-13T12:00:00Z" }),
          dispatch({ id: "cancelled-at", baseId: "b5", cancelledAt: "2026-11-13T12:00:00Z" }),
        ],
      ).mobiles,
    ).toEqual(["12"]);
  });

  it("only compacts unambiguous mobile names and distinguishes unknown assignment from none", () => {
    expect(
      deriveEfaServiceMetadata(
        [],
        [
          dispatch({ baseId: "a", baseName: "Móvil N° 003" }),
          dispatch({ id: "2", baseId: "b", baseName: "Base Norte 12" }),
          dispatch({ id: "3", baseId: "c", baseName: "Móvil 12 / 14" }),
          dispatch({ id: "4", baseId: "d", baseName: null }),
        ],
      ).mobiles,
    ).toEqual(["003", "Base Norte 12", "Móvil 12 / 14", "Móvil asignado"]);
    expect(deriveEfaServiceMetadata([], []).mobiles).toEqual([]);
  });
});

describe("createEfaServiceMetadataStore", () => {
  it("has stable snapshots, safe subscriptions and isolated owner-local instances", () => {
    const store = createEfaServiceMetadataStore("owner-1");
    const other = createEfaServiceMetadataStore("owner-2");
    const initial = store.getSnapshot();
    expect(store.getSnapshot()).toBe(initial);
    expect(store.get("absent")).toBe(store.get("absent"));
    const listener = vi.fn();
    const unsubscribe = store.subscribe(listener);
    store.publishCalls("episode-1", [call()]);
    expect(listener).toHaveBeenCalledTimes(1);
    expect(store.getSnapshot()).not.toBe(initial);
    const published = store.getSnapshot();
    store.publishCalls("episode-1", [call()]);
    expect(store.getSnapshot()).toBe(published);
    expect(listener).toHaveBeenCalledTimes(1);
    expect(other.get("episode-1").priority).toBeNull();
    unsubscribe();
    unsubscribe();
    store.upsertCall("episode-1", call({ version: 2, priority: "yellow" }));
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it("fences owner and episode mismatches and never regresses record versions", () => {
    const store = createEfaServiceMetadataStore("owner-1");
    store.publishCalls("episode-1", [
      call({ ownerUserId: "owner-2" }),
      call({ episodeId: "other" }),
    ]);
    store.publishDispatches("episode-1", [dispatch({ ownerUserId: "owner-2" })]);
    expect(store.get("episode-1")).toEqual({ priority: null, mobiles: [], status: "ready" });
    store.upsertCall("episode-1", call({ version: 4, priority: "yellow" }));
    store.publishCalls("episode-1", [call({ version: 2 })]);
    store.upsertDispatch("episode-1", dispatch({ version: 3, state: "cancelled" }));
    store.publishDispatches("episode-1", [dispatch({ version: 1 })]);
    expect(store.get("episode-1")).toEqual({ priority: "yellow", mobiles: [], status: "ready" });
  });

  it("deduplicates concurrent preload and editor reads but refreshes after settlement", async () => {
    const store = createEfaServiceMetadataStore("owner-1");
    const pending = deferred<EfaMetadataCall[]>();
    const calls = vi.fn(() => pending.promise);
    const dispatches = vi.fn(async () => [dispatch()]);
    const preload = store.load("episode-1", { calls, dispatches });
    const editorRead = store.readCalls("episode-1", calls);
    expect(calls).toHaveBeenCalledTimes(1);
    expect(store.get("episode-1").status).toBe("loading");
    pending.resolve([call()]);
    const readRows = await editorRead;
    store.publishCalls("episode-1", readRows);
    await preload;
    expect(store.get("episode-1")).toEqual({ priority: "red", mobiles: ["12"], status: "ready" });
    await store.readCalls("episode-1", calls);
    expect(calls).toHaveBeenCalledTimes(2);
  });

  it("does not let an older inflight read replace a newer confirmed call or dispatch", async () => {
    const store = createEfaServiceMetadataStore("owner-1");
    const calls = deferred<EfaMetadataCall[]>();
    const dispatches = deferred<EfaMetadataDispatch[]>();
    const loading = store.load("episode-1", {
      calls: () => calls.promise,
      dispatches: () => dispatches.promise,
    });
    store.upsertCall("episode-1", call({ version: 2, priority: "green" }));
    store.upsertDispatch("episode-1", dispatch({ version: 2, baseName: "Móvil 99" }));
    calls.resolve([call()]);
    dispatches.resolve([dispatch()]);
    await loading;
    expect(store.get("episode-1")).toEqual({ priority: "green", mobiles: ["99"], status: "ready" });
  });

  it("retains confirmed data and distinguishes partial/failing fetch from no assignment", async () => {
    const store = createEfaServiceMetadataStore("owner-1");
    const failed = async () => {
      throw new Error("offline");
    };
    await store.load("episode-1", { calls: async () => [call()], dispatches: failed });
    expect(store.get("episode-1")).toEqual({ priority: "red", mobiles: [], status: "error" });
    store.upsertDispatch("episode-1", dispatch());
    await store.load("episode-1", { calls: failed, dispatches: failed });
    expect(store.get("episode-1")).toEqual({ priority: "red", mobiles: ["12"], status: "error" });
    await store.load("episode-1", {
      calls: async () => [call()],
      dispatches: async () => [dispatch()],
    });
    expect(store.get("episode-1").status).toBe("ready");
  });

  it("keeps a known base name when confirmed dispatch responses omit it", () => {
    const store = createEfaServiceMetadataStore("owner-1");
    store.publishDispatches("episode-1", [dispatch()]);
    store.upsertDispatch("episode-1", dispatch({ version: 2, baseName: undefined }));
    expect(store.get("episode-1").mobiles).toEqual(["12"]);
  });

  it("updates saved priority and active assignments immediately through lifecycle responses", () => {
    const store = createEfaServiceMetadataStore("owner-1");
    store.publishCalls("episode-1", [
      call(),
      call({ id: "new", priority: "green", createdAt: "2026-11-13T11:00:00Z" }),
    ]);
    store.publishDispatches("episode-1", [dispatch()]);
    store.upsertCall(
      "episode-1",
      call({
        id: "new",
        version: 2,
        priority: "green",
        state: "cancelled",
        createdAt: "2026-11-13T11:00:00Z",
      }),
    );
    store.upsertDispatch("episode-1", dispatch({ version: 2, state: "finalized" }));
    expect(store.get("episode-1")).toEqual({ priority: "red", mobiles: [], status: "ready" });
    store.upsertDispatch("episode-1", dispatch({ version: 3 }));
    expect(store.get("episode-1").mobiles).toEqual(["12"]);
  });

  it("deduplicates dispatch reads and fences a read published under another episode", async () => {
    const store = createEfaServiceMetadataStore("owner-1");
    const pending = deferred<EfaMetadataDispatch[]>();
    const loader = vi.fn(() => pending.promise);
    const first = store.readDispatches("episode-1", loader);
    const second = store.readDispatches("episode-1", loader);
    expect(loader).toHaveBeenCalledTimes(1);
    pending.resolve([dispatch()]);
    const rows = await first;
    expect(await second).toBe(rows);
    store.publishDispatches("other-episode", rows);
    expect(store.get("other-episode").mobiles).toEqual([]);
    store.publishDispatches("episode-1", rows);
    expect(store.get("episode-1").mobiles).toEqual(["12"]);
  });

  it("fences late resolution and subscriptions after disposal", async () => {
    const store = createEfaServiceMetadataStore("owner-1");
    const pending = deferred<EfaMetadataCall[]>();
    const loading = store.load("episode-1", {
      calls: () => pending.promise,
      dispatches: async () => [],
    });
    store.dispose();
    const snapshot = store.getSnapshot();
    const listener = vi.fn();
    store.subscribe(listener);
    pending.resolve([call()]);
    await loading;
    store.upsertCall("episode-1", call());
    expect(store.getSnapshot()).toBe(snapshot);
    expect(store.get("episode-1").priority).toBeNull();
    expect(listener).not.toHaveBeenCalled();
  });
});
