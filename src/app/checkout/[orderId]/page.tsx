import { getEnv } from "@/lib/env";
import { getPublicCheckoutOrder } from "@/lib/tickets/services/checkout";
import { InformationPage } from "@/app/InformationPage";
import CheckoutClient from "./checkout-client";

type CheckoutPageProps = {
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

export default async function CheckoutPage({ params, searchParams }: CheckoutPageProps) {
  const { orderId } = await params;
  const query = await searchParams;
  const checkoutToken = query.t ?? query.token ?? "";
  const order = await getPublicCheckoutOrder(
    decodeURIComponent(orderId),
    checkoutToken,
  );
  const publicKey = getEnv().NEXT_PUBLIC_MERCADO_PAGO_PUBLIC_KEY;

  if (!order) {
    return (
      <InformationPage
        eyebrow="Pagamento"
        title="Pagamento indisponível"
        description="Esta reserva expirou ou já não está aguardando pagamento. Volte ao WhatsApp e gere uma nova compra."
      />
    );
  }

  return (
    <CheckoutClient
      publicKey={publicKey}
      checkoutToken={checkoutToken}
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
