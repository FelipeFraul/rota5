-- Make paid combo confirmation, QR identity and delivery intents durable.
-- Historical hash-only redemptions deliberately remain unversioned.

alter table public.combo_redemptions
  add column if not exists qr_token_version integer;

alter table public.combo_redemptions
  drop constraint if exists combo_redemptions_qr_token_version_check;

alter table public.combo_redemptions
  add constraint combo_redemptions_qr_token_version_check
  check (qr_token_version is null or qr_token_version > 0);

create unique index combo_payments_provider_payment_unique_idx
on public.combo_payments(provider, provider_payment_id)
where provider_payment_id is not null;

create unique index combo_payments_one_approved_per_order_idx
on public.combo_payments(combo_order_id)
where status = 'approved';

create index whatsapp_outbound_deliveries_paid_combo_due_idx
on public.whatsapp_outbound_deliveries(status, next_attempt_at, lease_expires_at, created_at)
where reason in (
  'paid_combo_delivery',
  'paid_combo_qr_delivery',
  'combo_ready_at_bar',
  'combo_ready_qr'
);

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
  if v_redemption.qr_token_version is null then
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

create or replace function public.confirm_paid_combo_order(
  p_order_id uuid,
  p_provider text,
  p_provider_payment_id text,
  p_amount_cents integer,
  p_currency text,
  p_paid_at timestamptz,
  p_raw_metadata jsonb,
  p_qr_token_hash text,
  p_qr_token_version integer
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $function$
declare
  v_order public.combo_orders%rowtype;
  v_provider_payment public.combo_payments%rowtype;
  v_approved_payment public.combo_payments%rowtype;
  v_redemption public.combo_redemptions%rowtype;
  v_offer_name text;
begin
  if p_provider <> 'mercado_pago' then raise exception 'combo_payment_provider_mismatch'; end if;
  if nullif(pg_catalog.btrim(p_provider_payment_id), '') is null then raise exception 'combo_payment_id_required'; end if;
  if p_currency <> 'BRL' then raise exception 'combo_payment_currency_mismatch'; end if;
  if p_qr_token_version <> 1 or nullif(pg_catalog.btrim(p_qr_token_hash), '') is null then
    raise exception 'combo_qr_token_contract_invalid';
  end if;

  select * into v_order from public.combo_orders where id = p_order_id for update;
  if not found then raise exception 'order_not_found'; end if;
  if p_amount_cents <> v_order.total_amount_cents then raise exception 'combo_payment_amount_mismatch'; end if;

  select * into v_provider_payment
  from public.combo_payments
  where provider = p_provider and provider_payment_id = p_provider_payment_id
  for update;

  if found and v_provider_payment.combo_order_id <> v_order.id then
    raise exception 'payment_already_linked';
  end if;

  select * into v_approved_payment
  from public.combo_payments
  where combo_order_id = v_order.id and status = 'approved'
  for update;

  if v_order.status = 'paid' then
    if not found then raise exception 'combo_paid_without_approved_payment'; end if;
    if v_approved_payment.provider <> p_provider
      or v_approved_payment.provider_payment_id <> p_provider_payment_id
      or v_approved_payment.amount_cents <> p_amount_cents
      or v_approved_payment.currency <> p_currency
    then
      raise exception 'combo_paid_payment_replay_mismatch';
    end if;

    select * into v_redemption from public.combo_redemptions
    where combo_order_id = v_order.id for update;
    if not found then raise exception 'combo_paid_without_redemption'; end if;

    if v_redemption.qr_token_version is not null then
      perform public.ensure_paid_combo_delivery_intents(v_order.id);
    end if;

    return pg_catalog.jsonb_build_object(
      'idempotent', true,
      'order_id', v_order.id,
      'redemption_id', v_redemption.id,
      'qr_token_version', v_redemption.qr_token_version,
      'legacy_redemption', v_redemption.qr_token_version is null
    );
  end if;

  if v_order.status <> 'pending_payment' then raise exception 'order_not_payable'; end if;
  if v_approved_payment.id is not null then raise exception 'combo_order_payment_state_mismatch'; end if;

  if v_provider_payment.id is null then
    insert into public.combo_payments(
      combo_order_id, provider, provider_payment_id, status,
      amount_cents, currency, raw_metadata
    ) values (
      v_order.id, p_provider, p_provider_payment_id, 'approved',
      p_amount_cents, p_currency, coalesce(p_raw_metadata, '{}'::jsonb)
    );
  else
    update public.combo_payments set
      status = 'approved', amount_cents = p_amount_cents,
      currency = p_currency, raw_metadata = coalesce(p_raw_metadata, '{}'::jsonb)
    where id = v_provider_payment.id;
  end if;

  update public.combo_orders set status = 'paid', paid_at = p_paid_at
  where id = v_order.id;

  select coalesce(o.name, 'Combo') into v_offer_name
  from public.combo_orders ord
  left join public.combo_offers o on o.id = ord.offer_id
  where ord.id = v_order.id;

  insert into public.combo_redemptions(
    combo_order_id, customer_id, event_id, session_id, offer_name,
    quantity, qr_token_hash, qr_token_version, redemption_code, status
  ) values (
    v_order.id, v_order.customer_id, v_order.event_id, v_order.session_id,
    v_offer_name, v_order.quantity, p_qr_token_hash, p_qr_token_version,
    'CMB-' || pg_catalog.upper(pg_catalog.left(v_order.id::text, 8)), 'issued'
  ) returning * into v_redemption;

  perform public.ensure_paid_combo_delivery_intents(v_order.id);

  return pg_catalog.jsonb_build_object(
    'idempotent', false,
    'order_id', v_order.id,
    'redemption_id', v_redemption.id,
    'qr_token_version', v_redemption.qr_token_version,
    'legacy_redemption', false
  );
end;
$function$;

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
  if v_text.customer_id is distinct from v_redemption.customer_id or v_text.recipient_phone is distinct from v_phone or v_text.message_type is distinct from 'text' or v_text.reason is distinct from 'combo_ready_at_bar'
    or v_text.business_context->>'combo_redemption_id' is distinct from v_redemption.id::text or v_text.business_context->>'qr_token_version' is distinct from v_version::text or v_text.business_context->>'delivery_order' is distinct from '10'
  then raise exception 'combo_ready_intent_collision'; end if;

  insert into public.whatsapp_outbound_deliveries(idempotency_key,customer_id,conversation_id,recipient_phone,message_type,reason,business_context,status)
  values ('combo-ready-redemption:'||v_redemption.id||':qr:v'||v_version,v_redemption.customer_id,null,v_phone,'image','combo_ready_qr',
    pg_catalog.jsonb_build_object('combo_order_id',v_order.id,'combo_redemption_id',v_redemption.id,'customer_id',v_redemption.customer_id,'event_id',v_redemption.event_id,'session_id',v_redemption.session_id,'offer_id',v_order.offer_id,'qr_token_version',v_version,'delivery_order',20),'pending')
  on conflict (idempotency_key) do nothing;
  select * into v_qr from public.whatsapp_outbound_deliveries where idempotency_key='combo-ready-redemption:'||v_redemption.id||':qr:v'||v_version;
  if v_qr.customer_id is distinct from v_redemption.customer_id or v_qr.recipient_phone is distinct from v_phone or v_qr.message_type is distinct from 'image' or v_qr.reason is distinct from 'combo_ready_qr'
    or v_qr.business_context->>'combo_redemption_id' is distinct from v_redemption.id::text or v_qr.business_context->>'qr_token_version' is distinct from v_version::text or v_qr.business_context->>'delivery_order' is distinct from '20'
  then raise exception 'combo_ready_intent_collision'; end if;
  return 2;
end;
$function$;

create or replace function public.prepare_combo_ready_delivery(
  p_redemption_id uuid,
  p_expected_version integer,
  p_next_version integer,
  p_next_qr_token_hash text
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $function$
declare
  v_redemption public.combo_redemptions%rowtype;
  v_prepared_version integer;
begin
  select * into v_redemption from public.combo_redemptions where id=p_redemption_id for update;
  if not found or v_redemption.status<>'issued' then raise exception 'combo_redemption_not_issuable'; end if;
  if v_redemption.qr_token_version is null then
    return pg_catalog.jsonb_build_object('legacy_redemption',true,'idempotent',true,'qr_token_version',null);
  end if;
  if nullif(v_redemption.raw_metadata->>'ready_notified_at','') is not null then
    return pg_catalog.jsonb_build_object('legacy_redemption',false,'idempotent',true,'qr_token_version',v_redemption.qr_token_version);
  end if;
  v_prepared_version := nullif(v_redemption.raw_metadata->>'ready_delivery_version','')::integer;
  if v_prepared_version is not null then
    perform public.ensure_combo_ready_delivery_intents(v_redemption.id);
    return pg_catalog.jsonb_build_object('legacy_redemption',false,'idempotent',true,'qr_token_version',v_prepared_version);
  end if;
  if v_redemption.qr_token_version<>p_expected_version or p_next_version<>p_expected_version+1
    or nullif(pg_catalog.btrim(p_next_qr_token_hash),'') is null
  then raise exception 'combo_ready_version_conflict'; end if;
  update public.combo_redemptions set
    qr_token_version=p_next_version,
    qr_token_hash=p_next_qr_token_hash,
    raw_metadata=coalesce(raw_metadata,'{}'::jsonb)||pg_catalog.jsonb_build_object(
      'kitchen_status','preparing',
      'preparing_at',coalesce(raw_metadata->>'preparing_at',pg_catalog.now()::text),
      'ready_prepared_at',pg_catalog.now(),
      'ready_delivery_version',p_next_version
    )
  where id=v_redemption.id;
  perform public.ensure_combo_ready_delivery_intents(v_redemption.id);
  return pg_catalog.jsonb_build_object('legacy_redemption',false,'idempotent',false,'qr_token_version',p_next_version);
end;
$function$;

create or replace function public.complete_combo_ready_delivery(p_redemption_id uuid, p_qr_token_version integer)
returns boolean
language plpgsql
security invoker
set search_path = ''
as $function$
declare v_redemption public.combo_redemptions%rowtype;
begin
  select * into v_redemption from public.combo_redemptions where id=p_redemption_id for update;
  if not found or v_redemption.qr_token_version<>p_qr_token_version then return false; end if;
  if not exists(select 1 from public.whatsapp_outbound_deliveries where idempotency_key='combo-ready-redemption:'||p_redemption_id||':text:v'||p_qr_token_version and status='sent')
    or not exists(select 1 from public.whatsapp_outbound_deliveries where idempotency_key='combo-ready-redemption:'||p_redemption_id||':qr:v'||p_qr_token_version and status='sent')
  then return false; end if;
  update public.combo_redemptions set raw_metadata=coalesce(raw_metadata,'{}'::jsonb)||pg_catalog.jsonb_build_object('ready_notified_at',pg_catalog.now()) where id=p_redemption_id;
  return true;
end;
$function$;

create or replace function public.claim_whatsapp_outbound_delivery(p_delivery_id uuid)
returns setof public.whatsapp_outbound_deliveries
language sql
security invoker
set search_path = ''
as $function$
  update public.whatsapp_outbound_deliveries as delivery set
    status='sending', claimed_at=pg_catalog.now(), lease_expires_at=pg_catalog.now()+interval '300 seconds',
    claim_token=pg_catalog.gen_random_uuid(), attempt_count=delivery.attempt_count+1,
    next_attempt_at=null, updated_at=pg_catalog.now()
  where delivery.id=p_delivery_id and (
    (delivery.reason in ('paid_ticket_delivery','paid_ticket_delivery_choice','paid_ticket_qr_instruction','paid_ticket_qr_delivery','paid_combo_delivery','paid_combo_qr_delivery','combo_ready_at_bar','combo_ready_qr')
      and delivery.attempt_count<5 and (
        (delivery.status in ('pending','failed') and (delivery.next_attempt_at is null or delivery.next_attempt_at<=pg_catalog.now()))
        or (delivery.status='sending' and (delivery.lease_expires_at is null or delivery.lease_expires_at<=pg_catalog.now()))
      ))
    or (delivery.reason not in ('paid_ticket_delivery','paid_ticket_delivery_choice','paid_ticket_qr_instruction','paid_ticket_qr_delivery','paid_combo_delivery','paid_combo_qr_delivery','combo_ready_at_bar','combo_ready_qr') and delivery.status in ('pending','failed'))
  ) returning delivery.*;
$function$;

create or replace function public.list_due_paid_combo_delivery_tasks(p_limit integer default 20)
returns table(entity_id uuid, delivery_kind text)
language sql
security invoker
set search_path = ''
as $function$
  with combo_deliveries as (
    select d.*,
      case when d.reason in ('paid_combo_delivery','paid_combo_qr_delivery') then 'paid' else 'ready' end task_kind,
      case
        when d.reason in ('paid_combo_delivery','paid_combo_qr_delivery') and coalesce(d.business_context->>'combo_order_id','') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' then (d.business_context->>'combo_order_id')::uuid
        when d.reason in ('combo_ready_at_bar','combo_ready_qr') and coalesce(d.business_context->>'combo_redemption_id','') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' then (d.business_context->>'combo_redemption_id')::uuid
      end task_id,
      case when coalesce(d.business_context->>'delivery_order','') ~ '^[0-9]+$' then (d.business_context->>'delivery_order')::integer else case when d.message_type='text' then 10 else 20 end end intent_order
    from public.whatsapp_outbound_deliveries d
    where d.reason in ('paid_combo_delivery','paid_combo_qr_delivery','combo_ready_at_bar','combo_ready_qr')
  ), first_incomplete as (
    select distinct on (task_kind,task_id) * from combo_deliveries
    where task_id is not null and status not in ('sent','superseded')
    order by task_kind,task_id,intent_order,created_at,id
  ), due_delivery as (
    select task_id entity_id,task_kind delivery_kind,coalesce(next_attempt_at,lease_expires_at,created_at) due_at
    from first_incomplete
    where attempt_count<5 and (
      (status in ('pending','failed') and (next_attempt_at is null or next_attempt_at<=pg_catalog.now()))
      or (status='sending' and (lease_expires_at is null or lease_expires_at<=pg_catalog.now()))
    )
  ), ready_completion as (
    select r.id entity_id,'ready'::text delivery_kind,max(greatest(t.updated_at,q.updated_at)) due_at
    from public.combo_redemptions r
    join public.whatsapp_outbound_deliveries t on t.reason='combo_ready_at_bar' and t.status='sent' and t.business_context->>'combo_redemption_id'=r.id::text
    join public.whatsapp_outbound_deliveries q on q.reason='combo_ready_qr' and q.status='sent' and q.business_context->>'combo_redemption_id'=r.id::text
    where r.qr_token_version is not null
      and nullif(r.raw_metadata->>'ready_notified_at','') is null
      and coalesce(r.raw_metadata->>'ready_delivery_version','') ~ '^[0-9]+$'
      and (r.raw_metadata->>'ready_delivery_version')::integer=r.qr_token_version
    group by r.id
  ), candidates as (
    select * from due_delivery
    union
    select * from ready_completion
  )
  select entity_id,delivery_kind from candidates
  order by due_at
  limit greatest(0,least(coalesce(p_limit,20),100));
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
  where reason in ('paid_combo_delivery','paid_combo_qr_delivery','combo_ready_at_bar','combo_ready_qr');
$function$;

revoke all on function public.ensure_paid_combo_delivery_intents(uuid) from public,anon,authenticated;
revoke all on function public.claim_whatsapp_outbound_delivery(uuid) from public,anon,authenticated;
revoke all on function public.confirm_paid_combo_order(uuid,text,text,integer,text,timestamptz,jsonb,text,integer) from public,anon,authenticated;
revoke all on function public.ensure_combo_ready_delivery_intents(uuid) from public,anon,authenticated;
revoke all on function public.prepare_combo_ready_delivery(uuid,integer,integer,text) from public,anon,authenticated;
revoke all on function public.complete_combo_ready_delivery(uuid,integer) from public,anon,authenticated;
revoke all on function public.list_due_paid_combo_delivery_tasks(integer) from public,anon,authenticated;
revoke all on function public.get_paid_combo_delivery_queue_counts() from public,anon,authenticated;

grant execute on function public.ensure_paid_combo_delivery_intents(uuid) to service_role;
grant execute on function public.claim_whatsapp_outbound_delivery(uuid) to service_role;
grant execute on function public.confirm_paid_combo_order(uuid,text,text,integer,text,timestamptz,jsonb,text,integer) to service_role;
grant execute on function public.ensure_combo_ready_delivery_intents(uuid) to service_role;
grant execute on function public.prepare_combo_ready_delivery(uuid,integer,integer,text) to service_role;
grant execute on function public.complete_combo_ready_delivery(uuid,integer) to service_role;
grant execute on function public.list_due_paid_combo_delivery_tasks(integer) to service_role;
grant execute on function public.get_paid_combo_delivery_queue_counts() to service_role;

comment on column public.combo_redemptions.qr_token_version is
'NULL identifies legacy hash-only QR tokens; positive versions use application-side domain-separated HMAC reconstruction.';
