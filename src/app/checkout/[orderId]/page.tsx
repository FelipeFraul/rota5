import type React from "react";
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
      <main style={styles.shell}>
        <section style={styles.panel}>
          <h1 style={styles.title}>Pagamento indisponível</h1>
          <p style={styles.muted}>
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

const styles: Record<string, React.CSSProperties> = {
  shell: {
    minHeight: "100vh",
    background: "#f6f7f9",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    padding: 24,
    fontFamily: "Arial, sans-serif",
  },
  panel: {
    width: "100%",
    maxWidth: 520,
    background: "#fff",
    border: "1px solid #e5e7eb",
    borderRadius: 8,
    padding: 24,
  },
  title: {
    margin: 0,
    fontSize: 24,
    color: "#111827",
  },
  muted: {
    color: "#4b5563",
    lineHeight: 1.5,
  },
};
