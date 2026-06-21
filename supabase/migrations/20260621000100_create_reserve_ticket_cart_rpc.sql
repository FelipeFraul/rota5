-- Atomically reserves a cart containing different sections and ticket prices
-- from the same event session. No partial reservation survives an error.
create or replace function public.reserve_ticket_cart(
  p_customer_id uuid,
  p_conversation_id uuid,
  p_session_id uuid,
  p_items jsonb,
  p_ttl_minutes integer default 10
)
returns jsonb
language plpgsql
as $$
declare
  v_now timestamptz := now();
  v_expires_at timestamptz;
  v_item_count integer;
  v_distinct_seat_count integer;
  v_found_seat_count integer;
  v_available_seat_count integer;
  v_priced_seat_count integer;
  v_session_status text;
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

  if p_items is null or jsonb_typeof(p_items) <> 'array' then
    raise exception 'cart_items_required';
  end if;

  if p_ttl_minutes is null or p_ttl_minutes <= 0 then
    raise exception 'ttl_minutes_must_be_positive';
  end if;

  -- Serializes reservation creation for one buyer and closes the race between
  -- the application pre-check and this transaction.
  perform 1
  from public.customers
  where id = p_customer_id
  for update;

  if not found then
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

  if exists (
    select 1
    from public.reservations r
    join public.orders o on o.reservation_id = r.id
    where r.customer_id = p_customer_id
      and r.status = 'active'
      and r.expires_at > v_now
      and o.status = 'pending_payment'
  ) then
    raise exception 'active_reservation_exists';
  end if;

  select count(*)::integer, count(distinct input_item.seat_id)::integer
  into v_item_count, v_distinct_seat_count
  from jsonb_to_recordset(p_items) as input_item(
    seat_id uuid,
    ticket_price_id uuid
  );

  if v_item_count < 1 then
    raise exception 'cart_items_required';
  end if;

  if v_item_count > 10 then
    raise exception 'too_many_seats';
  end if;

  if exists (
    select 1
    from jsonb_to_recordset(p_items) as input_item(
      seat_id uuid,
      ticket_price_id uuid,
      expected_price_cents integer,
      expected_fee_cents integer,
      expected_currency text
    )
    where input_item.seat_id is null
       or input_item.ticket_price_id is null
       or input_item.expected_price_cents is null
       or input_item.expected_price_cents < 0
       or input_item.expected_fee_cents is null
       or input_item.expected_fee_cents < 0
       or input_item.expected_currency is null
       or input_item.expected_currency <> 'BRL'
  ) then
    raise exception 'cart_item_invalid';
  end if;

  if v_distinct_seat_count <> v_item_count then
    raise exception 'duplicate_seat_ids';
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

  -- Lock every requested seat in a deterministic order before validating
  -- availability so concurrent carts cannot both succeed.
  perform ss.id
  from public.session_seats ss
  where ss.session_id = p_session_id
    and ss.seat_id in (
      select input_item.seat_id
      from jsonb_to_recordset(p_items) as input_item(
        seat_id uuid,
        ticket_price_id uuid
      )
    )
  order by ss.seat_id
  for update;

  get diagnostics v_found_seat_count = row_count;

  if v_found_seat_count <> v_item_count then
    raise exception 'seat_not_found_for_session';
  end if;

  select count(*)::integer
  into v_available_seat_count
  from public.session_seats ss
  join public.seats s on s.id = ss.seat_id
  where ss.session_id = p_session_id
    and ss.status = 'available'
    and s.status = 'active'
    and ss.seat_id in (
      select input_item.seat_id
      from jsonb_to_recordset(p_items) as input_item(
        seat_id uuid,
        ticket_price_id uuid
      )
    );

  if v_available_seat_count <> v_item_count then
    raise exception 'seat_not_available';
  end if;

  -- Freeze the selected price rows while totals and reservation items are
  -- created, preventing an admin edit from splitting validation and charging.
  perform tp.id
  from public.ticket_prices tp
  where tp.id in (
    select input_item.ticket_price_id
    from jsonb_to_recordset(p_items) as input_item(
      seat_id uuid,
      ticket_price_id uuid
    )
  )
  order by tp.id
  for share;

  select count(*)::integer
  into v_priced_seat_count
  from jsonb_to_recordset(p_items) as input_item(
    seat_id uuid,
    ticket_price_id uuid,
    expected_price_cents integer,
    expected_fee_cents integer,
    expected_currency text
  )
  join public.session_seats ss
    on ss.session_id = p_session_id
   and ss.seat_id = input_item.seat_id
  join public.ticket_prices tp
    on tp.id = input_item.ticket_price_id
   and tp.session_id = p_session_id
   and tp.section_id = ss.section_id
   and tp.price_cents = input_item.expected_price_cents
   and tp.fee_cents = input_item.expected_fee_cents
   and tp.currency = input_item.expected_currency
   and tp.status = 'active'
   and (tp.sales_start_at is null or tp.sales_start_at <= v_now)
   and (tp.sales_end_at is null or tp.sales_end_at >= v_now);

  if v_priced_seat_count <> v_item_count then
    raise exception 'ticket_price_not_found';
  end if;

  select
    coalesce(sum(tp.price_cents), 0)::integer,
    coalesce(sum(tp.fee_cents), 0)::integer
  into v_total_amount_cents, v_total_fee_cents
  from jsonb_to_recordset(p_items) as input_item(
    seat_id uuid,
    ticket_price_id uuid
  )
  join public.ticket_prices tp on tp.id = input_item.ticket_price_id;

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
  from jsonb_to_recordset(p_items) as input_item(
    seat_id uuid,
    ticket_price_id uuid
  )
  join public.session_seats ss
    on ss.session_id = p_session_id
   and ss.seat_id = input_item.seat_id
  join public.seats s on s.id = ss.seat_id
  join public.ticket_prices tp on tp.id = input_item.ticket_price_id;

  update public.session_seats ss
  set
    status = 'reserved',
    current_reservation_id = v_reservation_id,
    updated_at = v_now
  where ss.session_id = p_session_id
    and ss.seat_id in (
      select input_item.seat_id
      from jsonb_to_recordset(p_items) as input_item(
        seat_id uuid,
        ticket_price_id uuid
      )
    );

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

comment on function public.reserve_ticket_cart(uuid, uuid, uuid, jsonb, integer)
is 'Atomically reserves up to 10 seats across ticket prices and sections in one session and creates one pending order.';

revoke all on function public.reserve_ticket_cart(uuid, uuid, uuid, jsonb, integer) from public;
revoke all on function public.reserve_ticket_cart(uuid, uuid, uuid, jsonb, integer) from anon;
revoke all on function public.reserve_ticket_cart(uuid, uuid, uuid, jsonb, integer) from authenticated;
grant execute on function public.reserve_ticket_cart(uuid, uuid, uuid, jsonb, integer) to service_role;
