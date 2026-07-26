import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const migration = await readFile(
  new URL("../supabase/migrations/20260725001000_create_admin_intelligence_dashboard_rpc.sql", import.meta.url),
  "utf8",
);
const route = await readFile(
  new URL("../src/app/api/admin/operational-dashboard/route.ts", import.meta.url),
  "utf8",
);
const hook = await readFile(
  new URL("../src/app/admin/operacao/useOperationalDashboard.ts", import.meta.url),
  "utf8",
);
const component = await readFile(
  new URL("../src/app/admin/operacao/OperationalDashboardSection.tsx", import.meta.url),
  "utf8",
);

test("operational dashboard uses one dedicated authenticated RPC endpoint", () => {
  assert.match(migration, /create or replace function public\.get_admin_intelligence_dashboard/i);
  assert.match(route, /requireAdminEventEditorSession\(\)/);
  assert.match(route, /\.rpc\("get_admin_intelligence_dashboard"/);
  assert.doesNotMatch(route, /supabase\.from\(/);
  assert.match(route, /event_forbidden/);
  assert.match(route, /status: result\?\.reason === "event_forbidden" \? 403 : 403/);
});

test("operational dashboard RPC enforces admin scope and factual metric filters", () => {
  assert.match(migration, /v_admin\.role = 'root' or e\.created_by_admin_user_id = v_admin\.id/i);
  assert.match(migration, /p_event_id is not null and v_selected_event_id is null/i);
  assert.match(migration, /p\.status = 'approved'/);
  assert.match(migration, /o\.status = 'paid'/);
  assert.match(migration, /ticket_type <> 'free'/);
  assert.match(migration, /result = 'allowed'/);
  assert.match(migration, /cb\.status = 'paid'/);
  assert.match(migration, /status = 'used'/);
  assert.match(migration, /wm\.direction = 'inbound'/);
});

test("operational dashboard includes required modules and objective alerts", () => {
  for (const key of ["'revenue'", "'tickets'", "'combos'", "'whatsapp'", "'alerts'", "'generatedAt'"]) {
    assert.match(migration, new RegExp(key));
  }
  assert.match(migration, /paid_order_without_ticket/);
  assert.match(migration, /combo_paid_without_qr/);
  assert.match(migration, /participant_qr_pending/);
  assert.match(migration, /payment_events_unprocessed/);
});

test("operational dashboard frontend fetches safely and keeps current visual contract", () => {
  assert.match(hook, /AbortController/);
  assert.match(hook, /inFlightRef/);
  assert.match(hook, /document\.visibilityState === "visible"/);
  assert.match(hook, /30_000/);
  assert.match(component, /const comparisonDays = 30/);
  assert.match(component, /useOperationalDashboard/);
  assert.match(component, /setSelectedEventId/);
  assert.match(component, /A IA ainda não recebeu fatos deste módulo para interpretar/);
  assert.doesNotMatch(component, /Conversão/);
  assert.doesNotMatch(component, /compradores/i);
});
