import { NextRequest } from "next/server";
import { GATE_SESSION_COOKIE } from "@/lib/http/accessCookies";
import { jsonOk, methodNotAllowed, unauthorized } from "@/lib/http/responses";
import {
  consumeRateLimit,
  rateLimitResponse,
} from "@/lib/security/rateLimit";
import { buildPublicGateSessionDto } from "@/lib/tickets/services/publicDtos";
import { validateGateSessionToken } from "@/lib/tickets/services/gateSessions";

export async function POST(request: NextRequest) {
  const rateLimit = await consumeRateLimit({
    routeKey: "gate:session:validate",
    limit: 60,
    windowSeconds: 60,
    request,
  });

  if (!rateLimit.allowed) {
    return rateLimitResponse(rateLimit);
  }

  const token = request.cookies.get(GATE_SESSION_COOKIE)?.value.trim() ?? "";

  if (!token) {
    return unauthorized();
  }

  const result = await validateGateSessionToken(token);

  return jsonOk(buildPublicGateSessionDto(result));
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
