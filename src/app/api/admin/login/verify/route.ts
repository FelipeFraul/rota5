import { NextRequest, NextResponse } from "next/server";
import {
  ADMIN_LOGIN_CHALLENGE_COOKIE,
  clearAccessCookie,
} from "@/lib/http/accessCookies";
import {
  consumeRateLimit,
  hashRateLimitScope,
  getRequestSourceIdentifier,
  rateLimitResponse,
} from "@/lib/security/rateLimit";
import { logWarn } from "@/lib/logger";
import { verifyAdminLoginChallengePassphrase } from "@/lib/tickets/services/adminAuth";

type VerifyPayload = {
  passphrase?: unknown;
};

function jsonError(message: string, status: number) {
  return NextResponse.json({ ok: false, message }, { status });
}

export async function POST(request: NextRequest) {
  let payload: VerifyPayload;

  try {
    payload = (await request.json()) as VerifyPayload;
  } catch {
    return jsonError("Requisição inválida.", 400);
  }

  const token = request.cookies.get(ADMIN_LOGIN_CHALLENGE_COOKIE)?.value.trim() ?? "";
  const passphrase =
    typeof payload.passphrase === "string" ? payload.passphrase : "";

  if (!token) {
    return jsonError("Nao foi possivel autenticar este acesso.", 401);
  }

  if (!passphrase) {
    return jsonError("Informe a senha individual.", 400);
  }

  const rateLimit = await consumeRateLimit({
    routeKey: "api:admin-login-verify",
    limit: 10,
    windowSeconds: 60,
    request,
    scope: `token:${hashRateLimitScope(token)}`,
  });

  if (!rateLimit.allowed) {
    logWarn("Rate limited admin web login verification", {
      sourceHash: rateLimit.sourceHash,
      count: rateLimit.count,
    });
    return rateLimitResponse(rateLimit);
  }

  const result = await verifyAdminLoginChallengePassphrase({
    token,
    passphrase,
    sourceIdentifier: getRequestSourceIdentifier(request.headers),
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

  const response = NextResponse.json({
    ok: true,
    code: result.code,
  });
  clearAccessCookie(response, ADMIN_LOGIN_CHALLENGE_COOKIE);

  return response;
}

export function GET() {
  return jsonError("Method Not Allowed", 405);
}
