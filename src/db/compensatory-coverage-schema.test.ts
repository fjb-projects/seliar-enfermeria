import { getTableColumns } from "drizzle-orm";
import { getTableConfig } from "drizzle-orm/pg-core";
import { describe, expect, it } from "vitest";
import { compensatoryCoverage, compensatoryCoverageAssignment, compensatoryCoverageAudit, compensatoryCoverageOperation } from "./schema";

describe("compensatory coverage schema", () => {
  it("stores an independent version-zero plan and bounded intervals", () => {
    const columns = getTableColumns(compensatoryCoverage);
    expect(columns.version.default).toBe(0);
    expect(columns.version.notNull).toBe(true);
    expect(columns.requestId.primary).toBe(true);
    expect(getTableConfig(compensatoryCoverage).checks.map((check) => check.name)).toEqual(expect.arrayContaining([
      "compensatory_coverage_version_nonnegative",
      "compensatory_coverage_status_allowed",
      "compensatory_coverage_plan_pair",
    ]));
    expect(getTableConfig(compensatoryCoverageAssignment).indexes.map((index) => index.config.name)).toEqual(expect.arrayContaining([
      "compensatory_coverage_assignment_staff_interval_idx",
      "compensatory_coverage_assignment_request_interval_idx",
    ]));
    expect(getTableConfig(compensatoryCoverageAssignment).checks.map((check) => check.name)).toEqual(expect.arrayContaining([
      "compensatory_coverage_assignment_interval",
      "compensatory_coverage_assignment_verification",
    ]));
  });

  it("keeps before/after audit and replay receipts separate from request lifecycle and bank tables", () => {
    expect(Object.keys(getTableColumns(compensatoryCoverageAudit))).toEqual(expect.arrayContaining([
      "actorUserId", "actorName", "reason", "occurredAt", "version", "before", "after",
    ]));
    expect(Object.keys(getTableColumns(compensatoryCoverageOperation))).toEqual(expect.arrayContaining([
      "actorUserId", "requestId", "requestOperationId", "payloadHash", "resultVersion", "result",
    ]));
    expect(getTableConfig(compensatoryCoverageAudit).indexes).toHaveLength(0);
  });
});
