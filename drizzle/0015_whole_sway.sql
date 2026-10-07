ALTER TABLE "efa_staffing_plan" DROP CONSTRAINT "efa_staffing_plan_target_kind_allowed";--> statement-breakpoint
ALTER TABLE "efa_staffing_plan" DROP CONSTRAINT "efa_staffing_plan_target_identity_valid";--> statement-breakpoint
ALTER TABLE "efa_staffing_plan_exception" DROP CONSTRAINT "efa_staffing_plan_exception_target_kind_allowed";--> statement-breakpoint
ALTER TABLE "efa_staffing_plan_exception" DROP CONSTRAINT "efa_staffing_plan_exception_target_identity_valid";--> statement-breakpoint
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM "efa_staffing_plan" p
    LEFT JOIN "efa_base" b
      ON b."normalized_name" = lower(regexp_replace(normalize(btrim(p."target_name"), NFKC), '[[:space:]]+', ' ', 'g'))
    WHERE p."target_kind" = 'mobile' AND b."id" IS NULL
  ) OR EXISTS (
    SELECT 1
    FROM "efa_staffing_plan_exception" e
    LEFT JOIN "efa_base" b
      ON b."normalized_name" = lower(regexp_replace(normalize(btrim(e."target_name"), NFKC), '[[:space:]]+', ' ', 'g'))
    WHERE e."target_kind" = 'mobile' AND b."id" IS NULL
  ) THEN
    RAISE EXCEPTION 'Cannot migrate planned mobile coverage: each legacy target must match an existing efa_base catalog option by normalized name.';
  END IF;
END $$;--> statement-breakpoint
UPDATE "efa_staffing_plan" p
SET "target_kind" = 'base', "base_id" = b."id", "target_name" = b."name", "target_key" = 'base:' || b."id"::text
FROM "efa_base" b
WHERE p."target_kind" = 'mobile'
  AND b."normalized_name" = lower(regexp_replace(normalize(btrim(p."target_name"), NFKC), '[[:space:]]+', ' ', 'g'));--> statement-breakpoint
UPDATE "efa_staffing_plan_exception" e
SET "target_kind" = 'base', "base_id" = b."id", "target_name" = b."name", "target_key" = 'base:' || b."id"::text
FROM "efa_base" b
WHERE e."target_kind" = 'mobile'
  AND b."normalized_name" = lower(regexp_replace(normalize(btrim(e."target_name"), NFKC), '[[:space:]]+', ' ', 'g'));--> statement-breakpoint
ALTER TABLE "efa_staffing_plan" ALTER COLUMN "base_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "efa_staffing_plan_exception" ALTER COLUMN "base_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "efa_staffing_plan" ADD CONSTRAINT "efa_staffing_plan_target_kind_allowed" CHECK ("efa_staffing_plan"."target_kind" = 'base');--> statement-breakpoint
ALTER TABLE "efa_staffing_plan" ADD CONSTRAINT "efa_staffing_plan_target_identity_valid" CHECK ("efa_staffing_plan"."target_kind" = 'base' and "efa_staffing_plan"."base_id" is not null);--> statement-breakpoint
ALTER TABLE "efa_staffing_plan_exception" ADD CONSTRAINT "efa_staffing_plan_exception_target_kind_allowed" CHECK ("efa_staffing_plan_exception"."target_kind" = 'base');--> statement-breakpoint
ALTER TABLE "efa_staffing_plan_exception" ADD CONSTRAINT "efa_staffing_plan_exception_target_identity_valid" CHECK ("efa_staffing_plan_exception"."target_kind" = 'base' and "efa_staffing_plan_exception"."base_id" is not null);
