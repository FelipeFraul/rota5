create table if not exists public.buyer_risk_events (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid null references public.customers(id) on delete set null,
  phone_hash text not null,
  source_hash text null,
  event_id uuid null references public.events(id) on delete set null,
  session_id uuid null references public.event_sessions(id) on delete set null,
  reservation_id uuid null references public.reservations(id) on delete set null,
  order_id uuid null references public.orders(id) on delete set null,
  action_type text not null,
  reason text null,
  quantity integer null,
  metadata jsonb not null default '{}'::jsonb,
  expires_at timestamptz not null,
  created_at timestamptz not null default now(),
  constraint buyer_risk_events_phone_hash_not_empty_check check (btrim(phone_hash) <> ''),
  constraint buyer_risk_events_source_hash_not_empty_check check (
    source_hash is null or btrim(source_hash) <> ''
  ),
  constraint buyer_risk_events_action_type_check check (
    action_type in (
      'reservation_created',
      'reservation_cancelled',
      'reservation_expired',
      'checkout_requested',
      'checkout_blocked',
      'reservation_blocked'
    )
  ),
  constraint buyer_risk_events_reason_not_empty_check check (
    reason is null or btrim(reason) <> ''
  ),
  constraint buyer_risk_events_quantity_check check (
    quantity is null or quantity >= 0
  )
);

create index if not exists buyer_risk_events_phone_action_created_at_idx
on public.buyer_risk_events(phone_hash, action_type, created_at);

create index if not exists buyer_risk_events_source_action_created_at_idx
on public.buyer_risk_events(source_hash, action_type, created_at)
where source_hash is not null;

create index if not exists buyer_risk_events_order_action_created_at_idx
on public.buyer_risk_events(order_id, action_type, created_at)
where order_id is not null;

create index if not exists buyer_risk_events_event_session_created_at_idx
on public.buyer_risk_events(event_id, session_id, created_at);

create index if not exists buyer_risk_events_expires_at_idx
on public.buyer_risk_events(expires_at);

comment on table public.buyer_risk_events
is 'Aggregated buyer anti-abuse events for reservations and checkout. Stores only hashed phone/source identifiers and minimal metadata.';

comment on column public.buyer_risk_events.phone_hash
is 'SHA-256 hash of the buyer phone. The raw phone is not stored in this table.';

comment on column public.buyer_risk_events.source_hash
is 'SHA-256 hash of the request source identifier when available. Raw IP/source is not stored.';

comment on column public.buyer_risk_events.metadata
is 'Minimal non-sensitive counters/context. Must not contain raw phone, payload, checkout URL, QR data, token, or payment metadata.';

revoke all on table public.buyer_risk_events from public;
revoke all on table public.buyer_risk_events from anon;
revoke all on table public.buyer_risk_events from authenticated;
grant select, insert, delete on table public.buyer_risk_events to service_role;
