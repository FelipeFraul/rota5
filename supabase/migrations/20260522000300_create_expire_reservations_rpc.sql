-- expire_reservations releases only expired active reservations.
-- It uses FOR UPDATE SKIP LOCKED so parallel jobs can run without processing the same reservation twice.
create or replace function public.expire_reservations(
  p_limit integer default 100
)
returns jsonb
language plpgsql
as $$
declare
  v_now timestamptz := now();
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

  select coalesce(array_agg(locked_reservations.id order by locked_reservations.expires_at, locked_reservations.id), array[]::uuid[])
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

  if cardinality(v_reservation_ids) = 0 then
    return jsonb_build_object(
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

  return jsonb_build_object(
    'expired_reservations_count', v_expired_reservations_count,
    'released_seats_count', v_released_seats_count,
    'expired_order_count', v_expired_order_count,
    'reservation_ids', to_jsonb(v_reservation_ids)
  );
end;
$$;

comment on function public.expire_reservations(integer)
is 'Expires active reservations past expires_at, releases only matching reserved session seats, and expires draft/pending orders. Does not touch paid reservations.';

revoke all on function public.expire_reservations(integer) from public;
revoke all on function public.expire_reservations(integer) from anon;
revoke all on function public.expire_reservations(integer) from authenticated;
grant execute on function public.expire_reservations(integer) to service_role;
