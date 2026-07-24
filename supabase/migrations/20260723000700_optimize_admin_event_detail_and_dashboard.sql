create or replace function public.get_admin_event_editor_payload(
  p_event_id uuid
)
returns jsonb
language sql
security definer
set search_path = public, pg_temp
as $$
  with event_row as (
    select
      e.id,
      e.title,
      e.artist_name,
      e.description,
      e.city,
      e.state,
      e.status,
      e.image_url,
      e.venue_id,
      e.created_at,
      e.updated_at,
      e.created_by_admin_user_id,
      e.created_by_admin_phone,
      v.name as venue_name
    from public.events e
    left join public.venues v on v.id = e.venue_id
    where e.id = p_event_id
    limit 1
  ),
  sessions as (
    select
      es.id,
      es.event_id,
      es.venue_id,
      es.starts_at,
      es.status,
      v.name as venue_name
    from public.event_sessions es
    left join public.venues v on v.id = es.venue_id
    where es.event_id = p_event_id
  ),
  section_ids as (
    select distinct tp.section_id
    from public.ticket_prices tp
    join sessions s on s.id = tp.session_id
    where tp.section_id is not null
    union
    select distinct ss.section_id
    from public.session_seats ss
    join sessions s on s.id = ss.session_id
    where ss.section_id is not null
  ),
  sections as (
    select
      vs.id,
      vs.name,
      vs.slug,
      vs.capacity,
      vs.has_numbered_seats,
      vs.status,
      vs.sort_order
    from public.venue_sections vs
    join section_ids si on si.section_id = vs.id
  ),
  prices as (
    select
      tp.id,
      tp.session_id,
      tp.section_id,
      tp.ticket_type,
      tp.label,
      tp.price_cents,
      tp.fee_cents,
      tp.currency,
      tp.sales_start_at,
      tp.sales_end_at,
      tp.status,
      vs.name as section_name,
      tp.created_at
    from public.ticket_prices tp
    join sessions s on s.id = tp.session_id
    left join public.venue_sections vs on vs.id = tp.section_id
    where tp.ticket_type <> 'free'
  ),
  courtesy_limits as (
    select
      csl.section_id,
      csl.label,
      csl.max_courtesies,
      csl.status
    from public.courtesy_section_limits csl
    where csl.event_id = p_event_id
  ),
  session_summary as (
    select
      count(*)::int as sessions_count,
      (
        array_agg(s.starts_at order by s.starts_at)
        filter (where s.starts_at >= now())
      )[1] as future_starts_at,
      (
        array_agg(s.status order by s.starts_at)
        filter (where s.starts_at >= now())
      )[1] as future_status,
      (array_agg(s.starts_at order by s.starts_at desc))[1] as last_starts_at,
      (array_agg(s.status order by s.starts_at desc))[1] as last_status,
      coalesce(bool_and(s.starts_at < now()), false) as has_only_past
    from sessions s
  )
  select
    case
      when not exists (select 1 from event_row) then
        jsonb_build_object('ok', false, 'reason', 'not_found')
      else
        jsonb_build_object(
          'ok', true,
          'event', jsonb_build_object(
            'eventId', e.id,
            'title', e.title,
            'artistName', e.artist_name,
            'description', e.description,
            'city', e.city,
            'state', e.state,
            'status', e.status,
            'displayStatus', case when e.status = 'published' and ss.sessions_count > 0 and ss.has_only_past then 'finished' else e.status end,
            'imageUrl', e.image_url,
            'venueId', e.venue_id,
            'venueName', e.venue_name,
            'createdAt', e.created_at,
            'wasEdited', false,
            'createdByAdminUserId', e.created_by_admin_user_id,
            'createdByAdminPhone', e.created_by_admin_phone,
            'sessionsCount', coalesce(ss.sessions_count, 0),
            'nextSessionStartsAt', coalesce(ss.future_starts_at, ss.last_starts_at),
            'nextSessionStatus', coalesce(ss.future_status, ss.last_status),
            'ticketSalesOverview', jsonb_build_array(jsonb_build_object(
              'key', 'total',
              'label', 'Total de vendas',
              'shortLabel', 'TT',
              'sold', 0,
              'available', 0,
              'courtesySold', 0,
              'courtesyAvailable', 0,
              'courtesyCapacity', 0,
              'salesSold', 0,
              'salesAvailable', 0,
              'salesCapacity', 0
            )),
            'ticketImpressions', 0,
            'ticketClicks', 0,
            'sessions', coalesce((
              select jsonb_agg(jsonb_build_object(
                'sessionId', s.id,
                'startsAt', s.starts_at,
                'status', s.status,
                'venueId', s.venue_id,
                'venueName', coalesce(s.venue_name, e.venue_name)
              ) order by s.starts_at)
              from sessions s
            ), '[]'::jsonb),
            'sections', coalesce((
              select jsonb_agg(jsonb_build_object(
                'sectionId', s.id,
                'name', s.name,
                'slug', s.slug,
                'capacity', s.capacity,
                'hasNumberedSeats', s.has_numbered_seats,
                'status', s.status
              ) order by s.sort_order, s.name)
              from sections s
            ), '[]'::jsonb),
            'prices', coalesce((
              select jsonb_agg(jsonb_build_object(
                'priceId', p.id,
                'sessionId', p.session_id,
                'sectionId', p.section_id,
                'sectionName', p.section_name,
                'ticketType', p.ticket_type,
                'label', p.label,
                'priceCents', p.price_cents,
                'feeCents', p.fee_cents,
                'currency', p.currency,
                'salesStartAt', p.sales_start_at,
                'salesEndAt', p.sales_end_at,
                'status', p.status
              ) order by p.created_at)
              from prices p
            ), '[]'::jsonb),
            'courtesy', jsonb_build_object(
              'sections', coalesce((
                select jsonb_agg(jsonb_build_object(
                  'sectionId', s.id,
                  'sectionName', s.name,
                  'label', coalesce(cl.label, 'Cortesia'),
                  'limit', coalesce(cl.max_courtesies, 0),
                  'status', coalesce(cl.status, s.status)
                ) order by s.sort_order, s.name)
                from sections s
                left join courtesy_limits cl on cl.section_id = s.id
              ), '[]'::jsonb)
            )
          )
        )
    end
  from event_row e
  cross join session_summary ss;
$$;

create or replace function public.get_admin_general_dashboard_summary(
  p_owner_admin_user_id uuid,
  p_can_see_all boolean default false
)
returns jsonb
language sql
security definer
set search_path = public, pg_temp
as $$
  with scoped_events as (
    select e.id
    from public.events e
    where p_can_see_all or e.created_by_admin_user_id = p_owner_admin_user_id
  ),
  constants as (
    select
      now() as now_utc,
      to_char(now() at time zone 'America/Sao_Paulo', 'YYYY-MM-DD') as today_key,
      (
        (date_trunc('day', now() at time zone 'America/Sao_Paulo')::date
          - (((extract(dow from date_trunc('day', now() at time zone 'America/Sao_Paulo'))::int - 5 + 7) % 7))::int)
      )::date as friday_start
  ),
  friday as (
    select
      to_char(friday_start, 'YYYY-MM-DD') as start_key,
      to_char(friday_start + 6, 'YYYY-MM-DD') as end_label_key,
      to_char(friday_start + 7, 'YYYY-MM-DD') as end_key
    from constants
  ),
  paid_tickets as (
    select
      t.id,
      t.status,
      t.issued_at,
      t.used_at,
      ri.ticket_type,
      coalesce(ri.price_cents, 0) + coalesce(ri.fee_cents, 0) as amount_cents,
      coalesce(
        (
          select max(p.paid_at)
          from public.payments p
          where p.order_id = o.id
            and p.status = 'approved'
            and p.paid_at is not null
        ),
        o.created_at,
        t.issued_at
      ) as activity_at
    from public.tickets t
    join public.event_sessions es on es.id = t.session_id
    join scoped_events se on se.id = es.event_id
    join public.orders o on o.id = t.order_id and o.status = 'paid'
    left join public.reservation_items ri on ri.id = t.reservation_item_id
    where t.status <> 'cancelled'
  ),
  ticket_activity as (
    select
      to_char((case when ticket_type = 'free' or amount_cents = 0 then issued_at else activity_at end) at time zone 'America/Sao_Paulo', 'YYYY-MM-DD') as day_key,
      extract(hour from ((case when ticket_type = 'free' or amount_cents = 0 then issued_at else activity_at end) at time zone 'America/Sao_Paulo'))::int as hour,
      count(*) filter (where not (ticket_type = 'free' or amount_cents = 0))::int as tickets_sold,
      count(*) filter (where ticket_type = 'free' or amount_cents = 0)::int as courtesy_tickets,
      coalesce(sum(amount_cents) filter (where not (ticket_type = 'free' or amount_cents = 0)), 0)::int as ticket_revenue_cents
    from paid_tickets
    group by 1, 2
  ),
  combo_activity as (
    select
      to_char(coalesce(co.paid_at, co.created_at) at time zone 'America/Sao_Paulo', 'YYYY-MM-DD') as day_key,
      extract(hour from (coalesce(co.paid_at, co.created_at) at time zone 'America/Sao_Paulo'))::int as hour,
      count(*) filter (where co.status = 'paid')::int as combo_orders_paid,
      coalesce(sum(co.quantity) filter (where co.status = 'paid'), 0)::int as combo_items_sold,
      coalesce(sum(co.total_amount_cents) filter (where co.status = 'paid'), 0)::int as combo_revenue_cents,
      count(*) filter (where co.status = 'pending_payment')::int as combo_orders_pending
    from public.combo_orders co
    join scoped_events se on se.id = co.event_id
    group by 1, 2
  ),
  redemption_activity as (
    select
      to_char(cr.used_at at time zone 'America/Sao_Paulo', 'YYYY-MM-DD') as day_key,
      coalesce(sum(cr.quantity), 0)::int as combo_used
    from public.combo_redemptions cr
    join scoped_events se on se.id = cr.event_id
    where cr.status = 'used' and cr.used_at is not null
    group by 1
  ),
  checkin_activity as (
    select
      to_char(tve.created_at at time zone 'America/Sao_Paulo', 'YYYY-MM-DD') as day_key,
      count(*)::int as checkins
    from public.ticket_validation_events tve
    join public.tickets t on t.id = tve.ticket_id
    join public.event_sessions es on es.id = t.session_id
    join scoped_events se on se.id = es.event_id
    where tve.result = 'allowed'
    group by 1
  ),
  capacity as (
    select count(*)::int as value
    from public.session_seats ss
    join public.seats s on s.id = ss.seat_id and s.status <> 'inactive'
    join public.event_sessions es on es.id = ss.session_id
    join scoped_events se on se.id = es.event_id
    join public.events e on e.id = es.event_id
    join public.venue_sections vs on vs.id = ss.section_id and vs.status = 'active'
    join public.venues v on v.id = vs.venue_id and coalesce(v.status, 'active') = 'active'
    where e.status in ('published', 'finished')
      and es.status <> 'cancelled'
      and exists (
        select 1
        from public.ticket_prices tp
        where tp.session_id = ss.session_id
          and tp.section_id = ss.section_id
          and tp.status = 'active'
          and tp.ticket_type <> 'free'
          and (tp.sales_start_at is null or tp.sales_start_at <= (select now_utc from constants))
          and (tp.sales_end_at is null or tp.sales_end_at >= (select now_utc from constants))
      )
  ),
  days as (
    select day_key from ticket_activity
    union select day_key from combo_activity
    union select day_key from redemption_activity
    union select day_key from checkin_activity
    union select today_key from constants
    union select start_key from friday
  ),
  ticket_daily as (
    select
      day_key,
      sum(tickets_sold)::int as tickets_sold,
      sum(courtesy_tickets)::int as courtesy_tickets,
      sum(ticket_revenue_cents)::int as ticket_revenue_cents
    from ticket_activity
    group by day_key
  ),
  combo_daily as (
    select
      day_key,
      sum(combo_items_sold)::int as combo_items_sold,
      sum(combo_orders_pending)::int as combo_orders_pending,
      sum(combo_revenue_cents)::int as combo_revenue_cents
    from combo_activity
    group by day_key
  ),
  daily as (
    select
      d.day_key,
      coalesce(td.tickets_sold, 0)::int as tickets_sold,
      coalesce(td.courtesy_tickets, 0)::int as courtesy_tickets,
      coalesce(td.ticket_revenue_cents, 0)::int as ticket_revenue_cents,
      coalesce(cd.combo_revenue_cents, 0)::int as combo_revenue_cents,
      coalesce(cd.combo_items_sold, 0)::int as combo_items_sold,
      coalesce(cd.combo_orders_pending, 0)::int as combo_orders_pending,
      coalesce(max(ra.combo_used), 0)::int as combo_used,
      coalesce(max(ch.checkins), 0)::int as checkins
    from days d
    left join ticket_daily td on td.day_key = d.day_key
    left join combo_daily cd on cd.day_key = d.day_key
    left join redemption_activity ra on ra.day_key = d.day_key
    left join checkin_activity ch on ch.day_key = d.day_key
    group by d.day_key, td.tickets_sold, td.courtesy_tickets, td.ticket_revenue_cents, cd.combo_revenue_cents, cd.combo_items_sold, cd.combo_orders_pending
  ),
  contact_messages as (
    select
      wm.customer_id,
      wm.created_at,
      to_char(wm.created_at at time zone 'America/Sao_Paulo', 'YYYY-MM-DD') as day_key,
      extract(hour from (wm.created_at at time zone 'America/Sao_Paulo'))::int as hour
    from public.whatsapp_messages wm
    join public.customers c on c.id = wm.customer_id
    where wm.direction = 'inbound'
      and wm.customer_id is not null
      and wm.created_at < ((date_trunc('day', now() at time zone 'America/Sao_Paulo') + interval '1 day') at time zone 'America/Sao_Paulo')
      and not exists (
        select 1 from public.admin_users au where regexp_replace(au.phone, '\D', '', 'g') = regexp_replace(c.whatsapp_phone, '\D', '', 'g')
      )
      and not exists (
        select 1 from public.gate_accesses ga where regexp_replace(ga.phone, '\D', '', 'g') = regexp_replace(c.whatsapp_phone, '\D', '', 'g')
      )
      and not exists (
        select 1 from public.fixed_gate_accesses fga where regexp_replace(fga.phone, '\D', '', 'g') = regexp_replace(c.whatsapp_phone, '\D', '', 'g')
      )
  ),
  contact_day as (
    select * from contact_messages cm
    where cm.day_key = (select today_key from constants)
  ),
  contact_intervals as (
    select
      bucket.end_hour,
      count(distinct cd.customer_id)::int as unique_contacts,
      count(cd.customer_id)::int as messages_received
    from (values (6), (12), (18), (24)) as bucket(end_hour)
    left join contact_day cd
      on least(24, floor(cd.hour / 6)::int * 6 + 6) = bucket.end_hour
    group by bucket.end_hour
  )
  select jsonb_build_object(
    'ok', true,
    'dashboard', jsonb_build_object(
      'today', (
        select jsonb_build_object(
          'key', c.today_key,
          'label', 'Hoje',
          'ticketsSold', coalesce(d.tickets_sold, 0),
          'capacity', cap.value,
          'ticketRevenueCents', coalesce(d.ticket_revenue_cents, 0),
          'comboRevenueCents', coalesce(d.combo_revenue_cents, 0),
          'totalRevenueCents', coalesce(d.ticket_revenue_cents, 0) + coalesce(d.combo_revenue_cents, 0),
          'comboItemsSold', coalesce(d.combo_items_sold, 0),
          'comboUsed', coalesce(d.combo_used, 0),
          'comboOrdersPending', coalesce(d.combo_orders_pending, 0),
          'checkins', coalesce(d.checkins, 0),
          'courtesyTickets', coalesce(d.courtesy_tickets, 0),
          'repasseCents', round((coalesce(d.ticket_revenue_cents, 0) + coalesce(d.combo_revenue_cents, 0)) * 0.05)::int
        )
        from constants c
        cross join capacity cap
        left join daily d on d.day_key = c.today_key
      ),
      'fridayWindow', (
        select jsonb_build_object(
          'key', f.start_key,
          'label', to_char(to_date(f.start_key, 'YYYY-MM-DD'), 'DD/MM') || ' a ' || to_char(to_date(f.end_label_key, 'YYYY-MM-DD'), 'DD/MM'),
          'ticketsSold', coalesce(sum(d.tickets_sold), 0)::int,
          'capacity', (select value from capacity),
          'ticketRevenueCents', coalesce(sum(d.ticket_revenue_cents), 0)::int,
          'comboRevenueCents', coalesce(sum(d.combo_revenue_cents), 0)::int,
          'totalRevenueCents', (coalesce(sum(d.ticket_revenue_cents), 0) + coalesce(sum(d.combo_revenue_cents), 0))::int,
          'comboItemsSold', coalesce(sum(d.combo_items_sold), 0)::int,
          'comboUsed', coalesce(sum(d.combo_used), 0)::int,
          'comboOrdersPending', coalesce(sum(d.combo_orders_pending), 0)::int,
          'checkins', coalesce(sum(d.checkins), 0)::int,
          'courtesyTickets', coalesce(sum(d.courtesy_tickets), 0)::int,
          'repasseCents', round((coalesce(sum(d.ticket_revenue_cents), 0) + coalesce(sum(d.combo_revenue_cents), 0)) * 0.05)::int
        )
        from friday f
        left join daily d on d.day_key >= f.start_key and d.day_key < f.end_key
        group by f.start_key, f.end_label_key, f.end_key
      ),
      'sixHour', coalesce((
        select jsonb_agg(jsonb_build_object(
          'key', (select today_key from constants) || '-' || (six.end_hour - 6),
          'label', lpad((six.end_hour - 6)::text, 2, '0') || 'h',
          'ticketsSold', six.tickets_sold,
          'capacity', (select value from capacity),
          'ticketRevenueCents', six.ticket_revenue_cents,
          'comboRevenueCents', 0,
          'totalRevenueCents', six.ticket_revenue_cents,
          'comboItemsSold', 0,
          'comboUsed', 0,
          'comboOrdersPending', 0,
          'checkins', 0,
          'courtesyTickets', six.courtesy_tickets,
          'repasseCents', round(six.ticket_revenue_cents * 0.05)::int
        ) order by six.end_hour)
        from (
          select
            bucket.end_hour,
            coalesce(sum(ta.tickets_sold), 0)::int as tickets_sold,
            coalesce(sum(ta.ticket_revenue_cents), 0)::int as ticket_revenue_cents,
            coalesce(sum(ta.courtesy_tickets), 0)::int as courtesy_tickets
          from (values (6), (12), (18), (24)) as bucket(end_hour)
          left join ticket_activity ta
            on ta.day_key = (select today_key from constants)
           and least(24, floor(ta.hour / 6)::int * 6 + 6) = bucket.end_hour
          group by bucket.end_hour
        ) six
      ), '[]'::jsonb),
      'daily', coalesce((
        select jsonb_agg(jsonb_build_object(
          'key', d.day_key,
          'label', to_char(to_date(d.day_key, 'YYYY-MM-DD'), 'DD/MM'),
          'ticketsSold', d.tickets_sold,
          'capacity', (select value from capacity),
          'ticketRevenueCents', d.ticket_revenue_cents,
          'comboRevenueCents', d.combo_revenue_cents,
          'totalRevenueCents', d.ticket_revenue_cents + d.combo_revenue_cents,
          'comboItemsSold', d.combo_items_sold,
          'comboUsed', d.combo_used,
          'comboOrdersPending', d.combo_orders_pending,
          'checkins', d.checkins,
          'courtesyTickets', d.courtesy_tickets,
          'repasseCents', round((d.ticket_revenue_cents + d.combo_revenue_cents) * 0.05)::int
        ) order by d.day_key desc)
        from daily d
      ), '[]'::jsonb),
      'weekly', '[]'::jsonb,
      'monthly', coalesce((
        select jsonb_agg(jsonb_build_object(
          'key', month_key,
          'label', split_part(month_key, '-', 2) || '/' || split_part(month_key, '-', 1),
          'ticketsSold', tickets_sold,
          'capacity', (select value from capacity),
          'ticketRevenueCents', ticket_revenue_cents,
          'comboRevenueCents', combo_revenue_cents,
          'totalRevenueCents', ticket_revenue_cents + combo_revenue_cents,
          'comboItemsSold', combo_items_sold,
          'comboUsed', combo_used,
          'comboOrdersPending', combo_orders_pending,
          'checkins', checkins,
          'courtesyTickets', courtesy_tickets,
          'repasseCents', round((ticket_revenue_cents + combo_revenue_cents) * 0.05)::int
        ) order by month_key desc)
        from (
          select
            left(day_key, 7) as month_key,
            sum(tickets_sold)::int as tickets_sold,
            sum(courtesy_tickets)::int as courtesy_tickets,
            sum(ticket_revenue_cents)::int as ticket_revenue_cents,
            sum(combo_revenue_cents)::int as combo_revenue_cents,
            sum(combo_items_sold)::int as combo_items_sold,
            sum(combo_orders_pending)::int as combo_orders_pending,
            sum(combo_used)::int as combo_used,
            sum(checkins)::int as checkins
          from daily
          group by left(day_key, 7)
          order by month_key desc
          limit 12
        ) m
      ), '[]'::jsonb),
      'contactActivity', jsonb_build_object(
        'range', 'day',
        'periodLabel', 'Hoje',
        'dayKey', (select today_key from constants),
        'totalUniqueContacts', (select count(distinct customer_id)::int from contact_day),
        'totalMessages', (select count(*)::int from contact_day),
        'peakEndHour', (select end_hour from contact_intervals order by unique_contacts desc, end_hour asc limit 1),
        'peakUniqueContacts', (select max(unique_contacts) from contact_intervals),
        'intervals', coalesce((select jsonb_agg(jsonb_build_object('endHour', end_hour, 'uniqueContacts', unique_contacts, 'messagesReceived', messages_received) order by end_hour) from contact_intervals), '[]'::jsonb),
        'points', coalesce((select jsonb_agg(jsonb_build_object('key', (select today_key from constants) || '-' || (end_hour - 6), 'label', lpad((end_hour - 6)::text, 2, '0') || 'h', 'intervalLabel', lpad((end_hour - 6)::text, 2, '0') || 'h-' || lpad(end_hour::text, 2, '0') || 'h', 'positionHour', end_hour - 3, 'uniqueContacts', unique_contacts, 'messagesReceived', messages_received) order by end_hour) from contact_intervals), '[]'::jsonb),
        'peakLabel', null
      )
    )
  );
$$;

revoke all on function public.get_admin_event_editor_payload(uuid) from public;
revoke all on function public.get_admin_event_editor_payload(uuid) from anon;
revoke all on function public.get_admin_event_editor_payload(uuid) from authenticated;
grant execute on function public.get_admin_event_editor_payload(uuid) to service_role;

revoke all on function public.get_admin_general_dashboard_summary(uuid, boolean) from public;
revoke all on function public.get_admin_general_dashboard_summary(uuid, boolean) from anon;
revoke all on function public.get_admin_general_dashboard_summary(uuid, boolean) from authenticated;
grant execute on function public.get_admin_general_dashboard_summary(uuid, boolean) to service_role;
