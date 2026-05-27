import { createHash, createHmac, randomUUID } from "node:crypto";
import { spawn } from "node:child_process";
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

const PREFIX = "TEST_GATE_WRONG_EVENT";
const APP_PORT = 3381;
const APP_BASE_URL = `http://127.0.0.1:${APP_PORT}`;
const START_A = "2026-08-08T16:00:00.000Z";
const START_A2 = "2026-08-08T20:00:00.000Z";
const START_B = "2026-08-09T16:00:00.000Z";

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
  NODE_ENV: "test",
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
  "TICKET_QR_SECRET",
  "GATE_SESSION_SECRET",
]) {
  if (!testEnv[key]) throw new Error(`Missing required env: ${key}`);
}

const supabase = createClient(
  testEnv.SUPABASE_URL,
  testEnv.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false } },
);

function assert(condition, label, details) {
  if (!condition) throw new Error(`${label}${details ? `: ${details}` : ""}`);
  console.log(`ok - ${label}`);
}

function assertNotIncludes(value, expected, label) {
  assert(
    !String(value).includes(expected),
    label,
    `unexpected ${JSON.stringify(expected)} in ${JSON.stringify(String(value).slice(0, 500))}`,
  );
}

function base64UrlEncode(value) {
  return Buffer.from(value, "utf8").toString("base64url");
}

function signQrPayload(encodedPayload) {
  return createHmac("sha256", testEnv.TICKET_QR_SECRET)
    .update(encodedPayload)
    .digest("base64url");
}

function createTicketToken(ticket) {
  const encodedPayload = base64UrlEncode(
    JSON.stringify({ tid: ticket.ticketId, code: ticket.ticketCode }),
  );
  return `${encodedPayload}.${signQrPayload(encodedPayload)}`;
}

function signGatePayload(encodedPayload) {
  return createHmac("sha256", testEnv.GATE_SESSION_SECRET)
    .update(encodedPayload)
    .digest("base64url");
}

function createGateSessionToken({ gateSessionId, validatorPhone, expiresAt }) {
  const encodedPayload = base64UrlEncode(
    JSON.stringify({ gid: gateSessionId, phone: validatorPhone, exp: expiresAt }),
  );
  return `${encodedPayload}.${signGatePayload(encodedPayload)}`;
}

function hash(value) {
  return createHash("sha256").update(value).digest("hex");
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
  const ticketIds = await selectIds("tickets", "order_id", orderIds);
  const gateSessionIds = eventIds.length
    ? await selectIds("gate_sessions", "event_id", eventIds)
    : [];

  if (ticketIds.length) await supabase.from("ticket_validation_events").delete().in("ticket_id", ticketIds);
  if (gateSessionIds.length) await supabase.from("ticket_validation_events").delete().in("gate_session_id", gateSessionIds);
  if (gateSessionIds.length) await supabase.from("gate_sessions").delete().in("id", gateSessionIds);
  if (ticketIds.length) await supabase.from("courtesies").delete().in("ticket_id", ticketIds);
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
    .like("whatsapp_phone", "5599200%");
  const customerIds = (customers ?? []).map((customer) => customer.id);
  if (customerIds.length) await supabase.from("customers").delete().in("id", customerIds);
}

async function verifyCleanup() {
  const [{ count: eventCount }, { count: gateSessionCount }, { count: customerCount }] =
    await Promise.all([
      supabase.from("events").select("id", { count: "exact", head: true }).ilike("title", `${PREFIX}%`),
      supabase.from("gate_sessions").select("id", { count: "exact", head: true }).ilike("gate_label", `${PREFIX}%`),
      supabase.from("customers").select("id", { count: "exact", head: true }).like("whatsapp_phone", "5599200%"),
    ]);

  assert((eventCount ?? 0) === 0, "O cleanup remove eventos temporários");
  assert((gateSessionCount ?? 0) === 0, "O cleanup remove gate_sessions temporárias");
  assert((customerCount ?? 0) === 0, "O cleanup remove clientes temporários");
}

async function createCatalog() {
  await cleanup();
  const venueId = await dbInsert("venues", {
    name: `${PREFIX} Local`,
    city: "Cidade Portaria",
    state: "SP",
    status: "active",
  });
  const sectionId = await dbInsert("venue_sections", {
    venue_id: venueId,
    name: "Setor Teste",
    slug: `${PREFIX.toLowerCase()}-setor`,
    has_numbered_seats: true,
    capacity: 20,
    sort_order: 1,
    status: "active",
  });
  const eventAId = await dbInsert("events", {
    title: `${PREFIX} Evento A`,
    artist_name: `${PREFIX} Artista A`,
    city: "Cidade Portaria",
    state: "SP",
    venue_id: venueId,
    status: "published",
  });
  const eventBId = await dbInsert("events", {
    title: `${PREFIX} Evento B`,
    artist_name: `${PREFIX} Artista B`,
    city: "Cidade Portaria",
    state: "SP",
    venue_id: venueId,
    status: "published",
  });
  const sessionAId = await dbInsert("event_sessions", {
    event_id: eventAId,
    venue_id: venueId,
    starts_at: START_A,
    status: "sales_open",
  });
  const sessionA2Id = await dbInsert("event_sessions", {
    event_id: eventAId,
    venue_id: venueId,
    starts_at: START_A2,
    status: "sales_open",
  });
  const sessionBId = await dbInsert("event_sessions", {
    event_id: eventBId,
    venue_id: venueId,
    starts_at: START_B,
    status: "sales_open",
  });
  const customerId = await dbInsert("customers", {
    whatsapp_phone: "559920000001",
    name: "Gate Audit",
  });

  return { venueId, sectionId, eventAId, eventBId, sessionAId, sessionA2Id, sessionBId, customerId };
}

async function createTicket({
  catalog,
  sessionId,
  label,
  status = "issued",
  free = false,
  courtesy = false,
}) {
  const seatId = await dbInsert("seats", {
    venue_id: catalog.venueId,
    section_id: catalog.sectionId,
    row_label: "A",
    seat_number: label,
    seat_code: `A${label}`,
    status: "active",
  });
  const sessionSeatId = await dbInsert("session_seats", {
    session_id: sessionId,
    seat_id: seatId,
    section_id: catalog.sectionId,
    status: "sold",
  });
  const reservationId = await dbInsert("reservations", {
    customer_id: catalog.customerId,
    session_id: sessionId,
    status: "paid",
    expires_at: new Date(Date.now() + 60 * 60_000).toISOString(),
    total_amount_cents: free ? 0 : 100,
    total_fee_cents: 0,
  });
  const reservationItemId = await dbInsert("reservation_items", {
    reservation_id: reservationId,
    session_seat_id: sessionSeatId,
    seat_id: seatId,
    section_id: catalog.sectionId,
    seat_code: `A${label}`,
    ticket_type: free ? "free" : "full",
    price_cents: free ? 0 : 100,
    fee_cents: 0,
  });
  const orderId = await dbInsert("orders", {
    reservation_id: reservationId,
    customer_id: catalog.customerId,
    status: "paid",
    total_amount_cents: free ? 0 : 100,
    total_fee_cents: 0,
    external_reference: `ticket_order_${randomUUID()}`,
  });
  const now = new Date().toISOString();
  const ticketCode = `TCK-${PREFIX}-${label}`;
  const ticketId = await dbInsert("tickets", {
    order_id: orderId,
    reservation_item_id: reservationItemId,
    customer_id: catalog.customerId,
    session_id: sessionId,
    seat_id: seatId,
    section_id: catalog.sectionId,
    ticket_code: ticketCode,
    qr_token_hash: hash(`${PREFIX}:${label}:${ticketCode}`),
    status,
    issued_at: now,
    used_at: status === "used" ? now : null,
    cancelled_at: status === "cancelled" ? now : null,
  });
  await supabase
    .from("session_seats")
    .update({ sold_ticket_id: ticketId })
    .eq("id", sessionSeatId);

  if (courtesy) {
    const { data: session } = await supabase
      .from("event_sessions")
      .select("event_id")
      .eq("id", sessionId)
      .single();
    await dbInsert("courtesies", {
      event_id: session.event_id,
      session_id: sessionId,
      ticket_id: ticketId,
      order_id: orderId,
      customer_id: catalog.customerId,
      phone: "559920000001",
      status: status === "cancelled" ? "cancelled" : "issued",
      issued_by_admin_phone: "559920000099",
    });
  }

  return {
    ticketId,
    ticketCode,
    token: createTicketToken({ ticketId, ticketCode }),
  };
}

async function createGateSession({ eventId, sessionId = null, label }) {
  const gateSessionId = randomUUID();
  const validatorPhone = "559920000099";
  const expiresAt = new Date(Date.now() + 60 * 60_000).toISOString();
  const token = createGateSessionToken({
    gateSessionId,
    validatorPhone,
    expiresAt,
  });
  await supabase.from("gate_sessions").insert({
    id: gateSessionId,
    event_id: eventId,
    session_id: sessionId,
    gate_label: `${PREFIX} ${label}`,
    validator_phone: validatorPhone,
    token_hash: hash(token),
    status: "active",
    expires_at: expiresAt,
    created_by_admin_phone: "559920000098",
  });

  return { gateSessionId, token };
}

async function scan(gateSessionToken, ticketToken) {
  const response = await fetch(`${APP_BASE_URL}/api/gate/session/scan`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ gateSessionToken, ticketToken }),
  });
  const body = await response.json().catch(() => ({}));
  assert(response.ok, "endpoint de scan responde 200", JSON.stringify(body));
  return body;
}

async function validateGateSession(gateSessionToken) {
  const response = await fetch(`${APP_BASE_URL}/api/gate/session/validate`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ token: gateSessionToken }),
  });
  const body = await response.json().catch(() => ({}));
  assert(response.ok, "endpoint de validate responde 200", JSON.stringify(body));
  return body;
}

async function ticketStatus(ticketId) {
  const { data, error } = await supabase
    .from("tickets")
    .select("status, used_at")
    .eq("id", ticketId)
    .single();
  if (error) throw error;
  return data;
}

async function validationEvents() {
  const { data, error } = await supabase
    .from("ticket_validation_events")
    .select("ticket_id, ticket_code, gate_session_id, result, metadata")
    .like("ticket_code", `TCK-${PREFIX}%`);
  if (error) throw error;
  return data ?? [];
}

async function runAudit() {
  const catalog = await createCatalog();
  const gateA = await createGateSession({
    eventId: catalog.eventAId,
    sessionId: catalog.sessionAId,
    label: "Evento A Sessao A",
  });
  const gateAAnySession = await createGateSession({
    eventId: catalog.eventAId,
    sessionId: null,
    label: "Evento A Todas",
  });

  const ticketA = await createTicket({ catalog, sessionId: catalog.sessionAId, label: "01" });
  const ticketB = await createTicket({ catalog, sessionId: catalog.sessionBId, label: "02" });
  const ticketA2 = await createTicket({ catalog, sessionId: catalog.sessionA2Id, label: "03" });
  const ticketUsed = await createTicket({
    catalog,
    sessionId: catalog.sessionAId,
    label: "04",
    status: "used",
  });
  const ticketCancelled = await createTicket({
    catalog,
    sessionId: catalog.sessionAId,
    label: "05",
    status: "cancelled",
  });
  const courtesyA = await createTicket({
    catalog,
    sessionId: catalog.sessionAId,
    label: "06",
    free: true,
    courtesy: true,
  });
  const courtesyB = await createTicket({
    catalog,
    sessionId: catalog.sessionBId,
    label: "07",
    free: true,
    courtesy: true,
  });
  const ticketA2ForAny = await createTicket({
    catalog,
    sessionId: catalog.sessionA2Id,
    label: "08",
  });

  const validatedGate = await validateGateSession(gateA.token);
  assert(validatedGate.valid === true, "API validate retorna sessao valida");
  const validatedGateSerialized = JSON.stringify(validatedGate);
  assertNotIncludes(validatedGateSerialized, gateA.gateSessionId, "API validate nao retorna gate_session_id");
  assertNotIncludes(validatedGateSerialized, "validatorIdentifier", "API validate nao retorna validatorIdentifier");
  assertNotIncludes(validatedGateSerialized, "token_hash", "API validate nao retorna token_hash");
  assertNotIncludes(validatedGateSerialized, "559920000099", "API validate nao retorna telefone completo");

  const validTicketPage = await fetch(`${APP_BASE_URL}/tickets/${encodeURIComponent(ticketA.token)}`);
  const validTicketHtml = await validTicketPage.text();
  assert(validTicketPage.status === 200, "pagina de ingresso valido responde 200");
  assertNotIncludes(validTicketHtml, ticketA.ticketId, "pagina de ingresso nao expoe ticket_id");
  assertNotIncludes(validTicketHtml, catalog.customerId, "pagina de ingresso nao expoe customer_id");
  assertNotIncludes(validTicketHtml, "qr_token_hash", "pagina de ingresso nao expoe qr_token_hash");
  assertNotIncludes(validTicketHtml, "raw_metadata", "pagina de ingresso nao expoe raw_metadata");

  const validGatePage = await fetch(`${APP_BASE_URL}/gate/session/${encodeURIComponent(gateA.token)}`);
  const validGateHtml = await validGatePage.text();
  assert(validGatePage.status === 200, "pagina de portaria valida responde 200");
  assertNotIncludes(validGateHtml, gateA.gateSessionId, "pagina de portaria nao expoe gate_session_id");
  assertNotIncludes(validGateHtml, hash(gateA.token), "pagina de portaria nao expoe token_hash");
  assertNotIncludes(validGateHtml, "559920000099", "pagina de portaria nao expoe telefone completo");
  assertNotIncludes(validGateHtml, "validatorIdentifier", "pagina de portaria nao expoe validatorIdentifier");

  const allowedA = await scan(gateA.token, ticketA.token);
  assert(allowedA.allowed === true && allowedA.result === "allowed", "A gate A valida ticket do evento/sessao A");
  const allowedSerialized = JSON.stringify(allowedA);
  assertNotIncludes(allowedSerialized, ticketA.ticketId, "scan allowed nao retorna ticket_id");
  assertNotIncludes(allowedSerialized, "usedAt", "scan allowed nao retorna usedAt");
  assertNotIncludes(allowedSerialized, "eventTitle", "scan allowed nao retorna eventTitle");
  assertNotIncludes(allowedSerialized, "startsAt", "scan allowed nao retorna startsAt");

  const secondA = await scan(gateA.token, ticketA.token);
  assert(secondA.allowed === false && secondA.result === "already_used", "B segunda leitura retorna already_used");

  const wrongEvent = await scan(gateA.token, ticketB.token);
  assert(wrongEvent.allowed === false && wrongEvent.result === "wrong_event", "C ticket de outro evento retorna wrong_event");
  assert(!wrongEvent.ticket, "C wrong_event não retorna dados do ticket errado");
  const ticketBAfter = await ticketStatus(ticketB.ticketId);
  assert(ticketBAfter.status === "issued" && !ticketBAfter.used_at, "D wrong_event não marca ticket B como used");

  const wrongSession = await scan(gateA.token, ticketA2.token);
  assert(wrongSession.allowed === false && wrongSession.result === "wrong_session", "E outra sessão do mesmo evento retorna wrong_session");
  assert(!wrongSession.ticket, "E wrong_session não retorna dados do ticket errado");
  const ticketA2After = await ticketStatus(ticketA2.ticketId);
  assert(ticketA2After.status === "issued" && !ticketA2After.used_at, "F wrong_session não marca ticket como used");

  const anySession = await scan(gateAAnySession.token, ticketA2ForAny.token);
  assert(anySession.allowed === true && anySession.result === "allowed", "G gate sem session_id valida qualquer sessão do evento");

  const cancelled = await scan(gateA.token, ticketCancelled.token);
  assert(cancelled.allowed === false && cancelled.result === "cancelled", "H ticket cancelled retorna cancelled");

  const invalid = await scan(gateA.token, "token-invalido");
  assert(invalid.allowed === false && invalid.result === "not_found", "I token inválido retorna not_found seguro");

  const courtesyAllowed = await scan(gateA.token, courtesyA.token);
  assert(courtesyAllowed.allowed === true && courtesyAllowed.result === "allowed", "J cortesia do evento A valida");

  const courtesyWrong = await scan(gateA.token, courtesyB.token);
  assert(courtesyWrong.allowed === false && courtesyWrong.result === "wrong_event", "K cortesia do evento B retorna wrong_event");
  const courtesyBAfter = await ticketStatus(courtesyB.ticketId);
  assert(courtesyBAfter.status === "issued" && !courtesyBAfter.used_at, "K cortesia wrong_event não marca used");

  const used = await scan(gateA.token, ticketUsed.token);
  assert(used.allowed === false && used.result === "already_used", "ticket usado prévio retorna already_used");

  const events = await validationEvents();
  const results = new Set(events.map((event) => event.result));
  assert(events.some((event) => event.gate_session_id === gateA.gateSessionId), "L ticket_validation_events registra gate_session_id");
  assert(results.has("wrong_event") && results.has("wrong_session"), "L ticket_validation_events registra decision/reason");
  const serializedEvents = JSON.stringify(events);
  assertNotIncludes(serializedEvents, ticketB.token, "M eventos não registram token bruto");
  assertNotIncludes(serializedEvents, "data:image", "M eventos não registram QR/base64");
  assert(wrongEvent.message === "INGRESSO DE OUTRO EVENTO", "N endpoint mapeia wrong_event como recusado seguro");
  assert(wrongSession.message === "INGRESSO DE OUTRA SESSÃO", "N endpoint mapeia wrong_session como recusado seguro");

  const invalidGateResponse = await fetch(`${APP_BASE_URL}/api/gate/session/scan`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ gateSessionToken: "token-invalido", ticketToken: ticketA.token }),
  });
  const invalidGate = await invalidGateResponse.json();
  assert(
    invalidGate.allowed === false && invalidGate.result === "gate_session_invalid",
    "scan com sessão inválida responde seguro",
  );

  const publicInvalidTicket = await fetch(
    "https://site-phi-seven-72.vercel.app/tickets/token-invalido",
  );
  assert(publicInvalidTicket.status === 200, "produção /tickets/token-invalido mostra página segura");
  const publicInvalidGate = await fetch(
    "https://site-phi-seven-72.vercel.app/gate/session/token-invalido",
  );
  assert(publicInvalidGate.status === 200, "produção /gate/session/token-invalido mostra página segura");
}

let nextDev;

try {
  if (process.argv.includes("--cleanup-check")) {
    await cleanup();
    await verifyCleanup();
  } else {
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
}
