import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { getTableConfig } from "drizzle-orm/pg-core";
import { compensatoryPeriod } from "./schema";

describe("compensatory period persistence schema", () => {
  it("keeps one annual/monthly period per agent and year with audited immutable fields", () => {
    const config = getTableConfig(compensatoryPeriod);
    expect(config.name).toBe("compensatory_period");
    expect(config.columns.map((column) => column.name)).toEqual(
      expect.arrayContaining([
        "staff_id",
        "year",
        "month",
        "generated_minutes",
        "external_taken_minutes",
        "annual_net_minutes",
        "reason",
        "actor_user_id",
        "operation_id",
      ]),
    );
    expect(config.uniqueConstraints.map((constraint) => constraint.name)).toEqual(
      expect.arrayContaining([
        "compensatory_period_operation_unique",
        "compensatory_period_revision_unique",
      ]),
    );
    expect(config.indexes.map((index) => index.config.name)).toContain("compensatory_period_active_unique");
  });

  it("adds period storage without rewriting public-intake migrations", () => {
    const migration = readFileSync(new URL("../../drizzle/0031_compensatory_periods.sql", import.meta.url), "utf8");
    expect(migration).toContain('CREATE TABLE "compensatory_period"');
    expect(migration).toContain('REFERENCES "public"."compensatory_staff"');
    expect(migration).toContain('"compensatory_period_period_shape"');
    expect(migration).not.toMatch(/DROP TABLE|UPDATE "compensatory_staff"/i);
  });
});
