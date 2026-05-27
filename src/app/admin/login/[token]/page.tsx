import { AdminLoginForm } from "./AdminLoginForm";
import { getAdminLoginChallengeByToken } from "@/lib/tickets/services/adminAuth";

type AdminLoginPageProps = {
  params: Promise<{
    token: string;
  }>;
};

export default async function AdminLoginPage({ params }: AdminLoginPageProps) {
  const { token } = await params;
  const challengeResult = await getAdminLoginChallengeByToken(token);

  if (!challengeResult.ok) {
    return (
      <main className="admin-login-shell">
        <section className="admin-login-card">
          <p className="admin-login-kicker">Login administrativo</p>
          <h1>Link inválido ou expirado</h1>
          <p>
            Volte ao WhatsApp e envie admin para receber um novo link de login.
          </p>
        </section>
      </main>
    );
  }

  return (
    <main className="admin-login-shell">
      <AdminLoginForm
        token={token}
        expiresAt={challengeResult.challenge.expires_at}
      />
    </main>
  );
}
