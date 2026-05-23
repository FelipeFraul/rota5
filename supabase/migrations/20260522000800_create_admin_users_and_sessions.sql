-- Backend-only WhatsApp admin foundation.
-- Admin passphrases are never stored here; authentication uses server env secrets.
create table if not exists public.admin_users (
  id uuid primary key default gen_random_uuid(),
  phone text not null unique,
  role text not null,
  status text not null default 'active',
  name text,
  created_by_admin_phone text,
  last_login_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint admin_users_phone_not_empty_check check (btrim(phone) <> ''),
  constraint admin_users_phone_digits_check check (phone ~ '^[0-9]+$'),
  constraint admin_users_created_by_admin_phone_digits_check check (
    created_by_admin_phone is null or created_by_admin_phone ~ '^[0-9]+$'
  ),
  constraint admin_users_role_check check (
    role in ('root', 'admin', 'operator', 'gate', 'support')
  ),
  constraint admin_users_status_check check (status in ('active', 'disabled'))
);

create table if not exists public.admin_sessions (
  id uuid primary key default gen_random_uuid(),
  admin_user_id uuid not null references public.admin_users(id),
  phone text not null,
  status text not null default 'active',
  expires_at timestamptz not null,
  created_at timestamptz not null default now(),
  last_used_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  constraint admin_sessions_phone_not_empty_check check (btrim(phone) <> ''),
  constraint admin_sessions_phone_digits_check check (phone ~ '^[0-9]+$'),
  constraint admin_sessions_status_check check (
    status in ('active', 'expired', 'revoked')
  ),
  constraint admin_sessions_expires_after_created_check check (expires_at > created_at)
);

create index if not exists admin_users_phone_idx
on public.admin_users(phone);

create index if not exists admin_users_status_idx
on public.admin_users(status);

create index if not exists admin_users_role_idx
on public.admin_users(role);

create index if not exists admin_sessions_phone_idx
on public.admin_sessions(phone);

create index if not exists admin_sessions_status_idx
on public.admin_sessions(status);

create index if not exists admin_sessions_expires_at_idx
on public.admin_sessions(expires_at);

create index if not exists admin_sessions_admin_user_id_idx
on public.admin_sessions(admin_user_id);

drop trigger if exists set_admin_users_updated_at on public.admin_users;
create trigger set_admin_users_updated_at
before update on public.admin_users
for each row execute function public.set_updated_at();

comment on table public.admin_users
is 'Backend-only WhatsApp admin users. Root users may be bootstrapped only from ADMIN_ROOT_WHATSAPP_PHONES.';

comment on table public.admin_sessions
is 'Temporary backend admin sessions created after passphrase authentication. No passphrase or raw secret is stored.';

comment on column public.admin_sessions.metadata
is 'Minimal non-sensitive metadata for admin session auditing.';
