CREATE TABLE "compensatory_request" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"client_operation_id" uuid NOT NULL,
	"staff_id" uuid NOT NULL,
	"created_by_user_id" text NOT NULL,
	"submitted_at" text NOT NULL,
	"requester_name" text NOT NULL,
	"requester_mobile" text NOT NULL,
	"compensatory_date" text NOT NULL,
	"hours" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "compensatory_request_operation_unique" UNIQUE("created_by_user_id","client_operation_id"),
	CONSTRAINT "compensatory_request_submitted_at_valid" CHECK (char_length(btrim("compensatory_request"."submitted_at")) between 1 and 500),
	CONSTRAINT "compensatory_request_requester_name_valid" CHECK (char_length(btrim("compensatory_request"."requester_name")) between 1 and 300),
	CONSTRAINT "compensatory_request_requester_mobile_valid" CHECK (char_length(btrim("compensatory_request"."requester_mobile")) between 1 and 300),
	CONSTRAINT "compensatory_request_date_valid" CHECK (char_length(btrim("compensatory_request"."compensatory_date")) between 1 and 300),
	CONSTRAINT "compensatory_request_hours_valid" CHECK (char_length(btrim("compensatory_request"."hours")) between 1 and 100)
);
--> statement-breakpoint
ALTER TABLE "compensatory_request" ADD CONSTRAINT "compensatory_request_staff_id_compensatory_staff_id_fk" FOREIGN KEY ("staff_id") REFERENCES "public"."compensatory_staff"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "compensatory_request" ADD CONSTRAINT "compensatory_request_created_by_user_id_user_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;