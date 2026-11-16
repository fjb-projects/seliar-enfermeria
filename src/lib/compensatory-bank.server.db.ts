import { and, asc, eq, isNull, sql } from "drizzle-orm";
import { getDatabase } from "../db/index.server";
import {
  accountAccess,
  accountRoleGrant,
  compensatoryLedger,
  compensatoryOperation,
  compensatoryPeriod,
  compensatoryRequest,
  compensatoryStaff,
  compensatoryStaffAudit,
  user,
} from "../db/schema";
import {
  createCompensatoryBankService,
  type CompensatoryBankStore,
  type CompensatoryBankTransaction,
  type CompensatoryPeriodRecord,
  type LedgerRecord,
  type StaffAuditRecord,
  type StaffRecord,
} from "./compensatory-bank.server";

// Neon returns raw timestamp expressions as strings; use the column's Date decoder.
export const compensatoryDatabaseClock = sql<Date>`clock_timestamp()`.mapWith(
  compensatoryStaff.createdAt,
);

export function createCompensatoryBankStore(
  database?: ReturnType<typeof getDatabase>,
): CompensatoryBankStore {
  return {
    async transaction(work) {
      const activeDatabase = database ?? getDatabase();
      return activeDatabase.transaction(async (db) => {
        const tx: CompensatoryBankTransaction = {
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
            return db
              .select()
              .from(compensatoryStaff)
              .orderBy(asc(compensatoryStaff.name)) as Promise<StaffRecord[]>;
          },
          async findStaff(id) {
            const rows = await db
              .select()
              .from(compensatoryStaff)
              .where(eq(compensatoryStaff.id, id))
              .limit(1);
            return (rows[0] as StaffRecord | undefined) ?? null;
          },
          async findStaffByDni(dni) {
            const rows = await db
              .select()
              .from(compensatoryStaff)
              .where(eq(compensatoryStaff.dni, dni))
              .limit(1);
            return (rows[0] as StaffRecord | undefined) ?? null;
          },
          async insertStaff(staff) {
            try {
              await db.insert(compensatoryStaff).values(staff);
            } catch (error) {
              if (
                typeof error === "object" &&
                error !== null &&
                "code" in error &&
                error.code === "23505" &&
                "constraint" in error &&
                error.constraint === "compensatory_staff_dni_unique"
              ) {
                throw new Error("Ya existe un agente con ese DNI.");
              }
              throw error;
            }
          },
          async updateStaff(id, version, changes) {
            const rows = await db
              .update(compensatoryStaff)
              .set({ ...changes, updatedAt: sql`now()` })
              .where(and(eq(compensatoryStaff.id, id), eq(compensatoryStaff.version, version)))
              .returning({ id: compensatoryStaff.id });
            if (!rows.length) throw new Error("La ficha cambió; actualiza la lista.");
          },
          async updateBalance(id, balanceMinutes) {
            const rows = await db
              .update(compensatoryStaff)
              .set({ balanceMinutes, updatedAt: sql`now()` })
              .where(eq(compensatoryStaff.id, id))
              .returning({ id: compensatoryStaff.id });
            if (!rows.length) throw new Error("No se encontró el agente.");
          },
          async listLedger(staffId) {
            return (await db
              .select()
              .from(compensatoryLedger)
              .where(eq(compensatoryLedger.staffId, staffId))
              .orderBy(
                asc(compensatoryLedger.createdAt),
                asc(compensatoryLedger.id),
              )) as LedgerRecord[];
          },
          async listCompensatoryPeriods(staffId, year) {
            return (await db
              .select()
              .from(compensatoryPeriod)
              .where(and(eq(compensatoryPeriod.staffId, staffId), eq(compensatoryPeriod.year, year)))
              .orderBy(
                asc(compensatoryPeriod.effectiveDate),
                asc(compensatoryPeriod.month),
                asc(compensatoryPeriod.revision),
                asc(compensatoryPeriod.id),
              )) as CompensatoryPeriodRecord[];
          },
          async findCompensatoryPeriod(staffId, year, month) {
            const periodMonth = month === null
              ? isNull(compensatoryPeriod.month)
              : eq(compensatoryPeriod.month, month);
            const rows = await db
              .select()
              .from(compensatoryPeriod)
              .where(and(
                eq(compensatoryPeriod.staffId, staffId),
                eq(compensatoryPeriod.year, year),
                periodMonth,
                eq(compensatoryPeriod.status, "active"),
              ))
              .limit(1);
            return (rows[0] as CompensatoryPeriodRecord | undefined) ?? null;
          },
          async findCompensatoryPeriodById(staffId, periodId) {
            const rows = await db
              .select()
              .from(compensatoryPeriod)
              .where(and(eq(compensatoryPeriod.staffId, staffId), eq(compensatoryPeriod.id, periodId)))
              .for("update")
              .limit(1);
            return (rows[0] as CompensatoryPeriodRecord | undefined) ?? null;
          },
          async insertCompensatoryPeriod(period) {
            await db.insert(compensatoryPeriod).values({
              ...period,
              periodKey: period.month === null ? "annual" : String(period.month).padStart(2, "0"),
            });
          },
          async reverseCompensatoryPeriod(periodId, reversal) {
            const rows = await db
              .update(compensatoryPeriod)
              .set({
                status: "reversed",
                reversedAt: reversal.reversedAt,
                reversedByUserId: reversal.reversedByUserId,
                reversedByName: reversal.reversedByName,
                reversalOperationId: reversal.reversalOperationId,
                reversalReason: reversal.reversalReason,
              })
              .where(and(eq(compensatoryPeriod.id, periodId), eq(compensatoryPeriod.status, "active")))
              .returning({ id: compensatoryPeriod.id });
            if (!rows.length) throw new Error("El período cambió; actualiza el historial.");
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
          async findLedger(id) {
            const rows = await db
              .select()
              .from(compensatoryLedger)
              .where(eq(compensatoryLedger.id, id))
              .limit(1);
            return (rows[0] as LedgerRecord | undefined) ?? null;
          },
          async insertLedger(entry) {
            await db.insert(compensatoryLedger).values(entry);
          },
          async insertAudit(audit) {
            await db.insert(compensatoryStaffAudit).values({
              id: audit.id,
              staffId: audit.staffId,
              actorUserId: audit.actorUserId,
              actorName: audit.actorName,
              operationId: audit.operationId,
              action: audit.action,
              versionBefore: audit.versionBefore,
              versionAfter: audit.versionAfter,
              occurredAt: audit.createdAt,
              reason: audit.reason,
              beforeState: audit.before,
              afterState: audit.after,
            });
          },
          async lockOperation(actorUserId, clientOperationId) {
            await db.execute(
              sql`select pg_advisory_xact_lock(hashtextextended(${`${actorUserId}:${clientOperationId}`}, 0))`,
            );
          },
          async findOperation(actorUserId, clientOperationId) {
            const rows = await db
              .select({
                payloadHash: compensatoryOperation.payloadHash,
                resultId: compensatoryOperation.resultId,
              })
              .from(compensatoryOperation)
              .where(
                and(
                  eq(compensatoryOperation.actorUserId, actorUserId),
                  eq(compensatoryOperation.clientOperationId, clientOperationId),
                ),
              )
              .limit(1);
            return rows[0] ?? null;
          },
          async insertOperation(actorUserId, clientOperationId, action, payloadHash, resultId) {
            await db
              .insert(compensatoryOperation)
              .values({ actorUserId, clientOperationId, payloadHash, resultId, action });
          },
          async lockDni(dni) {
            await db.execute(
              sql`select pg_advisory_xact_lock(hashtextextended(${"dni:" + dni}, 0))`,
            );
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
          async databaseNow() {
            const rows = await db
              .select({ now: compensatoryDatabaseClock })
              .from(accountAccess)
              .limit(1);
            return rows[0]!.now;
          },
          async serviceDay() {
            const rows = await db
              .select({
                day: sql<string>`to_char(clock_timestamp() at time zone 'America/Argentina/Buenos_Aires', 'YYYY-MM-DD')`,
              })
              .from(accountAccess)
              .limit(1);
            return rows[0]!.day;
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
        };
        return work(tx);
      });
    },
  };
}

export const compensatoryBank = createCompensatoryBankService(createCompensatoryBankStore());
