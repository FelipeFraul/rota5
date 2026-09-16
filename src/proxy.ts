import { NextResponse, type NextRequest } from "next/server";
import {
  applyRateLimitPolicy,
  parseRateLimitRpcResponse,
  RATE_LIMIT_TIMEOUT_MS,
  type RateLimitResult,
  type RateLimitUnavailablePolicy,
  unavailableRateLimitResult,
} from "@/lib/security/rateLimitContract";

type RateLimitConfig = {
  routeKey: string;
  limit: number;
  windowSeconds: number;
  scope?: string | null;
  unavailablePolicy: RateLimitUnavailablePolicy;
};

function createNonce() {
  return btoa(crypto.randomUUID());
}

function buildContentSecurityPolicy(nonce: string) {
  const isDevelopment = process.env.NODE_ENV === "development";
  const scriptSources = [
    "'self'",
    `'nonce-${nonce}'`,
    "'strict-dynamic'",
    "https://sdk.mercadopago.com",
  ];
  const styleSources = ["'self'", `'nonce-${nonce}'`];

  if (isDevelopment) {
    scriptSources.push("'unsafe-eval'");
    styleSources.push("'unsafe-inline'");
  }

  return [
    "default-src 'none'",
    "base-uri 'self'",
    "object-src 'none'",
    "frame-ancestors 'none'",
    "form-action 'self'",
    "img-src 'self' data: blob: https:",
    "font-src 'self' data:",
    `style-src ${styleSources.join(" ")}`,
    `script-src ${scriptSources.join(" ")}`,
    "connect-src 'self'",
    "media-src 'self' data: blob:",
    "worker-src 'self' blob:",
    "manifest-src 'self'",
    "upgrade-insecure-requests",
  ].join("; ");
}

function nextWithContentSecurityPolicy(request: NextRequest) {
  const nonce = createNonce();
  const contentSecurityPolicy = buildContentSecurityPolicy(nonce);
  const requestHeaders = new Headers(request.headers);

  requestHeaders.set("x-nonce", nonce);
  requestHeaders.set("Content-Security-Policy", contentSecurityPolicy);

  const response = NextResponse.next({
    request: {
      headers: requestHeaders,
    },
  });

  response.headers.set("Content-Security-Policy", contentSecurityPolicy);

  return response;
}

function getRequestSourceIdentifier(request: NextRequest) {
  return (
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    request.headers.get("x-real-ip")?.trim() ||
    request.headers.get("cf-connecting-ip")?.trim() ||
    "unknown"
  );
}

async function sha256(value: string) {
  const bytes = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest("SHA-256", bytes);

  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

async function consumePageRateLimit(
  request: NextRequest,
  config: RateLimitConfig,
): Promise<RateLimitResult> {
  const supabaseUrl = process.env.SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const source = getRequestSourceIdentifier(request);
  const scope = config.scope?.trim();
  const sourceHash = await sha256(scope ? `${source}|${scope}` : source);
  const context = {
    sourceHash,
    limit: config.limit,
    windowSeconds: config.windowSeconds,
    unavailablePolicy: config.unavailablePolicy,
  };

  function unavailable(
    reason: Parameters<typeof unavailableRateLimitResult>[1],
    details: Record<string, unknown> = {},
  ) {
    console.warn("Rate limit unavailable", {
      routeKey: config.routeKey,
      reason,
      policy: config.unavailablePolicy,
      ...details,
    });
    return unavailableRateLimitResult(context, reason);
  }

  if (!supabaseUrl || !serviceRoleKey) {
    return unavailable("configuration");
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), RATE_LIMIT_TIMEOUT_MS);

  try {
    const response = await fetch(`${supabaseUrl}/rest/v1/rpc/consume_rate_limit`, {
      method: "POST",
      headers: {
        apikey: serviceRoleKey,
        authorization: `Bearer ${serviceRoleKey}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        p_route_key: config.routeKey,
        p_source_hash: sourceHash,
        p_limit: config.limit,
        p_window_seconds: config.windowSeconds,
      }),
      signal: controller.signal,
    });

    if (!response.ok) {
      return unavailable("http_error", { status: response.status });
    }

    let data: unknown;
    try {
      data = await response.json();
    } catch {
      return unavailable("invalid_response");
    }

    const result = parseRateLimitRpcResponse(data, context);
    if (result.status === "unavailable") {
      console.warn("Rate limit unavailable", {
        routeKey: config.routeKey,
        reason: result.unavailableReason,
        policy: config.unavailablePolicy,
      });
    }
    return result;
  } catch (error) {
    return unavailable(controller.signal.aborted ? "timeout" : "exception", {
      errorName: error instanceof Error ? error.name : typeof error,
    });
  } finally {
    clearTimeout(timeout);
  }
}

function tooManyRequests(retryAfterSeconds: number) {
  return NextResponse.json(
    {
      error: {
        message: "Too many requests",
      },
    },
    {
      status: 429,
      headers: {
        "Retry-After": String(retryAfterSeconds),
      },
    },
  );
}

function serviceUnavailable() {
  return NextResponse.json(
    { error: { message: "Service unavailable" } },
    { status: 503 },
  );
}

function pageRateLimitResponse(result: RateLimitResult) {
  const decision = applyRateLimitPolicy(result);
  if (decision.action === "rate_limited") {
    return tooManyRequests(decision.result.retryAfterSeconds);
  }
  if (decision.action === "service_unavailable") {
    return serviceUnavailable();
  }
  return null;
}

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (request.method !== "GET") {
    return nextWithContentSecurityPolicy(request);
  }

  if (pathname.startsWith("/tickets/")) {
    const result = await consumePageRateLimit(request, {
      routeKey: "page:tickets",
      limit: 60,
      windowSeconds: 60,
      unavailablePolicy: "fail_closed_503",
    });

    const response = pageRateLimitResponse(result);
    if (response) return response;
  }

  if (pathname.startsWith("/gate/session/")) {
    const token = decodeURIComponent(pathname.replace(/^\/gate\/session\//, ""));
    const result = await consumePageRateLimit(request, {
      routeKey: "page:gate-session",
      limit: 60,
      windowSeconds: 60,
      scope: `gate:${await sha256(token)}`,
      unavailablePolicy: "fail_closed_503",
    });

    const response = pageRateLimitResponse(result);
    if (response) return response;
  }

  if (pathname.startsWith("/admin/login/")) {
    const token = decodeURIComponent(pathname.replace(/^\/admin\/login\//, ""));
    const result = await consumePageRateLimit(request, {
      routeKey: "page:admin-login",
      limit: 30,
      windowSeconds: 60,
      scope: `admin-login:${await sha256(token)}`,
      unavailablePolicy: "fail_closed_503",
    });

    const response = pageRateLimitResponse(result);
    if (response) return response;
  }

  return nextWithContentSecurityPolicy(request);
}

export const config = {
  matcher: [
    {
      source: "/((?!_next/static|_next/image|favicon.ico).*)",
      missing: [
        { type: "header", key: "next-router-prefetch" },
        { type: "header", key: "purpose", value: "prefetch" },
      ],
    },
  ],
};
