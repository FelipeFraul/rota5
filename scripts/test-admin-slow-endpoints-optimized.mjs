import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const eventsRoute = readFileSync(
  new URL("../src/app/api/admin/events/route.ts", import.meta.url),
  "utf8",
);
const eventDetailRoute = readFileSync(
  new URL("../src/app/api/admin/events/[eventId]/route.ts", import.meta.url),
  "utf8",
);
const migration = readFileSync(
  new URL("../supabase/migrations/20260723000700_optimize_admin_event_detail_and_dashboard.sql", import.meta.url),
  "utf8",
);

test("event detail GET uses optimized editor payload RPC", () => {
  assert.match(eventDetailRoute, /rpc\("get_admin_event_editor_payload"/);
  assert.doesNotMatch(eventDetailRoute, /loaded\.event\.sessions\.map\(async \(session\)/);
  assert.match(migration, /create or replace function public\.get_admin_event_editor_payload/i);
  assert.match(migration, /from public\.ticket_prices tp\s+join sessions s on s\.id = tp\.session_id/i);
  assert.match(migration, /select distinct ss\.section_id/i);
});

test("general dashboard uses summary RPC without detailed contacts payload", () => {
  const dashboardBlock = eventsRoute.slice(
    eventsRoute.indexOf('url.searchParams.get("generalDashboard") === "1"'),
    eventsRoute.indexOf('url.searchParams.get("contacts") === "1"'),
  );
  assert.match(dashboardBlock, /rpc\("get_admin_general_dashboard_summary"/);
  assert.doesNotMatch(dashboardBlock, /buildGeneralDashboard/);
  assert.match(migration, /create or replace function public\.get_admin_general_dashboard_summary/i);
  assert.doesNotMatch(migration, /'contacts',/i);
  assert.match(eventsRoute, /url\.searchParams\.get\("contacts"\) === "1"/);
});

test("optimized RPCs are locked down to service role", () => {
  assert.match(migration, /security definer/i);
  assert.match(migration, /set search_path = public, pg_temp/i);
  assert.match(migration, /revoke all on function public\.get_admin_event_editor_payload\(uuid\) from public/i);
  assert.match(migration, /grant execute on function public\.get_admin_event_editor_payload\(uuid\) to service_role/i);
  assert.match(migration, /revoke all on function public\.get_admin_general_dashboard_summary\(uuid, boolean\) from public/i);
  assert.match(migration, /grant execute on function public\.get_admin_general_dashboard_summary\(uuid, boolean\) to service_role/i);
});
