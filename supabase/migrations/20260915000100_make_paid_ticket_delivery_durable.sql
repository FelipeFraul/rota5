-- Make paid ticket delivery durable without backfilling historical orders.

alter table public.whatsapp_outbound_deliveries
  add column if not exists next_attempt_at timestamptz,
  add column if not exists lease_expires_at timestamptz,
  add column if not exists dead_letter_at timestamptz,
  add column if not exists claim_token uuid;

alter table public.whatsapp_outbound_deliveries
  drop constraint if exists whatsapp_outbound_deliveries_status_check;

alter table public.whatsapp_outbound_deliveries
  add constraint whatsapp_outbound_deliveries_status_check check (
    status in ('pending', 'sending', 'sent', 'failed', 'dead_letter', 'superseded')
  );

create index if not exists whatsapp_outbound_deliveries_paid_ticket_due_idx
on public.whatsapp_outbound_deliveries (
  status,
  next_attempt_at,
  lease_expires_at,
  created_at
)
where reason in (
  'paid_ticket_delivery',
  'paid_ticket_delivery_choice',
  'paid_ticket_qr_instruction',
  'paid_ticket_qr_delivery'
);

create or replace function public.ensure_paid_ticket_delivery_intents(
  p_order_id uuid,
  p_full_delivery boolean default false
)
returns integer
language plpgsql
security invoker
set search_path = ''
as $function$
declare
  v_order record;
  v_expected record;
  v_existing public.whatsapp_outbound_deliveries%rowtype;
  v_expected_context jsonb;
  v_count integer := 0;
begin
  if p_order_id is null then
    raise exception 'order_id_required';
  end if;

  perform 1
  from public.orders
  where id = p_order_id
  for update;

  select
    o.id,
    o.customer_id,
    o.status,
    r.conversation_id,
    r.session_id,
    es.event_id,
    c.whatsapp_phone,
    pg_catalog.count(t.id)::integer as ticket_count
  into v_order
  from public.orders o
  join public.reservations r on r.id = o.reservation_id
  join public.event_sessions es on es.id = r.session_id
  join public.customers c on c.id = o.customer_id
  left join public.tickets t on t.order_id = o.id
  where o.id = p_order_id
  group by
    o.id,
    o.customer_id,
    o.status,
    r.conversation_id,
    r.session_id,
    es.event_id,
    c.whatsapp_phone;

  if v_order.id is null then
    raise exception 'order_not_found';
  end if;

  if v_order.status <> 'paid' then
    raise exception 'paid_order_required';
  end if;

  if v_order.ticket_count = 0 then
    raise exception 'tickets_not_found';
  end if;

  if v_order.ticket_count > 1 and p_full_delivery then
    select *
    into v_existing
    from public.whatsapp_outbound_deliveries
    where idempotency_key = 'paid-ticket-order:' || p_order_id::text || ':delivery-choice:v1'
    for update;

    if v_existing.id is not null then
      if v_existing.customer_id <> v_order.customer_id
        or v_existing.reason <> 'paid_ticket_delivery_choice'
        or v_existing.message_type <> 'text'
        or coalesce(v_existing.business_context->>'order_id', '') <> p_order_id::text
      then
        raise exception 'paid_ticket_delivery_intent_collision:%', v_existing.idempotency_key;
      end if;

      if v_existing.status = 'sending'
        and v_existing.lease_expires_at > pg_catalog.now()
      then
        raise exception 'paid_ticket_delivery_choice_in_progress';
      end if;

      if v_existing.status in ('pending', 'failed', 'dead_letter')
        or (
          v_existing.status = 'sending'
          and (
            v_existing.lease_expires_at is null
            or v_existing.lease_expires_at <= pg_catalog.now()
          )
        )
      then
        update public.whatsapp_outbound_deliveries
        set
          status = 'superseded',
          claim_token = null,
          lease_expires_at = null,
          next_attempt_at = null,
          last_error = null,
          updated_at = pg_catalog.now()
        where id = v_existing.id;
      end if;
    end if;
  end if;

  for v_expected in
    select *
    from (
      select
        'paid-ticket-order:' || p_order_id::text || ':delivery-choice:v1' as idempotency_key,
        'text'::text as message_type,
        'paid_ticket_delivery_choice'::text as reason,
        null::uuid as ticket_id,
        1 as delivery_order
      where v_order.ticket_count > 1 and not p_full_delivery

      union all

      select
        'paid-ticket-order:' || p_order_id::text || ':text:v1',
        'text',
        'paid_ticket_delivery',
        null::uuid,
        1
      where v_order.ticket_count = 1 or p_full_delivery

      union all

      select
        'paid-ticket-order:' || p_order_id::text || ':qr-instruction:v1',
        'text',
        'paid_ticket_qr_instruction',
        null::uuid,
        2
      where v_order.ticket_count = 1 or p_full_delivery

      union all

      select
        'paid-ticket:' || t.id::text || ':qr:v1',
        'image',
        'paid_ticket_qr_delivery',
        t.id,
        3 + pg_catalog.row_number() over (order by ri.seat_code, t.id)::integer
      from public.tickets t
      join public.reservation_items ri on ri.id = t.reservation_item_id
      where t.order_id = p_order_id
        and (v_order.ticket_count = 1 or p_full_delivery)
    ) expected
    order by delivery_order, idempotency_key
  loop
    v_expected_context := pg_catalog.jsonb_strip_nulls(
      pg_catalog.jsonb_build_object(
        'order_id', p_order_id,
        'ticket_id', v_expected.ticket_id,
        'customer_id', v_order.customer_id,
        'session_id', v_order.session_id,
        'event_id', v_order.event_id,
        'eventId', v_order.event_id,
        'tickets_count', v_order.ticket_count,
        'delivery_order', v_expected.delivery_order
      )
    );

    insert into public.whatsapp_outbound_deliveries (
      idempotency_key,
      customer_id,
      conversation_id,
      recipient_phone,
      message_type,
      reason,
      business_context,
      status
    ) values (
      v_expected.idempotency_key,
      v_order.customer_id,
      v_order.conversation_id,
      v_order.whatsapp_phone,
      v_expected.message_type,
      v_expected.reason,
      v_expected_context,
      'pending'
    )
    on conflict (idempotency_key) do nothing;

    select *
    into v_existing
    from public.whatsapp_outbound_deliveries
    where idempotency_key = v_expected.idempotency_key
    for update;

    if v_existing.id is null
      or v_existing.customer_id <> v_order.customer_id
      or v_existing.recipient_phone <> v_order.whatsapp_phone
      or v_existing.message_type <> v_expected.message_type
      or v_existing.reason <> v_expected.reason
      or coalesce(v_existing.business_context->>'order_id', '') <> p_order_id::text
      or (
        v_expected.ticket_id is not null
        and coalesce(v_existing.business_context->>'ticket_id', '') <> v_expected.ticket_id::text
      )
      or (
        v_existing.business_context ? 'customer_id'
        and v_existing.business_context->>'customer_id' <> v_order.customer_id::text
      )
      or (
        v_existing.business_context ? 'session_id'
        and v_existing.business_context->>'session_id' <> v_order.session_id::text
      )
      or (
        v_existing.business_context ? 'event_id'
        and v_existing.business_context->>'event_id' <> v_order.event_id::text
      )
    then
      raise exception 'paid_ticket_delivery_intent_collision:%', v_expected.idempotency_key;
    end if;

    update public.whatsapp_outbound_deliveries
    set
      conversation_id = coalesce(conversation_id, v_order.conversation_id),
      business_context = business_context || v_expected_context,
      updated_at = pg_catalog.now()
    where id = v_existing.id;

    v_count := v_count + 1;
  end loop;

  return v_count;
end;
$function$;

-- Preserve the previously audited confirmation core and put replay validation
-- plus durable intent creation around it in the same database transaction.
alter function public.confirm_paid_ticket_order(uuid, text, text, integer, timestamptz, jsonb)
  rename to confirm_paid_ticket_order_core_20260722;

revoke all privileges
on function public.confirm_paid_ticket_order_core_20260722(uuid, text, text, integer, timestamptz, jsonb)
from public, anon, authenticated, service_role;

create function public.confirm_paid_ticket_order(
  p_order_id uuid,
  p_provider text,
  p_provider_payment_id text,
  p_amount_cents integer,
  p_paid_at timestamptz default pg_catalog.now(),
  p_raw_metadata jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_order_status text;
  v_payment record;
  v_result jsonb;
begin
  if p_order_id is null then
    raise exception 'order_id_required';
  end if;

  if p_provider is null or pg_catalog.btrim(p_provider) = '' then
    raise exception 'provider_required';
  end if;

  if pg_catalog.btrim(p_provider) <> 'mercado_pago' then
    raise exception 'provider_not_supported';
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

  select status
  into v_order_status
  from public.orders
  where id = p_order_id
  for update;

  if v_order_status = 'paid' then
    select id, amount_cents
    into v_payment
    from public.payments
    where order_id = p_order_id
      and provider = pg_catalog.btrim(p_provider)
      and provider_payment_id = pg_catalog.btrim(p_provider_payment_id)
      and status = 'approved'
    limit 1
    for update;

    if v_payment.id is null then
      raise exception 'order_already_paid_with_different_payment';
    end if;

    if v_payment.amount_cents <> p_amount_cents then
      raise exception 'payment_replay_amount_mismatch';
    end if;
  end if;

  v_result := public.confirm_paid_ticket_order_core_20260722(
    p_order_id,
    p_provider,
    p_provider_payment_id,
    p_amount_cents,
    p_paid_at,
    p_raw_metadata
  );

  perform public.ensure_paid_ticket_delivery_intents(p_order_id, false);
  return v_result;
end;
$function$;

create or replace function public.claim_whatsapp_outbound_delivery(p_delivery_id uuid)
returns setof public.whatsapp_outbound_deliveries
language sql
security invoker
set search_path = ''
as $function$
  update public.whatsapp_outbound_deliveries as delivery
  set
    status = 'sending',
    claimed_at = pg_catalog.now(),
    lease_expires_at = pg_catalog.now() + pg_catalog.make_interval(secs => 300),
    claim_token = pg_catalog.gen_random_uuid(),
    attempt_count = delivery.attempt_count + 1,
    next_attempt_at = null,
    updated_at = pg_catalog.now()
  where delivery.id = p_delivery_id
    and (
      (
        delivery.reason in (
          'paid_ticket_delivery',
          'paid_ticket_delivery_choice',
          'paid_ticket_qr_instruction',
          'paid_ticket_qr_delivery'
        )
        and delivery.attempt_count < 5
        and (
          (
            delivery.status in ('pending', 'failed')
            and (delivery.next_attempt_at is null or delivery.next_attempt_at <= pg_catalog.now())
          )
          or (
            delivery.status = 'sending'
            and (
              delivery.lease_expires_at is null
              or delivery.lease_expires_at <= pg_catalog.now()
            )
          )
        )
      )
      or (
        delivery.reason not in (
          'paid_ticket_delivery',
          'paid_ticket_delivery_choice',
          'paid_ticket_qr_instruction',
          'paid_ticket_qr_delivery'
        )
        and delivery.status in ('pending', 'failed')
      )
    )
  returning delivery.*;
$function$;

create or replace function public.mark_whatsapp_outbound_delivery_sent(
  p_delivery_id uuid,
  p_claim_token uuid,
  p_provider_message_id text default null
)
returns setof public.whatsapp_outbound_deliveries
language sql
security invoker
set search_path = ''
as $function$
  update public.whatsapp_outbound_deliveries as delivery
  set
    status = 'sent',
    provider_message_id = p_provider_message_id,
    last_error = null,
    lease_expires_at = null,
    claim_token = null,
    next_attempt_at = null,
    sent_at = pg_catalog.now(),
    updated_at = pg_catalog.now()
  where delivery.id = p_delivery_id
    and delivery.status = 'sending'
    and delivery.claim_token = p_claim_token
  returning delivery.*;
$function$;

create or replace function public.mark_whatsapp_outbound_delivery_failed(
  p_delivery_id uuid,
  p_claim_token uuid,
  p_error text
)
returns setof public.whatsapp_outbound_deliveries
language sql
security invoker
set search_path = ''
as $function$
  update public.whatsapp_outbound_deliveries as delivery
  set
    status = case when delivery.attempt_count >= 5 then 'dead_letter' else 'failed' end,
    last_error = pg_catalog.left(coalesce(p_error, 'delivery_failed'), 1000),
    lease_expires_at = null,
    claim_token = null,
    next_attempt_at = case
      when delivery.attempt_count >= 5 then null
      else pg_catalog.now() + case delivery.attempt_count
        when 1 then interval '1 minute'
        when 2 then interval '5 minutes'
        when 3 then interval '15 minutes'
        else interval '1 hour'
      end
    end,
    dead_letter_at = case
      when delivery.attempt_count >= 5 then pg_catalog.now()
      else delivery.dead_letter_at
    end,
    updated_at = pg_catalog.now()
  where delivery.id = p_delivery_id
    and delivery.status = 'sending'
    and delivery.claim_token = p_claim_token
  returning delivery.*;
$function$;

create or replace function public.list_due_paid_ticket_delivery_orders(
  p_limit integer default 20
)
returns table(order_id uuid, delivery_mode text)
language sql
security invoker
set search_path = ''
as $function$
  with ticket_deliveries as (
    select
      delivery.*,
      (delivery.business_context->>'order_id')::uuid as intent_order_id,
      case
        when delivery.business_context->>'delivery_order' ~ '^[0-9]+$'
          then (delivery.business_context->>'delivery_order')::integer
        when delivery.reason in ('paid_ticket_delivery', 'paid_ticket_delivery_choice') then 1
        when delivery.reason = 'paid_ticket_qr_instruction' then 2
        else 3
      end as intent_delivery_order
    from public.whatsapp_outbound_deliveries delivery
    where delivery.reason in (
        'paid_ticket_delivery',
        'paid_ticket_delivery_choice',
        'paid_ticket_qr_instruction',
        'paid_ticket_qr_delivery'
      )
      and delivery.business_context->>'order_id' ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
  ),
  first_incomplete as (
    select distinct on (delivery.intent_order_id)
      delivery.*
    from ticket_deliveries delivery
    where delivery.status not in ('sent', 'superseded')
    order by
      delivery.intent_order_id,
      delivery.intent_delivery_order,
      delivery.created_at,
      delivery.id
  )
  select
    delivery.intent_order_id as order_id,
    case
      when delivery.reason = 'paid_ticket_delivery_choice' then 'choice'
      else 'full'
    end as delivery_mode
  from first_incomplete delivery
  where delivery.attempt_count < 5
    and (
      (
        delivery.status in ('pending', 'failed')
        and (delivery.next_attempt_at is null or delivery.next_attempt_at <= pg_catalog.now())
      )
      or (
        delivery.status = 'sending'
        and (
          delivery.lease_expires_at is null
          or delivery.lease_expires_at <= pg_catalog.now()
        )
      )
    )
  order by coalesce(delivery.next_attempt_at, delivery.lease_expires_at, delivery.created_at)
  limit greatest(0, least(coalesce(p_limit, 20), 100));
$function$;

create or replace function public.get_paid_ticket_delivery_queue_counts()
returns jsonb
language sql
security invoker
set search_path = ''
as $function$
  select pg_catalog.jsonb_build_object(
    'pending_due', pg_catalog.count(*) filter (
      where status = 'pending' and (next_attempt_at is null or next_attempt_at <= pg_catalog.now())
    ),
    'failed_due', pg_catalog.count(*) filter (
      where status = 'failed' and (next_attempt_at is null or next_attempt_at <= pg_catalog.now())
    ),
    'failed', pg_catalog.count(*) filter (where status = 'failed'),
    'sending_active', pg_catalog.count(*) filter (
      where status = 'sending' and lease_expires_at > pg_catalog.now()
    ),
    'sending_expired', pg_catalog.count(*) filter (
      where status = 'sending'
        and (lease_expires_at is null or lease_expires_at <= pg_catalog.now())
    ),
    'dead_letter', pg_catalog.count(*) filter (where status = 'dead_letter'),
    'sent', pg_catalog.count(*) filter (where status = 'sent')
  )
  from public.whatsapp_outbound_deliveries
  where reason in (
    'paid_ticket_delivery',
    'paid_ticket_delivery_choice',
    'paid_ticket_qr_instruction',
    'paid_ticket_qr_delivery'
  );
$function$;

revoke all privileges on function public.ensure_paid_ticket_delivery_intents(uuid, boolean) from public, anon, authenticated;
revoke all privileges on function public.confirm_paid_ticket_order(uuid, text, text, integer, timestamptz, jsonb) from public, anon, authenticated;
revoke all privileges on function public.claim_whatsapp_outbound_delivery(uuid) from public, anon, authenticated;
revoke all privileges on function public.mark_whatsapp_outbound_delivery_sent(uuid, uuid, text) from public, anon, authenticated;
revoke all privileges on function public.mark_whatsapp_outbound_delivery_failed(uuid, uuid, text) from public, anon, authenticated;
revoke all privileges on function public.list_due_paid_ticket_delivery_orders(integer) from public, anon, authenticated;
revoke all privileges on function public.get_paid_ticket_delivery_queue_counts() from public, anon, authenticated;

grant execute on function public.ensure_paid_ticket_delivery_intents(uuid, boolean) to service_role;
grant execute on function public.confirm_paid_ticket_order(uuid, text, text, integer, timestamptz, jsonb) to service_role;
grant execute on function public.claim_whatsapp_outbound_delivery(uuid) to service_role;
grant execute on function public.mark_whatsapp_outbound_delivery_sent(uuid, uuid, text) to service_role;
grant execute on function public.mark_whatsapp_outbound_delivery_failed(uuid, uuid, text) to service_role;
grant execute on function public.list_due_paid_ticket_delivery_orders(integer) to service_role;
grant execute on function public.get_paid_ticket_delivery_queue_counts() to service_role;
