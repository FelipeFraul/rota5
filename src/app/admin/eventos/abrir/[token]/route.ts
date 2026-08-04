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
    `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Link expirado</title><style>:root{color-scheme:light;--app-bg-image:url("/rota5.webp");font-family:Roboto,Arial,Helvetica,sans-serif}*{box-sizing:border-box}body{margin:0;background:#0b0f18;font-family:Roboto,Arial,Helvetica,sans-serif}.admin-login-shell{display:grid;min-height:100svh;place-items:center;padding:24px;background:var(--app-bg-image) center/cover no-repeat;color:#111827}.page-card-stack{display:grid;justify-items:center;width:min(100%,390px)}.admin-login-card{width:100%;padding:28px 24px;border:1px solid #e5e7eb;border-radius:8px;background:#fff;box-shadow:0 22px 70px rgba(0,0,0,.18)}.admin-login-kicker{margin:0 0 10px;color:#006c67;font-size:13px;font-weight:900;letter-spacing:.12em;text-transform:uppercase}.admin-login-card h1{margin:8px 0 16px;color:#020617;font-size:28px;font-weight:900;line-height:1.08}.admin-login-card p{margin:10px 0;color:#334155;font-size:16px;font-weight:400;line-height:1.45}</style></head><body><main class="admin-login-shell"><div class="page-card-stack"><section class="admin-login-card"><p class="admin-login-kicker">Acesso nao liberado</p><h1>Link expirado</h1><p>Volte ao WhatsApp, envie a opcao 2 novamente e abra o novo link de edicao.</p></section></div></main></body></html>`,
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
