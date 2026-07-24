create or replace function public.list_admin_events_fast(
  p_session_id uuid,
  p_admin_user_id uuid,
  p_phone text,
  p_status text default 'all',
  p_search text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_admin_user public.admin_users%rowtype;
  v_started_at timestamptz := clock_timestamp();
  v_sql_started_at timestamptz;
  v_events jsonb := '[]'::jsonb;
  v_normalized_status text := coalesce(nullif(p_status, ''), 'all');
  v_search text := nullif(trim(coalesce(p_search, '')), '');
  v_events_sql_ms integer := 0;
begin
  if p_session_id is null or p_admin_user_id is null or nullif(trim(coalesce(p_phone, '')), '') is null then
    return jsonb_build_object('ok', false, 'reason', 'unauthorized');
  end if;

  select au.*
    into v_admin_user
  from public.admin_sessions s
  join public.admin_users au on au.id = s.admin_user_id
  where s.id = p_session_id
    and s.admin_user_id = p_admin_user_id
    and s.phone = p_phone
    and s.status = 'active'
    and s.expires_at > now()
    and coalesce(s.metadata ->> 'source', '') = 'web'
    and au.status = 'active'
  limit 1;

  if not found then
    return jsonb_build_object('ok', false, 'reason', 'unauthorized');
  end if;

  if v_admin_user.role not in ('root', 'admin') then
    return jsonb_build_object('ok', false, 'reason', 'forbidden');
  end if;

  if v_normalized_status not in ('all', 'draft', 'published', 'cancelled', 'finished') then
    v_normalized_status := 'all';
  end if;

  v_sql_started_at := clock_timestamp();

  with scoped_events as (
    select
      e.id,
      e.title,
      e.artist_name,
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
    where (v_admin_user.role = 'root' or e.created_by_admin_user_id = v_admin_user.id)
      and (v_normalized_status in ('all', 'finished') or e.status = v_normalized_status)
      and (
        v_search is null
        or e.search_text ilike '%' || lower(v_search) || '%'
      )
  ),
  sessions as (
    select
      es.event_id,
      jsonb_build_object(
        'sessionId', es.id,
        'startsAt', es.starts_at,
        'status', es.status,
        'venueId', es.venue_id,
        'venueName', sv.name
      ) as session_json,
      es.starts_at,
      es.status
    from public.event_sessions es
    join scoped_events se on se.id = es.event_id
    left join public.venues sv on sv.id = es.venue_id
  ),
  summarized as (
    select
      se.*,
      count(s.event_id)::integer as sessions_count,
      coalesce(bool_and(s.starts_at < now()) filter (where s.event_id is not null), false) as has_only_past_sessions,
      (
        array_agg(s.session_json order by s.starts_at asc)
        filter (where s.starts_at >= now())
      )[1] as future_session,
      (array_agg(s.session_json order by s.starts_at desc))[1] as last_session
    from scoped_events se
    left join sessions s on s.event_id = se.id
    group by
      se.id,
      se.title,
      se.artist_name,
      se.city,
      se.state,
      se.status,
      se.image_url,
      se.venue_id,
      se.created_at,
      se.updated_at,
      se.created_by_admin_user_id,
      se.created_by_admin_phone,
      se.venue_name
  ),
  ticket_metrics as (
    select
      es.event_id,
      count(pay.id) filter (where pay.checkout_url is not null)::integer as impressions,
      coalesce(sum(
        greatest(
          0,
          case
            when jsonb_typeof(pay.raw_metadata -> 'checkout_click_count') = 'number'
              then (pay.raw_metadata ->> 'checkout_click_count')::integer
            when (pay.raw_metadata ->> 'checkout_click_count') ~ '^[0-9]+$'
              then (pay.raw_metadata ->> 'checkout_click_count')::integer
            else 0
          end
        )
      ), 0)::integer as clicks
    from public.payments pay
    join public.orders o on o.id = pay.order_id
    join public.reservations r on r.id = o.reservation_id
    join public.event_sessions es on es.id = r.session_id
    join scoped_events se on se.id = es.event_id
    where pay.checkout_url is not null
    group by es.event_id
  ),
  cards as (
    select
      s.*,
      case
        when s.status = 'published' and s.sessions_count > 0 and s.has_only_past_sessions then 'finished'
        else s.status
      end as display_status,
      coalesce(s.future_session, s.last_session) as display_session,
      coalesce(tm.impressions, 0) as ticket_impressions,
      coalesce(tm.clicks, 0) as ticket_clicks
    from summarized s
    left join ticket_metrics tm on tm.event_id = s.id
  ),
  filtered_cards as (
    select *
    from cards c
    where v_normalized_status in ('all', 'draft', 'published', 'cancelled')
       or (v_normalized_status = 'finished' and c.display_status = 'finished')
  )
  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'eventId', c.id,
        'title', c.title,
        'artistName', c.artist_name,
        'description', null,
        'city', c.city,
        'state', c.state,
        'status', c.status,
        'displayStatus', c.display_status,
        'imageUrl', c.image_url,
        'venueId', c.venue_id,
        'venueName', c.venue_name,
        'createdAt', c.created_at,
        'wasEdited', coalesce(c.updated_at > c.created_at + interval '5 seconds', false),
        'createdByAdminUserId', c.created_by_admin_user_id,
        'createdByAdminPhone', c.created_by_admin_phone,
        'sessionsCount', c.sessions_count,
        'nextSessionStartsAt', c.display_session ->> 'startsAt',
        'nextSessionStatus', c.display_session ->> 'status',
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
        'ticketImpressions', c.ticket_impressions,
        'ticketClicks', c.ticket_clicks
      )
      order by
        case when v_normalized_status = 'all' and coalesce(c.updated_at > c.created_at + interval '5 seconds', false) then 1 else 0 end asc,
        case when c.display_status = 'finished' then 1 else 0 end asc,
        coalesce((c.display_session ->> 'startsAt')::timestamptz, 'infinity'::timestamptz) asc,
        c.created_at desc
    ),
    '[]'::jsonb
  )
  into v_events
  from filtered_cards c;

  v_events_sql_ms := floor(extract(epoch from (clock_timestamp() - v_sql_started_at)) * 1000)::integer;

  return jsonb_build_object(
    'ok', true,
    'events', v_events,
    'metrics', jsonb_build_object(
      'sqlMs', floor(extract(epoch from (clock_timestamp() - v_sql_started_at)) * 1000)::integer,
      'eventsSqlMs', v_events_sql_ms,
      'supabaseOperations', 1
    )
  );
end;
$$;

revoke all on function public.list_admin_events_fast(uuid, uuid, text, text, text) from public;
revoke all on function public.list_admin_events_fast(uuid, uuid, text, text, text) from anon;
revoke all on function public.list_admin_events_fast(uuid, uuid, text, text, text) from authenticated;
grant execute on function public.list_admin_events_fast(uuid, uuid, text, text, text) to service_role;
