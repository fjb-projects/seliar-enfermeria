CREATE TABLE "efa_staffing_plan" (
	"id" uuid PRIMARY KEY NOT NULL,
	"target_kind" text NOT NULL,
	"target_name" text NOT NULL,
	"target_key" text NOT NULL,
	"effective_from" text NOT NULL,
	"cycle_anchor" text NOT NULL,
	"cycle_length_days" integer NOT NULL,
	"slots" jsonb NOT NULL,
	"version" integer NOT NULL,
	"client_operation_id" uuid NOT NULL,
	"created_by_user_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "efa_staffing_plan_target_effective_unique" UNIQUE("target_key","effective_from"),
	CONSTRAINT "efa_staffing_plan_target_operation_unique" UNIQUE("target_key","client_operation_id"),
	CONSTRAINT "efa_staffing_plan_target_kind_allowed" CHECK ("efa_staffing_plan"."target_kind" in ('base', 'mobile')),
	CONSTRAINT "efa_staffing_plan_dates_valid" CHECK ("efa_staffing_plan"."effective_from" ~ '^\d{4}-\d{2}-\d{2}$' and "efa_staffing_plan"."cycle_anchor" ~ '^\d{4}-\d{2}-\d{2}$'),
	CONSTRAINT "efa_staffing_plan_cycle_length_valid" CHECK ("efa_staffing_plan"."cycle_length_days" between 1 and 366),
	CONSTRAINT "efa_staffing_plan_version_positive" CHECK ("efa_staffing_plan"."version" > 0),
	CONSTRAINT "efa_staffing_plan_slots_array" CHECK (jsonb_typeof("efa_staffing_plan"."slots") = 'array')
);
--> statement-breakpoint
CREATE TABLE "efa_staffing_plan_audit" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"plan_id" uuid NOT NULL,
	"actor_user_id" text NOT NULL,
	"version" integer NOT NULL,
	"state" jsonb NOT NULL,
	"occurred_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "efa_staffing_plan_audit_plan_version_unique" UNIQUE("plan_id","version"),
	CONSTRAINT "efa_staffing_plan_audit_version_positive" CHECK ("efa_staffing_plan_audit"."version" > 0),
	CONSTRAINT "efa_staffing_plan_audit_state_object" CHECK (jsonb_typeof("efa_staffing_plan_audit"."state") = 'object')
);
--> statement-breakpoint
CREATE TABLE "efa_staffing_plan_exception" (
	"id" uuid PRIMARY KEY NOT NULL,
	"target_kind" text NOT NULL,
	"target_name" text NOT NULL,
	"target_key" text NOT NULL,
	"date" text NOT NULL,
	"slots" jsonb NOT NULL,
	"version" integer NOT NULL,
	"client_operation_id" uuid NOT NULL,
	"created_by_user_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "efa_staffing_plan_exception_version_unique" UNIQUE("target_key","date","version"),
	CONSTRAINT "efa_staffing_plan_exception_operation_unique" UNIQUE("target_key","client_operation_id"),
	CONSTRAINT "efa_staffing_plan_exception_target_kind_allowed" CHECK ("efa_staffing_plan_exception"."target_kind" in ('base', 'mobile')),
	CONSTRAINT "efa_staffing_plan_exception_date_valid" CHECK ("efa_staffing_plan_exception"."date" ~ '^\d{4}-\d{2}-\d{2}$'),
	CONSTRAINT "efa_staffing_plan_exception_version_positive" CHECK ("efa_staffing_plan_exception"."version" > 0),
	CONSTRAINT "efa_staffing_plan_exception_slots_array" CHECK (jsonb_typeof("efa_staffing_plan_exception"."slots") = 'array')
);
--> statement-breakpoint
CREATE TABLE "efa_staffing_plan_exception_audit" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"exception_id" uuid NOT NULL,
	"actor_user_id" text NOT NULL,
	"version" integer NOT NULL,
	"state" jsonb NOT NULL,
	"occurred_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "efa_staffing_plan_exception_audit_version_unique" UNIQUE("exception_id","version"),
	CONSTRAINT "efa_staffing_plan_exception_audit_version_positive" CHECK ("efa_staffing_plan_exception_audit"."version" > 0),
	CONSTRAINT "efa_staffing_plan_exception_audit_state_object" CHECK (jsonb_typeof("efa_staffing_plan_exception_audit"."state") = 'object')
);
--> statement-breakpoint
ALTER TABLE "efa_staffing_plan" ADD CONSTRAINT "efa_staffing_plan_created_by_user_id_user_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "efa_staffing_plan_audit" ADD CONSTRAINT "efa_staffing_plan_audit_plan_id_efa_staffing_plan_id_fk" FOREIGN KEY ("plan_id") REFERENCES "public"."efa_staffing_plan"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "efa_staffing_plan_audit" ADD CONSTRAINT "efa_staffing_plan_audit_actor_user_id_user_id_fk" FOREIGN KEY ("actor_user_id") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "efa_staffing_plan_exception" ADD CONSTRAINT "efa_staffing_plan_exception_created_by_user_id_user_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "efa_staffing_plan_exception_audit" ADD CONSTRAINT "efa_staffing_plan_exception_audit_exception_id_efa_staffing_plan_exception_id_fk" FOREIGN KEY ("exception_id") REFERENCES "public"."efa_staffing_plan_exception"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "efa_staffing_plan_exception_audit" ADD CONSTRAINT "efa_staffing_plan_exception_audit_actor_user_id_user_id_fk" FOREIGN KEY ("actor_user_id") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;