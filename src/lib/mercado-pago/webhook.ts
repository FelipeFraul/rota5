import "server-only";

import { createHmac, timingSafeEqual } from "crypto";

export type MercadoPagoWebhookPayload = Record<string, unknown>;

export type MercadoPagoSignatureValidationResult =
  | {
      ok: true;
      paymentId: string;
      requestId: string;
      timestamp: string;
    }
  | {
      ok: false;
      reason:
        | "missing_payment_id"
        | "missing_signature"
        | "missing_request_id"
        | "invalid_signature_format"
        | "invalid_signature";
    };

function getHeader(headers: Headers, name: string): string | null {
  const value = headers.get(name);
  return value && value.trim().length > 0 ? value.trim() : null;
}

function firstNonEmptyString(...values: unknown[]): string | null {
  for (const value of values) {
    if (typeof value === "string" && value.trim().length > 0) {
      return value.trim();
    }

    if (typeof value === "number" && Number.isFinite(value)) {
      return String(value);
    }
  }

  return null;
}

function getNestedRecord(
  value: unknown,
  key: string,
): Record<string, unknown> | null {
  if (!value || typeof value !== "object") {
    return null;
  }

  const nested = (value as Record<string, unknown>)[key];

  return nested && typeof nested === "object"
    ? (nested as Record<string, unknown>)
    : null;
}

function extractIdFromResource(resource: unknown): string | null {
  if (typeof resource !== "string" || resource.trim().length === 0) {
    return null;
  }

  const trimmed = resource.trim();
  const match = trimmed.match(/\/payments\/([^/?#]+)/i);

  if (match?.[1]) {
    return decodeURIComponent(match[1]);
  }

  const lastSegment = trimmed.split(/[/?#]/)[0]?.split("/").filter(Boolean).pop();

  return lastSegment && /^\d+$/.test(lastSegment) ? lastSegment : null;
}

export function parseMercadoPagoWebhookPayload(
  rawBody: string,
): MercadoPagoWebhookPayload | null {
  try {
    const payload = JSON.parse(rawBody) as unknown;
    return payload && typeof payload === "object"
      ? (payload as MercadoPagoWebhookPayload)
      : null;
  } catch {
    return null;
  }
}

export function extractMercadoPagoPaymentId(
  payload: MercadoPagoWebhookPayload,
): string | null {
  const data = getNestedRecord(payload, "data");

  return firstNonEmptyString(
    data?.id,
    payload.id,
    payload["data.id"],
    extractIdFromResource(payload.resource),
  );
}

export function extractMercadoPagoPaymentIdFromUrl(url: string): string | null {
  const parsedUrl = new URL(url);
  return firstNonEmptyString(
    parsedUrl.searchParams.get("data.id"),
    parsedUrl.searchParams.get("id"),
  );
}

export function extractMercadoPagoEventType(
  payload: MercadoPagoWebhookPayload,
): string | null {
  return firstNonEmptyString(
    payload.action,
    payload.type,
    payload.topic,
    payload["live_mode"],
  );
}

function parseSignatureHeader(signatureHeader: string) {
  const parts = Object.fromEntries(
    signatureHeader.split(",").map((part) => {
      const [key, ...rest] = part.split("=");
      return [key?.trim(), rest.join("=").trim()];
    }),
  );

  return {
    timestamp: parts.ts,
    signature: parts.v1,
  };
}

export function buildMercadoPagoSignatureManifest({
  paymentId,
  requestId,
  timestamp,
}: {
  paymentId: string;
  requestId: string;
  timestamp: string;
}) {
  return `id:${paymentId};request-id:${requestId};ts:${timestamp};`;
}

export function validateMercadoPagoWebhookSignature({
  rawBody,
  headers,
  webhookSecret,
  paymentId: providedPaymentId,
}: {
  rawBody: string;
  headers: Headers;
  webhookSecret: string;
  paymentId?: string | null;
}): MercadoPagoSignatureValidationResult {
  const payload = parseMercadoPagoWebhookPayload(rawBody);

  if (!payload) {
    return {
      ok: false,
      reason: "missing_payment_id",
    };
  }

  const paymentId = providedPaymentId ?? extractMercadoPagoPaymentId(payload);

  if (!paymentId) {
    return {
      ok: false,
      reason: "missing_payment_id",
    };
  }

  const signatureHeader = getHeader(headers, "x-signature");

  if (!signatureHeader) {
    return {
      ok: false,
      reason: "missing_signature",
    };
  }

  const requestId = getHeader(headers, "x-request-id");

  if (!requestId) {
    return {
      ok: false,
      reason: "missing_request_id",
    };
  }

  const { timestamp, signature } = parseSignatureHeader(signatureHeader);

  if (!timestamp || !signature) {
    return {
      ok: false,
      reason: "invalid_signature_format",
    };
  }

  const manifest = buildMercadoPagoSignatureManifest({
    paymentId,
    requestId,
    timestamp,
  });
  const expectedSignature = createHmac("sha256", webhookSecret)
    .update(manifest)
    .digest("hex");

  const actualBuffer = Buffer.from(signature, "hex");
  const expectedBuffer = Buffer.from(expectedSignature, "hex");

  if (
    actualBuffer.length !== expectedBuffer.length ||
    !timingSafeEqual(actualBuffer, expectedBuffer)
  ) {
    return {
      ok: false,
      reason: "invalid_signature",
    };
  }

  return {
    ok: true,
    paymentId,
    requestId,
    timestamp,
  };
}

export function buildMercadoPagoEventMetadata({
  payload,
  requestId,
  paymentId,
}: {
  payload: MercadoPagoWebhookPayload;
  requestId: string;
  paymentId: string;
}) {
  return {
    request_id: requestId,
    payment_id: paymentId,
    action: firstNonEmptyString(payload.action),
    type: firstNonEmptyString(payload.type),
    topic: firstNonEmptyString(payload.topic),
  };
}
