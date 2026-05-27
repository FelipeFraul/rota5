import { cookies } from "next/headers";
import { AdminLoginForm } from "./[token]/AdminLoginForm";
import { ADMIN_LOGIN_CHALLENGE_COOKIE } from "@/lib/http/accessCookies";
import { getAdminLoginChallengeByToken } from "@/lib/tickets/services/adminAuth";
import { buildPublicAdminLoginChallengeDto } from "@/lib/tickets/services/publicDtos";

export default async function AdminLoginPage() {
  const cookieStore = await cookies();
  const token = cookieStore.get(ADMIN_LOGIN_CHALLENGE_COOKIE)?.value ?? "";
  const challengeResult = token
    ? await getAdminLoginChallengeByToken(token)
    : { ok: false as const };
  const publicChallenge = buildPublicAdminLoginChallengeDto(challengeResult);

  if (!publicChallenge.ok) {
    return (
      <main className="admin-login-shell">
        <section className="admin-login-card">
          <p className="admin-login-kicker">Login administrativo</p>
          <h1>Link invalido ou expirado</h1>
          <p>
            Volte ao WhatsApp e envie admin para receber um novo link de login.
          </p>
        </section>
      </main>
    );
  }

  return (
    <main className="admin-login-shell">
      <AdminLoginForm />
    </main>
  );
}
