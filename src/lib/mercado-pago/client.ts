import "server-only";

import { getEnv } from "@/lib/env";

export type MercadoPagoBaseClient = {
  provider: "mercado_pago";
  buildAuthHeaders: () => HeadersInit;
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
