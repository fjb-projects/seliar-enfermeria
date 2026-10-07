CREATE TABLE "efa_communication" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"episode_id" uuid NOT NULL,
	"owner_user_id" text NOT NULL,
	"client_creation_key" uuid NOT NULL,
	"direction" text NOT NULL,
	"started_at" timestamp with time zone,
	"ended_at" timestamp with time zone,
	"priority" text,
	"state" text DEFAULT 'draft' NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"finalized_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "efa_communication_id_owner_unique" UNIQUE("id","owner_user_id"),
	CONSTRAINT "efa_communication_owner_creation_key_unique" UNIQUE("owner_user_id","client_creation_key"),
	CONSTRAINT "efa_communication_direction_allowed" CHECK ("efa_communication"."direction" in ('incoming', 'outgoing')),
	CONSTRAINT "efa_communication_priority_allowed" CHECK ("efa_communication"."priority" is null or "efa_communication"."priority" in ('red', 'yellow', 'green')),
	CONSTRAINT "efa_communication_state_allowed" CHECK (("efa_communication"."state" = 'draft' and "efa_communication"."finalized_at" is null) or ("efa_communication"."state" = 'finalized' and "efa_communication"."finalized_at" is not null and "efa_communication"."priority" is not null)),
	CONSTRAINT "efa_communication_version_positive" CHECK ("efa_communication"."version" > 0)
);
--> statement-breakpoint
CREATE TABLE "efa_communication_audit" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"communication_id" uuid NOT NULL,
	"owner_user_id" text NOT NULL,
	"actor_user_id" text NOT NULL,
	"operation_id" uuid NOT NULL,
	"action" text NOT NULL,
	"version_before" integer,
	"version_after" integer NOT NULL,
	"before_state" jsonb,
	"after_state" jsonb NOT NULL,
	"occurred_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "efa_communication_audit_communication_version_unique" UNIQUE("communication_id","version_after"),
	CONSTRAINT "efa_communication_audit_communication_operation_unique" UNIQUE("communication_id","operation_id"),
	CONSTRAINT "efa_communication_audit_id_communication_unique" UNIQUE("id","communication_id"),
	CONSTRAINT "efa_communication_audit_action_allowed" CHECK ("efa_communication_audit"."action" in ('created', 'updated', 'finalized')),
	CONSTRAINT "efa_communication_audit_version_transition_valid" CHECK (("efa_communication_audit"."version_before" is null and "efa_communication_audit"."version_after" = 1) or ("efa_communication_audit"."version_before" is not null and "efa_communication_audit"."version_before" > 0 and "efa_communication_audit"."version_after" = "efa_communication_audit"."version_before" + 1)),
	CONSTRAINT "efa_communication_audit_action_version_valid" CHECK (("efa_communication_audit"."action" = 'created' and "efa_communication_audit"."version_before" is null and "efa_communication_audit"."version_after" = 1) or ("efa_communication_audit"."action" in ('updated', 'finalized') and "efa_communication_audit"."version_before" is not null and "efa_communication_audit"."version_after" = "efa_communication_audit"."version_before" + 1)),
	CONSTRAINT "efa_communication_audit_state_is_object" CHECK (jsonb_typeof("efa_communication_audit"."after_state") = 'object' and ("efa_communication_audit"."before_state" is null or jsonb_typeof("efa_communication_audit"."before_state") = 'object')),
	CONSTRAINT "efa_communication_audit_state_keys_allowlisted" CHECK (("efa_communication_audit"."after_state" - 'direction' - 'startedAt' - 'endedAt' - 'priority' - 'state' - 'finalizedAt') = '{}'::jsonb and ("efa_communication_audit"."before_state" is null or ("efa_communication_audit"."before_state" - 'direction' - 'startedAt' - 'endedAt' - 'priority' - 'state' - 'finalizedAt') = '{}'::jsonb))
);
--> statement-breakpoint
CREATE TABLE "efa_communication_notice" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"communication_id" uuid NOT NULL,
	"owner_user_id" text NOT NULL,
	"audit_id" uuid NOT NULL,
	"recipient_user_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"read_at" timestamp with time zone,
	CONSTRAINT "efa_communication_notice_recipient_is_owner" CHECK ("efa_communication_notice"."recipient_user_id" = "efa_communication_notice"."owner_user_id"),
	CONSTRAINT "efa_communication_notice_audit_recipient_unique" UNIQUE("audit_id","recipient_user_id")
);
--> statement-breakpoint
CREATE TABLE "efa_communication_operation" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"communication_id" uuid NOT NULL,
	"owner_user_id" text NOT NULL,
	"actor_user_id" text NOT NULL,
	"client_operation_id" uuid NOT NULL,
	"action" text NOT NULL,
	"request_hash" text NOT NULL,
	"applied_version" integer NOT NULL,
	"changed" boolean NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "efa_communication_operation_client_unique" UNIQUE("communication_id","client_operation_id"),
	CONSTRAINT "efa_communication_operation_action_allowed" CHECK ("efa_communication_operation"."action" in ('created', 'updated', 'finalized')),
	CONSTRAINT "efa_communication_operation_create_result_valid" CHECK ("efa_communication_operation"."action" <> 'created' or ("efa_communication_operation"."applied_version" = 1 and "efa_communication_operation"."changed")),
	CONSTRAINT "efa_communication_operation_version_positive" CHECK ("efa_communication_operation"."applied_version" > 0),
	CONSTRAINT "efa_communication_operation_hash_sha256" CHECK ("efa_communication_operation"."request_hash" ~ '^[0-9a-f]{64}$')
);
--> statement-breakpoint
ALTER TABLE "efa_communication" ADD CONSTRAINT "efa_communication_episode_owner_fk" FOREIGN KEY ("episode_id","owner_user_id") REFERENCES "public"."efa_episode"("id","owner_user_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "efa_communication_audit" ADD CONSTRAINT "efa_communication_audit_actor_user_id_user_id_fk" FOREIGN KEY ("actor_user_id") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "efa_communication_audit" ADD CONSTRAINT "efa_communication_audit_communication_fk" FOREIGN KEY ("communication_id","owner_user_id") REFERENCES "public"."efa_communication"("id","owner_user_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "efa_communication_notice" ADD CONSTRAINT "efa_communication_notice_recipient_user_id_user_id_fk" FOREIGN KEY ("recipient_user_id") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "efa_communication_notice" ADD CONSTRAINT "efa_communication_notice_owner_fk" FOREIGN KEY ("communication_id","owner_user_id") REFERENCES "public"."efa_communication"("id","owner_user_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "efa_communication_notice" ADD CONSTRAINT "efa_communication_notice_audit_fk" FOREIGN KEY ("audit_id","communication_id") REFERENCES "public"."efa_communication_audit"("id","communication_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "efa_communication_operation" ADD CONSTRAINT "efa_communication_operation_actor_user_id_user_id_fk" FOREIGN KEY ("actor_user_id") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "efa_communication_operation" ADD CONSTRAINT "efa_communication_operation_communication_fk" FOREIGN KEY ("communication_id","owner_user_id") REFERENCES "public"."efa_communication"("id","owner_user_id") ON DELETE restrict ON UPDATE no action;
--> statement-breakpoint
CREATE FUNCTION reject_efa_communication_history_mutation() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'EFA communication history and operations are append-only';
END;
$$ LANGUAGE plpgsql;
--> statement-breakpoint
CREATE TRIGGER efa_communication_audit_append_only
BEFORE UPDATE OR DELETE ON efa_communication_audit
FOR EACH ROW EXECUTE FUNCTION reject_efa_communication_history_mutation();
--> statement-breakpoint
CREATE TRIGGER efa_communication_operation_append_only
BEFORE UPDATE OR DELETE ON efa_communication_operation
FOR EACH ROW EXECUTE FUNCTION reject_efa_communication_history_mutation();
