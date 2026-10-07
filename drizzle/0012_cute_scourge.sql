CREATE TABLE "efa_staffing_audit" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"period_id" uuid NOT NULL,
	"actor_user_id" text NOT NULL,
	"action" text NOT NULL,
	"version_before" integer,
	"version_after" integer NOT NULL,
	"before_state" jsonb,
	"after_state" jsonb NOT NULL,
	"occurred_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "efa_staffing_audit_period_version_unique" UNIQUE("period_id","version_after"),
	CONSTRAINT "efa_staffing_audit_action_allowed" CHECK ("efa_staffing_audit"."action" in ('entered', 'exited', 'movement_started', 'movement_completed')),
	CONSTRAINT "efa_staffing_audit_version_transition_valid" CHECK (("efa_staffing_audit"."version_before" is null and "efa_staffing_audit"."version_after" = 1) or ("efa_staffing_audit"."version_before" is not null and "efa_staffing_audit"."version_before" > 0 and "efa_staffing_audit"."version_after" = "efa_staffing_audit"."version_before" + 1)),
	CONSTRAINT "efa_staffing_audit_states_are_objects" CHECK (jsonb_typeof("efa_staffing_audit"."after_state") = 'object' and ("efa_staffing_audit"."before_state" is null or jsonb_typeof("efa_staffing_audit"."before_state") = 'object'))
);
--> statement-breakpoint
CREATE TABLE "efa_staffing_movement" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"period_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"departed_at" timestamp with time zone NOT NULL,
	"arrived_at" timestamp with time zone,
	"cause" text,
	"description" text,
	"client_creation_key" uuid NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"created_by_user_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"completed_by_user_id" text,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "efa_staffing_movement_period_creation_key_unique" UNIQUE("period_id","client_creation_key"),
	CONSTRAINT "efa_staffing_movement_kind_allowed" CHECK ("efa_staffing_movement"."kind" in ('transfer', 'temporary')),
	CONSTRAINT "efa_staffing_movement_version_positive" CHECK ("efa_staffing_movement"."version" > 0),
	CONSTRAINT "efa_staffing_movement_arrival_after_departure" CHECK ("efa_staffing_movement"."arrived_at" is null or "efa_staffing_movement"."arrived_at" >= "efa_staffing_movement"."departed_at"),
	CONSTRAINT "efa_staffing_movement_cause_allowed" CHECK ("efa_staffing_movement"."cause" is null or "efa_staffing_movement"."cause" in ('medical_request', 'coordination', 'temporary', 'other')),
	CONSTRAINT "efa_staffing_movement_other_description_required" CHECK (("efa_staffing_movement"."cause" = 'other' and char_length(btrim(coalesce("efa_staffing_movement"."description", ''))) > 0) or ("efa_staffing_movement"."cause" is distinct from 'other' and "efa_staffing_movement"."description" is null))
);
--> statement-breakpoint
CREATE TABLE "efa_staffing_period" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"guard_id" uuid NOT NULL,
	"role" text NOT NULL,
	"entered_at" timestamp with time zone NOT NULL,
	"exited_at" timestamp with time zone,
	"exit_cause" text,
	"exit_description" text,
	"client_creation_key" uuid NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "efa_staffing_period_guard_creation_key_unique" UNIQUE("guard_id","client_creation_key"),
	CONSTRAINT "efa_staffing_period_role_allowed" CHECK ("efa_staffing_period"."role" in ('nurse', 'driver', 'doctor')),
	CONSTRAINT "efa_staffing_period_version_positive" CHECK ("efa_staffing_period"."version" > 0),
	CONSTRAINT "efa_staffing_period_exit_after_entry" CHECK ("efa_staffing_period"."exited_at" is null or "efa_staffing_period"."exited_at" >= "efa_staffing_period"."entered_at"),
	CONSTRAINT "efa_staffing_period_exit_cause_allowed" CHECK ("efa_staffing_period"."exit_cause" is null or "efa_staffing_period"."exit_cause" in ('medical_request', 'coordination', 'temporary', 'other')),
	CONSTRAINT "efa_staffing_period_other_description_required" CHECK (("efa_staffing_period"."exit_cause" = 'other' and char_length(btrim(coalesce("efa_staffing_period"."exit_description", ''))) > 0) or ("efa_staffing_period"."exit_cause" is distinct from 'other' and "efa_staffing_period"."exit_description" is null))
);
--> statement-breakpoint
ALTER TABLE "efa_staffing_audit" ADD CONSTRAINT "efa_staffing_audit_period_id_efa_staffing_period_id_fk" FOREIGN KEY ("period_id") REFERENCES "public"."efa_staffing_period"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "efa_staffing_audit" ADD CONSTRAINT "efa_staffing_audit_actor_user_id_user_id_fk" FOREIGN KEY ("actor_user_id") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "efa_staffing_movement" ADD CONSTRAINT "efa_staffing_movement_period_id_efa_staffing_period_id_fk" FOREIGN KEY ("period_id") REFERENCES "public"."efa_staffing_period"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "efa_staffing_movement" ADD CONSTRAINT "efa_staffing_movement_created_by_user_id_user_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "efa_staffing_movement" ADD CONSTRAINT "efa_staffing_movement_completed_by_user_id_user_id_fk" FOREIGN KEY ("completed_by_user_id") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "efa_staffing_period" ADD CONSTRAINT "efa_staffing_period_guard_id_efa_guard_id_fk" FOREIGN KEY ("guard_id") REFERENCES "public"."efa_guard"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "efa_staffing_movement_one_open_per_period_unique" ON "efa_staffing_movement" USING btree ("period_id") WHERE "efa_staffing_movement"."arrived_at" is null;