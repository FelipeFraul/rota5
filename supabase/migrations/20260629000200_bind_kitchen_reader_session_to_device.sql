alter table public.gate_sessions
  add column if not exists reader_device_binding_hash text null;

comment on column public.gate_sessions.reader_device_binding_hash is
'SHA-256 hash of the mobile browser token that claims the kitchen QR reader.';
