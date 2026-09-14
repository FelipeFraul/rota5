alter table public.admin_event_operations
  drop constraint admin_event_operations_type_check;

alter table public.admin_event_operations
  add constraint admin_event_operations_type_check
  check (operation_type in ('create', 'duplicate', 'update', 'venue_update'));

create or replace function public.update_admin_event_venue(
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
  v_venue_id uuid;
  v_result jsonb;
begin
  if p_operation_id is null or p_event_id is null
     or nullif(btrim(p_venue_name), '') is null
     or nullif(btrim(p_city), '') is null
     or nullif(btrim(p_state), '') is null then
    raise exception 'invalid_admin_event_venue_operation';
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
    p_operation_id, 'venue_update', v_hash, p_event_id, 'pending'
  ) on conflict (operation_id) do nothing;

  select * into v_existing
  from public.admin_event_operations
  where operation_id = p_operation_id
  for update;

  if v_existing.operation_type is distinct from 'venue_update'
     or v_existing.payload_hash is distinct from v_hash
     or v_existing.result_event_id is distinct from p_event_id then
    raise exception 'admin_event_operation_payload_mismatch';
  end if;
  if v_existing.status = 'completed' then return v_existing.result; end if;

  perform 1 from public.events where id = p_event_id for update;
  if not found then raise exception 'event_not_found'; end if;

  select id into v_venue_id
  from public.venues
  where lower(btrim(name)) = lower(btrim(p_venue_name))
    and lower(btrim(city)) = lower(btrim(p_city))
    and upper(btrim(state)) = upper(btrim(p_state))
  order by created_at asc
  limit 1
  for update;

  if v_venue_id is null then
    insert into public.venues (name, city, state, status)
    values (btrim(p_venue_name), btrim(p_city), upper(btrim(p_state)), 'active')
    returning id into v_venue_id;
  end if;

  update public.events set venue_id = v_venue_id where id = p_event_id;

  v_result := jsonb_build_object(
    'ok', true,
    'eventId', p_event_id,
    'venueId', v_venue_id
  );
  update public.admin_event_operations set
    result = v_result, status = 'completed', completed_at = pg_catalog.now()
  where operation_id = p_operation_id;

  return v_result;
end;
$$;

revoke all on function public.update_admin_event_venue(uuid, uuid, text, text, text) from public;
revoke all on function public.update_admin_event_venue(uuid, uuid, text, text, text) from anon;
revoke all on function public.update_admin_event_venue(uuid, uuid, text, text, text) from authenticated;
grant execute on function public.update_admin_event_venue(uuid, uuid, text, text, text) to service_role;

comment on function public.update_admin_event_venue(uuid, uuid, text, text, text) is
  'Atomically and idempotently finds or creates a venue and assigns it to an event.';
