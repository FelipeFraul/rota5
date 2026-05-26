create table if not exists public.rate_limit_events (
  route_key text not null,
  source_hash text not null,
  window_start timestamptz not null,
  window_seconds integer not null,
  request_count integer not null default 0,
  expires_at timestamptz not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (route_key, source_hash, window_start),
  constraint rate_limit_events_route_key_not_empty_check check (btrim(route_key) <> ''),
  constraint rate_limit_events_source_hash_not_empty_check check (btrim(source_hash) <> ''),
  constraint rate_limit_events_window_seconds_check check (window_seconds > 0),
  constraint rate_limit_events_request_count_check check (request_count >= 0)
);

create index if not exists rate_limit_events_expires_at_idx
on public.rate_limit_events(expires_at);

drop trigger if exists set_rate_limit_events_updated_at on public.rate_limit_events;
create trigger set_rate_limit_events_updated_at
before update on public.rate_limit_events
for each row execute function public.set_updated_at();

create or replace function public.consume_rate_limit(
  p_route_key text,
  p_source_hash text,
  p_limit integer,
  p_window_seconds integer,
  p_now timestamptz default now()
)
returns jsonb
language plpgsql
as $$
declare
  v_window_start timestamptz;
  v_window_end timestamptz;
  v_request_count integer;
  v_retry_after integer;
begin
  if p_route_key is null or btrim(p_route_key) = '' then
    raise exception 'route_key_required';
  end if;

  if p_source_hash is null or btrim(p_source_hash) = '' then
    raise exception 'source_hash_required';
  end if;

  if p_limit is null or p_limit < 1 then
    raise exception 'limit_invalid';
  end if;

  if p_window_seconds is null or p_window_seconds < 1 then
    raise exception 'window_seconds_invalid';
  end if;

  v_window_start := to_timestamp(
    floor(extract(epoch from p_now) / p_window_seconds) * p_window_seconds
  );
  v_window_end := v_window_start + make_interval(secs => p_window_seconds);

  insert into public.rate_limit_events (
    route_key,
    source_hash,
    window_start,
    window_seconds,
    request_count,
    expires_at
  )
  values (
    btrim(p_route_key),
    btrim(p_source_hash),
    v_window_start,
    p_window_seconds,
    1,
    v_window_end + interval '1 hour'
  )
  on conflict (route_key, source_hash, window_start)
  do update set
    request_count = public.rate_limit_events.request_count + 1,
    expires_at = excluded.expires_at
  returning request_count
  into v_request_count;

  v_retry_after := greatest(1, ceil(extract(epoch from (v_window_end - p_now)))::integer);

  return jsonb_build_object(
    'allowed', v_request_count <= p_limit,
    'reason', case when v_request_count <= p_limit then null else 'rate_limited' end,
    'retry_after_seconds', case when v_request_count <= p_limit then 0 else v_retry_after end,
    'count', v_request_count,
    'limit', p_limit,
    'window_seconds', p_window_seconds
  );
end;
$$;

comment on table public.rate_limit_events
is 'Aggregated application rate-limit windows. Stores only route keys and hashed request source identifiers.';

comment on column public.rate_limit_events.source_hash
is 'SHA-256 hash of the request source and optional route scope. Raw IPs, tokens and payloads are not stored.';

comment on function public.consume_rate_limit(text, text, integer, integer, timestamptz)
is 'Atomically increments and checks an application rate-limit window without storing raw request data.';

revoke all on table public.rate_limit_events from public;
revoke all on table public.rate_limit_events from anon;
revoke all on table public.rate_limit_events from authenticated;
grant select, insert, update, delete on table public.rate_limit_events to service_role;

revoke all on function public.consume_rate_limit(text, text, integer, integer, timestamptz) from public;
revoke all on function public.consume_rate_limit(text, text, integer, integer, timestamptz) from anon;
revoke all on function public.consume_rate_limit(text, text, integer, integer, timestamptz) from authenticated;
grant execute on function public.consume_rate_limit(text, text, integer, integer, timestamptz) to service_role;
