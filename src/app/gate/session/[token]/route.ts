import { NextRequest, NextResponse } from "next/server";
import {
  GATE_SESSION_COOKIE,
  clearAccessCookie,
  secondsUntil,
  setAccessCookie,
} from "@/lib/http/accessCookies";
import { validateGateSessionToken } from "@/lib/tickets/services/gateSessions";

type GateSessionBootstrapContext = {
  params: Promise<{
    token: string;
  }>;
};

export async function GET(
  request: NextRequest,
  { params }: GateSessionBootstrapContext,
) {
  const { token } = await params;
  const gateUrl = new URL("/gate/session", request.url);
  const response = NextResponse.redirect(gateUrl);
  const validation = await validateGateSessionToken(token);

  if (!validation.valid) {
    clearAccessCookie(response, GATE_SESSION_COOKIE);
    return response;
  }

  setAccessCookie(
    response,
    GATE_SESSION_COOKIE,
    token,
    secondsUntil(validation.gateSession.expiresAt),
  );

  return response;
}
