import { NextResponse } from "next/server";
import {
  ADMIN_WEB_AUTH_COOKIES,
  createAdminWebSession,
  hasAdminPermission,
  verifyAdminEventEditorDirectToken,
} from "@/lib/tickets/services/adminAuth";

type RouteContext = {
  params: Promise<{
    token?: string;
  }>;
};

function renderAccessError() {
  return new NextResponse(
    `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Link expirado</title><style>body{margin:0;min-height:100vh;display:grid;place-items:center;padding:24px;background:#111;color:#0f172a;font-family:Roboto,Arial,Helvetica,sans-serif;font-weight:400}.card{width:min(390px,100%);padding:28px 24px;border-radius:8px;background:#fff;box-shadow:0 22px 70px rgba(0,0,0,.18)}.k{margin:0 0 10px;color:#006c67;font-size:13px;font-weight:900;letter-spacing:.12em;text-transform:uppercase}h1{margin:0 0 14px;font-size:28px;font-weight:900;line-height:1.08}p{margin:0;color:#475569;font-size:16px;font-weight:400;line-height:1.45}</style></head><body><main class="card"><p class="k">Acesso nao liberado</p><h1>Link expirado</h1><p>Volte ao WhatsApp, envie a opcao 2 novamente e abra o novo link de edicao.</p></main></body></html>`,
    {
      status: 401,
      headers: {
        "content-type": "text/html; charset=utf-8",
      },
    },
  );
}

export async function GET(request: Request, context: RouteContext) {
  const { token = "" } = await context.params;
  const result = await verifyAdminEventEditorDirectToken(token);

  if (
    !result.ok ||
    !hasAdminPermission(result.adminUser.role, "manage_events")
  ) {
    return renderAccessError();
  }

  const webSession = await createAdminWebSession(result.adminUser);

  if (!webSession.ok) {
    return renderAccessError();
  }

  const response = NextResponse.redirect(new URL("/admin/eventos", request.url));
  response.cookies.set(ADMIN_WEB_AUTH_COOKIES.session, webSession.cookieValue, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    expires: new Date(webSession.expiresAt),
  });
  response.cookies.set(ADMIN_WEB_AUTH_COOKIES.csrf, webSession.csrfCookieValue, {
    httpOnly: false,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    expires: new Date(webSession.expiresAt),
  });

  return response;
}
