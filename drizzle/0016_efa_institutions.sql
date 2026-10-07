CREATE TABLE "efa_institution" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"normalized_name" text NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"created_by_user_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "efa_institution_normalized_name_unique" UNIQUE("normalized_name"),
	CONSTRAINT "efa_institution_name_valid" CHECK (char_length(btrim("efa_institution"."name")) between 1 and 120 and char_length("efa_institution"."normalized_name") between 1 and 120),
	CONSTRAINT "efa_institution_version_positive" CHECK ("efa_institution"."version" > 0)
);
--> statement-breakpoint
CREATE TABLE "efa_institution_audit" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"institution_id" uuid NOT NULL,
	"actor_user_id" text NOT NULL,
	"action" text NOT NULL,
	"version_before" integer,
	"version_after" integer NOT NULL,
	"before_state" jsonb,
	"after_state" jsonb NOT NULL,
	"occurred_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "efa_institution_audit_version_unique" UNIQUE("institution_id","version_after"),
	CONSTRAINT "efa_institution_audit_action_allowed" CHECK ("efa_institution_audit"."action" in ('created', 'renamed', 'disabled', 'reactivated')),
	CONSTRAINT "efa_institution_audit_version_transition_valid" CHECK (("efa_institution_audit"."version_before" is null and "efa_institution_audit"."version_after" = 1) or ("efa_institution_audit"."version_before" is not null and "efa_institution_audit"."version_before" > 0 and "efa_institution_audit"."version_after" = "efa_institution_audit"."version_before" + 1)),
	CONSTRAINT "efa_institution_audit_state_keys_allowlisted" CHECK (("efa_institution_audit"."after_state" - 'name' - 'isActive') = '{}'::jsonb and ("efa_institution_audit"."before_state" is null or ("efa_institution_audit"."before_state" - 'name' - 'isActive') = '{}'::jsonb))
);
--> statement-breakpoint
ALTER TABLE "efa_institution" ADD CONSTRAINT "efa_institution_created_by_user_id_user_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "efa_institution_audit" ADD CONSTRAINT "efa_institution_audit_institution_id_efa_institution_id_fk" FOREIGN KEY ("institution_id") REFERENCES "public"."efa_institution"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "efa_institution_audit" ADD CONSTRAINT "efa_institution_audit_actor_user_id_user_id_fk" FOREIGN KEY ("actor_user_id") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;
--> statement-breakpoint
CREATE FUNCTION efa_institution_prevent_delete() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'Institution catalog entries are retained; deactivate them instead.';
END;
$$ LANGUAGE plpgsql;
--> statement-breakpoint
CREATE TRIGGER efa_institution_prevent_delete
BEFORE DELETE ON "efa_institution"
FOR EACH ROW EXECUTE FUNCTION efa_institution_prevent_delete();
--> statement-breakpoint
CREATE FUNCTION efa_institution_audit_immutable() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'Institution audit history is append-only.';
END;
$$ LANGUAGE plpgsql;
--> statement-breakpoint
CREATE TRIGGER efa_institution_audit_append_only
BEFORE UPDATE OR DELETE ON "efa_institution_audit"
FOR EACH ROW EXECUTE FUNCTION efa_institution_audit_immutable();
