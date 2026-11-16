import { and, asc, eq, inArray, lte, sql } from "drizzle-orm";
import { getDatabase } from "../db/index.server";
import {
  accountAccess,
  accountRoleGrant,
  compensatoryLedger,
  compensatoryOperation,
  compensatoryDecisionNotification,
  compensatoryRequest,
  compensatoryRequestAudit,
  compensatoryStaff,
  user,
} from "../db/schema";
import {
  createCompensatoryLifecycleService,
  type CompensatoryLifecycleAudit,
  type CompensatoryDecisionNotification,
  type CompensatoryLifecycleLedger,
  type CompensatoryLifecycleRequest,
  type CompensatoryLifecycleStore,
  type CompensatoryLifecycleTransaction,
} from "./compensatory-lifecycle.server";
import type { StaffRecord } from "./compensatory-bank.server";

export function createCompensatoryLifecycleStore(
  database?: ReturnType<typeof getDatabase>,
): CompensatoryLifecycleStore {
  return {
    async transaction(work) {
      const activeDatabase = database ?? getDatabase();
      return activeDatabase.transaction(async (db) => {
        const tx: CompensatoryLifecycleTransaction = {
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
          async listStaff() {
            return (await db
              .select()
              .from(compensatoryStaff)
              .orderBy(asc(compensatoryStaff.name))) as StaffRecord[];
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
          async findRequest(requestId) {
            const rows = await db
              .select()
              .from(compensatoryRequest)
              .where(eq(compensatoryRequest.id, requestId))
              .limit(1);
            return (rows[0] as CompensatoryLifecycleRequest | undefined) ?? null;
          },
          async lockRequest(requestId) {
            const rows = await db
              .select()
              .from(compensatoryRequest)
              .where(eq(compensatoryRequest.id, requestId))
              .for("update")
              .limit(1);
            return (rows[0] as CompensatoryLifecycleRequest | undefined) ?? null;
          },
          async listRequests(staffId) {
            const query = db
              .select()
              .from(compensatoryRequest)
              .orderBy(asc(compensatoryRequest.createdAt), asc(compensatoryRequest.id));
            const rows = staffId
              ? await query.where(eq(compensatoryRequest.staffId, staffId))
              : await query;
            return rows as CompensatoryLifecycleRequest[];
          },
          async listRequestAudits(requestIds) {
            if (!requestIds.length) return [];
            const rows = await db
              .select()
              .from(compensatoryRequestAudit)
              .where(inArray(compensatoryRequestAudit.requestId, requestIds))
              .orderBy(asc(compensatoryRequestAudit.occurredAt), asc(compensatoryRequestAudit.id));
            return rows as CompensatoryLifecycleAudit[];
          },
          async lockOperation(actorUserId, operationId) {
            await db.execute(
              sql`select pg_advisory_xact_lock(hashtextextended(${`compensatory-lifecycle-operation:${actorUserId}:${operationId}`}, 0))`,
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
          async insertOperation(actorUserId, operationId, action, payloadHash, resultId) {
            await db.insert(compensatoryOperation).values({
              actorUserId,
              clientOperationId: operationId,
              action,
              payloadHash,
              resultId,
            });
          },
          async updateRequest(requestId, expectedVersion, changes) {
            const rows = await db
              .update(compensatoryRequest)
              .set(changes)
              .where(
                and(
                  eq(compensatoryRequest.id, requestId),
                  eq(compensatoryRequest.version, expectedVersion),
                ),
              )
              .returning({ id: compensatoryRequest.id });
            if (!rows.length) throw new Error("La solicitud cambió; actualiza la lista.");
          },
          async insertRequestAudit(audit) {
            await db.insert(compensatoryRequestAudit).values({
              id: audit.id,
              requestId: audit.requestId,
              actorUserId: audit.actorUserId,
              actorName: audit.actorName,
              actorKind: audit.actorKind,
              action: audit.action,
              occurredAt: audit.occurredAt,
              reason: audit.reason,
              versionBefore: audit.versionBefore,
              versionAfter: audit.versionAfter,
              detail: audit.detail,
            });
          },
          async insertDecisionNotification(notification: CompensatoryDecisionNotification) {
            await db.insert(compensatoryDecisionNotification).values(notification);
          },
          async reservedMinutes(staffId) {
            const rows = await db
              .select({
                minutes: sql<number>`coalesce(sum(${compensatoryRequest.requestedMinutes}), 0)`,
              })
              .from(compensatoryRequest)
              .where(
                and(
                  eq(compensatoryRequest.staffId, staffId),
                  eq(compensatoryRequest.phase, "approved"),
                ),
              );
            return Number(rows[0]?.minutes ?? 0);
          },
          async updateStaffBalance(staffId, balanceMinutes) {
            const rows = await db
              .update(compensatoryStaff)
              .set({ balanceMinutes, updatedAt: sql`now()` })
              .where(eq(compensatoryStaff.id, staffId))
              .returning({ id: compensatoryStaff.id });
            if (!rows.length) throw new Error("No se encontró el agente.");
          },
          async insertConsumptionLedger(entry) {
            await db.insert(compensatoryLedger).values(entry);
          },
          async dueRequests(day) {
            return db
              .select({ id: compensatoryRequest.id, staffId: compensatoryRequest.staffId })
              .from(compensatoryRequest)
              .where(
                and(
                  eq(compensatoryRequest.phase, "approved"),
                  lte(compensatoryRequest.requestedDate, day),
                ),
              )
              .orderBy(
                asc(compensatoryRequest.staffId),
                asc(compensatoryRequest.requestedDate),
                asc(compensatoryRequest.createdAt),
              );
          },
          async databaseNow() {
            const rows = await db
              .select({ now: sql<Date>`clock_timestamp()`.mapWith(compensatoryStaff.createdAt) })
              .from(user)
              .limit(1);
            if (!rows.length)
              throw new Error("No hay una cuenta disponible para leer el reloj de base de datos.");
            return rows[0]!.now;
          },
          async serviceDay() {
            const rows = await db
              .select({
                day: sql<string>`to_char(clock_timestamp() at time zone 'America/Argentina/Buenos_Aires', 'YYYY-MM-DD')`,
              })
              .from(user)
              .limit(1);
            if (!rows.length)
              throw new Error("No hay una cuenta disponible para leer el día de servicio.");
            return rows[0]!.day;
          },
        };
        return work(tx);
      });
    },
  };
}

export const compensatoryLifecycle = createCompensatoryLifecycleService(
  createCompensatoryLifecycleStore(),
);

export async function closeCompensatoryLifecycleDatabase() {
  const database = getDatabase();
  const client = (database as { $client?: { end?: () => Promise<void> } }).$client;
  if (typeof client?.end === "function") await client.end();
}
