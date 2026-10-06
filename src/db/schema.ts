import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  foreignKey,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  primaryKey,
  text,
  timestamp as timestampColumn,
  unique,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

const timestamp = (name: string) => timestampColumn(name, { withTimezone: true, mode: "date" });

export const user = pgTable("user", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  emailVerified: boolean("email_verified").notNull().default(false),
  image: text("image"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const session = pgTable("session", {
  id: text("id").primaryKey(),
  expiresAt: timestamp("expires_at").notNull(),
  token: text("token").notNull().unique(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
  ipAddress: text("ip_address"),
  userAgent: text("user_agent"),
  userId: text("user_id")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
});

export const account = pgTable("account", {
  id: text("id").primaryKey(),
  accountId: text("account_id").notNull(),
  providerId: text("provider_id").notNull(),
  userId: text("user_id")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
  accessToken: text("access_token"),
  refreshToken: text("refresh_token"),
  idToken: text("id_token"),
  accessTokenExpiresAt: timestamp("access_token_expires_at"),
  refreshTokenExpiresAt: timestamp("refresh_token_expires_at"),
  scope: text("scope"),
  password: text("password"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const verification = pgTable("verification", {
  id: text("id").primaryKey(),
  identifier: text("identifier").notNull(),
  value: text("value").notNull(),
  expiresAt: timestamp("expires_at").notNull(),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const accountRole = pgEnum("account_role", ["efa", "admin"]);

// Every account is a nurse account; these rows represent additional grants only.
// Administration implies EFA in server authorization, not through a duplicated grant.

export const accountAccess = pgTable(
  "account_access",
  {
    userId: text("user_id")
      .primaryKey()
      .references(() => user.id, { onDelete: "restrict" }),
    isActive: boolean("is_active").notNull().default(true),
    version: integer("version").notNull().default(1),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (table) => [check("account_access_version_positive", sql`${table.version} > 0`)],
);

export const accountRoleGrant = pgTable(
  "account_role_grant",
  {
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "restrict" }),
    role: accountRole("role").notNull(),
    grantedByUserId: text("granted_by_user_id").references(() => user.id, {
      onDelete: "restrict",
    }),
    grantedAt: timestamp("granted_at").notNull().defaultNow(),
  },
  (table) => [primaryKey({ columns: [table.userId, table.role] })],
);

export const accountAudit = pgTable(
  "account_audit",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    actorUserId: text("actor_user_id").references(() => user.id, { onDelete: "restrict" }),
    targetUserId: text("target_user_id")
      .notNull()
      .references(() => user.id, { onDelete: "restrict" }),
    action: text("action").notNull(),
    versionBefore: integer("version_before"),
    versionAfter: integer("version_after").notNull(),
    beforeState: jsonb("before_state").$type<Record<string, unknown> | null>(),
    afterState: jsonb("after_state").$type<Record<string, unknown>>().notNull(),
    occurredAt: timestamp("occurred_at").notNull().defaultNow(),
  },
  (table) => [
    unique("account_audit_target_version_unique").on(table.targetUserId, table.versionAfter),
    check(
      "account_audit_action_allowed",
      sql`${table.action} in ('created', 'roles_changed', 'disabled', 'reactivated', 'password_reset')`,
    ),
    check(
      "account_audit_version_transition_valid",
      sql`(${table.versionBefore} is null and ${table.versionAfter} = 1) or (${table.versionBefore} is not null and ${table.versionBefore} > 0 and ${table.versionAfter} = ${table.versionBefore} + 1)`,
    ),
    check(
      "account_audit_state_is_object",
      sql`jsonb_typeof(${table.afterState}) = 'object' and (${table.beforeState} is null or jsonb_typeof(${table.beforeState}) = 'object')`,
    ),
    check(
      "account_audit_state_keys_allowlisted",
      sql`(${table.afterState} - 'isActive' - 'roles') = '{}'::jsonb and (${table.beforeState} is null or (${table.beforeState} - 'isActive' - 'roles') = '{}'::jsonb)`,
    ),
  ],
);

export const efaBase = pgTable(
  "efa_base",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    name: text("name").notNull(),
    normalizedName: text("normalized_name").notNull(),
    isActive: boolean("is_active").notNull().default(true),
    version: integer("version").notNull().default(1),
    createdByUserId: text("created_by_user_id")
      .notNull()
      .references(() => user.id, { onDelete: "restrict" }),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (table) => [
    unique("efa_base_normalized_name_unique").on(table.normalizedName),
    check(
      "efa_base_name_valid",
      sql`char_length(btrim(${table.name})) between 1 and 120 and char_length(${table.normalizedName}) between 1 and 120`,
    ),
    check("efa_base_version_positive", sql`${table.version} > 0`),
  ],
);

export const efaBaseAudit = pgTable(
  "efa_base_audit",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    baseId: uuid("base_id")
      .notNull()
      .references(() => efaBase.id, { onDelete: "restrict" }),
    actorUserId: text("actor_user_id")
      .notNull()
      .references(() => user.id, { onDelete: "restrict" }),
    action: text("action").notNull(),
    versionBefore: integer("version_before"),
    versionAfter: integer("version_after").notNull(),
    beforeState: jsonb("before_state").$type<{ name: string; isActive: boolean } | null>(),
    afterState: jsonb("after_state").$type<{ name: string; isActive: boolean }>().notNull(),
    occurredAt: timestamp("occurred_at").notNull().defaultNow(),
  },
  (table) => [
    unique("efa_base_audit_base_version_unique").on(table.baseId, table.versionAfter),
    check(
      "efa_base_audit_action_allowed",
      sql`${table.action} in ('created', 'renamed', 'disabled', 'reactivated')`,
    ),
    check(
      "efa_base_audit_version_transition_valid",
      sql`(${table.versionBefore} is null and ${table.versionAfter} = 1) or (${table.versionBefore} is not null and ${table.versionBefore} > 0 and ${table.versionAfter} = ${table.versionBefore} + 1)`,
    ),
    check(
      "efa_base_audit_state_keys_allowlisted",
      sql`(${table.afterState} - 'name' - 'isActive') = '{}'::jsonb and (${table.beforeState} is null or (${table.beforeState} - 'name' - 'isActive') = '{}'::jsonb)`,
    ),
  ],
);

export const efaGuard = pgTable(
  "efa_guard",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    ownerUserId: text("owner_user_id")
      .notNull()
      .references(() => user.id, { onDelete: "restrict" }),
    startedAt: timestamp("started_at").notNull().defaultNow(),
    endedAt: timestamp("ended_at"),
    declaredAtCentral: boolean("declared_at_central").notNull(),
    version: integer("version").notNull().default(1),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("efa_guard_id_owner_user_unique").on(table.id, table.ownerUserId),
    check("efa_guard_version_positive", sql`${table.version} > 0`),
    check(
      "efa_guard_end_after_start",
      sql`${table.endedAt} is null or ${table.endedAt} >= ${table.startedAt}`,
    ),
    uniqueIndex("efa_guard_one_open_per_owner_unique")
      .on(table.ownerUserId)
      .where(sql`${table.endedAt} is null`),
  ],
);

export const efaGuardAudit = pgTable(
  "efa_guard_audit",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    guardId: uuid("guard_id")
      .notNull()
      .references(() => efaGuard.id, { onDelete: "restrict" }),
    actorUserId: text("actor_user_id")
      .notNull()
      .references(() => user.id, { onDelete: "restrict" }),
    action: text("action").notNull(),
    versionBefore: integer("version_before"),
    versionAfter: integer("version_after").notNull(),
    beforeState: jsonb("before_state").$type<{
      startedAt: string;
      endedAt: string | null;
    } | null>(),
    afterState: jsonb("after_state")
      .$type<{ startedAt: string; endedAt: string | null }>()
      .notNull(),
    occurredAt: timestamp("occurred_at").notNull().defaultNow(),
  },
  (table) => [
    unique("efa_guard_audit_guard_version_unique").on(table.guardId, table.versionAfter),
    check(
      "efa_guard_audit_action_allowed",
      sql`${table.action} in ('started', 'ended', 'end_corrected')`,
    ),
    check(
      "efa_guard_audit_version_transition_valid",
      sql`(${table.versionBefore} is null and ${table.versionAfter} = 1) or (${table.versionBefore} is not null and ${table.versionBefore} > 0 and ${table.versionAfter} = ${table.versionBefore} + 1)`,
    ),
    check(
      "efa_guard_audit_state_is_object",
      sql`jsonb_typeof(${table.afterState}) = 'object' and (${table.beforeState} is null or jsonb_typeof(${table.beforeState}) = 'object')`,
    ),
    check(
      "efa_guard_audit_state_keys_allowlisted",
      sql`(${table.afterState} - 'startedAt' - 'endedAt') = '{}'::jsonb and (${table.beforeState} is null or (${table.beforeState} - 'startedAt' - 'endedAt') = '{}'::jsonb)`,
    ),
  ],
);

export const efaGuardBaseEvent = pgTable(
  "efa_guard_base_event",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    guardId: uuid("guard_id")
      .notNull()
      .references(() => efaGuard.id, { onDelete: "restrict" }),
    baseId: uuid("base_id")
      .notNull()
      .references(() => efaBase.id, { onDelete: "restrict" }),
    actorUserId: text("actor_user_id")
      .notNull()
      .references(() => user.id, { onDelete: "restrict" }),
    sequence: integer("sequence").notNull(),
    action: text("action").notNull(),
    occurredAt: timestamp("occurred_at").notNull().defaultNow(),
  },
  (table) => [
    unique("efa_guard_base_event_guard_sequence_unique").on(table.guardId, table.sequence),
    check("efa_guard_base_event_sequence_positive", sql`${table.sequence} > 0`),
    check("efa_guard_base_event_action_allowed", sql`${table.action} in ('added', 'removed')`),
  ],
);

export const efaEpisode = pgTable(
  "efa_episode",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    clientCreationKey: uuid("client_creation_key").notNull(),
    ownerUserId: text("owner_user_id")
      .notNull()
      .references(() => user.id, { onDelete: "restrict" }),
    originGuardId: uuid("origin_guard_id").notNull(),
    eventAt: timestamp("event_at").notNull(),
    motive: text("motive"),
    address: text("address"),
    interventionNumber: text("intervention_number"),
    state: text("state").notNull().default("draft"),
    version: integer("version").notNull().default(1),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (table) => [
    foreignKey({
      name: "efa_episode_origin_owner_guard_fk",
      columns: [table.originGuardId, table.ownerUserId],
      foreignColumns: [efaGuard.id, efaGuard.ownerUserId],
    }).onDelete("restrict"),
    unique("efa_episode_owner_creation_key_unique").on(table.ownerUserId, table.clientCreationKey),
    unique("efa_episode_id_owner_unique").on(table.id, table.ownerUserId),
    check("efa_episode_version_positive", sql`${table.version} > 0`),
    check("efa_episode_draft_only", sql`${table.state} = 'draft'`),
    check(
      "efa_episode_optional_text_bounds",
      sql`(${table.motive} is null or char_length(${table.motive}) <= 2000) and (${table.address} is null or char_length(${table.address}) <= 1000) and (${table.interventionNumber} is null or char_length(${table.interventionNumber}) <= 100)`,
    ),
  ],
);

export const efaEpisodeAudit = pgTable(
  "efa_episode_audit",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    episodeId: uuid("episode_id")
      .notNull()
      .references(() => efaEpisode.id, { onDelete: "restrict" }),
    actorUserId: text("actor_user_id")
      .notNull()
      .references(() => user.id, { onDelete: "restrict" }),
    operationId: uuid("operation_id").notNull(),
    action: text("action").notNull(),
    versionBefore: integer("version_before"),
    versionAfter: integer("version_after").notNull(),
    beforeState: jsonb("before_state").$type<Record<string, unknown> | null>(),
    afterState: jsonb("after_state").$type<Record<string, unknown>>().notNull(),
    occurredAt: timestamp("occurred_at").notNull().defaultNow(),
  },
  (table) => [
    unique("efa_episode_audit_episode_version_unique").on(table.episodeId, table.versionAfter),
    unique("efa_episode_audit_operation_unique").on(table.episodeId, table.operationId),
    unique("efa_episode_audit_id_episode_unique").on(table.id, table.episodeId),
    check("efa_episode_audit_action_allowed", sql`${table.action} in ('created', 'updated')`),
    check(
      "efa_episode_audit_version_transition_valid",
      sql`(${table.versionBefore} is null and ${table.versionAfter} = 1) or (${table.versionBefore} is not null and ${table.versionBefore} > 0 and ${table.versionAfter} = ${table.versionBefore} + 1)`,
    ),
    check(
      "efa_episode_audit_action_version_valid",
      sql`(${table.action} = 'created' and ${table.versionBefore} is null and ${table.versionAfter} = 1) or (${table.action} = 'updated' and ${table.versionBefore} is not null and ${table.versionAfter} = ${table.versionBefore} + 1)`,
    ),
    check(
      "efa_episode_audit_state_is_object",
      sql`jsonb_typeof(${table.afterState}) = 'object' and (${table.beforeState} is null or jsonb_typeof(${table.beforeState}) = 'object')`,
    ),
    check(
      "efa_episode_audit_state_keys_allowlisted",
      sql`(${table.afterState} - 'eventAt' - 'motive' - 'address' - 'interventionNumber' - 'state') = '{}'::jsonb and (${table.beforeState} is null or (${table.beforeState} - 'eventAt' - 'motive' - 'address' - 'interventionNumber' - 'state') = '{}'::jsonb)`,
    ),
  ],
);

export const efaEpisodeNotice = pgTable(
  "efa_episode_notice",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    episodeId: uuid("episode_id").notNull(),
    auditId: uuid("audit_id").notNull(),
    recipientUserId: text("recipient_user_id")
      .notNull()
      .references(() => user.id, { onDelete: "restrict" }),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    readAt: timestamp("read_at"),
  },
  (table) => [
    foreignKey({
      name: "efa_episode_notice_owner_fk",
      columns: [table.episodeId, table.recipientUserId],
      foreignColumns: [efaEpisode.id, efaEpisode.ownerUserId],
    }).onDelete("restrict"),
    foreignKey({
      name: "efa_episode_notice_audit_episode_fk",
      columns: [table.auditId, table.episodeId],
      foreignColumns: [efaEpisodeAudit.id, efaEpisodeAudit.episodeId],
    }).onDelete("restrict"),
    unique("efa_episode_notice_audit_recipient_unique").on(table.auditId, table.recipientUserId),
  ],
);

export const efaEpisodeOperation = pgTable(
  "efa_episode_operation",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    episodeId: uuid("episode_id")
      .notNull()
      .references(() => efaEpisode.id, { onDelete: "restrict" }),
    actorUserId: text("actor_user_id")
      .notNull()
      .references(() => user.id, { onDelete: "restrict" }),
    clientOperationId: uuid("client_operation_id").notNull(),
    action: text("action").notNull(),
    requestHash: text("request_hash").notNull(),
    appliedVersion: integer("applied_version").notNull(),
    changed: boolean("changed").notNull(),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (table) => [
    unique("efa_episode_operation_episode_client_unique").on(
      table.episodeId,
      table.clientOperationId,
    ),
    check("efa_episode_operation_action_allowed", sql`${table.action} in ('created', 'updated')`),
    check(
      "efa_episode_operation_create_result_valid",
      sql`${table.action} <> 'created' or (${table.appliedVersion} = 1 and ${table.changed})`,
    ),
    check("efa_episode_operation_version_positive", sql`${table.appliedVersion} > 0`),
    check("efa_episode_operation_hash_sha256", sql`${table.requestHash} ~ '^[0-9a-f]{64}$'`),
  ],
);
