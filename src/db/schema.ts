import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  primaryKey,
  text,
  timestamp as timestampColumn,
  unique,
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
