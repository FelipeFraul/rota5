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
import { validateGateScan } from "@/lib/tickets/services/gateValidation";

type ScanPayload = {
  gateSessionToken?: unknown;
  ticketToken?: unknown;
};

async function readScanPayload(request: Request) {
  try {
    const payload = (await request.json()) as unknown;

    if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
      return null;
    }

    const { gateSessionToken, ticketToken } = payload as ScanPayload;

    if (
      typeof gateSessionToken !== "string" ||
      !gateSessionToken.trim() ||
      typeof ticketToken !== "string" ||
      !ticketToken.trim()
    ) {
      return null;
    }

    return {
      gateSessionToken: gateSessionToken.trim(),
      ticketToken: ticketToken.trim(),
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
    routeKey: "gate:session:scan",
    limit: 120,
    windowSeconds: 60,
    request,
    scope: `gate:${hashRateLimitScope(payload.gateSessionToken)}`,
  });

  if (!rateLimit.allowed) {
    return rateLimitResponse(rateLimit);
  }

  const result = await validateGateScan(payload);

  return jsonOk(result);
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
