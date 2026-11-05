import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const adapter = readFileSync(
  new URL("./compensatory-admin-request.server.db.ts", import.meta.url),
  "utf8",
);
const schema = readFileSync(new URL("../db/schema.ts", import.meta.url), "utf8");

describe("administrative compensatory database adapter safeguards", () => {
  it("supports an injected database and uses fresh actor/staff rows plus transaction locks", () => {
    expect(adapter).toContain("export function createAdministrativeCompensatoryStore(");
    expect(adapter).toContain("database?: ReturnType<typeof getDatabase>");
    expect(adapter).toContain('.for("update")');
    expect(adapter).toContain("pg_advisory_xact_lock");
    expect(adapter).toContain("compensatory-request-operation:${actorUserId}:${operationId}");
    expect(adapter).toContain("compensatory-public-operation:${operationId}");
    expect(adapter).toContain('row.role === "admin"');
    expect(adapter).toContain("eq(compensatoryStaff.id, staffId)");
  });

  it("writes request, classification audit, and shared actor-scoped operation records using existing schema", () => {
    expect(adapter).toContain("compensatoryRequestAudit");
    expect(adapter).toContain("compensatoryOperation");
    expect(adapter).toContain("compensatoryRequest.clientOperationId");
    expect(adapter).toContain("compensatoryRequest.createdByUserId");
    expect(adapter).toContain('eq(compensatoryRequest.submissionSource, "public")');
    expect(adapter).not.toContain('eq(compensatoryRequest.phase, "pending")');
    expect(adapter).toContain("America/Argentina/Buenos_Aires");
    expect(schema).toContain('unique("compensatory_operation_actor_key_unique")');
    expect(schema).toContain('check(\n      "compensatory_request_classification_pair"');
  });
});
