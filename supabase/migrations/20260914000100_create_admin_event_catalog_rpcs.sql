create table if not exists public.admin_event_operations (
  operation_id uuid primary key,
  operation_type text not null,
  payload_hash text not null,
  result_event_id uuid references public.events(id),
  result jsonb,
  status text not null default 'pending',
  created_at timestamptz not null default pg_catalog.now(),
  completed_at timestamptz,
  constraint admin_event_operations_type_check
    check (operation_type in ('create', 'duplicate', 'update')),
  constraint admin_event_operations_status_check
    check (status in ('pending', 'completed')),
  constraint admin_event_operations_payload_hash_check
    check (btrim(payload_hash) <> '')
);

revoke all on table public.admin_event_operations from public;
revoke all on table public.admin_event_operations from anon;
revoke all on table public.admin_event_operations from authenticated;
grant select, insert, update on table public.admin_event_operations to service_role;

create or replace function public.create_admin_event_catalog(
  p_operation_id uuid,
  p_operation_type text,
  p_payload jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_hash text;
  v_existing public.admin_event_operations%rowtype;
  v_venue_id uuid;
  v_event_id uuid;
  v_session_ids jsonb := '{}'::jsonb;
  v_section_ids jsonb := '{}'::jsonb;
  v_session jsonb;
  v_section jsonb;
  v_price jsonb;
  v_seat jsonb;
  v_session_key text;
  v_section_key text;
  v_session_id uuid;
  v_section_id uuid;
  v_base_slug text;
  v_slug text;
  v_slug_suffix integer;
  v_seat_id uuid;
  v_sessions_count integer := 0;
  v_sections_count integer := 0;
  v_seats_count integer := 0;
  v_prices_count integer := 0;
  v_result jsonb;
begin
  if p_operation_id is null or p_payload is null then
    raise exception 'invalid_admin_event_operation';
  end if;
  if p_operation_type not in ('create', 'duplicate') then
    raise exception 'invalid_admin_event_operation_type';
  end if;

  v_hash := pg_catalog.encode(
    extensions.digest(pg_catalog.convert_to(p_payload::text, 'UTF8'), 'sha256'),
    'hex'
  );

  insert into public.admin_event_operations (
    operation_id, operation_type, payload_hash, status
  ) values (
    p_operation_id, p_operation_type, v_hash, 'pending'
  ) on conflict (operation_id) do nothing;

  select * into v_existing
  from public.admin_event_operations
  where operation_id = p_operation_id
  for update;

  if v_existing.operation_type is distinct from p_operation_type
     or v_existing.payload_hash is distinct from v_hash then
    raise exception 'admin_event_operation_payload_mismatch';
  end if;
  if v_existing.status = 'completed' then
    return v_existing.result;
  end if;

  if nullif(p_payload #>> '{venue,existing_id}', '') is not null then
    v_venue_id := (p_payload #>> '{venue,existing_id}')::uuid;
    perform 1 from public.venues where id = v_venue_id for share;
    if not found then raise exception 'venue_not_found'; end if;
  elsif coalesce((p_payload #>> '{venue,reuse_existing}')::boolean, false) then
    select id into v_venue_id
    from public.venues
    where lower(btrim(name)) = lower(btrim(p_payload #>> '{venue,name}'))
      and lower(btrim(city)) = lower(btrim(p_payload #>> '{venue,city}'))
      and upper(btrim(state)) = upper(btrim(p_payload #>> '{venue,state}'))
    order by created_at asc
    limit 1
    for update;
  end if;

  if v_venue_id is null and nullif(p_payload #>> '{venue,name}', '') is not null then
    insert into public.venues (name, city, state, status)
    values (
      btrim(p_payload #>> '{venue,name}'),
      btrim(p_payload #>> '{venue,city}'),
      upper(btrim(p_payload #>> '{venue,state}')),
      'active'
    ) returning id into v_venue_id;
  end if;

  insert into public.events (
    title, artist_name, artist_icon, description, city, state, image_url,
    venue_id, status, created_by_admin_user_id, created_by_admin_phone
  ) values (
    btrim(p_payload #>> '{event,title}'),
    btrim(p_payload #>> '{event,artist_name}'),
    coalesce(nullif(btrim(p_payload #>> '{event,artist_icon}'), ''), '🎤'),
    nullif(btrim(p_payload #>> '{event,description}'), ''),
    btrim(p_payload #>> '{event,city}'),
    upper(btrim(p_payload #>> '{event,state}')),
    nullif(p_payload #>> '{event,image_url}', ''),
    v_venue_id,
    'draft',
    nullif(p_payload #>> '{event,created_by_admin_user_id}', '')::uuid,
    nullif(p_payload #>> '{event,created_by_admin_phone}', '')
  ) returning id into v_event_id;

  for v_session in select value from jsonb_array_elements(coalesce(p_payload->'sessions', '[]'::jsonb)) loop
    v_session_key := v_session->>'key';
    if nullif(v_session_key, '') is null or v_session_ids ? v_session_key then
      raise exception 'invalid_or_duplicate_session_key';
    end if;
    insert into public.event_sessions (event_id, venue_id, starts_at, status)
    values (
      v_event_id,
      v_venue_id,
      (v_session->>'starts_at')::timestamptz,
      coalesce(nullif(v_session->>'status', ''), 'scheduled')
    ) returning id into v_session_id;
    v_session_ids := v_session_ids || jsonb_build_object(v_session_key, v_session_id);
    v_sessions_count := v_sessions_count + 1;
  end loop;

  if v_sessions_count = 0 then raise exception 'sessions_not_created'; end if;

  for v_section in select value from jsonb_array_elements(coalesce(p_payload->'sections', '[]'::jsonb)) loop
    v_section_key := v_section->>'key';
    if nullif(v_section_key, '') is null or v_section_ids ? v_section_key then
      raise exception 'invalid_or_duplicate_section_key';
    end if;
    v_base_slug := btrim(v_section->>'slug');
    v_slug := v_base_slug;
    v_slug_suffix := 2;
    while exists (
      select 1 from public.venue_sections
      where venue_id = v_venue_id and slug = v_slug
    ) loop
      v_slug := v_base_slug || '-' || v_slug_suffix;
      v_slug_suffix := v_slug_suffix + 1;
    end loop;
    insert into public.venue_sections (
      venue_id, name, slug, capacity, has_numbered_seats, status
    ) values (
      v_venue_id,
      btrim(v_section->>'name'),
      v_slug,
      nullif(v_section->>'capacity', '')::integer,
      coalesce((v_section->>'has_numbered_seats')::boolean, false),
      coalesce(nullif(v_section->>'status', ''), 'active')
    ) returning id into v_section_id;
    v_section_ids := v_section_ids || jsonb_build_object(v_section_key, v_section_id);
    v_sections_count := v_sections_count + 1;

    for v_price in select value from jsonb_array_elements(coalesce(v_section->'prices', '[]'::jsonb)) loop
      v_session_id := nullif(v_session_ids->>(v_price->>'session_key'), '')::uuid;
      if v_session_id is null then raise exception 'price_session_not_found'; end if;
      insert into public.ticket_prices (
        session_id, section_id, ticket_type, label, price_cents, fee_cents,
        currency, sales_start_at, sales_end_at, status
      ) values (
        v_session_id, v_section_id, v_price->>'ticket_type', btrim(v_price->>'label'),
        (v_price->>'price_cents')::integer, coalesce((v_price->>'fee_cents')::integer, 0),
        coalesce(nullif(v_price->>'currency', ''), 'BRL'),
        nullif(v_price->>'sales_start_at', '')::timestamptz,
        nullif(v_price->>'sales_end_at', '')::timestamptz,
        coalesce(nullif(v_price->>'status', ''), 'active')
      );
      v_prices_count := v_prices_count + 1;
    end loop;

    for v_seat in select value from jsonb_array_elements(coalesce(v_section->'seats', '[]'::jsonb)) loop
      insert into public.seats (
        venue_id, section_id, row_label, seat_number, seat_code,
        map_x, map_y, status
      ) values (
        v_venue_id, v_section_id, nullif(v_seat->>'row_label', ''),
        v_seat->>'seat_number', v_seat->>'seat_code',
        nullif(v_seat->>'map_x', '')::numeric,
        nullif(v_seat->>'map_y', '')::numeric,
        coalesce(nullif(v_seat->>'status', ''), 'active')
      ) returning id into v_seat_id;

      for v_session in select value from jsonb_array_elements(coalesce(p_payload->'sessions', '[]'::jsonb)) loop
        v_session_id := nullif(v_session_ids->>(v_session->>'key'), '')::uuid;
        insert into public.session_seats (session_id, seat_id, section_id, status)
        values (
          v_session_id, v_seat_id, v_section_id,
          case when coalesce(nullif(v_seat->>'status', ''), 'active') = 'active'
            then 'available' else 'blocked' end
        );
        v_seats_count := v_seats_count + 1;
      end loop;
    end loop;
  end loop;

  if coalesce(p_payload #>> '{event,status}', 'draft') = 'published' then
    update public.event_sessions set status = 'sales_open' where event_id = v_event_id;
    update public.events set status = 'published' where id = v_event_id;
  end if;

  v_result := jsonb_build_object(
    'ok', true,
    'eventId', v_event_id,
    'venueId', v_venue_id,
    'sessionId', nullif(v_session_ids->>(p_payload #>> '{sessions,0,key}'), '')::uuid,
    'sessionsCount', v_sessions_count,
    'createdSectionsCount', v_sections_count,
    'createdSeatsCount', v_seats_count,
    'createdPricesCount', v_prices_count
  );

  update public.admin_event_operations
  set result_event_id = v_event_id, result = v_result, status = 'completed',
      completed_at = pg_catalog.now()
  where operation_id = p_operation_id;

  return v_result;
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
  v_hash text;
  v_existing public.admin_event_operations%rowtype;
  v_current_event public.events%rowtype;
  v_venue_id uuid;
  v_session jsonb;
  v_section jsonb;
  v_price jsonb;
  v_limit jsonb;
  v_session_ids uuid[];
  v_loop_session_id uuid;
  v_new_section_id uuid;
  v_base_slug text;
  v_slug text;
  v_slug_suffix integer;
  v_seat_id uuid;
  v_index integer;
  v_result jsonb;
begin
  if p_operation_id is null or p_event_id is null or p_payload is null then
    raise exception 'invalid_admin_event_operation';
  end if;

  v_hash := pg_catalog.encode(
    extensions.digest(pg_catalog.convert_to(p_payload::text, 'UTF8'), 'sha256'),
    'hex'
  );
  insert into public.admin_event_operations (
    operation_id, operation_type, payload_hash, result_event_id, status
  ) values (
    p_operation_id, 'update', v_hash, p_event_id, 'pending'
  ) on conflict (operation_id) do nothing;

  select * into v_existing
  from public.admin_event_operations
  where operation_id = p_operation_id
  for update;
  if v_existing.operation_type is distinct from 'update'
     or v_existing.payload_hash is distinct from v_hash
     or v_existing.result_event_id is distinct from p_event_id then
    raise exception 'admin_event_operation_payload_mismatch';
  end if;
  if v_existing.status = 'completed' then return v_existing.result; end if;

  select * into v_current_event
  from public.events where id = p_event_id for update;
  if not found then raise exception 'event_not_found'; end if;

  if coalesce((p_payload #>> '{venue,keep_current}')::boolean, false) then
    v_venue_id := v_current_event.venue_id;
  else
    select id into v_venue_id
    from public.venues
    where lower(btrim(name)) = lower(btrim(p_payload #>> '{venue,name}'))
      and lower(btrim(city)) = lower(btrim(p_payload #>> '{venue,city}'))
      and upper(btrim(state)) = upper(btrim(p_payload #>> '{venue,state}'))
    order by created_at asc limit 1 for update;
    if v_venue_id is null then
      insert into public.venues (name, city, state, status)
      values (
        btrim(p_payload #>> '{venue,name}'), btrim(p_payload #>> '{venue,city}'),
        upper(btrim(p_payload #>> '{venue,state}')), 'active'
      ) returning id into v_venue_id;
    end if;
  end if;

  select coalesce(array_agg((value->>'session_id')::uuid), '{}'::uuid[])
  into v_session_ids
  from jsonb_array_elements(coalesce(p_payload->'sessions', '[]'::jsonb));

  if exists (
    select 1 from unnest(v_session_ids) sid
    where not exists (
      select 1 from public.event_sessions es
      where es.id = sid and es.event_id = p_event_id
    )
  ) then raise exception 'session_not_in_event'; end if;

  if exists (
    select 1 from jsonb_array_elements(coalesce(p_payload->'sections', '[]'::jsonb)) item
    where not exists (
      select 1 from public.venue_sections vs
      where vs.id = (item->>'section_id')::uuid
        and vs.venue_id = v_current_event.venue_id
    )
  ) then raise exception 'section_not_in_event_venue'; end if;

  if exists (
    select 1 from jsonb_array_elements(coalesce(p_payload->'prices', '[]'::jsonb)) item
    where not exists (
      select 1 from public.ticket_prices tp
      join public.event_sessions es on es.id = tp.session_id
      where tp.id = (item->>'price_id')::uuid and es.event_id = p_event_id
    )
  ) then raise exception 'price_not_in_event'; end if;

  if exists (
    select 1 from jsonb_array_elements(coalesce(p_payload->'courtesy_limits', '[]'::jsonb)) item
    where not exists (
      select 1 from public.venue_sections vs
      where vs.id = (item->>'section_id')::uuid
        and vs.venue_id = v_current_event.venue_id
    )
  ) then raise exception 'courtesy_section_not_in_event_venue'; end if;

  update public.events set
    title = btrim(p_payload #>> '{event,title}'),
    artist_name = btrim(p_payload #>> '{event,artist_name}'),
    artist_icon = coalesce(nullif(btrim(p_payload #>> '{event,artist_icon}'), ''), '🎤'),
    description = nullif(btrim(p_payload #>> '{event,description}'), ''),
    city = btrim(p_payload #>> '{event,city}'),
    state = upper(btrim(p_payload #>> '{event,state}')),
    venue_id = v_venue_id,
    image_url = nullif(p_payload #>> '{event,image_url}', '')
  where id = p_event_id;

  for v_session in select value from jsonb_array_elements(coalesce(p_payload->'sessions', '[]'::jsonb)) loop
    if (v_session->>'starts_at')::timestamptz is distinct from (
      select starts_at from public.event_sessions where id = (v_session->>'session_id')::uuid
    ) and (
      exists (select 1 from public.reservations where session_id = (v_session->>'session_id')::uuid)
      or exists (select 1 from public.tickets where session_id = (v_session->>'session_id')::uuid)
    ) then raise exception 'session_has_usage'; end if;

    update public.event_sessions set
      starts_at = (v_session->>'starts_at')::timestamptz,
      venue_id = v_venue_id,
      status = v_session->>'status'
    where id = (v_session->>'session_id')::uuid and event_id = p_event_id;
  end loop;

  for v_section in select value from jsonb_array_elements(coalesce(p_payload->'sections', '[]'::jsonb)) loop
    if not coalesce((v_section->>'has_numbered_seats')::boolean, false)
       and nullif(v_section->>'capacity', '') is not null then
      perform public.update_admin_section_capacity(
        v_current_event.venue_id,
        (v_section->>'section_id')::uuid,
        v_session_ids,
        (v_section->>'capacity')::integer
      );
      update public.venue_sections set
        name = btrim(v_section->>'name'), status = v_section->>'status'
      where id = (v_section->>'section_id')::uuid;
    else
      update public.venue_sections set
        name = btrim(v_section->>'name'),
        capacity = nullif(v_section->>'capacity', '')::integer,
        status = v_section->>'status'
      where id = (v_section->>'section_id')::uuid;
    end if;
  end loop;

  for v_section in select value from jsonb_array_elements(coalesce(p_payload->'new_sections', '[]'::jsonb)) loop
    v_base_slug := btrim(v_section->>'slug');
    v_slug := v_base_slug;
    v_slug_suffix := 2;
    while exists (
      select 1 from public.venue_sections
      where venue_id = v_venue_id and slug = v_slug
    ) loop
      v_slug := v_base_slug || '-' || v_slug_suffix;
      v_slug_suffix := v_slug_suffix + 1;
    end loop;
    insert into public.venue_sections (
      venue_id, name, slug, capacity, has_numbered_seats, status
    ) values (
      v_venue_id, btrim(v_section->>'name'), v_slug,
      (v_section->>'capacity')::integer, false, 'active'
    ) returning id into v_new_section_id;

    for v_loop_session_id in select unnest(v_session_ids) loop
      insert into public.ticket_prices (
        session_id, section_id, ticket_type, label, price_cents, fee_cents,
        currency, status
      ) values (v_loop_session_id, v_new_section_id, 'full', btrim(v_section->>'name'), 0, 0, 'BRL', 'active');
    end loop;

    for v_index in 1..(v_section->>'capacity')::integer loop
      insert into public.seats (
        venue_id, section_id, row_label, seat_number, seat_code, status
      ) values (
        v_venue_id, v_new_section_id, null, v_index::text,
        upper(regexp_replace(v_slug, '[^a-zA-Z0-9]', '', 'g')) || '-' || lpad(v_index::text, 4, '0'),
        'active'
      ) returning id into v_seat_id;
      for v_loop_session_id in select unnest(v_session_ids) loop
        insert into public.session_seats (session_id, seat_id, section_id, status)
        values (v_loop_session_id, v_seat_id, v_new_section_id, 'available');
      end loop;
    end loop;
  end loop;

  for v_price in select value from jsonb_array_elements(coalesce(p_payload->'prices', '[]'::jsonb)) loop
    update public.ticket_prices set
      label = btrim(v_price->>'label'),
      price_cents = (v_price->>'price_cents')::integer,
      fee_cents = (v_price->>'fee_cents')::integer,
      sales_start_at = nullif(v_price->>'sales_start_at', '')::timestamptz,
      sales_end_at = nullif(v_price->>'sales_end_at', '')::timestamptz,
      status = v_price->>'status'
    where id = (v_price->>'price_id')::uuid;
  end loop;

  for v_limit in select value from jsonb_array_elements(coalesce(p_payload->'courtesy_limits', '[]'::jsonb)) loop
    insert into public.courtesy_section_limits (
      event_id, section_id, label, max_courtesies, status
    ) values (
      p_event_id, (v_limit->>'section_id')::uuid,
      coalesce(nullif(btrim(v_limit->>'label'), ''), 'Cortesia'),
      greatest(0, (v_limit->>'max_courtesies')::integer), v_limit->>'status'
    ) on conflict (event_id, section_id) do update set
      label = excluded.label,
      max_courtesies = excluded.max_courtesies,
      status = excluded.status;
  end loop;

  update public.events set status = p_payload #>> '{event,status}' where id = p_event_id;

  v_result := jsonb_build_object('ok', true, 'eventId', p_event_id, 'venueId', v_venue_id);
  update public.admin_event_operations set
    result = v_result, status = 'completed', completed_at = pg_catalog.now()
  where operation_id = p_operation_id;
  return v_result;
end;
$$;

revoke all on function public.create_admin_event_catalog(uuid, text, jsonb) from public;
revoke all on function public.create_admin_event_catalog(uuid, text, jsonb) from anon;
revoke all on function public.create_admin_event_catalog(uuid, text, jsonb) from authenticated;
grant execute on function public.create_admin_event_catalog(uuid, text, jsonb) to service_role;

revoke all on function public.update_admin_event_catalog(uuid, uuid, jsonb) from public;
revoke all on function public.update_admin_event_catalog(uuid, uuid, jsonb) from anon;
revoke all on function public.update_admin_event_catalog(uuid, uuid, jsonb) from authenticated;
grant execute on function public.update_admin_event_catalog(uuid, uuid, jsonb) to service_role;

comment on table public.admin_event_operations is
  'Canonical idempotency ledger for atomic administrative event mutations.';
comment on function public.create_admin_event_catalog(uuid, text, jsonb) is
  'Atomically creates a new event aggregate for create or duplicate operations.';
comment on function public.update_admin_event_catalog(uuid, uuid, jsonb) is
  'Atomically updates the complete editable event aggregate.';
