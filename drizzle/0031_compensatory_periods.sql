CREATE TABLE "compensatory_period" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"staff_id" uuid NOT NULL,
	"year" integer NOT NULL,
	"month" integer,
	"period_key" text NOT NULL,
	"generated_minutes" integer,
	"external_taken_minutes" integer,
	"annual_net_minutes" integer,
	"effective_date" text NOT NULL,
	"reason" text NOT NULL,
	"actor_user_id" text NOT NULL,
	"actor_name" text NOT NULL,
	"operation_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "compensatory_period_staff_year_key_unique" UNIQUE("staff_id","year","period_key"),
	CONSTRAINT "compensatory_period_operation_unique" UNIQUE("actor_user_id","operation_id"),
	CONSTRAINT "compensatory_period_year_valid" CHECK ("compensatory_period"."year" between 2000 and 9999),
	CONSTRAINT "compensatory_period_period_shape" CHECK (("compensatory_period"."month" is null and "compensatory_period"."year" in (2024, 2025) and "compensatory_period"."period_key" = 'annual' and "compensatory_period"."generated_minutes" is null and "compensatory_period"."external_taken_minutes" is null and "compensatory_period"."annual_net_minutes" is not null and "compensatory_period"."annual_net_minutes" >= 0) or ("compensatory_period"."month" between 1 and 12 and "compensatory_period"."period_key" = lpad("compensatory_period"."month"::text, 2, '0') and "compensatory_period"."generated_minutes" is not null and "compensatory_period"."generated_minutes" >= 0 and "compensatory_period"."external_taken_minutes" is not null and "compensatory_period"."external_taken_minutes" >= 0 and "compensatory_period"."annual_net_minutes" is null)),
	CONSTRAINT "compensatory_period_reason_valid" CHECK (char_length(btrim("compensatory_period"."reason")) between 1 and 1000),
	CONSTRAINT "compensatory_period_date_valid" CHECK ("compensatory_period"."effective_date" ~ '^\d{4}-\d{2}-\d{2}$')
);
--> statement-breakpoint
ALTER TABLE "compensatory_period" ADD CONSTRAINT "compensatory_period_staff_id_compensatory_staff_id_fk" FOREIGN KEY ("staff_id") REFERENCES "public"."compensatory_staff"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "compensatory_period" ADD CONSTRAINT "compensatory_period_actor_user_id_user_id_fk" FOREIGN KEY ("actor_user_id") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;
ALTER TABLE "compensatory_period" DROP CONSTRAINT "compensatory_period_staff_year_key_unique";--> statement-breakpoint
ALTER TABLE "compensatory_ledger" ADD COLUMN "compensatory_period_id" uuid;--> statement-breakpoint
ALTER TABLE "compensatory_ledger" ADD COLUMN "period_effect" text;--> statement-breakpoint
ALTER TABLE "compensatory_period" ADD COLUMN "revision" integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE "compensatory_period" ADD COLUMN "status" text DEFAULT 'active' NOT NULL;--> statement-breakpoint
ALTER TABLE "compensatory_period" ADD COLUMN "reversed_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "compensatory_period" ADD COLUMN "reversed_by_user_id" text;--> statement-breakpoint
ALTER TABLE "compensatory_period" ADD COLUMN "reversed_by_name" text;--> statement-breakpoint
ALTER TABLE "compensatory_period" ADD COLUMN "reversal_operation_id" uuid;--> statement-breakpoint
ALTER TABLE "compensatory_period" ADD COLUMN "reversal_reason" text;--> statement-breakpoint
ALTER TABLE "compensatory_ledger" ADD CONSTRAINT "compensatory_ledger_compensatory_period_id_compensatory_period_id_fk" FOREIGN KEY ("compensatory_period_id") REFERENCES "public"."compensatory_period"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "compensatory_period" ADD CONSTRAINT "compensatory_period_reversed_by_user_id_user_id_fk" FOREIGN KEY ("reversed_by_user_id") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "compensatory_ledger_period_effect_unique" ON "compensatory_ledger" USING btree ("compensatory_period_id","period_effect") WHERE "compensatory_ledger"."compensatory_period_id" is not null;--> statement-breakpoint
CREATE UNIQUE INDEX "compensatory_period_active_unique" ON "compensatory_period" USING btree ("staff_id","year","period_key") WHERE "compensatory_period"."status" = 'active';--> statement-breakpoint
ALTER TABLE "compensatory_period" ADD CONSTRAINT "compensatory_period_revision_unique" UNIQUE("staff_id","year","period_key","revision");--> statement-breakpoint
ALTER TABLE "compensatory_period" ADD CONSTRAINT "compensatory_period_reversal_operation_unique" UNIQUE("reversed_by_user_id","reversal_operation_id");--> statement-breakpoint
ALTER TABLE "compensatory_ledger" ADD CONSTRAINT "compensatory_ledger_period_effect_shape" CHECK (("compensatory_ledger"."compensatory_period_id" is null and "compensatory_ledger"."period_effect" is null) or ("compensatory_ledger"."compensatory_period_id" is not null and "compensatory_ledger"."period_effect" in ('record', 'reversal')));--> statement-breakpoint
ALTER TABLE "compensatory_period" ADD CONSTRAINT "compensatory_period_revision_positive" CHECK ("compensatory_period"."revision" > 0);--> statement-breakpoint
ALTER TABLE "compensatory_period" ADD CONSTRAINT "compensatory_period_status_allowed" CHECK ("compensatory_period"."status" in ('active', 'reversed'));--> statement-breakpoint
ALTER TABLE "compensatory_period" ADD CONSTRAINT "compensatory_period_status_shape" CHECK (("compensatory_period"."status" = 'active' and "compensatory_period"."reversed_at" is null and "compensatory_period"."reversed_by_user_id" is null and "compensatory_period"."reversed_by_name" is null and "compensatory_period"."reversal_operation_id" is null and "compensatory_period"."reversal_reason" is null) or ("compensatory_period"."status" = 'reversed' and "compensatory_period"."reversed_at" is not null and "compensatory_period"."reversed_by_user_id" is not null and "compensatory_period"."reversed_by_name" is not null and "compensatory_period"."reversal_operation_id" is not null and "compensatory_period"."reversal_reason" is not null));
