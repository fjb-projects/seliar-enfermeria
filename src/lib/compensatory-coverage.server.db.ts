import { and, asc, eq, lt, ne, gt, inArray } from "drizzle-orm";
import { sql } from "drizzle-orm";
import { getDatabase } from "../db/index.server";
import {
  accountAccess,
  accountRoleGrant,
  compensatoryCoverage as compensatoryCoverageTable,
  compensatoryCoverageAssignment,
  compensatoryCoverageAudit,
  compensatoryCoverageOperation,
  compensatoryRequest,
  compensatoryStaff,
  user,
} from "../db/schema";
import {
  createCompensatoryCoverageService,
  type CompensatoryCoverageStore,
  type CompensatoryCoverageTransaction,
  type CompensatoryCoverageState,
} from "./compensatory-coverage.server";

export function createCompensatoryCoverageStore(
  database?: ReturnType<typeof getDatabase>,
): CompensatoryCoverageStore {
  return {
    async transaction(work) {
      const activeDatabase = database ?? getDatabase();
      return activeDatabase.transaction(async (db) => {
        const tx: CompensatoryCoverageTransaction = {
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
          async lockOperation(actorUserId, requestId, operationId) {
            await db.execute(
              sql`select pg_advisory_xact_lock(hashtextextended(${`compensatory-coverage-operation:${actorUserId}:${requestId}:${operationId}`}, 0))`,
            );
          },
          async findOperation(actorUserId, requestId, operationId) {
            const rows = await db
              .select({
                payloadHash: compensatoryCoverageOperation.payloadHash,
                result: compensatoryCoverageOperation.result,
              })
              .from(compensatoryCoverageOperation)
              .where(
                and(
                  eq(compensatoryCoverageOperation.actorUserId, actorUserId),
                  eq(compensatoryCoverageOperation.requestId, requestId),
                  eq(compensatoryCoverageOperation.requestOperationId, operationId),
                ),
              )
              .limit(1);
            const row = rows[0];
            return row
              ? {
                  payloadHash: row.payloadHash,
                  result:
                    row.result as unknown as import("./compensatory-coverage.server").CompensatoryCoverageState,
                }
              : null;
          },
          async lockStaffIds(staffIds) {
            for (const staffId of [...staffIds].sort()) {
              await db.execute(
                sql`select pg_advisory_xact_lock(hashtextextended(${`compensatory-coverage-staff:${staffId}`}, 0))`,
              );
              await db
                .select({ id: compensatoryStaff.id })
                .from(compensatoryStaff)
                .where(eq(compensatoryStaff.id, staffId))
                .for("update")
                .limit(1);
            }
          },
          async findRequest(requestId) {
            const rows = await db
              .select({
                id: compensatoryRequest.id,
                staffId: compensatoryRequest.staffId,
                phase: compensatoryRequest.phase,
                requestedDate: compensatoryRequest.requestedDate,
                requestedMinutes: compensatoryRequest.requestedMinutes,
              })
              .from(compensatoryRequest)
              .where(eq(compensatoryRequest.id, requestId))
              .limit(1);
            return rows[0] ?? null;
          },
          async lockRequest(requestId) {
            const rows = await db
              .select({
                id: compensatoryRequest.id,
                staffId: compensatoryRequest.staffId,
                phase: compensatoryRequest.phase,
                requestedDate: compensatoryRequest.requestedDate,
                requestedMinutes: compensatoryRequest.requestedMinutes,
              })
              .from(compensatoryRequest)
              .where(eq(compensatoryRequest.id, requestId))
              .for("update")
              .limit(1);
            return rows[0] ?? null;
          },
          async getPlan(requestId) {
            const rows = await db
              .select({
                version: compensatoryCoverageTable.version,
                plannedStart: compensatoryCoverageTable.plannedStart,
                plannedEnd: compensatoryCoverageTable.plannedEnd,
                status: compensatoryCoverageTable.status,
              })
              .from(compensatoryCoverageTable)
              .where(eq(compensatoryCoverageTable.requestId, requestId))
              .limit(1);
            const row = rows[0];
            return row
              ? {
                  ...row,
                  plannedStart: row.plannedStart?.toISOString() ?? null,
                  plannedEnd: row.plannedEnd?.toISOString() ?? null,
                  status: row.status as CompensatoryCoverageState["status"],
                }
              : null;
          },
          async listAssignments(requestId) {
            const rows = await db
              .select({
                requestId: compensatoryCoverageAssignment.requestId,
                staffId: compensatoryCoverageAssignment.staffId,
                staffName: compensatoryCoverageAssignment.staffName,
                start: compensatoryCoverageAssignment.start,
                end: compensatoryCoverageAssignment.end,
                confirmed: compensatoryCoverageAssignment.confirmed,
                verificationMethod: compensatoryCoverageAssignment.verificationMethod,
              })
              .from(compensatoryCoverageAssignment)
              .where(eq(compensatoryCoverageAssignment.requestId, requestId))
              .orderBy(
                asc(compensatoryCoverageAssignment.start),
                asc(compensatoryCoverageAssignment.id),
              );
            return rows.map((row) => ({
              ...row,
              start: row.start.toISOString(),
              end: row.end.toISOString(),
            }));
          },
          async listHistory(requestId) {
            const rows = await db
              .select()
              .from(compensatoryCoverageAudit)
              .where(eq(compensatoryCoverageAudit.requestId, requestId))
              .orderBy(asc(compensatoryCoverageAudit.version));
            return rows.map((row) => ({
              actorName: row.actorName,
              reason: row.reason,
              occurredAt: row.occurredAt.toISOString(),
              version: row.version,
              before: row.before as CompensatoryCoverageState,
              after: row.after as CompensatoryCoverageState,
            }));
          },
          async findStaff(staffIds) {
            if (!staffIds.length) return [];
            return db
              .select({
                id: compensatoryStaff.id,
                name: compensatoryStaff.name,
                isActive: compensatoryStaff.isActive,
              })
              .from(compensatoryStaff)
              .where(inArray(compensatoryStaff.id, staffIds));
          },
          async findOverlappingAssignments(staffId, start, end, excludeRequestId) {
            const rows = await db
              .select({
                requestId: compensatoryCoverageAssignment.requestId,
                phase: compensatoryRequest.phase,
                start: compensatoryCoverageAssignment.start,
                end: compensatoryCoverageAssignment.end,
              })
              .from(compensatoryCoverageAssignment)
              .innerJoin(
                compensatoryRequest,
                eq(compensatoryRequest.id, compensatoryCoverageAssignment.requestId),
              )
              .where(
                and(
                  eq(compensatoryCoverageAssignment.staffId, staffId),
                  ne(compensatoryCoverageAssignment.requestId, excludeRequestId),
                  lt(compensatoryCoverageAssignment.start, new Date(end)),
                  gt(compensatoryCoverageAssignment.end, new Date(start)),
                ),
              );
            return rows.map((row) => ({
              ...row,
              start: row.start.toISOString(),
              end: row.end.toISOString(),
            }));
          },
          async savePlan(requestId, state) {
            const values = {
              requestId,
              version: state.version,
              plannedStart: state.plannedStart ? new Date(state.plannedStart) : null,
              plannedEnd: state.plannedEnd ? new Date(state.plannedEnd) : null,
              status: state.status,
              updatedAt: new Date(),
            };
            await db
              .insert(compensatoryCoverageTable)
              .values(values)
              .onConflictDoUpdate({
                target: compensatoryCoverageTable.requestId,
                set: {
                  version: values.version,
                  plannedStart: values.plannedStart,
                  plannedEnd: values.plannedEnd,
                  status: values.status,
                  updatedAt: values.updatedAt,
                },
              });
          },
          async replaceAssignments(requestId, assignments) {
            await db
              .delete(compensatoryCoverageAssignment)
              .where(eq(compensatoryCoverageAssignment.requestId, requestId));
            if (assignments.length)
              await db.insert(compensatoryCoverageAssignment).values(
                assignments.map((a) => ({
                  requestId,
                  staffId: a.staffId,
                  staffName: a.staffName,
                  start: new Date(a.start),
                  end: new Date(a.end),
                  confirmed: a.confirmed,
                  verificationMethod: a.verificationMethod,
                })),
              );
          },
          async insertAudit(audit) {
            await db
              .insert(compensatoryCoverageAudit)
              .values({ ...audit, before: audit.before, after: audit.after });
          },
          async insertOperation(actorUserId, requestId, operationId, payloadHash, result) {
            await db.insert(compensatoryCoverageOperation).values({
              actorUserId,
              requestId,
              requestOperationId: operationId,
              payloadHash,
              resultVersion: result.version,
              result,
            });
          },
        };
        return work(tx);
      });
    },
  };
}

export const compensatoryCoverageService = createCompensatoryCoverageService(
  createCompensatoryCoverageStore(),
);
