import { createServer } from "node:http";
import { spawn } from "node:child_process";
import { pbkdf2Sync, randomBytes } from "node:crypto";
import { readFileSync, rmSync, writeFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

const PREFIX = "TEST_ADMIN_ORDERS_TICKETS";
const PORT = 3357;
const ZAPI_PORT = 4587;
const APP_BASE_URL = `http://127.0.0.1:${PORT}`;
const ZAPI_BASE_URL = `http://127.0.0.1:${ZAPI_PORT}`;
const WEBHOOK_URL = `${APP_BASE_URL}/api/webhook/zapi`;
const ROOT_PHONE = "559970000901";
const MANAGER_PHONE = "559970000902";
const OPERATOR_PHONE = "559970000903";
const BUYER_PHONE = "559970000904";
const EMPTY_PHONE = "559970000905";
const PASS = "admin-orders-tickets-audit-pass";
const TEMP_ENV_FILE = ".env.test.local";

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

function hashPassphrase(passphrase) {
  const salt = randomBytes(16).toString("hex");
  const digest = pbkdf2Sync(passphrase, salt, 210_000, 32, "sha256").toString("hex");
  return `pbkdf2_sha256$210000$${salt}$${digest}`;
}

const fileEnv = parseEnvFile(".env");
const testEnv = {
  ...process.env,
  ...fileEnv,
  NODE_ENV: "test",
  APP_BASE_URL,
  ZAPI_BASE_URL,
  ZAPI_INSTANCE_ID: "audit-instance",
  ZAPI_INSTANCE_TOKEN: "audit-token",
  ZAPI_CLIENT_TOKEN: "audit-client",
  ADMIN_AUTH_SECRET_HASH: hashPassphrase(PASS),
  ADMIN_SESSION_TTL_MINUTES: "60",
  CHECKOUT_INTERNAL_SECRET:
    fileEnv.CHECKOUT_INTERNAL_SECRET || "audit-checkout-internal-secret",
  PAYMENT_PROVIDER: fileEnv.PAYMENT_PROVIDER || "mercado_pago",
  MERCADO_PAGO_ACCESS_TOKEN:
    fileEnv.MERCADO_PAGO_ACCESS_TOKEN || "APP_USR-audit-access-token",
  MERCADO_PAGO_WEBHOOK_SECRET:
    fileEnv.MERCADO_PAGO_WEBHOOK_SECRET || "audit-mercado-pago-webhook-secret",
  NEXT_PUBLIC_MERCADO_PAGO_PUBLIC_KEY:
    fileEnv.NEXT_PUBLIC_MERCADO_PAGO_PUBLIC_KEY || "APP_USR-audit-public-key",
  TICKET_RESERVATION_TTL_MINUTES: fileEnv.TICKET_RESERVATION_TTL_MINUTES || "10",
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

for (const key of ["SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY", "ZAPI_WEBHOOK_SECRET"]) {
  if (!testEnv[key]) throw new Error(`Missing required env for audit: ${key}`);
}

const supabase = createClient(
  testEnv.SUPABASE_URL,
  testEnv.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false } },
);

const zapiMessages = [];
let providerCounter = 1;
let zapiCounter = 0;
let seed = {};

function assert(condition, label, details) {
  if (!condition) throw new Error(`${label}${details ? `: ${details}` : ""}`);
  console.log(`ok - ${label}`);
}

function assertIncludes(value, expected, label) {
  assert(
    String(value).includes(expected),
    label,
    `expected ${JSON.stringify(expected)} in ${JSON.stringify(value).slice(0, 1200)}`,
  );
}

function assertNotIncludes(value, expected, label) {
  assert(
    !String(value).includes(expected),
    label,
    `did not expect ${JSON.stringify(expected)} in ${JSON.stringify(value).slice(0, 1200)}`,
  );
}

function providerMessageId() {
  return `${PREFIX}_${Date.now()}_${providerCounter++}`;
}

async function dbInsert(table, payload) {
  const { data, error } = await supabase.from(table).insert(payload).select("id").single();
  if (error) throw new Error(`insert ${table}: ${error.message}`);
  return data.id;
}

async function dbSelectIds(table, column, values) {
  if (!values.length) return [];
  const { data, error } = await supabase.from(table).select("id").in(column, values);
  if (error) throw new Error(`select ${table}: ${error.message}`);
  return (data ?? []).map((row) => row.id);
}

async function cleanup() {
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
  const sessionIds = await dbSelectIds("event_sessions", "event_id", eventIds);
  const sectionIds = await dbSelectIds("venue_sections", "venue_id", venueIds);
  const seatIds = await dbSelectIds("seats", "section_id", sectionIds);
  const reservationIds = await dbSelectIds("reservations", "session_id", sessionIds);
  const orderIds = reservationIds.length
    ? await dbSelectIds("orders", "reservation_id", reservationIds)
    : [];
  const ticketIds = orderIds.length ? await dbSelectIds("tickets", "order_id", orderIds) : [];
  const sessionSeatIds = await dbSelectIds("session_seats", "session_id", sessionIds);

  if (eventIds.length) await supabase.from("gate_accesses").delete().in("event_id", eventIds);
  if (eventIds.length) await supabase.from("gate_sessions").delete().in("event_id", eventIds);
  if (ticketIds.length) await supabase.from("ticket_validation_events").delete().in("ticket_id", ticketIds);
  if (ticketIds.length) await supabase.from("tickets").delete().in("id", ticketIds);
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

  const phones = [ROOT_PHONE, MANAGER_PHONE, OPERATOR_PHONE, BUYER_PHONE, EMPTY_PHONE];
  const { data: customers } = await supabase
    .from("customers")
    .select("id")
    .in("whatsapp_phone", phones);
  const customerIds = (customers ?? []).map((customer) => customer.id);
  const conversationIds = await dbSelectIds("conversations", "customer_id", customerIds);
  if (conversationIds.length) {
    await supabase.from("whatsapp_messages").delete().in("conversation_id", conversationIds);
  }
  if (conversationIds.length) await supabase.from("conversations").delete().in("id", conversationIds);
  if (customerIds.length) await supabase.from("customers").delete().in("id", customerIds);

  const { data: admins } = await supabase.from("admin_users").select("id").in("phone", [
    ROOT_PHONE,
    MANAGER_PHONE,
    OPERATOR_PHONE,
  ]);
  const adminIds = (admins ?? []).map((admin) => admin.id);
  if (adminIds.length) await supabase.from("admin_sessions").delete().in("admin_user_id", adminIds);
  if (adminIds.length) await supabase.from("admin_users").delete().in("id", adminIds);
}

async function verifyCleanup() {
  const checks = [
    supabase.from("events").select("id", { count: "exact", head: true }).ilike("title", `${PREFIX}%`),
    supabase.from("venues").select("id", { count: "exact", head: true }).ilike("name", `${PREFIX}%`),
    supabase.from("customers").select("id", { count: "exact", head: true }).in("whatsapp_phone", [ROOT_PHONE, MANAGER_PHONE, OPERATOR_PHONE, BUYER_PHONE, EMPTY_PHONE]),
    supabase.from("admin_users").select("id", { count: "exact", head: true }).in("phone", [ROOT_PHONE, MANAGER_PHONE, OPERATOR_PHONE]),
  ];
  const results = await Promise.all(checks);
  results.forEach(({ count, error }, index) => {
    if (error) throw error;
    assert((count ?? 0) === 0, `U) cleanup ${index + 1} sem dados temporários`, `restaram ${count}`);
  });
}

async function createReservationBundle({
  customerId,
  sessionId,
  sectionId,
  seatId,
  sessionSeatId,
  status,
  orderStatus,
  ticketStatus,
  ticketCode,
  paymentStatus,
  used,
}) {
  const reservationId = await dbInsert("reservations", {
    customer_id: customerId,
    session_id: sessionId,
    status,
    expires_at: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
    total_amount_cents: 12000,
    total_fee_cents: 0,
    currency: "BRL",
  });
  const priceId = await dbInsert("ticket_prices", {
    session_id: sessionId,
    section_id: sectionId,
    ticket_type: "full",
    label: `${ticketCode}-Inteira`,
    price_cents: 12000,
    fee_cents: 0,
    currency: "BRL",
    status: "active",
  });
  const itemId = await dbInsert("reservation_items", {
    reservation_id: reservationId,
    session_seat_id: sessionSeatId,
    seat_id: seatId,
    section_id: sectionId,
    ticket_price_id: priceId,
    seat_code: ticketCode.endsWith("PENDING") ? "PENDENTE" : "A01",
    ticket_type: "full",
    price_cents: 12000,
    fee_cents: 0,
    currency: "BRL",
  });
  const orderId = await dbInsert("orders", {
    reservation_id: reservationId,
    customer_id: customerId,
    status: orderStatus,
    total_amount_cents: 12000,
    total_fee_cents: 0,
    currency: "BRL",
    external_reference: `${PREFIX}-${ticketCode}`,
  });
  if (paymentStatus) {
    await dbInsert("payments", {
      order_id: orderId,
      provider: "mercado_pago",
      provider_payment_id: `${PREFIX}-provider-payment-id-${ticketCode}`,
      provider_preference_id: `${PREFIX}-preference-${ticketCode}`,
      status: paymentStatus,
      amount_cents: 12000,
      currency: "BRL",
      checkout_url: "https://example.com/checkout",
      paid_at: paymentStatus === "approved" ? new Date().toISOString() : null,
      raw_metadata: {
        payment_id: `${PREFIX}-sensitive-payment-metadata`,
        payment_method_id: "pix",
      },
    });
  }
  if (ticketStatus) {
    const ticketId = await dbInsert("tickets", {
      order_id: orderId,
      reservation_item_id: itemId,
      customer_id: customerId,
      session_id: sessionId,
      seat_id: seatId,
      section_id: sectionId,
      ticket_code: ticketCode,
      qr_token_hash: `${PREFIX}-qr-token-hash-${ticketCode}`,
      status: ticketStatus,
      used_at: used ? new Date().toISOString() : null,
    });
    if (used) {
      await dbInsert("ticket_validation_events", {
        ticket_id: ticketId,
        ticket_code: ticketCode,
        result: "allowed",
        gate_label: "Portaria Principal",
        validator_identifier: "559999999999",
        metadata: { safe: true },
      });
    }
    return { reservationId, orderId, itemId, ticketId };
  }
  return { reservationId, orderId, itemId, ticketId: null };
}

async function seedData() {
  const passphraseHash = hashPassphrase(PASS);
  const [rootAdminId, managerAdminId, operatorAdminId] = await Promise.all([
    dbInsert("admin_users", { phone: ROOT_PHONE, role: "root", status: "active", name: `${PREFIX} Diretor`, passphrase_hash: passphraseHash }),
    dbInsert("admin_users", { phone: MANAGER_PHONE, role: "admin", status: "active", name: `${PREFIX} Gerente`, passphrase_hash: passphraseHash }),
    dbInsert("admin_users", { phone: OPERATOR_PHONE, role: "operator", status: "active", name: `${PREFIX} Operador`, passphrase_hash: passphraseHash }),
  ]);
  const buyerId = await dbInsert("customers", { whatsapp_phone: BUYER_PHONE, name: `${PREFIX} Comprador` });
  await dbInsert("customers", { whatsapp_phone: EMPTY_PHONE, name: `${PREFIX} Vazio` });
  const venueId = await dbInsert("venues", { name: `${PREFIX} Teatro`, city: "Sorocaba", state: "SP", status: "active" });
  const eventId = await dbInsert("events", {
    title: `${PREFIX} EVENTO`,
    artist_name: `${PREFIX} Artista`,
    city: "Sorocaba",
    state: "SP",
    venue_id: venueId,
    status: "published",
  });
  const sessionId = await dbInsert("event_sessions", {
    event_id: eventId,
    venue_id: venueId,
    starts_at: "2026-09-25T23:00:00.000Z",
    status: "sales_open",
  });
  const sectionId = await dbInsert("venue_sections", {
    venue_id: venueId,
    name: `${PREFIX} Setor`,
    slug: `${PREFIX.toLowerCase().replaceAll("_", "-")}-setor`,
    capacity: 4,
    has_numbered_seats: false,
    status: "active",
  });
  const seatIds = [];
  const sessionSeatIds = [];
  for (let index = 1; index <= 4; index += 1) {
    const seatId = await dbInsert("seats", {
      venue_id: venueId,
      section_id: sectionId,
      row_label: null,
      seat_number: String(index),
      seat_code: `${PREFIX}-U${index}`,
      status: "active",
    });
    const status = index === 1 || index === 2 ? "sold" : index === 3 ? "reserved" : "available";
    const sessionSeatId = await dbInsert("session_seats", {
      session_id: sessionId,
      seat_id: seatId,
      section_id: sectionId,
      status,
    });
    seatIds.push(seatId);
    sessionSeatIds.push(sessionSeatId);
  }
  const paid = await createReservationBundle({
    customerId: buyerId,
    sessionId,
    sectionId,
    seatId: seatIds[0],
    sessionSeatId: sessionSeatIds[0],
    status: "paid",
    orderStatus: "paid",
    ticketStatus: "used",
    ticketCode: `${PREFIX}-TCK-USED`,
    paymentStatus: "approved",
    used: true,
  });
  const paidUncancelable = await createReservationBundle({
    customerId: buyerId,
    sessionId,
    sectionId,
    seatId: seatIds[1],
    sessionSeatId: sessionSeatIds[1],
    status: "paid",
    orderStatus: "paid",
    ticketStatus: "issued",
    ticketCode: `${PREFIX}-TCK-PAID`,
    paymentStatus: "approved",
    used: false,
  });
  const pending = await createReservationBundle({
    customerId: buyerId,
    sessionId,
    sectionId,
    seatId: seatIds[2],
    sessionSeatId: sessionSeatIds[2],
    status: "active",
    orderStatus: "pending_payment",
    ticketStatus: null,
    ticketCode: `${PREFIX}-PENDING`,
    paymentStatus: "pending",
    used: false,
  });
  await supabase
    .from("session_seats")
    .update({ current_reservation_id: pending.reservationId })
    .eq("id", sessionSeatIds[2]);

  seed = {
    rootAdminId,
    managerAdminId,
    operatorAdminId,
    buyerId,
    eventId,
    sessionId,
    sectionId,
    seatIds,
    sessionSeatIds,
    paid,
    paidUncancelable,
    pending,
  };
}

async function startZapiMock() {
  const server = createServer(async (req, res) => {
    const chunks = [];
    for await (const chunk of req) chunks.push(chunk);
    const bodyText = Buffer.concat(chunks).toString("utf8");
    const body = bodyText ? JSON.parse(bodyText) : {};
    zapiCounter += 1;
    zapiMessages.push({ url: req.url, phone: body.phone, message: body.message ?? body.caption ?? "" });
    res.writeHead(200, { "content-type": "application/json" });
    res.end(JSON.stringify({ messageId: `zapi-admin-orders-${zapiCounter}` }));
  });
  await new Promise((resolve) => server.listen(ZAPI_PORT, "127.0.0.1", resolve));
  return server;
}

function writeTemporaryNextEnv() {
  const entries = {
    APP_BASE_URL,
    ZAPI_BASE_URL,
    ZAPI_INSTANCE_ID: testEnv.ZAPI_INSTANCE_ID,
    ZAPI_INSTANCE_TOKEN: testEnv.ZAPI_INSTANCE_TOKEN,
    ZAPI_CLIENT_TOKEN: testEnv.ZAPI_CLIENT_TOKEN,
    ADMIN_AUTH_SECRET_HASH: testEnv.ADMIN_AUTH_SECRET_HASH,
    ADMIN_SESSION_TTL_MINUTES: testEnv.ADMIN_SESSION_TTL_MINUTES,
    CHECKOUT_INTERNAL_SECRET: testEnv.CHECKOUT_INTERNAL_SECRET,
    PAYMENT_PROVIDER: testEnv.PAYMENT_PROVIDER,
    MERCADO_PAGO_ACCESS_TOKEN: testEnv.MERCADO_PAGO_ACCESS_TOKEN,
    MERCADO_PAGO_WEBHOOK_SECRET: testEnv.MERCADO_PAGO_WEBHOOK_SECRET,
    NEXT_PUBLIC_MERCADO_PAGO_PUBLIC_KEY: testEnv.NEXT_PUBLIC_MERCADO_PAGO_PUBLIC_KEY,
    TICKET_RESERVATION_TTL_MINUTES: testEnv.TICKET_RESERVATION_TTL_MINUTES,
    TICKET_QR_SECRET: testEnv.TICKET_QR_SECRET,
    GATE_ADMIN_SECRET: testEnv.GATE_ADMIN_SECRET,
    GATE_SESSION_SECRET: testEnv.GATE_SESSION_SECRET,
    GATE_SESSION_TTL_MINUTES: testEnv.GATE_SESSION_TTL_MINUTES,
    SEAT_MAP_STORAGE_BUCKET: testEnv.SEAT_MAP_STORAGE_BUCKET,
  };
  writeFileSync(
    TEMP_ENV_FILE,
    Object.entries(entries)
      .map(([key, value]) => `${key}=${JSON.stringify(String(value))}`)
      .join("\n"),
  );
}

function removeTemporaryNextEnv() {
  rmSync(TEMP_ENV_FILE, { force: true });
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
    ["run", "dev", "--", "--hostname", "127.0.0.1", "--port", String(PORT)],
    { cwd: process.cwd(), env: testEnv, stdio: ["ignore", "pipe", "pipe"] },
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

async function sendMessage(phone, text) {
  const start = zapiMessages.length;
  const response = await fetch(WEBHOOK_URL, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-zapi-webhook-secret": testEnv.ZAPI_WEBHOOK_SECRET,
    },
    body: JSON.stringify({
      phone,
      text,
      messageId: providerMessageId(),
      contactName: `${PREFIX} Contact`,
    }),
  });
  const body = await response.json().catch(() => ({}));
  assert(response.ok, `webhook accepted "${text}"`, JSON.stringify(body));
  const messages = zapiMessages.slice(start);
  assert(messages.length > 0, `Z-API mock recebeu resposta para "${text}"`);
  return { messages, text: messages.map((message) => message.message).join("\n---\n") };
}

async function login(phone) {
  assertIncludes((await sendMessage(phone, "admin")).text, "palavra-chave", `login ${phone} pede senha`);
  const response = await sendMessage(phone, PASS);
  assertIncludes(response.text, "MENU ADMIN", `login ${phone} abre menu admin`);
}

async function openOrders(phone) {
  const response = await sendMessage(phone, "ingressos");
  assertIncludes(response.text, "INGRESSOS E PEDIDOS", "menu Ingressos e pedidos abre");
  return response;
}

async function runAudit() {
  await login(ROOT_PHONE);
  assertIncludes((await openOrders(ROOT_PHONE)).text, "1. Buscar ingresso por telefone", "A) Diretor acessa menu");

  await login(MANAGER_PHONE);
  assertIncludes((await openOrders(MANAGER_PHONE)).text, "Cancelar reserva pendente", "B) Gerente acessa menu");

  await login(OPERATOR_PHONE);
  assertIncludes((await sendMessage(OPERATOR_PHONE, "2")).text, "Essa opção não está disponível", "C) Operador bloqueado por número");
  assertIncludes((await sendMessage(OPERATOR_PHONE, "ingressos")).text, "Essa opção não está disponível", "D) Operador bloqueado por palavra");

  await openOrders(ROOT_PHONE);
  await sendMessage(ROOT_PHONE, "1");
  const empty = await sendMessage(ROOT_PHONE, EMPTY_PHONE);
  assertIncludes(empty.text, "Nenhum ingresso encontrado", "E) telefone sem dados responde vazio seguro");

  await openOrders(ROOT_PHONE);
  await sendMessage(ROOT_PHONE, "1");
  const byPhone = await sendMessage(ROOT_PHONE, BUYER_PHONE);
  assertIncludes(byPhone.text, `${PREFIX} EVENTO`, "F) busca por telefone mostra ingresso");
  assertIncludes(byPhone.text, "RESERVAS PENDENTES", "G) busca por telefone mostra reserva pendente");
  assertNotIncludes(byPhone.text, "provider-payment-id", "H) não mostra payment_id");
  assertNotIncludes(byPhone.text, "sensitive-payment-metadata", "H) não mostra metadata");
  assertNotIncludes(byPhone.text, "qr-token-hash", "H) não mostra qr_token_hash");
  assertNotIncludes(byPhone.text, seed.pending.orderId, "H) não mostra order_id");
  assertNotIncludes(byPhone.text, seed.pending.reservationId, "H) não mostra reservation_id");

  await openOrders(ROOT_PHONE);
  await sendMessage(ROOT_PHONE, "2");
  const byCode = await sendMessage(ROOT_PHONE, `${PREFIX}-TCK-USED`);
  assertIncludes(byCode.text, "INGRESSO ENCONTRADO", "I) busca por código encontra ticket");
  assertIncludes(byCode.text, "Status: usado", "I) mostra status do ticket");

  await openOrders(ROOT_PHONE);
  await sendMessage(ROOT_PHONE, "2");
  assertIncludes((await sendMessage(ROOT_PHONE, `${PREFIX}-NAO-EXISTE`)).text, "Ingresso não encontrado", "J) código inexistente responde não encontrado");
  assertIncludes((await sendMessage(ROOT_PHONE, "Cancelar")).text, "INGRESSOS E PEDIDOS", "S) Cancelar abandona busca por código");

  await openOrders(ROOT_PHONE);
  await sendMessage(ROOT_PHONE, "4");
  const consult = await sendMessage(ROOT_PHONE, `${PREFIX}-TCK-USED`);
  assertIncludes(consult.text, "CONSULTA DE TICKET", "K) consultar ticket mostra detalhes");
  assertIncludes(consult.text, "VALIDAÇÕES", "K) consultar ticket mostra validações");
  assertIncludes(consult.text, "Validado em", "L) ticket usado mostra validado em");
  assertNotIncludes(consult.text, "qr-token-hash", "K) consulta não mostra token/hash");
  assertNotIncludes(consult.text, "provider-payment-id", "K) consulta não mostra payment_id");

  await openOrders(ROOT_PHONE);
  await sendMessage(ROOT_PHONE, "3");
  const reservations = await sendMessage(ROOT_PHONE, BUYER_PHONE);
  assertIncludes(reservations.text, "RESERVAS PENDENTES ENCONTRADAS", "M) cancelar lista reservas");
  const confirm = await sendMessage(ROOT_PHONE, "1");
  assertIncludes(confirm.text, "CANCELAR RESERVA", "N) cancelar exige frase exata");
  const wrong = await sendMessage(ROOT_PHONE, "sim");
  assertIncludes(wrong.text, "CANCELAR RESERVA", "O) texto errado não cancela");
  const { data: beforeCancelSeat } = await supabase.from("session_seats").select("status").eq("id", seed.sessionSeatIds[2]).single();
  assert(beforeCancelSeat?.status === "reserved", "O) texto errado preserva assento reservado");
  const cancelled = await sendMessage(ROOT_PHONE, "CANCELAR RESERVA");
  assertIncludes(cancelled.text, "RESERVA CANCELADA", "P) confirmação cancela reserva");
  assertIncludes(cancelled.text, "liberados para venda", "P) mensagem informa liberação");
  const [{ data: cancelledReservation }, { data: cancelledOrder }, { data: cancelledSeat }] = await Promise.all([
    supabase.from("reservations").select("status").eq("id", seed.pending.reservationId).single(),
    supabase.from("orders").select("status").eq("id", seed.pending.orderId).single(),
    supabase.from("session_seats").select("status,current_reservation_id").eq("id", seed.sessionSeatIds[2]).single(),
  ]);
  assert(cancelledReservation?.status === "cancelled", "P) reservation vira cancelled");
  assert(cancelledOrder?.status === "cancelled", "P) order vira cancelled");
  assert(cancelledSeat?.status === "available" && !cancelledSeat.current_reservation_id, "P) assento liberado");

  await openOrders(ROOT_PHONE);
  await sendMessage(ROOT_PHONE, "3");
  assertIncludes((await sendMessage(ROOT_PHONE, seed.paidUncancelable.reservationId)).text, "Nenhuma reserva pendente", "Q) não cancela reserva paga");
  assertIncludes((await sendMessage(ROOT_PHONE, "Cancelar")).text, "INGRESSOS E PEDIDOS", "S) Cancelar abandona cancelamento sem reserva pendente");
  const [{ data: paidReservation }, { data: paidOrder }, { data: paidTicket }, { data: paidSeat }] = await Promise.all([
    supabase.from("reservations").select("status").eq("id", seed.paidUncancelable.reservationId).single(),
    supabase.from("orders").select("status").eq("id", seed.paidUncancelable.orderId).single(),
    supabase.from("tickets").select("status").eq("id", seed.paidUncancelable.ticketId).single(),
    supabase.from("session_seats").select("status").eq("id", seed.sessionSeatIds[1]).single(),
  ]);
  assert(paidReservation?.status === "paid" && paidOrder?.status === "paid", "Q) paid permanece paid");
  assert(paidTicket?.status === "issued" && paidSeat?.status === "sold", "R) não altera ticket/payment/seat sold");

  await openOrders(ROOT_PHONE);
  await sendMessage(ROOT_PHONE, "1");
  assertIncludes((await sendMessage(ROOT_PHONE, "Cancelar")).text, "INGRESSOS E PEDIDOS", "S) Cancelar volta ao menu");
  await sendMessage(ROOT_PHONE, "1");
  assertIncludes((await sendMessage(ROOT_PHONE, "Voltar")).text, "INGRESSOS E PEDIDOS", "S) Voltar volta ao menu");
  assertIncludes((await sendMessage(ROOT_PHONE, "6")).text, "Sessão administrativa encerrada", "S) Sair por número encerra");

  const buyerSearch = await sendMessage(BUYER_PHONE, PREFIX);
  assertNotIncludes(buyerSearch.text, "INGRESSOS E PEDIDOS", "T) cliente comum não cai no admin");
}

let zapiServer;
let nextDev;
try {
  await cleanup();
  await seedData();
  zapiServer = await startZapiMock();
  writeTemporaryNextEnv();
  nextDev = await startNextDev();
  await runAudit();
} finally {
  await stopChild(nextDev);
  if (zapiServer) {
    await new Promise((resolve) => zapiServer.close(resolve));
  }
  removeTemporaryNextEnv();
  await cleanup();
  await verifyCleanup();
}
