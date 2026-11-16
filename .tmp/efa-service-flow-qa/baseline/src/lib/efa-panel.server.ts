import { and, asc, count, desc, eq, isNull } from "drizzle-orm";
import { getDatabase } from "../db/index.server";
import { accountAccess, accountRoleGrant, efaEpisode, efaGuard, efaGuardBaseEvent } from "../db/schema";
import { effectiveRoles, type AccountRole } from "./access";

type EfaPanelActor = { isActive: boolean; roles: AccountRole[] };
type EfaPanelGuard = { id: string; ownerUserId: string; startedAt: Date };
type EfaPanelBaseEvent = { baseId: string; sequence: number; action: "added" | "removed" };

export interface EfaPanelTransaction {
  findActor(userId: string): Promise<EfaPanelActor | null>;
  findOpenGuard(ownerUserId: string): Promise<EfaPanelGuard | null>;
  listBaseEvents(guardId: string): Promise<EfaPanelBaseEvent[]>;
  countActiveEpisodes(ownerUserId: string, guardId: string): Promise<number>;
}

export interface EfaPanelStore {
  transaction<T>(work: (tx: EfaPanelTransaction) => Promise<T>): Promise<T>;
}

export type EfaPanelSummary = {
  canWrite: boolean;
  isAdmin: boolean;
  openGuard: {
    startedAt: string;
    baseCount: number;
    activeEpisodeCount: number;
  } | null;
};

export function createEfaPanelService(store: EfaPanelStore) {
  return {
    async summary(userId: string): Promise<EfaPanelSummary> {
      return store.transaction(async (tx) => {
        const actor = await tx.findActor(userId);
        if (!actor?.isActive) throw new Error("La cuenta está inactiva.");
        const roles = effectiveRoles(actor.roles);
        const canWrite = roles.includes("efa");
        const isAdmin = roles.includes("admin");
        if (!canWrite) return { canWrite, isAdmin, openGuard: null };

        const guard = await tx.findOpenGuard(userId);
        if (!guard || guard.ownerUserId !== userId) return { canWrite, isAdmin, openGuard: null };
        const [events, activeEpisodeCount] = await Promise.all([
          tx.listBaseEvents(guard.id),
          tx.countActiveEpisodes(userId, guard.id),
        ]);
        const bases = new Set<string>();
        for (const event of events) {
          if (event.action === "added") bases.add(event.baseId);
          else bases.delete(event.baseId);
        }
        return {
          canWrite,
          isAdmin,
          openGuard: {
            startedAt: guard.startedAt.toISOString(),
            baseCount: bases.size,
            activeEpisodeCount,
          },
        };
      });
    },
  };
}

const drizzleStore: EfaPanelStore = {
  async transaction(work) {
    return getDatabase().transaction(async (db) => {
      const tx: EfaPanelTransaction = {
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
        async findOpenGuard(ownerUserId) {
          const rows = await db
            .select({ id: efaGuard.id, ownerUserId: efaGuard.ownerUserId, startedAt: efaGuard.startedAt })
            .from(efaGuard)
            .where(and(eq(efaGuard.ownerUserId, ownerUserId), isNull(efaGuard.endedAt)))
            .orderBy(desc(efaGuard.startedAt))
            .limit(1);
          return rows[0] ?? null;
        },
        async listBaseEvents(guardId) {
          return db
            .select({ baseId: efaGuardBaseEvent.baseId, sequence: efaGuardBaseEvent.sequence, action: efaGuardBaseEvent.action })
            .from(efaGuardBaseEvent)
            .where(eq(efaGuardBaseEvent.guardId, guardId))
            .orderBy(asc(efaGuardBaseEvent.sequence)) as Promise<EfaPanelBaseEvent[]>;
        },
        async countActiveEpisodes(ownerUserId, guardId) {
          const rows = await db
            .select({ value: count() })
            .from(efaEpisode)
            .where(and(
              eq(efaEpisode.ownerUserId, ownerUserId),
              eq(efaEpisode.originGuardId, guardId),
              eq(efaEpisode.state, "draft"),
              isNull(efaEpisode.cancelledAt),
            ));
          return rows[0]?.value ?? 0;
        },
      };
      return work(tx);
    });
  },
};

export const efaPanel = createEfaPanelService(drizzleStore);
