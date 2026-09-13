\set ON_ERROR_STOP on
set role service_role;

do $$ begin
  if (select source_kind from public.gate_sessions where id='60000000-0000-4000-8000-000000000000') <> 'legacy_unattributed' then
    raise exception 'legacy_row_not_classified';
  end if;
  begin
    perform public.lock_authorized_gate_session('60000000-0000-4000-8000-000000000000','gate','legacy-token-hash');
    raise exception 'legacy_session_was_authorized';
  exception when others then
    if sqlerrm <> 'legacy_gate_session_requires_reissue' then raise; end if;
  end;
end $$;

insert into public.events(id,title,status,created_by_admin_user_id) values
  ('10000000-0000-4000-8000-000000000001','Event A','published','30000000-0000-4000-8000-000000000001'),
  ('10000000-0000-4000-8000-000000000002','Event B','published','30000000-0000-4000-8000-000000000001');
insert into public.event_sessions(id,event_id,starts_at,status) values
  ('20000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001',now(),'scheduled'),
  ('20000000-0000-4000-8000-000000000002','10000000-0000-4000-8000-000000000002',now(),'scheduled');
insert into public.admin_users(id) values ('30000000-0000-4000-8000-000000000001');
insert into public.gate_accesses(id,event_id,session_id,phone,passphrase_hash,status) values
  ('40000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000001','5515000000001','hash','active');
insert into public.fixed_gate_accesses(id,phone,passphrase_hash,status,owner_admin_user_id) values
  ('50000000-0000-4000-8000-000000000001','5515000000002','hash','active','30000000-0000-4000-8000-000000000001');

insert into public.gate_sessions(id,event_id,session_id,gate_label,validator_phone,token_hash,status,expires_at,created_by_admin_phone,source_kind,source_gate_access_id) values
  ('60000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000001','Portaria','5515000000001','temp-token-hash','active',now()+interval '1 hour','5515000000000','temporary_gate_access','40000000-0000-4000-8000-000000000001');
insert into public.gate_sessions(id,event_id,gate_label,validator_phone,token_hash,status,expires_at,created_by_admin_phone,source_kind,source_fixed_gate_access_id) values
  ('60000000-0000-4000-8000-000000000002','10000000-0000-4000-8000-000000000001','Portaria fixa','5515000000002','fixed-token-hash','active',now()+interval '1 hour','5515000000000','fixed_gate_access','50000000-0000-4000-8000-000000000001');
insert into public.gate_sessions(id,event_id,gate_label,validator_phone,token_hash,status,expires_at,created_by_admin_phone,source_kind) values
  ('60000000-0000-4000-8000-000000000003','10000000-0000-4000-8000-000000000001','Check-in','5515000000003','admin-token-hash','active',now()+interval '1 hour','5515000000000','admin_direct');
insert into public.gate_sessions(id,event_id,gate_label,validator_phone,token_hash,status,expires_at,created_by_admin_phone,source_kind,reader_device_binding_hash) values
  ('60000000-0000-4000-8000-000000000004','10000000-0000-4000-8000-000000000001','Cozinha','5515000000004','kitchen-token-hash','active',now()+interval '1 hour','5515000000000','admin_direct','reader-hash');

do $$ begin
  begin
    insert into public.gate_sessions(id,gate_label,validator_phone,token_hash,status,expires_at,created_by_admin_phone)
      values ('60000000-0000-4000-8000-000000000099','Check-in','5515000000099','missing-source','active',now()+interval '1 hour','5515000000000');
    raise exception 'new_session_without_source_was_accepted';
  exception when not_null_violation then null; end;
end $$;

select public.lock_authorized_gate_session('60000000-0000-4000-8000-000000000001','gate','temp-token-hash');
do $$ begin
  begin
    perform public.lock_authorized_gate_session('60000000-0000-4000-8000-000000000003','kitchen','admin-token-hash');
    raise exception 'wrong_purpose_was_authorized';
  exception when others then if sqlerrm <> 'gate_session_wrong_purpose' then raise; end if; end;
  begin
    perform public.lock_authorized_gate_session('60000000-0000-4000-8000-000000000003','gate','wrong-token-hash');
    raise exception 'wrong_token_was_authorized';
  exception when others then if sqlerrm <> 'gate_session_token_mismatch' then raise; end if; end;
  begin
    perform public.lock_authorized_gate_session('60000000-0000-4000-8000-000000000004','kitchen','kitchen-token-hash',null,null,'wrong-reader','reader');
    raise exception 'wrong_reader_device_was_authorized';
  exception when others then if sqlerrm <> 'gate_session_device_mismatch' then raise; end if; end;
end $$;
select public.pause_gate_access_and_revoke_sessions('40000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001',null);
do $$ begin
  if (select status from public.gate_sessions where id='60000000-0000-4000-8000-000000000001') <> 'revoked' then raise exception 'temporary_session_not_revoked'; end if;
  if (select status from public.gate_sessions where id='60000000-0000-4000-8000-000000000003') <> 'active' then raise exception 'admin_direct_session_changed'; end if;
end $$;
select public.revoke_fixed_gate_access_and_revoke_sessions('50000000-0000-4000-8000-000000000001','30000000-0000-4000-8000-000000000001','30000000-0000-4000-8000-000000000001');
do $$ begin if (select status from public.gate_sessions where id='60000000-0000-4000-8000-000000000002') <> 'revoked' then raise exception 'fixed_session_not_revoked'; end if; end $$;

insert into public.tickets(id,ticket_code,status,session_id) values
  ('70000000-0000-4000-8000-000000000001','TICKET-A','issued','20000000-0000-4000-8000-000000000001'),
  ('70000000-0000-4000-8000-000000000002','TICKET-B','issued','20000000-0000-4000-8000-000000000002');
do $$ declare r jsonb; begin
  r := public.validate_ticket_entry('70000000-0000-4000-8000-000000000001','TICKET-A','60000000-0000-4000-8000-000000000003','Check-in','admin',jsonb_build_object('source','test','gate_session_token_hash','admin-token-hash'));
  if r->>'result' <> 'allowed' then raise exception 'ticket_not_allowed: %',r; end if;
  r := public.validate_ticket_entry('70000000-0000-4000-8000-000000000001','TICKET-A','60000000-0000-4000-8000-000000000003','Check-in','admin',jsonb_build_object('source','test','gate_session_token_hash','admin-token-hash'));
  if r->>'result' <> 'already_used' then raise exception 'ticket_replay_not_blocked: %',r; end if;
  r := public.validate_ticket_entry('70000000-0000-4000-8000-000000000002','TICKET-B','60000000-0000-4000-8000-000000000003','Check-in','admin',jsonb_build_object('source','test','gate_session_token_hash','admin-token-hash'));
  if r->>'result' <> 'wrong_event' then raise exception 'wrong_event_not_blocked: %',r; end if;
end $$;

insert into public.combo_redemptions(id,combo_order_id,event_id,session_id,redemption_code,offer_name,quantity,status,qr_token_hash,raw_metadata) values
  ('80000000-0000-4000-8000-000000000001','81000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000001','C-1','Combo',1,'issued','combo-hash','{"kitchen_status":"preparing","ready_notified_at":"2026-09-12T10:00:00Z"}');
do $$ declare r jsonb; begin
  r := public.validate_combo_redemption('80000000-0000-4000-8000-000000000001','combo-hash','60000000-0000-4000-8000-000000000004','Cozinha','reader',null,null,jsonb_build_object('source','test','gate_session_token_hash','kitchen-token-hash','kitchen_device_binding_hash','reader-hash'));
  if r->>'result' <> 'allowed' then raise exception 'combo_not_allowed: %',r; end if;
  r := public.validate_combo_redemption('80000000-0000-4000-8000-000000000001','combo-hash','60000000-0000-4000-8000-000000000004','Cozinha','reader',null,null,jsonb_build_object('source','test','gate_session_token_hash','kitchen-token-hash','kitchen_device_binding_hash','reader-hash'));
  if r->>'result' <> 'already_used' then raise exception 'combo_replay_not_blocked: %',r; end if;
end $$;

reset role;

do $$ begin
  if has_function_privilege('anon', 'public.pause_gate_access_and_revoke_sessions(uuid,uuid,uuid)', 'execute')
     or has_function_privilege('authenticated', 'public.pause_gate_access_and_revoke_sessions(uuid,uuid,uuid)', 'execute') then
    raise exception 'pause_rpc_exposed';
  end if;
  if not has_function_privilege('service_role', 'public.pause_gate_access_and_revoke_sessions(uuid,uuid,uuid)', 'execute') then
    raise exception 'service_role_cannot_pause';
  end if;
  if has_function_privilege('anon', 'public.validate_ticket_entry(uuid,text,uuid,text,text,jsonb)', 'execute')
     or has_function_privilege('authenticated', 'public.validate_combo_redemption(uuid,text,uuid,text,text,uuid,uuid,jsonb)', 'execute') then
    raise exception 'protected_rpc_exposed';
  end if;
end $$;
