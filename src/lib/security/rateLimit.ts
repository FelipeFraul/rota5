import "server-only";

import { createHash } from "crypto";
import { serviceUnavailable, tooManyRequests } from "@/lib/http/responses";
import { logWarn } from "@/lib/logger";
import {
  applyRateLimitPolicy,
  parseRateLimitRpcResponse,
  RATE_LIMIT_TIMEOUT_MS,
  type RateLimitExceededResult,
  type RateLimitResult,
  type RateLimitUnavailablePolicy,
  unavailableRateLimitResult,
} from "@/lib/security/rateLimitContract";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

export type {
  RateLimitAllowedResult,
  RateLimitExceededResult,
  RateLimitResult,
  RateLimitUnavailablePolicy,
  RateLimitUnavailableResult,
} from "@/lib/security/rateLimitContract";

type HeadersLike = Pick<Headers, "get">;

export type RateLimitConfig = {
  routeKey: string;
  limit: number;
  windowSeconds: number;
  request?: Request;
  headers?: HeadersLike;
  scope?: string | null;
  unavailablePolicy: RateLimitUnavailablePolicy;
};

type RateLimitRpcError = { code?: string };

export type RateLimitRpcAdapter = (
  input: {
    routeKey: string;
    sourceHash: string;
    limit: number;
    windowSeconds: number;
  },
  signal: AbortSignal,
) => Promise<{ data: unknown; error: RateLimitRpcError | null }>;

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
  return consumeRateLimitWithAdapter(config, consumeRateLimitRpc);
}

async function consumeRateLimitRpc(
  input: Parameters<RateLimitRpcAdapter>[0],
  signal: AbortSignal,
) {
  const supabase = getSupabaseAdmin();
  const result = await supabase
    .rpc("consume_rate_limit", {
      p_route_key: input.routeKey,
      p_source_hash: input.sourceHash,
      p_limit: input.limit,
      p_window_seconds: input.windowSeconds,
    })
    .abortSignal(signal);

  return {
    data: result.data,
    error: result.error ? { code: result.error.code } : null,
  };
}

function logUnavailable(
  config: RateLimitConfig,
  result: Extract<RateLimitResult, { status: "unavailable" }>,
  details: Record<string, unknown> = {},
) {
  logWarn("Rate limit unavailable", {
    routeKey: config.routeKey,
    reason: result.unavailableReason,
    policy: config.unavailablePolicy,
    ...details,
  });
}

export async function consumeRateLimitWithAdapter(
  config: RateLimitConfig,
  adapter: RateLimitRpcAdapter,
  timeoutMs = RATE_LIMIT_TIMEOUT_MS,
): Promise<RateLimitResult> {
  const headers = config.headers ?? config.request?.headers;

  if (!headers) {
    throw new Error("rate_limit_headers_required");
  }

  const sourceHash = buildSourceHash({
    headers,
    scope: config.scope,
  });
  const context = {
    sourceHash,
    limit: config.limit,
    windowSeconds: config.windowSeconds,
    unavailablePolicy: config.unavailablePolicy,
  };
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const { data, error } = await adapter(
      {
        routeKey: config.routeKey,
        sourceHash,
        limit: config.limit,
        windowSeconds: config.windowSeconds,
      },
      controller.signal,
    );

    if (error) {
      const unavailable = unavailableRateLimitResult(context, "rpc_error");
      logUnavailable(config, unavailable, { code: error.code });
      return unavailable;
    }

    const result = parseRateLimitRpcResponse(data, context);
    if (result.status === "unavailable") {
      logUnavailable(config, result);
    }
    return result;
  } catch (error) {
    const unavailable = unavailableRateLimitResult(
      context,
      controller.signal.aborted ? "timeout" : "exception",
    );
    logUnavailable(config, unavailable, {
      errorName: error instanceof Error ? error.name : typeof error,
    });
    return unavailable;
  } finally {
    clearTimeout(timeout);
  }
}

export function rateLimitResponse(result: RateLimitExceededResult) {
  return tooManyRequests(result.retryAfterSeconds);
}

export function rateLimitFailureResponse(result: RateLimitResult) {
  const decision = applyRateLimitPolicy(result);
  if (decision.action === "rate_limited") {
    return rateLimitResponse(decision.result);
  }
  if (decision.action === "service_unavailable") {
    return serviceUnavailable();
  }
  return null;
}
