import { getEnv } from "@/lib/env";
import {
  badRequest,
  jsonOk,
  methodNotAllowed,
  unauthorized,
} from "@/lib/http/responses";
import { logInfo, logWarn } from "@/lib/logger";

const MAX_WEBHOOK_BYTES = 256 * 1024;
const SECRET_HEADER_NAMES = [
  "x-zapi-webhook-secret",
  "x-webhook-secret",
  "authorization",
];

type ZapiWebhookPayload = Record<string, unknown>;

function getHeaderSecret(request: Request): string | null {
  for (const headerName of SECRET_HEADER_NAMES) {
    const value = request.headers.get(headerName);

    if (!value) {
      continue;
    }

    if (headerName === "authorization") {
      return value.replace(/^Bearer\s+/i, "");
    }

    return value;
  }

  return null;
}

function isGroupMessage(payload: ZapiWebhookPayload): boolean {
  return Boolean(
    payload.isGroup ||
      payload.group ||
      payload.chatType === "group" ||
      String(payload.phone ?? payload.from ?? "").includes("@g.us"),
  );
}

function isFromMe(payload: ZapiWebhookPayload): boolean {
  return Boolean(payload.fromMe || payload.owner || payload.isFromMe);
}

function firstString(...values: unknown[]): string | null {
  for (const value of values) {
    if (typeof value === "string" && value.trim().length > 0) {
      return value.trim();
    }
  }

  return null;
}

function extractIncomingMessage(payload: ZapiWebhookPayload) {
  const message =
    payload.message && typeof payload.message === "object"
      ? (payload.message as Record<string, unknown>)
      : {};
  const text =
    firstString(
      payload.text,
      payload.body,
      payload.messageText,
      message.text,
      message.body,
      message.message,
    ) ?? "";
  const phone = firstString(
    payload.phone,
    payload.from,
    payload.sender,
    payload.senderPhone,
    message.phone,
    message.from,
  );

  return {
    phone,
    text,
  };
}

async function readJsonPayload(request: Request) {
  const contentLength = request.headers.get("content-length");

  if (contentLength && Number(contentLength) > MAX_WEBHOOK_BYTES) {
    return {
      ok: false as const,
      response: badRequest("Payload too large"),
    };
  }

  const rawBody = await request.text();

  if (new TextEncoder().encode(rawBody).byteLength > MAX_WEBHOOK_BYTES) {
    return {
      ok: false as const,
      response: badRequest("Payload too large"),
    };
  }

  try {
    return {
      ok: true as const,
      payload: JSON.parse(rawBody) as ZapiWebhookPayload,
    };
  } catch {
    return {
      ok: false as const,
      response: badRequest("Invalid JSON payload"),
    };
  }
}

export async function POST(request: Request) {
  const env = getEnv();
  const headerSecret = getHeaderSecret(request);

  if (headerSecret !== env.ZAPI_WEBHOOK_SECRET) {
    logWarn("Rejected Z-API webhook with invalid secret");
    return unauthorized();
  }

  const payloadResult = await readJsonPayload(request);

  if (!payloadResult.ok) {
    return payloadResult.response;
  }

  const payload = payloadResult.payload;

  if (isGroupMessage(payload)) {
    logInfo("Ignored Z-API group message");
    return jsonOk({ received: true });
  }

  if (isFromMe(payload)) {
    logInfo("Ignored Z-API self message");
    return jsonOk({ received: true });
  }

  const { phone, text } = extractIncomingMessage(payload);

  if (!phone) {
    logWarn("Received Z-API webhook without phone");
    return jsonOk({ received: true });
  }

  logInfo("Received Z-API user message", {
    phone,
    hasText: text.length > 0,
  });

  // Future step: call routeTicketMessage({ phone, text }) from "@/lib/tickets/router".

  return jsonOk({ received: true });
}

export function GET() {
  return methodNotAllowed(["POST"]);
}

export function PUT() {
  return methodNotAllowed(["POST"]);
}

export function PATCH() {
  return methodNotAllowed(["POST"]);
}

export function DELETE() {
  return methodNotAllowed(["POST"]);
}
