alter table public.ticket_validation_events
add column if not exists gate_session_id uuid references public.gate_sessions(id);

create index if not exists ticket_validation_events_gate_session_id_idx
on public.ticket_validation_events(gate_session_id);

create or replace function public.validate_ticket_entry(
  p_ticket_id uuid,
  p_ticket_code text,
  p_gate_session_id uuid default null,
  p_gate_label text default null,
  p_validator_identifier text default null,
  p_metadata jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
as $$
declare
  v_now timestamptz := now();
  v_ticket record;
  v_result text;
  v_message text;
  v_allowed boolean := false;
  v_used_at timestamptz;
begin
  if p_ticket_id is null then
    raise exception 'ticket_id_required';
  end if;

  if p_ticket_code is null or btrim(p_ticket_code) = '' then
    raise exception 'ticket_code_required';
  end if;

  if p_metadata is null then
    raise exception 'metadata_required';
  end if;

  select
    t.id,
    t.ticket_code,
    t.status,
    t.used_at,
    es.starts_at,
    e.title as event_title,
    vs.name as section_name,
    ri.seat_code
  into v_ticket
  from public.tickets t
  left join public.event_sessions es on es.id = t.session_id
  left join public.events e on e.id = es.event_id
  left join public.venue_sections vs on vs.id = t.section_id
  left join public.reservation_items ri on ri.id = t.reservation_item_id
  where t.id = p_ticket_id
    and t.ticket_code = btrim(p_ticket_code)
  for update of t;

  if v_ticket.id is null then
    v_result := 'not_found';
    v_message := 'Ingresso não encontrado ou inválido.';

    insert into public.ticket_validation_events (
      ticket_code,
      gate_session_id,
      result,
      gate_label,
      validator_identifier,
      metadata
    )
    values (
      btrim(p_ticket_code),
      p_gate_session_id,
      v_result,
      p_gate_label,
      p_validator_identifier,
      p_metadata
    );

    return jsonb_build_object(
      'allowed', false,
      'result', v_result,
      'message', v_message
    );
  end if;

  if v_ticket.status = 'issued' then
    update public.tickets
    set
      status = 'used',
      used_at = v_now,
      updated_at = v_now
    where id = v_ticket.id;

    v_result := 'allowed';
    v_message := 'Entrada liberada.';
    v_allowed := true;
    v_used_at := v_now;
  elsif v_ticket.status = 'used' then
    v_result := 'already_used';
    v_message := 'Ingresso já utilizado.';
    v_used_at := v_ticket.used_at;
  elsif v_ticket.status = 'cancelled' then
    v_result := 'cancelled';
    v_message := 'Ingresso cancelado.';
    v_used_at := v_ticket.used_at;
  else
    v_result := 'denied';
    v_message := 'Ingresso não disponível para entrada.';
    v_used_at := v_ticket.used_at;
  end if;

  insert into public.ticket_validation_events (
    ticket_id,
    ticket_code,
    gate_session_id,
    result,
    gate_label,
    validator_identifier,
    metadata
  )
  values (
    v_ticket.id,
    v_ticket.ticket_code,
    p_gate_session_id,
    v_result,
    p_gate_label,
    p_validator_identifier,
    p_metadata
  );

  return jsonb_build_object(
    'allowed', v_allowed,
    'result', v_result,
    'message', v_message,
    'ticket', jsonb_strip_nulls(jsonb_build_object(
      'ticketId', v_ticket.id,
      'ticketCode', v_ticket.ticket_code,
      'status', case when v_allowed then 'used' else v_ticket.status end,
      'usedAt', v_used_at,
      'eventTitle', v_ticket.event_title,
      'startsAt', v_ticket.starts_at,
      'sectionName', v_ticket.section_name,
      'seatCode', v_ticket.seat_code
    ))
  );
end;
$$;

comment on function public.validate_ticket_entry(uuid, text, uuid, text, text, jsonb)
is 'Transactionally validates a ticket at gate entry, marks issued tickets as used exactly once, and records a ticket_validation_events audit event.';

revoke all on function public.validate_ticket_entry(uuid, text, uuid, text, text, jsonb) from public;
revoke all on function public.validate_ticket_entry(uuid, text, uuid, text, text, jsonb) from anon;
revoke all on function public.validate_ticket_entry(uuid, text, uuid, text, text, jsonb) from authenticated;
grant execute on function public.validate_ticket_entry(uuid, text, uuid, text, text, jsonb) to service_role;

