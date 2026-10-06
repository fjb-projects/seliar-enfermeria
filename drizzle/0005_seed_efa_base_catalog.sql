DO $efa_base_catalog_system_actor$
DECLARE
  system_user_id CONSTANT text := 'system:efa-base-catalog';
  system_user_name CONSTANT text := 'Sistema de catálogo EFA';
  system_user_email CONSTANT text := 'efa-base-catalog@system.invalid';
BEGIN
  IF EXISTS (
    SELECT 1
    FROM public."user"
    WHERE id = system_user_id OR email = system_user_email
  ) THEN
    RAISE EXCEPTION 'Reserved EFA catalog system identity already exists';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.account
    WHERE user_id = system_user_id OR account_id = system_user_id
  ) OR EXISTS (
    SELECT 1 FROM public.session WHERE user_id = system_user_id
  ) OR EXISTS (
    SELECT 1 FROM public.account_access WHERE user_id = system_user_id
  ) OR EXISTS (
    SELECT 1 FROM public.account_role_grant
    WHERE user_id = system_user_id OR granted_by_user_id = system_user_id
  ) OR EXISTS (
    SELECT 1 FROM public.verification WHERE identifier = system_user_email
  ) THEN
    RAISE EXCEPTION 'Reserved EFA catalog system identity has authentication state';
  END IF;

  INSERT INTO public."user" (id, name, email, email_verified)
  VALUES (system_user_id, system_user_name, system_user_email, false);
END;
$efa_base_catalog_system_actor$;
--> statement-breakpoint
WITH inserted_bases AS (
  INSERT INTO public.efa_base (name, normalized_name, is_active, version, created_by_user_id)
  VALUES
    ('Móvil 1', 'móvil 1', true, 1, 'system:efa-base-catalog'),
    ('Móvil 2', 'móvil 2', true, 1, 'system:efa-base-catalog'),
    ('Móvil 3', 'móvil 3', true, 1, 'system:efa-base-catalog'),
    ('Móvil 4', 'móvil 4', true, 1, 'system:efa-base-catalog'),
    ('Móvil 5', 'móvil 5', true, 1, 'system:efa-base-catalog'),
    ('Móvil 6', 'móvil 6', true, 1, 'system:efa-base-catalog'),
    ('Móvil 7', 'móvil 7', true, 1, 'system:efa-base-catalog'),
    ('Móvil 9', 'móvil 9', true, 1, 'system:efa-base-catalog'),
    ('Móvil 11', 'móvil 11', true, 1, 'system:efa-base-catalog'),
    ('Móvil 12', 'móvil 12', true, 1, 'system:efa-base-catalog'),
    ('Móvil 15', 'móvil 15', true, 1, 'system:efa-base-catalog'),
    ('Móvil 26', 'móvil 26', true, 1, 'system:efa-base-catalog'),
    ('Móvil Flotante', 'móvil flotante', true, 1, 'system:efa-base-catalog'),
    ('Otro Movil no Nomenclado', 'otro movil no nomenclado', true, 1, 'system:efa-base-catalog')
  ON CONFLICT (normalized_name) DO NOTHING
  RETURNING id, name, is_active, version
)
INSERT INTO public.efa_base_audit (
  base_id,
  actor_user_id,
  action,
  version_before,
  version_after,
  before_state,
  after_state
)
SELECT
  id,
  'system:efa-base-catalog',
  'created',
  NULL,
  version,
  NULL,
  jsonb_build_object('name', name, 'isActive', is_active)
FROM inserted_bases;
