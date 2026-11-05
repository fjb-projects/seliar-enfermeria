import { describe, expect, it } from "vitest";
import {
  assertStaffingCause,
  assertStaffingRole,
  assertStaffingTimestampOrder,
  createEfaStaffingService,
  type StaffingMovement,
  type StaffingPeriod,
  type StaffingStore,
  type StaffingTransaction,
} from "./efa-staffing.server";

function createMemoryStore(): StaffingStore & {
  periods: StaffingPeriod[];
  movements: StaffingMovement[];
  audits: unknown[];
  closeGuard: (at: Date) => void;
} {
  const periods: StaffingPeriod[] = [];
  const movements: StaffingMovement[] = [];
  const audits: unknown[] = [];
  const periodKeys = new Map<string, string>();
  const movementKeys = new Map<string, string>();
  let guardEndedAt: Date | null = null;
  const tx: StaffingTransaction = {
    async findActor(userId) {
      return userId === "inactive"
        ? { isActive: false, roles: ["efa"] }
        : { isActive: true, roles: ["efa"] };
    },
    async findGuard(guardId) {
      return guardId === "guard"
        ? { id: guardId, ownerUserId: "owner", endedAt: guardEndedAt }
        : null;
    },
    async listPeriods(guardId) {
      return periods.filter((period) => period.guardId === guardId);
    },
    async findPeriod(periodId) {
      return periods.find((period) => period.id === periodId) ?? null;
    },
    async findPeriodByCreationKey(guardId, key) {
      const id = periodKeys.get(`${guardId}:${key}`);
      return periods.find((period) => period.id === id) ?? null;
    },
    async insertPeriod(input) {
      const { clientCreationKey, ...period } = input;
      periods.push(period);
      periodKeys.set(`${period.guardId}:${clientCreationKey}`, period.id);
    },
    async updatePeriod(periodId, version, input) {
      const period = periods.find((item) => item.id === periodId);
      if (!period || period.version !== version) throw new Error("stale");
      Object.assign(period, input);
    },
    async listMovements(periodId) {
      return movements.filter((movement) => movement.periodId === periodId);
    },
    async findMovementByCreationKey(periodId, key) {
      const id = movementKeys.get(`${periodId}:${key}`);
      return movements.find((movement) => movement.id === id) ?? null;
    },
    async findMovement(movementId) {
      return movements.find((movement) => movement.id === movementId) ?? null;
    },
    async insertMovement(input) {
      const { clientCreationKey, createdByUserId: _actor, ...movement } = input;
      movements.push(movement);
      movementKeys.set(`${movement.periodId}:${clientCreationKey}`, movement.id);
    },
    async completeMovement(movementId, version, arrivedAt) {
      const movement = movements.find((item) => item.id === movementId);
      if (!movement || movement.version !== version) throw new Error("stale movement");
      movement.arrivedAt = arrivedAt;
      movement.version += 1;
    },
    async appendAudit(input) {
      audits.push(input);
    },
    async databaseNow() {
      return new Date("2026-10-07T12:00:00.000Z");
    },
  };
  return {
    periods,
    movements,
    audits,
    closeGuard(at) {
      guardEndedAt = at;
    },
    async transaction(work) {
      return work(tx);
    },
  };
}

describe("observed EFA staffing validation", () => {
  it("accepts only the three anonymous operational roles", () => {
    expect(() => assertStaffingRole("nurse")).not.toThrow();
    expect(() => assertStaffingRole("driver")).not.toThrow();
    expect(() => assertStaffingRole("doctor")).not.toThrow();
    expect(() => assertStaffingRole("other")).toThrow();
  });

  it("requires an explanation for the other cause and rejects descriptions for known causes", () => {
    expect(() => assertStaffingCause("other", "")).toThrow();
    expect(() => assertStaffingCause("other", "Dispatch request")).not.toThrow();
    expect(() => assertStaffingCause("medical_request", undefined)).not.toThrow();
    expect(() => assertStaffingCause("medical_request", "extra")).toThrow();
    expect(() => assertStaffingCause("unknown", undefined)).toThrow();
  });

  it("keeps departure and arrival timestamps separate and ordered", () => {
    const departure = new Date("2026-10-07T10:00:00.000Z");
    const arrival = new Date("2026-10-07T10:25:00.000Z");
    expect(() => assertStaffingTimestampOrder(departure, arrival)).not.toThrow();
    expect(() => assertStaffingTimestampOrder(arrival, departure)).toThrow();
    expect(() => assertStaffingTimestampOrder(departure, null)).not.toThrow();
  });

  it("allows concurrent anonymous periods for the same role and replays entry keys", async () => {
    const store = createMemoryStore();
    let nextId = 0;
    const service = createEfaStaffingService(store, () => `period-${++nextId}`);
    const first = await service.enter("owner", {
      guardId: "guard",
      role: "nurse",
      clientOperationId: "op-1",
    });
    const replay = await service.enter("owner", {
      guardId: "guard",
      role: "nurse",
      clientOperationId: "op-1",
    });
    await service.enter("owner", { guardId: "guard", role: "nurse", clientOperationId: "op-2" });
    expect(replay).toEqual(first);
    expect(store.periods).toHaveLength(2);
    expect(store.audits).toHaveLength(2);
  });

  it("requires same-owner or admin access and permits a distinct handover after exit", async () => {
    const store = createMemoryStore();
    const service = createEfaStaffingService(store, () => "period");
    await expect(
      service.enter("other", { guardId: "guard", role: "driver", clientOperationId: "op" }),
    ).rejects.toThrow("tus guardias");
    const { id } = await service.enter("owner", {
      guardId: "guard",
      role: "driver",
      enteredAt: "2026-10-07T10:00:00.000Z",
      clientOperationId: "op",
    });
    await service.exit("owner", {
      periodId: id,
      expectedVersion: 1,
      exitedAt: "2026-10-07T11:00:00.000Z",
    });
    await service.enter("owner", {
      guardId: "guard",
      role: "driver",
      clientOperationId: "op-next",
    });
    expect(store.periods).toHaveLength(2);
    expect(store.audits.map((audit: any) => audit.action)).toEqual([
      "entered",
      "exited",
      "entered",
    ]);
  });

  it("stores transfer departure and arrival independently and supports temporary return", async () => {
    const store = createMemoryStore();
    let nextId = 0;
    const service = createEfaStaffingService(store, () => `id-${++nextId}`);
    const { id: periodId } = await service.enter("owner", {
      guardId: "guard",
      role: "doctor",
      enteredAt: "2026-10-07T09:00:00.000Z",
      clientOperationId: "entry",
    });
    const transfer = await service.depart("owner", {
      periodId,
      kind: "transfer",
      departedAt: "2026-10-07T10:00:00.000Z",
      cause: "coordination",
      clientOperationId: "transfer",
    });
    const transferReplay = await service.depart("owner", {
      periodId,
      kind: "transfer",
      departedAt: "2026-10-07T10:00:00.000Z",
      cause: "coordination",
      clientOperationId: "transfer",
    });
    expect(transferReplay).toEqual(transfer);
    expect(store.movements).toHaveLength(1);
    expect(store.movements[0]?.arrivedAt).toBeNull();
    await service.arrive("owner", {
      movementId: transfer.id,
      arrivedAt: "2026-10-07T10:30:00.000Z",
    });
    const temporary = await service.depart("owner", {
      periodId,
      kind: "temporary",
      departedAt: "2026-10-07T11:00:00.000Z",
      cause: "temporary",
      clientOperationId: "leave",
    });
    await service.arrive("owner", {
      movementId: temporary.id,
      arrivedAt: "2026-10-07T11:15:00.000Z",
    });
    expect(
      store.movements.map((movement) => [
        movement.departedAt.toISOString(),
        movement.arrivedAt?.toISOString(),
      ]),
    ).toEqual([
      ["2026-10-07T10:00:00.000Z", "2026-10-07T10:30:00.000Z"],
      ["2026-10-07T11:00:00.000Z", "2026-10-07T11:15:00.000Z"],
    ]);
    expect(store.audits).toHaveLength(5);
  });

  it("rejects new periods after guard closure but permits an existing period to finish", async () => {
    const store = createMemoryStore();
    const service = createEfaStaffingService(store, () => "period-id");
    const { id } = await service.enter("owner", {
      guardId: "guard",
      role: "nurse",
      enteredAt: "2026-10-07T09:00:00.000Z",
      clientOperationId: "entry-before-close",
    });
    store.closeGuard(new Date("2026-10-07T10:00:00.000Z"));

    await expect(
      service.enter("owner", {
        guardId: "guard",
        role: "driver",
        enteredAt: "2026-10-07T10:01:00.000Z",
        clientOperationId: "entry-after-close",
      }),
    ).rejects.toThrow("guardia terminó");
    await expect(
      service.exit("owner", {
        periodId: id,
        expectedVersion: 1,
        exitedAt: "2026-10-07T11:00:00.000Z",
      }),
    ).resolves.toBeUndefined();
    expect(store.periods).toHaveLength(1);
    expect(store.periods[0]?.exitedAt?.toISOString()).toBe("2026-10-07T11:00:00.000Z");
  });

  it("orders every departure and period exit after the preceding completed arrival", async () => {
    const store = createMemoryStore();
    let nextId = 0;
    const service = createEfaStaffingService(store, () => `id-${++nextId}`);
    const { id: periodId } = await service.enter("owner", {
      guardId: "guard",
      role: "doctor",
      enteredAt: "2026-10-07T08:00:00.000Z",
      clientOperationId: "entry",
    });
    const first = await service.depart("owner", {
      periodId,
      kind: "transfer",
      departedAt: "2026-10-07T09:00:00.000Z",
      clientOperationId: "first-transfer",
    });
    await service.arrive("owner", { movementId: first.id, arrivedAt: "2026-10-07T10:00:00.000Z" });

    await expect(
      service.depart("owner", {
        periodId,
        kind: "temporary",
        departedAt: "2026-10-07T09:59:00.000Z",
        clientOperationId: "too-early-departure",
      }),
    ).rejects.toThrow("no puede ser anterior a la llegada previa");
    await expect(
      service.exit("owner", {
        periodId,
        expectedVersion: 3,
        exitedAt: "2026-10-07T09:59:00.000Z",
      }),
    ).rejects.toThrow("egreso no puede ser anterior a la última llegada");

    const second = await service.depart("owner", {
      periodId,
      kind: "temporary",
      departedAt: "2026-10-07T10:01:00.000Z",
      clientOperationId: "second-movement",
    });
    await service.arrive("owner", { movementId: second.id, arrivedAt: "2026-10-07T10:30:00.000Z" });
    await expect(
      service.exit("owner", {
        periodId,
        expectedVersion: 5,
        exitedAt: "2026-10-07T10:29:00.000Z",
      }),
    ).rejects.toThrow("egreso no puede ser anterior a la última llegada");
    await expect(
      service.exit("owner", {
        periodId,
        expectedVersion: 5,
        exitedAt: "2026-10-07T10:31:00.000Z",
      }),
    ).resolves.toBeUndefined();
  });
});
