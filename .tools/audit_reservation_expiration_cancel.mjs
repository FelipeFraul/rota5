import { createServer } from "node:http";
import { spawn, spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

const PREFIX = "TEST_RESERVATION_EXPIRATION_CANCEL";
const PORT = 3343;
const ZAPI_PORT = 4569;
const APP_BASE_URL = `http://127.0.0.1:${PORT}`;
const ZAPI_BASE_URL = `http://127.0.0.1:${ZAPI_PORT}`;
const WEBHOOK_URL = `${APP_BASE_URL}/api/webhook/zapi`;
const EVENT_START = "2026-08-08T16:00:00.000Z";

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

const requiredEnv = [
  "SUPABASE_URL",
  "SUPABASE_SERVICE_ROLE_KEY",
  "ZAPI_WEBHOOK_SECRET",
  "ADMIN_WHATSAPP_PHONES",
  "TICKET_RESERVATION_TTL_MINUTES",
];

for (const key of requiredEnv) {
  if (!testEnv[key]) throw new Error(`Missing required env for audit: ${key}`);
}

const supabase = createClient(
  testEnv.SUPABASE_URL,
  testEnv.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false } },
);

const zapiMessages = [];
let zapiCounter = 0;
let nextPhoneCounter = 3000;
let nextProviderCounter = 1;

function assert(condition, label, details) {
  if (!condition) {
    throw new Error(`${label}${details ? `: ${details}` : ""}`);
  }
  console.log(`ok - ${label}`);
}

function assertIncludes(value, expected, label) {
  assert(
    String(value).includes(expected),
    label,
    `expected ${JSON.stringify(expected)} in ${JSON.stringify(value).slice(0, 500)}`,
  );
}

function assertNotIncludes(value, expected, label) {
  assert(
    !String(value).includes(expected),
    label,
    `did not expect ${JSON.stringify(expected)} in ${JSON.stringify(value).slice(0, 500)}`,
  );
}

function auditPhone() {
  nextPhoneCounter += 1;
  return `5599100${String(nextPhoneCounter).padStart(4, "0")}`;
}

function providerMessageId() {
  return `${PREFIX}_${Date.now()}_${nextProviderCounter++}`;
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
      type: req.url?.includes("send-image") ? "image" : "text",
      phone: body.phone,
      message: body.message ?? body.caption ?? "",
      image: body.image,
    });
    res.writeHead(200, { "content-type": "application/json" });
    res.end(JSON.stringify({ messageId: `zapi-reservation-audit-${zapiCounter}` }));
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
    ["run", "dev", "--", "--hostname", "127.0.0.1", "--port", String(PORT)],
    {
      cwd: process.cwd(),
      env: testEnv,
      shell: process.platform === "win32",
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
  if (process.platform === "win32" && child.pid) {
    spawnSync("taskkill.exe", ["/PID", String(child.pid), "/T", "/F"], {
      stdio: "ignore",
    });
    return;
  }
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

async function sendBuyerMessage(phone, text) {
  const start = zapiMessages.length;
  const response = await fetch(
    WEBHOOK_URL,
    {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-zapi-webhook-secret": testEnv.ZAPI_WEBHOOK_SECRET,
      },
      body: JSON.stringify({
        phone,
        text,
        messageId: providerMessageId(),
        contactName: "Audit Buyer",
      }),
    },
  );
  const body = await response.json().catch(() => ({}));
  assert(response.ok, `webhook accepted "${text}"`, JSON.stringify(body));
  const messages = zapiMessages.slice(start);
  assert(messages.length > 0, `Z-API mock received outbound for "${text}"`);
  return {
    messages,
    text: messages.map((message) => message.message).join("\n---\n"),
  };
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
  const venueIdsFromEvents = (events ?? [])
    .map((event) => event.venue_id)
    .filter(Boolean);

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
  const { data: reservations } = sessionIds.length
    ? await supabase.from("reservations").select("id").in("session_id", sessionIds)
    : { data: [] };
  const reservationIds = (reservations ?? []).map((reservation) => reservation.id);
  const orderIds = await dbSelectIds("orders", "reservation_id", reservationIds);

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
  const conversationIds = await dbSelectIds("conversations", "customer_id", customerIds);
  if (conversationIds.length) await supabase.from("whatsapp_messages").delete().in("conversation_id", conversationIds);
  if (conversationIds.length) await supabase.from("conversations").delete().in("id", conversationIds);
  if (customerIds.length) await supabase.from("customers").delete().in("id", customerIds);
}

async function countRows(table, queryBuilder) {
  const { count, error } = await queryBuilder(
    supabase.from(table).select("id", { count: "exact", head: true }),
  );
  if (error) throw new Error(`count ${table}: ${error.message}`);
  return count ?? 0;
}

async function verifyCleanup() {
  const [eventCount, venueCount, customerCount] = await Promise.all([
    countRows("events", (query) => query.ilike("title", `${PREFIX}%`)),
    countRows("venues", (query) => query.ilike("name", `${PREFIX}%`)),
    countRows("customers", (query) => query.like("whatsapp_phone", "5599100%")),
  ]);
  assert(eventCount === 0, "R cleanup remove eventos temporários", `restaram ${eventCount}`);
  assert(venueCount === 0, "R cleanup remove locais temporários", `restaram ${venueCount}`);
  assert(customerCount === 0, "R cleanup remove compradores temporários", `restaram ${customerCount}`);
}

async function createCatalog() {
  await cleanup();

  const venueId = await dbInsert("venues", {
    name: `${PREFIX} Teatro`,
    city: "Cidade Reserva",
    state: "SP",
    status: "active",
  });
  const numberedSectionId = await dbInsert("venue_sections", {
    venue_id: venueId,
    name: "Assentos",
    slug: `${PREFIX.toLowerCase()}-assentos`,
    has_numbered_seats: true,
    capacity: 4,
    sort_order: 1,
    status: "active",
  });
  const unnumberedSectionId = await dbInsert("venue_sections", {
    venue_id: venueId,
    name: "Pista",
    slug: `${PREFIX.toLowerCase()}-pista`,
    has_numbered_seats: false,
    capacity: 3,
    sort_order: 2,
    status: "active",
  });
  const eventId = await dbInsert("events", {
    title: `${PREFIX} Evento`,
    artist_name: `${PREFIX} Artista`,
    city: "Cidade Reserva",
    state: "SP",
    venue_id: venueId,
    status: "published",
  });
  const sessionId = await dbInsert("event_sessions", {
    event_id: eventId,
    venue_id: venueId,
    starts_at: EVENT_START,
    status: "sales_open",
  });

  const seatIds = [];
  for (const [seatCode, rowLabel, seatNumber, mapX] of [
    ["A01", "A", "01", 1],
    ["A02", "A", "02", 2],
    ["A03", "A", "03", 3],
    ["A04", "A", "04", 4],
    ["A05", "A", "05", 5],
    ["A06", "A", "06", 6],
  ]) {
    seatIds.push(
      await dbInsert("seats", {
        venue_id: venueId,
        section_id: numberedSectionId,
        row_label: rowLabel,
        seat_number: seatNumber,
        seat_code: seatCode,
        map_x: mapX,
        map_y: 1,
        status: "active",
      }),
    );
  }

  for (const seatId of seatIds) {
    await dbInsert("session_seats", {
      session_id: sessionId,
      section_id: numberedSectionId,
      seat_id: seatId,
      status: "available",
    });
  }

  for (const index of [1, 2, 3]) {
    const seatId = await dbInsert("seats", {
      venue_id: venueId,
      section_id: unnumberedSectionId,
      seat_code: `P${index}`,
      seat_number: String(index),
      status: "active",
    });
    await dbInsert("session_seats", {
      session_id: sessionId,
      section_id: unnumberedSectionId,
      seat_id: seatId,
      status: "available",
    });
  }

  await dbInsert("ticket_prices", {
    session_id: sessionId,
    section_id: numberedSectionId,
    ticket_type: "full",
    label: "Inteira",
    price_cents: 1000,
    fee_cents: 0,
    currency: "BRL",
    status: "active",
  });
  await dbInsert("ticket_prices", {
    session_id: sessionId,
    section_id: unnumberedSectionId,
    ticket_type: "full",
    label: "Inteira",
    price_cents: 500,
    fee_cents: 0,
    currency: "BRL",
    status: "active",
  });

  return { eventId, sessionId, numberedSectionId, unnumberedSectionId, seatIds };
}

async function latestOpenConversation(phone) {
  const { data: customer, error: customerError } = await supabase
    .from("customers")
    .select("id")
    .eq("whatsapp_phone", phone)
    .maybeSingle();
  if (customerError || !customer) throw new Error(`customer not found for ${phone}`);
  const { data: conversation, error: conversationError } = await supabase
    .from("conversations")
    .select("id, context")
    .eq("customer_id", customer.id)
    .eq("status", "open")
    .order("created_at", { ascending: false })
    .limit(1)
    .single();
  if (conversationError || !conversation) throw new Error(`conversation not found for ${phone}`);
  return { customerId: customer.id, conversation };
}

async function reservationsForPhone(phone) {
  const { customerId } = await latestOpenConversation(phone);
  const { data, error } = await supabase
    .from("reservations")
    .select("id, status, expires_at, total_amount_cents, total_fee_cents, orders(id, status), reservation_items(id, session_seat_id)")
    .eq("customer_id", customerId)
    .order("created_at", { ascending: false });
  if (error) throw new Error(`reservationsForPhone: ${error.message}`);
  return data ?? [];
}

async function latestReservationForPhone(phone) {
  const reservations = await reservationsForPhone(phone);
  assert(reservations.length > 0, `reservation exists for ${phone}`);
  return reservations[0];
}

async function expireReservation(reservationId) {
  const createdPast = new Date(Date.now() - 20 * 60_000).toISOString();
  const past = new Date(Date.now() - 60_000).toISOString();
  const { error } = await supabase
    .from("reservations")
    .update({ created_at: createdPast, expires_at: past })
    .eq("id", reservationId);
  if (error) throw new Error(`expireReservation: ${error.message}`);
}

async function sessionSeatBySeatCode(sessionId, seatCode) {
  const { data, error } = await supabase
    .from("session_seats")
    .select("id, status, current_reservation_id, seats!inner(seat_code)")
    .eq("session_id", sessionId)
    .eq("seats.seat_code", seatCode)
    .single();
  if (error) throw new Error(`sessionSeatBySeatCode ${seatCode}: ${error.message}`);
  return data;
}

async function buyerReserveNumbered({ phone, quantity = "1", seats = "A01" }) {
  await sendBuyerMessage(phone, PREFIX);
  await sendBuyerMessage(phone, "1");
  await sendBuyerMessage(phone, "1");
  const map = await sendBuyerMessage(phone, quantity);
  assert(map.messages.some((message) => message.type === "image"), "router sends seat map image");
  await sendBuyerMessage(phone, seats);
  const reservation = await sendBuyerMessage(phone, "2");
  assertIncludes(reservation.text, "RESERVA CRIADA", `reservation created for ${phone}`);
  return reservation;
}

async function buyerReserveUnnumbered(phone, quantity = "1") {
  await sendBuyerMessage(phone, PREFIX);
  await sendBuyerMessage(phone, "1");
  await sendBuyerMessage(phone, "2");
  await sendBuyerMessage(phone, quantity);
  return sendBuyerMessage(phone, "2");
}

async function assertConversationIdle(phone, label) {
  const { conversation } = await latestOpenConversation(phone);
  assert(
    conversation.context?.state === "idle" || !conversation.context?.state,
    label,
    JSON.stringify(conversation.context),
  );
}

async function runAudit() {
  const catalog = await createCatalog();
  console.log(`catalog ok - event ${catalog.eventId}`);

  const unnumberedPhone = auditPhone();
  const unnumberedReservation = await buyerReserveUnnumbered(unnumberedPhone, "2");
  assertIncludes(unnumberedReservation.text, "RESERVA CRIADA", "A reserva criada via RPC para setor sem assento marcado");
  assertIncludes(unnumberedReservation.text, "*RESERVA CRIADA", "E título da reserva destacado");
  assertIncludes(unnumberedReservation.text, "> Quantidade: 2", "E mensagem mostra quantidade");
  assertIncludes(unnumberedReservation.text, "Valor: R$", "E mensagem mostra valor");
  assertIncludes(unnumberedReservation.text, "> Reserva válida até:", "E mensagem mostra expiração");

  const numberedPhone = auditPhone();
  const numberedReservation = await buyerReserveNumbered({
    phone: numberedPhone,
    quantity: "2",
    seats: "A01 A02",
  });
  assertIncludes(numberedReservation.text, "RESERVA CRIADA", "B reserva criada via RPC para setor com assento marcado");
  const numberedRows = await reservationsForPhone(numberedPhone);
  assert(numberedRows[0].reservation_items.length === 2, "C dois assentos reservados sem parcial");

  const invalidPhone = auditPhone();
  await sendBuyerMessage(invalidPhone, PREFIX);
  await sendBuyerMessage(invalidPhone, "1");
  await sendBuyerMessage(invalidPhone, "1");
  await sendBuyerMessage(invalidPhone, "2");
  const a03 = await sessionSeatBySeatCode(catalog.sessionId, "A03");
  await supabase
    .from("session_seats")
    .update({ status: "blocked" })
    .eq("id", a03.id);
  await sendBuyerMessage(invalidPhone, "A03 A04");
  const invalidSeat = await sendBuyerMessage(invalidPhone, "2");
  assertIncludes(invalidSeat.text, "estoque mudou", "D assento ocupado na finalização informa mudança de estoque");
  const invalidReservations = await reservationsForPhone(invalidPhone);
  assert(invalidReservations.length === 0, "D assento ocupado não cria reserva parcial");
  await supabase.from("session_seats").update({ status: "available" }).eq("id", a03.id);

  const checkout = await sendBuyerMessage(numberedPhone, "COMPRAR");
  assertIncludes(checkout.text, "LINK DE PAGAMENTO GERADO", "F COMPRAR com reserva ativa gera checkout");
  assertIncludes(checkout.text, "/checkout/", "F checkout self-hosted enviado");

  const expiredBuyPhone = auditPhone();
  await buyerReserveNumbered({ phone: expiredBuyPhone, quantity: "1", seats: "A03" });
  const expiredReservation = await latestReservationForPhone(expiredBuyPhone);
  await expireReservation(expiredReservation.id);
  const expiredBuy = await sendBuyerMessage(expiredBuyPhone, "COMPRAR");
  assertIncludes(expiredBuy.text, "A SUA RESERVA EXPIROU", "G COMPRAR expirado mostra mensagem de expiração");
  assertNotIncludes(expiredBuy.text, "LINK DE PAGAMENTO", "G COMPRAR expirado não gera checkout");
  await assertConversationIdle(expiredBuyPhone, "G contexto limpo após expiração");

  const expirePhone = auditPhone();
  await buyerReserveNumbered({ phone: expirePhone, quantity: "1", seats: "A04" });
  const expireRow = await latestReservationForPhone(expirePhone);
  await expireReservation(expireRow.id);
  const { data: expireResult, error: expireError } = await supabase.rpc("expire_reservations", { p_limit: 100 });
  if (expireError) throw new Error(`expire_reservations: ${expireError.message}`);
  assert((expireResult?.expired_reservations_count ?? 0) >= 1, "H expire_reservations expira reservation/order");
  const releasedA03 = await sessionSeatBySeatCode(catalog.sessionId, "A03");
  assert(releasedA03.status === "available", "H expire_reservations libera assento");

  const soldA06 = await sessionSeatBySeatCode(catalog.sessionId, "A06");
  await supabase.from("session_seats").update({ status: "sold" }).eq("id", soldA06.id);
  await supabase.rpc("expire_reservations", { p_limit: 100 });
  const soldA06After = await sessionSeatBySeatCode(catalog.sessionId, "A06");
  assert(soldA06After.status === "sold", "I expire_reservations não mexe em sold");
  await supabase.from("session_seats").update({ status: "available" }).eq("id", soldA06.id);

  const afterExpirePhone = auditPhone();
  await sendBuyerMessage(afterExpirePhone, PREFIX);
  await sendBuyerMessage(afterExpirePhone, "1");
  await sendBuyerMessage(afterExpirePhone, "1");
  const afterExpireMap = await sendBuyerMessage(afterExpirePhone, "1");
  assertIncludes(afterExpireMap.text, "ESCOLHA SEUS ASSENTOS", "J compra volta a mostrar assento liberado após expiração");

  const cancelOfferPhone = auditPhone();
  await sendBuyerMessage(cancelOfferPhone, PREFIX);
  await sendBuyerMessage(cancelOfferPhone, "1");
  const cancelOffer = await sendBuyerMessage(cancelOfferPhone, "cancelar");
  assertIncludes(cancelOffer.text, "PROCESSO CANCELADO", "K cancelar durante escolha de oferta limpa fluxo");
  await assertConversationIdle(cancelOfferPhone, "K contexto idle");

  const cancelQuantityPhone = auditPhone();
  await sendBuyerMessage(cancelQuantityPhone, PREFIX);
  await sendBuyerMessage(cancelQuantityPhone, "1");
  await sendBuyerMessage(cancelQuantityPhone, "1");
  const cancelQuantity = await sendBuyerMessage(cancelQuantityPhone, "cancelar");
  assertIncludes(cancelQuantity.text, "PROCESSO CANCELADO", "L cancelar durante quantidade limpa fluxo");

  const cancelMapPhone = auditPhone();
  await sendBuyerMessage(cancelMapPhone, PREFIX);
  await sendBuyerMessage(cancelMapPhone, "1");
  await sendBuyerMessage(cancelMapPhone, "1");
  await sendBuyerMessage(cancelMapPhone, "1");
  const cancelMap = await sendBuyerMessage(cancelMapPhone, "cancelar");
  assertIncludes(cancelMap.text, "PROCESSO CANCELADO", "M cancelar durante mapa/assento limpa fluxo");

  const cancelReservationPhone = auditPhone();
  await buyerReserveNumbered({ phone: cancelReservationPhone, quantity: "1", seats: "A03" });
  const cancelReservationRow = await latestReservationForPhone(cancelReservationPhone);
  const cancelReservation = await sendBuyerMessage(cancelReservationPhone, "cancelar");
  assertIncludes(cancelReservation.text, "reserva foi cancelada", "N cancelar com reserva ativa cancela/libera");
  const { data: cancelledRow } = await supabase
    .from("reservations")
    .select("status, orders(status)")
    .eq("id", cancelReservationRow.id)
    .single();
  assert(cancelledRow.status === "cancelled", "N reservation marcada cancelled");
  assert(cancelledRow.orders.status === "cancelled", "N order marcada cancelled");
  const releasedCancelSeat = await sessionSeatBySeatCode(catalog.sessionId, "A03");
  assert(releasedCancelSeat.status === "available", "N assento liberado no cancelamento");

  for (const command of ["cancela", "apagar", "sair"]) {
    const commandPhone = auditPhone();
    await sendBuyerMessage(commandPhone, PREFIX);
    const reply = await sendBuyerMessage(commandPhone, command);
    assertIncludes(reply.text, "PROCESSO CANCELADO", `O ${command} zera fluxo`);
  }

  const paymentPendingPhone = auditPhone();
  await buyerReserveNumbered({ phone: paymentPendingPhone, quantity: "1", seats: "A03" });
  await sendBuyerMessage(paymentPendingPhone, "COMPRAR");
  const paidReservation = await latestReservationForPhone(paymentPendingPhone);
  await supabase.from("reservations").update({ status: "paid" }).eq("id", paidReservation.id);
  await supabase.from("orders").update({ status: "paid" }).eq("id", paidReservation.orders.id);
  const paidCancel = await sendBuyerMessage(paymentPendingPhone, "cancelar");
  assertIncludes(paidCancel.text, "PROCESSO CANCELADO", "P payment_pending pago limpa fluxo sem cancelar");
  const { data: paidAfter } = await supabase
    .from("reservations")
    .select("status, orders(status)")
    .eq("id", paidReservation.id)
    .single();
  assert(paidAfter.status === "paid", "P reservation paid não é cancelada");
  assert(paidAfter.orders.status === "paid", "P order paid não é cancelada");

  const concurrencyPhone = auditPhone();
  await buyerReserveNumbered({ phone: concurrencyPhone, quantity: "1", seats: "A05" });
  const concurrencyReservation = await latestReservationForPhone(concurrencyPhone);
  await Promise.all([
    supabase.rpc("expire_reservations", { p_limit: 100 }),
    supabase.rpc("expire_reservations", { p_limit: 100 }),
  ]);
  await Promise.all([
    sendBuyerMessage(concurrencyPhone, "cancelar"),
    sendBuyerMessage(concurrencyPhone, "cancelar"),
  ]).catch(() => undefined);
  const { data: concurrencyAfter } = await supabase
    .from("reservations")
    .select("status")
    .eq("id", concurrencyReservation.id)
    .single();
  assert(["cancelled", "active", "expired"].includes(concurrencyAfter.status), "Q concorrência não corrompe status da reserva");

  await cleanup();
  await verifyCleanup();
}

async function main() {
  if (process.argv.includes("--cleanup-check")) {
    await cleanup();
    await verifyCleanup();
    return;
  }

  let zapiServer;
  let nextChild;
  try {
    await cleanup();
    zapiServer = await startZapiMock();
    nextChild = await startNextDev();
    await runAudit();
  } finally {
    await stopChild(nextChild);
    if (zapiServer) await new Promise((resolve) => zapiServer.close(resolve));
    await cleanup().catch((error) => {
      console.error("cleanup failed", error);
      process.exitCode = 1;
    });
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
