create extension if not exists pg_trgm;
create extension if not exists unaccent;

create or replace function public.normalize_event_search_text(value text)
returns text
language sql
immutable
parallel safe
as $$
  select btrim(
    regexp_replace(
      regexp_replace(
        replace(lower(public.unaccent(coalesce(value, ''))), 'w', 'v'),
        '[^[:alnum:]]+',
        ' ',
        'g'
      ),
      '\s+',
      ' ',
      'g'
    )
  );
$$;

create table if not exists public.event_aliases (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events(id) on delete cascade,
  alias text not null,
  created_at timestamptz not null default now(),
  constraint event_aliases_alias_not_empty_check check (btrim(alias) <> '')
);

create unique index if not exists event_aliases_event_id_alias_unique_idx
on public.event_aliases(event_id, public.normalize_event_search_text(alias));

create index if not exists events_public_search_trgm_idx
on public.events
using gin (
  public.normalize_event_search_text(
    coalesce(title, '') || ' ' ||
    coalesce(artist_name, '') || ' ' ||
    coalesce(description, '')
  ) gin_trgm_ops
)
where status = 'published';

create index if not exists event_aliases_alias_trgm_idx
on public.event_aliases
using gin (public.normalize_event_search_text(alias) gin_trgm_ops);

alter table public.event_aliases enable row level security;

revoke all on table public.event_aliases from public;
revoke all on table public.event_aliases from anon;
revoke all on table public.event_aliases from authenticated;
grant all on table public.event_aliases to service_role;

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
          else similarity(public.normalize_event_search_text(ea.alias), input.term) * 58
        end
      ) as alias_score
    from public.event_aliases ea
    cross join input
    where input.term <> ''
      and (
        public.normalize_event_search_text(ea.alias) % input.term
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
        similarity(public.normalize_event_search_text(e.title), input.term) * 58,
        similarity(public.normalize_event_search_text(e.artist_name), input.term) * 62,
        similarity(public.normalize_event_search_text(coalesce(e.description, '')), input.term) * 34,
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
        public.normalize_event_search_text(e.title) % input.term
        or public.normalize_event_search_text(e.artist_name) % input.term
        or public.normalize_event_search_text(coalesce(e.description, '')) % input.term
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

comment on table public.event_aliases
is 'Optional public search aliases/apelidos for events. Used by the WhatsApp intelligent event search.';

comment on function public.search_public_events_ranked(text, timestamptz, timestamptz, integer)
is 'Ranks active public event sessions for WhatsApp search using normalized exact/prefix/contains and pg_trgm similarity.';
