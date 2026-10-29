import { describe, expect, it } from "vitest";
import { getTableConfig } from "drizzle-orm/pg-core";
import { compensatoryLedger, compensatoryRequest, compensatoryStaffDeletionAudit } from "./schema";

describe("compensatory staff deletion audit schema", () => {
  it("retains a self-contained deletion snapshot without a deleted-staff foreign key", () => {
    const config = getTableConfig(compensatoryStaffDeletionAudit);
    const columns = new Map(config.columns.map((column) => [column.name, column]));
    expect(columns.get("staff_id")?.notNull).toBe(true);
    expect(columns.get("staff_snapshot")?.notNull).toBe(true);
    expect(columns.get("prior_audits")?.notNull).toBe(true);
    expect(columns.get("reason")?.notNull).toBe(true);
    expect(config.foreignKeys).toHaveLength(1);
    expect(getTableConfig(compensatoryRequest).foreignKeys[0]?.onDelete).toBe("restrict");
    expect(
      getTableConfig(compensatoryLedger).foreignKeys.find((key) =>
        key.reference().columns.some((column) => column.name === "staff_id"),
      )?.onDelete,
    ).toBe("restrict");
    expect(config.uniqueConstraints.map((constraint) => constraint.name)).toContain(
      "compensatory_staff_deletion_operation_unique",
    );
    expect(config.checks.map((check) => check.name)).toContain(
      "compensatory_staff_deletion_reason_valid",
    );
  });
});
