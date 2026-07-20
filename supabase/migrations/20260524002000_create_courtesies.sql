create table if not exists public.courtesy_limits (
  event_id uuid primary key references public.events(id) on delete cascade,
  max_courtesies integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint courtesy_limits_max_courtesies_check check (max_courtesies >= 0)
);

create table if not exists public.courtesies (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events(id),
  session_id uuid not null references public.event_sessions(id),
  ticket_id uuid references public.tickets(id),
  order_id uuid references public.orders(id),
  customer_id uuid not null references public.customers(id),
  phone text not null,
  status text not null default 'issued',
  issued_by_admin_user_id uuid references public.admin_users(id),
  issued_by_admin_phone text,
  cancelled_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint courtesies_phone_digits_check check (phone ~ '^[0-9]+$'),
  constraint courtesies_status_check check (status in ('issued', 'cancelled'))
);

create index if not exists courtesies_event_id_idx
on public.courtesies(event_id);

create index if not exists courtesies_customer_id_idx
on public.courtesies(customer_id);

create index if not exists courtesies_phone_idx
on public.courtesies(phone);

create index if not exists courtesies_ticket_id_idx
on public.courtesies(ticket_id);

create trigger courtesy_limits_set_updated_at
before update on public.courtesy_limits
for each row execute function public.set_updated_at();

create trigger courtesies_set_updated_at
before update on public.courtesies
for each row execute function public.set_updated_at();

comment on table public.courtesies
is 'Courtesy tickets issued by admins. Each courtesy is backed by a real ticket and QR Code.';

comment on table public.courtesy_limits
is 'Optional courtesy cap per event. Zero means no explicit cap.';
