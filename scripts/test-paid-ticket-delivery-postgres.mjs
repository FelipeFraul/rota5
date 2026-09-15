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
  const { stdout } = await execFileAsync(
    "psql",
    ["--dbname", databaseUrl, "-X", "-v", "ON_ERROR_STOP=1", "-At", "-c", sql],
    { cwd: process.cwd(), encoding: "utf8" },
  );
  return stdout.trim();
}

function resetPublicSchema() {
  psql(`
    drop schema if exists public cascade;
    create schema public authorization postgres;
    grant usage on schema public to public;
  `);
}

test("paid ticket delivery migration is atomic, leased, bounded and concurrent on PostgreSQL 16", async () => {
  assert.ok(databaseUrl, "DATABASE_URL must point to the disposable CI PostgreSQL 16 instance");
  resetPublicSchema();

  try {
    const serverVersion = Number(psql("show server_version_num;", ["-At"]).trim());
    assert.ok(serverVersion >= 160000 && serverVersion < 170000, `PostgreSQL 16 is required; server_version_num=${serverVersion}`);

  const originalConfirmMigration = readFileSync("supabase/migrations/20260522000400_create_confirm_paid_ticket_order_rpc.sql", "utf8");
  const outboundTableMigration = readFileSync("supabase/migrations/20260721000100_create_whatsapp_outbound_deliveries.sql", "utf8");
  const outboundHardeningMigration = readFileSync("supabase/migrations/20260722000200_harden_whatsapp_outbound_delivery_rpc.sql", "utf8");
  const hardenedFunctions = readFileSync("supabase/migrations/20260722000400_fully_qualify_hardened_function_references.sql", "utf8");
  const confirmStart = hardenedFunctions.indexOf("CREATE OR REPLACE FUNCTION public.confirm_paid_ticket_order(");
  const confirmEnd = hardenedFunctions.indexOf("CREATE OR REPLACE FUNCTION public.consume_rate_limit", confirmStart);
  assert.notEqual(confirmStart, -1);
  assert.notEqual(confirmEnd, -1);
  const currentConfirmFunction = hardenedFunctions.slice(confirmStart, confirmEnd);
  const durableMigration = readFileSync("supabase/migrations/20260915000100_make_paid_ticket_delivery_durable.sql", "utf8");

  psql(`
    create schema if not exists extensions;
    create extension if not exists pgcrypto with schema extensions;
    do $roles$ begin
      if not exists (select 1 from pg_roles where rolname = 'anon') then create role anon; end if;
      if not exists (select 1 from pg_roles where rolname = 'authenticated') then create role authenticated; end if;
      if not exists (select 1 from pg_roles where rolname = 'service_role') then create role service_role; end if;
    end $roles$;

    create table public.customers (
      id uuid primary key default gen_random_uuid(), whatsapp_phone text not null unique,
      created_at timestamptz not null default now(), updated_at timestamptz not null default now()
    );
    create table public.conversations (id uuid primary key default gen_random_uuid(), customer_id uuid references public.customers(id));
    create table public.events (id uuid primary key default gen_random_uuid());
    create table public.event_sessions (id uuid primary key default gen_random_uuid(), event_id uuid not null references public.events(id));
    create table public.reservations (
      id uuid primary key default gen_random_uuid(), customer_id uuid not null references public.customers(id),
      conversation_id uuid references public.conversations(id), session_id uuid not null references public.event_sessions(id),
      status text not null, expires_at timestamptz not null, created_at timestamptz not null default now(), updated_at timestamptz not null default now()
    );
    create table public.orders (
      id uuid primary key default gen_random_uuid(), reservation_id uuid not null unique references public.reservations(id),
      customer_id uuid not null references public.customers(id), status text not null,
      total_amount_cents integer not null, total_fee_cents integer not null, created_at timestamptz not null default now(), updated_at timestamptz not null default now()
    );
    create table public.payments (
      id uuid primary key default gen_random_uuid(), order_id uuid not null references public.orders(id), provider text not null,
      provider_payment_id text, status text not null, amount_cents integer not null, currency text not null default 'BRL',
      paid_at timestamptz, raw_metadata jsonb not null default '{}'::jsonb,
      created_at timestamptz not null default now(), updated_at timestamptz not null default now()
    );
    create table public.reservation_items (
      id uuid primary key default gen_random_uuid(), reservation_id uuid not null references public.reservations(id),
      session_seat_id uuid not null, seat_id uuid not null, section_id uuid not null, seat_code text not null
    );
    create table public.session_seats (
      id uuid primary key, seat_id uuid not null, section_id uuid not null, status text not null,
      current_reservation_id uuid, sold_ticket_id uuid, updated_at timestamptz not null default now()
    );
    create table public.tickets (
      id uuid primary key default gen_random_uuid(), order_id uuid not null references public.orders(id),
      reservation_item_id uuid not null unique references public.reservation_items(id), customer_id uuid not null references public.customers(id),
      session_id uuid not null references public.event_sessions(id), seat_id uuid not null, section_id uuid not null,
      ticket_code text not null unique, qr_token_hash text not null unique, status text not null,
      issued_at timestamptz not null default now(), created_at timestamptz not null default now(), updated_at timestamptz not null default now()
    );

    ${originalConfirmMigration}
    ${outboundTableMigration}
    ${outboundHardeningMigration}
    ${currentConfirmFunction}
    ${durableMigration}
  `);

  psql(`
    insert into public.customers(id, whatsapp_phone) values
      ('10000000-0000-4000-8000-000000000001', '5511999990001'),
      ('10000000-0000-4000-8000-000000000002', '5511999990002'),
      ('10000000-0000-4000-8000-000000000003', '5511999990003');
    insert into public.events(id) values ('20000000-0000-4000-8000-000000000001');
    insert into public.event_sessions(id, event_id) values
      ('30000000-0000-4000-8000-000000000001', '20000000-0000-4000-8000-000000000001');

    do $fixtures$
    declare i integer; rid uuid; oid uuid; sid uuid; item_id uuid;
    begin
      for i in 1..3 loop
        rid := ('40000000-0000-4000-8000-' || lpad(i::text, 12, '0'))::uuid;
        oid := ('50000000-0000-4000-8000-' || lpad(i::text, 12, '0'))::uuid;
        sid := ('60000000-0000-4000-8000-' || lpad(i::text, 12, '0'))::uuid;
        item_id := ('70000000-0000-4000-8000-' || lpad(i::text, 12, '0'))::uuid;
        insert into public.reservations(id, customer_id, session_id, status, expires_at)
          values (rid, ('10000000-0000-4000-8000-' || lpad(i::text, 12, '0'))::uuid, '30000000-0000-4000-8000-000000000001', 'active', now() + interval '1 day');
        insert into public.orders(id, reservation_id, customer_id, status, total_amount_cents, total_fee_cents)
          values (oid, rid, ('10000000-0000-4000-8000-' || lpad(i::text, 12, '0'))::uuid, 'pending_payment', 1000, 0);
        insert into public.payments(order_id, provider, status, amount_cents)
          values (oid, 'mercado_pago', 'pending', 1000);
        insert into public.session_seats(id, seat_id, section_id, status, current_reservation_id)
          values (sid, ('80000000-0000-4000-8000-' || lpad(i::text, 12, '0'))::uuid, ('90000000-0000-4000-8000-' || lpad(i::text, 12, '0'))::uuid, 'reserved', rid);
        insert into public.reservation_items(id, reservation_id, session_seat_id, seat_id, section_id, seat_code)
          values (item_id, rid, sid, ('80000000-0000-4000-8000-' || lpad(i::text, 12, '0'))::uuid, ('90000000-0000-4000-8000-' || lpad(i::text, 12, '0'))::uuid, 'A' || i);
      end loop;
    end $fixtures$;

    insert into public.session_seats(id, seat_id, section_id, status, current_reservation_id)
    values (
      '60000000-0000-4000-8000-000000000099',
      '80000000-0000-4000-8000-000000000099',
      '90000000-0000-4000-8000-000000000003',
      'reserved',
      '40000000-0000-4000-8000-000000000003'
    );
    insert into public.reservation_items(id, reservation_id, session_seat_id, seat_id, section_id, seat_code)
    values (
      '70000000-0000-4000-8000-000000000099',
      '40000000-0000-4000-8000-000000000003',
      '60000000-0000-4000-8000-000000000099',
      '80000000-0000-4000-8000-000000000099',
      '90000000-0000-4000-8000-000000000003',
      'A99'
    );

    do $audit$
    declare result jsonb;
    begin
      result := public.confirm_paid_ticket_order('50000000-0000-4000-8000-000000000001', 'mercado_pago', 'mp-1', 1000, now(), '{}');
      if result->>'idempotent' <> 'false' then raise exception 'first confirmation was not new'; end if;
      if (select status from public.orders where id = '50000000-0000-4000-8000-000000000001') <> 'paid'
        or (select status from public.reservations where id = '40000000-0000-4000-8000-000000000001') <> 'paid'
        or (select status from public.payments where order_id = '50000000-0000-4000-8000-000000000001' and provider_payment_id = 'mp-1') <> 'approved'
        or (select status from public.session_seats where id = '60000000-0000-4000-8000-000000000001') <> 'sold'
        or (select count(*) from public.tickets where order_id = '50000000-0000-4000-8000-000000000001') <> 1
      then raise exception 'payment/order/reservation/ticket/seat transaction is incomplete'; end if;
      if (select count(*) from public.whatsapp_outbound_deliveries where business_context->>'order_id' = '50000000-0000-4000-8000-000000000001') <> 3 then
        raise exception 'single-ticket intents were not atomic';
      end if;
      if exists (
        select 1 from public.whatsapp_outbound_deliveries
        where business_context->>'order_id' = '50000000-0000-4000-8000-000000000001'
          and (business_context->>'event_id' is null or business_context->>'eventId' is null or business_context->>'session_id' is null)
      ) then raise exception 'delivery projection context is incomplete'; end if;

      result := public.confirm_paid_ticket_order('50000000-0000-4000-8000-000000000001', 'mercado_pago', 'mp-1', 1000, now(), '{}');
      if result->>'idempotent' <> 'true' then raise exception 'same payment replay was not idempotent'; end if;
      if (select count(*) from public.whatsapp_outbound_deliveries where business_context->>'order_id' = '50000000-0000-4000-8000-000000000001') <> 3 then
        raise exception 'same payment replay duplicated intents';
      end if;
      if (select count(*) from public.tickets where order_id = '50000000-0000-4000-8000-000000000001') <> 1 then
        raise exception 'same payment replay duplicated tickets';
      end if;

      begin
        perform public.confirm_paid_ticket_order('50000000-0000-4000-8000-000000000001', 'mercado_pago', 'mp-1', 1001, now(), '{}');
        raise exception 'amount mismatch accepted';
      exception when raise_exception then
        if sqlerrm <> 'payment_replay_amount_mismatch' then raise; end if;
      end;
      begin
        perform public.confirm_paid_ticket_order('50000000-0000-4000-8000-000000000001', 'mercado_pago', 'mp-other', 1000, now(), '{}');
        raise exception 'different payment accepted';
      exception when raise_exception then
        if sqlerrm <> 'order_already_paid_with_different_payment' then raise; end if;
      end;

      insert into public.whatsapp_outbound_deliveries(
        idempotency_key, customer_id, recipient_phone, message_type, reason, business_context, status
      ) values (
        'paid-ticket-order:50000000-0000-4000-8000-000000000002:text:v1',
        '10000000-0000-4000-8000-000000000002', '5511999990002', 'text', 'wrong_reason',
        '{"order_id":"50000000-0000-4000-8000-000000000002"}', 'pending'
      );
      begin
        perform public.confirm_paid_ticket_order('50000000-0000-4000-8000-000000000002', 'mercado_pago', 'mp-2', 1000, now(), '{}');
        raise exception 'semantic collision accepted';
      exception when raise_exception then
        if sqlerrm not like 'paid_ticket_delivery_intent_collision:%' then raise; end if;
      end;
      if (select status from public.orders where id = '50000000-0000-4000-8000-000000000002') <> 'pending_payment'
        or exists (select 1 from public.tickets where order_id = '50000000-0000-4000-8000-000000000002')
        or (select status from public.session_seats where id = '60000000-0000-4000-8000-000000000002') <> 'reserved'
        or exists (select 1 from public.payments where order_id = '50000000-0000-4000-8000-000000000002' and provider_payment_id is not null)
      then raise exception 'collision did not roll back confirmation'; end if;

      perform public.confirm_paid_ticket_order('50000000-0000-4000-8000-000000000003', 'mercado_pago', 'mp-3', 1000, now(), '{}');
      if (select count(*) from public.whatsapp_outbound_deliveries where business_context->>'order_id' = '50000000-0000-4000-8000-000000000003') <> 1
        or (select reason from public.whatsapp_outbound_deliveries where business_context->>'order_id' = '50000000-0000-4000-8000-000000000003') <> 'paid_ticket_delivery_choice'
      then raise exception 'multi-ticket choice intent was not atomic'; end if;
      update public.whatsapp_outbound_deliveries
      set status = 'sending', lease_expires_at = now() + interval '5 minutes', claim_token = gen_random_uuid()
      where idempotency_key = 'paid-ticket-order:50000000-0000-4000-8000-000000000003:delivery-choice:v1';
      begin
        perform public.ensure_paid_ticket_delivery_intents('50000000-0000-4000-8000-000000000003', true);
        raise exception 'active choice lease was stolen';
      exception when raise_exception then
        if sqlerrm <> 'paid_ticket_delivery_choice_in_progress' then raise; end if;
      end;
      if (select count(*) from public.whatsapp_outbound_deliveries where business_context->>'order_id' = '50000000-0000-4000-8000-000000000003') <> 1 then
        raise exception 'full intents were created behind an active choice claim';
      end if;
      update public.whatsapp_outbound_deliveries
      set lease_expires_at = now() - interval '1 second'
      where idempotency_key = 'paid-ticket-order:50000000-0000-4000-8000-000000000003:delivery-choice:v1';
      perform public.ensure_paid_ticket_delivery_intents('50000000-0000-4000-8000-000000000003', true);
      if (select count(*) from public.whatsapp_outbound_deliveries where business_context->>'order_id' = '50000000-0000-4000-8000-000000000003') <> 5 then
        raise exception 'full multi-ticket intents were not persisted together';
      end if;
      if (select status from public.whatsapp_outbound_deliveries where idempotency_key = 'paid-ticket-order:50000000-0000-4000-8000-000000000003:delivery-choice:v1') <> 'superseded' then
        raise exception 'old multi-ticket choice was not superseded';
      end if;
      if (select count(*) from public.claim_whatsapp_outbound_delivery((
        select id from public.whatsapp_outbound_deliveries
        where idempotency_key = 'paid-ticket-order:50000000-0000-4000-8000-000000000003:delivery-choice:v1'
      ))) <> 0 then raise exception 'superseded choice was claimable'; end if;
    end $audit$;

    insert into public.whatsapp_outbound_deliveries(
      idempotency_key, customer_id, recipient_phone, message_type, reason,
      business_context, status, attempt_count, next_attempt_at
    ) values
      ('schedule-a-text', '10000000-0000-4000-8000-000000000001', '5511999990001', 'text', 'paid_ticket_delivery', '{"order_id":"a0000000-0000-4000-8000-000000000001","delivery_order":1}', 'failed', 1, now() + interval '1 hour'),
      ('schedule-a-instruction', '10000000-0000-4000-8000-000000000001', '5511999990001', 'text', 'paid_ticket_qr_instruction', '{"order_id":"a0000000-0000-4000-8000-000000000001","delivery_order":2}', 'pending', 0, null),
      ('schedule-a-qr', '10000000-0000-4000-8000-000000000001', '5511999990001', 'image', 'paid_ticket_qr_delivery', '{"order_id":"a0000000-0000-4000-8000-000000000001","delivery_order":3}', 'pending', 0, null),
      ('schedule-b-text', '10000000-0000-4000-8000-000000000001', '5511999990001', 'text', 'paid_ticket_delivery', '{"order_id":"b0000000-0000-4000-8000-000000000001","delivery_order":1}', 'dead_letter', 5, null),
      ('schedule-b-instruction', '10000000-0000-4000-8000-000000000001', '5511999990001', 'text', 'paid_ticket_qr_instruction', '{"order_id":"b0000000-0000-4000-8000-000000000001","delivery_order":2}', 'pending', 0, null),
      ('schedule-c-text', '10000000-0000-4000-8000-000000000001', '5511999990001', 'text', 'paid_ticket_delivery', '{"order_id":"c0000000-0000-4000-8000-000000000001","delivery_order":1}', 'sent', 1, null),
      ('schedule-c-instruction', '10000000-0000-4000-8000-000000000001', '5511999990001', 'text', 'paid_ticket_qr_instruction', '{"order_id":"c0000000-0000-4000-8000-000000000001","delivery_order":2}', 'failed', 1, now() - interval '1 second'),
      ('schedule-d-text', '10000000-0000-4000-8000-000000000001', '5511999990001', 'text', 'paid_ticket_delivery', '{"order_id":"d0000000-0000-4000-8000-000000000001","delivery_order":1}', 'sent', 1, null),
      ('schedule-d-instruction', '10000000-0000-4000-8000-000000000001', '5511999990001', 'text', 'paid_ticket_qr_instruction', '{"order_id":"d0000000-0000-4000-8000-000000000001","delivery_order":2}', 'sent', 1, null),
      ('schedule-d-qr', '10000000-0000-4000-8000-000000000001', '5511999990001', 'image', 'paid_ticket_qr_delivery', '{"order_id":"d0000000-0000-4000-8000-000000000001","delivery_order":3}', 'failed', 1, now() - interval '1 second'),
      ('schedule-e-text', '10000000-0000-4000-8000-000000000001', '5511999990001', 'text', 'paid_ticket_delivery', '{"order_id":"e0000000-0000-4000-8000-000000000001","delivery_order":1}', 'sent', 1, null),
      ('schedule-e-instruction', '10000000-0000-4000-8000-000000000001', '5511999990001', 'text', 'paid_ticket_qr_instruction', '{"order_id":"e0000000-0000-4000-8000-000000000001","delivery_order":2}', 'sent', 1, null);

    do $scheduling$
    begin
      if exists (select 1 from public.list_due_paid_ticket_delivery_orders(100) where order_id = 'a0000000-0000-4000-8000-000000000001') then
        raise exception 'future-backoff predecessor did not block downstream';
      end if;
      if exists (select 1 from public.list_due_paid_ticket_delivery_orders(100) where order_id = 'b0000000-0000-4000-8000-000000000001') then
        raise exception 'dead-letter predecessor did not block downstream';
      end if;
      if not exists (select 1 from public.list_due_paid_ticket_delivery_orders(100) where order_id = 'c0000000-0000-4000-8000-000000000001') then
        raise exception 'due instruction after sent text was not scheduled';
      end if;
      if not exists (select 1 from public.list_due_paid_ticket_delivery_orders(100) where order_id = 'd0000000-0000-4000-8000-000000000001') then
        raise exception 'due QR after sent predecessors was not scheduled';
      end if;
      if exists (select 1 from public.list_due_paid_ticket_delivery_orders(100) where order_id = 'e0000000-0000-4000-8000-000000000001') then
        raise exception 'fully sent order was scheduled';
      end if;
      update public.whatsapp_outbound_deliveries
      set status = 'sent', next_attempt_at = null
      where idempotency_key = 'schedule-a-text';
      if not exists (select 1 from public.list_due_paid_ticket_delivery_orders(100) where order_id = 'a0000000-0000-4000-8000-000000000001') then
        raise exception 'downstream did not become eligible after predecessor sent';
      end if;
    end $scheduling$;

    insert into public.whatsapp_outbound_deliveries(
      idempotency_key, customer_id, recipient_phone, message_type, reason, business_context,
      status, attempt_count, next_attempt_at, lease_expires_at
    ) values
      ('matrix-pending', '10000000-0000-4000-8000-000000000001', '5511999990001', 'text', 'paid_ticket_delivery', '{"order_id":"50000000-0000-4000-8000-000000000001"}', 'pending', 0, null, null),
      ('matrix-failed-due', '10000000-0000-4000-8000-000000000001', '5511999990001', 'text', 'paid_ticket_delivery', '{"order_id":"50000000-0000-4000-8000-000000000001"}', 'failed', 1, now() - interval '1 second', null),
      ('matrix-failed-future', '10000000-0000-4000-8000-000000000001', '5511999990001', 'text', 'paid_ticket_delivery', '{"order_id":"50000000-0000-4000-8000-000000000001"}', 'failed', 1, now() + interval '1 hour', null),
      ('matrix-sending-expired', '10000000-0000-4000-8000-000000000001', '5511999990001', 'text', 'paid_ticket_delivery', '{"order_id":"50000000-0000-4000-8000-000000000001"}', 'sending', 1, null, now() - interval '1 second'),
      ('matrix-sending-active', '10000000-0000-4000-8000-000000000001', '5511999990001', 'text', 'paid_ticket_delivery', '{"order_id":"50000000-0000-4000-8000-000000000001"}', 'sending', 1, null, now() + interval '1 hour'),
      ('matrix-sent', '10000000-0000-4000-8000-000000000001', '5511999990001', 'text', 'paid_ticket_delivery', '{"order_id":"50000000-0000-4000-8000-000000000001"}', 'sent', 1, null, null),
      ('matrix-dead', '10000000-0000-4000-8000-000000000001', '5511999990001', 'text', 'paid_ticket_delivery', '{"order_id":"50000000-0000-4000-8000-000000000001"}', 'dead_letter', 5, null, null),
      ('matrix-max', '10000000-0000-4000-8000-000000000001', '5511999990001', 'text', 'paid_ticket_delivery', '{"order_id":"50000000-0000-4000-8000-000000000001"}', 'pending', 5, null, null);

    do $matrix$
    declare row_data public.whatsapp_outbound_deliveries%rowtype; old_token uuid;
    begin
      if (select count(*) from public.claim_whatsapp_outbound_delivery((select id from public.whatsapp_outbound_deliveries where idempotency_key='matrix-pending'))) <> 1 then raise exception 'pending not claimed'; end if;
      if (select count(*) from public.claim_whatsapp_outbound_delivery((select id from public.whatsapp_outbound_deliveries where idempotency_key='matrix-failed-due'))) <> 1 then raise exception 'failed due not claimed'; end if;
      if (select count(*) from public.claim_whatsapp_outbound_delivery((select id from public.whatsapp_outbound_deliveries where idempotency_key='matrix-failed-future'))) <> 0 then raise exception 'future claimed'; end if;
      select * into row_data from public.claim_whatsapp_outbound_delivery((select id from public.whatsapp_outbound_deliveries where idempotency_key='matrix-sending-expired'));
      if row_data.claim_token is null then raise exception 'expired lease not reclaimed'; end if;
      old_token := row_data.claim_token;
      if (select count(*) from public.mark_whatsapp_outbound_delivery_sent(row_data.id, gen_random_uuid(), 'wrong')) <> 0 then raise exception 'stale token marked sent'; end if;
      if (select count(*) from public.mark_whatsapp_outbound_delivery_sent(row_data.id, old_token, 'provider-id')) <> 1 then raise exception 'valid token did not mark sent'; end if;
      if (select count(*) from public.claim_whatsapp_outbound_delivery((select id from public.whatsapp_outbound_deliveries where idempotency_key='matrix-sending-active'))) <> 0 then raise exception 'active lease claimed'; end if;
      if (select count(*) from public.claim_whatsapp_outbound_delivery((select id from public.whatsapp_outbound_deliveries where idempotency_key='matrix-sent'))) <> 0 then raise exception 'sent claimed'; end if;
      if (select count(*) from public.claim_whatsapp_outbound_delivery((select id from public.whatsapp_outbound_deliveries where idempotency_key='matrix-dead'))) <> 0 then raise exception 'dead claimed'; end if;
      if (select count(*) from public.claim_whatsapp_outbound_delivery((select id from public.whatsapp_outbound_deliveries where idempotency_key='matrix-max'))) <> 0 then raise exception 'max attempts claimed'; end if;

      update public.whatsapp_outbound_deliveries set status='pending', attempt_count=4 where idempotency_key='matrix-max';
      select * into row_data from public.claim_whatsapp_outbound_delivery((select id from public.whatsapp_outbound_deliveries where idempotency_key='matrix-max'));
      perform public.mark_whatsapp_outbound_delivery_failed(row_data.id, row_data.claim_token, 'final failure');
      if (select status from public.whatsapp_outbound_deliveries where id=row_data.id) <> 'dead_letter' then raise exception 'max failure not dead-lettered'; end if;

      if not has_function_privilege('service_role', 'public.claim_whatsapp_outbound_delivery(uuid)', 'EXECUTE')
        or has_function_privilege('anon', 'public.claim_whatsapp_outbound_delivery(uuid)', 'EXECUTE')
        or has_function_privilege('authenticated', 'public.claim_whatsapp_outbound_delivery(uuid)', 'EXECUTE')
      then raise exception 'claim privileges are unsafe'; end if;
      if not has_table_privilege('service_role', 'public.whatsapp_outbound_deliveries', 'SELECT,INSERT,UPDATE,DELETE')
        or has_table_privilege('anon', 'public.whatsapp_outbound_deliveries', 'SELECT')
      then raise exception 'table privileges are unsafe'; end if;
      if exists (
        select 1
        from pg_proc p
        join pg_namespace n on n.oid = p.pronamespace
        where n.nspname = 'public'
          and p.proname in (
            'confirm_paid_ticket_order',
            'ensure_paid_ticket_delivery_intents',
            'claim_whatsapp_outbound_delivery',
            'mark_whatsapp_outbound_delivery_sent',
            'mark_whatsapp_outbound_delivery_failed',
            'list_due_paid_ticket_delivery_orders',
            'get_paid_ticket_delivery_queue_counts'
          )
          and not (coalesce(p.proconfig, array[]::text[]) @> array['search_path=""'])
      ) then raise exception 'durable delivery function has unsafe search_path'; end if;
    end $matrix$;

    insert into public.whatsapp_outbound_deliveries(
      idempotency_key, customer_id, recipient_phone, message_type, reason, business_context, status
    ) values (
      'matrix-concurrent', '10000000-0000-4000-8000-000000000001', '5511999990001', 'text',
      'paid_ticket_delivery', '{"order_id":"50000000-0000-4000-8000-000000000001"}', 'pending'
    );
  `);

  const concurrencySql = `select count(*) from public.claim_whatsapp_outbound_delivery((select id from public.whatsapp_outbound_deliveries where idempotency_key='matrix-concurrent'));`;
  const results = await Promise.all([psqlAsync(concurrencySql), psqlAsync(concurrencySql)]);
    assert.deepEqual(results.map(Number).sort(), [0, 1], "exactly one concurrent claimant must win");
  } finally {
    resetPublicSchema();
  }
});
