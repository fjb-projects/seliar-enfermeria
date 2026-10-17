import { describe, expect, it } from "vitest";
import {
  createEfaGuardOversightService,
  type EfaGuardOversightTransaction,
  type EfaOversightDispatchRecord,
  type EfaOversightEpisodeRecord,
  type EfaOversightGuardRecord,
} from "./efa-guard-oversight.server";
import type { EfaGuardBaseEvent } from "./efa-guards.server";

function createStore() {
  const guards: EfaOversightGuardRecord[] = [
    {
      id: "guard-old",
      ownerUserId: "user-a",
      owner: { name: "Ana Pérez", email: "ana@example.com" },
      startedAt: new Date("2026-10-01T08:00:00.000Z"),
      endedAt: new Date("2026-10-01T20:00:00.000Z"),
      declaredAtCentral: true,
      version: 3,
    },
    {
      id: "guard-new",
      ownerUserId: "user-b",
      owner: { name: "Bruno Díaz", email: "bruno@example.com" },
      startedAt: new Date("2026-10-05T08:00:00.000Z"),
      endedAt: null,
      declaredAtCentral: true,
      version: 2,
    },
  ];
  const bases = [
    { id: "base-a", name: "Central", isActive: true },
    { id: "base-b", name: "Norte", isActive: false },
  ];
  const events: EfaGuardBaseEvent[] = [
    {
      guardId: "guard-old",
      baseId: "base-a",
      baseName: "Central",
      actorUserId: "user-a",
      sequence: 2,
      action: "added",
      occurredAt: new Date("2026-10-01T08:01:00.000Z"),
    },
    {
      guardId: "guard-old",
      baseId: "base-b",
      baseName: "Norte",
      actorUserId: "user-a",
      sequence: 3,
      action: "added",
      occurredAt: new Date("2026-10-01T08:02:00.000Z"),
    },
    {
      guardId: "guard-old",
      baseId: "base-a",
      baseName: "Central",
      actorUserId: "user-a",
      sequence: 4,
      action: "removed",
      occurredAt: new Date("2026-10-01T09:00:00.000Z"),
    },
  ];
  const episodes: EfaOversightEpisodeRecord[] = [
    episode("episode-1", "guard-old", "closed", false),
    episode("episode-2", "guard-old", "draft", false),
    episode("episode-3", "guard-old", "closed", true),
    episode("episode-4", "guard-new", "draft", false),
  ];
  const dispatches: Array<EfaOversightDispatchRecord & { episodeId: string; guardId: string }> = [
    dispatch("dispatch-1", "episode-1", "guard-old", null),
    dispatch("dispatch-2", "episode-1", "guard-old", new Date("2026-10-01T11:00:00.000Z")),
    dispatch("dispatch-3", "episode-4", "guard-new", null),
  ];
  const arrivals = [{ guardId: "guard-old" }, { guardId: "guard-old" }];
  const hygiene = [{ guardId: "guard-new" }];
  let actor: { isActive: boolean; roles: Array<"efa" | "admin"> } | null = {
    isActive: true,
    roles: ["admin"],
  };
  const queries: string[] = [];

  function countBy<T>(rows: T[], key: (row: T) => string) {
    const counts = new Map<string, number>();
    for (const row of rows) counts.set(key(row), (counts.get(key(row)) ?? 0) + 1);
    return counts;
  }

  const tx = {
    async findActor() {
      queries.push("findActor");
      return actor;
    },
    async listGuards() {
      queries.push("listGuards");
      return [...guards].sort(
        (left, right) => right.startedAt.getTime() - left.startedAt.getTime(),
      );
    },
    async findGuard(guardId: string) {
      queries.push("findGuard");
      return guards.find((guard) => guard.id === guardId) ?? null;
    },
    async listBases() {
      queries.push("listBases");
      return bases;
    },
    async listBaseEvents(guardIds: string[]) {
      queries.push("listBaseEvents");
      return events.filter((event) => guardIds.includes(event.guardId));
    },
    async countEpisodes() {
      queries.push("countEpisodes");
      const counts = countBy(
        episodes,
        (row) => `${row.originGuardId}|${row.state}|${row.cancelledAt !== null}`,
      );
      return [...counts].map(([key, count]) => {
        const [guardId, state, cancelled] = key.split("|");
        return {
          guardId: guardId!,
          state: state as "draft" | "closed",
          cancelled: cancelled === "true",
          count,
        };
      });
    },
    async countDispatches() {
      queries.push("countDispatches");
      const counts = countBy(dispatches, (row) => `${row.guardId}|${row.cancelledAt !== null}`);
      return [...counts].map(([key, count]) => {
        const [guardId, cancelled] = key.split("|");
        return { guardId: guardId!, cancelled: cancelled === "true", count };
      });
    },
    async countArrivals() {
      queries.push("countArrivals");
      return [...countBy(arrivals, (row) => row.guardId)].map(([guardId, count]) => ({
        guardId,
        count,
      }));
    },
    async countHygienePeriods() {
      queries.push("countHygienePeriods");
      return [...countBy(hygiene, (row) => row.guardId)].map(([guardId, count]) => ({
        guardId,
        count,
      }));
    },
    async listGuardEpisodes(guardId: string) {
      queries.push("listGuardEpisodes");
      return episodes.filter((row) => row.originGuardId === guardId);
    },
    async listGuardDispatches(guardId: string) {
      queries.push("listGuardDispatches");
      return dispatches
        .filter((row) => row.guardId === guardId)
        .map(({ guardId: _guardId, ...row }) => row);
    },
  } satisfies EfaGuardOversightTransaction;

  return {
    store: {
      async transaction<T>(work: (transaction: EfaGuardOversightTransaction) => Promise<T>) {
        return work(tx);
      },
    },
    queries,
    setActor(next: typeof actor) {
      actor = next;
    },
  };
}

function episode(
  id: string,
  guardId: string,
  state: "draft" | "closed",
  cancelled: boolean,
): EfaOversightEpisodeRecord {
  return {
    id,
    originGuardId: guardId,
    eventAt: new Date("2026-10-01T10:00:00.000Z"),
    motive: `Motivo ${id}`,
    address: null,
    interventionNumber: null,
    state,
    closedAt: state === "closed" ? new Date("2026-10-01T12:00:00.000Z") : null,
    cancelledAt: cancelled ? new Date("2026-10-01T13:00:00.000Z") : null,
    cancelledFromState: cancelled ? state : null,
    updatedAt: new Date("2026-10-01T13:30:00.000Z"),
  };
}

function dispatch(id: string, episodeId: string, guardId: string, cancelledAt: Date | null) {
  return {
    id,
    episodeId,
    guardId,
    baseId: "base-a",
    baseName: "Central",
    priority: "red",
    result: null,
    state: cancelledAt ? "cancelled" : "draft",
    t0At: new Date("2026-10-01T10:01:00.000Z"),
    t1At: null,
    t2At: null,
    t3At: null,
    t4At: null,
    finalizedAt: null,
    cancelledAt,
  };
}

describe("EFA guard oversight service", () => {
  it.each([
    ["a missing account", null],
    ["an inactive administrator", { isActive: false, roles: ["admin"] as Array<"efa" | "admin"> }],
    [
      "an EFA account without administration",
      { isActive: true, roles: ["efa"] as Array<"efa" | "admin"> },
    ],
  ])("refuses %s before reading any guard", async (_description, actor) => {
    const db = createStore();
    db.setActor(actor);
    const service = createEfaGuardOversightService(db.store);

    await expect(service.listGuards("someone")).rejects.toThrow(/inactiva|administraci/i);
    await expect(service.listGuardServices("someone", "guard-old")).rejects.toThrow(
      /inactiva|administraci/i,
    );
    expect(db.queries).toEqual(["findActor", "findActor"]);
  });

  it("lists every user's guard with owner, current bases and service totals", async () => {
    const db = createStore();
    const service = createEfaGuardOversightService(db.store);

    const guards = await service.listGuards("admin-1");

    expect(guards.map((guard) => guard.id)).toEqual(["guard-new", "guard-old"]);
    expect(guards[1]).toMatchObject({
      ownerUserId: "user-a",
      owner: { name: "Ana Pérez", email: "ana@example.com" },
      bases: [{ id: "base-b", name: "Norte", isActive: false }],
      totals: {
        episodes: { draft: 1, closed: 1, cancelled: 1 },
        dispatches: { total: 2, cancelled: 1 },
        mobileArrivals: 2,
        hygienePeriods: 0,
      },
    });
    expect(guards[0]).toMatchObject({
      owner: { name: "Bruno Díaz" },
      bases: [],
      totals: {
        episodes: { draft: 1, closed: 0, cancelled: 0 },
        dispatches: { total: 1, cancelled: 0 },
        mobileArrivals: 0,
        hygienePeriods: 1,
      },
    });
  });

  it("reads totals with a fixed number of grouped queries regardless of guard count", async () => {
    const db = createStore();
    const service = createEfaGuardOversightService(db.store);

    await service.listGuards("admin-1");

    expect([...db.queries].sort()).toEqual(
      [
        "findActor",
        "listGuards",
        "listBases",
        "listBaseEvents",
        "countEpisodes",
        "countDispatches",
        "countArrivals",
        "countHygienePeriods",
      ].sort(),
    );
  });

  it("lists a guard's episodes with their dispatches for administrators", async () => {
    const db = createStore();
    const service = createEfaGuardOversightService(db.store);

    const services = await service.listGuardServices("admin-1", "guard-old");

    expect(services.map((item) => item.id)).toEqual(["episode-1", "episode-2", "episode-3"]);
    expect(services[0]!.dispatches.map((item) => item.id)).toEqual(["dispatch-1", "dispatch-2"]);
    expect(services[0]!.dispatches[1]).toMatchObject({ baseName: "Central", state: "cancelled" });
    expect(services[1]!.dispatches).toEqual([]);
    expect(services[2]).toMatchObject({ state: "closed", cancelledAt: expect.any(Date) });
    // The full-service summary needs these two fields to describe a cancelled service.
    expect(services[2]).toMatchObject({
      cancelledFromState: "closed",
      updatedAt: new Date("2026-10-01T13:30:00.000Z"),
    });
    expect(services[0]).toMatchObject({ cancelledFromState: null });
  });

  it("rejects listing services of an unknown guard", async () => {
    const db = createStore();
    const service = createEfaGuardOversightService(db.store);

    await expect(service.listGuardServices("admin-1", "missing")).rejects.toThrow(
      /No se encontró la guardia/i,
    );
  });
});
