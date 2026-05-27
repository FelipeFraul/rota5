import { NextRequest, NextResponse } from "next/server";
import {
  ADMIN_LOGIN_CHALLENGE_COOKIE,
  clearAccessCookie,
  secondsUntil,
  setAccessCookie,
} from "@/lib/http/accessCookies";
import { getAdminLoginChallengeByToken } from "@/lib/tickets/services/adminAuth";

type AdminLoginBootstrapContext = {
  params: Promise<{
    token: string;
  }>;
};

export async function GET(
  request: NextRequest,
  { params }: AdminLoginBootstrapContext,
) {
  const { token } = await params;
  const loginUrl = new URL("/admin/login", request.url);
  const response = NextResponse.redirect(loginUrl);
  const challengeResult = await getAdminLoginChallengeByToken(token);

  if (!challengeResult.ok) {
    clearAccessCookie(response, ADMIN_LOGIN_CHALLENGE_COOKIE);
    return response;
  }

  setAccessCookie(
    response,
    ADMIN_LOGIN_CHALLENGE_COOKIE,
    token,
    secondsUntil(challengeResult.challenge.expires_at),
  );

  return response;
}
