import {
  badRequest,
  jsonOk,
  methodNotAllowed,
} from "@/lib/http/responses";
import {
  consumeRateLimit,
  hashRateLimitScope,
  rateLimitFailureResponse,
} from "@/lib/security/rateLimit";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import {
  reconcileApprovedCheckoutPayment,
  verifyPublicCheckoutAccess,
} from "@/lib/tickets/services/checkout";

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function GET(request: Request) {
  const url = new URL(request.url);
  const orderId = url.searchParams.get("orderId") ?? "";
  const checkoutToken = url.searchParams.get("t") ?? url.searchParams.get("token") ?? "";

  if (!UUID_PATTERN.test(orderId)) {
    return badRequest("Pedido inválido.");
  }

  const rateLimit = await consumeRateLimit({
    routeKey: "checkout:status",
    limit: 90,
    windowSeconds: 60,
    request,
    scope: `order:${hashRateLimitScope(orderId)}`,
    unavailablePolicy: "fail_closed_503",
  });

  const rateLimitFailure = rateLimitFailureResponse(rateLimit);
  if (rateLimitFailure) return rateLimitFailure;

  if (!(await verifyPublicCheckoutAccess(orderId, checkoutToken))) {
    return badRequest("Pedido inválido.");
  }

  await reconcileApprovedCheckoutPayment(orderId);

  const supabase = getSupabaseAdmin();
  const { data: order, error } = await supabase
    .from("orders")
    .select("status")
    .eq("id", orderId)
    .maybeSingle<{ status: string }>();

  if (error) {
    throw error;
  }

  return jsonOk({
    status: order?.status === "paid" ? "approved" : "pending",
  });
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
