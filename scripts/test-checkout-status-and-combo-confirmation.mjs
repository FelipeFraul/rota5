import assert from "node:assert/strict";
import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import test from "node:test";
import { loadProductionModule, MemorySupabase } from "./test-support/production-module-harness.mjs";

const future = "2099-01-01T12:00:00.000Z";
const secret = "checkout-test-secret";

function checkoutMocks(db, overrides = {}) {
  return {
    createHash, createHmac, timingSafeEqual,
    createMercadoPagoPayment: async () => ({ ok: false }),
    getMercadoPagoPayment: overrides.getMercadoPagoPayment ?? (async () => ({ ok: false })),
    getEnv: () => ({ CHECKOUT_INTERNAL_SECRET: secret, MERCADO_PAGO_ACCESS_TOKEN: "fake", APP_BASE_URL: "http://local" }),
    logError: () => {}, logWarn: () => {}, getSupabaseAdmin: () => db,
    checkCheckoutRisk: async () => ({ allowed: true }),
    buildOrderExternalReference: (id) => `order_${id}`,
    centsToDecimalAmount: (value) => value / 100,
    decimalAmountToCents: (value) => Math.round(Number(value) * 100),
    deliverTicketsForOrder: overrides.deliverTicketsForOrder ?? (async () => ({ ok: true, sent: true })),
    getPublicEventVisibilityQueryFloorIso: () => "2000-01-01T00:00:00.000Z",
    isPublicEventVisible: () => true,
    PUBLIC_VISIBLE_EVENT_STATUSES: ["published"],
  };
}

function comboMocks(db) {
  return {
    createHash, randomBytes, timingSafeEqual, QRCode: {}, createMercadoPagoPayment: async () => ({ ok: false }),
    getEnv: () => ({ CHECKOUT_INTERNAL_SECRET: secret, MERCADO_PAGO_ACCESS_TOKEN: "fake", APP_BASE_URL: "http://local" }),
    logError: () => {}, logInfo: () => {}, logWarn: () => {}, getSupabaseAdmin: () => db,
    getComboOfferDelayMinutes: () => 10, normalizeWhatsAppPhone: (value) => value,
    generateComboQrImage: async () => Buffer.from("qr"), getOrCreateOpenConversation: async () => ({ ok: true, conversation: { id: "c" } }),
    updateConversationAfterMessage: async () => ({ ok: true }), upsertCustomerFromWhatsApp: async () => ({ ok: true }),
    saveWhatsAppMessage: async () => ({ ok: true }), buildWhatsAppOutboundMetadata: (value) => value,
    centsToDecimalAmount: (value) => value / 100, decimalAmountToCents: (value) => Math.round(Number(value) * 100),
    getPublicEventVisibilityQueryFloorIso: () => "2000-01-01T00:00:00.000Z", getPublicVisibleSessionStatuses: () => [],
    isPublicEventVisible: () => true, PUBLIC_VISIBLE_EVENT_STATUSES: ["published"],
    claimWhatsAppOutboundDelivery: async () => ({ ok: false }), getOrCreateWhatsAppOutboundDelivery: async () => ({ ok: false }),
    markWhatsAppOutboundDeliveryFailed: async () => ({ ok: true }), markWhatsAppOutboundDeliverySent: async () => ({ ok: true }),
    sendZapiImage: async () => ({ ok: true }), sendZapiText: async () => ({ ok: true }),
  };
}

test("payment.checkout_view accepts only the signed order and returns its own items", async () => {
  const reservation = { id: "reservation-a", customer_id: "customer-a", session_id: "session-a", status: "active", expires_at: future };
  const db = new MemorySupabase({
    orders: [{ id: "order-a", reservation_id: reservation.id, customer_id: "customer-a", status: "pending_payment", total_amount_cents: 5000, total_fee_cents: 500 }],
    reservations: [reservation], customers: [{ id: "customer-a", email: "a@example.com" }],
    reservation_items: [{ id: "item-a", reservation_id: reservation.id, session_seat_id: "seat-a", section_id: "section-a", price_cents: 5000, fee_cents: 500, seat_code: "A1" }],
    session_seats: [{ id: "seat-a", status: "reserved", current_reservation_id: reservation.id }],
    event_sessions: [{ id: "session-a", starts_at: future, timezone: "America/Sao_Paulo", status: "sales_open", events: { id: "event-a", title: "Evento A", status: "published" } }],
    venue_sections: [{ id: "section-a", name: "Pista" }],
  });
  const service = await loadProductionModule("src/lib/tickets/services/checkout.ts", checkoutMocks(db));
  const token = createHmac("sha256", secret).update(`order-a:${reservation.id}:${future}`).digest("base64url");

  const result = await service.getPublicCheckoutOrder("order-a", token);
  assert.equal(result.orderId, "order-a");
  assert.deepEqual(result.items, [{ name: "Evento A - Pista", quantity: 1, unitPriceCents: 5500 }]);
  assert.equal(await service.getPublicCheckoutOrder("order-a", "invalid"), null);
  const otherToken = createHmac("sha256", secret).update(`order-b:${reservation.id}:${future}`).digest("base64url");
  assert.equal(await service.getPublicCheckoutOrder("order-a", otherToken), null);
});

test("payment.status reconciles an approved provider payment exactly once", async () => {
  let deliveries = 0;
  const db = new MemorySupabase(
    {
      orders: [{ id: "order-a", status: "pending_payment" }, { id: "order-b", status: "pending_payment" }],
      payments: [
        { id: "payment-a", order_id: "order-a", provider: "mercado_pago", provider_payment_id: "mp-1", status: "pending", raw_metadata: { attempt: 1 }, updated_at: "2026-01-01" },
        { id: "payment-b", order_id: "order-b", provider: "mercado_pago", provider_payment_id: "mp-rejected", status: "pending", raw_metadata: {}, updated_at: "2026-01-01" },
      ],
    },
    {
      confirm_paid_ticket_order: async (args, store) => {
        store.tables.orders[0].status = "paid";
        return { data: { idempotent: false, order_id: args.p_order_id }, error: null };
      },
    },
  );
  const service = await loadProductionModule("src/lib/tickets/services/checkout.ts", checkoutMocks(db, {
    getMercadoPagoPayment: async (id) => ({ ok: true, payment: { id, status: id === "mp-1" ? "approved" : "rejected", transaction_amount: 55, date_approved: "2026-01-02T00:00:00.000Z" } }),
    deliverTicketsForOrder: async () => { deliveries += 1; return { ok: true, sent: true }; },
  }));

  await service.reconcileApprovedCheckoutPayment("order-a");
  await service.reconcileApprovedCheckoutPayment("order-a");
  assert.equal(db.tables.orders[0].status, "paid");
  assert.equal(deliveries, 1);
  assert.equal(db.calls.filter((call) => call.operation === "confirm_paid_ticket_order").length, 1);
  await service.reconcileApprovedCheckoutPayment("order-b");
  assert.equal(db.tables.orders[1].status, "pending_payment");
  assert.equal(deliveries, 1);
});

test("combo.status authenticates the token without exposing another order", async () => {
  const token = "combo-secret";
  const db = new MemorySupabase({ combo_orders: [
    { id: "combo-a", status: "pending_payment", checkout_token_hash: createHash("sha256").update(token).digest("hex"), checkout_expires_at: future },
    { id: "combo-b", status: "paid", checkout_token_hash: createHash("sha256").update("other").digest("hex"), checkout_expires_at: future },
  ] });
  const service = await loadProductionModule("src/lib/tickets/services/comboOffers.ts", comboMocks(db));

  assert.equal(await service.getComboCheckoutStatus("combo-a", token), "pending");
  assert.equal(await service.getComboCheckoutStatus("combo-a", "wrong"), null);
  assert.equal(await service.getComboCheckoutStatus("combo-b", token), null);
});

test("combo.confirm validates amount/link and confirms one order idempotently", async () => {
  const db = new MemorySupabase({
    combo_orders: [
      { id: "combo-a", status: "pending_payment", total_amount_cents: 5000 },
      { id: "combo-b", status: "pending_payment", total_amount_cents: 6000 },
    ],
    combo_payments: [],
  });
  const service = await loadProductionModule("src/lib/tickets/services/comboOffers.ts", comboMocks(db));
  const input = { orderId: "combo-a", providerPaymentId: "mp-a", amountCents: 5000, paidAt: "2026-01-02T00:00:00.000Z", rawMetadata: { safe: true } };

  assert.equal((await service.confirmPaidComboOrder(input)).idempotent, false);
  assert.equal(db.tables.combo_orders.find((row) => row.id === "combo-a").status, "paid");
  assert.equal(db.tables.combo_orders.find((row) => row.id === "combo-b").status, "pending_payment");
  assert.equal(db.tables.combo_payments.length, 1);
  assert.equal((await service.confirmPaidComboOrder(input)).idempotent, true);
  assert.equal(db.tables.combo_payments.length, 1);
  assert.equal((await service.confirmPaidComboOrder({ ...input, orderId: "combo-b", amountCents: 100 })).reason, "payment_amount_too_low");
});

test("analytics.track_click increments metadata without changing order state", async () => {
  const db = new MemorySupabase({
    payments: [{ id: "payment-a", order_id: "order-a", checkout_url: "http://checkout", created_at: "2026-01-01", raw_metadata: { checkout_click_count: 2 } }],
    combo_orders: [{ id: "combo-a", status: "pending_payment", raw_metadata: { checkout_click_count: 4 } }],
  });
  const checkout = await loadProductionModule("src/lib/tickets/services/checkout.ts", checkoutMocks(db));
  const combo = await loadProductionModule("src/lib/tickets/services/comboOffers.ts", comboMocks(db));

  await checkout.trackTicketCheckoutClick("order-a");
  await combo.trackComboCheckoutClick("combo-a");
  assert.equal(db.tables.payments[0].raw_metadata.checkout_click_count, 3);
  assert.equal(db.tables.payments[0].raw_metadata.checkout_click_kind, "event");
  assert.equal(db.tables.combo_orders[0].raw_metadata.checkout_click_count, 5);
  assert.equal(db.tables.combo_orders[0].raw_metadata.checkout_click_kind, "offer");
  assert.equal(db.tables.combo_orders[0].status, "pending_payment");
});
