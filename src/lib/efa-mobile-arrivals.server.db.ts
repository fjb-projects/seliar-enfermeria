import { and, desc, eq, sql } from "drizzle-orm";
import { getDatabase } from "../db/index.server";
import {
  accountAccess,
  accountRoleGrant,
  efaBase,
  efaGuard,
  efaGuardBaseEvent,
  efaMobileArrival,
  efaMobileArrivalAudit,
  efaMobileArrivalOperation,
} from "../db/schema";
import {
  createEfaMobileArrivalService,
  type MobileArrivalAudit,
  type MobileArrivalOperation,
  type MobileArrivalRecord,
  type MobileArrivalStore,
  type MobileArrivalTransaction,
  type MobileArrivalRole,
} from "./efa-mobile-arrivals.server";
import type { AccountRole } from "./access";

const store: MobileArrivalStore = {
  async transaction(work) {
    return getDatabase().transaction(async (db) => {
      const tx: MobileArrivalTransaction = {
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
        async findArrival(arrivalId, lock = false) {
          let query = db
            .select()
            .from(efaMobileArrival)
            .where(eq(efaMobileArrival.id, arrivalId))
            .limit(1);
          if (lock) query = query.for("update") as typeof query;
          return ((await query)[0] as MobileArrivalRecord | undefined) ?? null;
        },
        async findArrivalByKey(guardId, baseId, role, lock = false) {
          let query = db
            .select()
            .from(efaMobileArrival)
            .where(
              and(
                eq(efaMobileArrival.guardId, guardId),
                eq(efaMobileArrival.baseId, baseId),
                eq(efaMobileArrival.role, role),
              ),
            )
            .limit(1);
          if (lock) query = query.for("update") as typeof query;
          return ((await query)[0] as MobileArrivalRecord | undefined) ?? null;
        },
        async findByCreationKey(guardId, creationKey, lock = false) {
          let query = db
            .select()
            .from(efaMobileArrival)
            .where(
              and(
                eq(efaMobileArrival.guardId, guardId),
                eq(efaMobileArrival.clientCreationKey, creationKey),
              ),
            )
            .limit(1);
          if (lock) query = query.for("update") as typeof query;
          return ((await query)[0] as MobileArrivalRecord | undefined) ?? null;
        },
        async findOperation(guardId, operationId) {
          const rows = await db
            .select()
            .from(efaMobileArrivalOperation)
            .where(
              and(
                eq(efaMobileArrivalOperation.guardId, guardId),
                eq(efaMobileArrivalOperation.clientOperationId, operationId),
              ),
            )
            .limit(1);
          return (rows[0] as MobileArrivalOperation | undefined) ?? null;
        },
        async listForGuard(guardId) {
          return (await db
            .select()
            .from(efaMobileArrival)
            .where(eq(efaMobileArrival.guardId, guardId))) as MobileArrivalRecord[];
        },
        async listAudit(arrivalId) {
          return (await db
            .select()
            .from(efaMobileArrivalAudit)
            .where(eq(efaMobileArrivalAudit.arrivalId, arrivalId))
            .orderBy(efaMobileArrivalAudit.versionAfter)) as MobileArrivalAudit[];
        },
        async insertArrival(record) {
          await db.insert(efaMobileArrival).values(record);
        },
        async updateArrival(arrivalId, expectedVersion, fields) {
          const changed = await db
            .update(efaMobileArrival)
            .set({ ...fields, updatedAt: sql`now()` })
            .where(
              and(
                eq(efaMobileArrival.id, arrivalId),
                eq(efaMobileArrival.version, expectedVersion),
              ),
            )
            .returning({ id: efaMobileArrival.id });
          if (!changed.length)
            throw new Error("La marca cambió; actualiza la lista antes de continuar.");
        },
        async appendAudit(record) {
          await db.insert(efaMobileArrivalAudit).values(record);
        },
        async insertOperation(record) {
          await db.insert(efaMobileArrivalOperation).values(record);
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

export const efaMobileArrivals = createEfaMobileArrivalService(store);
