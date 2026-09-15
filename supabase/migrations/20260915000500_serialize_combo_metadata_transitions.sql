-- Serialize combo redemption metadata state transitions without exposing a generic JSON patch surface.

create or replace function public.confirm_combo_delivery_choice(
  p_redemption_id uuid,
  p_customer_id uuid,
  p_choice text,
  p_place_code text,
  p_place_label text
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $function$
declare
  v_redemption public.combo_redemptions%rowtype;
  v_existing_choice text;
  v_now timestamptz := pg_catalog.now();
begin
  if p_choice is null or p_choice not in ('table', 'waiter') then
    raise exception 'combo_delivery_choice_invalid';
  end if;
  if nullif(pg_catalog.btrim(p_place_code), '') is null
    or nullif(pg_catalog.btrim(p_place_label), '') is null
  then
    raise exception 'combo_delivery_place_required';
  end if;

  select * into v_redemption
  from public.combo_redemptions
  where id = p_redemption_id
  for update;

  if not found or v_redemption.customer_id is distinct from p_customer_id then
    return pg_catalog.jsonb_build_object(
      'applied', false, 'idempotent', false, 'conflict', false,
      'reason', 'not_found', 'choice', null, 'place_label', null, 'status', null
    );
  end if;
  if v_redemption.status <> 'issued' then
    return pg_catalog.jsonb_build_object(
      'applied', false, 'idempotent', false, 'conflict', false,
      'reason', 'status_incompatible', 'choice', null,
      'place_label', null, 'status', v_redemption.status
    );
  end if;

  if nullif(v_redemption.raw_metadata->>'delivery_choice_confirmed_at', '') is not null then
    v_existing_choice := v_redemption.raw_metadata->>'delivery_choice';
    if v_existing_choice = p_choice then
      return pg_catalog.jsonb_build_object(
        'applied', false, 'idempotent', true, 'conflict', false,
        'reason', 'already_confirmed', 'choice', v_existing_choice,
        'place_label', coalesce(v_redemption.raw_metadata->>'delivery_place_label', p_place_label),
        'status', v_redemption.status
      );
    end if;
    return pg_catalog.jsonb_build_object(
      'applied', false, 'idempotent', false, 'conflict', true,
      'reason', 'choice_conflict', 'choice', v_existing_choice,
      'place_label', coalesce(v_redemption.raw_metadata->>'delivery_place_label', p_place_label),
      'status', v_redemption.status
    );
  end if;

  update public.combo_redemptions
  set raw_metadata = coalesce(raw_metadata, '{}'::jsonb) || pg_catalog.jsonb_build_object(
    'kitchen_visible', true,
    'delivery_choice_status', case when p_choice = 'waiter' then 'waiter_requested' else 'table_requested' end,
    'delivery_choice', p_choice,
    'delivery_choice_confirmed_at', v_now,
    'delivery_place_code', p_place_code,
    'delivery_place_label', p_place_label,
    'kitchen_released_at', coalesce(raw_metadata->>'kitchen_released_at', v_now::text),
    'kitchen_released_by', case when p_choice = 'waiter' then 'customer_waiter_request' else 'customer_table_delivery_request' end
  )
  where id = v_redemption.id;

  insert into public.combo_redemption_events(
    combo_redemption_id, combo_order_id, result, redemption_code,
    offer_name, quantity, metadata
  ) values (
    v_redemption.id, v_redemption.combo_order_id, 'allowed', v_redemption.redemption_code,
    v_redemption.offer_name, v_redemption.quantity,
    pg_catalog.jsonb_build_object(
      'source', 'customer_delivery_choice',
      'choice', p_choice,
      'place_code', p_place_code
    )
  );

  return pg_catalog.jsonb_build_object(
    'applied', true, 'idempotent', false, 'conflict', false,
    'reason', 'applied', 'choice', p_choice,
    'place_label', p_place_label, 'status', v_redemption.status
  );
end;
$function$;

create or replace function public.record_combo_gate_arrival(
  p_redemption_id uuid,
  p_ticket_id uuid,
  p_gate_session_id uuid,
  p_gate_label text,
  p_validator_identifier text,
  p_notification_sent boolean
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $function$
declare
  v_redemption public.combo_redemptions%rowtype;
  v_now timestamptz := pg_catalog.now();
begin
  select * into v_redemption from public.combo_redemptions
  where id = p_redemption_id for update;
  if not found then
    return pg_catalog.jsonb_build_object('applied', false, 'idempotent', false, 'reason', 'not_found', 'status', null);
  end if;
  if v_redemption.status <> 'issued' then
    return pg_catalog.jsonb_build_object('applied', false, 'idempotent', false, 'reason', 'status_incompatible', 'status', v_redemption.status);
  end if;
  if nullif(v_redemption.raw_metadata->>'kitchen_arrived_at', '') is not null then
    if coalesce(p_notification_sent, false)
      and nullif(v_redemption.raw_metadata->>'arrival_preparation_notified_at', '') is null
    then
      update public.combo_redemptions
      set raw_metadata = coalesce(raw_metadata, '{}'::jsonb)
        || pg_catalog.jsonb_build_object('arrival_preparation_notified_at', v_now)
      where id = v_redemption.id;
    end if;
    return pg_catalog.jsonb_build_object('applied', false, 'idempotent', true, 'reason', 'already_arrived', 'status', v_redemption.status);
  end if;

  update public.combo_redemptions
  set raw_metadata = coalesce(raw_metadata, '{}'::jsonb)
    || pg_catalog.jsonb_build_object(
      'kitchen_visible', true,
      'kitchen_arrived_at', v_now,
      'kitchen_released_at', coalesce(raw_metadata->>'kitchen_released_at', v_now::text),
      'kitchen_released_by', 'gate_ticket_entry',
      'kitchen_released_by_ticket_id', p_ticket_id,
      'kitchen_released_gate_session_id', p_gate_session_id,
      'kitchen_released_gate_label', p_gate_label,
      'kitchen_released_validator_identifier', p_validator_identifier
    )
    || case
      when p_notification_sent and nullif(raw_metadata->>'arrival_preparation_notified_at', '') is null
        then pg_catalog.jsonb_build_object('arrival_preparation_notified_at', v_now)
      else '{}'::jsonb
    end
  where id = v_redemption.id;

  return pg_catalog.jsonb_build_object('applied', true, 'idempotent', false, 'reason', 'applied', 'status', v_redemption.status);
end;
$function$;

create or replace function public.start_combo_kitchen_preparation(p_redemption_id uuid)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $function$
declare
  v_redemption public.combo_redemptions%rowtype;
  v_kitchen_status text;
  v_now timestamptz := pg_catalog.now();
begin
  select * into v_redemption from public.combo_redemptions
  where id = p_redemption_id for update;
  if not found then
    return pg_catalog.jsonb_build_object('applied', false, 'idempotent', false, 'reason', 'not_found', 'status', null);
  end if;
  if v_redemption.status <> 'issued' then
    return pg_catalog.jsonb_build_object('applied', false, 'idempotent', false, 'reason', 'status_incompatible', 'status', v_redemption.status);
  end if;
  v_kitchen_status := coalesce(v_redemption.raw_metadata->>'kitchen_status', 'pending');
  if v_kitchen_status = 'preparing' then
    return pg_catalog.jsonb_build_object('applied', false, 'idempotent', true, 'reason', 'already_preparing', 'status', v_redemption.status);
  end if;
  if v_kitchen_status <> 'pending' then
    return pg_catalog.jsonb_build_object('applied', false, 'idempotent', false, 'reason', 'kitchen_status_incompatible', 'status', v_redemption.status);
  end if;

  update public.combo_redemptions
  set raw_metadata = coalesce(raw_metadata, '{}'::jsonb) || pg_catalog.jsonb_build_object(
    'kitchen_status', 'preparing',
    'preparing_at', coalesce(raw_metadata->>'preparing_at', v_now::text)
  )
  where id = v_redemption.id;
  return pg_catalog.jsonb_build_object('applied', true, 'idempotent', false, 'reason', 'applied', 'status', v_redemption.status);
end;
$function$;

create or replace function public.record_combo_delivery_choice_prompt(
  p_redemption_id uuid,
  p_place_code text,
  p_place_label text,
  p_prompt_sent boolean,
  p_kitchen_session_id uuid,
  p_kitchen_label text,
  p_validator_identifier text
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $function$
declare
  v_redemption public.combo_redemptions%rowtype;
  v_now timestamptz := pg_catalog.now();
  v_prompt_sent boolean;
begin
  select * into v_redemption from public.combo_redemptions
  where id = p_redemption_id for update;
  if not found then
    return pg_catalog.jsonb_build_object('applied', false, 'reason', 'not_found', 'status', null);
  end if;
  if v_redemption.status <> 'issued' then
    return pg_catalog.jsonb_build_object('applied', false, 'reason', 'status_incompatible', 'status', v_redemption.status);
  end if;
  if nullif(v_redemption.raw_metadata->>'delivery_choice_confirmed_at', '') is not null then
    return pg_catalog.jsonb_build_object(
      'applied', false, 'reason', 'choice_already_confirmed', 'status', v_redemption.status,
      'choice', v_redemption.raw_metadata->>'delivery_choice',
      'place_label', coalesce(v_redemption.raw_metadata->>'delivery_place_label', p_place_label)
    );
  end if;

  v_prompt_sent := coalesce(p_prompt_sent, false)
    or coalesce((v_redemption.raw_metadata->'delivery_choice_prompt_sent') = 'true'::jsonb, false);
  update public.combo_redemptions
  set raw_metadata = coalesce(raw_metadata, '{}'::jsonb) || pg_catalog.jsonb_build_object(
    'kitchen_visible', true,
    'kitchen_status', case when raw_metadata->>'kitchen_status' = 'preparing' then 'preparing' else 'pending' end,
    'delivery_choice_status', 'awaiting_customer',
    'delivery_choice_requested_at', coalesce(raw_metadata->>'delivery_choice_requested_at', v_now::text),
    'delivery_place_code', p_place_code,
    'delivery_place_label', p_place_label,
    'delivery_choice_prompt_sent', v_prompt_sent,
    'kitchen_released_at', coalesce(raw_metadata->>'kitchen_released_at', v_now::text),
    'kitchen_released_by', 'combo_qr_delivery_choice',
    'kitchen_released_gate_session_id', p_kitchen_session_id,
    'kitchen_released_gate_label', p_kitchen_label,
    'kitchen_released_validator_identifier', p_validator_identifier
  )
  where id = v_redemption.id;

  insert into public.combo_redemption_events(
    combo_redemption_id, combo_order_id, kitchen_session_id, result,
    redemption_code, offer_name, quantity, kitchen_label, validator_identifier, metadata
  ) values (
    v_redemption.id, v_redemption.combo_order_id, p_kitchen_session_id, 'allowed',
    v_redemption.redemption_code, v_redemption.offer_name, v_redemption.quantity,
    p_kitchen_label, p_validator_identifier,
    pg_catalog.jsonb_build_object(
      'source', 'kitchen_scan', 'reason', 'delivery_choice_requested',
      'place_code', p_place_code, 'prompt_sent', v_prompt_sent
    )
  );

  return pg_catalog.jsonb_build_object('applied', true, 'reason', 'applied', 'status', v_redemption.status);
end;
$function$;

create or replace function public.record_combo_awaiting_preparation(
  p_redemption_id uuid,
  p_notification_sent boolean,
  p_kitchen_session_id uuid,
  p_kitchen_label text,
  p_validator_identifier text
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $function$
declare
  v_redemption public.combo_redemptions%rowtype;
  v_now timestamptz := pg_catalog.now();
  v_notification_sent boolean;
begin
  select * into v_redemption from public.combo_redemptions
  where id = p_redemption_id for update;
  if not found then
    return pg_catalog.jsonb_build_object('applied', false, 'reason', 'not_found', 'status', null);
  end if;
  if v_redemption.status <> 'issued' then
    return pg_catalog.jsonb_build_object('applied', false, 'reason', 'status_incompatible', 'status', v_redemption.status);
  end if;
  if v_redemption.raw_metadata->>'kitchen_status' = 'preparing' then
    return pg_catalog.jsonb_build_object('applied', false, 'reason', 'preparation_started', 'status', v_redemption.status);
  end if;

  v_notification_sent := coalesce(p_notification_sent, false)
    or nullif(v_redemption.raw_metadata->>'awaiting_preparation_notified_at', '') is not null;
  update public.combo_redemptions
  set raw_metadata = coalesce(raw_metadata, '{}'::jsonb)
    || pg_catalog.jsonb_build_object(
      'kitchen_visible', true,
      'kitchen_released_at', coalesce(raw_metadata->>'kitchen_released_at', v_now::text),
      'kitchen_released_by', 'offer_reader_scan'
    )
    || case
      when v_notification_sent and nullif(raw_metadata->>'awaiting_preparation_notified_at', '') is null
        then pg_catalog.jsonb_build_object('awaiting_preparation_notified_at', v_now)
      else '{}'::jsonb
    end
  where id = v_redemption.id;

  insert into public.combo_redemption_events(
    combo_redemption_id, combo_order_id, kitchen_session_id, result,
    redemption_code, offer_name, quantity, kitchen_label, validator_identifier, metadata
  ) values (
    v_redemption.id, v_redemption.combo_order_id, p_kitchen_session_id, 'denied',
    v_redemption.redemption_code, v_redemption.offer_name, v_redemption.quantity,
    p_kitchen_label, p_validator_identifier,
    pg_catalog.jsonb_build_object(
      'source', 'kitchen_scan', 'reason', 'awaiting_preparation',
      'notification_sent', v_notification_sent
    )
  );

  return pg_catalog.jsonb_build_object('applied', true, 'reason', 'applied', 'status', v_redemption.status);
end;
$function$;

create or replace function public.complete_legacy_combo_ready_recovery(p_redemption_id uuid)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $function$
declare
  v_redemption public.combo_redemptions%rowtype;
  v_now timestamptz := pg_catalog.now();
begin
  select * into v_redemption from public.combo_redemptions
  where id = p_redemption_id for update;
  if not found then
    return pg_catalog.jsonb_build_object('applied', false, 'idempotent', false, 'reason', 'not_found', 'status', null);
  end if;
  if v_redemption.status <> 'issued' then
    return pg_catalog.jsonb_build_object('applied', false, 'idempotent', false, 'reason', 'status_incompatible', 'status', v_redemption.status);
  end if;
  if v_redemption.qr_token_version is not null then
    return pg_catalog.jsonb_build_object('applied', false, 'idempotent', false, 'reason', 'versioned_redemption', 'status', v_redemption.status);
  end if;
  if v_redemption.raw_metadata->>'kitchen_status' <> 'preparing' then
    return pg_catalog.jsonb_build_object('applied', false, 'idempotent', false, 'reason', 'preparation_required', 'status', v_redemption.status);
  end if;
  if nullif(v_redemption.raw_metadata->>'ready_notified_at', '') is not null then
    return pg_catalog.jsonb_build_object('applied', false, 'idempotent', true, 'reason', 'already_completed', 'status', v_redemption.status);
  end if;

  update public.combo_redemptions
  set raw_metadata = coalesce(raw_metadata, '{}'::jsonb) || pg_catalog.jsonb_build_object(
    'ready_notified_at', v_now,
    'ready_notification_recovered_at_scan', v_now
  )
  where id = v_redemption.id;
  return pg_catalog.jsonb_build_object('applied', true, 'idempotent', false, 'reason', 'applied', 'status', v_redemption.status);
end;
$function$;

create or replace function public.validate_combo_redemption(
  p_redemption_id uuid, p_qr_token_hash text, p_kitchen_session_id uuid,
  p_kitchen_label text, p_validator_identifier text, p_event_id uuid default null,
  p_session_id uuid default null, p_metadata jsonb default '{}'::jsonb
) returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_redemption public.combo_redemptions%rowtype; v_gate_session public.gate_sessions%rowtype;
  v_has_redemption boolean := false; v_result text; v_event_result text; v_allowed boolean := false; v_message text;
  v_redeemed_at timestamptz := pg_catalog.now();
begin
  v_gate_session := public.lock_authorized_gate_session(p_kitchen_session_id, 'kitchen',
    p_metadata->>'gate_session_token_hash', null, null,
    p_metadata->>'kitchen_device_binding_hash', 'reader');
  select * into v_redemption from public.combo_redemptions where id = p_redemption_id for update; v_has_redemption := found;
  if not v_has_redemption or p_qr_token_hash is null or v_redemption.qr_token_hash <> p_qr_token_hash then v_result := 'not_found'; v_message := 'Combo nao encontrado ou QR Code invalido.';
  elsif p_event_id is not null and v_redemption.event_id <> p_event_id then v_result := 'wrong_event'; v_message := 'Combo pertence a outro evento.';
  elsif v_gate_session.event_id is not null and v_redemption.event_id <> v_gate_session.event_id then v_result := 'wrong_event'; v_message := 'Combo pertence a outro evento.';
  elsif p_session_id is not null and v_redemption.session_id <> p_session_id then v_result := 'wrong_session'; v_message := 'Combo pertence a outra sessao.';
  elsif v_gate_session.session_id is not null and v_redemption.session_id <> v_gate_session.session_id then v_result := 'wrong_session'; v_message := 'Combo pertence a outra sessao.';
  elsif v_redemption.status = 'used' then v_result := 'already_used'; v_message := 'Combo ja retirado.';
  elsif v_redemption.status = 'cancelled' then v_result := 'cancelled'; v_message := 'Combo cancelado.';
  elsif v_redemption.status <> 'issued' then v_result := 'denied'; v_message := 'Combo nao pode ser retirado.';
  elsif coalesce(v_redemption.raw_metadata->>'kitchen_status', 'pending') <> 'preparing' or nullif(v_redemption.raw_metadata->>'ready_notified_at', '') is null then v_result := 'awaiting_preparation'; v_message := 'PEDIDO AINDA NAO FOI LIBERADO PARA RETIRADA. Aguarde a mensagem de confirmacao.';
  else
    update public.combo_redemptions set
      status = 'used',
      used_at = v_redeemed_at,
      raw_metadata = coalesce(raw_metadata, '{}'::jsonb) || pg_catalog.jsonb_build_object(
        'last_redemption', pg_catalog.jsonb_build_object(
          'kitchen_session_id', p_kitchen_session_id,
          'kitchen_label', p_kitchen_label,
          'validator_identifier', p_validator_identifier,
          'redeemed_at', v_redeemed_at
        ),
        'kitchen_status', 'delivered',
        'delivered_at', v_redeemed_at
      )
    where id = v_redemption.id returning * into v_redemption;
    v_result := 'allowed'; v_allowed := true; v_message := 'Combo liberado para retirada.';
  end if;
  v_event_result := case when v_result = 'awaiting_preparation' then 'denied' else v_result end;
  insert into public.combo_redemption_events(combo_redemption_id, combo_order_id, kitchen_session_id, result, redemption_code, offer_name, quantity, kitchen_label, validator_identifier, metadata)
    values (case when v_has_redemption then v_redemption.id else null end, case when v_has_redemption then v_redemption.combo_order_id else null end, p_kitchen_session_id, v_event_result, case when v_has_redemption then v_redemption.redemption_code else null end, case when v_has_redemption then v_redemption.offer_name else null end, case when v_has_redemption then v_redemption.quantity else null end, p_kitchen_label, p_validator_identifier,
      (coalesce(p_metadata, '{}'::jsonb) - 'gate_session_token_hash' - 'kitchen_device_binding_hash')
      || pg_catalog.jsonb_build_object('authorization_mode', 'strict')
      || case when v_result = 'awaiting_preparation' then pg_catalog.jsonb_build_object('reason', 'awaiting_preparation') else '{}'::jsonb end);
  return pg_catalog.jsonb_build_object('allowed', v_allowed, 'result', v_result, 'message', v_message, 'redemption', case when v_has_redemption then pg_catalog.jsonb_build_object('redemptionId', v_redemption.id, 'redemptionCode', v_redemption.redemption_code, 'offerName', v_redemption.offer_name, 'quantity', v_redemption.quantity, 'status', v_redemption.status, 'usedAt', v_redemption.used_at) else null end);
end;
$$;

revoke all on function public.confirm_combo_delivery_choice(uuid,uuid,text,text,text) from public, anon, authenticated;
revoke all on function public.record_combo_gate_arrival(uuid,uuid,uuid,text,text,boolean) from public, anon, authenticated;
revoke all on function public.start_combo_kitchen_preparation(uuid) from public, anon, authenticated;
revoke all on function public.record_combo_delivery_choice_prompt(uuid,text,text,boolean,uuid,text,text) from public, anon, authenticated;
revoke all on function public.record_combo_awaiting_preparation(uuid,boolean,uuid,text,text) from public, anon, authenticated;
revoke all on function public.complete_legacy_combo_ready_recovery(uuid) from public, anon, authenticated;
revoke all on function public.validate_combo_redemption(uuid,text,uuid,text,text,uuid,uuid,jsonb) from public, anon, authenticated;

grant execute on function public.confirm_combo_delivery_choice(uuid,uuid,text,text,text) to service_role;
grant execute on function public.record_combo_gate_arrival(uuid,uuid,uuid,text,text,boolean) to service_role;
grant execute on function public.start_combo_kitchen_preparation(uuid) to service_role;
grant execute on function public.record_combo_delivery_choice_prompt(uuid,text,text,boolean,uuid,text,text) to service_role;
grant execute on function public.record_combo_awaiting_preparation(uuid,boolean,uuid,text,text) to service_role;
grant execute on function public.complete_legacy_combo_ready_recovery(uuid) to service_role;
grant execute on function public.validate_combo_redemption(uuid,text,uuid,text,text,uuid,uuid,jsonb) to service_role;
