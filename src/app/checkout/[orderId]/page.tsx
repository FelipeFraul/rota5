import { getEnv } from "@/lib/env";
import { getPublicCheckoutOrder } from "@/lib/tickets/services/checkout";
import CheckoutClient from "./checkout-client";

type CheckoutPageProps = {
  params: Promise<{
    orderId: string;
  }>;
};

function formatCurrency(cents: number) {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(cents / 100);
}

export default async function CheckoutPage({ params }: CheckoutPageProps) {
  const { orderId } = await params;
  const order = await getPublicCheckoutOrder(decodeURIComponent(orderId));
  const publicKey = getEnv().NEXT_PUBLIC_MERCADO_PAGO_PUBLIC_KEY;

  if (!order) {
    return (
      <main className="checkout-unavailable-shell">
        <section className="checkout-unavailable-panel">
          <h1>Pagamento indisponível</h1>
          <p>
            Esta reserva expirou ou já não está aguardando pagamento. Volte ao
            WhatsApp e gere uma nova compra.
          </p>
        </section>
      </main>
    );
  }

  return (
    <CheckoutClient
      publicKey={publicKey}
      order={{
        orderId: order.orderId,
        expiresAt: order.expiresAt,
        totalLabel: formatCurrency(order.amountCents),
        customerEmail: order.customerEmail,
        items: order.items.map((item) => ({
          name: item.name,
          quantity: item.quantity,
          unitPriceLabel: formatCurrency(item.unitPriceCents),
        })),
      }}
    />
  );
}
