import { and, asc, eq, sql } from "drizzle-orm";
import { getDatabase } from "../db/index.server";
import {
  accountAccess,
  accountRoleGrant,
  compensatoryLedger,
  compensatoryOperation,
  compensatoryRequest,
  compensatoryStaff,
  compensatoryStaffAudit,
  compensatoryStaffDeletionAudit,
  user,
} from "../db/schema";
import {
  createCompensatoryStaffDeleteService,
  type CompensatoryStaffDeleteStore,
  type CompensatoryStaffDeleteTransaction,
} from "./compensatory-staff-delete.server";
import type { StaffAuditRecord, StaffRecord } from "./compensatory-bank.server";

const databaseClock = sql<Date>`clock_timestamp()`.mapWith(compensatoryStaff.createdAt);

const store: CompensatoryStaffDeleteStore = {
  async transaction(work) {
    return getDatabase().transaction(async (db) => {
      const tx: CompensatoryStaffDeleteTransaction = {
        async findActor(userId) {
          const rows = await db
            .select({
              isActive: accountAccess.isActive,
              role: accountRoleGrant.role,
              name: user.name,
            })
            .from(accountAccess)
            .innerJoin(user, eq(user.id, accountAccess.userId))
            .leftJoin(accountRoleGrant, eq(accountRoleGrant.userId, accountAccess.userId))
            .where(eq(accountAccess.userId, userId));
          return rows.length
            ? {
                isActive: rows[0]!.isActive,
                isAdmin: rows.some((row) => row.role === "admin"),
                name: rows[0]!.name,
              }
            : null;
        },
        async lockOperation(actorUserId, operationId) {
          await db.execute(
            sql`select pg_advisory_xact_lock(hashtextextended(${`${actorUserId}:${operationId}`}, 0))`,
          );
        },
        async findOperation(actorUserId, operationId) {
          const rows = await db
            .select({
              payloadHash: compensatoryOperation.payloadHash,
              resultId: compensatoryOperation.resultId,
            })
            .from(compensatoryOperation)
            .where(
              and(
                eq(compensatoryOperation.actorUserId, actorUserId),
                eq(compensatoryOperation.clientOperationId, operationId),
              ),
            )
            .limit(1);
          return rows[0] ?? null;
        },
        async insertOperation(actorUserId, operationId, payloadHash, resultId) {
          await db.insert(compensatoryOperation).values({
            actorUserId,
            clientOperationId: operationId,
            action: "delete_staff",
            payloadHash,
            resultId,
          });
        },
        async lockStaff(staffId) {
          const rows = await db
            .select()
            .from(compensatoryStaff)
            .where(eq(compensatoryStaff.id, staffId))
            .for("update")
            .limit(1);
          return (rows[0] as StaffRecord | undefined) ?? null;
        },
        async hasRequests(staffId) {
          const rows = await db
            .select({ id: compensatoryRequest.id })
            .from(compensatoryRequest)
            .where(eq(compensatoryRequest.staffId, staffId))
            .limit(1);
          return rows.length > 0;
        },
        async hasLedgerEntries(staffId) {
          const rows = await db
            .select({ id: compensatoryLedger.id })
            .from(compensatoryLedger)
            .where(eq(compensatoryLedger.staffId, staffId))
            .limit(1);
          return rows.length > 0;
        },
        async listAudits(staffId) {
          const rows = await db
            .select({
              id: compensatoryStaffAudit.id,
              staffId: compensatoryStaffAudit.staffId,
              actorUserId: compensatoryStaffAudit.actorUserId,
              actorName: compensatoryStaffAudit.actorName,
              operationId: compensatoryStaffAudit.operationId,
              action: compensatoryStaffAudit.action,
              versionBefore: compensatoryStaffAudit.versionBefore,
              versionAfter: compensatoryStaffAudit.versionAfter,
              createdAt: compensatoryStaffAudit.occurredAt,
              reason: compensatoryStaffAudit.reason,
              before: compensatoryStaffAudit.beforeState,
              after: compensatoryStaffAudit.afterState,
            })
            .from(compensatoryStaffAudit)
            .where(eq(compensatoryStaffAudit.staffId, staffId))
            .orderBy(asc(compensatoryStaffAudit.occurredAt), asc(compensatoryStaffAudit.id));
          return rows as StaffAuditRecord[];
        },
        async insertDeletionArchive(archive) {
          await db.insert(compensatoryStaffDeletionAudit).values(archive);
        },
        async deleteAudits(staffId) {
          await db.execute(
            sql`select set_config('app.allow_compensatory_staff_audit_delete', 'on', true)`,
          );
          await db
            .delete(compensatoryStaffAudit)
            .where(eq(compensatoryStaffAudit.staffId, staffId));
        },
        async deleteStaff(staffId, expectedVersion) {
          try {
            const rows = await db
              .delete(compensatoryStaff)
              .where(
                and(
                  eq(compensatoryStaff.id, staffId),
                  eq(compensatoryStaff.version, expectedVersion),
                ),
              )
              .returning({ id: compensatoryStaff.id });
            if (!rows.length) throw new Error("La ficha cambió; actualiza la lista.");
          } catch (error) {
            if (
              typeof error === "object" &&
              error !== null &&
              "code" in error &&
              error.code === "23503"
            ) {
              throw new Error(
                "No se puede eliminar un agente con solicitudes o movimientos registrados.",
              );
            }
            throw error;
          }
        },
        async databaseNow() {
          const rows = await db.select({ now: databaseClock }).from(accountAccess).limit(1);
          return rows[0]!.now;
        },
      };
      return work(tx);
    });
  },
};

export const compensatoryStaffDelete = createCompensatoryStaffDeleteService(store);
