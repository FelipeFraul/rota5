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
import { buildPublicGateScanResponseDto } from "@/lib/tickets/services/publicDtos";
import {
  validateGateScan,
  validateGateTicketCode,
} from "@/lib/tickets/services/gateValidation";

type ScanPayload = {
  gateSessionToken?: unknown;
  ticketToken?: unknown;
  ticketCode?: unknown;
};

async function readScanPayload(request: Request) {
  try {
    const payload = (await request.json()) as unknown;

    if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
      return null;
    }

    const { gateSessionToken, ticketToken, ticketCode } = payload as ScanPayload;

    if (
      typeof gateSessionToken !== "string" ||
      !gateSessionToken.trim()
    ) {
      return null;
    }

    const normalizedTicketToken =
      typeof ticketToken === "string" ? ticketToken.trim() : "";
    const normalizedTicketCode =
      typeof ticketCode === "string" ? ticketCode.trim().toUpperCase() : "";

    if (
      !normalizedTicketToken &&
      !/^TCK-[A-Z0-9]+$/i.test(normalizedTicketCode)
    ) {
      return null;
    }

    return {
      gateSessionToken: gateSessionToken.trim(),
      ...(normalizedTicketToken
        ? { ticketToken: normalizedTicketToken }
        : { ticketCode: normalizedTicketCode }),
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

  const result =
    "ticketCode" in payload
      ? await validateGateTicketCode({
          gateSessionToken: payload.gateSessionToken,
          ticketCode: payload.ticketCode,
        })
      : await validateGateScan({
          gateSessionToken: payload.gateSessionToken,
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
