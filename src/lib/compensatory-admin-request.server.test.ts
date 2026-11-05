import { describe, expect, it } from "vitest";
import {
  createAdministrativeCompensatoryRequestService,
  type AdministrativeCompensatoryRequest,
  type AdministrativeCompensatoryStore,
  type AdministrativeCompensatoryTransaction,
} from "./compensatory-admin-request.server";

const adminId = "admin-1";
const staffId = "00000000-0000-4000-8000-000000000001";
const payload = {
  clientOperationId: "c0c7b62f-0879-4b0b-8fc2-e983f4713ea3",
  staffId,
  requesterEmail: "contact@example.org",
  requesterMobile: "+54 11 1234-5678",
  compensatoryDate: "2026-10-30",
  hours: "2.5",
  reason: "Carga administrativa excepcional",
};

function makeStore(
  options: { serviceDay?: string; duplicates?: Array<{ id: string; phase?: string }> } = {},
) {
  const requests = new Map<string, AdministrativeCompensatoryRequest>();
  const operations = new Map<string, { action: string; payloadHash: string; resultId: string }>();
  const audits: unknown[] = [];
  let inserts = 0;
  const tx: AdministrativeCompensatoryTransaction = {
    async findActor(id) {
      return id === adminId ? { isActive: true, isAdmin: true, name: "Coordinación Real" } : null;
    },
    async lockOperation() {},
    async findOperation(actorId, operationId) {
      return operations.get(`${actorId}:${operationId}`) ?? null;
    },
    async lockStaff(id) {
      return id === staffId ? { id, name: "Lucía Gómez", isActive: true } : null;
    },
    async findPotentialDuplicates(id, date, minutes) {
      return id === staffId && date === payload.compensatoryDate && minutes === 150
        ? (options.duplicates ?? []).map(({ id }) => ({ id }))
        : [];
    },
    async serviceDay() {
      return options.serviceDay ?? "2026-10-30";
    },
    async insertRequest(request) {
      inserts += 1;
      const created = { ...request, id: `request-${inserts}`, createdAt: new Date(0) };
      requests.set(created.clientOperationId, created);
      return created;
    },
    async insertRequestAudit(audit) {
      audits.push(audit);
    },
    async insertOperation(actorId, operationId, action, payloadHash, resultId) {
      operations.set(`${actorId}:${operationId}`, { action, payloadHash, resultId });
    },
  };
  const store: AdministrativeCompensatoryStore = {
    async transaction(work) {
      return work(tx);
    },
  };
  return {
    store,
    requests,
    audits,
    get inserts() {
      return inserts;
    },
  };
}

describe("administrative compensatory request service", () => {
  it("creates a classified pending request and an atomic truthful audit without bank effects", async () => {
    const fake = makeStore();
    const service = createAdministrativeCompensatoryRequestService(fake.store);
    await expect(
      service.createAdministrativeCompensatoryRequest(adminId, payload),
    ).resolves.toEqual({ state: "submitted" });
    const request = fake.requests.get(payload.clientOperationId)!;
    expect(request).toMatchObject({
      staffId,
      requesterName: "Lucía Gómez",
      requesterEmail: payload.requesterEmail,
      requesterEmailVerifiedAt: null,
      requesterMobile: payload.requesterMobile,
      createdByUserId: adminId,
      submissionSource: "admin",
      phase: "pending",
      version: 2,
      requestedDate: payload.compensatoryDate,
      requestedMinutes: 150,
      classifiedByUserId: adminId,
      classifiedAt: expect.any(Date),
    });
    expect(fake.audits).toEqual([
      expect.objectContaining({
        actorUserId: adminId,
        actorName: "Coordinación Real",
        actorKind: "admin",
        action: "classified",
        versionBefore: 1,
        versionAfter: 2,
        reason: payload.reason,
        detail: expect.objectContaining({ source: "admin", requesterEmailVerified: false }),
      }),
    ]);
    expect(fake.inserts).toBe(1);
  });

  it("requires fresh active admin and active staff authorization", async () => {
    const fake = makeStore();
    const originalTx = await fake.store.transaction(async (value) => value);
    const denied = {
      ...originalTx,
      findActor: async () => ({ isActive: false, isAdmin: true, name: "Stale" }),
    };
    const service = createAdministrativeCompensatoryRequestService({
      transaction: (work) => work(denied),
    });
    await expect(service.createAdministrativeCompensatoryRequest(adminId, payload)).rejects.toThrow(
      /administración vigente/i,
    );
    expect(fake.inserts).toBe(0);
    const inactiveStaff = {
      ...originalTx,
      lockStaff: async () => ({ id: staffId, name: "Inactive", isActive: false }),
    };
    const inactiveService = createAdministrativeCompensatoryRequestService({
      transaction: (work) => work(inactiveStaff),
    });
    await expect(
      inactiveService.createAdministrativeCompensatoryRequest(adminId, payload),
    ).rejects.toThrow(/no está activo/i);
  });

  it("holds possible duplicates without writes until confirmation, then accepts a retry", async () => {
    const fake = makeStore({ duplicates: [{ id: "existing-1" }] });
    const service = createAdministrativeCompensatoryRequestService(fake.store);
    await expect(
      service.createAdministrativeCompensatoryRequest(adminId, payload),
    ).resolves.toEqual({
      state: "duplicate_review_required",
      matches: [{ id: "existing-1" }],
    });
    expect(fake.inserts).toBe(0);
    await expect(
      service.createAdministrativeCompensatoryRequest(adminId, {
        ...payload,
        confirmDuplicate: true,
      }),
    ).resolves.toEqual({ state: "submitted" });
    expect(fake.inserts).toBe(1);
  });

  it.each(["approved", "consumed"])(
    "does not write after warning about a matching %s request",
    async (phase) => {
      const fake = makeStore({ duplicates: [{ id: `existing-${phase}`, phase }] });
      const service = createAdministrativeCompensatoryRequestService(fake.store);
      await expect(
        service.createAdministrativeCompensatoryRequest(adminId, payload),
      ).resolves.toEqual({
        state: "duplicate_review_required",
        matches: [{ id: `existing-${phase}` }],
      });
      expect(fake.inserts).toBe(0);
    },
  );

  it("rejects operation IDs already used for a historical imported request", async () => {
    const fake = makeStore();
    const base = await fake.store.transaction(async (tx) => tx);
    const tx = {
      ...base,
      async findOperation() {
        return { action: "historical_import", payloadHash: "", resultId: "imported-request-1" };
      },
    };
    const service = createAdministrativeCompensatoryRequestService({
      transaction: (work) => work(tx),
    });
    await expect(service.createAdministrativeCompensatoryRequest(adminId, payload)).rejects.toThrow(
      /otros datos/i,
    );
    expect(fake.inserts).toBe(0);
  });

  it("replays an actor-scoped operation and rejects changed intent", async () => {
    const fake = makeStore();
    const service = createAdministrativeCompensatoryRequestService(fake.store);
    await service.createAdministrativeCompensatoryRequest(adminId, payload);
    await expect(
      service.createAdministrativeCompensatoryRequest(adminId, payload),
    ).resolves.toEqual({ state: "submitted" });
    await expect(
      service.createAdministrativeCompensatoryRequest(adminId, {
        ...payload,
        reason: "Otro motivo",
      }),
    ).rejects.toThrow(/otros datos/i);
    expect(fake.inserts).toBe(1);
  });

  it("validates date, positive exact-minute hours, email, mobile, reason and operation id", async () => {
    const service = createAdministrativeCompensatoryRequestService(makeStore().store);
    for (const invalid of [
      { ...payload, compensatoryDate: "2026-02-30" },
      { ...payload, compensatoryDate: "2026-10-29" },
      { ...payload, hours: "0.01" },
      { ...payload, hours: "0" },
      { ...payload, requesterEmail: "bad" },
      { ...payload, requesterMobile: " " },
      { ...payload, reason: " " },
      { ...payload, clientOperationId: "nope" },
    ]) {
      await expect(
        service.createAdministrativeCompensatoryRequest(adminId, invalid),
      ).rejects.toThrow();
    }
  });

  it("accepts canonical minute durations and preserves their exact integer minute count", async () => {
    const fake = makeStore();
    const service = createAdministrativeCompensatoryRequestService(fake.store);
    await service.createAdministrativeCompensatoryRequest(adminId, { ...payload, hours: "0:01" });
    await service.createAdministrativeCompensatoryRequest(adminId, {
      ...payload,
      clientOperationId: "c0c7b62f-0879-4b0b-8fc2-e983f4713ea4",
      hours: "0:59",
    });
    expect(fake.requests.get(payload.clientOperationId)?.requestedMinutes).toBe(1);
    expect(fake.requests.get("c0c7b62f-0879-4b0b-8fc2-e983f4713ea4")?.requestedMinutes).toBe(59);
    await expect(
      service.createAdministrativeCompensatoryRequest(adminId, {
        ...payload,
        clientOperationId: "c0c7b62f-0879-4b0b-8fc2-e983f4713ea5",
        hours: "0:60",
      }),
    ).rejects.toThrow();
  });
});
