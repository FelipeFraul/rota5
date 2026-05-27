import { createServer } from "node:http";
import { spawn } from "node:child_process";
import { pbkdf2Sync, randomBytes } from "node:crypto";
import { readFileSync, rmSync, writeFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

const PREFIX = "TEST_ADMIN_TOKENIZED_LOGIN";
const PORT = 3373;
const ZAPI_PORT = 4603;
const APP_BASE_URL = `http://127.0.0.1:${PORT}`;
const ZAPI_BASE_URL = `http://127.0.0.1:${ZAPI_PORT}`;
const WEBHOOK_URL = `${APP_BASE_URL}/api/webhook/zapi`;
const ROOT_PHONE = "559981399201";
const COMMON_PHONE = "559981399202";
const SOURCE_IP = "203.0.113.201";
const RUN_SECRET = randomBytes(8).toString("hex");
const PASS = `token-login-pass-${RUN_SECRET}`;
const WRONG_PASS = `token-login-wrong-${RUN_SECRET}`;
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
  TICKET_RESERVATION_TTL_MINUTES: "10",
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
  const phones = [ROOT_PHONE, COMMON_PHONE];
  const { data: admins } = await service.from("admin_users").select("id").in("phone", phones);
  const adminIds = (admins ?? []).map((admin) => admin.id);
  if (adminIds.length) {
    await service.from("admin_login_challenges").delete().in("admin_user_id", adminIds);
    await service.from("admin_sessions").delete().in("admin_user_id", adminIds);
    await service.from("admin_users").delete().in("id", adminIds);
  }
  await service.from("admin_auth_attempts").delete().in("phone", phones);

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
  return dbInsert("admin_users", {
    phone: ROOT_PHONE,
    role: "root",
    status: "active",
    name: `${PREFIX} Diretor`,
    passphrase_hash: hashPassphrase(PASS),
    created_by_admin_phone: ROOT_PHONE,
  });
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

function extractAdminLoginUrl(text) {
  const match = text.match(/https?:\/\/\S+\/admin\/login\/[a-f0-9]+/i);
  if (!match) throw new Error(`admin login URL not found in: ${text}`);
  return match[0];
}

async function getRootMessages() {
  const { data: customer, error: customerError } = await service
    .from("customers")
    .select("id")
    .eq("whatsapp_phone", ROOT_PHONE)
    .single();
  if (customerError) throw customerError;
  const { data: conversation, error: conversationError } = await service
    .from("conversations")
    .select("id")
    .eq("customer_id", customer.id)
    .single();
  if (conversationError) throw conversationError;
  const { data, error } = await service
    .from("whatsapp_messages")
    .select("direction, body, raw_metadata")
    .eq("conversation_id", conversation.id)
    .order("created_at", { ascending: true });
  if (error) throw error;
  return data ?? [];
}

async function verifyNoSecretPersistence({ loginUrl, code }) {
  const messages = await getRootMessages();
  const persisted = JSON.stringify(messages);
  assertNotIncludes(persisted, PASS, "senha correta não persiste em whatsapp_messages");
  assertNotIncludes(persisted, WRONG_PASS, "senha errada não persiste em whatsapp_messages");
  assertNotIncludes(persisted, loginUrl, "link bruto não persiste em whatsapp_messages");
  assertIncludes(persisted, "[ADMIN_LOGIN_LINK_REDACTED]", "link persiste redigido");
  assertIncludes(persisted, "[ADMIN_AUTH_REDACTED]", "código de retorno persiste redigido");
  assertNotIncludes(persisted, code, "código bruto não persiste em whatsapp_messages");

  const { data: challenges, error } = await service
    .from("admin_login_challenges")
    .select("link_token_hash, return_code_hash, source_hash, status")
    .eq("phone", ROOT_PHONE);
  if (error) throw error;
  assert((challenges ?? []).length >= 1, "challenge foi registrado");
  assert(
    (challenges ?? []).every((challenge) => challenge.link_token_hash.length === 64),
    "token do link salvo só como SHA-256",
  );
  assert(
    (challenges ?? []).some((challenge) => challenge.return_code_hash?.length === 64),
    "código salvo só como SHA-256",
  );
  assert(
    (challenges ?? []).some((challenge) => challenge.source_hash?.length === 64),
    "IP/origem salvo só como SHA-256",
  );
}

async function verifyCleanup() {
  const phones = [ROOT_PHONE, COMMON_PHONE];
  const results = await Promise.all([
    service.from("admin_login_challenges").select("phone", { count: "exact", head: true }).in("phone", phones),
    service.from("admin_auth_attempts").select("phone", { count: "exact", head: true }).in("phone", phones),
    service.from("admin_users").select("id", { count: "exact", head: true }).in("phone", phones),
    service.from("customers").select("id", { count: "exact", head: true }).in("whatsapp_phone", phones),
  ]);
  results.forEach(({ count, error }, index) => {
    if (error) throw error;
    assert((count ?? 0) === 0, `cleanup ${index + 1} vazio`, `restaram ${count}`);
  });
}

async function main() {
  await cleanup();
  const rootId = await seedData();
  writeTemporaryNextEnv();
  let zapiServer;
  let nextChild;
  try {
    zapiServer = await startZapiMock();
    nextChild = await startNextDev();

    const tableCheck = await service
      .from("admin_login_challenges")
      .select("id", { count: "exact", head: true })
      .limit(1);
    assert(!tableCheck.error, "admin_login_challenges existe no Supabase real");

    let response = await sendMessage(ROOT_PHONE, "admin");
    assertIncludes(response.text, "LOGIN ADMINISTRATIVO", "admin recebe login tokenizado");
    assertIncludes(response.text, "/admin/login/", "admin recebe link temporário");
    const loginUrl = extractAdminLoginUrl(response.text);

    const pageResponse = await fetch(loginUrl);
    assert(pageResponse.ok, "página de login temporário abre");
    assertIncludes(await pageResponse.text(), "Informe sua senha individual", "página pede senha individual");

    const wrongResponse = await fetch(`${APP_BASE_URL}/api/admin/login/verify`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-forwarded-for": SOURCE_IP,
      },
      body: JSON.stringify({ token: loginUrl.split("/").pop(), passphrase: WRONG_PASS }),
    });
    assert(wrongResponse.status === 401, "senha errada no web login não autentica");

    const verifyResponse = await fetch(`${APP_BASE_URL}/api/admin/login/verify`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-forwarded-for": SOURCE_IP,
      },
      body: JSON.stringify({ token: loginUrl.split("/").pop(), passphrase: PASS }),
    });
    const verifyBody = await verifyResponse.json();
    assert(verifyResponse.ok, "senha correta no web login gera código");
    assert(/^\d{6}$/.test(verifyBody.code), "código tem 6 dígitos");

    response = await sendMessage(ROOT_PHONE, "000000");
    assertIncludes(response.text, "Código inválido", "código errado não cria sessão");
    assertNotIncludes(response.text, "MENU ADMIN", "código errado não abre menu");

    response = await sendMessage(ROOT_PHONE, verifyBody.code);
    assertIncludes(response.text, "MENU ADMIN", "código correto abre menu admin");
    assertIncludes(response.text, "Diretor", "perfil Diretor preservado");

    const { data: session, error: sessionError } = await service
      .from("admin_sessions")
      .select("id, status")
      .eq("admin_user_id", rootId)
      .eq("status", "active")
      .single();
    if (sessionError) throw sessionError;
    assert(Boolean(session?.id), "sessão admin criada só após código correto");

    const { data: consumed, error: consumedError } = await service
      .from("admin_login_challenges")
      .select("status")
      .eq("phone", ROOT_PHONE)
      .order("created_at", { ascending: false })
      .limit(1)
      .single();
    if (consumedError) throw consumedError;
    assert(consumed.status === "consumed", "challenge fica consumido após uso");

    await verifyNoSecretPersistence({ loginUrl, code: verifyBody.code });

    response = await sendMessage(COMMON_PHONE, "admin");
    assertIncludes(response.text, "Não consegui entender", "cliente comum não entra no admin");
    assertNotIncludes(response.text, "/admin/login/", "cliente comum não recebe link admin");
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
