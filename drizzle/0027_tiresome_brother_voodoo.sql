CREATE TABLE "compensatory_staff_deletion_audit" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"staff_id" uuid NOT NULL,
	"staff_snapshot" jsonb NOT NULL,
	"prior_audits" jsonb NOT NULL,
	"actor_user_id" text NOT NULL,
	"actor_name" text NOT NULL,
	"operation_id" uuid NOT NULL,
	"occurred_at" timestamp with time zone DEFAULT now() NOT NULL,
	"reason" text NOT NULL,
	CONSTRAINT "compensatory_staff_deletion_operation_unique" UNIQUE("actor_user_id","operation_id"),
	CONSTRAINT "compensatory_staff_deletion_snapshot_valid" CHECK (jsonb_typeof("compensatory_staff_deletion_audit"."staff_snapshot") = 'object' and jsonb_typeof("compensatory_staff_deletion_audit"."prior_audits") = 'array'),
	CONSTRAINT "compensatory_staff_deletion_reason_valid" CHECK (char_length(btrim("compensatory_staff_deletion_audit"."reason")) between 1 and 1000)
);
--> statement-breakpoint
ALTER TABLE "compensatory_staff_deletion_audit" ADD CONSTRAINT "compensatory_staff_deletion_audit_actor_user_id_user_id_fk" FOREIGN KEY ("actor_user_id") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;
--> statement-breakpoint
DROP TRIGGER "compensatory_staff_audit_append_only" ON "compensatory_staff_audit";
--> statement-breakpoint
CREATE TRIGGER "compensatory_staff_audit_update_only" BEFORE UPDATE ON "compensatory_staff_audit" FOR EACH ROW EXECUTE FUNCTION "reject_compensatory_history_mutation"();
--> statement-breakpoint
CREATE TRIGGER "compensatory_staff_deletion_audit_append_only" BEFORE UPDATE OR DELETE ON "compensatory_staff_deletion_audit" FOR EACH ROW EXECUTE FUNCTION "reject_compensatory_history_mutation"();
--> statement-breakpoint
CREATE FUNCTION "guard_compensatory_staff_audit_deletion"() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
	IF current_setting('app.allow_compensatory_staff_audit_delete', true) = 'on'
		AND EXISTS (
			SELECT 1
			FROM "compensatory_staff_deletion_audit" AS archive
			WHERE archive."staff_id" = OLD."staff_id"
				AND archive."staff_snapshot" ->> 'id' = OLD."staff_id"::text
				AND EXISTS (
					SELECT 1
					FROM jsonb_array_elements(archive."prior_audits") AS prior_audit
					WHERE prior_audit ->> 'id' = OLD."id"::text
				)
		)
	THEN
		RETURN OLD;
	END IF;
	RAISE EXCEPTION 'Compensatory staff audit deletion requires a matching append-only deletion archive';
END;
$$;
--> statement-breakpoint
CREATE TRIGGER "compensatory_staff_audit_delete_requires_archive" BEFORE DELETE ON "compensatory_staff_audit" FOR EACH ROW EXECUTE FUNCTION "guard_compensatory_staff_audit_deletion"();
