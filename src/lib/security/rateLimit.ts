import "server-only";

import { createHash } from "crypto";
import { tooManyRequests } from "@/lib/http/responses";
import { logWarn } from "@/lib/logger";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

type HeadersLike = Pick<Headers, "get">;

export type RateLimitConfig = {
  routeKey: string;
  limit: number;
  windowSeconds: number;
  request?: Request;
  headers?: HeadersLike;
  scope?: string | null;
};

export type RateLimitResult = {
  allowed: boolean;
  retryAfterSeconds: number;
  reason: "ok" | "rate_limited" | "unavailable";
  sourceHash: string;
  count?: number;
  limit: number;
  windowSeconds: number;
};

type ConsumeRateLimitResponse = {
  allowed?: unknown;
  retry_after_seconds?: unknown;
  reason?: unknown;
  count?: unknown;
  limit?: unknown;
  window_seconds?: unknown;
};

function hashValue(value: string) {
  return createHash("sha256").update(value).digest("hex");
}

export function hashRateLimitScope(value: string) {
  return hashValue(value);
}

export function getRequestSourceIdentifier(headers: HeadersLike) {
  return (
    headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    headers.get("x-real-ip")?.trim() ||
    headers.get("cf-connecting-ip")?.trim() ||
    "unknown"
  );
}

function buildSourceHash({
  headers,
  scope,
}: {
  headers: HeadersLike;
  scope?: string | null;
}) {
  const source = getRequestSourceIdentifier(headers);
  const normalizedScope = scope?.trim();

  return hashValue(normalizedScope ? `${source}|${normalizedScope}` : source);
}

export async function consumeRateLimit(
  config: RateLimitConfig,
): Promise<RateLimitResult> {
  const headers = config.headers ?? config.request?.headers;

  if (!headers) {
    throw new Error("rate_limit_headers_required");
  }

  const sourceHash = buildSourceHash({
    headers,
    scope: config.scope,
  });

  try {
    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase.rpc("consume_rate_limit", {
      p_route_key: config.routeKey,
      p_source_hash: sourceHash,
      p_limit: config.limit,
      p_window_seconds: config.windowSeconds,
    });

    if (error) {
      logWarn("Rate limit check failed open", {
        routeKey: config.routeKey,
        code: error.code,
      });

      return {
        allowed: true,
        retryAfterSeconds: 0,
        reason: "unavailable",
        sourceHash,
        limit: config.limit,
        windowSeconds: config.windowSeconds,
      };
    }

    const result = data as ConsumeRateLimitResponse | null;
    const allowed = result?.allowed === true;
    const retryAfterSeconds =
      typeof result?.retry_after_seconds === "number"
        ? result.retry_after_seconds
        : config.windowSeconds;

    return {
      allowed,
      retryAfterSeconds,
      reason: allowed ? "ok" : "rate_limited",
      sourceHash,
      count: typeof result?.count === "number" ? result.count : undefined,
      limit:
        typeof result?.limit === "number" ? result.limit : config.limit,
      windowSeconds:
        typeof result?.window_seconds === "number"
          ? result.window_seconds
          : config.windowSeconds,
    };
  } catch (error) {
    logWarn("Rate limit check failed open", {
      routeKey: config.routeKey,
      error,
    });

    return {
      allowed: true,
      retryAfterSeconds: 0,
      reason: "unavailable",
      sourceHash,
      limit: config.limit,
      windowSeconds: config.windowSeconds,
    };
  }
}

export function rateLimitResponse(result: RateLimitResult) {
  return tooManyRequests(result.retryAfterSeconds);
}
