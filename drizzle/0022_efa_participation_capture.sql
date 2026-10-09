ALTER TABLE "efa_observation" ADD COLUMN "record_kind" text DEFAULT 'conduct' NOT NULL;
--> statement-breakpoint
ALTER TABLE "efa_observation" ADD COLUMN "participation_level" text;
--> statement-breakpoint
ALTER TABLE "efa_observation" ALTER COLUMN "catalog_key_snapshot" DROP NOT NULL;
--> statement-breakpoint
ALTER TABLE "efa_observation" ALTER COLUMN "catalog_label_snapshot" DROP NOT NULL;
--> statement-breakpoint
ALTER TABLE "efa_observation" ALTER COLUMN "catalog_group_snapshot" DROP NOT NULL;
--> statement-breakpoint
ALTER TABLE "efa_observation" ALTER COLUMN "classification" DROP NOT NULL;
--> statement-breakpoint
ALTER TABLE "efa_observation" DROP CONSTRAINT "efa_observation_classification_allowed";
--> statement-breakpoint
ALTER TABLE "efa_observation" DROP CONSTRAINT "efa_observation_other_description_required";
--> statement-breakpoint
ALTER TABLE "efa_observation" DROP CONSTRAINT "efa_observation_text_bounds";
--> statement-breakpoint
ALTER TABLE "efa_observation" ADD CONSTRAINT "efa_observation_record_kind_allowed" CHECK ("record_kind" in ('conduct','participation'));
--> statement-breakpoint
ALTER TABLE "efa_observation" ADD CONSTRAINT "efa_observation_participation_level_allowed" CHECK (("record_kind" = 'conduct' and "participation_level" is null) or ("record_kind" = 'participation' and "participation_level" is not null and "participation_level" in ('observation_only','consultation','active_guidance','direct_leadership')));
--> statement-breakpoint
ALTER TABLE "efa_observation" ADD CONSTRAINT "efa_observation_record_shape_valid" CHECK (("record_kind" = 'conduct' and "catalog_key_snapshot" is not null and "catalog_label_snapshot" is not null and "catalog_group_snapshot" is not null and "classification" is not null and "participation_level" is null) or ("record_kind" = 'participation' and "participation_level" is not null and "catalog_item_key" is null and "catalog_key_snapshot" is null and "catalog_label_snapshot" is null and "catalog_group_snapshot" is null and "other_description" is null and "classification" is null));
--> statement-breakpoint
ALTER TABLE "efa_observation" ADD CONSTRAINT "efa_observation_classification_allowed" CHECK (("record_kind" = 'conduct' and "classification" is not null and "classification" in ('adequate','needs_improvement')) or ("record_kind" = 'participation' and "classification" is null));
--> statement-breakpoint
ALTER TABLE "efa_observation" ADD CONSTRAINT "efa_observation_other_description_required" CHECK (("record_kind" = 'participation' and "catalog_item_key" is null and "catalog_key_snapshot" is null and "other_description" is null) or ("record_kind" = 'conduct' and (("catalog_item_key" is not null and "other_description" is null) or ("catalog_item_key" is null and "catalog_key_snapshot" = 'other' and "other_description" is not null and char_length(trim("other_description")) > 0))));
--> statement-breakpoint
ALTER TABLE "efa_observation" ADD CONSTRAINT "efa_observation_text_bounds" CHECK ((("record_kind" = 'conduct' and "catalog_key_snapshot" is not null and "catalog_label_snapshot" is not null and "catalog_group_snapshot" is not null and char_length("catalog_key_snapshot") <= 100 and char_length("catalog_label_snapshot") <= 200 and char_length("catalog_group_snapshot") <= 30 and ("other_description" is null or char_length("other_description") <= 1000)) or ("record_kind" = 'participation' and "catalog_key_snapshot" is null and "catalog_label_snapshot" is null and "catalog_group_snapshot" is null and "other_description" is null)) and ("comment" is null or char_length("comment") <= 1000));
