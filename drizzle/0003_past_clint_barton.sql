CREATE TABLE "efa_base" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"normalized_name" text NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"created_by_user_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "efa_base_normalized_name_unique" UNIQUE("normalized_name"),
	CONSTRAINT "efa_base_name_valid" CHECK (char_length(btrim("efa_base"."name")) between 1 and 120 and char_length("efa_base"."normalized_name") between 1 and 120),
	CONSTRAINT "efa_base_version_positive" CHECK ("efa_base"."version" > 0)
);
--> statement-breakpoint
CREATE TABLE "efa_base_audit" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"base_id" uuid NOT NULL,
	"actor_user_id" text NOT NULL,
	"action" text NOT NULL,
	"version_before" integer,
	"version_after" integer NOT NULL,
	"before_state" jsonb,
	"after_state" jsonb NOT NULL,
	"occurred_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "efa_base_audit_base_version_unique" UNIQUE("base_id","version_after"),
	CONSTRAINT "efa_base_audit_action_allowed" CHECK ("efa_base_audit"."action" in ('created', 'renamed', 'disabled', 'reactivated')),
	CONSTRAINT "efa_base_audit_version_transition_valid" CHECK (("efa_base_audit"."version_before" is null and "efa_base_audit"."version_after" = 1) or ("efa_base_audit"."version_before" is not null and "efa_base_audit"."version_before" > 0 and "efa_base_audit"."version_after" = "efa_base_audit"."version_before" + 1)),
	CONSTRAINT "efa_base_audit_state_keys_allowlisted" CHECK (("efa_base_audit"."after_state" - 'name' - 'isActive') = '{}'::jsonb and ("efa_base_audit"."before_state" is null or ("efa_base_audit"."before_state" - 'name' - 'isActive') = '{}'::jsonb))
);
--> statement-breakpoint
ALTER TABLE "efa_base" ADD CONSTRAINT "efa_base_created_by_user_id_user_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "efa_base_audit" ADD CONSTRAINT "efa_base_audit_base_id_efa_base_id_fk" FOREIGN KEY ("base_id") REFERENCES "public"."efa_base"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "efa_base_audit" ADD CONSTRAINT "efa_base_audit_actor_user_id_user_id_fk" FOREIGN KEY ("actor_user_id") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE FUNCTION public.reject_efa_base_audit_mutation() RETURNS trigger
LANGUAGE plpgsql
AS $efa_base_audit_append_only$
BEGIN
  RAISE EXCEPTION 'efa_base_audit is append-only' USING ERRCODE = '55000';
END;
$efa_base_audit_append_only$;--> statement-breakpoint
CREATE TRIGGER efa_base_audit_append_only_guard
BEFORE UPDATE OR DELETE ON public.efa_base_audit
FOR EACH ROW EXECUTE FUNCTION public.reject_efa_base_audit_mutation();
