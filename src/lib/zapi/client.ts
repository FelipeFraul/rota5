import "server-only";

import { getEnv } from "@/lib/env";
import { logError, logWarn } from "@/lib/logger";
import { formatWhatsAppUppercase } from "@/lib/zapi/format";

type SendZapiTextInput = {
  phone: string;
  message: string;
};

type SendZapiImageInput = {
  phone: string;
  image: string;
  caption?: string;
};

export type SendZapiMessageResult =
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
}: SendZapiTextInput): Promise<SendZapiMessageResult> {
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
        message: formatWhatsAppUppercase(message),
      }),
      signal: controller.signal,
    });

    if (!response.ok) {
      logWarn("Z-API text send failed", {
        status: response.status,
        phoneLast4: phone.slice(-4),
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
      phoneLast4: phone.slice(-4),
    });

    return {
      ok: false,
      error: "zapi_send_error",
    };
  } finally {
    clearTimeout(timeout);
  }
}

export async function sendZapiImage({
  phone,
  image,
  caption,
}: SendZapiImageInput): Promise<SendZapiMessageResult> {
  const env = getEnv();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10_000);
  const url = new URL(
    `/instances/${env.ZAPI_INSTANCE_ID}/token/${env.ZAPI_INSTANCE_TOKEN}/send-image`,
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
        image,
        ...(caption ? { caption: formatWhatsAppUppercase(caption) } : {}),
        viewOnce: false,
      }),
      signal: controller.signal,
    });

    if (!response.ok) {
      logWarn("Z-API image send failed", {
        status: response.status,
        phoneLast4: phone.slice(-4),
      });

      return {
        ok: false,
        error: "zapi_image_send_failed",
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
    logError("Z-API image send error", {
      error,
      phoneLast4: phone.slice(-4),
    });

    return {
      ok: false,
      error: "zapi_image_send_error",
    };
  } finally {
    clearTimeout(timeout);
  }
}
