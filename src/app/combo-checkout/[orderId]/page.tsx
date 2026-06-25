import { getEnv } from "@/lib/env";
import { getPublicComboCheckoutOrder } from "@/lib/tickets/services/comboOffers";
import BrandLogo from "@/app/BrandLogo";
import ComboCheckoutClient from "./combo-checkout-client";

type ComboCheckoutPageProps = {
  params: Promise<{
    orderId: string;
  }>;
  searchParams: Promise<{
    t?: string;
    token?: string;
  }>;
};

function formatCurrency(cents: number) {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(cents / 100);
}

export default async function ComboCheckoutPage({
  params,
  searchParams,
}: ComboCheckoutPageProps) {
  const { orderId } = await params;
  const query = await searchParams;
  const checkoutToken = query.t ?? query.token ?? "";
  const order = await getPublicComboCheckoutOrder(
    decodeURIComponent(orderId),
    checkoutToken,
  );
  const publicKey = getEnv().NEXT_PUBLIC_MERCADO_PAGO_PUBLIC_KEY;

  if (!order) {
    return (
      <main className="checkout-unavailable-shell">
        <div className="page-card-stack">
          <BrandLogo />
          <section className="checkout-unavailable-panel">
            <h1>Oferta indisponivel</h1>
            <p>
              Esta oferta expirou ou ja nao esta aguardando pagamento. Volte ao
              WhatsApp se quiser receber uma nova oferta.
            </p>
          </section>
        </div>
      </main>
    );
  }

  return (
    <ComboCheckoutClient
      publicKey={publicKey}
      checkoutToken={checkoutToken}
      order={{
        orderId: order.orderId,
        expiresAt: order.expiresAt,
        totalLabel: formatCurrency(order.amountCents),
        customerEmail: order.customerEmail,
        eventTitle: order.event.title,
        eventDate: order.event.startsAt,
        offer: {
          name: order.offer.name,
          description: order.offer.description,
          quantity: order.offer.quantity,
          unitPriceLabel: formatCurrency(order.offer.unitPriceCents),
        },
      }}
    />
  );
}
