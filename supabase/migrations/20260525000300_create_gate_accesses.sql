-- gate_accesses stores durable check-in authorization for validator phones.
-- gate_sessions remains the temporary signed link used by the scanner page.
create table if not exists public.gate_accesses (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events(id) on delete cascade,
  session_id uuid null references public.event_sessions(id) on delete set null,
  phone text not null,
  name text null,
  passphrase_hash text not null,
  status text not null default 'active',
  created_by_admin_user_id uuid null references public.admin_users(id) on delete set null,
  created_by_admin_phone text null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  revoked_at timestamptz null,
  revoked_by_admin_user_id uuid null references public.admin_users(id) on delete set null,
  constraint gate_accesses_phone_not_empty_check check (btrim(phone) <> ''),
  constraint gate_accesses_phone_digits_check check (phone ~ '^[0-9]+$'),
  constraint gate_accesses_passphrase_hash_not_empty_check check (btrim(passphrase_hash) <> ''),
  constraint gate_accesses_created_by_admin_phone_digits_check check (
    created_by_admin_phone is null or created_by_admin_phone ~ '^[0-9]+$'
  ),
  constraint gate_accesses_status_check check (status in ('active', 'paused', 'revoked'))
);

create index if not exists gate_accesses_event_id_idx
on public.gate_accesses(event_id);

create index if not exists gate_accesses_phone_idx
on public.gate_accesses(phone);

create index if not exists gate_accesses_status_idx
on public.gate_accesses(status);

create unique index if not exists gate_accesses_event_phone_open_unique_idx
on public.gate_accesses(event_id, phone)
where status in ('active', 'paused');

drop trigger if exists set_gate_accesses_updated_at on public.gate_accesses;
create trigger set_gate_accesses_updated_at
before update on public.gate_accesses
for each row execute function public.set_updated_at();

comment on table public.gate_accesses
is 'Durable check-in authorizations for validator phones. Passphrases are stored only as hashes.';

comment on column public.gate_accesses.passphrase_hash
is 'PBKDF2 hash of the validator passphrase. Raw passphrase is never stored.';

comment on column public.gate_accesses.status
is 'active allows check-in login, paused disables login without deleting history, revoked is permanently disabled.';

revoke all on table public.gate_accesses from public;
revoke all on table public.gate_accesses from anon;
revoke all on table public.gate_accesses from authenticated;
grant all on table public.gate_accesses to service_role;
