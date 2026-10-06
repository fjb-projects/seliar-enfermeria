import { getTableName } from "drizzle-orm";
import { getTableConfig, PgDialect } from "drizzle-orm/pg-core";
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
import { efaBase, efaBaseAudit, efaGuard, efaGuardAudit, efaGuardBaseEvent } from "./schema";

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

  it("defines a stable institutional base catalog with append-only versioned audit", () => {
    expect(getTableName(efaBase)).toBe("efa_base");
    expect(getTableName(efaBaseAudit)).toBe("efa_base_audit");
    const base = getTableConfig(efaBase);
    expect(base.uniqueConstraints.map((constraint) => constraint.name)).toContain(
      "efa_base_normalized_name_unique",
    );
    expect(base.checks.map((constraint) => constraint.name)).toEqual(
      expect.arrayContaining(["efa_base_name_valid", "efa_base_version_positive"]),
    );
    const audit = getTableConfig(efaBaseAudit);
    expect(audit.checks.map((constraint) => constraint.name)).toEqual(
      expect.arrayContaining([
        "efa_base_audit_action_allowed",
        "efa_base_audit_version_transition_valid",
        "efa_base_audit_state_keys_allowlisted",
      ]),
    );
  });

  it("requires the initial audit version to be one and increments only a positive predecessor", () => {
    const check = getTableConfig(accountAudit).checks.find(
      (item) => item.name === "account_audit_version_transition_valid",
    );
    const condition =
      check &&
      new PgDialect()
        .sqlToQuery(check.value)
        .sql.replaceAll('"', "")
        .replaceAll("account_audit.", "");
    expect(condition).toContain("version_before is null");
    expect(condition).toContain("version_after = 1");
    expect(condition).toContain("version_before is not null");
    expect(condition).toContain("version_before > 0");
    expect(condition).toContain("version_after = version_before + 1");
  });

  it("models manually owned EFA guards and an actor-attributed temporal base event log", () => {
    expect(getTableName(efaGuard)).toBe("efa_guard");
    expect(getTableName(efaGuardBaseEvent)).toBe("efa_guard_base_event");
    expect(getTableConfig(efaGuard).checks.map((item) => item.name)).toEqual(
      expect.arrayContaining(["efa_guard_version_positive", "efa_guard_end_after_start"]),
    );
    expect(getTableConfig(efaGuardBaseEvent).checks.map((item) => item.name)).toContain(
      "efa_guard_base_event_action_allowed",
    );
    expect(getTableName(efaGuardAudit)).toBe("efa_guard_audit");
    expect(getTableConfig(efaGuardAudit).checks.map((item) => item.name)).toEqual(
      expect.arrayContaining([
        "efa_guard_audit_action_allowed",
        "efa_guard_audit_version_transition_valid",
        "efa_guard_audit_state_is_object",
        "efa_guard_audit_state_keys_allowlisted",
      ]),
    );
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
