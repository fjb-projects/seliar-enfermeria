import { and, eq, or, sql } from "drizzle-orm";
import { getDatabase } from "../db/index.server";
import {
  accountAccess,
  accountRoleGrant,
  compensatoryOperation,
  compensatoryRequest,
  compensatoryRequestAudit,
  compensatoryStaff,
  user,
} from "../db/schema";
import {
  createAdministrativeCompensatoryRequestService,
  type AdministrativeCompensatoryStore,
  type AdministrativeCompensatoryTransaction,
  type AdministrativeCompensatoryRequest,
} from "./compensatory-admin-request.server";

export function createAdministrativeCompensatoryStore(
  database?: ReturnType<typeof getDatabase>,
): AdministrativeCompensatoryStore {
  return {
    async transaction(work) {
      const activeDatabase = database ?? getDatabase();
      return activeDatabase.transaction(async (db) => {
        const tx: AdministrativeCompensatoryTransaction = {
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
              sql`select pg_advisory_xact_lock(hashtextextended(${`compensatory-request-operation:${actorUserId}:${operationId}`}, 0))`,
            );
            await db.execute(
              sql`select pg_advisory_xact_lock(hashtextextended(${`compensatory-public-operation:${operationId}`}, 0))`,
            );
          },
          async findOperation(actorUserId, operationId) {
            const rows = await db
              .select({
                action: compensatoryOperation.action,
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
            if (rows[0]) return rows[0];
            const priorRequest = await db
              .select({ id: compensatoryRequest.id })
              .from(compensatoryRequest)
              .where(
                and(
                  eq(compensatoryRequest.clientOperationId, operationId),
                  or(
                    eq(compensatoryRequest.createdByUserId, actorUserId),
                    eq(compensatoryRequest.submissionSource, "public"),
                  ),
                ),
              )
              .limit(1);
            return priorRequest[0]
              ? { action: "other_source_request", payloadHash: "", resultId: priorRequest[0].id }
              : null;
          },
          async lockStaff(staffId) {
            const rows = await db
              .select({
                id: compensatoryStaff.id,
                name: compensatoryStaff.name,
                isActive: compensatoryStaff.isActive,
              })
              .from(compensatoryStaff)
              .where(eq(compensatoryStaff.id, staffId))
              .for("update")
              .limit(1);
            return rows[0] ?? null;
          },
          async findPotentialDuplicates(staffId, requestedDate, requestedMinutes) {
            return db
              .select({ id: compensatoryRequest.id })
              .from(compensatoryRequest)
              .where(
                and(
                  eq(compensatoryRequest.staffId, staffId),
                  eq(compensatoryRequest.requestedDate, requestedDate),
                  eq(compensatoryRequest.requestedMinutes, requestedMinutes),
                ),
              );
          },
          async serviceDay() {
            const rows = await db
              .select({
                day: sql<string>`to_char(clock_timestamp() at time zone 'America/Argentina/Buenos_Aires', 'YYYY-MM-DD')`,
              })
              .from(accountAccess)
              .limit(1);
            if (!rows.length) throw new Error("No se pudo validar el día de servicio.");
            return rows[0]!.day;
          },
          async insertRequest(request) {
            const rows = await db.insert(compensatoryRequest).values(request).returning();
            return rows[0]! as AdministrativeCompensatoryRequest;
          },
          async insertRequestAudit(audit) {
            await db.insert(compensatoryRequestAudit).values(audit);
          },
          async insertOperation(actorUserId, operationId, action, payloadHash, resultId) {
            await db.insert(compensatoryOperation).values({
              actorUserId,
              clientOperationId: operationId,
              action,
              payloadHash,
              resultId,
            });
          },
        };
        return work(tx);
      });
    },
  };
}

export const administrativeCompensatoryRequests = createAdministrativeCompensatoryRequestService(
  createAdministrativeCompensatoryStore(),
);
