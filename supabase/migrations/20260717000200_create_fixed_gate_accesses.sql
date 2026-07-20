-- fixed_gate_accesses stores reusable validator credentials that are scoped
-- to the events owned by the admin who created the credential.
create table if not exists public.fixed_gate_accesses (
  id uuid primary key default gen_random_uuid(),
  phone text not null,
  passphrase_hash text not null,
  status text not null default 'active',
  owner_admin_user_id uuid not null references public.admin_users(id) on delete cascade,
  created_by_admin_phone text null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  revoked_at timestamptz null,
  revoked_by_admin_user_id uuid null references public.admin_users(id) on delete set null,
  constraint fixed_gate_accesses_phone_not_empty_check check (btrim(phone) <> ''),
  constraint fixed_gate_accesses_phone_digits_check check (phone ~ '^[0-9]+$'),
  constraint fixed_gate_accesses_passphrase_hash_not_empty_check check (
    btrim(passphrase_hash) <> ''
  ),
  constraint fixed_gate_accesses_created_by_admin_phone_digits_check check (
    created_by_admin_phone is null or created_by_admin_phone ~ '^[0-9]+$'
  ),
  constraint fixed_gate_accesses_status_check check (status in ('active', 'revoked'))
);

create index if not exists fixed_gate_accesses_owner_admin_user_id_idx
on public.fixed_gate_accesses(owner_admin_user_id);

create index if not exists fixed_gate_accesses_phone_idx
on public.fixed_gate_accesses(phone);

create unique index if not exists fixed_gate_accesses_active_phone_unique_idx
on public.fixed_gate_accesses(phone)
where status = 'active';

drop trigger if exists set_fixed_gate_accesses_updated_at on public.fixed_gate_accesses;
create trigger set_fixed_gate_accesses_updated_at
before update on public.fixed_gate_accesses
for each row execute function public.set_updated_at();

comment on table public.fixed_gate_accesses
is 'Reusable gate credentials. Each credential can access only published events owned by owner_admin_user_id.';

comment on column public.fixed_gate_accesses.passphrase_hash
is 'PBKDF2 hash of the fixed gate passphrase. The raw passphrase is never stored.';

alter table public.fixed_gate_accesses enable row level security;

revoke all on table public.fixed_gate_accesses from public;
revoke all on table public.fixed_gate_accesses from anon;
revoke all on table public.fixed_gate_accesses from authenticated;
grant all on table public.fixed_gate_accesses to service_role;
