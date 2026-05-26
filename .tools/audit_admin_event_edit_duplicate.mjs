import { createServer } from "node:http";
import { spawn } from "node:child_process";
import { pbkdf2Sync, randomBytes } from "node:crypto";
import { readFileSync, rmSync, writeFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

const PREFIX = "TEST_ADMIN_EVENT_EDIT_DUPLICATE";
const PORT = 3356;
const ZAPI_PORT = 4586;
const APP_BASE_URL = `http://127.0.0.1:${PORT}`;
const ZAPI_BASE_URL = `http://127.0.0.1:${ZAPI_PORT}`;
const WEBHOOK_URL = `${APP_BASE_URL}/api/webhook/zapi`;
const ADMIN_PHONE = "559970000801";
const BUYER_PHONE = "559970000802";
const PASS = "admin-event-edit-audit-pass";
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
  TICKET_RESERVATION_TTL_MINUTES:
    fileEnv.TICKET_RESERVATION_TTL_MINUTES || "10",
  TICKET_QR_SECRET:
    fileEnv.TICKET_QR_SECRET ||
    "audit-ticket-qr-secret-with-at-least-thirty-two-chars",
  SEAT_MAP_STORAGE_BUCKET: fileEnv.SEAT_MAP_STORAGE_BUCKET || "seat-maps",
  GATE_ADMIN_SECRET: fileEnv.GATE_ADMIN_SECRET || "audit-gate-admin-secret",
  GATE_SESSION_SECRET:
    fileEnv.GATE_SESSION_SECRET ||
    "audit-gate-session-secret-with-at-least-thirty-two-chars",
  GATE_SESSION_TTL_MINUTES: fileEnv.GATE_SESSION_TTL_MINUTES || "480",
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
let adminUserId = null;
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

function findNumberForLineContaining(message, fragment) {
  const normalizedFragment = fragment.toLowerCase();
  const line = String(message)
    .split(/\r?\n/)
    .find(
      (item) =>
        /^\s*(?:>\s*)?\d+[\).\s-]/.test(item) &&
        item.toLowerCase().includes(normalizedFragment),
    );
  const match = line?.match(/^\s*(?:>\s*)?(\d+)[\).\s-]/);
  if (!match) throw new Error(`Não encontrei número para ${fragment} em ${message}`);
  return match[1];
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
  const sessionSeatIds = await dbSelectIds("session_seats", "session_id", sessionIds);
  const reservationIds = await dbSelectIds("reservations", "session_id", sessionIds);
  const orderIds = reservationIds.length ? await dbSelectIds("orders", "reservation_id", reservationIds) : [];
  const ticketIds = orderIds.length ? await dbSelectIds("tickets", "order_id", orderIds) : [];

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

  const { data: customers } = await supabase
    .from("customers")
    .select("id")
    .in("whatsapp_phone", [ADMIN_PHONE, BUYER_PHONE]);
  const customerIds = (customers ?? []).map((customer) => customer.id);
  const conversationIds = await dbSelectIds("conversations", "customer_id", customerIds);
  if (conversationIds.length) {
    await supabase.from("whatsapp_messages").delete().in("conversation_id", conversationIds);
  }
  if (conversationIds.length) await supabase.from("conversations").delete().in("id", conversationIds);
  if (customerIds.length) await supabase.from("customers").delete().in("id", customerIds);

  const { data: admins } = await supabase
    .from("admin_users")
    .select("id")
    .in("phone", [ADMIN_PHONE]);
  const adminIds = (admins ?? []).map((admin) => admin.id);
  if (adminIds.length) await supabase.from("admin_sessions").delete().in("admin_user_id", adminIds);
  if (adminIds.length) await supabase.from("admin_users").delete().in("id", adminIds);
}

async function verifyCleanup() {
  const checks = [
    supabase.from("events").select("id", { count: "exact", head: true }).ilike("title", `${PREFIX}%`),
    supabase.from("venues").select("id", { count: "exact", head: true }).ilike("name", `${PREFIX}%`),
    supabase.from("customers").select("id", { count: "exact", head: true }).in("whatsapp_phone", [ADMIN_PHONE, BUYER_PHONE]),
    supabase.from("admin_users").select("id", { count: "exact", head: true }).in("phone", [ADMIN_PHONE]),
  ];
  const results = await Promise.all(checks);
  results.forEach(({ count, error }, index) => {
    if (error) throw error;
    assert((count ?? 0) === 0, `Z) cleanup ${index + 1} sem dados temporários`, `restaram ${count}`);
  });
}

async function createAdmin() {
  adminUserId = await dbInsert("admin_users", {
    phone: ADMIN_PHONE,
    role: "admin",
    status: "active",
    name: `${PREFIX} Gerente`,
    passphrase_hash: hashPassphrase(PASS),
    created_by_admin_phone: ADMIN_PHONE,
  });
}

async function createSeedCatalog() {
  const venueId = await dbInsert("venues", {
    name: `${PREFIX} Teatro Original`,
    city: "Sorocaba",
    state: "SP",
    status: "active",
  });
  const reusableVenueId = await dbInsert("venues", {
    name: `${PREFIX} Teatro Reutilizado`,
    city: "Itu",
    state: "SP",
    status: "active",
  });
  const eventId = await dbInsert("events", {
    title: `${PREFIX} EVENTO ORIGINAL`,
    artist_name: `${PREFIX} Artista Original`,
    description: "Descricao original",
    city: "Sorocaba",
    state: "SP",
    image_url: "https://example.com/original.jpg",
    venue_id: venueId,
    status: "published",
    created_by_admin_user_id: adminUserId,
    created_by_admin_phone: ADMIN_PHONE,
  });
  const sessionId = await dbInsert("event_sessions", {
    event_id: eventId,
    venue_id: venueId,
    starts_at: "2026-09-15T23:00:00.000Z",
    status: "sales_open",
  });
  const editableSessionId = await dbInsert("event_sessions", {
    event_id: eventId,
    venue_id: venueId,
    starts_at: "2026-09-16T23:00:00.000Z",
    status: "sales_open",
  });
  const generalSectionId = await dbInsert("venue_sections", {
    venue_id: venueId,
    name: "Pista",
    slug: "pista",
    capacity: 3,
    has_numbered_seats: false,
    status: "active",
  });
  const numberedSectionId = await dbInsert("venue_sections", {
    venue_id: venueId,
    name: "Assentos",
    slug: "assentos",
    capacity: 2,
    has_numbered_seats: true,
    status: "active",
  });

  const generalSeatIds = [];
  for (let index = 1; index <= 3; index += 1) {
    const seatId = await dbInsert("seats", {
      venue_id: venueId,
      section_id: generalSectionId,
      row_label: null,
      seat_number: String(index),
      seat_code: `PISTA-${String(index).padStart(4, "0")}`,
      status: "active",
    });
    generalSeatIds.push(seatId);
    await dbInsert("session_seats", {
      session_id: sessionId,
      seat_id: seatId,
      section_id: generalSectionId,
      status: "available",
    });
    await dbInsert("session_seats", {
      session_id: editableSessionId,
      seat_id: seatId,
      section_id: generalSectionId,
      status: "available",
    });
  }

  const numberedSeatIds = [];
  for (const code of ["A01", "A02"]) {
    const seatId = await dbInsert("seats", {
      venue_id: venueId,
      section_id: numberedSectionId,
      row_label: "A",
      seat_number: code.slice(1),
      seat_code: code,
      map_x: Number(code.slice(1)),
      map_y: 1,
      status: "active",
    });
    numberedSeatIds.push(seatId);
    await dbInsert("session_seats", {
      session_id: sessionId,
      seat_id: seatId,
      section_id: numberedSectionId,
      status: code === "A01" ? "sold" : "available",
    });
    await dbInsert("session_seats", {
      session_id: editableSessionId,
      seat_id: seatId,
      section_id: numberedSectionId,
      status: "available",
    });
  }

  const priceId = await dbInsert("ticket_prices", {
    session_id: sessionId,
    section_id: generalSectionId,
    ticket_type: "full",
    label: "Inteira",
    price_cents: 10000,
    fee_cents: 500,
    currency: "BRL",
    status: "active",
  });
  await dbInsert("ticket_prices", {
    session_id: sessionId,
    section_id: generalSectionId,
    ticket_type: "half",
    label: "Meia",
    price_cents: 5000,
    fee_cents: 250,
    currency: "BRL",
    status: "active",
  });

  const customerId = await dbInsert("customers", {
    whatsapp_phone: BUYER_PHONE,
    name: `${PREFIX} Comprador`,
  });
  const reservationId = await dbInsert("reservations", {
    customer_id: customerId,
    session_id: sessionId,
    status: "active",
    expires_at: "2026-09-15T22:00:00.000Z",
    total_amount_cents: 10000,
    total_fee_cents: 500,
    currency: "BRL",
  });
  const { data: firstGeneralSessionSeat, error: ssError } = await supabase
    .from("session_seats")
    .select("id")
    .eq("session_id", sessionId)
    .eq("section_id", generalSectionId)
    .eq("seat_id", generalSeatIds[0])
    .single();
  if (ssError) throw ssError;
  await supabase
    .from("session_seats")
    .update({ status: "reserved", current_reservation_id: reservationId })
    .eq("id", firstGeneralSessionSeat.id);
  await dbInsert("reservation_items", {
    reservation_id: reservationId,
    session_seat_id: firstGeneralSessionSeat.id,
    seat_id: generalSeatIds[0],
    section_id: generalSectionId,
    ticket_price_id: priceId,
    seat_code: "PISTA-0001",
    ticket_type: "full",
    price_cents: 10000,
    fee_cents: 500,
    currency: "BRL",
  });
  await dbInsert("orders", {
    reservation_id: reservationId,
    customer_id: customerId,
    status: "pending_payment",
    total_amount_cents: 10000,
    total_fee_cents: 500,
    currency: "BRL",
  });

  seed = {
    venueId,
    reusableVenueId,
    eventId,
    sessionId,
    editableSessionId,
    generalSectionId,
    numberedSectionId,
    priceId,
    reservationId,
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
    });
    res.writeHead(200, { "content-type": "application/json" });
    res.end(JSON.stringify({ messageId: `zapi-admin-event-edit-${zapiCounter}` }));
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
  return {
    messages,
    text: messages.map((message) => message.message).join("\n---\n"),
  };
}

async function login() {
  assertIncludes((await sendMessage(ADMIN_PHONE, "admin")).text, "palavra-chave", "login pede senha");
  const response = await sendMessage(ADMIN_PHONE, PASS);
  assertIncludes(response.text, "MENU ADMIN", "login abre menu admin");
}

async function openEditMenu() {
  await sendMessage(ADMIN_PHONE, "meus eventos");
  await sendMessage(ADMIN_PHONE, "3");
  const selected = await sendMessage(ADMIN_PHONE, `${PREFIX} EVENTO ORIGINAL`);
  assertIncludes(selected.text, "EDITAR MEU EVENTO", "A) menu Editar meu evento abre");
  assertIncludes(selected.text, "1. Editar nome", "A) mostra editar nome");
  assertIncludes(selected.text, "10. Editar valores", "A) mostra editar valores");
  assertIncludes(selected.text, "13. Sair", "A) mostra sair");
  return selected;
}

async function fetchEvent(eventId = seed.eventId) {
  const { data, error } = await supabase
    .from("events")
    .select("id,title,artist_name,description,city,state,image_url,venue_id,status")
    .eq("id", eventId)
    .single();
  if (error) throw error;
  return data;
}

async function fetchPrice(priceId = seed.priceId) {
  const { data, error } = await supabase
    .from("ticket_prices")
    .select("id,label,price_cents,fee_cents,status")
    .eq("id", priceId)
    .single();
  if (error) throw error;
  return data;
}

async function editSimple(option, value, expectedText) {
  await openEditMenu();
  const prompt = await sendMessage(ADMIN_PHONE, String(option));
  assert(prompt.text.length > 0, `prompt para opção ${option}`);
  const summary = await sendMessage(ADMIN_PHONE, value);
  assertIncludes(summary.text, "Confirmar alteração", expectedText);
  const confirmed = await sendMessage(ADMIN_PHONE, "CONFIRMAR");
  assertIncludes(confirmed.text, "PUBLICAR EVENTO", `${expectedText} salva e pergunta status`);
  await sendMessage(ADMIN_PHONE, "3");
}

async function testSimpleEdits() {
  await openEditMenu();
  await editSimple(1, `${PREFIX} EVENTO EDITADO`, "B) editar nome exige confirmação");
  assert((await fetchEvent()).title === `${PREFIX} EVENTO EDITADO`, "B) nome salvo");
  await editSimple(2, `${PREFIX} Artista Editado`, "C) editar artista exige confirmação");
  assert((await fetchEvent()).artist_name === `${PREFIX} Artista Editado`, "C) artista salvo");
  await editSimple(3, "Itu", "D) editar cidade exige confirmação");
  await editSimple(4, "SP", "D) editar estado exige confirmação");
  const eventAfterCity = await fetchEvent();
  assert(eventAfterCity.city === "Itu" && eventAfterCity.state === "SP", "D) cidade/estado salvos");

  const venuesBefore = await supabase
    .from("venues")
    .select("id", { count: "exact", head: true })
    .ilike("name", `${PREFIX} Teatro Reutilizado`);
  await editSimple(5, `${PREFIX} Teatro Reutilizado`, "E) editar local exige confirmação");
  const venuesAfter = await supabase
    .from("venues")
    .select("id", { count: "exact", head: true })
    .ilike("name", `${PREFIX} Teatro Reutilizado`);
  assert(venuesBefore.count === venuesAfter.count, "E) local reutiliza venue existente");
  assert((await fetchEvent()).venue_id === seed.reusableVenueId, "E) local salvo com venue existente");
  await editSimple(3, "Sorocaba", "D) restaura cidade original");
  await editSimple(5, `${PREFIX} Teatro Original`, "E) restaura local original");
  assert((await fetchEvent()).venue_id === seed.venueId, "E) local original restaurado para demais testes");

  await editSimple(6, "remover", "F) editar foto permite remover");
  assert((await fetchEvent()).image_url === null, "F) foto removida");
  await editSimple(6, "https://example.com/editada.jpg", "F) editar foto permite atualizar");
  assert((await fetchEvent()).image_url === "https://example.com/editada.jpg", "F) foto atualizada");

  await editSimple(11, "Informações gerais editadas", "G) editar informações exige confirmação");
  assert((await fetchEvent()).description === "Informações gerais editadas", "G) description salva");
}

async function testSessionEdit() {
  await openEditMenu();
  await sendMessage(ADMIN_PHONE, "7");
  const past = await sendMessage(ADMIN_PHONE, "2 | 10/01/2020 22:00");
  assertIncludes(past.text, "Data inválida", "I) data passada bloqueada");
  const summary = await sendMessage(ADMIN_PHONE, "2 | 20/09/2026 22:30");
  assertIncludes(summary.text, "Confirmar alteração", "H) data/hora exige confirmação");
  await sendMessage(ADMIN_PHONE, "CONFIRMAR");
  const { data, error } = await supabase
    .from("event_sessions")
    .select("starts_at")
    .eq("id", seed.editableSessionId)
    .single();
  if (error) throw error;
  assert(String(data.starts_at).startsWith("2026-09-21T01:30"), "H) data/hora salva em UTC");
}

async function testSectionsCapacityAndSeats() {
  await openEditMenu();
  await sendMessage(ADMIN_PHONE, "8");
  await sendMessage(ADMIN_PHONE, "3");
  const sectionSummary = await sendMessage(ADMIN_PHONE, "1 | Pista VIP | 3 | active | nao");
  assertIncludes(sectionSummary.text, "Confirmar alteração do setor", "J) setor exige confirmação");
  await sendMessage(ADMIN_PHONE, "CONFIRMAR");
  const { data: section, error } = await supabase
    .from("venue_sections")
    .select("name,capacity,status")
    .eq("id", seed.generalSectionId)
    .single();
  if (error) throw error;
  assert(section.name === "Pista VIP" && section.capacity === 3, "J) setor atualizado");

  await openEditMenu();
  await sendMessage(ADMIN_PHONE, "8");
  const seatStatusPrompt = await sendMessage(ADMIN_PHONE, "5");
  const numberedOption = findNumberForLineContaining(seatStatusPrompt.text, "Assentos");
  const blocked = await sendMessage(ADMIN_PHONE, `${numberedOption} | blocked | A01`);
  assertIncludes(blocked.text, "reservados ou vendidos", "K) assento vendido não altera");
  const { data: soldSeat, error: soldError } = await supabase
    .from("session_seats")
    .select("status")
    .eq("session_id", seed.sessionId)
    .eq("section_id", seed.numberedSectionId)
    .eq("status", "sold")
    .single();
  if (soldError) throw soldError;
  assert(soldSeat.status === "sold", "K) sold permanece sold");

  await openEditMenu();
  const capacityPrompt = await sendMessage(ADMIN_PHONE, "9");
  const generalOption = findNumberForLineContaining(capacityPrompt.text, "Pista VIP");
  const capacitySummary = await sendMessage(ADMIN_PHONE, `${generalOption} | 5`);
  assertIncludes(capacitySummary.text, "Confirmar alteração de carga", "L) carga exige confirmação");
  const capacityDone = await sendMessage(ADMIN_PHONE, "CONFIRMAR");
  assertIncludes(capacityDone.text, "Carga atualizada", "L) carga atualizada");
  const availableAfterIncrease = await supabase
    .from("session_seats")
    .select("id", { count: "exact", head: true })
    .eq("session_id", seed.sessionId)
    .eq("section_id", seed.generalSectionId)
    .eq("status", "available");
  assert((availableAfterIncrease.count ?? 0) >= 4, "L) aumentar carga cria unidades available");
  const activeSeatsAfterIncrease = await supabase
    .from("seats")
    .select("id", { count: "exact", head: true })
    .eq("section_id", seed.generalSectionId)
    .eq("status", "active");
  assert((activeSeatsAfterIncrease.count ?? 0) >= 5, "L) carga aumenta unidades estruturais");

  await openEditMenu();
  const reducePrompt = await sendMessage(ADMIN_PHONE, "9");
  const generalOptionForReduce = findNumberForLineContaining(reducePrompt.text, "Pista VIP");
  await sendMessage(ADMIN_PHONE, `${generalOptionForReduce} | 0`);
  const reduceBlocked = await sendMessage(ADMIN_PHONE, "CONFIRMAR");
  assertIncludes(reduceBlocked.text, "Não é possível reduzir", "M) redução abaixo de busy bloqueada");
}

async function testPrices() {
  await openEditMenu();
  const pricesMenu = await sendMessage(ADMIN_PHONE, "10");
  assertIncludes(pricesMenu.text, "VALORES DE VENDA", "N) menu valores abre");
  const list = await sendMessage(ADMIN_PHONE, "1");
  assertIncludes(list.text, "Inteira", "N) lista preços do evento");
  await sendMessage(ADMIN_PHONE, "Voltar");

  await sendMessage(ADMIN_PHONE, "3");
  const select = await sendMessage(ADMIN_PHONE, "1");
  assertIncludes(select.text, "NOVO VALOR", "O) editar preço pede só novo valor");
  const updated = await sendMessage(ADMIN_PHONE, "140,00");
  assertIncludes(updated.text, "VALOR ATUALIZADO", "O) preço atualizado");
  const price = await fetchPrice();
  assert(price.price_cents === 14000, "P) 140,00 vira 14000");
  assert(price.fee_cents === 500 && price.label === "Inteira", "O) altera apenas price_cents");
  const { data: frozenItem, error: frozenError } = await supabase
    .from("reservation_items")
    .select("price_cents")
    .eq("reservation_id", seed.reservationId)
    .single();
  if (frozenError) throw frozenError;
  assert(frozenItem.price_cents === 10000, "R) reservation_items antigo segue congelado");

  await sendMessage(ADMIN_PHONE, "Voltar");
  await sendMessage(ADMIN_PHONE, "3");
  await sendMessage(ADMIN_PHONE, "1");
  const negative = await sendMessage(ADMIN_PHONE, "-1");
  assertIncludes(negative.text, "VALOR INVÁLIDO", "Q) valor negativo bloqueado");
  await sendMessage(ADMIN_PHONE, "Voltar");

  await sendMessage(ADMIN_PHONE, "2");
  await sendMessage(ADMIN_PHONE, "1 | 2 | full | Inteira | 150,00 | 0 | - | -");
  const duplicateCreate = await sendMessage(ADMIN_PHONE, "CONFIRMAR");
  assertIncludes(duplicateCreate.text, "Não consegui criar o preço", "S) unique session/section/label respeitado");

  await sendMessage(ADMIN_PHONE, "4");
  await sendMessage(ADMIN_PHONE, "1 | inactive");
  const statusDone = await sendMessage(ADMIN_PHONE, "CONFIRMAR");
  assertIncludes(statusDone.text, "Preço/lote atualizado", "T) status do preço atualizado");
  assert((await fetchPrice()).status === "inactive", "T) preço inativado sem apagar");
}

async function testDuplicateAndBuyerSearch() {
  await sendMessage(ADMIN_PHONE, "meus eventos");
  await sendMessage(ADMIN_PHONE, "5");
  const confirm = await sendMessage(ADMIN_PHONE, `${PREFIX} EVENTO EDITADO`);
  assertIncludes(confirm.text, "DUPLICAR EVENTO", "duplicar mostra resumo");
  assertIncludes(confirm.text, "CONFIRMAR", "duplicar exige confirmação");
  const duplicated = await sendMessage(ADMIN_PHONE, "CONFIRMAR");
  assertIncludes(duplicated.text, "EVENTO DUPLICADO", "U) duplicação confirmada");
  assertIncludes(duplicated.text, "EDITAR MEU EVENTO", "X) cai na edição do duplicado");

  const { data: copiedEvent, error } = await supabase
    .from("events")
    .select("id,title,status,venue_id")
    .eq("title", `${PREFIX} EVENTO EDITADO - CÓPIA`)
    .single();
  if (error) throw error;
  assert(copiedEvent.status === "draft", "U) duplicado nasce draft");
  assert(copiedEvent.id !== seed.eventId, "V) duplicado tem novo event_id");
  assert(copiedEvent.venue_id !== seed.venueId, "V) duplicado isola venue/setores");

  const copiedSessions = await dbSelectIds("event_sessions", "event_id", [copiedEvent.id]);
  const copiedSections = await dbSelectIds("venue_sections", "venue_id", [copiedEvent.venue_id]);
  const copiedSeats = await dbSelectIds("seats", "section_id", copiedSections);
  const copiedSessionSeats = await dbSelectIds("session_seats", "session_id", copiedSessions);
  const copiedPrices = await dbSelectIds("ticket_prices", "session_id", copiedSessions);
  assert(copiedSessions.length === 2, "V) duplicado cria novas sessões");
  assert(copiedSections.length >= 2, "V) duplicado cria novos setores");
  assert(copiedSeats.length >= 5, "V) duplicado cria novos assentos/unidades");
  assert(copiedSessionSeats.length >= 5, "V) duplicado cria novos session_seats");
  assert(copiedPrices.length >= 2, "V) duplicado cria novos preços");

  const noReservations = await supabase
    .from("reservations")
    .select("id", { count: "exact", head: true })
    .in("session_id", copiedSessions);
  const noGate = await supabase
    .from("gate_accesses")
    .select("id", { count: "exact", head: true })
    .eq("event_id", copiedEvent.id);
  assert((noReservations.count ?? 0) === 0, "W) não duplica reservas");
  assert((noReservations.count ?? 0) === 0, "W) sem reservas implica sem pedidos/tickets duplicados");
  assert((noGate.count ?? 0) === 0, "W) não duplica gate_accesses");

  const buyer = await sendMessage(BUYER_PHONE, `${PREFIX} EVENTO EDITADO - CÓPIA`);
  assertNotIncludes(buyer.text, `${PREFIX} EVENTO EDITADO - CÓPIA`, "Y) duplicado draft não aparece para comprador");
}

async function main() {
  let zapiServer = null;
  let next = null;
  try {
    await cleanup();
    await createAdmin();
    await createSeedCatalog();
    writeTemporaryNextEnv();
    zapiServer = await startZapiMock();
    next = await startNextDev();
    await login();
    await testSimpleEdits();
    await testSessionEdit();
    await testSectionsCapacityAndSeats();
    await testPrices();
    await testDuplicateAndBuyerSearch();
  } finally {
    await stopChild(next);
    if (zapiServer) await new Promise((resolve) => zapiServer.close(resolve));
    removeTemporaryNextEnv();
    await cleanup();
    await verifyCleanup();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
