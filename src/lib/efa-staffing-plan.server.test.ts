import { describe, expect, it } from "vitest";
import {
  createEfaStaffingPlanService,
  expandStaffingPlan,
  getOperationalDate,
  type StaffingPlanStore,
  type StaffingPlanTransaction,
} from "./efa-staffing-plan.server";

function memoryStore(): StaffingPlanStore {
  const plans: any[] = [];
  const exceptions: any[] = [];
  const audits: any[] = [];
  const tx: StaffingPlanTransaction = {
    async findActor(id) {
      return { isActive: id !== "inactive", roles: id === "admin" ? ["efa", "admin"] : ["efa"] };
    },
    async listPlans(target) {
      return plans.filter((row) => row.targetKey === target);
    },
    async insertPlan(row) {
      plans.push(row);
    },
    async listExceptions(target, from, to) {
      return exceptions.filter(
        (row) => row.targetKey === target && row.date >= from && row.date <= to,
      );
    },
    async insertException(row) {
      exceptions.push(row);
    },
    async appendAudit(row) {
      audits.push(row);
    },
  };
  return { transaction: (work) => work(tx) };
}

const cycle = {
  target: { kind: "mobile" as const, name: "Móvil 15" },
  effectiveFrom: "2026-10-07",
  cycleAnchor: "2026-10-01",
  cycleLengthDays: 4,
  clientOperationId: "00000000-0000-4000-8000-000000000010",
  slots: [
    {
      dayOffset: 0,
      role: "nurse" as const,
      start: "06:00",
      end: "18:00",
      endDayOffset: 0 as const,
      label: "A",
    },
    {
      dayOffset: 0,
      role: "driver" as const,
      start: "06:00",
      end: "18:00",
      endDayOffset: 0 as const,
      label: "A",
    },
    {
      dayOffset: 1,
      role: "nurse" as const,
      start: "18:00",
      end: "22:00",
      endDayOffset: 0 as const,
      label: "B",
    },
  ],
};
const fixedNow = () => new Date("2026-10-07T02:00:00.000Z");

describe("planned EFA coverage", () => {
  it("uses the Buenos Aires operational day instead of the UTC calendar day", () => {
    expect(getOperationalDate(new Date("2026-10-07T02:00:00.000Z"))).toBe("2026-10-06");
    expect(getOperationalDate(new Date("2026-10-07T03:00:00.000Z"))).toBe("2026-10-07");
  });

  it("expands a configurable cycle across month boundaries without inventing coverage", () => {
    const slots = expandStaffingPlan(cycle, "2026-11-02", "2026-11-03");
    expect(slots).toHaveLength(3);
    expect(slots.map(({ date, role, label }) => [date, role, label])).toEqual([
      ["2026-11-02", "nurse", "A"],
      ["2026-11-02", "driver", "A"],
      ["2026-11-03", "nurse", "B"],
    ]);
    expect(slots.some((slot) => slot.start === "22:00" && slot.end === "06:00")).toBe(false);
  });

  it("represents explicit overnight and 24-hour slots with both calendar boundaries", async () => {
    const slots = expandStaffingPlan(
      {
        ...cycle,
        cycleLengthDays: 1,
        slots: [
          {
            dayOffset: 0,
            role: "nurse",
            start: "22:00",
            end: "06:00",
            endDayOffset: 1,
            label: "Noche",
          },
          {
            dayOffset: 0,
            role: "doctor",
            start: "06:00",
            end: "06:00",
            endDayOffset: 1,
            label: "24h",
          },
        ],
      },
      "2026-10-07",
      "2026-10-07",
    );
    expect(
      slots.map(({ date, start, endDate, end, role }) => ({ date, start, endDate, end, role })),
    ).toEqual([
      { date: "2026-10-07", start: "22:00", endDate: "2026-10-08", end: "06:00", role: "nurse" },
      { date: "2026-10-07", start: "06:00", endDate: "2026-10-08", end: "06:00", role: "doctor" },
    ]);
    await expect(
      createEfaStaffingPlanService(memoryStore(), () => "overnight", fixedNow).savePlan("admin", {
        ...cycle,
        cycleLengthDays: 1,
        slots: [
          {
            dayOffset: 0,
            role: "nurse",
            start: "22:00",
            end: "06:00",
            endDayOffset: 1,
            label: "Noche",
          },
          {
            dayOffset: 0,
            role: "doctor",
            start: "06:00",
            end: "06:00",
            endDayOffset: 1,
            label: "24h",
          },
        ],
      }),
    ).resolves.toMatchObject({ slots: expect.any(Array) });
  });

  it("uses a dated replacement, including an explicitly empty exception, without changing history", async () => {
    const store = memoryStore();
    const service = createEfaStaffingPlanService(store, () => "id", fixedNow);
    const plan = await service.savePlan("admin", cycle);
    expect((await service.savePlan("admin", cycle)).id).toBe(plan.id);
    await expect(service.savePlan("admin", { ...cycle, slots: [] })).rejects.toThrow("otros datos");
    await service.saveException("admin", {
      target: cycle.target,
      date: "2026-11-02",
      slots: [],
      clientOperationId: "00000000-0000-4000-8000-000000000001",
    });
    const replay = await service.saveException("admin", {
      target: cycle.target,
      date: "2026-11-02",
      slots: [],
      clientOperationId: "00000000-0000-4000-8000-000000000001",
    });
    expect(replay.version).toBe(1);
    const preview = await service.preview("efa", {
      target: cycle.target,
      from: "2026-11-02",
      to: "2026-11-02",
    });
    expect(preview.slots).toEqual([]);
    expect(plan.effectiveFrom).toBe("2026-10-07");
    expect(preview.actualStaffing).toBe(false);
  });

  it("keys base plans by immutable base ID across renames and never reattaches a reused name", async () => {
    const store = memoryStore();
    let nextId = 0;
    const service = createEfaStaffingPlanService(store, () => `base-plan-${++nextId}`, fixedNow);
    const original = {
      kind: "base" as const,
      baseId: "00000000-0000-4000-8000-000000000050",
      name: "Central",
    };
    await service.savePlan("admin", { ...cycle, target: original });
    await service.saveException("admin", {
      target: original,
      date: "2026-11-02",
      slots: [],
      clientOperationId: "00000000-0000-4000-8000-000000000052",
    });
    const renamed = { ...original, name: "Central Sur" };
    expect(await service.list("efa", renamed)).toHaveLength(1);
    const reusedName = {
      kind: "base" as const,
      baseId: "00000000-0000-4000-8000-000000000051",
      name: "Central",
    };
    await service.savePlan("admin", {
      ...cycle,
      target: reusedName,
      clientOperationId: "00000000-0000-4000-8000-000000000053",
    });
    expect(
      await service.preview("efa", { target: renamed, from: "2026-11-02", to: "2026-11-02" }),
    ).toMatchObject({ slots: [] });
    expect(
      (await service.preview("efa", { target: reusedName, from: "2026-11-02", to: "2026-11-02" }))
        .slots,
    ).toHaveLength(2);
  });

  it("requires plan and exception dates after the Buenos Aires operational day", async () => {
    const beforeMidnight = createEfaStaffingPlanService(
      memoryStore(),
      () => crypto.randomUUID(),
      () => new Date("2026-10-07T02:00:00.000Z"),
    );
    await expect(
      beforeMidnight.savePlan("admin", {
        ...cycle,
        effectiveFrom: "2026-10-06",
        clientOperationId: "00000000-0000-4000-8000-000000000061",
      }),
    ).rejects.toThrow("después de hoy operativo");
    await beforeMidnight.savePlan("admin", {
      ...cycle,
      effectiveFrom: "2026-10-07",
      clientOperationId: "00000000-0000-4000-8000-000000000060",
    });
    const afterMidnight = createEfaStaffingPlanService(
      memoryStore(),
      () => crypto.randomUUID(),
      () => new Date("2026-10-07T03:00:00.000Z"),
    );
    await expect(
      afterMidnight.saveException("admin", {
        target: cycle.target,
        date: "2026-10-06",
        slots: [],
        clientOperationId: "00000000-0000-4000-8000-000000000062",
      }),
    ).rejects.toThrow("después de hoy operativo");
    await afterMidnight.saveException("admin", {
      target: cycle.target,
      date: "2026-10-08",
      slots: [],
      clientOperationId: "00000000-0000-4000-8000-000000000063",
    });
    await expect(
      afterMidnight.savePlan("admin", {
        ...cycle,
        effectiveFrom: "2026-10-07",
        clientOperationId: "00000000-0000-4000-8000-000000000064",
      }),
    ).rejects.toThrow("después de hoy operativo");
  });

  it("rejects edits to past exceptions so effective history cannot be rewritten", async () => {
    const service = createEfaStaffingPlanService(memoryStore(), () => "id", fixedNow);
    await expect(
      service.saveException("admin", {
        target: cycle.target,
        date: "2026-10-06",
        slots: [],
        clientOperationId: "00000000-0000-4000-8000-000000000002",
      }),
    ).rejects.toThrow("después de hoy operativo");
  });

  it("includes an overnight exception from the prior day in a next-day-only preview", async () => {
    const service = createEfaStaffingPlanService(
      memoryStore(),
      () => crypto.randomUUID(),
      fixedNow,
    );
    const startDate = "2026-10-08";
    await service.savePlan("admin", {
      ...cycle,
      effectiveFrom: startDate,
      cycleAnchor: startDate,
      cycleLengthDays: 2,
      slots: [
        {
          dayOffset: 0,
          role: "nurse",
          start: "22:00",
          end: "06:00",
          endDayOffset: 1,
          label: "Pattern overnight",
        },
      ],
      clientOperationId: "00000000-0000-4000-8000-000000000065",
    });
    await service.saveException("admin", {
      target: cycle.target,
      date: startDate,
      slots: [
        {
          role: "doctor",
          start: "20:00",
          end: "08:00",
          endDayOffset: 1,
          label: "Exception overnight",
        },
      ],
      clientOperationId: "00000000-0000-4000-8000-000000000066",
    });

    const preview = await service.preview("efa", {
      target: cycle.target,
      from: "2026-10-09",
      to: "2026-10-09",
    });
    expect(preview.slots).toEqual([
      {
        date: startDate,
        endDate: "2026-10-09",
        role: "doctor",
        start: "20:00",
        end: "08:00",
        endDayOffset: 1,
        label: "Exception overnight",
      },
    ]);
  });

  it("requires an administrator to mutate and preserves earlier effective versions", async () => {
    let nextId = 0;
    const service = createEfaStaffingPlanService(
      memoryStore(),
      () => `new-id-${++nextId}`,
      fixedNow,
    );
    await service.savePlan("efa", cycle).then(
      () => {
        throw new Error("expected authorization rejection");
      },
      (error) => expect(String(error)).toContain("administración"),
    );
    const first = await service.savePlan("admin", cycle);
    const second = await service.savePlan("admin", {
      ...cycle,
      effectiveFrom: "2026-11-01",
      slots: [],
      clientOperationId: "00000000-0000-4000-8000-000000000011",
    });
    expect(first.id).not.toBe(second.id);
  });
});
