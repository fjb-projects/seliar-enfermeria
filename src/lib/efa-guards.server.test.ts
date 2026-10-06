import { describe, expect, it } from "vitest";
import { createEfaGuardsService, type EfaGuardTransaction } from "./efa-guards.server";

function createStore() {
  const guards: Array<{
    id: string;
    ownerUserId: string;
    startedAt: Date;
    endedAt: Date | null;
    declaredAtCentral: boolean;
    version: number;
  }> = [];
  const bases = [
    { id: "base-a", name: "Central", isActive: true },
    { id: "base-b", name: "Norte", isActive: true },
    { id: "base-c", name: "Sur", isActive: false },
  ];
  const events: Array<{
    guardId: string;
    baseId: string;
    baseName: string;
    actorUserId: string;
    sequence: number;
    action: "added" | "removed";
    occurredAt: Date;
  }> = [];
  const guardAudit: unknown[] = [];
  let actor = { isActive: true, roles: ["efa"] as Array<"efa" | "admin"> };
  let now = new Date("2026-10-06T10:00:00.000Z");
  const tx = {
    async findActor() {
      return actor;
    },
    async listBases() {
      return bases.filter((base) => base.isActive);
    },
    async listGuards(ownerUserId: string | null) {
      return guards
        .filter((guard) => !ownerUserId || guard.ownerUserId === ownerUserId)
        .map((guard) => ({ ...guard }));
    },
    async findGuard(id: string) {
      return guards.find((guard) => guard.id === id) ?? null;
    },
    async insertGuard(
      input: Pick<
        (typeof guards)[number],
        "id" | "ownerUserId" | "declaredAtCentral" | "startedAt"
      >,
    ) {
      guards.push({ ...input, endedAt: null, version: 1 });
    },
    async updateGuard(id: string, expectedVersion: number, next: Partial<(typeof guards)[number]>) {
      const guard = guards.find((item) => item.id === id);
      if (!guard || guard.version !== expectedVersion) throw new Error("stale-guard-version");
      Object.assign(guard, next);
    },
    async listBaseEvents(guardId: string) {
      return events
        .filter((event) => event.guardId === guardId)
        .sort((left, right) => left.sequence - right.sequence);
    },
    async appendBaseEvent(input: Omit<(typeof events)[number], "baseName" | "occurredAt">) {
      if (
        events.some((event) => event.guardId === input.guardId && event.sequence === input.sequence)
      ) {
        throw new Error("duplicate-guard-sequence");
      }
      events.push({
        ...input,
        baseName: bases.find((base) => base.id === input.baseId)!.name,
        occurredAt: now,
      });
    },
    async appendGuardAudit(input: unknown) {
      guardAudit.push(input);
    },
    async databaseNow() {
      return now;
    },
  } satisfies EfaGuardTransaction;
  return {
    store: {
      async transaction<T>(work: (transaction: EfaGuardTransaction) => Promise<T>) {
        return work(tx);
      },
    },
    guards,
    events,
    guardAudit,
    setActor(next: typeof actor) {
      actor = next;
    },
    setNow(next: Date) {
      now = next;
    },
  };
}

describe("EFA guard lifecycle service", () => {
  it("requires a current EFA actor and an explicit Central declaration to start manually", async () => {
    const db = createStore();
    db.setActor({ isActive: true, roles: [] });
    await expect(
      createEfaGuardsService(db.store).start("user-1", { declaredAtCentral: true }),
    ).rejects.toThrow(/EFA/i);
    db.setActor({ isActive: true, roles: ["efa"] });
    const result = await createEfaGuardsService(db.store, { newId: () => "guard-1" }).start(
      "user-1",
      { declaredAtCentral: true },
    );
    expect(result).toEqual({ id: "guard-1" });
    expect(db.guards[0]).toMatchObject({
      ownerUserId: "user-1",
      endedAt: null,
      declaredAtCentral: true,
      version: 1,
    });
    expect(db.guardAudit[0]).toMatchObject({
      actorUserId: "user-1",
      action: "started",
      versionAfter: 1,
    });
  });

  it("allows one or more active bases, logs each add/remove with actor and time, and rejects stale edits", async () => {
    const db = createStore();
    const service = createEfaGuardsService(db.store, { newId: () => "guard-1" });
    await service.start("user-1", { declaredAtCentral: true });
    await service.setBases("user-1", {
      guardId: "guard-1",
      expectedVersion: 1,
      baseIds: ["base-a", "base-b"],
    });
    expect(db.events).toEqual([
      expect.objectContaining({ baseId: "base-a", action: "added", actorUserId: "user-1" }),
      expect.objectContaining({ baseId: "base-b", action: "added", actorUserId: "user-1" }),
    ]);
    await expect(
      service.setBases("user-1", { guardId: "guard-1", expectedVersion: 1, baseIds: ["base-a"] }),
    ).rejects.toThrow(/cambi/i);
    db.setNow(new Date("2026-10-06T10:30:00.000Z"));
    await service.setBases("user-1", {
      guardId: "guard-1",
      expectedVersion: 3,
      baseIds: ["base-b"],
    });
    expect(db.events.at(-1)).toMatchObject({
      baseId: "base-a",
      action: "removed",
      actorUserId: "user-1",
    });
  });

  it("replays membership by serialized mutation order when transaction timestamps arrive out of order", async () => {
    const db = createStore();
    const service = createEfaGuardsService(db.store, { newId: () => "guard-1" });
    await service.start("user-1", { declaredAtCentral: true });
    db.setNow(new Date("2026-10-06T12:00:00.000Z"));
    await service.setBases("user-1", {
      guardId: "guard-1",
      expectedVersion: 1,
      baseIds: ["base-a"],
    });
    db.setNow(new Date("2026-10-06T09:00:00.000Z"));
    await service.setBases("user-1", {
      guardId: "guard-1",
      expectedVersion: 2,
      baseIds: ["base-b"],
    });
    const [guard] = await service.list("user-1");
    expect(guard!.bases.map((base) => base.id)).toEqual(["base-b"]);
    expect(db.events.map((event) => event.sequence)).toEqual([2, 3, 4]);
    expect(db.events[0]!.occurredAt.getTime()).toBeGreaterThan(db.events[2]!.occurredAt.getTime());
  });

  it("serializes concurrent base changes through the expected guard version", async () => {
    const db = createStore();
    const service = createEfaGuardsService(db.store, { newId: () => "guard-1" });
    await service.start("user-1", { declaredAtCentral: true });
    const attempts = await Promise.allSettled([
      service.setBases("user-1", {
        guardId: "guard-1",
        expectedVersion: 1,
        baseIds: ["base-a"],
      }),
      service.setBases("user-1", {
        guardId: "guard-1",
        expectedVersion: 1,
        baseIds: ["base-b"],
      }),
    ]);
    expect(attempts.filter((attempt) => attempt.status === "fulfilled")).toHaveLength(1);
    expect(attempts.filter((attempt) => attempt.status === "rejected")).toHaveLength(1);
    expect(db.events).toHaveLength(1);
    expect(db.events[0]!.sequence).toBe(2);
    expect(db.guards[0]!.version).toBe(2);
  });

  it("prevents access to another EFA owner's guards while permitting admin reads", async () => {
    const db = createStore();
    const service = createEfaGuardsService(db.store, { newId: () => "guard-1" });
    await service.start("owner-1", { declaredAtCentral: true });
    await expect(service.list("other-efa")).resolves.toEqual([]);
    await expect(
      service.end("other-efa", { guardId: "guard-1", expectedVersion: 1 }),
    ).rejects.toThrow(/propias guardias/i);
    db.setActor({ isActive: true, roles: ["admin"] });
    await expect(service.list("admin-1")).resolves.toHaveLength(1);
  });

  it("ends only when explicitly requested and retains the ended guard", async () => {
    const db = createStore();
    const service = createEfaGuardsService(db.store, { newId: () => "guard-1" });
    await service.start("user-1", { declaredAtCentral: true });
    db.setNow(new Date("2026-10-06T18:00:00.000Z"));
    await service.end("user-1", { guardId: "guard-1", expectedVersion: 1 });
    expect(db.guards).toHaveLength(1);
    expect(db.guards[0]!.version).toBe(2);
    expect(db.guards[0]!.endedAt).toEqual(new Date("2026-10-06T18:00:00.000Z"));
    expect(db.guardAudit.at(-1)).toMatchObject({
      actorUserId: "user-1",
      action: "ended",
      versionBefore: 1,
      versionAfter: 2,
    });
  });

  it("lets only administrators correct a retained end time and audits the previous value", async () => {
    const db = createStore();
    const service = createEfaGuardsService(db.store, { newId: () => "guard-1" });
    await service.start("owner-1", { declaredAtCentral: true });
    db.setNow(new Date("2026-10-06T18:00:00.000Z"));
    await service.end("owner-1", { guardId: "guard-1", expectedVersion: 1 });
    db.setActor({ isActive: true, roles: ["efa"] });
    await expect(
      service.correctEnd("efa-1", {
        guardId: "guard-1",
        expectedVersion: 2,
        endedAt: new Date("2026-10-06T18:30:00Z"),
      }),
    ).rejects.toThrow(/administraci/i);
    db.setActor({ isActive: true, roles: ["admin"] });
    await service.correctEnd("admin-1", {
      guardId: "guard-1",
      expectedVersion: 2,
      endedAt: new Date("2026-10-06T18:30:00Z"),
    });
    expect(db.guards[0]!.endedAt).toEqual(new Date("2026-10-06T18:30:00Z"));
    expect(db.guardAudit.at(-1)).toMatchObject({
      actorUserId: "admin-1",
      action: "end_corrected",
      beforeState: { endedAt: "2026-10-06T18:00:00.000Z" },
      afterState: { endedAt: "2026-10-06T18:30:00.000Z" },
    });
  });

  it("rejects correcting the end time of an open guard without changing history", async () => {
    const db = createStore();
    const service = createEfaGuardsService(db.store, { newId: () => "guard-1" });
    await service.start("owner-1", { declaredAtCentral: true });
    db.setActor({ isActive: true, roles: ["admin"] });
    const guardBefore = { ...db.guards[0]! };
    const auditBefore = [...db.guardAudit];

    await expect(
      service.correctEnd("admin-1", {
        guardId: "guard-1",
        expectedVersion: 1,
        endedAt: new Date("2026-10-06T18:30:00Z"),
      }),
    ).rejects.toThrow(/abierta|en curso|terminada/i);

    expect(db.guards[0]).toEqual(guardBefore);
    expect(db.guardAudit).toEqual(auditBefore);
  });
});
