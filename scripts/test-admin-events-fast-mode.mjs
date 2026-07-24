import { readFileSync } from "node:fs";
import assert from "node:assert/strict";
import { test } from "node:test";

const editor = readFileSync(
  new URL("../src/app/admin/eventos/AdminEventsEditor.tsx", import.meta.url),
  "utf8",
);
const eventsRoute = readFileSync(
  new URL("../src/app/api/admin/events/route.ts", import.meta.url),
  "utf8",
);
const adminEvents = readFileSync(
  new URL("../src/lib/tickets/services/adminEvents.ts", import.meta.url),
  "utf8",
);
const comboOffersRoute = readFileSync(
  new URL("../src/app/api/admin/combo-offers/route.ts", import.meta.url),
  "utf8",
);
const comboSection = readFileSync(
  new URL("../src/app/admin/eventos/combo-editor/AdminComboOffersSection.tsx", import.meta.url),
  "utf8",
);

test("admin browser editor uses fast initial events payload", () => {
  assert.match(editor, /params\.set\("fast", "1"\)/);
  assert.match(eventsRoute, /const fast = url\.searchParams\.get\("fast"\) === "1"/);
  assert.match(eventsRoute, /rpc\("list_admin_events_fast"/);
  assert.match(eventsRoute, /if \(fast\) \{/);
  assert.match(eventsRoute, /dashboard: null/);
  assert.match(eventsRoute, /comboOffers: \[\]/);
  assert.match(adminEvents, /includeSalesOverview\?: boolean/);
  assert.match(adminEvents, /input\.includeSalesOverview !== false/);
});

test("fast events path skips operational aggregations", () => {
  const fastBlock = eventsRoute.slice(
    eventsRoute.indexOf("if (fast) {"),
    eventsRoute.indexOf("const auth = await requireAdminEventEditorSession", eventsRoute.indexOf("if (fast) {")),
  );

  assert.doesNotMatch(fastBlock, /listAdminComboOffers/);
  assert.doesNotMatch(fastBlock, /buildGeneralDashboard/);
  assert.doesNotMatch(fastBlock, /combo_orders/);
  assert.doesNotMatch(fastBlock, /whatsapp_messages/);
  assert.doesNotMatch(fastBlock, /listAdminEvents/);
  assert.doesNotMatch(fastBlock, /requireAdminEventEditorSession/);
  assert.match(fastBlock, /decodeAdminWebSessionCookie/);
  assert.match(fastBlock, /list_admin_events_fast/);
  assert.match(adminEvents, /eventIds\.length && includeSalesOverview/);
  assert.match(adminEvents, /fetchAllRows<AdminTicketSalesSeatRow>/);
});

test("fast payload keeps only list fields and empty metrics", () => {
  assert.match(adminEvents, /if \(!includeSalesOverview\) \{/);
  assert.match(adminEvents, /if \(includeOwnership\) \{/);
  assert.match(adminEvents, /id, title, artist_name, city, state, status, image_url, venue_id, created_at, updated_at/);
  assert.match(adminEvents, /event_sessions\(id, event_id, venue_id, starts_at, status, venues\(name\)\)/);
  assert.doesNotMatch(adminEvents, /!includeSalesOverview[\s\S]{0,180}description/);
  assert.match(adminEvents, /ticketSalesOverview,/);
  assert.match(adminEvents, /ticketImpressions: ticketMetrics\.impressions/);
  assert.match(adminEvents, /ticketClicks: ticketMetrics\.clicks/);
});

test("frontend cancels stale list requests and avoids search typing reloads", () => {
  assert.match(editor, /useRef\(0\)/);
  assert.match(editor, /loadEventsAbortRef\.current\?\.abort\(\)/);
  assert.match(editor, /signal: controller\.signal/);
  assert.match(editor, /requestId !== loadEventsRequestRef\.current/);
  assert.match(editor, /const \[appliedSearch, setAppliedSearch\]/);
  assert.match(editor, /setAppliedSearch\(nextSearch\)/);
  assert.doesNotMatch(editor, /onChange=\{\(event\) => \{\s*setSearch\(event\.target\.value\);\s*void loadEvents/s);
});

test("combo offers are lazy loaded outside fast events endpoint", () => {
  assert.match(editor, /useState<AdminViewFilter>\("tickets"\)/);
  assert.match(editor, /<AdminComboOffersSection events=\{events\} visible=\{viewFilter !== "tickets"\} \/>/);
  assert.doesNotMatch(editor, /fetch\("\/api\/admin\/combo-offers"/);
  assert.match(comboSection, /fetch\("\/api\/admin\/combo-offers"/);
  assert.match(comboSection, /void loadComboOffers\(\)/);
  assert.match(comboSection, /loadComboOffersAbortRef\.current\?\.abort\(\)/);
  assert.match(comboOffersRoute, /export async function GET\(\)/);
  assert.match(comboOffersRoute, /from\("combo_offers"\)/);
});
