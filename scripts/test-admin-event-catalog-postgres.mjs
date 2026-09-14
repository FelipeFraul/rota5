import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import test from "node:test";

const databaseUrl = process.env.DATABASE_URL;

function psql(sql, extraArgs = []) {
  return execFileSync("psql", ["--dbname", databaseUrl, "-X", "-v", "ON_ERROR_STOP=1", ...extraArgs], {
    cwd: process.cwd(),
    encoding: "utf8",
    input: sql,
    stdio: ["pipe", "pipe", "pipe"],
  });
}

test("admin event CREATE, UPDATE and DUPLICATE execute the production PostgreSQL transaction boundaries", () => {
  assert.ok(databaseUrl, "DATABASE_URL must point to the disposable CI PostgreSQL 16 instance");
  const serverVersion = Number(psql("show server_version_num;", ["-At"]).trim());
  assert.ok(serverVersion >= 160000 && serverVersion < 170000, `PostgreSQL 16 is required; server_version_num=${serverVersion}`);

  const capacityRpc = readFileSync("supabase/migrations/20260803000100_create_update_admin_section_capacity_rpc.sql", "utf8");
  const mutationRpcs = readFileSync("supabase/migrations/20260914000100_create_admin_event_catalog_rpcs.sql", "utf8");
  const venueRpc = readFileSync("supabase/migrations/20260914000200_create_update_admin_event_venue_rpc.sql", "utf8");
  const locationConsistency = readFileSync("supabase/migrations/20260914000300_enforce_admin_event_location_consistency.sql", "utf8");

  const output = psql(`
    begin;
    create schema if not exists extensions;
    create extension if not exists pgcrypto with schema extensions;
    do $roles$
    begin
      if not exists (select 1 from pg_roles where rolname = 'anon') then create role anon; end if;
      if not exists (select 1 from pg_roles where rolname = 'authenticated') then create role authenticated; end if;
      if not exists (select 1 from pg_roles where rolname = 'service_role') then create role service_role; end if;
    end
    $roles$;

    create table public.admin_users (id uuid primary key default gen_random_uuid());
    create table public.venues (
      id uuid primary key default gen_random_uuid(), name text not null, city text not null,
      state text not null, status text not null default 'active', created_at timestamptz not null default now()
    );
    create table public.venue_sections (
      id uuid primary key default gen_random_uuid(), venue_id uuid not null references public.venues(id),
      name text not null, slug text not null, capacity integer, has_numbered_seats boolean not null default false,
      status text not null default 'active', unique (venue_id, slug)
    );
    create table public.events (
      id uuid primary key default gen_random_uuid(), title text not null, artist_name text not null,
      artist_icon text not null default '🎤', description text, city text not null, state text not null,
      image_url text, venue_id uuid references public.venues(id), status text not null default 'draft',
      created_by_admin_user_id uuid references public.admin_users(id), created_by_admin_phone text
    );
    create table public.event_sessions (
      id uuid primary key default gen_random_uuid(), event_id uuid not null references public.events(id),
      venue_id uuid references public.venues(id), starts_at timestamptz not null, status text not null default 'scheduled'
    );
    create table public.seats (
      id uuid primary key default gen_random_uuid(), venue_id uuid not null references public.venues(id),
      section_id uuid not null references public.venue_sections(id), row_label text, seat_number text not null,
      seat_code text not null, map_x numeric, map_y numeric, status text not null default 'active',
      unique (section_id, seat_code)
    );
    create table public.session_seats (
      id uuid primary key default gen_random_uuid(), session_id uuid not null references public.event_sessions(id),
      seat_id uuid not null references public.seats(id), section_id uuid not null references public.venue_sections(id),
      status text not null default 'available', unique (session_id, seat_id)
    );
    create table public.ticket_prices (
      id uuid primary key default gen_random_uuid(), session_id uuid not null references public.event_sessions(id),
      section_id uuid not null references public.venue_sections(id), ticket_type text not null, label text not null,
      price_cents integer not null, fee_cents integer not null default 0, currency text not null default 'BRL',
      sales_start_at timestamptz, sales_end_at timestamptz, status text not null default 'active',
      unique (session_id, section_id, label)
    );
    create table public.reservations (
      id uuid primary key default gen_random_uuid(), session_id uuid not null references public.event_sessions(id)
    );
    create table public.tickets (
      id uuid primary key default gen_random_uuid(), session_id uuid not null references public.event_sessions(id)
    );
    create table public.courtesy_section_limits (
      event_id uuid not null references public.events(id), section_id uuid not null references public.venue_sections(id),
      label text not null, max_courtesies integer not null, status text not null, primary key (event_id, section_id)
    );

    ${capacityRpc}
    ${mutationRpcs}
    ${venueRpc}
    ${locationConsistency}

    alter table public.ticket_prices add constraint audit_create_failure check (label <> 'FAIL_CREATE');
    alter table public.courtesy_section_limits add constraint audit_update_failure check (label <> 'FAIL_UPDATE');
    create function public.audit_reject_forced_venue_update() returns trigger language plpgsql as $fn$
    begin
      if exists (select 1 from public.venues where id = new.venue_id and name = 'FAIL VENUE') then
        raise check_violation using message = 'forced venue update failure';
      end if;
      return new;
    end
    $fn$;
    create trigger audit_reject_forced_venue_update
      before update of venue_id on public.events
      for each row execute function public.audit_reject_forced_venue_update();

    do $audit$
    declare
      create_payload jsonb;
      duplicate_payload jsonb;
      update_payload jsonb;
      failure_payload jsonb;
      result_one jsonb;
      result_retry jsonb;
      result_second jsonb;
      duplicate_update_payload jsonb;
      source_event_id uuid;
      source_venue_id uuid;
      source_session_id uuid;
      source_section_id uuid;
      source_seat_id uuid;
      source_price_id uuid;
      update_event_id uuid;
      update_venue_id uuid;
      update_session_id uuid;
      update_section_id uuid;
      update_price_id uuid;
      venue_existing_id uuid;
      venue_before_failure_id uuid;
      venue_result jsonb;
      venue_retry jsonb;
      before_source jsonb;
    begin
      create_payload := jsonb_build_object(
        'venue', jsonb_build_object('name', 'ATOMIC CREATE VENUE', 'city', 'Sorocaba', 'state', 'SP', 'reuse_existing', true),
        'event', jsonb_build_object('title', 'ATOMIC CREATE', 'artist_name', 'Artist', 'artist_icon', 'A', 'city', 'Sorocaba', 'state', 'SP', 'status', 'draft'),
        'sessions', jsonb_build_array(jsonb_build_object('key', 's1', 'starts_at', '2099-01-01T20:00:00Z', 'status', 'scheduled')),
        'sections', jsonb_build_array(jsonb_build_object(
          'key', 'sec1', 'name', 'Pista', 'slug', 'pista', 'capacity', 2, 'has_numbered_seats', false, 'status', 'active',
          'prices', jsonb_build_array(jsonb_build_object('session_key', 's1', 'ticket_type', 'full', 'label', 'Inteira', 'price_cents', 5000, 'fee_cents', 500, 'currency', 'BRL', 'status', 'active')),
          'seats', jsonb_build_array(
            jsonb_build_object('seat_number', '1', 'seat_code', 'P-1', 'map_x', 10, 'map_y', 20, 'status', 'active'),
            jsonb_build_object('seat_number', '2', 'seat_code', 'P-2', 'map_x', 30, 'map_y', 20, 'status', 'active')
          )
        ))
      );
      result_one := public.create_admin_event_catalog('10000000-0000-4000-8000-000000000001', 'create', create_payload);
      result_retry := public.create_admin_event_catalog('10000000-0000-4000-8000-000000000001', 'create', create_payload);
      if result_retry->>'eventId' is distinct from result_one->>'eventId' then raise exception 'CREATE_RETRY_IDEMPOTENT failed'; end if;
      begin
        perform public.create_admin_event_catalog(
          '10000000-0000-4000-8000-000000000001',
          'create',
          jsonb_set(create_payload, '{event,title}', '"DIFFERENT PAYLOAD"'::jsonb)
        );
        raise exception 'CREATE payload mismatch did not fail';
      exception
        when raise_exception then
          if sqlerrm <> 'admin_event_operation_payload_mismatch' then raise; end if;
      end;
      if (select count(*) from public.events where title = 'ATOMIC CREATE') <> 1 then raise exception 'CREATE_SUCCESS failed'; end if;
      if (select count(*) from public.session_seats ss join public.event_sessions es on es.id = ss.session_id where es.event_id = (result_one->>'eventId')::uuid) <> 2 then raise exception 'CREATE structure failed'; end if;

      result_second := public.create_admin_event_catalog('10000000-0000-4000-8000-000000000002', 'create', create_payload);
      if result_second->>'eventId' = result_one->>'eventId' then raise exception 'CREATE_NEW_OPERATION failed'; end if;

      failure_payload := jsonb_set(create_payload, '{event,title}', '"ATOMIC CREATE FAILURE"'::jsonb);
      failure_payload := jsonb_set(failure_payload, '{venue,name}', '"ATOMIC CREATE FAILURE VENUE"'::jsonb);
      failure_payload := jsonb_set(failure_payload, '{sections,0,prices,0,label}', '"FAIL_CREATE"'::jsonb);
      begin
        perform public.create_admin_event_catalog('10000000-0000-4000-8000-000000000003', 'create', failure_payload);
        raise exception 'CREATE_FAILURE_ROLLBACK did not fail';
      exception when check_violation then null;
      end;
      if exists (select 1 from public.events where title = 'ATOMIC CREATE FAILURE')
        or exists (select 1 from public.venues where name = 'ATOMIC CREATE FAILURE VENUE')
        or exists (select 1 from public.admin_event_operations where operation_id = '10000000-0000-4000-8000-000000000003')
      then raise exception 'CREATE_FAILURE_ROLLBACK left residue'; end if;

      insert into public.venues (name, city, state) values ('SOURCE VENUE', 'Sorocaba', 'SP') returning id into source_venue_id;
      insert into public.events (title, artist_name, artist_icon, city, state, venue_id, status) values ('SOURCE EVENT', 'SOURCE ARTIST', 'S', 'Sorocaba', 'SP', source_venue_id, 'published') returning id into source_event_id;
      insert into public.event_sessions (event_id, venue_id, starts_at, status) values (source_event_id, source_venue_id, '2099-02-01T20:00:00Z', 'sales_open') returning id into source_session_id;
      insert into public.venue_sections (venue_id, name, slug, capacity, has_numbered_seats) values (source_venue_id, 'VIP', 'vip', 1, true) returning id into source_section_id;
      insert into public.seats (venue_id, section_id, row_label, seat_number, seat_code, map_x, map_y) values (source_venue_id, source_section_id, 'A', '1', 'A01', 11, 22) returning id into source_seat_id;
      insert into public.session_seats (session_id, seat_id, section_id, status) values (source_session_id, source_seat_id, source_section_id, 'available');
      insert into public.ticket_prices (session_id, section_id, ticket_type, label, price_cents, fee_cents) values (source_session_id, source_section_id, 'full', 'VIP', 9000, 900) returning id into source_price_id;
      insert into public.reservations (session_id) values (source_session_id);
      insert into public.tickets (session_id) values (source_session_id);
      select to_jsonb(e) into before_source from public.events e where id = source_event_id;

      duplicate_payload := jsonb_build_object(
        'venue', jsonb_build_object('name', 'SOURCE VENUE', 'city', 'Sorocaba', 'state', 'SP', 'reuse_existing', false),
        'event', jsonb_build_object('title', 'SOURCE EVENT - CÓPIA', 'artist_name', 'SOURCE EVENT - CÓPIA', 'artist_icon', 'S', 'city', 'Sorocaba', 'state', 'SP', 'status', 'draft'),
        'sessions', jsonb_build_array(jsonb_build_object('key', 's1', 'starts_at', '2099-02-01T20:00:00Z', 'status', 'scheduled')),
        'sections', jsonb_build_array(jsonb_build_object(
          'key', 'sec1', 'name', 'VIP', 'slug', 'vip-copia', 'capacity', 1, 'has_numbered_seats', true, 'status', 'active',
          'prices', jsonb_build_array(jsonb_build_object('session_key', 's1', 'ticket_type', 'full', 'label', 'VIP', 'price_cents', 9000, 'fee_cents', 900, 'currency', 'BRL', 'status', 'active')),
          'seats', jsonb_build_array(jsonb_build_object('row_label', 'A', 'seat_number', '1', 'seat_code', 'A01', 'map_x', 11, 'map_y', 22, 'status', 'active'))
        ))
      );
      result_one := public.create_admin_event_catalog('20000000-0000-4000-8000-000000000001', 'duplicate', duplicate_payload);
      result_retry := public.create_admin_event_catalog('20000000-0000-4000-8000-000000000001', 'duplicate', duplicate_payload);
      if result_retry->>'eventId' is distinct from result_one->>'eventId' then raise exception 'DUPLICATE_RETRY_IDEMPOTENT failed'; end if;
      if before_source is distinct from (select to_jsonb(e) from public.events e where id = source_event_id) then raise exception 'SOURCE_EVENT_UNCHANGED failed'; end if;
      if (select status from public.events where id = (result_one->>'eventId')::uuid) <> 'draft' then raise exception 'DUPLICATE_SUCCESS failed'; end if;
      if (select count(*) from public.seats s join public.venue_sections vs on vs.id = s.section_id join public.events e on e.venue_id = vs.venue_id where e.id = (result_one->>'eventId')::uuid and s.map_x = 11 and s.map_y = 22) <> 1 then raise exception 'DUPLICATED_STRUCTURE_PRESERVED failed'; end if;
      if exists (select 1 from public.reservations r join public.event_sessions es on es.id = r.session_id where es.event_id = (result_one->>'eventId')::uuid)
        or exists (select 1 from public.tickets t join public.event_sessions es on es.id = t.session_id where es.event_id = (result_one->>'eventId')::uuid)
      then raise exception 'TRANSACTIONAL_HISTORY_NOT_COPIED failed'; end if;
      duplicate_update_payload := jsonb_build_object(
        'venue', jsonb_build_object('keep_current', true),
        'event', jsonb_build_object(
          'title', 'EDITED DUPLICATE', 'artist_name', 'EDITED ARTIST', 'artist_icon', 'E',
          'city', 'Sorocaba', 'state', 'SP', 'status', 'draft'
        ),
        'sessions', '[]'::jsonb,
        'sections', '[]'::jsonb,
        'new_sections', '[]'::jsonb,
        'prices', '[]'::jsonb,
        'courtesy_limits', '[]'::jsonb
      );
      perform public.update_admin_event_catalog(
        '20000000-0000-4000-8000-000000000004',
        (result_one->>'eventId')::uuid,
        duplicate_update_payload
      );
      if (select title from public.events where id = (result_one->>'eventId')::uuid) <> 'EDITED DUPLICATE'
        or before_source is distinct from (select to_jsonb(e) from public.events e where id = source_event_id)
      then raise exception 'DUPLICATED_EVENT_EDITABLE failed'; end if;
      result_second := public.create_admin_event_catalog('20000000-0000-4000-8000-000000000002', 'duplicate', duplicate_payload);
      if result_second->>'eventId' = result_one->>'eventId' then raise exception 'SECOND_INTENTIONAL_DUPLICATION failed'; end if;

      failure_payload := jsonb_set(duplicate_payload, '{event,title}', '"DUPLICATE FAILURE"'::jsonb);
      failure_payload := jsonb_set(failure_payload, '{venue,name}', '"DUPLICATE FAILURE VENUE"'::jsonb);
      failure_payload := jsonb_set(failure_payload, '{sections,0,prices,0,label}', '"FAIL_CREATE"'::jsonb);
      begin
        perform public.create_admin_event_catalog('20000000-0000-4000-8000-000000000003', 'duplicate', failure_payload);
        raise exception 'DUPLICATE_FAILURE_ROLLBACK did not fail';
      exception when check_violation then null;
      end;
      if exists (select 1 from public.events where title = 'DUPLICATE FAILURE')
        or exists (select 1 from public.venues where name = 'DUPLICATE FAILURE VENUE')
        or exists (select 1 from public.admin_event_operations where operation_id = '20000000-0000-4000-8000-000000000003')
      then raise exception 'DUPLICATE_FAILURE_ROLLBACK left residue'; end if;

      insert into public.venues (name, city, state) values ('UPDATE VENUE', 'Sorocaba', 'SP') returning id into update_venue_id;
      insert into public.events (title, artist_name, artist_icon, city, state, venue_id, status) values ('UPDATE BEFORE', 'ARTIST', 'U', 'Sorocaba', 'SP', update_venue_id, 'published') returning id into update_event_id;
      insert into public.event_sessions (event_id, venue_id, starts_at, status) values (update_event_id, update_venue_id, '2099-03-01T20:00:00Z', 'sales_open') returning id into update_session_id;
      insert into public.venue_sections (venue_id, name, slug, capacity, has_numbered_seats) values (update_venue_id, 'GERAL', 'geral', 0, false) returning id into update_section_id;
      insert into public.ticket_prices (session_id, section_id, ticket_type, label, price_cents, fee_cents) values (update_session_id, update_section_id, 'full', 'GERAL', 1000, 0) returning id into update_price_id;

      update_payload := jsonb_build_object(
        'venue', jsonb_build_object('keep_current', true, 'name', 'UPDATE VENUE', 'city', 'Sorocaba', 'state', 'SP'),
        'event', jsonb_build_object('title', 'UPDATE AFTER', 'artist_name', 'ARTIST 2', 'artist_icon', 'U', 'city', 'Sorocaba', 'state', 'SP', 'status', 'published'),
        'sessions', jsonb_build_array(jsonb_build_object('session_id', update_session_id, 'starts_at', '2099-03-01T20:00:00Z', 'status', 'sales_open')),
        'sections', jsonb_build_array(jsonb_build_object('section_id', update_section_id, 'name', 'GERAL', 'capacity', 0, 'has_numbered_seats', false, 'status', 'active')),
        'new_sections', jsonb_build_array(jsonb_build_object('name', 'NOVA', 'slug', 'nova', 'capacity', 1)),
        'prices', jsonb_build_array(jsonb_build_object('price_id', update_price_id, 'label', 'GERAL', 'price_cents', 2000, 'fee_cents', 100, 'status', 'active')),
        'courtesy_limits', jsonb_build_array(jsonb_build_object('section_id', update_section_id, 'label', 'Cortesia', 'max_courtesies', 2, 'status', 'active'))
      );
      result_one := public.update_admin_event_catalog('30000000-0000-4000-8000-000000000001', update_event_id, update_payload);
      result_retry := public.update_admin_event_catalog('30000000-0000-4000-8000-000000000001', update_event_id, update_payload);
      if result_retry is distinct from result_one then raise exception 'UPDATE_RETRY_IDEMPOTENT failed'; end if;
      if (select title from public.events where id = update_event_id) <> 'UPDATE AFTER'
        or (select price_cents from public.ticket_prices where id = update_price_id) <> 2000
        or (select count(*) from public.venue_sections where venue_id = update_venue_id and name = 'NOVA') <> 1
      then raise exception 'UPDATE_SUCCESS failed'; end if;

      failure_payload := jsonb_set(update_payload, '{event,title}', '"UPDATE MUST ROLLBACK"'::jsonb);
      failure_payload := jsonb_set(failure_payload, '{prices,0,price_cents}', '3000'::jsonb);
      failure_payload := jsonb_set(failure_payload, '{courtesy_limits,0,label}', '"FAIL_UPDATE"'::jsonb);
      begin
        perform public.update_admin_event_catalog('30000000-0000-4000-8000-000000000002', update_event_id, failure_payload);
        raise exception 'UPDATE_FAILURE_ROLLBACK did not fail';
      exception when check_violation then null;
      end;
      if (select title from public.events where id = update_event_id) <> 'UPDATE AFTER'
        or (select artist_name from public.events where id = update_event_id) <> 'ARTIST 2'
        or (select price_cents from public.ticket_prices where id = update_price_id) <> 2000
        or (select status from public.events where id = update_event_id) <> 'published'
        or (select count(*) from public.venue_sections where venue_id = update_venue_id and name = 'NOVA') <> 1
        or (select count(*) from public.seats s join public.venue_sections vs on vs.id = s.section_id where vs.venue_id = update_venue_id) <> 1
        or (select label from public.courtesy_section_limits where event_id = update_event_id and section_id = update_section_id) <> 'Cortesia'
        or exists (select 1 from public.admin_event_operations where operation_id = '30000000-0000-4000-8000-000000000002')
      then raise exception 'UPDATE_PUBLISHED_EVENT_FAILURE rollback failed'; end if;

      insert into public.venues (name, city, state)
      values ('EXISTING VENUE', 'Sorocaba', 'SP') returning id into venue_existing_id;
      venue_result := public.update_admin_event_venue(
        '50000000-0000-4000-8000-000000000001', update_event_id,
        'EXISTING VENUE', 'Sorocaba', 'SP'
      );
      venue_retry := public.update_admin_event_venue(
        '50000000-0000-4000-8000-000000000001', update_event_id,
        'EXISTING VENUE', 'Sorocaba', 'SP'
      );
      if (select venue_id from public.events where id = update_event_id) is distinct from venue_existing_id
        or venue_retry is distinct from venue_result
      then raise exception 'VENUE_UPDATE_EXISTING_OR_RETRY failed'; end if;

      begin
        perform public.update_admin_event_venue(
          '50000000-0000-4000-8000-000000000001', update_event_id,
          'DIFFERENT VENUE', 'Sorocaba', 'SP'
        );
        raise exception 'VENUE_UPDATE payload mismatch did not fail';
      exception
        when raise_exception then
          if sqlerrm <> 'admin_event_operation_payload_mismatch' then raise; end if;
      end;

      venue_result := public.update_admin_event_venue(
        '50000000-0000-4000-8000-000000000002', update_event_id,
        'CREATED VENUE', 'Sorocaba', 'SP'
      );
      if (select count(*) from public.venues where name = 'CREATED VENUE') <> 1
        or (select venue_id from public.events where id = update_event_id) is distinct from (venue_result->>'venueId')::uuid
      then raise exception 'VENUE_UPDATE_CREATE failed'; end if;

      venue_result := public.update_admin_event_venue(
        '50000000-0000-4000-8000-000000000003', update_event_id,
        'SECOND INTENT VENUE', 'Sorocaba', 'SP'
      );
      if (select venue_id from public.events where id = update_event_id) is distinct from (venue_result->>'venueId')::uuid
      then raise exception 'VENUE_UPDATE_NEW_INTENT failed'; end if;

      select venue_id into venue_before_failure_id from public.events where id = update_event_id;
      begin
        perform public.update_admin_event_venue(
          '50000000-0000-4000-8000-000000000004', update_event_id,
          'FAIL VENUE', 'Sorocaba', 'SP'
        );
        raise exception 'VENUE_UPDATE_FORCED_FAILURE did not fail';
      exception when check_violation then null;
      end;
      if (select venue_id from public.events where id = update_event_id) is distinct from venue_before_failure_id
        or exists (select 1 from public.venues where name = 'FAIL VENUE')
        or exists (select 1 from public.admin_event_operations where operation_id = '50000000-0000-4000-8000-000000000004')
      then raise exception 'VENUE_UPDATE_FORCED_FAILURE rollback failed'; end if;

      raise notice 'CREATE_SUCCESS PASS';
      raise notice 'CREATE_FAILURE_ROLLBACK PASS';
      raise notice 'CREATE_RETRY_IDEMPOTENT PASS';
      raise notice 'CREATE_NEW_OPERATION PASS';
      raise notice 'DUPLICATE_SUCCESS PASS';
      raise notice 'SOURCE_EVENT_UNCHANGED PASS';
      raise notice 'DUPLICATED_EVENT_EDITABLE PASS';
      raise notice 'DUPLICATED_STRUCTURE_PRESERVED PASS';
      raise notice 'TRANSACTIONAL_HISTORY_NOT_COPIED PASS';
      raise notice 'DUPLICATE_FAILURE_ROLLBACK PASS';
      raise notice 'DUPLICATE_RETRY_IDEMPOTENT PASS';
      raise notice 'SECOND_INTENTIONAL_DUPLICATION PASS';
      raise notice 'UPDATE_SUCCESS PASS';
      raise notice 'UPDATE_FAILURE_ROLLBACK PASS';
      raise notice 'UPDATE_RETRY_IDEMPOTENT PASS';
      raise notice 'UPDATE_PUBLISHED_EVENT_FAILURE PASS';
      raise notice 'VENUE_UPDATE_EXISTING PASS';
      raise notice 'VENUE_UPDATE_CREATE PASS';
      raise notice 'VENUE_UPDATE_FORCED_FAILURE PASS';
      raise notice 'VENUE_UPDATE_RETRY PASS';
      raise notice 'VENUE_UPDATE_PAYLOAD_MISMATCH PASS';
      raise notice 'VENUE_UPDATE_NEW_INTENT PASS';
    end
    $audit$;

    do $location_audit$
    declare
      venue_a uuid;
      venue_b uuid;
      audit_event_id uuid;
      session_one uuid;
      session_two uuid;
      section_id uuid;
      seat_id uuid;
      payload jsonb;
      first_result jsonb;
      retry_result jsonb;
      before_venue_count integer;
      relation_kind text;
      op_sequence integer := 10;
    begin
      insert into public.venues(name, city, state) values ('LOCATION A', 'Sorocaba', 'SP') returning id into venue_a;
      insert into public.venues(name, city, state) values ('LOCATION B', 'Itu', 'SP') returning id into venue_b;

      insert into public.events(title, artist_name, city, state, venue_id)
      values ('EMPTY LOCATION', 'Artist', 'Sorocaba', 'SP', venue_a) returning id into audit_event_id;
      insert into public.event_sessions(event_id, venue_id, starts_at)
      values (audit_event_id, venue_a, '2099-02-01T20:00:00Z') returning id into session_one;
      insert into public.event_sessions(event_id, venue_id, starts_at)
      values (audit_event_id, venue_a, '2099-02-02T20:00:00Z') returning id into session_two;

      first_result := public.update_admin_event_location(
        '60000000-0000-4000-8000-000000000001', audit_event_id, 'LOCATION B', 'Itu', 'SP'
      );
      if (select e.venue_id from public.events e where e.id = audit_event_id) is distinct from venue_b
        or (select e.city from public.events e where e.id = audit_event_id) <> 'Itu'
        or exists (select 1 from public.event_sessions es where es.event_id = audit_event_id and es.venue_id is distinct from venue_b)
      then raise exception 'SAFE_EMPTY_EVENT_REASSIGNMENT failed'; end if;

      retry_result := public.update_admin_event_location(
        '60000000-0000-4000-8000-000000000001', audit_event_id, 'LOCATION B', 'Itu', 'SP'
      );
      if retry_result is distinct from first_result then raise exception 'LOCATION_RETRY failed'; end if;
      begin
        perform public.update_admin_event_location(
          '60000000-0000-4000-8000-000000000001', audit_event_id, 'LOCATION A', 'Sorocaba', 'SP'
        );
        raise exception 'LOCATION_PAYLOAD_MISMATCH did not fail';
      exception when raise_exception then
        if sqlerrm <> 'admin_event_operation_payload_mismatch' then raise; end if;
      end;

      select count(*) into before_venue_count from public.venues;
      begin
        perform public.update_admin_event_location(
          '60000000-0000-4000-8000-000000000002', audit_event_id, 'FAIL VENUE', 'Itu', 'SP'
        );
        raise exception 'LOCATION_FORCED_FAILURE did not fail';
      exception when check_violation then null;
      end;
      if (select count(*) from public.venues) <> before_venue_count
        or (select e.venue_id from public.events e where e.id = audit_event_id) is distinct from venue_b
        or exists (select 1 from public.event_sessions es where es.event_id = audit_event_id and es.venue_id is distinct from venue_b)
      then raise exception 'LOCATION_FORCED_FAILURE rollback/orphan failed'; end if;

      for relation_kind in select unnest(array['ticket_price','session_seat','reservation','ticket','courtesy']) loop
        insert into public.events(title, artist_name, city, state, venue_id)
        values ('BLOCK ' || relation_kind, 'Artist', 'Sorocaba', 'SP', venue_a) returning id into audit_event_id;
        insert into public.event_sessions(event_id, venue_id, starts_at)
        values (audit_event_id, venue_a, '2099-03-01T20:00:00Z') returning id into session_one;
        insert into public.venue_sections(venue_id, name, slug, capacity)
        values (venue_a, relation_kind, relation_kind || op_sequence, 1) returning id into section_id;
        if relation_kind = 'ticket_price' then
          insert into public.ticket_prices(session_id, section_id, ticket_type, label, price_cents)
          values (session_one, section_id, 'full', 'Full', 1000);
        elsif relation_kind = 'session_seat' then
          insert into public.seats(venue_id, section_id, seat_number, seat_code)
          values (venue_a, section_id, '1', 'S-' || op_sequence) returning id into seat_id;
          insert into public.session_seats(session_id, seat_id, section_id) values (session_one, seat_id, section_id);
        elsif relation_kind = 'reservation' then
          insert into public.reservations(session_id) values (session_one);
        elsif relation_kind = 'ticket' then
          insert into public.tickets(session_id) values (session_one);
        else
          insert into public.courtesy_section_limits(event_id, section_id, label, max_courtesies, status)
          values (audit_event_id, section_id, 'Courtesy', 1, 'active');
        end if;
        begin
          perform public.update_admin_event_location(
            ('60000000-0000-4000-8000-' || lpad(op_sequence::text, 12, '0'))::uuid,
            audit_event_id, 'LOCATION B', 'Itu', 'SP'
          );
          raise exception 'LOCATION_USAGE_BLOCK did not fail for %', relation_kind;
        exception when raise_exception then
          if sqlerrm <> 'admin_event_location_requires_remap' then raise; end if;
        end;
        if (select e.venue_id from public.events e where e.id = audit_event_id) is distinct from venue_a
          or (select es.venue_id from public.event_sessions es where es.id = session_one) is distinct from venue_a
        then raise exception 'LOCATION_USAGE_BLOCK mutated %', relation_kind; end if;
        if relation_kind = 'ticket_price' and not exists (
          select 1 from public.ticket_prices tp
          join public.event_sessions es on es.id = tp.session_id
          join public.venue_sections vs on vs.id = tp.section_id
          where es.event_id = audit_event_id
            and tp.status = 'active'
            and vs.venue_id = coalesce(es.venue_id, venue_a)
        ) then raise exception 'BLOCKED_CHANGE_PRESERVES_AVAILABILITY failed'; end if;
        op_sequence := op_sequence + 1;
      end loop;

      insert into public.events(title, artist_name, city, state, venue_id)
      values ('MULTI VENUE', 'Artist', 'Sorocaba', 'SP', venue_a) returning id into audit_event_id;
      insert into public.event_sessions(event_id, venue_id, starts_at)
      values (audit_event_id, venue_a, '2099-04-01T20:00:00Z') returning id into session_one;
      insert into public.event_sessions(event_id, venue_id, starts_at)
      values (audit_event_id, venue_b, '2099-04-02T20:00:00Z') returning id into session_two;
      payload := jsonb_build_object(
        'venue', jsonb_build_object('keep_current', true, 'name', 'LOCATION A', 'city', 'Sorocaba', 'state', 'SP'),
        'event', jsonb_build_object('title', 'MULTI VENUE EDITED', 'artist_name', 'Artist', 'artist_icon', 'A', 'city', 'Sorocaba', 'state', 'SP', 'status', 'draft'),
        'sessions', jsonb_build_array(
          jsonb_build_object('session_id', session_one, 'starts_at', '2099-04-01T20:00:00Z', 'status', 'scheduled'),
          jsonb_build_object('session_id', session_two, 'starts_at', '2099-04-02T20:00:00Z', 'status', 'scheduled')
        ), 'sections', '[]'::jsonb, 'new_sections', '[]'::jsonb,
        'prices', '[]'::jsonb, 'courtesy_limits', '[]'::jsonb
      );
      perform public.update_admin_event_catalog('60000000-0000-4000-8000-000000000020', audit_event_id, payload);
      if (select es.venue_id from public.event_sessions es where es.id = session_one) is distinct from venue_a
        or (select es.venue_id from public.event_sessions es where es.id = session_two) is distinct from venue_b
      then raise exception 'MULTI_VENUE_SAVE_PRESERVE failed'; end if;
      begin
        perform public.update_admin_event_location(
          '60000000-0000-4000-8000-000000000021', audit_event_id, 'LOCATION B', 'Itu', 'SP'
        );
        raise exception 'MULTI_VENUE_LOCATION_CHANGE did not fail';
      exception when raise_exception then
        if sqlerrm <> 'admin_event_multi_venue_location_change_unsupported' then raise; end if;
      end;

      insert into public.events(title, artist_name, city, state, venue_id)
      values ('CITY ONLY', 'Artist', 'Sorocaba', 'SP', venue_a) returning id into audit_event_id;
      insert into public.event_sessions(event_id, venue_id, starts_at)
      values (audit_event_id, venue_a, '2099-05-01T20:00:00Z');
      perform public.update_admin_event_location(
        '60000000-0000-4000-8000-000000000022', audit_event_id, 'LOCATION A', 'Itu', 'SP'
      );
      if (select e.city from public.events e where e.id = audit_event_id) <> 'Itu'
        or exists (select 1 from public.event_sessions es where es.event_id = audit_event_id and es.venue_id is distinct from (select e.venue_id from public.events e where e.id = audit_event_id))
      then raise exception 'CITY_ONLY_CHANGE failed'; end if;

      insert into public.events(title, artist_name, city, state, venue_id)
      values ('STATE ONLY', 'Artist', 'Sorocaba', 'SP', venue_a) returning id into audit_event_id;
      insert into public.event_sessions(event_id, venue_id, starts_at)
      values (audit_event_id, venue_a, '2099-05-02T20:00:00Z');
      perform public.update_admin_event_location(
        '60000000-0000-4000-8000-000000000023', audit_event_id, 'LOCATION A', 'Sorocaba', 'RJ'
      );
      if (select e.state from public.events e where e.id = audit_event_id) <> 'RJ'
      then raise exception 'STATE_ONLY_CHANGE failed'; end if;

      raise notice 'SAFE_EMPTY_EVENT_REASSIGNMENT PASS';
      raise notice 'EVENT_AND_SESSIONS_UPDATED_ATOMICALLY PASS';
      raise notice 'LOCATION_RETRY_IDEMPOTENT PASS';
      raise notice 'LOCATION_PAYLOAD_MISMATCH PASS';
      raise notice 'VENUE_FAILURE_ROLLBACK PASS';
      raise notice 'ORPHAN_VENUE_AFTER_FAILURE 0';
      raise notice 'CATALOG_CHANGE_BLOCK PASS';
      raise notice 'USAGE_CHANGE_BLOCK PASS';
      raise notice 'BLOCKED_CHANGE_PRESERVES_AVAILABILITY PASS';
      raise notice 'MULTI_VENUE_SAVE_PRESERVES_SESSION_VENUES PASS';
      raise notice 'MULTI_VENUE_LOCATION_CHANGE_BLOCKED PASS';
      raise notice 'CITY_STATE_UNIT_CHANGE PASS';
    end
    $location_audit$;

    do $privileges$
    begin
      if exists (
          select 1
          from pg_proc p, lateral aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) acl
          where p.oid in (
            'public.create_admin_event_catalog(uuid,text,jsonb)'::regprocedure,
            'public.update_admin_event_catalog(uuid,uuid,jsonb)'::regprocedure,
            'public.update_admin_event_venue(uuid,uuid,text,text,text)'::regprocedure
            , 'public.update_admin_event_location(uuid,uuid,text,text,text)'::regprocedure
          ) and acl.grantee = 0 and acl.privilege_type = 'EXECUTE'
        )
        or has_function_privilege('anon', 'public.create_admin_event_catalog(uuid,text,jsonb)', 'EXECUTE')
        or has_function_privilege('authenticated', 'public.create_admin_event_catalog(uuid,text,jsonb)', 'EXECUTE')
        or not has_function_privilege('service_role', 'public.create_admin_event_catalog(uuid,text,jsonb)', 'EXECUTE')
        or has_function_privilege('public', 'public.update_admin_event_catalog(uuid,uuid,jsonb)', 'EXECUTE')
        or has_function_privilege('anon', 'public.update_admin_event_catalog(uuid,uuid,jsonb)', 'EXECUTE')
        or has_function_privilege('authenticated', 'public.update_admin_event_catalog(uuid,uuid,jsonb)', 'EXECUTE')
        or not has_function_privilege('service_role', 'public.update_admin_event_catalog(uuid,uuid,jsonb)', 'EXECUTE')
        or has_function_privilege('public', 'public.update_admin_event_venue(uuid,uuid,text,text,text)', 'EXECUTE')
        or has_function_privilege('anon', 'public.update_admin_event_venue(uuid,uuid,text,text,text)', 'EXECUTE')
        or has_function_privilege('authenticated', 'public.update_admin_event_venue(uuid,uuid,text,text,text)', 'EXECUTE')
        or not has_function_privilege('service_role', 'public.update_admin_event_venue(uuid,uuid,text,text,text)', 'EXECUTE')
        or has_function_privilege('public', 'public.update_admin_event_location(uuid,uuid,text,text,text)', 'EXECUTE')
        or has_function_privilege('anon', 'public.update_admin_event_location(uuid,uuid,text,text,text)', 'EXECUTE')
        or has_function_privilege('authenticated', 'public.update_admin_event_location(uuid,uuid,text,text,text)', 'EXECUTE')
        or not has_function_privilege('service_role', 'public.update_admin_event_location(uuid,uuid,text,text,text)', 'EXECUTE')
        or has_function_privilege('service_role', 'public.update_admin_event_catalog_legacy(uuid,uuid,jsonb)', 'EXECUTE')
        or has_function_privilege('service_role', 'public.admin_event_location_block_reason(uuid)', 'EXECUTE')
      then raise exception 'RPC privilege contract failed'; end if;
      if (select array_to_string(proconfig, ',') from pg_proc where oid = 'public.create_admin_event_catalog(uuid,text,jsonb)'::regprocedure) is distinct from 'search_path=pg_catalog, public'
        or (select array_to_string(proconfig, ',') from pg_proc where oid = 'public.update_admin_event_catalog(uuid,uuid,jsonb)'::regprocedure) is distinct from 'search_path=pg_catalog, public'
        or (select array_to_string(proconfig, ',') from pg_proc where oid = 'public.update_admin_event_venue(uuid,uuid,text,text,text)'::regprocedure) is distinct from 'search_path=pg_catalog, public'
        or (select array_to_string(proconfig, ',') from pg_proc where oid = 'public.update_admin_event_location(uuid,uuid,text,text,text)'::regprocedure) is distinct from 'search_path=pg_catalog, public'
      then raise exception 'RPC search_path contract failed'; end if;
      if not (select prosecdef from pg_proc where oid = 'public.update_admin_event_catalog(uuid,uuid,jsonb)'::regprocedure)
        or not (select prosecdef from pg_proc where oid = 'public.update_admin_event_location(uuid,uuid,text,text,text)'::regprocedure)
        or not exists (
          select 1 from pg_constraint
          where conrelid = 'public.admin_event_operations'::regclass
            and conname = 'admin_event_operations_type_check'
            and pg_get_constraintdef(oid) like '%location_update%'
        )
      then raise exception 'RPC security or operation compatibility contract failed'; end if;
      if has_table_privilege('anon', 'public.admin_event_operations', 'SELECT,INSERT,UPDATE,DELETE')
        or has_table_privilege('authenticated', 'public.admin_event_operations', 'SELECT,INSERT,UPDATE,DELETE')
        or not has_table_privilege('service_role', 'public.admin_event_operations', 'SELECT,INSERT,UPDATE')
        or exists (
          select 1
          from pg_class c, lateral aclexplode(coalesce(c.relacl, acldefault('r', c.relowner))) acl
          where c.oid = 'public.admin_event_operations'::regclass
            and acl.grantee = 0
            and acl.privilege_type in ('SELECT', 'INSERT', 'UPDATE', 'DELETE')
        )
      then raise exception 'operation ledger privilege contract failed'; end if;
    end
    $privileges$;
    rollback;
  `);

  assert.match(output, /ROLLBACK/);
});
