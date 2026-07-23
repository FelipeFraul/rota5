import { readFileSync } from "node:fs";
import { test } from "node:test";
import assert from "node:assert/strict";

const comboOffers = readFileSync(
  new URL("../src/lib/tickets/services/comboOffers.ts", import.meta.url),
  "utf8",
);
const adminEventsRoute = readFileSync(
  new URL("../src/app/api/admin/events/route.ts", import.meta.url),
  "utf8",
);
const comboOfferApi = readFileSync(
  new URL("../src/app/api/admin/combo-offers/[offerId]/route.ts", import.meta.url),
  "utf8",
);
const adminEditor = readFileSync(
  new URL("../src/app/admin/eventos/AdminEventsEditor.tsx", import.meta.url),
  "utf8",
);
const migration = readFileSync(
  new URL("../supabase/migrations/20260723000400_add_combo_offer_display_priority.sql", import.meta.url),
  "utf8",
);

test("combo offers have an editable delivery priority", () => {
  assert.match(migration, /add column if not exists display_priority integer not null default 1/);
  assert.match(migration, /combo_offer_scopes_event_priority_unique_idx/);
  assert.match(migration, /on public\.combo_offer_scopes\(event_id, display_priority\)/);
  assert.match(adminEventsRoute, /display_priority/);
  assert.match(comboOfferApi, /displayPriority/);
  assert.match(adminEditor, /Prioridade/);
});

test("scheduled combo offers select one offer by paid purchase number within the event", () => {
  assert.match(comboOffers, /getPaidTicketPurchaseNumberForEvent/);
  assert.match(comboOffers, /\.eq\("tickets\.event_sessions\.event_id", eventId\)/);
  assert.match(comboOffers, /uniqueComboOfferCandidateTicketsByOrder/);
  assert.match(comboOffers, /getComboOfferPriorityForEvent\(offer, session\.event_id\) === purchaseNumber/);
  assert.match(comboOffers, /const offer = offers\.find\(/);
  assert.doesNotMatch(comboOffers, /for \(const offer of prioritizedOffers\)/);
  assert.match(comboOffers, /event_purchase_number: purchaseNumber/);
  assert.match(comboOffers, /sourceOrderId: order\.id/);
  assert.match(migration, /combo_orders_source_order_offer_unique_idx/);
});

test("dedupe is by event and only successful WhatsApp sends count as delivered", () => {
  assert.match(comboOffers, /eventId/);
  assert.match(comboOffers, /return `\$\{customerId\}:\$\{eventId\}:\$\{offerId\}`/);
  assert.doesNotMatch(comboOffers, /return `\$\{customerId\}:\$\{sessionId\}:\$\{offerId\}`/);
  assert.match(comboOffers, /contains\("raw_metadata", \{ reason: "combo_offer", send_status: "sent" \}\)/);
  assert.match(comboOffers, /const currentSentKeys = await loadSentComboOfferKeys\(\[ticket\.customer_id\]\)/);
  assert.match(comboOffers, /if \(sendResult\.ok\) \{\s*sentCount \+= 1;/s);
  assert.doesNotMatch(comboOffers, /sentKeys\.add\(dedupeKey\)/);
});

test("priority duplicates are prevented and event priorities are renumbered", () => {
  assert.match(migration, /create unique index combo_offer_scopes_event_priority_unique_idx/);
  assert.match(comboOffers, /renumberEventScopedOfferPriorities/);
  assert.match(comboOffers, /display_priority: 10_000 \+ index/);
  assert.match(comboOffers, /display_priority: nextPriority/);
  assert.match(comboOffers, /getNextEventOfferPriority/);
});

test("extra purchases and near-simultaneous purchases remain safe", () => {
  assert.match(comboOffers, /if \(!offer\) \{\s*skippedCount \+= 1;\s*continue;\s*\}/s);
  assert.match(migration, /combo_offer_event_locks/);
  assert.match(comboOffers, /acquireComboOfferEventLock/);
  assert.match(comboOffers, /releaseComboOfferEventLock/);
  assert.match(comboOffers, /locked_until/);
});

test("scope resolution is deterministic and prevents duplicate effective priorities", () => {
  assert.match(comboOffers, /resolveEffectiveComboOffersForEvent/);
  assert.match(comboOffers, /getComboOfferScopeRankForEvent/);
  assert.match(comboOffers, /scope_type === "event"/);
  assert.match(comboOffers, /scope_type === "weekday"/);
  assert.match(comboOffers, /byPriority/);
});

test("duplicated combo offers remain editable by the admin who duplicated them", () => {
  assert.match(
    comboOfferApi,
    /duplicateComboOffer\(offerId, editable\.auth\.session\.adminUser\.id\)/,
  );
  assert.match(
    comboOffers,
    /export async function duplicateComboOffer\(offerId: string, adminUserId\?: string \| null\)/,
  );
  assert.match(comboOffers, /created_by_admin_user_id: adminUserId \?\? null/);
  assert.match(comboOffers, /select\("scope_type, event_id, weekday, display_priority"\)/);
  assert.match(comboOffers, /getNextEventOfferPriority\(scope\.event_id\)/);
  assert.match(comboOffers, /insertScopesError/);
  assert.match(comboOfferApi, /updateComboOfferScope/);
  assert.match(comboOfferApi, /parseScope/);
  assert.match(adminEditor, /Escopo/);
  assert.match(adminEditor, /scope: comboDraft\.scopeType === "all_events"/);
});
