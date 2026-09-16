import assert from "node:assert/strict";
import { execFile, execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { promisify } from "node:util";
import test from "node:test";

const execFileAsync = promisify(execFile);
const databaseUrl = process.env.DATABASE_URL;

function psql(sql, extraArgs = []) {
  return execFileSync("psql", ["--dbname", databaseUrl, "-X", "-v", "ON_ERROR_STOP=1", ...extraArgs], {
    cwd: process.cwd(), encoding: "utf8", input: sql, stdio: ["pipe", "pipe", "pipe"],
  });
}

async function psqlAsync(sql) {
  const { stdout } = await execFileAsync("psql", ["--dbname", databaseUrl, "-X", "-v", "ON_ERROR_STOP=1", "-At", "-c", sql], { cwd: process.cwd(), encoding: "utf8" });
  return stdout.trim();
}

test("paid combo confirmation, versioned QR and delivery queue are transactional on PostgreSQL 16", async () => {
  assert.ok(databaseUrl, "DATABASE_URL must point to the disposable CI PostgreSQL 16 instance");
  psql("drop schema if exists public cascade; create schema public authorization postgres; grant usage on schema public to public;");
  try {
    const version = Number(psql("show server_version_num;", ["-At"]).trim());
    assert.ok(version >= 160000 && version < 170000);
    const migration = [
      "supabase/migrations/20260915000200_make_paid_combo_delivery_durable.sql",
      "supabase/migrations/20260915000300_make_combo_redemption_codes_collision_safe.sql",
      "supabase/migrations/20260915000400_minimize_combo_redemption_code_sequence_privileges.sql",
      "supabase/migrations/20260915000500_serialize_combo_metadata_transitions.sql",
    ].map((path) => readFileSync(path, "utf8")).join("\n");
    psql(`
      do $roles$ begin
        if not exists(select 1 from pg_roles where rolname='anon') then create role anon; end if;
        if not exists(select 1 from pg_roles where rolname='authenticated') then create role authenticated; end if;
        if not exists(select 1 from pg_roles where rolname='service_role') then create role service_role; end if;
      end $roles$;
      create table public.customers(id uuid primary key, whatsapp_phone text not null);
      create table public.conversations(id uuid primary key, customer_id uuid references public.customers(id));
      create table public.events(id uuid primary key);
      create table public.event_sessions(id uuid primary key, event_id uuid references public.events(id));
      create table public.gate_sessions(id uuid primary key, event_id uuid references public.events(id), session_id uuid references public.event_sessions(id));
      create table public.combo_offers(id uuid primary key, name text not null);
      create table public.combo_orders(
        id uuid primary key, offer_id uuid references public.combo_offers(id), customer_id uuid not null references public.customers(id),
        event_id uuid not null references public.events(id), session_id uuid not null references public.event_sessions(id),
        status text not null, quantity integer not null, total_amount_cents integer not null, paid_at timestamptz
      );
      create table public.combo_payments(
        id uuid primary key default gen_random_uuid(), combo_order_id uuid not null references public.combo_orders(id), provider text not null,
        provider_payment_id text, status text not null, amount_cents integer not null, currency text not null, raw_metadata jsonb not null default '{}'
      );
      create table public.combo_redemptions(
        id uuid primary key default gen_random_uuid(), combo_order_id uuid not null unique references public.combo_orders(id),
        customer_id uuid not null references public.customers(id), event_id uuid not null references public.events(id), session_id uuid not null references public.event_sessions(id),
        offer_name text not null, quantity integer not null, qr_token_hash text not null unique, redemption_code text not null unique,
        status text not null default 'issued', issued_at timestamptz not null default now(), used_at timestamptz, raw_metadata jsonb not null default '{}'
      );
      create table public.combo_redemption_events(
        id uuid primary key default gen_random_uuid(), combo_redemption_id uuid, combo_order_id uuid, kitchen_session_id uuid,
        result text not null, redemption_code text, offer_name text, quantity integer, kitchen_label text,
        validator_identifier text, metadata jsonb not null default '{}', created_at timestamptz not null default now()
      );
      create table public.whatsapp_outbound_deliveries(
        id uuid primary key default gen_random_uuid(), idempotency_key text not null unique, customer_id uuid not null references public.customers(id),
        conversation_id uuid references public.conversations(id), recipient_phone text not null, message_type text not null, reason text not null,
        business_context jsonb not null default '{}', status text not null, attempt_count integer not null default 0,
        provider_message_id text,last_error text,claimed_at timestamptz,sent_at timestamptz,updated_at timestamptz not null default now(),created_at timestamptz not null default now(),
        next_attempt_at timestamptz,lease_expires_at timestamptz,dead_letter_at timestamptz,claim_token uuid
      );
      create function public.mark_whatsapp_outbound_delivery_sent(p_delivery_id uuid,p_claim_token uuid,p_provider_message_id text default null)
      returns setof public.whatsapp_outbound_deliveries language sql security invoker set search_path='' as $fn$
        update public.whatsapp_outbound_deliveries d set status='sent',provider_message_id=p_provider_message_id,last_error=null,lease_expires_at=null,claim_token=null,next_attempt_at=null,sent_at=now(),updated_at=now()
        where d.id=p_delivery_id and d.status='sending' and d.claim_token=p_claim_token returning d.*;
      $fn$;
      create function public.mark_whatsapp_outbound_delivery_failed(p_delivery_id uuid,p_claim_token uuid,p_error text)
      returns setof public.whatsapp_outbound_deliveries language sql security invoker set search_path='' as $fn$
        update public.whatsapp_outbound_deliveries d set
          status=case when d.attempt_count>=5 then 'dead_letter' else 'failed' end,
          last_error=left(coalesce(p_error,'delivery_failed'),1000),lease_expires_at=null,claim_token=null,
          next_attempt_at=case when d.attempt_count>=5 then null else now()+case d.attempt_count when 1 then interval '1 minute' when 2 then interval '5 minutes' when 3 then interval '15 minutes' else interval '1 hour' end end,
          dead_letter_at=case when d.attempt_count>=5 then now() else d.dead_letter_at end,updated_at=now()
        where d.id=p_delivery_id and d.status='sending' and d.claim_token=p_claim_token returning d.*;
      $fn$;
      create function public.lock_authorized_gate_session(p_gate_session_id uuid,p_expected_mode text,p_gate_session_token_hash text,p_event_id uuid,p_session_id uuid,p_kitchen_device_binding_hash text,p_required_kitchen_capability text)
      returns public.gate_sessions language sql security invoker set search_path='' as $fn$
        select g from public.gate_sessions g where g.id=p_gate_session_id for update;
      $fn$;
      insert into public.customers values
        ('10000000-0000-4000-8000-000000000001','5511999990001'),
        ('10000000-0000-4000-8000-000000000002','5511999990002'),
        ('10000000-0000-4000-8000-000000000003','5511999990003'),
        ('10000000-0000-4000-8000-000000000004','5511999990004');
      insert into public.events values ('20000000-0000-4000-8000-000000000001');
      insert into public.event_sessions values ('30000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000001');
      insert into public.gate_sessions values ('31000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000001','30000000-0000-4000-8000-000000000001');
      insert into public.combo_offers values ('40000000-0000-4000-8000-000000000001','Combo');
      insert into public.combo_orders
      select ((case when i=4 then '50000000' else '5000000'||(i-1)::text end)||'-0000-4000-8000-'||lpad(i::text,12,'0'))::uuid,'40000000-0000-4000-8000-000000000001',
        ('10000000-0000-4000-8000-'||lpad(i::text,12,'0'))::uuid,'20000000-0000-4000-8000-000000000001','30000000-0000-4000-8000-000000000001','pending_payment',1,1000,null
      from generate_series(1,4) i;
      insert into public.combo_redemptions(id,combo_order_id,customer_id,event_id,session_id,offer_name,quantity,qr_token_hash,redemption_code,status)
      values ('60000000-0000-4000-8000-000000000099','50000002-0000-4000-8000-000000000003','10000000-0000-4000-8000-000000000003','20000000-0000-4000-8000-000000000001','30000000-0000-4000-8000-000000000001','Legacy',1,'legacy-hash','LEGACY','issued');
      ${migration}
    `);

    psql(`
      do $audit$ declare r jsonb; redemption_id uuid; original_code text; c record; old_token uuid; new_token uuid; i integer; begin
        r:=public.confirm_paid_combo_order('50000000-0000-4000-8000-000000000001','mercado_pago','mp-1',1000,'BRL',now(),'{}','hash-v1',1);
        if r->>'idempotent'<>'false' then raise exception 'new confirmation not reported'; end if;
        redemption_id:=(r->>'redemption_id')::uuid;
        select redemption_code into original_code from public.combo_redemptions where id=redemption_id;
        if (select status from public.combo_orders where id='50000000-0000-4000-8000-000000000001')<>'paid'
          or (select count(*) from public.combo_payments where combo_order_id='50000000-0000-4000-8000-000000000001' and status='approved')<>1
          or (select count(*) from public.combo_redemptions where combo_order_id='50000000-0000-4000-8000-000000000001' and qr_token_version=1 and qr_token_hash='hash-v1')<>1
          or (select count(*) from public.whatsapp_outbound_deliveries where business_context->>'combo_order_id'='50000000-0000-4000-8000-000000000001')<>2
        then raise exception 'atomic aggregate incomplete'; end if;
        r:=public.confirm_paid_combo_order('50000000-0000-4000-8000-000000000001','mercado_pago','mp-1',1000,'BRL',now(),'{}','ignored-on-replay',1);
        if r->>'idempotent'<>'true' or (select redemption_code from public.combo_redemptions where id=redemption_id)<>original_code then raise exception 'same replay changed redemption code'; end if;
        begin perform public.confirm_paid_combo_order('50000000-0000-4000-8000-000000000001','mercado_pago','mp-2',1000,'BRL',now(),'{}','x',1); raise exception 'different id accepted'; exception when raise_exception then if sqlerrm<>'combo_paid_payment_replay_mismatch' then raise; end if; end;
        begin perform public.confirm_paid_combo_order('50000000-0000-4000-8000-000000000001','mercado_pago','mp-1',999,'BRL',now(),'{}','x',1); raise exception 'underpayment accepted'; exception when raise_exception then if sqlerrm<>'combo_payment_amount_mismatch' then raise; end if; end;
        begin perform public.confirm_paid_combo_order('50000000-0000-4000-8000-000000000001','mercado_pago','mp-1',1001,'BRL',now(),'{}','x',1); raise exception 'overpayment accepted'; exception when raise_exception then if sqlerrm<>'combo_payment_amount_mismatch' then raise; end if; end;
        begin perform public.confirm_paid_combo_order('50000000-0000-4000-8000-000000000001','mercado_pago','mp-1',1000,'USD',now(),'{}','x',1); raise exception 'currency accepted'; exception when raise_exception then if sqlerrm<>'combo_payment_currency_mismatch' then raise; end if; end;
        begin insert into public.combo_payments(combo_order_id,provider,provider_payment_id,status,amount_cents,currency) values('50000002-0000-4000-8000-000000000003','mercado_pago','mp-1','pending',1000,'BRL'); raise exception 'duplicate provider payment accepted'; exception when unique_violation then null; end;
        begin insert into public.combo_payments(combo_order_id,provider,provider_payment_id,status,amount_cents,currency) values('50000000-0000-4000-8000-000000000001','mercado_pago','mp-second-approved','approved',1000,'BRL'); raise exception 'second approved payment accepted'; exception when unique_violation then null; end;

        insert into public.whatsapp_outbound_deliveries(idempotency_key,customer_id,recipient_phone,message_type,reason,business_context,status)
        values('paid-combo-order:50000001-0000-4000-8000-000000000002:text:v1','10000000-0000-4000-8000-000000000002','5511999990002','image','wrong','{}','pending');
        begin perform public.confirm_paid_combo_order('50000001-0000-4000-8000-000000000002','mercado_pago','mp-collision',1000,'BRL',now(),'{}','hash',1); raise exception 'collision accepted'; exception when raise_exception then if sqlerrm<>'combo_delivery_intent_collision' then raise; end if; end;
        if (select status from public.combo_orders where id='50000001-0000-4000-8000-000000000002')<>'pending_payment'
          or exists(select 1 from public.combo_payments where combo_order_id='50000001-0000-4000-8000-000000000002')
          or exists(select 1 from public.combo_redemptions where combo_order_id='50000001-0000-4000-8000-000000000002')
        then raise exception 'collision did not roll back'; end if;
        if (select qr_token_version from public.combo_redemptions where id='60000000-0000-4000-8000-000000000099') is not null
          or (select qr_token_hash from public.combo_redemptions where id='60000000-0000-4000-8000-000000000099')<>'legacy-hash'
          or (select redemption_code from public.combo_redemptions where id='60000000-0000-4000-8000-000000000099')<>'LEGACY'
        then raise exception 'legacy redemption changed'; end if;

        update public.whatsapp_outbound_deliveries set status='failed',next_attempt_at=now()+interval '1 hour'
        where reason='paid_combo_delivery' and business_context->>'combo_order_id'='50000000-0000-4000-8000-000000000001';
        if exists(select 1 from public.list_due_paid_combo_delivery_tasks(100) where entity_id='50000000-0000-4000-8000-000000000001' and delivery_kind='paid') then raise exception 'QR bypassed deferred text'; end if;
        update public.whatsapp_outbound_deliveries set status='pending',next_attempt_at=null
        where reason='paid_combo_delivery' and business_context->>'combo_order_id'='50000000-0000-4000-8000-000000000001';
        select * into c from public.claim_whatsapp_outbound_delivery((select id from public.whatsapp_outbound_deliveries where reason='paid_combo_delivery' and business_context->>'combo_order_id'='50000000-0000-4000-8000-000000000001'));
        old_token:=c.claim_token;
        update public.whatsapp_outbound_deliveries set lease_expires_at=now()-interval '1 second' where id=c.id;
        select * into c from public.claim_whatsapp_outbound_delivery(c.id); new_token:=c.claim_token;
        if old_token=new_token then raise exception 'lease did not fence claim'; end if;
        if exists(select 1 from public.mark_whatsapp_outbound_delivery_sent(c.id,old_token,'stale')) then raise exception 'stale claim finalized'; end if;
        for i in 2..5 loop
          perform public.mark_whatsapp_outbound_delivery_failed(c.id,c.claim_token,'retry');
          if i<5 then
            update public.whatsapp_outbound_deliveries set next_attempt_at=now()-interval '1 second' where id=c.id;
            select * into c from public.claim_whatsapp_outbound_delivery(c.id);
          end if;
        end loop;
        if (select status from public.whatsapp_outbound_deliveries where id=c.id)<>'dead_letter'
          or (select dead_letter_at from public.whatsapp_outbound_deliveries where id=c.id) is null
          or exists(select 1 from public.claim_whatsapp_outbound_delivery(c.id))
        then raise exception 'dead letter not reached'; end if;
        if exists(select 1 from public.list_due_paid_combo_delivery_tasks(100) where entity_id='50000000-0000-4000-8000-000000000001' and delivery_kind='paid') then raise exception 'QR bypassed dead-letter text'; end if;

        r:=public.prepare_combo_ready_delivery(redemption_id,1,2,'hash-v2');
        if r->>'qr_token_version'<>'2' or (select count(*) from public.whatsapp_outbound_deliveries where reason in('combo_ready_at_bar','combo_ready_qr') and business_context->>'combo_redemption_id'=redemption_id::text)<>2 then raise exception 'ready rotation incomplete'; end if;
        r:=public.prepare_combo_ready_delivery(redemption_id,1,2,'other-hash');
        if r->>'idempotent'<>'true' or (select qr_token_hash from public.combo_redemptions where id=redemption_id)<>'hash-v2' then raise exception 'ready retry rotated again'; end if;
      end $audit$;
    `);

    const raceOrder = "50000001-0000-4000-8000-000000000002";
    psql("delete from public.whatsapp_outbound_deliveries where idempotency_key='paid-combo-order:50000001-0000-4000-8000-000000000002:text:v1';");
    const calls = await Promise.allSettled([
      psqlAsync(`select public.confirm_paid_combo_order('${raceOrder}','mercado_pago','race-a',1000,'BRL',now(),'{}','race-hash',1);`),
      psqlAsync(`select public.confirm_paid_combo_order('${raceOrder}','mercado_pago','race-b',1000,'BRL',now(),'{}','race-hash',1);`),
    ]);
    assert.equal(calls.filter((x) => x.status === "fulfilled").length, 1);
    assert.equal(calls.filter((x) => x.status === "rejected").length, 1);
    assert.equal(psql(`select count(*) from public.combo_payments where combo_order_id='${raceOrder}' and status='approved';`, ["-At"]).trim(), "1");

    const samePaymentOrder = "50000000-0000-4000-8000-000000000004";
    const samePaymentCalls = await Promise.all([
      psqlAsync(`select public.confirm_paid_combo_order('${samePaymentOrder}','mercado_pago','race-same',1000,'BRL',now(),'{}','same-hash',1);`),
      psqlAsync(`select public.confirm_paid_combo_order('${samePaymentOrder}','mercado_pago','race-same',1000,'BRL',now(),'{}','same-hash',1);`),
    ]);
    assert.equal(samePaymentCalls.filter((result) => result.includes('"idempotent": false')).length, 1);
    assert.equal(samePaymentCalls.filter((result) => result.includes('"idempotent": true')).length, 1);
    assert.equal(psql(`select count(*) from public.combo_payments where combo_order_id='${samePaymentOrder}' and status='approved';`, ["-At"]).trim(), "1");
    assert.equal(samePaymentOrder.slice(0, 8), "50000000");
    const firstCode = psql("select redemption_code from public.combo_redemptions where combo_order_id='50000000-0000-4000-8000-000000000001';", ["-At"]).trim();
    const samePrefixCode = psql(`select redemption_code from public.combo_redemptions where combo_order_id='${samePaymentOrder}';`, ["-At"]).trim();
    assert.match(firstCode, /^CMB-[0-9]{10}$/);
    assert.match(samePrefixCode, /^CMB-[0-9]{10}$/);
    assert.notEqual(firstCode, samePrefixCode);
    assert.equal(psql(`select count(*) from public.combo_orders o join public.combo_payments p on p.combo_order_id=o.id and p.status='approved' join public.combo_redemptions r on r.combo_order_id=o.id and r.status='issued' where o.id in ('50000000-0000-4000-8000-000000000001','${samePaymentOrder}') and o.status='paid';`, ["-At"]).trim(), "2");
    assert.equal(psql(`select count(*) from public.whatsapp_outbound_deliveries where reason in ('paid_combo_delivery','paid_combo_qr_delivery') and business_context->>'combo_order_id' in ('50000000-0000-4000-8000-000000000001','${samePaymentOrder}');`, ["-At"]).trim(), "4");

    const paidQrDelivery = psql(`select id from public.whatsapp_outbound_deliveries where reason='paid_combo_qr_delivery' and business_context->>'combo_order_id'='${samePaymentOrder}';`, ["-At"]).trim();
    const claimCalls = await Promise.all([
      psqlAsync(`select count(*) from public.claim_whatsapp_outbound_delivery('${paidQrDelivery}');`),
      psqlAsync(`select count(*) from public.claim_whatsapp_outbound_delivery('${paidQrDelivery}');`),
    ]);
    assert.deepEqual(claimCalls.sort(), ["0", "1"]);

    const raceRedemption = psql(`select id from public.combo_redemptions where combo_order_id='${raceOrder}';`, ["-At"]).trim();
    const readyCalls = await Promise.all([
      psqlAsync(`select public.prepare_combo_ready_delivery('${raceRedemption}',1,2,'ready-race-hash');`),
      psqlAsync(`select public.prepare_combo_ready_delivery('${raceRedemption}',1,2,'ready-race-hash');`),
    ]);
    assert.equal(readyCalls.filter((result) => result.includes('"idempotent": false')).length, 1);
    assert.equal(readyCalls.filter((result) => result.includes('"idempotent": true')).length, 1);
    assert.equal(psql(`select count(*) from public.whatsapp_outbound_deliveries where reason in ('combo_ready_at_bar','combo_ready_qr') and business_context->>'combo_redemption_id'='${raceRedemption}';`, ["-At"]).trim(), "2");
    assert.equal(psql(`select (coalesce(raw_metadata ? 'ready_notified_at',false))::text||'|'||(public.complete_combo_ready_delivery('${raceRedemption}',2))::text from public.combo_redemptions where id='${raceRedemption}';`, ["-At"]).trim(), "false|false");
    psql(`update public.whatsapp_outbound_deliveries set status='sent' where reason='combo_ready_at_bar' and business_context->>'combo_redemption_id'='${raceRedemption}';`);
    assert.equal(psql(`select public.complete_combo_ready_delivery('${raceRedemption}',2);`, ["-At"]).trim(), "f");
    psql(`update public.whatsapp_outbound_deliveries set status='sent' where reason='combo_ready_qr' and business_context->>'combo_redemption_id'='${raceRedemption}';`);
    assert.equal(psql(`select public.complete_combo_ready_delivery('${raceRedemption}',2);`, ["-At"]).trim(), "t");
    assert.equal(psql(`select raw_metadata ? 'ready_notified_at' from public.combo_redemptions where id='${raceRedemption}';`, ["-At"]).trim(), "t");

    const transitionRedemption = "60000000-0000-4000-8000-000000000099";
    const choiceArgs = `'${transitionRedemption}','10000000-0000-4000-8000-000000000003'`;
    psql(`update public.combo_redemptions set status='issued',used_at=null,raw_metadata='{}' where id='${transitionRedemption}'; delete from public.combo_redemption_events where combo_redemption_id='${transitionRedemption}';`);
    const differentChoices = await Promise.all([
      psqlAsync(`select public.confirm_combo_delivery_choice(${choiceArgs},'table','01','mesa 1');`),
      psqlAsync(`select public.confirm_combo_delivery_choice(${choiceArgs},'waiter','01','mesa 1');`),
    ]);
    assert.equal(differentChoices.filter((result) => result.includes('"applied": true')).length, 1);
    assert.equal(differentChoices.filter((result) => result.includes('"conflict": true')).length, 1);
    assert.equal(psql(`select count(*) from public.combo_redemption_events e join public.combo_redemptions r on r.id=e.combo_redemption_id where r.id='${transitionRedemption}' and e.metadata->>'choice'=r.raw_metadata->>'delivery_choice';`, ["-At"]).trim(), "1");

    psql(`update public.combo_redemptions set raw_metadata='{}' where id='${transitionRedemption}'; delete from public.combo_redemption_events where combo_redemption_id='${transitionRedemption}';`);
    const sameChoices = await Promise.all([
      psqlAsync(`select public.confirm_combo_delivery_choice(${choiceArgs},'table','01','mesa 1');`),
      psqlAsync(`select public.confirm_combo_delivery_choice(${choiceArgs},'table','01','mesa 1');`),
    ]);
    assert.equal(sameChoices.filter((result) => result.includes('"applied": true')).length, 1);
    assert.equal(sameChoices.filter((result) => result.includes('"idempotent": true')).length, 1);
    assert.equal(psql(`select count(*) from public.combo_redemption_events where combo_redemption_id='${transitionRedemption}';`, ["-At"]).trim(), "1");

    psql(`update public.combo_redemptions set raw_metadata='{}' where id='${transitionRedemption}'; delete from public.combo_redemption_events where combo_redemption_id='${transitionRedemption}';`);
    await Promise.all([
      psqlAsync(`select public.confirm_combo_delivery_choice(${choiceArgs},'table','01','mesa 1');`),
      psqlAsync(`select public.start_combo_kitchen_preparation('${transitionRedemption}');`),
    ]);
    assert.equal(psql(`select (raw_metadata->>'delivery_choice')||'|'||(raw_metadata->>'kitchen_status')||'|'||(raw_metadata ? 'preparing_at') from public.combo_redemptions where id='${transitionRedemption}';`, ["-At"]).trim(), "table|preparing|true");

    psql(`update public.combo_redemptions set raw_metadata='{}' where id='${transitionRedemption}'; delete from public.combo_redemption_events where combo_redemption_id='${transitionRedemption}';`);
    await Promise.all([
      psqlAsync(`select public.record_combo_delivery_choice_prompt('${transitionRedemption}','01','mesa 1',true,'31000000-0000-4000-8000-000000000001','Bar','operator');`),
      psqlAsync(`select public.start_combo_kitchen_preparation('${transitionRedemption}');`),
    ]);
    assert.equal(psql(`select (raw_metadata->>'delivery_choice_status')||'|'||(raw_metadata->>'kitchen_status')||'|'||(raw_metadata ? 'preparing_at') from public.combo_redemptions where id='${transitionRedemption}';`, ["-At"]).trim(), "awaiting_customer|preparing|true");

    const currentReadyVersion = Number(psql(`select qr_token_version from public.combo_redemptions where id='${raceRedemption}';`, ["-At"]).trim());
    psql(`update public.combo_redemptions set raw_metadata=jsonb_build_object('kitchen_status','pending') where id='${raceRedemption}';`);
    await Promise.all([
      psqlAsync(`select public.record_combo_delivery_choice_prompt('${raceRedemption}','01','mesa 1',true,'31000000-0000-4000-8000-000000000001','Bar','operator');`),
      psqlAsync(`select public.prepare_combo_ready_delivery('${raceRedemption}',${currentReadyVersion},${currentReadyVersion + 1},'scan-ready-race-hash');`),
    ]);
    assert.equal(psql(`select (raw_metadata->>'delivery_choice_status')||'|'||(raw_metadata->>'ready_delivery_version')||'|'||(raw_metadata ? 'ready_prepared_at') from public.combo_redemptions where id='${raceRedemption}';`, ["-At"]).trim(), `awaiting_customer|${currentReadyVersion + 1}|true`);

    const validationSql = `select public.validate_combo_redemption('${transitionRedemption}','legacy-hash','31000000-0000-4000-8000-000000000001','Bar','operator','20000000-0000-4000-8000-000000000001','30000000-0000-4000-8000-000000000001','{}');`;
    const arrivalSql = `select public.record_combo_gate_arrival('${transitionRedemption}','70000000-0000-4000-8000-000000000001','31000000-0000-4000-8000-000000000001','Portaria','operator',true);`;
    psql(`update public.combo_redemptions set status='issued',used_at=null,raw_metadata=jsonb_build_object('kitchen_status','preparing','ready_notified_at',now()) where id='${transitionRedemption}';`);
    const consumptionFirst = psqlAsync(`begin; ${validationSql} select pg_sleep(0.3); commit;`);
    await new Promise((resolve) => setTimeout(resolve, 50));
    const arrivalAfterConsumption = await psqlAsync(arrivalSql);
    await consumptionFirst;
    assert.match(arrivalAfterConsumption, /status_incompatible/);
    assert.equal(psql(`select status||'|'||(raw_metadata->>'kitchen_status')||'|'||(raw_metadata ? 'last_redemption')||'|'||(raw_metadata ? 'delivered_at')||'|'||(raw_metadata ? 'kitchen_arrived_at') from public.combo_redemptions where id='${transitionRedemption}';`, ["-At"]).trim(), "used|delivered|true|true|false");

    psql(`update public.combo_redemptions set status='issued',used_at=null,raw_metadata=jsonb_build_object('kitchen_status','preparing','ready_notified_at',now()) where id='${transitionRedemption}';`);
    const arrivalFirst = psqlAsync(`begin; ${arrivalSql} select pg_sleep(0.3); commit;`);
    await new Promise((resolve) => setTimeout(resolve, 50));
    const validationAfterArrival = await psqlAsync(validationSql);
    await arrivalFirst;
    assert.match(validationAfterArrival, /"allowed": true/);
    assert.equal(psql(`select status||'|'||(raw_metadata->>'kitchen_status')||'|'||(raw_metadata ? 'last_redemption')||'|'||(raw_metadata ? 'delivered_at')||'|'||(raw_metadata ? 'kitchen_arrived_at') from public.combo_redemptions where id='${transitionRedemption}';`, ["-At"]).trim(), "used|delivered|true|true|true");

    const eventsBeforeRejectedChoice = psql(`select count(*) from public.combo_redemption_events where combo_redemption_id='${transitionRedemption}';`, ["-At"]).trim();
    const rejectedChoice = await psqlAsync(`select public.confirm_combo_delivery_choice(${choiceArgs},'table','01','mesa 1');`);
    assert.match(rejectedChoice, /status_incompatible/);
    assert.equal(psql(`select count(*) from public.combo_redemption_events where combo_redemption_id='${transitionRedemption}';`, ["-At"]).trim(), eventsBeforeRejectedChoice);

    const privileges = psql(`select count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname in ('confirm_paid_combo_order','ensure_paid_combo_delivery_intents','ensure_combo_ready_delivery_intents','prepare_combo_ready_delivery','complete_combo_ready_delivery','list_due_paid_combo_delivery_tasks','get_paid_combo_delivery_queue_counts','claim_whatsapp_outbound_delivery') and has_function_privilege('service_role',p.oid,'execute') and not has_function_privilege('anon',p.oid,'execute') and not has_function_privilege('authenticated',p.oid,'execute') and not has_function_privilege('public',p.oid,'execute') and p.proconfig @> array['search_path=""'];`, ["-At"]).trim();
    assert.equal(privileges, "8");
    const transitionPrivileges = psql(`select count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname in ('confirm_combo_delivery_choice','record_combo_gate_arrival','start_combo_kitchen_preparation','record_combo_delivery_choice_prompt','record_combo_awaiting_preparation','complete_legacy_combo_ready_recovery','validate_combo_redemption') and has_function_privilege('service_role',p.oid,'execute') and not has_function_privilege('anon',p.oid,'execute') and not has_function_privilege('authenticated',p.oid,'execute') and not has_function_privilege('public',p.oid,'execute');`, ["-At"]).trim();
    assert.equal(transitionPrivileges, "7");
    const sequencePrivileges = psql("select has_sequence_privilege('service_role','public.combo_redemption_code_seq','USAGE'),has_sequence_privilege('service_role','public.combo_redemption_code_seq','SELECT'),has_sequence_privilege('service_role','public.combo_redemption_code_seq','UPDATE'),has_sequence_privilege('anon','public.combo_redemption_code_seq','USAGE'),has_sequence_privilege('authenticated','public.combo_redemption_code_seq','USAGE'),has_sequence_privilege('public','public.combo_redemption_code_seq','USAGE');", ["-At"]).trim();
    assert.equal(sequencePrivileges, "t|f|f|f|f|f");

    // Apply the new migration only after the historical assertions above.
    psql("alter table public.conversations add column status text not null default 'open', add column context jsonb not null default '{}', add column last_message_at timestamptz, add column created_at timestamptz not null default now();");
    psql(readFileSync("supabase/migrations/20260915000600_make_combo_operational_notifications_durable.sql", "utf8"));
    psql("update public.combo_orders set status='paid' where id='50000002-0000-4000-8000-000000000003';");
    psql("insert into public.conversations(id,customer_id) values('90000000-0000-4000-8000-000000000003','10000000-0000-4000-8000-000000000003');");
    psql("update public.combo_redemptions set status='issued',used_at=null,raw_metadata='{}' where id='" + transitionRedemption + "'; delete from public.combo_redemption_events where combo_redemption_id='" + transitionRedemption + "';");
    const gateSql = "select public.record_combo_gate_arrival('" + transitionRedemption + "','70000000-0000-4000-8000-000000000001','31000000-0000-4000-8000-000000000001','Portaria','operator',true);";
    const gateResults = await Promise.all([psqlAsync(gateSql),psqlAsync(gateSql)]);
    assert.equal(gateResults.filter((value) => value.includes('"applied": true')).length,1);
    assert.equal(gateResults.filter((value) => value.includes('"idempotent": true')).length,1);
    assert.equal(psql("select count(*) from public.whatsapp_outbound_deliveries where idempotency_key='combo-gate-arrival:" + transitionRedemption + ":text:v1';",["-At"]).trim(),"1");
    assert.equal(psql("select raw_metadata ? 'arrival_preparation_notified_at' from public.combo_redemptions where id='" + transitionRedemption + "';",["-At"]).trim(),"f");

    const promptSql = "select public.record_combo_delivery_choice_prompt('" + transitionRedemption + "','01','mesa 1',false,'31000000-0000-4000-8000-000000000001','Bar','operator');";
    const promptResults = await Promise.all([psqlAsync(promptSql),psqlAsync(promptSql)]);
    assert.equal(promptResults.filter((value) => value.includes('"applied": true')).length,1);
    assert.equal(promptResults.filter((value) => value.includes('"idempotent": true')).length,1);
    assert.equal(psql("select count(*) from public.whatsapp_outbound_deliveries where idempotency_key='combo-delivery-choice:" + transitionRedemption + ":prompt:v1';",["-At"]).trim(),"1");
    assert.equal(psql("select count(*) from public.combo_redemption_events where combo_redemption_id='" + transitionRedemption + "' and metadata->>'reason'='delivery_choice_requested';",["-At"]).trim(),"1");

    const awaitingSql = "select public.record_combo_awaiting_preparation('" + transitionRedemption + "',true,'31000000-0000-4000-8000-000000000001','Bar','operator');";
    const awaitingResults = await Promise.all([psqlAsync(awaitingSql),psqlAsync(awaitingSql)]);
    assert.equal(awaitingResults.filter((value) => value.includes('"applied": true')).length,1);
    assert.equal(awaitingResults.filter((value) => value.includes('"idempotent": true')).length,1);
    assert.equal(psql("select count(*) from public.whatsapp_outbound_deliveries where idempotency_key='combo-awaiting-preparation:" + transitionRedemption + ":text:v1';",["-At"]).trim(),"1");
    assert.equal(psql("select count(*) from public.combo_redemption_events where combo_redemption_id='" + transitionRedemption + "' and metadata->>'reason'='awaiting_preparation';",["-At"]).trim(),"1");
    assert.equal(psql("select raw_metadata ? 'awaiting_preparation_notified_at' from public.combo_redemptions where id='" + transitionRedemption + "';",["-At"]).trim(),"f");

    psql("select public.start_combo_kitchen_preparation('" + transitionRedemption + "');");
    const legacySql = "select public.prepare_legacy_combo_ready_delivery('" + transitionRedemption + "','legacy-ready-hash-v1');";
    const legacyResults = await Promise.all([psqlAsync(legacySql),psqlAsync(legacySql)]);
    assert.equal(legacyResults.filter((value) => value.includes('"idempotent": false')).length,1);
    assert.equal(legacyResults.filter((value) => value.includes('"idempotent": true')).length,1);
    assert.equal(psql("select qr_token_version||'|'||(raw_metadata->>'legacy_ready_upgrade') from public.combo_redemptions where id='" + transitionRedemption + "';",["-At"]).trim(),"1|true");
    assert.equal(psql("select count(*) from public.whatsapp_outbound_deliveries where reason in ('combo_ready_at_bar','combo_ready_qr') and business_context->>'combo_redemption_id'='" + transitionRedemption + "';",["-At"]).trim(),"2");
    assert.equal(psql("select public.ensure_paid_combo_delivery_intents('50000002-0000-4000-8000-000000000003');",["-At"]).trim(),"0");
    assert.equal(psql("select count(*) from public.whatsapp_outbound_deliveries where reason in ('paid_combo_delivery','paid_combo_qr_delivery') and business_context->>'combo_redemption_id'='" + transitionRedemption + "';",["-At"]).trim(),"0");

    const gateId = psql("select id from public.whatsapp_outbound_deliveries where idempotency_key='combo-gate-arrival:" + transitionRedemption + ":text:v1';",["-At"]).trim();
    assert.equal(psql("select count(*) from public.claim_whatsapp_outbound_delivery('" + gateId + "');",["-At"]).trim(),"0");
    assert.equal(psql("select status from public.whatsapp_outbound_deliveries where id='" + gateId + "';",["-At"]).trim(),"superseded");
    const promptId = psql("select id from public.whatsapp_outbound_deliveries where idempotency_key='combo-delivery-choice:" + transitionRedemption + ":prompt:v1';",["-At"]).trim();
    psql("update public.combo_redemptions set raw_metadata=raw_metadata||'{\"delivery_choice_confirmed_at\":\"2026-09-16T00:00:00Z\"}'::jsonb where id='" + transitionRedemption + "';");
    assert.equal(psql("select count(*) from public.claim_whatsapp_outbound_delivery('" + promptId + "');",["-At"]).trim(),"0");
    assert.equal(psql("select status from public.whatsapp_outbound_deliveries where id='" + promptId + "';",["-At"]).trim(),"superseded");
    const awaitingId = psql("select id from public.whatsapp_outbound_deliveries where idempotency_key='combo-awaiting-preparation:" + transitionRedemption + ":text:v1';",["-At"]).trim();
    assert.equal(psql("select count(*) from public.claim_whatsapp_outbound_delivery('" + awaitingId + "');",["-At"]).trim(),"0");
    assert.equal(psql("select status from public.whatsapp_outbound_deliveries where id='" + awaitingId + "';",["-At"]).trim(),"superseded");

    const readyText = psql("select id from public.whatsapp_outbound_deliveries where idempotency_key='combo-ready-redemption:" + transitionRedemption + ":text:v1';",["-At"]).trim();
    const readyQr = psql("select id from public.whatsapp_outbound_deliveries where idempotency_key='combo-ready-redemption:" + transitionRedemption + ":qr:v1';",["-At"]).trim();
    const textClaims = await Promise.all([
      psqlAsync("select count(*) from public.claim_whatsapp_outbound_delivery('" + readyText + "');"),
      psqlAsync("select count(*) from public.claim_whatsapp_outbound_delivery('" + readyText + "');"),
    ]);
    assert.deepEqual(textClaims.sort(),["0","1"]);
    assert.equal(psql("select count(*) from public.claim_whatsapp_outbound_delivery('" + readyQr + "');",["-At"]).trim(),"0");
    const oldToken = psql("select claim_token from public.whatsapp_outbound_deliveries where id='" + readyText + "';",["-At"]).trim();
    psql("update public.whatsapp_outbound_deliveries set lease_expires_at=now()-interval '1 second' where id='" + readyText + "';");
    const newToken = psql("select claim_token from public.claim_whatsapp_outbound_delivery('" + readyText + "');",["-At"]).trim();
    assert.notEqual(newToken,oldToken);
    assert.equal(psql("select count(*) from public.mark_whatsapp_outbound_delivery_sent('" + readyText + "','" + oldToken + "','stale');",["-At"]).trim(),"0");
    assert.equal(psql("select count(*) from public.mark_whatsapp_outbound_delivery_sent('" + readyText + "','" + newToken + "','text');",["-At"]).trim(),"1");
    const qrToken = psql("select claim_token from public.claim_whatsapp_outbound_delivery('" + readyQr + "');",["-At"]).trim();
    assert.ok(qrToken);
    assert.equal(psql("select count(*) from public.mark_whatsapp_outbound_delivery_sent('" + readyQr + "','" + qrToken + "','qr');",["-At"]).trim(),"1");
    assert.equal(psql("select raw_metadata ? 'ready_notified_at' from public.combo_redemptions where id='" + transitionRedemption + "';",["-At"]).trim(),"t");

    const operationalOrder = "50000000-0000-4000-8000-000000000004";
    const operationalRedemption = psql("select id from public.combo_redemptions where combo_order_id='" + operationalOrder + "';",["-At"]).trim();
    psql("update public.whatsapp_outbound_deliveries set status='sent' where reason in ('paid_combo_delivery','paid_combo_qr_delivery') and business_context->>'combo_redemption_id'='" + operationalRedemption + "';");
    psql("insert into public.conversations(id,customer_id) values('90000000-0000-4000-8000-000000000004','10000000-0000-4000-8000-000000000004');");
    psql("update public.combo_redemptions set raw_metadata='{}' where id='" + operationalRedemption + "';");
    const collisionKey = "combo-gate-arrival:" + operationalRedemption + ":text:v1";
    psql("insert into public.whatsapp_outbound_deliveries(idempotency_key,customer_id,recipient_phone,message_type,reason,business_context,status) values('" + collisionKey + "','10000000-0000-4000-8000-000000000004','wrong','image','wrong','{}','pending');");
    await assert.rejects(psqlAsync("select public.record_combo_gate_arrival('" + operationalRedemption + "','70000000-0000-4000-8000-000000000001','31000000-0000-4000-8000-000000000001','Portaria','operator',true);"),/combo_operational_intent_collision/);
    assert.equal(psql("select raw_metadata ? 'kitchen_arrived_at' from public.combo_redemptions where id='" + operationalRedemption + "';",["-At"]).trim(),"f");
    psql("delete from public.whatsapp_outbound_deliveries where idempotency_key='" + collisionKey + "';");
    psql("select public.record_combo_gate_arrival('" + operationalRedemption + "','70000000-0000-4000-8000-000000000001','31000000-0000-4000-8000-000000000001','Portaria','operator',true);");
    const operationalGate = psql("select id from public.whatsapp_outbound_deliveries where idempotency_key='" + collisionKey + "';",["-At"]).trim();
    const gateToken = psql("select claim_token from public.claim_whatsapp_outbound_delivery('" + operationalGate + "');",["-At"]).trim();
    assert.ok(gateToken);
    assert.equal(psql("select raw_metadata ? 'arrival_preparation_notified_at' from public.combo_redemptions where id='" + operationalRedemption + "';",["-At"]).trim(),"f");
    assert.equal(psql("select count(*) from public.mark_whatsapp_outbound_delivery_sent('" + operationalGate + "','" + gateToken + "','gate');",["-At"]).trim(),"1");
    assert.equal(psql("select raw_metadata ? 'arrival_preparation_notified_at' from public.combo_redemptions where id='" + operationalRedemption + "';",["-At"]).trim(),"t");

    psql("select public.record_combo_delivery_choice_prompt('" + operationalRedemption + "','01','mesa 1',false,'31000000-0000-4000-8000-000000000001','Bar','operator');");
    const promptDelivery = psql("select id from public.whatsapp_outbound_deliveries where idempotency_key='combo-delivery-choice:" + operationalRedemption + ":prompt:v1';",["-At"]).trim();
    for (let attempt=1;attempt<=5;attempt+=1) {
      const token = psql("select claim_token from public.claim_whatsapp_outbound_delivery('" + promptDelivery + "');",["-At"]).trim();
      assert.ok(token);
      assert.equal(psql("select context->>'state' from public.conversations where id='90000000-0000-4000-8000-000000000004';",["-At"]).trim(),"combo_delivery_confirming");
      assert.equal(psql("select status from public.mark_whatsapp_outbound_delivery_failed('" + promptDelivery + "','" + token + "','provider_failure');",["-At"]).trim(),attempt===5?"dead_letter":"failed");
      if (attempt<5) psql("update public.whatsapp_outbound_deliveries set next_attempt_at=now()-interval '1 second' where id='" + promptDelivery + "';");
    }
    assert.equal(psql("select context->>'state' from public.conversations where id='90000000-0000-4000-8000-000000000004';",["-At"]).trim(),"idle");
    assert.equal(psql("select context ? 'comboDeliveryConfirmation' from public.conversations where id='90000000-0000-4000-8000-000000000004';",["-At"]).trim(),"f");
    psql("select public.prepare_combo_ready_delivery('" + operationalRedemption + "',1,2,'operational-ready-hash');");
    const afterDeadLetter = psql("select count(*) from public.list_due_paid_combo_delivery_tasks(100) where entity_id='" + operationalRedemption + "' and delivery_kind='ready';",["-At"]).trim();
    assert.equal(afterDeadLetter,"1");
  } finally {
    psql("drop schema if exists public cascade; create schema public authorization postgres; grant usage on schema public to public;");
  }
});
