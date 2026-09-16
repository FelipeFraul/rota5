export const RATE_LIMIT_TIMEOUT_MS = 2_000;

export type RateLimitUnavailablePolicy =
  | "fail_closed_503"
  | "fail_open_after_strong_auth";

export type RateLimitUnavailableReason =
  | "configuration"
  | "rpc_error"
  | "http_error"
  | "exception"
  | "timeout"
  | "invalid_response";

type RateLimitResultBase = {
  sourceHash: string;
  limit: number;
  windowSeconds: number;
  unavailablePolicy: RateLimitUnavailablePolicy;
};

export type RateLimitAllowedResult = RateLimitResultBase & {
  status: "allowed";
  retryAfterSeconds: 0;
  count: number;
};

export type RateLimitExceededResult = RateLimitResultBase & {
  status: "rate_limited";
  retryAfterSeconds: number;
  count: number;
};

export type RateLimitUnavailableResult = RateLimitResultBase & {
  status: "unavailable";
  retryAfterSeconds: 0;
  unavailableReason: RateLimitUnavailableReason;
};

export type RateLimitResult =
  | RateLimitAllowedResult
  | RateLimitExceededResult
  | RateLimitUnavailableResult;

export type RateLimitResultContext = RateLimitResultBase;

type RpcResponse = {
  allowed?: unknown;
  retry_after_seconds?: unknown;
  reason?: unknown;
  count?: unknown;
  limit?: unknown;
  window_seconds?: unknown;
};

function isPositiveInteger(value: unknown): value is number {
  return Number.isInteger(value) && Number(value) > 0;
}

function isNonNegativeInteger(value: unknown): value is number {
  return Number.isInteger(value) && Number(value) >= 0;
}

export function unavailableRateLimitResult(
  context: RateLimitResultContext,
  unavailableReason: RateLimitUnavailableReason,
): RateLimitUnavailableResult {
  return {
    ...context,
    status: "unavailable",
    retryAfterSeconds: 0,
    unavailableReason,
  };
}

export function parseRateLimitRpcResponse(
  data: unknown,
  context: RateLimitResultContext,
): RateLimitResult {
  if (!data || typeof data !== "object" || Array.isArray(data)) {
    return unavailableRateLimitResult(context, "invalid_response");
  }

  const result = data as RpcResponse;
  if (
    typeof result.allowed !== "boolean" ||
    !isNonNegativeInteger(result.retry_after_seconds) ||
    !isPositiveInteger(result.count) ||
    !isPositiveInteger(result.limit) ||
    !isPositiveInteger(result.window_seconds) ||
    result.limit !== context.limit ||
    result.window_seconds !== context.windowSeconds
  ) {
    return unavailableRateLimitResult(context, "invalid_response");
  }

  if (
    result.allowed &&
    result.reason === null &&
    result.retry_after_seconds === 0 &&
    result.count <= result.limit
  ) {
    return {
      ...context,
      status: "allowed",
      retryAfterSeconds: 0,
      count: result.count,
    };
  }

  if (
    !result.allowed &&
    result.reason === "rate_limited" &&
    result.retry_after_seconds > 0 &&
    result.count > result.limit
  ) {
    return {
      ...context,
      status: "rate_limited",
      retryAfterSeconds: result.retry_after_seconds,
      count: result.count,
    };
  }

  return unavailableRateLimitResult(context, "invalid_response");
}

export type RateLimitPolicyDecision =
  | { action: "continue"; result: RateLimitAllowedResult | RateLimitUnavailableResult }
  | { action: "rate_limited"; result: RateLimitExceededResult }
  | { action: "service_unavailable"; result: RateLimitUnavailableResult };

export function applyRateLimitPolicy(
  result: RateLimitResult,
): RateLimitPolicyDecision {
  if (result.status === "allowed") {
    return { action: "continue", result };
  }

  if (result.status === "rate_limited") {
    return { action: "rate_limited", result };
  }

  return result.unavailablePolicy === "fail_closed_503"
    ? { action: "service_unavailable", result }
    : { action: "continue", result };
}
