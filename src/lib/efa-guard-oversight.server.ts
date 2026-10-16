import { asc, count, desc, eq, inArray, isNotNull, isNull } from "drizzle-orm";
import { getDatabase } from "../db/index.server";
import {
  accountAccess,
  accountRoleGrant,
  efaBase,
  efaDispatch,
  efaEpisode,
  efaGuard,
  efaGuardBaseEvent,
  efaMobileArrival,
  efaMobileHygienePeriod,
  user,
} from "../db/schema";
import { effectiveRoles, type AccountRole } from "./access";
import {
  currentGuardBases,
  type EfaGuardBase,
  type EfaGuardBaseEvent,
  type EfaGuardRecord,
} from "./efa-guards.server";

export type EfaGuardOwner = { name: string; email: string };
export type EfaOversightGuardRecord = EfaGuardRecord & { owner: EfaGuardOwner };
export type EfaGuardServiceTotals = {
  /** Draft and closed count only non-cancelled episodes; cancelled ones are counted apart. */
  episodes: { draft: number; closed: number; cancelled: number };
  /** `total` includes cancelled dispatches; `cancelled` is that subset. */
  dispatches: { total: number; cancelled: number };
  /** Soft-deleted arrivals and hygiene periods are excluded. */
  mobileArrivals: number;
  hygienePeriods: number;
};
export type EfaOversightGuardView = EfaOversightGuardRecord & {
  bases: EfaGuardBase[];
  totals: EfaGuardServiceTotals;
};
export type EfaOversightEpisodeRecord = {
  id: string;
  originGuardId: string;
  eventAt: Date;
  motive: string | null;
  address: string | null;
  interventionNumber: string | null;
  state: "draft" | "closed";
  closedAt: Date | null;
  cancelledAt: Date | null;
};
export type EfaOversightDispatchRecord = {
  id: string;
  episodeId: string;
  baseId: string;
  baseName: string;
  priority: string | null;
  result: string | null;
  state: string;
  t0At: Date | null;
  t1At: Date | null;
  t2At: Date | null;
  t3At: Date | null;
  t4At: Date | null;
  finalizedAt: Date | null;
  cancelledAt: Date | null;
};
export type EfaOversightEpisodeView = EfaOversightEpisodeRecord & {
  dispatches: EfaOversightDispatchRecord[];
};

type GuardCount = { guardId: string; count: number };
type EfaActorRecord = { isActive: boolean; roles: AccountRole[] };
export interface EfaGuardOversightTransaction {
  findActor(userId: string): Promise<EfaActorRecord | null>;
  /** Every guard of every owner, newest start first. */
  listGuards(): Promise<EfaOversightGuardRecord[]>;
  findGuard(guardId: string): Promise<EfaOversightGuardRecord | null>;
  listBases(): Promise<EfaGuardBase[]>;
  /** Base events of the given guards ordered by guard and sequence. */
  listBaseEvents(guardIds: string[]): Promise<EfaGuardBaseEvent[]>;
  countEpisodes(): Promise<Array<GuardCount & { state: "draft" | "closed"; cancelled: boolean }>>;
  countDispatches(): Promise<Array<GuardCount & { cancelled: boolean }>>;
  countArrivals(): Promise<GuardCount[]>;
  countHygienePeriods(): Promise<GuardCount[]>;
  listGuardEpisodes(guardId: string): Promise<EfaOversightEpisodeRecord[]>;
  listGuardDispatches(guardId: string): Promise<EfaOversightDispatchRecord[]>;
}
export interface EfaGuardOversightStore {
  transaction<T>(work: (tx: EfaGuardOversightTransaction) => Promise<T>): Promise<T>;
}

const emptyTotals = (): EfaGuardServiceTotals => ({
  episodes: { draft: 0, closed: 0, cancelled: 0 },
  dispatches: { total: 0, cancelled: 0 },
  mobileArrivals: 0,
  hygienePeriods: 0,
});

export function createEfaGuardOversightService(store: EfaGuardOversightStore) {
  async function requireAdmin(tx: EfaGuardOversightTransaction, userId: string) {
    const current = await tx.findActor(userId);
    if (!current?.isActive) throw new Error("La cuenta está inactiva.");
    if (!effectiveRoles(current.roles).includes("admin")) {
      throw new Error("Se requiere administración vigente.");
    }
  }

  return {
    async listGuards(actorUserId: string): Promise<EfaOversightGuardView[]> {
      return store.transaction(async (tx) => {
        await requireAdmin(tx, actorUserId);
        const guards = await tx.listGuards();
        if (!guards.length) return [];
        const [bases, events, episodes, dispatches, arrivals, hygiene] = await Promise.all([
          tx.listBases(),
          tx.listBaseEvents(guards.map((guard) => guard.id)),
          tx.countEpisodes(),
          tx.countDispatches(),
          tx.countArrivals(),
          tx.countHygienePeriods(),
        ]);
        const totals = new Map(guards.map((guard) => [guard.id, emptyTotals()]));
        for (const row of episodes) {
          const target = totals.get(row.guardId)?.episodes;
          if (!target) continue;
          if (row.cancelled) target.cancelled += row.count;
          else target[row.state] += row.count;
        }
        for (const row of dispatches) {
          const target = totals.get(row.guardId)?.dispatches;
          if (!target) continue;
          target.total += row.count;
          if (row.cancelled) target.cancelled += row.count;
        }
        for (const row of arrivals) {
          const target = totals.get(row.guardId);
          if (target) target.mobileArrivals += row.count;
        }
        for (const row of hygiene) {
          const target = totals.get(row.guardId);
          if (target) target.hygienePeriods += row.count;
        }
        const eventsByGuard = new Map<string, EfaGuardBaseEvent[]>();
        for (const event of events) {
          const list = eventsByGuard.get(event.guardId) ?? [];
          list.push(event);
          eventsByGuard.set(event.guardId, list);
        }
        return guards.map((guard) => ({
          ...guard,
          bases: currentGuardBases(eventsByGuard.get(guard.id) ?? [], bases),
          totals: totals.get(guard.id)!,
        }));
      });
    },

    async listGuardServices(
      actorUserId: string,
      guardId: string,
    ): Promise<EfaOversightEpisodeView[]> {
      return store.transaction(async (tx) => {
        await requireAdmin(tx, actorUserId);
        if (!(await tx.findGuard(guardId))) throw new Error("No se encontró la guardia.");
        const [episodes, dispatches] = await Promise.all([
          tx.listGuardEpisodes(guardId),
          tx.listGuardDispatches(guardId),
        ]);
        const byEpisode = new Map<string, EfaOversightDispatchRecord[]>();
        for (const dispatch of dispatches) {
          const list = byEpisode.get(dispatch.episodeId) ?? [];
          list.push(dispatch);
          byEpisode.set(dispatch.episodeId, list);
        }
        return episodes.map((episode) => ({
          ...episode,
          dispatches: byEpisode.get(episode.id) ?? [],
        }));
      });
    },
  };
}

const guardColumns = {
  id: efaGuard.id,
  ownerUserId: efaGuard.ownerUserId,
  startedAt: efaGuard.startedAt,
  endedAt: efaGuard.endedAt,
  declaredAtCentral: efaGuard.declaredAtCentral,
  version: efaGuard.version,
  owner: { name: user.name, email: user.email },
};

const drizzleStore: EfaGuardOversightStore = {
  async transaction(work) {
    return getDatabase().transaction(async (db) => {
      const tx: EfaGuardOversightTransaction = {
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
        async listGuards() {
          return db
            .select(guardColumns)
            .from(efaGuard)
            .innerJoin(user, eq(user.id, efaGuard.ownerUserId))
            .orderBy(desc(efaGuard.startedAt));
        },
        async findGuard(guardId) {
          const rows = await db
            .select(guardColumns)
            .from(efaGuard)
            .innerJoin(user, eq(user.id, efaGuard.ownerUserId))
            .where(eq(efaGuard.id, guardId))
            .limit(1);
          return rows[0] ?? null;
        },
        async listBases() {
          return db
            .select({ id: efaBase.id, name: efaBase.name, isActive: efaBase.isActive })
            .from(efaBase)
            .orderBy(asc(efaBase.name));
        },
        async listBaseEvents(guardIds) {
          if (!guardIds.length) return [];
          return db
            .select({
              guardId: efaGuardBaseEvent.guardId,
              baseId: efaGuardBaseEvent.baseId,
              baseName: efaBase.name,
              actorUserId: efaGuardBaseEvent.actorUserId,
              sequence: efaGuardBaseEvent.sequence,
              action: efaGuardBaseEvent.action,
              occurredAt: efaGuardBaseEvent.occurredAt,
            })
            .from(efaGuardBaseEvent)
            .innerJoin(efaBase, eq(efaBase.id, efaGuardBaseEvent.baseId))
            .where(inArray(efaGuardBaseEvent.guardId, guardIds))
            .orderBy(asc(efaGuardBaseEvent.guardId), asc(efaGuardBaseEvent.sequence)) as Promise<
            EfaGuardBaseEvent[]
          >;
        },
        async countEpisodes() {
          const cancelled = isNotNull(efaEpisode.cancelledAt);
          const rows = await db
            .select({
              guardId: efaEpisode.originGuardId,
              state: efaEpisode.state,
              cancelled,
              count: count(),
            })
            .from(efaEpisode)
            .groupBy(efaEpisode.originGuardId, efaEpisode.state, cancelled);
          return rows.map((row) => ({
            ...row,
            state: row.state as "draft" | "closed",
            cancelled: Boolean(row.cancelled),
          }));
        },
        async countDispatches() {
          const cancelled = isNotNull(efaDispatch.cancelledAt);
          const rows = await db
            .select({ guardId: efaEpisode.originGuardId, cancelled, count: count() })
            .from(efaDispatch)
            .innerJoin(efaEpisode, eq(efaEpisode.id, efaDispatch.episodeId))
            .groupBy(efaEpisode.originGuardId, cancelled);
          return rows.map((row) => ({ ...row, cancelled: Boolean(row.cancelled) }));
        },
        async countArrivals() {
          return db
            .select({ guardId: efaMobileArrival.guardId, count: count() })
            .from(efaMobileArrival)
            .where(isNull(efaMobileArrival.deletedAt))
            .groupBy(efaMobileArrival.guardId);
        },
        async countHygienePeriods() {
          return db
            .select({ guardId: efaMobileHygienePeriod.guardId, count: count() })
            .from(efaMobileHygienePeriod)
            .where(isNull(efaMobileHygienePeriod.deletedAt))
            .groupBy(efaMobileHygienePeriod.guardId);
        },
        async listGuardEpisodes(guardId) {
          const rows = await db
            .select({
              id: efaEpisode.id,
              originGuardId: efaEpisode.originGuardId,
              eventAt: efaEpisode.eventAt,
              motive: efaEpisode.motive,
              address: efaEpisode.address,
              interventionNumber: efaEpisode.interventionNumber,
              state: efaEpisode.state,
              closedAt: efaEpisode.closedAt,
              cancelledAt: efaEpisode.cancelledAt,
            })
            .from(efaEpisode)
            .where(eq(efaEpisode.originGuardId, guardId))
            .orderBy(asc(efaEpisode.eventAt), asc(efaEpisode.id));
          return rows.map((row) => ({ ...row, state: row.state as "draft" | "closed" }));
        },
        async listGuardDispatches(guardId) {
          return db
            .select({
              id: efaDispatch.id,
              episodeId: efaDispatch.episodeId,
              baseId: efaDispatch.baseId,
              baseName: efaBase.name,
              priority: efaDispatch.priority,
              result: efaDispatch.result,
              state: efaDispatch.state,
              t0At: efaDispatch.t0At,
              t1At: efaDispatch.t1At,
              t2At: efaDispatch.t2At,
              t3At: efaDispatch.t3At,
              t4At: efaDispatch.t4At,
              finalizedAt: efaDispatch.finalizedAt,
              cancelledAt: efaDispatch.cancelledAt,
            })
            .from(efaDispatch)
            .innerJoin(efaEpisode, eq(efaEpisode.id, efaDispatch.episodeId))
            .innerJoin(efaBase, eq(efaBase.id, efaDispatch.baseId))
            .where(eq(efaEpisode.originGuardId, guardId))
            .orderBy(asc(efaDispatch.createdAt), asc(efaDispatch.id));
        },
      };
      return work(tx);
    });
  },
};

export const efaGuardOversight = createEfaGuardOversightService(drizzleStore);
