-- Fully qualify project, native, and extension references for functions using search_path=''.
-- Function signatures, returns, SECURITY INVOKER behavior, and business logic are preserved.

CREATE OR REPLACE FUNCTION public.cancel_pending_reservation(p_reservation_id uuid, p_customer_id uuid DEFAULT NULL::uuid, p_reason text DEFAULT 'buyer_cancelled'::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare
  v_now timestamptz := pg_catalog.now();
  v_reservation public.reservations%rowtype;
  v_order public.orders%rowtype;
  v_released_seats_count integer := 0;
  v_cancelled_reservations_count integer := 0;
  v_cancelled_orders_count integer := 0;
begin
  if p_reservation_id is null then
    raise exception 'reservation_id_required';
  end if;

  select *
  into v_reservation
  from public.reservations
  where id = p_reservation_id
  for update;

  if not found then
    return pg_catalog.jsonb_build_object(
      'status', 'not_found',
      'cancelled_reservations_count', 0,
      'released_seats_count', 0,
      'cancelled_orders_count', 0
    );
  end if;

  if p_customer_id is not null and v_reservation.customer_id <> p_customer_id then
    return pg_catalog.jsonb_build_object(
      'status', 'not_found',
      'cancelled_reservations_count', 0,
      'released_seats_count', 0,
      'cancelled_orders_count', 0
    );
  end if;

  if v_reservation.status <> 'active' then
    return pg_catalog.jsonb_build_object(
      'status', 'not_cancellable',
      'reservation_status', v_reservation.status,
      'cancelled_reservations_count', 0,
      'released_seats_count', 0,
      'cancelled_orders_count', 0
    );
  end if;

  select *
  into v_order
  from public.orders
  where reservation_id = p_reservation_id
    and customer_id = v_reservation.customer_id
  for update;

  if not found or v_order.status not in ('draft', 'pending_payment') then
    return pg_catalog.jsonb_build_object(
      'status', 'not_cancellable',
      'order_status', coalesce(v_order.status, 'not_found'),
      'cancelled_reservations_count', 0,
      'released_seats_count', 0,
      'cancelled_orders_count', 0
    );
  end if;

  -- Seats are released only when they still point to this reservation.
  update public.session_seats ss
  set
    status = 'available',
    current_reservation_id = null,
    updated_at = v_now
  from public.reservation_items ri
  where ri.reservation_id = p_reservation_id
    and ss.id = ri.session_seat_id
    and ss.status = 'reserved'
    and ss.current_reservation_id = p_reservation_id;

  get diagnostics v_released_seats_count = row_count;

  update public.reservations
  set
    status = 'cancelled',
    updated_at = v_now
  where id = p_reservation_id
    and status = 'active';

  get diagnostics v_cancelled_reservations_count = row_count;

  update public.orders
  set
    status = 'cancelled',
    updated_at = v_now
  where id = v_order.id
    and status in ('draft', 'pending_payment');

  get diagnostics v_cancelled_orders_count = row_count;

  return pg_catalog.jsonb_build_object(
    'status', 'cancelled',
    'reason', coalesce(nullif(pg_catalog.btrim(p_reason), ''), 'buyer_cancelled'),
    'cancelled_reservations_count', v_cancelled_reservations_count,
    'released_seats_count', v_released_seats_count,
    'cancelled_orders_count', v_cancelled_orders_count
  );
end;
$function$;

CREATE OR REPLACE FUNCTION public.confirm_paid_ticket_order(p_order_id uuid, p_provider text, p_provider_payment_id text, p_amount_cents integer, p_paid_at timestamp with time zone DEFAULT pg_catalog.now(), p_raw_metadata jsonb DEFAULT '{}'::jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare
  v_now timestamptz := pg_catalog.now();
  v_provider text;
  v_provider_payment_id text;
  v_order record;
  v_reservation record;
  v_expected_amount_cents integer;
  v_item_count integer;
  v_locked_seat_count integer;
  v_valid_locked_seat_count integer;
  v_sold_seat_count integer;
  v_payment record;
  v_payment_id uuid;
  v_tickets jsonb;
  v_tickets_count integer;
begin
  if p_order_id is null then
    raise exception 'order_id_required';
  end if;

  if p_provider is null or pg_catalog.btrim(p_provider) = '' then
    raise exception 'provider_required';
  end if;

  if p_provider_payment_id is null or pg_catalog.btrim(p_provider_payment_id) = '' then
    raise exception 'provider_payment_id_required';
  end if;

  if p_amount_cents is null then
    raise exception 'amount_required';
  end if;

  if p_amount_cents < 0 then
    raise exception 'amount_must_be_non_negative';
  end if;

  if p_raw_metadata is null then
    raise exception 'raw_metadata_required';
  end if;

  v_provider := pg_catalog.btrim(p_provider);
  v_provider_payment_id := pg_catalog.btrim(p_provider_payment_id);

  if v_provider <> 'mercado_pago' then
    raise exception 'provider_not_supported';
  end if;

  select *
  into v_order
  from public.orders
  where id = p_order_id
  for update;

  if v_order.id is null then
    raise exception 'order_not_found';
  end if;

  if v_order.status = 'paid' then
    select id
    into v_payment_id
    from public.payments
    where order_id = p_order_id
      and status = 'approved'
    order by paid_at desc nulls last, created_at desc
    limit 1;

    select
      coalesce(pg_catalog.jsonb_agg(
        pg_catalog.jsonb_build_object(
          'ticket_id', t.id,
          'ticket_code', t.ticket_code,
          'reservation_item_id', t.reservation_item_id,
          'seat_id', t.seat_id,
          'seat_code', ri.seat_code,
          'section_id', t.section_id
        )
        order by ri.seat_code
      ), '[]'::jsonb),
      pg_catalog.count(t.id)::integer
    into v_tickets, v_tickets_count
    from public.tickets t
    join public.reservation_items ri
      on ri.id = t.reservation_item_id
    where t.order_id = p_order_id;

    return pg_catalog.jsonb_build_object(
      'order_id', p_order_id,
      'reservation_id', v_order.reservation_id,
      'payment_id', v_payment_id,
      'status', 'paid',
      'idempotent', true,
      'tickets_count', v_tickets_count,
      'tickets', coalesce(v_tickets, '[]'::jsonb)
    );
  end if;

  if v_order.status <> 'pending_payment' then
    raise exception 'order_not_payable';
  end if;

  select *
  into v_reservation
  from public.reservations
  where id = v_order.reservation_id
  for update;

  if v_reservation.id is null then
    raise exception 'reservation_not_found';
  end if;

  if v_reservation.status <> 'active' then
    raise exception 'reservation_not_payable';
  end if;

  if v_reservation.expires_at <= v_now then
    raise exception 'reservation_expired';
  end if;

  v_expected_amount_cents := v_order.total_amount_cents + v_order.total_fee_cents;

  if p_amount_cents < v_expected_amount_cents then
    raise exception 'payment_amount_too_low';
  end if;

  select pg_catalog.count(*)::integer
  into v_item_count
  from public.reservation_items
  where reservation_id = v_reservation.id;

  if v_item_count = 0 then
    raise exception 'reservation_items_not_found';
  end if;

  -- Seats turn sold only if they are still reserved for this exact reservation.
  select pg_catalog.count(*)::integer
  into v_locked_seat_count
  from (
    select ss.id
    from public.session_seats ss
    join public.reservation_items ri
      on ri.session_seat_id = ss.id
    where ri.reservation_id = v_reservation.id
    order by ss.id
    for update
  ) locked_session_seats;

  if v_locked_seat_count <> v_item_count then
    raise exception 'reserved_seat_not_available';
  end if;

  select pg_catalog.count(*)::integer
  into v_valid_locked_seat_count
  from public.session_seats ss
  join public.reservation_items ri
    on ri.session_seat_id = ss.id
  where ri.reservation_id = v_reservation.id
    and ss.status = 'reserved'
    and ss.current_reservation_id = v_reservation.id;

  if v_valid_locked_seat_count <> v_item_count then
    raise exception 'reserved_seat_not_available';
  end if;

  select *
  into v_payment
  from public.payments
  where provider = v_provider
    and provider_payment_id = v_provider_payment_id
  for update;

  if v_payment.id is not null and v_payment.order_id <> p_order_id then
    raise exception 'payment_already_linked';
  end if;

  if v_payment.id is not null then
    update public.payments
    set
      status = 'approved',
      amount_cents = p_amount_cents,
      currency = 'BRL',
      paid_at = coalesce(p_paid_at, v_now),
      raw_metadata = p_raw_metadata,
      updated_at = v_now
    where id = v_payment.id
    returning id into v_payment_id;
  else
    select *
    into v_payment
    from public.payments
    where order_id = p_order_id
      and provider = v_provider
      and provider_payment_id is null
    order by created_at
    limit 1
    for update;

    if v_payment.id is not null then
      update public.payments
      set
        provider_payment_id = v_provider_payment_id,
        status = 'approved',
        amount_cents = p_amount_cents,
        currency = 'BRL',
        paid_at = coalesce(p_paid_at, v_now),
        raw_metadata = p_raw_metadata,
        updated_at = v_now
      where id = v_payment.id
      returning id into v_payment_id;
    else
      insert into public.payments (
        order_id,
        provider,
        provider_payment_id,
        status,
        amount_cents,
        currency,
        paid_at,
        raw_metadata
      )
      values (
        p_order_id,
        v_provider,
        v_provider_payment_id,
        'approved',
        p_amount_cents,
        'BRL',
        coalesce(p_paid_at, v_now),
        p_raw_metadata
      )
      returning id into v_payment_id;
    end if;
  end if;

  update public.reservations
  set
    status = 'paid',
    updated_at = v_now
  where id = v_reservation.id;

  update public.orders
  set
    status = 'paid',
    updated_at = v_now
  where id = p_order_id;

  -- QR token hashes are placeholders for future QR generation; no raw QR token is stored.
  insert into public.tickets (
    order_id,
    reservation_item_id,
    customer_id,
    session_id,
    seat_id,
    section_id,
    ticket_code,
    qr_token_hash,
    status,
    issued_at
  )
  select
    p_order_id,
    ri.id,
    v_order.customer_id,
    v_reservation.session_id,
    ri.seat_id,
    ri.section_id,
    'TCK-' || pg_catalog.upper(pg_catalog.substr(pg_catalog.replace(pg_catalog.gen_random_uuid()::text, '-', ''), 1, 12)),
    pg_catalog.encode(extensions.digest(pg_catalog.gen_random_uuid()::text || pg_catalog.clock_timestamp()::text || ri.id::text, 'sha256'), 'hex'),
    'issued',
    v_now
  from public.reservation_items ri
  where ri.reservation_id = v_reservation.id
  order by ri.seat_code;

  update public.session_seats ss
  set
    status = 'sold',
    current_reservation_id = null,
    sold_ticket_id = t.id,
    updated_at = v_now
  from public.tickets t
  where t.order_id = p_order_id
    and t.reservation_item_id in (
      select ri.id
      from public.reservation_items ri
      where ri.reservation_id = v_reservation.id
    )
    and ss.seat_id = t.seat_id
    and ss.section_id = t.section_id
    and ss.status = 'reserved'
    and ss.current_reservation_id = v_reservation.id;

  get diagnostics v_sold_seat_count = row_count;

  if v_sold_seat_count <> v_item_count then
    raise exception 'reserved_seat_not_available';
  end if;

  select
    coalesce(pg_catalog.jsonb_agg(
      pg_catalog.jsonb_build_object(
        'ticket_id', t.id,
        'ticket_code', t.ticket_code,
        'reservation_item_id', t.reservation_item_id,
        'seat_id', t.seat_id,
        'seat_code', ri.seat_code,
        'section_id', t.section_id
      )
      order by ri.seat_code
    ), '[]'::jsonb),
    pg_catalog.count(t.id)::integer
  into v_tickets, v_tickets_count
  from public.tickets t
  join public.reservation_items ri
    on ri.id = t.reservation_item_id
  where t.order_id = p_order_id;

  return pg_catalog.jsonb_build_object(
    'order_id', p_order_id,
    'reservation_id', v_reservation.id,
    'payment_id', v_payment_id,
    'status', 'paid',
    'idempotent', false,
    'tickets_count', v_tickets_count,
    'tickets', coalesce(v_tickets, '[]'::jsonb)
  );
end;
$function$;

CREATE OR REPLACE FUNCTION public.consume_rate_limit(p_route_key text, p_source_hash text, p_limit integer, p_window_seconds integer, p_now timestamp with time zone DEFAULT pg_catalog.now())
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare
  v_window_start timestamptz;
  v_window_end timestamptz;
  v_request_count integer;
  v_retry_after integer;
begin
  if p_route_key is null or pg_catalog.btrim(p_route_key) = '' then
    raise exception 'route_key_required';
  end if;

  if p_source_hash is null or pg_catalog.btrim(p_source_hash) = '' then
    raise exception 'source_hash_required';
  end if;

  if p_limit is null or p_limit < 1 then
    raise exception 'limit_invalid';
  end if;

  if p_window_seconds is null or p_window_seconds < 1 then
    raise exception 'window_seconds_invalid';
  end if;

  v_window_start := pg_catalog.to_timestamp(
    pg_catalog.floor(extract(epoch from p_now) / p_window_seconds) * p_window_seconds
  );
  v_window_end := v_window_start + pg_catalog.make_interval(secs => p_window_seconds);

  insert into public.rate_limit_events (
    route_key,
    source_hash,
    window_start,
    window_seconds,
    request_count,
    expires_at
  )
  values (
    pg_catalog.btrim(p_route_key),
    pg_catalog.btrim(p_source_hash),
    v_window_start,
    p_window_seconds,
    1,
    v_window_end + interval '1 hour'
  )
  on conflict (route_key, source_hash, window_start)
  do update set
    request_count = public.rate_limit_events.request_count + 1,
    expires_at = excluded.expires_at
  returning request_count
  into v_request_count;

  v_retry_after := greatest(1, pg_catalog.ceil(extract(epoch from (v_window_end - p_now)))::integer);

  return pg_catalog.jsonb_build_object(
    'allowed', v_request_count <= p_limit,
    'reason', case when v_request_count <= p_limit then null else 'rate_limited' end,
    'retry_after_seconds', case when v_request_count <= p_limit then 0 else v_retry_after end,
    'count', v_request_count,
    'limit', p_limit,
    'window_seconds', p_window_seconds
  );
end;
$function$;

CREATE OR REPLACE FUNCTION public.enforce_one_active_reservation_per_customer()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
begin
  if new.status = 'active' and new.expires_at > pg_catalog.now() then
    perform public.lock_customer_active_reservation_slot(new.customer_id, new.id);
  end if;

  return new;
end;
$function$;

CREATE OR REPLACE FUNCTION public.expire_reservations(p_limit integer DEFAULT 100)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare
  v_now timestamptz := pg_catalog.now();
  v_reservation_ids uuid[] := array[]::uuid[];
  v_expired_reservations_count integer := 0;
  v_released_seats_count integer := 0;
  v_expired_order_count integer := 0;
begin
  if p_limit is null then
    raise exception 'limit_required';
  end if;

  if p_limit <= 0 then
    raise exception 'limit_must_be_positive';
  end if;

  if p_limit > 500 then
    raise exception 'limit_too_high';
  end if;

  select coalesce(pg_catalog.array_agg(locked_reservations.id order by locked_reservations.expires_at, locked_reservations.id), array[]::uuid[])
  into v_reservation_ids
  from (
    select id, expires_at
    from public.reservations
    where status = 'active'
      and expires_at <= v_now
    order by expires_at, id
    limit p_limit
    for update skip locked
  ) locked_reservations;

  if pg_catalog.cardinality(v_reservation_ids) = 0 then
    return pg_catalog.jsonb_build_object(
      'expired_reservations_count', 0,
      'released_seats_count', 0,
      'expired_order_count', 0,
      'reservation_ids', '[]'::jsonb
    );
  end if;

  -- Seats are released only when current_reservation_id still matches the expired reservation.
  update public.session_seats ss
  set
    status = 'available',
    current_reservation_id = null,
    updated_at = v_now
  from public.reservation_items ri
  where ri.reservation_id = any(v_reservation_ids)
    and ss.id = ri.session_seat_id
    and ss.status = 'reserved'
    and ss.current_reservation_id = ri.reservation_id;

  get diagnostics v_released_seats_count = row_count;

  -- Paid, cancelled, and already expired reservations are intentionally untouched.
  update public.reservations
  set
    status = 'expired',
    updated_at = v_now
  where id = any(v_reservation_ids)
    and status = 'active';

  get diagnostics v_expired_reservations_count = row_count;

  update public.orders
  set
    status = 'expired',
    updated_at = v_now
  where reservation_id = any(v_reservation_ids)
    and status in ('draft', 'pending_payment');

  get diagnostics v_expired_order_count = row_count;

  return pg_catalog.jsonb_build_object(
    'expired_reservations_count', v_expired_reservations_count,
    'released_seats_count', v_released_seats_count,
    'expired_order_count', v_expired_order_count,
    'reservation_ids', to_jsonb(v_reservation_ids)
  );
end;
$function$;

CREATE OR REPLACE FUNCTION public.issue_admin_courtesy_order(p_customer_id uuid, p_session_id uuid, p_seat_ids uuid[], p_issued_by_admin_user_id uuid, p_issued_by_admin_phone text, p_beneficiary_name text DEFAULT NULL::text, p_reason text DEFAULT NULL::text, p_ttl_minutes integer DEFAULT 10)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare
  v_event_id uuid;
  v_customer_phone text;
  v_quantity integer;
  v_reserved jsonb;
  v_order_id uuid;
  v_section_id uuid;
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

  v_quantity := array_length(p_seat_ids, 1);

  if v_quantity <= 0 then
    raise exception 'courtesy_quantity_must_be_positive';
  end if;

  select es.event_id
  into v_event_id
  from public.event_sessions es
  where es.id = p_session_id;

  if v_event_id is null then
    raise exception 'event_not_found';
  end if;

  select whatsapp_phone
  into v_customer_phone
  from public.customers
  where id = p_customer_id
  for update;

  if v_customer_phone is null then
    raise exception 'customer_not_found';
  end if;

  -- This is deliberately before reserve_seats so failed limits do not create holds.
  perform public.lock_and_validate_courtesy_limits(
    v_event_id,
    p_issued_by_admin_user_id,
    v_customer_phone,
    v_quantity
  );

  select ss.section_id
  into v_section_id
  from public.session_seats ss
  where ss.session_id = p_session_id
    and ss.seat_id = p_seat_ids[1];

  if v_section_id is null then
    raise exception 'seat_not_found_for_session';
  end if;

  insert into public.ticket_prices (
    session_id,
    section_id,
    ticket_type,
    label,
    price_cents,
    fee_cents,
    currency,
    status
  )
  values (
    p_session_id,
    v_section_id,
    'free',
    'Cortesia',
    0,
    0,
    'BRL',
    'active'
  )
  on conflict (session_id, section_id) where ticket_type = 'free' and status = 'active'
  do update set
    label = 'Cortesia',
    price_cents = 0,
    fee_cents = 0,
    currency = 'BRL',
    status = 'active',
    updated_at = pg_catalog.now();

  v_reserved := public.reserve_seats(
    p_customer_id,
    null,
    p_session_id,
    p_seat_ids,
    'free',
    coalesce(p_ttl_minutes, 10)
  );

  v_order_id := nullif(v_reserved->>'order_id', '')::uuid;

  if v_order_id is null then
    raise exception 'reservation_failed';
  end if;

  return public.issue_courtesy_order(
    v_order_id,
    p_issued_by_admin_user_id,
    p_issued_by_admin_phone,
    p_beneficiary_name,
    p_reason
  );
end;
$function$;

CREATE OR REPLACE FUNCTION public.issue_courtesy_order(p_order_id uuid, p_issued_by_admin_user_id uuid, p_issued_by_admin_phone text, p_beneficiary_name text DEFAULT NULL::text, p_reason text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare
  v_now timestamptz := pg_catalog.now();
  v_order public.orders%rowtype;
  v_reservation public.reservations%rowtype;
  v_customer public.customers%rowtype;
  v_event_id uuid;
  v_item_count integer := 0;
  v_zero_value_item_count integer := 0;
  v_locked_seat_count integer := 0;
  v_valid_locked_seat_count integer := 0;
  v_sold_seat_count integer := 0;
  v_tickets jsonb := '[]'::jsonb;
  v_tickets_count integer := 0;
begin
  if p_order_id is null then
    raise exception 'order_id_required';
  end if;

  if p_issued_by_admin_user_id is null then
    raise exception 'admin_user_required';
  end if;

  if p_issued_by_admin_phone is null or pg_catalog.btrim(p_issued_by_admin_phone) = '' then
    raise exception 'admin_phone_required';
  end if;

  select *
  into v_order
  from public.orders
  where id = p_order_id
  for update;

  if v_order.id is null then
    raise exception 'order_not_found';
  end if;

  if v_order.status = 'paid' then
    select
      coalesce(pg_catalog.jsonb_agg(
        pg_catalog.jsonb_build_object(
          'ticket_id', t.id,
          'ticket_code', t.ticket_code,
          'reservation_item_id', t.reservation_item_id,
          'seat_id', t.seat_id,
          'seat_code', ri.seat_code,
          'section_id', t.section_id
        )
        order by ri.seat_code
      ), '[]'::jsonb),
      pg_catalog.count(t.id)::integer
    into v_tickets, v_tickets_count
    from public.tickets t
    join public.reservation_items ri
      on ri.id = t.reservation_item_id
    where t.order_id = p_order_id;

    return pg_catalog.jsonb_build_object(
      'order_id', p_order_id,
      'reservation_id', v_order.reservation_id,
      'status', 'paid',
      'idempotent', true,
      'tickets_count', v_tickets_count,
      'tickets', coalesce(v_tickets, '[]'::jsonb)
    );
  end if;

  if v_order.status <> 'pending_payment' then
    raise exception 'order_not_payable';
  end if;

  if v_order.total_amount_cents <> 0 or v_order.total_fee_cents <> 0 then
    raise exception 'courtesy_order_must_be_zero_value';
  end if;

  select *
  into v_reservation
  from public.reservations
  where id = v_order.reservation_id
  for update;

  if v_reservation.id is null then
    raise exception 'reservation_not_found';
  end if;

  if v_reservation.status <> 'active' then
    raise exception 'reservation_not_payable';
  end if;

  if v_reservation.expires_at <= v_now then
    raise exception 'reservation_expired';
  end if;

  select *
  into v_customer
  from public.customers
  where id = v_order.customer_id
  for update;

  if v_customer.id is null then
    raise exception 'customer_not_found';
  end if;

  select es.event_id
  into v_event_id
  from public.event_sessions es
  where es.id = v_reservation.session_id;

  if v_event_id is null then
    raise exception 'event_not_found';
  end if;

  select pg_catalog.count(*)::integer
  into v_item_count
  from public.reservation_items
  where reservation_id = v_reservation.id;

  if v_item_count = 0 then
    raise exception 'reservation_items_not_found';
  end if;

  perform public.lock_and_validate_courtesy_limits(
    v_event_id,
    p_issued_by_admin_user_id,
    v_customer.whatsapp_phone,
    v_item_count
  );

  select pg_catalog.count(*)::integer
  into v_zero_value_item_count
  from public.reservation_items
  where reservation_id = v_reservation.id
    and ticket_type = 'free'
    and price_cents = 0
    and fee_cents = 0;

  if v_zero_value_item_count <> v_item_count then
    raise exception 'courtesy_items_must_be_free';
  end if;

  select pg_catalog.count(*)::integer
  into v_locked_seat_count
  from (
    select ss.id
    from public.session_seats ss
    join public.reservation_items ri
      on ri.session_seat_id = ss.id
    where ri.reservation_id = v_reservation.id
    order by ss.id
    for update
  ) locked_session_seats;

  if v_locked_seat_count <> v_item_count then
    raise exception 'reserved_seat_not_available';
  end if;

  select pg_catalog.count(*)::integer
  into v_valid_locked_seat_count
  from public.session_seats ss
  join public.reservation_items ri
    on ri.session_seat_id = ss.id
  where ri.reservation_id = v_reservation.id
    and ss.status = 'reserved'
    and ss.current_reservation_id = v_reservation.id;

  if v_valid_locked_seat_count <> v_item_count then
    raise exception 'reserved_seat_not_available';
  end if;

  if p_beneficiary_name is not null and pg_catalog.btrim(p_beneficiary_name) <> '' then
    update public.customers
    set
      name = pg_catalog.btrim(p_beneficiary_name),
      updated_at = v_now
    where id = v_customer.id;
  end if;

  update public.reservations
  set
    status = 'paid',
    updated_at = v_now
  where id = v_reservation.id;

  update public.orders
  set
    status = 'paid',
    updated_at = v_now
  where id = p_order_id;

  insert into public.tickets (
    order_id,
    reservation_item_id,
    customer_id,
    session_id,
    seat_id,
    section_id,
    ticket_code,
    qr_token_hash,
    status,
    issued_at
  )
  select
    p_order_id,
    ri.id,
    v_order.customer_id,
    v_reservation.session_id,
    ri.seat_id,
    ri.section_id,
    'TCK-' || pg_catalog.upper(pg_catalog.substr(pg_catalog.replace(pg_catalog.gen_random_uuid()::text, '-', ''), 1, 12)),
    pg_catalog.encode(extensions.digest(pg_catalog.gen_random_uuid()::text || pg_catalog.clock_timestamp()::text || ri.id::text, 'sha256'), 'hex'),
    'issued',
    v_now
  from public.reservation_items ri
  where ri.reservation_id = v_reservation.id
  order by ri.seat_code;

  update public.session_seats ss
  set
    status = 'sold',
    current_reservation_id = null,
    sold_ticket_id = t.id,
    updated_at = v_now
  from public.tickets t
  where t.order_id = p_order_id
    and t.reservation_item_id in (
      select ri.id
      from public.reservation_items ri
      where ri.reservation_id = v_reservation.id
    )
    and ss.seat_id = t.seat_id
    and ss.section_id = t.section_id
    and ss.status = 'reserved'
    and ss.current_reservation_id = v_reservation.id;

  get diagnostics v_sold_seat_count = row_count;

  if v_sold_seat_count <> v_item_count then
    raise exception 'reserved_seat_not_available';
  end if;

  insert into public.courtesies (
    event_id,
    session_id,
    ticket_id,
    order_id,
    customer_id,
    phone,
    beneficiary_name,
    reason,
    issued_by_admin_user_id,
    issued_by_admin_phone,
    status
  )
  select
    v_event_id,
    v_reservation.session_id,
    t.id,
    p_order_id,
    v_order.customer_id,
    v_customer.whatsapp_phone,
    nullif(pg_catalog.btrim(coalesce(p_beneficiary_name, '')), ''),
    nullif(pg_catalog.btrim(coalesce(p_reason, '')), ''),
    p_issued_by_admin_user_id,
    pg_catalog.btrim(p_issued_by_admin_phone),
    'issued'
  from public.tickets t
  where t.order_id = p_order_id
  order by t.ticket_code;

  select
    coalesce(pg_catalog.jsonb_agg(
      pg_catalog.jsonb_build_object(
        'ticket_id', t.id,
        'ticket_code', t.ticket_code,
        'reservation_item_id', t.reservation_item_id,
        'seat_id', t.seat_id,
        'seat_code', ri.seat_code,
        'section_id', t.section_id
      )
      order by ri.seat_code
    ), '[]'::jsonb),
    pg_catalog.count(t.id)::integer
  into v_tickets, v_tickets_count
  from public.tickets t
  join public.reservation_items ri
    on ri.id = t.reservation_item_id
  where t.order_id = p_order_id;

  return pg_catalog.jsonb_build_object(
    'order_id', p_order_id,
    'reservation_id', v_reservation.id,
    'status', 'paid',
    'idempotent', false,
    'tickets_count', v_tickets_count,
    'tickets', coalesce(v_tickets, '[]'::jsonb)
  );
end;
$function$;

CREATE OR REPLACE FUNCTION public.issue_public_free_ticket_order(p_order_id uuid, p_customer_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare
  v_now timestamptz := pg_catalog.now();
  v_order public.orders%rowtype;
  v_reservation public.reservations%rowtype;
  v_item_count integer := 0;
  v_zero_value_item_count integer := 0;
  v_locked_seat_count integer := 0;
  v_valid_locked_seat_count integer := 0;
  v_sold_seat_count integer := 0;
  v_tickets jsonb := '[]'::jsonb;
  v_tickets_count integer := 0;
begin
  if p_order_id is null then
    raise exception 'order_id_required';
  end if;

  if p_customer_id is null then
    raise exception 'customer_id_required';
  end if;

  select *
  into v_order
  from public.orders
  where id = p_order_id
    and customer_id = p_customer_id
  for update;

  if v_order.id is null then
    raise exception 'order_not_found';
  end if;

  if v_order.status = 'paid' then
    select
      coalesce(pg_catalog.jsonb_agg(
        pg_catalog.jsonb_build_object(
          'ticket_id', t.id,
          'ticket_code', t.ticket_code,
          'reservation_item_id', t.reservation_item_id,
          'seat_id', t.seat_id,
          'seat_code', ri.seat_code,
          'section_id', t.section_id
        )
        order by ri.seat_code
      ), '[]'::jsonb),
      pg_catalog.count(t.id)::integer
    into v_tickets, v_tickets_count
    from public.tickets t
    join public.reservation_items ri
      on ri.id = t.reservation_item_id
    where t.order_id = p_order_id;

    return pg_catalog.jsonb_build_object(
      'order_id', p_order_id,
      'reservation_id', v_order.reservation_id,
      'status', 'paid',
      'idempotent', true,
      'tickets_count', v_tickets_count,
      'tickets', coalesce(v_tickets, '[]'::jsonb)
    );
  end if;

  if v_order.status <> 'pending_payment' then
    raise exception 'order_not_payable';
  end if;

  if v_order.total_amount_cents <> 0 or v_order.total_fee_cents <> 0 then
    raise exception 'free_order_must_be_zero_value';
  end if;

  select *
  into v_reservation
  from public.reservations
  where id = v_order.reservation_id
    and customer_id = p_customer_id
  for update;

  if v_reservation.id is null then
    raise exception 'reservation_not_found';
  end if;

  if v_reservation.status <> 'active' then
    raise exception 'reservation_not_payable';
  end if;

  if v_reservation.expires_at <= v_now then
    raise exception 'reservation_expired';
  end if;

  select pg_catalog.count(*)::integer
  into v_item_count
  from public.reservation_items
  where reservation_id = v_reservation.id;

  if v_item_count = 0 then
    raise exception 'reservation_items_not_found';
  end if;

  if v_item_count > 4 then
    raise exception 'free_ticket_limit_exceeded';
  end if;

  select pg_catalog.count(*)::integer
  into v_zero_value_item_count
  from public.reservation_items
  where reservation_id = v_reservation.id
    and price_cents = 0
    and fee_cents = 0;

  if v_zero_value_item_count <> v_item_count then
    raise exception 'zero_value_items_required';
  end if;

  select pg_catalog.count(*)::integer
  into v_locked_seat_count
  from (
    select ss.id
    from public.session_seats ss
    join public.reservation_items ri
      on ri.session_seat_id = ss.id
    where ri.reservation_id = v_reservation.id
    order by ss.id
    for update
  ) locked_session_seats;

  if v_locked_seat_count <> v_item_count then
    raise exception 'reserved_seat_not_available';
  end if;

  select pg_catalog.count(*)::integer
  into v_valid_locked_seat_count
  from public.session_seats ss
  join public.reservation_items ri
    on ri.session_seat_id = ss.id
  where ri.reservation_id = v_reservation.id
    and ss.status = 'reserved'
    and ss.current_reservation_id = v_reservation.id;

  if v_valid_locked_seat_count <> v_item_count then
    raise exception 'reserved_seat_not_available';
  end if;

  update public.reservations
  set
    status = 'paid',
    updated_at = v_now
  where id = v_reservation.id;

  update public.orders
  set
    status = 'paid',
    updated_at = v_now
  where id = p_order_id;

  insert into public.tickets (
    order_id,
    reservation_item_id,
    customer_id,
    session_id,
    seat_id,
    section_id,
    ticket_code,
    qr_token_hash,
    status,
    issued_at
  )
  select
    p_order_id,
    ri.id,
    v_order.customer_id,
    v_reservation.session_id,
    ri.seat_id,
    ri.section_id,
    'TCK-' || pg_catalog.upper(pg_catalog.substr(pg_catalog.replace(pg_catalog.gen_random_uuid()::text, '-', ''), 1, 12)),
    pg_catalog.encode(extensions.digest(pg_catalog.gen_random_uuid()::text || pg_catalog.clock_timestamp()::text || ri.id::text, 'sha256'), 'hex'),
    'issued',
    v_now
  from public.reservation_items ri
  where ri.reservation_id = v_reservation.id
  order by ri.seat_code;

  update public.session_seats ss
  set
    status = 'sold',
    current_reservation_id = null,
    sold_ticket_id = t.id,
    updated_at = v_now
  from public.tickets t
  where t.order_id = p_order_id
    and t.reservation_item_id in (
      select ri.id
      from public.reservation_items ri
      where ri.reservation_id = v_reservation.id
    )
    and ss.seat_id = t.seat_id
    and ss.section_id = t.section_id
    and ss.status = 'reserved'
    and ss.current_reservation_id = v_reservation.id;

  get diagnostics v_sold_seat_count = row_count;

  if v_sold_seat_count <> v_item_count then
    raise exception 'reserved_seat_not_available';
  end if;

  select
    coalesce(pg_catalog.jsonb_agg(
      pg_catalog.jsonb_build_object(
        'ticket_id', t.id,
        'ticket_code', t.ticket_code,
        'reservation_item_id', t.reservation_item_id,
        'seat_id', t.seat_id,
        'seat_code', ri.seat_code,
        'section_id', t.section_id
      )
      order by ri.seat_code
    ), '[]'::jsonb),
    pg_catalog.count(t.id)::integer
  into v_tickets, v_tickets_count
  from public.tickets t
  join public.reservation_items ri
    on ri.id = t.reservation_item_id
  where t.order_id = p_order_id;

  return pg_catalog.jsonb_build_object(
    'order_id', p_order_id,
    'reservation_id', v_reservation.id,
    'status', 'paid',
    'idempotent', false,
    'tickets_count', v_tickets_count,
    'tickets', coalesce(v_tickets, '[]'::jsonb)
  );
end;
$function$;

CREATE OR REPLACE FUNCTION public.lock_and_validate_courtesy_limits(p_event_id uuid, p_issued_by_admin_user_id uuid, p_beneficiary_phone text, p_quantity integer)
 RETURNS void
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare
  v_issuer public.admin_users%rowtype;
  v_receiver public.admin_users%rowtype;
  v_event_limit integer := 0;
  v_current_event_count integer := 0;
  v_current_send_count integer := 0;
  v_current_receive_count integer := 0;
  v_beneficiary_phone text := pg_catalog.regexp_replace(coalesce(p_beneficiary_phone, ''), '\D', '', 'g');
begin
  if p_event_id is null then
    raise exception 'event_id_required';
  end if;

  if p_issued_by_admin_user_id is null then
    raise exception 'admin_user_required';
  end if;

  if v_beneficiary_phone = '' then
    raise exception 'beneficiary_phone_required';
  end if;

  if p_quantity is null or p_quantity <= 0 then
    raise exception 'courtesy_quantity_must_be_positive';
  end if;

  -- Serialize event-level cap checks even when no courtesy_limits row exists yet.
  perform pg_advisory_xact_lock(hashtextextended('courtesy:event:' || p_event_id::text, 0));

  select *
  into v_issuer
  from public.admin_users
  where id = p_issued_by_admin_user_id
  for update;

  if v_issuer.id is null or v_issuer.status <> 'active' then
    raise exception 'admin_user_not_active';
  end if;

  select *
  into v_receiver
  from public.admin_users
  where phone = v_beneficiary_phone
  for update;

  select coalesce(max_courtesies, 0)
  into v_event_limit
  from public.courtesy_limits
  where event_id = p_event_id
  for update;

  v_event_limit := coalesce(v_event_limit, 0);

  if v_event_limit > 0 then
    select pg_catalog.count(*)::integer
    into v_current_event_count
    from public.courtesies
    where event_id = p_event_id
      and status = 'issued';

    if v_current_event_count + p_quantity > v_event_limit then
      raise exception 'courtesy_event_limit_exceeded';
    end if;
  end if;

  if coalesce(v_issuer.courtesy_send_limit, 0) > 0 then
    select pg_catalog.count(*)::integer
    into v_current_send_count
    from public.courtesies
    where issued_by_admin_user_id = p_issued_by_admin_user_id
      and status = 'issued';

    if v_current_send_count + p_quantity > v_issuer.courtesy_send_limit then
      raise exception 'courtesy_send_limit_exceeded';
    end if;
  end if;

  if v_receiver.id is not null and coalesce(v_receiver.courtesy_receive_limit, 0) > 0 then
    select pg_catalog.count(*)::integer
    into v_current_receive_count
    from public.courtesies
    where phone = v_beneficiary_phone
      and status = 'issued';

    if v_current_receive_count + p_quantity > v_receiver.courtesy_receive_limit then
      raise exception 'courtesy_receive_limit_exceeded';
    end if;
  end if;
end;
$function$;

CREATE OR REPLACE FUNCTION public.lock_customer_active_reservation_slot(p_customer_id uuid, p_reservation_id uuid DEFAULT NULL::uuid)
 RETURNS void
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare
  v_existing_reservation_id uuid;
begin
  if p_customer_id is null then
    raise exception 'customer_id_required';
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended('active_reservation_customer:' || p_customer_id::text, 0)
  );

  select r.id
  into v_existing_reservation_id
  from public.reservations r
  where r.customer_id = p_customer_id
    and r.status = 'active'
    and r.expires_at > pg_catalog.now()
    and (p_reservation_id is null or r.id <> p_reservation_id)
  order by r.expires_at asc, r.created_at asc, r.id asc
  limit 1
  for update;

  if v_existing_reservation_id is not null then
    raise exception 'active_reservation_exists';
  end if;
end;
$function$;

CREATE OR REPLACE FUNCTION public.lock_validate_and_record_reservation_buyer_risk(p_customer_id uuid, p_source_identifier text, p_session_id uuid, p_quantity integer)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare
  v_now timestamptz := pg_catalog.now();
  v_phone text;
  v_phone_hash text;
  v_source_hash text;
  v_event_id uuid;
  v_created_count integer;
  v_churn_count integer;
  v_source_count integer;
  v_recent_quantity integer;
  v_risk_event_id uuid;
begin
  if p_customer_id is null then
    raise exception 'customer_id_required';
  end if;

  if p_session_id is null then
    raise exception 'session_id_required';
  end if;

  if p_quantity is null or p_quantity <= 0 then
    raise exception 'quantity_must_be_positive';
  end if;

  select pg_catalog.regexp_replace(coalesce(c.whatsapp_phone, ''), '\D', '', 'g')
  into v_phone
  from public.customers c
  where c.id = p_customer_id;

  if v_phone is null or pg_catalog.btrim(v_phone) = '' then
    return pg_catalog.jsonb_build_object('allowed', true, 'risk_event_id', null);
  end if;

  v_phone_hash := pg_catalog.encode(extensions.digest(v_phone, 'sha256'), 'hex');
  v_source_hash := case
    when p_source_identifier is null or pg_catalog.btrim(p_source_identifier) = '' then null
    else pg_catalog.encode(extensions.digest(pg_catalog.btrim(p_source_identifier), 'sha256'), 'hex')
  end;

  select es.event_id
  into v_event_id
  from public.event_sessions es
  where es.id = p_session_id;

  perform pg_advisory_xact_lock(
    hashtextextended('buyer_risk_phone:' || v_phone_hash, 0)
  );

  if v_source_hash is not null then
    perform pg_advisory_xact_lock(
      hashtextextended('buyer_risk_source:' || v_source_hash, 0)
    );
  end if;

  select pg_catalog.count(*)
  into v_created_count
  from public.buyer_risk_events bre
  where bre.phone_hash = v_phone_hash
    and bre.action_type = 'reservation_created'
    and bre.created_at >= v_now - interval '15 minutes';

  if v_created_count >= 5 then
    insert into public.buyer_risk_events (
      customer_id,
      phone_hash,
      source_hash,
      event_id,
      session_id,
      action_type,
      reason,
      quantity,
      metadata,
      expires_at
    )
    values (
      p_customer_id,
      v_phone_hash,
      v_source_hash,
      v_event_id,
      p_session_id,
      'reservation_blocked',
      'reservation_created_phone_limit',
      p_quantity,
      pg_catalog.jsonb_build_object('limit', 5, 'window_minutes', 15),
      v_now + interval '15 minutes'
    );

    return pg_catalog.jsonb_build_object(
      'allowed', false,
      'reason', 'reservation_created_phone_limit',
      'retry_after_minutes', 15
    );
  end if;

  select pg_catalog.count(*)
  into v_churn_count
  from public.buyer_risk_events bre
  where bre.phone_hash = v_phone_hash
    and bre.action_type in ('reservation_cancelled', 'reservation_expired')
    and bre.created_at >= v_now - interval '30 minutes';

  if v_churn_count >= 5 then
    insert into public.buyer_risk_events (
      customer_id,
      phone_hash,
      source_hash,
      event_id,
      session_id,
      action_type,
      reason,
      quantity,
      metadata,
      expires_at
    )
    values (
      p_customer_id,
      v_phone_hash,
      v_source_hash,
      v_event_id,
      p_session_id,
      'reservation_blocked',
      'reservation_churn_phone_limit',
      p_quantity,
      pg_catalog.jsonb_build_object('limit', 5, 'window_minutes', 30),
      v_now + interval '30 minutes'
    );

    return pg_catalog.jsonb_build_object(
      'allowed', false,
      'reason', 'reservation_churn_phone_limit',
      'retry_after_minutes', 30
    );
  end if;

  if v_source_hash is not null then
    select pg_catalog.count(*)
    into v_source_count
    from public.buyer_risk_events bre
    where bre.source_hash = v_source_hash
      and bre.action_type = 'reservation_created'
      and bre.created_at >= v_now - interval '15 minutes';

    if v_source_count >= 20 then
      insert into public.buyer_risk_events (
        customer_id,
        phone_hash,
        source_hash,
        event_id,
        session_id,
        action_type,
        reason,
        quantity,
        metadata,
        expires_at
      )
      values (
        p_customer_id,
        v_phone_hash,
        v_source_hash,
        v_event_id,
        p_session_id,
        'reservation_blocked',
        'reservation_created_source_limit',
        p_quantity,
        pg_catalog.jsonb_build_object('limit', 20, 'window_minutes', 15),
        v_now + interval '15 minutes'
      );

      return pg_catalog.jsonb_build_object(
        'allowed', false,
        'reason', 'reservation_created_source_limit',
        'retry_after_minutes', 15
      );
    end if;
  end if;

  select coalesce(sum(coalesce(bre.quantity, 0)), 0)::integer
  into v_recent_quantity
  from public.buyer_risk_events bre
  where bre.phone_hash = v_phone_hash
    and bre.event_id = v_event_id
    and bre.session_id = p_session_id
    and bre.action_type = 'reservation_created'
    and bre.created_at >= v_now - interval '15 minutes';

  if v_recent_quantity + p_quantity > 10 then
    insert into public.buyer_risk_events (
      customer_id,
      phone_hash,
      source_hash,
      event_id,
      session_id,
      action_type,
      reason,
      quantity,
      metadata,
      expires_at
    )
    values (
      p_customer_id,
      v_phone_hash,
      v_source_hash,
      v_event_id,
      p_session_id,
      'reservation_blocked',
      'reservation_session_ticket_limit',
      p_quantity,
      pg_catalog.jsonb_build_object('limit', 10, 'window_minutes', 15),
      v_now + interval '15 minutes'
    );

    return pg_catalog.jsonb_build_object(
      'allowed', false,
      'reason', 'reservation_session_ticket_limit',
      'retry_after_minutes', 15
    );
  end if;

  insert into public.buyer_risk_events (
    customer_id,
    phone_hash,
    source_hash,
    event_id,
    session_id,
    action_type,
    quantity,
    metadata,
    expires_at
  )
  values (
    p_customer_id,
    v_phone_hash,
    v_source_hash,
    v_event_id,
    p_session_id,
    'reservation_created',
    p_quantity,
    '{}'::jsonb,
    v_now + interval '2 hours'
  )
  returning id into v_risk_event_id;

  return pg_catalog.jsonb_build_object(
    'allowed', true,
    'risk_event_id', v_risk_event_id
  );
end;
$function$;

CREATE OR REPLACE FUNCTION public.normalize_event_search_text(value text)
 RETURNS text
 LANGUAGE sql
 IMMUTABLE PARALLEL SAFE
 SET search_path TO ''
AS $function$
  select pg_catalog.btrim(
    pg_catalog.regexp_replace(
      pg_catalog.regexp_replace(
        pg_catalog.replace(pg_catalog.lower(public.unaccent(coalesce(value, ''))), 'w', 'v'),
        '[^[:alnum:]]+',
        ' ',
        'g'
      ),
      '\s+',
      ' ',
      'g'
    )
  );
$function$;

CREATE OR REPLACE FUNCTION public.reserve_seats(p_customer_id uuid, p_conversation_id uuid, p_session_id uuid, p_seat_ids uuid[], p_ticket_type text DEFAULT 'full'::text, p_ttl_minutes integer DEFAULT 10, p_source_identifier text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare
  v_now timestamptz := pg_catalog.now();
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
  v_risk jsonb;
  v_risk_event_id uuid;
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

  if p_ticket_type is null or pg_catalog.btrim(p_ticket_type) = '' then
    raise exception 'ticket_type_required';
  end if;

  v_ticket_type := pg_catalog.btrim(p_ticket_type);

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

  select pg_catalog.count(*)
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

  perform public.lock_customer_active_reservation_slot(p_customer_id, null);

  v_risk := public.lock_validate_and_record_reservation_buyer_risk(
    p_customer_id,
    p_source_identifier,
    p_session_id,
    v_seat_count
  );

  if coalesce((v_risk->>'allowed')::boolean, false) = false then
    return pg_catalog.jsonb_build_object(
      'ok', false,
      'reason', 'buyer_risk_limited',
      'risk_reason', v_risk->>'reason',
      'retry_after_minutes', coalesce((v_risk->>'retry_after_minutes')::integer, 15)
    );
  end if;

  v_risk_event_id := nullif(v_risk->>'risk_event_id', '')::uuid;

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

  select pg_catalog.count(*)
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

  select pg_catalog.count(*)
  into v_available_seat_count
  from public.session_seats
  where session_id = p_session_id
    and seat_id = any(p_seat_ids)
    and status = 'available';

  if v_available_seat_count <> v_seat_count then
    raise exception 'seat_not_available';
  end if;

  select pg_catalog.count(*)
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

  v_expires_at := v_now + pg_catalog.make_interval(mins => p_ttl_minutes);

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

  if v_risk_event_id is not null then
    update public.buyer_risk_events
    set
      reservation_id = v_reservation_id,
      order_id = v_order_id
    where id = v_risk_event_id;
  end if;

  select pg_catalog.jsonb_agg(
    pg_catalog.jsonb_build_object(
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

  return pg_catalog.jsonb_build_object(
    'ok', true,
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
$function$;

CREATE OR REPLACE FUNCTION public.reserve_ticket_cart(p_customer_id uuid, p_conversation_id uuid, p_session_id uuid, p_items jsonb, p_ttl_minutes integer DEFAULT 10)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare
  v_now timestamptz := pg_catalog.now();
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

  select pg_catalog.count(*)::integer, pg_catalog.count(distinct input_item.seat_id)::integer
  into v_item_count, v_distinct_seat_count
  from pg_catalog.jsonb_to_recordset(p_items) as input_item(
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
    from pg_catalog.jsonb_to_recordset(p_items) as input_item(
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
      from pg_catalog.jsonb_to_recordset(p_items) as input_item(
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

  select pg_catalog.count(*)::integer
  into v_available_seat_count
  from public.session_seats ss
  join public.seats s on s.id = ss.seat_id
  where ss.session_id = p_session_id
    and ss.status = 'available'
    and s.status = 'active'
    and ss.seat_id in (
      select input_item.seat_id
      from pg_catalog.jsonb_to_recordset(p_items) as input_item(
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
    from pg_catalog.jsonb_to_recordset(p_items) as input_item(
      seat_id uuid,
      ticket_price_id uuid
    )
  )
  order by tp.id
  for share;

  select pg_catalog.count(*)::integer
  into v_priced_seat_count
  from pg_catalog.jsonb_to_recordset(p_items) as input_item(
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
  from pg_catalog.jsonb_to_recordset(p_items) as input_item(
    seat_id uuid,
    ticket_price_id uuid
  )
  join public.ticket_prices tp on tp.id = input_item.ticket_price_id;

  v_expires_at := v_now + pg_catalog.make_interval(mins => p_ttl_minutes);

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
  from pg_catalog.jsonb_to_recordset(p_items) as input_item(
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
      from pg_catalog.jsonb_to_recordset(p_items) as input_item(
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

  select pg_catalog.jsonb_agg(
    pg_catalog.jsonb_build_object(
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

  return pg_catalog.jsonb_build_object(
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
$function$;

CREATE OR REPLACE FUNCTION public.search_public_events_ranked(search_term text, date_from timestamp with time zone DEFAULT pg_catalog.now(), date_to timestamp with time zone DEFAULT NULL::timestamp with time zone, result_limit integer DEFAULT 20)
 RETURNS TABLE(event_id uuid, title text, artist_name text, description text, city text, state text, image_url text, venue_id uuid, venue_name text, session_id uuid, starts_at timestamp with time zone, session_status text, score numeric)
 LANGUAGE sql
 STABLE
 SET search_path TO ''
AS $function$
  with input as (
    select
      public.normalize_event_search_text(search_term) as term,
      greatest(coalesce(date_from, pg_catalog.now()), pg_catalog.now()) as effective_date_from
  ),
  alias_scores as (
    select
      ea.event_id,
      pg_catalog.max(
        case
          when public.normalize_event_search_text(ea.alias) = input.term then 96
          when public.normalize_event_search_text(ea.alias) like input.term || '%' then 82
          when public.normalize_event_search_text(ea.alias) like '%' || input.term || '%' then 68
          else public.similarity(public.normalize_event_search_text(ea.alias), input.term) * 58
        end
      ) as alias_score
    from public.event_aliases ea
    cross join input
    where input.term <> ''
      and (
        public.normalize_event_search_text(ea.alias) OPERATOR(public.%) input.term
        or public.normalize_event_search_text(ea.alias) like '%' || input.term || '%'
      )
    group by ea.event_id
  ),
  scored as (
    select
      e.id as event_id,
      e.title,
      e.artist_name,
      e.description,
      e.city,
      e.state,
      e.image_url,
      coalesce(es.venue_id, e.venue_id) as venue_id,
      coalesce(sv.name, ev.name) as venue_name,
      es.id as session_id,
      es.starts_at,
      es.status as session_status,
      greatest(
        case when public.normalize_event_search_text(e.title) = input.term then 100 else 0 end,
        case when public.normalize_event_search_text(e.artist_name) = input.term then 100 else 0 end,
        case when public.normalize_event_search_text(e.title) like input.term || '%' then 88 else 0 end,
        case when public.normalize_event_search_text(e.artist_name) like input.term || '%' then 88 else 0 end,
        case when public.normalize_event_search_text(e.title) like '%' || input.term || '%' then 68 else 0 end,
        case when public.normalize_event_search_text(e.artist_name) like '%' || input.term || '%' then 68 else 0 end,
        case when public.normalize_event_search_text(coalesce(e.description, '')) like '%' || input.term || '%' then 44 else 0 end,
        public.similarity(public.normalize_event_search_text(e.title), input.term) * 58,
        public.similarity(public.normalize_event_search_text(e.artist_name), input.term) * 62,
        public.similarity(public.normalize_event_search_text(coalesce(e.description, '')), input.term) * 34,
        coalesce(alias_scores.alias_score, 0)
      )::numeric as score
    from public.events e
    join public.event_sessions es on es.event_id = e.id
    left join public.venues ev on ev.id = e.venue_id
    left join public.venues sv on sv.id = es.venue_id
    left join alias_scores on alias_scores.event_id = e.id
    cross join input
    where input.term <> ''
      and e.status = 'published'
      and es.status in ('scheduled', 'sales_open')
      and es.starts_at >= input.effective_date_from
      and (date_to is null or es.starts_at < date_to)
      and (
        public.normalize_event_search_text(e.title) OPERATOR(public.%) input.term
        or public.normalize_event_search_text(e.artist_name) OPERATOR(public.%) input.term
        or public.normalize_event_search_text(coalesce(e.description, '')) OPERATOR(public.%) input.term
        or public.normalize_event_search_text(e.title) like '%' || input.term || '%'
        or public.normalize_event_search_text(e.artist_name) like '%' || input.term || '%'
        or public.normalize_event_search_text(coalesce(e.description, '')) like '%' || input.term || '%'
        or alias_scores.alias_score is not null
      )
  )
  select *
  from scored
  where score >= 14
  order by score desc, starts_at asc, event_id asc
  limit greatest(1, least(coalesce(result_limit, 20), 50));
$function$;

CREATE OR REPLACE FUNCTION public.set_updated_at()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
begin
  new.updated_at = pg_catalog.now();
  return new;
end;
$function$;

CREATE OR REPLACE FUNCTION public.validate_ticket_entry(p_ticket_id uuid, p_ticket_code text, p_gate_session_id uuid DEFAULT NULL::uuid, p_gate_label text DEFAULT NULL::text, p_validator_identifier text DEFAULT NULL::text, p_metadata jsonb DEFAULT '{}'::jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare
  v_now timestamptz := pg_catalog.now();
  v_ticket record;
  v_gate_session record;
  v_result text;
  v_message text;
  v_allowed boolean := false;
  v_used_at timestamptz;
  v_return_ticket boolean := true;
begin
  if p_ticket_id is null then
    raise exception 'ticket_id_required';
  end if;

  if p_ticket_code is null or pg_catalog.btrim(p_ticket_code) = '' then
    raise exception 'ticket_code_required';
  end if;

  if p_metadata is null then
    raise exception 'metadata_required';
  end if;

  if p_gate_session_id is not null then
    select
      gs.id,
      gs.event_id,
      gs.session_id,
      gs.status,
      gs.expires_at
    into v_gate_session
    from public.gate_sessions gs
    where gs.id = p_gate_session_id;
  end if;

  select
    t.id,
    t.ticket_code,
    t.status,
    t.used_at,
    t.session_id,
    es.event_id,
    es.starts_at,
    e.title as event_title,
    vs.name as section_name,
    ri.seat_code
  into v_ticket
  from public.tickets t
  left join public.event_sessions es on es.id = t.session_id
  left join public.events e on e.id = es.event_id
  left join public.venue_sections vs on vs.id = t.section_id
  left join public.reservation_items ri on ri.id = t.reservation_item_id
  where t.id = p_ticket_id
    and t.ticket_code = pg_catalog.btrim(p_ticket_code)
  for update of t;

  if v_ticket.id is null then
    v_result := 'not_found';
    v_message := 'Ingresso não encontrado ou inválido.';
    v_return_ticket := false;

    insert into public.ticket_validation_events (
      ticket_code,
      gate_session_id,
      result,
      gate_label,
      validator_identifier,
      metadata
    )
    values (
      pg_catalog.btrim(p_ticket_code),
      p_gate_session_id,
      v_result,
      p_gate_label,
      p_validator_identifier,
      p_metadata
    );

    return pg_catalog.jsonb_build_object(
      'allowed', false,
      'result', v_result,
      'message', v_message
    );
  end if;

  if
    p_gate_session_id is not null
    and v_gate_session.id is not null
    and v_gate_session.event_id is not null
    and v_ticket.event_id is distinct from v_gate_session.event_id
  then
    v_result := 'wrong_event';
    v_message := 'INGRESSO DE OUTRO EVENTO';
    v_used_at := v_ticket.used_at;
    v_return_ticket := false;
  elsif
    p_gate_session_id is not null
    and v_gate_session.id is not null
    and v_gate_session.session_id is not null
    and v_ticket.session_id is distinct from v_gate_session.session_id
  then
    v_result := 'wrong_session';
    v_message := 'INGRESSO DE OUTRA SESSÃO';
    v_used_at := v_ticket.used_at;
    v_return_ticket := false;
  elsif v_ticket.status = 'issued' then
    update public.tickets
    set
      status = 'used',
      used_at = v_now,
      updated_at = v_now
    where id = v_ticket.id;

    v_result := 'allowed';
    v_message := 'Entrada liberada.';
    v_allowed := true;
    v_used_at := v_now;
  elsif v_ticket.status = 'used' then
    v_result := 'already_used';
    v_message := 'Ingresso já utilizado.';
    v_used_at := v_ticket.used_at;
  elsif v_ticket.status = 'cancelled' then
    v_result := 'cancelled';
    v_message := 'Ingresso cancelado.';
    v_used_at := v_ticket.used_at;
  else
    v_result := 'denied';
    v_message := 'Ingresso não disponível para entrada.';
    v_used_at := v_ticket.used_at;
  end if;

  insert into public.ticket_validation_events (
    ticket_id,
    ticket_code,
    gate_session_id,
    result,
    gate_label,
    validator_identifier,
    metadata
  )
  values (
    v_ticket.id,
    v_ticket.ticket_code,
    p_gate_session_id,
    v_result,
    p_gate_label,
    p_validator_identifier,
    p_metadata
  );

  return pg_catalog.jsonb_strip_nulls(pg_catalog.jsonb_build_object(
    'allowed', v_allowed,
    'result', v_result,
    'message', v_message,
    'ticket', case when v_return_ticket then pg_catalog.jsonb_strip_nulls(pg_catalog.jsonb_build_object(
      'ticketId', v_ticket.id,
      'ticketCode', v_ticket.ticket_code,
      'status', case when v_allowed then 'used' else v_ticket.status end,
      'usedAt', v_used_at,
      'eventTitle', v_ticket.event_title,
      'startsAt', v_ticket.starts_at,
      'sectionName', v_ticket.section_name,
      'seatCode', v_ticket.seat_code
    )) else null end
  ));
end;
$function$;

revoke all privileges on function public.set_updated_at() from public;
revoke all privileges on function public.set_updated_at() from anon;
revoke all privileges on function public.set_updated_at() from authenticated;
grant execute on function public.set_updated_at() to service_role;

revoke all privileges on function public.normalize_event_search_text(text) from public;
revoke all privileges on function public.normalize_event_search_text(text) from anon;
revoke all privileges on function public.normalize_event_search_text(text) from authenticated;
grant execute on function public.normalize_event_search_text(text) to service_role;

revoke all privileges on function public.enforce_one_active_reservation_per_customer() from public;
revoke all privileges on function public.enforce_one_active_reservation_per_customer() from anon;
revoke all privileges on function public.enforce_one_active_reservation_per_customer() from authenticated;
grant execute on function public.enforce_one_active_reservation_per_customer() to service_role;
