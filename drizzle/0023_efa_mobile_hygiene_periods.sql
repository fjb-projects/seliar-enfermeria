CREATE TABLE "efa_mobile_hygiene_period" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"guard_id" uuid NOT NULL,
	"base_id" uuid NOT NULL,
	"base_name_snapshot" text NOT NULL,
	"requested_at" timestamp with time zone NOT NULL,
	"available_at" timestamp with time zone,
	"not_informed" boolean DEFAULT false NOT NULL,
	"note" text,
	"deleted_at" timestamp with time zone,
	"client_creation_key" uuid NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"created_by_user_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "efa_mobile_hygiene_period_id_guard_unique" UNIQUE("id","guard_id"),
	CONSTRAINT "efa_mobile_hygiene_period_guard_creation_key_unique" UNIQUE("guard_id","client_creation_key"),
	CONSTRAINT "efa_mobile_hygiene_period_version_positive" CHECK ("efa_mobile_hygiene_period"."version" > 0),
	CONSTRAINT "efa_mobile_hygiene_period_base_name_snapshot_valid" CHECK (char_length(btrim("efa_mobile_hygiene_period"."base_name_snapshot")) between 1 and 120),
	CONSTRAINT "efa_mobile_hygiene_period_available_after_requested" CHECK ("efa_mobile_hygiene_period"."available_at" is null or "efa_mobile_hygiene_period"."available_at" >= "efa_mobile_hygiene_period"."requested_at"),
	CONSTRAINT "efa_mobile_hygiene_period_not_informed_is_open" CHECK ("efa_mobile_hygiene_period"."not_informed" = false or "efa_mobile_hygiene_period"."available_at" is null),
	CONSTRAINT "efa_mobile_hygiene_period_note_valid" CHECK ("efa_mobile_hygiene_period"."note" is null or char_length(btrim("efa_mobile_hygiene_period"."note")) between 1 and 300)
);
--> statement-breakpoint
CREATE TABLE "efa_mobile_hygiene_period_audit" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"period_id" uuid NOT NULL,
	"guard_id" uuid NOT NULL,
	"actor_user_id" text NOT NULL,
	"operation_id" uuid NOT NULL,
	"action" text NOT NULL,
	"version_before" integer,
	"version_after" integer NOT NULL,
	"before_state" jsonb,
	"after_state" jsonb NOT NULL,
	"occurred_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "efa_mobile_hygiene_period_audit_version_unique" UNIQUE("period_id","version_after"),
	CONSTRAINT "efa_mobile_hygiene_period_audit_action_allowed" CHECK ("efa_mobile_hygiene_period_audit"."action" in ('created', 'updated', 'available', 'deleted', 'not_informed')),
	CONSTRAINT "efa_mobile_hygiene_period_audit_action_version_valid" CHECK (("efa_mobile_hygiene_period_audit"."action" = 'created' and "efa_mobile_hygiene_period_audit"."version_before" is null and "efa_mobile_hygiene_period_audit"."version_after" = 1) or ("efa_mobile_hygiene_period_audit"."action" in ('updated', 'available', 'deleted', 'not_informed') and "efa_mobile_hygiene_period_audit"."version_before" is not null and "efa_mobile_hygiene_period_audit"."version_before" > 0 and "efa_mobile_hygiene_period_audit"."version_after" = "efa_mobile_hygiene_period_audit"."version_before" + 1)),
	CONSTRAINT "efa_mobile_hygiene_period_audit_state_valid" CHECK (jsonb_typeof("efa_mobile_hygiene_period_audit"."after_state") = 'object' and ("efa_mobile_hygiene_period_audit"."before_state" is null or jsonb_typeof("efa_mobile_hygiene_period_audit"."before_state") = 'object') and ("efa_mobile_hygiene_period_audit"."after_state" - 'requestedAt' - 'availableAt' - 'notInformed' - 'note' - 'deletedAt') = '{}'::jsonb and ("efa_mobile_hygiene_period_audit"."before_state" is null or ("efa_mobile_hygiene_period_audit"."before_state" - 'requestedAt' - 'availableAt' - 'notInformed' - 'note' - 'deletedAt') = '{}'::jsonb))
);
--> statement-breakpoint
CREATE TABLE "efa_mobile_hygiene_period_operation" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"period_id" uuid NOT NULL,
	"guard_id" uuid NOT NULL,
	"actor_user_id" text NOT NULL,
	"client_operation_id" uuid NOT NULL,
	"action" text NOT NULL,
	"request_hash" text NOT NULL,
	"applied_version" integer NOT NULL,
	"changed" boolean NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "efa_mobile_hygiene_period_guard_operation_unique" UNIQUE("guard_id","client_operation_id"),
	CONSTRAINT "efa_mobile_hygiene_period_operation_action_allowed" CHECK ("efa_mobile_hygiene_period_operation"."action" in ('created', 'updated', 'available', 'deleted')),
	CONSTRAINT "efa_mobile_hygiene_period_operation_version_positive" CHECK ("efa_mobile_hygiene_period_operation"."applied_version" > 0),
	CONSTRAINT "efa_mobile_hygiene_period_operation_request_hash_valid" CHECK ("efa_mobile_hygiene_period_operation"."request_hash" ~ '^[0-9a-f]{64}$')
);
--> statement-breakpoint
ALTER TABLE "efa_mobile_hygiene_period" ADD CONSTRAINT "efa_mobile_hygiene_period_guard_id_efa_guard_id_fk" FOREIGN KEY ("guard_id") REFERENCES "public"."efa_guard"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "efa_mobile_hygiene_period" ADD CONSTRAINT "efa_mobile_hygiene_period_base_id_efa_base_id_fk" FOREIGN KEY ("base_id") REFERENCES "public"."efa_base"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "efa_mobile_hygiene_period" ADD CONSTRAINT "efa_mobile_hygiene_period_created_by_user_id_user_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "efa_mobile_hygiene_period_audit" ADD CONSTRAINT "efa_mobile_hygiene_period_audit_actor_user_id_user_id_fk" FOREIGN KEY ("actor_user_id") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "efa_mobile_hygiene_period_audit" ADD CONSTRAINT "efa_mobile_hygiene_period_audit_period_guard_fk" FOREIGN KEY ("period_id","guard_id") REFERENCES "public"."efa_mobile_hygiene_period"("id","guard_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "efa_mobile_hygiene_period_operation" ADD CONSTRAINT "efa_mobile_hygiene_period_operation_actor_user_id_user_id_fk" FOREIGN KEY ("actor_user_id") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "efa_mobile_hygiene_period_operation" ADD CONSTRAINT "efa_mobile_hygiene_period_operation_period_guard_fk" FOREIGN KEY ("period_id","guard_id") REFERENCES "public"."efa_mobile_hygiene_period"("id","guard_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "efa_mobile_hygiene_period_one_open_per_mobile_unique" ON "efa_mobile_hygiene_period" USING btree ("guard_id","base_id") WHERE "efa_mobile_hygiene_period"."available_at" is null and "efa_mobile_hygiene_period"."deleted_at" is null and "efa_mobile_hygiene_period"."not_informed" = false;
--> statement-breakpoint
CREATE FUNCTION reject_efa_mobile_hygiene_history_mutation() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'EFA mobile hygiene history and operation receipts are append-only'; END; $$;
--> statement-breakpoint
CREATE TRIGGER efa_mobile_hygiene_period_audit_append_only BEFORE UPDATE OR DELETE ON efa_mobile_hygiene_period_audit FOR EACH ROW EXECUTE FUNCTION reject_efa_mobile_hygiene_history_mutation();
--> statement-breakpoint
CREATE TRIGGER efa_mobile_hygiene_period_operation_append_only BEFORE UPDATE OR DELETE ON efa_mobile_hygiene_period_operation FOR EACH ROW EXECUTE FUNCTION reject_efa_mobile_hygiene_history_mutation();
--> statement-breakpoint
CREATE FUNCTION reject_efa_mobile_hygiene_hard_delete() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'EFA mobile hygiene periods must be soft-deleted'; END; $$;
--> statement-breakpoint
CREATE TRIGGER efa_mobile_hygiene_period_soft_delete_only BEFORE DELETE ON efa_mobile_hygiene_period FOR EACH ROW EXECUTE FUNCTION reject_efa_mobile_hygiene_hard_delete();
