alter table public.gate_sessions
  add column if not exists device_binding_hash text null;

comment on column public.gate_sessions.device_binding_hash is
'SHA-256 hash of the first browser device token that claims a kitchen session.';
