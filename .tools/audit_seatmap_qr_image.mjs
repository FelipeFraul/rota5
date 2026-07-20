import { createServer } from "node:http";
import { spawn, spawnSync } from "node:child_process";
import { createHmac } from "node:crypto";
import { inflateSync } from "node:zlib";
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
import QRCode from "qrcode";

const PREFIX = "TEST_SEATMAP_QR_IMAGE";
const PORT = 3345;
const ZAPI_PORT = 4570;
const MP_PORT = 4571;
const APP_BASE_URL = `http://127.0.0.1:${PORT}`;
const ZAPI_BASE_URL = `http://127.0.0.1:${ZAPI_PORT}`;
const MP_BASE_URL = `http://127.0.0.1:${MP_PORT}`;
const WEBHOOK_URL = `${APP_BASE_URL}/api/webhook/zapi`;
const PAYMENT_WEBHOOK_URL = `${APP_BASE_URL}/api/webhook/payment/mercado-pago`;
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
  MERCADO_PAGO_API_BASE_URL: MP_BASE_URL,
  ZAPI_INSTANCE_ID: "seatmap-qr-instance",
  ZAPI_INSTANCE_TOKEN: "seatmap-qr-token",
  ZAPI_CLIENT_TOKEN: "seatmap-qr-client",
  CHECKOUT_INTERNAL_SECRET:
    fileEnv.CHECKOUT_INTERNAL_SECRET || "seatmap-qr-checkout-secret",
  PAYMENT_PROVIDER: fileEnv.PAYMENT_PROVIDER || "mercado_pago",
  MERCADO_PAGO_ACCESS_TOKEN:
    fileEnv.MERCADO_PAGO_ACCESS_TOKEN || "APP_USR-seatmap-qr-access",
  MERCADO_PAGO_WEBHOOK_SECRET:
    fileEnv.MERCADO_PAGO_WEBHOOK_SECRET || "seatmap-qr-webhook-secret",
  NEXT_PUBLIC_MERCADO_PAGO_PUBLIC_KEY:
    fileEnv.NEXT_PUBLIC_MERCADO_PAGO_PUBLIC_KEY || "APP_USR-seatmap-qr-public",
  TICKET_RESERVATION_TTL_MINUTES:
    fileEnv.TICKET_RESERVATION_TTL_MINUTES || "10",
  TICKET_QR_SECRET:
    fileEnv.TICKET_QR_SECRET ||
    "seatmap-qr-ticket-secret-with-at-least-thirty-two-chars",
  GATE_ADMIN_SECRET: fileEnv.GATE_ADMIN_SECRET || "seatmap-qr-gate-admin",
  GATE_SESSION_SECRET:
    fileEnv.GATE_SESSION_SECRET ||
    "seatmap-qr-gate-session-secret-with-at-least-thirty-two-chars",
  GATE_SESSION_TTL_MINUTES: fileEnv.GATE_SESSION_TTL_MINUTES || "480",
  SEAT_MAP_STORAGE_BUCKET: fileEnv.SEAT_MAP_STORAGE_BUCKET || "seat-maps",
};

const supabase = createClient(
  testEnv.SUPABASE_URL,
  testEnv.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false } },
);

const zapiMessages = [];
const paymentRecords = new Map();
let nextProviderMessage = 1;
let nextPhone = 1;
let failNextImage = false;

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
  const venueIds = Array.from(new Set([...(venues ?? []).map((venue) => venue.id), ...venueIdsFromEvents]));
  const sessionIds = await dbSelectIds("event_sessions", "event_id", eventIds);
  const sectionIds = await dbSelectIds("venue_sections", "venue_id", venueIds);
  const seatIds = await dbSelectIds("seats", "section_id", sectionIds);
  const sessionSeatIds = await dbSelectIds("session_seats", "session_id", sessionIds);
  const { data: reservations } = sessionIds.length
    ? await supabase.from("reservations").select("id").in("session_id", sessionIds)
    : { data: [] };
  const reservationIds = (reservations ?? []).map((reservation) => reservation.id);
  const orderIds = await dbSelectIds("orders", "reservation_id", reservationIds);
  const ticketIds = await dbSelectIds("tickets", "order_id", orderIds);

  if (ticketIds.length) await supabase.from("ticket_validation_events").delete().in("ticket_id", ticketIds);
  if (ticketIds.length) await supabase.from("tickets").delete().in("id", ticketIds);
  await supabase
    .from("payment_events")
    .delete()
    .in("provider_payment_id", ["900001", "900002"]);
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
    .like("whatsapp_phone", "5599030%");
  const customerIds = (customers ?? []).map((customer) => customer.id);
  const conversationIds = await dbSelectIds("conversations", "customer_id", customerIds);
  if (conversationIds.length) await supabase.from("whatsapp_messages").delete().in("conversation_id", conversationIds);
  if (conversationIds.length) await supabase.from("conversations").delete().in("id", conversationIds);
  if (customerIds.length) await supabase.from("customers").delete().in("id", customerIds);
}

async function verifyCleanup() {
  const { count: eventsCount } = await supabase
    .from("events")
    .select("id", { count: "exact", head: true })
    .ilike("title", `${PREFIX}%`);
  const { count: customersCount } = await supabase
    .from("customers")
    .select("id", { count: "exact", head: true })
    .like("whatsapp_phone", "5599030%");

  assert(eventsCount === 0, "O cleanup remove eventos temporários", `restaram ${eventsCount}`);
  assert(customersCount === 0, "O cleanup remove compradores temporários", `restaram ${customersCount}`);
}

async function createSection({ venueId, slug, capacity }) {
  return dbInsert("venue_sections", {
    venue_id: venueId,
    name: "Assentos",
    slug,
    has_numbered_seats: true,
    capacity,
    sort_order: 1,
    status: "active",
  });
}

async function createEvent({ venueId, title }) {
  const eventId = await dbInsert("events", {
    title,
    artist_name: `${title} artista`,
    city: "Cidade QR",
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

  return { eventId, sessionId };
}

async function addSeat({
  venueId,
  sectionId,
  sessionId,
  code,
  status = "available",
  mapX,
  mapY,
}) {
  const match = code.match(/^([A-Z]+)(\d+)$/);
  const seatId = await dbInsert("seats", {
    venue_id: venueId,
    section_id: sectionId,
    row_label: match?.[1] ?? "A",
    seat_number: match?.[2] ?? code,
    seat_code: code,
    map_x: mapX ?? null,
    map_y: mapY ?? null,
    status: "active",
  });
  await dbInsert("session_seats", {
    session_id: sessionId,
    section_id: sectionId,
    seat_id: seatId,
    status,
  });
}

async function addPrice({ sessionId, sectionId }) {
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
}

async function createCatalog() {
  await cleanup();
  const venueId = await dbInsert("venues", {
    name: `${PREFIX} Teatro`,
    city: "Cidade QR",
    state: "SP",
    status: "active",
  });

  const mapSectionId = await createSection({
    venueId,
    slug: `${PREFIX.toLowerCase()}-map`,
    capacity: 6,
  });
  const mapEvent = await createEvent({ venueId, title: `${PREFIX} mapa` });
  await addSeat({ venueId, sectionId: mapSectionId, sessionId: mapEvent.sessionId, code: "A01", mapX: 1, mapY: 1 });
  await addSeat({ venueId, sectionId: mapSectionId, sessionId: mapEvent.sessionId, code: "A02", status: "reserved", mapX: 2, mapY: 1 });
  await addSeat({ venueId, sectionId: mapSectionId, sessionId: mapEvent.sessionId, code: "A03", status: "sold", mapX: 3, mapY: 1 });
  await addSeat({ venueId, sectionId: mapSectionId, sessionId: mapEvent.sessionId, code: "A04", status: "blocked", mapX: 4, mapY: 1 });
  await addSeat({ venueId, sectionId: mapSectionId, sessionId: mapEvent.sessionId, code: "A05", mapX: 5, mapY: 1 });
  await addSeat({ venueId, sectionId: mapSectionId, sessionId: mapEvent.sessionId, code: "A06", mapX: 6, mapY: 1 });
  await addPrice({ sessionId: mapEvent.sessionId, sectionId: mapSectionId });

  const fallbackSectionId = await createSection({
    venueId,
    slug: `${PREFIX.toLowerCase()}-fallback`,
    capacity: 2,
  });
  const fallbackEvent = await createEvent({ venueId, title: `${PREFIX} fallback` });
  await addSeat({ venueId, sectionId: fallbackSectionId, sessionId: fallbackEvent.sessionId, code: "B01" });
  await addSeat({ venueId, sectionId: fallbackSectionId, sessionId: fallbackEvent.sessionId, code: "B02" });
  await addPrice({ sessionId: fallbackEvent.sessionId, sectionId: fallbackSectionId });

  const qrSectionId = await createSection({
    venueId,
    slug: `${PREFIX.toLowerCase()}-qr`,
    capacity: 4,
  });
  const qrEvent = await createEvent({ venueId, title: `${PREFIX} qr` });
  for (const [index, code] of ["C01", "C02", "C03", "C04"].entries()) {
    await addSeat({
      venueId,
      sectionId: qrSectionId,
      sessionId: qrEvent.sessionId,
      code,
      mapX: index + 1,
      mapY: 1,
    });
  }
  await addPrice({ sessionId: qrEvent.sessionId, sectionId: qrSectionId });

  return { mapEvent, fallbackEvent, qrEvent };
}

function startZapiMock() {
  const server = createServer(async (request, response) => {
    const chunks = [];
    for await (const chunk of request) chunks.push(chunk);
    const body = JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}");
    const isImage = request.url?.includes("/send-image");

    if (isImage && failNextImage) {
      failNextImage = false;
      response.writeHead(500, { "content-type": "application/json" });
      response.end(JSON.stringify({ ok: false }));
      return;
    }

    zapiMessages.push({ type: isImage ? "image" : "text", ...body });
    response.writeHead(200, { "content-type": "application/json" });
    response.end(JSON.stringify({ id: `${PREFIX}-${zapiMessages.length}` }));
  });

  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(ZAPI_PORT, "127.0.0.1", () => resolve(server));
  });
}

function startMercadoPagoMock() {
  const server = createServer((request, response) => {
    const paymentId = decodeURIComponent(request.url?.split("/").pop() ?? "");
    const payment = paymentRecords.get(paymentId);

    if (!payment) {
      response.writeHead(404, { "content-type": "application/json" });
      response.end(JSON.stringify({ message: "not found" }));
      return;
    }

    response.writeHead(200, { "content-type": "application/json" });
    response.end(JSON.stringify(payment));
  });

  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(MP_PORT, "127.0.0.1", () => resolve(server));
  });
}

async function startNextDev() {
  const child = spawn(
    "npm",
    ["run", "dev", "--", "--hostname", "127.0.0.1", "--port", String(PORT)],
    {
      env: testEnv,
      shell: process.platform === "win32",
      stdio: ["ignore", "pipe", "pipe"],
    },
  );
  child.stdout.on("data", (chunk) => process.stdout.write(`[next] ${chunk}`));
  child.stderr.on("data", (chunk) => process.stderr.write(`[next] ${chunk}`));

  const deadline = Date.now() + 45_000;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(`${APP_BASE_URL}/api/health`);
      if (response.ok) return child;
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 500));
  }

  throw new Error("Next dev did not become ready");
}

async function stopChild(child) {
  if (!child || child.exitCode !== null) return;
  if (process.platform === "win32" && child.pid) {
    spawnSync("taskkill.exe", ["/PID", String(child.pid), "/T", "/F"], {
      stdio: "ignore",
    });
    return;
  }
  child.kill("SIGTERM");
  await new Promise((resolve) => child.once("exit", resolve));
}

function auditPhone() {
  return `5599030${String(nextPhone++).padStart(4, "0")}`;
}

async function sendBuyerMessage(phone, text) {
  const before = zapiMessages.length;
  const response = await fetch(WEBHOOK_URL, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-zapi-webhook-secret": testEnv.ZAPI_WEBHOOK_SECRET,
    },
    body: JSON.stringify({
      messageId: `${PREFIX}_${Date.now()}_${nextProviderMessage++}`,
      phone,
      fromMe: false,
      isGroup: false,
      text: { message: text },
      senderName: "Audit",
    }),
  });
  assert(response.ok, `webhook accepted ${text}`, `status ${response.status}`);
  const messages = zapiMessages.slice(before);
  assert(messages.length > 0, `Z-API received ${text}`);
  return {
    messages,
    text: messages.map((message) => message.message ?? message.caption ?? "").join("\n---\n"),
  };
}

function decodePngDataUrl(dataUrl) {
  assert(dataUrl.startsWith("data:image/png;base64,"), "A imagem é PNG data URL");
  const buffer = Buffer.from(dataUrl.replace("data:image/png;base64,", ""), "base64");
  assert(buffer.subarray(1, 4).toString("ascii") === "PNG", "A imagem tem assinatura PNG");

  let offset = 8;
  let width = 0;
  let height = 0;
  const idat = [];

  while (offset < buffer.length) {
    const length = buffer.readUInt32BE(offset);
    const type = buffer.subarray(offset + 4, offset + 8).toString("ascii");
    const data = buffer.subarray(offset + 8, offset + 8 + length);
    offset += 12 + length;

    if (type === "IHDR") {
      width = data.readUInt32BE(0);
      height = data.readUInt32BE(4);
    } else if (type === "IDAT") {
      idat.push(data);
    } else if (type === "IEND") {
      break;
    }
  }

  const inflated = inflateSync(Buffer.concat(idat));
  const pixels = Buffer.alloc(width * height * 4);
  let inputOffset = 0;
  let outputOffset = 0;

  for (let y = 0; y < height; y += 1) {
    const filter = inflated[inputOffset++];
    if (filter !== 0) {
      throw new Error("PNG usa filtro simples sem perda");
    }
    inflated.copy(pixels, outputOffset, inputOffset, inputOffset + width * 4);
    inputOffset += width * 4;
    outputOffset += width * 4;
  }

  return {
    width,
    height,
    pixel(x, y) {
      const index = (Math.floor(y) * width + Math.floor(x)) * 4;
      return [pixels[index], pixels[index + 1], pixels[index + 2], pixels[index + 3]];
    },
  };
}

function assertPngDataUrl(dataUrl) {
  assert(dataUrl.startsWith("data:image/png;base64,"), "A imagem é PNG data URL");
  const buffer = Buffer.from(dataUrl.replace("data:image/png;base64,", ""), "base64");
  assert(buffer.subarray(1, 4).toString("ascii") === "PNG", "A imagem tem assinatura PNG");
}

function colorNear(actual, expected) {
  return actual.slice(0, 3).every((channel, index) => Math.abs(channel - expected[index]) <= 6);
}

function regionHasNonWhite(png, centerX, centerY, radius = 28) {
  for (let y = centerY - radius; y <= centerY + radius; y += 1) {
    for (let x = centerX - radius; x <= centerX + radius; x += 1) {
      if (!colorNear(png.pixel(x, y), [255, 255, 255])) {
        return true;
      }
    }
  }

  return false;
}

async function createReservationAndCheckout({ phone, term, quantity, seats }) {
  await sendBuyerMessage(phone, term);
  await sendBuyerMessage(phone, "1");
  await sendBuyerMessage(phone, "1");
  await sendBuyerMessage(phone, String(quantity));
  await sendBuyerMessage(phone, seats.join(","));
  const reservation = await sendBuyerMessage(phone, "2");
  assertIncludes(reservation.text, "RESERVA CRIADA", "reserva criada para pagamento aprovado");
  const checkout = await sendBuyerMessage(phone, "COMPRAR");
  assertIncludes(checkout.text, "LINK DE PAGAMENTO GERADO", "checkout gerado");
  const orderId = checkout.text.match(/\/checkout\/([0-9a-f-]+)/i)?.[1];
  assert(orderId, "checkout contém order id");
  return orderId;
}

function signedTicketUrl(ticket) {
  const payload = Buffer.from(
    JSON.stringify({ tid: ticket.id, code: ticket.ticket_code }),
  )
    .toString("base64url");
  const signature = createHmac("sha256", testEnv.TICKET_QR_SECRET)
    .update(payload)
    .digest("base64url");

  return `${APP_BASE_URL}/tickets/${encodeURIComponent(`${payload}.${signature}`)}`;
}

async function approveOrder({ orderId, paymentId, amountCents }) {
  paymentRecords.set(paymentId, {
    id: paymentId,
    status: "approved",
    external_reference: `ticket_order_${orderId}`,
    transaction_amount: amountCents / 100,
    date_approved: new Date().toISOString(),
    currency_id: "BRL",
    payment_method_id: "visa",
    payment_type_id: "credit_card",
  });
  const body = JSON.stringify({ type: "payment", data: { id: paymentId } });
  const requestId = `${PREFIX}-${paymentId}`;
  const timestamp = String(Date.now());
  const signature = createHmac("sha256", testEnv.MERCADO_PAGO_WEBHOOK_SECRET)
    .update(`id:${paymentId};request-id:${requestId};ts:${timestamp};`)
    .digest("hex");
  const response = await fetch(PAYMENT_WEBHOOK_URL, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-request-id": requestId,
      "x-signature": `ts=${timestamp},v1=${signature}`,
    },
    body,
  });
  assert(response.ok, "webhook Mercado Pago aprovado processa pagamento", `status ${response.status}`);
}

async function ticketsForOrder(orderId) {
  const { data, error } = await supabase
    .from("tickets")
    .select("id, ticket_code, status")
    .eq("order_id", orderId)
    .order("ticket_code", { ascending: true });
  if (error) throw error;
  return data ?? [];
}

async function runAudit() {
  await createCatalog();

  const mapPhone = auditPhone();
  await sendBuyerMessage(mapPhone, `${PREFIX} mapa`);
  await sendBuyerMessage(mapPhone, "1");
  const mapQuantity = await sendBuyerMessage(mapPhone, "1");
  assertIncludes(mapQuantity.text, "Digite o número de ingressos", "fluxo pergunta quantidade antes do mapa");
  const mapReply = await sendBuyerMessage(mapPhone, "1");
  const mapImage = mapReply.messages.find((message) => message.type === "image");
  assert(mapImage, "H fluxo envia imagem do mapa antes de pedir códigos");
  assertIncludes(mapReply.text, "ESCOLHA SEUS ASSENTOS", "H fluxo pede códigos depois do mapa");
  const png = decodePngDataUrl(mapImage.image);
  assert(png.width > 100 && png.height > 100, "A setor marcado gera PNG do mapa");
  assert(colorNear(png.pixel(92, 170), [67, 160, 71]), "B assento available aparece verde");
  assert(colorNear(png.pixel(150, 170), [189, 189, 189]), "C assento reserved aparece cinza");
  assert(colorNear(png.pixel(208, 170), [189, 189, 189]), "C assento sold aparece cinza");
  assert(colorNear(png.pixel(266, 170), [189, 189, 189]), "C assento blocked aparece cinza");
  assert(!colorNear(png.pixel(92, 164), [67, 160, 71]), "D seat_code/letra/número é desenhado no assento");
  assert(regionHasNonWhite(png, Math.floor(png.width / 2), 92), "E PALCO aparece como texto sem fundo cinza");
  assert(colorNear(png.pixel(Math.floor(png.width / 2), 118), [255, 255, 255]), "E PALCO não tem fundo cinza");

  const fallbackPhone = auditPhone();
  await sendBuyerMessage(fallbackPhone, `${PREFIX} fallback`);
  await sendBuyerMessage(fallbackPhone, "1");
  await sendBuyerMessage(fallbackPhone, "1");
  const fallbackMap = await sendBuyerMessage(fallbackPhone, "1");
  const fallbackImage = fallbackMap.messages.find((message) => message.type === "image");
  assert(fallbackImage, "F fallback sem map_x/map_y envia imagem");
  decodePngDataUrl(fallbackImage.image);

  const reservePhone = auditPhone();
  await sendBuyerMessage(reservePhone, `${PREFIX} mapa`);
  await sendBuyerMessage(reservePhone, "1");
  await sendBuyerMessage(reservePhone, "1");
  await sendBuyerMessage(reservePhone, "1");
  await sendBuyerMessage(reservePhone, "A01");
  const reserved = await sendBuyerMessage(reservePhone, "2");
  assertIncludes(reserved.text, "RESERVA CRIADA", "G assento foi reservado");
  const nextMapPhone = auditPhone();
  await sendBuyerMessage(nextMapPhone, `${PREFIX} mapa`);
  await sendBuyerMessage(nextMapPhone, "1");
  await sendBuyerMessage(nextMapPhone, "1");
  const updatedMap = await sendBuyerMessage(nextMapPhone, "1");
  const updatedImage = updatedMap.messages.find((message) => message.type === "image");
  const updatedPng = decodePngDataUrl(updatedImage.image);
  assert(colorNear(updatedPng.pixel(92, 170), [189, 189, 189]), "G novo mapa mostra assento reservado indisponível");
  const invalidSeat = await sendBuyerMessage(nextMapPhone, "A01");
  assertIncludes(invalidSeat.text, "ASSENTO INDISPONÍVEL", "I assento ocupado responde indisponível");

  const qrPhone = auditPhone();
  const orderId = await createReservationAndCheckout({
    phone: qrPhone,
    term: `${PREFIX} qr`,
    quantity: 2,
    seats: ["C01", "C02"],
  });
  const beforeDelivery = zapiMessages.length;
  await approveOrder({ orderId, paymentId: "900001", amountCents: 200 });
  const deliveryMessages = zapiMessages.slice(beforeDelivery);
  const ticketText = deliveryMessages.find((message) => message.type === "text");
  const qrImages = deliveryMessages.filter((message) => message.type === "image");
  assert(ticketText?.message?.includes("PAGAMENTO CONFIRMADO"), "K WhatsApp recebe dados do ingresso");
  assert(qrImages.length === 2, "L múltiplos tickets geram múltiplos QRCodes");
  for (const image of qrImages) {
    assertPngDataUrl(image.image);
    assertIncludes(image.caption, "APRESENTE O QRCODE NA PORTARIA", "K QRCode vai em mensagem separada com orientação");
  }
  const tickets = await ticketsForOrder(orderId);
  assert(tickets.length === 2, "J pagamento aprovado emite tickets");
  const expectedQrImages = await Promise.all(
    tickets.map((ticket) =>
      QRCode.toDataURL(signedTicketUrl(ticket), {
        errorCorrectionLevel: "M",
        margin: 2,
        scale: 8,
        type: "image/png",
      }),
    ),
  );
  assert(
    expectedQrImages.every((expected) =>
      qrImages.some((image) => image.image === expected),
    ),
    "L cada QRCode corresponde ao ticket correto",
  );

  const resendOptions = await sendBuyerMessage(qrPhone, "REENVIAR INGRESSO");
  assertIncludes(resendOptions.text, "REENVIAR INGRESSO", "M reenvio lista o evento com ingressos pagos");
  const resendDelivery = await sendBuyerMessage(qrPhone, "1");
  assertIncludes(resendDelivery.text, "REENVIO DE INGRESSO", "M reenvio entrega os dados dos ingressos");
  assert(
    resendDelivery.messages.filter((message) => message.type === "image").length === 2,
    "M reenvio entrega novamente todos os QRCodes",
  );

  const noTicketResend = await sendBuyerMessage(auditPhone(), "REENVIAR INGRESSO");
  assertIncludes(noTicketResend.text, "ingresso pago emitido", "M reenvio sem compra informa ausência de ingresso");

  const failPhone = auditPhone();
  const failOrderId = await createReservationAndCheckout({
    phone: failPhone,
    term: `${PREFIX} qr`,
    quantity: 1,
    seats: ["C03"],
  });
  failNextImage = true;
  const beforeFailure = zapiMessages.length;
  await approveOrder({ orderId: failOrderId, paymentId: "900002", amountCents: 100 });
  const failureMessages = zapiMessages.slice(beforeFailure);
  assert(failureMessages.some((message) => message.type === "text"), "M falha de QR ainda envia dados quando possível");
  const failedTickets = await ticketsForOrder(failOrderId);
  assert(failedTickets.length === 1 && failedTickets[0].status === "issued", "M falha no envio do QR não desfaz ticket");
  const { data: failedOrder } = await supabase
    .from("orders")
    .select("status")
    .eq("id", failOrderId)
    .single();
  assert(failedOrder?.status === "paid", "M falha no envio do QR não desfaz pagamento");

  const { data: payments } = await supabase
    .from("payments")
    .select("raw_metadata")
    .in("order_id", [orderId, failOrderId]);
  const metadataText = JSON.stringify(payments ?? []);
  assertNotIncludes(metadataText, "data:image", "N metadata não contém base64");
  assertNotIncludes(metadataText, "/tickets/", "N metadata não contém URL assinada de ticket");
}

let zapiServer;
let mpServer;
let nextDev;

try {
  zapiServer = await startZapiMock();
  mpServer = await startMercadoPagoMock();
  nextDev = await startNextDev();
  await runAudit();
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
  if (zapiServer) await new Promise((resolve) => zapiServer.close(resolve));
  if (mpServer) await new Promise((resolve) => mpServer.close(resolve));
}
