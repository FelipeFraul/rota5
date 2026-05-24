import {
  badRequest,
  jsonError,
  jsonOk,
  methodNotAllowed,
} from "@/lib/http/responses";
import { paySelfHostedCheckout } from "@/lib/tickets/services/checkout";

const MAX_PAYMENT_BYTES = 32 * 1024;
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{12}$/i;

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
  const bodyResult = await readPaymentBody(request);

  if (!bodyResult.ok) {
    return bodyResult.response;
  }

  const rawOrderId = bodyResult.body.orderId ?? bodyResult.body.order_id;
  const rawMethod = bodyResult.body.method;
  const {
    email,
    identificationNumber,
    token,
    paymentMethodId,
    installments,
  } = bodyResult.body;
  const orderId = typeof rawOrderId === "string" ? rawOrderId : "";
  const method =
    typeof rawMethod === "string" ? rawMethod.toLowerCase().trim() : "";
  const parsedInstallments =
    typeof installments === "number"
      ? installments
      : typeof installments === "string"
        ? Number(installments)
        : undefined;

  if (
    !UUID_PATTERN.test(orderId) ||
    (method !== "pix" && method !== "card") ||
    (email != null && typeof email !== "string")
  ) {
    return badRequest("Dados de pagamento inválidos.");
  }

  const result = await paySelfHostedCheckout({
    orderId,
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
    provider_payment_id: result.providerPaymentId,
    qr_code: result.qrCode,
    ticket_url: result.ticketUrl,
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
