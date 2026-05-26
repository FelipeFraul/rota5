create table if not exists public.admin_auth_attempts (
  phone text primary key,
  sequential_failed_attempts integer not null default 0,
  locked_until timestamptz null,
  hard_locked_at timestamptz null,
  alert_level integer not null default 0,
  last_failed_at timestamptz null,
  last_success_at timestamptz null,
  last_source_hash text null,
  unlocked_at timestamptz null,
  unlocked_by_admin_user_id uuid null references public.admin_users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint admin_auth_attempts_phone_not_empty_check check (btrim(phone) <> ''),
  constraint admin_auth_attempts_phone_digits_check check (phone ~ '^[0-9]+$'),
  constraint admin_auth_attempts_sequential_failed_attempts_check check (sequential_failed_attempts >= 0),
  constraint admin_auth_attempts_alert_level_check check (alert_level in (0, 3, 5)),
  constraint admin_auth_attempts_last_source_hash_not_empty_check check (
    last_source_hash is null or btrim(last_source_hash) <> ''
  )
);

create index if not exists admin_auth_attempts_locked_until_idx
on public.admin_auth_attempts(locked_until);

create index if not exists admin_auth_attempts_hard_locked_at_idx
on public.admin_auth_attempts(hard_locked_at);

drop trigger if exists set_admin_auth_attempts_updated_at on public.admin_auth_attempts;
create trigger set_admin_auth_attempts_updated_at
before update on public.admin_auth_attempts
for each row execute function public.set_updated_at();

comment on table public.admin_auth_attempts
is 'Aggregated admin authentication lockout state by phone. Does not store raw passphrases or raw IPs.';

comment on column public.admin_auth_attempts.last_source_hash
is 'SHA-256 hash of the request source identifier when available. Raw IP/source is not stored.';

revoke all on table public.admin_auth_attempts from public;
revoke all on table public.admin_auth_attempts from anon;
revoke all on table public.admin_auth_attempts from authenticated;
grant select, insert, update, delete on table public.admin_auth_attempts to service_role;
