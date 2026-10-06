CREATE TABLE "efa_guard" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_user_id" text NOT NULL,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"ended_at" timestamp with time zone,
	"declared_at_central" boolean NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "efa_guard_version_positive" CHECK ("efa_guard"."version" > 0),
	CONSTRAINT "efa_guard_end_after_start" CHECK ("efa_guard"."ended_at" is null or "efa_guard"."ended_at" >= "efa_guard"."started_at")
);
--> statement-breakpoint
CREATE TABLE "efa_guard_audit" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"guard_id" uuid NOT NULL,
	"actor_user_id" text NOT NULL,
	"action" text NOT NULL,
	"version_before" integer,
	"version_after" integer NOT NULL,
	"before_state" jsonb,
	"after_state" jsonb NOT NULL,
	"occurred_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "efa_guard_audit_guard_version_unique" UNIQUE("guard_id","version_after"),
	CONSTRAINT "efa_guard_audit_action_allowed" CHECK ("efa_guard_audit"."action" in ('started', 'ended', 'end_corrected')),
	CONSTRAINT "efa_guard_audit_version_transition_valid" CHECK (("efa_guard_audit"."version_before" is null and "efa_guard_audit"."version_after" = 1) or ("efa_guard_audit"."version_before" is not null and "efa_guard_audit"."version_before" > 0 and "efa_guard_audit"."version_after" = "efa_guard_audit"."version_before" + 1)),
	CONSTRAINT "efa_guard_audit_state_is_object" CHECK (jsonb_typeof("efa_guard_audit"."after_state") = 'object' and ("efa_guard_audit"."before_state" is null or jsonb_typeof("efa_guard_audit"."before_state") = 'object'))
);
--> statement-breakpoint
CREATE TABLE "efa_guard_base_event" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"guard_id" uuid NOT NULL,
	"base_id" uuid NOT NULL,
	"actor_user_id" text NOT NULL,
	"action" text NOT NULL,
	"occurred_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "efa_guard_base_event_action_allowed" CHECK ("efa_guard_base_event"."action" in ('added', 'removed'))
);
--> statement-breakpoint
ALTER TABLE "efa_guard" ADD CONSTRAINT "efa_guard_owner_user_id_user_id_fk" FOREIGN KEY ("owner_user_id") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "efa_guard_audit" ADD CONSTRAINT "efa_guard_audit_guard_id_efa_guard_id_fk" FOREIGN KEY ("guard_id") REFERENCES "public"."efa_guard"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "efa_guard_audit" ADD CONSTRAINT "efa_guard_audit_actor_user_id_user_id_fk" FOREIGN KEY ("actor_user_id") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "efa_guard_base_event" ADD CONSTRAINT "efa_guard_base_event_guard_id_efa_guard_id_fk" FOREIGN KEY ("guard_id") REFERENCES "public"."efa_guard"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "efa_guard_base_event" ADD CONSTRAINT "efa_guard_base_event_base_id_efa_base_id_fk" FOREIGN KEY ("base_id") REFERENCES "public"."efa_base"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "efa_guard_base_event" ADD CONSTRAINT "efa_guard_base_event_actor_user_id_user_id_fk" FOREIGN KEY ("actor_user_id") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "efa_guard_one_open_per_owner_unique" ON "efa_guard" USING btree ("owner_user_id") WHERE "efa_guard"."ended_at" is null;--> statement-breakpoint
ALTER TABLE "efa_guard_audit" ADD CONSTRAINT "efa_guard_audit_state_keys_allowlisted" CHECK (("efa_guard_audit"."after_state" - 'startedAt' - 'endedAt') = '{}'::jsonb and ("efa_guard_audit"."before_state" is null or ("efa_guard_audit"."before_state" - 'startedAt' - 'endedAt') = '{}'::jsonb));--> statement-breakpoint
CREATE FUNCTION reject_efa_guard_history_mutation() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'EFA guard history is append-only';
END;
$$ LANGUAGE plpgsql;--> statement-breakpoint
CREATE TRIGGER efa_guard_audit_append_only
BEFORE UPDATE OR DELETE ON efa_guard_audit
FOR EACH ROW EXECUTE FUNCTION reject_efa_guard_history_mutation();--> statement-breakpoint
CREATE TRIGGER efa_guard_base_event_append_only
BEFORE UPDATE OR DELETE ON efa_guard_base_event
FOR EACH ROW EXECUTE FUNCTION reject_efa_guard_history_mutation();
