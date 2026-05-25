import { createServer } from "node:http";
import { spawn } from "node:child_process";
import { pbkdf2Sync, randomBytes } from "node:crypto";
import { readFileSync, rmSync, writeFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

const PREFIX = "TEST_ADMIN_EVENT_CREATION_FLOW";
const PORT = 3352;
const ZAPI_PORT = 4582;
const APP_BASE_URL = `http://127.0.0.1:${PORT}`;
const ZAPI_BASE_URL = `http://127.0.0.1:${ZAPI_PORT}`;
const WEBHOOK_URL = `${APP_BASE_URL}/api/webhook/zapi`;
const ADMIN_PHONE = "559970000701";
const BUYER_PHONE = "559970000702";
const PASS = "admin-event-creation-audit-pass";
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
  SEAT_MAP_STORAGE_BUCKET: fileEnv.SEAT_MAP_STORAGE_BUCKET || "audit-seat-maps",
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
  const sessionSeatIds = await dbSelectIds("session_seats", "session_id", sessionIds);
  const priceIds = await dbSelectIds("ticket_prices", "session_id", sessionIds);

  if (eventIds.length) await supabase.from("gate_accesses").delete().in("event_id", eventIds);
  if (eventIds.length) await supabase.from("gate_sessions").delete().in("event_id", eventIds);
  if (sessionSeatIds.length) await supabase.from("session_seats").delete().in("id", sessionSeatIds);
  if (priceIds.length) await supabase.from("ticket_prices").delete().in("id", priceIds);
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
    assert((count ?? 0) === 0, `cleanup ${index + 1} sem dados temporários`, `restaram ${count}`);
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

async function createSeedEvent(index, status) {
  const venueId = await dbInsert("venues", {
    name: `${PREFIX} Venue ${status} ${index}`,
    city: "Sorocaba",
    state: "SP",
    status: "active",
  });
  const eventId = await dbInsert("events", {
    title: `${PREFIX} ${status.toUpperCase()} ${String(index).padStart(2, "0")}`,
    artist_name: `${PREFIX} Artista`,
    city: "Sorocaba",
    state: "SP",
    venue_id: venueId,
    status,
    created_by_admin_user_id: adminUserId,
    created_by_admin_phone: ADMIN_PHONE,
  });
  await dbInsert("event_sessions", {
    event_id: eventId,
    venue_id: venueId,
    starts_at: `2026-09-${String(index).padStart(2, "0")}T23:00:00.000Z`,
    status: status === "published" ? "sales_open" : "scheduled",
  });
  return eventId;
}

async function seedEventsForListing() {
  for (let index = 1; index <= 6; index += 1) {
    await createSeedEvent(index, "published");
  }
  await createSeedEvent(1, "draft");
  await createSeedEvent(1, "cancelled");
  await createSeedEvent(1, "finished");
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
    res.end(JSON.stringify({ messageId: `zapi-admin-event-creation-${zapiCounter}` }));
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
  return response;
}

async function testEventsMenuAndListing() {
  const menu = await sendMessage(ADMIN_PHONE, "meus eventos");
  assertIncludes(menu.text, "MEUS EVENTOS", "menu Meus eventos aparece");
  assertIncludes(menu.text, "1. Listar meus eventos", "menu mostra listar");
  assertIncludes(menu.text, "2. Criar meu evento", "menu mostra criar");
  assertIncludes(menu.text, "5. Duplicar evento", "menu mostra duplicar");
  assertIncludes(menu.text, "6. Voltar", "menu mostra voltar com numero 6");
  assertIncludes(menu.text, "7. Sair", "menu mostra sair com numero 7");
  assertNotIncludes(menu.text, "Setores e assentos", "menu nao mostra setores e assentos");

  const filters = await sendMessage(ADMIN_PHONE, "1");
  assertIncludes(filters.text, "LISTAR MEUS EVENTOS", "listar abre filtros");
  assertIncludes(filters.text, "1. Eventos ativos", "filtro ativos");
  assertIncludes(filters.text, "4. Todos os eventos", "filtro todos");

  const active = await sendMessage(ADMIN_PHONE, "1");
  assertIncludes(active.text, "EVENTOS ENCONTRADOS", "ativos lista eventos");
  assertIncludes(active.text, `${PREFIX} PUBLISHED 01`, "ativos contem published");
  assertNotIncludes(active.text, `${PREFIX} DRAFT 01`, "ativos nao contem draft");
  assertIncludes(active.text, "Digite \"Mais\"", "ativos orienta Mais");

  const more = await sendMessage(ADMIN_PHONE, "Mais");
  assertIncludes(more.text, `${PREFIX} PUBLISHED 06`, "Mais mostra pagina seguinte");

  const noMore = await sendMessage(ADMIN_PHONE, "Mais");
  assertIncludes(noMore.text, "Não há mais eventos", "sem mais paginas responde claramente");

  const backToMenu = await sendMessage(ADMIN_PHONE, "Voltar");
  assertIncludes(backToMenu.text, "MEUS EVENTOS", "Voltar da lista retorna Meus eventos");

  await sendMessage(ADMIN_PHONE, "1");
  const all = await sendMessage(ADMIN_PHONE, "4");
  assertIncludes(all.text, `${PREFIX} DRAFT 01`, "todos inclui draft");
  assertIncludes(all.text, `${PREFIX} CANCELLED 01`, "todos inclui cancelled");
  assertIncludes(all.text, `${PREFIX} FINISHED 01`, "todos inclui finished");
  const detail = await sendMessage(ADMIN_PHONE, "1");
  assertIncludes(detail.text, "Status:", "numero da lista abre detalhe");
}

async function fetchCreatedEvent(title) {
  const { data, error } = await supabase
    .from("events")
    .select("id, title, description, status, image_url, venue_id")
    .eq("title", title)
    .single();
  if (error) throw new Error(`select created event ${title}: ${error.message}`);
  return data;
}

async function countRows(table, column, values) {
  const { count, error } = await supabase
    .from(table)
    .select("id", { count: "exact", head: true })
    .in(column, values);
  if (error) throw new Error(`count ${table}: ${error.message}`);
  return count ?? 0;
}

async function testSharedDraftCreation() {
  const title = `${PREFIX} CRIACAO COMPARTILHADA`;
  await sendMessage(ADMIN_PHONE, "meus eventos");
  assertIncludes((await sendMessage(ADMIN_PHONE, "2")).text, "nome/título", "criar pergunta titulo");
  await sendMessage(ADMIN_PHONE, title);
  await sendMessage(ADMIN_PHONE, `${PREFIX} Artista`);
  await sendMessage(ADMIN_PHONE, "Sorocaba");
  await sendMessage(ADMIN_PHONE, "SP");
  await sendMessage(ADMIN_PHONE, `${PREFIX} Teatro Compartilhado`);
  await sendMessage(ADMIN_PHONE, "pular");
  await sendMessage(ADMIN_PHONE, "1 sessão, 2 datas");
  await sendMessage(ADMIN_PHONE, "10/08/2026 20:00");
  await sendMessage(ADMIN_PHONE, "11/08/2026 21:00");
  await sendMessage(ADMIN_PHONE, "2");
  await sendMessage(ADMIN_PHONE, "1");
  await sendMessage(ADMIN_PHONE, "100");
  await sendMessage(ADMIN_PHONE, "2");
  await sendMessage(ADMIN_PHONE, "Inteira 120,00 0");
  const descriptionPrompt = await sendMessage(ADMIN_PHONE, "Meia 60,00 0");
  assertIncludes(descriptionPrompt.text, "informações gerais", "apos ofertas pede informacoes gerais");
  const statusPrompt = await sendMessage(
    ADMIN_PHONE,
    "Abertura dos portões às 19h. Classificação livre.",
  );
  assertIncludes(statusPrompt.text, "Deixar como rascunho", "apos informacoes pede rascunho/publicar");
  const summary = await sendMessage(ADMIN_PHONE, "1");
  assertIncludes(summary.text, "Confirme o novo evento", "mostra confirmacao final");
  assertIncludes(summary.text, "Informações gerais: cadastradas", "summary mostra informacoes");
  assertIncludes(summary.text, "Publicação: rascunho", "summary mostra rascunho");
  const created = await sendMessage(ADMIN_PHONE, "CONFIRMAR");
  assertIncludes(created.text, "Evento criado", "confirma cria evento");

  const event = await fetchCreatedEvent(title);
  assert(event.status === "draft", "evento compartilhado ficou rascunho");
  assert(event.description?.includes("Abertura dos portões"), "description foi persistida");

  const sessionIds = await dbSelectIds("event_sessions", "event_id", [event.id]);
  assert(sessionIds.length === 2, "evento compartilhado criou 2 sessoes");
  const priceCount = await countRows("ticket_prices", "session_id", sessionIds);
  assert(priceCount === 4, "2 ofertas aplicadas nas 2 sessoes");
}

async function testNumberedPublishedCreation() {
  const title = `${PREFIX} CRIACAO NUMERADA`;
  await sendMessage(ADMIN_PHONE, "meus eventos");
  await sendMessage(ADMIN_PHONE, "2");
  await sendMessage(ADMIN_PHONE, title);
  await sendMessage(ADMIN_PHONE, `${PREFIX} Numerado`);
  await sendMessage(ADMIN_PHONE, "Sorocaba");
  await sendMessage(ADMIN_PHONE, "SP");
  await sendMessage(ADMIN_PHONE, `${PREFIX} Teatro Numerado`);
  await sendMessage(ADMIN_PHONE, "https://example.com/test-admin-event.jpg");
  await sendMessage(ADMIN_PHONE, "1");
  await sendMessage(ADMIN_PHONE, "1");
  await sendMessage(ADMIN_PHONE, "12/08/2026 20:00");
  await sendMessage(ADMIN_PHONE, "3");
  await sendMessage(ADMIN_PHONE, "1");
  await sendMessage(ADMIN_PHONE, "4");
  await sendMessage(ADMIN_PHONE, "1");
  await sendMessage(ADMIN_PHONE, "Inteira 90,00 0");
  await sendMessage(ADMIN_PHONE, "A 4 assentos 1 a 4");
  await sendMessage(ADMIN_PHONE, "2");
  const statusPrompt = await sendMessage(ADMIN_PHONE, "PULAR");
  assertIncludes(statusPrompt.text, "Publicar", "descricao pulada leva para status");
  const summary = await sendMessage(ADMIN_PHONE, "2");
  assertIncludes(summary.text, "Publicação: publicar", "summary mostra publicar");
  const created = await sendMessage(ADMIN_PHONE, "CONFIRMAR");
  assertIncludes(created.text, "Evento criado", "confirma cria evento numerado");

  const event = await fetchCreatedEvent(title);
  assert(event.status === "published", "evento numerado ficou published");
  assert(event.image_url === "https://example.com/test-admin-event.jpg", "foto foi persistida");
  assert(event.description === null, "description pulada fica null");

  const sessionIds = await dbSelectIds("event_sessions", "event_id", [event.id]);
  assert(sessionIds.length === 1, "evento numerado criou 1 sessao");
  const { data: sessions, error: sessionError } = await supabase
    .from("event_sessions")
    .select("status")
    .eq("event_id", event.id);
  if (sessionError) throw sessionError;
  assert(sessions?.[0]?.status === "sales_open", "evento publicado abre venda da sessao");

  const sectionIds = await dbSelectIds("venue_sections", "venue_id", [event.venue_id]);
  const seatCount = await countRows("seats", "section_id", sectionIds);
  const sessionSeatCount = await countRows("session_seats", "session_id", sessionIds);
  assert(seatCount === 4, "evento numerado criou 4 assentos");
  assert(sessionSeatCount === 4, "evento numerado criou 4 session_seats");
}

async function testCancelCreationRollback() {
  const title = `${PREFIX} CRIACAO CANCELADA`;
  await sendMessage(ADMIN_PHONE, "meus eventos");
  await sendMessage(ADMIN_PHONE, "2");
  await sendMessage(ADMIN_PHONE, title);
  const cancelled = await sendMessage(ADMIN_PHONE, "cancelar");
  assertIncludes(cancelled.text, "Criação de evento cancelada", "cancelar abandona criacao");
  assertIncludes(cancelled.text, "MEUS EVENTOS", "cancelar volta para Meus eventos");

  const { count, error } = await supabase
    .from("events")
    .select("id", { count: "exact", head: true })
    .eq("title", title);
  if (error) throw error;
  assert((count ?? 0) === 0, "cancelar nao grava evento");
}

async function testBuyerUnaffected() {
  const response = await sendMessage(BUYER_PHONE, `${PREFIX} CRIACAO NUMERADA`);
  assertNotIncludes(response.text, "MENU ADMIN", "cliente comum nao entra em admin");
}

async function main() {
  let zapiServer = null;
  let next = null;
  try {
    await cleanup();
    await createAdmin();
    await seedEventsForListing();
    writeTemporaryNextEnv();
    zapiServer = await startZapiMock();
    next = await startNextDev();
    await login();
    await testEventsMenuAndListing();
    await testSharedDraftCreation();
    await testNumberedPublishedCreation();
    await testCancelCreationRollback();
    await testBuyerUnaffected();
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
