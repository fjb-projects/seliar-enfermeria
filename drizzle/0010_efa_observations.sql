CREATE TABLE "efa_observation" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_user_id" text NOT NULL,
	"guard_id" uuid NOT NULL,
	"episode_id" uuid,
	"context_type" text NOT NULL,
	"communication_id" uuid,
	"dispatch_id" uuid,
	"coordination_id" uuid,
	"police_event_id" uuid,
	"catalog_item_key" text,
	"catalog_key_snapshot" text NOT NULL,
	"catalog_label_snapshot" text NOT NULL,
	"catalog_group_snapshot" text NOT NULL,
	"other_description" text,
	"classification" text NOT NULL,
	"comment" text,
	"observed_at" timestamp with time zone,
	"client_creation_key" uuid NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "efa_observation_id_owner_unique" UNIQUE("id","owner_user_id"),
	CONSTRAINT "efa_observation_owner_creation_key_unique" UNIQUE("owner_user_id","client_creation_key"),
	CONSTRAINT "efa_observation_context_allowed" CHECK ("efa_observation"."context_type" in ('guard','episode','communication','dispatch','coordination','police_event')),
	CONSTRAINT "efa_observation_exactly_one_context" CHECK (("efa_observation"."context_type" = 'guard' and "efa_observation"."episode_id" is null and "efa_observation"."communication_id" is null and "efa_observation"."dispatch_id" is null and "efa_observation"."coordination_id" is null and "efa_observation"."police_event_id" is null) or ("efa_observation"."context_type" = 'episode' and "efa_observation"."episode_id" is not null and "efa_observation"."communication_id" is null and "efa_observation"."dispatch_id" is null and "efa_observation"."coordination_id" is null and "efa_observation"."police_event_id" is null) or ("efa_observation"."context_type" = 'communication' and "efa_observation"."episode_id" is not null and "efa_observation"."communication_id" is not null and "efa_observation"."dispatch_id" is null and "efa_observation"."coordination_id" is null and "efa_observation"."police_event_id" is null) or ("efa_observation"."context_type" = 'dispatch' and "efa_observation"."episode_id" is not null and "efa_observation"."communication_id" is null and "efa_observation"."dispatch_id" is not null and "efa_observation"."coordination_id" is null and "efa_observation"."police_event_id" is null) or ("efa_observation"."context_type" = 'coordination' and "efa_observation"."episode_id" is not null and "efa_observation"."communication_id" is null and "efa_observation"."dispatch_id" is null and "efa_observation"."coordination_id" is not null and "efa_observation"."police_event_id" is null) or ("efa_observation"."context_type" = 'police_event' and "efa_observation"."episode_id" is not null and "efa_observation"."communication_id" is null and "efa_observation"."dispatch_id" is null and "efa_observation"."coordination_id" is not null and "efa_observation"."police_event_id" is not null)),
	CONSTRAINT "efa_observation_classification_allowed" CHECK ("efa_observation"."classification" in ('adequate','needs_improvement')),
	CONSTRAINT "efa_observation_other_description_required" CHECK (("efa_observation"."catalog_item_key" is not null and "efa_observation"."other_description" is null) or ("efa_observation"."catalog_item_key" is null and "efa_observation"."catalog_key_snapshot" = 'other' and "efa_observation"."other_description" is not null and char_length(trim("efa_observation"."other_description")) > 0)),
	CONSTRAINT "efa_observation_text_bounds" CHECK (char_length("efa_observation"."catalog_key_snapshot") <= 100 and char_length("efa_observation"."catalog_label_snapshot") <= 200 and char_length("efa_observation"."catalog_group_snapshot") <= 30 and ("efa_observation"."other_description" is null or char_length("efa_observation"."other_description") <= 1000) and ("efa_observation"."comment" is null or char_length("efa_observation"."comment") <= 1000)),
	CONSTRAINT "efa_observation_version_positive" CHECK ("efa_observation"."version" > 0)
);
--> statement-breakpoint
CREATE TABLE "efa_observation_audit" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"observation_id" uuid NOT NULL,
	"owner_user_id" text NOT NULL,
	"actor_user_id" text NOT NULL,
	"operation_id" uuid NOT NULL,
	"action" text NOT NULL,
	"version_before" integer,
	"version_after" integer NOT NULL,
	"before_state" jsonb,
	"after_state" jsonb NOT NULL,
	"occurred_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "efa_observation_audit_version_unique" UNIQUE("observation_id","version_after"),
	CONSTRAINT "efa_observation_audit_operation_unique" UNIQUE("observation_id","operation_id"),
	CONSTRAINT "efa_observation_audit_id_scope_unique" UNIQUE("id","observation_id"),
	CONSTRAINT "efa_observation_audit_action_allowed" CHECK ("efa_observation_audit"."action" in ('created','updated')),
	CONSTRAINT "efa_observation_audit_version_transition_valid" CHECK (("efa_observation_audit"."version_before" is null and "efa_observation_audit"."version_after" = 1) or ("efa_observation_audit"."version_before" > 0 and "efa_observation_audit"."version_after" = "efa_observation_audit"."version_before" + 1)),
	CONSTRAINT "efa_observation_audit_state_objects" CHECK (jsonb_typeof("efa_observation_audit"."after_state") = 'object' and ("efa_observation_audit"."before_state" is null or jsonb_typeof("efa_observation_audit"."before_state") = 'object'))
);
--> statement-breakpoint
CREATE TABLE "efa_observation_catalog" (
	"key" text PRIMARY KEY NOT NULL,
	"label" text NOT NULL,
	"group" text NOT NULL,
	"competency_reference" text,
	"is_active" boolean DEFAULT true NOT NULL,
	CONSTRAINT "efa_observation_catalog_group_allowed" CHECK ("efa_observation_catalog"."group" in ('phone','radio','coordination','duty','record')),
	CONSTRAINT "efa_observation_catalog_key_label_nonempty" CHECK (char_length("efa_observation_catalog"."key") > 0 and char_length("efa_observation_catalog"."label") > 0)
);
--> statement-breakpoint
CREATE TABLE "efa_observation_notice" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"observation_id" uuid NOT NULL,
	"owner_user_id" text NOT NULL,
	"audit_id" uuid NOT NULL,
	"recipient_user_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"read_at" timestamp with time zone,
	CONSTRAINT "efa_observation_notice_audit_recipient_unique" UNIQUE("audit_id","recipient_user_id"),
	CONSTRAINT "efa_observation_notice_recipient_is_owner" CHECK ("efa_observation_notice"."recipient_user_id" = "efa_observation_notice"."owner_user_id")
);
--> statement-breakpoint
CREATE TABLE "efa_observation_operation" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"observation_id" uuid NOT NULL,
	"owner_user_id" text NOT NULL,
	"actor_user_id" text NOT NULL,
	"client_operation_id" uuid NOT NULL,
	"action" text NOT NULL,
	"request_hash" text NOT NULL,
	"applied_version" integer NOT NULL,
	"changed" boolean NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "efa_observation_operation_client_unique" UNIQUE("observation_id","client_operation_id"),
	CONSTRAINT "efa_observation_operation_action_allowed" CHECK ("efa_observation_operation"."action" in ('created','updated')),
	CONSTRAINT "efa_observation_operation_hash_sha256" CHECK ("efa_observation_operation"."request_hash" ~ '^[0-9a-f]{64}$'),
	CONSTRAINT "efa_observation_operation_version_positive" CHECK ("efa_observation_operation"."applied_version" > 0)
);
--> statement-breakpoint
ALTER TABLE "efa_observation" ADD CONSTRAINT "efa_observation_owner_user_id_user_id_fk" FOREIGN KEY ("owner_user_id") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "efa_observation" ADD CONSTRAINT "efa_observation_guard_owner_fk" FOREIGN KEY ("guard_id","owner_user_id") REFERENCES "public"."efa_guard"("id","owner_user_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "efa_episode" ADD CONSTRAINT "efa_episode_id_guard_owner_unique" UNIQUE("id","origin_guard_id","owner_user_id");--> statement-breakpoint
ALTER TABLE "efa_observation" ADD CONSTRAINT "efa_observation_episode_guard_owner_fk" FOREIGN KEY ("episode_id","guard_id","owner_user_id") REFERENCES "public"."efa_episode"("id","origin_guard_id","owner_user_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "efa_observation" ADD CONSTRAINT "efa_observation_communication_scope_fk" FOREIGN KEY ("communication_id","episode_id","owner_user_id") REFERENCES "public"."efa_communication"("id","episode_id","owner_user_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "efa_observation" ADD CONSTRAINT "efa_observation_dispatch_scope_fk" FOREIGN KEY ("dispatch_id","episode_id","owner_user_id") REFERENCES "public"."efa_dispatch"("id","episode_id","owner_user_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "efa_observation" ADD CONSTRAINT "efa_observation_coordination_scope_fk" FOREIGN KEY ("coordination_id","episode_id","owner_user_id") REFERENCES "public"."efa_police_coordination"("id","episode_id","owner_user_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "efa_observation" ADD CONSTRAINT "efa_observation_police_event_scope_fk" FOREIGN KEY ("police_event_id","coordination_id","owner_user_id") REFERENCES "public"."efa_police_coordination_event"("id","coordination_id","owner_user_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "efa_observation" ADD CONSTRAINT "efa_observation_catalog_item_fk" FOREIGN KEY ("catalog_item_key") REFERENCES "public"."efa_observation_catalog"("key") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "efa_observation_audit" ADD CONSTRAINT "efa_observation_audit_actor_user_id_user_id_fk" FOREIGN KEY ("actor_user_id") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "efa_observation_audit" ADD CONSTRAINT "efa_observation_audit_owner_fk" FOREIGN KEY ("observation_id","owner_user_id") REFERENCES "public"."efa_observation"("id","owner_user_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "efa_observation_notice" ADD CONSTRAINT "efa_observation_notice_recipient_user_id_user_id_fk" FOREIGN KEY ("recipient_user_id") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "efa_observation_notice" ADD CONSTRAINT "efa_observation_notice_owner_fk" FOREIGN KEY ("observation_id","owner_user_id") REFERENCES "public"."efa_observation"("id","owner_user_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "efa_observation_notice" ADD CONSTRAINT "efa_observation_notice_audit_fk" FOREIGN KEY ("audit_id","observation_id") REFERENCES "public"."efa_observation_audit"("id","observation_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "efa_observation_operation" ADD CONSTRAINT "efa_observation_operation_actor_user_id_user_id_fk" FOREIGN KEY ("actor_user_id") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "efa_observation_operation" ADD CONSTRAINT "efa_observation_operation_owner_fk" FOREIGN KEY ("observation_id","owner_user_id") REFERENCES "public"."efa_observation"("id","owner_user_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
INSERT INTO efa_observation_catalog (key, label, "group", competency_reference) VALUES
('phone.early_location', 'Ubicación temprana', 'phone', 'A1 (parcial)'),
('phone.repeat_confirmation', 'Confirmación por repetición', 'phone', 'A3 (parcial)'),
('phone.contact_details', 'Datos de contacto', 'phone', 'A1 (parcial)'),
('phone.motive_questions', 'Preguntas para comprender el motivo', 'phone', 'A1 (parcial)'),
('phone.explain_questions', 'Explica por qué pregunta', 'phone', 'A4 (parcial)'),
('phone.clear_language', 'Lenguaje comprensible', 'phone', 'A4 (parcial)'),
('phone.stepwise_prearrival', 'Instrucciones prearribo paso a paso', 'phone', NULL),
('phone.check_understanding', 'Verifica comprensión', 'phone', NULL),
('radio.location_service_data', 'Ubicación y datos del servicio', 'radio', 'B1 (parcial)'),
('radio.priority', 'Prioridad comunicada', 'radio', 'B1 (parcial)'),
('radio.receipt_confirmation', 'Confirma recepción', 'radio', 'B2 (parcial)'),
('radio.clear_language', 'Lenguaje claro', 'radio', 'B2 (parcial)'),
('radio.new_information', 'Comunica novedades', 'radio', 'B3 (parcial)'),
('radio.status_followup', 'Seguimiento del estado', 'radio', 'B3 (parcial)'),
('coordination.request_intervention', 'Solicita intervención', 'coordination', 'C2 (parcial)'),
('coordination.location_reason', 'Comunica ubicación y motivo', 'coordination', 'C2 (parcial)'),
('coordination.response_confirmation', 'Confirma recepción/respuesta', 'coordination', 'C5 (parcial)'),
('coordination.updates', 'Comunica novedades', 'coordination', 'C5 (parcial)'),
('duty.handover_pending', 'Comunica pendientes al relevo', 'duty', 'E3 (parcial)'),
('duty.collaboration_request', 'Pide colaboración', 'duty', 'E2 (parcial)'),
('duty.phone_radio_continuity', 'Preserva información entre teléfono y radio', 'duty', 'E3 (parcial)'),
('record.complete_fields', 'Completa datos', 'record', 'D1 (parcial; si EFA puede inspeccionar el registro)'),
('record.update_new_information', 'Actualiza ante novedades', 'record', 'C5 (parcial; si EFA puede inspeccionar el registro)'),
('record.document_agreements', 'Deja constancia de acuerdos', 'record', 'C5 (parcial; si EFA puede inspeccionar el registro)')
ON CONFLICT (key) DO NOTHING;--> statement-breakpoint
CREATE FUNCTION reject_efa_observation_history_mutation() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'EFA observation history and receipts are append-only'; END; $$;--> statement-breakpoint
CREATE TRIGGER efa_observation_audit_append_only BEFORE UPDATE OR DELETE ON efa_observation_audit FOR EACH ROW EXECUTE FUNCTION reject_efa_observation_history_mutation();--> statement-breakpoint
CREATE TRIGGER efa_observation_operation_append_only BEFORE UPDATE OR DELETE ON efa_observation_operation FOR EACH ROW EXECUTE FUNCTION reject_efa_observation_history_mutation();
