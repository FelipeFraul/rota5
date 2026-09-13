\set ON_ERROR_STOP on
set role service_role;

insert into public.events(id,title,status,created_by_admin_user_id) values
  ('10000000-0000-4000-8000-000000000001','Event A','published','30000000-0000-4000-8000-000000000001');
insert into public.event_sessions(id,event_id,starts_at,status) values
  ('20000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001',now(),'scheduled');
insert into public.admin_users(id) values ('30000000-0000-4000-8000-000000000001');
insert into public.gate_accesses(id,event_id,session_id,phone,passphrase_hash,status) values
  ('40000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000001','5515000000001','hash','active');
insert into public.fixed_gate_accesses(id,phone,passphrase_hash,status,owner_admin_user_id) values
  ('50000000-0000-4000-8000-000000000001','5515000000002','hash','active','30000000-0000-4000-8000-000000000001');

-- OLD_APP insert remains valid during EXPAND and is explicitly detectable.
insert into public.gate_sessions(id,event_id,session_id,gate_label,validator_phone,token_hash,status,expires_at,created_by_admin_phone)
values ('60000000-0000-4000-8000-000000000010','10000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000001','Portaria','5515000000010','old-token','active',now()+interval '1 hour','5515000000000');

-- NEW_APP sessions always have an explicit, structurally valid source.
insert into public.gate_sessions(id,event_id,session_id,gate_label,validator_phone,token_hash,status,expires_at,created_by_admin_phone,source_kind,source_gate_access_id)
values ('60000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000001','Portaria','5515000000001','new-ticket-token','active',now()+interval '1 hour','5515000000000','temporary_gate_access','40000000-0000-4000-8000-000000000001');
insert into public.gate_sessions(id,event_id,session_id,gate_label,validator_phone,token_hash,reader_device_binding_hash,status,expires_at,created_by_admin_phone,source_kind)
values ('60000000-0000-4000-8000-000000000002','10000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000001','Cozinha','5515000000002','new-combo-token','reader-token','active',now()+interval '1 hour','5515000000000','admin_direct');

do $$ begin
  begin
    insert into public.gate_sessions(id,gate_label,validator_phone,token_hash,status,expires_at,created_by_admin_phone,source_kind,source_gate_access_id)
    values ('60000000-0000-4000-8000-000000000098','Portaria','5515000000098','bad-source','active',now()+interval '1 hour','5515000000000','admin_direct','40000000-0000-4000-8000-000000000001');
    raise exception 'impossible_source_combination_accepted';
  exception when check_violation then null; end;
end $$;

insert into public.tickets(id,ticket_code,status,session_id) values
  ('70000000-0000-4000-8000-000000000010','OLD-TICKET','issued','20000000-0000-4000-8000-000000000001'),
  ('70000000-0000-4000-8000-000000000001','NEW-TICKET','issued','20000000-0000-4000-8000-000000000001'),
  ('70000000-0000-4000-8000-000000000002','WRONG-TOKEN','issued','20000000-0000-4000-8000-000000000001');

do $$ declare r jsonb; begin
  r := public.validate_ticket_entry('70000000-0000-4000-8000-000000000010','OLD-TICKET','60000000-0000-4000-8000-000000000010','Portaria','old-app','{"source":"old_app"}'::jsonb);
  if r->>'result' <> 'allowed' then raise exception 'old_ticket_expand_failed: %', r; end if;
  r := public.validate_ticket_entry('70000000-0000-4000-8000-000000000001','NEW-TICKET','60000000-0000-4000-8000-000000000001','Portaria','new-app',jsonb_build_object('source','new_app','gate_session_token_hash','new-ticket-token'));
  if r->>'result' <> 'allowed' then raise exception 'strict_ticket_expand_failed: %', r; end if;
  begin
    perform public.validate_ticket_entry('70000000-0000-4000-8000-000000000002','WRONG-TOKEN','60000000-0000-4000-8000-000000000001','Portaria','new-app',jsonb_build_object('gate_session_token_hash','wrong'));
    raise exception 'strict_ticket_fell_back_to_legacy';
  exception when others then if sqlerrm <> 'gate_session_token_mismatch' then raise; end if; end;
end $$;

insert into public.combo_redemptions(id,combo_order_id,event_id,session_id,redemption_code,offer_name,quantity,status,qr_token_hash,raw_metadata) values
  ('80000000-0000-4000-8000-000000000010','81000000-0000-4000-8000-000000000010','10000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000001','OLD-C','Combo',1,'issued','old-combo','{"kitchen_status":"preparing","ready_notified_at":"2026-09-12T10:00:00Z"}'),
  ('80000000-0000-4000-8000-000000000001','81000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000001','NEW-C','Combo',1,'issued','new-combo','{"kitchen_status":"preparing","ready_notified_at":"2026-09-12T10:00:00Z"}'),
  ('80000000-0000-4000-8000-000000000002','81000000-0000-4000-8000-000000000002','10000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000001','BAD-C','Combo',1,'issued','bad-combo','{"kitchen_status":"preparing","ready_notified_at":"2026-09-12T10:00:00Z"}');

do $$ declare r jsonb; begin
  r := public.validate_combo_redemption('80000000-0000-4000-8000-000000000010','old-combo','60000000-0000-4000-8000-000000000010','Cozinha','old-app',null,null,'{"source":"old_app"}'::jsonb);
  if r->>'result' <> 'allowed' then raise exception 'old_combo_expand_failed: %', r; end if;
  r := public.validate_combo_redemption('80000000-0000-4000-8000-000000000001','new-combo','60000000-0000-4000-8000-000000000002','Cozinha','new-app',null,null,jsonb_build_object('gate_session_token_hash','new-combo-token','kitchen_device_binding_hash','reader-token'));
  if r->>'result' <> 'allowed' then raise exception 'strict_combo_expand_failed: %', r; end if;
  begin
    perform public.validate_combo_redemption('80000000-0000-4000-8000-000000000002','bad-combo','60000000-0000-4000-8000-000000000002','Cozinha','new-app',null,null,jsonb_build_object('gate_session_token_hash','wrong','kitchen_device_binding_hash','reader-token'));
    raise exception 'strict_combo_fell_back_to_legacy';
  exception when others then if sqlerrm <> 'gate_session_token_mismatch' then raise; end if; end;
end $$;

do $$ begin
  if not exists (select 1 from public.ticket_validation_events where metadata->>'authorization_mode' = 'legacy_compat') then raise exception 'ticket_legacy_mode_not_observable'; end if;
  if not exists (select 1 from public.ticket_validation_events where metadata->>'authorization_mode' = 'strict') then raise exception 'ticket_strict_mode_not_observable'; end if;
  if not exists (select 1 from public.combo_redemption_events where metadata->>'authorization_mode' = 'legacy_compat') then raise exception 'combo_legacy_mode_not_observable'; end if;
  if not exists (select 1 from public.combo_redemption_events where metadata->>'authorization_mode' = 'strict') then raise exception 'combo_strict_mode_not_observable'; end if;
  if ((public.gate_session_source_rollout_status(now() - interval '1 hour')->>'source_null_unexpired')::integer) < 1 then raise exception 'transition_legacy_not_detected'; end if;
end $$;

-- Direct OLD_APP updates revoke only sessions with proven source links.
update public.gate_accesses set status='paused' where id='40000000-0000-4000-8000-000000000001';
do $$ begin
  if (select status from public.gate_sessions where id='60000000-0000-4000-8000-000000000001') <> 'revoked' then raise exception 'expand_trigger_did_not_revoke_linked_session'; end if;
  if (select status from public.gate_sessions where id='60000000-0000-4000-8000-000000000010') <> 'active' then raise exception 'expand_trigger_guessed_legacy_source'; end if;
end $$;

reset role;

do $$ begin
  if exists (
       select 1 from pg_proc p
       cross join lateral aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a
       where p.oid in (
         'public.gate_session_source_rollout_status(timestamptz)'::regprocedure,
         'public.validate_ticket_entry(uuid,text,uuid,text,text,jsonb)'::regprocedure,
         'public.validate_combo_redemption(uuid,text,uuid,text,text,uuid,uuid,jsonb)'::regprocedure
       ) and a.grantee = 0 and a.privilege_type = 'EXECUTE'
     )
     or has_function_privilege('anon', 'public.validate_ticket_entry(uuid,text,uuid,text,text,jsonb)', 'execute')
     or has_function_privilege('authenticated', 'public.validate_combo_redemption(uuid,text,uuid,text,text,uuid,uuid,jsonb)', 'execute') then
    raise exception 'expand_protected_function_exposed';
  end if;
  if not has_function_privilege('service_role', 'public.gate_session_source_rollout_status(timestamptz)', 'execute') then raise exception 'service_role_missing_rollout_status'; end if;
end $$;
