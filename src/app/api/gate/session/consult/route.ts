import { badRequest, jsonOk, methodNotAllowed } from "@/lib/http/responses";
import {
  consumeRateLimit,
  hashRateLimitScope,
  rateLimitResponse,
} from "@/lib/security/rateLimit";
import { consultGateTicket } from "@/lib/tickets/services/gateTicketConsultation";

export async function POST(request: Request) {
  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return badRequest("Bad request");
  }

  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    return badRequest("Bad request");
  }

  const { gateSessionToken, ticketCode } = payload as Record<string, unknown>;
  if (
    typeof gateSessionToken !== "string" ||
    !gateSessionToken.trim() ||
    typeof ticketCode !== "string" ||
    !/^TCK-[A-Z0-9]+$/i.test(ticketCode.trim())
  ) {
    return badRequest("Bad request");
  }

  const rateLimit = await consumeRateLimit({
    routeKey: "gate:session:consult",
    limit: 60,
    windowSeconds: 60,
    request,
    scope: `gate:${hashRateLimitScope(gateSessionToken)}`,
  });
  if (!rateLimit.allowed) return rateLimitResponse(rateLimit);

  return jsonOk(
    await consultGateTicket({
      gateSessionToken: gateSessionToken.trim(),
      ticketCode: ticketCode.trim(),
    }),
  );
}

export function GET() {
  return methodNotAllowed(["POST"]);
}

export const PUT = GET;
export const PATCH = GET;
export const DELETE = GET;
