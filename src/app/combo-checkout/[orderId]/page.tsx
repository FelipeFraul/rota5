import { getEnv } from "@/lib/env";
import {
  formatComboDescription,
  getPublicComboCheckoutOrder,
  trackComboCheckoutClick,
} from "@/lib/tickets/services/comboOffers";
import { InformationPage } from "@/app/InformationPage";
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
  const decodedOrderId = decodeURIComponent(orderId);
  const checkoutToken = query.t ?? query.token ?? "";
  await trackComboCheckoutClick(decodedOrderId);
  const order = await getPublicComboCheckoutOrder(
    decodedOrderId,
    checkoutToken,
  );
  const publicKey = getEnv().NEXT_PUBLIC_MERCADO_PAGO_PUBLIC_KEY;

  if (!order) {
    return (
      <InformationPage
        eyebrow="Oferta"
        title="Oferta indisponível"
        description="Esta oferta expirou ou já não está aguardando pagamento. Volte ao WhatsApp se quiser receber uma nova oferta."
      />
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
          description: formatComboDescription(order.offer.description),
          imageUrl: order.offer.imageUrl,
          quantity: order.offer.quantity,
          unitPriceLabel: formatCurrency(order.offer.unitPriceCents),
        },
      }}
    />
  );
}
