import {
  badRequest,
  jsonOk,
  methodNotAllowed,
  unauthorized,
} from "@/lib/http/responses";
import { NextRequest } from "next/server";
import { GATE_SESSION_COOKIE } from "@/lib/http/accessCookies";
import {
  consumeRateLimit,
  hashRateLimitScope,
  rateLimitResponse,
} from "@/lib/security/rateLimit";
import { buildPublicGateScanResponseDto } from "@/lib/tickets/services/publicDtos";
import { validateGateScan } from "@/lib/tickets/services/gateValidation";

type ScanPayload = {
  ticketToken?: unknown;
};

async function readScanPayload(request: Request) {
  try {
    const payload = (await request.json()) as unknown;

    if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
      return null;
    }

    const { ticketToken } = payload as ScanPayload;

    if (
      typeof ticketToken !== "string" ||
      !ticketToken.trim()
    ) {
      return null;
    }

    return {
      ticketToken: ticketToken.trim(),
    };
  } catch {
    return null;
  }
}

export async function POST(request: NextRequest) {
  const payload = await readScanPayload(request);

  if (!payload) {
    return badRequest("Bad request");
  }

  const gateSessionToken =
    request.cookies.get(GATE_SESSION_COOKIE)?.value.trim() ?? "";

  if (!gateSessionToken) {
    return unauthorized();
  }

  const rateLimit = await consumeRateLimit({
    routeKey: "gate:session:scan",
    limit: 120,
    windowSeconds: 60,
    request,
    scope: `gate:${hashRateLimitScope(gateSessionToken)}`,
  });

  if (!rateLimit.allowed) {
    return rateLimitResponse(rateLimit);
  }

  const result = await validateGateScan({
    gateSessionToken,
    ticketToken: payload.ticketToken,
  });

  return jsonOk(buildPublicGateScanResponseDto(result));
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
