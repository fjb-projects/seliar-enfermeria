import { describe, expect, it } from "vitest";
import {
  createCompensatoryCoverageService,
  emptyCompensatoryCoverage,
  type CompensatoryCoverageStore,
  type CompensatoryCoverageTransaction,
  type CompensatoryCoverageState,
  type CoverageRequest,
  type CoverageAssignmentRecord,
  type CoverageAuditRecord,
} from "./compensatory-coverage.server";

const REQUEST = "10000000-0000-4000-8000-000000000001";
const OWNER = "10000000-0000-4000-8000-000000000002";
const COVERER = "10000000-0000-4000-8000-000000000003";
const OTHER = "10000000-0000-4000-8000-000000000004";
const OP = "10000000-0000-4000-8000-000000000005";

class MemoryStore implements CompensatoryCoverageStore {
  phase = "approved";
  assignments: CoverageAssignmentRecord[] = [];
  plan: Omit<CompensatoryCoverageState, "assignments" | "history"> | null = null;
  histories: CompensatoryCoverageState["history"] = [];
  operations = new Map<string, { payloadHash: string; result: CompensatoryCoverageState }>();
  auditWrites: CoverageAuditRecord[] = [];
  staffLockBatch: string[] = [];
  staffLockHook: ((ids: string[]) => Promise<void>) | undefined;
  requestLockObserved = false;
  bankWrites = 0;
  staff = [
    { id: OWNER, name: "Owner Current Name", isActive: true },
    { id: COVERER, name: "Coverer Current Name", isActive: true },
    { id: OTHER, name: "Another Current Name", isActive: true },
  ];

  async transaction<T>(work: (tx: CompensatoryCoverageTransaction) => Promise<T>) {
    const request: CoverageRequest = {
      id: REQUEST,
      staffId: OWNER,
      phase: this.phase,
      requestedDate: "2025-01-01",
      requestedMinutes: 240,
    };
    const tx: CompensatoryCoverageTransaction = {
      findActor: async (userId) =>
        userId === "admin"
          ? { isActive: true, isAdmin: true, name: "Admin Current Name" }
          : { isActive: false, isAdmin: true, name: "Inactive" },
      lockOperation: async () => {},
      findOperation: async (_actor, _request, id) => this.operations.get(id) ?? null,
      lockStaffIds: async (ids) => {
        this.staffLockBatch = ids;
        await this.staffLockHook?.(ids);
      },
      findRequest: async () => ({ ...request, phase: this.phase }),
      lockRequest: async () => {
        this.requestLockObserved = true;
        return { ...request, phase: this.phase };
      },
      listAssignments: async (requestId) =>
        this.assignments.filter((a) => a.requestId === requestId),
      getPlan: async () => this.plan,
      listHistory: async () => this.histories,
      findStaff: async (ids) => this.staff.filter((member) => ids.includes(member.id)),
      findOverlappingAssignments: async (staffId, start, end, excludeRequestId) =>
        this.assignments
          .filter(
            (a) =>
              a.staffId === staffId &&
              a.requestId !== excludeRequestId &&
              a.start < end &&
              a.end > start,
          )
          .map((a) => ({ requestId: a.requestId, phase: this.phase, start: a.start, end: a.end })),
      savePlan: async (_requestId, plan) => {
        this.plan = plan;
      },
      replaceAssignments: async (requestId, assignments) => {
        this.assignments = this.assignments
          .filter((a) => a.requestId !== requestId)
          .concat(assignments.map((a) => ({ ...a, requestId })));
      },
      insertAudit: async (audit) => {
        this.auditWrites.push(audit);
        this.histories = [
          ...this.histories,
          {
            actorName: audit.actorName,
            reason: audit.reason,
            occurredAt: audit.occurredAt.toISOString(),
            version: audit.version,
            before: audit.before,
            after: audit.after,
          },
        ];
      },
      insertOperation: async (actor, requestId, id, payloadHash, result) => {
        this.operations.set(id, { payloadHash, result });
      },
    };
    return work(tx);
  }
}

function payload(
  overrides: Partial<
    Parameters<ReturnType<typeof createCompensatoryCoverageService>["saveCompensatoryCoverage"]>[1]
  > = {},
) {
  return {
    requestId: REQUEST,
    clientOperationId: OP,
    expectedVersion: 0,
    plannedStart: "2025-01-01T08:00-03:00",
    plannedEnd: "2025-01-01T12:00-03:00",
    assignments: [],
    reason: "Coordinate coverage",
    ...overrides,
  };
}

describe("compensatory coverage service", () => {
  it("returns typed empty version zero without creating a bank movement", async () => {
    const store = new MemoryStore();
    const service = createCompensatoryCoverageService(store);
    expect(emptyCompensatoryCoverage()).toEqual({
      version: 0,
      plannedStart: null,
      plannedEnd: null,
      assignments: [],
      status: "pending",
      history: [],
    });
    expect(await service.getCompensatoryCoverage("admin", REQUEST)).toEqual(
      emptyCompensatoryCoverage(),
    );
    expect(store.bankWrites).toBe(0);
  });

  it("derives partial status from gaps and confirmed only from complete interval union", async () => {
    const store = new MemoryStore();
    const service = createCompensatoryCoverageService(store);
    const partial = await service.saveCompensatoryCoverage(
      "admin",
      payload({
        assignments: [
          {
            staffId: COVERER,
            start: "2025-01-01T08:00-03:00",
            end: "2025-01-01T09:00-03:00",
            confirmed: true,
            verificationMethod: "Phone",
          },
          {
            staffId: OTHER,
            start: "2025-01-01T10:00-03:00",
            end: "2025-01-01T12:00-03:00",
            confirmed: true,
            verificationMethod: "Email",
          },
        ],
      }),
    );
    expect(partial.status).toBe("partial");
    const confirmed = await service.saveCompensatoryCoverage(
      "admin",
      payload({
        expectedVersion: 1,
        clientOperationId: "10000000-0000-4000-8000-000000000006",
        assignments: [
          {
            staffId: COVERER,
            start: "2025-01-01T08:00-03:00",
            end: "2025-01-01T10:00-03:00",
            confirmed: true,
            verificationMethod: "Phone",
          },
          {
            staffId: OTHER,
            start: "2025-01-01T10:00-03:00",
            end: "2025-01-01T12:00-03:00",
            confirmed: true,
            verificationMethod: "Email",
          },
        ],
      }),
    );
    expect(confirmed.status).toBe("confirmed");
    expect(confirmed.assignments[0]!.staffName).toBe("Coverer Current Name");
    expect(confirmed.history[1]!.before.version).toBe(1);
    expect(confirmed.history[1]!.after.version).toBe(2);
    expect(store.auditWrites).toHaveLength(2);
    expect(store.bankWrites).toBe(0);
  });

  it("supports overnight windows when BA service date and exact requested duration match", async () => {
    const store = new MemoryStore();
    const service = createCompensatoryCoverageService(store);
    const result = await service.saveCompensatoryCoverage(
      "admin",
      payload({
        plannedStart: "2025-01-01T22:00-03:00",
        plannedEnd: "2025-01-02T02:00-03:00",
        assignments: [
          {
            staffId: COVERER,
            start: "2025-01-01T22:00-03:00",
            end: "2025-01-02T02:00-03:00",
            confirmed: true,
            verificationMethod: "Phone",
          },
        ],
      }),
    );
    expect(result.plannedStart).toBe("2025-01-02T01:00:00.000Z");
    expect(result.status).toBe("confirmed");
    expect(store.staffLockBatch).toEqual([OWNER, COVERER]);
  });

  it("permits touching assignments but rejects overlapping assignment segments", async () => {
    const service = createCompensatoryCoverageService(new MemoryStore());
    const touch = await service.saveCompensatoryCoverage(
      "admin",
      payload({
        assignments: [
          {
            staffId: COVERER,
            start: "2025-01-01T08:00-03:00",
            end: "2025-01-01T10:00-03:00",
            confirmed: false,
            verificationMethod: null,
          },
          {
            staffId: OTHER,
            start: "2025-01-01T10:00-03:00",
            end: "2025-01-01T12:00-03:00",
            confirmed: false,
            verificationMethod: null,
          },
        ],
      }),
    );
    expect(touch.status).toBe("partial");
    await expect(
      createCompensatoryCoverageService(new MemoryStore()).saveCompensatoryCoverage(
        "admin",
        payload({
          assignments: [
            {
              staffId: COVERER,
              start: "2025-01-01T08:00-03:00",
              end: "2025-01-01T10:01-03:00",
              confirmed: false,
              verificationMethod: null,
            },
            {
              staffId: OTHER,
              start: "2025-01-01T10:00-03:00",
              end: "2025-01-01T12:00-03:00",
              confirmed: false,
              verificationMethod: null,
            },
          ],
        }),
      ),
    ).rejects.toThrow("no pueden superponerse");
  });

  it("requires explicit offsets, matching service date and exact minute duration", async () => {
    const service = createCompensatoryCoverageService(new MemoryStore());
    await expect(
      service.saveCompensatoryCoverage(
        "admin",
        payload({ plannedStart: "2025-01-01T08:00", plannedEnd: "2025-01-01T12:00" }),
      ),
    ).rejects.toThrow("zona horaria explícita");
    await expect(
      service.saveCompensatoryCoverage(
        "admin",
        payload({ plannedStart: "2025-01-02T08:00-03:00", plannedEnd: "2025-01-02T12:00-03:00" }),
      ),
    ).rejects.toThrow("fecha de servicio");
    await expect(
      service.saveCompensatoryCoverage("admin", payload({ plannedEnd: "2025-01-01T11:59-03:00" })),
    ).rejects.toThrow("coincidir con los minutos");
    await expect(
      service.saveCompensatoryCoverage(
        "admin",
        payload({
          assignments: [
            {
              staffId: COVERER,
              start: "2025-01-01T08:00-03:00",
              end: "2025-01-01T09:00-03:00",
              confirmed: true,
              verificationMethod: null,
            },
          ],
        }),
      ),
    ).rejects.toThrow("verificación manual");
  });

  it("rejects known live-request conflicts, self-cover and inactive coverers", async () => {
    const conflictStore = new MemoryStore();
    conflictStore.assignments = [
      {
        requestId: "10000000-0000-4000-8000-000000000099",
        staffId: COVERER,
        staffName: "Coverer Current Name",
        start: "2025-01-01T12:00:00.000Z",
        end: "2025-01-01T14:00:00.000Z",
        confirmed: false,
        verificationMethod: null,
      },
    ];
    await expect(
      createCompensatoryCoverageService(conflictStore).saveCompensatoryCoverage(
        "admin",
        payload({
          assignments: [
            {
              staffId: COVERER,
              start: "2025-01-01T09:00-03:00",
              end: "2025-01-01T11:00-03:00",
              confirmed: false,
              verificationMethod: null,
            },
          ],
        }),
      ),
    ).rejects.toThrow("otra cobertura asignada");
    const service = createCompensatoryCoverageService(new MemoryStore());
    await expect(
      service.saveCompensatoryCoverage(
        "admin",
        payload({
          assignments: [
            {
              staffId: OWNER,
              start: "2025-01-01T08:00-03:00",
              end: "2025-01-01T12:00-03:00",
              confirmed: false,
              verificationMethod: null,
            },
          ],
        }),
      ),
    ).rejects.toThrow("no puede cubrir su propia");
    const inactive = new MemoryStore();
    inactive.staff.find((s) => s.id === COVERER)!.isActive = false;
    await expect(
      createCompensatoryCoverageService(inactive).saveCompensatoryCoverage(
        "admin",
        payload({
          assignments: [
            {
              staffId: COVERER,
              start: "2025-01-01T08:00-03:00",
              end: "2025-01-01T12:00-03:00",
              confirmed: false,
              verificationMethod: null,
            },
          ],
        }),
      ),
    ).rejects.toThrow("no está activo");
  });

  it("replays an identical operation before optimistic version validation and rejects changed payload", async () => {
    const store = new MemoryStore();
    const service = createCompensatoryCoverageService(store);
    const first = await service.saveCompensatoryCoverage("admin", payload());
    const replay = await service.saveCompensatoryCoverage("admin", payload());
    expect(replay).toEqual(first);
    await expect(
      service.saveCompensatoryCoverage("admin", payload({ reason: "different" })),
    ).rejects.toThrow("clave de operación");
    await expect(
      service.saveCompensatoryCoverage(
        "admin",
        payload({ clientOperationId: "10000000-0000-4000-8000-000000000006", expectedVersion: 0 }),
      ),
    ).rejects.toThrow("cambió");
  });

  it("keeps audit snapshots flat across three or more saves while retaining chronological versions", async () => {
    const store = new MemoryStore();
    const service = createCompensatoryCoverageService(store);
    await service.saveCompensatoryCoverage("admin", payload());
    await service.saveCompensatoryCoverage(
      "admin",
      payload({
        expectedVersion: 1,
        clientOperationId: "10000000-0000-4000-8000-000000000006",
        reason: "Second version",
      }),
    );
    const third = await service.saveCompensatoryCoverage(
      "admin",
      payload({
        expectedVersion: 2,
        clientOperationId: "10000000-0000-4000-8000-000000000007",
        reason: "Third version",
      }),
    );

    expect(third.history.map((entry) => entry.version)).toEqual([1, 2, 3]);
    expect(third.history.map((entry) => [entry.before.version, entry.after.version])).toEqual([
      [0, 1],
      [1, 2],
      [2, 3],
    ]);
    for (const audit of store.auditWrites) {
      expect(audit.before.history).toEqual([]);
      expect(audit.after.history).toEqual([]);
    }
    expect(JSON.stringify(store.auditWrites)).not.toContain('"history":[{"actorName"');
  });

  it("requires an active admin and only allows approved or consumed requests", async () => {
    const inactive = createCompensatoryCoverageService(new MemoryStore());
    await expect(inactive.getCompensatoryCoverage("not-admin", REQUEST)).rejects.toThrow(
      "administración vigente",
    );
    const store = new MemoryStore();
    store.phase = "cancelled";
    await expect(
      createCompensatoryCoverageService(store).saveCompensatoryCoverage("admin", payload()),
    ).rejects.toThrow("aprobada o consumida");
    expect(store.plan).toBeNull();
    expect(store.auditWrites).toHaveLength(0);
    expect(store.operations.size).toBe(0);
    expect(store.bankWrites).toBe(0);
    store.phase = "unclassified";
    await expect(
      createCompensatoryCoverageService(store).saveCompensatoryCoverage("admin", payload()),
    ).rejects.toThrow("aprobada o consumida");
  });

  it("rechecks staff active state after a serialized deactivation and writes nothing on rejection", async () => {
    const store = new MemoryStore();
    let reachedStaffLock!: () => void;
    let releaseStaffLock!: () => void;
    const reached = new Promise<void>((resolve) => {
      reachedStaffLock = resolve;
    });
    const deactivationCommit = new Promise<void>((resolve) => {
      releaseStaffLock = resolve;
    });
    store.staffLockHook = async () => {
      reachedStaffLock();
      await deactivationCommit;
    };
    const service = createCompensatoryCoverageService(store);
    const pendingSave = service.saveCompensatoryCoverage(
      "admin",
      payload({
        assignments: [
          {
            staffId: COVERER,
            start: "2025-01-01T08:00-03:00",
            end: "2025-01-01T12:00-03:00",
            confirmed: false,
            verificationMethod: null,
          },
        ],
      }),
    );
    await reached;
    store.staff.find((staff) => staff.id === COVERER)!.isActive = false;
    releaseStaffLock();

    await expect(pendingSave).rejects.toThrow("no está activo");
    expect(store.requestLockObserved).toBe(true);
    expect(store.plan).toBeNull();
    expect(store.assignments).toEqual([]);
    expect(store.auditWrites).toEqual([]);
    expect(store.operations.size).toBe(0);
  });
});
