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
    const migration = readFileSync("supabase/migrations/20260915000200_make_paid_combo_delivery_durable.sql", "utf8");
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
        status text not null default 'issued', raw_metadata jsonb not null default '{}'
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
      insert into public.customers values
        ('10000000-0000-4000-8000-000000000001','5511999990001'),
        ('10000000-0000-4000-8000-000000000002','5511999990002'),
        ('10000000-0000-4000-8000-000000000003','5511999990003'),
        ('10000000-0000-4000-8000-000000000004','5511999990004');
      insert into public.events values ('20000000-0000-4000-8000-000000000001');
      insert into public.event_sessions values ('30000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000001');
      insert into public.combo_offers values ('40000000-0000-4000-8000-000000000001','Combo');
      insert into public.combo_orders
      select ('50000000-0000-4000-8000-'||lpad(i::text,12,'0'))::uuid,'40000000-0000-4000-8000-000000000001',
        ('10000000-0000-4000-8000-'||lpad(i::text,12,'0'))::uuid,'20000000-0000-4000-8000-000000000001','30000000-0000-4000-8000-000000000001','pending_payment',1,1000,null
      from generate_series(1,4) i;
      insert into public.combo_redemptions(id,combo_order_id,customer_id,event_id,session_id,offer_name,quantity,qr_token_hash,redemption_code,status)
      values ('60000000-0000-4000-8000-000000000099','50000000-0000-4000-8000-000000000003','10000000-0000-4000-8000-000000000003','20000000-0000-4000-8000-000000000001','30000000-0000-4000-8000-000000000001','Legacy',1,'legacy-hash','LEGACY','issued');
      ${migration}
    `);

    psql(`
      do $audit$ declare r jsonb; redemption_id uuid; c record; old_token uuid; new_token uuid; i integer; begin
        r:=public.confirm_paid_combo_order('50000000-0000-4000-8000-000000000001','mercado_pago','mp-1',1000,'BRL',now(),'{}','hash-v1',1);
        if r->>'idempotent'<>'false' then raise exception 'new confirmation not reported'; end if;
        redemption_id:=(r->>'redemption_id')::uuid;
        if (select status from public.combo_orders where id='50000000-0000-4000-8000-000000000001')<>'paid'
          or (select count(*) from public.combo_payments where combo_order_id='50000000-0000-4000-8000-000000000001' and status='approved')<>1
          or (select count(*) from public.combo_redemptions where combo_order_id='50000000-0000-4000-8000-000000000001' and qr_token_version=1 and qr_token_hash='hash-v1')<>1
          or (select count(*) from public.whatsapp_outbound_deliveries where business_context->>'combo_order_id'='50000000-0000-4000-8000-000000000001')<>2
        then raise exception 'atomic aggregate incomplete'; end if;
        r:=public.confirm_paid_combo_order('50000000-0000-4000-8000-000000000001','mercado_pago','mp-1',1000,'BRL',now(),'{}','ignored-on-replay',1);
        if r->>'idempotent'<>'true' then raise exception 'same replay not idempotent'; end if;
        begin perform public.confirm_paid_combo_order('50000000-0000-4000-8000-000000000001','mercado_pago','mp-2',1000,'BRL',now(),'{}','x',1); raise exception 'different id accepted'; exception when raise_exception then if sqlerrm<>'combo_paid_payment_replay_mismatch' then raise; end if; end;
        begin perform public.confirm_paid_combo_order('50000000-0000-4000-8000-000000000001','mercado_pago','mp-1',999,'BRL',now(),'{}','x',1); raise exception 'underpayment accepted'; exception when raise_exception then if sqlerrm<>'combo_payment_amount_mismatch' then raise; end if; end;
        begin perform public.confirm_paid_combo_order('50000000-0000-4000-8000-000000000001','mercado_pago','mp-1',1001,'BRL',now(),'{}','x',1); raise exception 'overpayment accepted'; exception when raise_exception then if sqlerrm<>'combo_payment_amount_mismatch' then raise; end if; end;
        begin perform public.confirm_paid_combo_order('50000000-0000-4000-8000-000000000001','mercado_pago','mp-1',1000,'USD',now(),'{}','x',1); raise exception 'currency accepted'; exception when raise_exception then if sqlerrm<>'combo_payment_currency_mismatch' then raise; end if; end;
        begin insert into public.combo_payments(combo_order_id,provider,provider_payment_id,status,amount_cents,currency) values('50000000-0000-4000-8000-000000000003','mercado_pago','mp-1','pending',1000,'BRL'); raise exception 'duplicate provider payment accepted'; exception when unique_violation then null; end;
        begin insert into public.combo_payments(combo_order_id,provider,provider_payment_id,status,amount_cents,currency) values('50000000-0000-4000-8000-000000000001','mercado_pago','mp-second-approved','approved',1000,'BRL'); raise exception 'second approved payment accepted'; exception when unique_violation then null; end;

        insert into public.whatsapp_outbound_deliveries(idempotency_key,customer_id,recipient_phone,message_type,reason,business_context,status)
        values('paid-combo-order:50000000-0000-4000-8000-000000000002:text:v1','10000000-0000-4000-8000-000000000002','5511999990002','image','wrong','{}','pending');
        begin perform public.confirm_paid_combo_order('50000000-0000-4000-8000-000000000002','mercado_pago','mp-collision',1000,'BRL',now(),'{}','hash',1); raise exception 'collision accepted'; exception when raise_exception then if sqlerrm<>'combo_delivery_intent_collision' then raise; end if; end;
        if (select status from public.combo_orders where id='50000000-0000-4000-8000-000000000002')<>'pending_payment'
          or exists(select 1 from public.combo_payments where combo_order_id='50000000-0000-4000-8000-000000000002')
          or exists(select 1 from public.combo_redemptions where combo_order_id='50000000-0000-4000-8000-000000000002')
        then raise exception 'collision did not roll back'; end if;
        if (select qr_token_version from public.combo_redemptions where id='60000000-0000-4000-8000-000000000099') is not null
          or (select qr_token_hash from public.combo_redemptions where id='60000000-0000-4000-8000-000000000099')<>'legacy-hash'
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

    const raceOrder = "50000000-0000-4000-8000-000000000002";
    psql("delete from public.whatsapp_outbound_deliveries where idempotency_key='paid-combo-order:50000000-0000-4000-8000-000000000002:text:v1';");
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

    const privileges = psql(`select count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname in ('confirm_paid_combo_order','ensure_paid_combo_delivery_intents','ensure_combo_ready_delivery_intents','prepare_combo_ready_delivery','complete_combo_ready_delivery','list_due_paid_combo_delivery_tasks','get_paid_combo_delivery_queue_counts','claim_whatsapp_outbound_delivery') and has_function_privilege('service_role',p.oid,'execute') and not has_function_privilege('anon',p.oid,'execute') and not has_function_privilege('authenticated',p.oid,'execute') and not has_function_privilege('public',p.oid,'execute') and p.proconfig @> array['search_path=""'];`, ["-At"]).trim();
    assert.equal(privileges, "8");
  } finally {
    psql("drop schema if exists public cascade; create schema public authorization postgres; grant usage on schema public to public;");
  }
});
