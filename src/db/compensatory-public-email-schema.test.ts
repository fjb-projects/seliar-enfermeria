import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const schema = readFileSync(new URL("./schema.ts", import.meta.url), "utf8");
const migration = readFileSync(new URL("../../drizzle/0033_public_email_idempotency.sql", import.meta.url), "utf8");

describe("public compensatory idempotency schema", () => {
  it("stores an optional client-payload digest without rewriting existing requests", () => {
    expect(schema).toContain('clientPayloadHash: text("client_payload_hash")');
    expect(migration).toContain('ALTER TABLE "compensatory_request" ADD COLUMN "client_payload_hash" text');
    expect(migration).not.toMatch(/\b(UPDATE|DELETE|TRUNCATE)\b/i);
  });
});
