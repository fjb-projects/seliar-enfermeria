import { and, asc, eq, gte, lte } from "drizzle-orm";
import { getDatabase } from "../db/index.server";
import {
  accountAccess,
  accountRoleGrant,
  efaBase,
  efaStaffingPlan,
  efaStaffingPlanAudit,
  efaStaffingPlanException,
  efaStaffingPlanExceptionAudit,
} from "../db/schema";
import {
  createEfaStaffingPlanService,
  type StaffingPlan,
  type StaffingPlanException,
  type StaffingPlanStore,
  type StaffingPlanTransaction,
} from "./efa-staffing-plan.server";

const store: StaffingPlanStore = {
  async transaction(work) {
    return getDatabase().transaction(async (db) => {
      const tx: StaffingPlanTransaction = {
        async findActor(userId) {
          const rows = await db
            .select({ isActive: accountAccess.isActive, role: accountRoleGrant.role })
            .from(accountAccess)
            .leftJoin(accountRoleGrant, eq(accountRoleGrant.userId, accountAccess.userId))
            .where(eq(accountAccess.userId, userId));
          if (!rows.length) return null;
          return {
            isActive: rows[0]!.isActive,
            roles: rows.flatMap((row) => (row.role ? [row.role] : [])),
          };
        },
        async findBaseById(baseId) {
          const [row] = await db
            .select({ name: efaBase.name })
            .from(efaBase)
            .where(eq(efaBase.id, baseId))
            .limit(1);
          return row ?? null;
        },
        async listPlans(targetKey) {
          const rows = await db
            .select()
            .from(efaStaffingPlan)
            .where(eq(efaStaffingPlan.targetKey, targetKey))
            .orderBy(asc(efaStaffingPlan.effectiveFrom));
          return rows.map((row) => ({
            id: row.id,
            target: { kind: "base", baseId: row.baseId!, name: row.targetName },
            targetKey: row.targetKey,
            effectiveFrom: row.effectiveFrom,
            cycleAnchor: row.cycleAnchor,
            cycleLengthDays: row.cycleLengthDays,
            slots: row.slots as StaffingPlan["slots"],
            version: row.version,
            clientOperationId: row.clientOperationId,
          }));
        },
        async insertPlan(plan) {
          await db.insert(efaStaffingPlan).values({
            id: plan.id,
            targetKind: plan.target.kind,
            baseId: plan.target.baseId,
            targetName: plan.target.name,
            targetKey: plan.targetKey,
            effectiveFrom: plan.effectiveFrom,
            cycleAnchor: plan.cycleAnchor,
            cycleLengthDays: plan.cycleLengthDays,
            slots: plan.slots,
            version: plan.version,
            clientOperationId: plan.clientOperationId,
            createdByUserId: plan.createdByUserId,
          });
        },
        async listExceptions(targetKey, from, to) {
          const rows = await db
            .select()
            .from(efaStaffingPlanException)
            .where(
              and(
                eq(efaStaffingPlanException.targetKey, targetKey),
                gte(efaStaffingPlanException.date, from),
                lte(efaStaffingPlanException.date, to),
              ),
            )
            .orderBy(asc(efaStaffingPlanException.date), asc(efaStaffingPlanException.version));
          return rows.map((row) => ({
            id: row.id,
            target: { kind: "base", baseId: row.baseId!, name: row.targetName },
            targetKey: row.targetKey,
            date: row.date,
            slots: row.slots as StaffingPlanException["slots"],
            version: row.version,
            clientOperationId: row.clientOperationId,
          }));
        },
        async insertException(exception) {
          await db.insert(efaStaffingPlanException).values({
            id: exception.id,
            targetKind: exception.target.kind,
            baseId: exception.target.baseId,
            targetName: exception.target.name,
            targetKey: exception.targetKey,
            date: exception.date,
            slots: exception.slots,
            version: exception.version,
            clientOperationId: exception.clientOperationId,
            createdByUserId: exception.createdByUserId,
          });
        },
        async appendAudit(input) {
          if (input.entity === "plan") {
            await db.insert(efaStaffingPlanAudit).values({
              planId: input.entityId,
              actorUserId: input.actorUserId,
              version: input.version,
              state: input.state,
            });
          } else {
            await db.insert(efaStaffingPlanExceptionAudit).values({
              exceptionId: input.entityId,
              actorUserId: input.actorUserId,
              version: input.version,
              state: input.state,
            });
          }
        },
      };
      return work(tx);
    });
  },
};

export const efaStaffingPlanService = createEfaStaffingPlanService(store);
