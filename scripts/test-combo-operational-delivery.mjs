import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { loadProductionModule } from "./test-support/production-module-harness.mjs";

const source = readFileSync("src/lib/tickets/services/comboRedemptions.ts", "utf8");
const migration = readFileSync("supabase/migrations/20260915000600_make_combo_operational_notifications_durable.sql", "utf8");

test("five combo decision flows cannot call the provider directly", () => {
  const start = source.indexOf("export async function releaseComboOrdersForKitchenAfterGateEntry");
  const ready = source.indexOf("export async function deliverComboReadyNotification");
  const kitchen = source.indexOf("export async function startKitchenOrderPreparation");
  const scan = source.indexOf("export async function validateComboRedemptionScan");
  const end = source.indexOf("export async function confirmComboDeliveryChoice");
  assert.ok(start >= 0 && ready > start && kitchen > ready && scan > kitchen && end > scan);
  assert.doesNotMatch(source.slice(start, ready), /sendZapi(?:Text|Image)\s*\(/);
  assert.doesNotMatch(source.slice(kitchen, end), /sendZapi(?:Text|Image)\s*\(/);
  assert.match(migration, /combo-gate-arrival:.*:text:v1/);
  assert.match(migration, /combo-delivery-choice:.*:prompt:v1/);
  assert.match(migration, /combo-awaiting-preparation:.*:text:v1/);
  assert.match(migration, /legacy_ready_upgrade/);
  assert.match(migration, /v_redemption\.raw_metadata->>'legacy_ready_upgrade' = 'true'/);
});

function delivery(overrides = {}) {
  return {
    id: "intent-1",
    idempotency_key: "combo-delivery-choice:redemption-1:prompt:v1",
    customer_id: "customer-1",
    conversation_id: "conversation-1",
    recipient_phone: "5511999990000",
    message_type: "text",
    reason: "combo_delivery_choice_requested",
    business_context: {
      combo_order_id: "order-1", combo_redemption_id: "redemption-1",
      place_code: "01", place_label: "mesa 1", offer_name: "Combo",
      delivery_order: 40,
    },
    status: "pending",
    claim_token: "claim-1",
    ...overrides,
  };
}

async function scenario({ claimable = true, sendOk = true, context = null } = {}) {
  const events = [];
  const intent = delivery(context ? { business_context: context } : {});
  const service = await loadProductionModule("src/lib/tickets/services/comboOperationalDelivery.ts", {
    getWhatsAppOutboundDeliveryByIdempotencyKey: async (key) => ({
      ok: true, delivery: key === intent.idempotency_key ? intent : null,
    }),
    claimWhatsAppOutboundDelivery: async () => {
      events.push("claim");
      if (!claimable) return { ok: true, claimed: false };
      events.push("routing_persisted");
      return { ok: true, claimed: true, delivery: intent };
    },
    getOrCreateOpenConversation: async () => {
      events.push("conversation");
      return { ok: true, conversation: { id: "conversation-1" } };
    },
    sendZapiText: async () => {
      assert.ok(events.includes("claim"));
      assert.ok(events.includes("routing_persisted"));
      events.push("provider");
      return sendOk
        ? { ok: true, providerMessageId: "provider-1" }
        : { ok: false, error: "provider_error" };
    },
    saveWhatsAppMessage: async () => { events.push("message_saved"); return { ok: true }; },
    buildWhatsAppOutboundMetadata: (value) => value,
    markWhatsAppOutboundDeliverySent: async () => { events.push("sent"); return { ok: true }; },
    markWhatsAppOutboundDeliveryFailed: async () => { events.push("failed"); return { ok: true }; },
    updateConversationAfterMessage: async () => ({ ok: true }),
  });
  return { service, events };
}

test("operational delivery requires claim and persists prompt routing before provider", async () => {
  const { service, events } = await scenario();
  assert.deepEqual(await service.deliverComboOperationalNotification("redemption-1"), { ok: true, sent: true });
  assert.deepEqual(events.slice(0, 3), ["claim", "routing_persisted", "provider"]);
  assert.ok(events.indexOf("sent") > events.indexOf("provider"));
});

test("unclaimed and malformed operational intents cannot reach the provider", async () => {
  const unclaimed = await scenario({ claimable: false });
  assert.equal((await unclaimed.service.deliverComboOperationalNotification("redemption-1")).sent, false);
  assert.ok(!unclaimed.events.includes("provider"));
  const malformed = await scenario({ context: { combo_redemption_id: "redemption-1" } });
  assert.equal((await malformed.service.deliverComboOperationalNotification("redemption-1")).reason, "context_invalid");
  assert.ok(malformed.events.includes("failed"));
  assert.ok(!malformed.events.includes("provider"));
});

test("provider failure remains a failed durable intent for the retry worker", async () => {
  const { service, events } = await scenario({ sendOk: false });
  assert.equal((await service.deliverComboOperationalNotification("redemption-1")).reason, "zapi_failed");
  assert.ok(events.includes("failed"));
  assert.ok(!events.includes("sent"));
});
