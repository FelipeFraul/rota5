import { NextResponse, type NextRequest } from "next/server";

type RateLimitConfig = {
  routeKey: string;
  limit: number;
  windowSeconds: number;
  scope?: string | null;
};

type RateLimitResponse = {
  allowed?: unknown;
  retry_after_seconds?: unknown;
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
) {
  const supabaseUrl = process.env.SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceRoleKey) {
    return { allowed: true, retryAfterSeconds: 0 };
  }

  const source = getRequestSourceIdentifier(request);
  const scope = config.scope?.trim();
  const sourceHash = await sha256(scope ? `${source}|${scope}` : source);

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
    });

    if (!response.ok) {
      return { allowed: true, retryAfterSeconds: 0 };
    }

    const result = (await response.json()) as RateLimitResponse;
    const allowed = result.allowed === true;
    const retryAfterSeconds =
      typeof result.retry_after_seconds === "number"
        ? result.retry_after_seconds
        : config.windowSeconds;

    return { allowed, retryAfterSeconds };
  } catch {
    return { allowed: true, retryAfterSeconds: 0 };
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
    });

    if (!result.allowed) {
      return tooManyRequests(result.retryAfterSeconds);
    }
  }

  if (pathname.startsWith("/gate/session/")) {
    const token = decodeURIComponent(pathname.replace(/^\/gate\/session\//, ""));
    const result = await consumePageRateLimit(request, {
      routeKey: "page:gate-session",
      limit: 60,
      windowSeconds: 60,
      scope: `gate:${await sha256(token)}`,
    });

    if (!result.allowed) {
      return tooManyRequests(result.retryAfterSeconds);
    }
  }

  if (pathname.startsWith("/admin/login/")) {
    const token = decodeURIComponent(pathname.replace(/^\/admin\/login\//, ""));
    const result = await consumePageRateLimit(request, {
      routeKey: "page:admin-login",
      limit: 30,
      windowSeconds: 60,
      scope: `admin-login:${await sha256(token)}`,
    });

    if (!result.allowed) {
      return tooManyRequests(result.retryAfterSeconds);
    }
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
