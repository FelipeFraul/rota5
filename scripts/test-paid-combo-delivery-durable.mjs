import assert from "node:assert/strict";
import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import { readFileSync } from "node:fs";
import test from "node:test";
import { loadProductionModule, MemorySupabase } from "./test-support/production-module-harness.mjs";

const secret = "paid-combo-delivery-test-secret-0000000001";
const comboOffers = readFileSync("src/lib/tickets/services/comboOffers.ts", "utf8");
const comboRedemptions = readFileSync("src/lib/tickets/services/comboRedemptions.ts", "utf8");
const migration = readFileSync("supabase/migrations/20260915000200_make_paid_combo_delivery_durable.sql", "utf8");
const codeMigration = readFileSync("supabase/migrations/20260915000300_make_combo_redemption_codes_collision_safe.sql", "utf8");
const privilegeMigration = readFileSync("supabase/migrations/20260915000400_minimize_combo_redemption_code_sequence_privileges.sql", "utf8");
const metadataTransitionMigration = readFileSync("supabase/migrations/20260915000500_serialize_combo_metadata_transitions.sql", "utf8");
const worker = readFileSync("src/lib/tickets/services/paidComboDeliveryWorker.ts", "utf8");
const cron = readFileSync("src/app/api/cron/process-whatsapp-batches/route.ts", "utf8");
const webhook = readFileSync("src/app/api/webhook/payment/mercado-pago/route.ts", "utf8");

test("combo redemption tokens are deterministic, versioned and domain-separated", async () => {
  const tokens = await loadProductionModule("src/lib/tickets/services/comboQrTokens.ts", {
    createHash,
    createHmac,
    timingSafeEqual,
    getEnv: () => ({ TICKET_QR_SECRET: secret }),
  });
  const orderId = "50000000-0000-4000-8000-000000000001";
  const first = tokens.createComboRedemptionToken(orderId, 1);
  assert.equal(tokens.createComboRedemptionToken(orderId, 1), first);
  assert.notEqual(tokens.createComboRedemptionToken(orderId, 2), first);
  assert.equal(tokens.comboRedemptionTokenMatchesHash(first, tokens.hashComboRedemptionToken(first)), true);
  assert.equal(tokens.comboRedemptionTokenMatchesHash(first, createHash("sha256").update("other").digest("hex")), false);
  assert.throws(() => tokens.createComboRedemptionToken(orderId, 0), /invalid_combo_qr_token_version/);
});

test("paid combo confirmation persists the complete aggregate and strict financial replay contract", () => {
  assert.match(migration, /create unique index combo_payments_provider_payment_unique_idx/i);
  assert.match(migration, /where provider_payment_id is not null/i);
  assert.match(migration, /create unique index combo_payments_one_approved_per_order_idx/i);
  assert.match(migration, /where status = 'approved'/i);
  assert.match(migration, /create or replace function public\.confirm_paid_combo_order/i);
  assert.match(migration, /p_amount_cents <> v_order\.total_amount_cents/i);
  assert.match(migration, /combo_paid_payment_replay_mismatch/i);
  assert.match(migration, /perform public\.ensure_paid_combo_delivery_intents\(v_order\.id\)/i);
  assert.match(comboOffers, /\.rpc\(\s*"confirm_paid_combo_order"/);
  assert.match(comboOffers, /p_qr_token_hash:\s*hashComboRedemptionToken\(token\)/);
  assert.match(webhook, /confirmation\.legacy_redemption\s*\? null\s*:\s*await deliverComboOrder/);
});

test("combo redemption codes are sequence-backed and delivery reads the persisted code", () => {
  assert.match(codeMigration, /create sequence public\.combo_redemption_code_seq/i);
  assert.match(codeMigration, /maxvalue 9999999999[\s\S]*no cycle/i);
  assert.match(codeMigration, /pg_catalog\.nextval\('public\.combo_redemption_code_seq'::regclass\)/i);
  assert.match(codeMigration, /pg_catalog\.lpad\([^;]+10, '0'\)/i);
  assert.match(codeMigration, /grant usage on sequence public\.combo_redemption_code_seq to service_role/i);
  assert.match(codeMigration, /revoke all on sequence public\.combo_redemption_code_seq from public, anon, authenticated/i);
  assert.match(privilegeMigration, /revoke all on sequence public\.combo_redemption_code_seq from service_role/i);
  assert.match(privilegeMigration, /grant usage on sequence public\.combo_redemption_code_seq to service_role/i);
  const deliveryBody = comboOffers.slice(
    comboOffers.indexOf("export async function deliverComboOrder"),
    comboOffers.indexOf("export async function confirmPaidComboOrder"),
  );
  assert.match(deliveryBody, /redemption_code/);
  assert.match(deliveryBody, /const redemptionCode = existing\.data\.redemption_code/);
  assert.doesNotMatch(deliveryBody, /slice\(0,\s*8\)/);
  assert.doesNotMatch(codeMigration, /pg_catalog\.left\(v_order\.id::text,\s*8\)/i);
});

test("versioned paid combo delivery claims before QR generation and fences every completion", () => {
  const start = comboOffers.indexOf("export async function deliverComboOrder");
  const end = comboOffers.indexOf("export async function confirmPaidComboOrder", start);
  const body = comboOffers.slice(start, end);
  assert.doesNotMatch(body, /randomBytes\(/);
  assert.ok(body.indexOf("const imageClaim") < body.indexOf("comboRedemptionTokenMatchesHash"));
  assert.ok(body.indexOf("comboRedemptionTokenMatchesHash") < body.indexOf("generateComboQrImage"));
  assert.match(body, /claimToken:\s*textClaim\.delivery\.claim_token/g);
  assert.match(body, /claimToken:\s*imageClaim\.delivery\.claim_token/g);
  assert.match(body, /combo_qr_generation_failed/);
});

test("existing versioned redemption retries the same valid token and claims before generation", async () => {
  const orderId = "50000000-0000-4000-8000-000000000001";
  const redemptionId = "60000000-0000-4000-8000-000000000001";
  const derive = (id, version) => createHmac("sha256", secret).update(`combo-redemption:v1:${id}:${version}`).digest("base64url");
  const token = derive(orderId, 1);
  const deliveries = {
    [`paid-combo-order:${orderId}:text:v1`]: { id: "text", status: "pending" },
    [`paid-combo-redemption:${redemptionId}:qr:v1`]: { id: "qr", status: "pending" },
  };
  const events = [];
  let imageAttempts = 0;
  const db = new MemorySupabase({
    combo_orders: [{
      id: orderId, offer_id: "offer", customer_id: "customer", event_id: "event", session_id: "session", source_order_id: null,
      status: "paid", quantity: 1, unit_amount_cents: 1000, total_amount_cents: 1000, currency: "BRL", external_reference: "ref",
      checkout_token_hash: "checkout", checkout_expires_at: "2099-01-01T00:00:00.000Z",
      combo_offers: { name: "Combo", description: "Item", image_url: null, original_price_cents: null },
      customers: { whatsapp_phone: "5511999999999", name: "Buyer" },
      events: { title: "Event", city: "City", state: "SP", venues: { name: "Venue" } },
      event_sessions: { starts_at: "2099-01-01T00:00:00.000Z", timezone: "America/Sao_Paulo", status: "sales_open", events: { status: "published" } },
    }],
    combo_redemptions: [{ id: redemptionId, combo_order_id: orderId, redemption_code: "CMB-0000000042", qr_token_version: 1, qr_token_hash: createHash("sha256").update(token).digest("hex") }],
  });
  const service = await loadProductionModule("src/lib/tickets/services/comboOffers.ts", {
    createHash, createHmac, randomBytes: () => Buffer.alloc(32), timingSafeEqual, QRCode: {},
    createMercadoPagoPayment: async () => ({ ok: false }), getEnv: () => ({ APP_BASE_URL: "http://local", TICKET_QR_SECRET: secret }),
    logError: () => {}, logInfo: () => {}, logWarn: () => {}, getSupabaseAdmin: () => db,
    getComboOfferDelayMinutes: () => 10, normalizeWhatsAppPhone: (x) => x,
    createComboRedemptionToken: derive,
    hashComboRedemptionToken: (x) => createHash("sha256").update(x).digest("hex"),
    comboRedemptionTokenMatchesHash: (x, hash) => createHash("sha256").update(x).digest("hex") === hash,
    ensurePaidComboDeliveryIntents: async () => ({ ok: true, intentsCount: 2 }),
    getWhatsAppOutboundDeliveryByIdempotencyKey: async (key) => ({ ok: true, delivery: deliveries[key] ?? null }),
    claimWhatsAppOutboundDelivery: async (id) => { events.push(`claim:${id}`); return { ok: true, claimed: true, delivery: { claim_token: `claim-${id}` } }; },
    markWhatsAppOutboundDeliveryFailed: async ({ deliveryId, claimToken }) => { assert.equal(claimToken, `claim-${deliveryId}`); Object.values(deliveries).find((d) => d.id === deliveryId).status = "failed"; return { ok: true }; },
    markWhatsAppOutboundDeliverySent: async ({ deliveryId, claimToken }) => { assert.equal(claimToken, `claim-${deliveryId}`); Object.values(deliveries).find((d) => d.id === deliveryId).status = "sent"; return { ok: true }; },
    generateComboQrImage: async ({ qrPayload, redemptionCode }) => { events.push(`generate:${qrPayload}`); events.push(`render-code:${redemptionCode}`); return Buffer.from("qr"); },
    getOrCreateOpenConversation: async () => ({ ok: true, conversation: { id: "conversation" } }),
    updateConversationAfterMessage: async () => ({ ok: true }), upsertCustomerFromWhatsApp: async () => ({ ok: true }),
    saveWhatsAppMessage: async () => ({ ok: true }), buildWhatsAppOutboundMetadata: (x) => x,
    centsToDecimalAmount: (x) => x / 100, decimalAmountToCents: (x) => Math.round(Number(x) * 100),
    getPublicEventVisibilityQueryFloorIso: () => "2000-01-01T00:00:00.000Z", getPublicVisibleSessionStatuses: () => [], isPublicEventVisible: () => true, PUBLIC_VISIBLE_EVENT_STATUSES: ["published"],
    getOrCreateWhatsAppOutboundDelivery: async () => ({ ok: false }),
    sendZapiText: async ({ message }) => { events.push(`text:${message}`); return { ok: true, providerMessageId: "text-provider" }; },
    sendZapiImage: async ({ caption }) => { events.push(`caption:${caption}`); imageAttempts += 1; return imageAttempts === 1 ? { ok: false, error: "timeout" } : { ok: true, providerMessageId: "qr-provider" }; },
  });

  assert.equal((await service.deliverComboOrder(orderId)).sent, false);
  assert.equal((await service.deliverComboOrder(orderId)).sent, true);
  const generated = events.filter((event) => event.startsWith("generate:"));
  assert.deepEqual(generated, [`generate:combo:${redemptionId}:${token}`, `generate:combo:${redemptionId}:${token}`]);
  assert.equal(events.filter((event) => event === "render-code:CMB-0000000042").length, 2);
  assert.ok(events.some((event) => event.startsWith("text:") && event.includes("CMB-0000000042")));
  assert.ok(events.some((event) => event.startsWith("caption:") && event.includes("CMB-0000000042")));
  assert.ok(events.indexOf("claim:qr") < events.indexOf(generated[0]));
});

test("hash mismatch is persisted as failed and never reaches the image provider", async () => {
  assert.match(comboOffers, /combo_qr_token_hash_mismatch/);
  assert.ok(comboOffers.indexOf("comboRedemptionTokenMatchesHash") < comboOffers.indexOf("sendZapiImage", comboOffers.indexOf("export async function deliverComboOrder")));
});

test("combo reasons use bounded lease recovery and ordered automatic scheduling", () => {
  for (const reason of ["paid_combo_delivery", "paid_combo_qr_delivery", "combo_ready_at_bar", "combo_ready_qr"]) {
    assert.match(migration, new RegExp(reason));
  }
  assert.match(migration, /delivery\.attempt_count<5/i);
  assert.match(migration, /delivery\.lease_expires_at<=pg_catalog\.now\(\)/i);
  assert.match(migration, /create or replace function public\.list_due_paid_combo_delivery_tasks/i);
  assert.match(migration, /status='dead_letter'/i);
  assert.match(migration, /delivery_order', 10/i);
  assert.match(migration, /delivery_order', 20/i);
  assert.match(worker, /deliverComboOrder/);
  assert.match(worker, /deliverComboReadyNotification/);
  assert.match(cron, /processDuePaidComboDeliveries\(\)/);
});

test("versioned ready rotation is atomic, stable on retry and never rolls its hash back", () => {
  assert.match(migration, /create or replace function public\.prepare_combo_ready_delivery/i);
  assert.match(migration, /v_prepared_version is not null/i);
  assert.match(migration, /perform public\.ensure_combo_ready_delivery_intents/i);
  assert.match(migration, /qr_token_version=p_next_version[\s\S]*qr_token_hash=p_next_qr_token_hash/i);
  assert.match(comboRedemptions, /prepare_combo_ready_delivery/);
  assert.match(comboRedemptions, /qr_token_version != null[\s\S]*prepare_combo_ready_delivery/);
  assert.match(comboRedemptions, /prepare_legacy_combo_ready_delivery/);
  assert.doesNotMatch(comboRedemptions, /raw_metadata:\s*\{/);
  assert.match(metadataTransitionMigration, /create or replace function public\.complete_legacy_combo_ready_recovery/i);
  assert.match(migration, /ready_completion as/i);
  assert.match(comboRedemptions, /deliverComboReadyNotification/);
  const versionedDelivery = comboRedemptions.slice(
    comboRedemptions.indexOf("export async function deliverComboReadyNotification"),
    comboRedemptions.indexOf("export async function startKitchenOrderPreparation"),
  );
  assert.doesNotMatch(versionedDelivery, /randomBytes\(/);
  assert.doesNotMatch(versionedDelivery, /qr_token_hash:\s*redemption\.qr_token_hash/);
  assert.match(versionedDelivery, /claimToken:\s*claim\.delivery\.claim_token/g);
});
