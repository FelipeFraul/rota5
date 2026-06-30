import { AdminLoginForm } from "./AdminLoginForm";
import { InformationPage } from "@/app/InformationPage";
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
      <InformationPage
        eyebrow="Login administrativo"
        title="Link inválido ou expirado"
        description="Volte ao WhatsApp e envie admin para receber um novo link de login."
      />
    );
  }

  return (
    <main className="admin-login-shell">
      <AdminLoginForm />
    </main>
  );
}
