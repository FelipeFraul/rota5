alter table public.combo_offers
add column if not exists display_priority integer not null default 1;

alter table public.combo_offer_scopes
add column if not exists display_priority integer not null default 1;

alter table public.combo_orders
add column if not exists source_order_id uuid references public.orders(id) on delete set null;

alter table public.combo_offers
drop constraint if exists combo_offers_display_priority_check;

alter table public.combo_offers
add constraint combo_offers_display_priority_check
check (display_priority > 0 and display_priority <= 100000);

alter table public.combo_offer_scopes
drop constraint if exists combo_offer_scopes_display_priority_check;

alter table public.combo_offer_scopes
add constraint combo_offer_scopes_display_priority_check
check (display_priority > 0 and display_priority <= 100000);

update public.combo_offer_scopes scope
set display_priority = offer.display_priority
from public.combo_offers offer
where offer.id = scope.offer_id;

with ranked as (
  select
    id,
    row_number() over (
      partition by event_id
      order by display_priority asc, created_at asc, id asc
    ) as next_priority
  from public.combo_offer_scopes
  where scope_type = 'event'
    and event_id is not null
)
update public.combo_offer_scopes scope
set display_priority = ranked.next_priority
from ranked
where ranked.id = scope.id;

create index if not exists combo_offers_display_priority_idx
on public.combo_offers(display_priority, created_at);

drop index if exists combo_offer_scopes_event_priority_unique_idx;
create unique index combo_offer_scopes_event_priority_unique_idx
on public.combo_offer_scopes(event_id, display_priority)
where scope_type = 'event'
  and event_id is not null;

drop index if exists combo_orders_source_order_offer_unique_idx;
create unique index combo_orders_source_order_offer_unique_idx
on public.combo_orders(source_order_id, offer_id)
where source_order_id is not null
  and offer_id is not null;

comment on column public.combo_offers.display_priority
is 'Customer-facing delivery priority within an event. Priority 1 is sent on the customer first paid ticket purchase for that event, priority 2 on the next paid purchase, and so on.';

comment on column public.combo_offer_scopes.display_priority
is 'Event-scoped delivery priority used to prevent duplicate priorities and gaps within each event.';

create table if not exists public.combo_offer_event_locks (
  customer_id uuid not null references public.customers(id) on delete cascade,
  event_id uuid not null references public.events(id) on delete cascade,
  lock_token uuid not null default gen_random_uuid(),
  locked_until timestamptz not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (customer_id, event_id)
);

drop trigger if exists set_combo_offer_event_locks_updated_at on public.combo_offer_event_locks;
create trigger set_combo_offer_event_locks_updated_at
before update on public.combo_offer_event_locks
for each row execute function public.set_updated_at();

alter table public.combo_offer_event_locks enable row level security;

comment on table public.combo_offer_event_locks
is 'Short operational lock that serializes combo offer delivery decisions per customer and event.';

comment on column public.combo_orders.source_order_id
is 'Paid ticket order that deterministically caused this combo offer checkout.';
