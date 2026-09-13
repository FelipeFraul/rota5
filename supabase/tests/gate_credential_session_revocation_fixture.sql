\set ON_ERROR_STOP on

create table public.events (
  id uuid primary key,
  title text,
  status text not null default 'published',
  created_by_admin_user_id uuid
);
create table public.event_sessions (
  id uuid primary key,
  event_id uuid not null references public.events(id),
  starts_at timestamptz,
  status text not null default 'scheduled'
);
create table public.venue_sections (id uuid primary key, name text);
create table public.reservation_items (id uuid primary key, seat_code text);
create table public.admin_users (id uuid primary key);
create table public.gate_accesses (
  id uuid primary key,
  event_id uuid not null references public.events(id),
  session_id uuid references public.event_sessions(id),
  phone text not null,
  name text,
  passphrase_hash text not null,
  status text not null,
  created_by_admin_user_id uuid,
  created_by_admin_phone text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  revoked_at timestamptz,
  revoked_by_admin_user_id uuid
);
create table public.fixed_gate_accesses (
  id uuid primary key,
  phone text not null,
  passphrase_hash text not null,
  status text not null,
  owner_admin_user_id uuid not null,
  created_by_admin_phone text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  revoked_at timestamptz,
  revoked_by_admin_user_id uuid
);
create table public.gate_sessions (
  id uuid primary key,
  event_id uuid references public.events(id),
  session_id uuid references public.event_sessions(id),
  gate_label text,
  validator_phone text not null,
  validator_name text,
  token_hash text not null unique,
  device_binding_hash text,
  reader_device_binding_hash text,
  status text not null default 'active',
  expires_at timestamptz not null,
  created_by_admin_phone text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create table public.tickets (
  id uuid primary key,
  ticket_code text not null,
  status text not null,
  used_at timestamptz,
  session_id uuid references public.event_sessions(id),
  section_id uuid references public.venue_sections(id),
  reservation_item_id uuid references public.reservation_items(id),
  updated_at timestamptz not null default now()
);
create table public.ticket_validation_events (
  id bigint generated always as identity primary key,
  ticket_id uuid,
  ticket_code text,
  gate_session_id uuid,
  result text,
  gate_label text,
  validator_identifier text,
  metadata jsonb
);
create table public.combo_redemptions (
  id uuid primary key,
  combo_order_id uuid,
  event_id uuid not null,
  session_id uuid not null,
  redemption_code text,
  offer_name text,
  quantity integer,
  status text,
  used_at timestamptz,
  qr_token_hash text,
  raw_metadata jsonb
);
create table public.combo_redemption_events (
  id bigint generated always as identity primary key,
  combo_redemption_id uuid,
  combo_order_id uuid,
  kitchen_session_id uuid,
  result text,
  redemption_code text,
  offer_name text,
  quantity integer,
  kitchen_label text,
  validator_identifier text,
  metadata jsonb
);

-- This row exists before the migration and has no trustworthy source signal.
insert into public.gate_sessions(
  id, gate_label, validator_phone, token_hash, status, expires_at,
  created_by_admin_phone
) values (
  '60000000-0000-4000-8000-000000000000', 'Check-in', '5515000000000',
  'legacy-token-hash', 'active', now() + interval '1 hour', '5515000000000'
);

do $$ begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then create role anon; end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then create role authenticated; end if;
  if not exists (select 1 from pg_roles where rolname = 'service_role') then create role service_role; end if;
end $$;
grant usage on schema public to service_role;
grant all on all tables in schema public to service_role;
grant usage, select on all sequences in schema public to service_role;
