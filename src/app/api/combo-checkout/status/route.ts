import {
  badRequest,
  jsonOk,
  methodNotAllowed,
} from "@/lib/http/responses";
import {
  consumeRateLimit,
  hashRateLimitScope,
  rateLimitResponse,
} from "@/lib/security/rateLimit";
import { getComboCheckoutStatus } from "@/lib/tickets/services/comboOffers";

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function GET(request: Request) {
  const url = new URL(request.url);
  const orderId = url.searchParams.get("orderId") ?? "";
  const checkoutToken = url.searchParams.get("t") ?? url.searchParams.get("token") ?? "";

  if (!UUID_PATTERN.test(orderId)) {
    return badRequest("Pedido invalido.");
  }

  const rateLimit = await consumeRateLimit({
    routeKey: "combo-checkout:status",
    limit: 90,
    windowSeconds: 60,
    request,
    scope: `combo:${hashRateLimitScope(orderId)}`,
  });

  if (!rateLimit.allowed) {
    return rateLimitResponse(rateLimit);
  }

  const status = await getComboCheckoutStatus(orderId, checkoutToken);

  if (!status) {
    return badRequest("Pedido invalido.");
  }

  return jsonOk({ status });
}

export function POST() {
  return methodNotAllowed(["GET"]);
}

export function PUT() {
  return methodNotAllowed(["GET"]);
}

export function PATCH() {
  return methodNotAllowed(["GET"]);
}

export function DELETE() {
  return methodNotAllowed(["GET"]);
}
