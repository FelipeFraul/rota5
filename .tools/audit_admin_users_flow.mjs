import { createServer } from "node:http";
import { spawn } from "node:child_process";
import { pbkdf2Sync, randomBytes } from "node:crypto";
import { readFileSync, rmSync, writeFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

const PREFIX = "TEST_ADMIN_USERS_FLOW";
const PORT = 3364;
const ZAPI_PORT = 4594;
const APP_BASE_URL = `http://127.0.0.1:${PORT}`;
const ZAPI_BASE_URL = `http://127.0.0.1:${ZAPI_PORT}`;
const WEBHOOK_URL = `${APP_BASE_URL}/api/webhook/zapi`;
const ROOT_PHONE = "559980001001";
const MANAGER_PHONE = "559980001002";
const OPERATOR_PHONE = "559980001003";
const COMMON_PHONE = "559980001004";
const NEW_MANAGER_PHONE = "559980001005";
const NEW_OPERATOR_PHONE = "559980001006";
const NEW_ROOT_PHONE = "559980001007";
const DISABLED_PHONE = "559980001008";
const NO_HASH_PHONE = "559980001009";
const WRONG_PASS_PHONE = "559980001010";
const RUN_SECRET = randomBytes(8).toString("hex");
const PASS = `admin-users-audit-pass-${RUN_SECRET}`;
const NEW_MANAGER_PASS = `admin-users-audit-manager-pass-${RUN_SECRET}`;
const NEW_OPERATOR_PASS = `admin-users-audit-operator-pass-${RUN_SECRET}`;
const NEW_ROOT_PASS = `admin-users-audit-root-pass-${RUN_SECRET}`;
const DISABLED_REACTIVATE_PASS = `admin-users-audit-reactivate-pass-${RUN_SECRET}`;
const DUPLICATE_PASS = `admin-users-audit-duplicate-pass-${RUN_SECRET}`;
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
  const phones = [
    ROOT_PHONE,
    MANAGER_PHONE,
    OPERATOR_PHONE,
    COMMON_PHONE,
    NEW_MANAGER_PHONE,
    NEW_OPERATOR_PHONE,
    NEW_ROOT_PHONE,
    DISABLED_PHONE,
    NO_HASH_PHONE,
    WRONG_PASS_PHONE,
  ];

  const { data: admins } = await service.from("admin_users").select("id").in("phone", phones);
  const adminIds = (admins ?? []).map((admin) => admin.id);
  if (adminIds.length) await service.from("admin_sessions").delete().in("admin_user_id", adminIds);
  if (adminIds.length) await service.from("admin_users").delete().in("id", adminIds);

  const { data: customers } = await service.from("customers").select("id").in("whatsapp_phone", phones);
  const customerIds = (customers ?? []).map((customer) => customer.id);
  const conversationIds = await dbSelectIds("conversations", "customer_id", customerIds);
  if (conversationIds.length) await service.from("whatsapp_messages").delete().in("conversation_id", conversationIds);
  if (conversationIds.length) await service.from("conversations").delete().in("id", conversationIds);
  if (customerIds.length) await service.from("customers").delete().in("id", customerIds);

  const { data: events } = await service.from("events").select("id, venue_id").ilike("title", `${PREFIX}%`);
  const eventIds = (events ?? []).map((event) => event.id);
  const venueIdsFromEvents = (events ?? []).map((event) => event.venue_id).filter(Boolean);
  const { data: venues } = await service.from("venues").select("id").ilike("name", `${PREFIX}%`);
  const venueIds = Array.from(new Set([...(venues ?? []).map((venue) => venue.id), ...venueIdsFromEvents]));
  const sessionIds = await dbSelectIds("event_sessions", "event_id", eventIds);
  const sectionIds = await dbSelectIds("venue_sections", "venue_id", venueIds);
  const seatIds = await dbSelectIds("seats", "section_id", sectionIds);
  const sessionSeatIds = await dbSelectIds("session_seats", "session_id", sessionIds);
  if (sessionSeatIds.length) await service.from("session_seats").delete().in("id", sessionSeatIds);
  if (sessionIds.length) await service.from("ticket_prices").delete().in("session_id", sessionIds);
  if (seatIds.length) await service.from("seats").delete().in("id", seatIds);
  if (sectionIds.length) await service.from("venue_sections").delete().in("id", sectionIds);
  if (sessionIds.length) await service.from("event_sessions").delete().in("id", sessionIds);
  if (eventIds.length) await service.from("events").delete().in("id", eventIds);
  if (venueIds.length) await service.from("venues").delete().in("id", venueIds);
}

async function verifyCleanup() {
  const phones = [
    ROOT_PHONE,
    MANAGER_PHONE,
    OPERATOR_PHONE,
    COMMON_PHONE,
    NEW_MANAGER_PHONE,
    NEW_OPERATOR_PHONE,
    NEW_ROOT_PHONE,
    DISABLED_PHONE,
    NO_HASH_PHONE,
    WRONG_PASS_PHONE,
  ];
  const checks = [
    service.from("admin_users").select("id", { count: "exact", head: true }).in("phone", phones),
    service.from("customers").select("id", { count: "exact", head: true }).in("whatsapp_phone", phones),
    service.from("events").select("id", { count: "exact", head: true }).ilike("title", `${PREFIX}%`),
    service.from("venues").select("id", { count: "exact", head: true }).ilike("name", `${PREFIX}%`),
  ];
  const results = await Promise.all(checks);
  results.forEach(({ count, error }, index) => {
    if (error) throw error;
    assert((count ?? 0) === 0, `W) cleanup ${index + 1} vazio`, `restaram ${count}`);
  });
}

async function seedData() {
  const passphraseHash = hashPassphrase(PASS);
  const rootId = await dbInsert("admin_users", {
    phone: ROOT_PHONE,
    role: "root",
    status: "active",
    name: `${PREFIX} Diretor`,
    passphrase_hash: passphraseHash,
  });
  await dbInsert("admin_users", {
    phone: MANAGER_PHONE,
    role: "admin",
    status: "active",
    name: `${PREFIX} Gerente`,
    passphrase_hash: passphraseHash,
  });
  await dbInsert("admin_users", {
    phone: OPERATOR_PHONE,
    role: "operator",
    status: "active",
    name: `${PREFIX} Operador`,
    passphrase_hash: passphraseHash,
  });
  const disabledId = await dbInsert("admin_users", {
    phone: DISABLED_PHONE,
    role: "operator",
    status: "disabled",
    name: `${PREFIX} Disabled`,
    passphrase_hash: passphraseHash,
  });
  await dbInsert("admin_users", {
    phone: WRONG_PASS_PHONE,
    role: "admin",
    status: "active",
    name: `${PREFIX} Senha Errada`,
    passphrase_hash: passphraseHash,
  });

  const venueId = await dbInsert("venues", {
    name: `${PREFIX} Venue`,
    city: "Sorocaba",
    state: "SP",
    status: "active",
  });
  const sectionId = await dbInsert("venue_sections", {
    venue_id: venueId,
    name: `${PREFIX} Setor`,
    slug: `${PREFIX.toLowerCase().replaceAll("_", "-")}-setor`,
    capacity: 1,
    has_numbered_seats: false,
    status: "active",
  });
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
    starts_at: "2026-09-26T23:00:00.000Z",
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
    row_label: null,
    seat_number: "1",
    seat_code: `${PREFIX}-G1`,
    status: "active",
  });
  await dbInsert("session_seats", {
    session_id: sessionId,
    section_id: sectionId,
    seat_id: seatId,
    status: "available",
  });

  seed = { rootId, disabledId };
}

function writeTemporaryNextEnv() {
  const lines = Object.entries(testEnv)
    .filter(([key]) => /^[A-Z0-9_]+$/.test(key))
    .map(([key, value]) => `${key}=${JSON.stringify(String(value))}`)
    .join("\n");
  writeFileSync(TEMP_ENV_FILE, `${lines}\n`);
}

function removeTemporaryNextEnv() {
  rmSync(TEMP_ENV_FILE, { force: true });
}

async function startZapiMock() {
  return new Promise((resolve) => {
    const server = createServer((request, response) => {
      let body = "";
      request.on("data", (chunk) => {
        body += chunk;
      });
      request.on("end", () => {
        const parsed = body ? JSON.parse(body) : {};
        zapiMessages.push({
          id: `zapi-${++zapiCounter}`,
          path: request.url,
          phone: parsed.phone,
          message: parsed.message ?? parsed.caption ?? "",
          url: request.url,
        });
        response.writeHead(200, { "content-type": "application/json" });
        response.end(JSON.stringify({ id: `zapi-${zapiCounter}` }));
      });
    });
    server.listen(ZAPI_PORT, "127.0.0.1", () => resolve(server));
  });
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
  const child = spawn("npm", ["run", "dev", "--", "--hostname", "127.0.0.1", "--port", String(PORT)], {
    cwd: process.cwd(),
    env: testEnv,
    stdio: ["ignore", "pipe", "pipe"],
  });
  child.stdout.on("data", (chunk) => process.stdout.write(`[next] ${chunk}`));
  child.stderr.on("data", (chunk) => process.stderr.write(`[next] ${chunk}`));
  await waitForHealth();
  return child;
}

async function stopChild(child) {
  if (!child || child.killed) return;
  child.kill("SIGTERM");
  await new Promise((resolve) => child.once("exit", resolve));
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
      fromMe: false,
      messageId: providerMessageId(),
      text: { message: text },
    }),
  });
  const body = await response.json().catch(() => ({}));
  assert(response.ok, `webhook accepted "${text}"`, JSON.stringify(body));
  const messages = zapiMessages.slice(start);
  assert(messages.length > 0, `Z-API mock recebeu resposta para "${text}"`);
  return { messages, text: messages.map((message) => message.message).join("\n---\n") };
}

async function login(phone, label, passphrase = PASS) {
  assertIncludes((await sendMessage(phone, "admin")).text, "palavra-chave", `${label} pede senha`);
  const response = await sendMessage(phone, passphrase);
  assertIncludes(response.text, "MENU ADMIN", `${label} abre menu`);
  return response;
}

async function loginFails(phone, passphrase, expectedText, label) {
  assertIncludes((await sendMessage(phone, "admin")).text, "palavra-chave", `${label} pede senha`);
  const response = await sendMessage(phone, passphrase);
  assertIncludes(response.text, expectedText, label);
  assertNotIncludes(response.text, "MENU ADMIN", `${label} não abre menu`);
  return response;
}

async function addAdmin(phone, name, roleOption, expectedLabel, label, passphrase) {
  await sendMessage(ROOT_PHONE, "administradores");
  let response = await sendMessage(ROOT_PHONE, "2");
  assertIncludes(response.text, "QUAL TELEFONE", `${label} pede telefone`);
  response = await sendMessage(ROOT_PHONE, phone);
  assertIncludes(response.text, "QUAL O NOME", `${label} pede nome`);
  response = await sendMessage(ROOT_PHONE, name);
  assertIncludes(response.text, "QUAL NÍVEL", `${label} pede perfil`);
  response = await sendMessage(ROOT_PHONE, String(roleOption));
  assertIncludes(response.text, "PALAVRA-CHAVE", `${label} pede senha individual`);
  response = await sendMessage(ROOT_PHONE, passphrase);
  assertIncludes(response.text, "CONFIRMAR NOVO ADMINISTRADOR", `${label} pede confirmação`);
  assertNotIncludes(response.text, passphrase, `${label} confirmação não ecoa senha`);
  response = await sendMessage(ROOT_PHONE, "CONFIRMAR ADMIN");
  assertIncludes(response.text, "ADMINISTRADOR ADICIONADO", `${label} adiciona`);
  assertIncludes(response.text, expectedLabel, `${label} mostra perfil`);
}

async function assertAdminPassphraseProtected(phone, passphrase, label) {
  const { data, error } = await service
    .from("admin_users")
    .select("passphrase_hash")
    .eq("phone", phone)
    .single();
  if (error) throw error;
  assert(data.passphrase_hash?.startsWith("pbkdf2_sha256$"), `${label} senha salva como PBKDF2`);
  assert(!data.passphrase_hash.includes(passphrase), `${label} senha não salva em texto puro`);

  const { data: leakedMessages, error: leakedError } = await service
    .from("whatsapp_messages")
    .select("id")
    .eq("body", passphrase);
  if (leakedError) throw leakedError;
  assert((leakedMessages ?? []).length === 0, `${label} senha não fica no histórico de mensagens`);
}

async function assertActiveAdminWithoutHashRejected() {
  const activeAttempt = await service.from("admin_users").insert({
    phone: NO_HASH_PHONE,
    role: "admin",
    status: "active",
    name: `${PREFIX} Sem Hash`,
    passphrase_hash: null,
  });
  assert(Boolean(activeAttempt.error), "C/D) banco bloqueia admin active sem passphrase_hash");

  const disabledId = await dbInsert("admin_users", {
    phone: NO_HASH_PHONE,
    role: "admin",
    status: "disabled",
    name: `${PREFIX} Sem Hash Disabled`,
    passphrase_hash: null,
  });
  const activateAttempt = await service
    .from("admin_users")
    .update({ status: "active" })
    .eq("id", disabledId);
  assert(Boolean(activateAttempt.error), "C/D) banco bloqueia ativar admin sem passphrase_hash");
}

async function main() {
  await cleanup();
  await seedData();
  writeTemporaryNextEnv();
  let zapiServer;
  let nextChild;
  try {
    zapiServer = await startZapiMock();
    nextChild = await startNextDev();

    let response = await login(ROOT_PHONE, "A) Diretor");
    assertIncludes(response.text, "Administradores", "A) Diretor acessa menu Administradores");
    response = await login(MANAGER_PHONE, "B/C) Gerente");
    assertNotIncludes(response.text, "Administradores", "B) Gerente não vê Administradores");
    assertIncludes((await sendMessage(MANAGER_PHONE, "administradores")).text, "Essa opção não está disponível", "C) Gerente bloqueado por palavra");
    await loginFails(WRONG_PASS_PHONE, "senha-incorreta", "Palavra-chave inválida", "B) senha errada bloqueia");
    await assertActiveAdminWithoutHashRejected();
    assertIncludes((await sendMessage(DISABLED_PHONE, "admin")).text, "Não consegui entender", "E) admin desativado não inicia login");
    response = await login(OPERATOR_PHONE, "D) Operador");
    assertNotIncludes(response.text, "Administradores", "D) Operador não vê Administradores");
    assertIncludes((await sendMessage(OPERATOR_PHONE, "administradores")).text, "Essa opção não está disponível", "D) Operador bloqueado");

    response = await sendMessage(ROOT_PHONE, "administradores");
    assertIncludes(response.text, "ADMINISTRADORES", "A) abre submenu");
    response = await sendMessage(ROOT_PHONE, "1");
    assertIncludes(response.text, "Perfil: Diretor", "E) lista perfil em português");
    assertIncludes(response.text, "Telefone: ****1001", "E) lista telefone mascarado");
    assertNotIncludes(response.text, seed.rootId, "E) lista não expõe id");
    assertNotIncludes(response.text, "hash", "E) lista não expõe hash");

    await addAdmin(NEW_MANAGER_PHONE, `${PREFIX} Novo Gerente`, 2, "Gerente", "F)", NEW_MANAGER_PASS);
    let { data: newManager } = await service
      .from("admin_users")
      .select("id, role, status, passphrase_hash")
      .eq("phone", NEW_MANAGER_PHONE)
      .single();
    assert(newManager.role === "admin" && newManager.status === "active", "F) Gerente criado como role admin");
    await assertAdminPassphraseProtected(NEW_MANAGER_PHONE, NEW_MANAGER_PASS, "F) Gerente");
    response = await login(NEW_MANAGER_PHONE, "F) Gerente novo", NEW_MANAGER_PASS);
    assertNotIncludes(response.text, "Administradores", "F) Gerente novo respeita permissões");

    await addAdmin(NEW_OPERATOR_PHONE, `${PREFIX} Novo Operador`, 3, "Operador", "G)", NEW_OPERATOR_PASS);
    let { data: newOperator } = await service
      .from("admin_users")
      .select("id, role, status")
      .eq("phone", NEW_OPERATOR_PHONE)
      .single();
    assert(newOperator.role === "operator" && newOperator.status === "active", "G) Operador criado como role operator");
    await assertAdminPassphraseProtected(NEW_OPERATOR_PHONE, NEW_OPERATOR_PASS, "G) Operador");

    await addAdmin(NEW_ROOT_PHONE, `${PREFIX} Novo Diretor`, 1, "Diretor", "H)", NEW_ROOT_PASS);
    const { data: newRoot } = await service
      .from("admin_users")
      .select("id, role, status")
      .eq("phone", NEW_ROOT_PHONE)
      .single();
    assert(newRoot.role === "root" && newRoot.status === "active", "H) Diretor criado como role root");
    await assertAdminPassphraseProtected(NEW_ROOT_PHONE, NEW_ROOT_PASS, "H) Diretor");

    await sendMessage(ROOT_PHONE, "administradores");
    await sendMessage(ROOT_PHONE, "2");
    await sendMessage(ROOT_PHONE, NEW_MANAGER_PHONE);
    await sendMessage(ROOT_PHONE, "Duplicado");
    await sendMessage(ROOT_PHONE, "2");
    await sendMessage(ROOT_PHONE, DUPLICATE_PASS);
    response = await sendMessage(ROOT_PHONE, "CONFIRMAR ADMIN");
    assertIncludes(response.text, "já possui administrador ativo", "I) telefone ativo duplicado bloqueia");

    await sendMessage(ROOT_PHONE, "administradores");
    await sendMessage(ROOT_PHONE, "2");
    await sendMessage(ROOT_PHONE, DISABLED_PHONE);
    await sendMessage(ROOT_PHONE, `${PREFIX} Reativado`);
    await sendMessage(ROOT_PHONE, "2");
    response = await sendMessage(ROOT_PHONE, DISABLED_REACTIVATE_PASS);
    assertIncludes(response.text, "CONFIRMAR", "J) reativação pede confirmação após senha");
    response = await sendMessage(ROOT_PHONE, "CONFIRMAR ADMIN");
    assertIncludes(response.text, "REATIVAR ADMINISTRADOR", "J) telefone disabled pede reativação");
    assertNotIncludes(response.text, DISABLED_REACTIVATE_PASS, "J) reativação não ecoa senha");
    response = await sendMessage(ROOT_PHONE, "REATIVAR ADMIN");
    assertIncludes(response.text, "ADMINISTRADOR REATIVADO", "J) telefone disabled reativado");
    const { data: reactivated } = await service
      .from("admin_users")
      .select("status, role, passphrase_hash")
      .eq("phone", DISABLED_PHONE)
      .single();
    assert(reactivated.status === "active" && reactivated.role === "admin", "J) reativação atualiza status e perfil");
    await assertAdminPassphraseProtected(DISABLED_PHONE, DISABLED_REACTIVATE_PASS, "J) Reativado");

    const activeSessionId = await dbInsert("admin_sessions", {
      admin_user_id: newOperator.id,
      phone: NEW_OPERATOR_PHONE,
      status: "active",
      expires_at: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
    });
    await sendMessage(ROOT_PHONE, "administradores");
    response = await sendMessage(ROOT_PHONE, "3");
    response = await sendMessage(ROOT_PHONE, NEW_OPERATOR_PHONE);
    assertIncludes(response.text, "NOVO NÍVEL", "K) alterar nível pede novo nível");
    response = await sendMessage(ROOT_PHONE, "2");
    assertIncludes(response.text, "ALTERAR NÍVEL", "K) alterar nível exige confirmação");
    response = await sendMessage(ROOT_PHONE, "texto errado");
    assertIncludes(response.text, "Digite ALTERAR NÍVEL", "K) texto errado não altera");
    response = await sendMessage(ROOT_PHONE, "ALTERAR NÍVEL");
    assertIncludes(response.text, "NÍVEL DE ADMINISTRADOR ATUALIZADO", "K) alterar nível confirma");
    const { data: updatedOperator } = await service
      .from("admin_users")
      .select("role")
      .eq("phone", NEW_OPERATOR_PHONE)
      .single();
    assert(updatedOperator.role === "admin", "K) nível alterado no banco");
    const { data: revokedSession } = await service
      .from("admin_sessions")
      .select("status")
      .eq("id", activeSessionId)
      .single();
    assert(revokedSession.status === "revoked", "L) alterar nível revoga sessões ativas");

    await sendMessage(ROOT_PHONE, "administradores");
    await sendMessage(ROOT_PHONE, "3");
    await sendMessage(ROOT_PHONE, ROOT_PHONE);
    await sendMessage(ROOT_PHONE, "2");
    response = await sendMessage(ROOT_PHONE, "ALTERAR NÍVEL");
    assertIncludes(response.text, "Não é permitido rebaixar", "N) bloqueia auto-rebaixamento do Diretor");

    const { error: invalidRoleError } = await service.from("admin_users").insert({
      phone: "559980009999",
      role: "gate",
      status: "active",
      name: `${PREFIX} Gate`,
    });
    assert(invalidRoleError, "M) banco não permite role gate/support");

    await sendMessage(ROOT_PHONE, "administradores");
    response = await sendMessage(ROOT_PHONE, "4");
    response = await sendMessage(ROOT_PHONE, NEW_MANAGER_PHONE);
    assertIncludes(response.text, "DESATIVAR ADMINISTRADOR", "P) desativar exige confirmação");
    response = await sendMessage(ROOT_PHONE, "texto errado");
    assertIncludes(response.text, "Digite DESATIVAR ADMIN", "P) texto errado não desativa");
    response = await sendMessage(ROOT_PHONE, "DESATIVAR ADMIN");
    assertIncludes(response.text, "ADMINISTRADOR DESATIVADO", "Q) desativa com confirmação");
    const { data: disabledManager } = await service
      .from("admin_users")
      .select("id, status")
      .eq("phone", NEW_MANAGER_PHONE)
      .single();
    assert(disabledManager.status === "disabled", "Q) status disabled no banco");
    assert(disabledManager.id === newManager.id, "R) não apaga admin_user");

    await sendMessage(ROOT_PHONE, "administradores");
    await sendMessage(ROOT_PHONE, "2");
    await sendMessage(ROOT_PHONE, "559980001099");
    response = await sendMessage(ROOT_PHONE, "cancelar");
    assertIncludes(response.text, "ADMINISTRADORES", "S) Cancelar volta ao menu sem gravar");
    const { count: cancelledCount } = await service
      .from("admin_users")
      .select("id", { count: "exact", head: true })
      .eq("phone", "559980001099");
    assert((cancelledCount ?? 0) === 0, "S) Cancelar não grava admin");

    response = await sendMessage(ROOT_PHONE, "voltar");
    assertIncludes(response.text, "MENU ADMIN", "T) Voltar funciona");
    await sendMessage(ROOT_PHONE, "administradores");
    response = await sendMessage(ROOT_PHONE, "7");
    assertIncludes(response.text, "Sessão administrativa encerrada", "T) Sair por número encerra sessão");

    response = await sendMessage(COMMON_PHONE, "administradores");
    assertIncludes(response.text, "Não encontrei eventos", "U) cliente comum não acessa Administradores");
    response = await sendMessage(COMMON_PHONE, PREFIX);
    assertIncludes(response.text, PREFIX, "V) busca comum de cliente continua funcionando");
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
