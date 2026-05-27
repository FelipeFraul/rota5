import { createServer } from "node:http";
import { spawn } from "node:child_process";
import { pbkdf2Sync, randomBytes } from "node:crypto";
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

const PREFIX = "TEST_GATE_ACCESS_FLOW";
const PORT = 3344;
const ZAPI_PORT = 4570;
const APP_BASE_URL = `http://127.0.0.1:${PORT}`;
const ZAPI_BASE_URL = `http://127.0.0.1:${ZAPI_PORT}`;
const WEBHOOK_URL = `${APP_BASE_URL}/api/webhook/zapi`;
const ADMIN_PASS = "portaria-admin-audit";
const GATE_PASS = "senha-portaria-audit";

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
  SEAT_MAP_STORAGE_BUCKET: fileEnv.SEAT_MAP_STORAGE_BUCKET || "seat-maps",
  GATE_ADMIN_SECRET: fileEnv.GATE_ADMIN_SECRET || "audit-gate-admin-secret",
  GATE_SESSION_SECRET:
    fileEnv.GATE_SESSION_SECRET ||
    "audit-gate-session-secret-with-at-least-thirty-two-chars",
  GATE_SESSION_TTL_MINUTES: fileEnv.GATE_SESSION_TTL_MINUTES || "480",
};

for (const key of [
  "SUPABASE_URL",
  "SUPABASE_ANON_KEY",
  "SUPABASE_SERVICE_ROLE_KEY",
  "ZAPI_WEBHOOK_SECRET",
]) {
  if (!testEnv[key]) throw new Error(`Missing required env for audit: ${key}`);
}

const service = createClient(
  testEnv.SUPABASE_URL,
  testEnv.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false } },
);
const anon = createClient(testEnv.SUPABASE_URL, testEnv.SUPABASE_ANON_KEY, {
  auth: { persistSession: false },
});

const zapiMessages = [];
let zapiCounter = 0;
let providerCounter = 1;
let authUserId = null;

function assert(condition, label, details) {
  if (!condition) throw new Error(`${label}${details ? `: ${details}` : ""}`);
  console.log(`ok - ${label}`);
}

function assertIncludes(value, expected, label) {
  assert(
    String(value).includes(expected),
    label,
    `expected ${JSON.stringify(expected)} in ${JSON.stringify(value).slice(0, 700)}`,
  );
}

function assertNotIncludes(value, expected, label) {
  assert(
    !String(value).includes(expected),
    label,
    `did not expect ${JSON.stringify(expected)} in ${JSON.stringify(value).slice(0, 700)}`,
  );
}

function maskPhone(phone) {
  return `****${String(phone).replace(/\D/g, "").slice(-4)}`;
}

function assertNotSensitive(value, label) {
  assertNotIncludes(value, GATE_PASS, `${label} não contém palavra-chave`);
  assertNotIncludes(value, "pbkdf2_sha256", `${label} não contém hash`);
}

function optionForLineContaining(text, expected) {
  const line = String(text)
    .split(/\r?\n/)
    .find((candidate) => candidate.includes(expected));
  const match = line?.match(/>?\s*(\d+)\./);

  if (!match) throw new Error(`option not found for ${expected} in ${text}`);

  return match[1];
}

function hashPassphrase(passphrase) {
  const salt = randomBytes(16).toString("hex");
  const digest = pbkdf2Sync(passphrase, salt, 210_000, 32, "sha256").toString("hex");
  return `pbkdf2_sha256$210000$${salt}$${digest}`;
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
  const { data: events } = await service
    .from("events")
    .select("id, venue_id")
    .ilike("title", `${PREFIX}%`);
  const eventIds = (events ?? []).map((event) => event.id);
  const venueIdsFromEvents = (events ?? []).map((event) => event.venue_id).filter(Boolean);

  const { data: venues } = await service
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

  if (eventIds.length) await service.from("gate_accesses").delete().in("event_id", eventIds);
  if (eventIds.length) await service.from("gate_sessions").delete().in("event_id", eventIds);
  if (sessionSeatIds.length) await service.from("session_seats").delete().in("id", sessionSeatIds);
  if (priceIds.length) await service.from("ticket_prices").delete().in("id", priceIds);
  if (seatIds.length) await service.from("seats").delete().in("id", seatIds);
  if (sectionIds.length) await service.from("venue_sections").delete().in("id", sectionIds);
  if (sessionIds.length) await service.from("event_sessions").delete().in("id", sessionIds);
  if (eventIds.length) await service.from("events").delete().in("id", eventIds);
  if (venueIds.length) await service.from("venues").delete().in("id", venueIds);

  const { data: adminUsers } = await service
    .from("admin_users")
    .select("id")
    .like("phone", "5599400%");
  const adminUserIds = (adminUsers ?? []).map((user) => user.id);
  if (adminUserIds.length) await service.from("admin_sessions").delete().in("admin_user_id", adminUserIds);
  if (adminUserIds.length) await service.from("admin_users").delete().in("id", adminUserIds);

  const { data: customers } = await service
    .from("customers")
    .select("id")
    .like("whatsapp_phone", "5599400%");
  const customerIds = (customers ?? []).map((customer) => customer.id);
  const conversationIds = await dbSelectIds("conversations", "customer_id", customerIds);
  if (conversationIds.length) await service.from("whatsapp_messages").delete().in("conversation_id", conversationIds);
  if (conversationIds.length) await service.from("conversations").delete().in("id", conversationIds);
  if (customerIds.length) await service.from("customers").delete().in("id", customerIds);

  if (authUserId) {
    await service.auth.admin.deleteUser(authUserId).catch(() => undefined);
    authUserId = null;
  }
}

async function verifyCleanup() {
  const checks = [
    service.from("events").select("id", { count: "exact", head: true }).ilike("title", `${PREFIX}%`),
    service.from("venues").select("id", { count: "exact", head: true }).ilike("name", `${PREFIX}%`),
    service.from("customers").select("id", { count: "exact", head: true }).like("whatsapp_phone", "5599400%"),
    service.from("admin_users").select("id", { count: "exact", head: true }).like("phone", "5599400%"),
  ];
  const results = await Promise.all(checks);
  results.forEach(({ count, error }, index) => {
    if (error) throw error;
    assert((count ?? 0) === 0, `cleanup ${index + 1} sem dados temporários`, `restaram ${count}`);
  });
}

async function createCatalog(adminUserId) {
  const venueId = await dbInsert("venues", {
    name: `${PREFIX} Venue`,
    city: "Cidade Gate",
    state: "SP",
    status: "active",
  });
  const sectionId = await dbInsert("venue_sections", {
    venue_id: venueId,
    name: "Entrada",
    slug: `${PREFIX.toLowerCase()}-entrada`,
    has_numbered_seats: false,
    capacity: 100,
    sort_order: 1,
    status: "active",
  });
  const eventId = await dbInsert("events", {
    title: `${PREFIX} Evento`,
    artist_name: `${PREFIX} Artista`,
    city: "Cidade Gate",
    state: "SP",
    venue_id: venueId,
    status: "published",
    created_by_admin_user_id: adminUserId,
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

  const secondEventId = await dbInsert("events", {
    title: `${PREFIX} Segundo Evento`,
    artist_name: `${PREFIX} Artista 2`,
    city: "Cidade Gate",
    state: "SP",
    venue_id: venueId,
    status: "published",
    created_by_admin_user_id: adminUserId,
  });
  const secondSessionId = await dbInsert("event_sessions", {
    event_id: secondEventId,
    venue_id: venueId,
    starts_at: "2026-08-09T16:00:00.000Z",
    status: "sales_open",
  });
  await dbInsert("ticket_prices", {
    session_id: secondSessionId,
    section_id: sectionId,
    ticket_type: "full",
    label: "Inteira",
    price_cents: 1000,
    fee_cents: 0,
    currency: "BRL",
    status: "active",
  });
  return { eventId, sessionId, secondEventId, secondSessionId };
}

async function createAdminUser(phone) {
  return dbInsert("admin_users", {
    phone,
    role: "root",
    status: "active",
    name: `${PREFIX} Admin`,
    passphrase_hash: hashPassphrase(ADMIN_PASS),
    created_by_admin_phone: phone,
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
      image: body.image,
    });
    res.writeHead(200, { "content-type": "application/json" });
    res.end(JSON.stringify({ messageId: `zapi-gate-audit-${zapiCounter}` }));
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

function cookieHeaderFrom(response, cookieName) {
  const rawCookie = response.headers.get("set-cookie") ?? "";
  assertIncludes(rawCookie, `${cookieName}=`, `${cookieName} definido`);
  assertIncludes(rawCookie, "HttpOnly", `${cookieName} HttpOnly`);
  assertIncludes(rawCookie, "Secure", `${cookieName} Secure`);
  assertIncludes(rawCookie, "SameSite=lax", `${cookieName} SameSite`);
  return rawCookie.split(";")[0];
}

function gateSessionIdFromToken(token) {
  const [encodedPayload] = decodeURIComponent(token).split(".");
  const payload = JSON.parse(Buffer.from(encodedPayload, "base64url").toString("utf8"));
  return payload.gid;
}

function extractAdminLoginUrl(text) {
  const match = text.match(/https?:\/\/\S+\/admin\/login\/[a-f0-9]+/i);
  if (!match) throw new Error(`admin login URL not found in: ${text}`);
  return match[0];
}

async function validateGateSessionLink(gateUrl, expectedEventId, expectedEventTitle = PREFIX) {
  const token = gateUrl.match(/\/gate\/session\/([^/\s]+)/)?.[1];
  assert(Boolean(token), "link de check-in contém token");

  const bootstrapResponse = await fetch(`${APP_BASE_URL}/gate/session/${token}`, {
    redirect: "manual",
  });
  assert(
    bootstrapResponse.status >= 300 && bootstrapResponse.status < 400,
    "link temporário redireciona para URL limpa",
  );
  assert(
    bootstrapResponse.headers.get("location")?.endsWith("/gate/session"),
    "redirect limpa token da URL da portaria",
  );
  const gateCookie = cookieHeaderFrom(bootstrapResponse, "gate_session");

  const response = await fetch(`${APP_BASE_URL}/api/gate/session/validate`, {
    method: "POST",
    headers: { cookie: gateCookie },
  });
  const body = await response.json();
  assert(response.ok && body.valid, "link temporário valida na API");
  assertIncludes(body.gateSession.eventTitle, expectedEventTitle, "API da página retorna nome do evento");
  assertNotSensitive(JSON.stringify(body), "payload de validação da página");

  const { data: session, error } = await service
    .from("gate_sessions")
    .select("id, event_id, validator_phone, status")
    .eq("id", gateSessionIdFromToken(token))
    .single();
  if (error) throw error;
  assert(session.event_id === expectedEventId, "gate_session tem event_id preenchido");
  assert(session.status === "active", "gate_session fica active");

  const pageResponse = await fetch(`${APP_BASE_URL}/gate/session`, {
    headers: { cookie: gateCookie },
  });
  const pageHtml = await pageResponse.text();
  assert(pageResponse.ok, "página de portaria abre");
  assertIncludes(pageHtml, expectedEventTitle, "página mostra nome do evento");
  assertNotIncludes(pageHtml, decodeURIComponent(token), "página limpa não expõe token bruto");
  assertNotSensitive(pageHtml, "página de portaria");
  assertNotIncludes(pageHtml, session.validator_phone, "página não mostra telefone completo");

  return session;
}

async function performAdminLogin(phone) {
  const loginPrompt = await sendMessage(phone, "admin");
  assertIncludes(loginPrompt.text, "LOGIN ADMINISTRATIVO", "admin recebe login tokenizado");
  const loginUrl = extractAdminLoginUrl(loginPrompt.text);
  const bootstrapResponse = await fetch(loginUrl, { redirect: "manual" });
  assert(
    bootstrapResponse.status >= 300 && bootstrapResponse.status < 400,
    "link admin redireciona para URL limpa",
  );
  const loginCookie = cookieHeaderFrom(bootstrapResponse, "admin_login_challenge");

  const pageResponse = await fetch(`${APP_BASE_URL}/admin/login`, {
    headers: { cookie: loginCookie },
  });
  assert(pageResponse.ok, "pagina de login admin limpa abre com cookie");
  assertIncludes(await pageResponse.text(), "Informe sua senha individual", "pagina admin pede senha");

  const verifyResponse = await fetch(`${APP_BASE_URL}/api/admin/login/verify`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      cookie: loginCookie,
    },
    body: JSON.stringify({ passphrase: ADMIN_PASS }),
  });
  const verifyBody = await verifyResponse.json();
  assert(verifyResponse.ok && /^\d{6}$/.test(verifyBody.code), "senha admin gera codigo");

  const menu = await sendMessage(phone, verifyBody.code);
  assertIncludes(menu.text, "MENU ADMIN", "admin autenticado abre menu");
}

async function assertInboundPassphrasesRedacted() {
  const { data, error } = await service
    .from("whatsapp_messages")
    .select("body, raw_metadata")
    .eq("direction", "inbound")
    .in("body", [GATE_PASS, "errada"]);

  if (error) throw error;
  assert((data ?? []).length === 0, "palavras-chave de portaria não ficam no inbound");

  const { count, error: redactedError } = await service
    .from("whatsapp_messages")
    .select("id", { count: "exact", head: true })
    .eq("direction", "inbound")
    .eq("body", "[GATE_ACCESS_REDACTED]");

  if (redactedError) throw redactedError;
  assert((count ?? 0) >= 3, "inbounds de palavra-chave de portaria ficam redigidos");
}

async function verifyPermissions() {
  const { error: serviceError } = await service
    .from("gate_accesses")
    .select("id")
    .limit(1);
  assert(!serviceError, "service_role acessa gate_accesses");

  const { error: anonError } = await anon.from("gate_accesses").select("id").limit(1);
  assert(Boolean(anonError), "anon não acessa gate_accesses");

  const email = `gate-audit-${Date.now()}@example.com`;
  const password = "gate-audit-password-123456";
  const { data: created, error: createError } = await service.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });
  if (createError) throw createError;
  authUserId = created.user.id;

  const authenticated = createClient(testEnv.SUPABASE_URL, testEnv.SUPABASE_ANON_KEY, {
    auth: { persistSession: false },
  });
  const { error: signInError } = await authenticated.auth.signInWithPassword({
    email,
    password,
  });
  if (signInError) throw signInError;
  const { error: authError } = await authenticated
    .from("gate_accesses")
    .select("id")
    .limit(1);
  assert(Boolean(authError), "authenticated não acessa gate_accesses");
}

async function main() {
  let nextChild;
  let zapiServer;
  const adminPhone = "559940000001";
  const validatorPhone = "559940000002";
  const unknownGatePhone = "559940000003";

  try {
    await cleanup();
    await verifyPermissions();
    const adminUserId = await createAdminUser(adminPhone);
    const { eventId, secondEventId } = await createCatalog(adminUserId);

    zapiServer = await startZapiMock();
    nextChild = await startNextDev();

    await performAdminLogin(adminPhone);
    assertIncludes((await sendMessage(adminPhone, "4")).text, "PORTARIA", "menu portaria abre");

    const selfSelect = await sendMessage(adminPhone, "1");
    assertIncludes(selfSelect.text, "CHECK-IN NESTE TELEFONE", "check-in neste telefone pergunta evento");
    const selfLink = await sendMessage(adminPhone, `${PREFIX} Evento`);
    assertIncludes(selfLink.text, "/gate/session/", "check-in próprio gera link");
    assertNotIncludes(selfLink.text, GATE_PASS, "check-in próprio não mostra palavra-chave");
    await validateGateSessionLink(selfLink.text, eventId);

    assertIncludes(
      (await sendMessage(unknownGatePhone, "Portaria")).text,
      "Não encontrei acesso de portaria ativo para este telefone.",
      "telefone sem acesso ativo recebe resposta segura",
    );

    assertIncludes((await sendMessage(adminPhone, "2")).text, "CHECK-IN", "cadastro de outro telefone pergunta evento");
    assertIncludes((await sendMessage(adminPhone, `${PREFIX} Evento`)).text, "DEFINIR TELEFONE", "cadastro pede telefone");
    assertIncludes((await sendMessage(adminPhone, validatorPhone)).text, "PALAVRA CHAVE", "cadastro pede palavra-chave");
    const registered = await sendMessage(adminPhone, GATE_PASS);
    assertIncludes(registered.text, "NOVO TELEFONE CADASTRADO PARA CHECK-IN", "cadastro confirma novo telefone");
    assertIncludes(registered.text, validatorPhone, "confirma telefone cadastrado");
    assertIncludes(registered.text, GATE_PASS, "confirma palavra-chave apenas ao admin");

    const { data: access, error: accessError } = await service
      .from("gate_accesses")
      .select("id, event_id, phone, passphrase_hash, status")
      .eq("event_id", eventId)
      .eq("phone", validatorPhone)
      .single();
    if (accessError) throw accessError;
    assert(access.status === "active", "gate_access criado ativo");
    assert(access.passphrase_hash !== GATE_PASS, "palavra-chave não salva em texto puro");
    assert(access.passphrase_hash.startsWith("pbkdf2_sha256$"), "palavra-chave salva como hash PBKDF2");

    assertIncludes((await sendMessage(adminPhone, "2")).text, "CHECK-IN", "duplicidade inicia novo cadastro");
    assertIncludes((await sendMessage(adminPhone, `${PREFIX} Evento`)).text, "DEFINIR TELEFONE", "duplicidade escolhe evento");
    assertIncludes((await sendMessage(adminPhone, validatorPhone)).text, "PALAVRA CHAVE", "duplicidade pede palavra-chave");
    assertIncludes(
      (await sendMessage(adminPhone, GATE_PASS)).text,
      "Este telefone já possui acesso de portaria para este evento.",
      "bloqueia duplicidade por evento/telefone",
    );

    const portariaPrompt = await sendMessage(validatorPhone, "Portaria");
    assertIncludes(portariaPrompt.text, "PALAVRA CHAVE DA PORTARIA", "validador precisa informar palavra-chave");
    assertNotIncludes(portariaPrompt.text, GATE_PASS, "prompt do validador não revela palavra-chave");

    assertIncludes((await sendMessage(validatorPhone, "errada")).text, "Palavra-chave inválida", "senha errada nega sem link");
    const validatorLink = await sendMessage(validatorPhone, GATE_PASS);
    assertIncludes(validatorLink.text, "/gate/session/", "senha correta gera link temporário");
    await validateGateSessionLink(validatorLink.text, eventId);

    const secondAccessId = await dbInsert("gate_accesses", {
      event_id: secondEventId,
      phone: validatorPhone,
      passphrase_hash: hashPassphrase(GATE_PASS),
      status: "active",
      created_by_admin_user_id: adminUserId,
      created_by_admin_phone: adminPhone,
    });
    assert(Boolean(secondAccessId), "fixture cria segundo acesso de portaria");
    const multiAccess = await sendMessage(validatorPhone, "Portaria");
    assertIncludes(multiAccess.text, "Você tem acesso de portaria para estes eventos", "multiacesso lista eventos");
    assertIncludes(multiAccess.text, `${PREFIX} Evento`, "multiacesso lista primeiro evento");
    assertIncludes(multiAccess.text, `${PREFIX} Segundo Evento`, "multiacesso lista segundo evento");
    const secondPrompt = await sendMessage(
      validatorPhone,
      optionForLineContaining(multiAccess.text, `${PREFIX} Segundo Evento`),
    );
    assertIncludes(secondPrompt.text, "PALAVRA CHAVE DA PORTARIA", "multiacesso pede palavra-chave após escolha");
    const secondLink = await sendMessage(validatorPhone, GATE_PASS);
    assertIncludes(secondLink.text, "/gate/session/", "multiacesso gera link");
    await validateGateSessionLink(secondLink.text, secondEventId, `${PREFIX} Segundo Evento`);

    assertIncludes((await sendMessage(adminPhone, "3")).text, "PORTARIA - ESCOLHA O EVENTO", "ver acessos pede evento");
    assertIncludes((await sendMessage(adminPhone, `${PREFIX} Evento`)).text, "VER TODOS OS ACESSOS", "ver acessos pede filtro");
    const accessList = await sendMessage(adminPhone, "1");
    assertIncludes(accessList.text, "ACESSOS ATIVOS", "lista acessos ativos");
    assertIncludes(accessList.text, maskPhone(validatorPhone), "lista mostra telefone mascarado");
    assertNotIncludes(accessList.text, validatorPhone, "lista não mostra telefone completo");
    assertNotIncludes(accessList.text, GATE_PASS, "lista não mostra palavra-chave");
    assertNotIncludes(accessList.text, "pbkdf2_sha256", "lista não mostra hash");

    assertIncludes((await sendMessage(adminPhone, "Voltar")).text, "PORTARIA - ESCOLHA O EVENTO", "volta para escolha de evento antes de revogar");
    assertIncludes((await sendMessage(adminPhone, "Voltar")).text, "PORTARIA", "volta ao menu portaria para revogar");
    assertIncludes((await sendMessage(adminPhone, "4")).text, "REVOGAR ACESSOS", "revogar pede evento");
    const revokeList = await sendMessage(adminPhone, `${PREFIX} Evento`);
    assertIncludes(revokeList.text, "Digite o número do acesso", "revogar lista acessos");
    const revokeConfirm = await sendMessage(adminPhone, "1");
    assertIncludes(revokeConfirm.text, "CONFIRMAR PAUSA DO ACESSO", "revogar pede confirmação");
    assertIncludes(revokeConfirm.text, maskPhone(validatorPhone), "confirmação mostra telefone mascarado");
    assertNotIncludes(revokeConfirm.text, validatorPhone, "confirmação não mostra telefone completo");
    const revokeDone = await sendMessage(adminPhone, "SIM");
    assertIncludes(revokeDone.text, "ACESSO DE PORTARIA PAUSADO", "revogar pausa acesso");
    assertIncludes(revokeDone.text, maskPhone(validatorPhone), "pausa confirma telefone mascarado");
    assertNotIncludes(revokeDone.text, validatorPhone, "pausa não mostra telefone completo");

    const { data: paused, error: pausedError } = await service
      .from("gate_accesses")
      .select("status")
      .eq("id", access.id)
      .single();
    if (pausedError) throw pausedError;
    assert(paused.status === "paused", "revogar altera status para paused");

    assertIncludes((await sendMessage(adminPhone, "portaria")).text, "PORTARIA", "volta ao menu portaria para ver pausados");
    assertIncludes((await sendMessage(adminPhone, "3")).text, "PORTARIA - ESCOLHA O EVENTO", "ver pausados pede evento");
    assertIncludes((await sendMessage(adminPhone, `${PREFIX} Evento`)).text, "VER TODOS OS ACESSOS", "ver pausados pede filtro");
    const pausedList = await sendMessage(adminPhone, "2");
    assertIncludes(pausedList.text, "ACESSOS PAUSADOS", "lista pausados");
    assertIncludes(pausedList.text, maskPhone(validatorPhone), "lista pausados mostra telefone mascarado");
    assertNotSensitive(pausedList.text, "lista pausados");

    const deniedAfterPause = await sendMessage(validatorPhone, "Portaria");
    assertIncludes(deniedAfterPause.text, "PALAVRA CHAVE DA PORTARIA", "acesso pausado não entra, mas outro evento ativo permanece");
    assertIncludes(deniedAfterPause.text, `${PREFIX} Segundo Evento`, "login após pausa usa apenas evento ainda ativo");

    await assertInboundPassphrasesRedacted();

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
