import { timingSafeEqual } from "crypto";
import { getEnv } from "@/lib/env";
import {
  badRequest,
  jsonError,
  jsonOk,
  methodNotAllowed,
  unauthorized,
} from "@/lib/http/responses";
import { logWarn } from "@/lib/logger";
import {
  consumeRateLimit,
  getRequestSourceIdentifier,
  rateLimitFailureResponse,
} from "@/lib/security/rateLimit";
import { createCheckoutForReservation } from "@/lib/tickets/services/checkout";

const MAX_CHECKOUT_BYTES = 32 * 1024;
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function isSecretMatch(received: string | null, expected: string) {
  if (!received) {
    return false;
  }

  const receivedBuffer = Buffer.from(received);
  const expectedBuffer = Buffer.from(expected);

  return (
    receivedBuffer.length === expectedBuffer.length &&
    timingSafeEqual(receivedBuffer, expectedBuffer)
  );
}

async function readCheckoutBody(request: Request) {
  const contentLength = request.headers.get("content-length");

  if (contentLength && Number(contentLength) > MAX_CHECKOUT_BYTES) {
    return {
      ok: false as const,
      response: badRequest("Bad Request"),
    };
  }

  const rawBody = await request.text();

  if (new TextEncoder().encode(rawBody).byteLength > MAX_CHECKOUT_BYTES) {
    return {
      ok: false as const,
      response: badRequest("Bad Request"),
    };
  }

  try {
    const body = JSON.parse(rawBody) as unknown;

    if (!body || typeof body !== "object") {
      return {
        ok: false as const,
        response: badRequest("Bad Request"),
      };
    }

    return {
      ok: true as const,
      body: body as Record<string, unknown>,
    };
  } catch {
    return {
      ok: false as const,
      response: badRequest("Bad Request"),
    };
  }
}

export async function POST(request: Request) {
  const checkoutSecret = process.env.CHECKOUT_INTERNAL_SECRET;

  if (
    !checkoutSecret ||
    !isSecretMatch(request.headers.get("x-checkout-secret"), checkoutSecret)
  ) {
    logWarn("Rejected Black House checkout request with invalid secret");
    return unauthorized();
  }

  getEnv();

  const rateLimit = await consumeRateLimit({
    routeKey: "checkout:mercado-pago",
    limit: 20,
    windowSeconds: 60,
    request,
    unavailablePolicy: "fail_open_after_strong_auth",
  });

  const rateLimitFailure = rateLimitFailureResponse(rateLimit);
  if (rateLimitFailure) {
    if (rateLimit.status === "rate_limited") {
      logWarn("Rate limited Black House checkout request", {
        sourceHash: rateLimit.sourceHash,
        count: rateLimit.count,
      });
    }
    return rateLimitFailure;
  }

  const bodyResult = await readCheckoutBody(request);

  if (!bodyResult.ok) {
    return bodyResult.response;
  }

  const orderId = bodyResult.body.order_id;

  if (typeof orderId !== "string" || !UUID_PATTERN.test(orderId)) {
    return badRequest("Bad Request");
  }

  const checkoutResult = await createCheckoutForReservation({
    orderId,
    sourceIdentifier: getRequestSourceIdentifier(request.headers),
  });

  if (!checkoutResult.ok) {
    if (
      checkoutResult.reason === "internal_error" ||
      checkoutResult.reason === "invalid_amount" ||
      checkoutResult.reason === "preference_create_failed" ||
      checkoutResult.reason === "preference_missing_checkout_url" ||
      checkoutResult.reason === "payment_persist_failed"
    ) {
      return jsonError("Internal Server Error", 500);
    }

    return badRequest(checkoutResult.reason);
  }

  return jsonOk({
    order_id: checkoutResult.checkout.orderId,
    reservation_id: checkoutResult.checkout.reservationId,
    provider: checkoutResult.checkout.provider,
    preference_id: checkoutResult.checkout.preferenceId,
    checkout_url: checkoutResult.checkout.checkoutUrl,
    expires_at: checkoutResult.checkout.expiresAt,
    amount_cents: checkoutResult.checkout.amountCents,
    currency: checkoutResult.checkout.currency,
  });
}

export function GET() {
  return methodNotAllowed(["POST"]);
}

export function PUT() {
  return methodNotAllowed(["POST"]);
}

export function PATCH() {
  return methodNotAllowed(["POST"]);
}

export function DELETE() {
  return methodNotAllowed(["POST"]);
}
