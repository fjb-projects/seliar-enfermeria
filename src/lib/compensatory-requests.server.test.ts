import { describe, expect, it } from "vitest";
import {
  createCompensatoryRequestsService,
  type CompensatoryRequestRecord,
  type CompensatoryRequestsStore,
} from "./compensatory-requests.server";
import { compensatoryRequestSchemas } from "./compensatory-requests.functions";

const admin = { isActive: true, isAdmin: true };
const request = {
  clientOperationId: "f3e96f01-f886-4a9c-a2d3-91680c06cb86",
  staffId: "e548bb25-3ed4-4db7-8541-c18d721acd0c",
  submittedAt: "2025-04-03T12:30:00Z",
  requesterName: "Ana Pérez",
  requesterMobile: "+54 11 5555-0000",
  compensatoryDate: "2025-04-10",
  hours: "2,5",
};

function memoryStore() {
  let records: CompensatoryRequestRecord[] = [];
  const store: CompensatoryRequestsStore = {
    async transaction(work) {
      return work({
        async findActor() {
          return admin;
        },
        async hasStaff() {
          return true;
        },
        async listRequests(staffId) {
          return records.filter((item) => !staffId || item.staffId === staffId);
        },
        async lockOperation() {},
        async findOperation(actorUserId, operationId) {
          const found = records.find((item) => item.clientOperationId === operationId);
          return found ? { request: found, createdByUserId: actorUserId } : null;
        },
        async lockDuplicateKey() {},
        async listDuplicates(input) {
          return records.filter(
            (item) =>
              item.staffId === input.staffId &&
              item.submittedAt === input.submittedAt &&
              item.requesterName === input.requesterName &&
              item.requesterMobile === input.requesterMobile &&
              item.compensatoryDate === input.compensatoryDate &&
              item.hours === input.hours,
          );
        },
        async insertRequest(_actorUserId, input) {
          const row = { ...input, id: `request-${records.length + 1}`, createdAt: new Date() };
          records.push(row);
          return row;
        },
      });
    },
  };
  return { store, records: () => records };
}

describe("compensatory request persistence", () => {
  it("validates a strict source-field contract without normalizing source strings", () => {
    const input = { ...request, requesterName: " Ana Pérez ", confirmDuplicate: true };
    expect(compensatoryRequestSchemas.insert.parse(input)).toMatchObject(input);
    expect(
      compensatoryRequestSchemas.insert.safeParse({ ...request, sourceResponseId: "drive-id" })
        .success,
    ).toBe(false);
    expect(compensatoryRequestSchemas.insert.safeParse({ ...request, hours: "  " }).success).toBe(
      false,
    );
    expect(compensatoryRequestSchemas.list.safeParse({ staffId: request.staffId }).success).toBe(
      true,
    );
  });

  it("stores reviewed source fields as strings linked to staff without changing balance", async () => {
    const { store } = memoryStore();
    const service = createCompensatoryRequestsService(store);
    const result = await service.insertRequests("admin", request);
    expect(result.status).toBe("stored");
    if (result.status === "stored") {
      expect(result.request).toMatchObject(request);
      expect(result.request).not.toHaveProperty("sourceResponseId");
    }
  });

  it("flags exact duplicates for review and only stores them after explicit confirmation", async () => {
    const { store, records } = memoryStore();
    const service = createCompensatoryRequestsService(store);
    await service.insertRequests("admin", request);
    const pending = await service.insertRequests("admin", {
      ...request,
      clientOperationId: "4f9d3914-06ec-48db-a414-42b30fd2cb0c",
    });
    expect(pending.status).toBe("duplicate_review_required");
    expect(records()).toHaveLength(1);
    const confirmed = await service.insertRequests("admin", {
      ...request,
      clientOperationId: "4f9d3914-06ec-48db-a414-42b30fd2cb0c",
      confirmDuplicate: true,
    });
    expect(confirmed.status).toBe("stored");
    expect(records()).toHaveLength(2);
  });

  it("returns the original row when a successful operation is retried", async () => {
    const { store, records } = memoryStore();
    const service = createCompensatoryRequestsService(store);
    const first = await service.insertRequests("admin", request);
    const retry = await service.insertRequests("admin", request);
    expect(retry).toEqual(first);
    expect(records()).toHaveLength(1);
  });

  it("requires a current active administrator for both listing and insertion", async () => {
    const store = memoryStore().store;
    const restricted: CompensatoryRequestsStore = {
      async transaction(work) {
        return store.transaction((tx) =>
          work({ ...tx, findActor: async () => ({ isActive: true, isAdmin: false }) }),
        );
      },
    };
    const service = createCompensatoryRequestsService(restricted);
    await expect(service.listRequests("user")).rejects.toThrow(/administración/i);
    await expect(service.insertRequests("user", request)).rejects.toThrow(/administración/i);
  });
});
