import assert from "node:assert/strict";
import test from "node:test";
import { NextRequest } from "next/server.js";
import {
  consumeRateLimitWithAdapter,
  rateLimitFailureResponse,
  rateLimitResponse,
} from "../src/lib/security/rateLimit.ts";
import {
  applyRateLimitPolicy,
  unavailableRateLimitResult,
} from "../src/lib/security/rateLimitContract.ts";
import { proxy } from "../src/proxy.ts";

const headers = new Headers({ "x-forwarded-for": "198.51.100.40" });

function config(unavailablePolicy = "fail_closed_503") {
  return {
    routeKey: "test:rate-limit-outage",
    limit: 2,
    windowSeconds: 60,
    headers,
    unavailablePolicy,
  };
}

function rpcData(overrides = {}) {
  return {
    allowed: true,
    retry_after_seconds: 0,
    reason: null,
    count: 1,
    limit: 2,
    window_seconds: 60,
    ...overrides,
  };
}

test("rate limiter maps valid RPC allowed and denied responses", async () => {
  const allowed = await consumeRateLimitWithAdapter(
    config(),
    async () => ({ data: rpcData(), error: null }),
  );
  assert.equal(allowed.status, "allowed");
  assert.equal(applyRateLimitPolicy(allowed).action, "continue");

  const denied = await consumeRateLimitWithAdapter(
    config(),
    async () => ({
      data: rpcData({
        allowed: false,
        retry_after_seconds: 17,
        reason: "rate_limited",
        count: 3,
      }),
      error: null,
    }),
  );
  assert.equal(denied.status, "rate_limited");
  if (denied.status !== "rate_limited") assert.fail("expected rate_limited");
  const response = rateLimitResponse(denied);
  assert.equal(response.status, 429);
  assert.equal(response.headers.get("Retry-After"), "17");
});

test("rate limiter maps RPC error, exception, timeout, null and malformed data to unavailable", async () => {
  const rpcError = await consumeRateLimitWithAdapter(
    config(),
    async () => ({ data: null, error: { code: "PGRST202" } }),
  );
  assert.equal(rpcError.status, "unavailable");
  assert.equal(rpcError.unavailableReason, "rpc_error");

  const exception = await consumeRateLimitWithAdapter(config(), async () => {
    throw new TypeError("synthetic adapter failure");
  });
  assert.equal(exception.status, "unavailable");
  assert.equal(exception.unavailableReason, "exception");

  const timeout = await consumeRateLimitWithAdapter(
    config(),
    async (_input, signal) =>
      new Promise((_resolve, reject) => {
        signal.addEventListener(
          "abort",
          () => reject(new DOMException("Aborted", "AbortError")),
          { once: true },
        );
      }),
    10,
  );
  assert.equal(timeout.status, "unavailable");
  assert.equal(timeout.unavailableReason, "timeout");

  for (const data of [
    null,
    {},
    { allowed: false },
    rpcData({ reason: "rate_limited" }),
    rpcData({ allowed: false, reason: "rate_limited", count: 2 }),
  ]) {
    const malformed = await consumeRateLimitWithAdapter(
      config(),
      async () => ({ data, error: null }),
    );
    assert.equal(malformed.status, "unavailable");
    assert.equal(malformed.unavailableReason, "invalid_response");
  }
});

test("unavailable policy keeps 429 exclusive to confirmed excess", async () => {
  const closed = unavailableRateLimitResult(
    {
      sourceHash: "closed-source",
      limit: 2,
      windowSeconds: 60,
      unavailablePolicy: "fail_closed_503",
    },
    "rpc_error",
  );
  const closedDecision = applyRateLimitPolicy(closed);
  assert.equal(closedDecision.action, "service_unavailable");
  const closedResponse = rateLimitFailureResponse(closed);
  assert.ok(closedResponse);
  assert.equal(closedResponse.status, 503);
  assert.equal(closedResponse.headers.has("Retry-After"), false);

  const open = unavailableRateLimitResult(
    {
      sourceHash: "open-source",
      limit: 2,
      windowSeconds: 60,
      unavailablePolicy: "fail_open_after_strong_auth",
    },
    "rpc_error",
  );
  assert.equal(applyRateLimitPolicy(open).action, "continue");
  assert.equal(rateLimitFailureResponse(open), null);
});

test("proxy fails closed on unavailable and preserves confirmed outcomes", async () => {
  const previousUrl = process.env.SUPABASE_URL;
  const previousKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const previousFetch = globalThis.fetch;
  const request = () =>
    new NextRequest("https://rota5.example/tickets/test-token", {
      headers: { "x-forwarded-for": "198.51.100.41" },
    });

  try {
    delete process.env.SUPABASE_URL;
    delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    assert.equal((await proxy(request())).status, 503);

    process.env.SUPABASE_URL = "https://supabase.example";
    process.env.SUPABASE_SERVICE_ROLE_KEY = "test-service-role";

    globalThis.fetch = async () => new Response("error", { status: 503 });
    assert.equal((await proxy(request())).status, 503);

    globalThis.fetch = async () =>
      new Response("not-json", {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    assert.equal((await proxy(request())).status, 503);

    globalThis.fetch = async () =>
      Response.json({
        allowed: false,
        retry_after_seconds: 11,
        reason: "rate_limited",
        count: 61,
        limit: 60,
        window_seconds: 60,
      });
    const denied = await proxy(request());
    assert.equal(denied.status, 429);
    assert.equal(denied.headers.get("Retry-After"), "11");

    globalThis.fetch = async () =>
      Response.json({
        allowed: true,
        retry_after_seconds: 0,
        reason: null,
        count: 1,
        limit: 60,
        window_seconds: 60,
      });
    const allowed = await proxy(request());
    assert.equal(allowed.status, 200);
    assert.equal(allowed.headers.get("x-middleware-next"), "1");
  } finally {
    if (previousUrl === undefined) delete process.env.SUPABASE_URL;
    else process.env.SUPABASE_URL = previousUrl;
    if (previousKey === undefined) delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    else process.env.SUPABASE_SERVICE_ROLE_KEY = previousKey;
    globalThis.fetch = previousFetch;
  }
});

test("strong authentication rejection remains before rate limiting", async () => {
  Object.assign(process.env, {
    APP_BASE_URL: "https://rota5.example",
    SUPABASE_URL: "https://supabase.example",
    SUPABASE_ANON_KEY: "test-anon",
    SUPABASE_SERVICE_ROLE_KEY: "test-service-role",
    ZAPI_INSTANCE_ID: "test-instance",
    ZAPI_INSTANCE_TOKEN: "test-token",
    ZAPI_CLIENT_TOKEN: "test-client-token",
    ZAPI_BASE_URL: "https://zapi.example",
    ZAPI_WEBHOOK_SECRET: "valid-zapi-secret",
    CHECKOUT_INTERNAL_SECRET: "valid-checkout-secret",
    PAYMENT_PROVIDER: "mercado_pago",
    MERCADO_PAGO_ACCESS_TOKEN: "APP_USR-test",
    MERCADO_PAGO_WEBHOOK_SECRET: "valid-mp-secret",
    NEXT_PUBLIC_MERCADO_PAGO_PUBLIC_KEY: "APP_USR-public-test",
    TICKET_RESERVATION_TTL_MINUTES: "10",
    TICKET_QR_SECRET: "test-ticket-qr-secret-with-at-least-32-characters",
    SEAT_MAP_STORAGE_BUCKET: "seat-maps",
    GATE_ADMIN_SECRET: "test-gate-admin",
    GATE_SESSION_SECRET: "test-gate-session-secret-with-at-least-32-characters",
    GATE_SESSION_TTL_MINUTES: "480",
    CRON_SECRET: "valid-cron-secret",
  });

  const [zapi, mercadoPago, checkout, expireCron, batchesCron] = await Promise.all([
    import("../src/app/api/webhook/zapi/route.ts"),
    import("../src/app/api/webhook/payment/mercado-pago/route.ts"),
    import("../src/app/api/checkout/mercado-pago/route.ts"),
    import("../src/app/api/cron/expire-reservations/route.ts"),
    import("../src/app/api/cron/process-whatsapp-batches/route.ts"),
  ]);

  const zapiResponse = await zapi.POST(
    new Request("https://rota5.example/api/webhook/zapi", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-zapi-webhook-secret": "invalid",
      },
      body: JSON.stringify({ fromMe: false, phone: "5515999999999", text: "oi" }),
    }),
  );
  assert.equal(zapiResponse.status, 401);

  const mercadoPagoResponse = await mercadoPago.POST(
    new Request("https://rota5.example/api/webhook/payment/mercado-pago?data.id=123", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-request-id": "test-request",
        "x-signature": "ts=1,v1=invalid",
      },
      body: JSON.stringify({ data: { id: "123" }, type: "payment" }),
    }),
  );
  assert.equal(mercadoPagoResponse.status, 401);

  const checkoutResponse = await checkout.POST(
    new Request("https://rota5.example/api/checkout/mercado-pago", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-checkout-secret": "invalid",
      },
      body: JSON.stringify({}),
    }),
  );
  assert.equal(checkoutResponse.status, 401);

  const expireResponse = await expireCron.POST(
    new Request("https://rota5.example/api/cron/expire-reservations", {
      method: "POST",
      headers: { authorization: "Bearer invalid" },
    }),
  );
  assert.equal(expireResponse.status, 401);

  const batchesResponse = await batchesCron.POST(
    new Request("https://rota5.example/api/cron/process-whatsapp-batches", {
      method: "POST",
      headers: { authorization: "Bearer invalid" },
    }),
  );
  assert.equal(batchesResponse.status, 401);
});
