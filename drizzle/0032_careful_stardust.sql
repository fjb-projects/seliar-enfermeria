CREATE TABLE "compensatory_coverage" (
	"request_id" uuid PRIMARY KEY NOT NULL,
	"version" integer DEFAULT 0 NOT NULL,
	"planned_start" timestamp with time zone,
	"planned_end" timestamp with time zone,
	"status" text DEFAULT 'pending' NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "compensatory_coverage_version_nonnegative" CHECK ("compensatory_coverage"."version" >= 0),
	CONSTRAINT "compensatory_coverage_status_allowed" CHECK ("compensatory_coverage"."status" in ('pending','partial','confirmed')),
	CONSTRAINT "compensatory_coverage_plan_pair" CHECK (("compensatory_coverage"."planned_start" is null and "compensatory_coverage"."planned_end" is null and "compensatory_coverage"."version" = 0) or ("compensatory_coverage"."planned_start" is not null and "compensatory_coverage"."planned_end" is not null and "compensatory_coverage"."planned_end" > "compensatory_coverage"."planned_start"))
);
--> statement-breakpoint
CREATE TABLE "compensatory_coverage_assignment" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"request_id" uuid NOT NULL,
	"staff_id" uuid NOT NULL,
	"staff_name" text NOT NULL,
	"start" timestamp with time zone NOT NULL,
	"end" timestamp with time zone NOT NULL,
	"confirmed" boolean DEFAULT false NOT NULL,
	"verification_method" text,
	CONSTRAINT "compensatory_coverage_assignment_interval" CHECK ("compensatory_coverage_assignment"."end" > "compensatory_coverage_assignment"."start"),
	CONSTRAINT "compensatory_coverage_assignment_verification" CHECK (not "compensatory_coverage_assignment"."confirmed" or ("compensatory_coverage_assignment"."verification_method" is not null and char_length(btrim("compensatory_coverage_assignment"."verification_method")) between 1 and 500))
);
--> statement-breakpoint
CREATE TABLE "compensatory_coverage_audit" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"request_id" uuid NOT NULL,
	"version" integer NOT NULL,
	"actor_user_id" text NOT NULL,
	"actor_name" text NOT NULL,
	"reason" text NOT NULL,
	"occurred_at" timestamp with time zone DEFAULT now() NOT NULL,
	"before" jsonb NOT NULL,
	"after" jsonb NOT NULL,
	CONSTRAINT "compensatory_coverage_audit_request_version_unique" UNIQUE("request_id","version"),
	CONSTRAINT "compensatory_coverage_audit_version_positive" CHECK ("compensatory_coverage_audit"."version" > 0),
	CONSTRAINT "compensatory_coverage_audit_reason_valid" CHECK (char_length(btrim("compensatory_coverage_audit"."reason")) between 1 and 1000)
);
--> statement-breakpoint
CREATE TABLE "compensatory_coverage_operation" (
	"actor_user_id" text NOT NULL,
	"request_id" uuid NOT NULL,
	"request_operation_id" uuid NOT NULL,
	"payload_hash" text NOT NULL,
	"result_version" integer NOT NULL,
	"result" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "compensatory_coverage_operation_pk" PRIMARY KEY("actor_user_id","request_id","request_operation_id"),
	CONSTRAINT "compensatory_coverage_operation_hash_valid" CHECK ("compensatory_coverage_operation"."payload_hash" ~ '^[0-9a-f]{64}$')
);
--> statement-breakpoint
ALTER TABLE "compensatory_coverage" ADD CONSTRAINT "compensatory_coverage_request_id_compensatory_request_id_fk" FOREIGN KEY ("request_id") REFERENCES "public"."compensatory_request"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "compensatory_coverage_assignment" ADD CONSTRAINT "compensatory_coverage_assignment_request_id_compensatory_coverage_request_id_fk" FOREIGN KEY ("request_id") REFERENCES "public"."compensatory_coverage"("request_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "compensatory_coverage_assignment" ADD CONSTRAINT "compensatory_coverage_assignment_staff_id_compensatory_staff_id_fk" FOREIGN KEY ("staff_id") REFERENCES "public"."compensatory_staff"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "compensatory_coverage_audit" ADD CONSTRAINT "compensatory_coverage_audit_request_id_compensatory_coverage_request_id_fk" FOREIGN KEY ("request_id") REFERENCES "public"."compensatory_coverage"("request_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "compensatory_coverage_audit" ADD CONSTRAINT "compensatory_coverage_audit_actor_user_id_user_id_fk" FOREIGN KEY ("actor_user_id") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "compensatory_coverage_operation" ADD CONSTRAINT "compensatory_coverage_operation_actor_user_id_user_id_fk" FOREIGN KEY ("actor_user_id") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "compensatory_coverage_operation" ADD CONSTRAINT "compensatory_coverage_operation_request_id_compensatory_request_id_fk" FOREIGN KEY ("request_id") REFERENCES "public"."compensatory_request"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "compensatory_coverage_assignment_staff_interval_idx" ON "compensatory_coverage_assignment" USING btree ("staff_id","start","end");--> statement-breakpoint
CREATE INDEX "compensatory_coverage_assignment_request_interval_idx" ON "compensatory_coverage_assignment" USING btree ("request_id","start","end");