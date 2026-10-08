CREATE TABLE "efa_mobile_arrival" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"guard_id" uuid NOT NULL,
	"base_id" uuid NOT NULL,
	"base_name_snapshot" text NOT NULL,
	"role" text NOT NULL,
	"arrived_at" timestamp with time zone NOT NULL,
	"deleted_at" timestamp with time zone,
	"client_creation_key" uuid NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"created_by_user_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "efa_mobile_arrival_id_guard_unique" UNIQUE("id","guard_id"),
	CONSTRAINT "efa_mobile_arrival_guard_base_role_unique" UNIQUE("guard_id","base_id","role"),
	CONSTRAINT "efa_mobile_arrival_guard_creation_key_unique" UNIQUE("guard_id","client_creation_key"),
	CONSTRAINT "efa_mobile_arrival_role_allowed" CHECK ("efa_mobile_arrival"."role" in ('nurse', 'driver', 'doctor')),
	CONSTRAINT "efa_mobile_arrival_version_positive" CHECK ("efa_mobile_arrival"."version" > 0),
	CONSTRAINT "efa_mobile_arrival_base_name_snapshot_valid" CHECK (char_length(btrim("efa_mobile_arrival"."base_name_snapshot")) between 1 and 120)
);
--> statement-breakpoint
CREATE TABLE "efa_mobile_arrival_audit" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"arrival_id" uuid NOT NULL,
	"guard_id" uuid NOT NULL,
	"actor_user_id" text NOT NULL,
	"operation_id" uuid NOT NULL,
	"action" text NOT NULL,
	"version_before" integer,
	"version_after" integer NOT NULL,
	"before_state" jsonb,
	"after_state" jsonb NOT NULL,
	"occurred_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "efa_mobile_arrival_audit_version_unique" UNIQUE("arrival_id","version_after"),
	CONSTRAINT "efa_mobile_arrival_audit_action_allowed" CHECK ("efa_mobile_arrival_audit"."action" in ('created', 'updated', 'deleted', 'restored')),
	CONSTRAINT "efa_mobile_arrival_audit_version_transition_valid" CHECK (("efa_mobile_arrival_audit"."version_before" is null and "efa_mobile_arrival_audit"."version_after" = 1) or ("efa_mobile_arrival_audit"."version_before" > 0 and "efa_mobile_arrival_audit"."version_after" = "efa_mobile_arrival_audit"."version_before" + 1)),
	CONSTRAINT "efa_mobile_arrival_audit_action_version_valid" CHECK (("efa_mobile_arrival_audit"."action" = 'created' and "efa_mobile_arrival_audit"."version_before" is null and "efa_mobile_arrival_audit"."version_after" = 1) or ("efa_mobile_arrival_audit"."action" in ('updated', 'deleted', 'restored') and "efa_mobile_arrival_audit"."version_before" is not null and "efa_mobile_arrival_audit"."version_after" = "efa_mobile_arrival_audit"."version_before" + 1)),
	CONSTRAINT "efa_mobile_arrival_audit_state_valid" CHECK (jsonb_typeof("efa_mobile_arrival_audit"."after_state") = 'object' and ("efa_mobile_arrival_audit"."before_state" is null or jsonb_typeof("efa_mobile_arrival_audit"."before_state") = 'object') and ("efa_mobile_arrival_audit"."after_state" - 'arrivedAt' - 'deletedAt') = '{}'::jsonb and ("efa_mobile_arrival_audit"."before_state" is null or ("efa_mobile_arrival_audit"."before_state" - 'arrivedAt' - 'deletedAt') = '{}'::jsonb))
);
--> statement-breakpoint
CREATE TABLE "efa_mobile_arrival_operation" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"arrival_id" uuid NOT NULL,
	"guard_id" uuid NOT NULL,
	"actor_user_id" text NOT NULL,
	"client_operation_id" uuid NOT NULL,
	"action" text NOT NULL,
	"request_hash" text NOT NULL,
	"applied_version" integer NOT NULL,
	"changed" boolean NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "efa_mobile_arrival_guard_operation_unique" UNIQUE("guard_id","client_operation_id"),
	CONSTRAINT "efa_mobile_arrival_operation_action_allowed" CHECK ("efa_mobile_arrival_operation"."action" in ('created', 'updated', 'deleted')),
	CONSTRAINT "efa_mobile_arrival_operation_version_positive" CHECK ("efa_mobile_arrival_operation"."applied_version" > 0),
	CONSTRAINT "efa_mobile_arrival_operation_request_hash_valid" CHECK ("efa_mobile_arrival_operation"."request_hash" ~ '^[0-9a-f]{64}$')
);
--> statement-breakpoint
ALTER TABLE "efa_mobile_arrival" ADD CONSTRAINT "efa_mobile_arrival_guard_id_efa_guard_id_fk" FOREIGN KEY ("guard_id") REFERENCES "public"."efa_guard"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "efa_mobile_arrival" ADD CONSTRAINT "efa_mobile_arrival_base_id_efa_base_id_fk" FOREIGN KEY ("base_id") REFERENCES "public"."efa_base"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "efa_mobile_arrival" ADD CONSTRAINT "efa_mobile_arrival_created_by_user_id_user_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "efa_mobile_arrival_audit" ADD CONSTRAINT "efa_mobile_arrival_audit_actor_user_id_user_id_fk" FOREIGN KEY ("actor_user_id") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "efa_mobile_arrival_audit" ADD CONSTRAINT "efa_mobile_arrival_audit_arrival_guard_fk" FOREIGN KEY ("arrival_id","guard_id") REFERENCES "public"."efa_mobile_arrival"("id","guard_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "efa_mobile_arrival_operation" ADD CONSTRAINT "efa_mobile_arrival_operation_actor_user_id_user_id_fk" FOREIGN KEY ("actor_user_id") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "efa_mobile_arrival_operation" ADD CONSTRAINT "efa_mobile_arrival_operation_arrival_guard_fk" FOREIGN KEY ("arrival_id","guard_id") REFERENCES "public"."efa_mobile_arrival"("id","guard_id") ON DELETE restrict ON UPDATE no action;
--> statement-breakpoint
CREATE FUNCTION reject_efa_mobile_arrival_history_mutation() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'EFA mobile arrival history and operation receipts are append-only'; END; $$;
--> statement-breakpoint
CREATE TRIGGER efa_mobile_arrival_audit_append_only BEFORE UPDATE OR DELETE ON efa_mobile_arrival_audit FOR EACH ROW EXECUTE FUNCTION reject_efa_mobile_arrival_history_mutation();
--> statement-breakpoint
CREATE TRIGGER efa_mobile_arrival_operation_append_only BEFORE UPDATE OR DELETE ON efa_mobile_arrival_operation FOR EACH ROW EXECUTE FUNCTION reject_efa_mobile_arrival_history_mutation();
--> statement-breakpoint
CREATE FUNCTION reject_efa_mobile_arrival_hard_delete() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'EFA mobile arrival records must be soft-deleted'; END; $$;
--> statement-breakpoint
CREATE TRIGGER efa_mobile_arrival_soft_delete_only BEFORE DELETE ON efa_mobile_arrival FOR EACH ROW EXECUTE FUNCTION reject_efa_mobile_arrival_hard_delete();
