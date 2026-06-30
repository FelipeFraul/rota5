import { createServer } from "node:http";
import { spawn, spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

const PREFIX = "TEST_BUY_FLOW_AUDIT";
const PORT = 3341;
const ZAPI_PORT = 4567;
const APP_BASE_URL = `http://127.0.0.1:${PORT}`;
const ZAPI_BASE_URL = `http://127.0.0.1:${ZAPI_PORT}`;
const WEBHOOK_URL = `${APP_BASE_URL}/api/webhook/zapi`;
const SAO_PAULO_EVENT_START = "2026-08-08T16:00:00.000Z";

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
  ZAPI_WEBHOOK_SECRET: "audit-zapi-webhook-secret",
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
  "CHECKOUT_INTERNAL_SECRET",
  "PAYMENT_PROVIDER",
  "MERCADO_PAGO_ACCESS_TOKEN",
  "MERCADO_PAGO_WEBHOOK_SECRET",
  "NEXT_PUBLIC_MERCADO_PAGO_PUBLIC_KEY",
  "ADMIN_WHATSAPP_PHONES",
  "TICKET_RESERVATION_TTL_MINUTES",
  "TICKET_QR_SECRET",
  "GATE_ADMIN_SECRET",
  "GATE_SESSION_SECRET",
  "GATE_SESSION_TTL_MINUTES",
];

for (const key of requiredEnv) {
  if (!testEnv[key]) {
    throw new Error(`Missing required env for audit: ${key}`);
  }
}

const supabase = createClient(
  testEnv.SUPABASE_URL,
  testEnv.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false } },
);

const zapiMessages = [];
let zapiCounter = 0;
let nextPhoneCounter = 1000;
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
    `expected to include ${JSON.stringify(expected)} in ${JSON.stringify(value).slice(0, 500)}`,
  );
}

function assertNotIncludes(value, expected, label) {
  assert(
    !String(value).includes(expected),
    label,
    `expected not to include ${JSON.stringify(expected)} in ${JSON.stringify(value).slice(0, 500)}`,
  );
}

function normalizeForCheck(value) {
  return String(value)
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase();
}

function auditPhone() {
  nextPhoneCounter += 1;
  return `5599000${String(nextPhoneCounter).padStart(4, "0")}`;
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
    res.end(JSON.stringify({ messageId: `zapi-audit-${zapiCounter}` }));
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
    process.execPath,
    ["node_modules/next/dist/bin/next", "dev", "--hostname", "127.0.0.1", "--port", String(PORT)],
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
      contactName: "Audit Buyer",
    }),
  });
  const body = await response.json().catch(() => ({}));
  assert(response.ok, `webhook accepted message "${text}"`, JSON.stringify(body));
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
    .like("whatsapp_phone", "5599000%");
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
    countRows("customers", (query) => query.like("whatsapp_phone", "5599000%")),
  ]);

  assert(eventCount === 0, "T cleanup remove eventos temporários", `restaram ${eventCount}`);
  assert(venueCount === 0, "T cleanup remove locais temporários", `restaram ${venueCount}`);
  assert(customerCount === 0, "T cleanup remove compradores temporários", `restaram ${customerCount}`);
}

async function createCatalog() {
  await cleanup();

  const venueId = await dbInsert("venues", {
    name: `${PREFIX} Teatro Audit`,
    city: "Cidade Audit",
    state: "SP",
    status: "active",
  });
  const numberedSectionId = await dbInsert("venue_sections", {
    venue_id: venueId,
    name: "Assentos",
    slug: `${PREFIX.toLowerCase()}-assentos`,
    has_numbered_seats: true,
    capacity: 2,
    sort_order: 1,
    status: "active",
  });
  const unnumberedSectionId = await dbInsert("venue_sections", {
    venue_id: venueId,
    name: "Pista",
    slug: `${PREFIX.toLowerCase()}-pista`,
    has_numbered_seats: false,
    capacity: null,
    sort_order: 2,
    status: "active",
  });

  const mainEventId = await dbInsert("events", {
    title: `${PREFIX} compra principal`,
    artist_name: `${PREFIX} artista principal`,
    city: "Cidade Audit",
    state: "SP",
    venue_id: venueId,
    status: "published",
    image_url: null,
  });
  const mainSessionId = await dbInsert("event_sessions", {
    event_id: mainEventId,
    venue_id: venueId,
    starts_at: SAO_PAULO_EVENT_START,
    status: "sales_open",
  });
  const seatA01 = await dbInsert("seats", {
    venue_id: venueId,
    section_id: numberedSectionId,
    row_label: "A",
    seat_number: "01",
    seat_code: "A01",
    map_x: 1,
    map_y: 1,
    status: "active",
  });
  const seatA02 = await dbInsert("seats", {
    venue_id: venueId,
    section_id: numberedSectionId,
    row_label: "A",
    seat_number: "02",
    seat_code: "A02",
    map_x: 2,
    map_y: 1,
    status: "active",
  });
  for (const seatId of [seatA01, seatA02]) {
    await dbInsert("session_seats", {
      session_id: mainSessionId,
      section_id: numberedSectionId,
      seat_id: seatId,
      status: "available",
    });
  }
  await dbInsert("ticket_prices", {
    session_id: mainSessionId,
    section_id: numberedSectionId,
    ticket_type: "half",
    label: "Meia",
    price_cents: 6000,
    fee_cents: 0,
    currency: "BRL",
    status: "active",
  });
  await dbInsert("ticket_prices", {
    session_id: mainSessionId,
    section_id: numberedSectionId,
    ticket_type: "full",
    label: "Inteira",
    price_cents: 12000,
    fee_cents: 1000,
    currency: "BRL",
    status: "active",
  });
  await dbInsert("ticket_prices", {
    session_id: mainSessionId,
    section_id: numberedSectionId,
    ticket_type: "promotional",
    label: "Inativo",
    price_cents: 3000,
    fee_cents: 0,
    currency: "BRL",
    status: "inactive",
  });
  await dbInsert("ticket_prices", {
    session_id: mainSessionId,
    section_id: numberedSectionId,
    ticket_type: "free",
    label: "Fora da janela",
    price_cents: 0,
    fee_cents: 0,
    currency: "BRL",
    status: "active",
    sales_start_at: "2027-01-01T00:00:00.000Z",
  });

  const unnumberedEventId = await dbInsert("events", {
    title: `${PREFIX} unnumbered`,
    artist_name: `${PREFIX} artista pista`,
    city: "Cidade Audit",
    state: "SP",
    venue_id: venueId,
    status: "published",
  });
  const unnumberedSessionId = await dbInsert("event_sessions", {
    event_id: unnumberedEventId,
    venue_id: venueId,
    starts_at: SAO_PAULO_EVENT_START,
    status: "sales_open",
  });
  await dbInsert("ticket_prices", {
    session_id: unnumberedSessionId,
    section_id: unnumberedSectionId,
    ticket_type: "full",
    label: "Inteira",
    price_cents: 100,
    fee_cents: 0,
    currency: "BRL",
    status: "active",
  });

  for (const status of ["draft", "cancelled", "finished"]) {
    const eventId = await dbInsert("events", {
      title: `${PREFIX} hidden ${status}`,
      artist_name: `${PREFIX} hidden`,
      city: "Cidade Audit",
      state: "SP",
      venue_id: venueId,
      status,
    });
    const sessionId = await dbInsert("event_sessions", {
      event_id: eventId,
      venue_id: venueId,
      starts_at: SAO_PAULO_EVENT_START,
      status: "sales_open",
    });
    await dbInsert("ticket_prices", {
      session_id: sessionId,
      section_id: numberedSectionId,
      ticket_type: "full",
      label: `Hidden ${status}`,
      price_cents: 100,
      fee_cents: 0,
      currency: "BRL",
      status: "active",
    });
  }

  const pastEventId = await dbInsert("events", {
    title: `${PREFIX} past`,
    artist_name: `${PREFIX} past`,
    city: "Cidade Audit",
    state: "SP",
    venue_id: venueId,
    status: "published",
  });
  const pastSessionId = await dbInsert("event_sessions", {
    event_id: pastEventId,
    venue_id: venueId,
    starts_at: "2025-01-01T16:00:00.000Z",
    status: "sales_open",
  });
  await dbInsert("ticket_prices", {
    session_id: pastSessionId,
    section_id: numberedSectionId,
    ticket_type: "full",
    label: "Past",
    price_cents: 100,
    fee_cents: 0,
    currency: "BRL",
    status: "active",
  });

  const noSaleEventId = await dbInsert("events", {
    title: `${PREFIX} no sale`,
    artist_name: `${PREFIX} no sale`,
    city: "Cidade Audit",
    state: "SP",
    venue_id: venueId,
    status: "published",
  });
  await dbInsert("event_sessions", {
    event_id: noSaleEventId,
    venue_id: venueId,
    starts_at: SAO_PAULO_EVENT_START,
    status: "sales_closed",
  });

  return {
    mainEventId,
    mainSessionId,
    unnumberedEventId,
  };
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
    .select("id, status, expires_at, total_amount_cents, total_fee_cents, orders(id, status), reservation_items(id)")
    .eq("customer_id", customerId)
    .order("created_at", { ascending: false });
  if (error) throw new Error(`reservationsForPhone: ${error.message}`);
  return data ?? [];
}

async function expireLatestReservation(phone) {
  const reservations = await reservationsForPhone(phone);
  assert(reservations.length > 0, "created reservation before expiration test");
  const reservation = reservations[0];
  const createdPast = new Date(Date.now() - 20 * 60_000).toISOString();
  const past = new Date(Date.now() - 60_000).toISOString();
  const { error } = await supabase
    .from("reservations")
    .update({ created_at: createdPast, expires_at: past })
    .eq("id", reservation.id);
  if (error) throw new Error(`expireLatestReservation: ${error.message}`);
}

async function runAudit() {
  const catalog = await createCatalog();
  console.log(`catalog ok - main event ${catalog.mainEventId}`);

  const artistSearch = await sendBuyerMessage(auditPhone(), `${PREFIX} artista principal`);
  assertIncludes(artistSearch.text, `${PREFIX} COMPRA PRINCIPAL`, "A busca por artista encontra evento publicado futuro");

  const citySearch = await sendBuyerMessage(auditPhone(), "Cidade Audit");
  assertIncludes(citySearch.text, `${PREFIX} COMPRA PRINCIPAL`, "B busca por cidade encontra evento publicado futuro");

  const localSearch = await sendBuyerMessage(auditPhone(), `${PREFIX} Teatro Audit`);
  assertIncludes(localSearch.text, `${PREFIX} COMPRA PRINCIPAL`, "C busca por local encontra evento publicado futuro");

  const dateSearch = await sendBuyerMessage(auditPhone(), "8 de agosto");
  assertIncludes(dateSearch.text, "08/08/2026", "D busca por data textual funciona");

  const hiddenSearch = await sendBuyerMessage(auditPhone(), `${PREFIX} hidden`);
  assertIncludes(hiddenSearch.text, "Não encontrei eventos", "E draft/cancelled/finished não aparecem");

  const pastSearch = await sendBuyerMessage(auditPhone(), `${PREFIX} past`);
  assertIncludes(pastSearch.text, "Não encontrei eventos", "F sessão passada não aparece");

  const noSaleSearch = await sendBuyerMessage(auditPhone(), `${PREFIX} no sale`);
  assertIncludes(noSaleSearch.text, "Não encontrei eventos", "F sessão sem venda disponível não aparece");

  const adminSearch = await sendBuyerMessage(auditPhone(), "admin");
  assertIncludes(adminSearch.text, "Não consegui entender", "busca não confunde palavra reservada admin");

  const flowPhone = auditPhone();
  const eventMessage = await sendBuyerMessage(flowPhone, `${PREFIX} artista principal`);
  assertIncludes(eventMessage.text, `🎟️ - *${PREFIX} COMPRA PRINCIPAL*`, "G título do anúncio em caixa alta");
  assertIncludes(eventMessage.text, `Artista: Test_buy_flow_audit Artista Principal`, "G restante com capitalização natural");
  assertNotIncludes(eventMessage.text, `ARTISTA PRINCIPAL`, "G artista não fica todo em caixa alta");
  assertIncludes(eventMessage.text, "Digite 1 para *comprar*", "G anúncio mostra opção Comprar");
  assertIncludes(eventMessage.text, "Digite 2 para *saber mais*", "G anúncio mostra opção Saber mais");
  assertIncludes(eventMessage.text, "*nova pesquisa*", "G anúncio mostra opção de nova pesquisa");

  const offers = await sendBuyerMessage(flowPhone, "1");
  assertIncludes(offers.text, "> Digite 1", "H opções de ingresso usam citação do WhatsApp");
  assertIncludes(offers.text, 'Digite "*VOLTAR*" para voltar à seção anterior.', "H instrução de retorno indica seção anterior");
  assertIncludes(offers.text, "*assentos - meia* - R$ 60,00", "H lista setor + tipo de ingresso");
  assertIncludes(offers.text, "*assentos - inteira* - R$ 120,00 + R$ 10,00 taxa", "J taxa maior que zero aparece");
  assertNotIncludes(offers.text, "*assentos - meia* - R$ 60,00 +", "I taxa zero não aparece");
  assertNotIncludes(offers.text, "Inativo", "K ticket_price inactive não aparece");
  assertNotIncludes(offers.text, "Fora da janela", "K preço fora da janela não aparece");

  const quantityPrompt = await sendBuyerMessage(flowPhone, "1");
  assertIncludes(quantityPrompt.text, "Digite o número de ingressos", "O pergunta quantidade antes de assentos");

  const invalidQuantity = await sendBuyerMessage(flowPhone, "abc");
  assertIncludes(invalidQuantity.text, "Envie a quantidade", "L quantidade inválida é bloqueada");

  const tooManyQuantity = await sendBuyerMessage(flowPhone, "3");
  assertIncludes(tooManyQuantity.text, "Não há ingressos suficientes", "M quantidade maior que disponível é bloqueada");
  assertIncludes(tooManyQuantity.text, "outras opções disponíveis", "M falta de estoque devolve alternativas");

  const retryQuantityPrompt = await sendBuyerMessage(flowPhone, "1");
  assertIncludes(
    retryQuantityPrompt.text,
    "Digite o número de ingressos",
    "O nova escolha volta a pedir quantidade",
  );
  const seatMap = await sendBuyerMessage(flowPhone, "2");
  assert(seatMap.messages.some((message) => message.type === "image"), "O mapa/lista de assentos é enviado após quantidade");
  assertIncludes(seatMap.text, "Responda com os 2 códigos", "O pede códigos após quantidade");

  const cartReview = await sendBuyerMessage(flowPhone, "A01 A02");
  assertIncludes(cartReview.text, "ITEM ADICIONADO À COMPRA", "P assentos entram no carrinho");
  assertIncludes(cartReview.text, "> Quantidade: 2", "P carrinho mostra quantidade");
  const reservation = await sendBuyerMessage(flowPhone, "2");
  assertIncludes(reservation.text, "RESERVA CRIADA", "P reserva criada");
  assertIncludes(reservation.text, "> Quantidade: 2", "P reserva mostra quantidade");
  assertIncludes(reservation.text, "Valor: R$ 120,00", "P reserva mostra valor correto");
  assertIncludes(reservation.text, "Reserva válida até", "P reserva mostra expiração");
  assertIncludes(reservation.text, "digite *COMPRAR*", "P reserva instrui COMPRAR");
  assertNotIncludes(normalizeForCheck(reservation.text), "garantido", "P reserva não diz que ingresso está garantido");

  const checkout = await sendBuyerMessage(flowPhone, "COMPRAR");
  assertIncludes(checkout.text, "LINK DE PAGAMENTO GERADO", "Q COMPRAR gera checkout");
  assertIncludes(checkout.text, "/checkout/", "Q checkout tem link");
  assertIncludes(checkout.text, "Após a confirmação do pagamento", "Q mensagem não promete antes do webhook");
  assertNotIncludes(checkout.text, "> Evento:", "Q checkout não repete evento");
  assertNotIncludes(checkout.text, "> Setor:", "Q checkout não repete setor");
  assertNotIncludes(checkout.text, "> Ingresso:", "Q checkout não repete ingresso");
  assertNotIncludes(checkout.text, "> Quantidade:", "Q checkout não repete quantidade");
  assertNotIncludes(checkout.text, "> Total:", "Q checkout não repete total");
  assertNotIncludes(checkout.text, "Após a confirmação do TEST", "Q mensagem não usa nome do evento como confirmação");

  const unnumberedPhone = auditPhone();
  await sendBuyerMessage(unnumberedPhone, `${PREFIX} unnumbered`);
  await sendBuyerMessage(unnumberedPhone, "1");
  await sendBuyerMessage(unnumberedPhone, "1");
  const unnumberedCart = await sendBuyerMessage(unnumberedPhone, "2");
  assertIncludes(unnumberedCart.text, "ITEM ADICIONADO À COMPRA", "N setor livre entra no carrinho");
  const unnumberedReservation = await sendBuyerMessage(unnumberedPhone, "2");
  assertIncludes(unnumberedReservation.text, "RESERVA CRIADA", "N setor sem assento marcado reserva automaticamente");
  assertIncludes(unnumberedReservation.text, "> Quantidade: 2", "N reserva automática respeita quantidade");

  const expiredPhone = auditPhone();
  await sendBuyerMessage(expiredPhone, `${PREFIX} unnumbered`);
  await sendBuyerMessage(expiredPhone, "1");
  await sendBuyerMessage(expiredPhone, "1");
  await sendBuyerMessage(expiredPhone, "1");
  await sendBuyerMessage(expiredPhone, "2");
  await expireLatestReservation(expiredPhone);
  const expiredCheckout = await sendBuyerMessage(expiredPhone, "COMPRAR");
  assertNotIncludes(expiredCheckout.text, "LINK DE PAGAMENTO GERADO", "R reserva expirada não gera checkout");
  assertIncludes(expiredCheckout.text, "Seu tempo de reserva terminou", "R reserva expirada informa expiração");

  const cancelShowingEventsPhone = auditPhone();
  await sendBuyerMessage(cancelShowingEventsPhone, `${PREFIX} artista principal`);
  const cancelShowingEvents = await sendBuyerMessage(cancelShowingEventsPhone, "cancelar");
  assertIncludes(cancelShowingEvents.text, "PROCESSO CANCELADO", "S cancelar zera showing_events");

  const cancelShowingSectionsPhone = auditPhone();
  await sendBuyerMessage(cancelShowingSectionsPhone, `${PREFIX} artista principal`);
  await sendBuyerMessage(cancelShowingSectionsPhone, "1");
  const cancelShowingSections = await sendBuyerMessage(cancelShowingSectionsPhone, "cancela");
  assertIncludes(cancelShowingSections.text, "PROCESSO CANCELADO", "S cancela zera showing_sections");

  const cancelQuantityPhone = auditPhone();
  await sendBuyerMessage(cancelQuantityPhone, `${PREFIX} artista principal`);
  await sendBuyerMessage(cancelQuantityPhone, "1");
  await sendBuyerMessage(cancelQuantityPhone, "1");
  const cancelQuantity = await sendBuyerMessage(cancelQuantityPhone, "apagar");
  assertIncludes(cancelQuantity.text, "PROCESSO CANCELADO", "S apagar zera selecting_quantity");

  const cancelReservationPhone = auditPhone();
  await sendBuyerMessage(cancelReservationPhone, `${PREFIX} unnumbered`);
  await sendBuyerMessage(cancelReservationPhone, "1");
  await sendBuyerMessage(cancelReservationPhone, "1");
  await sendBuyerMessage(cancelReservationPhone, "1");
  await sendBuyerMessage(cancelReservationPhone, "2");
  const cancelReservation = await sendBuyerMessage(cancelReservationPhone, "sair");
  assertIncludes(cancelReservation.text, "reserva foi cancelada", "S sair cancela/zera reserva ativa");

  const unauthProd = await fetch("https://site-phi-seven-72.vercel.app/api/webhook/zapi", {
    method: "POST",
  });
  assert(unauthProd.status === 401, "produção POST /api/webhook/zapi sem segredo retorna 401", `status ${unauthProd.status}`);
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
