import { createHmac, createHash, randomBytes, randomUUID } from "node:crypto";
import { createServer } from "node:http";
import { spawn } from "node:child_process";
import { readFileSync, rmSync, writeFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

const PREFIX = "TEST_RATE_LIMIT";
const PORT = 3372;
const MP_PORT = 4602;
const APP_BASE_URL = `http://127.0.0.1:${PORT}`;
const MP_BASE_URL = `http://127.0.0.1:${MP_PORT}`;
const TEMP_ENV_FILE = ".env.test.local";
const RUN_ID = randomBytes(6).toString("hex");

const SOURCES = {
  zapiInvalid: "198.51.100.11",
  mpInvalid: "198.51.100.12",
  checkoutInvalid: "198.51.100.13",
  cronInvalid: "198.51.100.14",
  gateNormal: "198.51.100.15",
  gateFlood: "198.51.100.16",
  ticketFlood: "198.51.100.17",
  mpLegit: "198.51.100.18",
  zapiLegit: "198.51.100.19",
};

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

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function assert(condition, label, details) {
  if (!condition) throw new Error(`${label}${details ? `: ${details}` : ""}`);
  console.log(`ok - ${label}`);
}

function assertStatus(response, status, label) {
  assert(
    response.status === status,
    label,
    `expected ${status}, received ${response.status}`,
  );
}

const fileEnv = parseEnvFile(".env");
const testEnv = {
  ...process.env,
  ...fileEnv,
  NODE_ENV: "test",
  APP_BASE_URL,
  ZAPI_BASE_URL: "http://127.0.0.1:4598",
  ZAPI_INSTANCE_ID: "rate-limit-instance",
  ZAPI_INSTANCE_TOKEN: "rate-limit-token",
  ZAPI_CLIENT_TOKEN: "rate-limit-client",
  ZAPI_WEBHOOK_SECRET: fileEnv.ZAPI_WEBHOOK_SECRET || `zapi-secret-${RUN_ID}`,
  CHECKOUT_INTERNAL_SECRET:
    fileEnv.CHECKOUT_INTERNAL_SECRET || `checkout-secret-${RUN_ID}`,
  CRON_SECRET: fileEnv.CRON_SECRET || `cron-secret-${RUN_ID}`,
  MERCADO_PAGO_ACCESS_TOKEN:
    fileEnv.MERCADO_PAGO_ACCESS_TOKEN || `APP_USR-rate-limit-${RUN_ID}`,
  MERCADO_PAGO_WEBHOOK_SECRET:
    fileEnv.MERCADO_PAGO_WEBHOOK_SECRET || `mp-webhook-${RUN_ID}`,
  MERCADO_PAGO_API_BASE_URL: MP_BASE_URL,
  PAYMENT_PROVIDER: fileEnv.PAYMENT_PROVIDER || "mercado_pago",
  NEXT_PUBLIC_MERCADO_PAGO_PUBLIC_KEY:
    fileEnv.NEXT_PUBLIC_MERCADO_PAGO_PUBLIC_KEY || `APP_USR-public-${RUN_ID}`,
  TICKET_RESERVATION_TTL_MINUTES: fileEnv.TICKET_RESERVATION_TTL_MINUTES || "10",
  TICKET_QR_SECRET:
    fileEnv.TICKET_QR_SECRET ||
    "rate-limit-ticket-qr-secret-with-at-least-thirty-two-chars",
  GATE_ADMIN_SECRET: fileEnv.GATE_ADMIN_SECRET || "rate-limit-gate-admin",
  GATE_SESSION_SECRET:
    fileEnv.GATE_SESSION_SECRET ||
    "rate-limit-gate-session-secret-with-at-least-thirty-two-chars",
  GATE_SESSION_TTL_MINUTES: fileEnv.GATE_SESSION_TTL_MINUTES || "480",
  SEAT_MAP_STORAGE_BUCKET: fileEnv.SEAT_MAP_STORAGE_BUCKET || "seat-maps",
};

for (const key of ["SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY"]) {
  if (!testEnv[key]) throw new Error(`Missing required env: ${key}`);
}

const service = createClient(testEnv.SUPABASE_URL, testEnv.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

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

async function cleanup() {
  const hashes = new Set(Object.values(SOURCES).map((source) => sha256(source)));
  const gateToken = `${PREFIX}_gate_${RUN_ID}`;
  hashes.add(sha256(`${SOURCES.gateFlood}|gate:${sha256(gateToken)}`));
  hashes.add(sha256(`${SOURCES.gateNormal}|gate:${sha256(gateToken)}`));

  await service
    .from("rate_limit_events")
    .delete()
    .in("source_hash", Array.from(hashes));

  await service
    .from("payment_events")
    .delete()
    .like("event_key", `${PREFIX}_${RUN_ID}%`);
}

async function assertRateLimitSchema() {
  const { error } = await service
    .from("rate_limit_events")
    .select("route_key")
    .limit(1);
  if (error) throw new Error(`rate_limit_events missing or inaccessible: ${error.message}`);

  const { data, error: rpcError } = await service.rpc("consume_rate_limit", {
    p_route_key: `${PREFIX}:schema`,
    p_source_hash: sha256(`${PREFIX}:schema:${RUN_ID}`),
    p_limit: 1,
    p_window_seconds: 60,
  });
  if (rpcError) throw new Error(`consume_rate_limit missing: ${rpcError.message}`);
  assert(data?.allowed === true, "rate limit RPC is active");

  await service
    .from("rate_limit_events")
    .delete()
    .eq("route_key", `${PREFIX}:schema`);
}

async function startMpMock() {
  return new Promise((resolve) => {
    const server = createServer((request, response) => {
      if (request.url?.startsWith("/v1/payments/")) {
        response.writeHead(200, { "content-type": "application/json" });
        response.end(
          JSON.stringify({
            id: request.url.split("/").pop(),
            status: "approved",
            external_reference: `ticket_order_${randomUUID()}`,
            transaction_amount: 10,
            date_approved: new Date().toISOString(),
            currency_id: "BRL",
          }),
        );
        return;
      }

      response.writeHead(404, { "content-type": "application/json" });
      response.end(JSON.stringify({ error: "not_found" }));
    });
    server.listen(MP_PORT, "127.0.0.1", () => resolve(server));
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

function startNextDev() {
  const child = spawn(
    "npx",
    ["next", "dev", "--hostname", "127.0.0.1", "--port", String(PORT)],
    {
      env: testEnv,
      stdio: ["ignore", "pipe", "pipe"],
    },
  );
  child.stdout.on("data", (chunk) => process.stdout.write(chunk));
  child.stderr.on("data", (chunk) => process.stderr.write(chunk));
  return child;
}

function withSource(source, headers = {}) {
  return {
    ...headers,
    "x-forwarded-for": source,
  };
}

async function postJson(path, source, body, headers = {}) {
  return fetch(`${APP_BASE_URL}${path}`, {
    method: "POST",
    headers: withSource(source, {
      "content-type": "application/json",
      ...headers,
    }),
    body: JSON.stringify(body),
  });
}

function mpSignatureHeaders(paymentId, requestId) {
  const timestamp = String(Math.floor(Date.now() / 1000));
  const manifest = `id:${paymentId};request-id:${requestId};ts:${timestamp};`;
  const signature = createHmac("sha256", testEnv.MERCADO_PAGO_WEBHOOK_SECRET)
    .update(manifest)
    .digest("hex");
  return {
    "x-request-id": requestId,
    "x-signature": `ts=${timestamp},v1=${signature}`,
  };
}

async function main() {
  writeTemporaryNextEnv();
  await cleanup();
  await assertRateLimitSchema();

  const mpMock = await startMpMock();
  const nextDev = startNextDev();

  try {
    await waitForHealth();

    const zapiNoSecret = await postJson(
      "/api/webhook/zapi",
      SOURCES.zapiInvalid,
      { fromMe: true },
    );
    assertStatus(zapiNoSecret, 401, "A) Z-API without secret remains 401");

    const mpNoSignature = await postJson(
      "/api/webhook/payment/mercado-pago",
      SOURCES.mpInvalid,
      { data: { id: "123" } },
    );
    assertStatus(mpNoSignature, 401, "B) Mercado Pago without signature remains 401");

    const checkoutNoSecret = await postJson(
      "/api/checkout/mercado-pago",
      SOURCES.checkoutInvalid,
      { order_id: randomUUID() },
    );
    assertStatus(checkoutNoSecret, 401, "C) checkout without secret remains 401");

    const cronNoBearer = await fetch(`${APP_BASE_URL}/api/cron/expire-reservations`, {
      method: "POST",
      headers: withSource(SOURCES.cronInvalid),
    });
    assertStatus(cronNoBearer, 401, "D) cron without bearer remains 401");

    const gateToken = `${PREFIX}_gate_${RUN_ID}`;
    const normalGate = await postJson(
      "/api/gate/session/scan",
      SOURCES.gateNormal,
      { gateSessionToken: gateToken, ticketToken: `${PREFIX}_ticket_${RUN_ID}` },
    );
    assert(
      normalGate.status !== 429,
      "E) gate scan accepts normal volume",
      `received ${normalGate.status}`,
    );

    let floodGateStatus = 0;
    for (let index = 0; index < 125; index += 1) {
      const response = await postJson(
        "/api/gate/session/scan",
        SOURCES.gateFlood,
        { gateSessionToken: gateToken, ticketToken: `${PREFIX}_ticket_${index}` },
      );
      floodGateStatus = response.status;
      if (response.status === 429) break;
    }
    assertStatus(
      { status: floodGateStatus },
      429,
      "F) gate scan blocks excess with 429",
    );

    let ticketFloodStatus = 0;
    for (let index = 0; index < 65; index += 1) {
      const response = await fetch(`${APP_BASE_URL}/tickets/${PREFIX}_${RUN_ID}_${index}`, {
        headers: withSource(SOURCES.ticketFlood),
      });
      ticketFloodStatus = response.status;
      if (response.status === 429) break;
    }
    assertStatus(
      { status: ticketFloodStatus },
      429,
      "G) invalid ticket flood blocks with 429",
    );

    const paymentId = "900100200";
    const requestId = `${PREFIX}_${RUN_ID}_mp`;
    const mpLegit = await postJson(
      `/api/webhook/payment/mercado-pago?data.id=${paymentId}`,
      SOURCES.mpLegit,
      { data: { id: paymentId }, type: "payment" },
      mpSignatureHeaders(paymentId, requestId),
    );
    assert(
      mpLegit.status !== 429,
      "H) legitimate Mercado Pago webhook inside limit is not blocked",
      `received ${mpLegit.status}`,
    );

    const zapiLegit = await postJson(
      "/api/webhook/zapi",
      SOURCES.zapiLegit,
      { fromMe: true, phone: "5599999999999", messageId: `${PREFIX}_${RUN_ID}` },
      { "x-zapi-webhook-secret": testEnv.ZAPI_WEBHOOK_SECRET },
    );
    assert(
      zapiLegit.status !== 429,
      "I) legitimate Z-API webhook inside limit is not blocked",
      `received ${zapiLegit.status}`,
    );

    const { data: stored, error } = await service
      .from("rate_limit_events")
      .select("route_key, source_hash")
      .in("source_hash", [
        sha256(SOURCES.gateFlood),
        sha256(`${SOURCES.gateFlood}|gate:${sha256(gateToken)}`),
        sha256(SOURCES.ticketFlood),
      ]);
    if (error) throw new Error(`read rate_limit_events: ${error.message}`);

    const serialized = JSON.stringify(stored ?? []);
    for (const source of Object.values(SOURCES)) {
      assert(!serialized.includes(source), "J) raw source/IP is not stored");
    }
    assert(!serialized.includes(gateToken), "K) gate token is not stored");
    assert(!serialized.includes("base64"), "K) base64/payload is not stored");

    await cleanup();
    const { data: remaining } = await service
      .from("rate_limit_events")
      .select("source_hash")
      .in("source_hash", [
        sha256(SOURCES.gateFlood),
        sha256(`${SOURCES.gateFlood}|gate:${sha256(gateToken)}`),
        sha256(SOURCES.ticketFlood),
      ]);
    assert((remaining ?? []).length === 0, "L) cleanup removed rate-limit data");
  } finally {
    nextDev.kill("SIGTERM");
    mpMock.close();
    removeTemporaryNextEnv();
  }
}

main().catch(async (error) => {
  console.error(error);
  await cleanup().catch(() => {});
  removeTemporaryNextEnv();
  process.exit(1);
});
