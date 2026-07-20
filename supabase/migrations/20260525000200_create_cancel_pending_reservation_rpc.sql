-- cancel_pending_reservation releases only an active unpaid reservation owned by the customer.
-- It is the transactional counterpart to expire_reservations for buyer-initiated cancellation.
create or replace function public.cancel_pending_reservation(
  p_reservation_id uuid,
  p_customer_id uuid default null,
  p_reason text default 'buyer_cancelled'
)
returns jsonb
language plpgsql
as $$
declare
  v_now timestamptz := now();
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
    return jsonb_build_object(
      'status', 'not_found',
      'cancelled_reservations_count', 0,
      'released_seats_count', 0,
      'cancelled_orders_count', 0
    );
  end if;

  if p_customer_id is not null and v_reservation.customer_id <> p_customer_id then
    return jsonb_build_object(
      'status', 'not_found',
      'cancelled_reservations_count', 0,
      'released_seats_count', 0,
      'cancelled_orders_count', 0
    );
  end if;

  if v_reservation.status <> 'active' then
    return jsonb_build_object(
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
    return jsonb_build_object(
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

  return jsonb_build_object(
    'status', 'cancelled',
    'reason', coalesce(nullif(btrim(p_reason), ''), 'buyer_cancelled'),
    'cancelled_reservations_count', v_cancelled_reservations_count,
    'released_seats_count', v_released_seats_count,
    'cancelled_orders_count', v_cancelled_orders_count
  );
end;
$$;

comment on function public.cancel_pending_reservation(uuid, uuid, text)
is 'Cancels an active unpaid reservation owned by the customer, releases only matching reserved session seats, and cancels draft/pending orders. Does not touch paid, sold, or blocked records.';

revoke all on function public.cancel_pending_reservation(uuid, uuid, text) from public;
revoke all on function public.cancel_pending_reservation(uuid, uuid, text) from anon;
revoke all on function public.cancel_pending_reservation(uuid, uuid, text) from authenticated;
grant execute on function public.cancel_pending_reservation(uuid, uuid, text) to service_role;
