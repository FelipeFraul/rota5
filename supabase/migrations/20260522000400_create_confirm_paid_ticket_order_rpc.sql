create unique index if not exists payments_provider_payment_id_unique_idx
on public.payments(provider, provider_payment_id)
where provider_payment_id is not null;

-- confirm_paid_ticket_order is called only after a real payment approval from the gateway.
-- It is transactional and idempotent: paid orders return existing tickets instead of issuing duplicates.
create or replace function public.confirm_paid_ticket_order(
  p_order_id uuid,
  p_provider text,
  p_provider_payment_id text,
  p_amount_cents integer,
  p_paid_at timestamptz default now(),
  p_raw_metadata jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
as $$
declare
  v_now timestamptz := now();
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

  if p_provider is null or btrim(p_provider) = '' then
    raise exception 'provider_required';
  end if;

  if p_provider_payment_id is null or btrim(p_provider_payment_id) = '' then
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

  v_provider := btrim(p_provider);
  v_provider_payment_id := btrim(p_provider_payment_id);

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
      coalesce(jsonb_agg(
        jsonb_build_object(
          'ticket_id', t.id,
          'ticket_code', t.ticket_code,
          'reservation_item_id', t.reservation_item_id,
          'seat_id', t.seat_id,
          'seat_code', ri.seat_code,
          'section_id', t.section_id
        )
        order by ri.seat_code
      ), '[]'::jsonb),
      count(t.id)::integer
    into v_tickets, v_tickets_count
    from public.tickets t
    join public.reservation_items ri
      on ri.id = t.reservation_item_id
    where t.order_id = p_order_id;

    return jsonb_build_object(
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

  select count(*)::integer
  into v_item_count
  from public.reservation_items
  where reservation_id = v_reservation.id;

  if v_item_count = 0 then
    raise exception 'reservation_items_not_found';
  end if;

  -- Seats turn sold only if they are still reserved for this exact reservation.
  select count(*)::integer
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

  select count(*)::integer
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
    'TCK-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 12)),
    encode(digest(gen_random_uuid()::text || clock_timestamp()::text || ri.id::text, 'sha256'), 'hex'),
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
    coalesce(jsonb_agg(
      jsonb_build_object(
        'ticket_id', t.id,
        'ticket_code', t.ticket_code,
        'reservation_item_id', t.reservation_item_id,
        'seat_id', t.seat_id,
        'seat_code', ri.seat_code,
        'section_id', t.section_id
      )
      order by ri.seat_code
    ), '[]'::jsonb),
    count(t.id)::integer
  into v_tickets, v_tickets_count
  from public.tickets t
  join public.reservation_items ri
    on ri.id = t.reservation_item_id
  where t.order_id = p_order_id;

  return jsonb_build_object(
    'order_id', p_order_id,
    'reservation_id', v_reservation.id,
    'payment_id', v_payment_id,
    'status', 'paid',
    'idempotent', false,
    'tickets_count', v_tickets_count,
    'tickets', coalesce(v_tickets, '[]'::jsonb)
  );
end;
$$;

comment on function public.confirm_paid_ticket_order(uuid, text, text, integer, timestamptz, jsonb)
is 'Transactionally and idempotently confirms an approved gateway payment, marks order/reservation paid, sells reserved seats, and issues tickets without storing raw QR tokens.';

revoke all on function public.confirm_paid_ticket_order(uuid, text, text, integer, timestamptz, jsonb) from public;
revoke all on function public.confirm_paid_ticket_order(uuid, text, text, integer, timestamptz, jsonb) from anon;
revoke all on function public.confirm_paid_ticket_order(uuid, text, text, integer, timestamptz, jsonb) from authenticated;
grant execute on function public.confirm_paid_ticket_order(uuid, text, text, integer, timestamptz, jsonb) to service_role;
