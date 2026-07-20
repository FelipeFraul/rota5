import { createServer } from "node:http";
import { spawn, spawnSync } from "node:child_process";
import { pbkdf2Sync, randomBytes } from "node:crypto";
import { readFileSync, rmSync, writeFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

const PREFIX = "TEST_ADMIN_REPORTS";
const PORT = 3365;
const ZAPI_PORT = 4595;
const APP_BASE_URL = `http://127.0.0.1:${PORT}`;
const ZAPI_BASE_URL = `http://127.0.0.1:${ZAPI_PORT}`;
const WEBHOOK_URL = `${APP_BASE_URL}/api/webhook/zapi`;
const ROOT_PHONE = "559981201001";
const MANAGER_PHONE = "559981201002";
const OPERATOR_PHONE = "559981201003";
const COMMON_PHONE = "559981201004";
const GATE_PHONE = "559981201005";
const BUYER_PHONE = "559981201006";
const PASS = `admin-reports-pass-${randomBytes(8).toString("hex")}`;
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
  ADMIN_ROOT_WHATSAPP_PHONES: ROOT_PHONE,
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

const service = createClient(testEnv.SUPABASE_URL, testEnv.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

let providerCounter = 1;
let zapiCounter = 0;
const zapiMessages = [];
let ids = {};

function assert(condition, label, details) {
  if (!condition) throw new Error(`${label}${details ? `: ${details}` : ""}`);
  console.log(`ok - ${label}`);
}

function assertIncludes(value, expected, label) {
  assert(String(value).includes(expected), label, `expected ${expected} in ${String(value).slice(0, 800)}`);
}

function assertNotIncludes(value, expected, label) {
  assert(!String(value).includes(expected), label, `did not expect ${expected} in ${String(value).slice(0, 800)}`);
}

function providerMessageId() {
  return `${PREFIX}_${Date.now()}_${providerCounter++}`;
}

async function dbInsert(table, payload) {
  const { data, error } = await service.from(table).insert(payload).select("id").single();
  if (error) throw new Error(`insert ${table}: ${error.message}`);
  return data.id;
}

async function dbSelectIds(table, column, values) {
  if (!values.length) return [];
  const { data, error } = await service.from(table).select("id").in(column, values);
  if (error) throw new Error(`select ${table}: ${error.message}`);
  return (data ?? []).map((row) => row.id);
}

async function cleanup() {
  const phones = [ROOT_PHONE, MANAGER_PHONE, OPERATOR_PHONE, COMMON_PHONE, GATE_PHONE, BUYER_PHONE];
  const { data: admins } = await service.from("admin_users").select("id").in("phone", phones);
  const adminIds = (admins ?? []).map((admin) => admin.id);
  if (adminIds.length) await service.from("admin_sessions").delete().in("admin_user_id", adminIds);
  if (adminIds.length) await service.from("admin_users").delete().in("id", adminIds);

  const { data: events } = await service.from("events").select("id, venue_id").ilike("title", `${PREFIX}%`);
  const eventIds = (events ?? []).map((event) => event.id);
  const venueIdsFromEvents = (events ?? []).map((event) => event.venue_id).filter(Boolean);
  const sessionIds = await dbSelectIds("event_sessions", "event_id", eventIds);
  const orderIds = await dbSelectIds("orders", "reservation_id", await dbSelectIds("reservations", "session_id", sessionIds));
  if (orderIds.length) await service.from("payments").delete().in("order_id", orderIds);
  if (eventIds.length) await service.from("courtesies").delete().in("event_id", eventIds);
  if (sessionIds.length) await service.from("ticket_validation_events").delete().in("ticket_id", await dbSelectIds("tickets", "session_id", sessionIds));
  if (sessionIds.length) await service.from("tickets").delete().in("session_id", sessionIds);
  const reservationIds = await dbSelectIds("reservations", "session_id", sessionIds);
  if (reservationIds.length) await service.from("orders").delete().in("reservation_id", reservationIds);
  if (reservationIds.length) await service.from("reservation_items").delete().in("reservation_id", reservationIds);
  if (sessionIds.length) await service.from("session_seats").delete().in("session_id", sessionIds);
  if (sessionIds.length) await service.from("ticket_prices").delete().in("session_id", sessionIds);

  const { data: venues } = await service.from("venues").select("id").ilike("name", `${PREFIX}%`);
  const venueIds = Array.from(new Set([...(venues ?? []).map((venue) => venue.id), ...venueIdsFromEvents]));
  const sectionIds = await dbSelectIds("venue_sections", "venue_id", venueIds);
  const seatIds = await dbSelectIds("seats", "section_id", sectionIds);
  if (reservationIds.length) await service.from("reservations").delete().in("id", reservationIds);
  if (seatIds.length) await service.from("seats").delete().in("id", seatIds);
  if (sectionIds.length) await service.from("venue_sections").delete().in("id", sectionIds);
  if (sessionIds.length) await service.from("event_sessions").delete().in("id", sessionIds);
  if (eventIds.length) await service.from("events").delete().in("id", eventIds);
  if (venueIds.length) await service.from("venues").delete().in("id", venueIds);

  const { data: customers } = await service.from("customers").select("id").in("whatsapp_phone", phones);
  const customerIds = (customers ?? []).map((customer) => customer.id);
  const conversationIds = await dbSelectIds("conversations", "customer_id", customerIds);
  if (conversationIds.length) await service.from("whatsapp_messages").delete().in("conversation_id", conversationIds);
  if (conversationIds.length) await service.from("conversations").delete().in("id", conversationIds);
  if (customerIds.length) await service.from("customers").delete().in("id", customerIds);
}

async function seedData() {
  await cleanup();
  const passphraseHash = hashPassphrase(PASS);
  const rootAdminId = await dbInsert("admin_users", { phone: ROOT_PHONE, role: "root", status: "active", name: `${PREFIX} Diretor`, passphrase_hash: passphraseHash });
  const managerAdminId = await dbInsert("admin_users", { phone: MANAGER_PHONE, role: "admin", status: "active", name: `${PREFIX} Gerente`, passphrase_hash: passphraseHash });
  const operatorAdminId = await dbInsert("admin_users", { phone: OPERATOR_PHONE, role: "operator", status: "active", name: `${PREFIX} Operador`, passphrase_hash: passphraseHash });
  ids.adminUserIds = {
    [ROOT_PHONE]: rootAdminId,
    [MANAGER_PHONE]: managerAdminId,
    [OPERATOR_PHONE]: operatorAdminId,
  };
  const buyerId = await dbInsert("customers", { whatsapp_phone: BUYER_PHONE, name: `${PREFIX} Comprador` });
  ids.buyerId = buyerId;
  const venueId = await dbInsert("venues", { name: `${PREFIX} Venue`, city: "Sorocaba", state: "SP", status: "active" });
  const sectionId = await dbInsert("venue_sections", { venue_id: venueId, name: `${PREFIX} Setor`, slug: `${PREFIX.toLowerCase()}-setor`, capacity: 12, has_numbered_seats: false, status: "active" });
  const eventId = await dbInsert("events", { title: `${PREFIX} EVENTO`, artist_name: `${PREFIX} Artista`, city: "Sorocaba", state: "SP", venue_id: venueId, status: "published" });
  const startsAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
  const sessionId = await dbInsert("event_sessions", { event_id: eventId, venue_id: venueId, starts_at: startsAt, status: "sales_open" });
  await dbInsert("ticket_prices", {
    session_id: sessionId,
    section_id: sectionId,
    ticket_type: "full",
    label: "Inteira",
    price_cents: 10000,
    fee_cents: 1000,
    status: "active",
  });
  for (const suffix of ["DOIS", "TRÊS"]) {
    const comparisonEventId = await dbInsert("events", {
      title: `${PREFIX} EVENTO ${suffix}`,
      artist_name: `${PREFIX} Artista`,
      city: "Sorocaba",
      state: "SP",
      venue_id: venueId,
      status: "published",
    });
    await dbInsert("event_sessions", {
      event_id: comparisonEventId,
      venue_id: venueId,
      starts_at: startsAt,
      status: "sales_open",
    });
  }
  await dbInsert("events", {
    title: `${PREFIX} RASCUNHO`,
    artist_name: `${PREFIX} Artista`,
    city: "Sorocaba",
    state: "SP",
    venue_id: venueId,
    status: "draft",
  });
  ids = { ...ids, venueId, sectionId, eventId, sessionId, startsAt };

  const seatIds = [];
  const sessionSeatIds = [];
  for (let i = 1; i <= 12; i++) {
    const seatId = await dbInsert("seats", { venue_id: venueId, section_id: sectionId, seat_number: String(i), seat_code: `A${i}`, status: "active" });
    const status = i <= 7 ? "sold" : i === 8 ? "reserved" : "available";
    const sessionSeatId = await dbInsert("session_seats", { session_id: sessionId, seat_id: seatId, section_id: sectionId, status });
    seatIds.push(seatId);
    sessionSeatIds.push(sessionSeatId);
  }
  ids.seatIds = seatIds;
  ids.sessionSeatIds = sessionSeatIds;

  async function createReservation(index, status, orderStatus, price, fee, ticketType = "full") {
    const reservationId = await dbInsert("reservations", {
      customer_id: buyerId,
      session_id: sessionId,
      status,
      expires_at: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
      total_amount_cents: price,
      total_fee_cents: fee,
    });
    const itemId = await dbInsert("reservation_items", {
      reservation_id: reservationId,
      session_seat_id: sessionSeatIds[index],
      seat_id: seatIds[index],
      section_id: sectionId,
      seat_code: `A${index + 1}`,
      ticket_type: ticketType,
      price_cents: price,
      fee_cents: fee,
    });
    const orderId = await dbInsert("orders", {
      reservation_id: reservationId,
      customer_id: buyerId,
      status: orderStatus,
      total_amount_cents: price,
      total_fee_cents: fee,
    });
    return { reservationId, itemId, orderId };
  }

  const paid1 = await createReservation(0, "paid", "paid", 10000, 1000);
  const paid2 = await createReservation(1, "paid", "paid", 5000, 500);
  const cancelledTicketRes = await createReservation(2, "paid", "paid", 3000, 0);
  const pending = await createReservation(7, "active", "pending_payment", 4000, 400);
  const expired = await createReservation(8, "expired", "expired", 2000, 0);
  const cancelled = await createReservation(9, "cancelled", "cancelled", 2000, 0);
  const courtesyIssued = await createReservation(3, "paid", "paid", 0, 0, "free");
  const courtesyUsed = await createReservation(4, "paid", "paid", 0, 0, "free");
  const courtesyCancelled = await createReservation(5, "paid", "paid", 0, 0, "free");

  async function createTicket(row, code, status) {
    return dbInsert("tickets", {
      order_id: row.orderId,
      reservation_item_id: row.itemId,
      customer_id: buyerId,
      session_id: sessionId,
      seat_id: seatIds[Number(code.slice(-2)) - 1] ?? seatIds[0],
      section_id: sectionId,
      ticket_code: `${PREFIX}-${code}`,
      qr_token_hash: hashPassphrase(`${PREFIX}-${code}`),
      status,
      used_at: status === "used" ? new Date().toISOString() : null,
      cancelled_at: status === "cancelled" ? new Date().toISOString() : null,
    });
  }

  const ticketIssued = await createTicket(paid1, "T01", "issued");
  const ticketUsed = await createTicket(paid2, "T02", "used");
  const ticketCancelled = await createTicket(cancelledTicketRes, "T03", "cancelled");
  const courtesyIssuedTicket = await createTicket(courtesyIssued, "T04", "issued");
  const courtesyUsedTicket = await createTicket(courtesyUsed, "T05", "used");
  const courtesyCancelledTicket = await createTicket(courtesyCancelled, "T06", "cancelled");

  await dbInsert("payments", { order_id: paid1.orderId, status: "approved", amount_cents: 11000, paid_at: new Date().toISOString() });
  await dbInsert("payments", { order_id: paid2.orderId, status: "approved", amount_cents: 5500, paid_at: new Date().toISOString() });
  await dbInsert("payments", { order_id: cancelledTicketRes.orderId, status: "approved", amount_cents: 3000, paid_at: new Date().toISOString() });

  await dbInsert("courtesies", { event_id: eventId, session_id: sessionId, ticket_id: courtesyIssuedTicket, order_id: courtesyIssued.orderId, customer_id: buyerId, phone: BUYER_PHONE, beneficiary_name: "Cortesia A", reason: "Lista", status: "issued" });
  await dbInsert("courtesies", { event_id: eventId, session_id: sessionId, ticket_id: courtesyUsedTicket, order_id: courtesyUsed.orderId, customer_id: buyerId, phone: BUYER_PHONE, beneficiary_name: "Cortesia B", reason: "Convidado", status: "issued" });
  await dbInsert("courtesies", { event_id: eventId, session_id: sessionId, ticket_id: courtesyCancelledTicket, order_id: courtesyCancelled.orderId, customer_id: buyerId, phone: BUYER_PHONE, beneficiary_name: "Cortesia C", reason: "Cancelada", status: "cancelled", cancelled_at: new Date().toISOString() });

  await dbInsert("ticket_validation_events", { ticket_id: ticketUsed, ticket_code: `${PREFIX}-T02`, result: "allowed", validator_identifier: GATE_PHONE });
  await dbInsert("ticket_validation_events", { ticket_id: ticketUsed, ticket_code: `${PREFIX}-T02`, result: "already_used", validator_identifier: GATE_PHONE });
  await dbInsert("ticket_validation_events", { ticket_id: ticketCancelled, ticket_code: `${PREFIX}-T03`, result: "denied", validator_identifier: GATE_PHONE });

  ids = { ...ids, pending, expired, cancelled, ticketIssued, ticketUsed, ticketCancelled };
}

function writeTemporaryNextEnv() {
  const lines = Object.entries(testEnv)
    .filter(([key]) => /^[A-Z0-9_]+$/.test(key))
    .map(([key, value]) => `${key}=${JSON.stringify(String(value))}`);
  writeFileSync(TEMP_ENV_FILE, `${lines.join("\n")}\n`);
}

async function startZapiMock() {
  const server = createServer(async (req, res) => {
    if (req.method !== "POST") {
      res.writeHead(404).end();
      return;
    }
    let body = "";
    for await (const chunk of req) body += chunk;
    zapiMessages.push(JSON.parse(body || "{}"));
    zapiCounter += 1;
    res.writeHead(200, { "content-type": "application/json" });
    res.end(JSON.stringify({ id: `zapi_${zapiCounter}` }));
  });
  await new Promise((resolve) => server.listen(ZAPI_PORT, "127.0.0.1", resolve));
  return server;
}

async function startNextDev() {
  const npmCommand = process.platform === "win32" ? "npm.cmd" : "npm";
  const child = spawn(npmCommand, ["run", "dev", "--", "--hostname", "127.0.0.1", "--port", String(PORT)], {
    env: { ...testEnv, PATH: process.env.PATH },
    stdio: ["ignore", "pipe", "pipe"],
    shell: process.platform === "win32",
  });
  child.stdout.on("data", (chunk) => process.stdout.write(`[next] ${chunk}`));
  child.stderr.on("data", (chunk) => process.stderr.write(`[next] ${chunk}`));

  const startedAt = Date.now();
  while (Date.now() - startedAt < 45_000) {
    try {
      const response = await fetch(`${APP_BASE_URL}/api/health`);
      if (response.ok) return child;
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error("next dev did not start");
}

function stopNextDev(child) {
  if (!child?.pid) return;
  if (process.platform === "win32") {
    spawnSync("taskkill", ["/pid", String(child.pid), "/T", "/F"], { stdio: "ignore" });
    return;
  }
  child.kill("SIGTERM");
}

async function sendMessage(phone, text) {
  const before = zapiMessages.length;
  const response = await fetch(WEBHOOK_URL, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-zapi-webhook-secret": testEnv.ZAPI_WEBHOOK_SECRET,
    },
    body: JSON.stringify({
      phone,
      fromMe: false,
      text: { message: text },
      messageId: providerMessageId(),
    }),
  });
  assert(response.ok, `webhook accepted ${JSON.stringify(text)}`);
  const startedAt = Date.now();
  while (Date.now() - startedAt < 10_000) {
    if (zapiMessages.length > before) {
      const messages = zapiMessages.slice(before);
      return {
        text: messages
          .map((message) => message?.message ?? message?.text ?? "")
          .join("\n\n"),
      };
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(`No Z-API response for ${text}`);
}

async function login(phone, label) {
  const prompt = await sendMessage(phone, "admin");
  assertIncludes(prompt.text, "LOGIN ADMINISTRATIVO", `${label} recebe login tokenizado`);
  const loginUrl = prompt.text.match(/https?:\/\/\S+\/admin\/login\/[^\s]+/)?.[0];
  assert(loginUrl, `${label} recebe link temporário`);
  const verifyResponse = await fetch(`${APP_BASE_URL}/api/admin/login/verify`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      token: loginUrl.split("/").pop(),
      passphrase: PASS,
    }),
  });
  const verifyBody = await verifyResponse.json();
  assert(
    verifyResponse.ok && /^\d{6}$/.test(verifyBody.code),
    `${label} recebe código de uso único`,
  );
  const response = await sendMessage(phone, verifyBody.code);
  assertIncludes(response.text, "MENU ADMIN", `${label} abre menu`);
  return response;
}

async function snapshotOperationalCounts() {
  const reservationIds = await dbSelectIds("reservations", "session_id", [ids.sessionId]);
  const orderIds = await dbSelectIds("orders", "reservation_id", reservationIds);
  const ticketIds = await dbSelectIds("tickets", "session_id", [ids.sessionId]);
  const scopes = [
    ["orders", "reservation_id", reservationIds],
    ["payments", "order_id", orderIds],
    ["reservations", "session_id", [ids.sessionId]],
    ["tickets", "session_id", [ids.sessionId]],
    ["session_seats", "session_id", [ids.sessionId]],
    ["courtesies", "event_id", [ids.eventId]],
    ["ticket_validation_events", "ticket_id", ticketIds],
  ];
  const result = {};
  for (const [table, column, values] of scopes) {
    if (!values.length) {
      result[table] = 0;
      continue;
    }
    const { count, error } = await service
      .from(table)
      .select("id", { count: "exact", head: true })
      .in(column, values);
    if (error) throw error;
    result[table] = count;
  }
  return result;
}

async function runReport(option, label, expected = [], selection = "1") {
  let response = await sendMessage(ROOT_PHONE, "relatorio");
  assertIncludes(response.text, "RELATÓRIOS", `${label} abre menu`);
  response = await sendMessage(ROOT_PHONE, String(option));
  if (option === 2) {
    assertIncludes(response.text, "quantos eventos", `${label} pede quantidade de eventos`);
    for (const command of ["VOLTAR", "CANCELAR", "SAIR"]) {
      assertIncludes(response.text, command, `${label} mostra botão ${command} na quantidade`);
    }
    const requestedEventCount = selection.split(/[\s,;]+/).filter(Boolean).length;
    response = await sendMessage(ROOT_PHONE, String(requestedEventCount));
    assertIncludes(response.text, "RELATÓRIO - BUSCAR EVENTOS", `${label} pede busca`);
    for (const command of ["VOLTAR", "CANCELAR", "SAIR"]) {
      assertIncludes(response.text, command, `${label} mostra botão ${command} na busca`);
    }
    const searchText = [
      `${PREFIX} EVENTO`,
      `${PREFIX} EVENTO DOIS`,
      `${PREFIX} EVENTO TRÊS`,
    ].slice(0, requestedEventCount).join(", ");
    response = await sendMessage(ROOT_PHONE, searchText);
    assertIncludes(response.text, "QUAL PERÍODO", `${label} segue direto para o período`);
    assertNotIncludes(response.text, "EVENTOS SELECIONADOS", `${label} não mostra confirmação intermediária`);
    assertNotIncludes(response.text, "RASCUNHO", `${label} não lista evento em rascunho`);
  } else if (option !== 1) {
    assertIncludes(response.text, "RELATÓRIO - ESCOLHA O EVENTO", `${label} pede evento`);
    response = await sendMessage(ROOT_PHONE, `${PREFIX} EVENTO`);
  }
  assertIncludes(response.text, "QUAL PERÍODO", `${label} pede período`);
  response = await sendMessage(ROOT_PHONE, "3");
  for (const text of expected) assertIncludes(response.text, text, `${label} contém ${text}`);
  for (const forbidden of ["payment_id", "metadata", "qr_token_hash", "customer_id", "order_id", BUYER_PHONE]) {
    assertNotIncludes(response.text, forbidden, `${label} não expõe ${forbidden}`);
  }
  return response.text;
}

async function verifyCleanup() {
  const phones = [ROOT_PHONE, MANAGER_PHONE, OPERATOR_PHONE, COMMON_PHONE, GATE_PHONE, BUYER_PHONE];
  const { count: adminCount } = await service.from("admin_users").select("id", { count: "exact", head: true }).in("phone", phones);
  const { count: eventCount } = await service.from("events").select("id", { count: "exact", head: true }).ilike("title", `${PREFIX}%`);
  const { count: customerCount } = await service.from("customers").select("id", { count: "exact", head: true }).in("whatsapp_phone", phones);
  assert(adminCount === 0, "R) cleanup admins vazio");
  assert(eventCount === 0, "R) cleanup eventos vazio");
  assert(customerCount === 0, "R) cleanup clientes vazio");
}

async function main() {
  let zapiServer;
  let nextChild;
  try {
    await seedData();
    writeTemporaryNextEnv();
    zapiServer = await startZapiMock();
    nextChild = await startNextDev();

    await login(ROOT_PHONE, "A) Diretor");
    let response = await sendMessage(ROOT_PHONE, "relatorio");
    assertIncludes(response.text, "RELATÓRIOS", "A) Diretor acessa Relatórios");
    await login(MANAGER_PHONE, "B) Gerente");
    response = await sendMessage(MANAGER_PHONE, "relatorio");
    assertIncludes(response.text, "RELATÓRIOS", "B) Gerente acessa Relatórios");
    await login(OPERATOR_PHONE, "C) Operador");
    response = await sendMessage(OPERATOR_PHONE, "relatorio");
    assertIncludes(response.text, "RELATÓRIOS", "C) Operador acessa Relatórios");
    response = await sendMessage(COMMON_PHONE, "relatorio");
    assertNotIncludes(response.text, "RELATÓRIOS", "D) Cliente comum não acessa");

    const before = await snapshotOperationalCounts();
    await runReport(1, "E) Resumo geral", ["RESUMO GERAL", "*Total vendido:*", "*Total ingressos:*", "*Cortesias emitidas:*"]);
    const salesEventReports = await runReport(
      2,
      "F) Vendas por evento",
      ["VENDAS POR EVENTO", "*Local:*", "*Período:*", "*Total vendido:*", "capacidade cadastrada", "*Total ingressos:*", "lugares cadastrados", "*Ingressos não usados:*"],
      "1, 2, 3",
    );
    assertNotIncludes(salesEventReports, "Nenhuma venda no período", "F) eventos sem venda exibem dados zerados");
    assertNotIncludes(salesEventReports, "Relatórios concluídos", "F) não envia mensagem final de conclusão");
    assertNotIncludes(salesEventReports, "Digite \"VOLTAR\"", "F) não envia navegação após os relatórios múltiplos");
    response = await sendMessage(ROOT_PHONE, "relatorio");
    response = await sendMessage(ROOT_PHONE, "2");
    response = await sendMessage(ROOT_PHONE, "2");
    assertIncludes(response.text, "separados por vírgula", "F2) busca orienta separar dois eventos por vírgula");
    response = await sendMessage(
      ROOT_PHONE,
      `${PREFIX} EVENTO DOIS, ${PREFIX} EVENTO TRÊS`,
    );
    assertIncludes(response.text, "QUAL PERÍODO", "F2) busca combinada segue direto para o período");
    assertNotIncludes(response.text, "EVENTOS SELECIONADOS", "F2) não mostra confirmação intermediária");
    assertNotIncludes(response.text, "Digite 2 números", "F2) não pede nova escolha por números");
    response = await sendMessage(ROOT_PHONE, "cancelar");
    await runReport(3, "G) Vendas por setor", ["VENDAS POR SETOR", "Pagos emitidos", "Valor vendido"]);
    await runReport(4, "H) Pagamentos pendentes", ["PAGAMENTOS PENDENTES", "pending_payment", "****1006"]);
    await runReport(5, "I) Reservas expiradas/canceladas", ["RESERVAS EXPIRADAS/CANCELADAS", "expired", "cancelled"]);
    await runReport(6, "J) Check-ins", ["CHECK-INS DA PORTARIA", "allowed", "already_used"]);
    await runReport(7, "K) Uso de ingressos", ["INGRESSOS USADOS E NÃO USADOS", "Emitidos", "Cancelados"]);
    await runReport(8, "L) Cortesias", ["CORTESIAS", "Emitidas", "Usadas", "Canceladas", "****1006"]);

    response = await sendMessage(ROOT_PHONE, "relatorio");
    response = await sendMessage(ROOT_PHONE, "2");
    assertIncludes(response.text, "quantos eventos", "M) busca pede quantidade primeiro");
    response = await sendMessage(ROOT_PHONE, "1");
    response = await sendMessage(ROOT_PHONE, `${PREFIX} EVENTO DOIS`);
    assertIncludes(response.text, "QUAL PERÍODO", "M) busca evento pelo nome e segue ao período");
    assertNotIncludes(response.text, "EVENTOS SELECIONADOS", "M) não mostra confirmação intermediária");
    response = await sendMessage(ROOT_PHONE, "cancelar");

    const eventDate = new Intl.DateTimeFormat("pt-BR", {
      timeZone: "America/Sao_Paulo",
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
    }).format(new Date(ids.startsAt));
    response = await sendMessage(ROOT_PHONE, "relatorio");
    response = await sendMessage(ROOT_PHONE, "2");
    response = await sendMessage(ROOT_PHONE, "1");
    response = await sendMessage(ROOT_PHONE, eventDate);
    assertIncludes(response.text, "QUAL PERÍODO", "N) busca evento pela data de São Paulo");
    response = await sendMessage(ROOT_PHONE, "cancelar");

    response = await sendMessage(MANAGER_PHONE, "relatorio");
    response = await sendMessage(MANAGER_PHONE, "2");
    response = await sendMessage(MANAGER_PHONE, "1");
    response = await sendMessage(MANAGER_PHONE, ids.eventId);
    assertIncludes(response.text, "Nenhum evento publicado encontrado", "O) UUID não contorna escopo do gerente");
    response = await sendMessage(MANAGER_PHONE, "cancelar");

    const after = await snapshotOperationalCounts();
    assert(JSON.stringify(before) === JSON.stringify(after), "Q) relatórios não alteram tabelas operacionais");

    response = await sendMessage(ROOT_PHONE, "relatorio");
    response = await sendMessage(ROOT_PHONE, "4");
    response = await sendMessage(ROOT_PHONE, "voltar");
    assertIncludes(response.text, "RELATÓRIOS", "P) Voltar funciona");
    response = await sendMessage(ROOT_PHONE, "4");
    response = await sendMessage(ROOT_PHONE, "cancelar");
    assertIncludes(response.text, "RELATÓRIOS", "P) Cancelar volta ao menu");
    response = await sendMessage(ROOT_PHONE, "sair");
    assertIncludes(response.text, "Sessão administrativa encerrada", "P) Sair funciona");

    await cleanup();
    await verifyCleanup();
  } finally {
    stopNextDev(nextChild);
    if (zapiServer) await new Promise((resolve) => zapiServer.close(resolve));
    rmSync(TEMP_ENV_FILE, { force: true });
    await cleanup();
  }
}

main().catch(async (error) => {
  console.error(error);
  await cleanup();
  process.exit(1);
});
