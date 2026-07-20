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
  const target = new URL("/kitchen/access", url.origin);
  target.searchParams.set("token", token);
  if (url.searchParams.get("reader") === "1") {
    target.searchParams.set("reader", "1");
  }
  return NextResponse.redirect(target, {
    headers: { "Cache-Control": "no-store, max-age=0" },
  });
}

export async function POST(request: Request) {
  let payload: { token?: unknown; reader?: unknown };
  try {
    payload = (await request.json()) as typeof payload;
  } catch {
    return NextResponse.json({ ok: false, reason: "invalid" }, { status: 400 });
  }
  const token =
    typeof payload.token === "string" ? payload.token.trim() : "";
  const reader = payload.reader === true;
  if (!token) {
    return NextResponse.json({ ok: false, reason: "invalid" }, { status: 400 });
  }
  const cookieStore = await cookies();
  const deviceCookie = reader
    ? KITCHEN_READER_DEVICE_COOKIE
    : KITCHEN_DEVICE_COOKIE;
  const claim = await claimKitchenSessionDevice(
    token,
    cookieStore.get(deviceCookie)?.value,
    reader ? "reader" : "board",
  );

  if (!claim.ok) {
    return NextResponse.json(
      {
        ok: false,
        reason: claim.reason,
        message:
          claim.reason === "claimed"
            ? "Este acesso da cozinha já está vinculado a outro navegador."
            : "Link da cozinha inválido ou expirado.",
      },
      { status: 403 },
    );
  }

  const target = reader
    ? `/offer-reader/session/${encodeURIComponent(token)}?opened=1`
    : `/kitchen/session/${encodeURIComponent(token)}?opened=1`;
  const response = NextResponse.json({ ok: true, target });
  response.cookies.set(deviceCookie, claim.deviceToken, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: KITCHEN_SESSION_TTL_MINUTES * 60,
  });
  return response;
}
