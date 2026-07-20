create table if not exists public.combo_offers (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  description text not null,
  price_cents integer not null,
  currency text not null default 'BRL',
  send_timing_type text not null default 'three_hours_before',
  send_offset_minutes integer,
  send_time_of_day time,
  send_weekdays integer[] not null default '{}'::integer[],
  status text not null default 'active',
  created_by_admin_user_id uuid references public.admin_users(id) on delete set null,
  created_by_admin_phone text,
  source_offer_id uuid references public.combo_offers(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint combo_offers_name_not_empty_check check (btrim(name) <> ''),
  constraint combo_offers_description_not_empty_check check (btrim(description) <> ''),
  constraint combo_offers_price_cents_check check (price_cents > 0),
  constraint combo_offers_currency_check check (currency = 'BRL'),
  constraint combo_offers_send_timing_type_check check (
    send_timing_type in ('three_hours_before', 'one_hour_before', 'event_day_noon', 'custom')
  ),
  constraint combo_offers_status_check check (status in ('active', 'paused', 'deleted')),
  constraint combo_offers_created_by_admin_phone_digits_check check (
    created_by_admin_phone is null or created_by_admin_phone ~ '^[0-9]+$'
  )
);

create index if not exists combo_offers_status_idx
on public.combo_offers(status);

create index if not exists combo_offers_created_at_idx
on public.combo_offers(created_at);

create table if not exists public.combo_offer_scopes (
  id uuid primary key default gen_random_uuid(),
  offer_id uuid not null references public.combo_offers(id) on delete cascade,
  scope_type text not null,
  event_id uuid references public.events(id) on delete cascade,
  weekday integer,
  created_at timestamptz not null default now(),
  constraint combo_offer_scopes_scope_type_check check (
    scope_type in ('all_events', 'event', 'weekday')
  ),
  constraint combo_offer_scopes_weekday_check check (
    weekday is null or (weekday >= 0 and weekday <= 6)
  ),
  constraint combo_offer_scopes_shape_check check (
    (scope_type = 'all_events' and event_id is null and weekday is null)
    or (scope_type = 'event' and event_id is not null and weekday is null)
    or (scope_type = 'weekday' and event_id is null and weekday is not null)
  )
);

create unique index if not exists combo_offer_scopes_all_unique_idx
on public.combo_offer_scopes(offer_id)
where scope_type = 'all_events';

create unique index if not exists combo_offer_scopes_event_unique_idx
on public.combo_offer_scopes(offer_id, event_id)
where scope_type = 'event';

create unique index if not exists combo_offer_scopes_weekday_unique_idx
on public.combo_offer_scopes(offer_id, weekday)
where scope_type = 'weekday';

create index if not exists combo_offer_scopes_offer_id_idx
on public.combo_offer_scopes(offer_id);

create index if not exists combo_offer_scopes_event_id_idx
on public.combo_offer_scopes(event_id)
where event_id is not null;

create table if not exists public.combo_orders (
  id uuid primary key default gen_random_uuid(),
  offer_id uuid references public.combo_offers(id) on delete set null,
  customer_id uuid not null references public.customers(id),
  event_id uuid not null references public.events(id),
  session_id uuid not null references public.event_sessions(id),
  source_ticket_id uuid references public.tickets(id) on delete set null,
  status text not null default 'pending_payment',
  quantity integer not null default 1,
  unit_amount_cents integer not null,
  total_amount_cents integer not null,
  currency text not null default 'BRL',
  external_reference text unique,
  checkout_token_hash text,
  checkout_expires_at timestamptz not null,
  paid_at timestamptz,
  cancelled_at timestamptz,
  raw_metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint combo_orders_status_check check (
    status in ('pending_payment', 'paid', 'cancelled', 'expired')
  ),
  constraint combo_orders_quantity_check check (quantity > 0 and quantity <= 20),
  constraint combo_orders_amounts_check check (
    unit_amount_cents > 0 and total_amount_cents = unit_amount_cents * quantity
  ),
  constraint combo_orders_currency_check check (currency = 'BRL'),
  constraint combo_orders_checkout_expires_after_created_check check (
    checkout_expires_at > created_at
  )
);

create index if not exists combo_orders_customer_id_idx
on public.combo_orders(customer_id);

create index if not exists combo_orders_event_session_idx
on public.combo_orders(event_id, session_id);

create index if not exists combo_orders_status_idx
on public.combo_orders(status);

create index if not exists combo_orders_checkout_expires_at_idx
on public.combo_orders(checkout_expires_at);

create table if not exists public.combo_payments (
  id uuid primary key default gen_random_uuid(),
  combo_order_id uuid not null references public.combo_orders(id) on delete cascade,
  provider text not null default 'mercado_pago',
  provider_payment_id text,
  provider_preference_id text,
  status text not null default 'pending',
  amount_cents integer not null,
  currency text not null default 'BRL',
  checkout_url text,
  raw_metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint combo_payments_provider_check check (provider = 'mercado_pago'),
  constraint combo_payments_status_check check (
    status in ('pending', 'approved', 'rejected', 'cancelled', 'refunded', 'expired')
  ),
  constraint combo_payments_amount_cents_check check (amount_cents >= 0),
  constraint combo_payments_currency_check check (currency = 'BRL')
);

create index if not exists combo_payments_combo_order_id_idx
on public.combo_payments(combo_order_id);

create index if not exists combo_payments_provider_payment_id_idx
on public.combo_payments(provider_payment_id)
where provider_payment_id is not null;

create index if not exists combo_payments_status_idx
on public.combo_payments(status);

create table if not exists public.combo_redemptions (
  id uuid primary key default gen_random_uuid(),
  combo_order_id uuid not null unique references public.combo_orders(id) on delete cascade,
  customer_id uuid not null references public.customers(id),
  event_id uuid not null references public.events(id),
  session_id uuid not null references public.event_sessions(id),
  offer_name text not null,
  quantity integer not null,
  qr_token_hash text not null unique,
  redemption_code text not null unique,
  status text not null default 'issued',
  issued_at timestamptz not null default now(),
  used_at timestamptz,
  cancelled_at timestamptz,
  raw_metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint combo_redemptions_offer_name_not_empty_check check (btrim(offer_name) <> ''),
  constraint combo_redemptions_quantity_check check (quantity > 0),
  constraint combo_redemptions_qr_token_hash_not_empty_check check (btrim(qr_token_hash) <> ''),
  constraint combo_redemptions_redemption_code_not_empty_check check (btrim(redemption_code) <> ''),
  constraint combo_redemptions_status_check check (status in ('issued', 'used', 'cancelled'))
);

create index if not exists combo_redemptions_customer_id_idx
on public.combo_redemptions(customer_id);

create index if not exists combo_redemptions_event_session_idx
on public.combo_redemptions(event_id, session_id);

create index if not exists combo_redemptions_status_idx
on public.combo_redemptions(status);

drop trigger if exists set_combo_offers_updated_at on public.combo_offers;
create trigger set_combo_offers_updated_at
before update on public.combo_offers
for each row execute function public.set_updated_at();

drop trigger if exists set_combo_orders_updated_at on public.combo_orders;
create trigger set_combo_orders_updated_at
before update on public.combo_orders
for each row execute function public.set_updated_at();

drop trigger if exists set_combo_payments_updated_at on public.combo_payments;
create trigger set_combo_payments_updated_at
before update on public.combo_payments
for each row execute function public.set_updated_at();

drop trigger if exists set_combo_redemptions_updated_at on public.combo_redemptions;
create trigger set_combo_redemptions_updated_at
before update on public.combo_redemptions
for each row execute function public.set_updated_at();

alter table public.combo_offers enable row level security;
alter table public.combo_offer_scopes enable row level security;
alter table public.combo_orders enable row level security;
alter table public.combo_payments enable row level security;
alter table public.combo_redemptions enable row level security;

comment on table public.combo_offers
is 'Backend/admin managed event combo offers sent to paid ticket buyers. No public table access.';

comment on table public.combo_orders
is 'Separate combo purchases. Does not alter ticket reservations, ticket orders, or gate validation.';
