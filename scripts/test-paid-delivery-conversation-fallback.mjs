import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const ticketDelivery = readFileSync(
  new URL("../src/lib/tickets/services/ticketDelivery.ts", import.meta.url),
  "utf8",
);
const comboOffers = readFileSync(
  new URL("../src/lib/tickets/services/comboOffers.ts", import.meta.url),
  "utf8",
);
const comboRedemptions = readFileSync(
  new URL("../src/lib/tickets/services/comboRedemptions.ts", import.meta.url),
  "utf8",
);

function functionBody(source, functionName) {
  const start = source.indexOf(`export async function ${functionName}`);
  assert.notEqual(start, -1, `${functionName} not found`);
  const nextExport = source.indexOf("\nexport ", start + 1);
  return source.slice(start, nextExport === -1 ? undefined : nextExport);
}

function assertPaidDeliveryFallback({
  source,
  functionName,
  textReason,
  imageReason,
}) {
  const body = functionBody(source, functionName);
  const conversationFailureBlock = body.slice(
    body.indexOf("if (!conversationResult.ok)"),
    body.indexOf("const conversationId"),
  );

  assert.match(conversationFailureBlock, /logWarn\(/);
  assert.doesNotMatch(conversationFailureBlock, /return \{/);
  assert.match(body, /const conversationId = conversationResult\.ok[\s\S]*: null/);
  assert.match(body, /conversation_status:\s*"unavailable"/);
  assert.match(body, /conversationId,/);
  assert.match(body, /customerId:\s*order\.customer_id/);
  assert.match(body, new RegExp(`reason: "${textReason}"`));
  assert.match(body, new RegExp(`reason: "${imageReason}"`));
  assert.match(body, /providerMessageId:\s*[a-zA-Z]+(?:Send)?Result\.ok \? [a-zA-Z]+(?:Send)?Result\.providerMessageId : null/);
  assert.match(body, /\.\.\.conversationFallbackMetadata/);
}

test("ticket delivery sends and persists paid delivery attempts when conversation is unavailable", () => {
  assertPaidDeliveryFallback({
    source: ticketDelivery,
    functionName: "deliverTicketsForOrder",
    textReason: "paid_ticket_delivery",
    imageReason: "paid_ticket_qr_delivery",
  });
  assert.match(ticketDelivery, /return \{ ok: true, sent: false, reason: "missing_phone" \}/);
  assert.match(ticketDelivery, /return \{ ok: true, sent: false, reason: "tickets_not_found" \}/);
});

test("combo delivery sends and persists paid delivery attempts when conversation is unavailable", () => {
  assertPaidDeliveryFallback({
    source: comboOffers,
    functionName: "deliverComboOrder",
    textReason: "paid_combo_delivery",
    imageReason: "paid_combo_qr_delivery",
  });
  assert.match(comboOffers, /order\.status !== "paid"/);
  assert.match(comboOffers, /reason: "missing_phone"/);
});

test("Z-API failed remains a send failure and is not caused by unavailable conversation", () => {
  for (const source of [ticketDelivery, comboOffers]) {
    assert.match(source, /if \(![a-zA-Z]+(?:Send)?Result\.ok\)/);
    assert.match(source, /reason: "zapi_failed"/);
    assert.doesNotMatch(source, /send_status:\s*"failed"/);
  }
});

test("fallback does not alter comboRedemptions, add retry, or duplicate Z-API calls for conversation failure", () => {
  assert.doesNotMatch(comboRedemptions, /conversation_status:\s*"unavailable"/);
  for (const source of [ticketDelivery, comboOffers]) {
    const body = source.includes("deliverTicketsForOrder")
      ? functionBody(source, "deliverTicketsForOrder")
      : functionBody(source, "deliverComboOrder");
    const failureBlock = body.slice(
      body.indexOf("if (!conversationResult.ok)"),
      body.indexOf("const conversationId"),
    );
    assert.doesNotMatch(failureBlock, /sendZapiText|sendZapiImage/);
    assert.doesNotMatch(source, /retry|next_attempt|attempt_count/i);
  }
});
