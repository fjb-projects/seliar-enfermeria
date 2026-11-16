import { and, eq, isNull } from "drizzle-orm";
import { sql } from "drizzle-orm";
import { getDatabase } from "../db/index.server";
import { accountAccess, accountRoleGrant, compensatoryOperation, compensatoryRequest, compensatoryStaff, compensatoryStaffAudit, user } from "../db/schema";
import { createRequestEmailPromotionService, type RequestEmailPromotionRequest, type RequestEmailPromotionStore, type RequestEmailPromotionTransaction } from "./compensatory-request-email.server";
import type { StaffAuditRecord, StaffRecord } from "./compensatory-bank.server";

const store: RequestEmailPromotionStore = {
  async transaction(work) {
    return getDatabase().transaction(async (db) => {
      const tx: RequestEmailPromotionTransaction = {
        async findActor(userId) {
          const rows = await db.select({ isActive: accountAccess.isActive, role: accountRoleGrant.role, name: user.name })
            .from(accountAccess).innerJoin(user, eq(user.id, accountAccess.userId))
            .leftJoin(accountRoleGrant, eq(accountRoleGrant.userId, accountAccess.userId)).where(eq(accountAccess.userId, userId));
          return rows.length ? { isActive: rows[0]!.isActive, isAdmin: rows.some((row) => row.role === "admin"), name: rows[0]!.name } : null;
        },
        async findRequest(requestId) {
          const rows = await db.select({ id: compensatoryRequest.id, staffId: compensatoryRequest.staffId, requesterEmail: compensatoryRequest.requesterEmail, submissionSource: compensatoryRequest.submissionSource })
            .from(compensatoryRequest).where(eq(compensatoryRequest.id, requestId)).limit(1);
          return (rows[0] as RequestEmailPromotionRequest | undefined) ?? null;
        },
        async lockStaff(staffId) {
          const rows = await db.select().from(compensatoryStaff).where(eq(compensatoryStaff.id, staffId)).for("update").limit(1);
          return (rows[0] as StaffRecord | undefined) ?? null;
        },
        async updateStaffEmail(staffId, expectedVersion, email) {
          const rows = await db.update(compensatoryStaff)
            .set({ email, version: expectedVersion + 1, updatedAt: sql`now()` })
            .where(and(eq(compensatoryStaff.id, staffId), eq(compensatoryStaff.version, expectedVersion), isNull(compensatoryStaff.email)))
            .returning({ id: compensatoryStaff.id });
          if (!rows.length) throw new Error("La ficha cambió o ya tiene correo; actualiza la lista.");
        },
        async insertStaffAudit(audit: StaffAuditRecord) {
          await db.insert(compensatoryStaffAudit).values({
            id: audit.id, staffId: audit.staffId, actorUserId: audit.actorUserId, actorName: audit.actorName,
            operationId: audit.operationId, action: audit.action, versionBefore: audit.versionBefore,
            versionAfter: audit.versionAfter, occurredAt: audit.createdAt, reason: audit.reason,
            beforeState: audit.before, afterState: audit.after,
          });
        },
        async lockOperation(actorId, operationId) {
          await db.execute(sql`select pg_advisory_xact_lock(hashtextextended(${`compensatory-request-email:${actorId}:${operationId}`}, 0))`);
        },
        async findOperation(actorId, operationId) {
          const rows = await db.select({ payloadHash: compensatoryOperation.payloadHash, resultId: compensatoryOperation.resultId })
            .from(compensatoryOperation).where(and(eq(compensatoryOperation.actorUserId, actorId), eq(compensatoryOperation.clientOperationId, operationId))).limit(1);
          return rows[0] ?? null;
        },
        async insertOperation(actorId, operationId, payloadHash, resultId) {
          await db.insert(compensatoryOperation).values({ actorUserId: actorId, clientOperationId: operationId, action: "add_request_email_to_profile", payloadHash, resultId });
        },
        async databaseNow() {
          const rows = await db.select({ now: sql<Date>`clock_timestamp()`.mapWith(compensatoryStaff.createdAt) }).from(accountAccess).limit(1);
          return rows[0]!.now;
        },
      };
      return work(tx);
    });
  },
};
export const compensatoryRequestEmail = createRequestEmailPromotionService(store);
