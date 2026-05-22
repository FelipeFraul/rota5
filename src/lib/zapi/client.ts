import "server-only";

import { getEnv } from "@/lib/env";
import { logError, logWarn } from "@/lib/logger";

type SendZapiTextInput = {
  phone: string;
  message: string;
};

export type SendZapiTextResult =
  | {
      ok: true;
      providerMessageId?: string;
    }
  | {
      ok: false;
      error: string;
    };

export async function sendZapiText({
  phone,
  message,
}: SendZapiTextInput): Promise<SendZapiTextResult> {
  const env = getEnv();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10_000);
  const url = new URL(
    `/instances/${env.ZAPI_INSTANCE_ID}/token/${env.ZAPI_INSTANCE_TOKEN}/send-text`,
    env.ZAPI_BASE_URL,
  );

  try {
    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Client-Token": env.ZAPI_CLIENT_TOKEN,
      },
      body: JSON.stringify({
        phone,
        message,
      }),
      signal: controller.signal,
    });

    if (!response.ok) {
      logWarn("Z-API text send failed", {
        status: response.status,
        phone,
      });

      return {
        ok: false,
        error: "zapi_send_failed",
      };
    }

    const data = (await response.json().catch(() => null)) as
      | { messageId?: string; id?: string }
      | null;

    return {
      ok: true,
      providerMessageId: data?.messageId ?? data?.id,
    };
  } catch (error) {
    logError("Z-API text send error", {
      error,
      phone,
    });

    return {
      ok: false,
      error: "zapi_send_error",
    };
  } finally {
    clearTimeout(timeout);
  }
}
