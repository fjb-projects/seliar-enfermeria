ALTER TABLE "account_audit" ADD CONSTRAINT "account_audit_state_keys_allowlisted" CHECK (("account_audit"."after_state" - 'isActive' - 'roles') = '{}'::jsonb and ("account_audit"."before_state" is null or ("account_audit"."before_state" - 'isActive' - 'roles') = '{}'::jsonb));
--> statement-breakpoint
CREATE FUNCTION public.reject_account_audit_mutation() RETURNS trigger
LANGUAGE plpgsql
AS $account_audit_append_only$
BEGIN
  RAISE EXCEPTION 'account_audit is append-only' USING ERRCODE = '55000';
END;
$account_audit_append_only$;
--> statement-breakpoint
CREATE TRIGGER account_audit_append_only_guard
BEFORE UPDATE OR DELETE ON public.account_audit
FOR EACH ROW EXECUTE FUNCTION public.reject_account_audit_mutation();
