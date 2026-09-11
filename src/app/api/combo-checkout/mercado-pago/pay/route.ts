import {
  badRequest,
  jsonError,
  jsonOk,
  methodNotAllowed,
} from "@/lib/http/responses";
import { logWarn } from "@/lib/logger";
import {
  consumeRateLimit,
  rateLimitResponse,
} from "@/lib/security/rateLimit";
import { payComboCheckout } from "@/lib/tickets/services/comboOffers";

const MAX_PAYMENT_BYTES = 32 * 1024;
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function onlyDigits(value: string) {
  return value.replace(/\D/g, "");
}

function isValidCheckoutEmail(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());
}

async function readPaymentBody(request: Request) {
  const contentLength = request.headers.get("content-length");

  if (contentLength && Number(contentLength) > MAX_PAYMENT_BYTES) {
    return { ok: false as const, response: badRequest("Bad Request") };
  }

  const rawBody = await request.text();

  if (new TextEncoder().encode(rawBody).byteLength > MAX_PAYMENT_BYTES) {
    return { ok: false as const, response: badRequest("Bad Request") };
  }

  try {
    const body = JSON.parse(rawBody) as unknown;

    if (!body || typeof body !== "object") {
      return { ok: false as const, response: badRequest("Bad Request") };
    }

    return { ok: true as const, body: body as Record<string, unknown> };
  } catch {
    return { ok: false as const, response: badRequest("Bad Request") };
  }
}

export async function POST(request: Request) {
  const rateLimit = await consumeRateLimit({
    routeKey: "combo-checkout:mercado-pago:pay",
    limit: 20,
    windowSeconds: 60,
    request,
  });

  if (!rateLimit.allowed) {
    logWarn("Rate limited Black House combo payment request", {
      sourceHash: rateLimit.sourceHash,
      count: rateLimit.count,
    });
    return rateLimitResponse(rateLimit);
  }

  const bodyResult = await readPaymentBody(request);

  if (!bodyResult.ok) return bodyResult.response;

  const requestUrl = new URL(request.url);
  const rawOrderId =
    typeof bodyResult.body.orderId === "string"
      ? bodyResult.body.orderId.trim()
      : requestUrl.searchParams.get("orderId") ?? "";
  const rawCheckoutToken =
    typeof bodyResult.body.checkoutToken === "string"
      ? bodyResult.body.checkoutToken.trim()
      : requestUrl.searchParams.get("t") ?? requestUrl.searchParams.get("token") ?? "";
  const rawMethod =
    typeof bodyResult.body.method === "string"
      ? bodyResult.body.method.toLowerCase().trim()
      : "";
  const email = bodyResult.body.email;
  const identificationNumber = bodyResult.body.identificationNumber;

  if (!UUID_PATTERN.test(rawOrderId)) {
    return badRequest("Pedido invalido.");
  }

  if (rawMethod !== "pix") {
    return badRequest("Metodo de pagamento invalido.");
  }

  if (email != null && typeof email !== "string") {
    return badRequest("E-mail invalido.");
  }

  const emailValue = typeof email === "string" ? email : "";
  const cpfValue = typeof identificationNumber === "string" ? identificationNumber : "";
  if (!isValidCheckoutEmail(emailValue)) {
    return badRequest("Informe um e-mail valido.");
  }
  if (onlyDigits(cpfValue).length !== 11) {
    return badRequest("Informe o CPF com 11 digitos.");
  }

  const result = await payComboCheckout({
    orderId: rawOrderId,
    checkoutToken: rawCheckoutToken,
    email: typeof email === "string" ? email : "",
    identificationNumber:
      typeof identificationNumber === "string" ? identificationNumber : undefined,
  });

  if (!result.ok) {
    if (
      result.reason === "payment_create_failed" ||
      result.reason === "payment_persist_failed"
    ) {
      return jsonError("Internal Server Error", 500);
    }

    return badRequest(result.reason);
  }

  return jsonOk({
    status: result.status,
    qr_code: result.qrCode,
    qr_image: result.qrImage,
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
