import { createServer } from "node:http";
import { spawn } from "node:child_process";
import { pbkdf2Sync, randomBytes } from "node:crypto";
import { readFileSync, rmSync, writeFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

const PREFIX = "TEST_ADMIN_LOGIN_LOCKOUT";
const PORT = 3371;
const ZAPI_PORT = 4599;
const APP_BASE_URL = `http://127.0.0.1:${PORT}`;
const ZAPI_BASE_URL = `http://127.0.0.1:${ZAPI_PORT}`;
const WEBHOOK_URL = `${APP_BASE_URL}/api/webhook/zapi`;
const ROOT_PHONE = "559981399101";
const TARGET_PHONE = "559981399102";
const MANAGER_PHONE = "559981399103";
const OPERATOR_PHONE = "559981399104";
const COMMON_PHONE = "559981399105";
const RUN_SECRET = randomBytes(8).toString("hex");
const PASS = `lockout-pass-${RUN_SECRET}`;
const WRONG_PASS = `wrong-pass-${RUN_SECRET}`;
const SOURCE_IP = "203.0.113.77";
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

async function cleanup() {
  const phones = [ROOT_PHONE, TARGET_PHONE, MANAGER_PHONE, OPERATOR_PHONE, COMMON_PHONE];
  await service.from("admin_auth_attempts").delete().in("phone", phones);
  const { data: admins } = await service.from("admin_users").select("id").in("phone", phones);
  const adminIds = (admins ?? []).map((admin) => admin.id);
  if (adminIds.length) await service.from("admin_sessions").delete().in("admin_user_id", adminIds);
  if (adminIds.length) await service.from("admin_users").delete().in("id", adminIds);

  const { data: customers } = await service.from("customers").select("id").in("whatsapp_phone", phones);
  const customerIds = (customers ?? []).map((customer) => customer.id);
  if (customerIds.length) {
    const { data: conversations } = await service.from("conversations").select("id").in("customer_id", customerIds);
    const conversationIds = (conversations ?? []).map((conversation) => conversation.id);
    if (conversationIds.length) await service.from("whatsapp_messages").delete().in("conversation_id", conversationIds);
    if (conversationIds.length) await service.from("conversations").delete().in("id", conversationIds);
    await service.from("customers").delete().in("id", customerIds);
  }
}

async function seedData() {
  const rootId = await dbInsert("admin_users", {
    phone: ROOT_PHONE,
    role: "root",
    status: "active",
    name: `${PREFIX} Diretor`,
    passphrase_hash: hashPassphrase(PASS),
  });
  await dbInsert("admin_users", {
    phone: TARGET_PHONE,
    role: "admin",
    status: "active",
    name: `${PREFIX} Bloqueado`,
    passphrase_hash: hashPassphrase(PASS),
    created_by_admin_phone: ROOT_PHONE,
  });
  await dbInsert("admin_users", {
    phone: MANAGER_PHONE,
    role: "admin",
    status: "active",
    name: `${PREFIX} Gerente`,
    passphrase_hash: hashPassphrase(PASS),
    created_by_admin_phone: ROOT_PHONE,
  });
  await dbInsert("admin_users", {
    phone: OPERATOR_PHONE,
    role: "operator",
    status: "active",
    name: `${PREFIX} Operador`,
    passphrase_hash: hashPassphrase(PASS),
    created_by_admin_phone: ROOT_PHONE,
  });
  return { rootId };
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
      "x-forwarded-for": SOURCE_IP,
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

async function beginAdminLogin(phone) {
  const response = await sendMessage(phone, "admin");
  assertIncludes(response.text, "palavra-chave", `login ${phone.slice(-4)} pede senha`);
}

async function login(phone, label) {
  await beginAdminLogin(phone);
  const response = await sendMessage(phone, PASS);
  assertIncludes(response.text, "MENU ADMIN", `${label} entra com senha correta`);
  return response;
}

async function wrongAttempt(label) {
  const response = await sendMessage(TARGET_PHONE, WRONG_PASS);
  assertNotIncludes(response.text, "MENU ADMIN", `${label} não entra`);
  return response;
}

async function getAttemptRow() {
  const { data, error } = await service
    .from("admin_auth_attempts")
    .select("phone, sequential_failed_attempts, locked_until, hard_locked_at, alert_level, last_source_hash")
    .eq("phone", TARGET_PHONE)
    .single();
  if (error) throw error;
  return data;
}

async function expireTemporaryLock() {
  const { error } = await service
    .from("admin_auth_attempts")
    .update({ locked_until: new Date(Date.now() - 60_000).toISOString() })
    .eq("phone", TARGET_PHONE);
  if (error) throw error;
}

async function verifyNoSensitiveLeak() {
  const { data: messages, error } = await service
    .from("whatsapp_messages")
    .select("body, raw_metadata")
    .in("body", [PASS, WRONG_PASS]);
  if (error) throw error;
  assert((messages ?? []).length === 0, "senha digitada não aparece em whatsapp_messages");

  const { data: redacted, error: redactedError } = await service
    .from("whatsapp_messages")
    .select("body, raw_metadata")
    .eq("body", "[ADMIN_AUTH_REDACTED]");
  if (redactedError) throw redactedError;
  assert((redacted ?? []).length >= 1, "senha digitada salva como [ADMIN_AUTH_REDACTED]");
  assert(
    (redacted ?? []).every((message) => JSON.stringify(message.raw_metadata ?? {}).includes("redacted")),
    "metadata marca redaction sem senha",
  );

  const { data: target, error: targetError } = await service
    .from("admin_users")
    .select("role, status, passphrase_hash")
    .eq("phone", TARGET_PHONE)
    .single();
  if (targetError) throw targetError;
  assert(target.role === "admin", "lockout não muda role");
  assert(target.status === "active", "lockout não desativa admin");
  assert(target.passphrase_hash.startsWith("pbkdf2_sha256$"), "lockout não altera passphrase_hash");
  assert(!target.passphrase_hash.includes(PASS), "hash não contém senha crua");
}

async function verifyCleanup() {
  const phones = [ROOT_PHONE, TARGET_PHONE, MANAGER_PHONE, OPERATOR_PHONE, COMMON_PHONE];
  const checks = [
    service.from("admin_auth_attempts").select("phone", { count: "exact", head: true }).in("phone", phones),
    service.from("admin_users").select("id", { count: "exact", head: true }).in("phone", phones),
    service.from("customers").select("id", { count: "exact", head: true }).in("whatsapp_phone", phones),
  ];
  const results = await Promise.all(checks);
  results.forEach(({ count, error }, index) => {
    if (error) throw error;
    assert((count ?? 0) === 0, `O) cleanup ${index + 1} vazio`, `restaram ${count}`);
  });
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

    await beginAdminLogin(TARGET_PHONE);
    let response = await wrongAttempt("A) tentativa errada 1");
    assertIncludes(response.text, "Palavra-chave inválida", "A) primeira tentativa não bloqueia");
    let row = await getAttemptRow();
    assert(row.sequential_failed_attempts === 1 && !row.locked_until && !row.hard_locked_at, "A) registra 1 tentativa sem bloqueio");

    response = await wrongAttempt("B) tentativa errada 2");
    assertIncludes(response.text, "Palavra-chave inválida", "B) segunda tentativa não bloqueia");
    row = await getAttemptRow();
    assert(row.sequential_failed_attempts === 2 && !row.locked_until && !row.hard_locked_at, "B) registra 2 tentativas sem bloqueio");

    response = await wrongAttempt("C) tentativa errada 3");
    assertIncludes(response.text, "bloqueado por 15 minutos", "C) terceira tentativa bloqueia por 15 minutos");
    row = await getAttemptRow();
    assert(row.sequential_failed_attempts === 3 && row.locked_until && !row.hard_locked_at, "C) registra bloqueio temporário");
    assert(row.last_source_hash?.length === 64 && row.last_source_hash !== SOURCE_IP, "IP/origem salvo apenas como SHA-256");
    assert(
      response.messages.some((message) => message.phone === ROOT_PHONE && message.message.includes("ALERTA DE ACESSO ADMIN")),
      "H) Diretor recebe alerta após tentativas repetidas",
    );

    response = await sendMessage(TARGET_PHONE, PASS);
    assertIncludes(response.text, "bloqueado por", "D) senha correta não entra durante bloqueio temporário");
    assertNotIncludes(response.text, "MENU ADMIN", "D) bloqueio temporário impede menu");

    await expireTemporaryLock();
    response = await sendMessage(TARGET_PHONE, PASS);
    assertIncludes(response.text, "MENU ADMIN", "E) após fim do bloqueio temporário senha correta entra");

    response = await sendMessage(TARGET_PHONE, "sair");
    assertIncludes(response.text, "Sessão administrativa encerrada", "E) encerra sessão antes da sequência hard lock");
    await service.from("admin_sessions").delete().eq("phone", TARGET_PHONE);
    await beginAdminLogin(TARGET_PHONE);
    await wrongAttempt("F) tentativa errada 1");
    await wrongAttempt("F) tentativa errada 2");
    await wrongAttempt("F) tentativa errada 3");
    await expireTemporaryLock();
    await wrongAttempt("F) tentativa errada 4");
    await expireTemporaryLock();
    response = await wrongAttempt("F) tentativa errada 5");
    assertIncludes(response.text, "bloqueado por segurança", "F) quinta tentativa bloqueia até Diretor liberar");
    row = await getAttemptRow();
    assert(row.sequential_failed_attempts === 5 && row.hard_locked_at && !row.locked_until, "F) hard lock registrado");

    response = await sendMessage(TARGET_PHONE, PASS);
    assertIncludes(response.text, "bloqueado por segurança", "G) bloqueio permanente impede senha correta");
    assertNotIncludes(response.text, "MENU ADMIN", "G) bloqueio permanente não abre menu");

    response = await login(ROOT_PHONE, "Diretor");
    assertIncludes(response.text, "Administradores", "I) menu principal mostra Administradores");
    response = await sendMessage(ROOT_PHONE, "administradores");
    assertIncludes(response.text, "Liberar administrador bloqueado", "I) submenu mostra Liberar administrador bloqueado");
    response = await sendMessage(ROOT_PHONE, "5");
    assertIncludes(response.text, "ADMINISTRADORES BLOQUEADOS", "J) lista bloqueados");
    assertIncludes(response.text, "****9102", "J) lista telefone mascarado");
    assertNotIncludes(response.text, TARGET_PHONE, "J) não lista telefone completo");
    response = await sendMessage(ROOT_PHONE, "1");
    assertIncludes(response.text, "LIBERAR ADMIN", "K) liberar exige confirmação");
    response = await sendMessage(ROOT_PHONE, "texto errado");
    assertIncludes(response.text, "Digite LIBERAR ADMIN", "K) texto errado não libera");
    response = await sendMessage(ROOT_PHONE, "LIBERAR ADMIN");
    assertIncludes(response.text, "ADMINISTRADOR LIBERADO", "K) confirmação libera");

    await service.from("admin_sessions").delete().eq("phone", TARGET_PHONE);
    response = await sendMessage(TARGET_PHONE, PASS);
    assertIncludes(response.text, "MENU ADMIN", "L) admin entra após liberação");

    response = await login(MANAGER_PHONE, "M) Gerente");
    assertNotIncludes(response.text, "Administradores", "M) Gerente não vê Administradores");
    response = await sendMessage(MANAGER_PHONE, "administradores");
    assertIncludes(response.text, "Essa opção não está disponível", "M) Gerente não libera admin bloqueado");
    response = await login(OPERATOR_PHONE, "M) Operador");
    assertNotIncludes(response.text, "Administradores", "M) Operador não vê Administradores");
    response = await sendMessage(OPERATOR_PHONE, "administradores");
    assertIncludes(response.text, "Essa opção não está disponível", "M) Operador não libera admin bloqueado");

    response = await sendMessage(COMMON_PHONE, "admin");
    assertNotIncludes(response.text, "palavra-chave", "N) cliente comum não entra no admin");
    assertIncludes(response.text, "Não consegui entender", "N) cliente comum segue fluxo neutro");

    await verifyNoSensitiveLeak();
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
