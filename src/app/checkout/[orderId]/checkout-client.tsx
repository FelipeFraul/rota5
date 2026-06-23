"use client";

import { useEffect, useMemo, useState } from "react";
import BrandLogo from "@/app/BrandLogo";

type CheckoutOrder = {
  orderId: string;
  expiresAt: string;
  totalLabel: string;
  customerEmail: string | null;
  items: Array<{
    name: string;
    quantity: number;
    unitPriceLabel: string;
  }>;
};

type CheckoutClientProps = {
  publicKey: string;
  checkoutToken: string;
  order: CheckoutOrder;
};

type MercadoPagoInstance = {
  createCardToken(input: {
    cardNumber: string;
    cardholderName: string;
    cardExpirationMonth: string;
    cardExpirationYear: string;
    securityCode: string;
    identificationType: string;
    identificationNumber: string;
  }): Promise<{ id?: string; error?: unknown }>;
  getPaymentMethods(input: {
    bin: string;
  }): Promise<{ results?: Array<{ id: string; name?: string }> }>;
};

declare global {
  interface Window {
    MercadoPago?: new (
      publicKey: string,
      options?: { locale?: string },
    ) => MercadoPagoInstance;
  }
}

const mercadoPagoScriptSrc = "https://sdk.mercadopago.com/js/v2";
const enableCardPayment = false;

function onlyDigits(value: string): string {
  return value.replace(/\D/g, "");
}

function splitCardExpiration(value: string): { month: string; year: string } {
  const digits = onlyDigits(value);
  const month = digits.slice(0, 2);
  const rawYear = digits.slice(2, 6);
  const year = rawYear.length === 2 ? `20${rawYear}` : rawYear;

  return { month, year };
}

function formatCardNumber(value: string): string {
  return onlyDigits(value)
    .slice(0, 19)
    .replace(/(\d{4})(?=\d)/g, "$1 ");
}

export default function CheckoutClient({
  publicKey,
  checkoutToken,
  order,
}: CheckoutClientProps) {
  const [mp, setMp] = useState<MercadoPagoInstance | null>(null);
  const [mode, setMode] = useState<"pix" | "card">("pix");
  const [paymentApproved, setPaymentApproved] = useState(false);
  const [email, setEmail] = useState(order.customerEmail ?? "");
  const [identificationNumber, setIdentificationNumber] = useState("");
  const [cardNumber, setCardNumber] = useState("");
  const [cardholderName, setCardholderName] = useState("");
  const [expiration, setExpiration] = useState("");
  const [securityCode, setSecurityCode] = useState("");
  const [paymentMethodId, setPaymentMethodId] = useState("");
  const [installments, setInstallments] = useState(1);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [pixCode, setPixCode] = useState<string | null>(null);

  const bin = useMemo(() => onlyDigits(cardNumber).slice(0, 6), [cardNumber]);
  const expiresAt = new Intl.DateTimeFormat("pt-BR", {
    hour: "2-digit",
    minute: "2-digit",
    day: "2-digit",
    month: "2-digit",
  }).format(new Date(order.expiresAt));

  useEffect(() => {
    const existing = document.querySelector<HTMLScriptElement>(
      `script[src="${mercadoPagoScriptSrc}"]`,
    );

    function initialize() {
      if (window.MercadoPago) {
        setMp(new window.MercadoPago(publicKey, { locale: "pt-BR" }));
      }
    }

    if (existing) {
      initialize();
      existing.addEventListener("load", initialize);
      return () => existing.removeEventListener("load", initialize);
    }

    const script = document.createElement("script");
    script.src = mercadoPagoScriptSrc;
    script.async = true;
    script.onload = initialize;
    document.body.appendChild(script);

    return () => {
      script.onload = null;
    };
  }, [publicKey]);

  useEffect(() => {
    let cancelled = false;

    async function loadPaymentMethod() {
      if (!mp || bin.length < 6) {
        setPaymentMethodId("");
        return;
      }

      try {
        const response = await mp.getPaymentMethods({ bin });
        const method = response.results?.[0]?.id ?? "";

        if (!cancelled) {
          setPaymentMethodId(method);
        }
      } catch {
        if (!cancelled) {
          setPaymentMethodId("");
        }
      }
    }

    loadPaymentMethod();

    return () => {
      cancelled = true;
    };
  }, [bin, mp]);

  useEffect(() => {
    if (!pixCode || paymentApproved) {
      return;
    }

    let cancelled = false;

    async function checkPaymentStatus() {
      try {
        const response = await fetch(
          `/api/checkout/status?orderId=${encodeURIComponent(order.orderId)}&t=${encodeURIComponent(checkoutToken)}`,
        );

        if (!response.ok) {
          return;
        }

        const data = (await response.json()) as { status?: string };

        if (!cancelled && data.status === "approved") {
          setPaymentApproved(true);
          setMessage(null);
        }
      } catch {
        // Keep the Pix screen available while Black House confirmation is pending.
      }
    }

    checkPaymentStatus();
    const intervalId = window.setInterval(checkPaymentStatus, 5000);

    return () => {
      cancelled = true;
      window.clearInterval(intervalId);
    };
  }, [checkoutToken, order.orderId, paymentApproved, pixCode]);

  async function submitPayment(payload: Record<string, unknown>) {
    const response = await fetch(
      `/api/checkout/mercado-pago/pay?orderId=${encodeURIComponent(order.orderId)}`,
      {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      },
    );
    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error?.message ?? "Não foi possível processar.");
    }

    return data as {
      status: string;
      qr_code?: string | null;
      ticket_url?: string | null;
    };
  }

  async function submitPix() {
    setLoading(true);
    setMessage(null);
    setPixCode(null);

    try {
      const data = await submitPayment({
        method: "pix",
        checkoutToken,
        orderId: order.orderId,
        orderNumber: order.orderId,
        email,
        identificationNumber,
      });

      if (data.status === "approved") {
        setPaymentApproved(true);
        return;
      }

      setPixCode(data.qr_code ?? null);
      setMessage("Pix gerado. Copie o código abaixo e pague no app do banco.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Não foi possível gerar o Pix.");
    } finally {
      setLoading(false);
    }
  }

  async function submitCard() {
    if (!mp) {
      setMessage("O pagamento da Black House ainda está carregando. Tente novamente.");
      return;
    }

    if (!email.trim()) {
      setMessage("Informe um e-mail para continuar com cartão.");
      return;
    }

    if (onlyDigits(identificationNumber).length !== 11) {
      setMessage("Informe o CPF do titular com 11 dígitos.");
      return;
    }

    if (!cardholderName.trim()) {
      setMessage("Informe o nome impresso no cartão.");
      return;
    }

    const { month, year } = splitCardExpiration(expiration);

    if (month.length !== 2 || year.length !== 4 || onlyDigits(securityCode).length < 3) {
      setMessage("Confira validade e CVV do cartão.");
      return;
    }

    if (!paymentMethodId) {
      setMessage("Confira o número do cartão. Não identifiquei a bandeira.");
      return;
    }

    setLoading(true);
    setMessage(null);

    try {
      const tokenResponse = await mp.createCardToken({
        cardNumber: onlyDigits(cardNumber),
        cardholderName,
        cardExpirationMonth: month,
        cardExpirationYear: year,
        securityCode: onlyDigits(securityCode),
        identificationType: "CPF",
        identificationNumber: onlyDigits(identificationNumber),
      });

      if (!tokenResponse.id) {
        throw new Error("Não foi possível validar o cartão.");
      }

      const data = await submitPayment({
        method: "card",
        checkoutToken,
        orderId: order.orderId,
        orderNumber: order.orderId,
        email,
        identificationNumber,
        token: tokenResponse.id,
        paymentMethodId,
        installments,
      });

      if (data.status === "approved") {
        setPaymentApproved(true);
        return;
      }

      setMessage(`Pagamento enviado. Status atual: ${data.status}.`);
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : "Não foi possível processar o cartão.",
      );
    } finally {
      setLoading(false);
    }
  }

  function copyPixCode() {
    if (pixCode) {
      navigator.clipboard?.writeText(pixCode).catch(() => undefined);
      setMessage("Código Pix copiado.");
    }
  }

  if (paymentApproved) {
    return (
      <main className="checkout-success-shell">
        <section className="checkout-success-panel">
          <BrandLogo />
          <div className="checkout-success-icon" aria-hidden="true">
            <span className="checkout-success-icon-stem" />
            <span className="checkout-success-icon-kick" />
          </div>
          <p className="checkout-success-eyebrow">Pagamento</p>
          <h1>Pagamento aprovado</h1>
          <p className="checkout-success-text">
            Tudo certo. Seu ingresso será enviado pelo WhatsApp em instantes.
          </p>

          <div className="checkout-success-summary">
            <span>Total pago</span>
            <strong>{order.totalLabel}</strong>
          </div>
        </section>
      </main>
    );
  }

  return (
    <main className="checkout-shell">
      <div className="checkout-brand-header">
        <BrandLogo />
      </div>
      <section className="checkout-summary-panel">
        <p className="checkout-eyebrow">Checkout seguro</p>
        <h1>Finalize sua compra</h1>
        <p className="checkout-muted">Reserva válida até {expiresAt}.</p>

        <div className="checkout-items">
          {order.items.map((item) => (
            <div key={`${item.name}-${item.quantity}`} className="checkout-item-row">
              <span>
                {item.quantity}x {item.name}
              </span>
              <strong>{item.unitPriceLabel}</strong>
            </div>
          ))}
        </div>

        <div className="checkout-total-row">
          <span>Total</span>
          <strong>{order.totalLabel}</strong>
        </div>
      </section>

      <section className="checkout-payment-panel">
        <p className="checkout-section-title">Pagamento</p>
        {enableCardPayment ? (
          <div className="checkout-tabs">
            <button
              type="button"
              className={mode === "pix" ? "checkout-tab is-active" : "checkout-tab"}
              onClick={() => setMode("pix")}
            >
              Pix
            </button>
            <button
              type="button"
              className={mode === "card" ? "checkout-tab is-active" : "checkout-tab"}
              onClick={() => setMode("card")}
            >
              Cartão
            </button>
          </div>
        ) : null}

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
              placeholder="Somente números"
              value={identificationNumber}
              onChange={(event) =>
                setIdentificationNumber(onlyDigits(event.target.value).slice(0, 11))
              }
            />
          </label>
        </div>

        {enableCardPayment && mode === "card" ? (
          <div className="checkout-form-block">
            <label className="checkout-label">
              Número do cartão
              <input
                className="checkout-input"
                inputMode="numeric"
                placeholder="0000 0000 0000 0000"
                value={cardNumber}
                onChange={(event) => setCardNumber(formatCardNumber(event.target.value))}
              />
            </label>
            <label className="checkout-label">
              Nome impresso no cartão
              <input
                className="checkout-input"
                placeholder="Nome do titular"
                value={cardholderName}
                onChange={(event) => setCardholderName(event.target.value)}
              />
            </label>
            <div className="checkout-grid-three">
              <label className="checkout-label">
                Validade
                <input
                  className="checkout-input"
                  inputMode="numeric"
                  placeholder="MM/AA"
                  value={expiration}
                  onChange={(event) =>
                    setExpiration(onlyDigits(event.target.value).slice(0, 4))
                  }
                />
              </label>
              <label className="checkout-label">
                CVV
                <input
                  className="checkout-input"
                  inputMode="numeric"
                  placeholder="000"
                  value={securityCode}
                  onChange={(event) =>
                    setSecurityCode(onlyDigits(event.target.value).slice(0, 4))
                  }
                />
              </label>
              <label className="checkout-label">
                Parcelas
                <select
                  className="checkout-input"
                  value={installments}
                  onChange={(event) => setInstallments(Number(event.target.value))}
                >
                  <option value={1}>1x</option>
                  <option value={2}>2x</option>
                  <option value={3}>3x</option>
                </select>
              </label>
            </div>
            <button
              type="button"
              className="checkout-primary-button"
              onClick={submitCard}
              disabled={loading}
            >
              {loading ? "Processando..." : `Pagar ${order.totalLabel}`}
            </button>
          </div>
        ) : (
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
              <div className="checkout-pix-box">
                <label className="checkout-label">
                  Pix copia e cola
                  <textarea className="checkout-textarea" value={pixCode} readOnly />
                </label>
                <button
                  type="button"
                  className="checkout-secondary-button"
                  onClick={copyPixCode}
                >
                  Copiar código Pix
                </button>
              </div>
            ) : null}
          </div>
        )}

        {message ? <p className="checkout-message">{message}</p> : null}
      </section>
    </main>
  );
}
