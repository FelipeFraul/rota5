import { KitchenAccessClient } from "./KitchenAccessClient";

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
      <main className="kitchen-shell">
        <section className="kitchen-empty">
          <h1>Link inválido</h1>
          <p>Solicite um novo acesso pelo WhatsApp.</p>
        </section>
      </main>
    );
  }

  return (
    <KitchenAccessClient
      token={normalizedToken}
      reader={reader === "1"}
    />
  );
}
