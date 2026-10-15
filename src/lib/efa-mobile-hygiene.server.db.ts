import { and, desc, eq, isNull, sql } from "drizzle-orm";
import { getDatabase } from "../db/index.server";
import {
  accountAccess,
  accountRoleGrant,
  efaBase,
  efaGuard,
  efaGuardBaseEvent,
  efaMobileHygienePeriod,
  efaMobileHygienePeriodAudit,
  efaMobileHygienePeriodOperation,
} from "../db/schema";
import {
  createEfaMobileHygieneService,
  type MobileHygieneAudit,
  type MobileHygieneOperation,
  type MobileHygieneRecord,
  type MobileHygieneStore,
  type MobileHygieneTransaction,
} from "./efa-mobile-hygiene.server";
import type { AccountRole } from "./access";

const store: MobileHygieneStore = {
  async transaction(work) {
    return getDatabase().transaction(async (db) => {
      const periodById = (periodId: string) =>
        db
          .select()
          .from(efaMobileHygienePeriod)
          .where(eq(efaMobileHygienePeriod.id, periodId))
          .limit(1);
      const tx: MobileHygieneTransaction = {
        async findActor(userId) {
          const rows = await db
            .select({ isActive: accountAccess.isActive, role: accountRoleGrant.role })
            .from(accountAccess)
            .leftJoin(accountRoleGrant, eq(accountRoleGrant.userId, accountAccess.userId))
            .where(eq(accountAccess.userId, userId));
          if (!rows.length) return null;
          return {
            isActive: rows[0]!.isActive,
            roles: rows.flatMap((row) => (row.role ? [row.role as AccountRole] : [])),
          };
        },
        async findGuard(guardId, lock = false) {
          let query = db
            .select({
              id: efaGuard.id,
              ownerUserId: efaGuard.ownerUserId,
              startedAt: efaGuard.startedAt,
              endedAt: efaGuard.endedAt,
            })
            .from(efaGuard)
            .where(eq(efaGuard.id, guardId))
            .limit(1);
          if (lock) query = query.for("update") as typeof query;
          return (await query)[0] ?? null;
        },
        async findSelectedBase(guardId, baseId) {
          const rows = await db
            .select({ action: efaGuardBaseEvent.action, id: efaBase.id, name: efaBase.name })
            .from(efaGuardBaseEvent)
            .innerJoin(efaBase, eq(efaBase.id, efaGuardBaseEvent.baseId))
            .where(
              and(eq(efaGuardBaseEvent.guardId, guardId), eq(efaGuardBaseEvent.baseId, baseId)),
            )
            .orderBy(desc(efaGuardBaseEvent.sequence))
            .limit(1);
          return rows[0]?.action === "added" ? { id: rows[0].id, name: rows[0].name } : null;
        },
        async findPeriod(periodId, lock = false) {
          let query = periodById(periodId);
          if (lock) query = query.for("update") as typeof query;
          return ((await query)[0] as MobileHygieneRecord | undefined) ?? null;
        },
        async findOpenForBase(guardId, baseId, lock = false) {
          let query = db
            .select()
            .from(efaMobileHygienePeriod)
            .where(
              and(
                eq(efaMobileHygienePeriod.guardId, guardId),
                eq(efaMobileHygienePeriod.baseId, baseId),
                isNull(efaMobileHygienePeriod.availableAt),
                isNull(efaMobileHygienePeriod.deletedAt),
                eq(efaMobileHygienePeriod.notInformed, false),
              ),
            )
            .limit(1);
          if (lock) query = query.for("update") as typeof query;
          return ((await query)[0] as MobileHygieneRecord | undefined) ?? null;
        },
        async findByCreationKey(guardId, creationKey, lock = false) {
          let query = db
            .select()
            .from(efaMobileHygienePeriod)
            .where(
              and(
                eq(efaMobileHygienePeriod.guardId, guardId),
                eq(efaMobileHygienePeriod.clientCreationKey, creationKey),
              ),
            )
            .limit(1);
          if (lock) query = query.for("update") as typeof query;
          return ((await query)[0] as MobileHygieneRecord | undefined) ?? null;
        },
        async findOperation(guardId, operationId) {
          const rows = await db
            .select()
            .from(efaMobileHygienePeriodOperation)
            .where(
              and(
                eq(efaMobileHygienePeriodOperation.guardId, guardId),
                eq(efaMobileHygienePeriodOperation.clientOperationId, operationId),
              ),
            )
            .limit(1);
          return (rows[0] as MobileHygieneOperation | undefined) ?? null;
        },
        async listForGuard(guardId) {
          return (await db
            .select()
            .from(efaMobileHygienePeriod)
            .where(eq(efaMobileHygienePeriod.guardId, guardId))
            .orderBy(efaMobileHygienePeriod.requestedAt)) as MobileHygieneRecord[];
        },
        async listAudit(periodId) {
          return (await db
            .select()
            .from(efaMobileHygienePeriodAudit)
            .where(eq(efaMobileHygienePeriodAudit.periodId, periodId))
            .orderBy(efaMobileHygienePeriodAudit.versionAfter)) as MobileHygieneAudit[];
        },
        async insertPeriod(record) {
          await db.insert(efaMobileHygienePeriod).values(record);
        },
        async updatePeriod(periodId, expectedVersion, fields) {
          const changed = await db
            .update(efaMobileHygienePeriod)
            .set({ ...fields, updatedAt: sql`now()` })
            .where(
              and(
                eq(efaMobileHygienePeriod.id, periodId),
                eq(efaMobileHygienePeriod.version, expectedVersion),
              ),
            )
            .returning({ id: efaMobileHygienePeriod.id });
          if (!changed.length)
            throw new Error("El período cambió; actualiza la lista antes de continuar.");
        },
        async appendAudit(record) {
          await db.insert(efaMobileHygienePeriodAudit).values(record);
        },
        async insertOperation(record) {
          await db.insert(efaMobileHygienePeriodOperation).values(record);
        },
        async databaseNow() {
          const result = await db.execute(sql`select now() as now`);
          return result.rows[0]?.["now"];
        },
      };
      return work(tx);
    });
  },
};

export const efaMobileHygiene = createEfaMobileHygieneService(store);
