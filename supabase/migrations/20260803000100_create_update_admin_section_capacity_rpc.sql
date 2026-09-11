alter table public.venue_sections
  drop constraint if exists venue_sections_capacity_positive_check;

alter table public.venue_sections
  add constraint venue_sections_capacity_non_negative_check
  check (capacity is null or capacity >= 0);

create or replace function public.update_admin_section_capacity(
  p_venue_id uuid,
  p_section_id uuid,
  p_session_ids uuid[],
  p_new_capacity integer
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_section record;
  v_current_capacity integer;
  v_reduce_by integer;
  v_to_add integer;
  v_busy_count integer;
  v_removable_count integer;
  v_created_count integer := 0;
  v_blocked_count integer := 0;
  v_unblocked_count integer := 0;
  v_prefix text;
begin
  if p_new_capacity is null or p_new_capacity < 0 then
    raise exception 'invalid_capacity';
  end if;

  if coalesce(array_length(p_session_ids, 1), 0) = 0 then
    raise exception 'missing_sessions';
  end if;

  select id, venue_id, capacity, has_numbered_seats
    into v_section
  from public.venue_sections
  where id = p_section_id
    and venue_id = p_venue_id
  for update;

  if not found then
    raise exception 'section_not_found';
  end if;

  if v_section.has_numbered_seats then
    raise exception 'numbered_section';
  end if;

  perform 1
  from public.event_sessions
  where id = any(p_session_ids)
  for update;

  perform 1
  from public.seats
  where section_id = p_section_id
  for update;

  perform 1
  from public.session_seats
  where section_id = p_section_id
    and session_id = any(p_session_ids)
  for update;

  select count(*)::integer
    into v_current_capacity
  from public.seats
  where section_id = p_section_id
    and status = 'active';

  if p_new_capacity = v_current_capacity then
    update public.venue_sections
      set capacity = p_new_capacity
    where id = p_section_id;

    return jsonb_build_object(
      'currentCapacity', v_current_capacity,
      'newCapacity', p_new_capacity,
      'createdCount', 0,
      'blockedCount', 0,
      'unblockedCount', 0
    );
  end if;

  if p_new_capacity < v_current_capacity then
    v_reduce_by := v_current_capacity - p_new_capacity;

    with busy_seats as (
      select distinct s.id
      from public.seats s
      join public.session_seats ss on ss.seat_id = s.id
      where s.section_id = p_section_id
        and s.status = 'active'
        and ss.session_id = any(p_session_ids)
        and ss.status in ('reserved', 'sold')
    )
    select count(*)::integer
      into v_busy_count
    from busy_seats;

    if p_new_capacity < v_busy_count then
      raise exception 'capacity_below_busy';
    end if;

    with candidate_seats as (
      select s.id
      from public.seats s
      where s.section_id = p_section_id
        and s.status = 'active'
        and (
          select count(*)
          from public.session_seats ss
          where ss.seat_id = s.id
            and ss.session_id = any(p_session_ids)
        ) = array_length(p_session_ids, 1)
        and not exists (
          select 1
          from public.session_seats ss
          where ss.seat_id = s.id
            and ss.session_id = any(p_session_ids)
            and ss.status <> 'available'
        )
      order by nullif(s.seat_number, '')::integer desc nulls last, s.seat_code desc
      limit v_reduce_by
    )
    select count(*)::integer
      into v_removable_count
    from candidate_seats;

    if v_removable_count < v_reduce_by then
      raise exception 'capacity_below_busy';
    end if;

    with seats_to_block as (
      select s.id
      from public.seats s
      where s.section_id = p_section_id
        and s.status = 'active'
        and (
          select count(*)
          from public.session_seats ss
          where ss.seat_id = s.id
            and ss.session_id = any(p_session_ids)
        ) = array_length(p_session_ids, 1)
        and not exists (
          select 1
          from public.session_seats ss
          where ss.seat_id = s.id
            and ss.session_id = any(p_session_ids)
            and ss.status <> 'available'
        )
      order by nullif(s.seat_number, '')::integer desc nulls last, s.seat_code desc
      limit v_reduce_by
    ),
    updated_session_seats as (
      update public.session_seats ss
        set status = 'blocked'
      from seats_to_block stb
      where ss.seat_id = stb.id
        and ss.session_id = any(p_session_ids)
        and ss.status = 'available'
      returning ss.id
    ),
    updated_seats as (
      update public.seats s
        set status = 'inactive'
      from seats_to_block stb
      where s.id = stb.id
        and s.status = 'active'
      returning s.id
    )
    select count(*)::integer
      into v_blocked_count
    from updated_session_seats;

    update public.venue_sections
      set capacity = p_new_capacity
    where id = p_section_id;

    return jsonb_build_object(
      'currentCapacity', v_current_capacity,
      'newCapacity', p_new_capacity,
      'createdCount', 0,
      'blockedCount', v_blocked_count,
      'unblockedCount', 0
    );
  end if;

  v_to_add := p_new_capacity - v_current_capacity;

  with inactive_candidates as (
    select s.id
    from public.seats s
    where s.section_id = p_section_id
      and s.status = 'inactive'
      and not exists (
        select 1
        from public.session_seats ss
        where ss.seat_id = s.id
          and ss.session_id = any(p_session_ids)
          and ss.status <> 'blocked'
      )
    order by nullif(s.seat_number, '')::integer asc nulls last, s.seat_code asc
    limit v_to_add
  ),
  reactivated_seats as (
    update public.seats s
      set status = 'active'
    from inactive_candidates ic
    where s.id = ic.id
      and s.status = 'inactive'
    returning s.id, s.section_id
  ),
  unblocked_session_seats as (
    update public.session_seats ss
      set status = 'available'
    from reactivated_seats rs
    where ss.seat_id = rs.id
      and ss.session_id = any(p_session_ids)
      and ss.status = 'blocked'
    returning ss.id
  )
  select count(*)::integer
    into v_unblocked_count
  from unblocked_session_seats;

  select p_new_capacity - count(*)::integer
    into v_to_add
  from public.seats
  where section_id = p_section_id
    and status = 'active';

  if v_to_add > 0 then
    select coalesce(regexp_replace(min(seat_code), '-[0-9]+$', ''), 'ENTRADA')
      into v_prefix
    from public.seats
    where section_id = p_section_id;

    with next_numbers as (
      select generate_series(
        coalesce((select max(nullif(seat_number, '')::integer) from public.seats where section_id = p_section_id), 0) + 1,
        coalesce((select max(nullif(seat_number, '')::integer) from public.seats where section_id = p_section_id), 0) + v_to_add
      ) as seat_number
    ),
    inserted_seats as (
      insert into public.seats (
        venue_id,
        section_id,
        row_label,
        seat_number,
        seat_code,
        map_x,
        map_y,
        status
      )
      select
        p_venue_id,
        p_section_id,
        null,
        next_numbers.seat_number::text,
        v_prefix || '-' || lpad(next_numbers.seat_number::text, 3, '0'),
        null,
        null,
        'active'
      from next_numbers
      returning id, section_id
    ),
    inserted_session_seats as (
      insert into public.session_seats (
        session_id,
        seat_id,
        section_id,
        status
      )
      select sid.session_id, inserted_seats.id, inserted_seats.section_id, 'available'
      from inserted_seats
      cross join unnest(p_session_ids) as sid(session_id)
      returning id
    )
    select count(*)::integer
      into v_created_count
    from inserted_session_seats;
  end if;

  insert into public.session_seats (
    session_id,
    seat_id,
    section_id,
    status
  )
  select sid.session_id, s.id, p_section_id, 'available'
  from public.seats s
  cross join unnest(p_session_ids) as sid(session_id)
  where s.section_id = p_section_id
    and s.status = 'active'
    and not exists (
      select 1
      from public.session_seats ss
      where ss.session_id = sid.session_id
        and ss.seat_id = s.id
    );

  update public.venue_sections
    set capacity = p_new_capacity
  where id = p_section_id;

  return jsonb_build_object(
    'currentCapacity', v_current_capacity,
    'newCapacity', p_new_capacity,
    'createdCount', v_created_count,
    'blockedCount', 0,
    'unblockedCount', v_unblocked_count
  );
end;
$$;

revoke all on function public.update_admin_section_capacity(uuid, uuid, uuid[], integer) from public;
grant execute on function public.update_admin_section_capacity(uuid, uuid, uuid[], integer) to service_role;
