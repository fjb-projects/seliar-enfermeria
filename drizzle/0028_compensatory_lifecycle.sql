CREATE TABLE "compensatory_request_audit" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"request_id" uuid NOT NULL,
	"actor_user_id" text,
	"actor_name" text NOT NULL,
	"actor_kind" text NOT NULL,
	"action" text NOT NULL,
	"occurred_at" timestamp with time zone DEFAULT now() NOT NULL,
	"reason" text NOT NULL,
	"version_before" integer NOT NULL,
	"version_after" integer NOT NULL,
	"detail" jsonb DEFAULT '{}'::jsonb NOT NULL,
	CONSTRAINT "compensatory_request_audit_request_version_unique" UNIQUE("request_id","version_after"),
	CONSTRAINT "compensatory_request_audit_actor_kind" CHECK (("compensatory_request_audit"."actor_kind" = 'admin' and "compensatory_request_audit"."actor_user_id" is not null) or ("compensatory_request_audit"."actor_kind" = 'system' and "compensatory_request_audit"."actor_user_id" is null)),
	CONSTRAINT "compensatory_request_audit_action_allowed" CHECK ("compensatory_request_audit"."action" in ('classified','approved','rejected','cancelled','consumed')),
	CONSTRAINT "compensatory_request_audit_phase_transition" CHECK ("compensatory_request_audit"."version_after" = "compensatory_request_audit"."version_before" + 1),
	CONSTRAINT "compensatory_request_audit_reason_valid" CHECK (char_length(btrim("compensatory_request_audit"."reason")) between 1 and 1000)
);
--> statement-breakpoint
ALTER TABLE "compensatory_ledger" DROP CONSTRAINT "compensatory_ledger_kind_allowed";--> statement-breakpoint
ALTER TABLE "compensatory_ledger" DROP CONSTRAINT "compensatory_ledger_kind_sign";--> statement-breakpoint
ALTER TABLE "compensatory_ledger" ALTER COLUMN "actor_user_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "compensatory_ledger" ADD COLUMN "actor_kind" text DEFAULT 'admin' NOT NULL;--> statement-breakpoint
ALTER TABLE "compensatory_ledger" ADD COLUMN "request_id" uuid;--> statement-breakpoint
ALTER TABLE "compensatory_request" ADD COLUMN "phase" text DEFAULT 'unclassified' NOT NULL;--> statement-breakpoint
ALTER TABLE "compensatory_request" ADD COLUMN "version" integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE "compensatory_request" ADD COLUMN "requested_date" text;--> statement-breakpoint
ALTER TABLE "compensatory_request" ADD COLUMN "requested_minutes" integer;--> statement-breakpoint
ALTER TABLE "compensatory_request" ADD COLUMN "classified_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "compensatory_request" ADD COLUMN "classified_by_user_id" text;--> statement-breakpoint
ALTER TABLE "compensatory_request" ADD COLUMN "decision_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "compensatory_request" ADD COLUMN "decision_by_user_id" text;--> statement-breakpoint
ALTER TABLE "compensatory_request" ADD COLUMN "decision_reason" text;--> statement-breakpoint
ALTER TABLE "compensatory_request" ADD COLUMN "cancelled_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "compensatory_request" ADD COLUMN "cancellation_by_user_id" text;--> statement-breakpoint
ALTER TABLE "compensatory_request" ADD COLUMN "cancellation_reason" text;--> statement-breakpoint
ALTER TABLE "compensatory_request" ADD COLUMN "consumed_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "compensatory_request" ADD COLUMN "consumption_ledger_id" uuid;--> statement-breakpoint
ALTER TABLE "compensatory_request_audit" ADD CONSTRAINT "compensatory_request_audit_request_id_compensatory_request_id_fk" FOREIGN KEY ("request_id") REFERENCES "public"."compensatory_request"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "compensatory_request_audit" ADD CONSTRAINT "compensatory_request_audit_actor_user_id_user_id_fk" FOREIGN KEY ("actor_user_id") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "compensatory_ledger" ADD CONSTRAINT "compensatory_ledger_request_id_compensatory_request_id_fk" FOREIGN KEY ("request_id") REFERENCES "public"."compensatory_request"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "compensatory_request" ADD CONSTRAINT "compensatory_request_classified_by_user_id_user_id_fk" FOREIGN KEY ("classified_by_user_id") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "compensatory_request" ADD CONSTRAINT "compensatory_request_decision_by_user_id_user_id_fk" FOREIGN KEY ("decision_by_user_id") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "compensatory_request" ADD CONSTRAINT "compensatory_request_cancellation_by_user_id_user_id_fk" FOREIGN KEY ("cancellation_by_user_id") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "compensatory_ledger_request_consumption_once_unique" ON "compensatory_ledger" USING btree ("request_id") WHERE "compensatory_ledger"."request_id" is not null;--> statement-breakpoint
CREATE INDEX "compensatory_request_effective_due_idx" ON "compensatory_request" USING btree ("requested_date","created_at") WHERE "compensatory_request"."phase" = 'approved';--> statement-breakpoint
ALTER TABLE "compensatory_ledger" ADD CONSTRAINT "compensatory_ledger_actor_kind" CHECK (("compensatory_ledger"."actor_kind" = 'admin' and "compensatory_ledger"."actor_user_id" is not null) or ("compensatory_ledger"."actor_kind" = 'system' and "compensatory_ledger"."actor_user_id" is null));--> statement-breakpoint
ALTER TABLE "compensatory_ledger" ADD CONSTRAINT "compensatory_ledger_kind_allowed" CHECK ("compensatory_ledger"."kind" in ('opening','credit','debit','reversal','request_consumption'));--> statement-breakpoint
ALTER TABLE "compensatory_ledger" ADD CONSTRAINT "compensatory_ledger_kind_sign" CHECK (("compensatory_ledger"."kind" in ('opening','credit') and "compensatory_ledger"."minutes" > 0 and "compensatory_ledger"."reverses_entry_id" is null and "compensatory_ledger"."request_id" is null) or ("compensatory_ledger"."kind" = 'debit' and "compensatory_ledger"."minutes" < 0 and "compensatory_ledger"."reverses_entry_id" is null and "compensatory_ledger"."request_id" is null) or ("compensatory_ledger"."kind" = 'reversal' and "compensatory_ledger"."reverses_entry_id" is not null and "compensatory_ledger"."request_id" is null) or ("compensatory_ledger"."kind" = 'request_consumption' and "compensatory_ledger"."minutes" < 0 and "compensatory_ledger"."request_id" is not null and "compensatory_ledger"."reverses_entry_id" is null));--> statement-breakpoint
ALTER TABLE "compensatory_request" ADD CONSTRAINT "compensatory_request_phase_allowed" CHECK ("compensatory_request"."phase" in ('unclassified','pending','approved','rejected','cancelled','consumed'));--> statement-breakpoint
ALTER TABLE "compensatory_request" ADD CONSTRAINT "compensatory_request_version_positive" CHECK ("compensatory_request"."version" > 0);--> statement-breakpoint
ALTER TABLE "compensatory_request" ADD CONSTRAINT "compensatory_request_classification_pair" CHECK (("compensatory_request"."requested_date" is null and "compensatory_request"."requested_minutes" is null and "compensatory_request"."classified_at" is null and "compensatory_request"."classified_by_user_id" is null) or ("compensatory_request"."requested_date" ~ '^\d{4}-\d{2}-\d{2}$' and "compensatory_request"."requested_minutes" > 0 and "compensatory_request"."classified_at" is not null and "compensatory_request"."classified_by_user_id" is not null));--> statement-breakpoint
ALTER TABLE "compensatory_request" ADD CONSTRAINT "compensatory_request_consumed_pair" CHECK (("compensatory_request"."phase" = 'consumed') = ("compensatory_request"."consumed_at" is not null and "compensatory_request"."consumption_ledger_id" is not null));--> statement-breakpoint
ALTER TABLE "compensatory_request" ADD CONSTRAINT "compensatory_request_consumption_ledger_fk" FOREIGN KEY ("consumption_ledger_id") REFERENCES "public"."compensatory_ledger"("id") ON DELETE restrict ON UPDATE no action;
--> statement-breakpoint
CREATE TRIGGER "compensatory_request_audit_append_only" BEFORE UPDATE OR DELETE ON "compensatory_request_audit" FOR EACH ROW EXECUTE FUNCTION "reject_compensatory_history_mutation"();
