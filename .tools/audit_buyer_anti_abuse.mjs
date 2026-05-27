import { createHash } from "node:crypto";
import { createServer } from "node:http";
import { spawn } from "node:child_process";
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

const PREFIX = "TEST_BUYER_ANTI_ABUSE";
const APP_PORT = 3378;
const ZAPI_PORT = 4610;
const APP_BASE_URL = `http://127.0.0.1:${APP_PORT}`;
const ZAPI_BASE_URL = `http://127.0.0.1:${ZAPI_PORT}`;
const WEBHOOK_URL = `${APP_BASE_URL}/api/webhook/zapi`;
const STARTS_AT = "2026-08-08T16:00:00.000Z";

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
  APP_BASE_URL,
  ZAPI_BASE_URL,
  ZAPI_INSTANCE_ID: "audit-instance",
  ZAPI_INSTANCE_TOKEN: "audit-token",
  ZAPI_CLIENT_TOKEN: "audit-client",
  CHECKOUT_INTERNAL_SECRET:
    fileEnv.CHECKOUT_INTERNAL_SECRET || "audit-checkout-internal-secret",
  PAYMENT_PROVIDER: fileEnv.PAYMENT_PROVIDER || "mercado_pago",
  MERCADO_PAGO_ACCESS_TOKEN:
    fileEnv.MERCADO_PAGO_ACCESS_TOKEN || "APP_USR-audit-access-token",
  MERCADO_PAGO_WEBHOOK_SECRET:
    fileEnv.MERCADO_PAGO_WEBHOOK_SECRET || "audit-mercado-pago-webhook-secret",
  NEXT_PUBLIC_MERCADO_PAGO_PUBLIC_KEY:
    fileEnv.NEXT_PUBLIC_MERCADO_PAGO_PUBLIC_KEY || "APP_USR-audit-public-key",
  TICKET_RESERVATION_TTL_MINUTES:
    fileEnv.TICKET_RESERVATION_TTL_MINUTES || "10",
  TICKET_QR_SECRET:
    fileEnv.TICKET_QR_SECRET ||
    "audit-ticket-qr-secret-with-at-least-thirty-two-chars",
  GATE_ADMIN_SECRET: fileEnv.GATE_ADMIN_SECRET || "audit-gate-admin-secret",
  GATE_SESSION_SECRET:
    fileEnv.GATE_SESSION_SECRET ||
    "audit-gate-session-secret-with-at-least-thirty-two-chars",
  GATE_SESSION_TTL_MINUTES: fileEnv.GATE_SESSION_TTL_MINUTES || "480",
  SEAT_MAP_STORAGE_BUCKET: fileEnv.SEAT_MAP_STORAGE_BUCKET || "seat-maps",
};

for (const key of [
  "SUPABASE_URL",
  "SUPABASE_SERVICE_ROLE_KEY",
  "ZAPI_WEBHOOK_SECRET",
]) {
  if (!testEnv[key]) throw new Error(`Missing required env: ${key}`);
}

const supabase = createClient(
  testEnv.SUPABASE_URL,
  testEnv.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false } },
);

const zapiMessages = [];
let zapiCounter = 0;
let phoneCounter = 5000;
let messageCounter = 1;

function assert(condition, label, details) {
  if (!condition) throw new Error(`${label}${details ? `: ${details}` : ""}`);
  console.log(`ok - ${label}`);
}

function assertIncludes(value, expected, label) {
  assert(
    String(value).includes(expected),
    label,
    `expected ${JSON.stringify(expected)} in ${JSON.stringify(String(value).slice(0, 500))}`,
  );
}

function assertNotIncludes(value, expected, label) {
  assert(
    !String(value).includes(expected),
    label,
    `unexpected ${JSON.stringify(expected)} in ${JSON.stringify(String(value).slice(0, 500))}`,
  );
}

function hash(value) {
  return createHash("sha256").update(value).digest("hex");
}

function auditPhone() {
  phoneCounter += 1;
  return `5599100${String(phoneCounter).padStart(4, "0")}`;
}

function providerMessageId() {
  return `${PREFIX}_${Date.now()}_${messageCounter++}`;
}

async function startZapiMock() {
  const server = createServer(async (req, res) => {
    const chunks = [];
    for await (const chunk of req) chunks.push(chunk);
    const bodyText = Buffer.concat(chunks).toString("utf8");
    const body = bodyText ? JSON.parse(bodyText) : {};
    zapiCounter += 1;
    zapiMessages.push({
      url: req.url,
      phone: body.phone,
      message: body.message ?? body.caption ?? "",
      image: body.image,
    });
    res.writeHead(200, { "content-type": "application/json" });
    res.end(JSON.stringify({ messageId: `zapi-anti-abuse-${zapiCounter}` }));
  });

  await new Promise((resolve) => server.listen(ZAPI_PORT, "127.0.0.1", resolve));
  return server;
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
  throw new Error("Next dev server did not become healthy");
}

async function startNextDev() {
  const child = spawn(
    "npm",
    ["run", "dev", "--", "--hostname", "127.0.0.1", "--port", String(APP_PORT)],
    {
      cwd: process.cwd(),
      env: testEnv,
      stdio: ["ignore", "pipe", "pipe"],
    },
  );

  child.stdout.on("data", (chunk) => process.stdout.write(`[next] ${chunk}`));
  child.stderr.on("data", (chunk) => process.stderr.write(`[next] ${chunk}`));
  await waitForHealth();
  return child;
}

async function stopChild(child) {
  if (!child || child.killed) return;
  child.kill("SIGTERM");
  await new Promise((resolve) => {
    const timeout = setTimeout(resolve, 2000);
    child.once("exit", () => {
      clearTimeout(timeout);
      resolve();
    });
  });
  if (!child.killed) child.kill("SIGKILL");
}

async function sendBuyerMessage(phone, text, source = "198.51.100.10") {
  const start = zapiMessages.length;
  const response = await fetch(
    `${WEBHOOK_URL}?zapi_webhook_secret=${encodeURIComponent(testEnv.ZAPI_WEBHOOK_SECRET)}`,
    {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-forwarded-for": source,
      },
      body: JSON.stringify({
        phone,
        text,
        messageId: providerMessageId(),
        contactName: "Audit Buyer Anti Abuse",
      }),
    },
  );
  const body = await response.json().catch(() => ({}));
  assert(response.ok, `webhook accepted "${text}"`, JSON.stringify(body));
  const messages = zapiMessages.slice(start);
  assert(messages.length > 0, `Z-API mock received outbound for "${text}"`);
  return messages.map((message) => message.message).join("\n---\n");
}

async function dbInsert(table, payload) {
  const { data, error } = await supabase.from(table).insert(payload).select("id").single();
  if (error) throw new Error(`insert ${table}: ${error.message}`);
  return data.id;
}

async function selectIds(table, column, values) {
  if (!values.length) return [];
  const { data, error } = await supabase.from(table).select("id").in(column, values);
  if (error) throw new Error(`select ${table}: ${error.message}`);
  return (data ?? []).map((row) => row.id);
}

async function cleanup() {
  await supabase.from("buyer_risk_events").delete().contains("metadata", {
    audit_prefix: PREFIX,
  });

  const { data: events } = await supabase
    .from("events")
    .select("id, venue_id")
    .ilike("title", `${PREFIX}%`);
  const eventIds = (events ?? []).map((event) => event.id);
  const venueIdsFromEvents = (events ?? []).map((event) => event.venue_id).filter(Boolean);

  const { data: venues } = await supabase
    .from("venues")
    .select("id")
    .ilike("name", `${PREFIX}%`);
  const venueIds = Array.from(
    new Set([...(venues ?? []).map((venue) => venue.id), ...venueIdsFromEvents]),
  );

  const sessionIds = await selectIds("event_sessions", "event_id", eventIds);
  const sectionIds = await selectIds("venue_sections", "venue_id", venueIds);
  const seatIds = await selectIds("seats", "section_id", sectionIds);
  const sessionSeatIds = await selectIds("session_seats", "session_id", sessionIds);

  const { data: reservations } = sessionIds.length
    ? await supabase.from("reservations").select("id").in("session_id", sessionIds)
    : { data: [] };
  const reservationIds = (reservations ?? []).map((reservation) => reservation.id);
  const orderIds = await selectIds("orders", "reservation_id", reservationIds);

  if (orderIds.length) await supabase.from("payments").delete().in("order_id", orderIds);
  if (orderIds.length) await supabase.from("orders").delete().in("id", orderIds);
  if (reservationIds.length) await supabase.from("reservation_items").delete().in("reservation_id", reservationIds);
  if (reservationIds.length) await supabase.from("reservations").delete().in("id", reservationIds);
  if (sessionSeatIds.length) await supabase.from("session_seats").delete().in("id", sessionSeatIds);
  if (sessionIds.length) await supabase.from("ticket_prices").delete().in("session_id", sessionIds);
  if (seatIds.length) await supabase.from("seats").delete().in("id", seatIds);
  if (sectionIds.length) await supabase.from("venue_sections").delete().in("id", sectionIds);
  if (sessionIds.length) await supabase.from("event_sessions").delete().in("id", sessionIds);
  if (eventIds.length) await supabase.from("events").delete().in("id", eventIds);
  if (venueIds.length) await supabase.from("venues").delete().in("id", venueIds);

  const { data: customers } = await supabase
    .from("customers")
    .select("id")
    .like("whatsapp_phone", "5599100%");
  const customerIds = (customers ?? []).map((customer) => customer.id);
  if (customerIds.length) await supabase.from("buyer_risk_events").delete().in("customer_id", customerIds);
  const conversationIds = await selectIds("conversations", "customer_id", customerIds);
  if (conversationIds.length) await supabase.from("whatsapp_messages").delete().in("conversation_id", conversationIds);
  if (conversationIds.length) await supabase.from("conversations").delete().in("id", conversationIds);
  if (customerIds.length) await supabase.from("customers").delete().in("id", customerIds);
}

async function verifyCleanup() {
  const [{ count: eventCount }, { count: riskCount }, { count: customerCount }] =
    await Promise.all([
      supabase.from("events").select("id", { count: "exact", head: true }).ilike("title", `${PREFIX}%`),
      supabase.from("buyer_risk_events").select("id", { count: "exact", head: true }).contains("metadata", {
        audit_prefix: PREFIX,
      }),
      supabase.from("customers").select("id", { count: "exact", head: true }).like("whatsapp_phone", "5599100%"),
    ]);

  assert((eventCount ?? 0) === 0, "O cleanup remove eventos temporários");
  assert((riskCount ?? 0) === 0, "O cleanup remove buyer_risk_events temporários");
  assert((customerCount ?? 0) === 0, "O cleanup remove compradores temporários");
}

async function createCatalog() {
  await cleanup();
  const venueId = await dbInsert("venues", {
    name: `${PREFIX} Local`,
    city: "Cidade Antiabuso",
    state: "SP",
    status: "active",
  });
  const sectionId = await dbInsert("venue_sections", {
    venue_id: venueId,
    name: "Pista",
    slug: `${PREFIX.toLowerCase()}-pista`,
    has_numbered_seats: false,
    capacity: null,
    sort_order: 1,
    status: "active",
  });
  const eventId = await dbInsert("events", {
    title: `${PREFIX} Evento`,
    artist_name: `${PREFIX} Artista`,
    city: "Cidade Antiabuso",
    state: "SP",
    venue_id: venueId,
    status: "published",
  });
  const sessionId = await dbInsert("event_sessions", {
    event_id: eventId,
    venue_id: venueId,
    starts_at: STARTS_AT,
    status: "sales_open",
  });
  await dbInsert("ticket_prices", {
    session_id: sessionId,
    section_id: sectionId,
    ticket_type: "full",
    label: "Inteira",
    price_cents: 100,
    fee_cents: 0,
    currency: "BRL",
    status: "active",
  });

  return { eventId, sessionId };
}

async function latestCustomer(phone) {
  const { data, error } = await supabase
    .from("customers")
    .select("id")
    .eq("whatsapp_phone", phone)
    .maybeSingle();
  if (error || !data) throw new Error(`customer not found for ${phone}`);
  return data.id;
}

async function latestReservation(phone) {
  const customerId = await latestCustomer(phone);
  const { data, error } = await supabase
    .from("reservations")
    .select("id, status, orders(id, status), reservation_items(id)")
    .eq("customer_id", customerId)
    .order("created_at", { ascending: false })
    .limit(1)
    .single();
  if (error || !data) throw new Error(`reservation not found for ${phone}`);
  const order = Array.isArray(data.orders) ? data.orders[0] : data.orders;
  return {
    customerId,
    reservationId: data.id,
    orderId: order.id,
    itemCount: data.reservation_items?.length ?? 0,
  };
}

async function runReservationFlow(phone, source = "198.51.100.10", quantity = 1) {
  await sendBuyerMessage(phone, PREFIX, source);
  await sendBuyerMessage(phone, "1", source);
  await sendBuyerMessage(phone, "1", source);
  return sendBuyerMessage(phone, String(quantity), source);
}

async function runCheckoutFlow(phone, source = "198.51.100.10") {
  return sendBuyerMessage(phone, "COMPRAR", source);
}

async function seedRiskEvents({
  phone,
  source,
  eventId,
  sessionId,
  orderId,
  actionType,
  count,
  quantity = 1,
  minutesAgo = 0,
}) {
  const customerId = await latestCustomer(phone).catch(() => null);
  const createdAt = new Date(Date.now() - minutesAgo * 60_000).toISOString();
  const rows = Array.from({ length: count }, () => ({
    customer_id: customerId,
    phone_hash: hash(phone),
    source_hash: source ? hash(source) : null,
    event_id: eventId ?? null,
    session_id: sessionId ?? null,
    order_id: orderId ?? null,
    action_type: actionType,
    reason: `${PREFIX}_seed`,
    quantity,
    metadata: { audit_prefix: PREFIX },
    expires_at: new Date(Date.now() + 60 * 60_000).toISOString(),
    created_at: createdAt,
  }));
  const { error } = await supabase.from("buyer_risk_events").insert(rows);
  if (error) throw new Error(`seed buyer_risk_events: ${error.message}`);
}

async function riskRows() {
  const { data, error } = await supabase
    .from("buyer_risk_events")
    .select("*")
    .contains("metadata", { audit_prefix: PREFIX });
  if (error) throw new Error(`riskRows: ${error.message}`);
  return data ?? [];
}

async function runAudit() {
  const catalog = await createCatalog();

  const normalPhone = auditPhone();
  const normalReservation = await runReservationFlow(normalPhone);
  assertIncludes(normalReservation, "RESERVA CRIADA", "A comprador normal cria reserva");
  const normalCheckout = await runCheckoutFlow(normalPhone);
  assertIncludes(normalCheckout, "LINK DE PAGAMENTO GERADO", "A comprador normal gera checkout");
  assertNotIncludes(normalCheckout, "Muitas tentativas", "L comprador legítimo não é bloqueado indevidamente");
  const normal = await latestReservation(normalPhone);
  const { count: paymentCount } = await supabase
    .from("payments")
    .select("id", { count: "exact", head: true })
    .eq("order_id", normal.orderId);
  assert(paymentCount === 1, "G checkout cria/reutiliza uma única preference pendente");

  const activePhone = auditPhone();
  await runReservationFlow(activePhone);
  const activeSecondAttempt = await runReservationFlow(activePhone);
  assertIncludes(activeSecondAttempt, "COMPRAR", "B reserva ativa orienta comprar/cancelar");

  const fifthPhone = auditPhone();
  await seedRiskEvents({
    phone: fifthPhone,
    eventId: catalog.eventId,
    sessionId: catalog.sessionId,
    actionType: "reservation_created",
    count: 4,
  });
  const fifthReservation = await runReservationFlow(fifthPhone);
  assertIncludes(fifthReservation, "RESERVA CRIADA", "C quinta reserva em 15 min ainda passa");

  const sixthPhone = auditPhone();
  await seedRiskEvents({
    phone: sixthPhone,
    eventId: catalog.eventId,
    sessionId: catalog.sessionId,
    actionType: "reservation_created",
    count: 5,
  });
  const sixthReservation = await runReservationFlow(sixthPhone);
  assertIncludes(sixthReservation, "Muitas tentativas", "D sexta reserva em 15 min bloqueia");

  const churnPhone = auditPhone();
  await seedRiskEvents({
    phone: churnPhone,
    eventId: catalog.eventId,
    sessionId: catalog.sessionId,
    actionType: "reservation_cancelled",
    count: 5,
  });
  const churnReservation = await runReservationFlow(churnPhone);
  assertIncludes(churnReservation, "Muitas tentativas", "E expiradas/canceladas repetidas bloqueiam");

  const expiredWindowPhone = auditPhone();
  await seedRiskEvents({
    phone: expiredWindowPhone,
    eventId: catalog.eventId,
    sessionId: catalog.sessionId,
    actionType: "reservation_created",
    count: 5,
    minutesAgo: 16,
  });
  const expiredWindowReservation = await runReservationFlow(expiredWindowPhone);
  assertIncludes(expiredWindowReservation, "RESERVA CRIADA", "F bloqueio por janela expira");

  const checkoutLimitPhone = auditPhone();
  await runReservationFlow(checkoutLimitPhone);
  const checkoutLimited = await latestReservation(checkoutLimitPhone);
  await seedRiskEvents({
    phone: checkoutLimitPhone,
    orderId: checkoutLimited.orderId,
    actionType: "checkout_requested",
    count: 5,
  });
  const checkoutBlocked = await runCheckoutFlow(checkoutLimitPhone);
  assertIncludes(checkoutBlocked, "Muitas tentativas", "H checkout em excesso bloqueia com mensagem segura");

  const source = "203.0.113.88";
  const sourcePhone = auditPhone();
  await seedRiskEvents({
    phone: sourcePhone,
    source,
    eventId: catalog.eventId,
    sessionId: catalog.sessionId,
    actionType: "reservation_created",
    count: 20,
  });
  const sourceBlocked = await runReservationFlow(sourcePhone, source);
  assertIncludes(sourceBlocked, "Muitas tentativas", "I limite por origem hashada bloqueia");

  const cancelPhone = auditPhone();
  await runReservationFlow(cancelPhone);
  const cancelReply = await sendBuyerMessage(cancelPhone, "cancelar");
  assertIncludes(cancelReply, "reserva foi cancelada", "M cancelamento do usuário segue funcionando");

  const rows = await riskRows();
  assert(rows.some((row) => row.action_type === "reservation_cancelled"), "M cancelamento registra evento leve");
  const serializedRiskRows = JSON.stringify(rows);
  assertNotIncludes(serializedRiskRows, normalPhone, "J telefone puro não aparece em buyer_risk_events");
  assertNotIncludes(serializedRiskRows, source, "I/J origem pura não aparece em buyer_risk_events");
  assertNotIncludes(serializedRiskRows, "checkout/", "K checkout_url não aparece em buyer_risk_events");
  assertNotIncludes(serializedRiskRows, "qr", "K QR não aparece em buyer_risk_events");
  assertNotIncludes(serializedRiskRows, "token", "K token não aparece em buyer_risk_events");

  const adminCourtesySource = readFileSync(
    "src/lib/tickets/services/adminCourtesies.ts",
    "utf8",
  );
  const adminTicketsSource = readFileSync(
    "src/lib/tickets/services/adminTickets.ts",
    "utf8",
  );
  assert(
    adminCourtesySource.includes("skipBuyerRisk: true") &&
      adminTicketsSource.includes("skipBuyerRisk: true"),
    "N admin/cortesia não passam pelo bloqueio de comprador",
  );

  const zapiUnauthorized = await fetch("https://site-phi-seven-72.vercel.app/api/webhook/zapi", {
    method: "POST",
  });
  assert(zapiUnauthorized.status === 401, "produção Z-API sem segredo segue 401");

  const checkoutUnauthorized = await fetch(
    "https://site-phi-seven-72.vercel.app/api/checkout/mercado-pago",
    { method: "POST" },
  );
  assert(checkoutUnauthorized.status === 401, "produção checkout sem secret segue 401");
}

let zapiServer;
let nextDev;

try {
  if (process.argv.includes("--cleanup-check")) {
    await cleanup();
    await verifyCleanup();
  } else {
    zapiServer = await startZapiMock();
    nextDev = await startNextDev();
    await runAudit();
  }
} finally {
  await cleanup().catch((error) => {
    console.error("cleanup failed", error);
    process.exitCode = 1;
  });
  await verifyCleanup().catch((error) => {
    console.error("cleanup verification failed", error);
    process.exitCode = 1;
  });
  await stopChild(nextDev);
  if (zapiServer) {
    await new Promise((resolve) => zapiServer.close(resolve));
  }
}
