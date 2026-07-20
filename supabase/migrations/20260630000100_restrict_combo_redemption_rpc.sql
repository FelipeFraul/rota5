-- SECURITY: PostgREST roles must never invoke the security-definer redemption
-- function directly. Validation is only allowed through the trusted backend,
-- which authenticates and binds the kitchen reader session first.
revoke all on function public.validate_combo_redemption(
  uuid,
  text,
  uuid,
  text,
  text,
  uuid,
  uuid,
  jsonb
) from public, anon, authenticated;

grant execute on function public.validate_combo_redemption(
  uuid,
  text,
  uuid,
  text,
  text,
  uuid,
  uuid,
  jsonb
) to service_role;

comment on function public.validate_combo_redemption(
  uuid,
  text,
  uuid,
  text,
  text,
  uuid,
  uuid,
  jsonb
)
is 'Backend-only atomic combo redemption. Direct anon/authenticated execution is forbidden.';
