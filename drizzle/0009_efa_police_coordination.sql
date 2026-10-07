CREATE TABLE "efa_police_coordination" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"episode_id" uuid NOT NULL,
	"owner_user_id" text NOT NULL,
	"client_creation_key" uuid NOT NULL,
	"initiator" text NOT NULL,
	"initiating_dispatch_id" uuid,
	"place_type" text NOT NULL,
	"meeting_reference" text,
	"notes" text,
	"state" text DEFAULT 'draft' NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "efa_police_coordination_id_episode_owner_unique" UNIQUE("id","episode_id","owner_user_id"),
	CONSTRAINT "efa_police_coordination_id_owner_unique" UNIQUE("id","owner_user_id"),
	CONSTRAINT "efa_police_coordination_owner_creation_key_unique" UNIQUE("owner_user_id","client_creation_key"),
	CONSTRAINT "efa_police_coordination_initiator_allowed" CHECK ("efa_police_coordination"."initiator" in ('central','ambulance')),
	CONSTRAINT "efa_police_coordination_place_allowed" CHECK ("efa_police_coordination"."place_type" in ('incident','meeting_point')),
	CONSTRAINT "efa_police_coordination_state_allowed" CHECK ("efa_police_coordination"."state" in ('draft','finalized')),
	CONSTRAINT "efa_police_coordination_version_positive" CHECK ("efa_police_coordination"."version" > 0),
	CONSTRAINT "efa_police_coordination_reference_lengths" CHECK (("efa_police_coordination"."meeting_reference" is null or char_length("efa_police_coordination"."meeting_reference") <= 500) and ("efa_police_coordination"."notes" is null or char_length("efa_police_coordination"."notes") <= 2000))
);
--> statement-breakpoint
CREATE TABLE "efa_police_coordination_audit" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"coordination_id" uuid NOT NULL,
	"owner_user_id" text NOT NULL,
	"actor_user_id" text NOT NULL,
	"operation_id" uuid NOT NULL,
	"action" text NOT NULL,
	"version_before" integer,
	"version_after" integer NOT NULL,
	"before_state" jsonb,
	"after_state" jsonb NOT NULL,
	"occurred_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "efa_police_coordination_audit_version_unique" UNIQUE("coordination_id","version_after"),
	CONSTRAINT "efa_police_coordination_audit_operation_unique" UNIQUE("coordination_id","operation_id"),
	CONSTRAINT "efa_police_coordination_audit_id_scope_unique" UNIQUE("id","coordination_id"),
	CONSTRAINT "efa_police_coordination_audit_action_allowed" CHECK ("efa_police_coordination_audit"."action" in ('created','updated','event_created','event_updated','dispatches_set')),
	CONSTRAINT "efa_police_coordination_audit_version_transition_valid" CHECK (("efa_police_coordination_audit"."version_before" is null and "efa_police_coordination_audit"."version_after" = 1) or ("efa_police_coordination_audit"."version_before" > 0 and "efa_police_coordination_audit"."version_after" = "efa_police_coordination_audit"."version_before" + 1)),
	CONSTRAINT "efa_police_coordination_audit_state_object" CHECK (jsonb_typeof("efa_police_coordination_audit"."after_state") = 'object' and ("efa_police_coordination_audit"."before_state" is null or jsonb_typeof("efa_police_coordination_audit"."before_state") = 'object'))
);
--> statement-breakpoint
CREATE TABLE "efa_police_coordination_dispatch" (
	"coordination_id" uuid NOT NULL,
	"episode_id" uuid NOT NULL,
	"owner_user_id" text NOT NULL,
	"dispatch_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "efa_police_coordination_dispatch_coordination_id_dispatch_id_pk" PRIMARY KEY("coordination_id","dispatch_id"),
	CONSTRAINT "efa_police_coordination_dispatch_scope_unique" UNIQUE("coordination_id","dispatch_id","episode_id","owner_user_id")
);
--> statement-breakpoint
CREATE TABLE "efa_police_coordination_event" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"coordination_id" uuid NOT NULL,
	"episode_id" uuid NOT NULL,
	"owner_user_id" text NOT NULL,
	"dispatch_id" uuid,
	"actor_user_id" text NOT NULL,
	"client_event_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"occurred_at" timestamp with time zone,
	"time_status" text DEFAULT 'not_observed' NOT NULL,
	"note" text,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "efa_police_coordination_event_id_scope_unique" UNIQUE("id","coordination_id","owner_user_id"),
	CONSTRAINT "efa_police_coordination_event_client_unique" UNIQUE("coordination_id","client_event_id"),
	CONSTRAINT "efa_police_coordination_event_kind_allowed" CHECK ("efa_police_coordination_event"."kind" in ('request','response','reiteration','arrival_meeting_point','waiting','actual_meeting')),
	CONSTRAINT "efa_police_coordination_event_dispatch_scope" CHECK (("efa_police_coordination_event"."kind" in ('request','response','reiteration') and "efa_police_coordination_event"."dispatch_id" is null) or ("efa_police_coordination_event"."kind" in ('arrival_meeting_point','waiting','actual_meeting') and "efa_police_coordination_event"."dispatch_id" is not null)),
	CONSTRAINT "efa_police_coordination_event_time_status_valid" CHECK ("efa_police_coordination_event"."time_status" in ('observed','not_observed','not_informed','not_applicable') and (("efa_police_coordination_event"."time_status" = 'observed') = ("efa_police_coordination_event"."occurred_at" is not null))),
	CONSTRAINT "efa_police_coordination_event_version_positive" CHECK ("efa_police_coordination_event"."version" > 0),
	CONSTRAINT "efa_police_coordination_event_note_length" CHECK ("efa_police_coordination_event"."note" is null or char_length("efa_police_coordination_event"."note") <= 2000)
);
--> statement-breakpoint
CREATE TABLE "efa_police_coordination_notice" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"coordination_id" uuid NOT NULL,
	"owner_user_id" text NOT NULL,
	"audit_id" uuid NOT NULL,
	"recipient_user_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"read_at" timestamp with time zone,
	CONSTRAINT "efa_police_coordination_notice_audit_recipient_unique" UNIQUE("audit_id","recipient_user_id"),
	CONSTRAINT "efa_police_coordination_notice_recipient_is_owner" CHECK ("efa_police_coordination_notice"."recipient_user_id" = "efa_police_coordination_notice"."owner_user_id")
);
--> statement-breakpoint
CREATE TABLE "efa_police_coordination_operation" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"coordination_id" uuid NOT NULL,
	"owner_user_id" text NOT NULL,
	"actor_user_id" text NOT NULL,
	"client_operation_id" uuid NOT NULL,
	"action" text NOT NULL,
	"request_hash" text NOT NULL,
	"applied_version" integer NOT NULL,
	"changed" boolean NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "efa_police_coordination_operation_client_unique" UNIQUE("coordination_id","client_operation_id"),
	CONSTRAINT "efa_police_coordination_operation_action_allowed" CHECK ("efa_police_coordination_operation"."action" in ('created','updated','event_created','event_updated','dispatches_set')),
	CONSTRAINT "efa_police_coordination_operation_hash_sha256" CHECK ("efa_police_coordination_operation"."request_hash" ~ '^[0-9a-f]{64}$'),
	CONSTRAINT "efa_police_coordination_operation_version_positive" CHECK ("efa_police_coordination_operation"."applied_version" > 0)
);
--> statement-breakpoint
ALTER TABLE "efa_police_coordination" ADD CONSTRAINT "efa_police_coordination_episode_owner_fk" FOREIGN KEY ("episode_id","owner_user_id") REFERENCES "public"."efa_episode"("id","owner_user_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "efa_police_coordination" ADD CONSTRAINT "efa_police_coordination_initiating_dispatch_fk" FOREIGN KEY ("initiating_dispatch_id","episode_id","owner_user_id") REFERENCES "public"."efa_dispatch"("id","episode_id","owner_user_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "efa_police_coordination_audit" ADD CONSTRAINT "efa_police_coordination_audit_actor_user_id_user_id_fk" FOREIGN KEY ("actor_user_id") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "efa_police_coordination_audit" ADD CONSTRAINT "efa_police_coordination_audit_fk" FOREIGN KEY ("coordination_id","owner_user_id") REFERENCES "public"."efa_police_coordination"("id","owner_user_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "efa_police_coordination_dispatch" ADD CONSTRAINT "efa_police_coordination_dispatch_coordination_fk" FOREIGN KEY ("coordination_id","episode_id","owner_user_id") REFERENCES "public"."efa_police_coordination"("id","episode_id","owner_user_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "efa_police_coordination_dispatch" ADD CONSTRAINT "efa_police_coordination_dispatch_dispatch_fk" FOREIGN KEY ("dispatch_id","episode_id","owner_user_id") REFERENCES "public"."efa_dispatch"("id","episode_id","owner_user_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "efa_police_coordination_event" ADD CONSTRAINT "efa_police_coordination_event_actor_user_id_user_id_fk" FOREIGN KEY ("actor_user_id") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "efa_police_coordination_event" ADD CONSTRAINT "efa_police_coordination_event_coordination_fk" FOREIGN KEY ("coordination_id","episode_id","owner_user_id") REFERENCES "public"."efa_police_coordination"("id","episode_id","owner_user_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "efa_police_coordination_event" ADD CONSTRAINT "efa_police_coordination_event_linked_dispatch_fk" FOREIGN KEY ("coordination_id","dispatch_id","episode_id","owner_user_id") REFERENCES "public"."efa_police_coordination_dispatch"("coordination_id","dispatch_id","episode_id","owner_user_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "efa_police_coordination_notice" ADD CONSTRAINT "efa_police_coordination_notice_recipient_user_id_user_id_fk" FOREIGN KEY ("recipient_user_id") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "efa_police_coordination_notice" ADD CONSTRAINT "efa_police_coordination_notice_owner_fk" FOREIGN KEY ("coordination_id","owner_user_id") REFERENCES "public"."efa_police_coordination"("id","owner_user_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "efa_police_coordination_notice" ADD CONSTRAINT "efa_police_coordination_notice_audit_fk" FOREIGN KEY ("audit_id","coordination_id") REFERENCES "public"."efa_police_coordination_audit"("id","coordination_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "efa_police_coordination_operation" ADD CONSTRAINT "efa_police_coordination_operation_actor_user_id_user_id_fk" FOREIGN KEY ("actor_user_id") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "efa_police_coordination_operation" ADD CONSTRAINT "efa_police_coordination_operation_fk" FOREIGN KEY ("coordination_id","owner_user_id") REFERENCES "public"."efa_police_coordination"("id","owner_user_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE FUNCTION reject_efa_police_coordination_history_mutation() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'EFA police coordination history and receipts are append-only'; END; $$;--> statement-breakpoint
CREATE TRIGGER efa_police_coordination_audit_append_only BEFORE UPDATE OR DELETE ON efa_police_coordination_audit FOR EACH ROW EXECUTE FUNCTION reject_efa_police_coordination_history_mutation();--> statement-breakpoint
CREATE TRIGGER efa_police_coordination_operation_append_only BEFORE UPDATE OR DELETE ON efa_police_coordination_operation FOR EACH ROW EXECUTE FUNCTION reject_efa_police_coordination_history_mutation();
