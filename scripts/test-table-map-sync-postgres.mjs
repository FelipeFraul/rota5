import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import test from "node:test";

const databaseUrl = process.env.DATABASE_URL;

function psql(sql, extraArgs = []) {
  return execFileSync(
    "psql",
    ["--dbname", databaseUrl, "-X", "-v", "ON_ERROR_STOP=1", ...extraArgs],
    {
      cwd: process.cwd(),
      encoding: "utf8",
      input: sql,
      stdio: ["pipe", "pipe", "pipe"],
    },
  );
}

test("table_map.sync_status executes the production PostgreSQL trigger", () => {
  assert.ok(databaseUrl, "DATABASE_URL must point to the disposable CI PostgreSQL instance");

  const serverVersion = Number(psql("show server_version_num;", ["-At"]).trim());
  assert.ok(
    serverVersion >= 160000 && serverVersion < 170000,
    `PostgreSQL 16 is required; server_version_num=${serverVersion}`,
  );

  const migration = readFileSync(
    "supabase/migrations/20260722000800_create_official_table_map_reservations.sql",
    "utf8",
  );
  const triggerStart = migration.indexOf(
    "create or replace function public.sync_official_table_map_reservation_status()",
  );
  assert.notEqual(triggerStart, -1, "production trigger definition is missing from the migration");
  const productionTriggerSql = migration.slice(triggerStart);

  psql(`
    begin;

    do $roles$
    begin
      if not exists (select 1 from pg_roles where rolname = 'anon') then
        create role anon;
      end if;
      if not exists (select 1 from pg_roles where rolname = 'authenticated') then
        create role authenticated;
      end if;
      if not exists (select 1 from pg_roles where rolname = 'service_role') then
        create role service_role;
      end if;
    end
    $roles$;

    create table public.reservations (
      id uuid primary key,
      status text not null
    );

    create table public.official_table_map_reservations (
      reservation_id uuid primary key references public.reservations(id),
      status text not null,
      updated_at timestamptz not null default now()
    );

    ${productionTriggerSql}

    do $trigger_exists$
    begin
      if not exists (
        select 1
        from pg_trigger
        where tgname = 'reservations_sync_official_table_map_status'
          and not tgisinternal
      ) then
        raise exception 'production trigger was not created';
      end if;
    end
    $trigger_exists$;

    insert into public.reservations
    values ('11111111-1111-4111-8111-111111111111', 'active');

    insert into public.official_table_map_reservations
    values ('11111111-1111-4111-8111-111111111111', 'active', now());

    update public.reservations
    set status = 'paid'
    where id = '11111111-1111-4111-8111-111111111111';

    do $paid$
    begin
      if (select status from public.official_table_map_reservations) is distinct from 'paid' then
        raise exception 'paid transition was not synchronized';
      end if;
    end
    $paid$;

    update public.reservations
    set status = 'active'
    where id = '11111111-1111-4111-8111-111111111111';

    do $active$
    begin
      if (select status from public.official_table_map_reservations) is distinct from 'paid' then
        raise exception 'active transition must preserve paid status';
      end if;
    end
    $active$;

    update public.reservations
    set status = 'active'
    where id = '11111111-1111-4111-8111-111111111111';

    do $repeated_active$
    begin
      if (select status from public.official_table_map_reservations) is distinct from 'paid' then
        raise exception 'repeated active transition must remain idempotent';
      end if;
    end
    $repeated_active$;

    update public.reservations
    set status = 'cancelled'
    where id = '11111111-1111-4111-8111-111111111111';

    do $cancelled$
    begin
      if (select status from public.official_table_map_reservations) is distinct from 'cancelled' then
        raise exception 'cancelled transition was not synchronized';
      end if;
    end
    $cancelled$;

    rollback;
  `);
});
