CREATE TABLE "efa_dispatch" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"episode_id" uuid NOT NULL,
	"owner_user_id" text NOT NULL,
	"base_id" uuid NOT NULL,
	"communication_id" uuid,
	"client_creation_key" uuid NOT NULL,
	"priority" text,
	"t0_at" timestamp with time zone,
	"t0_status" text DEFAULT 'not_observed' NOT NULL,
	"t1_at" timestamp with time zone,
	"t1_status" text DEFAULT 'not_observed' NOT NULL,
	"t2_at" timestamp with time zone,
	"t2_status" text DEFAULT 'not_observed' NOT NULL,
	"t3_at" timestamp with time zone,
	"t3_status" text DEFAULT 'not_observed' NOT NULL,
	"t4_at" timestamp with time zone,
	"t4_status" text DEFAULT 'not_observed' NOT NULL,
	"t5_at" timestamp with time zone,
	"t5_status" text DEFAULT 'not_observed' NOT NULL,
	"t6_at" timestamp with time zone,
	"t6_status" text DEFAULT 'not_observed' NOT NULL,
	"first_response_role" text,
	"first_response_at" timestamp with time zone,
	"note" text,
	"result" text,
	"result_clarification" text,
	"state" text DEFAULT 'draft' NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"finalized_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "efa_dispatch_id_owner_unique" UNIQUE("id","owner_user_id"),
	CONSTRAINT "efa_dispatch_id_episode_owner_unique" UNIQUE("id","episode_id","owner_user_id"),
	CONSTRAINT "efa_dispatch_owner_creation_key_unique" UNIQUE("owner_user_id","client_creation_key"),
	CONSTRAINT "efa_dispatch_priority_allowed" CHECK ("efa_dispatch"."priority" is null or "efa_dispatch"."priority" in ('red','yellow','green')),
	CONSTRAINT "efa_dispatch_result_allowed" CHECK ("efa_dispatch"."result" is null or "efa_dispatch"."result" in ('transported','treated_at_home','refused','not_located','cancelled','death','not_informed')),
	CONSTRAINT "efa_dispatch_state_allowed" CHECK (("efa_dispatch"."state" = 'draft' and "efa_dispatch"."finalized_at" is null) or ("efa_dispatch"."state" = 'finalized' and "efa_dispatch"."finalized_at" is not null and "efa_dispatch"."priority" is not null and "efa_dispatch"."result" is not null)),
	CONSTRAINT "efa_dispatch_version_positive" CHECK ("efa_dispatch"."version" > 0),
	CONSTRAINT "efa_dispatch_time_observation_statuses_valid" CHECK (("efa_dispatch"."t0_status" in ('observed','not_observed','not_informed','not_applicable') and (("efa_dispatch"."t0_status" = 'observed') = ("efa_dispatch"."t0_at" is not null))) and ("efa_dispatch"."t1_status" in ('observed','not_observed','not_informed','not_applicable') and (("efa_dispatch"."t1_status" = 'observed') = ("efa_dispatch"."t1_at" is not null))) and ("efa_dispatch"."t2_status" in ('observed','not_observed','not_informed','not_applicable') and (("efa_dispatch"."t2_status" = 'observed') = ("efa_dispatch"."t2_at" is not null))) and ("efa_dispatch"."t3_status" in ('observed','not_observed','not_informed','not_applicable') and (("efa_dispatch"."t3_status" = 'observed') = ("efa_dispatch"."t3_at" is not null))) and ("efa_dispatch"."t4_status" in ('observed','not_observed','not_informed','not_applicable') and (("efa_dispatch"."t4_status" = 'observed') = ("efa_dispatch"."t4_at" is not null))) and ("efa_dispatch"."t5_status" in ('observed','not_observed','not_informed','not_applicable') and (("efa_dispatch"."t5_status" = 'observed') = ("efa_dispatch"."t5_at" is not null))) and ("efa_dispatch"."t6_status" in ('observed','not_observed','not_informed','not_applicable') and (("efa_dispatch"."t6_status" = 'observed') = ("efa_dispatch"."t6_at" is not null))))
);
--> statement-breakpoint
CREATE TABLE "efa_dispatch_audit" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"dispatch_id" uuid NOT NULL,
	"owner_user_id" text NOT NULL,
	"actor_user_id" text NOT NULL,
	"operation_id" uuid NOT NULL,
	"action" text NOT NULL,
	"version_before" integer,
	"version_after" integer NOT NULL,
	"before_state" jsonb,
	"after_state" jsonb NOT NULL,
	"occurred_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "efa_dispatch_audit_dispatch_version_unique" UNIQUE("dispatch_id","version_after"),
	CONSTRAINT "efa_dispatch_audit_dispatch_operation_unique" UNIQUE("dispatch_id","operation_id"),
	CONSTRAINT "efa_dispatch_audit_id_dispatch_unique" UNIQUE("id","dispatch_id"),
	CONSTRAINT "efa_dispatch_audit_action_allowed" CHECK ("efa_dispatch_audit"."action" in ('created','updated','finalized')),
	CONSTRAINT "efa_dispatch_audit_version_transition_valid" CHECK (("efa_dispatch_audit"."version_before" is null and "efa_dispatch_audit"."version_after" = 1) or ("efa_dispatch_audit"."version_before" > 0 and "efa_dispatch_audit"."version_after" = "efa_dispatch_audit"."version_before" + 1)),
	CONSTRAINT "efa_dispatch_audit_state_object" CHECK (jsonb_typeof("efa_dispatch_audit"."after_state") = 'object' and ("efa_dispatch_audit"."before_state" is null or jsonb_typeof("efa_dispatch_audit"."before_state") = 'object'))
);
--> statement-breakpoint
CREATE TABLE "efa_dispatch_contact_attempt" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"dispatch_id" uuid NOT NULL,
	"owner_user_id" text NOT NULL,
	"actor_user_id" text NOT NULL,
	"client_event_id" uuid NOT NULL,
	"occurred_at" timestamp with time zone NOT NULL,
	"note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "efa_dispatch_contact_attempt_event_unique" UNIQUE("dispatch_id","client_event_id"),
	CONSTRAINT "efa_dispatch_contact_attempt_note_length" CHECK ("efa_dispatch_contact_attempt"."note" is null or char_length("efa_dispatch_contact_attempt"."note") <= 1000)
);
--> statement-breakpoint
CREATE TABLE "efa_dispatch_notice" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"dispatch_id" uuid NOT NULL,
	"owner_user_id" text NOT NULL,
	"audit_id" uuid NOT NULL,
	"recipient_user_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"read_at" timestamp with time zone,
	CONSTRAINT "efa_dispatch_notice_audit_recipient_unique" UNIQUE("audit_id","recipient_user_id"),
	CONSTRAINT "efa_dispatch_notice_recipient_is_owner" CHECK ("efa_dispatch_notice"."recipient_user_id" = "efa_dispatch_notice"."owner_user_id")
);
--> statement-breakpoint
CREATE TABLE "efa_dispatch_operation" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"dispatch_id" uuid NOT NULL,
	"owner_user_id" text NOT NULL,
	"actor_user_id" text NOT NULL,
	"client_operation_id" uuid NOT NULL,
	"action" text NOT NULL,
	"request_hash" text NOT NULL,
	"applied_version" integer NOT NULL,
	"changed" boolean NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "efa_dispatch_operation_client_unique" UNIQUE("dispatch_id","client_operation_id"),
	CONSTRAINT "efa_dispatch_operation_action_allowed" CHECK ("efa_dispatch_operation"."action" in ('created','updated','finalized')),
	CONSTRAINT "efa_dispatch_operation_create_result_valid" CHECK ("efa_dispatch_operation"."action" <> 'created' or ("efa_dispatch_operation"."applied_version" = 1 and "efa_dispatch_operation"."changed")),
	CONSTRAINT "efa_dispatch_operation_hash_sha256" CHECK ("efa_dispatch_operation"."request_hash" ~ '^[0-9a-f]{64}$'),
	CONSTRAINT "efa_dispatch_operation_version_positive" CHECK ("efa_dispatch_operation"."applied_version" > 0)
);
--> statement-breakpoint
CREATE TABLE "efa_support_request" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_user_id" text NOT NULL,
	"episode_id" uuid NOT NULL,
	"source_dispatch_id" uuid NOT NULL,
	"response_dispatch_id" uuid,
	"client_creation_key" uuid NOT NULL,
	"requested_at" timestamp with time zone NOT NULL,
	"reason" text NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "efa_support_request_id_owner_unique" UNIQUE("id","owner_user_id"),
	CONSTRAINT "efa_support_request_owner_creation_key_unique" UNIQUE("owner_user_id","client_creation_key"),
	CONSTRAINT "efa_support_request_reason_length" CHECK (char_length(btrim("efa_support_request"."reason")) between 1 and 1000),
	CONSTRAINT "efa_support_request_version_positive" CHECK ("efa_support_request"."version" > 0)
);
--> statement-breakpoint
CREATE TABLE "efa_support_request_audit" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"support_request_id" uuid NOT NULL,
	"owner_user_id" text NOT NULL,
	"actor_user_id" text NOT NULL,
	"operation_id" uuid NOT NULL,
	"action" text NOT NULL,
	"version_before" integer,
	"version_after" integer NOT NULL,
	"before_state" jsonb,
	"after_state" jsonb NOT NULL,
	"occurred_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "efa_support_request_audit_version_unique" UNIQUE("support_request_id","version_after"),
	CONSTRAINT "efa_support_request_audit_operation_unique" UNIQUE("support_request_id","operation_id"),
	CONSTRAINT "efa_support_request_audit_id_request_unique" UNIQUE("id","support_request_id"),
	CONSTRAINT "efa_support_request_audit_action_allowed" CHECK ("efa_support_request_audit"."action" in ('created','updated')),
	CONSTRAINT "efa_support_request_audit_transition_valid" CHECK (("efa_support_request_audit"."version_before" is null and "efa_support_request_audit"."version_after" = 1) or ("efa_support_request_audit"."version_before" > 0 and "efa_support_request_audit"."version_after" = "efa_support_request_audit"."version_before" + 1)),
	CONSTRAINT "efa_support_request_audit_state_object" CHECK (jsonb_typeof("efa_support_request_audit"."after_state") = 'object' and ("efa_support_request_audit"."before_state" is null or jsonb_typeof("efa_support_request_audit"."before_state") = 'object'))
);
--> statement-breakpoint
CREATE TABLE "efa_support_request_notice" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"support_request_id" uuid NOT NULL,
	"owner_user_id" text NOT NULL,
	"audit_id" uuid NOT NULL,
	"recipient_user_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"read_at" timestamp with time zone,
	CONSTRAINT "efa_support_request_notice_audit_recipient_unique" UNIQUE("audit_id","recipient_user_id"),
	CONSTRAINT "efa_support_request_notice_recipient_is_owner" CHECK ("efa_support_request_notice"."recipient_user_id" = "efa_support_request_notice"."owner_user_id")
);
--> statement-breakpoint
CREATE TABLE "efa_support_request_operation" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"support_request_id" uuid NOT NULL,
	"owner_user_id" text NOT NULL,
	"actor_user_id" text NOT NULL,
	"client_operation_id" uuid NOT NULL,
	"action" text NOT NULL,
	"request_hash" text NOT NULL,
	"applied_version" integer NOT NULL,
	"changed" boolean NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "efa_support_request_operation_client_unique" UNIQUE("support_request_id","client_operation_id"),
	CONSTRAINT "efa_support_request_operation_action_allowed" CHECK ("efa_support_request_operation"."action" in ('created','updated')),
	CONSTRAINT "efa_support_request_operation_create_result_valid" CHECK ("efa_support_request_operation"."action" <> 'created' or ("efa_support_request_operation"."applied_version" = 1 and "efa_support_request_operation"."changed")),
	CONSTRAINT "efa_support_request_operation_hash_sha256" CHECK ("efa_support_request_operation"."request_hash" ~ '^[0-9a-f]{64}$'),
	CONSTRAINT "efa_support_request_operation_version_positive" CHECK ("efa_support_request_operation"."applied_version" > 0)
);
--> statement-breakpoint
ALTER TABLE "efa_communication" ADD CONSTRAINT "efa_communication_id_episode_owner_unique" UNIQUE("id","episode_id","owner_user_id");--> statement-breakpoint
ALTER TABLE "efa_dispatch" ADD CONSTRAINT "efa_dispatch_base_id_efa_base_id_fk" FOREIGN KEY ("base_id") REFERENCES "public"."efa_base"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "efa_dispatch" ADD CONSTRAINT "efa_dispatch_episode_owner_fk" FOREIGN KEY ("episode_id","owner_user_id") REFERENCES "public"."efa_episode"("id","owner_user_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "efa_dispatch" ADD CONSTRAINT "efa_dispatch_communication_episode_owner_fk" FOREIGN KEY ("communication_id","episode_id","owner_user_id") REFERENCES "public"."efa_communication"("id","episode_id","owner_user_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "efa_dispatch_audit" ADD CONSTRAINT "efa_dispatch_audit_actor_user_id_user_id_fk" FOREIGN KEY ("actor_user_id") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "efa_dispatch_audit" ADD CONSTRAINT "efa_dispatch_audit_dispatch_fk" FOREIGN KEY ("dispatch_id","owner_user_id") REFERENCES "public"."efa_dispatch"("id","owner_user_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "efa_dispatch_contact_attempt" ADD CONSTRAINT "efa_dispatch_contact_attempt_actor_user_id_user_id_fk" FOREIGN KEY ("actor_user_id") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "efa_dispatch_contact_attempt" ADD CONSTRAINT "efa_dispatch_contact_attempt_dispatch_fk" FOREIGN KEY ("dispatch_id","owner_user_id") REFERENCES "public"."efa_dispatch"("id","owner_user_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "efa_dispatch_notice" ADD CONSTRAINT "efa_dispatch_notice_recipient_user_id_user_id_fk" FOREIGN KEY ("recipient_user_id") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "efa_dispatch_notice" ADD CONSTRAINT "efa_dispatch_notice_owner_fk" FOREIGN KEY ("dispatch_id","owner_user_id") REFERENCES "public"."efa_dispatch"("id","owner_user_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "efa_dispatch_notice" ADD CONSTRAINT "efa_dispatch_notice_audit_fk" FOREIGN KEY ("audit_id","dispatch_id") REFERENCES "public"."efa_dispatch_audit"("id","dispatch_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "efa_dispatch_operation" ADD CONSTRAINT "efa_dispatch_operation_actor_user_id_user_id_fk" FOREIGN KEY ("actor_user_id") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "efa_dispatch_operation" ADD CONSTRAINT "efa_dispatch_operation_dispatch_fk" FOREIGN KEY ("dispatch_id","owner_user_id") REFERENCES "public"."efa_dispatch"("id","owner_user_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "efa_support_request" ADD CONSTRAINT "efa_support_request_episode_owner_fk" FOREIGN KEY ("episode_id","owner_user_id") REFERENCES "public"."efa_episode"("id","owner_user_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "efa_support_request" ADD CONSTRAINT "efa_support_request_source_dispatch_fk" FOREIGN KEY ("source_dispatch_id","episode_id","owner_user_id") REFERENCES "public"."efa_dispatch"("id","episode_id","owner_user_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "efa_support_request" ADD CONSTRAINT "efa_support_request_response_dispatch_fk" FOREIGN KEY ("response_dispatch_id","episode_id","owner_user_id") REFERENCES "public"."efa_dispatch"("id","episode_id","owner_user_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "efa_support_request_audit" ADD CONSTRAINT "efa_support_request_audit_actor_user_id_user_id_fk" FOREIGN KEY ("actor_user_id") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "efa_support_request_audit" ADD CONSTRAINT "efa_support_request_audit_request_fk" FOREIGN KEY ("support_request_id","owner_user_id") REFERENCES "public"."efa_support_request"("id","owner_user_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "efa_support_request_notice" ADD CONSTRAINT "efa_support_request_notice_recipient_user_id_user_id_fk" FOREIGN KEY ("recipient_user_id") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "efa_support_request_notice" ADD CONSTRAINT "efa_support_request_notice_owner_fk" FOREIGN KEY ("support_request_id","owner_user_id") REFERENCES "public"."efa_support_request"("id","owner_user_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "efa_support_request_notice" ADD CONSTRAINT "efa_support_request_notice_audit_fk" FOREIGN KEY ("audit_id","support_request_id") REFERENCES "public"."efa_support_request_audit"("id","support_request_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "efa_support_request_operation" ADD CONSTRAINT "efa_support_request_operation_actor_user_id_user_id_fk" FOREIGN KEY ("actor_user_id") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "efa_support_request_operation" ADD CONSTRAINT "efa_support_request_operation_request_fk" FOREIGN KEY ("support_request_id","owner_user_id") REFERENCES "public"."efa_support_request"("id","owner_user_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE FUNCTION reject_efa_dispatch_history_mutation() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'EFA dispatch history is append-only'; END; $$;--> statement-breakpoint
CREATE TRIGGER efa_dispatch_audit_append_only BEFORE UPDATE OR DELETE ON "efa_dispatch_audit" FOR EACH ROW EXECUTE FUNCTION reject_efa_dispatch_history_mutation();--> statement-breakpoint
CREATE TRIGGER efa_dispatch_operation_append_only BEFORE UPDATE OR DELETE ON "efa_dispatch_operation" FOR EACH ROW EXECUTE FUNCTION reject_efa_dispatch_history_mutation();--> statement-breakpoint
CREATE TRIGGER efa_dispatch_contact_attempt_append_only BEFORE UPDATE OR DELETE ON "efa_dispatch_contact_attempt" FOR EACH ROW EXECUTE FUNCTION reject_efa_dispatch_history_mutation();--> statement-breakpoint
CREATE TRIGGER efa_support_request_audit_append_only BEFORE UPDATE OR DELETE ON "efa_support_request_audit" FOR EACH ROW EXECUTE FUNCTION reject_efa_dispatch_history_mutation();--> statement-breakpoint
CREATE TRIGGER efa_support_request_operation_append_only BEFORE UPDATE OR DELETE ON "efa_support_request_operation" FOR EACH ROW EXECUTE FUNCTION reject_efa_dispatch_history_mutation();
