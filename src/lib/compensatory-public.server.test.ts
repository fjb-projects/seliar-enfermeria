import { describe, expect, it } from "vitest";
import {
  createCompensatoryLifecycleService,
  type CompensatoryLifecycleStore,
  type CompensatoryLifecycleTransaction,
} from "./compensatory-lifecycle.server";
import {
  createPublicCompensatoryService,
  type PublicCompensatoryRequest,
  type PublicCompensatoryStore,
  type PublicCompensatoryTransaction,
} from "./compensatory-public.server";

const staff = [
  { id: "00000000-0000-4000-8000-000000000001", name: "María Elena Pérez", email: null, isActive: true },
  { id: "00000000-0000-4000-8000-000000000002", name: "Lucía Gómez", email: "private@example.org", isActive: true },
  { id: "00000000-0000-4000-8000-000000000003", name: "María Elena Pérez", email: null, isActive: true },
  { id: "00000000-0000-4000-8000-000000000004", name: "Agente inactivo", email: null, isActive: false },
];

function createStore(serviceDay = "2026-10-30", allStaff = staff): PublicCompensatoryStore {
  const requests = new Map<string, PublicCompensatoryRequest>();
  let insertCount = 0;
  let transactionTail = Promise.resolve();
  const transaction: PublicCompensatoryTransaction = {
    async listActiveStaff() {
      return allStaff.filter((agent) => agent.isActive).map(({ id, name, email, isActive }) => ({ id, name, email, isActive }));
    },
    async lockStaff(staffId) { const agent = allStaff.find((item) => item.id === staffId); return agent ? { ...agent } : null; },
    async lockOperation() {},
    async serviceDay() { return serviceDay; },
    async findOperation(operationId) {
      return requests.get(operationId) ?? null;
    },
    async insertRequest(request) {
      insertCount += 1;
      const created = { ...request, id: `request-${requests.size + 1}`, createdAt: new Date(0) };
      requests.set(request.clientOperationId, created);
      return created;
    },
  };
  return {
    async transaction(work) {
      const prior = transactionTail;
      let release!: () => void;
      transactionTail = new Promise<void>((resolve) => (release = resolve));
      await prior;
      try {
        return await work(transaction);
      } finally {
        release();
      }
    },
    getInsertCount: () => insertCount,
  } as PublicCompensatoryStore & { getInsertCount: () => number };
}

const payload = {
  clientOperationId: "c0c7b62f-0879-4b0b-8fc2-e983f4713ea3",
  staffId: "00000000-0000-4000-8000-000000000002",
  requesterEmail: "solicitante@example.org",
  requesterMobile: "+54 11 1234-5678",
  compensatoryDate: "2026-10-30",
  hours: "2.5",
};

describe("public compensatory intake", () => {
  it("returns only active, unambiguous official names and internal IDs", async () => {
    const agents = await createPublicCompensatoryService(createStore()).listPublicCompensatoryAgents();
    expect(agents).toEqual([{ id: "00000000-0000-4000-8000-000000000002", name: "Lucía Gómez", hasProfileEmail: true }]);
  });

  it("resolves a stored email privately and ignores a public override", async () => {
    const store = createStore();
    const service = createPublicCompensatoryService(store);
    const result = await service.submitPublicCompensatoryRequest({ ...payload, requesterEmail: "attacker@example.org" });
    expect(result).toEqual({ state: "submitted" });
    const request = await store.transaction((tx) => tx.findOperation(payload.clientOperationId));
    expect(request?.requesterEmail).toBe("private@example.org");
    await expect(service.submitPublicCompensatoryRequest({ ...payload, requesterEmail: "attacker@example.org" })).resolves.toEqual({ state: "submitted" });
    const blankInput = { ...payload, clientOperationId: "c0c7b62f-0879-4b0b-8fc2-e983f4713ea4", requesterEmail: "" };
    await expect(service.submitPublicCompensatoryRequest(blankInput)).resolves.toEqual({ state: "submitted" });
    await expect(service.submitPublicCompensatoryRequest(blankInput)).resolves.toEqual({ state: "submitted" });
  });

  it("replays the exact original payload after profile changes and rejects changed email input", async () => {
    const profile = { ...staff[1]! };
    const store = createStore("2026-10-30", [profile]);
    const service = createPublicCompensatoryService(store);
    const original = { ...payload, requesterEmail: "submitted@example.org" };
    await service.submitPublicCompensatoryRequest(original);
    profile.email = null;
    profile.isActive = false;
    await expect(service.submitPublicCompensatoryRequest(original)).resolves.toEqual({ state: "submitted" });
    await expect(service.submitPublicCompensatoryRequest({ ...original, requesterEmail: "changed@example.org" })).rejects.toThrow();
  });

  it("requires a valid email when the selected profile has none and replays blank profile-email submissions", async () => {
    const service = createPublicCompensatoryService(createStore("2026-10-30", [staff[0]!]));
    const noEmail = { ...payload, staffId: "00000000-0000-4000-8000-000000000001" };
    await expect(service.submitPublicCompensatoryRequest({ ...noEmail, requesterEmail: "" })).rejects.toThrow();
    await service.submitPublicCompensatoryRequest({ ...noEmail, requesterEmail: "new@example.org" });
  });

  it("stores a public request with unverified email and anonymous provenance", async () => {
    const store = createStore();
    const service = createPublicCompensatoryService(store);
    const result = await service.submitPublicCompensatoryRequest(payload);
    const request = await store.transaction((tx) => tx.findOperation(payload.clientOperationId));
    expect(result).toEqual({ state: "submitted" });
    expect(request).toMatchObject({
      requesterEmail: "private@example.org",
      requesterEmailVerifiedAt: null,
      createdByUserId: null,
      submissionSource: "public",
      requesterMobile: payload.requesterMobile,
      phase: "pending",
      requestedDate: payload.compensatoryDate,
      requestedMinutes: 150,
      classifiedAt: null,
      classifiedByUserId: null,
    });
  });

  it("replays the same operation but rejects changed data and unknown or ambiguous agents", async () => {
    const service = createPublicCompensatoryService(createStore());
    await expect(service.submitPublicCompensatoryRequest(payload)).resolves.toEqual({ state: "submitted" });
    await expect(service.submitPublicCompensatoryRequest(payload)).resolves.toEqual({ state: "submitted" });
    await expect(service.submitPublicCompensatoryRequest({ ...payload, hours: "3" })).rejects.toThrow();
    await expect(service.submitPublicCompensatoryRequest({ ...payload, staffId: "00000000-0000-4000-8000-000000000099" })).rejects.toThrow();
    await expect(service.submitPublicCompensatoryRequest({ ...payload, staffId: "00000000-0000-4000-8000-000000000001" })).rejects.toThrow();
  });

  it("serializes concurrent retries to one durable public request", async () => {
    const store = createStore() as PublicCompensatoryStore & { getInsertCount: () => number };
    const service = createPublicCompensatoryService(store);
    await Promise.all([
      service.submitPublicCompensatoryRequest(payload),
      service.submitPublicCompensatoryRequest(payload),
    ]);
    expect(store.getInsertCount()).toBe(1);
  });

  it("validates email, date, hours and operation IDs on the server", async () => {
    const service = createPublicCompensatoryService(createStore());
    await expect(service.submitPublicCompensatoryRequest({ ...payload, requesterEmail: "bad" })).rejects.toThrow();
    await expect(service.submitPublicCompensatoryRequest({ ...payload, compensatoryDate: "2026-02-30" })).rejects.toThrow();
    await expect(service.submitPublicCompensatoryRequest({ ...payload, hours: "0" })).rejects.toThrow();
    await expect(service.submitPublicCompensatoryRequest({ ...payload, clientOperationId: "not-a-uuid" })).rejects.toThrow();
    await expect(service.submitPublicCompensatoryRequest({ ...payload, hours: "0.01" })).rejects.toThrow();
    await expect(service.submitPublicCompensatoryRequest({ ...payload, hours: "40000000" })).rejects.toThrow();
  });

  it("creates pending requests with exact canonical minutes and rejects past service dates", async () => {
    const store = createStore("2026-10-30");
    const service = createPublicCompensatoryService(store);
    await expect(service.submitPublicCompensatoryRequest({ ...payload, hours: "0.25" })).resolves.toEqual({ state: "submitted" });
    const currentDate = await store.transaction((tx) => tx.findOperation(payload.clientOperationId));
    expect(currentDate).toMatchObject({ phase: "pending", requestedDate: "2026-10-30", requestedMinutes: 15 });
    await service.submitPublicCompensatoryRequest({
      ...payload,
      clientOperationId: "c0c7b62f-0879-4b0b-8fc2-e983f4713ea5",
      compensatoryDate: "2026-11-01",
      hours: "0.5",
    });
    const futureDate = await store.transaction((tx) =>
      tx.findOperation("c0c7b62f-0879-4b0b-8fc2-e983f4713ea5"),
    );
    expect(futureDate).toMatchObject({ phase: "pending", requestedDate: "2026-11-01", requestedMinutes: 30 });

    await expect(service.submitPublicCompensatoryRequest({
      ...payload,
      clientOperationId: "c0c7b62f-0879-4b0b-8fc2-e983f4713ea4",
      compensatoryDate: "2026-10-29",
    })).rejects.toThrow("fecha pasada");
    expect((store as PublicCompensatoryStore & { getInsertCount: () => number }).getInsertCount()).toBe(2);
  });

  it("exposes the submitted pending request in the authenticated coordination workspace", async () => {
    const publicStore = createStore();
    await createPublicCompensatoryService(publicStore).submitPublicCompensatoryRequest(payload);
    const request = await publicStore.transaction((tx) => tx.findOperation(payload.clientOperationId));
    const lifecycleTransaction = {
      async findActor(id: string) {
        return id === "admin" ? { isActive: true, isAdmin: true, name: "Coordinación" } : null;
      },
      async listStaff() {
        return [{
          id: payload.staffId,
          dni: "12345678",
          name: "Lucía Gómez",
          email: null,
          isActive: true,
          monthlyLimitMinutes: 1440,
          version: 1,
          balanceMinutes: 240,
          createdAt: new Date("2026-01-01T00:00:00.000Z"),
        }];
      },
      async listRequests() { return request ? [request] : []; },
      async listRequestAudits() { return []; },
      async reservedMinutes() { return 0; },
      async serviceDay() { return "2026-10-30"; },
    } as unknown as CompensatoryLifecycleTransaction;
    const lifecycleStore: CompensatoryLifecycleStore = {
      async transaction(work) { return work(lifecycleTransaction); },
    };
    const workspace = await createCompensatoryLifecycleService(lifecycleStore).getWorkspace("admin");
    expect(workspace.requests).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: request?.id,
          phase: "pending",
          requestedDate: payload.compensatoryDate,
          requestedMinutes: 150,
          requesterEmail: "private@example.org",
          requesterEmailVerifiedAt: null,
        }),
      ]),
    );
  });
});
