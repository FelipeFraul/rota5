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
import { validateComboRedemptionScan } from "@/lib/tickets/services/comboRedemptions";
import { cookies } from "next/headers";
import { KITCHEN_READER_DEVICE_COOKIE } from "@/lib/tickets/services/gateSessions";

type ScanPayload = {
  kitchenSessionToken?: unknown;
  comboToken?: unknown;
};

async function readScanPayload(request: Request) {
  try {
    const payload = (await request.json()) as unknown;

    if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
      return null;
    }

    const { kitchenSessionToken, comboToken } = payload as ScanPayload;

    if (
      typeof kitchenSessionToken !== "string" ||
      !kitchenSessionToken.trim() ||
      typeof comboToken !== "string" ||
      !comboToken.trim()
    ) {
      return null;
    }

    return {
      kitchenSessionToken: kitchenSessionToken.trim(),
      comboToken: comboToken.trim(),
    };
  } catch {
    return null;
  }
}

export async function POST(request: Request) {
  const payload = await readScanPayload(request);

  if (!payload) {
    return badRequest("Bad request");
  }

  const rateLimit = await consumeRateLimit({
    routeKey: "kitchen:session:scan",
    limit: 120,
    windowSeconds: 60,
    request,
    scope: `kitchen:${hashRateLimitScope(payload.kitchenSessionToken)}`,
    unavailablePolicy: "fail_closed_503",
  });

  const rateLimitFailure = rateLimitFailureResponse(rateLimit);
  if (rateLimitFailure) return rateLimitFailure;

  const result = await validateComboRedemptionScan({
    ...payload,
    deviceToken: (await cookies()).get(KITCHEN_READER_DEVICE_COOKIE)?.value,
  });

  return jsonOk({
    allowed: result.allowed,
    result: result.result,
    message: result.message,
    ...(result.redemption
      ? {
          redemptionCode: result.redemption.redemptionCode,
          offerName: result.redemption.offerName,
          quantity: result.redemption.quantity,
        }
      : {}),
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
