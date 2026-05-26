alter table public.courtesies
add column if not exists beneficiary_name text null,
add column if not exists reason text null,
add column if not exists cancelled_reason text null,
add column if not exists cancelled_by_admin_user_id uuid null references public.admin_users(id) on delete set null;

comment on column public.courtesies.beneficiary_name
is 'Optional display name captured when the courtesy is issued.';

comment on column public.courtesies.reason
is 'Optional administrative reason for the courtesy. No secrets or QR data.';

comment on column public.courtesies.cancelled_reason
is 'Optional administrative reason for courtesy cancellation.';

-- issue_courtesy_order closes a zero-value reservation as a courtesy without creating a payment row.
-- It is intentionally separate from confirm_paid_ticket_order, which remains Mercado Pago only.
create or replace function public.issue_courtesy_order(
  p_order_id uuid,
  p_issued_by_admin_user_id uuid,
  p_issued_by_admin_phone text,
  p_beneficiary_name text default null,
  p_reason text default null
)
returns jsonb
language plpgsql
as $$
declare
  v_now timestamptz := now();
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

  if p_issued_by_admin_phone is null or btrim(p_issued_by_admin_phone) = '' then
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

  select count(*)::integer
  into v_item_count
  from public.reservation_items
  where reservation_id = v_reservation.id;

  if v_item_count = 0 then
    raise exception 'reservation_items_not_found';
  end if;

  select count(*)::integer
  into v_zero_value_item_count
  from public.reservation_items
  where reservation_id = v_reservation.id
    and ticket_type = 'free'
    and price_cents = 0
    and fee_cents = 0;

  if v_zero_value_item_count <> v_item_count then
    raise exception 'courtesy_items_must_be_free';
  end if;

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

  if p_beneficiary_name is not null and btrim(p_beneficiary_name) <> '' then
    update public.customers
    set
      name = btrim(p_beneficiary_name),
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
    nullif(btrim(coalesce(p_beneficiary_name, '')), ''),
    nullif(btrim(coalesce(p_reason, '')), ''),
    p_issued_by_admin_user_id,
    btrim(p_issued_by_admin_phone),
    'issued'
  from public.tickets t
  where t.order_id = p_order_id
  order by t.ticket_code;

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
    'status', 'paid',
    'idempotent', false,
    'tickets_count', v_tickets_count,
    'tickets', coalesce(v_tickets, '[]'::jsonb)
  );
end;
$$;

comment on function public.issue_courtesy_order(uuid, uuid, text, text, text)
is 'Transactionally issues zero-value courtesy tickets without creating Mercado Pago/payment rows.';

revoke all on function public.issue_courtesy_order(uuid, uuid, text, text, text) from public;
revoke all on function public.issue_courtesy_order(uuid, uuid, text, text, text) from anon;
revoke all on function public.issue_courtesy_order(uuid, uuid, text, text, text) from authenticated;
grant execute on function public.issue_courtesy_order(uuid, uuid, text, text, text) to service_role;
