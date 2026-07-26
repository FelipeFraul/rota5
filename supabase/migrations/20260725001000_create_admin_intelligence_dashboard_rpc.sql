create or replace function public.get_admin_intelligence_dashboard(
  p_admin_user_id uuid,
  p_event_id uuid default null,
  p_comparison_days integer default 30,
  p_timezone text default 'America/Sao_Paulo'
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_admin public.admin_users%rowtype;
  v_days integer := case
    when p_comparison_days in (7, 15, 30, 60, 90) then p_comparison_days
    else 30
  end;
  v_now timestamptz := now();
  v_today date := (now() at time zone coalesce(nullif(p_timezone, ''), 'America/Sao_Paulo'))::date;
  v_range_start timestamptz;
  v_range_end timestamptz;
  v_comp_start timestamptz;
  v_comp_end timestamptz;
  v_selected_event_id uuid;
  v_payload jsonb;
begin
  select *
    into v_admin
  from public.admin_users
  where id = p_admin_user_id
    and status = 'active'
    and role in ('root', 'admin');

  if not found then
    return jsonb_build_object('ok', false, 'reason', 'forbidden');
  end if;

  v_range_start := ((v_today - (v_days - 1))::timestamp at time zone coalesce(nullif(p_timezone, ''), 'America/Sao_Paulo'));
  v_range_end := ((v_today + 1)::timestamp at time zone coalesce(nullif(p_timezone, ''), 'America/Sao_Paulo'));
  v_comp_start := v_range_start - make_interval(days => v_days);
  v_comp_end := v_range_start;

  with accessible_events as (
    select
      e.id,
      e.title,
      e.artist_name,
      e.status,
      e.created_by_admin_user_id,
      min(es.starts_at) as starts_at,
      min(es.starts_at) filter (where es.starts_at >= v_now) as next_starts_at,
      bool_or(es.starts_at <= v_now and es.starts_at >= v_now - interval '8 hours' and es.status <> 'cancelled') as recently_started
    from public.events e
    left join public.event_sessions es on es.event_id = e.id
    where v_admin.role = 'root' or e.created_by_admin_user_id = v_admin.id
    group by e.id
  ),
  ordered_events as (
    select *
    from accessible_events
    order by
      case when status = 'published' then 0 else 1 end,
      case when recently_started then 0 else 1 end,
      coalesce(next_starts_at, starts_at, '9999-12-31'::timestamptz),
      case when status = 'finished' then 1 else 0 end,
      title
  )
  select coalesce(
    case
      when p_event_id is not null then (
        select id from ordered_events where id = p_event_id
      )
      else (
        select id from ordered_events limit 1
      )
    end,
    null
  )
    into v_selected_event_id;

  if p_event_id is not null and v_selected_event_id is null then
    return jsonb_build_object('ok', false, 'reason', 'event_forbidden');
  end if;

  with accessible_events as (
    select
      e.id,
      e.title,
      e.artist_name,
      e.status,
      min(es.starts_at) as starts_at,
      min(es.starts_at) filter (where es.starts_at >= v_now) as next_starts_at,
      bool_or(es.starts_at <= v_now and es.starts_at >= v_now - interval '8 hours' and es.status <> 'cancelled') as recently_started
    from public.events e
    left join public.event_sessions es on es.event_id = e.id
    where v_admin.role = 'root' or e.created_by_admin_user_id = v_admin.id
    group by e.id
  ),
  event_scope as (
    select *
    from accessible_events
    where id = v_selected_event_id
  ),
  day_series as (
    select generate_series(v_range_start, v_range_end - interval '1 day', interval '1 day')::date as day_key
  ),
  ticket_base as (
    select
      t.id,
      t.ticket_code,
      t.status,
      t.issued_at,
      t.used_at,
      t.recipient_phone,
      t.participant_delivery_status,
      t.order_id,
      t.session_id,
      t.section_id,
      t.reservation_item_id,
      o.customer_id,
      o.status as order_status,
      coalesce(ri.ticket_type, 'full') as ticket_type,
      coalesce(ri.price_cents, 0) + coalesce(ri.fee_cents, 0) as amount_cents,
      ri.seat_code,
      vs.name as section_name,
      c.name as customer_name,
      (
        select max(p.paid_at)
        from public.payments p
        where p.order_id = o.id and p.status = 'approved'
      ) as paid_at
    from public.tickets t
    join public.event_sessions es on es.id = t.session_id and es.event_id = v_selected_event_id
    join public.orders o on o.id = t.order_id
    left join public.reservation_items ri on ri.id = t.reservation_item_id
    left join public.venue_sections vs on vs.id = t.section_id
    left join public.customers c on c.id = o.customer_id
  ),
  ticket_paid as (
    select *
    from ticket_base
    where order_status = 'paid'
      and status <> 'cancelled'
      and ticket_type <> 'free'
      and amount_cents > 0
  ),
  ticket_revenue_payments as (
    select
      p.id,
      p.order_id,
      p.provider,
      p.status,
      p.amount_cents,
      p.paid_at,
      p.created_at,
      p.raw_metadata
    from public.payments p
    join public.orders o on o.id = p.order_id
    join public.reservations r on r.id = o.reservation_id
    join public.event_sessions es on es.id = r.session_id and es.event_id = v_selected_event_id
  ),
  combo_base as (
    select
      co.id,
      co.offer_id,
      co.customer_id,
      co.event_id,
      co.session_id,
      co.source_ticket_id,
      co.status,
      co.quantity,
      co.total_amount_cents,
      co.created_at,
      co.paid_at,
      co.checkout_expires_at,
      cof.name as offer_name
    from public.combo_orders co
    left join public.combo_offers cof on cof.id = co.offer_id
    where co.event_id = v_selected_event_id
  ),
  combo_revenue_payments as (
    select cp.*
    from public.combo_payments cp
    join combo_base co on co.id = cp.combo_order_id
  ),
  revenue_daily as (
    select
      (coalesce(p.paid_at, p.created_at) at time zone coalesce(nullif(p_timezone, ''), 'America/Sao_Paulo'))::date as day_key,
      coalesce(sum(p.amount_cents) filter (where p.status = 'approved'), 0)::int as ticket_revenue_cents,
      0::int as combo_revenue_cents
    from ticket_revenue_payments p
    where coalesce(p.paid_at, p.created_at) >= v_range_start
      and coalesce(p.paid_at, p.created_at) < v_range_end
    group by 1
    union all
    select
      (coalesce(cp.created_at, cb.paid_at, cb.created_at) at time zone coalesce(nullif(p_timezone, ''), 'America/Sao_Paulo'))::date as day_key,
      0::int,
      coalesce(sum(cp.amount_cents) filter (where cp.status = 'approved'), 0)::int
    from combo_revenue_payments cp
    join combo_base cb on cb.id = cp.combo_order_id
    where coalesce(cp.created_at, cb.paid_at, cb.created_at) >= v_range_start
      and coalesce(cp.created_at, cb.paid_at, cb.created_at) < v_range_end
    group by 1
  ),
  revenue_series as (
    select
      ds.day_key,
      coalesce(sum(rd.ticket_revenue_cents), 0)::int as ticket_revenue_cents,
      coalesce(sum(rd.combo_revenue_cents), 0)::int as combo_revenue_cents,
      (coalesce(sum(rd.ticket_revenue_cents), 0) + coalesce(sum(rd.combo_revenue_cents), 0))::int as total_revenue_cents
    from day_series ds
    left join revenue_daily rd on rd.day_key = ds.day_key
    group by ds.day_key
  ),
  ticket_series as (
    select
      ds.day_key,
      count(tp.id)::int as paid_tickets
    from day_series ds
    left join ticket_paid tp on (coalesce(tp.paid_at, tp.issued_at) at time zone coalesce(nullif(p_timezone, ''), 'America/Sao_Paulo'))::date = ds.day_key
    group by ds.day_key
  ),
  combo_series as (
    select
      ds.day_key,
      coalesce(sum(cb.quantity) filter (where cb.status = 'paid'), 0)::int as paid_items
    from day_series ds
    left join combo_base cb on (coalesce(cb.paid_at, cb.created_at) at time zone coalesce(nullif(p_timezone, ''), 'America/Sao_Paulo'))::date = ds.day_key
    group by ds.day_key
  ),
  whatsapp_messages_scoped as (
    select wm.*
    from public.whatsapp_messages wm
    where wm.created_at >= v_range_start
      and wm.created_at < v_range_end
      and exists (
        select 1
        from public.tickets t
        join public.orders o on o.id = t.order_id
        join public.event_sessions es on es.id = t.session_id and es.event_id = v_selected_event_id
        where t.customer_id = wm.customer_id or o.customer_id = wm.customer_id
      )
  ),
  whatsapp_series as (
    select
      ds.day_key,
      count(distinct wm.customer_id) filter (where wm.direction = 'inbound')::int as unique_contacts,
      count(*) filter (where wm.direction = 'inbound')::int as inbound_messages,
      count(*) filter (where wm.direction = 'outbound')::int as outbound_messages
    from day_series ds
    left join whatsapp_messages_scoped wm on (wm.created_at at time zone coalesce(nullif(p_timezone, ''), 'America/Sao_Paulo'))::date = ds.day_key
    group by ds.day_key
  ),
  ticket_validations as (
    select tve.*
    from public.ticket_validation_events tve
    left join public.tickets t on t.id = tve.ticket_id
    left join public.event_sessions es on es.id = t.session_id
    where (es.event_id = v_selected_event_id or tve.metadata->>'eventId' = v_selected_event_id::text)
      and tve.created_at >= v_range_start
      and tve.created_at < v_range_end
  ),
  redemptions as (
    select cr.*
    from public.combo_redemptions cr
    where cr.event_id = v_selected_event_id
  ),
  alerts_raw as (
    select 'paid_order_without_ticket' as type, 'critical' as severity, 'Pedido pago sem ingresso' as title, count(*)::int as qty
    from public.orders o
    join public.reservations r on r.id = o.reservation_id
    join public.event_sessions es on es.id = r.session_id and es.event_id = v_selected_event_id
    where o.status = 'paid'
      and not exists (select 1 from public.tickets t where t.order_id = o.id)
    union all
    select 'combo_paid_without_qr', 'critical', 'Combo pago sem QR', count(*)::int
    from combo_base cb
    where cb.status = 'paid'
      and not exists (select 1 from public.combo_redemptions cr where cr.combo_order_id = cb.id)
    union all
    select 'qr_outbound_failed', 'critical', 'Envio de QR falhado', count(*)::int
    from public.whatsapp_outbound_deliveries wod
    where wod.status = 'failed'
      and wod.business_context->>'eventId' = v_selected_event_id::text
    union all
    select 'whatsapp_batch_stuck', 'critical', 'Batch preso em processamento', count(*)::int
    from public.whatsapp_message_batches wmb
    where wmb.status = 'processing'
      and coalesce(wmb.processing_started_at, wmb.claimed_at) < v_now - interval '10 minutes'
    union all
    select 'delivery_stuck_sending', 'critical', 'Delivery preso em envio', count(*)::int
    from public.whatsapp_outbound_deliveries wod
    where wod.status = 'sending'
      and wod.claimed_at < v_now - interval '10 minutes'
      and wod.business_context->>'eventId' = v_selected_event_id::text
    union all
    select 'participant_qr_pending', 'warning', 'Participantes com QR pendente', count(*)::int
    from ticket_base tb
    where tb.recipient_phone is not null
      and coalesce(tb.participant_delivery_status, '') <> 'delivered'
    union all
    select 'messages_retry', 'warning', 'Mensagens em retry', count(*)::int
    from public.whatsapp_message_batches wmb
    where wmb.status in ('collecting', 'processing')
      and wmb.attempt_count > 0
    union all
    select 'payment_events_unprocessed', 'warning', 'Eventos de pagamento não processados', count(*)::int
    from public.payment_events pe
    where pe.processed_at is null
    union all
    select 'expired_active_reservations', 'warning', 'Reservas vencidas ainda ativas', count(*)::int
    from public.reservations r
    join public.event_sessions es on es.id = r.session_id and es.event_id = v_selected_event_id
    where r.status = 'active' and r.expires_at < v_now
    union all
    select 'event_starting_soon', 'info', 'Evento iniciando em breve', count(*)::int
    from public.event_sessions es
    where es.event_id = v_selected_event_id
      and es.starts_at >= v_now
      and es.starts_at <= v_now + interval '2 hours'
      and es.status <> 'cancelled'
  ),
  alerts as (
    select *
    from alerts_raw
    where qty > 0
  )
  select jsonb_build_object(
    'ok', true,
    'events', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', ae.id,
        'title', ae.title,
        'artistName', ae.artist_name,
        'startsAt', ae.starts_at,
        'status', ae.status
      ) order by
        case when ae.status = 'published' then 0 else 1 end,
        case when ae.recently_started then 0 else 1 end,
        coalesce(ae.next_starts_at, ae.starts_at, '9999-12-31'::timestamptz),
        case when ae.status = 'finished' then 1 else 0 end,
        ae.title)
      from accessible_events ae
    ), '[]'::jsonb),
    'event', (
      select jsonb_build_object('id', id, 'title', title, 'artistName', artist_name, 'startsAt', starts_at, 'status', status)
      from event_scope
    ),
    'range', jsonb_build_object(
      'days', v_days,
      'startsAt', v_range_start,
      'endsAt', v_range_end,
      'comparisonStartsAt', v_comp_start,
      'comparisonEndsAt', v_comp_end
    ),
    'revenue', jsonb_build_object(
      'summary', jsonb_build_object(
        'totalRevenueCents', (select coalesce(sum(total_revenue_cents), 0)::int from revenue_series),
        'ticketRevenueCents', (select coalesce(sum(ticket_revenue_cents), 0)::int from revenue_series),
        'comboRevenueCents', (select coalesce(sum(combo_revenue_cents), 0)::int from revenue_series),
        'approvedPayments', (select count(*)::int from ticket_revenue_payments where status = 'approved' and coalesce(paid_at, created_at) >= v_range_start and coalesce(paid_at, created_at) < v_range_end),
        'pendingPayments', (select count(*)::int from ticket_revenue_payments where status = 'pending' and created_at >= v_range_start and created_at < v_range_end),
        'rejectedPayments', (select count(*)::int from ticket_revenue_payments where status = 'rejected' and created_at >= v_range_start and created_at < v_range_end),
        'repasseCents', round((select coalesce(sum(total_revenue_cents), 0) from revenue_series) * 0.05)::int
      ),
      'series', (select coalesce(jsonb_agg(jsonb_build_object('date', day_key, 'totalRevenueCents', total_revenue_cents, 'ticketRevenueCents', ticket_revenue_cents, 'comboRevenueCents', combo_revenue_cents) order by day_key), '[]'::jsonb) from revenue_series),
      'latestSales', coalesce((
        select jsonb_agg(row_data order by sort_at desc)
        from (
          select jsonb_build_object('time', p.created_at, 'type', 'ingresso', 'description', 'Ingresso', 'paymentMethod', p.provider, 'valueCents', p.amount_cents, 'status', p.status) as row_data, p.created_at as sort_at
          from ticket_revenue_payments p
          where p.created_at >= v_range_start and p.created_at < v_range_end
          union all
          select jsonb_build_object('time', cb.created_at, 'type', 'combo', 'description', coalesce(cb.offer_name, 'Combo'), 'paymentMethod', cp.provider, 'valueCents', cp.amount_cents, 'status', cb.status), cb.created_at
          from combo_base cb
          left join combo_payments cp on cp.combo_order_id = cb.id
          where cb.created_at >= v_range_start and cb.created_at < v_range_end
          order by sort_at desc
          limit 10
        ) latest
      ), '[]'::jsonb),
      'paymentMethods', coalesce((
        select jsonb_agg(jsonb_build_object('method', provider, 'valueCents', value_cents, 'percentage', case when total_cents > 0 then round(value_cents * 100.0 / total_cents, 1) else null end) order by value_cents desc)
        from (
          select provider, sum(amount_cents)::int as value_cents, sum(sum(amount_cents)) over ()::int as total_cents
          from (
            select provider, amount_cents from ticket_revenue_payments where status = 'approved' and coalesce(paid_at, created_at) >= v_range_start and coalesce(paid_at, created_at) < v_range_end
            union all
            select provider, amount_cents from combo_revenue_payments where status = 'approved' and created_at >= v_range_start and created_at < v_range_end
          ) methods
          group by provider
        ) grouped
      ), '[]'::jsonb)
    ),
    'tickets', jsonb_build_object(
      'summary', jsonb_build_object(
        'soldPaid', (select count(*)::int from ticket_paid where coalesce(paid_at, issued_at) >= v_range_start and coalesce(paid_at, issued_at) < v_range_end),
        'available', (select greatest(0, count(*) filter (where ss.status = 'available'))::int from public.session_seats ss join public.event_sessions es on es.id = ss.session_id and es.event_id = v_selected_event_id),
        'courtesies', (select count(*)::int from ticket_base where ticket_type = 'free' and status <> 'cancelled' and issued_at >= v_range_start and issued_at < v_range_end),
        'cancelled', (select count(*)::int from ticket_base where status = 'cancelled' and issued_at >= v_range_start and issued_at < v_range_end),
        'checkins', (select count(*)::int from ticket_validations where result = 'allowed')
      ),
      'series', (select coalesce(jsonb_agg(jsonb_build_object('date', day_key, 'paidTickets', paid_tickets) order by day_key), '[]'::jsonb) from ticket_series),
      'latestIssued', coalesce((select jsonb_agg(jsonb_build_object('time', issued_at, 'type', coalesce(section_name, seat_code, 'Ingresso'), 'quantity', 1, 'buyerName', customer_name, 'status', status) order by issued_at desc) from (select * from ticket_base where issued_at >= v_range_start and issued_at < v_range_end order by issued_at desc limit 10) x), '[]'::jsonb),
      'latestCheckins', coalesce((select jsonb_agg(jsonb_build_object('time', created_at, 'ticketCode', ticket_code, 'gate', gate_label, 'result', result) order by created_at desc) from (select * from ticket_validations where result = 'allowed' order by created_at desc limit 10) x), '[]'::jsonb),
      'problems', jsonb_build_object(
        'denied', (select count(*)::int from ticket_validations where result = 'denied'),
        'alreadyUsed', (select count(*)::int from ticket_validations where result = 'already_used'),
        'notFound', (select count(*)::int from ticket_validations where result = 'not_found'),
        'cancelledPresented', (select count(*)::int from ticket_validations where result = 'cancelled'),
        'paidOrdersWithoutTickets', (select coalesce(qty, 0) from alerts_raw where type = 'paid_order_without_ticket')
      )
    ),
    'combos', jsonb_build_object(
      'summary', jsonb_build_object(
        'soldItems', (select coalesce(sum(quantity), 0)::int from combo_base where status = 'paid' and coalesce(paid_at, created_at) >= v_range_start and coalesce(paid_at, created_at) < v_range_end),
        'paidOrders', (select count(*)::int from combo_base where status = 'paid' and coalesce(paid_at, created_at) >= v_range_start and coalesce(paid_at, created_at) < v_range_end),
        'usedItems', (select coalesce(sum(quantity), 0)::int from redemptions where status = 'used' and used_at >= v_range_start and used_at < v_range_end),
        'pendingOrders', (select count(*)::int from combo_base where status = 'pending_payment' and (checkout_expires_at is null or checkout_expires_at >= v_now)),
        'expiredOrders', (select count(*)::int from combo_base where status = 'expired' or (status = 'pending_payment' and checkout_expires_at < v_now)),
        'revenueCents', (select coalesce(sum(amount_cents), 0)::int from combo_revenue_payments where status = 'approved' and created_at >= v_range_start and created_at < v_range_end)
      ),
      'series', (select coalesce(jsonb_agg(jsonb_build_object('date', day_key, 'paidItems', paid_items) order by day_key), '[]'::jsonb) from combo_series),
      'topOffers', coalesce((select jsonb_agg(jsonb_build_object('name', offer_name, 'quantity', quantity, 'revenueCents', revenue_cents, 'percentage', case when total_quantity > 0 then round(quantity * 100.0 / total_quantity, 1) else null end) order by quantity desc) from (select coalesce(offer_name, 'Combo') as offer_name, coalesce(sum(quantity), 0)::int as quantity, coalesce(sum(total_amount_cents), 0)::int as revenue_cents, sum(sum(quantity)) over ()::int as total_quantity from combo_base where status = 'paid' group by coalesce(offer_name, 'Combo') limit 10) x), '[]'::jsonb),
      'latest', coalesce((select jsonb_agg(jsonb_build_object('time', created_at, 'offerName', coalesce(offer_name, 'Combo'), 'destination', null, 'status', status) order by created_at desc) from (select * from combo_base where created_at >= v_range_start and created_at < v_range_end order by created_at desc limit 10) x), '[]'::jsonb),
      'problems', jsonb_build_object(
        'paidWithoutQr', (select coalesce(qty, 0) from alerts_raw where type = 'combo_paid_without_qr'),
        'qrDenied', (select count(*)::int from public.combo_redemption_events cre join combo_base cb on cb.id = cre.combo_order_id where cre.result = 'denied' and cre.created_at >= v_range_start and cre.created_at < v_range_end),
        'alreadyUsed', (select count(*)::int from public.combo_redemption_events cre join combo_base cb on cb.id = cre.combo_order_id where cre.result = 'already_used' and cre.created_at >= v_range_start and cre.created_at < v_range_end),
        'expiredPending', (select count(*)::int from combo_base where status = 'pending_payment' and checkout_expires_at < v_now)
      )
    ),
    'whatsapp', jsonb_build_object(
      'summary', jsonb_build_object(
        'uniqueContacts', (select count(distinct customer_id)::int from whatsapp_messages_scoped where direction = 'inbound'),
        'inboundMessages', (select count(*)::int from whatsapp_messages_scoped where direction = 'inbound'),
        'outboundMessages', (select count(*)::int from whatsapp_messages_scoped where direction = 'outbound'),
        'failedMessages', (select count(*)::int from public.whatsapp_outbound_deliveries where status = 'failed' and business_context->>'eventId' = v_selected_event_id::text),
        'pendingOutbound', (select count(*)::int from public.whatsapp_outbound_deliveries where status = 'pending' and business_context->>'eventId' = v_selected_event_id::text),
        'batchesRetry', (select count(*)::int from public.whatsapp_message_batches where attempt_count > 0 and status in ('collecting', 'processing'))
      ),
      'series', (select coalesce(jsonb_agg(jsonb_build_object('date', day_key, 'uniqueContacts', unique_contacts, 'inboundMessages', inbound_messages, 'outboundMessages', outbound_messages) order by day_key), '[]'::jsonb) from whatsapp_series),
      'latestActivity', coalesce((select jsonb_agg(jsonb_build_object('time', created_at, 'type', direction, 'recipient', null, 'status', coalesce(raw_metadata->>'send_status', direction)) order by created_at desc) from (select * from whatsapp_messages_scoped order by created_at desc limit 10) x), '[]'::jsonb),
      'problems', jsonb_build_object(
        'failedOutbound', (select count(*)::int from public.whatsapp_outbound_deliveries where status = 'failed' and business_context->>'eventId' = v_selected_event_id::text),
        'retryBatches', (select count(*)::int from public.whatsapp_message_batches where attempt_count > 0 and status in ('collecting', 'processing')),
        'stuckBatches', (select coalesce(qty, 0) from alerts_raw where type = 'whatsapp_batch_stuck'),
        'stuckDeliveries', (select coalesce(qty, 0) from alerts_raw where type = 'delivery_stuck_sending')
      )
    ),
    'alerts', jsonb_build_object(
      'summary', jsonb_build_object(
        'total', (select coalesce(sum(qty), 0)::int from alerts),
        'critical', (select coalesce(sum(qty), 0)::int from alerts where severity = 'critical'),
        'warning', (select coalesce(sum(qty), 0)::int from alerts where severity = 'warning'),
        'info', (select coalesce(sum(qty), 0)::int from alerts where severity = 'info')
      ),
      'items', coalesce((select jsonb_agg(jsonb_build_object('id', type || ':' || v_selected_event_id::text, 'type', type, 'severity', severity, 'title', title, 'description', title, 'quantity', qty, 'eventId', v_selected_event_id, 'detectedAt', v_now, 'href', null) order by case severity when 'critical' then 0 when 'warning' then 1 else 2 end, title) from alerts limit 30), '[]'::jsonb)
    ),
    'generatedAt', v_now
  )
    into v_payload;

  return v_payload;
end;
$$;

revoke all on function public.get_admin_intelligence_dashboard(uuid, uuid, integer, text) from public;
revoke all on function public.get_admin_intelligence_dashboard(uuid, uuid, integer, text) from anon;
revoke all on function public.get_admin_intelligence_dashboard(uuid, uuid, integer, text) from authenticated;
grant execute on function public.get_admin_intelligence_dashboard(uuid, uuid, integer, text) to service_role;
