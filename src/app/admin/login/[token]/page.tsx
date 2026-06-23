import { AdminLoginForm } from "./AdminLoginForm";
import BrandLogo from "@/app/BrandLogo";
import { getAdminLoginChallengeByToken } from "@/lib/tickets/services/adminAuth";
import { buildPublicAdminLoginChallengeDto } from "@/lib/tickets/services/publicDtos";

type AdminLoginPageProps = {
  params: Promise<{
    token: string;
  }>;
};

export default async function AdminLoginPage({ params }: AdminLoginPageProps) {
  const { token } = await params;
  const challengeResult = await getAdminLoginChallengeByToken(token);
  const publicChallenge = buildPublicAdminLoginChallengeDto(challengeResult);

  if (!publicChallenge.ok) {
    return (
      <main className="admin-login-shell">
        <div className="page-card-stack">
          <BrandLogo />
          <section className="admin-login-card">
          <p className="admin-login-kicker">Login administrativo</p>
          <h1>Link inválido ou expirado</h1>
          <p>
            Volte ao WhatsApp e envie admin para receber um novo link de login.
          </p>
          </section>
        </div>
      </main>
    );
  }

  return (
    <main className="admin-login-shell">
      <AdminLoginForm />
    </main>
  );
}
