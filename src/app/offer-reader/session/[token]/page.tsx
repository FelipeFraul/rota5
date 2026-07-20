import { validateKitchenSessionToken } from "@/lib/tickets/services/comboRedemptions";
import { OfferQrScanner } from "./OfferQrScanner";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { KITCHEN_READER_DEVICE_COOKIE } from "@/lib/tickets/services/gateSessions";

export default async function OfferReaderPage({
  params,
  searchParams,
}: {
  params: Promise<{ token: string }>;
  searchParams: Promise<{ opened?: string }>;
}) {
  const { token } = await params;
  const { opened } = await searchParams;
  const deviceToken = (await cookies()).get(KITCHEN_READER_DEVICE_COOKIE)?.value;
  if (!deviceToken) {
    if (opened === "1") {
      return (
        <main className="gate-shell">
          <h1>Não foi possível salvar o acesso</h1>
          <p>Ative os cookies deste site e abra novamente o link do leitor.</p>
          <a
            href={`/api/kitchen/session/open?reader=1&token=${encodeURIComponent(token)}`}
          >
            Tentar novamente
          </a>
        </main>
      );
    }
    redirect(`/api/kitchen/session/open?token=${encodeURIComponent(token)}&reader=1`);
  }
  const validation = await validateKitchenSessionToken(token, deviceToken);
  if (!validation.valid && validation.reason === "device_mismatch") {
    redirect(`/api/kitchen/session/open?token=${encodeURIComponent(token)}&reader=1`);
  }

  return <OfferQrScanner initialValid={validation.valid} />;
}
