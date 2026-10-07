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

export const efaStaffingPeriod = pgTable(
  "efa_staffing_period",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    guardId: uuid("guard_id")
      .notNull()
      .references(() => efaGuard.id, { onDelete: "restrict" }),
    role: text("role").notNull(),
    enteredAt: timestamp("entered_at").notNull(),
    exitedAt: timestamp("exited_at"),
    exitCause: text("exit_cause"),
    exitDescription: text("exit_description"),
    clientCreationKey: uuid("client_creation_key").notNull(),
    version: integer("version").notNull().default(1),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (table) => [
    unique("efa_staffing_period_guard_creation_key_unique").on(
      table.guardId,
      table.clientCreationKey,
    ),
    check("efa_staffing_period_role_allowed", sql`${table.role} in ('nurse', 'driver', 'doctor')`),
    check("efa_staffing_period_version_positive", sql`${table.version} > 0`),
    check(
      "efa_staffing_period_exit_after_entry",
      sql`${table.exitedAt} is null or ${table.exitedAt} >= ${table.enteredAt}`,
    ),
    check(
      "efa_staffing_period_exit_cause_allowed",
      sql`${table.exitCause} is null or ${table.exitCause} in ('medical_request', 'coordination', 'temporary', 'other')`,
    ),
    check(
      "efa_staffing_period_other_description_required",
      sql`(${table.exitCause} = 'other' and char_length(btrim(coalesce(${table.exitDescription}, ''))) > 0) or (${table.exitCause} is distinct from 'other' and ${table.exitDescription} is null)`,
    ),
  ],
);

export const efaStaffingMovement = pgTable(
  "efa_staffing_movement",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    periodId: uuid("period_id")
      .notNull()
      .references(() => efaStaffingPeriod.id, { onDelete: "restrict" }),
    kind: text("kind").notNull(),
    departedAt: timestamp("departed_at").notNull(),
    arrivedAt: timestamp("arrived_at"),
    cause: text("cause"),
    description: text("description"),
    clientCreationKey: uuid("client_creation_key").notNull(),
    version: integer("version").notNull().default(1),
    createdByUserId: text("created_by_user_id")
      .notNull()
      .references(() => user.id, { onDelete: "restrict" }),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    completedByUserId: text("completed_by_user_id").references(() => user.id, {
      onDelete: "restrict",
    }),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (table) => [
    unique("efa_staffing_movement_period_creation_key_unique").on(
      table.periodId,
      table.clientCreationKey,
    ),
    uniqueIndex("efa_staffing_movement_one_open_per_period_unique")
      .on(table.periodId)
      .where(sql`${table.arrivedAt} is null`),
    check("efa_staffing_movement_kind_allowed", sql`${table.kind} in ('transfer', 'temporary')`),
    check("efa_staffing_movement_version_positive", sql`${table.version} > 0`),
    check(
      "efa_staffing_movement_arrival_after_departure",
      sql`${table.arrivedAt} is null or ${table.arrivedAt} >= ${table.departedAt}`,
    ),
    check(
      "efa_staffing_movement_cause_allowed",
      sql`${table.cause} is null or ${table.cause} in ('medical_request', 'coordination', 'temporary', 'other')`,
    ),
    check(
      "efa_staffing_movement_other_description_required",
      sql`(${table.cause} = 'other' and char_length(btrim(coalesce(${table.description}, ''))) > 0) or (${table.cause} is distinct from 'other' and ${table.description} is null)`,
    ),
  ],
);

export const efaStaffingAudit = pgTable(
  "efa_staffing_audit",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    periodId: uuid("period_id")
      .notNull()
      .references(() => efaStaffingPeriod.id, { onDelete: "restrict" }),
    actorUserId: text("actor_user_id")
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
    unique("efa_staffing_audit_period_version_unique").on(table.periodId, table.versionAfter),
    check(
      "efa_staffing_audit_action_allowed",
      sql`${table.action} in ('entered', 'exited', 'movement_started', 'movement_completed')`,
    ),
    check(
      "efa_staffing_audit_version_transition_valid",
      sql`(${table.versionBefore} is null and ${table.versionAfter} = 1) or (${table.versionBefore} is not null and ${table.versionBefore} > 0 and ${table.versionAfter} = ${table.versionBefore} + 1)`,
    ),
    check(
      "efa_staffing_audit_states_are_objects",
      sql`jsonb_typeof(${table.afterState}) = 'object' and (${table.beforeState} is null or jsonb_typeof(${table.beforeState}) = 'object')`,
    ),
  ],
);

export const efaStaffingPlan = pgTable(
  "efa_staffing_plan",
  {
    id: uuid("id").primaryKey(),
    targetKind: text("target_kind").notNull(),
    baseId: uuid("base_id").references(() => efaBase.id, { onDelete: "restrict" }),
    targetName: text("target_name").notNull(),
    targetKey: text("target_key").notNull(),
    effectiveFrom: text("effective_from").notNull(),
    cycleAnchor: text("cycle_anchor").notNull(),
    cycleLengthDays: integer("cycle_length_days").notNull(),
    slots: jsonb("slots")
      .$type<
        Array<{
          dayOffset: number;
          role: string;
          start: string;
          end: string;
          endDayOffset: number;
          label: string | null;
        }>
      >()
      .notNull(),
    version: integer("version").notNull(),
    clientOperationId: uuid("client_operation_id").notNull(),
    createdByUserId: text("created_by_user_id")
      .notNull()
      .references(() => user.id, { onDelete: "restrict" }),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (table) => [
    unique("efa_staffing_plan_target_effective_unique").on(table.targetKey, table.effectiveFrom),
    unique("efa_staffing_plan_target_operation_unique").on(
      table.targetKey,
      table.clientOperationId,
    ),
    check("efa_staffing_plan_target_kind_allowed", sql`${table.targetKind} in ('base', 'mobile')`),
    check(
      "efa_staffing_plan_target_identity_valid",
      sql`(${table.targetKind} = 'base' and ${table.baseId} is not null) or (${table.targetKind} = 'mobile' and ${table.baseId} is null)`,
    ),
    check(
      "efa_staffing_plan_dates_valid",
      sql`${table.effectiveFrom} ~ '^\\d{4}-\\d{2}-\\d{2}$' and ${table.cycleAnchor} ~ '^\\d{4}-\\d{2}-\\d{2}$'`,
    ),
    check("efa_staffing_plan_cycle_length_valid", sql`${table.cycleLengthDays} between 1 and 366`),
    check("efa_staffing_plan_version_positive", sql`${table.version} > 0`),
    check("efa_staffing_plan_slots_array", sql`jsonb_typeof(${table.slots}) = 'array'`),
  ],
);

export const efaStaffingPlanException = pgTable(
  "efa_staffing_plan_exception",
  {
    id: uuid("id").primaryKey(),
    targetKind: text("target_kind").notNull(),
    baseId: uuid("base_id").references(() => efaBase.id, { onDelete: "restrict" }),
    targetName: text("target_name").notNull(),
    targetKey: text("target_key").notNull(),
    date: text("date").notNull(),
    slots: jsonb("slots")
      .$type<
        Array<{
          role: string;
          start: string;
          end: string;
          endDayOffset: number;
          label: string | null;
        }>
      >()
      .notNull(),
    version: integer("version").notNull(),
    clientOperationId: uuid("client_operation_id").notNull(),
    createdByUserId: text("created_by_user_id")
      .notNull()
      .references(() => user.id, { onDelete: "restrict" }),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (table) => [
    unique("efa_staffing_plan_exception_version_unique").on(
      table.targetKey,
      table.date,
      table.version,
    ),
    unique("efa_staffing_plan_exception_operation_unique").on(
      table.targetKey,
      table.clientOperationId,
    ),
    check(
      "efa_staffing_plan_exception_target_kind_allowed",
      sql`${table.targetKind} in ('base', 'mobile')`,
    ),
    check(
      "efa_staffing_plan_exception_target_identity_valid",
      sql`(${table.targetKind} = 'base' and ${table.baseId} is not null) or (${table.targetKind} = 'mobile' and ${table.baseId} is null)`,
    ),
    check("efa_staffing_plan_exception_date_valid", sql`${table.date} ~ '^\\d{4}-\\d{2}-\\d{2}$'`),
    check("efa_staffing_plan_exception_version_positive", sql`${table.version} > 0`),
    check("efa_staffing_plan_exception_slots_array", sql`jsonb_typeof(${table.slots}) = 'array'`),
  ],
);

export const efaStaffingPlanAudit = pgTable(
  "efa_staffing_plan_audit",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    planId: uuid("plan_id")
      .notNull()
      .references(() => efaStaffingPlan.id, { onDelete: "restrict" }),
    actorUserId: text("actor_user_id")
      .notNull()
      .references(() => user.id, { onDelete: "restrict" }),
    version: integer("version").notNull(),
    state: jsonb("state").$type<Record<string, unknown>>().notNull(),
    occurredAt: timestamp("occurred_at").notNull().defaultNow(),
  },
  (table) => [
    unique("efa_staffing_plan_audit_plan_version_unique").on(table.planId, table.version),
    check("efa_staffing_plan_audit_version_positive", sql`${table.version} > 0`),
    check("efa_staffing_plan_audit_state_object", sql`jsonb_typeof(${table.state}) = 'object'`),
  ],
);

export const efaStaffingPlanExceptionAudit = pgTable(
  "efa_staffing_plan_exception_audit",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    exceptionId: uuid("exception_id")
      .notNull()
      .references(() => efaStaffingPlanException.id, { onDelete: "restrict" }),
    actorUserId: text("actor_user_id")
      .notNull()
      .references(() => user.id, { onDelete: "restrict" }),
    version: integer("version").notNull(),
    state: jsonb("state").$type<Record<string, unknown>>().notNull(),
    occurredAt: timestamp("occurred_at").notNull().defaultNow(),
  },
  (table) => [
    unique("efa_staffing_plan_exception_audit_version_unique").on(table.exceptionId, table.version),
    check("efa_staffing_plan_exception_audit_version_positive", sql`${table.version} > 0`),
    check(
      "efa_staffing_plan_exception_audit_state_object",
      sql`jsonb_typeof(${table.state}) = 'object'`,
    ),
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
    closedAt: timestamp("closed_at"),
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
    unique("efa_episode_id_guard_owner_unique").on(
      table.id,
      table.originGuardId,
      table.ownerUserId,
    ),
    check("efa_episode_version_positive", sql`${table.version} > 0`),
    check("efa_episode_state_allowed", sql`${table.state} in ('draft', 'closed')`),
    check(
      "efa_episode_closure_state_valid",
      sql`(${table.state} = 'draft' and ${table.closedAt} is null) or (${table.state} = 'closed' and ${table.closedAt} is not null)`,
    ),
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
    check(
      "efa_episode_audit_action_allowed",
      sql`${table.action} in ('created', 'updated', 'closed')`,
    ),
    check(
      "efa_episode_audit_version_transition_valid",
      sql`(${table.versionBefore} is null and ${table.versionAfter} = 1) or (${table.versionBefore} is not null and ${table.versionBefore} > 0 and ${table.versionAfter} = ${table.versionBefore} + 1)`,
    ),
    check(
      "efa_episode_audit_action_version_valid",
      sql`(${table.action} = 'created' and ${table.versionBefore} is null and ${table.versionAfter} = 1) or (${table.action} in ('updated', 'closed') and ${table.versionBefore} is not null and ${table.versionAfter} = ${table.versionBefore} + 1)`,
    ),
    check(
      "efa_episode_audit_state_is_object",
      sql`jsonb_typeof(${table.afterState}) = 'object' and (${table.beforeState} is null or jsonb_typeof(${table.beforeState}) = 'object')`,
    ),
    check(
      "efa_episode_audit_state_keys_allowlisted",
      sql`(${table.afterState} - 'eventAt' - 'motive' - 'address' - 'interventionNumber' - 'state' - 'closedAt') = '{}'::jsonb and (${table.beforeState} is null or (${table.beforeState} - 'eventAt' - 'motive' - 'address' - 'interventionNumber' - 'state' - 'closedAt') = '{}'::jsonb)`,
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
    check(
      "efa_episode_operation_action_allowed",
      sql`${table.action} in ('created', 'updated', 'closed')`,
    ),
    check(
      "efa_episode_operation_create_result_valid",
      sql`${table.action} <> 'created' or (${table.appliedVersion} = 1 and ${table.changed})`,
    ),
    check("efa_episode_operation_version_positive", sql`${table.appliedVersion} > 0`),
    check("efa_episode_operation_hash_sha256", sql`${table.requestHash} ~ '^[0-9a-f]{64}$'`),
  ],
);

export const efaCommunication = pgTable(
  "efa_communication",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    episodeId: uuid("episode_id").notNull(),
    ownerUserId: text("owner_user_id").notNull(),
    clientCreationKey: uuid("client_creation_key").notNull(),
    direction: text("direction").notNull(),
    startedAt: timestamp("started_at"),
    endedAt: timestamp("ended_at"),
    priority: text("priority"),
    state: text("state").notNull().default("draft"),
    version: integer("version").notNull().default(1),
    finalizedAt: timestamp("finalized_at"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (table) => [
    foreignKey({
      name: "efa_communication_episode_owner_fk",
      columns: [table.episodeId, table.ownerUserId],
      foreignColumns: [efaEpisode.id, efaEpisode.ownerUserId],
    }).onDelete("restrict"),
    unique("efa_communication_id_owner_unique").on(table.id, table.ownerUserId),
    unique("efa_communication_id_episode_owner_unique").on(
      table.id,
      table.episodeId,
      table.ownerUserId,
    ),
    unique("efa_communication_owner_creation_key_unique").on(
      table.ownerUserId,
      table.clientCreationKey,
    ),
    check(
      "efa_communication_direction_allowed",
      sql`${table.direction} in ('incoming', 'outgoing')`,
    ),
    check(
      "efa_communication_priority_allowed",
      sql`${table.priority} is null or ${table.priority} in ('red', 'yellow', 'green')`,
    ),
    check(
      "efa_communication_state_allowed",
      sql`(${table.state} = 'draft' and ${table.finalizedAt} is null) or (${table.state} = 'finalized' and ${table.finalizedAt} is not null and ${table.priority} is not null)`,
    ),
    check("efa_communication_version_positive", sql`${table.version} > 0`),
  ],
);

export const efaCommunicationAudit = pgTable(
  "efa_communication_audit",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    communicationId: uuid("communication_id").notNull(),
    ownerUserId: text("owner_user_id").notNull(),
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
    foreignKey({
      name: "efa_communication_audit_communication_fk",
      columns: [table.communicationId, table.ownerUserId],
      foreignColumns: [efaCommunication.id, efaCommunication.ownerUserId],
    }).onDelete("restrict"),
    unique("efa_communication_audit_communication_version_unique").on(
      table.communicationId,
      table.versionAfter,
    ),
    unique("efa_communication_audit_communication_operation_unique").on(
      table.communicationId,
      table.operationId,
    ),
    unique("efa_communication_audit_id_communication_unique").on(table.id, table.communicationId),
    check(
      "efa_communication_audit_action_allowed",
      sql`${table.action} in ('created', 'updated', 'finalized')`,
    ),
    check(
      "efa_communication_audit_version_transition_valid",
      sql`(${table.versionBefore} is null and ${table.versionAfter} = 1) or (${table.versionBefore} is not null and ${table.versionBefore} > 0 and ${table.versionAfter} = ${table.versionBefore} + 1)`,
    ),
    check(
      "efa_communication_audit_action_version_valid",
      sql`(${table.action} = 'created' and ${table.versionBefore} is null and ${table.versionAfter} = 1) or (${table.action} in ('updated', 'finalized') and ${table.versionBefore} is not null and ${table.versionAfter} = ${table.versionBefore} + 1)`,
    ),
    check(
      "efa_communication_audit_state_is_object",
      sql`jsonb_typeof(${table.afterState}) = 'object' and (${table.beforeState} is null or jsonb_typeof(${table.beforeState}) = 'object')`,
    ),
    check(
      "efa_communication_audit_state_keys_allowlisted",
      sql`(${table.afterState} - 'direction' - 'startedAt' - 'endedAt' - 'priority' - 'state' - 'finalizedAt') = '{}'::jsonb and (${table.beforeState} is null or (${table.beforeState} - 'direction' - 'startedAt' - 'endedAt' - 'priority' - 'state' - 'finalizedAt') = '{}'::jsonb)`,
    ),
  ],
);

export const efaCommunicationOperation = pgTable(
  "efa_communication_operation",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    communicationId: uuid("communication_id").notNull(),
    ownerUserId: text("owner_user_id").notNull(),
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
    foreignKey({
      name: "efa_communication_operation_communication_fk",
      columns: [table.communicationId, table.ownerUserId],
      foreignColumns: [efaCommunication.id, efaCommunication.ownerUserId],
    }).onDelete("restrict"),
    unique("efa_communication_operation_client_unique").on(
      table.communicationId,
      table.clientOperationId,
    ),
    check(
      "efa_communication_operation_action_allowed",
      sql`${table.action} in ('created', 'updated', 'finalized')`,
    ),
    check(
      "efa_communication_operation_create_result_valid",
      sql`${table.action} <> 'created' or (${table.appliedVersion} = 1 and ${table.changed})`,
    ),
    check("efa_communication_operation_version_positive", sql`${table.appliedVersion} > 0`),
    check("efa_communication_operation_hash_sha256", sql`${table.requestHash} ~ '^[0-9a-f]{64}$'`),
  ],
);

export const efaCommunicationNotice = pgTable(
  "efa_communication_notice",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    communicationId: uuid("communication_id").notNull(),
    ownerUserId: text("owner_user_id").notNull(),
    auditId: uuid("audit_id").notNull(),
    recipientUserId: text("recipient_user_id")
      .notNull()
      .references(() => user.id, { onDelete: "restrict" }),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    readAt: timestamp("read_at"),
  },
  (table) => [
    foreignKey({
      name: "efa_communication_notice_owner_fk",
      columns: [table.communicationId, table.ownerUserId],
      foreignColumns: [efaCommunication.id, efaCommunication.ownerUserId],
    }).onDelete("restrict"),
    foreignKey({
      name: "efa_communication_notice_audit_fk",
      columns: [table.auditId, table.communicationId],
      foreignColumns: [efaCommunicationAudit.id, efaCommunicationAudit.communicationId],
    }).onDelete("restrict"),
    check(
      "efa_communication_notice_recipient_is_owner",
      sql`${table.recipientUserId} = ${table.ownerUserId}`,
    ),
    unique("efa_communication_notice_audit_recipient_unique").on(
      table.auditId,
      table.recipientUserId,
    ),
  ],
);

export const efaDispatch = pgTable(
  "efa_dispatch",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    episodeId: uuid("episode_id").notNull(),
    ownerUserId: text("owner_user_id").notNull(),
    baseId: uuid("base_id")
      .notNull()
      .references(() => efaBase.id, { onDelete: "restrict" }),
    communicationId: uuid("communication_id"),
    clientCreationKey: uuid("client_creation_key").notNull(),
    priority: text("priority"),
    t0At: timestamp("t0_at"),
    t0Status: text("t0_status").notNull().default("not_observed"),
    t1At: timestamp("t1_at"),
    t1Status: text("t1_status").notNull().default("not_observed"),
    t2At: timestamp("t2_at"),
    t2Status: text("t2_status").notNull().default("not_observed"),
    t3At: timestamp("t3_at"),
    t3Status: text("t3_status").notNull().default("not_observed"),
    t4At: timestamp("t4_at"),
    t4Status: text("t4_status").notNull().default("not_observed"),
    t5At: timestamp("t5_at"),
    t5Status: text("t5_status").notNull().default("not_observed"),
    t6At: timestamp("t6_at"),
    t6Status: text("t6_status").notNull().default("not_observed"),
    firstResponseRole: text("first_response_role"),
    firstResponseAt: timestamp("first_response_at"),
    note: text("note"),
    result: text("result"),
    resultClarification: text("result_clarification"),
    state: text("state").notNull().default("draft"),
    version: integer("version").notNull().default(1),
    finalizedAt: timestamp("finalized_at"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (table) => [
    foreignKey({
      name: "efa_dispatch_episode_owner_fk",
      columns: [table.episodeId, table.ownerUserId],
      foreignColumns: [efaEpisode.id, efaEpisode.ownerUserId],
    }).onDelete("restrict"),
    foreignKey({
      name: "efa_dispatch_communication_episode_owner_fk",
      columns: [table.communicationId, table.episodeId, table.ownerUserId],
      foreignColumns: [
        efaCommunication.id,
        efaCommunication.episodeId,
        efaCommunication.ownerUserId,
      ],
    }).onDelete("restrict"),
    unique("efa_dispatch_id_owner_unique").on(table.id, table.ownerUserId),
    unique("efa_dispatch_id_episode_owner_unique").on(table.id, table.episodeId, table.ownerUserId),
    unique("efa_dispatch_owner_creation_key_unique").on(table.ownerUserId, table.clientCreationKey),
    check(
      "efa_dispatch_priority_allowed",
      sql`${table.priority} is null or ${table.priority} in ('red','yellow','green')`,
    ),
    check(
      "efa_dispatch_result_allowed",
      sql`${table.result} is null or ${table.result} in ('transported','treated_at_home','refused','not_located','cancelled','death','not_informed')`,
    ),
    check(
      "efa_dispatch_state_allowed",
      sql`(${table.state} = 'draft' and ${table.finalizedAt} is null) or (${table.state} = 'finalized' and ${table.finalizedAt} is not null and ${table.priority} is not null and ${table.result} is not null)`,
    ),
    check("efa_dispatch_version_positive", sql`${table.version} > 0`),
    check(
      "efa_dispatch_time_observation_statuses_valid",
      sql`(${table.t0Status} in ('observed','not_observed','not_informed','not_applicable') and ((${table.t0Status} = 'observed') = (${table.t0At} is not null))) and (${table.t1Status} in ('observed','not_observed','not_informed','not_applicable') and ((${table.t1Status} = 'observed') = (${table.t1At} is not null))) and (${table.t2Status} in ('observed','not_observed','not_informed','not_applicable') and ((${table.t2Status} = 'observed') = (${table.t2At} is not null))) and (${table.t3Status} in ('observed','not_observed','not_informed','not_applicable') and ((${table.t3Status} = 'observed') = (${table.t3At} is not null))) and (${table.t4Status} in ('observed','not_observed','not_informed','not_applicable') and ((${table.t4Status} = 'observed') = (${table.t4At} is not null))) and (${table.t5Status} in ('observed','not_observed','not_informed','not_applicable') and ((${table.t5Status} = 'observed') = (${table.t5At} is not null))) and (${table.t6Status} in ('observed','not_observed','not_informed','not_applicable') and ((${table.t6Status} = 'observed') = (${table.t6At} is not null)))`,
    ),
  ],
);

export const efaDispatchAudit = pgTable(
  "efa_dispatch_audit",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    dispatchId: uuid("dispatch_id").notNull(),
    ownerUserId: text("owner_user_id").notNull(),
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
    foreignKey({
      name: "efa_dispatch_audit_dispatch_fk",
      columns: [table.dispatchId, table.ownerUserId],
      foreignColumns: [efaDispatch.id, efaDispatch.ownerUserId],
    }).onDelete("restrict"),
    unique("efa_dispatch_audit_dispatch_version_unique").on(table.dispatchId, table.versionAfter),
    unique("efa_dispatch_audit_dispatch_operation_unique").on(table.dispatchId, table.operationId),
    unique("efa_dispatch_audit_id_dispatch_unique").on(table.id, table.dispatchId),
    check(
      "efa_dispatch_audit_action_allowed",
      sql`${table.action} in ('created','updated','finalized')`,
    ),
    check(
      "efa_dispatch_audit_version_transition_valid",
      sql`(${table.versionBefore} is null and ${table.versionAfter} = 1) or (${table.versionBefore} > 0 and ${table.versionAfter} = ${table.versionBefore} + 1)`,
    ),
    check(
      "efa_dispatch_audit_state_object",
      sql`jsonb_typeof(${table.afterState}) = 'object' and (${table.beforeState} is null or jsonb_typeof(${table.beforeState}) = 'object')`,
    ),
  ],
);

export const efaDispatchOperation = pgTable(
  "efa_dispatch_operation",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    dispatchId: uuid("dispatch_id").notNull(),
    ownerUserId: text("owner_user_id").notNull(),
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
    foreignKey({
      name: "efa_dispatch_operation_dispatch_fk",
      columns: [table.dispatchId, table.ownerUserId],
      foreignColumns: [efaDispatch.id, efaDispatch.ownerUserId],
    }).onDelete("restrict"),
    unique("efa_dispatch_operation_client_unique").on(table.dispatchId, table.clientOperationId),
    check(
      "efa_dispatch_operation_action_allowed",
      sql`${table.action} in ('created','updated','finalized')`,
    ),
    check(
      "efa_dispatch_operation_create_result_valid",
      sql`${table.action} <> 'created' or (${table.appliedVersion} = 1 and ${table.changed})`,
    ),
    check("efa_dispatch_operation_hash_sha256", sql`${table.requestHash} ~ '^[0-9a-f]{64}$'`),
    check("efa_dispatch_operation_version_positive", sql`${table.appliedVersion} > 0`),
  ],
);

export const efaDispatchNotice = pgTable(
  "efa_dispatch_notice",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    dispatchId: uuid("dispatch_id").notNull(),
    ownerUserId: text("owner_user_id").notNull(),
    auditId: uuid("audit_id").notNull(),
    recipientUserId: text("recipient_user_id")
      .notNull()
      .references(() => user.id, { onDelete: "restrict" }),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    readAt: timestamp("read_at"),
  },
  (table) => [
    foreignKey({
      name: "efa_dispatch_notice_owner_fk",
      columns: [table.dispatchId, table.ownerUserId],
      foreignColumns: [efaDispatch.id, efaDispatch.ownerUserId],
    }).onDelete("restrict"),
    foreignKey({
      name: "efa_dispatch_notice_audit_fk",
      columns: [table.auditId, table.dispatchId],
      foreignColumns: [efaDispatchAudit.id, efaDispatchAudit.dispatchId],
    }).onDelete("restrict"),
    unique("efa_dispatch_notice_audit_recipient_unique").on(table.auditId, table.recipientUserId),
    check(
      "efa_dispatch_notice_recipient_is_owner",
      sql`${table.recipientUserId} = ${table.ownerUserId}`,
    ),
  ],
);

export const efaDispatchContactAttempt = pgTable(
  "efa_dispatch_contact_attempt",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    dispatchId: uuid("dispatch_id").notNull(),
    ownerUserId: text("owner_user_id").notNull(),
    actorUserId: text("actor_user_id")
      .notNull()
      .references(() => user.id, { onDelete: "restrict" }),
    clientEventId: uuid("client_event_id").notNull(),
    occurredAt: timestamp("occurred_at").notNull(),
    note: text("note"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (table) => [
    foreignKey({
      name: "efa_dispatch_contact_attempt_dispatch_fk",
      columns: [table.dispatchId, table.ownerUserId],
      foreignColumns: [efaDispatch.id, efaDispatch.ownerUserId],
    }).onDelete("restrict"),
    unique("efa_dispatch_contact_attempt_event_unique").on(table.dispatchId, table.clientEventId),
    check(
      "efa_dispatch_contact_attempt_note_length",
      sql`${table.note} is null or char_length(${table.note}) <= 1000`,
    ),
  ],
);

export const efaSupportRequest = pgTable(
  "efa_support_request",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    ownerUserId: text("owner_user_id").notNull(),
    episodeId: uuid("episode_id").notNull(),
    sourceDispatchId: uuid("source_dispatch_id").notNull(),
    responseDispatchId: uuid("response_dispatch_id"),
    clientCreationKey: uuid("client_creation_key").notNull(),
    requestedAt: timestamp("requested_at").notNull(),
    reason: text("reason").notNull(),
    version: integer("version").notNull().default(1),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (table) => [
    foreignKey({
      name: "efa_support_request_episode_owner_fk",
      columns: [table.episodeId, table.ownerUserId],
      foreignColumns: [efaEpisode.id, efaEpisode.ownerUserId],
    }).onDelete("restrict"),
    foreignKey({
      name: "efa_support_request_source_dispatch_fk",
      columns: [table.sourceDispatchId, table.episodeId, table.ownerUserId],
      foreignColumns: [efaDispatch.id, efaDispatch.episodeId, efaDispatch.ownerUserId],
    }).onDelete("restrict"),
    foreignKey({
      name: "efa_support_request_response_dispatch_fk",
      columns: [table.responseDispatchId, table.episodeId, table.ownerUserId],
      foreignColumns: [efaDispatch.id, efaDispatch.episodeId, efaDispatch.ownerUserId],
    }).onDelete("restrict"),
    unique("efa_support_request_id_owner_unique").on(table.id, table.ownerUserId),
    unique("efa_support_request_owner_creation_key_unique").on(
      table.ownerUserId,
      table.clientCreationKey,
    ),
    check(
      "efa_support_request_reason_length",
      sql`char_length(btrim(${table.reason})) between 1 and 1000`,
    ),
    check("efa_support_request_version_positive", sql`${table.version} > 0`),
  ],
);

export const efaSupportRequestAudit = pgTable(
  "efa_support_request_audit",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    supportRequestId: uuid("support_request_id").notNull(),
    ownerUserId: text("owner_user_id").notNull(),
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
    foreignKey({
      name: "efa_support_request_audit_request_fk",
      columns: [table.supportRequestId, table.ownerUserId],
      foreignColumns: [efaSupportRequest.id, efaSupportRequest.ownerUserId],
    }).onDelete("restrict"),
    unique("efa_support_request_audit_version_unique").on(
      table.supportRequestId,
      table.versionAfter,
    ),
    unique("efa_support_request_audit_operation_unique").on(
      table.supportRequestId,
      table.operationId,
    ),
    unique("efa_support_request_audit_id_request_unique").on(table.id, table.supportRequestId),
    check(
      "efa_support_request_audit_action_allowed",
      sql`${table.action} in ('created','updated')`,
    ),
    check(
      "efa_support_request_audit_transition_valid",
      sql`(${table.versionBefore} is null and ${table.versionAfter} = 1) or (${table.versionBefore} > 0 and ${table.versionAfter} = ${table.versionBefore} + 1)`,
    ),
    check(
      "efa_support_request_audit_state_object",
      sql`jsonb_typeof(${table.afterState}) = 'object' and (${table.beforeState} is null or jsonb_typeof(${table.beforeState}) = 'object')`,
    ),
  ],
);

export const efaSupportRequestOperation = pgTable(
  "efa_support_request_operation",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    supportRequestId: uuid("support_request_id").notNull(),
    ownerUserId: text("owner_user_id").notNull(),
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
    foreignKey({
      name: "efa_support_request_operation_request_fk",
      columns: [table.supportRequestId, table.ownerUserId],
      foreignColumns: [efaSupportRequest.id, efaSupportRequest.ownerUserId],
    }).onDelete("restrict"),
    unique("efa_support_request_operation_client_unique").on(
      table.supportRequestId,
      table.clientOperationId,
    ),
    check(
      "efa_support_request_operation_action_allowed",
      sql`${table.action} in ('created','updated')`,
    ),
    check(
      "efa_support_request_operation_create_result_valid",
      sql`${table.action} <> 'created' or (${table.appliedVersion} = 1 and ${table.changed})`,
    ),
    check(
      "efa_support_request_operation_hash_sha256",
      sql`${table.requestHash} ~ '^[0-9a-f]{64}$'`,
    ),
    check("efa_support_request_operation_version_positive", sql`${table.appliedVersion} > 0`),
  ],
);

export const efaSupportRequestNotice = pgTable(
  "efa_support_request_notice",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    supportRequestId: uuid("support_request_id").notNull(),
    ownerUserId: text("owner_user_id").notNull(),
    auditId: uuid("audit_id").notNull(),
    recipientUserId: text("recipient_user_id")
      .notNull()
      .references(() => user.id, { onDelete: "restrict" }),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    readAt: timestamp("read_at"),
  },
  (table) => [
    foreignKey({
      name: "efa_support_request_notice_owner_fk",
      columns: [table.supportRequestId, table.ownerUserId],
      foreignColumns: [efaSupportRequest.id, efaSupportRequest.ownerUserId],
    }).onDelete("restrict"),
    foreignKey({
      name: "efa_support_request_notice_audit_fk",
      columns: [table.auditId, table.supportRequestId],
      foreignColumns: [efaSupportRequestAudit.id, efaSupportRequestAudit.supportRequestId],
    }).onDelete("restrict"),
    unique("efa_support_request_notice_audit_recipient_unique").on(
      table.auditId,
      table.recipientUserId,
    ),
    check(
      "efa_support_request_notice_recipient_is_owner",
      sql`${table.recipientUserId} = ${table.ownerUserId}`,
    ),
  ],
);

export const efaPoliceCoordination = pgTable(
  "efa_police_coordination",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    episodeId: uuid("episode_id").notNull(),
    ownerUserId: text("owner_user_id").notNull(),
    clientCreationKey: uuid("client_creation_key").notNull(),
    initiator: text("initiator").notNull(),
    initiatingDispatchId: uuid("initiating_dispatch_id"),
    placeType: text("place_type").notNull(),
    meetingReference: text("meeting_reference"),
    notes: text("notes"),
    state: text("state").notNull().default("draft"),
    version: integer("version").notNull().default(1),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (table) => [
    foreignKey({
      name: "efa_police_coordination_episode_owner_fk",
      columns: [table.episodeId, table.ownerUserId],
      foreignColumns: [efaEpisode.id, efaEpisode.ownerUserId],
    }).onDelete("restrict"),
    foreignKey({
      name: "efa_police_coordination_initiating_dispatch_fk",
      columns: [table.initiatingDispatchId, table.episodeId, table.ownerUserId],
      foreignColumns: [efaDispatch.id, efaDispatch.episodeId, efaDispatch.ownerUserId],
    }).onDelete("restrict"),
    unique("efa_police_coordination_id_episode_owner_unique").on(
      table.id,
      table.episodeId,
      table.ownerUserId,
    ),
    unique("efa_police_coordination_id_owner_unique").on(table.id, table.ownerUserId),
    unique("efa_police_coordination_owner_creation_key_unique").on(
      table.ownerUserId,
      table.clientCreationKey,
    ),
    check(
      "efa_police_coordination_initiator_allowed",
      sql`${table.initiator} in ('central','ambulance')`,
    ),
    check(
      "efa_police_coordination_place_allowed",
      sql`${table.placeType} in ('incident','meeting_point')`,
    ),
    check("efa_police_coordination_state_allowed", sql`${table.state} in ('draft','finalized')`),
    check("efa_police_coordination_version_positive", sql`${table.version} > 0`),
    check(
      "efa_police_coordination_reference_lengths",
      sql`(${table.meetingReference} is null or char_length(${table.meetingReference}) <= 500) and (${table.notes} is null or char_length(${table.notes}) <= 2000)`,
    ),
  ],
);

export const efaPoliceCoordinationDispatch = pgTable(
  "efa_police_coordination_dispatch",
  {
    coordinationId: uuid("coordination_id").notNull(),
    episodeId: uuid("episode_id").notNull(),
    ownerUserId: text("owner_user_id").notNull(),
    dispatchId: uuid("dispatch_id").notNull(),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (table) => [
    primaryKey({ columns: [table.coordinationId, table.dispatchId] }),
    foreignKey({
      name: "efa_police_coordination_dispatch_coordination_fk",
      columns: [table.coordinationId, table.episodeId, table.ownerUserId],
      foreignColumns: [
        efaPoliceCoordination.id,
        efaPoliceCoordination.episodeId,
        efaPoliceCoordination.ownerUserId,
      ],
    }).onDelete("restrict"),
    foreignKey({
      name: "efa_police_coordination_dispatch_dispatch_fk",
      columns: [table.dispatchId, table.episodeId, table.ownerUserId],
      foreignColumns: [efaDispatch.id, efaDispatch.episodeId, efaDispatch.ownerUserId],
    }).onDelete("restrict"),
    unique("efa_police_coordination_dispatch_scope_unique").on(
      table.coordinationId,
      table.dispatchId,
      table.episodeId,
      table.ownerUserId,
    ),
  ],
);

export const efaPoliceCoordinationEvent = pgTable(
  "efa_police_coordination_event",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    coordinationId: uuid("coordination_id").notNull(),
    episodeId: uuid("episode_id").notNull(),
    ownerUserId: text("owner_user_id").notNull(),
    dispatchId: uuid("dispatch_id"),
    actorUserId: text("actor_user_id")
      .notNull()
      .references(() => user.id, { onDelete: "restrict" }),
    clientEventId: uuid("client_event_id").notNull(),
    kind: text("kind").notNull(),
    occurredAt: timestamp("occurred_at"),
    timeStatus: text("time_status").notNull().default("not_observed"),
    note: text("note"),
    version: integer("version").notNull().default(1),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (table) => [
    foreignKey({
      name: "efa_police_coordination_event_coordination_fk",
      columns: [table.coordinationId, table.episodeId, table.ownerUserId],
      foreignColumns: [
        efaPoliceCoordination.id,
        efaPoliceCoordination.episodeId,
        efaPoliceCoordination.ownerUserId,
      ],
    }).onDelete("restrict"),
    foreignKey({
      name: "efa_police_coordination_event_linked_dispatch_fk",
      columns: [table.coordinationId, table.dispatchId, table.episodeId, table.ownerUserId],
      foreignColumns: [
        efaPoliceCoordinationDispatch.coordinationId,
        efaPoliceCoordinationDispatch.dispatchId,
        efaPoliceCoordinationDispatch.episodeId,
        efaPoliceCoordinationDispatch.ownerUserId,
      ],
    }).onDelete("restrict"),
    unique("efa_police_coordination_event_id_scope_unique").on(
      table.id,
      table.coordinationId,
      table.ownerUserId,
    ),
    unique("efa_police_coordination_event_client_unique").on(
      table.coordinationId,
      table.clientEventId,
    ),
    check(
      "efa_police_coordination_event_kind_allowed",
      sql`${table.kind} in ('request','response','reiteration','arrival_meeting_point','waiting','actual_meeting')`,
    ),
    check(
      "efa_police_coordination_event_dispatch_scope",
      sql`(${table.kind} in ('request','response','reiteration') and ${table.dispatchId} is null) or (${table.kind} in ('arrival_meeting_point','waiting','actual_meeting') and ${table.dispatchId} is not null)`,
    ),
    check(
      "efa_police_coordination_event_time_status_valid",
      sql`${table.timeStatus} in ('observed','not_observed','not_informed','not_applicable') and ((${table.timeStatus} = 'observed') = (${table.occurredAt} is not null))`,
    ),
    check("efa_police_coordination_event_version_positive", sql`${table.version} > 0`),
    check(
      "efa_police_coordination_event_note_length",
      sql`${table.note} is null or char_length(${table.note}) <= 2000`,
    ),
  ],
);

export const efaPoliceCoordinationAudit = pgTable(
  "efa_police_coordination_audit",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    coordinationId: uuid("coordination_id").notNull(),
    ownerUserId: text("owner_user_id").notNull(),
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
    foreignKey({
      name: "efa_police_coordination_audit_fk",
      columns: [table.coordinationId, table.ownerUserId],
      foreignColumns: [efaPoliceCoordination.id, efaPoliceCoordination.ownerUserId],
    }).onDelete("restrict"),
    unique("efa_police_coordination_audit_version_unique").on(
      table.coordinationId,
      table.versionAfter,
    ),
    unique("efa_police_coordination_audit_operation_unique").on(
      table.coordinationId,
      table.operationId,
    ),
    unique("efa_police_coordination_audit_id_scope_unique").on(table.id, table.coordinationId),
    check(
      "efa_police_coordination_audit_action_allowed",
      sql`${table.action} in ('created','updated','event_created','event_updated','dispatches_set')`,
    ),
    check(
      "efa_police_coordination_audit_version_transition_valid",
      sql`(${table.versionBefore} is null and ${table.versionAfter} = 1) or (${table.versionBefore} > 0 and ${table.versionAfter} = ${table.versionBefore} + 1)`,
    ),
    check(
      "efa_police_coordination_audit_state_object",
      sql`jsonb_typeof(${table.afterState}) = 'object' and (${table.beforeState} is null or jsonb_typeof(${table.beforeState}) = 'object')`,
    ),
  ],
);

export const efaPoliceCoordinationOperation = pgTable(
  "efa_police_coordination_operation",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    coordinationId: uuid("coordination_id").notNull(),
    ownerUserId: text("owner_user_id").notNull(),
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
    foreignKey({
      name: "efa_police_coordination_operation_fk",
      columns: [table.coordinationId, table.ownerUserId],
      foreignColumns: [efaPoliceCoordination.id, efaPoliceCoordination.ownerUserId],
    }).onDelete("restrict"),
    unique("efa_police_coordination_operation_client_unique").on(
      table.coordinationId,
      table.clientOperationId,
    ),
    check(
      "efa_police_coordination_operation_action_allowed",
      sql`${table.action} in ('created','updated','event_created','event_updated','dispatches_set')`,
    ),
    check(
      "efa_police_coordination_operation_hash_sha256",
      sql`${table.requestHash} ~ '^[0-9a-f]{64}$'`,
    ),
    check("efa_police_coordination_operation_version_positive", sql`${table.appliedVersion} > 0`),
  ],
);

export const efaPoliceCoordinationNotice = pgTable(
  "efa_police_coordination_notice",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    coordinationId: uuid("coordination_id").notNull(),
    ownerUserId: text("owner_user_id").notNull(),
    auditId: uuid("audit_id").notNull(),
    recipientUserId: text("recipient_user_id")
      .notNull()
      .references(() => user.id, { onDelete: "restrict" }),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    readAt: timestamp("read_at"),
  },
  (table) => [
    foreignKey({
      name: "efa_police_coordination_notice_owner_fk",
      columns: [table.coordinationId, table.ownerUserId],
      foreignColumns: [efaPoliceCoordination.id, efaPoliceCoordination.ownerUserId],
    }).onDelete("restrict"),
    foreignKey({
      name: "efa_police_coordination_notice_audit_fk",
      columns: [table.auditId, table.coordinationId],
      foreignColumns: [efaPoliceCoordinationAudit.id, efaPoliceCoordinationAudit.coordinationId],
    }).onDelete("restrict"),
    unique("efa_police_coordination_notice_audit_recipient_unique").on(
      table.auditId,
      table.recipientUserId,
    ),
    check(
      "efa_police_coordination_notice_recipient_is_owner",
      sql`${table.recipientUserId} = ${table.ownerUserId}`,
    ),
  ],
);

export const efaObservationCatalog = pgTable(
  "efa_observation_catalog",
  {
    key: text("key").primaryKey(),
    label: text("label").notNull(),
    group: text("group").notNull(),
    competencyReference: text("competency_reference"),
    isActive: boolean("is_active").notNull().default(true),
  },
  (table) => [
    check(
      "efa_observation_catalog_group_allowed",
      sql`${table.group} in ('phone','radio','coordination','duty','record')`,
    ),
    check(
      "efa_observation_catalog_key_label_nonempty",
      sql`char_length(${table.key}) > 0 and char_length(${table.label}) > 0`,
    ),
  ],
);

export const efaObservation = pgTable(
  "efa_observation",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    ownerUserId: text("owner_user_id")
      .notNull()
      .references(() => user.id, { onDelete: "restrict" }),
    guardId: uuid("guard_id").notNull(),
    episodeId: uuid("episode_id"),
    contextType: text("context_type").notNull(),
    communicationId: uuid("communication_id"),
    dispatchId: uuid("dispatch_id"),
    coordinationId: uuid("coordination_id"),
    policeEventId: uuid("police_event_id"),
    catalogItemKey: text("catalog_item_key"),
    catalogKeySnapshot: text("catalog_key_snapshot").notNull(),
    catalogLabelSnapshot: text("catalog_label_snapshot").notNull(),
    catalogGroupSnapshot: text("catalog_group_snapshot").notNull(),
    otherDescription: text("other_description"),
    classification: text("classification").notNull(),
    comment: text("comment"),
    observedAt: timestamp("observed_at"),
    clientCreationKey: uuid("client_creation_key").notNull(),
    version: integer("version").notNull().default(1),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (table) => [
    foreignKey({
      name: "efa_observation_guard_owner_fk",
      columns: [table.guardId, table.ownerUserId],
      foreignColumns: [efaGuard.id, efaGuard.ownerUserId],
    }).onDelete("restrict"),
    foreignKey({
      name: "efa_observation_episode_guard_owner_fk",
      columns: [table.episodeId, table.guardId, table.ownerUserId],
      foreignColumns: [efaEpisode.id, efaEpisode.originGuardId, efaEpisode.ownerUserId],
    }).onDelete("restrict"),
    foreignKey({
      name: "efa_observation_communication_scope_fk",
      columns: [table.communicationId, table.episodeId, table.ownerUserId],
      foreignColumns: [
        efaCommunication.id,
        efaCommunication.episodeId,
        efaCommunication.ownerUserId,
      ],
    }).onDelete("restrict"),
    foreignKey({
      name: "efa_observation_dispatch_scope_fk",
      columns: [table.dispatchId, table.episodeId, table.ownerUserId],
      foreignColumns: [efaDispatch.id, efaDispatch.episodeId, efaDispatch.ownerUserId],
    }).onDelete("restrict"),
    foreignKey({
      name: "efa_observation_coordination_scope_fk",
      columns: [table.coordinationId, table.episodeId, table.ownerUserId],
      foreignColumns: [
        efaPoliceCoordination.id,
        efaPoliceCoordination.episodeId,
        efaPoliceCoordination.ownerUserId,
      ],
    }).onDelete("restrict"),
    foreignKey({
      name: "efa_observation_police_event_scope_fk",
      columns: [table.policeEventId, table.coordinationId, table.ownerUserId],
      foreignColumns: [
        efaPoliceCoordinationEvent.id,
        efaPoliceCoordinationEvent.coordinationId,
        efaPoliceCoordinationEvent.ownerUserId,
      ],
    }).onDelete("restrict"),
    foreignKey({
      name: "efa_observation_catalog_item_fk",
      columns: [table.catalogItemKey],
      foreignColumns: [efaObservationCatalog.key],
    }).onDelete("restrict"),
    unique("efa_observation_id_owner_unique").on(table.id, table.ownerUserId),
    unique("efa_observation_owner_creation_key_unique").on(
      table.ownerUserId,
      table.clientCreationKey,
    ),
    check(
      "efa_observation_context_allowed",
      sql`${table.contextType} in ('guard','episode','communication','dispatch','coordination','police_event')`,
    ),
    check(
      "efa_observation_exactly_one_context",
      sql`(${table.contextType} = 'guard' and ${table.episodeId} is null and ${table.communicationId} is null and ${table.dispatchId} is null and ${table.coordinationId} is null and ${table.policeEventId} is null) or (${table.contextType} = 'episode' and ${table.episodeId} is not null and ${table.communicationId} is null and ${table.dispatchId} is null and ${table.coordinationId} is null and ${table.policeEventId} is null) or (${table.contextType} = 'communication' and ${table.episodeId} is not null and ${table.communicationId} is not null and ${table.dispatchId} is null and ${table.coordinationId} is null and ${table.policeEventId} is null) or (${table.contextType} = 'dispatch' and ${table.episodeId} is not null and ${table.communicationId} is null and ${table.dispatchId} is not null and ${table.coordinationId} is null and ${table.policeEventId} is null) or (${table.contextType} = 'coordination' and ${table.episodeId} is not null and ${table.communicationId} is null and ${table.dispatchId} is null and ${table.coordinationId} is not null and ${table.policeEventId} is null) or (${table.contextType} = 'police_event' and ${table.episodeId} is not null and ${table.communicationId} is null and ${table.dispatchId} is null and ${table.coordinationId} is not null and ${table.policeEventId} is not null)`,
    ),
    check(
      "efa_observation_classification_allowed",
      sql`${table.classification} in ('adequate','needs_improvement')`,
    ),
    check(
      "efa_observation_other_description_required",
      sql`(${table.catalogItemKey} is not null and ${table.otherDescription} is null) or (${table.catalogItemKey} is null and ${table.catalogKeySnapshot} = 'other' and ${table.otherDescription} is not null and char_length(trim(${table.otherDescription})) > 0)`,
    ),
    check(
      "efa_observation_text_bounds",
      sql`char_length(${table.catalogKeySnapshot}) <= 100 and char_length(${table.catalogLabelSnapshot}) <= 200 and char_length(${table.catalogGroupSnapshot}) <= 30 and (${table.otherDescription} is null or char_length(${table.otherDescription}) <= 1000) and (${table.comment} is null or char_length(${table.comment}) <= 1000)`,
    ),
    check("efa_observation_version_positive", sql`${table.version} > 0`),
  ],
);

export const efaObservationAudit = pgTable(
  "efa_observation_audit",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    observationId: uuid("observation_id").notNull(),
    ownerUserId: text("owner_user_id").notNull(),
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
    foreignKey({
      name: "efa_observation_audit_owner_fk",
      columns: [table.observationId, table.ownerUserId],
      foreignColumns: [efaObservation.id, efaObservation.ownerUserId],
    }).onDelete("restrict"),
    unique("efa_observation_audit_version_unique").on(table.observationId, table.versionAfter),
    unique("efa_observation_audit_operation_unique").on(table.observationId, table.operationId),
    unique("efa_observation_audit_id_scope_unique").on(table.id, table.observationId),
    check("efa_observation_audit_action_allowed", sql`${table.action} in ('created','updated')`),
    check(
      "efa_observation_audit_version_transition_valid",
      sql`(${table.versionBefore} is null and ${table.versionAfter} = 1) or (${table.versionBefore} > 0 and ${table.versionAfter} = ${table.versionBefore} + 1)`,
    ),
    check(
      "efa_observation_audit_state_objects",
      sql`jsonb_typeof(${table.afterState}) = 'object' and (${table.beforeState} is null or jsonb_typeof(${table.beforeState}) = 'object')`,
    ),
  ],
);

export const efaObservationOperation = pgTable(
  "efa_observation_operation",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    observationId: uuid("observation_id").notNull(),
    ownerUserId: text("owner_user_id").notNull(),
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
    foreignKey({
      name: "efa_observation_operation_owner_fk",
      columns: [table.observationId, table.ownerUserId],
      foreignColumns: [efaObservation.id, efaObservation.ownerUserId],
    }).onDelete("restrict"),
    unique("efa_observation_operation_client_unique").on(
      table.observationId,
      table.clientOperationId,
    ),
    check(
      "efa_observation_operation_action_allowed",
      sql`${table.action} in ('created','updated')`,
    ),
    check("efa_observation_operation_hash_sha256", sql`${table.requestHash} ~ '^[0-9a-f]{64}$'`),
    check("efa_observation_operation_version_positive", sql`${table.appliedVersion} > 0`),
  ],
);

export const efaObservationNotice = pgTable(
  "efa_observation_notice",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    observationId: uuid("observation_id").notNull(),
    ownerUserId: text("owner_user_id").notNull(),
    auditId: uuid("audit_id").notNull(),
    recipientUserId: text("recipient_user_id")
      .notNull()
      .references(() => user.id, { onDelete: "restrict" }),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    readAt: timestamp("read_at"),
  },
  (table) => [
    foreignKey({
      name: "efa_observation_notice_owner_fk",
      columns: [table.observationId, table.ownerUserId],
      foreignColumns: [efaObservation.id, efaObservation.ownerUserId],
    }).onDelete("restrict"),
    foreignKey({
      name: "efa_observation_notice_audit_fk",
      columns: [table.auditId, table.observationId],
      foreignColumns: [efaObservationAudit.id, efaObservationAudit.observationId],
    }).onDelete("restrict"),
    unique("efa_observation_notice_audit_recipient_unique").on(
      table.auditId,
      table.recipientUserId,
    ),
    check(
      "efa_observation_notice_recipient_is_owner",
      sql`${table.recipientUserId} = ${table.ownerUserId}`,
    ),
  ],
);
