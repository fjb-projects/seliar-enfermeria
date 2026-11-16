CREATE TABLE "compensatory_decision_notification" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"request_id" uuid NOT NULL,
	"decision_version" integer NOT NULL,
	"decision" text NOT NULL,
	"recipient_kind" text NOT NULL,
	"recipient" text,
	"status" text NOT NULL,
	"reason" text NOT NULL,
	"subject" text NOT NULL,
	"text" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "compensatory_decision_notification_request_decision_recipient_unique" UNIQUE("request_id","decision_version","recipient_kind"),
	CONSTRAINT "compensatory_decision_notification_version_positive" CHECK ("compensatory_decision_notification"."decision_version" > 1),
	CONSTRAINT "compensatory_decision_notification_decision_allowed" CHECK ("compensatory_decision_notification"."decision" in ('approved','rejected')),
	CONSTRAINT "compensatory_decision_notification_recipient_kind_allowed" CHECK ("compensatory_decision_notification"."recipient_kind" in ('requester','admin')),
	CONSTRAINT "compensatory_decision_notification_status_allowed" CHECK ("compensatory_decision_notification"."status" in ('pending_review','pending_recipient')),
	CONSTRAINT "compensatory_decision_notification_recipient_state_consistent" CHECK (("compensatory_decision_notification"."recipient" is null and "compensatory_decision_notification"."status" = 'pending_recipient') or ("compensatory_decision_notification"."recipient" is not null and "compensatory_decision_notification"."status" = 'pending_review')),
	CONSTRAINT "compensatory_decision_notification_reason_valid" CHECK (char_length(btrim("compensatory_decision_notification"."reason")) between 1 and 1000)
);
--> statement-breakpoint
ALTER TABLE "compensatory_decision_notification" ADD CONSTRAINT "compensatory_decision_notification_request_id_compensatory_request_id_fk" FOREIGN KEY ("request_id") REFERENCES "public"."compensatory_request"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "compensatory_decision_notification_review_idx" ON "compensatory_decision_notification" USING btree ("status","created_at");