import { createServer } from "node:http";
import { spawn } from "node:child_process";
import { pbkdf2Sync, randomBytes } from "node:crypto";
import { readFileSync, rmSync, writeFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

const PREFIX = "TEST_ADMIN_NAVIGATION_FLOW";
const PORT = 3347;
const ZAPI_PORT = 4573;
const APP_BASE_URL = `http://127.0.0.1:${PORT}`;
const ZAPI_BASE_URL = `http://127.0.0.1:${ZAPI_PORT}`;
const WEBHOOK_URL = `${APP_BASE_URL}/api/webhook/zapi`;
const PASS = "admin-navigation-audit-pass";

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
const ROOT_PHONE = "559960000001";
const MANAGER_PHONE = "559960000002";
const OPERATOR_PHONE = "559960000003";
const BUYER_PHONE = "559960000004";
const COMMON_ADMIN_PHONE = "559960000005";
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
  ADMIN_SESSION_TTL_MINUTES: "1440",
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
let zapiCounter = 0;
let providerCounter = 1;
let rootAdminId = null;
let eventId = null;
const TEMP_ENV_FILE = ".env.test.local";

function assert(condition, label, details) {
  if (!condition) throw new Error(`${label}${details ? `: ${details}` : ""}`);
  console.log(`ok - ${label}`);
}

function assertIncludes(value, expected, label) {
  assert(
    String(value).includes(expected),
    label,
    `expected ${JSON.stringify(expected)} in ${JSON.stringify(value).slice(0, 900)}`,
  );
}

function assertNotIncludes(value, expected, label) {
  assert(
    !String(value).includes(expected),
    label,
    `did not expect ${JSON.stringify(expected)} in ${JSON.stringify(value).slice(0, 900)}`,
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

  const phones = [
    ROOT_PHONE,
    MANAGER_PHONE,
    OPERATOR_PHONE,
    BUYER_PHONE,
    COMMON_ADMIN_PHONE,
  ];
  const { data: customers } = await supabase
    .from("customers")
    .select("id")
    .in("whatsapp_phone", phones);
  const customerIds = (customers ?? []).map((customer) => customer.id);
  const conversationIds = await dbSelectIds("conversations", "customer_id", customerIds);
  if (conversationIds.length) await supabase.from("whatsapp_messages").delete().in("conversation_id", conversationIds);
  if (conversationIds.length) await supabase.from("conversations").delete().in("id", conversationIds);
  if (customerIds.length) await supabase.from("customers").delete().in("id", customerIds);

  const { data: admins } = await supabase
    .from("admin_users")
    .select("id")
    .in("phone", [ROOT_PHONE, MANAGER_PHONE, OPERATOR_PHONE]);
  const adminIds = (admins ?? []).map((admin) => admin.id);
  if (adminIds.length) await supabase.from("admin_sessions").delete().in("admin_user_id", adminIds);
  if (adminIds.length) await supabase.from("admin_users").delete().in("id", adminIds);
}

async function verifyCleanup() {
  const checks = [
    supabase.from("events").select("id", { count: "exact", head: true }).ilike("title", `${PREFIX}%`),
    supabase.from("venues").select("id", { count: "exact", head: true }).ilike("name", `${PREFIX}%`),
    supabase.from("customers").select("id", { count: "exact", head: true }).in("whatsapp_phone", [ROOT_PHONE, MANAGER_PHONE, OPERATOR_PHONE, BUYER_PHONE, COMMON_ADMIN_PHONE]),
    supabase.from("admin_users").select("id", { count: "exact", head: true }).in("phone", [ROOT_PHONE, MANAGER_PHONE, OPERATOR_PHONE]),
  ];
  const results = await Promise.all(checks);
  results.forEach(({ count, error }, index) => {
    if (error) throw error;
    assert((count ?? 0) === 0, `cleanup ${index + 1} sem dados temporários`, `restaram ${count}`);
  });
}

async function createCatalog() {
  const venueId = await dbInsert("venues", {
    name: `${PREFIX} Venue`,
    city: "Cidade Navegacao",
    state: "SP",
    status: "active",
  });
  const sectionId = await dbInsert("venue_sections", {
    venue_id: venueId,
    name: "Entrada",
    slug: `${PREFIX.toLowerCase()}-entrada`,
    has_numbered_seats: false,
    capacity: 20,
    sort_order: 1,
    status: "active",
  });
  eventId = await dbInsert("events", {
    title: `${PREFIX} Evento`,
    artist_name: `${PREFIX} Artista`,
    city: "Cidade Navegacao",
    state: "SP",
    venue_id: venueId,
    status: "published",
  });
  const sessionId = await dbInsert("event_sessions", {
    event_id: eventId,
    venue_id: venueId,
    starts_at: "2026-08-08T16:00:00.000Z",
    status: "sales_open",
  });
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
  const seatId = await dbInsert("seats", {
    venue_id: venueId,
    section_id: sectionId,
    seat_code: "GERAL-001",
    row_label: "Geral",
    seat_number: "1",
    status: "active",
  });
  await dbInsert("session_seats", {
    session_id: sessionId,
    section_id: sectionId,
    seat_id: seatId,
    status: "available",
  });
}

async function createAdmin(phone, role, name) {
  return dbInsert("admin_users", {
    phone,
    role,
    status: "active",
    name,
    passphrase_hash: hashPassphrase(PASS),
    created_by_admin_phone: ROOT_PHONE,
  });
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
    res.end(JSON.stringify({ messageId: `zapi-admin-navigation-${zapiCounter}` }));
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
    SEAT_MAP_STORAGE_BUCKET: testEnv.SEAT_MAP_STORAGE_BUCKET,
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

async function login(phone) {
  const prompt = await sendMessage(phone, "admin");
  assertIncludes(prompt.text, "LOGIN ADMINISTRATIVO", `${phone} recebe login tokenizado`);
  const loginUrl = prompt.text.match(/https?:\/\/\S+\/admin\/login\/[^\s]+/)?.[0];
  assert(loginUrl, `${phone} recebe link temporário`);
  const response = await fetch(`${APP_BASE_URL}/api/admin/login/verify`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      token: loginUrl.split("/").pop(),
      passphrase: PASS,
    }),
  });
  const body = await response.json();
  assert(response.ok && /^\d{6}$/.test(body.code), `${phone} recebe código único`);
  return sendMessage(phone, body.code);
}

async function expireRootSession() {
  const { error } = await supabase
    .from("admin_sessions")
    .update({
      created_at: "2020-01-01T00:00:00.000Z",
      expires_at: "2020-01-01T00:01:00.000Z",
    })
    .eq("admin_user_id", rootAdminId)
    .eq("status", "active");
  if (error) throw new Error(`expire root session: ${error.message}`);
}

async function main() {
  let nextChild;
  let zapiServer;

  try {
    await cleanup();
    await createCatalog();
    rootAdminId = await createAdmin(ROOT_PHONE, "root", `${PREFIX} Diretor`);
    await createAdmin(MANAGER_PHONE, "admin", `${PREFIX} Gerente`);
    await createAdmin(OPERATOR_PHONE, "operator", `${PREFIX} Operador`);
    await supabase.from("gate_accesses").insert({
      event_id: eventId,
      phone: "559960000099",
      passphrase_hash: hashPassphrase("portaria"),
      status: "active",
      created_by_admin_phone: ROOT_PHONE,
    });

    writeTemporaryNextEnv();
    zapiServer = await startZapiMock();
    nextChild = await startNextDev();

    const rootMenu = (await login(ROOT_PHONE)).text;
    assertIncludes(rootMenu, "Digite 1 para meus eventos", "A) Diretor vê Meus eventos");
    assertIncludes(rootMenu, "Digite 7 para administradores", "A) Diretor vê menu completo");
    assertIncludes((await sendMessage(ROOT_PHONE, "1")).text, "MEUS EVENTOS", "A) número 1 abre Meus eventos no menu principal");

    const managerMenu = (await login(MANAGER_PHONE)).text;
    assertNotIncludes(managerMenu, "Administradores", "B) Gerente não vê Administradores");
    assertIncludes((await sendMessage(MANAGER_PHONE, "administradores")).text, "Essa opção não está disponível", "B/I) Gerente não acessa Administradores por palavra");
    assertIncludes((await sendMessage(MANAGER_PHONE, "menu")).text, "MENU ADMIN", "Gerente volta ao menu");

    const operatorMenu = (await login(OPERATOR_PHONE)).text;
    assertIncludes(operatorMenu, "cortesias", "C) Operador vê Cortesias");
    assertIncludes(operatorMenu, "relatórios", "C) Operador vê Relatórios");
    assertNotIncludes(operatorMenu, "Meus eventos", "C) Operador não vê Meus eventos");
    assertIncludes((await sendMessage(OPERATOR_PHONE, "cortesias")).text, "CORTESIAS", "C) Operador abre Cortesias");
    assertIncludes((await sendMessage(OPERATOR_PHONE, "relatorio")).text, "RELATÓRIOS", "C/G) Operador acessa Relatórios por palavra");
    assertIncludes((await sendMessage(OPERATOR_PHONE, "evento")).text, "Essa opção não está disponível", "E/F) Operador não acessa eventos por palavra");
    assertIncludes((await sendMessage(OPERATOR_PHONE, "menu")).text, "MENU ADMIN", "C) Operador volta ao menu principal");
    assertIncludes((await sendMessage(OPERATOR_PHONE, "portaria")).text, "Essa opção não está disponível", "G) Operador não acessa Portaria por palavra");

    assertIncludes((await sendMessage(ROOT_PHONE, "1")).text, "LISTAR MEUS EVENTOS", "D) dentro de Meus eventos, 1 abre listar eventos");
    const eventsListScreen = await sendMessage(ROOT_PHONE, "1");
    assertIncludes(eventsListScreen.text, "EVENTOS ENCONTRADOS", "D) filtro 1 lista eventos ativos");
    const detail = await sendMessage(ROOT_PHONE, `${PREFIX} Evento`);
    assertIncludes(detail.text, `${PREFIX} Evento`, "D/I) número na lista abre detalhe do evento");
    const listAfterBack = await sendMessage(ROOT_PHONE, "Voltar");
    assertIncludes(listAfterBack.text, "EVENTOS ENCONTRADOS", "H/I) Voltar do detalhe retorna para a lista");
    assert(
      listAfterBack.text === eventsListScreen.text,
      "H/I) Voltar restaura exatamente a lista exibida na ida",
    );

    assertIncludes((await sendMessage(ROOT_PHONE, "evento")).text, "MEUS EVENTOS", "G) troca por palavra para Meus eventos");
    assertIncludes((await sendMessage(ROOT_PHONE, "3")).text, "ESCOLHA O EVENTO PARA EDITAR", "I) editar evento lista eventos");
    assertIncludes((await sendMessage(ROOT_PHONE, `${PREFIX} Evento`)).text, "EDITAR MEU EVENTO", "I) seleciona evento para edição");
    const pricesMenuScreen = await sendMessage(ROOT_PHONE, "10");
    assertIncludes(pricesMenuScreen.text, "EDITAR VALORES", "I) entra em Valores de venda");
    assertIncludes((await sendMessage(ROOT_PHONE, "1")).text, "Valores de", "I) lista preços");
    const pricesAfterBack = await sendMessage(ROOT_PHONE, "Voltar");
    assertIncludes(pricesAfterBack.text, "EDITAR VALORES", "I) Voltar da lista de preços retorna a Valores de venda");
    assert(
      pricesAfterBack.text === pricesMenuScreen.text,
      "I) Voltar restaura exatamente o menu de valores exibido na ida",
    );

    const gateMenuScreen = await sendMessage(ROOT_PHONE, "portaria");
    assertIncludes(gateMenuScreen.text, "PORTARIA", "G) troca por palavra para Portaria");
    assertIncludes((await sendMessage(ROOT_PHONE, "1")).text, "LEITURA NESTE TELEFONE", "E) dentro de Portaria, 1 inicia check-in neste telefone");
    const gateAfterBack = await sendMessage(ROOT_PHONE, "Voltar");
    assertIncludes(gateAfterBack.text, "PORTARIA", "H) Voltar da escolha de evento retorna Portaria");
    assert(
      gateAfterBack.text === gateMenuScreen.text,
      "H) Voltar restaura exatamente o menu de Portaria exibido na ida",
    );
    const accessEventScreen = await sendMessage(ROOT_PHONE, "3");
    assertIncludes(accessEventScreen.text, "PORTARIA - ESCOLHA O EVENTO", "J) Ver acessos pede evento");
    const accessFilterScreen = await sendMessage(ROOT_PHONE, `${PREFIX} Evento`);
    assertIncludes(accessFilterScreen.text, "VER TODOS OS ACESSOS", "J) escolher evento mostra filtros");
    assertIncludes((await sendMessage(ROOT_PHONE, "1")).text, "ACESSOS ATIVOS", "J) filtro ativos lista acessos");
    const filterAfterBack = await sendMessage(ROOT_PHONE, "Voltar");
    assert(filterAfterBack.text === accessFilterScreen.text, "J) Voltar de acessos ativos restaura exatamente os filtros");
    const eventAfterBack = await sendMessage(ROOT_PHONE, "Voltar");
    assert(eventAfterBack.text === accessEventScreen.text, "J) segundo Voltar restaura exatamente a escolha de evento");
    assertIncludes((await sendMessage(ROOT_PHONE, "Voltar")).text, "PORTARIA", "J) terceiro Voltar retorna Portaria");
    assertIncludes((await sendMessage(ROOT_PHONE, "4")).text, "REVOGAR ACESSOS - ESCOLHA O EVENTO", "K) Revogar acessos pede evento");
    assertIncludes((await sendMessage(ROOT_PHONE, `${PREFIX} Evento`)).text, "REVOGAR ACESSOS", "K) escolher evento lista acessos para revogar");
    assertIncludes((await sendMessage(ROOT_PHONE, "Voltar")).text, "REVOGAR ACESSOS - ESCOLHA O EVENTO", "K) Voltar da lista de revogação retorna escolha de evento");
    assertIncludes((await sendMessage(ROOT_PHONE, `${PREFIX} Evento`)).text, "REVOGAR ACESSOS", "K) entra novamente na lista de revogação");
    assertIncludes((await sendMessage(ROOT_PHONE, "1")).text, "CONFIRMAR PAUSA DO ACESSO", "K) escolhe acesso para confirmar pausa");
    assertIncludes((await sendMessage(ROOT_PHONE, "Voltar")).text, "REVOGAR ACESSOS", "K) Voltar da confirmação retorna lista sem pausar");
    assertIncludes((await sendMessage(ROOT_PHONE, "cancelar")).text, "PORTARIA", "M) Cancelar abandona fluxo e mantém sessão admin");

    assertIncludes((await sendMessage(ROOT_PHONE, "evento")).text, "MEUS EVENTOS", "L) abre criação para testar cancelar");
    assertIncludes((await sendMessage(ROOT_PHONE, "2")).text, "nome/título do evento", "L) inicia criação de evento");
    assertIncludes((await sendMessage(ROOT_PHONE, "cancelar")).text, "Criação de evento cancelada", "L) Cancelar descarta rascunho");
    assertIncludes((await sendMessage(ROOT_PHONE, "texto inesperado qualquer")).text, "MEUS EVENTOS", "P) texto inesperado em admin não cai na busca de cliente");

    assertIncludes((await sendMessage(ROOT_PHONE, "sair")).text, "Sessão administrativa encerrada com segurança", "N) Sair por texto revoga sessão");
    assertIncludes((await sendMessage(MANAGER_PHONE, "menu")).text, "MENU ADMIN", "O) Gerente volta ao menu para testar sair por número");
    assertIncludes((await sendMessage(MANAGER_PHONE, "sair")).text, "Sessão administrativa encerrada com segurança", "O) Sair revoga sessão");

    await login(ROOT_PHONE);
    await expireRootSession();
    assertIncludes((await sendMessage(ROOT_PHONE, "relatorio")).text, "Sessão administrativa encerrada", "Q) sessão expirada bloqueia comando");

    assertIncludes((await sendMessage(BUYER_PHONE, `${PREFIX} Artista`)).text, `${PREFIX} EVENTO`, "R) cliente comum continua buscando evento");
    assertIncludes((await sendMessage(COMMON_ADMIN_PHONE, "admin")).text, "Não consegui entender sua mensagem", "S) cliente comum digitando admin recebe resposta neutra");

    await cleanup();
    await verifyCleanup();
  } finally {
    if (nextChild) await stopChild(nextChild);
    if (zapiServer) await new Promise((resolve) => zapiServer.close(resolve));
    removeTemporaryNextEnv();
  }
}

main().catch(async (error) => {
  console.error(error);
  await cleanup().catch((cleanupError) => console.error("cleanup failed", cleanupError));
  process.exit(1);
});
