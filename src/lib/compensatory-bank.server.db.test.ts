import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { compensatoryStaff } from "../db/schema";
import { compensatoryDatabaseClock } from "./compensatory-bank.server.db";

const adapter = readFileSync(new URL("./compensatory-bank.server.db.ts", import.meta.url), "utf8");

describe("compensatory bank database transaction contract", () => {
  it("decodes the Neon's raw clock string before binding Date-mode staff and history columns", () => {
    const clock = compensatoryDatabaseClock as unknown as {
      decoder: { mapFromDriverValue(value: string): Date };
    };
    const instant = clock.decoder.mapFromDriverValue("2026-10-27 19:00:00.123+00");
    expect(instant).toBeInstanceOf(Date);
    expect(instant.toISOString()).toBe("2026-10-27T19:00:00.123Z");
    expect(compensatoryStaff.createdAt.mapToDriverValue(instant)).toBe("2026-10-27T19:00:00.123Z");
  });
  it("keeps mutations inside a Drizzle transaction and serializes per-staff writers", () => {
    expect(adapter).toContain("activeDatabase.transaction");
    expect(adapter).toContain('.for("update")');
    expect(adapter).toContain("updateBalance");
  });

  it("stores audited periods through transaction-scoped insert and uniqueness lookups", () => {
    expect(adapter).toContain("listCompensatoryPeriods");
    expect(adapter).toContain("findCompensatoryPeriod");
    expect(adapter).toContain("insertCompensatoryPeriod");
    expect(adapter).toContain("findCompensatoryPeriodById");
    expect(adapter).toContain("reverseCompensatoryPeriod");
    expect(adapter).toContain('.for("update")');
    expect(adapter).toContain("compensatoryPeriod");
  });

  it("serializes operation and canonical-DNI races with transaction-scoped advisory locks", () => {
    expect(adapter.match(/pg_advisory_xact_lock/g)).toHaveLength(2);
    expect(adapter).toContain("hashtextextended");
    expect(adapter).toContain("compensatoryOperation.actorUserId");
    expect(adapter).toContain("compensatoryOperation.clientOperationId");
  });

  it("derives effective service day and creation timestamps from database time", () => {
    expect(adapter).toContain("sql<Date>`clock_timestamp()`");
    expect(adapter).toContain("America/Argentina/Buenos_Aires");
  });
});
