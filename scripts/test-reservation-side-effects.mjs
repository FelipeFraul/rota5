import assert from "node:assert/strict";
import test from "node:test";
import { loadProductionModule, MemorySupabase } from "./test-support/production-module-harness.mjs";

test("background.remind_interest selects eligible buyers, persists metadata and deduplicates retries", async () => {
  const now = Date.now();
  const db = new MemorySupabase({
    conversations: [
      { id: "eligible", customer_id: "customer-a", status: "open", last_message_at: new Date(now - 150 * 60_000).toISOString(), context: { state: "showing_events", selectedEvent: { eventId: "event-a", title: "Evento A" } }, customers: { whatsapp_phone: "5515999999999" } },
      { id: "purchased", customer_id: "customer-b", status: "open", last_message_at: new Date(now - 150 * 60_000).toISOString(), context: { state: "showing_events", selectedEvent: { eventId: "event-a", title: "Evento A" } }, customers: { whatsapp_phone: "5515888888888" } },
      { id: "irrelevant", customer_id: "customer-c", status: "open", last_message_at: new Date(now - 150 * 60_000).toISOString(), context: { state: "idle" }, customers: { whatsapp_phone: "5515777777777" } },
    ],
    reservations: [{ id: "reservation-b", customer_id: "customer-b", status: "active", created_at: new Date(now - 60_000).toISOString() }],
    whatsapp_messages: [], admin_sessions: [],
  });
  let sends = 0;
  const reservationExpiry = await loadProductionModule(
    "src/lib/tickets/services/reservationExpiry.ts",
    {
      getSupabaseAdmin: () => db,
      TICKET_MESSAGES: { adminLogout: "logout", buyerInterestReminder: "Ainda quer comprar para {EVENTO}?" },
      buildInitialConversationState: () => ({ state: "idle", step: "idle" }),
      updateConversationAfterMessage: async () => ({ ok: true }), sendScheduledComboOffers: async () => ({}),
      saveWhatsAppMessage: async (input) => {
        db.tables.whatsapp_messages.push({
          id: `message-${db.tables.whatsapp_messages.length + 1}`,
          conversation_id: input.conversationId, direction: input.direction,
          raw_metadata: input.rawMetadata,
        });
        return { ok: true };
      },
      buildWhatsAppOutboundMetadata: ({ sendResult, reason, businessContext }) => ({ send_status: sendResult.ok ? "sent" : "failed", reason, ...businessContext }),
      sendZapiText: async ({ phone }) => { sends += 1; assert.equal(phone, "5515999999999"); return { ok: true, providerMessageId: "zapi-1" }; },
      logError: () => {}, logInfo: () => {}, logWarn: () => {},
    },
    ["sendBuyerInterestReminders"],
  );

  assert.deepEqual(await reservationExpiry.sendBuyerInterestReminders(100), { buyerInterestReminderCount: 1, failedBuyerInterestReminderCount: 0 });
  assert.equal(sends, 1);
  assert.equal(db.tables.whatsapp_messages[0].raw_metadata.reason, "buyer_interest_no_purchase");
  assert.equal(db.tables.whatsapp_messages[0].raw_metadata.event_id, "event-a");
  assert.deepEqual(await reservationExpiry.sendBuyerInterestReminders(100), { buyerInterestReminderCount: 0, failedBuyerInterestReminderCount: 0 });
  assert.equal(sends, 1);
});
