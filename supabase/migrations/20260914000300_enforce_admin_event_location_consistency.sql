alter function public.update_admin_event_catalog(uuid, uuid, jsonb)
  rename to update_admin_event_catalog_legacy;

alter table public.admin_event_operations
  drop constraint admin_event_operations_type_check;

alter table public.admin_event_operations
  add constraint admin_event_operations_type_check
  check (operation_type in ('create', 'duplicate', 'update', 'venue_update', 'location_update'));

create or replace function public.admin_event_location_block_reason(p_event_id uuid)
returns text
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select case
    when exists (
      select 1
      from public.events e
      join public.event_sessions es on es.event_id = e.id
      where e.id = p_event_id
        and coalesce(es.venue_id, e.venue_id) is distinct from e.venue_id
    ) then 'admin_event_multi_venue_location_change_unsupported'
    when exists (
      select 1
      from public.ticket_prices tp
      join public.event_sessions es on es.id = tp.session_id
      where es.event_id = p_event_id
    ) or exists (
      select 1
      from public.session_seats ss
      join public.event_sessions es on es.id = ss.session_id
      where es.event_id = p_event_id
    ) or exists (
      select 1 from public.courtesy_section_limits csl where csl.event_id = p_event_id
    ) or exists (
      select 1
      from public.reservations r
      join public.event_sessions es on es.id = r.session_id
      where es.event_id = p_event_id
    ) or exists (
      select 1
      from public.tickets t
      join public.event_sessions es on es.id = t.session_id
      where es.event_id = p_event_id
    ) then 'admin_event_location_requires_remap'
    else null
  end;
$$;

create or replace function public.update_admin_event_catalog(
  p_operation_id uuid,
  p_event_id uuid,
  p_payload jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_current_event public.events%rowtype;
  v_current_venue public.venues%rowtype;
  v_location_changed boolean;
  v_block_reason text;
  v_session_ids uuid[] := '{}'::uuid[];
  v_session_venue_ids uuid[] := '{}'::uuid[];
  v_index integer;
  v_result jsonb;
begin
  select * into v_current_event
  from public.events where id = p_event_id for update;
  if not found then raise exception 'event_not_found'; end if;

  if v_current_event.venue_id is not null then
    select * into v_current_venue
    from public.venues where id = v_current_event.venue_id for share;
  end if;

  v_location_changed :=
    lower(btrim(coalesce(v_current_venue.name, ''))) is distinct from
      lower(btrim(coalesce(nullif(p_payload #>> '{venue,name}', ''), v_current_venue.name, '')))
    or lower(btrim(coalesce(v_current_event.city, ''))) is distinct from
      lower(btrim(coalesce(nullif(p_payload #>> '{venue,city}', ''), p_payload #>> '{event,city}', v_current_event.city, '')))
    or upper(btrim(coalesce(v_current_event.state, ''))) is distinct from
      upper(btrim(coalesce(nullif(p_payload #>> '{venue,state}', ''), p_payload #>> '{event,state}', v_current_event.state, '')));

  select coalesce(array_agg(es.id order by es.id), '{}'::uuid[]),
         coalesce(array_agg(es.venue_id order by es.id), '{}'::uuid[])
  into v_session_ids, v_session_venue_ids
  from public.event_sessions es
  where es.event_id = p_event_id;

  if v_location_changed then
    v_block_reason := public.admin_event_location_block_reason(p_event_id);
    if v_block_reason is not null then raise exception '%', v_block_reason; end if;
  elsif exists (
    select 1
    from public.events e
    join public.event_sessions es on es.event_id = e.id
    where e.id = p_event_id
      and coalesce(es.venue_id, e.venue_id) is distinct from e.venue_id
  ) and jsonb_array_length(coalesce(p_payload->'new_sections', '[]'::jsonb)) > 0 then
    raise exception 'admin_event_multi_venue_catalog_change_unsupported';
  end if;

  select public.update_admin_event_catalog_legacy(
    p_operation_id, p_event_id, p_payload
  ) into v_result;

  if not v_location_changed then
    for v_index in 1..coalesce(array_length(v_session_ids, 1), 0) loop
      update public.event_sessions
      set venue_id = v_session_venue_ids[v_index]
      where id = v_session_ids[v_index];
    end loop;
  end if;

  return v_result;
end;
$$;

create or replace function public.update_admin_event_location(
  p_operation_id uuid,
  p_event_id uuid,
  p_venue_name text,
  p_city text,
  p_state text
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_payload jsonb;
  v_hash text;
  v_existing public.admin_event_operations%rowtype;
  v_current_event public.events%rowtype;
  v_current_venue public.venues%rowtype;
  v_location_changed boolean;
  v_block_reason text;
  v_venue_id uuid;
  v_result jsonb;
begin
  if p_operation_id is null or p_event_id is null
     or nullif(btrim(p_venue_name), '') is null
     or nullif(btrim(p_city), '') is null
     or nullif(btrim(p_state), '') is null then
    raise exception 'invalid_admin_event_location_operation';
  end if;

  v_payload := jsonb_build_object(
    'event_id', p_event_id,
    'venue_name', btrim(p_venue_name),
    'city', btrim(p_city),
    'state', upper(btrim(p_state))
  );
  v_hash := pg_catalog.encode(
    extensions.digest(pg_catalog.convert_to(v_payload::text, 'UTF8'), 'sha256'),
    'hex'
  );

  insert into public.admin_event_operations (
    operation_id, operation_type, payload_hash, result_event_id, status
  ) values (
    p_operation_id, 'location_update', v_hash, p_event_id, 'pending'
  ) on conflict (operation_id) do nothing;

  select * into v_existing
  from public.admin_event_operations
  where operation_id = p_operation_id
  for update;
  if v_existing.operation_type is distinct from 'location_update'
     or v_existing.payload_hash is distinct from v_hash
     or v_existing.result_event_id is distinct from p_event_id then
    raise exception 'admin_event_operation_payload_mismatch';
  end if;
  if v_existing.status = 'completed' then return v_existing.result; end if;

  select * into v_current_event
  from public.events where id = p_event_id for update;
  if not found then raise exception 'event_not_found'; end if;
  if v_current_event.venue_id is not null then
    select * into v_current_venue
    from public.venues where id = v_current_event.venue_id for share;
  end if;

  v_location_changed :=
    lower(btrim(coalesce(v_current_venue.name, ''))) is distinct from lower(btrim(p_venue_name))
    or lower(btrim(coalesce(v_current_event.city, ''))) is distinct from lower(btrim(p_city))
    or upper(btrim(coalesce(v_current_event.state, ''))) is distinct from upper(btrim(p_state));

  if v_location_changed then
    v_block_reason := public.admin_event_location_block_reason(p_event_id);
    if v_block_reason is not null then raise exception '%', v_block_reason; end if;

    select id into v_venue_id
    from public.venues
    where lower(btrim(name)) = lower(btrim(p_venue_name))
      and lower(btrim(city)) = lower(btrim(p_city))
      and upper(btrim(state)) = upper(btrim(p_state))
    order by created_at asc limit 1 for update;
    if v_venue_id is null then
      insert into public.venues (name, city, state, status)
      values (btrim(p_venue_name), btrim(p_city), upper(btrim(p_state)), 'active')
      returning id into v_venue_id;
    end if;

    update public.events
    set venue_id = v_venue_id, city = btrim(p_city), state = upper(btrim(p_state))
    where id = p_event_id;
    update public.event_sessions set venue_id = v_venue_id where event_id = p_event_id;
  else
    v_venue_id := v_current_event.venue_id;
  end if;

  v_result := jsonb_build_object(
    'ok', true, 'eventId', p_event_id, 'venueId', v_venue_id
  );
  update public.admin_event_operations set
    result = v_result, status = 'completed', completed_at = pg_catalog.now()
  where operation_id = p_operation_id;
  return v_result;
end;
$$;

revoke all on function public.admin_event_location_block_reason(uuid) from public;
revoke all on function public.admin_event_location_block_reason(uuid) from anon;
revoke all on function public.admin_event_location_block_reason(uuid) from authenticated;
revoke all on function public.admin_event_location_block_reason(uuid) from service_role;

revoke all on function public.update_admin_event_catalog_legacy(uuid, uuid, jsonb) from public;
revoke all on function public.update_admin_event_catalog_legacy(uuid, uuid, jsonb) from anon;
revoke all on function public.update_admin_event_catalog_legacy(uuid, uuid, jsonb) from authenticated;
revoke all on function public.update_admin_event_catalog_legacy(uuid, uuid, jsonb) from service_role;

revoke all on function public.update_admin_event_catalog(uuid, uuid, jsonb) from public;
revoke all on function public.update_admin_event_catalog(uuid, uuid, jsonb) from anon;
revoke all on function public.update_admin_event_catalog(uuid, uuid, jsonb) from authenticated;
grant execute on function public.update_admin_event_catalog(uuid, uuid, jsonb) to service_role;

revoke all on function public.update_admin_event_location(uuid, uuid, text, text, text) from public;
revoke all on function public.update_admin_event_location(uuid, uuid, text, text, text) from anon;
revoke all on function public.update_admin_event_location(uuid, uuid, text, text, text) from authenticated;
grant execute on function public.update_admin_event_location(uuid, uuid, text, text, text) to service_role;

comment on function public.update_admin_event_catalog(uuid, uuid, jsonb) is
  'Updates an administrative event aggregate while preserving per-session venues unless location changes safely.';
comment on function public.update_admin_event_location(uuid, uuid, text, text, text) is
  'Atomically and idempotently updates event and session location, rejecting multi-venue or mapped aggregates.';
