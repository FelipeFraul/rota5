create extension if not exists pgcrypto;
create extension if not exists unaccent;

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- WhatsApp phones must be stored normalized with digits only.
create table public.customers (
  id uuid primary key default gen_random_uuid(),
  whatsapp_phone text not null unique,
  name text,
  document_number text,
  email text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint customers_whatsapp_phone_not_empty_check check (btrim(whatsapp_phone) <> ''),
  constraint customers_whatsapp_phone_digits_check check (whatsapp_phone ~ '^[0-9]+$')
);

create table public.conversations (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references public.customers(id),
  status text not null default 'open',
  context jsonb not null default '{}'::jsonb,
  last_message_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint conversations_status_check check (status in ('open', 'closed'))
);

create index conversations_customer_id_idx on public.conversations(customer_id);
create index conversations_status_idx on public.conversations(status);
create index conversations_last_message_at_idx on public.conversations(last_message_at);

create table public.whatsapp_messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid references public.conversations(id),
  customer_id uuid references public.customers(id),
  direction text not null,
  message_type text not null default 'text',
  body text,
  provider_message_id text,
  raw_metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  constraint whatsapp_messages_direction_check check (direction in ('inbound', 'outbound')),
  constraint whatsapp_messages_message_type_check check (message_type in ('text', 'image', 'document', 'system'))
);

create index whatsapp_messages_conversation_id_idx on public.whatsapp_messages(conversation_id);
create index whatsapp_messages_customer_id_idx on public.whatsapp_messages(customer_id);
create index whatsapp_messages_provider_message_id_idx on public.whatsapp_messages(provider_message_id);
create index whatsapp_messages_created_at_idx on public.whatsapp_messages(created_at);

create table public.venues (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  city text not null,
  state text not null,
  address text,
  timezone text not null default 'America/Sao_Paulo',
  status text not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint venues_name_not_empty_check check (btrim(name) <> ''),
  constraint venues_city_not_empty_check check (btrim(city) <> ''),
  constraint venues_state_not_empty_check check (btrim(state) <> ''),
  constraint venues_status_check check (status in ('active', 'inactive'))
);

create index venues_city_idx on public.venues(city);
create index venues_state_idx on public.venues(state);
create index venues_status_idx on public.venues(status);

create table public.venue_sections (
  id uuid primary key default gen_random_uuid(),
  venue_id uuid not null references public.venues(id),
  name text not null,
  slug text not null,
  description text,
  capacity integer,
  has_numbered_seats boolean not null default true,
  sort_order integer not null default 0,
  status text not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint venue_sections_name_not_empty_check check (btrim(name) <> ''),
  constraint venue_sections_slug_not_empty_check check (btrim(slug) <> ''),
  constraint venue_sections_capacity_positive_check check (capacity is null or capacity > 0),
  constraint venue_sections_status_check check (status in ('active', 'inactive')),
  constraint venue_sections_venue_id_slug_key unique (venue_id, slug)
);

create index venue_sections_venue_id_idx on public.venue_sections(venue_id);
create index venue_sections_status_idx on public.venue_sections(status);

create table public.seats (
  id uuid primary key default gen_random_uuid(),
  venue_id uuid not null references public.venues(id),
  section_id uuid not null references public.venue_sections(id),
  row_label text,
  seat_number text not null,
  seat_code text not null,
  map_x numeric,
  map_y numeric,
  status text not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint seats_seat_number_not_empty_check check (btrim(seat_number) <> ''),
  constraint seats_seat_code_not_empty_check check (btrim(seat_code) <> ''),
  constraint seats_status_check check (status in ('active', 'inactive', 'blocked')),
  constraint seats_section_id_seat_code_key unique (section_id, seat_code)
);

create index seats_venue_id_idx on public.seats(venue_id);
create index seats_section_id_idx on public.seats(section_id);
create index seats_seat_code_idx on public.seats(seat_code);
create index seats_status_idx on public.seats(status);

create table public.events (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  artist_name text not null,
  description text,
  city text not null,
  state text not null,
  venue_id uuid references public.venues(id),
  status text not null default 'draft',
  search_text text generated always as (
    lower(
      title || ' ' || artist_name || ' ' || city || ' ' || state
    )
  ) stored,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint events_title_not_empty_check check (btrim(title) <> ''),
  constraint events_artist_name_not_empty_check check (btrim(artist_name) <> ''),
  constraint events_city_not_empty_check check (btrim(city) <> ''),
  constraint events_state_not_empty_check check (btrim(state) <> ''),
  constraint events_status_check check (status in ('draft', 'published', 'cancelled', 'finished'))
);

create index events_artist_name_idx on public.events(artist_name);
create index events_artist_name_lower_idx on public.events(lower(artist_name));
create index events_city_idx on public.events(city);
create index events_city_lower_idx on public.events(lower(city));
create index events_state_idx on public.events(state);
create index events_status_idx on public.events(status);
create index events_search_text_idx on public.events(search_text);
create index events_venue_id_idx on public.events(venue_id);

create table public.event_sessions (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events(id),
  venue_id uuid references public.venues(id),
  starts_at timestamptz not null,
  gates_open_at timestamptz,
  timezone text not null default 'America/Sao_Paulo',
  status text not null default 'scheduled',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint event_sessions_status_check check (
    status in ('scheduled', 'sales_open', 'sales_closed', 'cancelled', 'finished')
  )
);

create index event_sessions_event_id_idx on public.event_sessions(event_id);
create index event_sessions_starts_at_idx on public.event_sessions(starts_at);
create index event_sessions_status_idx on public.event_sessions(status);
create index event_sessions_venue_id_idx on public.event_sessions(venue_id);

-- session_seats is the source of truth for seat availability in each event session.
-- current_reservation_id and sold_ticket_id are intentionally nullable references without FKs here.
-- Future RPCs will maintain their operational integrity without creating circular dependencies.
create table public.session_seats (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.event_sessions(id),
  seat_id uuid not null references public.seats(id),
  section_id uuid not null references public.venue_sections(id),
  status text not null default 'available',
  current_reservation_id uuid,
  sold_ticket_id uuid,
  blocked_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint session_seats_status_check check (status in ('available', 'reserved', 'sold', 'blocked')),
  constraint session_seats_session_id_seat_id_key unique (session_id, seat_id)
);

create index session_seats_session_id_idx on public.session_seats(session_id);
create index session_seats_section_id_idx on public.session_seats(section_id);
create index session_seats_status_idx on public.session_seats(status);
create index session_seats_current_reservation_id_idx on public.session_seats(current_reservation_id);
create index session_seats_sold_ticket_id_idx on public.session_seats(sold_ticket_id);

create table public.ticket_prices (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.event_sessions(id),
  section_id uuid not null references public.venue_sections(id),
  ticket_type text not null,
  label text not null,
  price_cents integer not null,
  fee_cents integer not null default 0,
  currency text not null default 'BRL',
  sales_start_at timestamptz,
  sales_end_at timestamptz,
  status text not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint ticket_prices_ticket_type_check check (ticket_type in ('full', 'half', 'promotional', 'free')),
  constraint ticket_prices_label_not_empty_check check (btrim(label) <> ''),
  constraint ticket_prices_price_cents_check check (price_cents >= 0),
  constraint ticket_prices_fee_cents_check check (fee_cents >= 0),
  constraint ticket_prices_currency_check check (currency = 'BRL'),
  constraint ticket_prices_status_check check (status in ('active', 'inactive')),
  constraint ticket_prices_session_section_type_key unique (session_id, section_id, ticket_type)
);

create index ticket_prices_session_id_idx on public.ticket_prices(session_id);
create index ticket_prices_section_id_idx on public.ticket_prices(section_id);
create index ticket_prices_status_idx on public.ticket_prices(status);

-- reservations are temporary holds and will be expired by a future RPC.
create table public.reservations (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references public.customers(id),
  conversation_id uuid references public.conversations(id),
  session_id uuid not null references public.event_sessions(id),
  status text not null default 'active',
  expires_at timestamptz not null,
  total_amount_cents integer not null default 0,
  total_fee_cents integer not null default 0,
  currency text not null default 'BRL',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint reservations_status_check check (status in ('active', 'expired', 'cancelled', 'paid')),
  constraint reservations_total_amount_cents_check check (total_amount_cents >= 0),
  constraint reservations_total_fee_cents_check check (total_fee_cents >= 0),
  constraint reservations_currency_check check (currency = 'BRL'),
  constraint reservations_expires_after_created_check check (expires_at > created_at)
);

create index reservations_customer_id_idx on public.reservations(customer_id);
create index reservations_conversation_id_idx on public.reservations(conversation_id);
create index reservations_session_id_idx on public.reservations(session_id);
create index reservations_status_idx on public.reservations(status);
create index reservations_expires_at_idx on public.reservations(expires_at);

-- reservation_items freeze seat and price data at reservation time.
create table public.reservation_items (
  id uuid primary key default gen_random_uuid(),
  reservation_id uuid not null references public.reservations(id) on delete cascade,
  session_seat_id uuid not null references public.session_seats(id),
  seat_id uuid not null references public.seats(id),
  section_id uuid not null references public.venue_sections(id),
  ticket_price_id uuid references public.ticket_prices(id),
  seat_code text not null,
  ticket_type text not null,
  price_cents integer not null,
  fee_cents integer not null default 0,
  currency text not null default 'BRL',
  created_at timestamptz not null default now(),
  constraint reservation_items_seat_code_not_empty_check check (btrim(seat_code) <> ''),
  constraint reservation_items_ticket_type_check check (ticket_type in ('full', 'half', 'promotional', 'free')),
  constraint reservation_items_price_cents_check check (price_cents >= 0),
  constraint reservation_items_fee_cents_check check (fee_cents >= 0),
  constraint reservation_items_currency_check check (currency = 'BRL'),
  constraint reservation_items_reservation_session_seat_key unique (reservation_id, session_seat_id)
);

create index reservation_items_reservation_id_idx on public.reservation_items(reservation_id);
create index reservation_items_session_seat_id_idx on public.reservation_items(session_seat_id);
create index reservation_items_seat_id_idx on public.reservation_items(seat_id);
create index reservation_items_section_id_idx on public.reservation_items(section_id);

create table public.orders (
  id uuid primary key default gen_random_uuid(),
  reservation_id uuid not null unique references public.reservations(id),
  customer_id uuid not null references public.customers(id),
  status text not null default 'pending_payment',
  total_amount_cents integer not null default 0,
  total_fee_cents integer not null default 0,
  currency text not null default 'BRL',
  external_reference text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint orders_status_check check (
    status in ('draft', 'pending_payment', 'paid', 'cancelled', 'expired', 'refunded')
  ),
  constraint orders_total_amount_cents_check check (total_amount_cents >= 0),
  constraint orders_total_fee_cents_check check (total_fee_cents >= 0),
  constraint orders_currency_check check (currency = 'BRL')
);

create index orders_customer_id_idx on public.orders(customer_id);
create index orders_status_idx on public.orders(status);
create index orders_external_reference_idx on public.orders(external_reference);

create table public.payments (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id),
  provider text not null default 'mercado_pago',
  provider_payment_id text,
  provider_preference_id text,
  status text not null default 'pending',
  amount_cents integer not null,
  currency text not null default 'BRL',
  checkout_url text,
  paid_at timestamptz,
  raw_metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint payments_provider_check check (provider = 'mercado_pago'),
  constraint payments_status_check check (
    status in ('pending', 'approved', 'rejected', 'cancelled', 'refunded', 'expired')
  ),
  constraint payments_amount_cents_check check (amount_cents >= 0),
  constraint payments_currency_check check (currency = 'BRL')
);

create index payments_order_id_idx on public.payments(order_id);
create index payments_provider_idx on public.payments(provider);
create index payments_provider_payment_id_idx on public.payments(provider_payment_id);
create index payments_provider_preference_id_idx on public.payments(provider_preference_id);
create index payments_status_idx on public.payments(status);

create table public.payment_events (
  id uuid primary key default gen_random_uuid(),
  provider text not null default 'mercado_pago',
  event_key text not null,
  event_type text,
  provider_payment_id text,
  raw_metadata jsonb not null default '{}'::jsonb,
  received_at timestamptz not null default now(),
  processed_at timestamptz,
  constraint payment_events_provider_check check (provider = 'mercado_pago'),
  constraint payment_events_event_key_not_empty_check check (btrim(event_key) <> ''),
  constraint payment_events_provider_event_key_key unique (provider, event_key)
);

create index payment_events_provider_payment_id_idx on public.payment_events(provider_payment_id);
create index payment_events_received_at_idx on public.payment_events(received_at);
create index payment_events_processed_at_idx on public.payment_events(processed_at);

-- tickets are created only after approved payment confirmation.
-- qr_token_hash must store a hash only, never the raw QR token.
create table public.tickets (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id),
  reservation_item_id uuid not null unique references public.reservation_items(id),
  customer_id uuid not null references public.customers(id),
  session_id uuid not null references public.event_sessions(id),
  seat_id uuid not null references public.seats(id),
  section_id uuid not null references public.venue_sections(id),
  ticket_code text not null unique,
  qr_token_hash text not null unique,
  status text not null default 'issued',
  issued_at timestamptz not null default now(),
  used_at timestamptz,
  cancelled_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint tickets_ticket_code_not_empty_check check (btrim(ticket_code) <> ''),
  constraint tickets_qr_token_hash_not_empty_check check (btrim(qr_token_hash) <> ''),
  constraint tickets_status_check check (status in ('issued', 'used', 'cancelled'))
);

create index tickets_order_id_idx on public.tickets(order_id);
create index tickets_customer_id_idx on public.tickets(customer_id);
create index tickets_session_id_idx on public.tickets(session_id);
create index tickets_status_idx on public.tickets(status);

create table public.ticket_validation_events (
  id uuid primary key default gen_random_uuid(),
  ticket_id uuid references public.tickets(id),
  ticket_code text,
  result text not null,
  gate_label text,
  validator_identifier text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  constraint ticket_validation_events_result_check check (
    result in ('allowed', 'denied', 'already_used', 'cancelled', 'not_found', 'wrong_event')
  )
);

create index ticket_validation_events_ticket_id_idx on public.ticket_validation_events(ticket_id);
create index ticket_validation_events_ticket_code_idx on public.ticket_validation_events(ticket_code);
create index ticket_validation_events_result_idx on public.ticket_validation_events(result);
create index ticket_validation_events_created_at_idx on public.ticket_validation_events(created_at);

create table public.seat_map_renders (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.event_sessions(id),
  section_id uuid not null references public.venue_sections(id),
  storage_path text not null,
  version integer not null default 1,
  status text not null default 'active',
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint seat_map_renders_storage_path_not_empty_check check (btrim(storage_path) <> ''),
  constraint seat_map_renders_version_positive_check check (version > 0),
  constraint seat_map_renders_status_check check (status in ('active', 'stale', 'deleted')),
  constraint seat_map_renders_session_section_version_key unique (session_id, section_id, version)
);

create index seat_map_renders_session_id_idx on public.seat_map_renders(session_id);
create index seat_map_renders_section_id_idx on public.seat_map_renders(section_id);
create index seat_map_renders_status_idx on public.seat_map_renders(status);

create trigger customers_set_updated_at
before update on public.customers
for each row execute function public.set_updated_at();

create trigger conversations_set_updated_at
before update on public.conversations
for each row execute function public.set_updated_at();

create trigger venues_set_updated_at
before update on public.venues
for each row execute function public.set_updated_at();

create trigger venue_sections_set_updated_at
before update on public.venue_sections
for each row execute function public.set_updated_at();

create trigger seats_set_updated_at
before update on public.seats
for each row execute function public.set_updated_at();

create trigger events_set_updated_at
before update on public.events
for each row execute function public.set_updated_at();

create trigger event_sessions_set_updated_at
before update on public.event_sessions
for each row execute function public.set_updated_at();

create trigger session_seats_set_updated_at
before update on public.session_seats
for each row execute function public.set_updated_at();

create trigger ticket_prices_set_updated_at
before update on public.ticket_prices
for each row execute function public.set_updated_at();

create trigger reservations_set_updated_at
before update on public.reservations
for each row execute function public.set_updated_at();

create trigger orders_set_updated_at
before update on public.orders
for each row execute function public.set_updated_at();

create trigger payments_set_updated_at
before update on public.payments
for each row execute function public.set_updated_at();

create trigger tickets_set_updated_at
before update on public.tickets
for each row execute function public.set_updated_at();

create trigger seat_map_renders_set_updated_at
before update on public.seat_map_renders
for each row execute function public.set_updated_at();
