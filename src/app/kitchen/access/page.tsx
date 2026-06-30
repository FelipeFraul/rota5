import { KitchenAccessClient } from "./KitchenAccessClient";
import { InformationPage } from "@/app/InformationPage";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function KitchenAccessPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string; reader?: string }>;
}) {
  const { token, reader } = await searchParams;
  const normalizedToken = token?.trim() ?? "";

  if (!normalizedToken) {
    return (
      <InformationPage
        eyebrow="Sistema cozinha"
        title="Link inválido"
        description="Solicite um novo acesso pelo WhatsApp."
      />
    );
  }

  return (
    <KitchenAccessClient
      token={normalizedToken}
      reader={reader === "1"}
    />
  );
}
