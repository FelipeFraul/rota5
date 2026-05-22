import "server-only";

import { getEnv } from "@/lib/env";

const MERCADO_PAGO_API_BASE_URL = "https://api.mercadopago.com";
const REQUEST_TIMEOUT_MS = 10_000;

export type MercadoPagoBaseClient = {
  provider: "mercado_pago";
  buildAuthHeaders: () => HeadersInit;
};

export type MercadoPagoPayment = {
  id: number | string;
  status?: string;
  external_reference?: string | null;
  transaction_amount?: number | string | null;
  date_approved?: string | null;
  currency_id?: string | null;
};

export type MercadoPagoPaymentResult =
  | {
      ok: true;
      payment: MercadoPagoPayment;
    }
  | {
      ok: false;
      status: number | null;
      code:
        | "not_found"
        | "timeout"
        | "http_error"
        | "invalid_response"
        | "network_error";
    };

export function createMercadoPagoBaseClient(): MercadoPagoBaseClient {
  const env = getEnv();
  const accessToken = env.MERCADO_PAGO_ACCESS_TOKEN;

  return {
    provider: "mercado_pago",
    buildAuthHeaders: () => ({
      Authorization: `Bearer ${accessToken}`,
    }),
  };
}

export async function getMercadoPagoPayment(
  paymentId: string | number,
): Promise<MercadoPagoPaymentResult> {
  const client = createMercadoPagoBaseClient();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const response = await fetch(
      `${MERCADO_PAGO_API_BASE_URL}/v1/payments/${encodeURIComponent(
        String(paymentId),
      )}`,
      {
        method: "GET",
        headers: client.buildAuthHeaders(),
        signal: controller.signal,
      },
    );

    if (response.status === 404) {
      return {
        ok: false,
        status: response.status,
        code: "not_found",
      };
    }

    if (!response.ok) {
      return {
        ok: false,
        status: response.status,
        code: "http_error",
      };
    }

    const body = (await response.json()) as Partial<MercadoPagoPayment>;

    if (!body || typeof body !== "object" || body.id == null) {
      return {
        ok: false,
        status: response.status,
        code: "invalid_response",
      };
    }

    return {
      ok: true,
      payment: body as MercadoPagoPayment,
    };
  } catch (error) {
    return {
      ok: false,
      status: null,
      code:
        error instanceof DOMException && error.name === "AbortError"
          ? "timeout"
          : "network_error",
    };
  } finally {
    clearTimeout(timeout);
  }
}
