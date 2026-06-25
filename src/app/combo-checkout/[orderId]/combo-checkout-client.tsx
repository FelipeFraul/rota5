"use client";

import { useEffect, useState } from "react";
import BrandLogo from "@/app/BrandLogo";

type ComboCheckoutOrder = {
  orderId: string;
  expiresAt: string;
  totalLabel: string;
  customerEmail: string | null;
  eventTitle: string;
  eventDate: string;
  offer: {
    name: string;
    description: string;
    quantity: number;
    unitPriceLabel: string;
  };
};

type ComboCheckoutClientProps = {
  publicKey: string;
  checkoutToken: string;
  order: ComboCheckoutOrder;
};

function onlyDigits(value: string): string {
  return value.replace(/\D/g, "");
}

export default function ComboCheckoutClient({
  checkoutToken,
  order,
}: ComboCheckoutClientProps) {
  const [paymentApproved, setPaymentApproved] = useState(false);
  const [email, setEmail] = useState(order.customerEmail ?? "");
  const [identificationNumber, setIdentificationNumber] = useState("");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [pixCode, setPixCode] = useState<string | null>(null);
  const [pixImage, setPixImage] = useState<string | null>(null);

  const expiresAt = new Intl.DateTimeFormat("pt-BR", {
    hour: "2-digit",
    minute: "2-digit",
    day: "2-digit",
    month: "2-digit",
  }).format(new Date(order.expiresAt));
  const eventDate = new Intl.DateTimeFormat("pt-BR", {
    hour: "2-digit",
    minute: "2-digit",
    day: "2-digit",
    month: "2-digit",
  }).format(new Date(order.eventDate));

  useEffect(() => {
    if (!pixCode || paymentApproved) {
      return;
    }

    let cancelled = false;

    async function checkPaymentStatus() {
      try {
        const response = await fetch(
          `/api/combo-checkout/status?orderId=${encodeURIComponent(order.orderId)}&t=${encodeURIComponent(checkoutToken)}`,
        );

        if (!response.ok) return;

        const data = (await response.json()) as { status?: string };

        if (!cancelled && data.status === "approved") {
          setPaymentApproved(true);
          setMessage(null);
        }
      } catch {
        // O Pix continua visivel enquanto a confirmacao do Mercado Pago chega.
      }
    }

    checkPaymentStatus();
    const intervalId = window.setInterval(checkPaymentStatus, 5000);

    return () => {
      cancelled = true;
      window.clearInterval(intervalId);
    };
  }, [checkoutToken, order.orderId, paymentApproved, pixCode]);

  async function submitPix() {
    setLoading(true);
    setMessage(null);
    setPixCode(null);
    setPixImage(null);

    try {
      const response = await fetch(
        `/api/combo-checkout/mercado-pago/pay?orderId=${encodeURIComponent(order.orderId)}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            method: "pix",
            checkoutToken,
            orderId: order.orderId,
            email,
            identificationNumber,
          }),
        },
      );
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error?.message ?? "Nao foi possivel gerar o Pix.");
      }

      if (data.status === "approved") {
        setPaymentApproved(true);
        return;
      }

      setPixCode(data.qr_code ?? null);
      setPixImage(data.qr_image ?? null);
      setMessage("Pix gerado. Use o QR Code vermelho ou copie o codigo.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Nao foi possivel gerar o Pix.");
    } finally {
      setLoading(false);
    }
  }

  function copyPixCode() {
    if (pixCode) {
      navigator.clipboard?.writeText(pixCode).catch(() => undefined);
      setMessage("Codigo Pix copiado.");
    }
  }

  if (paymentApproved) {
    return (
      <main className="checkout-success-shell">
        <div className="page-card-stack">
          <BrandLogo />
          <section className="checkout-success-panel">
            <div className="checkout-success-icon" aria-hidden="true">
              <span className="checkout-success-icon-stem" />
              <span className="checkout-success-icon-kick" />
            </div>
            <p className="checkout-success-eyebrow">Combo</p>
            <h1>Pagamento aprovado</h1>
            <p className="checkout-success-text">
              Tudo certo. O QR Code vermelho do combo sera enviado pelo WhatsApp.
            </p>
            <div className="checkout-success-summary">
              <span>Total pago</span>
              <strong>{order.totalLabel}</strong>
            </div>
          </section>
        </div>
      </main>
    );
  }

  return (
    <main className="checkout-shell combo-checkout-shell">
      <div className="checkout-brand-header">
        <BrandLogo />
      </div>

      <section className="checkout-summary-panel">
        <p className="checkout-eyebrow">Oferta e combo</p>
        <h1>{order.offer.name}</h1>
        <p className="checkout-muted">{order.offer.description}</p>

        <div className="checkout-items">
          <div className="checkout-item-row">
            <span>Evento</span>
            <strong>{order.eventTitle}</strong>
          </div>
          <div className="checkout-item-row">
            <span>Data</span>
            <strong>{eventDate}</strong>
          </div>
          <div className="checkout-item-row">
            <span>
              {order.offer.quantity}x {order.offer.name}
            </span>
            <strong>{order.offer.unitPriceLabel}</strong>
          </div>
        </div>

        <div className="checkout-total-row">
          <span>Total</span>
          <strong>{order.totalLabel}</strong>
        </div>
      </section>

      <section className="checkout-payment-panel">
        <p className="checkout-section-title">Pagamento Pix</p>
        <p className="checkout-muted">Oferta valida ate {expiresAt}.</p>

        <div className="checkout-form-block">
          <label className="checkout-label">
            E-mail
            <input
              className="checkout-input"
              inputMode="email"
              placeholder="seuemail@exemplo.com"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
            />
          </label>
          <label className="checkout-label">
            CPF
            <input
              className="checkout-input"
              inputMode="numeric"
              placeholder="Somente numeros"
              value={identificationNumber}
              onChange={(event) =>
                setIdentificationNumber(onlyDigits(event.target.value).slice(0, 11))
              }
            />
          </label>
        </div>

        <div className="checkout-form-block">
          <button
            type="button"
            className="checkout-primary-button"
            onClick={submitPix}
            disabled={loading}
          >
            {loading ? "Gerando Pix..." : `Gerar Pix de ${order.totalLabel}`}
          </button>

          {pixCode ? (
            <div className="checkout-pix-box combo-checkout-pix-box">
              {pixImage ? (
                <img
                  className="combo-checkout-pix-qr"
                  src={pixImage}
                  alt="QR Code Pix do combo"
                />
              ) : null}
              <label className="checkout-label">
                Pix copia e cola
                <textarea className="checkout-textarea" value={pixCode} readOnly />
              </label>
              <button
                type="button"
                className="checkout-secondary-button"
                onClick={copyPixCode}
              >
                Copiar codigo Pix
              </button>
            </div>
          ) : null}
        </div>

        {message ? <p className="checkout-message">{message}</p> : null}
      </section>
    </main>
  );
}
