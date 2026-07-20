create table if not exists public.combo_redemption_events (
  id uuid primary key default gen_random_uuid(),
  combo_redemption_id uuid references public.combo_redemptions(id) on delete set null,
  combo_order_id uuid references public.combo_orders(id) on delete set null,
  kitchen_session_id uuid references public.gate_sessions(id) on delete set null,
  result text not null,
  redemption_code text,
  offer_name text,
  quantity integer,
  kitchen_label text,
  validator_identifier text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  constraint combo_redemption_events_result_check check (
    result in (
      'allowed',
      'already_used',
      'cancelled',
      'denied',
      'not_found',
      'wrong_event',
      'wrong_session',
      'kitchen_session_invalid'
    )
  )
);

create index if not exists combo_redemption_events_redemption_id_idx
on public.combo_redemption_events(combo_redemption_id);

create index if not exists combo_redemption_events_kitchen_session_id_idx
on public.combo_redemption_events(kitchen_session_id);

create index if not exists combo_redemption_events_created_at_idx
on public.combo_redemption_events(created_at);

alter table public.combo_redemption_events enable row level security;

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
    v_result,
    case when v_has_redemption then v_redemption.redemption_code else null end,
    case when v_has_redemption then v_redemption.offer_name else null end,
    case when v_has_redemption then v_redemption.quantity else null end,
    p_kitchen_label,
    p_validator_identifier,
    coalesce(p_metadata, '{}'::jsonb)
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

comment on table public.combo_redemption_events
is 'Audit log for combo QR reads and kitchen/bar redemption attempts.';

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
is 'Atomically validates and consumes a combo redemption QR code for kitchen/bar operation.';
