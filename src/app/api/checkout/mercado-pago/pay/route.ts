import {
  badRequest,
  jsonError,
  jsonOk,
  methodNotAllowed,
} from "@/lib/http/responses";
import { logWarn } from "@/lib/logger";
import {
  consumeRateLimit,
  getRequestSourceIdentifier,
  rateLimitResponse,
} from "@/lib/security/rateLimit";
import { paySelfHostedCheckout } from "@/lib/tickets/services/checkout";

const MAX_PAYMENT_BYTES = 32 * 1024;
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function extractOrderIdFromRequestUrl(request: Request) {
  const referer = request.headers.get("referer");

  if (!referer) {
    return null;
  }

  try {
    const url = new URL(referer);
    const match = url.pathname.match(/\/checkout\/([^/]+)/);
    const value = match?.[1] ? decodeURIComponent(match[1]) : null;

    return value && UUID_PATTERN.test(value) ? value : null;
  } catch {
    return null;
  }
}

function pickValidOrderId(...values: unknown[]) {
  for (const value of values) {
    if (typeof value !== "string") {
      continue;
    }

    const trimmed = value.trim();

    if (UUID_PATTERN.test(trimmed)) {
      return trimmed;
    }
  }

  return "";
}

function summarizeOrderCandidate(value: unknown) {
  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();

  return {
    length: trimmed.length,
    last4: trimmed.slice(-4),
    valid: UUID_PATTERN.test(trimmed),
  };
}

async function readPaymentBody(request: Request) {
  const contentLength = request.headers.get("content-length");

  if (contentLength && Number(contentLength) > MAX_PAYMENT_BYTES) {
    return {
      ok: false as const,
      response: badRequest("Bad Request"),
    };
  }

  const rawBody = await request.text();

  if (new TextEncoder().encode(rawBody).byteLength > MAX_PAYMENT_BYTES) {
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
  const rateLimit = await consumeRateLimit({
    routeKey: "checkout:mercado-pago:pay",
    limit: 20,
    windowSeconds: 60,
    request,
  });

  if (!rateLimit.allowed) {
    logWarn("Rate limited Black House self-hosted payment request", {
      sourceHash: rateLimit.sourceHash,
      count: rateLimit.count,
    });
    return rateLimitResponse(rateLimit);
  }

  const bodyResult = await readPaymentBody(request);

  if (!bodyResult.ok) {
    return bodyResult.response;
  }

  const requestUrl = new URL(request.url);
  const rawOrderId = pickValidOrderId(
    bodyResult.body.orderId,
    bodyResult.body.order_id,
    bodyResult.body.orderNumber,
    bodyResult.body.order_number,
    requestUrl.searchParams.get("orderId"),
    requestUrl.searchParams.get("order_id"),
    requestUrl.searchParams.get("orderNumber"),
    requestUrl.searchParams.get("order_number"),
    extractOrderIdFromRequestUrl(request),
  );
  const rawMethod = bodyResult.body.method;
  const {
    email,
    identificationNumber,
    token,
    paymentMethodId,
    installments,
  } = bodyResult.body;
  const resolvedOrderId = rawOrderId;
  const method =
    typeof rawMethod === "string" ? rawMethod.toLowerCase().trim() : "";
  const parsedInstallments =
    typeof installments === "number"
      ? installments
      : typeof installments === "string"
        ? Number(installments)
        : undefined;

  if (!UUID_PATTERN.test(resolvedOrderId)) {
    const queryOrderId =
      requestUrl.searchParams.get("orderId") ??
      requestUrl.searchParams.get("order_id") ??
      requestUrl.searchParams.get("orderNumber") ??
      requestUrl.searchParams.get("order_number");

    logWarn("Rejected checkout payment without valid order id", {
      bodyKeys: Object.keys(bodyResult.body).slice(0, 12),
      bodyOrderId: summarizeOrderCandidate(bodyResult.body.orderId),
      queryOrderId: summarizeOrderCandidate(queryOrderId),
      hasQueryOrderId:
        requestUrl.searchParams.has("orderId") ||
        requestUrl.searchParams.has("order_id") ||
        requestUrl.searchParams.has("orderNumber") ||
        requestUrl.searchParams.has("order_number"),
      hasReferer: Boolean(request.headers.get("referer")),
    });
    return badRequest("Pedido inválido.");
  }

  if (method !== "pix" && method !== "card") {
    return badRequest("Método de pagamento inválido.");
  }

  if (email != null && typeof email !== "string") {
    return badRequest("E-mail inválido.");
  }

  const result = await paySelfHostedCheckout({
    orderId: resolvedOrderId,
    method,
    email: typeof email === "string" ? email : "",
    identificationNumber:
      typeof identificationNumber === "string" ? identificationNumber : undefined,
    token: typeof token === "string" ? token : undefined,
    paymentMethodId:
      typeof paymentMethodId === "string" ? paymentMethodId : undefined,
    installments:
      Number.isInteger(parsedInstallments) && parsedInstallments
        ? parsedInstallments
        : undefined,
    sourceIdentifier: getRequestSourceIdentifier(request.headers),
  });

  if (!result.ok) {
    if (
      result.reason === "payment_create_failed" ||
      result.reason === "payment_persist_failed" ||
      result.reason === "internal_error"
    ) {
      return jsonError("Internal Server Error", 500);
    }

    return badRequest(result.reason);
  }

  return jsonOk({
    status: result.status,
    qr_code: result.qrCode,
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
