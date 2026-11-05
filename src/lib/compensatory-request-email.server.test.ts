import { describe, expect, it } from "vitest";
import { createRequestEmailPromotionService, type RequestEmailPromotionStore, type RequestEmailPromotionTransaction } from "./compensatory-request-email.server";
import type { StaffAuditRecord, StaffRecord } from "./compensatory-bank.server";

function setup() {
  let staff: StaffRecord = { id: "staff", dni: "12345678", name: "Ana", email: null, isActive: true, monthlyLimitMinutes: 100, version: 2, balanceMinutes: 0, createdAt: new Date() };
  let audit: StaffAuditRecord | null = null;
  let actor: { isActive: boolean; isAdmin: boolean; name: string } | null = { isActive: true, isAdmin: true, name: "Coordination" };
  let request = { id: "request", staffId: "staff", requesterEmail: "new@example.org" as string | null, submissionSource: "public" as const };
  const operations = new Map<string, { payloadHash: string; resultId: string }>();
  const tx: RequestEmailPromotionTransaction = {
    async findActor() { return actor; }, async findRequest() { return request; },
    async lockStaff() { return staff; },
    async updateStaffEmail(_id, version, email) {
      if (staff.version !== version || staff.email !== null) throw new Error("La ficha cambió o ya tiene correo; actualiza la lista.");
      staff = { ...staff, email, version: version + 1 };
    },
    async insertStaffAudit(item) { audit = item; }, async lockOperation() {},
    async findOperation(_actor, id) { return operations.get(id) ?? null; },
    async insertOperation(_actor, id, payloadHash, resultId) { operations.set(id, { payloadHash, resultId }); },
    async databaseNow() { return new Date("2026-10-31T12:00:00Z"); },
  };
  const store: RequestEmailPromotionStore = { async transaction(work) { return work(tx); } };
  let nextId = 0;
  return { service: createRequestEmailPromotionService(store, () => `audit-${++nextId}`), get staff() { return staff; }, get audit() { return audit; }, setActor(value: typeof actor) { actor = value; }, setRequestEmail(value: string | null) { request = { ...request, requesterEmail: value }; } };
}
const input = { requestId: "request", expectedVersion: 2, reason: "Revisión explícita", clientOperationId: "operation" };

describe("compensatory request email profile promotion", () => {
  it("requires an active administrator", async () => {
    const { service, setActor } = setup(); setActor({ isActive: true, isAdmin: false, name: "Staff" });
    await expect(service.addRequestEmailToProfile("staff", input)).rejects.toThrow("Se requiere administración vigente.");
  });
  it("does not overwrite an email added concurrently or a changed profile version", async () => {
    const changed = setup();
    await expect(changed.service.addRequestEmailToProfile("admin", { ...input, expectedVersion: 1 })).rejects.toThrow("La ficha cambió; actualiza la lista.");
    const raced = setup();
    (raced.staff as StaffRecord).email = "already@example.org";
    await expect(raced.service.addRequestEmailToProfile("admin", input)).rejects.toThrow("La ficha ya tiene un correo");
  });
  it("rejects a request without an email snapshot", async () => {
    const context = setup(); context.setRequestEmail(null);
    await expect(context.service.addRequestEmailToProfile("admin", input)).rejects.toThrow("no tiene un correo");
  });
  it("copies a public request email only after explicit admin action and audits the profile change", async () => {
    const context = setup();
    const { service } = context;
    await service.addRequestEmailToProfile("admin", input);
    expect(context.staff.email).toBe("new@example.org");
    expect(context.staff.version).toBe(3);
    expect(context.audit).toMatchObject({ action: "updated", versionBefore: 2, versionAfter: 3, reason: "Revisión explícita", before: { email: null, version: 2 }, after: { email: "new@example.org", version: 3 } });
  });
});
