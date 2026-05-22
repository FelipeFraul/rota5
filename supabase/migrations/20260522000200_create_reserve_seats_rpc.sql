-- reserve_seats is the transactional entry point for temporary seat reservations.
-- It locks session_seats with FOR UPDATE so two concurrent calls cannot reserve the same seat.
create or replace function public.reserve_seats(
  p_customer_id uuid,
  p_conversation_id uuid,
  p_session_id uuid,
  p_seat_ids uuid[],
  p_ticket_type text default 'full',
  p_ttl_minutes integer default 10
)
returns jsonb
language plpgsql
as $$
declare
  v_now timestamptz := now();
  v_expires_at timestamptz;
  v_seat_count integer;
  v_distinct_seat_count integer;
  v_found_seat_count integer;
  v_available_seat_count integer;
  v_priced_seat_count integer;
  v_session_status text;
  v_ticket_type text;
  v_reservation_id uuid;
  v_order_id uuid;
  v_total_amount_cents integer;
  v_total_fee_cents integer;
  v_items jsonb;
begin
  if p_customer_id is null then
    raise exception 'customer_id_required';
  end if;

  if p_session_id is null then
    raise exception 'session_id_required';
  end if;

  if p_seat_ids is null or array_length(p_seat_ids, 1) is null then
    raise exception 'seat_ids_required';
  end if;

  if p_ticket_type is null or btrim(p_ticket_type) = '' then
    raise exception 'ticket_type_required';
  end if;

  v_ticket_type := btrim(p_ticket_type);

  if p_ttl_minutes is null or p_ttl_minutes <= 0 then
    raise exception 'ttl_minutes_must_be_positive';
  end if;

  v_seat_count := array_length(p_seat_ids, 1);

  if v_seat_count > 10 then
    raise exception 'too_many_seats';
  end if;

  if exists (
    select 1
    from unnest(p_seat_ids) as input_seat(seat_id)
    where input_seat.seat_id is null
  ) then
    raise exception 'seat_id_required';
  end if;

  select count(*)
  into v_distinct_seat_count
  from (
    select distinct input_seat.seat_id
    from unnest(p_seat_ids) as input_seat(seat_id)
  ) distinct_seats;

  if v_distinct_seat_count <> v_seat_count then
    raise exception 'duplicate_seat_ids';
  end if;

  if not exists (
    select 1
    from public.customers
    where id = p_customer_id
  ) then
    raise exception 'customer_not_found';
  end if;

  if p_conversation_id is not null and not exists (
    select 1
    from public.conversations
    where id = p_conversation_id
      and customer_id = p_customer_id
  ) then
    raise exception 'conversation_not_found';
  end if;

  select status
  into v_session_status
  from public.event_sessions
  where id = p_session_id;

  if v_session_status is null then
    raise exception 'session_not_found';
  end if;

  if v_session_status not in ('scheduled', 'sales_open') then
    raise exception 'session_not_available';
  end if;

  -- Lock all requested session seats in deterministic order for concurrency safety.
  select count(*)
  into v_found_seat_count
  from (
    select id
    from public.session_seats
    where session_id = p_session_id
      and seat_id = any(p_seat_ids)
    order by seat_id
    for update
  ) locked_session_seats;

  if v_found_seat_count <> v_seat_count then
    raise exception 'seat_not_found_for_session';
  end if;

  select count(*)
  into v_available_seat_count
  from public.session_seats
  where session_id = p_session_id
    and seat_id = any(p_seat_ids)
    and status = 'available';

  if v_available_seat_count <> v_seat_count then
    raise exception 'seat_not_available';
  end if;

  select count(*)
  into v_priced_seat_count
  from public.session_seats ss
  join public.ticket_prices tp
    on tp.session_id = ss.session_id
   and tp.section_id = ss.section_id
   and tp.ticket_type = v_ticket_type
   and tp.status = 'active'
   and (tp.sales_start_at is null or tp.sales_start_at <= v_now)
   and (tp.sales_end_at is null or tp.sales_end_at >= v_now)
  where ss.session_id = p_session_id
    and ss.seat_id = any(p_seat_ids);

  if v_priced_seat_count <> v_seat_count then
    raise exception 'ticket_price_not_found';
  end if;

  select
    coalesce(sum(tp.price_cents), 0)::integer,
    coalesce(sum(tp.fee_cents), 0)::integer
  into v_total_amount_cents, v_total_fee_cents
  from public.session_seats ss
  join public.ticket_prices tp
    on tp.session_id = ss.session_id
   and tp.section_id = ss.section_id
   and tp.ticket_type = v_ticket_type
   and tp.status = 'active'
   and (tp.sales_start_at is null or tp.sales_start_at <= v_now)
   and (tp.sales_end_at is null or tp.sales_end_at >= v_now)
  where ss.session_id = p_session_id
    and ss.seat_id = any(p_seat_ids);

  v_expires_at := v_now + make_interval(mins => p_ttl_minutes);

  insert into public.reservations (
    customer_id,
    conversation_id,
    session_id,
    status,
    expires_at,
    total_amount_cents,
    total_fee_cents,
    currency
  )
  values (
    p_customer_id,
    p_conversation_id,
    p_session_id,
    'active',
    v_expires_at,
    v_total_amount_cents,
    v_total_fee_cents,
    'BRL'
  )
  returning id into v_reservation_id;

  -- Price and seat identity are frozen in reservation_items at reservation time.
  insert into public.reservation_items (
    reservation_id,
    session_seat_id,
    seat_id,
    section_id,
    ticket_price_id,
    seat_code,
    ticket_type,
    price_cents,
    fee_cents,
    currency
  )
  select
    v_reservation_id,
    ss.id,
    ss.seat_id,
    ss.section_id,
    tp.id,
    s.seat_code,
    tp.ticket_type,
    tp.price_cents,
    tp.fee_cents,
    tp.currency
  from public.session_seats ss
  join public.seats s
    on s.id = ss.seat_id
  join public.ticket_prices tp
    on tp.session_id = ss.session_id
   and tp.section_id = ss.section_id
   and tp.ticket_type = v_ticket_type
   and tp.status = 'active'
   and (tp.sales_start_at is null or tp.sales_start_at <= v_now)
   and (tp.sales_end_at is null or tp.sales_end_at >= v_now)
  where ss.session_id = p_session_id
    and ss.seat_id = any(p_seat_ids);

  update public.session_seats
  set
    status = 'reserved',
    current_reservation_id = v_reservation_id,
    updated_at = v_now
  where session_id = p_session_id
    and seat_id = any(p_seat_ids);

  insert into public.orders (
    reservation_id,
    customer_id,
    status,
    total_amount_cents,
    total_fee_cents,
    currency
  )
  values (
    v_reservation_id,
    p_customer_id,
    'pending_payment',
    v_total_amount_cents,
    v_total_fee_cents,
    'BRL'
  )
  returning id into v_order_id;

  update public.orders
  set external_reference = 'ticket_order_' || v_order_id::text
  where id = v_order_id;

  select jsonb_agg(
    jsonb_build_object(
      'seat_id', ri.seat_id,
      'session_seat_id', ri.session_seat_id,
      'section_id', ri.section_id,
      'seat_code', ri.seat_code,
      'ticket_type', ri.ticket_type,
      'price_cents', ri.price_cents,
      'fee_cents', ri.fee_cents
    )
    order by ri.seat_code
  )
  into v_items
  from public.reservation_items ri
  where ri.reservation_id = v_reservation_id;

  -- Tickets are intentionally not emitted here; they are created only after approved payment.
  return jsonb_build_object(
    'reservation_id', v_reservation_id,
    'order_id', v_order_id,
    'expires_at', v_expires_at,
    'status', 'active',
    'total_amount_cents', v_total_amount_cents,
    'total_fee_cents', v_total_fee_cents,
    'currency', 'BRL',
    'items', coalesce(v_items, '[]'::jsonb)
  );
end;
$$;

comment on function public.reserve_seats(uuid, uuid, uuid, uuid[], text, integer)
is 'Transactionally reserves available session seats, freezes price in reservation_items, and creates a pending order. Tickets are emitted only after approved payment.';

revoke all on function public.reserve_seats(uuid, uuid, uuid, uuid[], text, integer) from public;
revoke all on function public.reserve_seats(uuid, uuid, uuid, uuid[], text, integer) from anon;
revoke all on function public.reserve_seats(uuid, uuid, uuid, uuid[], text, integer) from authenticated;
grant execute on function public.reserve_seats(uuid, uuid, uuid, uuid[], text, integer) to service_role;
