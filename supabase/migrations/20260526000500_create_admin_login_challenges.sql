create table if not exists public.admin_login_challenges (
  id uuid primary key default gen_random_uuid(),
  admin_user_id uuid not null references public.admin_users(id) on delete cascade,
  phone text not null,
  link_token_hash text not null unique,
  return_code_hash text null,
  status text not null default 'pending',
  expires_at timestamptz not null,
  code_expires_at timestamptz null,
  password_verified_at timestamptz null,
  consumed_at timestamptz null,
  failed_passphrase_attempts integer not null default 0,
  failed_code_attempts integer not null default 0,
  source_hash text null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint admin_login_challenges_phone_not_empty_check check (btrim(phone) <> ''),
  constraint admin_login_challenges_phone_digits_check check (phone ~ '^[0-9]+$'),
  constraint admin_login_challenges_link_hash_not_empty_check check (btrim(link_token_hash) <> ''),
  constraint admin_login_challenges_return_code_hash_not_empty_check check (
    return_code_hash is null or btrim(return_code_hash) <> ''
  ),
  constraint admin_login_challenges_status_check check (
    status in ('pending', 'password_verified', 'consumed', 'expired', 'revoked')
  ),
  constraint admin_login_challenges_failed_passphrase_attempts_check check (
    failed_passphrase_attempts >= 0
  ),
  constraint admin_login_challenges_failed_code_attempts_check check (
    failed_code_attempts >= 0
  ),
  constraint admin_login_challenges_source_hash_not_empty_check check (
    source_hash is null or btrim(source_hash) <> ''
  )
);

create index if not exists admin_login_challenges_phone_status_idx
on public.admin_login_challenges(phone, status);

create index if not exists admin_login_challenges_admin_user_id_idx
on public.admin_login_challenges(admin_user_id);

create index if not exists admin_login_challenges_expires_at_idx
on public.admin_login_challenges(expires_at);

create index if not exists admin_login_challenges_code_expires_at_idx
on public.admin_login_challenges(code_expires_at);

drop trigger if exists set_admin_login_challenges_updated_at on public.admin_login_challenges;
create trigger set_admin_login_challenges_updated_at
before update on public.admin_login_challenges
for each row execute function public.set_updated_at();

comment on table public.admin_login_challenges
is 'One-time temporary admin web-login challenges. Stores only hashed link tokens, hashed return codes, and hashed source identifiers.';

comment on column public.admin_login_challenges.link_token_hash
is 'SHA-256 hash of the temporary web login link token. The raw token is never stored.';

comment on column public.admin_login_challenges.return_code_hash
is 'SHA-256 hash of the one-time WhatsApp return code. The raw code is never stored.';

comment on column public.admin_login_challenges.source_hash
is 'SHA-256 hash of the request source identifier when available. Raw IP/source is not stored.';

revoke all on table public.admin_login_challenges from public;
revoke all on table public.admin_login_challenges from anon;
revoke all on table public.admin_login_challenges from authenticated;
grant select, insert, update, delete on table public.admin_login_challenges to service_role;
