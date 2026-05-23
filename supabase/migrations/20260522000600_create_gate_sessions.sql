-- Temporary gate access sessions for validators.
-- The raw session token is never stored; token_hash stores only a SHA-256 hash
-- of the signed token sent to the validator.
create table if not exists public.gate_sessions (
  id uuid primary key default gen_random_uuid(),
  event_id uuid references public.events(id),
  session_id uuid references public.event_sessions(id),
  gate_label text,
  validator_phone text not null,
  validator_name text,
  token_hash text not null unique,
  status text not null default 'active',
  expires_at timestamptz not null,
  created_by_admin_phone text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint gate_sessions_validator_phone_not_empty_check check (btrim(validator_phone) <> ''),
  constraint gate_sessions_validator_phone_digits_check check (validator_phone ~ '^[0-9]+$'),
  constraint gate_sessions_created_by_admin_phone_not_empty_check check (btrim(created_by_admin_phone) <> ''),
  constraint gate_sessions_created_by_admin_phone_digits_check check (created_by_admin_phone ~ '^[0-9]+$'),
  constraint gate_sessions_status_check check (status in ('active', 'revoked', 'expired')),
  constraint gate_sessions_expires_after_created_check check (expires_at > created_at)
);

create index if not exists gate_sessions_validator_phone_idx
on public.gate_sessions(validator_phone);

create index if not exists gate_sessions_status_idx
on public.gate_sessions(status);

create index if not exists gate_sessions_expires_at_idx
on public.gate_sessions(expires_at);

create index if not exists gate_sessions_session_id_idx
on public.gate_sessions(session_id);

create index if not exists gate_sessions_event_id_idx
on public.gate_sessions(event_id);

drop trigger if exists set_gate_sessions_updated_at on public.gate_sessions;
create trigger set_gate_sessions_updated_at
before update on public.gate_sessions
for each row execute function public.set_updated_at();

comment on table public.gate_sessions
is 'Temporary gate access sessions for validators. Backend service role creates and validates these sessions; raw session tokens are never stored.';

comment on column public.gate_sessions.token_hash
is 'SHA-256 hash of the signed gate session token. The raw token is sent to the validator and must not be stored.';

comment on column public.gate_sessions.status
is 'Gate session lifecycle: active, revoked, or expired.';

