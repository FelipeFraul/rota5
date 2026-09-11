alter table public.events
  add column if not exists artist_icon text not null default '🎤';

alter table public.events
  drop constraint if exists events_artist_icon_not_empty_check;

alter table public.events
  add constraint events_artist_icon_not_empty_check check (btrim(artist_icon) <> '');

update public.events
set artist_icon = '🎤'
where btrim(coalesce(artist_icon, '')) = '';

drop function if exists public.search_public_events_ranked(text, timestamptz, timestamptz, integer);

create or replace function public.search_public_events_ranked(
  search_term text,
  date_from timestamptz default now(),
  date_to timestamptz default null,
  result_limit integer default 20
)
returns table (
  event_id uuid,
  title text,
  artist_name text,
  artist_icon text,
  description text,
  city text,
  state text,
  image_url text,
  venue_id uuid,
  venue_name text,
  session_id uuid,
  starts_at timestamptz,
  session_status text,
  score numeric
)
language sql
stable
set search_path = public, pg_temp
as $$
  with input as (
    select
      public.normalize_event_search_text(search_term) as term,
      greatest(coalesce(date_from, now()), now()) as effective_date_from
  ),
  alias_scores as (
    select
      ea.event_id,
      max(
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
        public.normalize_event_search_text(ea.alias) operator(public.%) input.term
        or public.normalize_event_search_text(ea.alias) like '%' || input.term || '%'
      )
    group by ea.event_id
  ),
  scored as (
    select
      e.id as event_id,
      e.title,
      e.artist_name,
      e.artist_icon,
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
        public.normalize_event_search_text(e.title) operator(public.%) input.term
        or public.normalize_event_search_text(e.artist_name) operator(public.%) input.term
        or public.normalize_event_search_text(coalesce(e.description, '')) operator(public.%) input.term
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
$$;

revoke all on function public.search_public_events_ranked(text, timestamptz, timestamptz, integer) from public;
revoke all on function public.search_public_events_ranked(text, timestamptz, timestamptz, integer) from anon;
revoke all on function public.search_public_events_ranked(text, timestamptz, timestamptz, integer) from authenticated;
grant execute on function public.search_public_events_ranked(text, timestamptz, timestamptz, integer) to service_role;

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
      e.artist_icon,
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
    select es.id, es.event_id, es.venue_id, es.starts_at, es.status, v.name as venue_name
    from public.event_sessions es
    left join public.venues v on v.id = es.venue_id
    where es.event_id = p_event_id
  ),
  section_ids as (
    select distinct tp.section_id from public.ticket_prices tp join sessions s on s.id = tp.session_id where tp.section_id is not null
    union
    select distinct ss.section_id from public.session_seats ss join sessions s on s.id = ss.session_id where ss.section_id is not null
  ),
  sections as (
    select vs.id, vs.name, vs.slug, vs.capacity, vs.has_numbered_seats, vs.status, vs.sort_order
    from public.venue_sections vs
    join section_ids si on si.section_id = vs.id
  ),
  prices as (
    select tp.id, tp.session_id, tp.section_id, tp.ticket_type, tp.label, tp.price_cents, tp.fee_cents, tp.currency, tp.sales_start_at, tp.sales_end_at, tp.status, vs.name as section_name, tp.created_at
    from public.ticket_prices tp
    join sessions s on s.id = tp.session_id
    left join public.venue_sections vs on vs.id = tp.section_id
    where tp.ticket_type <> 'free'
  ),
  courtesy_limits as (
    select csl.section_id, csl.label, csl.max_courtesies, csl.status
    from public.courtesy_section_limits csl
    where csl.event_id = p_event_id
  ),
  session_summary as (
    select
      count(*)::int as sessions_count,
      (array_agg(s.starts_at order by s.starts_at) filter (where s.starts_at >= now()))[1] as future_starts_at,
      (array_agg(s.status order by s.starts_at) filter (where s.starts_at >= now()))[1] as future_status,
      (array_agg(s.starts_at order by s.starts_at desc))[1] as last_starts_at,
      (array_agg(s.status order by s.starts_at desc))[1] as last_status,
      coalesce(bool_and(s.starts_at < now()), false) as has_only_past
    from sessions s
  )
  select
    case
      when not exists (select 1 from event_row) then jsonb_build_object('ok', false, 'reason', 'not_found')
      else jsonb_build_object(
        'ok', true,
        'event', jsonb_build_object(
          'eventId', e.id,
          'title', e.title,
          'artistName', e.artist_name,
          'artistIcon', e.artist_icon,
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
          'ticketSalesOverview', jsonb_build_array(jsonb_build_object('key', 'total', 'label', 'Total de vendas', 'shortLabel', 'TT', 'sold', 0, 'available', 0, 'courtesySold', 0, 'courtesyAvailable', 0, 'courtesyCapacity', 0, 'salesSold', 0, 'salesAvailable', 0, 'salesCapacity', 0)),
          'ticketImpressions', 0,
          'ticketClicks', 0,
          'sessions', coalesce((select jsonb_agg(jsonb_build_object('sessionId', s.id, 'startsAt', s.starts_at, 'status', s.status, 'venueId', s.venue_id, 'venueName', coalesce(s.venue_name, e.venue_name)) order by s.starts_at) from sessions s), '[]'::jsonb),
          'sections', coalesce((select jsonb_agg(jsonb_build_object('sectionId', s.id, 'name', s.name, 'slug', s.slug, 'capacity', s.capacity, 'hasNumberedSeats', s.has_numbered_seats, 'status', s.status) order by s.sort_order, s.name) from sections s), '[]'::jsonb),
          'prices', coalesce((select jsonb_agg(jsonb_build_object('priceId', p.id, 'sessionId', p.session_id, 'sectionId', p.section_id, 'sectionName', p.section_name, 'ticketType', p.ticket_type, 'label', p.label, 'priceCents', p.price_cents, 'feeCents', p.fee_cents, 'currency', p.currency, 'salesStartAt', p.sales_start_at, 'salesEndAt', p.sales_end_at, 'status', p.status) order by p.created_at) from prices p), '[]'::jsonb),
          'courtesy', jsonb_build_object('sections', coalesce((select jsonb_agg(jsonb_build_object('sectionId', s.id, 'sectionName', s.name, 'label', coalesce(cl.label, 'Cortesia'), 'limit', coalesce(cl.max_courtesies, 0), 'status', coalesce(cl.status, s.status)) order by s.sort_order, s.name) from sections s left join courtesy_limits cl on cl.section_id = s.id), '[]'::jsonb))
        )
      )
    end
  from event_row e
  cross join session_summary ss;
$$;

revoke all on function public.get_admin_event_editor_payload(uuid) from public;
revoke all on function public.get_admin_event_editor_payload(uuid) from anon;
revoke all on function public.get_admin_event_editor_payload(uuid) from authenticated;
grant execute on function public.get_admin_event_editor_payload(uuid) to service_role;
