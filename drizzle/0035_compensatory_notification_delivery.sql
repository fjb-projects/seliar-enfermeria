CREATE TABLE "compensatory_decision_notification_attempt" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"notification_id" uuid NOT NULL,
	"actor_user_id" text NOT NULL,
	"client_operation_id" uuid NOT NULL,
	"payload_hash" text NOT NULL,
	"recipient" text NOT NULL,
	"status" text NOT NULL,
	"requested_at" timestamp with time zone DEFAULT now() NOT NULL,
	"completed_at" timestamp with time zone,
	"provider_id" text,
	CONSTRAINT "compensatory_decision_notification_attempt_actor_operation_unique" UNIQUE("actor_user_id","client_operation_id"),
	CONSTRAINT "compensatory_decision_notification_attempt_hash_valid" CHECK ("compensatory_decision_notification_attempt"."payload_hash" ~ '^[0-9a-f]{64}$'),
	CONSTRAINT "compensatory_decision_notification_attempt_status_allowed" CHECK ("compensatory_decision_notification_attempt"."status" in ('sending','pending_configuration','failed','uncertain','accepted','delivered'))
);
--> statement-breakpoint
ALTER TABLE "compensatory_decision_notification" DROP CONSTRAINT "compensatory_decision_notification_status_allowed";--> statement-breakpoint
ALTER TABLE "compensatory_decision_notification" DROP CONSTRAINT "compensatory_decision_notification_recipient_state_consistent";--> statement-breakpoint
ALTER TABLE "compensatory_decision_notification" ADD COLUMN "reviewed_by_user_id" text;--> statement-breakpoint
ALTER TABLE "compensatory_decision_notification" ADD COLUMN "reviewed_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "compensatory_decision_notification" ADD COLUMN "idempotency_key" text;--> statement-breakpoint
ALTER TABLE "compensatory_decision_notification" ADD COLUMN "provider_id" text;--> statement-breakpoint
ALTER TABLE "compensatory_decision_notification" ADD COLUMN "last_attempt_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "compensatory_decision_notification_attempt" ADD CONSTRAINT "compensatory_decision_notification_attempt_notification_id_compensatory_decision_notification_id_fk" FOREIGN KEY ("notification_id") REFERENCES "public"."compensatory_decision_notification"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "compensatory_decision_notification_attempt" ADD CONSTRAINT "compensatory_decision_notification_attempt_actor_user_id_user_id_fk" FOREIGN KEY ("actor_user_id") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "compensatory_decision_notification_attempt_notification_idx" ON "compensatory_decision_notification_attempt" USING btree ("notification_id","requested_at");--> statement-breakpoint
ALTER TABLE "compensatory_decision_notification" ADD CONSTRAINT "compensatory_decision_notification_reviewed_by_user_id_user_id_fk" FOREIGN KEY ("reviewed_by_user_id") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "compensatory_decision_notification" ADD CONSTRAINT "compensatory_decision_notification_status_allowed" CHECK ("compensatory_decision_notification"."status" in ('pending_review','pending_recipient','pending_configuration','sending','uncertain','failed','accepted','delivered'));--> statement-breakpoint
ALTER TABLE "compensatory_decision_notification" ADD CONSTRAINT "compensatory_decision_notification_recipient_state_consistent" CHECK (("compensatory_decision_notification"."recipient" is null and "compensatory_decision_notification"."status" = 'pending_recipient') or ("compensatory_decision_notification"."recipient" is not null and "compensatory_decision_notification"."status" <> 'pending_recipient'));