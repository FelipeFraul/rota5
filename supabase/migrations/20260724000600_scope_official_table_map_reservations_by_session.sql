alter table public.official_table_map_reservations
  add column if not exists event_id uuid references public.events(id) on delete cascade,
  add column if not exists session_id uuid references public.event_sessions(id) on delete cascade;

update public.official_table_map_reservations otmr
set event_id = es.event_id,
    session_id = r.session_id
from public.reservations r
join public.event_sessions es on es.id = r.session_id
where otmr.reservation_id = r.id
  and (otmr.event_id is null or otmr.session_id is null);

delete from public.official_table_map_reservations
where event_id is null
   or session_id is null;

alter table public.official_table_map_reservations
  alter column event_id set not null,
  alter column session_id set not null;

drop index if exists public.official_table_map_reservations_active_place_key;

create unique index if not exists official_table_map_reservations_active_session_place_key
on public.official_table_map_reservations(session_id, place_code)
where status in ('active', 'paid');

create index if not exists official_table_map_reservations_session_status_expires_idx
on public.official_table_map_reservations(session_id, status, expires_at);

create index if not exists official_table_map_reservations_event_idx
on public.official_table_map_reservations(event_id);

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
  v_event_id uuid;
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

  select event_id
  into v_event_id
  from public.event_sessions
  where id = v_reservation.session_id;

  if v_event_id is null then
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
    where existing.session_id = v_reservation.session_id
      and existing.place_code = v_place_code
      and existing.status in ('active', 'paid')
      and existing.reservation_id <> p_reservation_id
  ) then
    raise exception 'place_not_available';
  end if;

  insert into public.official_table_map_reservations (
    place_code,
    event_id,
    session_id,
    reservation_id,
    order_id,
    customer_id,
    status,
    expires_at
  )
  values (
    v_place_code,
    v_event_id,
    v_reservation.session_id,
    p_reservation_id,
    p_order_id,
    p_customer_id,
    case when v_order.status = 'paid' then 'paid' else 'active' end,
    v_reservation.expires_at
  )
  on conflict (reservation_id) do update
  set place_code = excluded.place_code,
      event_id = excluded.event_id,
      session_id = excluded.session_id,
      order_id = excluded.order_id,
      customer_id = excluded.customer_id,
      status = excluded.status,
      expires_at = excluded.expires_at,
      updated_at = v_now;

  return jsonb_build_object(
    'place_code', v_place_code,
    'event_id', v_event_id,
    'session_id', v_reservation.session_id,
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
