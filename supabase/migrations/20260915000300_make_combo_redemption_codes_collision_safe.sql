-- Allocate short human-readable combo redemption codes without UUID-prefix collisions.
-- Existing redemption codes remain unchanged.

create sequence public.combo_redemption_code_seq
  as bigint
  start with 1
  increment by 1
  minvalue 1
  maxvalue 9999999999
  no cycle
  cache 1;

revoke all on sequence public.combo_redemption_code_seq from public, anon, authenticated;
grant usage on sequence public.combo_redemption_code_seq to service_role;

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
    'CMB-' || pg_catalog.lpad(pg_catalog.nextval('public.combo_redemption_code_seq'::regclass)::text, 10, '0'),
    'issued'
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

revoke all on function public.confirm_paid_combo_order(uuid,text,text,integer,text,timestamptz,jsonb,text,integer)
from public, anon, authenticated;

grant execute on function public.confirm_paid_combo_order(uuid,text,text,integer,text,timestamptz,jsonb,text,integer)
to service_role;

comment on sequence public.combo_redemption_code_seq is
'Allocates collision-safe numeric codes for new combo redemptions; gaps from rolled-back transactions are expected.';
