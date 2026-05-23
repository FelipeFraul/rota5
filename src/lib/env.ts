import "server-only";

import { z } from "zod";

const envSchema = z.object({
  APP_BASE_URL: z.string().url("APP_BASE_URL must be a valid URL."),
  SUPABASE_URL: z.string().url("SUPABASE_URL must be a valid URL."),
  SUPABASE_ANON_KEY: z.string().min(1, "SUPABASE_ANON_KEY is required."),
  SUPABASE_SERVICE_ROLE_KEY: z
    .string()
    .min(1, "SUPABASE_SERVICE_ROLE_KEY is required."),
  ZAPI_INSTANCE_ID: z.string().min(1, "ZAPI_INSTANCE_ID is required."),
  ZAPI_INSTANCE_TOKEN: z.string().min(1, "ZAPI_INSTANCE_TOKEN is required."),
  ZAPI_CLIENT_TOKEN: z.string().min(1, "ZAPI_CLIENT_TOKEN is required."),
  ZAPI_BASE_URL: z.string().url("ZAPI_BASE_URL must be a valid URL."),
  ZAPI_WEBHOOK_SECRET: z.string().min(1, "ZAPI_WEBHOOK_SECRET is required."),
  CHECKOUT_INTERNAL_SECRET: z
    .string()
    .min(1, "CHECKOUT_INTERNAL_SECRET is required."),
  PAYMENT_PROVIDER: z.literal("mercado_pago"),
  MERCADO_PAGO_ACCESS_TOKEN: z
    .string()
    .min(1, "MERCADO_PAGO_ACCESS_TOKEN is required."),
  MERCADO_PAGO_WEBHOOK_SECRET: z
    .string()
    .min(1, "MERCADO_PAGO_WEBHOOK_SECRET is required."),
  NEXT_PUBLIC_MERCADO_PAGO_PUBLIC_KEY: z
    .string()
    .min(1, "NEXT_PUBLIC_MERCADO_PAGO_PUBLIC_KEY is required."),
  ADMIN_WHATSAPP_PHONES: z
    .string()
    .min(1, "ADMIN_WHATSAPP_PHONES is required."),
  ADMIN_ROOT_WHATSAPP_PHONES: z.string().optional(),
  ADMIN_AUTH_SECRET_HASH: z.string().optional(),
  ADMIN_SESSION_TTL_MINUTES: z.coerce
    .number("ADMIN_SESSION_TTL_MINUTES must be a number.")
    .int("ADMIN_SESSION_TTL_MINUTES must be an integer.")
    .positive("ADMIN_SESSION_TTL_MINUTES must be positive.")
    .optional(),
  TICKET_RESERVATION_TTL_MINUTES: z.coerce
    .number("TICKET_RESERVATION_TTL_MINUTES must be a number.")
    .int("TICKET_RESERVATION_TTL_MINUTES must be an integer.")
    .positive("TICKET_RESERVATION_TTL_MINUTES must be positive."),
  TICKET_QR_SECRET: z
    .string()
    .min(32, "TICKET_QR_SECRET must have at least 32 characters."),
  SEAT_MAP_STORAGE_BUCKET: z
    .string()
    .min(1, "SEAT_MAP_STORAGE_BUCKET is required."),
  GATE_ADMIN_SECRET: z.string().min(1, "GATE_ADMIN_SECRET is required."),
  GATE_SESSION_SECRET: z
    .string()
    .min(32, "GATE_SESSION_SECRET must have at least 32 characters."),
  GATE_SESSION_TTL_MINUTES: z.coerce
    .number("GATE_SESSION_TTL_MINUTES must be a number.")
    .int("GATE_SESSION_TTL_MINUTES must be an integer.")
    .positive("GATE_SESSION_TTL_MINUTES must be positive."),
});

export type AppEnv = z.infer<typeof envSchema>;

let cachedEnv: AppEnv | null = null;

export function getEnv(): AppEnv {
  if (!cachedEnv) {
    const result = envSchema.safeParse(process.env);

    if (!result.success) {
      const details = result.error.issues
        .map((issue) => `${issue.path.join(".")}: ${issue.message}`)
        .join("; ");

      throw new Error(`Invalid environment configuration. ${details}`);
    }

    cachedEnv = result.data;
  }

  return cachedEnv;
}
