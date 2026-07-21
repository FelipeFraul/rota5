import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const messagesService = readFileSync(
  new URL("../src/lib/tickets/services/messages.ts", import.meta.url),
  "utf8",
);
const analytics = readFileSync(
  new URL("../src/lib/tickets/services/adminContactAnalytics.ts", import.meta.url),
  "utf8",
);
const finalizer = readFileSync(
  new URL("../src/lib/tickets/services/conversationFinalizer.ts", import.meta.url),
  "utf8",
);
const deliverySources = [
  "../src/lib/tickets/services/ticketDelivery.ts",
  "../src/lib/tickets/services/comboOffers.ts",
  "../src/lib/tickets/services/comboRedemptions.ts",
].map((path) => readFileSync(new URL(path, import.meta.url), "utf8"));

function saveWhatsAppMessageBody() {
  const start = messagesService.indexOf("export async function saveWhatsAppMessage");
  assert.notEqual(start, -1);
  return messagesService.slice(start);
}

test("saveWhatsAppMessage accepts outbound operational messages without conversationId but keeps customerId required", () => {
  assert.match(messagesService, /conversationId:\s*string \| null/);
  assert.match(messagesService, /customerId:\s*string/);
  assert.match(messagesService, /conversation_id:\s*conversationId/);
  assert.doesNotMatch(messagesService, /customerId:\s*string \| null/);
});

test("saveWhatsAppMessage rejects inbound and system messages before insert when conversationId is null", () => {
  const saveBody = saveWhatsAppMessageBody();
  assert.match(
    saveBody,
    /if \(!conversationId && \(direction === "inbound" \|\| messageType === "system"\)\)/,
  );
  assert.match(saveBody, /code:\s*"conversation_id_required"/);
  assert.match(saveBody, /from\("whatsapp_messages"\)[\s\S]*\.insert/);
  assert.ok(
    saveBody.indexOf("conversation_id_required") <
      saveBody.indexOf(".from(\"whatsapp_messages\")"),
    "validation must happen before the insert",
  );
});

test("traditional outbound fields remain intact", () => {
  assert.match(messagesService, /provider_message_id:\s*providerMessageId/);
  assert.match(messagesService, /raw_metadata:\s*rawMetadata/);
  assert.match(messagesService, /direction,/);
  assert.match(messagesService, /message_type:\s*messageType/);
  assert.match(messagesService, /direction === "inbound"[\s\S]*error\.code === "23505"/);
});

test("admin analytics can include outbound without conversation when includeAllContacts is true and keeps paid-conversation filter otherwise", () => {
  assert.match(analytics, /customer_id:\s*string \| null/);
  assert.match(analytics, /conversation_id:\s*string \| null/);
  assert.match(analytics, /const outboundMessages = input\.includeAllContacts\s*\?\s*userOutboundMessages/);
  assert.match(
    analytics,
    /userOutboundMessages\.filter\(\(message\) => Boolean\(message\.conversation_id && paidConversationIds\.has\(message\.conversation_id\)\)\)/,
  );
  assert.match(analytics, /conversationMessagesByCustomer\.get\(message\.customer_id\)/);
  assert.match(analytics, /conversationMessagesByCustomer\.set\(message\.customer_id, existing\)/);
});

test("finalizer continues to ignore messages without conversationId", () => {
  assert.match(finalizer, /if \(!message\.conversation_id\) continue/);
});

test("delivery flows do not opt into null conversationId in this step", () => {
  for (const source of deliverySources) {
    assert.doesNotMatch(source, /conversationId:\s*null/);
  }
});
