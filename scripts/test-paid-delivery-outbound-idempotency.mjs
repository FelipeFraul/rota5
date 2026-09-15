import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const migration = readFileSync(
  new URL("../supabase/migrations/20260721000100_create_whatsapp_outbound_deliveries.sql", import.meta.url),
  "utf8",
);
const claimMigration = readFileSync(
  new URL("../supabase/migrations/20260721000200_add_claim_whatsapp_outbound_delivery_rpc.sql", import.meta.url),
  "utf8",
);
const service = readFileSync(
  new URL("../src/lib/tickets/services/whatsappOutboundDeliveries.ts", import.meta.url),
  "utf8",
);
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
const reservationExpiry = readFileSync(
  new URL("../src/lib/tickets/services/reservationExpiry.ts", import.meta.url),
  "utf8",
);
const finalizer = readFileSync(
  new URL("../src/lib/tickets/services/conversationFinalizer.ts", import.meta.url),
  "utf8",
);

test("migration creates outbound delivery execution units with required constraints and indexes", () => {
  assert.match(migration, /create table if not exists public\.whatsapp_outbound_deliveries/);
  for (const column of [
    "idempotency_key text not null unique",
    "customer_id uuid not null references public.customers",
    "conversation_id uuid null references public.conversations",
    "recipient_phone text not null",
    "message_type text not null",
    "reason text not null",
    "business_context jsonb not null default '{}'::jsonb",
    "status text not null",
    "attempt_count integer not null default 0",
    "provider_message_id text null",
    "last_error text null",
    "claimed_at timestamptz null",
    "sent_at timestamptz null",
  ]) {
    assert.match(migration, new RegExp(column.replace(/[()]/g, "\\$&")));
  }
  assert.match(migration, /message_type in \('text', 'image'\)/);
  assert.match(migration, /status in \('pending', 'sending', 'sent', 'failed'\)/);
  for (const index of ["status", "customer_id", "conversation_id", "reason", "created_at"]) {
    assert.match(migration, new RegExp(`whatsapp_outbound_deliveries_${index}_idx`));
  }
});

test("outbound delivery service creates, claims, and marks paid delivery executions", () => {
  assert.match(service, /getOrCreateWhatsAppOutboundDelivery/);
  assert.match(service, /claimWhatsAppOutboundDelivery/);
  assert.match(service, /\.rpc\("claim_whatsapp_outbound_delivery"/);
  assert.match(service, /markWhatsAppOutboundDeliverySent/);
  assert.match(service, /status: "sent"/);
  assert.match(service, /provider_message_id: providerMessageId \?\? null/);
  assert.match(service, /markWhatsAppOutboundDeliveryFailed/);
  assert.match(service, /status: "failed"/);
});

test("claim is atomic and produces a single winner for concurrent executions", () => {
  assert.match(claimMigration, /create or replace function public\.claim_whatsapp_outbound_delivery/);
  assert.match(claimMigration, /status = 'sending'/);
  assert.match(claimMigration, /attempt_count = attempt_count \+ 1/);
  assert.match(claimMigration, /where id = p_delivery_id\s+and status in \('pending', 'failed'\)/);
  assert.match(claimMigration, /returning \*/);
  assert.match(service, /if \(!data\) {\s+return { ok: true as const, claimed: false as const };/);
  assert.doesNotMatch(service, /attempt_count: data\.attempt_count \+ 1/);
});

test("sent and failed transitions only update deliveries currently in sending", () => {
  for (const marker of [
    "markWhatsAppOutboundDeliverySent",
    "markWhatsAppOutboundDeliveryFailed",
  ]) {
    const markerIndex = service.indexOf(`export async function ${marker}`);
    assert.notEqual(markerIndex, -1, `${marker} must exist`);
    const block = service.slice(markerIndex, markerIndex + 1200);
    assert.match(block, /\.eq\("id", deliveryId\)/);
    assert.match(block, /\.eq\("status", "sending"\)/);
    assert.match(block, /conflict: true as const/);
    assert.match(block, /reason: "invalid_state" as const/);
  }
});

test("ticket delivery uses required idempotency keys and skips sent or sending executions", () => {
  assert.match(ticketDelivery, /paid-ticket-order:\$\{orderId\}:text:v1/);
  assert.match(ticketDelivery, /paid-ticket:\$\{ticket\.ticketId\}:qr:v1/);
  assert.match(ticketDelivery, /textDelivery\.delivery\.status === "sent"/);
  assert.match(ticketDelivery, /imageDelivery\.delivery\.status === "sent"/);
  assert.match(ticketDelivery, /if \(!textClaim\.claimed\)/);
  assert.match(ticketDelivery, /if \(!imageClaim\.claimed\)/);
  assert.match(ticketDelivery, /reason: "delivery_in_progress"/);
  assert.match(ticketDelivery, /markWhatsAppOutboundDeliverySent/);
  assert.match(ticketDelivery, /markWhatsAppOutboundDeliveryFailed/);
  assert.match(ticketDelivery, /conversationId,/);
  assert.match(ticketDelivery, /conversation_status: "unavailable"/);
});

test("ticket QR deliveries preserve order and stop behind an active predecessor claim", () => {
  assert.match(ticketDelivery, /for \(const ticket of tickets\)/);
  assert.match(ticketDelivery, /continue;/);
  assert.ok(
    ticketDelivery.indexOf("const instructionDelivery") <
      ticketDelivery.indexOf("for (const ticket of tickets)"),
  );
  assert.match(ticketDelivery, /claimToken: imageClaim\.delivery\.claim_token/);
  assert.match(ticketDelivery, /ticket_id: ticket\.ticketId/);
});

test("combo delivery uses independent idempotency keys for text and QR", () => {
  assert.match(comboOffers, /paid-combo-order:\$\{order\.id\}:text:v1/);
  assert.match(comboOffers, /paid-combo-redemption:\$\{redemptionId\}:qr:v1/);
  assert.match(comboOffers, /textDelivery\.delivery\.status === "sent"/);
  assert.match(comboOffers, /imageDelivery\.delivery\.status === "sent"/);
  assert.match(comboOffers, /if \(!textClaim\.claimed\)/);
  assert.match(comboOffers, /if \(!imageClaim\.claimed\)/);
  assert.match(comboOffers, /reason: "delivery_in_progress"/);
  assert.match(comboOffers, /markWhatsAppOutboundDeliverySent/);
  assert.match(comboOffers, /markWhatsAppOutboundDeliveryFailed/);
});

test("ticket and combo callers check mark sent and mark failed results", () => {
  for (const source of [ticketDelivery, comboOffers]) {
    assert.match(source, /const markSentResult = await markWhatsAppOutboundDeliverySent/);
    assert.match(source, /if \(!markSentResult\.ok\)/);
    assert.match(source, /const markFailedResult = await markWhatsAppOutboundDeliveryFailed/);
    assert.match(source, /if \(!markFailedResult\.ok\)/);
    assert.match(source, /getDeliveryStateUpdateFailureCode/);
  }
  assert.match(ticketDelivery, /Failed to mark ticket WhatsApp delivery text as sent/);
  assert.match(ticketDelivery, /Failed to mark ticket QR WhatsApp delivery as sent/);
  assert.match(comboOffers, /Failed to mark combo text WhatsApp delivery as sent/);
  assert.match(comboOffers, /Failed to mark combo QR WhatsApp delivery as sent/);
});

test("failed send and failed persistence mark delivery failed without changing whatsapp_messages history role", () => {
  for (const source of [ticketDelivery, comboOffers]) {
    assert.match(source, /saveWhatsAppMessage\(/);
    assert.match(source, /sendZapi(Text|Image)/);
    assert.match(source, /whatsapp_message_persist_failed/);
    assert.match(source, /error: [a-zA-Z]+Result\.error/);
    assert.doesNotMatch(source, /retry|next_attempt|worker|cron/i);
  }
});

test("idempotency phase is limited to paid ticket and combo deliveries", () => {
  assert.doesNotMatch(comboRedemptions, /whatsappOutboundDeliveries|paid-ticket|paid-combo/);
  assert.doesNotMatch(reservationExpiry, /whatsappOutboundDeliveries|paid-ticket|paid-combo/);
  assert.doesNotMatch(finalizer, /whatsappOutboundDeliveries|paid-ticket|paid-combo/);
});
