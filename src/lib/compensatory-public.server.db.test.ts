import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const adapter = readFileSync(
  new URL("./compensatory-public.server.db.ts", import.meta.url),
  "utf8",
);
const migration = readFileSync(
  new URL("../../drizzle/0029_public_compensatory_intake.sql", import.meta.url),
  "utf8",
);
const pendingMigration = readFileSync(
  new URL("../../drizzle/0030_public_pending_requests.sql", import.meta.url),
  "utf8",
);

describe("public compensatory database safeguards", () => {
  it("loads operational eligibility fields for both listing and locked submission checks", () => {
    expect(adapter.match(/operationalRole: compensatoryStaff\.operationalRole/g)).toHaveLength(2);
    expect(adapter.match(/operationalStatus: compensatoryStaff\.operationalStatus/g)).toHaveLength(
      2,
    );
  });

  it("projects only active staff identity and serializes public operation retries", () => {
    expect(adapter).toContain("email: compensatoryStaff.email");
    expect(adapter).toContain('.for("update")');
    expect(adapter).toContain("async lockStaff(staffId)");
    expect(adapter).toContain("eq(compensatoryStaff.isActive, true)");
    expect(adapter).toContain("pg_advisory_xact_lock");
    expect(adapter).toContain("compensatory-public-operation:");
    expect(adapter).toContain("clock_timestamp() at time zone 'America/Argentina/Buenos_Aires'");
  });

  it("adds anonymous provenance and public idempotency without rewriting existing rows", () => {
    expect(migration).toContain(
      'ALTER TABLE "compensatory_request" ADD COLUMN "requester_email" text',
    );
    expect(migration).toContain("DROP NOT NULL");
    expect(migration).toContain("compensatory_request_public_operation_unique");
    expect(migration).toContain("submission_source");
    expect(migration).not.toMatch(/\b(UPDATE|DELETE|TRUNCATE)\b/i);
  });

  it("keeps strict admin classification while admitting public pending data without an admin actor", () => {
    expect(pendingMigration).toContain(
      'DROP CONSTRAINT "compensatory_request_classification_pair"',
    );
    expect(pendingMigration).toContain(
      'ADD CONSTRAINT "compensatory_request_classification_pair" CHECK',
    );
    expect(pendingMigration).toContain("\"submission_source\" = 'public'");
    expect(pendingMigration).toContain(
      '"compensatory_request"."classified_at" is null and "compensatory_request"."classified_by_user_id" is null',
    );
    expect(pendingMigration).toContain(
      '"compensatory_request"."classified_at" is not null and "compensatory_request"."classified_by_user_id" is not null',
    );
    expect(pendingMigration).not.toMatch(/\b(UPDATE|DELETE|TRUNCATE)\b/i);
  });
});
