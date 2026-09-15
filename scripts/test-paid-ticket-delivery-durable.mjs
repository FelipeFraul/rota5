import assert from "node:assert/strict";
import test from "node:test";
import { loadProductionModule, MemorySupabase } from "./test-support/production-module-harness.mjs";

const orderId = "11111111-1111-4111-8111-111111111111";
const customerId = "22222222-2222-4222-8222-222222222222";

function ticket(index) {
  return {
    ticketId: `00000000-0000-4000-8000-00000000000${index}`,
    ticketCode: `TCK-${index}`,
    seatCode: `A${index}`,
    eventTitle: "Evento",
    venueName: "Casa",
    city: "São Paulo",
    state: "SP",
    startsAt: "2026-09-20T22:00:00.000Z",
    holderName: "Cliente",
    tableMapPlaceCode: null,
  };
}

async function createTicketDeliveryHarness({ tickets = [ticket(1)], failSends = 0, blockFirstSend = false } = {}) {
  const db = new MemorySupabase({
    orders: [{ id: orderId, customer_id: customerId, customers: { whatsapp_phone: "5511999999999" } }],
    conversations: [],
  });
  const deliveries = new Map();
  const effects = [];
  let failuresRemaining = failSends;
  let tokenSequence = 0;
  let releaseFirstSend;
  let notifyFirstSendStarted;
  const firstSendRelease = new Promise((resolve) => { releaseFirstSend = resolve; });
  const firstSendStarted = new Promise((resolve) => { notifyFirstSendStarted = resolve; });

  function put(key, messageType, reason, ticketId = null) {
    if (!deliveries.has(key)) {
      deliveries.set(key, {
        id: `delivery-${deliveries.size + 1}`,
        idempotency_key: key,
        status: "pending",
        attempt_count: 0,
        claim_token: null,
        sent_at: null,
        message_type: messageType,
        reason,
        business_context: { order_id: orderId, ...(ticketId ? { ticket_id: ticketId } : {}) },
      });
    }
    return deliveries.get(key);
  }

  async function ensurePaidTicketDeliveryIntents({ fullDelivery = false }) {
    effects.push("ensure");
    if (tickets.length > 1 && !fullDelivery) {
      put(`paid-ticket-order:${orderId}:delivery-choice:v1`, "text", "paid_ticket_delivery_choice");
      return { ok: true, intentsCount: 1 };
    }
    put(`paid-ticket-order:${orderId}:text:v1`, "text", "paid_ticket_delivery");
    put(`paid-ticket-order:${orderId}:qr-instruction:v1`, "text", "paid_ticket_qr_instruction");
    for (const item of tickets) {
      put(`paid-ticket:${item.ticketId}:qr:v1`, "image", "paid_ticket_qr_delivery", item.ticketId);
    }
    return { ok: true, intentsCount: tickets.length + 2 };
  }

  const service = await loadProductionModule("src/lib/tickets/services/ticketDelivery.ts", {
    logError: () => {}, logInfo: () => {}, logWarn: () => {},
    getSupabaseAdmin: () => db,
    buildInitialConversationState: () => ({ step: "initial", state: "initial" }),
    getOrCreateOpenConversation: async () => ({ ok: true, conversation: { id: "conversation-1" } }),
    updateConversationAfterMessage: async () => ({ ok: true }),
    saveWhatsAppMessage: async () => ({ ok: true }),
    buildWhatsAppOutboundMetadata: (value) => value,
    ensurePaidTicketDeliveryIntents,
    getOrCreateWhatsAppOutboundDelivery: async ({ idempotencyKey, messageType, reason, businessContext }) => ({
      ok: true,
      delivery: put(idempotencyKey, messageType, reason, businessContext.ticket_id ?? null),
    }),
    claimWhatsAppOutboundDelivery: async (deliveryId) => {
      const delivery = [...deliveries.values()].find((item) => item.id === deliveryId);
      if (!delivery || !["pending", "failed"].includes(delivery.status) || delivery.attempt_count >= 5) {
        return { ok: true, claimed: false };
      }
      delivery.status = "sending";
      delivery.attempt_count += 1;
      delivery.claim_token = `token-${++tokenSequence}`;
      return { ok: true, claimed: true, delivery: { ...delivery } };
    },
    markWhatsAppOutboundDeliveryFailed: async ({ deliveryId, claimToken, error }) => {
      const delivery = [...deliveries.values()].find((item) => item.id === deliveryId);
      assert.equal(delivery.claim_token, claimToken);
      delivery.status = delivery.attempt_count >= 5 ? "dead_letter" : "failed";
      delivery.last_error = error;
      delivery.claim_token = null;
      return { ok: true, status: delivery.status };
    },
    markWhatsAppOutboundDeliverySent: async ({ deliveryId, claimToken }) => {
      const delivery = [...deliveries.values()].find((item) => item.id === deliveryId);
      assert.equal(delivery.claim_token, claimToken);
      delivery.status = "sent";
      delivery.sent_at = "2026-09-15T12:00:00.000Z";
      delivery.claim_token = null;
      return { ok: true, sentAt: delivery.sent_at };
    },
    createSignedTicketToken: ({ ticketId }) => `token-${ticketId}`,
    createTicketUrl: (token) => `https://example.test/t/${token}`,
    getTicketsForOrder: async () => tickets,
    markBuyerTicketQrDelivered: async () => ({ ok: true }),
    generateTicketQrImage: async () => ({ buffer: Buffer.from("qr") }),
    ticketQrImageToDataUrl: () => "data:image/png;base64,cXI=",
    getOfficialTableMapPlace: () => null,
    normalizeOfficialTableMapCode: (value) => value,
    sendZapiText: async ({ message }) => {
      const effect = message.startsWith("*PAGAMENTO") ? "payment-text" : "qr-instruction";
      effects.push(effect);
      if (blockFirstSend && effect === "payment-text" && effects.filter((item) => item === effect).length === 1) {
        notifyFirstSendStarted();
        await firstSendRelease;
      }
      if (failuresRemaining > 0) {
        failuresRemaining -= 1;
        return { ok: false, error: "zapi_failed" };
      }
      return { ok: true, providerMessageId: `message-${effects.length}` };
    },
    sendZapiImage: async () => {
      effects.push("qr-image");
      if (failuresRemaining > 0) {
        failuresRemaining -= 1;
        return { ok: false, error: "zapi_failed" };
      }
      return { ok: true, providerMessageId: `message-${effects.length}` };
    },
  });

  return {
    service,
    deliveries,
    effects,
    firstSendStarted,
    releaseFirstSend,
    setFailures(value) { failuresRemaining = value; },
  };
}

test("full delivery persists every intent before effects and sends text, instruction, then QRs", async () => {
  const harness = await createTicketDeliveryHarness({ tickets: [ticket(1), ticket(2)] });
  const result = await harness.service.deliverTicketsForOrder(orderId);

  assert.deepEqual(result, { ok: true, sent: true, ticketsCount: 2 });
  assert.deepEqual(harness.effects, ["ensure", "payment-text", "qr-instruction", "qr-image", "qr-image"]);
  assert.equal([...harness.deliveries.values()].filter((item) => item.status === "sent").length, 4);
});

test("a failed immediate send remains durable and a later run completes it", async () => {
  const harness = await createTicketDeliveryHarness({ failSends: 1 });
  const first = await harness.service.deliverTicketsForOrder(orderId);
  assert.equal(first.reason, "zapi_failed");
  assert.equal(harness.deliveries.get(`paid-ticket-order:${orderId}:text:v1`).status, "failed");

  const second = await harness.service.deliverTicketsForOrder(orderId);
  assert.equal(second.sent, true);
  assert.deepEqual([...harness.deliveries.values()].map((item) => item.status), ["sent", "sent", "sent"]);
});

test("active concurrent claim prevents duplicate external delivery", async () => {
  const harness = await createTicketDeliveryHarness({ blockFirstSend: true });
  const first = harness.service.deliverTicketsForOrder(orderId);
  await harness.firstSendStarted;
  const second = await harness.service.deliverTicketsForOrder(orderId);
  harness.releaseFirstSend();
  const firstResult = await first;

  assert.equal(firstResult.sent, true);
  assert.equal(second.reason, "delivery_in_progress");
  assert.equal(harness.effects.filter((item) => item === "payment-text").length, 1);
});

test("partial QR recovery sends only the unsent QR", async () => {
  const tickets = [ticket(1), ticket(2), ticket(3)];
  const harness = await createTicketDeliveryHarness({ tickets });
  await harness.service.deliverTicketsForOrder(orderId);
  harness.effects.length = 0;
  harness.deliveries.get(`paid-ticket:${tickets[2].ticketId}:qr:v1`).status = "failed";

  const result = await harness.service.deliverTicketsForOrder(orderId);
  assert.equal(result.sent, true);
  assert.deepEqual(harness.effects, ["ensure", "qr-image"]);
});

test("bounded failures reach dead letter and are no longer claimed", async () => {
  const harness = await createTicketDeliveryHarness({ failSends: 10 });
  for (let attempt = 0; attempt < 5; attempt += 1) {
    await harness.service.deliverTicketsForOrder(orderId);
  }
  const delivery = harness.deliveries.get(`paid-ticket-order:${orderId}:text:v1`);
  assert.equal(delivery.attempt_count, 5);
  assert.equal(delivery.status, "dead_letter");

  const sendsBefore = harness.effects.filter((item) => item === "payment-text").length;
  await harness.service.deliverTicketsForOrder(orderId);
  assert.equal(harness.effects.filter((item) => item === "payment-text").length, sendsBefore);
});

test("multi-ticket initial flow keeps option 2 by sending only the delivery-choice prompt", async () => {
  const harness = await createTicketDeliveryHarness({ tickets: [ticket(1), ticket(2)] });
  const result = await harness.service.requestTicketDeliveryPreferenceForOrder(orderId);
  assert.equal(result.sent, true);
  assert.deepEqual(harness.effects, ["ensure", "payment-text"]);
  assert.deepEqual([...harness.deliveries.values()].map((item) => item.reason), ["paid_ticket_delivery_choice"]);
});

test("failed multi-ticket prompt is retried through the same durable intention", async () => {
  const harness = await createTicketDeliveryHarness({ tickets: [ticket(1), ticket(2)], failSends: 1 });
  const first = await harness.service.requestTicketDeliveryPreferenceForOrder(orderId);
  assert.equal(first.reason, "zapi_failed");

  const second = await harness.service.requestTicketDeliveryPreferenceForOrder(orderId);
  assert.equal(second.sent, true);
  assert.equal(harness.deliveries.size, 1);
  assert.equal([...harness.deliveries.values()][0].attempt_count, 2);
});

test("worker groups orders by mode and exposes queue counters", async () => {
  const calls = [];
  const worker = await loadProductionModule("src/lib/tickets/services/paidTicketDeliveryWorker.ts", {
    logError: () => {}, logInfo: () => {},
    deliverTicketsForOrder: async (id) => { calls.push([id, "full"]); return { ok: true, sent: true, ticketsCount: 1 }; },
    requestTicketDeliveryPreferenceForOrder: async (id) => { calls.push([id, "choice"]); return { ok: true, sent: false, reason: "delivery_in_progress" }; },
    listDuePaidTicketDeliveryOrders: async () => ({ ok: true, orders: [
      { order_id: "order-full", delivery_mode: "full" },
      { order_id: "order-choice", delivery_mode: "choice" },
    ] }),
    getPaidTicketDeliveryQueueCounts: async () => ({ ok: true, counts: {
      pending_due: 1, failed_due: 0, failed: 0, sending_active: 1, sending_expired: 0, dead_letter: 0, sent: 1,
    } }),
  });

  const result = await worker.processDuePaidTicketDeliveries();
  assert.deepEqual(calls, [["order-full", "full"], ["order-choice", "choice"]]);
  assert.deepEqual(result, {
    selected: 2,
    delivered: 1,
    deferred: 1,
    failed: 0,
    queue: { pending_due: 1, failed_due: 0, failed: 0, sending_active: 1, sending_expired: 0, dead_letter: 0, sent: 1 },
  });
});
