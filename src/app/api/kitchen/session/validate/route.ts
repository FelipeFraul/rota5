import {
  badRequest,
  jsonOk,
  methodNotAllowed,
} from "@/lib/http/responses";
import {
  consumeRateLimit,
  rateLimitFailureResponse,
} from "@/lib/security/rateLimit";
import { validateKitchenOrdersToken } from "@/lib/tickets/services/comboRedemptions";
import { cookies } from "next/headers";
import { KITCHEN_DEVICE_COOKIE } from "@/lib/tickets/services/gateSessions";

async function readToken(request: Request) {
  try {
    const payload = (await request.json()) as unknown;

    if (
      !payload ||
      typeof payload !== "object" ||
      Array.isArray(payload) ||
      typeof (payload as { token?: unknown }).token !== "string" ||
      !(payload as { token: string }).token.trim()
    ) {
      return null;
    }

    return (payload as { token: string }).token.trim();
  } catch {
    return null;
  }
}

export async function POST(request: Request) {
  const rateLimit = await consumeRateLimit({
    routeKey: "kitchen:session:validate",
    limit: 60,
    windowSeconds: 60,
    request,
    unavailablePolicy: "fail_closed_503",
  });

  const rateLimitFailure = rateLimitFailureResponse(rateLimit);
  if (rateLimitFailure) return rateLimitFailure;

  const token = await readToken(request);

  if (!token) {
    return badRequest("Bad request");
  }

  const deviceToken = (await cookies()).get(KITCHEN_DEVICE_COOKIE)?.value;
  return jsonOk(await validateKitchenOrdersToken(token, deviceToken));
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
