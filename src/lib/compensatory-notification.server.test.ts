import { describe, expect, it, vi } from "vitest";
import {
  createCompensatoryNotificationService,
  type CompensatoryNotification,
  type NotificationAttempt,
  type CompensatoryNotificationStore,
  type CompensatoryNotificationTransaction,
} from "./compensatory-notification.server";

const seed: CompensatoryNotification = {
  id: "00000000-0000-4000-8000-000000000001", requestId: "request-1", decisionVersion: 2,
  recipientKind: "requester", recipient: "ana@example.org", status: "pending_review",
  subject: "Resolution", text: "Your request was approved.", decision: "approved",
  reason: "Approved", createdAt: new Date("2026-10-30T12:00:00Z"),
  reviewedByUserId: null, reviewedAt: null, idempotencyKey: null, providerId: null,
  lastAttemptAt: null,
};

function memory(initial: CompensatoryNotification = seed) {
  let notification = structuredClone(initial);
  const attempts: NotificationAttempt[] = [];
  const operations = new Map<string, { payloadHash: string; status: string }>();
  let locked = Promise.resolve();
  const tx: CompensatoryNotificationTransaction = {
    async findActor(id) { return id === "admin" ? { isActive: true, isAdmin: true, name: "Admin" } : null; },
    async listNotifications(requestId) { return notification.requestId === requestId ? [structuredClone(notification)] : []; },
    async lockNotification(id) { return id === notification.id ? notification : null; },
    async lockOperation(actorId, operationId) { void actorId; void operationId; },
    async findOperation(actorId, operationId) { return operations.get(`${actorId}:${operationId}`) ?? null; },
    async updateNotification(_id, changes) { Object.assign(notification, changes); },
    async insertAttempt(attempt) { attempts.push(attempt); operations.set(`${attempt.actorUserId}:${attempt.clientOperationId}`, { payloadHash: attempt.payloadHash, status: attempt.status }); },
    async updateAttempt(actorId, operationId, changes) {
      const attempt = attempts.find((item) => item.actorUserId === actorId && item.clientOperationId === operationId);
      if (attempt) { Object.assign(attempt, changes); const operation = operations.get(`${actorId}:${operationId}`); if (operation && changes.status) operation.status = changes.status; }
    },
    async markStaleSending(_notificationId, uncertainAt) {
      notification.status = "uncertain";
      notification.lastAttemptAt = uncertainAt;
      attempts.filter((item) => item.status === "sending").forEach((item) => { item.status = "uncertain"; item.completedAt = uncertainAt; });
    },
    async databaseNow() { return new Date("2026-10-30T12:01:00Z"); },
  };
  const store: CompensatoryNotificationStore = {
    async transaction(work) {
      let release!: () => void;
      const before = locked;
      locked = new Promise<void>((resolve) => { release = resolve; });
      await before;
      const snapshot = structuredClone({ notification, attempts, operations: [...operations] });
      try { return await work(tx); }
      catch (error) {
        notification = snapshot.notification;
        attempts.splice(0, attempts.length, ...snapshot.attempts);
        operations.clear(); snapshot.operations.forEach(([key, value]) => operations.set(key, value));
        throw error;
      } finally { release(); }
    },
  };
  return { service: createCompensatoryNotificationService(store), get: () => ({ notification, attempts }) };
}

describe("compensatory notification review and dispatch", () => {
  it("requires active administration to list queued messages", async () => {
    const { service } = memory();
    await expect(service.listCompensatoryNotifications("guest", "request-1")).rejects.toThrow();
    await expect(service.listCompensatoryNotifications("admin", "request-1")).resolves.toHaveLength(1);
  });

  it("requires explicit confirmation and a validated recipient before reserving a send", async () => {
    const { service, get } = memory();
    await expect(service.reviewAndSendCompensatoryNotification("admin", {
      notificationId: seed.id, recipient: "evil\r\n@example.org", confirmed: true,
      clientOperationId: "operation-1",
    }, { send: vi.fn(), configuration: null })).rejects.toThrow();
    await expect(service.reviewAndSendCompensatoryNotification("admin", {
      notificationId: seed.id, recipient: "ana@example.org", confirmed: false,
      clientOperationId: "operation-1",
    }, { send: vi.fn(), configuration: null })).rejects.toThrow();
    expect(get().notification.status).toBe("pending_review");
    expect(get().attempts).toHaveLength(0);
  });

  it("requires active administration for writes before the transport can run", async () => {
    const { service } = memory();
    const send = vi.fn();
    await expect(service.reviewAndSendCompensatoryNotification("guest", {
      notificationId: seed.id, recipient: "ana@example.org", confirmed: true, clientOperationId: "operation-guest",
    }, { send, configuration: { apiKey: "mock", from: "noreply@example.org" } })).rejects.toThrow();
    expect(send).not.toHaveBeenCalled();
  });

  it("records review but leaves a clear pending state when transport configuration is absent", async () => {
    const { service, get } = memory();
    const send = vi.fn();
    const result = await service.reviewAndSendCompensatoryNotification("admin", {
      notificationId: seed.id, recipient: "ana@example.org", confirmed: true,
      clientOperationId: "operation-2",
    }, { send, configuration: null });
    expect(result.status).toBe("pending_configuration");
    expect(send).not.toHaveBeenCalled();
    expect(get().notification.reviewedByUserId).toBe("admin");
    expect(get().attempts).toHaveLength(1);
  });

  it("captures uncertainty without claiming delivery or automatically retrying", async () => {
    const { service, get } = memory();
    const send = vi.fn().mockResolvedValue({ kind: "uncertain", reason: "network_error" });
    const result = await service.reviewAndSendCompensatoryNotification("admin", {
      notificationId: seed.id, recipient: "ana@example.org", confirmed: true,
      clientOperationId: "operation-3",
    }, { send, configuration: { apiKey: "mock", from: "noreply@example.org" } });
    expect(result.status).toBe("uncertain");
    expect(get().notification.status).toBe("uncertain");
    expect(get().notification.status).not.toBe("delivered");
    expect(send).toHaveBeenCalledTimes(1);
  });

  it("reuses an operation result and refuses a second operation while a send is reserved", async () => {
    const { service } = memory();
    const send = vi.fn().mockResolvedValue({ kind: "accepted", providerId: "provider-1" });
    const input = { notificationId: seed.id, recipient: "ana@example.org", confirmed: true as const, clientOperationId: "operation-4" };
    await expect(service.reviewAndSendCompensatoryNotification("admin", input, { send, configuration: { apiKey: "mock", from: "noreply@example.org" } })).resolves.toEqual({ status: "accepted" });
    await expect(service.reviewAndSendCompensatoryNotification("admin", {
      ...input, recipient: "other@example.org",
    }, { send, configuration: { apiKey: "mock", from: "noreply@example.org" } })).rejects.toThrow(/usada con otros datos/);
    await expect(service.reviewAndSendCompensatoryNotification("admin", input, { send, configuration: { apiKey: "mock", from: "noreply@example.org" } })).resolves.toEqual({ status: "accepted" });
    expect(send).toHaveBeenCalledTimes(1);
    await expect(service.reviewAndSendCompensatoryNotification("admin", {
      ...input, clientOperationId: "operation-5",
    }, { send, configuration: { apiKey: "mock", from: "noreply@example.org" } })).rejects.toThrow();
  });

  it("serializes simultaneous operations for one notification and distinguishes acceptance from delivery", async () => {
    const { service, get } = memory();
    let finish!: (value: { kind: "accepted"; providerId: string }) => void;
    const send = vi.fn(() => new Promise<{ kind: "accepted"; providerId: string }>((resolve) => { finish = resolve; }));
    const configuration = { apiKey: "mock", from: "noreply@example.org" };
    const first = service.reviewAndSendCompensatoryNotification("admin", {
      notificationId: seed.id, recipient: "ana@example.org", confirmed: true, clientOperationId: "concurrent-1",
    }, { send, configuration });
    await vi.waitFor(() => expect(send).toHaveBeenCalledTimes(1));
    await expect(service.reviewAndSendCompensatoryNotification("admin", {
      notificationId: seed.id, recipient: "ana@example.org", confirmed: true, clientOperationId: "concurrent-2",
    }, { send, configuration })).rejects.toThrow(/intento de envío en curso/);
    finish({ kind: "accepted", providerId: "provider-accepted" });
    await expect(first).resolves.toEqual({ status: "accepted" });
    expect(get().notification.status).toBe("accepted");
    expect(get().notification.status).not.toBe("delivered");
    expect(send).toHaveBeenCalledTimes(1);
  });

  it("marks a stale sending reservation uncertain after the provider idempotency window without resending", async () => {
    const stale = { ...seed, status: "sending" as const, lastAttemptAt: new Date("2026-10-29T11:59:00Z") };
    const { service, get } = memory(stale);
    const send = vi.fn();
    const result = await service.reviewAndSendCompensatoryNotification("admin", {
      notificationId: seed.id, recipient: "ana@example.org", confirmed: true, clientOperationId: "stale-operation",
    }, { send, configuration: { apiKey: "mock", from: "noreply@example.org" } });
    expect(result.status).toBe("uncertain");
    expect(get().notification.status).toBe("uncertain");
    expect(send).not.toHaveBeenCalled();
  });
});
