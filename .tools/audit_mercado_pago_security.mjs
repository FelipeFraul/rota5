import { createHmac, randomUUID } from "node:crypto";
import { createServer } from "node:http";
import { spawn, spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

const PREFIX = "TEST_MERCADO_PAGO_SECURITY";
const APP_PORT = 3374;
const MP_PORT = 4604;
const ZAPI_PORT = 4605;
const APP_BASE_URL = `http://127.0.0.1:${APP_PORT}`;
const MP_BASE_URL = `http://127.0.0.1:${MP_PORT}`;
const ZAPI_BASE_URL = `http://127.0.0.1:${ZAPI_PORT}`;
const WEBHOOK_URL = `${APP_BASE_URL}/api/webhook/payment/mercado-pago`;
const CHECKOUT_URL = `${APP_BASE_URL}/api/checkout/mercado-pago`;
const CHECKOUT_SECRET = "audit-checkout-secret";
const WEBHOOK_SECRET = "audit-mp-webhook-secret";
const ACCESS_TOKEN = "APP_USR-audit-access-token";
const CUSTOMER_PHONE = "559981399301";
const CUSTOMER_PHONE_PREFIX = CUSTOMER_PHONE.slice(0, -2);
let customerCounter = 0;

function parseEnvFile(path) {
  const env = {};
  const raw = readFileSync(path, "utf8");
  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#") || !trimmed.includes("=")) continue;
    const index = trimmed.indexOf("=");
    const key = trimmed.slice(0, index).trim();
    let value = trimmed.slice(index + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    env[key] = value;
  }
  return env;
}

const fileEnv = parseEnvFile(".env");
const testEnv = {
  ...process.env,
  ...fileEnv,
  NODE_ENV: "test",
  APP_BASE_URL,
  MERCADO_PAGO_API_BASE_URL: MP_BASE_URL,
  MERCADO_PAGO_ACCESS_TOKEN: ACCESS_TOKEN,
  MERCADO_PAGO_WEBHOOK_SECRET: WEBHOOK_SECRET,
  CHECKOUT_INTERNAL_SECRET: CHECKOUT_SECRET,
  NEXT_PUBLIC_MERCADO_PAGO_PUBLIC_KEY: "APP_USR-audit-public-key",
  PAYMENT_PROVIDER: "mercado_pago",
  ZAPI_BASE_URL,
  ZAPI_INSTANCE_ID: "audit-instance",
  ZAPI_INSTANCE_TOKEN: "audit-instance-token",
  ZAPI_CLIENT_TOKEN: "audit-client-token",
  ZAPI_WEBHOOK_SECRET: fileEnv.ZAPI_WEBHOOK_SECRET || "audit-zapi-webhook-secret",
  TICKET_QR_SECRET:
    fileEnv.TICKET_QR_SECRET ||
    "audit-ticket-qr-secret-with-at-least-thirty-two-chars",
  TICKET_RESERVATION_TTL_MINUTES: "10",
  GATE_ADMIN_SECRET: fileEnv.GATE_ADMIN_SECRET || "audit-gate-admin-secret",
  GATE_SESSION_SECRET:
    fileEnv.GATE_SESSION_SECRET ||
    "audit-gate-session-secret-with-at-least-thirty-two-chars",
  GATE_SESSION_TTL_MINUTES: fileEnv.GATE_SESSION_TTL_MINUTES || "480",
  SEAT_MAP_STORAGE_BUCKET: fileEnv.SEAT_MAP_STORAGE_BUCKET || "seat-maps",
};

for (const key of ["SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY"]) {
  if (!testEnv[key]) throw new Error(`Missing required env: ${key}`);
}

const service = createClient(testEnv.SUPABASE_URL, testEnv.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

const payments = new Map();
let failZapi = false;
let zapiSendCount = 0;

function assert(condition, label, details) {
  if (!condition) throw new Error(`${label}${details ? `: ${details}` : ""}`);
  console.log(`ok - ${label}`);
}

function assertNotIncludes(value, expected, label) {
  assert(!String(value).includes(expected), label, `unexpected ${expected}`);
}

function centsToAmount(cents) {
  return Number((cents / 100).toFixed(2));
}

function externalReference(orderId) {
  return `ticket_order_${orderId}`;
}

function paymentId(label) {
  return `${PREFIX}_${label}_${Date.now()}_${Math.random().toString(16).slice(2)}`;
}

function eventKey(label) {
  return `${PREFIX}_${label}_${Date.now()}_${Math.random().toString(16).slice(2)}`;
}

function mpSignature({ requestId, paymentId: id, timestamp = String(Date.now()) }) {
  const manifest = `id:${id};request-id:${requestId};ts:${timestamp};`;
  const signature = createHmac("sha256", WEBHOOK_SECRET).update(manifest).digest("hex");
  return `ts=${timestamp},v1=${signature}`;
}

async function cleanup() {
  const { data: customers } = await service
    .from("customers")
    .select("id")
    .like("whatsapp_phone", `${CUSTOMER_PHONE_PREFIX}%`);
  const customerIds = (customers ?? []).map((row) => row.id);

  let orderIds = [];
  let reservationIds = [];
  if (customerIds.length) {
    const { data: reservations } = await service
      .from("reservations")
      .select("id")
      .in("customer_id", customerIds);
    reservationIds = (reservations ?? []).map((row) => row.id);
    const { data: orders } = await service
      .from("orders")
      .select("id")
      .in("customer_id", customerIds);
    orderIds = (orders ?? []).map((row) => row.id);
  }

  if (orderIds.length) {
    await service.from("tickets").delete().in("order_id", orderIds);
    await service.from("payments").delete().in("order_id", orderIds);
    await service.from("orders").delete().in("id", orderIds);
  }
  if (reservationIds.length) {
    await service.from("reservation_items").delete().in("reservation_id", reservationIds);
    await service.from("session_seats").update({
      status: "available",
      current_reservation_id: null,
      sold_ticket_id: null,
    }).in("current_reservation_id", reservationIds);
    await service.from("reservations").delete().in("id", reservationIds);
  }
  if (customerIds.length) {
    const { data: conversations } = await service
      .from("conversations")
      .select("id")
      .in("customer_id", customerIds);
    const conversationIds = (conversations ?? []).map((row) => row.id);
    if (conversationIds.length) {
      await service.from("whatsapp_messages").delete().in("conversation_id", conversationIds);
      await service.from("conversations").delete().in("id", conversationIds);
    }
    await service.from("customers").delete().in("id", customerIds);
  }

  const { data: events } = await service
    .from("events")
    .select("id, venue_id")
    .like("title", `${PREFIX}%`);
  const eventIds = (events ?? []).map((row) => row.id);
  const venueIds = [...new Set((events ?? []).map((row) => row.venue_id).filter(Boolean))];
  if (eventIds.length) {
    const { data: sessions } = await service
      .from("event_sessions")
      .select("id")
      .in("event_id", eventIds);
    const sessionIds = (sessions ?? []).map((row) => row.id);
    if (sessionIds.length) {
      await service.from("ticket_prices").delete().in("session_id", sessionIds);
      await service.from("session_seats").delete().in("session_id", sessionIds);
      await service.from("event_sessions").delete().in("id", sessionIds);
    }
    await service.from("events").delete().in("id", eventIds);
  }
  if (venueIds.length) {
    const { data: sections } = await service
      .from("venue_sections")
      .select("id")
      .in("venue_id", venueIds);
    const sectionIds = (sections ?? []).map((row) => row.id);
    if (sectionIds.length) {
      await service.from("seats").delete().in("section_id", sectionIds);
      await service.from("venue_sections").delete().in("id", sectionIds);
    }
    await service.from("venues").delete().in("id", venueIds);
  }

  const { data: paymentEvents } = await service
    .from("payment_events")
    .select("id")
    .or(`event_key.like.${PREFIX}%,provider_payment_id.like.${PREFIX}%`);
  const paymentEventIds = (paymentEvents ?? []).map((row) => row.id);
  if (paymentEventIds.length) {
    await service.from("payment_events").delete().in("id", paymentEventIds);
  }
}

async function insert(table, payload) {
  const { data, error } = await service.from(table).insert(payload).select("id").single();
  if (error) throw new Error(`insert ${table}: ${error.message}`);
  return data.id;
}

async function getAuditCustomerId() {
  customerCounter += 1;
  return insert("customers", {
    whatsapp_phone: `${CUSTOMER_PHONE_PREFIX}${String(customerCounter).padStart(2, "0")}`,
    name: `${PREFIX} Buyer`,
  });
}

async function createFixture(label, options = {}) {
  const total = options.total ?? 1000;
  const fee = options.fee ?? 100;
  const customerId = await getAuditCustomerId();
  await insert("conversations", {
    customer_id: customerId,
    status: "open",
    context: {},
  });
  const venueId = await insert("venues", {
    name: `${PREFIX} Venue ${label}`,
    city: "Sorocaba",
    state: "SP",
  });
  const sectionId = await insert("venue_sections", {
    venue_id: venueId,
    name: `${PREFIX} Section ${label}`,
    slug: `sec-${label.toLowerCase()}-${Date.now()}`,
    capacity: 10,
    has_numbered_seats: true,
  });
  const seatId = await insert("seats", {
    venue_id: venueId,
    section_id: sectionId,
    row_label: "A",
    seat_number: "1",
    seat_code: `A-${label}`,
  });
  const eventId = await insert("events", {
    title: `${PREFIX} Event ${label}`,
    artist_name: "Audit Artist",
    city: "Sorocaba",
    state: "SP",
    venue_id: venueId,
    status: "published",
  });
  const sessionId = await insert("event_sessions", {
    event_id: eventId,
    venue_id: venueId,
    starts_at: "2026-08-08T16:00:00.000Z",
    status: "sales_open",
  });
  const sessionSeatId = await insert("session_seats", {
    session_id: sessionId,
    seat_id: seatId,
    section_id: sectionId,
    status: "available",
  });
  const ticketPriceId = await insert("ticket_prices", {
    session_id: sessionId,
    section_id: sectionId,
    ticket_type: "full",
    label: "Inteira",
    price_cents: total,
    fee_cents: fee,
    status: "active",
  });
  const reservationId = await insert("reservations", {
    customer_id: customerId,
    session_id: sessionId,
    status: options.reservationStatus ?? "active",
    expires_at: new Date(Date.now() + 30 * 60_000).toISOString(),
    total_amount_cents: total,
    total_fee_cents: fee,
  });
  await service.from("session_seats").update({
    status: options.seatStatus ?? "reserved",
    current_reservation_id:
      options.currentReservationId === false ? randomUUID() : reservationId,
  }).eq("id", sessionSeatId);
  await insert("reservation_items", {
    reservation_id: reservationId,
    session_seat_id: sessionSeatId,
    seat_id: seatId,
    section_id: sectionId,
    ticket_price_id: ticketPriceId,
    seat_code: `A-${label}`,
    ticket_type: "full",
    price_cents: total,
    fee_cents: fee,
  });
  const orderId = await insert("orders", {
    reservation_id: reservationId,
    customer_id: customerId,
    status: options.orderStatus ?? "pending_payment",
    total_amount_cents: total,
    total_fee_cents: fee,
  });
  await service.from("orders").update({
    external_reference: externalReference(orderId),
  }).eq("id", orderId);

  return {
    customerId,
    orderId,
    reservationId,
    sessionSeatId,
    amountCents: total + fee,
  };
}

async function countTickets(orderId) {
  const { count, error } = await service
    .from("tickets")
    .select("id", { count: "exact", head: true })
    .eq("order_id", orderId);
  if (error) throw error;
  return count ?? 0;
}

async function getOrder(orderId) {
  const { data, error } = await service
    .from("orders")
    .select("status")
    .eq("id", orderId)
    .single();
  if (error) throw error;
  return data;
}

async function getPaymentByProviderId(providerPaymentId) {
  const { data, error } = await service
    .from("payments")
    .select("order_id, status, amount_cents, raw_metadata")
    .eq("provider_payment_id", providerPaymentId)
    .maybeSingle();
  if (error) throw error;
  return data;
}

async function getPaymentEvent(key) {
  const { data, error } = await service
    .from("payment_events")
    .select("processed_at, raw_metadata")
    .eq("provider", "mercado_pago")
    .eq("event_key", key)
    .single();
  if (error) throw error;
  return data;
}

async function startMercadoPagoMock() {
  return new Promise((resolve) => {
    const server = createServer((request, response) => {
      const url = new URL(request.url ?? "/", MP_BASE_URL);
      const id = decodeURIComponent(url.pathname.split("/").pop() ?? "");
      if (id.includes("api500")) {
        response.writeHead(500, { "content-type": "application/json" });
        response.end(JSON.stringify({ error: "temporary" }));
        return;
      }
      const payment = payments.get(id);
      if (!payment) {
        response.writeHead(404, { "content-type": "application/json" });
        response.end(JSON.stringify({ error: "not_found" }));
        return;
      }
      response.writeHead(200, { "content-type": "application/json" });
      response.end(JSON.stringify(payment));
    });
    server.listen(MP_PORT, "127.0.0.1", () => resolve(server));
  });
}

async function startZapiMock() {
  return new Promise((resolve) => {
    const server = createServer((request, response) => {
      request.on("data", (chunk) => {
        void chunk;
      });
      request.on("end", () => {
        zapiSendCount += 1;
        response.writeHead(failZapi ? 500 : 200, { "content-type": "application/json" });
        response.end(JSON.stringify({ id: `zapi-${zapiSendCount}` }));
      });
    });
    server.listen(ZAPI_PORT, "127.0.0.1", () => resolve(server));
  });
}

async function waitForHealth() {
  const deadline = Date.now() + 60_000;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(`${APP_BASE_URL}/api/health`);
      if (response.ok) return;
    } catch {
      // keep waiting
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error("Next server did not become healthy");
}

async function startNext() {
  const child = spawn(process.execPath, ["node_modules/next/dist/bin/next", "start", "--hostname", "127.0.0.1", "--port", String(APP_PORT)], {
    cwd: process.cwd(),
    env: testEnv,
    stdio: ["ignore", "pipe", "pipe"],
  });
  child.stdout.on("data", (chunk) => process.stdout.write(`[next] ${chunk}`));
  child.stderr.on("data", (chunk) => process.stderr.write(`[next] ${chunk}`));
  await waitForHealth();
  return child;
}

async function stopChild(child) {
  if (!child || child.killed) return;
  if (process.platform === "win32" && child.pid) {
    spawnSync("taskkill.exe", ["/PID", String(child.pid), "/T", "/F"], {
      stdio: "ignore",
    });
    return;
  }
  child.kill("SIGTERM");
  await new Promise((resolve) => child.once("exit", resolve));
}

function registerPayment(id, { status = "approved", orderId, amountCents, external_reference } = {}) {
  payments.set(id, {
    id,
    status,
    external_reference: external_reference ?? (orderId ? externalReference(orderId) : null),
    transaction_amount: centsToAmount(amountCents ?? 1100),
    date_approved: "2026-05-26T12:00:00.000Z",
    currency_id: "BRL",
    payment_method_id: "pix",
    payment_type_id: "bank_transfer",
  });
}

async function callWebhook({ id, key, body = null, signature = true } = {}) {
  const payload = body ?? { type: "payment", action: "payment.updated", data: { id } };
  const rawBody = JSON.stringify(payload);
  const headers = { "content-type": "application/json" };
  if (signature) {
    headers["x-request-id"] = key;
    headers["x-signature"] = signature === "invalid"
      ? "ts=1,v1=deadbeef"
      : mpSignature({ requestId: key, paymentId: id });
  }
  const response = await fetch(WEBHOOK_URL, {
    method: "POST",
    headers,
    body: rawBody,
  });
  const json = await response.json().catch(() => ({}));
  return { response, json };
}

async function callCheckout(orderId, secret = CHECKOUT_SECRET) {
  const response = await fetch(CHECKOUT_URL, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...(secret ? { "x-checkout-secret": secret } : {}),
    },
    body: JSON.stringify({ order_id: orderId }),
  });
  const json = await response.json().catch(() => ({}));
  return { response, json };
}

async function verifyNoSensitiveMetadata() {
  const { data, error } = await service
    .from("payment_events")
    .select("raw_metadata")
    .or(`event_key.like.${PREFIX}%,provider_payment_id.like.${PREFIX}%`);
  if (error) throw error;
  const serialized = JSON.stringify(data ?? []);
  assertNotIncludes(serialized, WEBHOOK_SECRET, "T) payment_events sem webhook secret");
  assertNotIncludes(serialized, ACCESS_TOKEN, "T) payment_events sem access token");
  assertNotIncludes(serialized, "x-signature", "T) payment_events sem headers completos");
  assertNotIncludes(serialized, "checkout_url", "T) payment_events sem checkout_url");
}

async function main() {
  await cleanup();
  const mpServer = await startMercadoPagoMock();
  const zapiServer = await startZapiMock();
  let nextChild;
  try {
    nextChild = await startNext();

    let result = await fetch(WEBHOOK_URL, { method: "POST", body: "{}" });
    assert(result.status === 401, "A) webhook sem assinatura retorna 401");

    result = (await callWebhook({ id: "invalid", key: eventKey("B"), signature: "invalid" })).response;
    assert(result.status === 401, "B) webhook com assinatura inválida retorna 401");

    result = (await callWebhook({ id: "unused", key: eventKey("C"), body: { type: "payment" }, signature: false })).response;
    assert(result.status === 401 || result.status === 400, "C) payment_id ausente é resposta segura");

    for (const status of ["pending", "rejected", "cancelled", "refunded"]) {
      const fixture = await createFixture(`NON_${status}`);
      const id = paymentId(`NON_${status}`);
      const key = eventKey(`NON_${status}`);
      registerPayment(id, { status, orderId: fixture.orderId, amountCents: fixture.amountCents });
      const webhook = await callWebhook({ id, key });
      assert(webhook.response.ok, `D/E) payment ${status} retorna 200 seguro`);
      assert((await countTickets(fixture.orderId)) === 0, `D/E) payment ${status} não emite ticket`);
      assert((await getPaymentEvent(key)).processed_at, `D/E) payment ${status} marca evento processado`);
    }

    let fixture = await createFixture("BAD_REF");
    let id = paymentId("BAD_REF");
    let key = eventKey("BAD_REF");
    registerPayment(id, { external_reference: "bad_reference", amountCents: fixture.amountCents });
    result = (await callWebhook({ id, key })).response;
    assert(result.ok && (await countTickets(fixture.orderId)) === 0, "F) external_reference inválido ignora seguro");

    id = paymentId("MISSING_ORDER");
    key = eventKey("MISSING_ORDER");
    registerPayment(id, { external_reference: `ticket_order_${randomUUID()}`, amountCents: 1100 });
    result = (await callWebhook({ id, key })).response;
    assert(result.ok, "G) order inexistente ignora seguro");

    fixture = await createFixture("LOW_AMOUNT");
    id = paymentId("LOW_AMOUNT");
    key = eventKey("LOW_AMOUNT");
    registerPayment(id, { orderId: fixture.orderId, amountCents: fixture.amountCents - 1 });
    result = (await callWebhook({ id, key })).response;
    assert(result.ok && (await countTickets(fixture.orderId)) === 0, "H) valor menor bloqueia sem emitir ticket");
    assert((await getPaymentEvent(key)).processed_at, "H) valor menor marca evento como definitivo");

    fixture = await createFixture("OK_AMOUNT");
    id = paymentId("OK_AMOUNT");
    key = eventKey("OK_AMOUNT");
    registerPayment(id, { orderId: fixture.orderId, amountCents: fixture.amountCents });
    result = (await callWebhook({ id, key })).response;
    assert(result.ok, "I) valor correto processa webhook");
    assert((await getOrder(fixture.orderId)).status === "paid", "I) order paid");
    assert((await countTickets(fixture.orderId)) === 1, "I) ticket emitido");

    const duplicate = await callWebhook({ id, key });
    assert(duplicate.response.ok && duplicate.json.duplicate === true, "K) evento duplicado processed_at não reprocessa");
    assert((await countTickets(fixture.orderId)) === 1, "K) duplicado não duplica ticket");

    fixture = await createFixture("OVER_AMOUNT");
    id = paymentId("OVER_AMOUNT");
    key = eventKey("OVER_AMOUNT");
    registerPayment(id, { orderId: fixture.orderId, amountCents: fixture.amountCents + 500 });
    result = (await callWebhook({ id, key })).response;
    const overPayment = await getPaymentByProviderId(id);
    assert(result.ok && (await countTickets(fixture.orderId)) === 1, "J) valor maior aceita conforme regra documentada");
    assert(overPayment.amount_cents === fixture.amountCents + 500, "J) payment registra valor pago maior");

    fixture = await createFixture("RETRY_NULL");
    id = paymentId("RETRY_NULL");
    key = eventKey("RETRY_NULL");
    await service.from("payment_events").insert({
      provider: "mercado_pago",
      event_key: key,
      event_type: "payment.updated",
      provider_payment_id: id,
      raw_metadata: { audit: true },
    });
    registerPayment(id, { orderId: fixture.orderId, amountCents: fixture.amountCents });
    result = (await callWebhook({ id, key })).response;
    assert(result.ok && (await countTickets(fixture.orderId)) === 1, "L) evento processed_at null reprocessa");

    fixture = await createFixture("CONCURRENT");
    id = paymentId("CONCURRENT");
    registerPayment(id, { orderId: fixture.orderId, amountCents: fixture.amountCents });
    const [concurrentA, concurrentB] = await Promise.all([
      callWebhook({ id, key: eventKey("CONCURRENT_A") }),
      callWebhook({ id, key: eventKey("CONCURRENT_B") }),
    ]);
    assert(concurrentA.response.ok && concurrentB.response.ok, "M) chamadas simultâneas retornam seguro");
    assert((await countTickets(fixture.orderId)) === 1, "M) chamadas simultâneas não duplicam ticket");

    const linkedFixture = await createFixture("LINKED_ORIGINAL");
    id = paymentId("LINKED");
    key = eventKey("LINKED_ORIGINAL");
    registerPayment(id, { orderId: linkedFixture.orderId, amountCents: linkedFixture.amountCents });
    await callWebhook({ id, key });
    const secondFixture = await createFixture("LINKED_SECOND");
    payments.set(id, {
      ...payments.get(id),
      external_reference: externalReference(secondFixture.orderId),
      transaction_amount: centsToAmount(secondFixture.amountCents),
    });
    result = (await callWebhook({ id, key: eventKey("LINKED_SECOND") })).response;
    assert(result.ok && (await countTickets(secondFixture.orderId)) === 0, "N) mesmo provider_payment_id em outra order bloqueia");

    for (const orderStatus of ["expired", "cancelled"]) {
      fixture = await createFixture(`ORDER_${orderStatus}`, { orderStatus });
      id = paymentId(`ORDER_${orderStatus}`);
      key = eventKey(`ORDER_${orderStatus}`);
      registerPayment(id, { orderId: fixture.orderId, amountCents: fixture.amountCents });
      result = (await callWebhook({ id, key })).response;
      assert(result.ok && (await countTickets(fixture.orderId)) === 0, `O) order ${orderStatus} não confirma`);
    }

    for (const reservationStatus of ["expired", "cancelled"]) {
      fixture = await createFixture(`RES_${reservationStatus}`, { reservationStatus });
      id = paymentId(`RES_${reservationStatus}`);
      key = eventKey(`RES_${reservationStatus}`);
      registerPayment(id, { orderId: fixture.orderId, amountCents: fixture.amountCents });
      result = (await callWebhook({ id, key })).response;
      assert(result.ok && (await countTickets(fixture.orderId)) === 0, `P) reservation ${reservationStatus} não confirma`);
    }

    fixture = await createFixture("BAD_SEAT", { seatStatus: "available", currentReservationId: false });
    id = paymentId("BAD_SEAT");
    key = eventKey("BAD_SEAT");
    registerPayment(id, { orderId: fixture.orderId, amountCents: fixture.amountCents });
    result = (await callWebhook({ id, key })).response;
    assert(result.ok && (await countTickets(fixture.orderId)) === 0, "Q) session_seat errado bloqueia");

    fixture = await createFixture("API500");
    id = paymentId("api500");
    key = eventKey("API500");
    registerPayment(id, { orderId: fixture.orderId, amountCents: fixture.amountCents });
    result = (await callWebhook({ id, key })).response;
    assert(result.status === 500, "R) falha API Mercado Pago retorna transitório");
    assert(!(await getPaymentEvent(key)).processed_at, "R) falha API não marca processed_at");

    failZapi = true;
    fixture = await createFixture("ZAPI_FAIL");
    id = paymentId("ZAPI_FAIL");
    key = eventKey("ZAPI_FAIL");
    registerPayment(id, { orderId: fixture.orderId, amountCents: fixture.amountCents });
    result = (await callWebhook({ id, key })).response;
    failZapi = false;
    assert(result.ok, "S) falha Z-API após emissão não falha webhook");
    assert((await getOrder(fixture.orderId)).status === "paid", "S) falha Z-API não desfaz pagamento");
    assert((await countTickets(fixture.orderId)) === 1, "S) falha Z-API não desfaz ticket");

    await verifyNoSensitiveMetadata();

    result = (await fetch(CHECKOUT_URL, { method: "POST", body: "{}" }));
    assert(result.status === 401, "U) checkout sem secret retorna 401");

    fixture = await createFixture("CHECKOUT_EXPIRED");
    const pastCreatedAt = new Date(Date.now() - 20 * 60_000).toISOString();
    const pastExpiresAt = new Date(Date.now() - 10 * 60_000).toISOString();
    await service.from("reservations").update({
      created_at: pastCreatedAt,
      expires_at: pastExpiresAt,
    }).eq("id", fixture.reservationId);
    const expiredCheckout = await callCheckout(fixture.orderId);
    assert(expiredCheckout.response.status === 400, "V) checkout com order/reservation expirada bloqueia");
    assert(JSON.stringify(expiredCheckout.json).includes("reservation_expired"), "V) motivo reservation_expired");

    fixture = await createFixture("CHECKOUT_MISMATCH");
    await service.from("orders").update({ total_amount_cents: 1, total_fee_cents: 0 }).eq("id", fixture.orderId);
    const mismatchCheckout = await callCheckout(fixture.orderId);
    assert(mismatchCheckout.response.status === 400, "W) checkout com totais divergentes bloqueia");
    assert(JSON.stringify(mismatchCheckout.json).includes("checkout_amount_mismatch"), "W) motivo checkout_amount_mismatch");
  } finally {
    await stopChild(nextChild);
    await new Promise((resolve) => mpServer.close(resolve));
    await new Promise((resolve) => zapiServer.close(resolve));
    await cleanup();
  }

  const { count: remainingEvents } = await service
    .from("events")
    .select("id", { count: "exact", head: true })
    .like("title", `${PREFIX}%`);
  assert((remainingEvents ?? 0) === 0, "X) cleanup completo");
}

main().catch(async (error) => {
  console.error(error);
  await cleanup().catch(() => null);
  process.exit(1);
});
