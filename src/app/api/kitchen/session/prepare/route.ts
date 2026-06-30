import { badRequest, jsonOk, methodNotAllowed } from "@/lib/http/responses";
import {
  consumeRateLimit,
  hashRateLimitScope,
  rateLimitResponse,
} from "@/lib/security/rateLimit";
import { startKitchenOrderPreparation } from "@/lib/tickets/services/comboRedemptions";
import { cookies } from "next/headers";
import { KITCHEN_DEVICE_COOKIE } from "@/lib/tickets/services/gateSessions";

export async function POST(request: Request) {
  let payload: { token?: unknown; redemptionId?: unknown };

  try {
    payload = (await request.json()) as typeof payload;
  } catch {
    return badRequest("Bad request");
  }

  if (
    typeof payload.token !== "string" ||
    !payload.token.trim() ||
    typeof payload.redemptionId !== "string" ||
    !payload.redemptionId.trim()
  ) {
    return badRequest("Bad request");
  }

  const rateLimit = await consumeRateLimit({
    routeKey: "kitchen:session:prepare",
    limit: 120,
    windowSeconds: 60,
    request,
    scope: `kitchen:${hashRateLimitScope(payload.token)}`,
  });

  if (!rateLimit.allowed) return rateLimitResponse(rateLimit);

  return jsonOk(
    await startKitchenOrderPreparation({
      token: payload.token.trim(),
      redemptionId: payload.redemptionId.trim(),
      deviceToken: (await cookies()).get(KITCHEN_DEVICE_COOKIE)?.value,
    }),
  );
}

export function GET() {
  return methodNotAllowed(["POST"]);
}

export const PUT = GET;
export const PATCH = GET;
export const DELETE = GET;
