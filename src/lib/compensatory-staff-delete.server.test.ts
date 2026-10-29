import { describe, expect, it } from "vitest";
import { createCompensatoryStaffDeleteService } from "./compensatory-staff-delete.server";
import type {
  CompensatoryStaffDeleteStore,
  CompensatoryStaffDeleteTransaction,
} from "./compensatory-staff-delete.server";
import type { StaffAuditRecord, StaffRecord } from "./compensatory-bank.server";

const staff: StaffRecord = {
  id: "7120644e-5472-4e64-9a22-31363ddde201",
  dni: "12345678",
  name: "Ana Pérez",
  email: null,
  isActive: true,
  monthlyLimitMinutes: 1440,
  version: 2,
  balanceMinutes: 0,
  createdAt: new Date("2026-01-01T00:00:00Z"),
};
const audit: StaffAuditRecord = {
  id: "audit-1",
  staffId: staff.id,
  actorUserId: "admin",
  actorName: "Admin",
  createdAt: new Date("2026-01-02T00:00:00Z"),
  reason: "Ficha actualizada",
  operationId: "operation-1",
  action: "updated",
  versionBefore: 1,
  versionAfter: 2,
  before: { name: "Ana" },
  after: { name: staff.name },
};

function setup({ requests = false, ledger = false } = {}) {
  let currentStaff: StaffRecord | null = { ...staff };
  let currentAudits: StaffAuditRecord[] = [{ ...audit }];
  let archive: unknown;
  const steps: string[] = [];
  const operations = new Map<string, { payloadHash: string; resultId: string }>();
  const tx: CompensatoryStaffDeleteTransaction = {
    async findActor(userId) {
      return userId === "admin"
        ? { isActive: true, isAdmin: true, name: "Admin" }
        : { isActive: userId !== "inactive", isAdmin: false, name: "User" };
    },
    async lockOperation() {
      steps.push("lockOperation");
    },
    async findOperation(_actor, operationId) {
      return operations.get(operationId) ?? null;
    },
    async insertOperation(_actor, operationId, payloadHash, resultId) {
      steps.push("insertOperation");
      operations.set(operationId, { payloadHash, resultId });
    },
    async lockStaff() {
      steps.push("lockStaff");
      return currentStaff;
    },
    async hasRequests() {
      steps.push("hasRequests");
      return requests;
    },
    async hasLedgerEntries() {
      steps.push("hasLedgerEntries");
      return ledger;
    },
    async listAudits() {
      steps.push("listAudits");
      return currentAudits;
    },
    async insertDeletionArchive(value) {
      steps.push("insertDeletionArchive");
      archive = value;
    },
    async deleteAudits() {
      steps.push("deleteAudits");
      currentAudits = [];
    },
    async deleteStaff(id, version) {
      steps.push("deleteStaff");
      if (currentStaff?.id !== id || currentStaff.version !== version)
        throw new Error("La ficha cambió; actualiza la lista.");
      currentStaff = null;
    },
    async databaseNow() {
      return new Date("2026-10-27T15:00:00Z");
    },
  };
  const store: CompensatoryStaffDeleteStore = {
    async transaction(work) {
      return work(tx);
    },
  };
  return {
    service: createCompensatoryStaffDeleteService(store),
    state: {
      get currentStaff() {
        return currentStaff;
      },
      get currentAudits() {
        return currentAudits;
      },
      get archive() {
        return archive;
      },
      get operations() {
        return operations;
      },
      get steps() {
        return steps;
      },
    },
  };
}

const input = {
  staffId: staff.id,
  expectedVersion: 2,
  reason: "Importación duplicada",
  clientOperationId: "e8b90ed5-ae45-4ae5-9c94-7a248a813c93",
};

describe("compensatory staff deletion service", () => {
  it("archives the snapshot and prior audits before deleting an unused staff record", async () => {
    const { service, state } = setup();
    await expect(service.deleteStaff("admin", input)).resolves.toEqual({ id: staff.id });
    expect(state.currentStaff).toBeNull();
    expect(state.currentAudits).toEqual([]);
    expect(state.archive).toMatchObject({
      staffSnapshot: staff,
      priorAudits: [audit],
      actorUserId: "admin",
      reason: input.reason,
    });
    expect(state.steps).toEqual([
      "lockOperation",
      "lockStaff",
      "hasRequests",
      "hasLedgerEntries",
      "listAudits",
      "insertDeletionArchive",
      "deleteAudits",
      "deleteStaff",
      "insertOperation",
    ]);
    await expect(service.deleteStaff("admin", input)).resolves.toEqual({ id: staff.id });
    await expect(
      service.deleteStaff("admin", { ...input, reason: "Different reason" }),
    ).rejects.toThrow(/ya fue usada/i);
  });

  it.each([
    ["request", { requests: true }],
    ["ledger", { ledger: true }],
  ])(
    "rejects a staff member with %s history, even with a zero balance",
    async (_label, options) => {
      const { service, state } = setup(options);
      await expect(service.deleteStaff("admin", input)).rejects.toThrow(/solicitudes|movimientos/i);
      expect(state.currentStaff).toEqual(staff);
      expect(state.archive).toBeUndefined();
    },
  );

  it("requires an active administrator, a reason, a UUID operation key, and the current version", async () => {
    const { service, state } = setup();
    await expect(service.deleteStaff("nurse", input)).rejects.toThrow(/administración/i);
    await expect(service.deleteStaff("inactive", input)).rejects.toThrow(/administración/i);
    await expect(service.deleteStaff("admin", { ...input, reason: " " })).rejects.toThrow(
      /motivo/i,
    );
    await expect(
      service.deleteStaff("admin", { ...input, clientOperationId: "missing" }),
    ).rejects.toThrow(/operación/i);
    await expect(service.deleteStaff("admin", { ...input, expectedVersion: 1 })).rejects.toThrow(
      /cambió/i,
    );
    expect(state.currentStaff).toEqual(staff);
    expect(state.archive).toBeUndefined();
  });
});
