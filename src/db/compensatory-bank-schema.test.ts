import { describe, expect, it } from "vitest";
import { getTableConfig } from "drizzle-orm/pg-core";
import {
  compensatoryLedger,
  compensatoryOperation,
  compensatoryStaff,
  compensatoryStaffAudit,
} from "./schema";

describe("compensatory bank schema", () => {
  it("persists canonical unique DNI, nonnegative balances, and the monthly reference default", () => {
    const config = getTableConfig(compensatoryStaff);
    expect(config.columns.find((column) => column.name === "monthly_limit_minutes")?.default).toBe(
      1440,
    );
    expect(config.uniqueConstraints.map((constraint) => constraint.name)).toContain(
      "compensatory_staff_dni_unique",
    );
    expect(config.checks.map((entry) => entry.name)).toContain(
      "compensatory_staff_balance_nonnegative",
    );
    expect(config.checks.map((entry) => entry.name)).toContain("compensatory_staff_dni_canonical");
  });

  it("constrains ledger balance deltas and allows only one reversal per original", () => {
    const config = getTableConfig(compensatoryLedger);
    expect(config.checks.map((entry) => entry.name)).toContain("compensatory_ledger_balance_delta");
    expect(config.indexes.map((index) => index.config.name)).toContain(
      "compensatory_ledger_reversal_once_unique",
    );
    expect(config.foreignKeys.length).toBeGreaterThanOrEqual(2);
  });

  it("keeps operation replay keys actor-scoped and profile audits versioned", () => {
    expect(
      getTableConfig(compensatoryOperation).uniqueConstraints.map((constraint) => constraint.name),
    ).toContain("compensatory_operation_actor_key_unique");
    expect(getTableConfig(compensatoryStaffAudit).checks.map((entry) => entry.name)).toContain(
      "compensatory_staff_audit_version_transition",
    );
  });
});
