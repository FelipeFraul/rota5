import { readFileSync } from "node:fs";
import assert from "node:assert/strict";
import { test } from "node:test";

const eventsRoute = readFileSync(
  new URL("../src/app/api/admin/events/route.ts", import.meta.url),
  "utf8",
);
const migration = readFileSync(
  new URL("../supabase/migrations/20260723000600_create_list_admin_events_fast_rpc.sql", import.meta.url),
  "utf8",
);
const ticketMetricsMigration = readFileSync(
  new URL("../supabase/migrations/20260724000100_add_ticket_metrics_to_admin_events_fast_rpc.sql", import.meta.url),
  "utf8",
);
const ticketSalesMetricsMigration = readFileSync(
  new URL("../supabase/migrations/20260724000300_add_ticket_sales_metrics_to_admin_events_fast_rpc.sql", import.meta.url),
  "utf8",
);
const adminAuth = readFileSync(
  new URL("../src/lib/tickets/services/adminAuth.ts", import.meta.url),
  "utf8",
);
const editor = readFileSync(
  new URL("../src/app/admin/eventos/AdminEventsEditor.tsx", import.meta.url),
  "utf8",
);
const comboSection = readFileSync(
  new URL("../src/app/admin/eventos/combo-editor/AdminComboOffersSection.tsx", import.meta.url),
  "utf8",
);

test("fast events endpoint validates signed cookie locally and calls one RPC", () => {
  const fastBlock = eventsRoute.slice(
    eventsRoute.indexOf("if (fast) {"),
    eventsRoute.indexOf("const auth = await requireAdminEventEditorSession", eventsRoute.indexOf("if (fast) {")),
  );

  assert.match(adminAuth, /export function decodeAdminWebSessionCookie/);
  assert.match(adminAuth, /fixedTimeEqual\(signAdminWebSessionPayload\(body, secret\), signature\)/);
  assert.match(fastBlock, /decodeAdminWebSessionCookie/);
  assert.match(fastBlock, /rpc\("list_admin_events_fast"/);
  assert.match(fastBlock, /supabaseOperations: 1/);
  assert.doesNotMatch(fastBlock, /requireAdminEventEditorSession/);
  assert.doesNotMatch(fastBlock, /listAdminEvents/);
});

test("fast events RPC validates session admin status and permission in database", () => {
  assert.match(migration, /security definer/i);
  assert.match(migration, /set search_path = public, pg_temp/i);
  assert.match(migration, /from public\.admin_sessions s/i);
  assert.match(migration, /join public\.admin_users au on au\.id = s\.admin_user_id/i);
  assert.match(migration, /s\.status = 'active'/i);
  assert.match(migration, /s\.expires_at > now\(\)/i);
  assert.match(migration, /coalesce\(s\.metadata ->> 'source', ''\) = 'web'/i);
  assert.match(migration, /au\.status = 'active'/i);
  assert.match(migration, /v_admin_user\.role not in \('root', 'admin'\)/i);
});

test("fast events RPC preserves root and non-root event isolation", () => {
  assert.match(migration, /v_admin_user\.role = 'root' or e\.created_by_admin_user_id = v_admin_user\.id/i);
  assert.match(migration, /v_normalized_status in \('all', 'finished'\) or e\.status = v_normalized_status/i);
  assert.match(migration, /e\.search_text ilike '%' \|\| lower\(v_search\) \|\| '%'/i);
  assert.match(migration, /'eventId', c\.id/);
  assert.match(ticketMetricsMigration, /ticket_metrics as \(/i);
  assert.match(ticketMetricsMigration, /pay\.checkout_url is not null/i);
  assert.match(ticketMetricsMigration, /checkout_click_count/i);
  assert.match(ticketMetricsMigration, /'ticketImpressions', c\.ticket_impressions/);
  assert.match(ticketMetricsMigration, /'ticketClicks', c\.ticket_clicks/);
  assert.match(ticketSalesMetricsMigration, /ticket_sales_metrics as \(/i);
  assert.match(ticketSalesMetricsMigration, /from public\.tickets t/i);
  assert.match(ticketSalesMetricsMigration, /join public\.orders o on o\.id = t\.order_id/i);
  assert.match(ticketSalesMetricsMigration, /o\.status = 'paid'/i);
  assert.match(ticketSalesMetricsMigration, /t\.status <> 'cancelled'/i);
  assert.match(ticketSalesMetricsMigration, /'ticketItemsSold', c\.ticket_items_sold/);
  assert.match(ticketSalesMetricsMigration, /'ticketRevenueCents', c\.ticket_revenue_cents/);
});

test("fast events RPC is not executable publicly", () => {
  assert.match(migration, /revoke all on function public\.list_admin_events_fast\(uuid, uuid, text, text, text\) from public/i);
  assert.match(migration, /revoke all on function public\.list_admin_events_fast\(uuid, uuid, text, text, text\) from anon/i);
  assert.match(migration, /revoke all on function public\.list_admin_events_fast\(uuid, uuid, text, text, text\) from authenticated/i);
  assert.match(migration, /grant execute on function public\.list_admin_events_fast\(uuid, uuid, text, text, text\) to service_role/i);
});

test("combo lazy loading still avoids initial combo requests", () => {
  assert.match(editor, /useState<AdminViewFilter>\("tickets"\)/);
  assert.match(editor, /<AdminComboOffersSection events=\{events\} visible=\{viewFilter !== "tickets"\} \/>/);
  assert.doesNotMatch(editor, /fetch\("\/api\/admin\/combo-offers"/);
  assert.match(comboSection, /fetch\("\/api\/admin\/combo-offers"/);
  assert.match(comboSection, /void loadComboOffers\(\)/);
  assert.match(eventsRoute, /comboOffers: \[\]/);
});
