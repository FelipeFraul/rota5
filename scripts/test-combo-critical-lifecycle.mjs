import assert from "node:assert/strict";
import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import test from "node:test";
import { loadProductionModule, MemorySupabase } from "./test-support/production-module-harness.mjs";

function comboMocks(db) {
  return {
    createHash, randomBytes, timingSafeEqual, QRCode: {}, createMercadoPagoPayment: async () => ({ ok: false }),
    getEnv: () => ({ APP_BASE_URL: "http://local", CHECKOUT_INTERNAL_SECRET: "secret", MERCADO_PAGO_ACCESS_TOKEN: "fake" }),
    logError: () => {}, logInfo: () => {}, logWarn: () => {}, getSupabaseAdmin: () => db,
    getComboOfferDelayMinutes: () => 10, normalizeWhatsAppPhone: (value) => value,
    generateComboQrImage: async () => Buffer.from("qr"), getOrCreateOpenConversation: async () => ({ ok: true, conversation: { id: "c" } }),
    updateConversationAfterMessage: async () => ({ ok: true }), upsertCustomerFromWhatsApp: async () => ({ ok: true }),
    saveWhatsAppMessage: async () => ({ ok: true }), buildWhatsAppOutboundMetadata: (value) => value,
    centsToDecimalAmount: (v) => v / 100, decimalAmountToCents: (v) => Math.round(Number(v) * 100),
    getPublicEventVisibilityQueryFloorIso: () => "2000-01-01T00:00:00.000Z", getPublicVisibleSessionStatuses: () => [],
    isPublicEventVisible: () => true, PUBLIC_VISIBLE_EVENT_STATUSES: ["published"],
    claimWhatsAppOutboundDelivery: async () => ({ ok: false }), getOrCreateWhatsAppOutboundDelivery: async () => ({ ok: false }),
    markWhatsAppOutboundDeliveryFailed: async () => ({ ok: true }), markWhatsAppOutboundDeliverySent: async () => ({ ok: true }),
    sendZapiImage: async () => ({ ok: true }), sendZapiText: async () => ({ ok: true }),
  };
}

test("combo.scope, combo.activate and combo.delete execute one coherent lifecycle", async () => {
  const db = new MemorySupabase({
    combo_offers: [{ id: "offer-a", status: "paused", send_weekdays: [] }],
    combo_offer_scopes: [{ offer_id: "offer-a", scope_type: "all_events", event_id: null, weekday: null }],
  });
  const service = await loadProductionModule("src/lib/tickets/services/comboOffers.ts", comboMocks(db));

  assert.equal((await service.updateComboOfferScope("offer-a", { scopeType: "event", eventIds: ["event-a", "event-a", "event-b"] })).ok, true);
  assert.deepEqual(
    db.tables.combo_offer_scopes.map((row) => row.event_id).sort(),
    ["event-a", "event-b"],
  );
  assert.equal((await service.updateComboOfferStatus("offer-a", "active")).ok, true);
  assert.equal(db.tables.combo_offers[0].status, "active");
  assert.equal((await service.updateComboOfferStatus("offer-a", "paused")).ok, true);
  assert.equal(db.tables.combo_offers[0].status, "paused");
  assert.equal((await service.updateComboOfferStatus("offer-a", "deleted")).ok, true);
  assert.equal(db.tables.combo_offers[0].status, "deleted");
  assert.equal(db.tables.combo_offers.length, 1);
});

test("combo.expire changes only elapsed pending orders and is repeatable", async () => {
  const db = new MemorySupabase({ combo_orders: [
    { id: "expired", status: "pending_payment", checkout_expires_at: "2020-01-01T00:00:00.000Z" },
    { id: "future", status: "pending_payment", checkout_expires_at: "2099-01-01T00:00:00.000Z" },
    { id: "paid", status: "paid", checkout_expires_at: "2020-01-01T00:00:00.000Z" },
  ] });
  const service = await loadProductionModule("src/lib/tickets/services/comboOffers.ts", comboMocks(db));

  assert.equal(await service.expireComboOrders(), 1);
  assert.equal(db.tables.combo_orders.find((row) => row.id === "expired").status, "expired");
  assert.equal(db.tables.combo_orders.find((row) => row.id === "future").status, "pending_payment");
  assert.equal(db.tables.combo_orders.find((row) => row.id === "paid").status, "paid");
  assert.equal(await service.expireComboOrders(), 0);
});

test("combo.kitchen_release releases linked paid items once and does not notify unrelated items", async () => {
  let notifications = 0;
  let intents = 0;
  const db = new MemorySupabase({
    tickets: [{
      id: "ticket-a", customer_id: "customer-a", session_id: "session-a",
      event_sessions: { event_id: "event-a", starts_at: "2099-01-01T00:00:00.000Z", timezone: "America/Sao_Paulo", status: "sales_open", events: { status: "published" } },
    }],
    combo_redemptions: [
      { id: "redemption-a", combo_order_id: "combo-a", customer_id: "customer-a", event_id: "event-a", session_id: "session-a", status: "issued", redemption_code: "CMB-A", offer_name: "Oferta", quantity: 1, raw_metadata: { delivery_choice: "table", ready_delivery_version: 2 }, customers: { id: "customer-a", whatsapp_phone: "5515999999999" }, combo_orders: { status: "paid" } },
      { id: "redemption-other", combo_order_id: "combo-b", customer_id: "customer-b", event_id: "event-a", session_id: "session-a", status: "issued", redemption_code: "CMB-B", offer_name: "Outra", quantity: 1, raw_metadata: {}, customers: { id: "customer-b", whatsapp_phone: "5515888888888" }, combo_orders: { status: "paid" } },
    ],
  });
  db.rpc = async (name, args) => {
    assert.equal(name, "record_combo_gate_arrival");
    const redemption = db.tables.combo_redemptions.find((row) => row.id === args.p_redemption_id);
    if (!redemption || redemption.status !== "issued") {
      return { data: { applied: false, idempotent: false, reason: "status_incompatible" }, error: null };
    }
    if (typeof redemption.raw_metadata?.kitchen_arrived_at === "string") {
      return { data: { applied: false, idempotent: true, reason: "already_arrived" }, error: null };
    }
    redemption.raw_metadata = {
      ...(redemption.raw_metadata ?? {}),
      kitchen_arrived_at: "2026-09-15T12:00:00.000Z",
      kitchen_visible: true,
    };
    if (args.p_notification_sent) intents += 1;
    return { data: { applied: true, idempotent: false, reason: "applied" }, error: null };
  };
  const service = await loadProductionModule("src/lib/tickets/services/comboRedemptions.ts", {
    createHash, randomBytes, getSupabaseAdmin: () => db, validateGateSessionToken: async () => ({ valid: false }),
    hashGateSessionToken: () => "", hashKitchenDeviceToken: () => "",
    getOrCreateOpenConversation: async () => ({ ok: true, conversation: { id: "conversation-a" } }),
    updateConversationAfterMessage: async () => ({ ok: true }), saveWhatsAppMessage: async () => ({ ok: true }),
    buildWhatsAppOutboundMetadata: (value) => value,
    sendZapiImage: async () => ({ ok: true }), sendZapiText: async () => { notifications += 1; return { ok: true, providerMessageId: "m" }; },
    generateComboQrImage: async () => Buffer.from("qr"), formatComboDescription: () => "",
    getOfficialTableMapPlace: () => null, isPublicEventVisible: () => true,
  });
  const input = { ticketId: "ticket-a", gateSessionId: "gate-session", gateLabel: "Portaria", validatorIdentifier: "validator" };

  assert.deepEqual(await service.releaseComboOrdersForKitchenAfterGateEntry(input), { ok: true, releasedCount: 1 });
  assert.equal(typeof db.tables.combo_redemptions[0].raw_metadata.kitchen_arrived_at, "string");
  assert.equal(db.tables.combo_redemptions[0].raw_metadata.delivery_choice, "table");
  assert.equal(db.tables.combo_redemptions[0].raw_metadata.ready_delivery_version, 2);
  assert.equal(db.tables.combo_redemptions[1].raw_metadata.kitchen_arrived_at, undefined);
  assert.equal(notifications, 0);
  assert.equal(intents, 1);
  assert.deepEqual(await service.releaseComboOrdersForKitchenAfterGateEntry(input), { ok: true, releasedCount: 0 });
  assert.equal(notifications, 0);
  assert.equal(intents, 1);
});
