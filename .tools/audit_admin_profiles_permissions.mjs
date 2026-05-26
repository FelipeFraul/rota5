import { createServer } from "node:http";
import { spawn } from "node:child_process";
import { pbkdf2Sync, randomBytes } from "node:crypto";
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

const PREFIX = "TEST_ADMIN_PROFILES_PERMISSIONS";
const PORT = 3345;
const ZAPI_PORT = 4571;
const APP_BASE_URL = `http://127.0.0.1:${PORT}`;
const ZAPI_BASE_URL = `http://127.0.0.1:${ZAPI_PORT}`;
const WEBHOOK_URL = `${APP_BASE_URL}/api/webhook/zapi`;
const PASS = "admin-profile-audit-pass";

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
const ROOT_PHONE = "559950000001";
const MANAGER_PHONE = "559950000002";
const OPERATOR_PHONE = "559950000003";
const BUYER_PHONE = "559950000004";
const VALIDATOR_PHONE = "559950000005";
const testEnv = {
  ...process.env,
  ...fileEnv,
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
let zapiCounter = 0;
let providerCounter = 1;

function assert(condition, label, details) {
  if (!condition) throw new Error(`${label}${details ? `: ${details}` : ""}`);
  console.log(`ok - ${label}`);
}

function assertIncludes(value, expected, label) {
  assert(
    String(value).includes(expected),
    label,
    `expected ${JSON.stringify(expected)} in ${JSON.stringify(value).slice(0, 800)}`,
  );
}

function assertNotIncludes(value, expected, label) {
  assert(
    !String(value).includes(expected),
    label,
    `did not expect ${JSON.stringify(expected)} in ${JSON.stringify(value).slice(0, 800)}`,
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

  const phones = [ROOT_PHONE, MANAGER_PHONE, OPERATOR_PHONE, BUYER_PHONE, VALIDATOR_PHONE];
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
    supabase.from("customers").select("id", { count: "exact", head: true }).in("whatsapp_phone", [ROOT_PHONE, MANAGER_PHONE, OPERATOR_PHONE, BUYER_PHONE, VALIDATOR_PHONE]),
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
    city: "Cidade Perfis",
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
  const eventId = await dbInsert("events", {
    title: `${PREFIX} Evento`,
    artist_name: `${PREFIX} Artista`,
    city: "Cidade Perfis",
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
  return { eventId };
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
    res.end(JSON.stringify({ messageId: `zapi-admin-profiles-${zapiCounter}` }));
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
  assertIncludes((await sendMessage(phone, "admin")).text, "palavra-chave", `${phone} pede senha`);
  return sendMessage(phone, PASS);
}

async function main() {
  let nextChild;
  let zapiServer;

  try {
    await cleanup();
    const { eventId } = await createCatalog();
    await createAdmin(ROOT_PHONE, "root", `${PREFIX} Diretor`);
    await createAdmin(MANAGER_PHONE, "admin", `${PREFIX} Gerente`);
    await createAdmin(OPERATOR_PHONE, "operator", `${PREFIX} Operador`);

    const { error: gateInsertError } = await supabase.from("admin_users").insert({
      phone: "559950000099",
      role: "gate",
      status: "active",
      passphrase_hash: hashPassphrase(PASS),
    });
    assert(Boolean(gateInsertError), "gate/support legado não pode ser criado como admin");

    await supabase.from("gate_accesses").insert({
      event_id: eventId,
      phone: VALIDATOR_PHONE,
      passphrase_hash: hashPassphrase("portaria-externa"),
      status: "active",
      created_by_admin_phone: ROOT_PHONE,
    });

    zapiServer = await startZapiMock();
    nextChild = await startNextDev();

    const rootMenu = (await login(ROOT_PHONE)).text;
    assertIncludes(rootMenu, "Perfil: Diretor", "root aparece como Diretor");
    assertIncludes(rootMenu, "> 1. Meus eventos", "Diretor vê Meus eventos");
    assertIncludes(rootMenu, "> 2. Ingressos e pedidos", "Diretor vê ingressos");
    assertIncludes(rootMenu, "> 3. Cortesias", "Diretor vê cortesias");
    assertIncludes(rootMenu, "> 4. Portaria", "Diretor vê portaria");
    assertIncludes(rootMenu, "> 5. Administradores", "Diretor vê administradores");
    assertIncludes(rootMenu, "> 6. Relatórios", "Diretor vê relatórios");
    assertIncludes(rootMenu, "> 7. Sair", "Diretor vê sair");

    const managerMenu = (await login(MANAGER_PHONE)).text;
    assertIncludes(managerMenu, "Perfil: Gerente", "Gerente mostra perfil em português");
    assertIncludes(managerMenu, "> 1. Meus eventos", "Gerente vê Meus eventos");
    assertIncludes(managerMenu, "> 2. Ingressos e pedidos", "Gerente vê ingressos");
    assertIncludes(managerMenu, "> 3. Cortesias", "Gerente vê cortesias");
    assertIncludes(managerMenu, "> 4. Portaria", "Gerente vê portaria");
    assertNotIncludes(managerMenu, "Administradores", "Gerente não vê Administradores");
    assertIncludes(managerMenu, "> 6. Relatórios", "Gerente vê relatórios");
    assertIncludes((await sendMessage(MANAGER_PHONE, "evento")).text, "MEUS EVENTOS", "Gerente acessa eventos por palavra");
    assertIncludes((await sendMessage(MANAGER_PHONE, "ingresso")).text, "INGRESSOS E PEDIDOS", "Gerente acessa ingressos");
    assertIncludes((await sendMessage(MANAGER_PHONE, "cortesia")).text, "CORTESIAS", "Gerente acessa cortesias");
    assertIncludes((await sendMessage(MANAGER_PHONE, "portaria")).text, "PORTARIA", "Gerente acessa portaria");
    assertIncludes((await sendMessage(MANAGER_PHONE, "relatorio")).text, "RELATÓRIOS", "Gerente acessa relatórios");
    assertIncludes((await sendMessage(MANAGER_PHONE, "administrador")).text, "Essa opção não está disponível", "Gerente não acessa administradores por palavra");
    assertIncludes((await sendMessage(MANAGER_PHONE, "menu")).text, "MENU ADMIN", "Gerente volta ao menu");
    assertIncludes((await sendMessage(MANAGER_PHONE, "5")).text, "Essa opção não está disponível", "Gerente não acessa administradores por número");

    const operatorMenu = (await login(OPERATOR_PHONE)).text;
    assertIncludes(operatorMenu, "Perfil: Operador", "Operador mostra perfil em português");
    assertNotIncludes(operatorMenu, "Meus eventos", "Operador não vê eventos");
    assertNotIncludes(operatorMenu, "Ingressos e pedidos", "Operador não vê ingressos");
    assertIncludes(operatorMenu, "> 3. Cortesias", "Operador vê cortesias");
    assertNotIncludes(operatorMenu, "Portaria", "Operador não vê portaria");
    assertNotIncludes(operatorMenu, "Administradores", "Operador não vê administradores");
    assertIncludes(operatorMenu, "> 6. Relatórios", "Operador vê relatórios");
    assertIncludes((await sendMessage(OPERATOR_PHONE, "1")).text, "Essa opção não está disponível", "Operador não acessa eventos por número");
    assertIncludes((await sendMessage(OPERATOR_PHONE, "evento")).text, "Essa opção não está disponível", "Operador não acessa eventos por palavra");
    assertIncludes((await sendMessage(OPERATOR_PHONE, "4")).text, "Essa opção não está disponível", "Operador não acessa portaria por número");
    assertIncludes((await sendMessage(OPERATOR_PHONE, "portaria")).text, "Essa opção não está disponível", "Operador não acessa portaria por palavra");
    assertIncludes((await sendMessage(OPERATOR_PHONE, "cortesia")).text, "CORTESIAS", "Operador acessa cortesias");
    assertIncludes((await sendMessage(OPERATOR_PHONE, "relatorio")).text, "RELATÓRIOS", "Operador acessa relatórios");

    const gatePrompt = await sendMessage(VALIDATOR_PHONE, "Portaria");
    assertIncludes(gatePrompt.text, "PALAVRA CHAVE DA PORTARIA", "Portaria externa por gate_accesses continua sem admin_user gate");

    const buyerSearch = await sendMessage(BUYER_PHONE, `${PREFIX} Artista`);
    assertIncludes(buyerSearch.text, `${PREFIX} EVENTO`, "busca/compra de cliente comum não foi afetada");

    await cleanup();
    await verifyCleanup();
  } finally {
    if (nextChild) await stopChild(nextChild);
    if (zapiServer) await new Promise((resolve) => zapiServer.close(resolve));
  }
}

main().catch(async (error) => {
  console.error(error);
  await cleanup().catch((cleanupError) => console.error("cleanup failed", cleanupError));
  process.exit(1);
});
