import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const files = {
  comboOffers: "src/lib/tickets/services/comboOffers.ts",
  comboRedemptions: "src/lib/tickets/services/comboRedemptions.ts",
  ticketDelivery: "src/lib/tickets/services/ticketDelivery.ts",
};

async function readSource(file) {
  return readFile(file, "utf8");
}

function metadataWindow(source, reason) {
  const index = source.indexOf(`reason: "${reason}"`);
  assert.notEqual(index, -1, `missing metadata reason ${reason}`);
  return source.slice(Math.max(0, index - 500), index + 500);
}

function assertOutboundContract(source, reason, messageType) {
  const block = metadataWindow(source, reason);
  assert.match(block, /saveWhatsAppMessage\(/, `${reason} must persist the attempt`);
  assert.match(block, /provider:\s*"zapi"/, `${reason} must persist provider`);
  assert.match(
    block,
    new RegExp(`message_type:\\s*"${messageType}"`),
    `${reason} must persist message_type`,
  );
  assert.match(
    block,
    /send_status:\s*[A-Za-z0-9_]+\.ok \? "sent" : "failed"/,
    `${reason} must persist sent/failed status from the Z-API result`,
  );
  assert.match(
    block,
    /providerMessageId:\s*[A-Za-z0-9_]+\.ok\s*\?\s*[A-Za-z0-9_]+\.providerMessageId\s*:\s*null/,
    `${reason} must persist providerMessageId only when Z-API accepts the message`,
  );
  assert.match(
    block,
    /\.\.\([A-Za-z0-9_]+\.ok \? \{\} : \{ error: [A-Za-z0-9_]+\.error \}\)/,
    `${reason} must persist Z-API error details on failed attempts`,
  );
}

test("paid combo delivery persists every outbound attempt with the standard metadata contract", async () => {
  const source = await readSource(files.comboOffers);

  assertOutboundContract(source, "paid_combo_delivery", "text");
  assertOutboundContract(source, "paid_combo_qr_delivery", "image");
});

test("paid ticket delivery persists every outbound attempt with the standard metadata contract", async () => {
  const source = await readSource(files.ticketDelivery);

  assertOutboundContract(source, "paid_ticket_delivery", "text");
  assertOutboundContract(source, "paid_ticket_qr_delivery", "image");
});

test("combo redemption notifications persist every outbound attempt with the standard metadata contract", async () => {
  const source = await readSource(files.comboRedemptions);

  assertOutboundContract(source, "offer_preparation_started_on_arrival", "text");
  assertOutboundContract(source, "combo_ready_at_bar", "text");
  assertOutboundContract(source, "combo_ready_qr", "image");
  assertOutboundContract(source, "combo_ready_notification_recovered_at_scan", "text");
  assertOutboundContract(source, "combo_awaiting_preparation", "text");
});

test("standardized outbound metadata does not invent delivery states", async () => {
  const sources = await Promise.all(Object.values(files).map(readSource));
  const source = sources.join("\n");

  assert.doesNotMatch(source, /send_status:\s*"delivered"/);
  assert.doesNotMatch(source, /send_status:\s*"delivered_to_customer"/);
  assert.doesNotMatch(source, /send_status:\s*"read"/);
});
