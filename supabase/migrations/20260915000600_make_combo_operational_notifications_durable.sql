-- Serialize combo notification decisions and durable outbound intents.
-- The provider is called only after a fenced claim; HTTP never holds a row lock.

create or replace function public.insert_combo_operational_intent(
  p_redemption_id uuid, p_key text, p_reason text, p_message_type text,
  p_context jsonb, p_conversation_id uuid default null
) returns uuid language plpgsql security invoker set search_path = '' as $function$
declare
  v_redemption public.combo_redemptions%rowtype;
  v_phone text;
  v_intent public.whatsapp_outbound_deliveries%rowtype;
begin
  select * into v_redemption from public.combo_redemptions where id=p_redemption_id;
  if not found then raise exception 'combo_redemption_not_found'; end if;
  select whatsapp_phone into v_phone from public.customers where id=v_redemption.customer_id;
  if nullif(pg_catalog.btrim(v_phone),'') is null then raise exception 'combo_recipient_phone_missing'; end if;
  insert into public.whatsapp_outbound_deliveries(
    idempotency_key,customer_id,conversation_id,recipient_phone,message_type,reason,business_context,status
  ) values (
    p_key,v_redemption.customer_id,p_conversation_id,v_phone,p_message_type,p_reason,p_context,'pending'
  ) on conflict (idempotency_key) do nothing;
  select * into v_intent from public.whatsapp_outbound_deliveries where idempotency_key=p_key;
  if v_intent.customer_id is distinct from v_redemption.customer_id
    or v_intent.conversation_id is distinct from p_conversation_id
    or v_intent.recipient_phone is distinct from v_phone
    or v_intent.message_type is distinct from p_message_type
    or v_intent.reason is distinct from p_reason
    or v_intent.business_context is distinct from p_context
  then raise exception 'combo_operational_intent_collision'; end if;
  return v_intent.id;
end;
$function$;

create or replace function public.record_combo_gate_arrival(
  p_redemption_id uuid,p_ticket_id uuid,p_gate_session_id uuid,p_gate_label text,
  p_validator_identifier text,p_notification_sent boolean
) returns jsonb language plpgsql security invoker set search_path = '' as $function$
declare
  v_redemption public.combo_redemptions%rowtype;
  v_now timestamptz := pg_catalog.now();
  v_applied boolean := false;
  v_intent_id uuid;
begin
  select * into v_redemption from public.combo_redemptions where id=p_redemption_id for update;
  if not found then return pg_catalog.jsonb_build_object('applied',false,'reason','not_found'); end if;
  if v_redemption.status<>'issued' then return pg_catalog.jsonb_build_object('applied',false,'reason','status_incompatible','status',v_redemption.status); end if;
  if nullif(v_redemption.raw_metadata->>'kitchen_arrived_at','') is null then
    update public.combo_redemptions set raw_metadata=coalesce(raw_metadata,'{}'::jsonb)||pg_catalog.jsonb_build_object(
      'kitchen_visible',true,'kitchen_arrived_at',v_now,
      'kitchen_released_at',coalesce(raw_metadata->>'kitchen_released_at',v_now::text),
      'kitchen_released_by','gate_ticket_entry','kitchen_released_by_ticket_id',p_ticket_id,
      'kitchen_released_gate_session_id',p_gate_session_id,'kitchen_released_gate_label',p_gate_label,
      'kitchen_released_validator_identifier',p_validator_identifier
    ) where id=p_redemption_id;
    v_applied:=true;
  end if;
  -- The final boolean is retained for RPC compatibility; it now means eligible to enqueue.
  if coalesce(p_notification_sent,false)
    and nullif(v_redemption.raw_metadata->>'arrival_preparation_notified_at','') is null then
    v_intent_id:=public.insert_combo_operational_intent(
      p_redemption_id,'combo-gate-arrival:'||p_redemption_id||':text:v1',
      'offer_preparation_started_on_arrival','text',
      pg_catalog.jsonb_build_object('combo_order_id',v_redemption.combo_order_id,
        'combo_redemption_id',v_redemption.id,'redemption_code',v_redemption.redemption_code,
        'offer_name',v_redemption.offer_name,'quantity',v_redemption.quantity,'delivery_order',30));
  end if;
  return pg_catalog.jsonb_build_object('applied',v_applied,'idempotent',not v_applied,
    'reason',case when v_applied then 'applied' else 'already_arrived' end,
    'status',v_redemption.status,'intent_id',v_intent_id);
end;
$function$;

create or replace function public.record_combo_delivery_choice_prompt(
  p_redemption_id uuid,p_place_code text,p_place_label text,p_prompt_sent boolean,
  p_kitchen_session_id uuid,p_kitchen_label text,p_validator_identifier text
) returns jsonb language plpgsql security invoker set search_path = '' as $function$
declare
  v_redemption public.combo_redemptions%rowtype;
  v_conversation_id uuid;
  v_now timestamptz := pg_catalog.now();
  v_intent_id uuid;
begin
  select * into v_redemption from public.combo_redemptions where id=p_redemption_id for update;
  if not found then return pg_catalog.jsonb_build_object('applied',false,'reason','not_found'); end if;
  if v_redemption.status<>'issued' then return pg_catalog.jsonb_build_object('applied',false,'reason','status_incompatible','status',v_redemption.status); end if;
  if nullif(v_redemption.raw_metadata->>'delivery_choice_confirmed_at','') is not null then
    return pg_catalog.jsonb_build_object('applied',false,'reason','choice_already_confirmed',
      'place_label',coalesce(v_redemption.raw_metadata->>'delivery_place_label',p_place_label));
  end if;
  if nullif(v_redemption.raw_metadata->>'delivery_choice_requested_at','') is not null then
    return pg_catalog.jsonb_build_object('applied',false,'idempotent',true,'reason','already_prompted');
  end if;
  select id into v_conversation_id from public.conversations
    where customer_id=v_redemption.customer_id and status='open'
    order by last_message_at desc nulls last,created_at desc limit 1;
  if v_conversation_id is null then raise exception 'combo_prompt_conversation_missing'; end if;
  update public.combo_redemptions set raw_metadata=coalesce(raw_metadata,'{}'::jsonb)||pg_catalog.jsonb_build_object(
    'kitchen_visible',true,
    'kitchen_status',case when raw_metadata->>'kitchen_status'='preparing' then 'preparing' else 'pending' end,
    'delivery_choice_status','awaiting_customer','delivery_choice_requested_at',v_now,
    'delivery_place_code',p_place_code,'delivery_place_label',p_place_label,
    'delivery_choice_prompt_sent',false,
    'kitchen_released_at',coalesce(raw_metadata->>'kitchen_released_at',v_now::text),
    'kitchen_released_by','combo_qr_delivery_choice',
    'kitchen_released_gate_session_id',p_kitchen_session_id,
    'kitchen_released_gate_label',p_kitchen_label,
    'kitchen_released_validator_identifier',p_validator_identifier
  ) where id=p_redemption_id;
  insert into public.combo_redemption_events(
    combo_redemption_id,combo_order_id,kitchen_session_id,result,redemption_code,
    offer_name,quantity,kitchen_label,validator_identifier,metadata
  ) values (v_redemption.id,v_redemption.combo_order_id,p_kitchen_session_id,'allowed',
    v_redemption.redemption_code,v_redemption.offer_name,v_redemption.quantity,
    p_kitchen_label,p_validator_identifier,
    pg_catalog.jsonb_build_object('source','kitchen_scan','reason','delivery_choice_requested',
      'place_code',p_place_code,'prompt_sent',false));
  v_intent_id:=public.insert_combo_operational_intent(p_redemption_id,
    'combo-delivery-choice:'||p_redemption_id||':prompt:v1','combo_delivery_choice_requested','text',
    pg_catalog.jsonb_build_object('combo_order_id',v_redemption.combo_order_id,
      'combo_redemption_id',v_redemption.id,'place_code',p_place_code,'place_label',p_place_label,
      'offer_name',v_redemption.offer_name,'delivery_order',40),v_conversation_id);
  return pg_catalog.jsonb_build_object('applied',true,'reason','applied','intent_id',v_intent_id);
end;
$function$;

create or replace function public.record_combo_awaiting_preparation(
  p_redemption_id uuid,p_notification_sent boolean,p_kitchen_session_id uuid,
  p_kitchen_label text,p_validator_identifier text
) returns jsonb language plpgsql security invoker set search_path = '' as $function$
declare
  v_redemption public.combo_redemptions%rowtype;
  v_intent_id uuid;
begin
  select * into v_redemption from public.combo_redemptions where id=p_redemption_id for update;
  if not found then return pg_catalog.jsonb_build_object('applied',false,'reason','not_found'); end if;
  if v_redemption.status<>'issued' then return pg_catalog.jsonb_build_object('applied',false,'reason','status_incompatible'); end if;
  if v_redemption.raw_metadata->>'kitchen_status'='preparing' then
    return pg_catalog.jsonb_build_object('applied',false,'reason','preparation_started');
  end if;
  if nullif(v_redemption.raw_metadata->>'awaiting_preparation_requested_at','') is not null then
    return pg_catalog.jsonb_build_object('applied',false,'idempotent',true,'reason','already_requested');
  end if;
  update public.combo_redemptions set raw_metadata=coalesce(raw_metadata,'{}'::jsonb)||pg_catalog.jsonb_build_object(
    'kitchen_visible',true,'kitchen_released_at',coalesce(raw_metadata->>'kitchen_released_at',pg_catalog.now()::text),
    'kitchen_released_by','offer_reader_scan','awaiting_preparation_requested_at',pg_catalog.now())
  where id=p_redemption_id;
  insert into public.combo_redemption_events(
    combo_redemption_id,combo_order_id,kitchen_session_id,result,redemption_code,
    offer_name,quantity,kitchen_label,validator_identifier,metadata
  ) values (v_redemption.id,v_redemption.combo_order_id,p_kitchen_session_id,'denied',
    v_redemption.redemption_code,v_redemption.offer_name,v_redemption.quantity,
    p_kitchen_label,p_validator_identifier,
    pg_catalog.jsonb_build_object('source','kitchen_scan','reason','awaiting_preparation','notification_sent',false));
  if coalesce(p_notification_sent,false) then
    v_intent_id:=public.insert_combo_operational_intent(p_redemption_id,
      'combo-awaiting-preparation:'||p_redemption_id||':text:v1','combo_awaiting_preparation','text',
      pg_catalog.jsonb_build_object('combo_order_id',v_redemption.combo_order_id,
        'combo_redemption_id',v_redemption.id,'redemption_code',v_redemption.redemption_code,
        'offer_name',v_redemption.offer_name,'quantity',v_redemption.quantity,'delivery_order',40));
  end if;
  return pg_catalog.jsonb_build_object('applied',true,'reason','applied','intent_id',v_intent_id);
end;
$function$;

create or replace function public.prepare_legacy_combo_ready_delivery(
  p_redemption_id uuid,p_qr_token_hash text
) returns jsonb language plpgsql security invoker set search_path = '' as $function$
declare v_redemption public.combo_redemptions%rowtype;
begin
  select * into v_redemption from public.combo_redemptions where id=p_redemption_id for update;
  if not found or v_redemption.status<>'issued' then raise exception 'combo_redemption_not_issuable'; end if;
  if v_redemption.raw_metadata->>'kitchen_status'<>'preparing' then raise exception 'combo_preparation_required'; end if;
  if v_redemption.qr_token_version is not null then
    if v_redemption.raw_metadata->>'legacy_ready_upgrade'='true'
      and v_redemption.qr_token_version=1 then
      perform public.ensure_combo_ready_delivery_intents(p_redemption_id);
      return pg_catalog.jsonb_build_object('idempotent',true,'qr_token_version',1);
    end if;
    raise exception 'combo_not_legacy_redemption';
  end if;
  if nullif(pg_catalog.btrim(p_qr_token_hash),'') is null then raise exception 'combo_qr_hash_missing'; end if;
  update public.combo_redemptions set qr_token_version=1,qr_token_hash=p_qr_token_hash,
    raw_metadata=coalesce(raw_metadata,'{}'::jsonb)||pg_catalog.jsonb_build_object(
      'legacy_ready_upgrade',true,'ready_delivery_version',1,'ready_prepared_at',pg_catalog.now())
  where id=p_redemption_id;
  perform public.ensure_combo_ready_delivery_intents(p_redemption_id);
  return pg_catalog.jsonb_build_object('idempotent',false,'qr_token_version',1);
end;
$function$;

create or replace function public.ensure_paid_combo_delivery_intents(p_order_id uuid)
returns integer
language plpgsql
security invoker
set search_path = ''
as $function$
declare
  v_order public.combo_orders%rowtype;
  v_redemption public.combo_redemptions%rowtype;
  v_phone text;
  v_text public.whatsapp_outbound_deliveries%rowtype;
  v_qr public.whatsapp_outbound_deliveries%rowtype;
begin
  select * into v_order
  from public.combo_orders
  where id = p_order_id
  for update;

  if not found or v_order.status <> 'paid' then
    raise exception 'combo_order_not_paid';
  end if;

  select * into v_redemption
  from public.combo_redemptions
  where combo_order_id = v_order.id
  for update;

  if not found then
    raise exception 'combo_redemption_not_found';
  end if;

  -- Legacy rows cannot reconstruct their historical token safely.
  if v_redemption.qr_token_version is null or v_redemption.raw_metadata->>'legacy_ready_upgrade' = 'true' then
    return 0;
  end if;

  select whatsapp_phone into v_phone
  from public.customers
  where id = v_order.customer_id;

  if nullif(pg_catalog.btrim(v_phone), '') is null then
    raise exception 'combo_recipient_phone_missing';
  end if;

  insert into public.whatsapp_outbound_deliveries(
    idempotency_key, customer_id, conversation_id, recipient_phone,
    message_type, reason, business_context, status
  ) values (
    'paid-combo-order:' || v_order.id || ':text:v1',
    v_order.customer_id, null, v_phone, 'text', 'paid_combo_delivery',
    pg_catalog.jsonb_build_object(
      'combo_order_id', v_order.id,
      'combo_redemption_id', v_redemption.id,
      'customer_id', v_order.customer_id,
      'event_id', v_order.event_id,
      'session_id', v_order.session_id,
      'offer_id', v_order.offer_id,
      'delivery_order', 10
    ),
    'pending'
  ) on conflict (idempotency_key) do nothing;

  select * into v_text from public.whatsapp_outbound_deliveries
  where idempotency_key = 'paid-combo-order:' || v_order.id || ':text:v1';

  if v_text.customer_id is distinct from v_order.customer_id
    or v_text.recipient_phone is distinct from v_phone
    or v_text.message_type is distinct from 'text'
    or v_text.reason is distinct from 'paid_combo_delivery'
    or v_text.business_context->>'combo_order_id' is distinct from v_order.id::text
    or v_text.business_context->>'combo_redemption_id' is distinct from v_redemption.id::text
    or v_text.business_context->>'delivery_order' is distinct from '10'
  then
    raise exception 'combo_delivery_intent_collision';
  end if;

  insert into public.whatsapp_outbound_deliveries(
    idempotency_key, customer_id, conversation_id, recipient_phone,
    message_type, reason, business_context, status
  ) values (
    'paid-combo-redemption:' || v_redemption.id || ':qr:v1',
    v_order.customer_id, null, v_phone, 'image', 'paid_combo_qr_delivery',
    pg_catalog.jsonb_build_object(
      'combo_order_id', v_order.id,
      'combo_redemption_id', v_redemption.id,
      'customer_id', v_order.customer_id,
      'event_id', v_order.event_id,
      'session_id', v_order.session_id,
      'offer_id', v_order.offer_id,
      'delivery_order', 20
    ),
    'pending'
  ) on conflict (idempotency_key) do nothing;

  select * into v_qr from public.whatsapp_outbound_deliveries
  where idempotency_key = 'paid-combo-redemption:' || v_redemption.id || ':qr:v1';

  if v_qr.customer_id is distinct from v_order.customer_id
    or v_qr.recipient_phone is distinct from v_phone
    or v_qr.message_type is distinct from 'image'
    or v_qr.reason is distinct from 'paid_combo_qr_delivery'
    or v_qr.business_context->>'combo_order_id' is distinct from v_order.id::text
    or v_qr.business_context->>'combo_redemption_id' is distinct from v_redemption.id::text
    or v_qr.business_context->>'delivery_order' is distinct from '20'
  then
    raise exception 'combo_delivery_intent_collision';
  end if;

  return 2;
end;
$function$;

create or replace function public.claim_whatsapp_outbound_delivery(p_delivery_id uuid)
returns setof public.whatsapp_outbound_deliveries
language plpgsql security invoker set search_path = '' as $function$
declare
  v_delivery public.whatsapp_outbound_deliveries%rowtype;
  v_redemption public.combo_redemptions%rowtype;
  v_redemption_id uuid;
  v_is_combo boolean;
  v_stale boolean := false;
  v_first_id uuid;
  v_claimed public.whatsapp_outbound_deliveries%rowtype;
begin
  select * into v_delivery from public.whatsapp_outbound_deliveries where id=p_delivery_id;
  if not found then return; end if;
  v_is_combo:=v_delivery.reason in (
    'paid_combo_delivery','paid_combo_qr_delivery','offer_preparation_started_on_arrival',
    'combo_delivery_choice_requested','combo_awaiting_preparation','combo_ready_at_bar','combo_ready_qr');
  if v_is_combo then
    if coalesce(v_delivery.business_context->>'combo_redemption_id','') !~
      '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-5][0-9a-fA-F]{3}-[89aAbB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$'
    then return; end if;
    v_redemption_id:=(v_delivery.business_context->>'combo_redemption_id')::uuid;
    select * into v_redemption from public.combo_redemptions where id=v_redemption_id for update;
    if not found then return; end if;
    -- Lock the redemption before the delivery, matching all combo decision/finalization RPCs.
    select * into v_delivery from public.whatsapp_outbound_deliveries where id=p_delivery_id for update;
    if not found then return; end if;
    if v_delivery.status in ('pending','failed')
      or (v_delivery.status='sending' and
        (v_delivery.lease_expires_at is null or v_delivery.lease_expires_at<=pg_catalog.now()))
    then
      v_stale:=v_redemption.status<>'issued'
        or (v_delivery.reason='offer_preparation_started_on_arrival'
          and (nullif(v_redemption.raw_metadata->>'kitchen_arrived_at','') is null
            or v_redemption.raw_metadata->>'kitchen_status'='preparing'))
        or (v_delivery.reason='combo_delivery_choice_requested'
          and nullif(v_redemption.raw_metadata->>'delivery_choice_confirmed_at','') is not null)
        or (v_delivery.reason='combo_awaiting_preparation'
          and v_redemption.raw_metadata->>'kitchen_status'='preparing')
        or (v_delivery.reason in ('combo_ready_at_bar','combo_ready_qr')
          and (v_redemption.qr_token_version is distinct from
            (v_delivery.business_context->>'qr_token_version')::integer
            or nullif(v_redemption.raw_metadata->>'ready_notified_at','') is not null));
      if v_stale then
        -- An expired sending lease may have an ambiguous provider ACK. Retire it
        -- as dead letter, never as a known-unsent superseded intent.
        if v_delivery.status in ('pending','failed') then
          update public.whatsapp_outbound_deliveries set status='superseded',
            updated_at=pg_catalog.now(),last_error='combo_state_obsolete'
          where id=p_delivery_id;
        elsif v_delivery.status='sending' then
          update public.whatsapp_outbound_deliveries set status='dead_letter',
            dead_letter_at=pg_catalog.now(),lease_expires_at=null,claim_token=null,
            last_error='combo_state_obsolete_after_expired_lease',updated_at=pg_catalog.now()
          where id=p_delivery_id;
        end if;
        if v_delivery.reason='combo_delivery_choice_requested' then
          update public.conversations set context=(context-'comboPromptIntentId'-'comboDeliveryConfirmation')
            || pg_catalog.jsonb_build_object('state','idle','step','idle')
          where id=v_delivery.conversation_id
            and context->>'comboPromptIntentId'=v_delivery.id::text
            and context->>'state'='combo_delivery_confirming';
        end if;
        return;
      end if;
    end if;
    select d.id into v_first_id
    from public.whatsapp_outbound_deliveries d
    where d.business_context->>'combo_redemption_id'=v_redemption_id::text
      and d.reason in (
        'paid_combo_delivery','paid_combo_qr_delivery','offer_preparation_started_on_arrival',
        'combo_delivery_choice_requested','combo_awaiting_preparation','combo_ready_at_bar','combo_ready_qr')
      and d.status not in ('sent','superseded')
      and not (d.status='dead_letter' and d.reason in (
        'offer_preparation_started_on_arrival','combo_delivery_choice_requested','combo_awaiting_preparation'))
    order by
      case d.reason
        when 'paid_combo_delivery' then 1 when 'paid_combo_qr_delivery' then 2
        when 'offer_preparation_started_on_arrival' then 3
        when 'combo_delivery_choice_requested' then 4 when 'combo_awaiting_preparation' then 4
        when 'combo_ready_at_bar' then 5 else 6 end,
      d.created_at,d.id limit 1;
    if v_first_id is distinct from p_delivery_id then return; end if;
  else
    select * into v_delivery from public.whatsapp_outbound_deliveries where id=p_delivery_id for update;
  end if;
  if v_is_combo and v_delivery.status='sending' and v_delivery.attempt_count>=5
    and (v_delivery.lease_expires_at is null or v_delivery.lease_expires_at<=pg_catalog.now()) then
    update public.whatsapp_outbound_deliveries set status='dead_letter',
      dead_letter_at=pg_catalog.now(),lease_expires_at=null,claim_token=null,
      last_error='combo_delivery_attempt_limit_after_expired_lease',updated_at=pg_catalog.now()
    where id=p_delivery_id;
    if v_delivery.reason='combo_delivery_choice_requested' then
      update public.conversations set context=(context-'comboPromptIntentId'-'comboDeliveryConfirmation')
        || pg_catalog.jsonb_build_object('state','idle','step','idle')
      where id=v_delivery.conversation_id
        and context->>'comboPromptIntentId'=v_delivery.id::text
        and context->>'state'='combo_delivery_confirming';
    end if;
    return;
  end if;
  if v_delivery.reason in (
    'paid_ticket_delivery','paid_ticket_delivery_choice','paid_ticket_qr_instruction','paid_ticket_qr_delivery',
    'paid_combo_delivery','paid_combo_qr_delivery','offer_preparation_started_on_arrival',
    'combo_delivery_choice_requested','combo_awaiting_preparation','combo_ready_at_bar','combo_ready_qr')
  then
    if v_delivery.attempt_count>=5 or not (
      (v_delivery.status in ('pending','failed') and
        (v_delivery.next_attempt_at is null or v_delivery.next_attempt_at<=pg_catalog.now()))
      or (v_delivery.status='sending' and
        (v_delivery.lease_expires_at is null or v_delivery.lease_expires_at<=pg_catalog.now()))
    ) then return; end if;
  elsif v_delivery.status not in ('pending','failed') then return;
  end if;
  if v_delivery.reason='combo_delivery_choice_requested' then
    if v_delivery.conversation_id is null then raise exception 'combo_prompt_conversation_missing'; end if;
    update public.conversations set context=coalesce(context,'{}'::jsonb)||
      pg_catalog.jsonb_build_object(
        'state','combo_delivery_confirming','step','combo_delivery_confirming',
        'comboPromptIntentId',v_delivery.id,
        'comboDeliveryConfirmation',pg_catalog.jsonb_build_object(
          'redemptionId',v_redemption.id,'comboOrderId',v_redemption.combo_order_id,
          'placeCode',v_delivery.business_context->>'place_code',
          'placeLabel',v_delivery.business_context->>'place_label',
          'offerName',v_delivery.business_context->>'offer_name',
          'createdAt',coalesce(v_redemption.raw_metadata->>'delivery_choice_requested_at',pg_catalog.now()::text)))
    where id=v_delivery.conversation_id and customer_id=v_delivery.customer_id and status='open';
    if not found then raise exception 'combo_prompt_conversation_unavailable'; end if;
  end if;
  update public.whatsapp_outbound_deliveries d set
    status='sending',claimed_at=pg_catalog.now(),
    lease_expires_at=pg_catalog.now()+interval '300 seconds',
    claim_token=pg_catalog.gen_random_uuid(),attempt_count=d.attempt_count+1,
    next_attempt_at=null,updated_at=pg_catalog.now()
  where d.id=p_delivery_id returning * into v_claimed;
  return next v_claimed;
end;
$function$;

create or replace function public.mark_whatsapp_outbound_delivery_sent(
  p_delivery_id uuid,p_claim_token uuid,p_provider_message_id text default null
) returns setof public.whatsapp_outbound_deliveries
language plpgsql security invoker set search_path = '' as $function$
declare
  v_delivery public.whatsapp_outbound_deliveries%rowtype;
  v_redemption_id uuid;
  v_updated public.whatsapp_outbound_deliveries%rowtype;
begin
  select * into v_delivery from public.whatsapp_outbound_deliveries where id=p_delivery_id;
  if not found then return; end if;
  if v_delivery.reason in ('offer_preparation_started_on_arrival','combo_delivery_choice_requested',
    'combo_awaiting_preparation','combo_ready_at_bar','combo_ready_qr') then
    v_redemption_id:=(v_delivery.business_context->>'combo_redemption_id')::uuid;
    perform 1 from public.combo_redemptions where id=v_redemption_id for update;
  end if;
  update public.whatsapp_outbound_deliveries d set status='sent',
    provider_message_id=p_provider_message_id,last_error=null,lease_expires_at=null,
    claim_token=null,next_attempt_at=null,sent_at=pg_catalog.now(),updated_at=pg_catalog.now()
  where d.id=p_delivery_id and d.status='sending' and d.claim_token=p_claim_token
  returning * into v_updated;
  if not found then return; end if;
  if v_updated.reason in ('offer_preparation_started_on_arrival','combo_delivery_choice_requested',
    'combo_awaiting_preparation') then
    update public.combo_redemptions set raw_metadata=coalesce(raw_metadata,'{}'::jsonb)||
      case v_updated.reason
        when 'offer_preparation_started_on_arrival' then
          pg_catalog.jsonb_build_object('arrival_preparation_notified_at',v_updated.sent_at)
        when 'combo_delivery_choice_requested' then
          pg_catalog.jsonb_build_object('delivery_choice_prompt_sent',true)
        else pg_catalog.jsonb_build_object('awaiting_preparation_notified_at',v_updated.sent_at)
      end
    where id=v_redemption_id;
  elsif v_updated.reason='combo_ready_qr' then
    if exists(select 1 from public.whatsapp_outbound_deliveries
      where idempotency_key='combo-ready-redemption:'||v_redemption_id||':text:v'||
        (v_updated.business_context->>'qr_token_version') and status='sent') then
      update public.combo_redemptions set raw_metadata=coalesce(raw_metadata,'{}'::jsonb)||
        pg_catalog.jsonb_build_object('ready_notified_at',v_updated.sent_at)
      where id=v_redemption_id and qr_token_version=(v_updated.business_context->>'qr_token_version')::integer;
    end if;
  end if;
  return next v_updated;
end;
$function$;

create or replace function public.mark_whatsapp_outbound_delivery_failed(
  p_delivery_id uuid,p_claim_token uuid,p_error text
) returns setof public.whatsapp_outbound_deliveries
language plpgsql security invoker set search_path = '' as $function$
declare
  v_delivery public.whatsapp_outbound_deliveries%rowtype;
  v_updated public.whatsapp_outbound_deliveries%rowtype;
begin
  select * into v_delivery from public.whatsapp_outbound_deliveries where id=p_delivery_id;
  if not found then return; end if;
  if v_delivery.reason='combo_delivery_choice_requested' then
    perform 1 from public.combo_redemptions
      where id=(v_delivery.business_context->>'combo_redemption_id')::uuid for update;
  end if;
  update public.whatsapp_outbound_deliveries d set
    status=case when d.attempt_count>=5 then 'dead_letter' else 'failed' end,
    last_error=pg_catalog.left(coalesce(p_error,'delivery_failed'),1000),
    lease_expires_at=null,claim_token=null,
    next_attempt_at=case when d.attempt_count>=5 then null
      else pg_catalog.now()+case d.attempt_count when 1 then interval '1 minute'
        when 2 then interval '5 minutes' when 3 then interval '15 minutes'
        else interval '1 hour' end end,
    dead_letter_at=case when d.attempt_count>=5 then pg_catalog.now() else d.dead_letter_at end,
    updated_at=pg_catalog.now()
  where d.id=p_delivery_id and d.status='sending' and d.claim_token=p_claim_token
  returning * into v_updated;
  if not found then return; end if;
  if v_updated.reason='combo_delivery_choice_requested' and v_updated.status='dead_letter' then
    update public.conversations set context=(context-'comboPromptIntentId'-'comboDeliveryConfirmation')
      || pg_catalog.jsonb_build_object('state','idle','step','idle')
    where id=v_updated.conversation_id and context->>'comboPromptIntentId'=v_updated.id::text
      and context->>'state'='combo_delivery_confirming';
  end if;
  return next v_updated;
end;
$function$;

create or replace function public.list_due_paid_combo_delivery_tasks(p_limit integer default 20)
returns table(entity_id uuid,delivery_kind text)
language sql security invoker set search_path = '' as $function$
  with combo as (
    select d.*,(d.business_context->>'combo_redemption_id')::uuid redemption_id,
      case d.reason when 'paid_combo_delivery' then 1 when 'paid_combo_qr_delivery' then 2
        when 'offer_preparation_started_on_arrival' then 3
        when 'combo_delivery_choice_requested' then 4 when 'combo_awaiting_preparation' then 4
        when 'combo_ready_at_bar' then 5 else 6 end intent_order
    from public.whatsapp_outbound_deliveries d
    where d.reason in ('paid_combo_delivery','paid_combo_qr_delivery',
      'offer_preparation_started_on_arrival','combo_delivery_choice_requested',
      'combo_awaiting_preparation','combo_ready_at_bar','combo_ready_qr')
      and coalesce(d.business_context->>'combo_redemption_id','') ~*
        '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
  ), first_incomplete as (
    select distinct on (redemption_id) * from combo
    where status not in ('sent','superseded')
      and not (status='dead_letter' and reason in (
        'offer_preparation_started_on_arrival','combo_delivery_choice_requested','combo_awaiting_preparation'))
    order by redemption_id,intent_order,created_at,id
  ), due as (
    select case when reason in ('paid_combo_delivery','paid_combo_qr_delivery')
        then (business_context->>'combo_order_id')::uuid else redemption_id end entity_id,
      case when reason in ('paid_combo_delivery','paid_combo_qr_delivery') then 'paid'
        when reason in ('combo_ready_at_bar','combo_ready_qr') then 'ready'
        else 'operational' end delivery_kind,
      coalesce(next_attempt_at,lease_expires_at,created_at) due_at
    from first_incomplete
    where (attempt_count<5 or status='sending') and (
      (status in ('pending','failed') and (next_attempt_at is null or next_attempt_at<=pg_catalog.now()))
      or (status='sending' and (lease_expires_at is null or lease_expires_at<=pg_catalog.now())))
  ), ready_completion as (
    select r.id entity_id,'ready'::text delivery_kind,max(q.updated_at) due_at
    from public.combo_redemptions r
    join public.whatsapp_outbound_deliveries q
      on q.reason='combo_ready_qr' and q.status='sent'
      and q.business_context->>'combo_redemption_id'=r.id::text
    where nullif(r.raw_metadata->>'ready_notified_at','') is null
      and r.qr_token_version is not null
      and q.business_context->>'qr_token_version'=r.qr_token_version::text
    group by r.id
  )
  select entity_id,delivery_kind from (select * from due union select * from ready_completion) candidates
  order by due_at limit greatest(0,least(coalesce(p_limit,20),100));
$function$;

create or replace function public.get_paid_combo_delivery_queue_counts()
returns jsonb language sql security invoker set search_path='' as $function$
  select pg_catalog.jsonb_build_object(
    'pending_due',count(*) filter(where status='pending' and (next_attempt_at is null or next_attempt_at<=pg_catalog.now())),
    'failed_due',count(*) filter(where status='failed' and (next_attempt_at is null or next_attempt_at<=pg_catalog.now())),
    'failed',count(*) filter(where status='failed'),
    'sending_active',count(*) filter(where status='sending' and lease_expires_at>pg_catalog.now()),
    'sending_expired',count(*) filter(where status='sending' and (lease_expires_at is null or lease_expires_at<=pg_catalog.now())),
    'dead_letter',count(*) filter(where status='dead_letter'),
    'sent',count(*) filter(where status='sent'))
  from public.whatsapp_outbound_deliveries
  where reason in ('paid_combo_delivery','paid_combo_qr_delivery',
    'offer_preparation_started_on_arrival','combo_delivery_choice_requested',
    'combo_awaiting_preparation','combo_ready_at_bar','combo_ready_qr');
$function$;

create index if not exists whatsapp_outbound_deliveries_combo_operational_due_idx
on public.whatsapp_outbound_deliveries(status,next_attempt_at,lease_expires_at,created_at)
where reason in ('offer_preparation_started_on_arrival','combo_delivery_choice_requested','combo_awaiting_preparation');

revoke all on function public.insert_combo_operational_intent(uuid,text,text,text,jsonb,uuid) from public,anon,authenticated;
revoke all on function public.record_combo_gate_arrival(uuid,uuid,uuid,text,text,boolean) from public,anon,authenticated;
revoke all on function public.record_combo_delivery_choice_prompt(uuid,text,text,boolean,uuid,text,text) from public,anon,authenticated;
revoke all on function public.record_combo_awaiting_preparation(uuid,boolean,uuid,text,text) from public,anon,authenticated;
revoke all on function public.prepare_legacy_combo_ready_delivery(uuid,text) from public,anon,authenticated;
revoke all on function public.ensure_paid_combo_delivery_intents(uuid) from public,anon,authenticated;
revoke all on function public.claim_whatsapp_outbound_delivery(uuid) from public,anon,authenticated;
revoke all on function public.mark_whatsapp_outbound_delivery_sent(uuid,uuid,text) from public,anon,authenticated;
revoke all on function public.mark_whatsapp_outbound_delivery_failed(uuid,uuid,text) from public,anon,authenticated;
revoke all on function public.list_due_paid_combo_delivery_tasks(integer) from public,anon,authenticated;
revoke all on function public.get_paid_combo_delivery_queue_counts() from public,anon,authenticated;
grant execute on function public.insert_combo_operational_intent(uuid,text,text,text,jsonb,uuid) to service_role;
grant execute on function public.record_combo_gate_arrival(uuid,uuid,uuid,text,text,boolean) to service_role;
grant execute on function public.record_combo_delivery_choice_prompt(uuid,text,text,boolean,uuid,text,text) to service_role;
grant execute on function public.record_combo_awaiting_preparation(uuid,boolean,uuid,text,text) to service_role;
grant execute on function public.prepare_legacy_combo_ready_delivery(uuid,text) to service_role;
grant execute on function public.ensure_paid_combo_delivery_intents(uuid) to service_role;
grant execute on function public.claim_whatsapp_outbound_delivery(uuid) to service_role;
grant execute on function public.mark_whatsapp_outbound_delivery_sent(uuid,uuid,text) to service_role;
grant execute on function public.mark_whatsapp_outbound_delivery_failed(uuid,uuid,text) to service_role;
grant execute on function public.list_due_paid_combo_delivery_tasks(integer) to service_role;
grant execute on function public.get_paid_combo_delivery_queue_counts() to service_role;


-- Revalidate every critical READY intent field on conflict.
create or replace function public.ensure_combo_ready_delivery_intents(p_redemption_id uuid)
returns integer
language plpgsql
security invoker
set search_path = ''
as $function$
declare
  v_redemption public.combo_redemptions%rowtype;
  v_order public.combo_orders%rowtype;
  v_phone text;
  v_version integer;
  v_text public.whatsapp_outbound_deliveries%rowtype;
  v_qr public.whatsapp_outbound_deliveries%rowtype;
begin
  select * into v_redemption from public.combo_redemptions where id = p_redemption_id for update;
  if not found or v_redemption.status <> 'issued' or v_redemption.qr_token_version is null then
    raise exception 'versioned_combo_redemption_not_found';
  end if;
  v_version := nullif(v_redemption.raw_metadata->>'ready_delivery_version', '')::integer;
  if v_version is null or v_version <> v_redemption.qr_token_version then
    raise exception 'combo_ready_version_not_prepared';
  end if;
  select * into v_order from public.combo_orders where id = v_redemption.combo_order_id and status = 'paid';
  if not found then raise exception 'combo_order_not_paid'; end if;
  select whatsapp_phone into v_phone from public.customers where id = v_redemption.customer_id;
  if nullif(pg_catalog.btrim(v_phone), '') is null then raise exception 'combo_recipient_phone_missing'; end if;

  insert into public.whatsapp_outbound_deliveries(idempotency_key,customer_id,conversation_id,recipient_phone,message_type,reason,business_context,status)
  values ('combo-ready-redemption:'||v_redemption.id||':text:v'||v_version,v_redemption.customer_id,null,v_phone,'text','combo_ready_at_bar',
    pg_catalog.jsonb_build_object('combo_order_id',v_order.id,'combo_redemption_id',v_redemption.id,'customer_id',v_redemption.customer_id,'event_id',v_redemption.event_id,'session_id',v_redemption.session_id,'offer_id',v_order.offer_id,'qr_token_version',v_version,'delivery_order',10),'pending')
  on conflict (idempotency_key) do nothing;
  select * into v_text from public.whatsapp_outbound_deliveries where idempotency_key='combo-ready-redemption:'||v_redemption.id||':text:v'||v_version;
  if v_text.conversation_id is not null or v_text.business_context->>'combo_order_id' is distinct from v_order.id::text or v_text.business_context->>'customer_id' is distinct from v_redemption.customer_id::text or v_text.business_context->>'event_id' is distinct from v_redemption.event_id::text or v_text.business_context->>'session_id' is distinct from v_redemption.session_id::text or v_text.business_context->>'offer_id' is distinct from v_order.offer_id::text or v_text.customer_id is distinct from v_redemption.customer_id or v_text.recipient_phone is distinct from v_phone or v_text.message_type is distinct from 'text' or v_text.reason is distinct from 'combo_ready_at_bar'
    or v_text.business_context->>'combo_redemption_id' is distinct from v_redemption.id::text or v_text.business_context->>'qr_token_version' is distinct from v_version::text or v_text.business_context->>'delivery_order' is distinct from '10'
  then raise exception 'combo_ready_intent_collision'; end if;

  insert into public.whatsapp_outbound_deliveries(idempotency_key,customer_id,conversation_id,recipient_phone,message_type,reason,business_context,status)
  values ('combo-ready-redemption:'||v_redemption.id||':qr:v'||v_version,v_redemption.customer_id,null,v_phone,'image','combo_ready_qr',
    pg_catalog.jsonb_build_object('combo_order_id',v_order.id,'combo_redemption_id',v_redemption.id,'customer_id',v_redemption.customer_id,'event_id',v_redemption.event_id,'session_id',v_redemption.session_id,'offer_id',v_order.offer_id,'qr_token_version',v_version,'delivery_order',20),'pending')
  on conflict (idempotency_key) do nothing;
  select * into v_qr from public.whatsapp_outbound_deliveries where idempotency_key='combo-ready-redemption:'||v_redemption.id||':qr:v'||v_version;
  if v_qr.conversation_id is not null or v_qr.business_context->>'combo_order_id' is distinct from v_order.id::text or v_qr.business_context->>'customer_id' is distinct from v_redemption.customer_id::text or v_qr.business_context->>'event_id' is distinct from v_redemption.event_id::text or v_qr.business_context->>'session_id' is distinct from v_redemption.session_id::text or v_qr.business_context->>'offer_id' is distinct from v_order.offer_id::text or v_qr.customer_id is distinct from v_redemption.customer_id or v_qr.recipient_phone is distinct from v_phone or v_qr.message_type is distinct from 'image' or v_qr.reason is distinct from 'combo_ready_qr'
    or v_qr.business_context->>'combo_redemption_id' is distinct from v_redemption.id::text or v_qr.business_context->>'qr_token_version' is distinct from v_version::text or v_qr.business_context->>'delivery_order' is distinct from '20'
  then raise exception 'combo_ready_intent_collision'; end if;
  return 2;
end;
$function$;
