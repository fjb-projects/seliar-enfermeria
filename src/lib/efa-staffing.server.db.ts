import { and, asc, eq, isNull, sql } from "drizzle-orm";
import { getDatabase } from "../db/index.server";
import {
  accountAccess,
  accountRoleGrant,
  efaGuard,
  efaStaffingAudit,
  efaStaffingMovement,
  efaStaffingPeriod,
} from "../db/schema";
import {
  createEfaStaffingService,
  type StaffingCause,
  type StaffingMovement,
  type StaffingPeriod,
  type StaffingRole,
  type StaffingStore,
  type StaffingTransaction,
} from "./efa-staffing.server";

const store: StaffingStore = {
  async transaction(work) {
    return getDatabase().transaction(async (db) => {
      const tx: StaffingTransaction = {
        async findActor(userId) {
          const rows = await db
            .select({ isActive: accountAccess.isActive, role: accountRoleGrant.role })
            .from(accountAccess)
            .leftJoin(accountRoleGrant, eq(accountRoleGrant.userId, accountAccess.userId))
            .where(eq(accountAccess.userId, userId));
          return rows.length
            ? {
                isActive: rows[0]!.isActive,
                roles: rows.flatMap((row) => (row.role ? [row.role] : [])),
              }
            : null;
        },
        async findGuard(guardId) {
          const rows = await db
            .select({
              id: efaGuard.id,
              ownerUserId: efaGuard.ownerUserId,
              endedAt: efaGuard.endedAt,
            })
            .from(efaGuard)
            .where(eq(efaGuard.id, guardId))
            .limit(1);
          return rows[0] ?? null;
        },
        async listPeriods(guardId) {
          const rows = await db
            .select({
              id: efaStaffingPeriod.id,
              guardId: efaStaffingPeriod.guardId,
              role: efaStaffingPeriod.role,
              enteredAt: efaStaffingPeriod.enteredAt,
              exitedAt: efaStaffingPeriod.exitedAt,
              exitCause: efaStaffingPeriod.exitCause,
              exitDescription: efaStaffingPeriod.exitDescription,
              version: efaStaffingPeriod.version,
            })
            .from(efaStaffingPeriod)
            .where(eq(efaStaffingPeriod.guardId, guardId))
            .orderBy(asc(efaStaffingPeriod.enteredAt));
          return rows.map((row) => ({
            ...row,
            role: row.role as StaffingRole,
            exitCause: row.exitCause as StaffingCause | null,
          }));
        },
        async findPeriod(periodId) {
          const rows = await db
            .select({
              id: efaStaffingPeriod.id,
              guardId: efaStaffingPeriod.guardId,
              role: efaStaffingPeriod.role,
              enteredAt: efaStaffingPeriod.enteredAt,
              exitedAt: efaStaffingPeriod.exitedAt,
              exitCause: efaStaffingPeriod.exitCause,
              exitDescription: efaStaffingPeriod.exitDescription,
              version: efaStaffingPeriod.version,
            })
            .from(efaStaffingPeriod)
            .where(eq(efaStaffingPeriod.id, periodId))
            .limit(1);
          return rows[0]
            ? ({
                ...rows[0],
                role: rows[0].role as StaffingRole,
                exitCause: rows[0].exitCause as StaffingCause | null,
              } as StaffingPeriod)
            : null;
        },
        async findPeriodByCreationKey(guardId, key) {
          const rows = await db
            .select({
              id: efaStaffingPeriod.id,
              guardId: efaStaffingPeriod.guardId,
              role: efaStaffingPeriod.role,
              enteredAt: efaStaffingPeriod.enteredAt,
              exitedAt: efaStaffingPeriod.exitedAt,
              exitCause: efaStaffingPeriod.exitCause,
              exitDescription: efaStaffingPeriod.exitDescription,
              version: efaStaffingPeriod.version,
            })
            .from(efaStaffingPeriod)
            .where(
              and(
                eq(efaStaffingPeriod.guardId, guardId),
                eq(efaStaffingPeriod.clientCreationKey, key),
              ),
            )
            .limit(1);
          return rows[0]
            ? ({
                ...rows[0],
                role: rows[0].role as StaffingRole,
                exitCause: rows[0].exitCause as StaffingCause | null,
              } as StaffingPeriod)
            : null;
        },
        async insertPeriod(input) {
          await db.insert(efaStaffingPeriod).values(input);
        },
        async updatePeriod(periodId, version, input) {
          const changed = await db
            .update(efaStaffingPeriod)
            .set({ ...input, updatedAt: sql`now()` })
            .where(and(eq(efaStaffingPeriod.id, periodId), eq(efaStaffingPeriod.version, version)))
            .returning({ id: efaStaffingPeriod.id });
          if (!changed.length) throw new Error("La dotación cambió; actualiza la lista.");
        },
        async listMovements(periodId) {
          const rows = await db
            .select({
              id: efaStaffingMovement.id,
              periodId: efaStaffingMovement.periodId,
              kind: efaStaffingMovement.kind,
              departedAt: efaStaffingMovement.departedAt,
              arrivedAt: efaStaffingMovement.arrivedAt,
              cause: efaStaffingMovement.cause,
              description: efaStaffingMovement.description,
              version: efaStaffingMovement.version,
            })
            .from(efaStaffingMovement)
            .where(eq(efaStaffingMovement.periodId, periodId))
            .orderBy(asc(efaStaffingMovement.departedAt));
          return rows.map((row) => ({
            ...row,
            kind: row.kind as StaffingMovement["kind"],
            cause: row.cause as StaffingCause | null,
          }));
        },
        async findMovementByCreationKey(periodId, key) {
          const rows = await db
            .select({
              id: efaStaffingMovement.id,
              periodId: efaStaffingMovement.periodId,
              kind: efaStaffingMovement.kind,
              departedAt: efaStaffingMovement.departedAt,
              arrivedAt: efaStaffingMovement.arrivedAt,
              cause: efaStaffingMovement.cause,
              description: efaStaffingMovement.description,
              version: efaStaffingMovement.version,
              clientCreationKey: efaStaffingMovement.clientCreationKey,
            })
            .from(efaStaffingMovement)
            .where(
              and(
                eq(efaStaffingMovement.periodId, periodId),
                eq(efaStaffingMovement.clientCreationKey, key),
              ),
            )
            .limit(1);
          return (rows[0] as unknown as StaffingMovement & { clientCreationKey: string }) ?? null;
        },
        async findMovement(movementId) {
          const rows = await db
            .select({
              id: efaStaffingMovement.id,
              periodId: efaStaffingMovement.periodId,
              kind: efaStaffingMovement.kind,
              departedAt: efaStaffingMovement.departedAt,
              arrivedAt: efaStaffingMovement.arrivedAt,
              cause: efaStaffingMovement.cause,
              description: efaStaffingMovement.description,
              version: efaStaffingMovement.version,
            })
            .from(efaStaffingMovement)
            .where(eq(efaStaffingMovement.id, movementId))
            .limit(1);
          return (rows[0] as unknown as StaffingMovement) ?? null;
        },
        async insertMovement(input) {
          await db.insert(efaStaffingMovement).values(input);
        },
        async completeMovement(movementId, version, arrivedAt, actorUserId) {
          const changed = await db
            .update(efaStaffingMovement)
            .set({
              arrivedAt,
              completedByUserId: actorUserId,
              version: version + 1,
              updatedAt: sql`now()`,
            })
            .where(
              and(
                eq(efaStaffingMovement.id, movementId),
                eq(efaStaffingMovement.version, version),
                isNull(efaStaffingMovement.arrivedAt),
              ),
            )
            .returning({ id: efaStaffingMovement.id });
          if (!changed.length)
            throw new Error("La llegada o el regreso cambió; actualiza la lista.");
        },
        async appendAudit(input) {
          await db.insert(efaStaffingAudit).values(input);
        },
        async databaseNow() {
          const result = await db.execute(sql`select now() as now`);
          const value = result.rows[0]?.["now"];
          return value instanceof Date ? value : new Date(String(value));
        },
      };
      return work(tx);
    });
  },
};

export const efaStaffing = createEfaStaffingService(store);
