CREATE TABLE "efa_episode" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"client_creation_key" uuid NOT NULL,
	"owner_user_id" text NOT NULL,
	"origin_guard_id" uuid NOT NULL,
	"event_at" timestamp with time zone NOT NULL,
	"motive" text,
	"address" text,
	"intervention_number" text,
	"state" text DEFAULT 'draft' NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "efa_episode_owner_creation_key_unique" UNIQUE("owner_user_id","client_creation_key"),
	CONSTRAINT "efa_episode_id_owner_unique" UNIQUE("id","owner_user_id"),
	CONSTRAINT "efa_episode_version_positive" CHECK ("efa_episode"."version" > 0),
	CONSTRAINT "efa_episode_draft_only" CHECK ("efa_episode"."state" = 'draft'),
	CONSTRAINT "efa_episode_optional_text_bounds" CHECK (("efa_episode"."motive" is null or char_length("efa_episode"."motive") <= 2000) and ("efa_episode"."address" is null or char_length("efa_episode"."address") <= 1000) and ("efa_episode"."intervention_number" is null or char_length("efa_episode"."intervention_number") <= 100))
);
--> statement-breakpoint
CREATE TABLE "efa_episode_audit" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"episode_id" uuid NOT NULL,
	"actor_user_id" text NOT NULL,
	"operation_id" uuid NOT NULL,
	"action" text NOT NULL,
	"version_before" integer,
	"version_after" integer NOT NULL,
	"before_state" jsonb,
	"after_state" jsonb NOT NULL,
	"occurred_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "efa_episode_audit_episode_version_unique" UNIQUE("episode_id","version_after"),
	CONSTRAINT "efa_episode_audit_operation_unique" UNIQUE("episode_id","operation_id"),
	CONSTRAINT "efa_episode_audit_id_episode_unique" UNIQUE("id","episode_id"),
	CONSTRAINT "efa_episode_audit_action_allowed" CHECK ("efa_episode_audit"."action" in ('created', 'updated')),
	CONSTRAINT "efa_episode_audit_version_transition_valid" CHECK (("efa_episode_audit"."version_before" is null and "efa_episode_audit"."version_after" = 1) or ("efa_episode_audit"."version_before" is not null and "efa_episode_audit"."version_before" > 0 and "efa_episode_audit"."version_after" = "efa_episode_audit"."version_before" + 1)),
	CONSTRAINT "efa_episode_audit_action_version_valid" CHECK (("efa_episode_audit"."action" = 'created' and "efa_episode_audit"."version_before" is null and "efa_episode_audit"."version_after" = 1) or ("efa_episode_audit"."action" = 'updated' and "efa_episode_audit"."version_before" is not null and "efa_episode_audit"."version_after" = "efa_episode_audit"."version_before" + 1)),
	CONSTRAINT "efa_episode_audit_state_is_object" CHECK (jsonb_typeof("efa_episode_audit"."after_state") = 'object' and ("efa_episode_audit"."before_state" is null or jsonb_typeof("efa_episode_audit"."before_state") = 'object')),
	CONSTRAINT "efa_episode_audit_state_keys_allowlisted" CHECK (("efa_episode_audit"."after_state" - 'eventAt' - 'motive' - 'address' - 'interventionNumber' - 'state') = '{}'::jsonb and ("efa_episode_audit"."before_state" is null or ("efa_episode_audit"."before_state" - 'eventAt' - 'motive' - 'address' - 'interventionNumber' - 'state') = '{}'::jsonb))
);
--> statement-breakpoint
CREATE TABLE "efa_episode_notice" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"episode_id" uuid NOT NULL,
	"audit_id" uuid NOT NULL,
	"recipient_user_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"read_at" timestamp with time zone,
	CONSTRAINT "efa_episode_notice_audit_recipient_unique" UNIQUE("audit_id","recipient_user_id")
);
--> statement-breakpoint
CREATE TABLE "efa_episode_operation" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"episode_id" uuid NOT NULL,
	"actor_user_id" text NOT NULL,
	"client_operation_id" uuid NOT NULL,
	"action" text NOT NULL,
	"request_hash" text NOT NULL,
	"applied_version" integer NOT NULL,
	"changed" boolean NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "efa_episode_operation_episode_client_unique" UNIQUE("episode_id","client_operation_id"),
	CONSTRAINT "efa_episode_operation_action_allowed" CHECK ("efa_episode_operation"."action" in ('created', 'updated')),
	CONSTRAINT "efa_episode_operation_create_result_valid" CHECK ("efa_episode_operation"."action" <> 'created' or ("efa_episode_operation"."applied_version" = 1 and "efa_episode_operation"."changed")),
	CONSTRAINT "efa_episode_operation_version_positive" CHECK ("efa_episode_operation"."applied_version" > 0),
	CONSTRAINT "efa_episode_operation_hash_sha256" CHECK ("efa_episode_operation"."request_hash" ~ '^[0-9a-f]{64}$')
);
--> statement-breakpoint
CREATE UNIQUE INDEX "efa_guard_id_owner_user_unique" ON "efa_guard" USING btree ("id","owner_user_id");
--> statement-breakpoint
ALTER TABLE "efa_episode" ADD CONSTRAINT "efa_episode_owner_user_id_user_id_fk" FOREIGN KEY ("owner_user_id") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "efa_episode" ADD CONSTRAINT "efa_episode_origin_owner_guard_fk" FOREIGN KEY ("origin_guard_id","owner_user_id") REFERENCES "public"."efa_guard"("id","owner_user_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "efa_episode_audit" ADD CONSTRAINT "efa_episode_audit_episode_id_efa_episode_id_fk" FOREIGN KEY ("episode_id") REFERENCES "public"."efa_episode"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "efa_episode_audit" ADD CONSTRAINT "efa_episode_audit_actor_user_id_user_id_fk" FOREIGN KEY ("actor_user_id") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "efa_episode_notice" ADD CONSTRAINT "efa_episode_notice_recipient_user_id_user_id_fk" FOREIGN KEY ("recipient_user_id") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "efa_episode_notice" ADD CONSTRAINT "efa_episode_notice_owner_fk" FOREIGN KEY ("episode_id","recipient_user_id") REFERENCES "public"."efa_episode"("id","owner_user_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "efa_episode_notice" ADD CONSTRAINT "efa_episode_notice_audit_episode_fk" FOREIGN KEY ("audit_id","episode_id") REFERENCES "public"."efa_episode_audit"("id","episode_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "efa_episode_operation" ADD CONSTRAINT "efa_episode_operation_episode_id_efa_episode_id_fk" FOREIGN KEY ("episode_id") REFERENCES "public"."efa_episode"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "efa_episode_operation" ADD CONSTRAINT "efa_episode_operation_actor_user_id_user_id_fk" FOREIGN KEY ("actor_user_id") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE FUNCTION reject_efa_episode_audit_mutation() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'EFA episode history is append-only';
END;
$$ LANGUAGE plpgsql;--> statement-breakpoint
CREATE TRIGGER efa_episode_audit_append_only
BEFORE UPDATE OR DELETE ON efa_episode_audit
FOR EACH ROW EXECUTE FUNCTION reject_efa_episode_audit_mutation();
--> statement-breakpoint
CREATE TRIGGER efa_episode_operation_append_only
BEFORE UPDATE OR DELETE ON efa_episode_operation
FOR EACH ROW EXECUTE FUNCTION reject_efa_episode_audit_mutation();
