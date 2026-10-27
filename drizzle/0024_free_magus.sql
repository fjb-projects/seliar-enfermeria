CREATE TABLE "compensatory_ledger" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"staff_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"minutes" integer NOT NULL,
	"effective_date" text NOT NULL,
	"reason" text NOT NULL,
	"actor_user_id" text NOT NULL,
	"actor_name" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"balance_before_minutes" integer NOT NULL,
	"balance_after_minutes" integer NOT NULL,
	"reverses_entry_id" uuid,
	CONSTRAINT "compensatory_ledger_kind_allowed" CHECK ("compensatory_ledger"."kind" in ('opening','credit','debit','reversal')),
	CONSTRAINT "compensatory_ledger_minutes_nonzero" CHECK ("compensatory_ledger"."minutes" <> 0),
	CONSTRAINT "compensatory_ledger_date_valid" CHECK ("compensatory_ledger"."effective_date" ~ '^\d{4}-\d{2}-\d{2}$'),
	CONSTRAINT "compensatory_ledger_reason_valid" CHECK (char_length(btrim("compensatory_ledger"."reason")) between 1 and 1000),
	CONSTRAINT "compensatory_ledger_balance_nonnegative" CHECK ("compensatory_ledger"."balance_before_minutes" >= 0 and "compensatory_ledger"."balance_after_minutes" >= 0),
	CONSTRAINT "compensatory_ledger_balance_delta" CHECK ("compensatory_ledger"."balance_after_minutes" = "compensatory_ledger"."balance_before_minutes" + "compensatory_ledger"."minutes"),
	CONSTRAINT "compensatory_ledger_kind_sign" CHECK (("compensatory_ledger"."kind" in ('opening','credit') and "compensatory_ledger"."minutes" > 0 and "compensatory_ledger"."reverses_entry_id" is null) or ("compensatory_ledger"."kind" = 'debit' and "compensatory_ledger"."minutes" < 0 and "compensatory_ledger"."reverses_entry_id" is null) or ("compensatory_ledger"."kind" = 'reversal' and "compensatory_ledger"."reverses_entry_id" is not null))
);
--> statement-breakpoint
CREATE TABLE "compensatory_operation" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"actor_user_id" text NOT NULL,
	"client_operation_id" uuid NOT NULL,
	"action" text NOT NULL,
	"payload_hash" text NOT NULL,
	"result_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "compensatory_operation_actor_key_unique" UNIQUE("actor_user_id","client_operation_id"),
	CONSTRAINT "compensatory_operation_hash_sha256" CHECK ("compensatory_operation"."payload_hash" ~ '^[0-9a-f]{64}$')
);
--> statement-breakpoint
CREATE TABLE "compensatory_staff" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"dni" text NOT NULL,
	"name" text NOT NULL,
	"email" text,
	"is_active" boolean DEFAULT true NOT NULL,
	"monthly_limit_minutes" integer DEFAULT 1440 NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"balance_minutes" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "compensatory_staff_dni_unique" UNIQUE("dni"),
	CONSTRAINT "compensatory_staff_dni_canonical" CHECK ("compensatory_staff"."dni" ~ '^[0-9]{7,8}$'),
	CONSTRAINT "compensatory_staff_name_valid" CHECK (char_length(btrim("compensatory_staff"."name")) between 1 and 160),
	CONSTRAINT "compensatory_staff_monthly_limit_positive" CHECK ("compensatory_staff"."monthly_limit_minutes" > 0),
	CONSTRAINT "compensatory_staff_version_positive" CHECK ("compensatory_staff"."version" > 0),
	CONSTRAINT "compensatory_staff_balance_nonnegative" CHECK ("compensatory_staff"."balance_minutes" >= 0)
);
--> statement-breakpoint
CREATE TABLE "compensatory_staff_audit" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"staff_id" uuid NOT NULL,
	"actor_user_id" text NOT NULL,
	"actor_name" text NOT NULL,
	"operation_id" uuid NOT NULL,
	"action" text NOT NULL,
	"version_before" integer,
	"version_after" integer NOT NULL,
	"occurred_at" timestamp with time zone DEFAULT now() NOT NULL,
	"reason" text NOT NULL,
	"before_state" jsonb,
	"after_state" jsonb NOT NULL,
	CONSTRAINT "compensatory_staff_audit_operation_unique" UNIQUE("actor_user_id","operation_id"),
	CONSTRAINT "compensatory_staff_audit_version_unique" UNIQUE("staff_id","version_after"),
	CONSTRAINT "compensatory_staff_audit_action_allowed" CHECK ("compensatory_staff_audit"."action" in ('created','updated')),
	CONSTRAINT "compensatory_staff_audit_version_transition" CHECK (("compensatory_staff_audit"."version_before" is null and "compensatory_staff_audit"."version_after" = 1) or ("compensatory_staff_audit"."version_before" > 0 and "compensatory_staff_audit"."version_after" = "compensatory_staff_audit"."version_before" + 1)),
	CONSTRAINT "compensatory_staff_audit_states_objects" CHECK (jsonb_typeof("compensatory_staff_audit"."after_state") = 'object' and ("compensatory_staff_audit"."before_state" is null or jsonb_typeof("compensatory_staff_audit"."before_state") = 'object')),
	CONSTRAINT "compensatory_staff_audit_reason_valid" CHECK (char_length(btrim("compensatory_staff_audit"."reason")) between 1 and 1000)
);
--> statement-breakpoint
ALTER TABLE "compensatory_ledger" ADD CONSTRAINT "compensatory_ledger_staff_id_compensatory_staff_id_fk" FOREIGN KEY ("staff_id") REFERENCES "public"."compensatory_staff"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "compensatory_ledger" ADD CONSTRAINT "compensatory_ledger_actor_user_id_user_id_fk" FOREIGN KEY ("actor_user_id") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "compensatory_ledger" ADD CONSTRAINT "compensatory_ledger_reverses_entry_id_compensatory_ledger_id_fk" FOREIGN KEY ("reverses_entry_id") REFERENCES "public"."compensatory_ledger"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "compensatory_operation" ADD CONSTRAINT "compensatory_operation_actor_user_id_user_id_fk" FOREIGN KEY ("actor_user_id") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "compensatory_staff_audit" ADD CONSTRAINT "compensatory_staff_audit_staff_id_compensatory_staff_id_fk" FOREIGN KEY ("staff_id") REFERENCES "public"."compensatory_staff"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "compensatory_staff_audit" ADD CONSTRAINT "compensatory_staff_audit_actor_user_id_user_id_fk" FOREIGN KEY ("actor_user_id") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "compensatory_ledger_reversal_once_unique" ON "compensatory_ledger" USING btree ("reverses_entry_id") WHERE "compensatory_ledger"."reverses_entry_id" is not null;--> statement-breakpoint
CREATE UNIQUE INDEX "compensatory_ledger_opening_once_unique" ON "compensatory_ledger" USING btree ("staff_id") WHERE "compensatory_ledger"."kind" = 'opening';--> statement-breakpoint
CREATE FUNCTION "reject_compensatory_history_mutation"() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
	RAISE EXCEPTION 'Compensatory history is append-only';
END;
$$;--> statement-breakpoint
CREATE TRIGGER "compensatory_ledger_append_only" BEFORE UPDATE OR DELETE ON "compensatory_ledger" FOR EACH ROW EXECUTE FUNCTION "reject_compensatory_history_mutation"();--> statement-breakpoint
CREATE TRIGGER "compensatory_staff_audit_append_only" BEFORE UPDATE OR DELETE ON "compensatory_staff_audit" FOR EACH ROW EXECUTE FUNCTION "reject_compensatory_history_mutation"();
