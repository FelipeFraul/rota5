create table if not exists public.official_table_map_reservations (
  id uuid primary key default gen_random_uuid(),
  place_code text not null references public.official_table_map_places(code),
  reservation_id uuid not null unique references public.reservations(id) on delete cascade,
  order_id uuid not null unique references public.orders(id) on delete cascade,
  customer_id uuid not null references public.customers(id) on delete cascade,
  status text not null default 'active',
  expires_at timestamptz not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint official_table_map_reservations_status_check
    check (status in ('active', 'paid', 'cancelled', 'expired')),
  constraint official_table_map_reservations_expires_after_created_check
    check (expires_at > created_at)
);

create unique index if not exists official_table_map_reservations_active_place_key
on public.official_table_map_reservations(place_code)
where status in ('active', 'paid');

create index if not exists official_table_map_reservations_status_expires_idx
on public.official_table_map_reservations(status, expires_at);

create index if not exists official_table_map_reservations_customer_idx
on public.official_table_map_reservations(customer_id);

drop trigger if exists official_table_map_reservations_set_updated_at
on public.official_table_map_reservations;

create trigger official_table_map_reservations_set_updated_at
before update on public.official_table_map_reservations
for each row execute function public.set_updated_at();

alter table public.official_table_map_reservations enable row level security;

revoke all on public.official_table_map_reservations from public;
revoke all on public.official_table_map_reservations from anon;
revoke all on public.official_table_map_reservations from authenticated;
grant all on public.official_table_map_reservations to service_role;

create or replace function public.reserve_official_table_map_place(
  p_place_code text,
  p_reservation_id uuid,
  p_order_id uuid,
  p_customer_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_now timestamptz := now();
  v_place_code text;
  v_reservation public.reservations%rowtype;
  v_order public.orders%rowtype;
begin
  if p_place_code is null or btrim(p_place_code) = '' then
    raise exception 'place_code_required';
  end if;

  v_place_code := lpad(btrim(p_place_code), 2, '0');

  perform 1
  from public.official_table_map_places
  where code = v_place_code;

  if not found then
    raise exception 'place_not_found';
  end if;

  select *
  into v_reservation
  from public.reservations
  where id = p_reservation_id
  for update;

  if not found then
    raise exception 'reservation_not_found';
  end if;

  if v_reservation.customer_id <> p_customer_id then
    raise exception 'customer_not_found';
  end if;

  if v_reservation.status not in ('active', 'paid') then
    raise exception 'reservation_not_payable';
  end if;

  if v_reservation.status = 'active' and v_reservation.expires_at <= v_now then
    raise exception 'reservation_expired';
  end if;

  select *
  into v_order
  from public.orders
  where id = p_order_id
    and reservation_id = p_reservation_id
    and customer_id = p_customer_id
  for update;

  if not found then
    raise exception 'order_not_found';
  end if;

  if v_order.status not in ('pending_payment', 'paid') then
    raise exception 'order_not_payable';
  end if;

  update public.official_table_map_reservations
  set status = 'expired',
      updated_at = v_now
  where status = 'active'
    and expires_at <= v_now;

  if exists (
    select 1
    from public.official_table_map_reservations existing
    where existing.place_code = v_place_code
      and existing.status in ('active', 'paid')
      and existing.reservation_id <> p_reservation_id
  ) then
    raise exception 'place_not_available';
  end if;

  insert into public.official_table_map_reservations (
    place_code,
    reservation_id,
    order_id,
    customer_id,
    status,
    expires_at
  )
  values (
    v_place_code,
    p_reservation_id,
    p_order_id,
    p_customer_id,
    case when v_order.status = 'paid' then 'paid' else 'active' end,
    v_reservation.expires_at
  )
  on conflict (reservation_id) do update
  set place_code = excluded.place_code,
      order_id = excluded.order_id,
      customer_id = excluded.customer_id,
      status = excluded.status,
      expires_at = excluded.expires_at,
      updated_at = v_now;

  return jsonb_build_object(
    'place_code', v_place_code,
    'reservation_id', p_reservation_id,
    'order_id', p_order_id,
    'status', case when v_order.status = 'paid' then 'paid' else 'active' end
  );
end;
$$;

revoke all on function public.reserve_official_table_map_place(text, uuid, uuid, uuid) from public;
revoke all on function public.reserve_official_table_map_place(text, uuid, uuid, uuid) from anon;
revoke all on function public.reserve_official_table_map_place(text, uuid, uuid, uuid) from authenticated;
grant execute on function public.reserve_official_table_map_place(text, uuid, uuid, uuid) to service_role;

create or replace function public.sync_official_table_map_reservation_status()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if new.status = old.status then
    return new;
  end if;

  update public.official_table_map_reservations
  set status = case
        when new.status = 'paid' then 'paid'
        when new.status = 'cancelled' then 'cancelled'
        when new.status = 'expired' then 'expired'
        else status
      end,
      updated_at = now()
  where reservation_id = new.id
    and new.status in ('paid', 'cancelled', 'expired');

  return new;
end;
$$;

drop trigger if exists reservations_sync_official_table_map_status
on public.reservations;

create trigger reservations_sync_official_table_map_status
after update of status on public.reservations
for each row execute function public.sync_official_table_map_reservation_status();

revoke all on function public.sync_official_table_map_reservation_status() from public;
revoke all on function public.sync_official_table_map_reservation_status() from anon;
revoke all on function public.sync_official_table_map_reservation_status() from authenticated;
grant execute on function public.sync_official_table_map_reservation_status() to service_role;
