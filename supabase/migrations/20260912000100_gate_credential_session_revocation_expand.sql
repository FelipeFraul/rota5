-- EXPAND phase for source attribution and authorization serialization.
-- This schema and its RPCs intentionally support OLD_APP and NEW_APP at the
-- same time. Do not treat this phase as resolving the finding: legacy calls
-- retain the previous authorization behavior until CONTRACT.
-- Lock order for every path that touches a credential-derived session is:
-- source credential row, then gate_sessions row, then the ticket/combo row.
-- Revocation takes the same first two locks. Therefore a committed revocation
-- cannot be followed by a protected mutation using an authorization check made
-- before the revocation.

alter table public.gate_sessions
  add column if not exists source_kind text null,
  add column if not exists source_gate_access_id uuid null references public.gate_accesses(id),
  add column if not exists source_fixed_gate_access_id uuid null references public.fixed_gate_accesses(id);

alter table public.gate_sessions
  drop constraint if exists gate_sessions_source_kind_check,
  drop constraint if exists gate_sessions_source_reference_check;

alter table public.gate_sessions
  add constraint gate_sessions_source_kind_check check (
    source_kind is null
    or source_kind in ('admin_direct', 'temporary_gate_access', 'fixed_gate_access')
  ),
  add constraint gate_sessions_source_reference_check check (
    (source_kind is null and source_gate_access_id is null and source_fixed_gate_access_id is null)
    or (source_kind = 'temporary_gate_access' and source_gate_access_id is not null and source_fixed_gate_access_id is null)
    or (source_kind = 'fixed_gate_access' and source_gate_access_id is null and source_fixed_gate_access_id is not null)
    or (source_kind = 'admin_direct' and source_gate_access_id is null and source_fixed_gate_access_id is null)
  );

create index if not exists gate_sessions_source_gate_access_id_idx
  on public.gate_sessions(source_gate_access_id)
  where source_gate_access_id is not null;
create index if not exists gate_sessions_source_fixed_gate_access_id_idx
  on public.gate_sessions(source_fixed_gate_access_id)
  where source_fixed_gate_access_id is not null;

-- Query-testable rollout gate. Pass the actual EXPAND application timestamp;
-- rows created after it with source_kind null are transition legacy sessions.
create or replace function public.gate_session_source_rollout_status(
  p_expand_applied_at timestamptz
)
returns jsonb
language sql
security invoker
set search_path = ''
as $$
  select pg_catalog.jsonb_build_object(
    'source_null_total', count(*) filter (where source_kind is null),
    'source_null_active', count(*) filter (where source_kind is null and status = 'active'),
    'source_null_unexpired', count(*) filter (where source_kind is null and status = 'active' and expires_at > pg_catalog.now()),
    'transition_legacy_created_after_expand', count(*) filter (where source_kind is null and created_at >= p_expand_applied_at)
  )
  from public.gate_sessions;
$$;

-- This idempotent trigger also protects source-attributed NEW_APP sessions
-- when OLD_APP pauses/revokes credentials through direct table updates.
create or replace function public.revoke_linked_gate_sessions_on_credential_change()
returns trigger language plpgsql security invoker set search_path = '' as $$
begin
  if tg_table_name = 'gate_accesses'
     and old.status = 'active' and new.status <> 'active' then
    update public.gate_sessions set status = 'revoked'
      where source_gate_access_id = new.id and status = 'active';
  elsif tg_table_name = 'fixed_gate_accesses'
     and old.status = 'active' and new.status <> 'active' then
    update public.gate_sessions set status = 'revoked'
      where source_fixed_gate_access_id = new.id and status = 'active';
  end if;
  return new;
end;
$$;

drop trigger if exists revoke_linked_sessions_on_gate_access_change on public.gate_accesses;
create trigger revoke_linked_sessions_on_gate_access_change
after update of status on public.gate_accesses
for each row execute function public.revoke_linked_gate_sessions_on_credential_change();

drop trigger if exists revoke_linked_sessions_on_fixed_access_change on public.fixed_gate_accesses;
create trigger revoke_linked_sessions_on_fixed_access_change
after update of status on public.fixed_gate_accesses
for each row execute function public.revoke_linked_gate_sessions_on_credential_change();

-- Returns a locked, currently authorized session or aborts the caller's
-- transaction. Legacy sessions are deliberately not authorized: their source
-- cannot be reconstructed safely and rollout must explicitly reissue them.
create or replace function public.lock_authorized_gate_session(
  p_gate_session_id uuid,
  p_expected_purpose text,
  p_gate_session_token_hash text,
  p_event_id uuid default null,
  p_session_id uuid default null,
  p_kitchen_device_binding_hash text default null,
  p_kitchen_device_role text default null
)
returns public.gate_sessions
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_source public.gate_sessions%rowtype;
  v_session public.gate_sessions%rowtype;
  v_gate_access public.gate_accesses%rowtype;
  v_fixed_access public.fixed_gate_accesses%rowtype;
  v_is_kitchen boolean;
begin
  if p_gate_session_id is null then
    raise exception 'gate_session_required';
  end if;

  -- Read source IDs without a lock only to choose the first lock. The source
  -- columns are immutable, then lock source before the session in every path.
  select * into v_source from public.gate_sessions where id = p_gate_session_id;
  if not found then raise exception 'gate_session_not_found'; end if;

  if v_source.source_kind = 'temporary_gate_access' then
    select * into v_gate_access from public.gate_accesses
      where id = v_source.source_gate_access_id for update;
    if not found or v_gate_access.status <> 'active' then
      raise exception 'gate_credential_inactive';
    end if;
  elsif v_source.source_kind = 'fixed_gate_access' then
    select * into v_fixed_access from public.fixed_gate_accesses
      where id = v_source.source_fixed_gate_access_id for update;
    if not found or v_fixed_access.status <> 'active' then
      raise exception 'gate_credential_inactive';
    end if;
  elsif v_source.source_kind is null then
    raise exception 'transition_legacy_gate_session_requires_reissue';
  elsif v_source.source_kind = 'legacy_unattributed' then
    raise exception 'legacy_gate_session_requires_reissue';
  elsif v_source.source_kind is distinct from 'admin_direct' then
    raise exception 'gate_session_invalid_source';
  end if;

  select * into v_session from public.gate_sessions
    where id = p_gate_session_id for update;
  if not found or v_session.status <> 'active' or v_session.expires_at <= pg_catalog.now() then
    raise exception 'gate_session_inactive';
  end if;
  if p_gate_session_token_hash is null or v_session.token_hash <> p_gate_session_token_hash then
    raise exception 'gate_session_token_mismatch';
  end if;
  if v_session.source_kind = 'temporary_gate_access'
     and (v_gate_access.event_id is distinct from v_session.event_id
       or (v_gate_access.session_id is not null and v_gate_access.session_id is distinct from v_session.session_id)) then
    raise exception 'gate_session_source_scope_mismatch';
  end if;
  if v_session.event_id is not null and not exists (
    select 1 from public.events e
    where e.id = v_session.event_id
      and e.status = 'published'
      and (v_session.source_kind <> 'fixed_gate_access'
        or e.created_by_admin_user_id = v_fixed_access.owner_admin_user_id)
  ) then
    raise exception 'gate_session_event_inactive';
  end if;
  if v_session.session_id is not null and not exists (
    select 1 from public.event_sessions es
    where es.id = v_session.session_id
      and es.event_id is not distinct from v_session.event_id
      and es.status not in ('cancelled', 'finished')
  ) then
    raise exception 'gate_session_event_session_inactive';
  end if;

  v_is_kitchen := pg_catalog.lower(coalesce(v_session.gate_label, '')) = 'cozinha';
  if (p_expected_purpose = 'kitchen' and not v_is_kitchen)
     or (p_expected_purpose = 'gate' and v_is_kitchen) then
    raise exception 'gate_session_wrong_purpose';
  end if;
  if p_event_id is not null and v_session.event_id is not null and v_session.event_id <> p_event_id then
    raise exception 'gate_session_wrong_event';
  end if;
  if p_session_id is not null and v_session.session_id is not null and v_session.session_id <> p_session_id then
    raise exception 'gate_session_wrong_session';
  end if;
  if p_expected_purpose = 'kitchen' and p_kitchen_device_role = 'reader'
     and (v_session.reader_device_binding_hash is null
       or p_kitchen_device_binding_hash is null
       or v_session.reader_device_binding_hash <> p_kitchen_device_binding_hash) then
    raise exception 'gate_session_device_mismatch';
  end if;
  return v_session;
end;
$$;

create or replace function public.pause_gate_access_and_revoke_sessions(
  p_access_id uuid,
  p_event_id uuid default null,
  p_revoked_by_admin_user_id uuid default null
)
returns jsonb language plpgsql security invoker set search_path = '' as $$
declare v_access public.gate_accesses%rowtype; v_revoked_count integer;
begin
  select * into v_access from public.gate_accesses
    where id = p_access_id and (p_event_id is null or event_id = p_event_id)
    for update;
  if not found then return jsonb_build_object('paused', false, 'revoked_sessions', 0); end if;
  select count(*) into v_revoked_count from public.gate_sessions
    where source_gate_access_id = v_access.id and status = 'active';
  update public.gate_accesses set status = 'paused', revoked_at = pg_catalog.now(),
    revoked_by_admin_user_id = p_revoked_by_admin_user_id where id = v_access.id;
  return jsonb_build_object('paused', true, 'revoked_sessions', v_revoked_count);
end;
$$;

create or replace function public.revoke_fixed_gate_access_and_revoke_sessions(
  p_access_id uuid,
  p_owner_admin_user_id uuid,
  p_revoked_by_admin_user_id uuid
)
returns jsonb language plpgsql security invoker set search_path = '' as $$
declare v_access public.fixed_gate_accesses%rowtype; v_revoked_count integer;
begin
  select * into v_access from public.fixed_gate_accesses
    where id = p_access_id and owner_admin_user_id = p_owner_admin_user_id
    for update;
  if not found or v_access.status <> 'active' then return jsonb_build_object('revoked', false, 'revoked_sessions', 0); end if;
  select count(*) into v_revoked_count from public.gate_sessions
    where source_fixed_gate_access_id = v_access.id and status = 'active';
  update public.fixed_gate_accesses set status = 'revoked', revoked_at = pg_catalog.now(),
    revoked_by_admin_user_id = p_revoked_by_admin_user_id where id = v_access.id;
  return jsonb_build_object('revoked', true, 'revoked_sessions', v_revoked_count);
end;
$$;

-- The ticket row is locked after credential/session authorization, so scan and
-- revocation share the credential -> session lock order.
create or replace function public.validate_ticket_entry(
  p_ticket_id uuid, p_ticket_code text, p_gate_session_id uuid default null,
  p_gate_label text default null, p_validator_identifier text default null,
  p_metadata jsonb default '{}'::jsonb
) returns jsonb language plpgsql security invoker set search_path = '' as $$
declare
  v_now timestamptz := pg_catalog.now(); v_ticket record; v_gate_session public.gate_sessions%rowtype;
  v_result text; v_message text; v_allowed boolean := false; v_used_at timestamptz; v_return_ticket boolean := true;
  v_authorization_mode text;
begin
  if p_ticket_id is null then raise exception 'ticket_id_required'; end if;
  if p_ticket_code is null or pg_catalog.btrim(p_ticket_code) = '' then raise exception 'ticket_code_required'; end if;
  if p_metadata is null then raise exception 'metadata_required'; end if;
  if p_metadata ? 'gate_session_token_hash' then
    v_authorization_mode := 'strict';
    v_gate_session := public.lock_authorized_gate_session(
      p_gate_session_id,
      'gate',
      p_metadata->>'gate_session_token_hash'
    );
  else
    v_authorization_mode := 'legacy_compat';
    if p_gate_session_id is not null then
      select * into v_gate_session from public.gate_sessions
        where id = p_gate_session_id;
    end if;
  end if;
  select t.id, t.ticket_code, t.status, t.used_at, t.session_id, es.event_id, es.starts_at,
    e.title as event_title, vs.name as section_name, ri.seat_code into v_ticket
    from public.tickets t left join public.event_sessions es on es.id = t.session_id
    left join public.events e on e.id = es.event_id left join public.venue_sections vs on vs.id = t.section_id
    left join public.reservation_items ri on ri.id = t.reservation_item_id
    where t.id = p_ticket_id and t.ticket_code = pg_catalog.btrim(p_ticket_code) for update of t;
  if v_ticket.id is null then
    insert into public.ticket_validation_events(ticket_code, gate_session_id, result, gate_label, validator_identifier, metadata)
      values (pg_catalog.btrim(p_ticket_code), p_gate_session_id, 'not_found', p_gate_label, p_validator_identifier,
        (p_metadata - 'gate_session_token_hash') || pg_catalog.jsonb_build_object('authorization_mode', v_authorization_mode));
    return pg_catalog.jsonb_build_object('allowed', false, 'result', 'not_found', 'message', 'Ingresso não encontrado ou inválido.');
  end if;
  if v_gate_session.event_id is not null and v_ticket.event_id is distinct from v_gate_session.event_id then
    v_result := 'wrong_event'; v_message := 'INGRESSO DE OUTRO EVENTO'; v_used_at := v_ticket.used_at; v_return_ticket := false;
  elsif v_gate_session.session_id is not null and v_ticket.session_id is distinct from v_gate_session.session_id then
    v_result := 'wrong_session'; v_message := 'INGRESSO DE OUTRA SESSÃO'; v_used_at := v_ticket.used_at; v_return_ticket := false;
  elsif v_ticket.status = 'issued' then
    update public.tickets set status = 'used', used_at = v_now, updated_at = v_now where id = v_ticket.id;
    v_result := 'allowed'; v_message := 'Entrada liberada.'; v_allowed := true; v_used_at := v_now;
  elsif v_ticket.status = 'used' then v_result := 'already_used'; v_message := 'Ingresso já utilizado.'; v_used_at := v_ticket.used_at;
  elsif v_ticket.status = 'cancelled' then v_result := 'cancelled'; v_message := 'Ingresso cancelado.'; v_used_at := v_ticket.used_at;
  else v_result := 'denied'; v_message := 'Ingresso não disponível para entrada.'; v_used_at := v_ticket.used_at; end if;
  insert into public.ticket_validation_events(ticket_id, ticket_code, gate_session_id, result, gate_label, validator_identifier, metadata)
    values (v_ticket.id, v_ticket.ticket_code, p_gate_session_id, v_result, p_gate_label, p_validator_identifier,
      (p_metadata - 'gate_session_token_hash') || pg_catalog.jsonb_build_object('authorization_mode', v_authorization_mode));
  return pg_catalog.jsonb_strip_nulls(pg_catalog.jsonb_build_object('allowed', v_allowed, 'result', v_result, 'message', v_message,
    'ticket', case when v_return_ticket then pg_catalog.jsonb_strip_nulls(pg_catalog.jsonb_build_object('ticketId', v_ticket.id, 'ticketCode', v_ticket.ticket_code, 'status', case when v_allowed then 'used' else v_ticket.status end, 'usedAt', v_used_at, 'eventTitle', v_ticket.event_title, 'startsAt', v_ticket.starts_at, 'sectionName', v_ticket.section_name, 'seatCode', v_ticket.seat_code)) else null end));
end;
$$;

-- Preserve the existing replay/preparation/event logging contract while
-- authorizing the kitchen reader in the same transaction as consumption.
create or replace function public.validate_combo_redemption(
  p_redemption_id uuid, p_qr_token_hash text, p_kitchen_session_id uuid,
  p_kitchen_label text, p_validator_identifier text, p_event_id uuid default null,
  p_session_id uuid default null, p_metadata jsonb default '{}'::jsonb
) returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_redemption public.combo_redemptions%rowtype; v_gate_session public.gate_sessions%rowtype;
  v_has_redemption boolean := false; v_result text; v_event_result text; v_allowed boolean := false; v_message text;
  v_authorization_mode text;
begin
  if p_metadata ? 'gate_session_token_hash' or p_metadata ? 'kitchen_device_binding_hash' then
    v_authorization_mode := 'strict';
    v_gate_session := public.lock_authorized_gate_session(p_kitchen_session_id, 'kitchen',
      p_metadata->>'gate_session_token_hash', null, null,
      p_metadata->>'kitchen_device_binding_hash', 'reader');
  else
    v_authorization_mode := 'legacy_compat';
  end if;
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
    update public.combo_redemptions set status = 'used', used_at = pg_catalog.now(), raw_metadata = coalesce(raw_metadata, '{}'::jsonb) || pg_catalog.jsonb_build_object('last_redemption', pg_catalog.jsonb_build_object('kitchen_session_id', p_kitchen_session_id, 'kitchen_label', p_kitchen_label, 'validator_identifier', p_validator_identifier, 'redeemed_at', pg_catalog.now())) where id = v_redemption.id returning * into v_redemption;
    v_result := 'allowed'; v_allowed := true; v_message := 'Combo liberado para retirada.';
  end if;
  v_event_result := case when v_result = 'awaiting_preparation' then 'denied' else v_result end;
  insert into public.combo_redemption_events(combo_redemption_id, combo_order_id, kitchen_session_id, result, redemption_code, offer_name, quantity, kitchen_label, validator_identifier, metadata)
    values (case when v_has_redemption then v_redemption.id else null end, case when v_has_redemption then v_redemption.combo_order_id else null end, p_kitchen_session_id, v_event_result, case when v_has_redemption then v_redemption.redemption_code else null end, case when v_has_redemption then v_redemption.offer_name else null end, case when v_has_redemption then v_redemption.quantity else null end, p_kitchen_label, p_validator_identifier,
      (coalesce(p_metadata, '{}'::jsonb) - 'gate_session_token_hash' - 'kitchen_device_binding_hash')
      || pg_catalog.jsonb_build_object('authorization_mode', v_authorization_mode)
      || case when v_result = 'awaiting_preparation' then pg_catalog.jsonb_build_object('reason', 'awaiting_preparation') else '{}'::jsonb end);
  return pg_catalog.jsonb_build_object('allowed', v_allowed, 'result', v_result, 'message', v_message, 'redemption', case when v_has_redemption then pg_catalog.jsonb_build_object('redemptionId', v_redemption.id, 'redemptionCode', v_redemption.redemption_code, 'offerName', v_redemption.offer_name, 'quantity', v_redemption.quantity, 'status', v_redemption.status, 'usedAt', v_redemption.used_at) else null end);
end;
$$;

revoke all on function public.lock_authorized_gate_session(uuid, text, text, uuid, uuid, text, text) from public, anon, authenticated;
revoke all on function public.gate_session_source_rollout_status(timestamptz) from public, anon, authenticated;
revoke all on function public.revoke_linked_gate_sessions_on_credential_change() from public, anon, authenticated;
revoke all on function public.pause_gate_access_and_revoke_sessions(uuid, uuid, uuid) from public, anon, authenticated;
revoke all on function public.revoke_fixed_gate_access_and_revoke_sessions(uuid, uuid, uuid) from public, anon, authenticated;
revoke all on function public.validate_ticket_entry(uuid, text, uuid, text, text, jsonb) from public, anon, authenticated;
revoke all on function public.validate_combo_redemption(uuid, text, uuid, text, text, uuid, uuid, jsonb) from public, anon, authenticated;
grant execute on function public.lock_authorized_gate_session(uuid, text, text, uuid, uuid, text, text) to service_role;
grant execute on function public.gate_session_source_rollout_status(timestamptz) to service_role;
grant execute on function public.pause_gate_access_and_revoke_sessions(uuid, uuid, uuid) to service_role;
grant execute on function public.revoke_fixed_gate_access_and_revoke_sessions(uuid, uuid, uuid) to service_role;
grant execute on function public.validate_ticket_entry(uuid, text, uuid, text, text, jsonb) to service_role;
grant execute on function public.validate_combo_redemption(uuid, text, uuid, text, text, uuid, uuid, jsonb) to service_role;

comment on column public.gate_sessions.source_kind is 'During EXPAND, NULL identifies historical or transition-legacy sessions created by OLD_APP. NEW_APP writes an explicit source; CONTRACT classifies remaining NULL rows without heuristic attribution.';
comment on function public.lock_authorized_gate_session(uuid, text, text, uuid, uuid, text, text) is 'Locks source credential before gate session and verifies the hashed session token, current source authorization, scope, purpose, expiry and applicable device binding.';
comment on function public.gate_session_source_rollout_status(timestamptz) is 'Returns query-testable counts for source-less sessions; pass the recorded EXPAND application timestamp.';
