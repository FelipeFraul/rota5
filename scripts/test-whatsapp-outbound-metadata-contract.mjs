import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { buildWhatsAppOutboundMetadata } from "../src/lib/tickets/services/outboundMessages.ts";

const files = {
  webhook: "src/app/api/webhook/zapi/route.ts",
  finalizer: "src/lib/tickets/services/conversationFinalizer.ts",
  reservationExpiry: "src/lib/tickets/services/reservationExpiry.ts",
  comboOffers: "src/lib/tickets/services/comboOffers.ts",
  comboRedemptions: "src/lib/tickets/services/comboRedemptions.ts",
  ticketDelivery: "src/lib/tickets/services/ticketDelivery.ts",
  outboundMessages: "src/lib/tickets/services/outboundMessages.ts",
};

const contracts = [
  {
    file: "webhook",
    reason: "webhook_reply",
    messageTypes: ["text", "outboundMessage.type"],
    businessFields: [],
  },
  {
    file: "finalizer",
    reason: "conversation_inactivity_closed",
    reasonExpression: "FINALIZER_REASON",
    messageTypes: ["text"],
    businessFields: ["inactivity_after_minutes"],
  },
  {
    file: "reservationExpiry",
    reason: "reservation_expired",
    messageTypes: ["text"],
    businessFields: ["reservation_id", "order_id"],
  },
  {
    file: "reservationExpiry",
    reason: "buyer_interest_no_purchase",
    messageTypes: ["text"],
    businessFields: ["event_id", "reminder_after_minutes"],
  },
  {
    file: "reservationExpiry",
    reason: "admin_session_expired",
    messageTypes: ["text"],
    businessFields: ["admin_session_id", "admin_user_id"],
  },
  {
    file: "comboOffers",
    reason: "paid_combo_delivery",
    messageTypes: ["text"],
    businessFields: ["combo_order_id", "combo_redemption_id", "offer_id", "event_id", "session_id"],
  },
  {
    file: "comboOffers",
    reason: "paid_combo_qr_delivery",
    messageTypes: ["image"],
    businessFields: ["combo_order_id", "combo_redemption_id", "offer_id", "event_id", "session_id"],
  },
  {
    file: "comboOffers",
    reason: "combo_offer",
    messageTypes: ["messageType"],
    businessFields: [
      "offer_image_url",
      "source_ticket_id",
      "offer_id",
      "combo_order_id",
      "event_id",
      "session_id",
      "customer_id",
    ],
  },
  {
    file: "comboRedemptions",
    reason: "offer_preparation_started_on_arrival",
    messageTypes: ["text"],
    businessFields: ["combo_order_id", "combo_redemption_id"],
  },
  {
    file: "comboRedemptions",
    reason: "combo_ready_at_bar",
    messageTypes: ["text"],
    businessFields: ["combo_order_id", "combo_redemption_id"],
  },
  {
    file: "comboRedemptions",
    reason: "combo_ready_qr",
    messageTypes: ["image"],
    businessFields: ["combo_order_id", "combo_redemption_id"],
  },
  {
    file: "comboRedemptions",
    reason: "combo_ready_notification_recovered_at_scan",
    messageTypes: ["text"],
    businessFields: ["combo_order_id", "combo_redemption_id"],
  },
  {
    file: "comboRedemptions",
    reason: "combo_awaiting_preparation",
    messageTypes: ["text"],
    businessFields: ["combo_order_id", "combo_redemption_id"],
  },
  {
    file: "ticketDelivery",
    reason: "paid_ticket_delivery",
    messageTypes: ["text"],
    businessFields: ["order_id", "tickets_count"],
  },
  {
    file: "ticketDelivery",
    reason: "paid_ticket_qr_delivery",
    messageTypes: ["image"],
    businessFields: ["order_id", "ticket_id", "ticket_code"],
  },
];

async function readSource(file) {
  return readFile(file, "utf8");
}

function assertReasonContract(source, contract) {
  const reasonNeedle = contract.reasonExpression ?? `"${contract.reason}"`;
  let index = -1;
  let block = "";
  let cursor = 0;
  while (true) {
    index = source.indexOf(`reason: ${reasonNeedle}`, cursor);
    if (index === -1) break;
    block = source.slice(Math.max(0, index - 650), index + 650);
    if (/rawMetadata:\s*buildWhatsAppOutboundMetadata\(/.test(block)) break;
    cursor = index + 1;
  }
  assert.notEqual(index, -1, `missing metadata reason ${contract.reason}`);
  assert.match(
    block,
    /rawMetadata:\s*buildWhatsAppOutboundMetadata\(/,
    `${contract.reason} must use the shared metadata builder`,
  );
  assert.match(block, /sendResult[:,]/, `${contract.reason} must pass the Z-API result`);
  assert.ok(
    contract.messageTypes.some((messageType) =>
      block.includes(`messageType: "${messageType}"`) ||
      block.includes(`messageType: ${messageType}`) ||
      (messageType === "messageType" && block.includes("messageType,")),
    ),
    `${contract.reason} must preserve message type`,
  );

  for (const field of contract.businessFields) {
    assert.match(block, new RegExp(`${field}:`), `${contract.reason} must preserve ${field}`);
  }
}

test("builder returns the exact sent metadata contract without providerMessageId", () => {
  const metadata = buildWhatsAppOutboundMetadata({
    sendResult: { ok: true, providerMessageId: "zapi-id" },
    messageType: "text",
    reason: "unit_test",
    businessContext: {
      order_id: "order-1",
    },
  });

  assert.deepEqual(metadata, {
    provider: "zapi",
    message_type: "text",
    send_status: "sent",
    reason: "unit_test",
    order_id: "order-1",
  });
  assert.equal("providerMessageId" in metadata, false);
  assert.equal("error" in metadata, false);
});

test("builder returns the exact failed metadata contract with error", () => {
  const metadata = buildWhatsAppOutboundMetadata({
    sendResult: { ok: false, error: "zapi_down" },
    messageType: "image",
    reason: "unit_test_failed",
  });

  assert.deepEqual(metadata, {
    provider: "zapi",
    message_type: "image",
    send_status: "failed",
    reason: "unit_test_failed",
    error: "zapi_down",
  });
});

test("all outbound persistence call sites use the shared metadata builder and preserve fields", async () => {
  const sources = Object.fromEntries(
    await Promise.all(
      Object.entries(files).map(async ([key, file]) => [key, await readSource(file)]),
    ),
  );

  for (const contract of contracts) {
    assertReasonContract(sources[contract.file], contract);
  }

  assert.doesNotMatch(sources.webhook, /function buildOutboundMetadata/);
  assert.doesNotMatch(sources.webhook, /buildOutboundMetadata\(/);
});

test("standardized outbound metadata does not invent delivery states", async () => {
  const sources = await Promise.all(Object.values(files).map(readSource));
  const source = sources.join("\n");

  assert.doesNotMatch(source, /send_status:\s*"delivered"/);
  assert.doesNotMatch(source, /send_status:\s*"delivered_to_customer"/);
  assert.doesNotMatch(source, /send_status:\s*"read"/);
});
