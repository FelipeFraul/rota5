import "server-only";

import type { NextResponse } from "next/server";

export const ADMIN_LOGIN_CHALLENGE_COOKIE = "admin_login_challenge";
export const GATE_SESSION_COOKIE = "gate_session";

const ACCESS_COOKIE_OPTIONS = {
  httpOnly: true,
  secure: true,
  sameSite: "lax" as const,
  path: "/",
};

export function secondsUntil(isoDate: string) {
  const expiresAt = new Date(isoDate).getTime();
  const seconds = Math.floor((expiresAt - Date.now()) / 1000);

  return Math.max(1, seconds);
}

export function setAccessCookie(
  response: NextResponse,
  name: string,
  value: string,
  maxAge: number,
) {
  response.cookies.set(name, value, {
    ...ACCESS_COOKIE_OPTIONS,
    maxAge,
  });
}

export function clearAccessCookie(response: NextResponse, name: string) {
  response.cookies.set(name, "", {
    ...ACCESS_COOKIE_OPTIONS,
    maxAge: 0,
  });
}
