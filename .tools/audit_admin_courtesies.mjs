import { createServer } from "node:http";
import { spawn } from "node:child_process";
import { pbkdf2Sync, randomBytes } from "node:crypto";
import { readFileSync, rmSync, writeFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

const PREFIX = "TEST_ADMIN_COURTESIES";
const PORT = 3362;
const ZAPI_PORT = 4592;
const APP_BASE_URL = `http://127.0.0.1:${PORT}`;
const ZAPI_BASE_URL = `http://127.0.0.1:${ZAPI_PORT}`;
const WEBHOOK_URL = `${APP_BASE_URL}/api/webhook/zapi`;
const ROOT_PHONE = "559970001001";
const MANAGER_PHONE = "559970001002";
const OPERATOR_PHONE = "559970001003";
const BENEFICIARY_PHONE = "559970001004";
const BENEFICIARY_2_PHONE = "559970001005";
const COMMON_PHONE = "559970001006";
const BENEFICIARY_3_PHONE = "559970001007";
const PASS = "admin-courtesies-audit-pass";
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

for (const key of [
  "SUPABASE_URL",
  "SUPABASE_ANON_KEY",
  "SUPABASE_SERVICE_ROLE_KEY",
  "ZAPI_WEBHOOK_SECRET",
]) {
  if (!testEnv[key]) throw new Error(`Missing required env for audit: ${key}`);
}

const service = createClient(testEnv.SUPABASE_URL, testEnv.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});
const anon = createClient(testEnv.SUPABASE_URL, testEnv.SUPABASE_ANON_KEY, {
  auth: { persistSession: false },
});

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
  const { data: events } = await service
    .from("events")
    .select("id, venue_id")
    .ilike("title", `${PREFIX}%`);
  const eventIds = (events ?? []).map((event) => event.id);
  const venueIdsFromEvents = (events ?? []).map((event) => event.venue_id).filter(Boolean);
  const { data: venues } = await service.from("venues").select("id").ilike("name", `${PREFIX}%`);
  const venueIds = Array.from(
    new Set([...(venues ?? []).map((venue) => venue.id), ...venueIdsFromEvents]),
  );
  const sessionIds = await dbSelectIds("event_sessions", "event_id", eventIds);
  const sectionIds = await dbSelectIds("venue_sections", "venue_id", venueIds);
  const seatIds = await dbSelectIds("seats", "section_id", sectionIds);
  const reservationIds = await dbSelectIds("reservations", "session_id", sessionIds);
  const orderIds = reservationIds.length ? await dbSelectIds("orders", "reservation_id", reservationIds) : [];
  const ticketIds = orderIds.length ? await dbSelectIds("tickets", "order_id", orderIds) : [];
  const sessionSeatIds = await dbSelectIds("session_seats", "session_id", sessionIds);
  const customerPhones = [
    ROOT_PHONE,
    MANAGER_PHONE,
    OPERATOR_PHONE,
    BENEFICIARY_PHONE,
    BENEFICIARY_2_PHONE,
    COMMON_PHONE,
  ];

  if (ticketIds.length) await service.from("ticket_validation_events").delete().in("ticket_id", ticketIds);
  if (eventIds.length) await service.from("courtesies").delete().in("event_id", eventIds);
  if (ticketIds.length) await service.from("tickets").delete().in("id", ticketIds);
  if (orderIds.length) await service.from("payments").delete().in("order_id", orderIds);
  if (orderIds.length) await service.from("orders").delete().in("id", orderIds);
  if (reservationIds.length) await service.from("reservation_items").delete().in("reservation_id", reservationIds);
  if (reservationIds.length) await service.from("reservations").delete().in("id", reservationIds);
  if (sessionSeatIds.length) await service.from("session_seats").delete().in("id", sessionSeatIds);
  if (sessionIds.length) await service.from("ticket_prices").delete().in("session_id", sessionIds);
  if (seatIds.length) await service.from("seats").delete().in("id", seatIds);
  if (sectionIds.length) await service.from("venue_sections").delete().in("id", sectionIds);
  if (sessionIds.length) await service.from("event_sessions").delete().in("id", sessionIds);
  if (eventIds.length) await service.from("events").delete().in("id", eventIds);
  if (venueIds.length) await service.from("venues").delete().in("id", venueIds);

  const { data: customers } = await service
    .from("customers")
    .select("id")
    .in("whatsapp_phone", customerPhones);
  const customerIds = (customers ?? []).map((customer) => customer.id);
  const conversationIds = await dbSelectIds("conversations", "customer_id", customerIds);
  if (conversationIds.length) await service.from("whatsapp_messages").delete().in("conversation_id", conversationIds);
  if (conversationIds.length) await service.from("conversations").delete().in("id", conversationIds);
  if (customerIds.length) await service.from("customers").delete().in("id", customerIds);

  const { data: admins } = await service
    .from("admin_users")
    .select("id")
    .in("phone", [ROOT_PHONE, MANAGER_PHONE, OPERATOR_PHONE]);
  const adminIds = (admins ?? []).map((admin) => admin.id);
  if (adminIds.length) await service.from("admin_sessions").delete().in("admin_user_id", adminIds);
  if (adminIds.length) await service.from("admin_users").delete().in("id", adminIds);
}

async function verifyCleanup() {
  const { count: eventCount, error: eventError } = await service
    .from("events")
    .select("id", { count: "exact", head: true })
    .ilike("title", `${PREFIX}%`);
  if (eventError) throw eventError;
  const { count: customerCount, error: customerError } = await service
    .from("customers")
    .select("id", { count: "exact", head: true })
    .in("whatsapp_phone", [
      ROOT_PHONE,
      MANAGER_PHONE,
      OPERATOR_PHONE,
      BENEFICIARY_PHONE,
      BENEFICIARY_2_PHONE,
      COMMON_PHONE,
    ]);
  if (customerError) throw customerError;
  assert((eventCount ?? 0) === 0 && (customerCount ?? 0) === 0, "V) cleanup completo");
}

async function seedData() {
  const passphraseHash = hashPassphrase(PASS);
  await dbInsert("admin_users", {
    phone: ROOT_PHONE,
    role: "root",
    status: "active",
    name: `${PREFIX} Diretor`,
    passphrase_hash: passphraseHash,
  });
  const managerAdminId = await dbInsert("admin_users", {
    phone: MANAGER_PHONE,
    role: "admin",
    status: "active",
    name: `${PREFIX} Gerente`,
    passphrase_hash: passphraseHash,
  });
  const operatorAdminId = await dbInsert("admin_users", {
    phone: OPERATOR_PHONE,
    role: "operator",
    status: "active",
    name: `${PREFIX} Operador`,
    passphrase_hash: passphraseHash,
  });
  await dbInsert("customers", { whatsapp_phone: COMMON_PHONE, name: `${PREFIX} Cliente` });
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
  const unnumberedSectionId = await dbInsert("venue_sections", {
    venue_id: venueId,
    name: `${PREFIX} Geral`,
    slug: `${PREFIX.toLowerCase().replaceAll("_", "-")}-geral`,
    capacity: 3,
    has_numbered_seats: false,
    status: "active",
  });
  const numberedSectionId = await dbInsert("venue_sections", {
    venue_id: venueId,
    name: `${PREFIX} Numerado`,
    slug: `${PREFIX.toLowerCase().replaceAll("_", "-")}-numerado`,
    capacity: 3,
    has_numbered_seats: true,
    status: "active",
  });
  const unnumberedSessionSeatIds = [];
  for (let index = 1; index <= 3; index += 1) {
    const seatId = await dbInsert("seats", {
      venue_id: venueId,
      section_id: unnumberedSectionId,
      row_label: null,
      seat_number: String(index),
      seat_code: `${PREFIX}-G${index}`,
      status: "active",
    });
    unnumberedSessionSeatIds.push(
      await dbInsert("session_seats", {
        session_id: sessionId,
        section_id: unnumberedSectionId,
        seat_id: seatId,
        status: "available",
      }),
    );
  }
  const numberedSeats = [];
  for (let index = 1; index <= 3; index += 1) {
    const code = `A${String(index).padStart(2, "0")}`;
    const seatId = await dbInsert("seats", {
      venue_id: venueId,
      section_id: numberedSectionId,
      row_label: "A",
      seat_number: String(index),
      seat_code: code,
      status: "active",
      map_x: index,
      map_y: 1,
    });
    const sessionSeatId = await dbInsert("session_seats", {
      session_id: sessionId,
      section_id: numberedSectionId,
      seat_id: seatId,
      status: "available",
    });
    numberedSeats.push({ seatId, sessionSeatId, code });
  }
  for (const sectionId of [unnumberedSectionId, numberedSectionId]) {
    await dbInsert("ticket_prices", {
      session_id: sessionId,
      section_id: sectionId,
      ticket_type: "full",
      label: "Inteira",
      price_cents: 1000,
      fee_cents: 0,
      currency: "BRL",
      status: "active",
    });
  }
  seed = {
    managerAdminId,
    operatorAdminId,
    eventId,
    sessionId,
    unnumberedSectionId,
    numberedSectionId,
    unnumberedSessionSeatIds,
    numberedSeats,
  };
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
      image: body.image ?? null,
    });
    res.writeHead(200, { "content-type": "application/json" });
    res.end(JSON.stringify({ messageId: `zapi-admin-courtesies-${zapiCounter}` }));
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
    ADMIN_ROOT_WHATSAPP_PHONES: testEnv.ADMIN_ROOT_WHATSAPP_PHONES,
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

async function login(phone, label) {
  assertIncludes((await sendMessage(phone, "admin")).text, "palavra-chave", `${label} pede senha`);
  const response = await sendMessage(phone, PASS);
  assertIncludes(response.text, "MENU ADMIN", `${label} abre menu`);
  return response;
}

function optionForLineContaining(text, expected) {
  const line = String(text)
    .split(/\r?\n/)
    .find((candidate) => candidate.includes(expected));
  const match = line?.match(/>?\s*(\d+)\./);
  if (!match) throw new Error(`option not found for ${expected} in ${text}`);
  return match[1];
}

async function assertRpcPermissions() {
  const anonResult = await anon.rpc("issue_courtesy_order", {
    p_order_id: null,
    p_issued_by_admin_user_id: null,
    p_issued_by_admin_phone: "x",
  });
  assert(anonResult.error, "anon nao executa issue_courtesy_order");
  const serviceResult = await service.rpc("issue_courtesy_order", {
    p_order_id: null,
    p_issued_by_admin_user_id: null,
    p_issued_by_admin_phone: "x",
  });
  assert(
    serviceResult.error?.message?.includes("order_id_required"),
    "service_role executa issue_courtesy_order",
    serviceResult.error?.message,
  );
}

async function runGenerateCourtesyFlow({ phone, sectionName, quantity, beneficiaryPhone, seatCodes }) {
  await sendMessage(phone, "cortesia");
  let response = await sendMessage(phone, "1");
  assertIncludes(response.text, "GERAR CORTESIA", "gerar cortesia pede evento");
  response = await sendMessage(phone, PREFIX);
  assertIncludes(response.text, "ESCOLHA A SESSÃO", "gerar cortesia pede sessão");
  response = await sendMessage(phone, "1");
  assertIncludes(response.text, "ESCOLHA O SETOR", "gerar cortesia pede setor");
  response = await sendMessage(phone, optionForLineContaining(response.text, sectionName));
  assertIncludes(response.text, "QUANTIDADE DE CORTESIAS", "gerar cortesia pede quantidade");
  response = await sendMessage(phone, String(quantity));
  if (seatCodes?.length) {
    assert(response.messages.some((message) => message.url?.includes("send-image")), "F) mapa enviado para setor numerado");
    response = await sendMessage(phone, seatCodes.join(" "));
  }
  assertIncludes(response.text, "TELEFONE DO BENEFICIÁRIO", "gerar cortesia pede telefone");
  response = await sendMessage(phone, beneficiaryPhone);
  assertIncludes(response.text, "NOME DO BENEFICIÁRIO", "gerar cortesia pede nome");
  response = await sendMessage(phone, "Beneficiario Teste");
  assertIncludes(response.text, "MOTIVO", "gerar cortesia pede motivo");
  response = await sendMessage(phone, "Convidado");
  assertIncludes(response.text, "CONFIRMAR CORTESIA", "gerar cortesia mostra resumo");
  response = await sendMessage(phone, "CONFIRMAR");
  assertIncludes(response.text, "CORTESIA GERADA", "cortesia gerada com sucesso");
  assert(
    zapiMessages.some((message) => message.phone === beneficiaryPhone && message.url?.includes("send-image")),
    "I) QRCode enviado ao beneficiario",
  );
  return response;
}

async function main() {
  await cleanup();
  await assertRpcPermissions();
  await seedData();
  writeTemporaryNextEnv();
  let zapiServer;
  let nextChild;
  try {
    zapiServer = await startZapiMock();
    nextChild = await startNextDev();

    let response = await login(ROOT_PHONE, "A) Diretor");
    assertIncludes(response.text, "Cortesias", "A) Diretor acessa Cortesias");
    response = await login(MANAGER_PHONE, "B) Gerente");
    assertIncludes(response.text, "Cortesias", "B) Gerente acessa Cortesias");
    response = await login(OPERATOR_PHONE, "C) Operador");
    assertIncludes(response.text, "Cortesias", "C) Operador acessa Cortesias");
    response = await sendMessage(COMMON_PHONE, "cortesia");
    assertIncludes(response.text, "Não encontrei cortesia", "D) cliente comum nao acessa menu Cortesias");

    await runGenerateCourtesyFlow({
      phone: ROOT_PHONE,
      sectionName: "Geral",
      quantity: 1,
      beneficiaryPhone: BENEFICIARY_PHONE,
    });
    const { data: firstCourtesy } = await service
      .from("courtesies")
      .select("id, ticket_id, order_id, tickets!inner(id, ticket_code, status, reservation_item_id, reservation_items(session_seat_id))")
      .eq("phone", BENEFICIARY_PHONE)
      .single();
    assert(firstCourtesy?.ticket_id, "E) cortesia sem assento emite ticket");
    const firstTicket = Array.isArray(firstCourtesy.tickets) ? firstCourtesy.tickets[0] : firstCourtesy.tickets;
    const firstReservationItem = Array.isArray(firstTicket.reservation_items)
      ? firstTicket.reservation_items[0]
      : firstTicket.reservation_items;
    const { data: firstSeat } = await service
      .from("session_seats")
      .select("status")
      .eq("id", firstReservationItem.session_seat_id)
      .single();
    assert(firstSeat?.status === "sold", "E) cortesia sem assento consome disponibilidade");
    const { count: paymentsCount } = await service
      .from("payments")
      .select("id", { count: "exact", head: true })
      .eq("order_id", firstCourtesy.order_id);
    assert((paymentsCount ?? 0) === 0, "J) cortesia nao cria payment Mercado Pago");

    await runGenerateCourtesyFlow({
      phone: ROOT_PHONE,
      sectionName: "Numerado",
      quantity: 1,
      beneficiaryPhone: BENEFICIARY_2_PHONE,
      seatCodes: ["A01"],
    });
    const { data: numberedSeat } = await service
      .from("session_seats")
      .select("status")
      .eq("id", seed.numberedSeats[0].sessionSeatId)
      .single();
    assert(numberedSeat?.status === "sold", "F) cortesia numerada consome assento escolhido");

    const { count: ticketCountBeforeUnavailable } = await service
      .from("tickets")
      .select("id", { count: "exact", head: true })
      .eq("session_id", seed.sessionId);

    await sendMessage(ROOT_PHONE, "cortesia");
    response = await sendMessage(ROOT_PHONE, "1");
    response = await sendMessage(ROOT_PHONE, PREFIX);
    response = await sendMessage(ROOT_PHONE, "1");
    response = await sendMessage(ROOT_PHONE, optionForLineContaining(response.text, "Geral"));
    response = await sendMessage(ROOT_PHONE, "3");
    response = await sendMessage(ROOT_PHONE, BENEFICIARY_3_PHONE);
    response = await sendMessage(ROOT_PHONE, "Beneficiario Indisponivel");
    response = await sendMessage(ROOT_PHONE, "Teste de disponibilidade");
    response = await sendMessage(ROOT_PHONE, "CONFIRMAR");
    assertIncludes(
      response.text,
      "Nenhum ingresso foi emitido parcialmente",
      "G) quantidade maior que disponivel bloqueia sem parcial",
    );

    await sendMessage(ROOT_PHONE, "cortesia");
    response = await sendMessage(ROOT_PHONE, "1");
    response = await sendMessage(ROOT_PHONE, PREFIX);
    response = await sendMessage(ROOT_PHONE, "1");
    response = await sendMessage(ROOT_PHONE, optionForLineContaining(response.text, "Numerado"));
    response = await sendMessage(ROOT_PHONE, "1");
    response = await sendMessage(ROOT_PHONE, "A01");
    response = await sendMessage(ROOT_PHONE, BENEFICIARY_3_PHONE);
    response = await sendMessage(ROOT_PHONE, "Beneficiario Assento Ocupado");
    response = await sendMessage(ROOT_PHONE, "Teste assento ocupado");
    response = await sendMessage(ROOT_PHONE, "CONFIRMAR");
    assertIncludes(response.text, "ASSENTO INDISPONÍVEL", "H) assento ocupado bloqueia");
    const { count: ticketCountAfterUnavailable } = await service
      .from("tickets")
      .select("id", { count: "exact", head: true })
      .eq("session_id", seed.sessionId);
    assert(
      ticketCountAfterUnavailable === ticketCountBeforeUnavailable,
      "G/H) falhas de cortesia nao criam tickets parciais",
    );

    response = await sendMessage(ROOT_PHONE, "cortesia");
    response = await sendMessage(ROOT_PHONE, "2");
    response = await sendMessage(ROOT_PHONE, PREFIX);
    assertIncludes(response.text, "CORTESIAS EMITIDAS", "K) listar cortesias mostra lista");
    assertNotIncludes(response.text, "qr_token_hash", "T) listar nao expoe qr hash");
    assertNotIncludes(response.text, "payment", "T) listar nao expoe metadata pagamento");

    response = await sendMessage(ROOT_PHONE, "cortesia");
    response = await sendMessage(ROOT_PHONE, "3");
    response = await sendMessage(ROOT_PHONE, BENEFICIARY_PHONE);
    response = await sendMessage(ROOT_PHONE, "1");
    response = await sendMessage(ROOT_PHONE, "CONFIRMAR");
    assertIncludes(response.text, "Cortesia reenviada", "L) reenviar cortesia reenvia");
    const { count: ticketCountAfterResend } = await service
      .from("tickets")
      .select("id", { count: "exact", head: true })
      .eq("session_id", seed.sessionId);
    assert((ticketCountAfterResend ?? 0) === 2, "L) reenvio nao cria novo ticket");

    response = await sendMessage(ROOT_PHONE, "cortesia");
    response = await sendMessage(ROOT_PHONE, "4");
    response = await sendMessage(ROOT_PHONE, BENEFICIARY_PHONE);
    response = await sendMessage(ROOT_PHONE, "1");
    response = await sendMessage(ROOT_PHONE, "texto errado");
    assertIncludes(response.text, "não foi cancelada", "O) texto errado nao cancela");

    await sendMessage(ROOT_PHONE, "cortesia");
    await sendMessage(ROOT_PHONE, "4");
    await sendMessage(ROOT_PHONE, BENEFICIARY_PHONE);
    await sendMessage(ROOT_PHONE, "1");
    response = await sendMessage(ROOT_PHONE, "CANCELAR CORTESIA");
    assertIncludes(response.text, "CORTESIA CANCELADA", "N/P) cancelar cortesia exige frase e cancela");
    const { data: cancelledTicket } = await service
      .from("tickets")
      .select("id, ticket_code, status")
      .eq("id", firstCourtesy.ticket_id)
      .single();
    assert(cancelledTicket.status === "cancelled", "P) ticket da cortesia ficou cancelled");
    const { data: releasedSeat } = await service
      .from("session_seats")
      .select("status")
      .eq("id", firstReservationItem.session_seat_id)
      .single();
    assert(releasedSeat.status === "available", "P) cancelar cortesia libera disponibilidade");
    const validationCancelled = await service.rpc("validate_ticket_entry", {
      p_ticket_id: cancelledTicket.id,
      p_ticket_code: cancelledTicket.ticket_code,
      p_gate_session_id: null,
      p_gate_label: "Audit",
      p_validator_identifier: "audit",
      p_metadata: {},
    });
    assert(validationCancelled.data?.allowed === false, "Q) cortesia cancelada recusada na portaria");

    await sendMessage(ROOT_PHONE, "cortesia");
    await sendMessage(ROOT_PHONE, "3");
    await sendMessage(ROOT_PHONE, BENEFICIARY_PHONE);
    await sendMessage(ROOT_PHONE, "1");
    response = await sendMessage(ROOT_PHONE, "CONFIRMAR");
    assertIncludes(response.text, "cancelada ou já foi usada", "M) reenviar cortesia cancelada bloqueia");

    const { data: issuedCourtesy } = await service
      .from("courtesies")
      .select("ticket_id, tickets!inner(id, ticket_code)")
      .eq("phone", BENEFICIARY_2_PHONE)
      .single();
    const issuedTicket = Array.isArray(issuedCourtesy.tickets) ? issuedCourtesy.tickets[0] : issuedCourtesy.tickets;
    const validationIssued = await service.rpc("validate_ticket_entry", {
      p_ticket_id: issuedTicket.id,
      p_ticket_code: issuedTicket.ticket_code,
      p_gate_session_id: null,
      p_gate_label: "Audit",
      p_validator_identifier: "audit",
      p_metadata: {},
    });
    assert(validationIssued.data?.allowed === true, "R) cortesia issued aceita na portaria");
    const validationUsed = await service.rpc("validate_ticket_entry", {
      p_ticket_id: issuedTicket.id,
      p_ticket_code: issuedTicket.ticket_code,
      p_gate_session_id: null,
      p_gate_label: "Audit",
      p_validator_identifier: "audit",
      p_metadata: {},
    });
    assert(validationUsed.data?.result === "already_used", "S) cortesia usada retorna already_used");

    await sendMessage(ROOT_PHONE, "cortesia");
    await sendMessage(ROOT_PHONE, "3");
    await sendMessage(ROOT_PHONE, BENEFICIARY_2_PHONE);
    await sendMessage(ROOT_PHONE, "1");
    response = await sendMessage(ROOT_PHONE, "CONFIRMAR");
    assertIncludes(response.text, "cancelada ou já foi usada", "M) reenviar used bloqueia");

    response = await sendMessage(ROOT_PHONE, "cortesia");
    assertIncludes(response.text, "CORTESIAS", "U) Voltar/Cancelar/Sair base funcionando");
  } finally {
    await stopChild(nextChild);
    if (zapiServer) await new Promise((resolve) => zapiServer.close(resolve));
    removeTemporaryNextEnv();
    await cleanup();
    await verifyCleanup();
  }
}

main().catch(async (error) => {
  console.error(error);
  await cleanup().catch(() => null);
  removeTemporaryNextEnv();
  process.exit(1);
});
