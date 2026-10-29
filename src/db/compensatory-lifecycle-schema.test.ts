import { getTableConfig } from "drizzle-orm/pg-core";
import { describe, expect, it } from "vitest";
import { compensatoryLedger, compensatoryRequest, compensatoryRequestAudit } from "./schema";

describe("compensatory lifecycle schema", () => {
  it("keeps imported request fields while adding explicit, nullable operational classification", () => {
    const request = getTableConfig(compensatoryRequest);
    const columns = new Map(request.columns.map((column) => [column.name, column]));
    expect(columns.get("submitted_at")?.dataType).toBe("string");
    expect(columns.get("requester_name")?.dataType).toBe("string");
    expect(columns.get("requester_mobile")?.dataType).toBe("string");
    expect(columns.get("compensatory_date")?.dataType).toBe("string");
    expect(columns.get("hours")?.dataType).toBe("string");
    expect(columns.get("phase")?.notNull).toBe(true);
    expect(columns.get("phase")?.default).toBe("unclassified");
    expect(columns.get("requested_date")?.notNull).toBe(false);
    expect(columns.get("requested_minutes")?.notNull).toBe(false);
    expect(
      request.indexes.some(
        (index) => index.config.name === "compensatory_request_effective_due_idx",
      ),
    ).toBe(true);
    expect(
      getTableConfig(compensatoryLedger).indexes.some(
        (index) => index.config.name === "compensatory_ledger_request_consumption_once_unique",
      ),
    ).toBe(true);

    const audit = getTableConfig(compensatoryRequestAudit);
    expect(audit.checks.map((check) => check.name)).toContain(
      "compensatory_request_audit_phase_transition",
    );
  });
});
