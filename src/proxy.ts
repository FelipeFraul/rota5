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
    return NextResponse.next();
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

  return NextResponse.next();
}

export const config = {
  matcher: ["/tickets/:path*", "/gate/session/:path*"],
};
