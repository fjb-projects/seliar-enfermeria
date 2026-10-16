// Pure filtering and grouping for the admin coordination view. The page loads every guard once
// and narrows it on the client, so these functions stay free of server or React dependencies.
import { BUENOS_AIRES_TIME_ZONE } from "@/lib/efa-labels";

export type CoordinationStatusFilter = "all" | "open" | "closed";
export type CoordinationSearch = {
  /** Owner user id. */
  user?: string;
  /** Absent means every guard, so links to the route need no search params. */
  status?: CoordinationStatusFilter;
  /** Inclusive YYYY-MM-DD bounds on the guard start, in Buenos Aires time. */
  from?: string;
  to?: string;
};

type OwnedGuard = {
  ownerUserId: string;
  owner: { name: string; email: string };
  startedAt: Date | string;
  endedAt: Date | string | null;
};

const statusFilters: readonly CoordinationStatusFilter[] = ["all", "open", "closed"];
const dateKeyFormat = new Intl.DateTimeFormat("en-CA", {
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  timeZone: BUENOS_AIRES_TIME_ZONE,
});

function isDateKey(value: unknown): value is string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00.000Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

export function validateCoordinationSearch(search: Record<string, unknown>): CoordinationSearch {
  const status = statusFilters.find((item) => item === search["status"]);
  const user = search["user"];
  return {
    ...(typeof user === "string" && user ? { user } : {}),
    ...(status && status !== "all" ? { status } : {}),
    ...(isDateKey(search["from"]) ? { from: search["from"] } : {}),
    ...(isDateKey(search["to"]) ? { to: search["to"] } : {}),
  };
}

/** Buenos Aires calendar day of a moment as YYYY-MM-DD. */
export function guardDateKey(value: Date | string) {
  return dateKeyFormat.format(new Date(value));
}

export function filterOversightGuards<T extends OwnedGuard>(
  guards: readonly T[],
  search: CoordinationSearch,
): T[] {
  return guards.filter((guard) => {
    if (search.user && guard.ownerUserId !== search.user) return false;
    if (search.status === "open" && guard.endedAt) return false;
    if (search.status === "closed" && !guard.endedAt) return false;
    const day = guardDateKey(guard.startedAt);
    if (search.from && day < search.from) return false;
    if (search.to && day > search.to) return false;
    return true;
  });
}

export type GuardOwnerGroup<T extends OwnedGuard> = {
  ownerUserId: string;
  owner: T["owner"];
  guards: T[];
};

const byName = (left: { name: string }, right: { name: string }) =>
  left.name.localeCompare(right.name, "es", { sensitivity: "base" });

/** Groups guards by owner, sorted by owner name; guards keep their incoming order. */
export function groupGuardsByOwner<T extends OwnedGuard>(guards: readonly T[]) {
  const groups = new Map<string, GuardOwnerGroup<T>>();
  for (const guard of guards) {
    const group = groups.get(guard.ownerUserId);
    if (group) group.guards.push(guard);
    else
      groups.set(guard.ownerUserId, {
        ownerUserId: guard.ownerUserId,
        owner: guard.owner,
        guards: [guard],
      });
  }
  return [...groups.values()].sort((left, right) => byName(left.owner, right.owner));
}

/** Distinct owners sorted by name, for the user filter. */
export function listGuardOwners(guards: readonly OwnedGuard[]) {
  return groupGuardsByOwner(guards).map((group) => ({
    id: group.ownerUserId,
    name: group.owner.name,
    email: group.owner.email,
  }));
}
