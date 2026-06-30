import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import {
  claimKitchenSessionDevice,
  KITCHEN_DEVICE_COOKIE,
  KITCHEN_READER_DEVICE_COOKIE,
  KITCHEN_SESSION_TTL_MINUTES,
} from "@/lib/tickets/services/gateSessions";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const token = url.searchParams.get("token")?.trim();
  if (!token) return new NextResponse("Link da cozinha invalido.", { status: 400 });

  const cookieStore = await cookies();
  const reader = url.searchParams.get("reader") === "1";
  const deviceCookie = reader
    ? KITCHEN_READER_DEVICE_COOKIE
    : KITCHEN_DEVICE_COOKIE;
  const claim = await claimKitchenSessionDevice(
    token,
    cookieStore.get(deviceCookie)?.value,
    reader ? "reader" : "board",
  );

  if (!claim.ok) {
    return new NextResponse(
      claim.reason === "claimed"
        ? "Este acesso da cozinha ja esta vinculado a outro computador ou celular."
        : "Link da cozinha invalido ou expirado.",
      { status: 403, headers: { "Content-Type": "text/plain; charset=utf-8" } },
    );
  }

  const response = NextResponse.redirect(
    new URL(
      reader
        ? `/offer-reader/session/${encodeURIComponent(token)}`
        : `/kitchen/session/${encodeURIComponent(token)}`,
      url.origin,
    ),
  );
  response.cookies.set(deviceCookie, claim.deviceToken, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict",
    path: "/",
    maxAge: KITCHEN_SESSION_TTL_MINUTES * 60,
  });
  return response;
}
