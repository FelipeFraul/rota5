create or replace function public.validate_combo_redemption(
  p_redemption_id uuid,
  p_qr_token_hash text,
  p_kitchen_session_id uuid,
  p_kitchen_label text,
  p_validator_identifier text,
  p_event_id uuid default null,
  p_session_id uuid default null,
  p_metadata jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_redemption public.combo_redemptions%rowtype;
  v_has_redemption boolean := false;
  v_result text;
  v_event_result text;
  v_allowed boolean := false;
  v_message text;
begin
  select *
    into v_redemption
    from public.combo_redemptions
   where id = p_redemption_id
   for update;

  v_has_redemption := found;

  if not v_has_redemption or p_qr_token_hash is null or v_redemption.qr_token_hash <> p_qr_token_hash then
    v_result := 'not_found';
    v_message := 'Combo nao encontrado ou QR Code invalido.';
  elsif p_event_id is not null and v_redemption.event_id <> p_event_id then
    v_result := 'wrong_event';
    v_message := 'Combo pertence a outro evento.';
  elsif p_session_id is not null and v_redemption.session_id <> p_session_id then
    v_result := 'wrong_session';
    v_message := 'Combo pertence a outra sessao.';
  elsif v_redemption.status = 'used' then
    v_result := 'already_used';
    v_message := 'Combo ja retirado.';
  elsif v_redemption.status = 'cancelled' then
    v_result := 'cancelled';
    v_message := 'Combo cancelado.';
  elsif v_redemption.status <> 'issued' then
    v_result := 'denied';
    v_message := 'Combo nao pode ser retirado.';
  elsif
    coalesce(v_redemption.raw_metadata->>'kitchen_status', 'pending') <> 'preparing'
    or nullif(v_redemption.raw_metadata->>'ready_notified_at', '') is null
  then
    v_result := 'awaiting_preparation';
    v_message := 'PEDIDO AINDA NAO FOI LIBERADO PARA RETIRADA. Aguarde a mensagem de confirmacao.';
  else
    update public.combo_redemptions
       set status = 'used',
           used_at = now(),
           raw_metadata = coalesce(raw_metadata, '{}'::jsonb) || jsonb_build_object(
             'last_redemption', jsonb_build_object(
               'kitchen_session_id', p_kitchen_session_id,
               'kitchen_label', p_kitchen_label,
               'validator_identifier', p_validator_identifier,
               'redeemed_at', now()
             )
           )
     where id = v_redemption.id
     returning * into v_redemption;

    v_result := 'allowed';
    v_allowed := true;
    v_message := 'Combo liberado para retirada.';
  end if;

  v_event_result := case
    when v_result = 'awaiting_preparation' then 'denied'
    else v_result
  end;

  insert into public.combo_redemption_events (
    combo_redemption_id,
    combo_order_id,
    kitchen_session_id,
    result,
    redemption_code,
    offer_name,
    quantity,
    kitchen_label,
    validator_identifier,
    metadata
  )
  values (
    case when v_has_redemption then v_redemption.id else null end,
    case when v_has_redemption then v_redemption.combo_order_id else null end,
    p_kitchen_session_id,
    v_event_result,
    case when v_has_redemption then v_redemption.redemption_code else null end,
    case when v_has_redemption then v_redemption.offer_name else null end,
    case when v_has_redemption then v_redemption.quantity else null end,
    p_kitchen_label,
    p_validator_identifier,
    coalesce(p_metadata, '{}'::jsonb) ||
      case
        when v_result = 'awaiting_preparation'
          then jsonb_build_object('reason', 'awaiting_preparation')
        else '{}'::jsonb
      end
  );

  return jsonb_build_object(
    'allowed', v_allowed,
    'result', v_result,
    'message', v_message,
    'redemption', case
      when v_has_redemption then jsonb_build_object(
        'redemptionId', v_redemption.id,
        'redemptionCode', v_redemption.redemption_code,
        'offerName', v_redemption.offer_name,
        'quantity', v_redemption.quantity,
        'status', v_redemption.status,
        'usedAt', v_redemption.used_at
      )
      else null
    end
  );
end;
$$;

revoke all on function public.validate_combo_redemption(
  uuid,
  text,
  uuid,
  text,
  text,
  uuid,
  uuid,
  jsonb
) from public;

grant execute on function public.validate_combo_redemption(
  uuid,
  text,
  uuid,
  text,
  text,
  uuid,
  uuid,
  jsonb
) to service_role;

comment on function public.validate_combo_redemption(
  uuid,
  text,
  uuid,
  text,
  text,
  uuid,
  uuid,
  jsonb
)
is 'Atomically consumes a combo QR code only after preparation and confirmed customer notification.';
