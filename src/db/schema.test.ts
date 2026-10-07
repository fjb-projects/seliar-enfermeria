import { getTableName } from "drizzle-orm";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
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
import {
  efaBase,
  efaBaseAudit,
  efaGuard,
  efaGuardAudit,
  efaGuardBaseEvent,
  efaEpisode,
  efaEpisodeAudit,
  efaEpisodeNotice,
  efaEpisodeOperation,
  efaCommunication,
  efaCommunicationAudit,
  efaCommunicationNotice,
  efaCommunicationOperation,
  efaDispatch,
  efaDispatchAudit,
  efaDispatchContactAttempt,
  efaDispatchNotice,
  efaDispatchOperation,
  efaSupportRequest,
  efaSupportRequestAudit,
  efaSupportRequestOperation,
  efaSupportRequestNotice,
  efaPoliceCoordination,
  efaPoliceCoordinationDispatch,
  efaPoliceCoordinationEvent,
  efaPoliceCoordinationAudit,
  efaPoliceCoordinationOperation,
  efaPoliceCoordinationNotice,
} from "./schema";

describe("ambulance dispatch persistence", () => {
  it("defines versioned owner-bound dispatches, observed time states, event attempts and support", () => {
    expect(getTableName(efaDispatch)).toBe("efa_dispatch");
    expect(getTableName(efaDispatchAudit)).toBe("efa_dispatch_audit");
    expect(getTableName(efaDispatchContactAttempt)).toBe("efa_dispatch_contact_attempt");
    expect(getTableName(efaDispatchNotice)).toBe("efa_dispatch_notice");
    expect(getTableName(efaDispatchOperation)).toBe("efa_dispatch_operation");
    expect(getTableName(efaSupportRequest)).toBe("efa_support_request");
    expect(getTableName(efaSupportRequestAudit)).toBe("efa_support_request_audit");
    expect(getTableName(efaSupportRequestOperation)).toBe("efa_support_request_operation");
    expect(getTableName(efaSupportRequestNotice)).toBe("efa_support_request_notice");
    const dispatch = getTableConfig(efaDispatch);
    expect(dispatch.checks.map((item) => item.name)).toEqual(
      expect.arrayContaining([
        "efa_dispatch_state_allowed",
        "efa_dispatch_priority_allowed",
        "efa_dispatch_time_observation_statuses_valid",
      ]),
    );
    expect(getTableConfig(efaDispatchNotice).checks.map((item) => item.name)).toContain(
      "efa_dispatch_notice_recipient_is_owner",
    );
    expect(getTableConfig(efaSupportRequestNotice).checks.map((item) => item.name)).toContain(
      "efa_support_request_notice_recipient_is_owner",
    );
    expect(getTableConfig(efaDispatchOperation).checks.map((item) => item.name)).toContain(
      "efa_dispatch_operation_create_result_valid",
    );
    expect(getTableConfig(efaSupportRequestOperation).checks.map((item) => item.name)).toContain(
      "efa_support_request_operation_create_result_valid",
    );
  });

  it("keeps the migration referentially ordered and protects dispatch events and receipts", () => {
    const migration = readFileSync(
      resolve(process.cwd(), "drizzle/0008_efa_dispatches.sql"),
      "utf8",
    );
    expect(
      migration.indexOf('ADD CONSTRAINT "efa_communication_id_episode_owner_unique"'),
    ).toBeLessThan(
      migration.indexOf('ADD CONSTRAINT "efa_dispatch_communication_episode_owner_fk"'),
    );
    for (const trigger of [
      "efa_dispatch_audit_append_only",
      "efa_dispatch_operation_append_only",
      "efa_dispatch_contact_attempt_append_only",
      "efa_support_request_audit_append_only",
      "efa_support_request_operation_append_only",
    ])
      expect(migration).toContain(`CREATE TRIGGER ${trigger}`);
  });
});

describe("EFA police coordination persistence", () => {
  it("models one shared episode record, typed dispatch associations, optional-time events and owner notices", () => {
    expect(getTableName(efaPoliceCoordination)).toBe("efa_police_coordination");
    expect(getTableName(efaPoliceCoordinationDispatch)).toBe("efa_police_coordination_dispatch");
    expect(getTableName(efaPoliceCoordinationEvent)).toBe("efa_police_coordination_event");
    expect(getTableName(efaPoliceCoordinationAudit)).toBe("efa_police_coordination_audit");
    expect(getTableName(efaPoliceCoordinationOperation)).toBe("efa_police_coordination_operation");
    expect(getTableName(efaPoliceCoordinationNotice)).toBe("efa_police_coordination_notice");
    expect(
      getTableConfig(efaPoliceCoordination).uniqueConstraints.map((item) => item.name),
    ).toEqual(
      expect.arrayContaining([
        "efa_police_coordination_id_episode_owner_unique",
        "efa_police_coordination_id_owner_unique",
        "efa_police_coordination_owner_creation_key_unique",
      ]),
    );
    expect(getTableConfig(efaPoliceCoordinationEvent).checks.map((item) => item.name)).toContain(
      "efa_police_coordination_event_dispatch_scope",
    );
    expect(getTableConfig(efaPoliceCoordinationEvent).foreignKeys).toHaveLength(3);
    expect(getTableConfig(efaPoliceCoordinationNotice).checks.map((item) => item.name)).toContain(
      "efa_police_coordination_notice_recipient_is_owner",
    );
  });

  it("orders referenced unique keys and protects immutable coordination history and operation receipts", () => {
    const migration = readFileSync(
      resolve(process.cwd(), "drizzle/0009_efa_police_coordination.sql"),
      "utf8",
    );
    expect(migration.indexOf('CONSTRAINT "efa_police_coordination_id_owner_unique"')).toBeLessThan(
      migration.indexOf('ADD CONSTRAINT "efa_police_coordination_audit_fk"'),
    );
    expect(
      migration.indexOf('CONSTRAINT "efa_police_coordination_dispatch_scope_unique"'),
    ).toBeLessThan(
      migration.indexOf('ADD CONSTRAINT "efa_police_coordination_event_linked_dispatch_fk"'),
    );
    expect(migration).toContain("efa_police_coordination_audit_append_only");
    expect(migration).toContain("efa_police_coordination_operation_append_only");
  });
});

describe("database schema foundation", () => {
  it("models owner-bound phone communications, append-only versions, receipts, and private notices", () => {
    expect(getTableName(efaCommunication)).toBe("efa_communication");
    expect(getTableName(efaCommunicationAudit)).toBe("efa_communication_audit");
    expect(getTableName(efaCommunicationNotice)).toBe("efa_communication_notice");
    expect(getTableName(efaCommunicationOperation)).toBe("efa_communication_operation");

    const communication = getTableConfig(efaCommunication);
    expect(communication.uniqueConstraints.map((item) => item.name)).toEqual(
      expect.arrayContaining([
        "efa_communication_id_owner_unique",
        "efa_communication_owner_creation_key_unique",
      ]),
    );
    expect(communication.checks.map((item) => item.name)).toEqual(
      expect.arrayContaining([
        "efa_communication_direction_allowed",
        "efa_communication_priority_allowed",
        "efa_communication_state_allowed",
        "efa_communication_version_positive",
      ]),
    );
    expect(getTableConfig(efaCommunicationAudit).checks.map((item) => item.name)).toEqual(
      expect.arrayContaining([
        "efa_communication_audit_action_allowed",
        "efa_communication_audit_version_transition_valid",
        "efa_communication_audit_action_version_valid",
      ]),
    );
    expect(getTableConfig(efaCommunicationAudit).foreignKeys).toHaveLength(2);
    expect(getTableConfig(efaCommunicationNotice).foreignKeys).toHaveLength(3);
    expect(getTableConfig(efaCommunicationNotice).checks.map((item) => item.name)).toContain(
      "efa_communication_notice_recipient_is_owner",
    );
    expect(getTableConfig(efaCommunicationOperation).foreignKeys).toHaveLength(2);
    expect(
      getTableConfig(efaCommunicationOperation).uniqueConstraints.map((item) => item.name),
    ).toContain("efa_communication_operation_client_unique");
  });

  it("orders owner uniqueness before composite communication references and adds append-only guards", () => {
    const migration = readFileSync(
      resolve(process.cwd(), "drizzle/0007_efa_communications.sql"),
      "utf8",
    );
    const communicationOwnerUnique = migration.indexOf(
      'CONSTRAINT "efa_communication_id_owner_unique" UNIQUE',
    );
    const auditOwnerForeignKey = migration.indexOf(
      'ADD CONSTRAINT "efa_communication_audit_communication_fk"',
    );
    expect(communicationOwnerUnique).toBeGreaterThanOrEqual(0);
    expect(auditOwnerForeignKey).toBeGreaterThan(communicationOwnerUnique);
    expect(migration).toContain("CREATE TRIGGER efa_communication_audit_append_only");
    expect(migration).toContain("CREATE TRIGGER efa_communication_operation_append_only");
  });

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
    expect(getTableConfig(efaGuard).indexes.map((item) => item.config.name)).toContain(
      "efa_guard_id_owner_user_unique",
    );
    const baseEvents = getTableConfig(efaGuardBaseEvent);
    expect(baseEvents.uniqueConstraints.map((constraint) => constraint.name)).toContain(
      "efa_guard_base_event_guard_sequence_unique",
    );
    expect(baseEvents.checks.map((item) => item.name)).toEqual(
      expect.arrayContaining([
        "efa_guard_base_event_sequence_positive",
        "efa_guard_base_event_action_allowed",
      ]),
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

  it("defines versioned draft episodes, append-only audit, and recipient-scoped notices", () => {
    expect(getTableName(efaEpisode)).toBe("efa_episode");
    expect(getTableName(efaEpisodeAudit)).toBe("efa_episode_audit");
    expect(getTableName(efaEpisodeNotice)).toBe("efa_episode_notice");
    const episode = getTableConfig(efaEpisode);
    expect(episode.uniqueConstraints.map((item) => item.name)).toContain(
      "efa_episode_owner_creation_key_unique",
    );
    expect(episode.checks.map((item) => item.name)).toEqual(
      expect.arrayContaining(["efa_episode_version_positive", "efa_episode_draft_only"]),
    );
    const audit = getTableConfig(efaEpisodeAudit);
    expect(audit.uniqueConstraints.map((item) => item.name)).toContain(
      "efa_episode_audit_episode_version_unique",
    );
    expect(audit.checks.map((item) => item.name)).toEqual(
      expect.arrayContaining([
        "efa_episode_audit_action_allowed",
        "efa_episode_audit_version_transition_valid",
        "efa_episode_audit_action_version_valid",
      ]),
    );
    expect(getTableConfig(efaEpisodeNotice).foreignKeys).toHaveLength(3);
    expect(getTableName(efaEpisodeOperation)).toBe("efa_episode_operation");
    const operation = getTableConfig(efaEpisodeOperation);
    expect(operation.uniqueConstraints.map((item) => item.name)).toContain(
      "efa_episode_operation_episode_client_unique",
    );
    expect(operation.checks.map((item) => item.name)).toEqual(
      expect.arrayContaining([
        "efa_episode_operation_action_allowed",
        "efa_episode_operation_create_result_valid",
        "efa_episode_operation_version_positive",
        "efa_episode_operation_hash_sha256",
      ]),
    );
  });

  it("orders composite referenced uniqueness before migration FKs and protects receipts/history", () => {
    const migration = readFileSync(
      resolve(process.cwd(), "drizzle/0006_efa_episode_drafts.sql"),
      "utf8",
    );
    expect(migration.indexOf('CREATE UNIQUE INDEX "efa_guard_id_owner_user_unique"')).toBeLessThan(
      migration.indexOf('ADD CONSTRAINT "efa_episode_origin_owner_guard_fk"'),
    );
    expect(migration).toContain("CREATE TRIGGER efa_episode_audit_append_only");
    expect(migration).toContain("CREATE TRIGGER efa_episode_operation_append_only");
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
