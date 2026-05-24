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
  point_of_interaction?: {
    transaction_data?: {
      qr_code?: string | null;
      ticket_url?: string | null;
    } | null;
  } | null;
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

export type MercadoPagoPreferenceItem = {
  title: string;
  quantity: number;
  unit_price: number;
  currency_id: "BRL";
};

export type MercadoPagoPreferenceInput = {
  items: MercadoPagoPreferenceItem[];
  external_reference: string;
  notification_url: string;
  back_urls?: {
    success: string;
    failure: string;
    pending: string;
  };
  expires: true;
  expiration_date_from: string;
  expiration_date_to: string;
  metadata?: Record<string, unknown>;
};

export type MercadoPagoPreference = {
  id: string;
  init_point?: string | null;
  sandbox_init_point?: string | null;
};

export type MercadoPagoPreferenceResult =
  | {
      ok: true;
      preference: MercadoPagoPreference;
    }
  | {
      ok: false;
      status: number | null;
      code:
        | "timeout"
        | "http_error"
        | "invalid_response"
        | "network_error";
    };

export type MercadoPagoPaymentCreateInput = {
  transaction_amount: number;
  token?: string;
  description: string;
  installments?: number;
  payment_method_id: string;
  payer: {
    email: string;
    identification?: {
      type: string;
      number: string;
    };
  };
  external_reference: string;
  notification_url: string;
  metadata?: Record<string, unknown>;
};

export type MercadoPagoPaymentCreateResult =
  | {
      ok: true;
      payment: MercadoPagoPayment;
    }
  | {
      ok: false;
      status: number | null;
      code:
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

export async function createMercadoPagoPreference(
  input: MercadoPagoPreferenceInput,
): Promise<MercadoPagoPreferenceResult> {
  const client = createMercadoPagoBaseClient();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const response = await fetch(
      `${MERCADO_PAGO_API_BASE_URL}/checkout/preferences`,
      {
        method: "POST",
        headers: {
          ...client.buildAuthHeaders(),
          "Content-Type": "application/json",
        },
        body: JSON.stringify(input),
        signal: controller.signal,
      },
    );

    if (!response.ok) {
      return {
        ok: false,
        status: response.status,
        code: "http_error",
      };
    }

    const body = (await response.json()) as Partial<MercadoPagoPreference>;

    if (
      !body ||
      typeof body !== "object" ||
      typeof body.id !== "string" ||
      (!body.init_point && !body.sandbox_init_point)
    ) {
      return {
        ok: false,
        status: response.status,
        code: "invalid_response",
      };
    }

    return {
      ok: true,
      preference: {
        id: body.id,
        init_point: body.init_point,
        sandbox_init_point: body.sandbox_init_point,
      },
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

export async function createMercadoPagoPayment(
  input: MercadoPagoPaymentCreateInput,
  idempotencyKey: string,
): Promise<MercadoPagoPaymentCreateResult> {
  const client = createMercadoPagoBaseClient();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const response = await fetch(`${MERCADO_PAGO_API_BASE_URL}/v1/payments`, {
      method: "POST",
      headers: {
        ...client.buildAuthHeaders(),
        "Content-Type": "application/json",
        "X-Idempotency-Key": idempotencyKey,
      },
      body: JSON.stringify(input),
      signal: controller.signal,
    });

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
