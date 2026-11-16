import { describe, expect, it } from "vitest";
import {
  createCompensatoryLifecycleService,
  type CompensatoryLifecycleAudit,
  type CompensatoryDecisionNotification,
  type CompensatoryLifecycleLedger,
  type CompensatoryLifecycleRequest,
  type CompensatoryLifecycleStore,
  type CompensatoryLifecycleTransaction,
} from "./compensatory-lifecycle.server";
import type { StaffRecord } from "./compensatory-bank.server";

const actor = { isActive: true, isAdmin: true, name: "Coordination" };
const staff: StaffRecord = {
  id: "staff-1",
  dni: "12345678",
  name: "Ana Pérez",
  email: null,
  isActive: true,
  monthlyLimitMinutes: 1440,
  version: 1,
  balanceMinutes: 240,
  createdAt: new Date("2026-01-01T00:00:00Z"),
};
function rawRequest(id = "request-1"): CompensatoryLifecycleRequest {
  return {
    id,
    clientOperationId: `import-${id}`,
    staffId: staff.id,
    submittedAt: "2026-10-01T12:00:00Z",
    requesterName: "Ana Pérez",
    requesterMobile: "555",
    requesterEmail: "ana@example.org",
    requesterEmailVerifiedAt: null,
    compensatoryDate: "Saturday",
    hours: "2",
    createdAt: new Date("2026-10-01T12:00:00Z"),
    phase: "unclassified",
    version: 1,
    requestedDate: null,
    requestedMinutes: null,
    classifiedAt: null,
    classifiedByUserId: null,
    decisionAt: null,
    decisionByUserId: null,
    decisionReason: null,
    cancelledAt: null,
    cancellationByUserId: null,
    cancellationReason: null,
    consumedAt: null,
    consumptionLedgerId: null,
  };
}
function createMemory() {
  let currentStaff = structuredClone(staff);
  let requests = [rawRequest()];
  let audits: CompensatoryLifecycleAudit[] = [];
  let notifications: CompensatoryDecisionNotification[] = [];
  let ledger: CompensatoryLifecycleLedger[] = [];
  const operations = new Map<string, { payloadHash: string; resultId: string }>();
  let day = "2026-10-27";
  let time = new Date("2026-10-27T12:00:00.000Z");
  let serial = 0;
  let shouldFailNotificationWrite = false;
  let tail = Promise.resolve();
  const tx: CompensatoryLifecycleTransaction = {
    async findActor(id) {
      return id === "admin" ? actor : null;
    },
    async listStaff() {
      return [currentStaff];
    },
    async lockStaff(id) {
      return id === currentStaff.id ? currentStaff : null;
    },
    async findRequest(id) {
      return requests.find((item) => item.id === id) ?? null;
    },
    async lockRequest(id) {
      return requests.find((item) => item.id === id) ?? null;
    },
    async listRequests(staffId) {
      return requests.filter((item) => !staffId || item.staffId === staffId);
    },
    async listRequestAudits(ids) {
      return audits.filter((item) => ids.includes(item.requestId));
    },
    async lockOperation() {},
    async findOperation(actorId, operationId) {
      return operations.get(`${actorId}:${operationId}`) ?? null;
    },
    async insertOperation(actorId, operationId, _action, payloadHash, resultId) {
      operations.set(`${actorId}:${operationId}`, { payloadHash, resultId });
    },
    async updateRequest(id, expectedVersion, changes) {
      const request = requests.find((item) => item.id === id);
      if (!request || request.version !== expectedVersion)
        throw new Error("La solicitud cambió; actualiza la lista.");
      Object.assign(request, changes);
    },
    async insertRequestAudit(item) {
      audits.push(item);
    },
    async insertDecisionNotification(item) {
      if (shouldFailNotificationWrite) throw new Error("notification persistence failed");
      notifications.push(item);
    },
    async reservedMinutes(staffId) {
      return requests
        .filter((item) => item.staffId === staffId && item.phase === "approved")
        .reduce((sum, item) => sum + (item.requestedMinutes ?? 0), 0);
    },
    async updateStaffBalance(_id, balanceMinutes) {
      currentStaff = { ...currentStaff, balanceMinutes };
    },
    async insertConsumptionLedger(item) {
      ledger.push(item);
    },
    async dueRequests(forDay) {
      return requests
        .filter(
          (item) =>
            item.phase === "approved" && !!item.requestedDate && item.requestedDate <= forDay,
        )
        .map(({ id, staffId }) => ({ id, staffId }));
    },
    async databaseNow() {
      return new Date(time);
    },
    async serviceDay() {
      return day;
    },
  };
  const store: CompensatoryLifecycleStore = {
    async transaction(work) {
      let release!: () => void;
      const prior = tail;
      tail = new Promise<void>((resolve) => {
        release = resolve;
      });
      await prior;
      const snapshot = structuredClone({
        currentStaff,
        requests,
        audits,
        notifications,
        ledger,
        operations: [...operations],
      });
      try {
        return await work(tx);
      } catch (error) {
        currentStaff = snapshot.currentStaff;
        requests = snapshot.requests;
        audits = snapshot.audits;
        notifications = snapshot.notifications;
        ledger = snapshot.ledger;
        operations.clear();
        snapshot.operations.forEach(([key, value]) => operations.set(key, value));
        throw error;
      } finally {
        release();
      }
    },
  };
  const service = createCompensatoryLifecycleService(store, () => `event-${++serial}`);
  return {
    service,
    requests: () => requests,
    audits: () => audits,
    notifications: () => notifications,
    failNotificationWrites() {
      shouldFailNotificationWrite = true;
    },
    ledger: () => ledger,
    staff: () => currentStaff,
    setDay(value: string) {
      day = value;
      time = new Date(`${value}T12:00:00.000Z`);
    },
    addRequest(id: string, changes: Partial<CompensatoryLifecycleRequest> = {}) {
      requests.push({ ...rawRequest(id), ...changes });
    },
  };
}
const classify = (
  clientOperationId = "classify-1",
  minutes = 120,
  requestedDate = "2026-10-28",
) => ({
  requestId: "request-1",
  expectedVersion: 1,
  requestedDate,
  minutes,
  reason: "Solicitud confirmada por administración",
  clientOperationId,
});

describe("compensatory lifecycle service", () => {
  it("keeps imported history unclassified until explicit classification and classifies idempotently", async () => {
    const memory = createMemory();
    expect(memory.requests()[0]?.phase).toBe("unclassified");
    expect(await memory.service.getWorkspace("admin")).toMatchObject({
      serviceDay: "2026-10-27",
      timeZone: "America/Argentina/Buenos_Aires",
      staff: [{ reservedMinutes: 0, availableMinutes: 240 }],
    });
    await expect(
      memory.service.decide("admin", {
        requestId: "request-1",
        expectedVersion: 1,
        decision: "approve",
        reason: "No está clasificada",
        clientOperationId: "approve-before-classify",
      }),
    ).rejects.toThrow("pendiente");
    await expect(memory.service.classify("admin", classify())).resolves.toEqual({
      id: "request-1",
    });
    await expect(memory.service.classify("admin", classify())).resolves.toEqual({
      id: "request-1",
    });
    expect(memory.requests()[0]).toMatchObject({
      phase: "pending",
      requestedDate: "2026-10-28",
      requestedMinutes: 120,
      version: 2,
      compensatoryDate: "Saturday",
      hours: "2",
    });
    expect(memory.audits().map((item) => item.action)).toEqual(["classified"]);
    await expect(
      memory.service.classify("admin", { ...classify("conflict"), expectedVersion: 1 }),
    ).rejects.toThrow("cambió");
    await expect(
      memory.service.classify("admin", { ...classify("classify-1"), minutes: 121 }),
    ).rejects.toThrow("clave");
  });

  it("includes a new public pending request in the coordination workspace without reserving or consuming it", async () => {
    const memory = createMemory();
    memory.addRequest("public-request", {
      phase: "pending",
      requesterEmail: "contact@example.org",
      requesterEmailVerifiedAt: null,
      submissionSource: "public",
      requestedDate: "2026-10-30",
      requestedMinutes: 90,
    });
    const workspace = await memory.service.getWorkspace("admin");
    expect(workspace.requests).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: "public-request",
          phase: "pending",
          requestedDate: "2026-10-30",
          requestedMinutes: 90,
          requesterEmail: "contact@example.org",
          requesterEmailVerifiedAt: null,
        }),
      ]),
    );
    expect(workspace.staff[0]).toMatchObject({ reservedMinutes: 0, balanceMinutes: 240 });
    expect(memory.ledger()).toEqual([]);
    expect(memory.audits()).toEqual([]);
  });

  it("reserves at approval, rejects insufficient balances, and releases on pre-cutoff cancellation", async () => {
    const memory = createMemory();
    await memory.service.classify("admin", classify());
    await memory.service.decide("admin", {
      requestId: "request-1",
      expectedVersion: 2,
      decision: "approve",
      reason: "Aprobado",
      clientOperationId: "approve-1",
    });
    expect(memory.requests()[0]?.phase).toBe("approved");
    expect((await memory.service.getWorkspace("admin")).staff[0]).toMatchObject({
      balanceMinutes: 240,
      reservedMinutes: 120,
      availableMinutes: 120,
    });
    await expect(
      memory.service.cancel("admin", {
        requestId: "request-1",
        expectedVersion: 3,
        reason: "Cambio de fecha",
        clientOperationId: "cancel-1",
      }),
    ).resolves.toEqual({ id: "request-1" });
    expect(memory.requests()[0]?.phase).toBe("cancelled");
    expect(memory.notifications()).toHaveLength(2);
    expect((await memory.service.getWorkspace("admin")).staff[0]).toMatchObject({
      balanceMinutes: 240,
      reservedMinutes: 0,
      availableMinutes: 240,
    });

    const second = createMemory();
    await second.service.classify("admin", {
      ...classify(),
      requestedDate: "2026-10-29",
      minutes: 250,
    });
    await expect(
      second.service.decide("admin", {
        requestId: "request-1",
        expectedVersion: 2,
        decision: "approve",
        reason: "Insufficient",
        clientOperationId: "approve-no-credit",
      }),
    ).rejects.toThrow("disponible");
    expect(second.requests()[0]?.phase).toBe("pending");
    expect(second.notifications()).toEqual([]);
  });

  it("serializes concurrent approvals against one staff balance and rejects without reserving", async () => {
    const memory = createMemory();
    memory.addRequest("request-2");
    await memory.service.classify("admin", classify("classify-a", 130));
    await memory.service.classify("admin", {
      ...classify("classify-b", 130),
      requestId: "request-2",
    });
    const results = await Promise.allSettled([
      memory.service.decide("admin", {
        requestId: "request-1",
        expectedVersion: 2,
        decision: "approve",
        reason: "Approve A",
        clientOperationId: "approve-a",
      }),
      memory.service.decide("admin", {
        requestId: "request-2",
        expectedVersion: 2,
        decision: "approve",
        reason: "Approve B",
        clientOperationId: "approve-b",
      }),
    ]);
    expect(results.filter((item) => item.status === "fulfilled")).toHaveLength(1);
    expect(memory.requests().filter((item) => item.phase === "approved")).toHaveLength(1);
    expect((await memory.service.getWorkspace("admin")).staff[0]).toMatchObject({
      reservedMinutes: 130,
      availableMinutes: 110,
    });

    const rejected = createMemory();
    await rejected.service.classify("admin", classify());
    await rejected.service.decide("admin", {
      requestId: "request-1",
      expectedVersion: 2,
      decision: "reject",
      reason: "No autorizado",
      clientOperationId: "reject-1",
    });
    expect(rejected.requests()[0]?.phase).toBe("rejected");
    expect(rejected.notifications()).toHaveLength(2);
    expect((await rejected.service.getWorkspace("admin")).staff[0]).toMatchObject({
      reservedMinutes: 0,
      availableMinutes: 240,
    });
  });

  it("consumes same-day approvals immediately and catches up overdue approved work once", async () => {
    const sameDay = createMemory();
    await sameDay.service.classify("admin", {
      ...classify(),
      requestedDate: "2026-10-27",
      minutes: 60,
    });
    await sameDay.service.decide("admin", {
      requestId: "request-1",
      expectedVersion: 2,
      decision: "approve",
      reason: "Aprobado para hoy",
      clientOperationId: "approve-today",
    });
    expect(sameDay.requests()[0]).toMatchObject({ phase: "consumed", version: 4 });
    expect(sameDay.ledger()).toHaveLength(1);
    expect(sameDay.ledger()[0]).toMatchObject({
      kind: "request_consumption",
      minutes: -60,
      actorUserId: null,
      actorKind: "system",
      requestId: "request-1",
    });
    expect(sameDay.staff().balanceMinutes).toBe(180);

    const overdue = createMemory();
    await overdue.service.classify("admin", {
      ...classify(),
      requestedDate: "2026-10-28",
      minutes: 60,
    });
    await overdue.service.decide("admin", {
      requestId: "request-1",
      expectedVersion: 2,
      decision: "approve",
      reason: "Aprobado",
      clientOperationId: "approve-overdue",
    });
    overdue.setDay("2026-10-30");
    expect((await overdue.service.getWorkspace("admin")).staff[0]).toMatchObject({
      reservedMinutes: 60,
      availableMinutes: 180,
    });
    await expect(overdue.service.processDue()).resolves.toEqual({ consumed: 1 });
    await expect(overdue.service.processDue()).resolves.toEqual({ consumed: 0 });
    expect(overdue.ledger()).toHaveLength(1);
    expect(overdue.staff().balanceMinutes).toBe(180);
  });

  it("queues immutable requester and admin decision notices once without changing same-day consumption", async () => {
    const memory = createMemory();
    await memory.service.classify("admin", classify("classify-queue", 120, "2026-10-27"));
    memory.setDay("2026-10-27");
    await memory.service.decide("admin", {
      requestId: "request-1",
      expectedVersion: 2,
      decision: "approve",
      reason: "Approved after review",
      clientOperationId: "decision-queue",
    });
    const first = memory.notifications();
    expect(first).toHaveLength(2);
    expect(first.map((item) => item.recipientKind)).toEqual(["requester", "admin"]);
    expect(first[0]).toMatchObject({
      requestId: "request-1",
      decisionVersion: 3,
      decision: "approved",
      recipient: "ana@example.org",
      status: "pending_review",
      reason: "Approved after review",
    });
    expect(first[0]?.text).toContain("Fundamento: Approved after review");
    expect(first[0]?.text).toContain("2026-10-27");
    expect(first[0]?.text).toContain("Horas solicitadas: 2 horas");
    expect(first[0]?.text).not.toContain("minutos");
    expect(first[1]).toMatchObject({ recipient: null, status: "pending_recipient" });
    expect(first[1]?.text).toContain("Agente: Ana Pérez");
    expect(first[1]?.text).toContain("Horas solicitadas: 2 horas");
    await memory.service.decide("admin", {
      requestId: "request-1",
      expectedVersion: 2,
      decision: "approve",
      reason: "Approved after review",
      clientOperationId: "decision-queue",
    });
    expect(memory.notifications()).toEqual(first);
    expect(memory.requests()[0]).toMatchObject({ phase: "consumed", version: 4 });
    expect(memory.notifications().map((item) => item.decisionVersion)).toEqual([3, 3]);
  });

  it("rolls back a decision when durable notification persistence fails", async () => {
    const memory = createMemory();
    await memory.service.classify("admin", classify("classify-failed-queue"));
    memory.failNotificationWrites();
    await expect(
      memory.service.decide("admin", {
        requestId: "request-1",
        expectedVersion: 2,
        decision: "reject",
        reason: "Rejected after review",
        clientOperationId: "decision-failed-queue",
      }),
    ).rejects.toThrow("notification persistence failed");
    expect(memory.requests()[0]).toMatchObject({ phase: "pending", version: 2 });
    expect(memory.audits().map((item) => item.action)).toEqual(["classified"]);
    expect(memory.notifications()).toEqual([]);
  });

  it("describes fractional requested hours in rejection emails for both recipients", async () => {
    const memory = createMemory();
    await memory.service.classify("admin", classify("classify-hours", 150));
    await memory.service.decide("admin", {
      requestId: "request-1", expectedVersion: 2, decision: "reject",
      reason: "Sin disponibilidad", clientOperationId: "reject-hours",
    });
    for (const notification of memory.notifications()) {
      expect(notification.text).toContain("Horas solicitadas: 2,5 horas");
      expect(notification.text).toContain("rechazada");
      expect(notification.text).not.toContain("150 minutos");
    }
  });

  it("blocks overdue cancellation and requires an active administrator", async () => {
    const memory = createMemory();
    await memory.service.classify("admin", classify());
    await memory.service.decide("admin", {
      requestId: "request-1",
      expectedVersion: 2,
      decision: "approve",
      reason: "Aprobado",
      clientOperationId: "approve-late",
    });
    memory.setDay("2026-10-28");
    await expect(
      memory.service.cancel("admin", {
        requestId: "request-1",
        expectedVersion: 3,
        reason: "Tarde",
        clientOperationId: "cancel-late",
      }),
    ).rejects.toThrow("efectivización");
    await expect(memory.service.getWorkspace("nurse")).rejects.toThrow("administración");
  });

  it("makes a cutoff-day cancellation race with settlement resolve to one terminal outcome", async () => {
    const memory = createMemory();
    await memory.service.classify("admin", classify());
    await memory.service.decide("admin", {
      requestId: "request-1",
      expectedVersion: 2,
      decision: "approve",
      reason: "Aprobado",
      clientOperationId: "approve-race",
    });
    memory.setDay("2026-10-28");
    const [cancellation] = await Promise.allSettled([
      memory.service.cancel("admin", {
        requestId: "request-1",
        expectedVersion: 3,
        reason: "Race",
        clientOperationId: "cancel-race",
      }),
      memory.service.processDue(),
    ]);
    expect(cancellation?.status).toBe("rejected");
    expect(memory.requests()[0]?.phase).toBe("consumed");
    expect(memory.ledger()).toHaveLength(1);
  });
});
