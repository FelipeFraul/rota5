import { KitchenSessionScanner } from "./KitchenSessionScanner";
import { validateKitchenOrdersToken } from "@/lib/tickets/services/comboRedemptions";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { KITCHEN_DEVICE_COOKIE } from "@/lib/tickets/services/gateSessions";

type KitchenSessionPageProps = {
  params: Promise<{
    token: string;
  }>;
  searchParams: Promise<{
    opened?: string;
  }>;
};

export default async function KitchenSessionPage({
  params,
  searchParams,
}: KitchenSessionPageProps) {
  const { token } = await params;
  const { opened } = await searchParams;
  const deviceToken = (await cookies()).get(KITCHEN_DEVICE_COOKIE)?.value;
  if (!deviceToken) {
    if (opened === "1") {
      return (
        <main className="kitchen-shell">
          <section className="kitchen-empty">
            <h1>Não foi possível salvar o acesso</h1>
            <p>Ative os cookies deste site e abra novamente o link da cozinha.</p>
            <a href={`/api/kitchen/session/open?token=${encodeURIComponent(token)}`}>
              Tentar novamente
            </a>
          </section>
        </main>
      );
    }
    redirect(`/api/kitchen/session/open?token=${encodeURIComponent(token)}`);
  }
  const initialValidation = await validateKitchenOrdersToken(token, deviceToken);
  if (!initialValidation.valid && initialValidation.reason === "device_mismatch") {
    redirect(`/api/kitchen/session/open?token=${encodeURIComponent(token)}`);
  }

  return <KitchenSessionScanner initialValidation={initialValidation} />;
}
