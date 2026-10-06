import { getTableName } from "drizzle-orm";
import { afterEach, describe, expect, it, vi } from "vitest";
import * as schema from "./schema";
import {
  accountAccess,
  accountAudit,
  accountRoleGrant,
  account,
  session,
  user,
  verification,
} from "./schema";

describe("database schema foundation", () => {
  it("exposes the singular model keys used by Better Auth's Drizzle adapter", () => {
    expect(Object.keys(schema)).toEqual(
      expect.arrayContaining(["user", "session", "account", "verification"]),
    );
  });

  it("uses the Better Auth PostgreSQL model table names", () => {
    expect([
      getTableName(user),
      getTableName(session),
      getTableName(account),
      getTableName(verification),
    ]).toEqual(["user", "session", "account", "verification"]);
  });

  it("keeps account grants and versioned audit as relational tables", () => {
    expect(getTableName(accountAccess)).toBe("account_access");
    expect(getTableName(accountRoleGrant)).toBe("account_role_grant");
    expect(getTableName(accountAudit)).toBe("account_audit");
  });
});

describe("lazy database client", () => {
  afterEach(() => vi.unstubAllEnvs());

  it("fails with a controlled configuration error when the URL is absent", async () => {
    vi.stubEnv("DATABASE_URL", "");
    const { getDatabase } = await import("./index.server");
    expect(() => getDatabase()).toThrow("Database is not configured");
  });
});
