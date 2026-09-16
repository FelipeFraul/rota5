import { NextResponse } from "next/server";
import {
  consumeRateLimit,
  hashRateLimitScope,
  getRequestSourceIdentifier,
  rateLimitFailureResponse,
} from "@/lib/security/rateLimit";
import { logError, logWarn } from "@/lib/logger";
import {
  ADMIN_WEB_AUTH_COOKIES,
  createAdminWebSession,
  verifyAdminLoginChallengePassphrase,
} from "@/lib/tickets/services/adminAuth";

type VerifyPayload = {
  token?: unknown;
  passphrase?: unknown;
  mode?: unknown;
};

function jsonError(message: string, status: number) {
  return NextResponse.json({ ok: false, message }, { status });
}

async function handlePost(request: Request) {
  let payload: VerifyPayload;

  try {
    payload = (await request.json()) as VerifyPayload;
  } catch {
    return jsonError("Requisição inválida.", 400);
  }

  const token = typeof payload.token === "string" ? payload.token.trim() : "";
  const passphrase =
    typeof payload.passphrase === "string" ? payload.passphrase : "";
  const mode = typeof payload.mode === "string" ? payload.mode : "";
  const eventEditorMode = mode === "event_editor";

  if (!token || !passphrase) {
    return jsonError("Informe a senha individual.", 400);
  }

  const rateLimit = await consumeRateLimit({
    routeKey: "api:admin-login-verify",
    limit: 10,
    windowSeconds: 60,
    request,
    scope: `token:${hashRateLimitScope(token)}`,
    unavailablePolicy: "fail_closed_503",
  });

  const rateLimitFailure = rateLimitFailureResponse(rateLimit);
  if (rateLimitFailure) {
    if (rateLimit.status === "rate_limited") {
      logWarn("Rate limited admin web login verification", {
        sourceHash: rateLimit.sourceHash,
        count: rateLimit.count,
      });
    }
    return rateLimitFailure;
  }

  const result = await verifyAdminLoginChallengePassphrase({
    token,
    passphrase,
    sourceIdentifier: getRequestSourceIdentifier(request.headers),
    consumeOnPassphrase: eventEditorMode,
  });

  if (!result.ok) {
    if (result.reason === "blocked" && result.blockStatus.ok) {
      return jsonError(
        result.blockStatus.blocked && result.blockStatus.type === "temporary"
          ? `Acesso bloqueado temporariamente por ${result.blockStatus.retryAfterMinutes} minutos.`
          : "Acesso bloqueado. Peça ao Diretor para liberar seu administrador.",
        429,
      );
    }

    if (result.reason === "missing_passphrase_hash") {
      return jsonError(
        "Não foi possível autenticar este acesso. Peça ao Diretor para redefinir sua senha.",
        401,
      );
    }

    return jsonError("Não foi possível autenticar este acesso.", 401);
  }

  const webSession = await createAdminWebSession(result.adminUser);

  if (!webSession.ok) {
    return jsonError("Não foi possível abrir a sessão do navegador.", 500);
  }

  const response = NextResponse.json({
    ok: true,
    adminUrl: "/admin/eventos",
    ...(eventEditorMode ? {} : { code: result.code }),
  });

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

export async function POST(request: Request) {
  try {
    return await handlePost(request);
  } catch (error) {
    logError("Unhandled admin web login verification error", {
      error,
      hasCheckoutSecret: Boolean(process.env.CHECKOUT_INTERNAL_SECRET),
      hasSupabaseUrl: Boolean(process.env.SUPABASE_URL),
      hasSupabaseServiceRole: Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY),
    });

    return jsonError("Não foi possível autenticar este acesso agora.", 500);
  }
}

export function GET() {
  return jsonError("Method Not Allowed", 405);
}
