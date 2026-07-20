create table if not exists public.division_settlements (
  id uuid primary key default gen_random_uuid(),
  period_key text not null unique,
  period_label text not null,
  period_from timestamptz,
  period_to timestamptz,
  total_received_cents integer not null default 0,
  amount_due_cents integer not null default 0,
  percentage_basis_points integer not null default 500,
  order_count integer not null default 0,
  week_count integer not null default 1,
  status text not null default 'paid',
  paid_at timestamptz not null default now(),
  paid_by_admin_user_id uuid references public.admin_users(id) on delete set null,
  note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint division_settlements_amounts_check check (
    total_received_cents >= 0
    and amount_due_cents >= 0
    and percentage_basis_points >= 0
    and order_count >= 0
    and week_count >= 0
  ),
  constraint division_settlements_status_check check (status in ('paid', 'cancelled'))
);

create index if not exists division_settlements_paid_at_idx
on public.division_settlements(paid_at);

create index if not exists division_settlements_status_idx
on public.division_settlements(status);

drop trigger if exists set_division_settlements_updated_at on public.division_settlements;
create trigger set_division_settlements_updated_at
before update on public.division_settlements
for each row execute function public.set_updated_at();

alter table public.division_settlements enable row level security;

comment on table public.division_settlements
is 'Visual/admin control for weekly 5% division settlements. Does not affect customer payments, orders, or tickets.';
