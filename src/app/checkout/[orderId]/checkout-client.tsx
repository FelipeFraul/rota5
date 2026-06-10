"use client";

import type React from "react";
import { useEffect, useMemo, useState } from "react";

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

export default function CheckoutClient({ publicKey, order }: CheckoutClientProps) {
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
          `/api/checkout/status?orderId=${encodeURIComponent(order.orderId)}`,
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
  }, [order.orderId, paymentApproved, pixCode]);

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
      <main style={styles.successShell}>
        <section style={styles.successPanel}>
          <div style={styles.successIconWrap} aria-hidden="true">
            <span style={styles.successIconStem} />
            <span style={styles.successIconKick} />
          </div>
          <p style={styles.successEyebrow}>Pagamento</p>
          <h1 style={styles.successTitle}>Pagamento aprovado</h1>
          <p style={styles.successText}>
            Tudo certo. Seu ingresso será enviado pelo WhatsApp em instantes.
          </p>

          <div style={styles.successSummary}>
            <span>Total pago</span>
            <strong>{order.totalLabel}</strong>
          </div>
        </section>
        <style>{`
          @keyframes checkout-success-pop {
            0% { transform: scale(0.72); opacity: 0; }
            55% { transform: scale(1.08); opacity: 1; }
            100% { transform: scale(1); opacity: 1; }
          }

          @keyframes checkout-check-fade {
            0% { opacity: 0; }
            100% { opacity: 1; }
          }
        `}</style>
      </main>
    );
  }

  return (
    <main style={styles.shell}>
      <section style={styles.summaryPanel}>
        <p style={styles.eyebrow}>Checkout seguro</p>
        <h1 style={styles.title}>Finalize sua compra</h1>
        <p style={styles.muted}>Reserva válida até {expiresAt}.</p>

        <div style={styles.items}>
          {order.items.map((item) => (
            <div key={`${item.name}-${item.quantity}`} style={styles.itemRow}>
              <span>
                {item.quantity}x {item.name}
              </span>
              <strong>{item.unitPriceLabel}</strong>
            </div>
          ))}
        </div>

        <div style={styles.totalRow}>
          <span>Total</span>
          <strong>{order.totalLabel}</strong>
        </div>
      </section>

      <section style={styles.paymentPanel}>
        <p style={styles.sectionTitle}>Pagamento</p>
        <div style={styles.tabs}>
          <button
            type="button"
            style={mode === "pix" ? styles.tabActive : styles.tab}
            onClick={() => setMode("pix")}
          >
            Pix
          </button>
          <button
            type="button"
            style={mode === "card" ? styles.tabActive : styles.tab}
            onClick={() => setMode("card")}
          >
            Cartão
          </button>
        </div>

        <div style={styles.formBlock}>
          <label style={styles.label}>
            E-mail
            <input
              style={styles.input}
              inputMode="email"
              placeholder="seuemail@exemplo.com"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
            />
          </label>
          <label style={styles.label}>
            CPF
            <input
              style={styles.input}
              inputMode="numeric"
              placeholder="Somente números"
              value={identificationNumber}
              onChange={(event) =>
                setIdentificationNumber(onlyDigits(event.target.value).slice(0, 11))
              }
            />
          </label>
        </div>

        {mode === "card" ? (
          <div style={styles.formBlock}>
            <label style={styles.label}>
              Número do cartão
              <input
                style={styles.input}
                inputMode="numeric"
                placeholder="0000 0000 0000 0000"
                value={cardNumber}
                onChange={(event) => setCardNumber(formatCardNumber(event.target.value))}
              />
            </label>
            <label style={styles.label}>
              Nome impresso no cartão
              <input
                style={styles.input}
                placeholder="Nome do titular"
                value={cardholderName}
                onChange={(event) => setCardholderName(event.target.value)}
              />
            </label>
            <div style={styles.gridThree}>
              <label style={styles.label}>
                Validade
                <input
                  style={styles.input}
                  inputMode="numeric"
                  placeholder="MM/AA"
                  value={expiration}
                  onChange={(event) =>
                    setExpiration(onlyDigits(event.target.value).slice(0, 4))
                  }
                />
              </label>
              <label style={styles.label}>
                CVV
                <input
                  style={styles.input}
                  inputMode="numeric"
                  placeholder="000"
                  value={securityCode}
                  onChange={(event) =>
                    setSecurityCode(onlyDigits(event.target.value).slice(0, 4))
                  }
                />
              </label>
              <label style={styles.label}>
                Parcelas
                <select
                  style={styles.input}
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
              style={styles.primaryButton}
              onClick={submitCard}
              disabled={loading}
            >
              {loading ? "Processando..." : `Pagar ${order.totalLabel}`}
            </button>
          </div>
        ) : (
          <div style={styles.formBlock}>
            <button
              type="button"
              style={styles.primaryButton}
              onClick={submitPix}
              disabled={loading}
            >
              {loading ? "Gerando Pix..." : `Gerar Pix de ${order.totalLabel}`}
            </button>
            {pixCode ? (
              <div style={styles.pixBox}>
                <label style={styles.label}>
                  Pix copia e cola
                  <textarea style={styles.textarea} value={pixCode} readOnly />
                </label>
                <button type="button" style={styles.secondaryButton} onClick={copyPixCode}>
                  Copiar código Pix
                </button>
              </div>
            ) : null}
          </div>
        )}

        {message ? <p style={styles.message}>{message}</p> : null}
      </section>
    </main>
  );
}

const baseButton = {
  border: 0,
  borderRadius: 8,
  cursor: "pointer",
  fontSize: 15,
  fontWeight: 700,
  minHeight: 52,
  padding: "0 18px",
} satisfies React.CSSProperties;

const styles: Record<string, React.CSSProperties> = {
  shell: {
    minHeight: "100vh",
    background: "linear-gradient(135deg, #0f172a 0%, #111827 42%, #fb7000 160%)",
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 320px), 520px))",
    gap: 22,
    justifyContent: "center",
    alignItems: "start",
    padding: "28px 16px",
    fontFamily: "Arial, sans-serif",
  },
  summaryPanel: {
    background: "#ffffff",
    borderRadius: 18,
    color: "#111827",
    padding: 22,
  },
  paymentPanel: {
    background: "#ffffff",
    borderRadius: 18,
    padding: 22,
  },
  eyebrow: {
    color: "#fb7000",
    fontSize: 13,
    fontWeight: 800,
    margin: "0 0 6px",
    textTransform: "uppercase",
  },
  title: {
    margin: 0,
    fontSize: 28,
    color: "#111827",
  },
  muted: {
    color: "#4b5563",
    lineHeight: 1.5,
  },
  items: {
    borderTop: "1px solid #e5e7eb",
    marginTop: 18,
    paddingTop: 16,
    display: "grid",
    gap: 12,
  },
  itemRow: {
    display: "flex",
    gap: 12,
    justifyContent: "space-between",
    fontSize: 14,
    lineHeight: 1.4,
  },
  totalRow: {
    borderTop: "1px solid #e5e7eb",
    display: "flex",
    justifyContent: "space-between",
    marginTop: 20,
    paddingTop: 18,
    fontSize: 22,
    fontWeight: 800,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: 800,
    margin: "0 0 14px",
  },
  tabs: {
    display: "grid",
    gridTemplateColumns: "1fr 1fr",
    gap: 10,
    marginBottom: 18,
  },
  tab: {
    ...baseButton,
    background: "#f3f4f6",
    color: "#111827",
  },
  tabActive: {
    ...baseButton,
    background: "#fb7000",
    color: "#fff",
  },
  formBlock: {
    display: "grid",
    gap: 14,
    marginTop: 16,
  },
  label: {
    color: "#111827",
    display: "grid",
    fontSize: 13,
    fontWeight: 700,
    gap: 6,
  },
  input: {
    background: "#ffffff",
    border: "1px solid #d1d5db",
    borderRadius: 8,
    boxSizing: "border-box",
    color: "#111827",
    fontSize: 15,
    minHeight: 46,
    padding: "0 14px",
    width: "100%",
  },
  gridThree: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 120px), 1fr))",
    gap: 12,
  },
  primaryButton: {
    ...baseButton,
    background: "#fb7000",
    color: "#fff",
    marginTop: 6,
  },
  secondaryButton: {
    ...baseButton,
    background: "#111827",
    color: "#fff",
  },
  pixBox: {
    background: "#f9fafb",
    border: "1px solid #e5e7eb",
    borderRadius: 12,
    display: "grid",
    gap: 12,
    padding: 14,
  },
  textarea: {
    border: "1px solid #d1d5db",
    borderRadius: 8,
    boxSizing: "border-box",
    fontSize: 14,
    minHeight: 120,
    padding: 12,
    resize: "vertical",
    width: "100%",
  },
  message: {
    background: "#fff7ed",
    border: "1px solid #fed7aa",
    borderRadius: 10,
    color: "#9a3412",
    lineHeight: 1.45,
    marginTop: 16,
    padding: 12,
  },
  successShell: {
    minHeight: "100vh",
    background: "linear-gradient(135deg, #052e1a 0%, #0f172a 58%, #16a34a 150%)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    padding: "28px 16px",
    fontFamily: "Arial, sans-serif",
  },
  successPanel: {
    background: "#ffffff",
    borderRadius: 18,
    boxShadow: "0 24px 80px rgba(0, 0, 0, 0.22)",
    color: "#111827",
    maxWidth: 520,
    padding: 28,
    textAlign: "center",
    width: "100%",
  },
  successIconWrap: {
    animation: "checkout-success-pop 520ms ease-out both",
    background: "#16a34a",
    borderRadius: "50%",
    height: 92,
    margin: "0 auto 18px",
    position: "relative",
    width: 92,
  },
  successIconKick: {
    animation: "checkout-check-fade 180ms ease-out 360ms both",
    background: "#ffffff",
    borderRadius: 999,
    height: 8,
    left: 26,
    position: "absolute",
    top: 51,
    transform: "rotate(45deg)",
    transformOrigin: "left center",
    width: 24,
  },
  successIconStem: {
    animation: "checkout-check-fade 180ms ease-out 520ms both",
    background: "#ffffff",
    borderRadius: 999,
    height: 8,
    left: 42,
    position: "absolute",
    top: 59,
    transform: "rotate(-45deg)",
    transformOrigin: "left center",
    width: 40,
  },
  successEyebrow: {
    color: "#16a34a",
    fontSize: 13,
    fontWeight: 800,
    letterSpacing: 0,
    margin: "0 0 8px",
    textTransform: "uppercase",
  },
  successTitle: {
    color: "#16a34a",
    fontSize: 30,
    margin: 0,
  },
  successText: {
    color: "#374151",
    fontSize: 16,
    lineHeight: 1.5,
    margin: "12px 0 0",
  },
  successSummary: {
    background: "#f0fdf4",
    border: "1px solid #bbf7d0",
    borderRadius: 12,
    color: "#166534",
    display: "flex",
    fontSize: 18,
    fontWeight: 800,
    justifyContent: "space-between",
    marginTop: 22,
    padding: 16,
  },
};
