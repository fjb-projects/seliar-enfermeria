import { describe, expect, it } from "vitest";
import {
  clearCoordinationFilters,
  countActiveFilters,
  filterOversightGuards,
  groupGuardsByOwner,
  isGroupedByOwner,
  listGuardOwners,
  patchCoordinationSearch,
  validateCoordinationSearch,
} from "./efa-coordination-filters";

const guard = (
  id: string,
  ownerUserId: string,
  name: string,
  startedAt: string,
  endedAt: string | null,
) => ({
  id,
  ownerUserId,
  owner: { name, email: `${ownerUserId}@example.test` },
  startedAt,
  endedAt,
});

// Noon UTC keeps the Buenos Aires calendar day equal to the UTC one.
const guards = [
  guard("g-4", "ana", "Ana Pérez", "2026-10-09T12:00:00.000Z", null),
  guard("g-3", "bruno", "Bruno Díaz", "2026-10-08T12:00:00.000Z", "2026-10-08T20:00:00.000Z"),
  guard("g-2", "ana", "Ana Pérez", "2026-10-07T12:00:00.000Z", "2026-10-07T20:00:00.000Z"),
  guard("g-1", "carla", "Álvaro Ruiz", "2026-10-05T12:00:00.000Z", "2026-10-05T20:00:00.000Z"),
];
const ids = (list: Array<{ id: string }>) => list.map((item) => item.id);

describe("coordination search validation", () => {
  it("keeps only well-formed filters", () => {
    expect(
      validateCoordinationSearch({
        user: "ana",
        status: "open",
        from: "2026-10-01",
        to: "2026-10-31",
      }),
    ).toEqual({ user: "ana", status: "open", from: "2026-10-01", to: "2026-10-31" });
  });

  it("drops unknown, malformed or empty values", () => {
    expect(
      validateCoordinationSearch({
        user: "",
        status: "pending",
        from: "01/10/2026",
        to: "2026-13-40",
        extra: "x",
      }),
    ).toEqual({});
    expect(validateCoordinationSearch({ user: 7, from: ["2026-10-01"] })).toEqual({});
    expect(validateCoordinationSearch({ status: "all" })).toEqual({});
  });
});

describe("coordination guard filters", () => {
  it("returns every guard without filters", () => {
    expect(ids(filterOversightGuards(guards, { status: "all" }))).toEqual([
      "g-4",
      "g-3",
      "g-2",
      "g-1",
    ]);
  });

  it("filters by owner and status", () => {
    expect(ids(filterOversightGuards(guards, { status: "all", user: "ana" }))).toEqual([
      "g-4",
      "g-2",
    ]);
    expect(ids(filterOversightGuards(guards, { status: "open" }))).toEqual(["g-4"]);
    expect(ids(filterOversightGuards(guards, { status: "closed", user: "ana" }))).toEqual(["g-2"]);
  });

  it("filters by an inclusive start-date range", () => {
    expect(
      ids(filterOversightGuards(guards, { status: "all", from: "2026-10-07", to: "2026-10-08" })),
    ).toEqual(["g-3", "g-2"]);
    expect(ids(filterOversightGuards(guards, { status: "all", from: "2026-10-09" }))).toEqual([
      "g-4",
    ]);
    expect(ids(filterOversightGuards(guards, { status: "all", to: "2026-10-05" }))).toEqual([
      "g-1",
    ]);
  });

  it("uses the Buenos Aires calendar day for the start date", () => {
    const lateNight = guard("late", "ana", "Ana Pérez", "2026-10-08T02:30:00.000Z", null);
    expect(ids(filterOversightGuards([lateNight], { status: "all", to: "2026-10-07" }))).toEqual([
      "late",
    ]);
  });
});

describe("coordination guard grouping", () => {
  it("groups guards by owner sorted by name and keeps guard order", () => {
    const groups = groupGuardsByOwner(guards);
    expect(groups.map((group) => [group.ownerUserId, ids(group.guards)])).toEqual([
      ["carla", ["g-1"]],
      ["ana", ["g-4", "g-2"]],
      ["bruno", ["g-3"]],
    ]);
    expect(groups[1]!.owner).toEqual({ name: "Ana Pérez", email: "ana@example.test" });
  });

  it("lists distinct owners by name for the user filter", () => {
    expect(listGuardOwners(guards)).toEqual([
      { id: "carla", name: "Álvaro Ruiz", email: "carla@example.test" },
      { id: "ana", name: "Ana Pérez", email: "ana@example.test" },
      { id: "bruno", name: "Bruno Díaz", email: "bruno@example.test" },
    ]);
  });
});

describe("coordination view preferences and filter edits", () => {
  it("keeps grouping on by default and reads group=0 as off", () => {
    expect(validateCoordinationSearch({})).toEqual({});
    expect(validateCoordinationSearch({ group: 0 })).toEqual({ group: 0 });
    expect(validateCoordinationSearch({ group: "0" })).toEqual({ group: 0 });
    expect(validateCoordinationSearch({ group: 1 })).toEqual({});
    expect(isGroupedByOwner({})).toBe(true);
    expect(isGroupedByOwner({ group: 0 })).toBe(false);
  });

  it("counts only the active filters, not the grouping preference", () => {
    expect(countActiveFilters({})).toBe(0);
    expect(countActiveFilters({ group: 0 })).toBe(0);
    expect(countActiveFilters({ user: "ana", status: "open", from: "2026-10-01" })).toBe(3);
    expect(countActiveFilters({ to: "2026-10-31", group: 0 })).toBe(1);
  });

  it("patches the search and drops empty or default values", () => {
    expect(patchCoordinationSearch({ user: "ana", status: "open" }, { user: "" })).toEqual({
      status: "open",
    });
    expect(patchCoordinationSearch({ status: "open" }, { status: "all" })).toEqual({});
    expect(patchCoordinationSearch({}, { from: "2026-10-01" })).toEqual({ from: "2026-10-01" });
    expect(patchCoordinationSearch({ group: 0 }, { group: undefined })).toEqual({});
  });

  it("clears the filters but keeps the grouping preference", () => {
    expect(clearCoordinationFilters({ user: "ana", status: "closed", group: 0 })).toEqual({
      group: 0,
    });
    expect(clearCoordinationFilters({ from: "2026-10-01" })).toEqual({});
  });
});
