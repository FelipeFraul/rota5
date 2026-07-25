import { randomUUID, timingSafeEqual } from "crypto";
import {
  jsonError,
  jsonOk,
  methodNotAllowed,
  unauthorized,
} from "@/lib/http/responses";
import { createGitHubIssue } from "@/lib/github/issues";
import { logError, logInfo, logWarn } from "@/lib/logger";
import {
  consumeRateLimit,
  hashRateLimitScope,
} from "@/lib/security/rateLimit";
import {
  getOrCreateOpenConversation,
  reconcileConversationDelivery,
  updateConversationAfterMessage,
} from "@/lib/tickets/services/conversations";
import { upsertCustomerFromWhatsApp } from "@/lib/tickets/services/customers";
import {
  findInboundMessageByProviderId,
  saveWhatsAppMessage,
} from "@/lib/tickets/services/messages";
import { buildWhatsAppOutboundMetadata } from "@/lib/tickets/services/outboundMessages";
import {
  CODEX_AUTH_REDACTED_BODY,
  buildApprovedCodexRequestBody,
  buildCodexAuthInvalidReply,
  buildCodexAuthPrompt,
  buildCodexCollectPrompt,
  buildCodexGitHubIssueBody,
  buildCodexGitHubIssueTitle,
  buildCodexRequestAck,
  clearCodexRequestContext,
  getCodexRequestContext,
  isAllowedCodexRequestPhone,
  isCodexRequestAuthPending,
  isCodexRequestCollecting,
  parseCodexRequestCommand,
  withCodexRequestAuthPending,
  withCodexRequestCollecting,
} from "@/lib/tickets/codexRequests";
import { normalizeWhatsAppPhone } from "@/lib/tickets/phones";
import {
  resolveIncomingMessageIntent,
  routeTicketMessage,
  shouldProcessImmediately,
} from "@/lib/tickets/router";
import { reconcileAdminNavigation } from "@/lib/tickets/adminNavigation";
import {
  getDeliveryGuard,
  getNumericPrompt,
  getRetiredNumericMessageIds,
  extractNumericOptions,
  parseStrictNumericReply,
  withoutDeliveryGuard,
  withoutDeliveryMetadata,
} from "@/lib/tickets/numericOptions";
import {
  DEFAULT_CONVERSATION_INACTIVITY_TTL_MINUTES,
  resolveConversationContextForInbound,
} from "@/lib/tickets/conversationState";
import { markParticipantTicketDelivered } from "@/lib/tickets/services/tickets";
import {
  ADMIN_AUTH_REDACTED_BODY,
  verifyAdminUserPassphrase,
} from "@/lib/tickets/services/adminAuth";
import { GATE_ACCESS_REDACTED_BODY } from "@/lib/tickets/services/gateAccessAuth";
import {
  sendZapiImage,
  sendZapiText,
  type SendZapiMessageResult,
} from "@/lib/zapi/client";
import { formatSystemActionLines } from "@/lib/zapi/format";
import { sanitizeWhatsAppText } from "@/lib/zapi/textEncoding";
import { TICKET_MESSAGES } from "@/lib/tickets/messages";

const MAX_WEBHOOK_BYTES = 256 * 1024;
const PHONE_RATE_LIMIT = 30;
const PHONE_RATE_LIMIT_WINDOW_SECONDS = 60;
const DELIVERY_PENDING_TIMEOUT_MS = 2 * 60 * 1000;
const SECRET_HEADER_NAMES = [
  "x-zapi-webhook-secret",
  "x-webhook-secret",
  "authorization",
];
const SECRET_QUERY_NAMES = ["zapi_webhook_secret", "webhook_secret"];

function getConversationInactivityTtlMinutes() {
  const configured = Number(process.env.CONVERSATION_INACTIVITY_TTL_MINUTES);
  return Number.isInteger(configured) && configured > 0
    ? configured
    : DEFAULT_CONVERSATION_INACTIVITY_TTL_MINUTES;
}

type ZapiWebhookPayload = Record<string, unknown>;
type ParsedIncomingMessage = {
  phone: string | null;
  contactName: string | null;
  text: string | null;
  providerMessageId: string | null;
  referenceMessageId: string | null;
  fromMe: boolean;
  isGroup: boolean;
  messageType: "text" | "image" | "document" | "system";
  mediaUrl: string | null;
};
type RouteOutboundMessage =
  | {
      type: "text";
      body: string;
      phone?: string;
      persistedBody?: string;
      delayMs?: number;
      suppressTitle?: boolean;
      participantDeliveryTicketId?: string;
    }
  | {
      type: "image";
      imageUrl: string;
      caption: string;
      phone?: string;
      persistedBody?: string;
      delayMs?: number;
      suppressTitle?: boolean;
      participantDeliveryTicketId?: string;
    };

function getFallbackSystemMessageTitle(state?: string | null) {
  if (!state) return "ATENDIMENTO";
  if (state.startsWith("admin_report")) return "RELATÓRIOS";
  if (state.startsWith("admin_event")) return "EVENTOS";
  if (state.startsWith("admin_courtesy")) return "CORTESIAS";
  if (state.startsWith("admin_gate") || state.startsWith("gate_")) return "PORTARIA";
  if (state.startsWith("admin_order")) return "PEDIDOS";
  if (state.startsWith("admin_user")) return "ADMINISTRADORES";
  if (state.startsWith("admin")) return "ADMIN";
  if (
    state === "showing_events" ||
    state === "showing_sections" ||
    state === "showing_seats"
  ) {
    return "EVENTOS";
  }
  if (
    state === "selecting_quantity" ||
    state === "reviewing_cart" ||
    state === "reservation_created" ||
    state === "payment_pending"
  ) {
    return "COMPRA";
  }
  if (state.startsWith("help_")) return "AJUDA";
  if (state.startsWith("ticket_resend")) return "INGRESSOS";
  return "ATENDIMENTO";
}

function parseSystemMessageTitleLine(line: string) {
  const trimmed = line.trim();
  const match = trimmed.match(/^\*{1,2}([^*\n]+)\*{1,2}$/);
  const title = match?.[1]?.trim();
  return title ? title.toLocaleUpperCase("pt-BR") : null;
}

function formatSystemMessageTitle(title: string) {
  return `*${sanitizeOutboundText(title).toLocaleUpperCase("pt-BR")}*`;
}

const MOJIBAKE_REPLACEMENTS: Array<[string, string]> = [
  ["ÃƒÂ¡", "á"],
  ["ÃƒÂ ", "à"],
  ["ÃƒÂ¢", "â"],
  ["ÃƒÂ£", "ã"],
  ["ÃƒÂ©", "é"],
  ["ÃƒÂª", "ê"],
  ["ÃƒÂ­", "í"],
  ["ÃƒÂ³", "ó"],
  ["ÃƒÂ´", "ô"],
  ["ÃƒÂµ", "õ"],
  ["ÃƒÂº", "ú"],
  ["ÃƒÂ¼", "ü"],
  ["ÃƒÂ§", "ç"],
  ["Ã¡", "á"],
  ["Ã ", "à"],
  ["Ã¢", "â"],
  ["Ã£", "ã"],
  ["Ã©", "é"],
  ["Ãª", "ê"],
  ["Ã­", "í"],
  ["Ã³", "ó"],
  ["Ã´", "ô"],
  ["Ãµ", "õ"],
  ["Ãº", "ú"],
  ["Ã¼", "ü"],
  ["Ã§", "ç"],
  ["ÃƒÂ", "Á"],
  ["Ãƒâ€°", "É"],
  ["ÃƒÂ", "Í"],
  ["Ãƒâ€œ", "Ó"],
  ["ÃƒÅ¡", "Ú"],
  ["Ãƒâ€¡", "Ç"],
  ["Ã", "Á"],
  ["Ã‰", "É"],
  ["Ã", "Í"],
  ["Ã“", "Ó"],
  ["Ãš", "Ú"],
  ["Ã‡", "Ç"],
  ["ÃƒÅ ", "Ê"],
  ["Ãƒâ€", "Ô"],
  ["Ãƒâ€¢", "Õ"],
  ["ÃƒÆ’O", "ÃO"],
  ["ÃƒÆ’", "Ã"],
  ["Ã‚Âº", "º"],
  ["Ã‚Âª", "ª"],
  ["Ã‚Â°", "°"],
  ["Ã¢â‚¬â€", "—"],
  ["Ã¢â‚¬â€œ", "–"],
  ["Ã¢â‚¬Å“", "“"],
  ["Ã¢â‚¬Â", "”"],
  ["Ã¢â‚¬Ëœ", "‘"],
  ["Ã¢â‚¬â„¢", "’"],
  ["Ã¢â‚¬Â¦", "..."],
  ["Ã¢â€šÂ¬", "€"],
];

function sanitizeOutboundText(value: string) {
  let sanitized = value;

  for (const [broken, fixed] of MOJIBAKE_REPLACEMENTS) {
    sanitized = sanitized.split(broken).join(fixed);
  }

  return sanitizeWhatsAppText(sanitized);
}

function ensureSystemMessageTitle(body: string, fallbackTitle: string) {
  const normalizedBody = sanitizeOutboundText(body).trim();
  if (!normalizedBody) return body;

  const lines = normalizedBody.split(/\r?\n/);
  const firstContentIndex = lines.findIndex((line) => line.trim().length > 0);
  if (firstContentIndex < 0) return body;

  const firstLineTitle = parseSystemMessageTitleLine(lines[firstContentIndex]);
  if (firstLineTitle) {
    lines[firstContentIndex] = formatSystemMessageTitle(firstLineTitle);
    return formatSystemActionLines(lines.join("\n"));
  }

  const existingTitleIndex = lines.findIndex((line, index) =>
    index > firstContentIndex && Boolean(parseSystemMessageTitleLine(line)),
  );
  if (existingTitleIndex >= 0) {
    const existingTitle = parseSystemMessageTitleLine(lines[existingTitleIndex]);
    const remainingLines = lines.filter((_, index) => index !== existingTitleIndex);
    return formatSystemActionLines([
      formatSystemMessageTitle(existingTitle ?? fallbackTitle),
      "",
      ...remainingLines,
    ].join("\n").trim());
  }

  return formatSystemActionLines([
    formatSystemMessageTitle(sanitizeOutboundText(fallbackTitle)),
    "",
    normalizedBody,
  ].join("\n"));
}

function normalizeOutboundMessageTitle(
  message: RouteOutboundMessage,
  fallbackTitle: string,
): RouteOutboundMessage {
  if (message.suppressTitle) {
    return message;
  }

  if (message.type === "image") {
    return {
      ...message,
      caption: sanitizeOutboundText(ensureSystemMessageTitle(message.caption, fallbackTitle)),
      persistedBody: message.persistedBody
        ? sanitizeOutboundText(ensureSystemMessageTitle(message.persistedBody, fallbackTitle))
        : message.persistedBody,
    };
  }

  return {
    ...message,
    body: sanitizeOutboundText(ensureSystemMessageTitle(message.body, fallbackTitle)),
    persistedBody: message.persistedBody
      ? sanitizeOutboundText(ensureSystemMessageTitle(message.persistedBody, fallbackTitle))
      : message.persistedBody,
  };
}

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

function getQuerySecret(request: Request): string | null {
  const url = new URL(request.url);

  for (const queryName of SECRET_QUERY_NAMES) {
    const value = url.searchParams.get(queryName)?.trim();

    if (value) {
      return value;
    }
  }

  return null;
}

function getRequestSecret(request: Request): string | null {
  return getHeaderSecret(request) ?? getQuerySecret(request);
}

function getRequestSourceIdentifier(request: Request) {
  return (
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    request.headers.get("x-real-ip")?.trim() ||
    request.headers.get("cf-connecting-ip")?.trim() ||
    null
  );
}

function isSecretMatch(received: string | null, expected: string) {
  if (!received) {
    return false;
  }

  const receivedBuffer = Buffer.from(received);
  const expectedBuffer = Buffer.from(expected);

  return (
    receivedBuffer.length === expectedBuffer.length &&
    timingSafeEqual(receivedBuffer, expectedBuffer)
  );
}

function firstRecord(...values: unknown[]): Record<string, unknown> {
  for (const value of values) {
    if (value && typeof value === "object" && !Array.isArray(value)) {
      return value as Record<string, unknown>;
    }
  }

  return {};
}

function firstString(...values: unknown[]): string | null {
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

function firstUrl(...values: unknown[]): string | null {
  const value = firstString(...values);

  if (!value) {
    return null;
  }

  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:" ? url.toString() : null;
  } catch {
    return null;
  }
}

function limitedKeys(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return [];
  }

  return Object.keys(value as Record<string, unknown>).slice(0, 20);
}

function normalizePhone(phone: string | null) {
  return normalizeWhatsAppPhone(phone);
}

function normalizeMessageType(messageType: string | null) {
  const normalized = messageType?.toLowerCase();

  if (
    normalized === "image" ||
    normalized === "document" ||
    normalized === "audio" ||
    normalized === "video" ||
    normalized === "sticker"
  ) {
    if (normalized === "audio" || normalized === "video" || normalized === "sticker") {
      return "document";
    }

    return normalized;
  }

  return "text";
}

function normalizeContactKey(key: string) {
  return key.toLowerCase().replace(/[^a-z0-9]/g, "");
}

function payloadContainsContactKey(payload: unknown): boolean {
  if (Array.isArray(payload)) return payload.some(payloadContainsContactKey);
  if (!payload || typeof payload !== "object") return false;

  return Object.entries(payload as Record<string, unknown>).some(([key, value]) =>
    [
      "contact",
      "contacts",
      "contactarray",
      "contactphone",
      "vcard",
    ].includes(normalizeContactKey(key)) || payloadContainsContactKey(value),
  );
}

function payloadContainsVcard(payload: unknown): boolean {
  if (typeof payload === "string") return /BEGIN:VCARD|END:VCARD|vcard/i.test(payload);
  if (Array.isArray(payload)) return payload.some(payloadContainsVcard);
  if (!payload || typeof payload !== "object") return false;

  return Object.entries(payload as Record<string, unknown>).some(([key, value]) =>
    normalizeContactKey(key).includes("vcard") || payloadContainsVcard(value),
  );
}

function isContactPayload(payload: ZapiWebhookPayload) {
  const message = firstRecord(payload.message, payload.data, payload.key);
  const rawMessageType = firstString(
    payload.messageType,
    payload.type,
    message.messageType,
    message.type,
  );
  const normalizedType = rawMessageType?.toLowerCase() ?? null;
  const hasContactType = Boolean(
    normalizedType &&
      (
        normalizedType.includes("contact") ||
        normalizedType.includes("contacts") ||
        normalizedType.includes("vcard")
      ),
  );

  return hasContactType || payloadContainsContactKey(payload) || payloadContainsVcard(payload);
}

function isTruthyFlag(value: unknown) {
  return value === true || value === "true" || value === 1 || value === "1";
}

function extractIncomingMessage(
  payload: ZapiWebhookPayload,
): ParsedIncomingMessage {
  const message = firstRecord(payload.message, payload.data, payload.key);
  const contact = firstRecord(payload.contact, payload.sender, message.contact);
  const textPayload = firstRecord(payload.text, message.text);
  const imagePayload = firstRecord(payload.image, message.image);
  const documentPayload = firstRecord(payload.document, message.document);
  const chatId = firstString(
    payload.chatId,
    payload.chat_id,
    payload.phone,
    payload.from,
    message.chatId,
    message.remoteJid,
  );
  const rawPhone = firstString(
    payload.phone,
    payload.from,
    payload.sender,
    payload.senderPhone,
    payload.sender_phone,
    payload.participantPhone,
    payload.participant,
    contact.phone,
    contact.number,
    message.phone,
    message.from,
    message.remoteJid,
    chatId,
  );
  const text = firstString(
    payload.text,
    textPayload.message,
    textPayload.body,
    textPayload.text,
    payload.body,
    payload.messageText,
    payload.caption,
    message.text,
    message.body,
    message.message,
    message.caption,
    imagePayload.caption,
    documentPayload.caption,
  );
  const mediaUrl = firstUrl(
    payload.imageUrl,
    payload.image_url,
    payload.mediaUrl,
    payload.media_url,
    payload.url,
    message.imageUrl,
    message.image_url,
    message.mediaUrl,
    message.media_url,
    message.url,
    imagePayload.imageUrl,
    imagePayload.image_url,
    imagePayload.mediaUrl,
    imagePayload.media_url,
    imagePayload.url,
  );
  const providerMessageId = firstString(
    payload.messageId,
    payload.message_id,
    payload.id,
    payload.providerMessageId,
    message.messageId,
    message.id,
    message.keyId,
  );
  const referenceMessageId = firstString(
    payload.referenceMessageId,
    payload.reference_message_id,
    message.referenceMessageId,
    message.reference_message_id,
  );
  const contactName = firstString(
    payload.contactName,
    payload.senderName,
    payload.name,
    contact.name,
    contact.pushName,
    message.senderName,
  );
  const rawMessageType = firstString(
    payload.messageType,
    payload.type,
    message.messageType,
    message.type,
  );
  const fromMe = Boolean(
    isTruthyFlag(payload.fromMe) ||
      isTruthyFlag(payload.owner) ||
      isTruthyFlag(payload.isFromMe) ||
      isTruthyFlag(message.fromMe),
  );
  const isGroup = Boolean(
    isTruthyFlag(payload.isGroup) ||
      isTruthyFlag(payload.group) ||
      payload.chatType === "group" ||
      message.chatType === "group" ||
      chatId?.includes("@g.us") ||
      rawPhone?.includes("@g.us"),
  );

  return {
    phone: normalizePhone(rawPhone),
    contactName,
    text,
    providerMessageId,
    referenceMessageId,
    fromMe,
    isGroup,
    messageType: normalizeMessageType(rawMessageType),
    mediaUrl,
  };
}

function buildInboundMetadata({
  providerMessageId,
  referenceMessageId,
  messageType,
  redacted = false,
  redactionReason = "sensitive_input",
}: {
  providerMessageId: string | null;
  referenceMessageId?: string | null;
  messageType: string;
  redacted?: boolean;
  redactionReason?: string;
}) {
  return {
    provider: "zapi",
    provider_message_id: providerMessageId,
    ...(referenceMessageId
      ? { reference_message_id: referenceMessageId }
      : {}),
    message_type: messageType,
    ...(redacted ? { redacted: true, reason: redactionReason } : {}),
  };
}

function getInboundRedaction(context: Record<string, unknown>) {
  if (isCodexRequestAuthPending(context)) {
    return {
      body: CODEX_AUTH_REDACTED_BODY,
      reason: "codex_auth",
    };
  }

  if (
    context?.state === "admin_auth_pending" ||
    context?.state === "admin_user_create_collect_passphrase"
  ) {
    return {
      body: ADMIN_AUTH_REDACTED_BODY,
      reason:
        context?.state === "admin_user_create_collect_passphrase"
          ? "admin_user_passphrase"
          : "admin_auth",
    };
  }

  if (
    context?.state === "admin_gate_password_collecting" ||
    context?.state === "gate_access_passphrase_collecting" ||
    context?.state === "admin_fixed_gate_passphrase_collecting" ||
    context?.state === "fixed_gate_passphrase_collecting"
  ) {
    return {
      body: GATE_ACCESS_REDACTED_BODY,
      reason: "gate_access_passphrase",
    };
  }

  return null;
}

function getOutboundMessages(
  routeResult: Awaited<ReturnType<typeof routeTicketMessage>>,
): RouteOutboundMessage[] {
  const fallbackTitle = getFallbackSystemMessageTitle(routeResult.nextContext?.state);
  if (routeResult.skipReply) {
    return [];
  }

  if (routeResult.outboundMessages?.length) {
    return routeResult.outboundMessages.map((message) =>
      normalizeOutboundMessageTitle(message, fallbackTitle),
    );
  }

  if (routeResult.reply === TICKET_MESSAGES.genericHelpPrompt) {
    return [
      {
        type: "text",
        body: TICKET_MESSAGES.genericHelp,
        suppressTitle: true,
      },
      {
        type: "text",
        body: TICKET_MESSAGES.genericHelpCommands,
        suppressTitle: true,
      },
    ];
  }

  if (routeResult.reply === TICKET_MESSAGES.reentryPrompt) {
    return [
      {
        type: "text",
        body: TICKET_MESSAGES.reentryPrompt,
        suppressTitle: true,
      },
    ];
  }

  return [
    {
      type: "text",
      body: routeResult.suppressTitle
        ? routeResult.reply
        : ensureSystemMessageTitle(routeResult.reply, fallbackTitle),
      suppressTitle: routeResult.suppressTitle,
    },
  ];
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function getOutboundMessageText(message: RouteOutboundMessage) {
  return sanitizeOutboundText(message.type === "image" ? message.caption : message.body);
}

async function sendOutboundMessage({
  phone,
  message,
}: {
  phone: string;
  message: RouteOutboundMessage;
}) {
  if (message.type === "image") {
    return sendZapiImage({
      phone,
      image: message.imageUrl,
      caption: sanitizeOutboundText(message.caption),
      ensureTitle: !message.suppressTitle,
    });
  }

  return sendZapiText({
    phone,
    message: sanitizeOutboundText(message.body),
    ensureTitle: !message.suppressTitle,
  });
}

async function sendAndPersistText({
  conversationId,
  customerId,
  phone,
  body,
}: {
  conversationId: string;
  customerId: string;
  phone: string;
  body: string;
}) {
  const titledBody = sanitizeOutboundText(ensureSystemMessageTitle(body, "ATENDIMENTO"));
  const sendResult = await sendZapiText({
    phone,
    message: titledBody,
  });

  const outboundResult = await saveWhatsAppMessage({
    conversationId,
    customerId,
    direction: "outbound",
    messageType: "text",
    body: titledBody,
    providerMessageId: sendResult.ok ? sendResult.providerMessageId : null,
    rawMetadata: buildWhatsAppOutboundMetadata({
      sendResult,
      messageType: "text",
      reason: "webhook_reply",
    }),
  });

  if (!outboundResult.ok) {
    return {
      ok: false as const,
      sendResult,
      error: outboundResult.error,
    };
  }

  return {
    ok: true as const,
    sendResult,
  };
}

async function createIssueForCodexRequest({
  requestId,
  prompt,
  phoneLast4,
}: {
  requestId: string;
  prompt: string;
  phoneLast4: string;
}) {
  return createGitHubIssue({
    title: buildCodexGitHubIssueTitle(requestId),
    body: buildCodexGitHubIssueBody({
      requestId,
      prompt,
      phoneLast4,
    }),
  });
}

async function readJsonPayload(request: Request) {
  const contentLength = request.headers.get("content-length");

  if (contentLength && Number(contentLength) > MAX_WEBHOOK_BYTES) {
    return {
      ok: false as const,
      response: jsonError("Payload Too Large", 413),
    };
  }

  const rawBody = await request.text();

  if (new TextEncoder().encode(rawBody).byteLength > MAX_WEBHOOK_BYTES) {
    return {
      ok: false as const,
      response: jsonError("Payload Too Large", 413),
    };
  }

  try {
    const payload = JSON.parse(rawBody) as unknown;

    if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
      return {
        ok: false as const,
        response: jsonError("Bad Request", 400),
      };
    }

    return {
      ok: true as const,
      payload: payload as ZapiWebhookPayload,
    };
  } catch {
    return {
      ok: false as const,
      response: jsonError("Bad Request", 400),
    };
  }
}

export async function POST(request: Request) {
  const webhookSecret = process.env.ZAPI_WEBHOOK_SECRET;
  const requestSecret = getRequestSecret(request);

  if (!webhookSecret || !isSecretMatch(requestSecret, webhookSecret)) {
    logWarn("Rejected Z-API webhook with invalid secret");
    return unauthorized();
  }

  const payloadResult = await readJsonPayload(request);

  if (!payloadResult.ok) {
    return payloadResult.response;
  }

  const incoming = extractIncomingMessage(payloadResult.payload);

  if (incoming.isGroup) {
    logInfo("Ignored Z-API group message", {
      providerMessageId: incoming.providerMessageId,
    });
    return jsonOk({ received: true, ignored: true, reason: "group" });
  }

  if (incoming.fromMe) {
    logInfo("Ignored Z-API self message", {
      providerMessageId: incoming.providerMessageId,
    });
    return jsonOk({ received: true, ignored: true, reason: "from_me" });
  }

  if (!incoming.phone) {
    logWarn("Received Z-API webhook without phone", {
      providerMessageId: incoming.providerMessageId,
      payloadKeys: limitedKeys(payloadResult.payload),
    });
    return jsonOk({ received: true, ignored: true, reason: "missing_phone" });
  }

  if (incoming.providerMessageId) {
    const duplicateResult = await findInboundMessageByProviderId(
      incoming.providerMessageId,
    );

    if (!duplicateResult.ok) {
      logWarn("Failed to pre-check duplicate Z-API message; continuing", {
        code: duplicateResult.error?.code,
        errorMessage: duplicateResult.error?.message,
        providerMessageId: incoming.providerMessageId,
      });
    }

    if (duplicateResult.ok && duplicateResult.message) {
      logInfo("Ignored duplicate Z-API inbound message", {
        providerMessageId: incoming.providerMessageId,
      });
      return jsonOk({ received: true, duplicate: true });
    }
  }

  const contactPayload = isContactPayload(payloadResult.payload);

  if (contactPayload) {
    const customerResult = await upsertCustomerFromWhatsApp({
      phone: incoming.phone,
      name: incoming.contactName,
    });

    if (!customerResult.ok) {
      logError("Failed to upsert WhatsApp customer for contact message", {
        phoneLast4: incoming.phone.slice(-4),
        code: customerResult.error.code,
      });
      return jsonError("Internal Server Error", 500);
    }

    const conversationResult = await getOrCreateOpenConversation({
      customerId: customerResult.customer.id,
    });

    if (!conversationResult.ok) {
      logError("Failed to load WhatsApp conversation for contact message", {
        customerId: customerResult.customer.id,
        code: conversationResult.error.code,
      });
      return jsonError("Internal Server Error", 500);
    }

    const contactConversationContext = resolveConversationContextForInbound({
      context: conversationResult.conversation.context,
      lastMessageAt: conversationResult.conversation.last_message_at,
      inactivityTtlMinutes: getConversationInactivityTtlMinutes(),
    }).context;
    const shouldRouteParticipantContacts =
      contactConversationContext.state === "ticket_delivery_contacts_waiting";

    if (!shouldRouteParticipantContacts) {
      const inboundResult = await saveWhatsAppMessage({
        conversationId: conversationResult.conversation.id,
        customerId: customerResult.customer.id,
        direction: "inbound",
        messageType: "system",
        body: "[Contato fora do estado de distribuição]",
        providerMessageId: incoming.providerMessageId,
        rawMetadata: {
          provider: "zapi",
          reason: "contact_outside_ticket_delivery",
        },
      });

      if (!inboundResult.ok) {
        if ("duplicate" in inboundResult && inboundResult.duplicate) {
          logInfo("Ignored concurrent duplicate Z-API contact message", {
            providerMessageId: incoming.providerMessageId,
          });
          return jsonOk({ received: true, duplicate: true });
        }

        logError("Failed to save Z-API contact message", {
          conversationId: conversationResult.conversation.id,
          code: inboundResult.error?.code,
        });
        return jsonError("Internal Server Error", 500);
      }

      const replyResult = await sendAndPersistText({
        conversationId: conversationResult.conversation.id,
        customerId: customerResult.customer.id,
        phone: incoming.phone,
        body: "Não estou aguardando contatos neste momento.",
      });

      if (!replyResult.ok) {
        return jsonError("Internal Server Error", 500);
      }

      const conversationUpdateResult = await updateConversationAfterMessage({
        conversationId: conversationResult.conversation.id,
      });

      if (!conversationUpdateResult.ok) {
        return jsonError("Internal Server Error", 500);
      }

      return jsonOk({
        received: true,
        processed: true,
        contactOutsideTicketDelivery: true,
      });
    }
  }

  if (!incoming.text && !incoming.mediaUrl && !contactPayload) {
    const message = firstRecord(
      payloadResult.payload.message,
      payloadResult.payload.data,
      payloadResult.payload.key,
    );

    logWarn("Received Z-API webhook without text", {
      phoneLast4: incoming.phone.slice(-4),
      providerMessageId: incoming.providerMessageId,
      payloadKeys: limitedKeys(payloadResult.payload),
      messageKeys: limitedKeys(message),
      textKeys: limitedKeys(firstRecord(payloadResult.payload.text, message.text)),
    });

    return jsonOk({ received: true, ignored: true, reason: "empty_message" });
  }

  const phoneRateLimit = await consumeRateLimit({
    routeKey: "webhook:zapi:phone",
    limit: PHONE_RATE_LIMIT,
    windowSeconds: PHONE_RATE_LIMIT_WINDOW_SECONDS,
    request,
    scope: `phone:${hashRateLimitScope(incoming.phone)}`,
  });

  if (!phoneRateLimit.allowed) {
    logWarn("Rate limited Z-API webhook by phone", {
      sourceHash: phoneRateLimit.sourceHash,
      count: phoneRateLimit.count,
      phoneLast4: incoming.phone.slice(-4),
    });
    return jsonOk({ received: true, ignored: true, reason: "phone_rate_limited" });
  }

  const customerResult = await upsertCustomerFromWhatsApp({
    phone: incoming.phone,
    name: incoming.contactName,
  });

  if (!customerResult.ok) {
    logError("Failed to upsert WhatsApp customer", {
      phoneLast4: incoming.phone.slice(-4),
      code: customerResult.error.code,
    });
    return jsonError("Internal Server Error", 500);
  }

  const conversationResult = await getOrCreateOpenConversation({
    customerId: customerResult.customer.id,
  });

  if (!conversationResult.ok) {
    logError("Failed to load WhatsApp conversation", {
      customerId: customerResult.customer.id,
      code: conversationResult.error.code,
    });
    return jsonError("Internal Server Error", 500);
  }

  const resolvedContext = resolveConversationContextForInbound({
    context: conversationResult.conversation.context,
    lastMessageAt: conversationResult.conversation.last_message_at,
    inactivityTtlMinutes: getConversationInactivityTtlMinutes(),
  });
  let currentContext = resolvedContext.context;
  const loadedDeliveryGuard = getDeliveryGuard(currentContext);
  const deliveryStartedAt = loadedDeliveryGuard
    ? new Date(loadedDeliveryGuard.startedAt).getTime()
    : Number.NaN;
  const deliveryGuardIsFresh = Boolean(
    loadedDeliveryGuard &&
      Number.isFinite(deliveryStartedAt) &&
      Date.now() - deliveryStartedAt <= DELIVERY_PENDING_TIMEOUT_MS,
  );
  const deliveryGuardIsStale = Boolean(
    loadedDeliveryGuard && !deliveryGuardIsFresh,
  );
  const hasPendingOutboundDeliveryJobs = deliveryGuardIsFresh;

  if (deliveryGuardIsStale) {
    currentContext = withoutDeliveryGuard(currentContext);
  }

  if (resolvedContext.resetReason) {
    logInfo("Reset inactive WhatsApp conversation context", {
      conversationId: conversationResult.conversation.id,
      phoneLast4: incoming.phone.slice(-4),
      reason: resolvedContext.resetReason,
    });
  }

  const inboundRedaction = getInboundRedaction(
    currentContext,
  );

  const inboundResult = await saveWhatsAppMessage({
    conversationId: conversationResult.conversation.id,
    customerId: customerResult.customer.id,
    direction: "inbound",
    messageType: incoming.messageType,
    body: inboundRedaction?.body ?? incoming.text ?? "[Contato recebido]",
    providerMessageId: incoming.providerMessageId,
    rawMetadata: buildInboundMetadata({
      providerMessageId: incoming.providerMessageId,
      referenceMessageId: incoming.referenceMessageId,
      messageType: incoming.messageType,
      redacted: Boolean(inboundRedaction),
      redactionReason: inboundRedaction?.reason,
    }),
  });

  if (!inboundResult.ok) {
    if ("duplicate" in inboundResult && inboundResult.duplicate) {
      logInfo("Ignored concurrent duplicate Z-API inbound message", {
        providerMessageId: incoming.providerMessageId,
      });
      return jsonOk({ received: true, duplicate: true });
    }

    logError("Failed to save inbound WhatsApp message", {
      conversationId: conversationResult.conversation.id,
      code: inboundResult.error?.code,
    });
    return jsonError("Internal Server Error", 500);
  }

  const effectiveText = incoming.text ?? "";
  const numericReply = parseStrictNumericReply(incoming.text);
  const currentStateName =
    typeof currentContext.state === "string" ? currentContext.state : "idle";
  const incomingIntent = resolveIncomingMessageIntent({
    text: effectiveText,
    messageType: incoming.messageType,
    conversationState: currentContext,
  });
  const immediateDecision = shouldProcessImmediately({
    intent: incomingIntent,
    message: incoming.text,
    activeState: currentStateName,
  });

  if (
    deliveryGuardIsFresh &&
    hasPendingOutboundDeliveryJobs &&
    numericReply !== null
  ) {
    const pendingReply =
      "Ainda estou enviando as opções. Aguarde alguns instantes e responda novamente.";
    const pendingResult = await sendAndPersistText({
      conversationId: conversationResult.conversation.id,
      customerId: customerResult.customer.id,
      phone: incoming.phone,
      body: pendingReply,
    });

    if (!pendingResult.ok) {
      return jsonError("Internal Server Error", 500);
    }

    const pendingActivityUpdate = await updateConversationAfterMessage({
      conversationId: conversationResult.conversation.id,
    });

    if (!pendingActivityUpdate.ok) {
      return jsonError("Internal Server Error", 500);
    }

    return jsonOk({
      received: true,
      processed: true,
      deliveryPending: true,
    });
  }

  if (deliveryGuardIsStale && numericReply !== null) {
    const staleDeliveryReply =
      "Não consegui confirmar a entrega da lista anterior. Envie sua pesquisa novamente para receber opções atualizadas.";
    const staleResult = await sendAndPersistText({
      conversationId: conversationResult.conversation.id,
      customerId: customerResult.customer.id,
      phone: incoming.phone,
      body: staleDeliveryReply,
    });

    if (!staleResult.ok) {
      return jsonError("Internal Server Error", 500);
    }

    const staleContextUpdate = await updateConversationAfterMessage({
      conversationId: conversationResult.conversation.id,
      context: currentContext,
    });

    if (!staleContextUpdate.ok) {
      return jsonError("Internal Server Error", 500);
    }

    return jsonOk({
      received: true,
      processed: true,
      staleDelivery: true,
    });
  }

  const numericPrompt = getNumericPrompt(currentContext);
  const retiredNumericMessageIds = getRetiredNumericMessageIds(currentContext);
  const quotedMessageWasRetired = Boolean(
    incoming.referenceMessageId &&
      retiredNumericMessageIds.includes(incoming.referenceMessageId),
  );
  const quotedMessageIsStale = Boolean(
    numericPrompt &&
      incoming.referenceMessageId &&
      numericPrompt.messageIds.length > 0 &&
      !numericPrompt.messageIds.includes(incoming.referenceMessageId),
  );
  const numericOptionWasNotDelivered = Boolean(
    numericPrompt &&
      numericReply !== null &&
      !numericPrompt.validOptions.includes(numericReply),
  );

  if (
    numericReply !== null &&
    !inboundRedaction &&
    (quotedMessageIsStale ||
      quotedMessageWasRetired ||
      numericOptionWasNotDelivered)
  ) {
    const invalidNumericReply =
      "Essa resposta numérica não pertence à lista mais recente entregue. Consulte a última mensagem e tente novamente.";
    const invalidNumericResult = await sendAndPersistText({
      conversationId: conversationResult.conversation.id,
      customerId: customerResult.customer.id,
      phone: incoming.phone,
      body: invalidNumericReply,
    });

    if (!invalidNumericResult.ok) {
      return jsonError("Internal Server Error", 500);
    }

    const invalidNumericActivityUpdate = await updateConversationAfterMessage({
      conversationId: conversationResult.conversation.id,
    });

    if (!invalidNumericActivityUpdate.ok) {
      return jsonError("Internal Server Error", 500);
    }

    return jsonOk({
      received: true,
      processed: true,
      invalidNumericReply: true,
    });
  }

  const isAllowedCodexPhone = isAllowedCodexRequestPhone(incoming.phone);
  if (isAllowedCodexPhone && isCodexRequestAuthPending(currentContext)) {
    const passphraseResult = await verifyAdminUserPassphrase(
      incoming.phone,
      incoming.text ?? "",
    );

    if (!passphraseResult.ok) {
      const nextContext = clearCodexRequestContext(currentContext);
      const reply = buildCodexAuthInvalidReply();
      const outboundResult = await sendAndPersistText({
        conversationId: conversationResult.conversation.id,
        customerId: customerResult.customer.id,
        phone: incoming.phone,
        body: reply,
      });

      if (!outboundResult.ok) {
        logError("Failed to save Codex auth failure reply", {
          conversationId: conversationResult.conversation.id,
          code: outboundResult.error?.code,
        });
        return jsonError("Internal Server Error", 500);
      }

      const conversationUpdateResult = await updateConversationAfterMessage({
        conversationId: conversationResult.conversation.id,
        context: nextContext,
      });

      if (!conversationUpdateResult.ok) {
        logError("Failed to clear Codex request context after invalid auth", {
          conversationId: conversationResult.conversation.id,
          code: conversationUpdateResult.error.code,
        });
        return jsonError("Internal Server Error", 500);
      }

      return jsonOk({
        received: true,
        processed: true,
        codexRequest: true,
        authenticated: false,
      });
    }

    const pendingPrompt = getCodexRequestContext(currentContext).pendingPrompt?.trim();

    if (!pendingPrompt) {
      const nextContext = withCodexRequestCollecting(currentContext);
      const reply = buildCodexCollectPrompt();
      const outboundResult = await sendAndPersistText({
        conversationId: conversationResult.conversation.id,
        customerId: customerResult.customer.id,
        phone: incoming.phone,
        body: reply,
      });

      if (!outboundResult.ok) {
        logError("Failed to save Codex collect prompt", {
          conversationId: conversationResult.conversation.id,
          code: outboundResult.error?.code,
        });
        return jsonError("Internal Server Error", 500);
      }

      const conversationUpdateResult = await updateConversationAfterMessage({
        conversationId: conversationResult.conversation.id,
        context: nextContext,
      });

      if (!conversationUpdateResult.ok) {
        logError("Failed to update Codex collect context", {
          conversationId: conversationResult.conversation.id,
          code: conversationUpdateResult.error.code,
        });
        return jsonError("Internal Server Error", 500);
      }

      return jsonOk({
        received: true,
        processed: true,
        codexRequest: true,
        authenticated: true,
        collectingPrompt: true,
      });
    }

    const approvedResult = await saveWhatsAppMessage({
      conversationId: conversationResult.conversation.id,
      customerId: customerResult.customer.id,
      direction: "inbound",
      messageType: "system",
      body: buildApprovedCodexRequestBody(pendingPrompt),
      rawMetadata: {
        provider: "codex_request",
        authenticated: true,
      },
    });

    if (!approvedResult.ok) {
      logError("Failed to save approved Codex request", {
        conversationId: conversationResult.conversation.id,
        code: approvedResult.error?.code,
      });
      return jsonError("Internal Server Error", 500);
    }

    const requestId = approvedResult.message.id.slice(0, 8);
    const issueResult = await createIssueForCodexRequest({
      requestId,
      prompt: pendingPrompt,
      phoneLast4: incoming.phone.slice(-4),
    });

    if (!issueResult.ok) {
      logWarn("Failed to create GitHub issue for Codex request", {
        conversationId: conversationResult.conversation.id,
        requestId,
        reason: issueResult.reason,
        status: issueResult.status,
      });
    }

    const reply = buildCodexRequestAck({
      requestId,
      isEmpty: false,
      issueUrl: issueResult.ok ? issueResult.issueUrl : null,
      issueCreationFailed: !issueResult.ok,
    });
    const outboundResult = await sendAndPersistText({
      conversationId: conversationResult.conversation.id,
      customerId: customerResult.customer.id,
      phone: incoming.phone,
      body: reply,
    });

    if (!outboundResult.ok) {
      logError("Failed to save Codex request acknowledgement", {
        conversationId: conversationResult.conversation.id,
        code: outboundResult.error?.code,
      });
      return jsonError("Internal Server Error", 500);
    }

    const conversationUpdateResult = await updateConversationAfterMessage({
      conversationId: conversationResult.conversation.id,
      context: clearCodexRequestContext(currentContext),
    });

    if (!conversationUpdateResult.ok) {
      logError("Failed to clear Codex request context", {
        conversationId: conversationResult.conversation.id,
        code: conversationUpdateResult.error.code,
      });
      return jsonError("Internal Server Error", 500);
    }

    logInfo("Stored authenticated Codex request from WhatsApp", {
      conversationId: conversationResult.conversation.id,
      requestId,
      phoneLast4: incoming.phone.slice(-4),
    });

    return jsonOk({
      received: true,
      processed: true,
      codexRequest: true,
      authenticated: true,
      requestId,
    });
  }

  if (isAllowedCodexPhone && isCodexRequestCollecting(currentContext)) {
    const prompt = incoming.text?.trim() ?? "";
    const approvedResult = await saveWhatsAppMessage({
      conversationId: conversationResult.conversation.id,
      customerId: customerResult.customer.id,
      direction: "inbound",
      messageType: "system",
      body: buildApprovedCodexRequestBody(prompt),
      rawMetadata: {
        provider: "codex_request",
        authenticated: true,
      },
    });

    if (!approvedResult.ok) {
      logError("Failed to save collected Codex request", {
        conversationId: conversationResult.conversation.id,
        code: approvedResult.error?.code,
      });
      return jsonError("Internal Server Error", 500);
    }

    const requestId = approvedResult.message.id.slice(0, 8);
    const issueResult = await createIssueForCodexRequest({
      requestId,
      prompt,
      phoneLast4: incoming.phone.slice(-4),
    });

    if (!issueResult.ok) {
      logWarn("Failed to create GitHub issue for collected Codex request", {
        conversationId: conversationResult.conversation.id,
        requestId,
        reason: issueResult.reason,
        status: issueResult.status,
      });
    }

    const reply = buildCodexRequestAck({
      requestId,
      isEmpty: prompt.length === 0,
      issueUrl: issueResult.ok ? issueResult.issueUrl : null,
      issueCreationFailed: !issueResult.ok,
    });
    const outboundResult = await sendAndPersistText({
      conversationId: conversationResult.conversation.id,
      customerId: customerResult.customer.id,
      phone: incoming.phone,
      body: reply,
    });

    if (!outboundResult.ok) {
      logError("Failed to save collected Codex request acknowledgement", {
        conversationId: conversationResult.conversation.id,
        code: outboundResult.error?.code,
      });
      return jsonError("Internal Server Error", 500);
    }

    const conversationUpdateResult = await updateConversationAfterMessage({
      conversationId: conversationResult.conversation.id,
      context: clearCodexRequestContext(currentContext),
    });

    if (!conversationUpdateResult.ok) {
      logError("Failed to clear collected Codex request context", {
        conversationId: conversationResult.conversation.id,
        code: conversationUpdateResult.error.code,
      });
      return jsonError("Internal Server Error", 500);
    }

    return jsonOk({
      received: true,
      processed: true,
      codexRequest: true,
      authenticated: true,
      requestId,
    });
  }

  const codexRequest = parseCodexRequestCommand(incoming.text);

  if (codexRequest && isAllowedCodexPhone) {
    const nextContext = withCodexRequestAuthPending({
      context: currentContext,
      pendingPrompt: codexRequest.isEmpty ? null : codexRequest.prompt,
    });
    const reply = buildCodexAuthPrompt();
    const outboundResult = await sendAndPersistText({
      conversationId: conversationResult.conversation.id,
      customerId: customerResult.customer.id,
      phone: incoming.phone,
      body: reply,
    });

    if (!outboundResult.ok) {
      logError("Failed to save Codex auth prompt", {
        conversationId: conversationResult.conversation.id,
        code: outboundResult.error?.code,
      });
      return jsonError("Internal Server Error", 500);
    }

    const conversationUpdateResult = await updateConversationAfterMessage({
      conversationId: conversationResult.conversation.id,
      context: nextContext,
    });

    if (!conversationUpdateResult.ok) {
      logError("Failed to set Codex auth context", {
        conversationId: conversationResult.conversation.id,
        code: conversationUpdateResult.error.code,
      });
      return jsonError("Internal Server Error", 500);
    }

    return jsonOk({
      received: true,
      processed: true,
      codexRequest: true,
      awaitingAuth: true,
    });
  }

  const rawRouteResult = await routeTicketMessage({
    customer: customerResult.customer,
    conversation: {
      ...conversationResult.conversation,
      context: currentContext,
    },
    text: effectiveText,
    messageType: incoming.messageType,
    mediaUrl: incoming.mediaUrl,
    rawPayload: contactPayload ? payloadResult.payload : undefined,
    sourceIdentifier: getRequestSourceIdentifier(request),
  });
  const routeResult = reconcileAdminNavigation({
    currentContext,
    inboundText: effectiveText || incoming.mediaUrl || "",
    routeResult: rawRouteResult,
  });

  const outboundMessages = getOutboundMessages(routeResult);
  const generationId = randomUUID();
  const deliveryGenerationStartedAt = new Date().toISOString();
  const previousNumericPrompt = getNumericPrompt(currentContext);
  const retiredMessageIds = [
    ...getRetiredNumericMessageIds(currentContext),
    ...(previousNumericPrompt?.messageIds ?? []),
  ];
  const boundedRetiredMessageIds = [
    ...new Set(retiredMessageIds),
  ].slice(-30);
  const nextContextWithoutDeliveryMetadata = withoutDeliveryMetadata(
    routeResult.nextContext,
  );
  if (outboundMessages.length === 0) {
    const contextOnlyUpdate = await updateConversationAfterMessage({
      conversationId: conversationResult.conversation.id,
      context: {
        ...nextContextWithoutDeliveryMetadata,
        ...(boundedRetiredMessageIds.length > 0
          ? { retiredNumericMessageIds: boundedRetiredMessageIds }
          : {}),
      },
    });

    if (!contextOnlyUpdate.ok) {
      logError("Failed to update WhatsApp conversation context", {
        conversationId: conversationResult.conversation.id,
        code: contextOnlyUpdate.error.code,
      });
      return jsonError("Internal Server Error", 500);
    }

    logInfo("Processed Z-API inbound message without outbound reply", {
      conversationId: conversationResult.conversation.id,
      phoneLast4: incoming.phone.slice(-4),
      providerMessageId: incoming.providerMessageId,
      intentClassification: incomingIntent.classification,
      immediateReason: immediateDecision.reason,
    });

    return jsonOk({
      received: true,
      processed: true,
      replied: false,
    });
  }

  const pendingContext = {
    ...nextContextWithoutDeliveryMetadata,
    ...(boundedRetiredMessageIds.length > 0
      ? { retiredNumericMessageIds: boundedRetiredMessageIds }
      : {}),
    deliveryGuard: {
      generationId,
      startedAt: deliveryGenerationStartedAt,
    },
  };

  const conversationUpdateResult = await updateConversationAfterMessage({
    conversationId: conversationResult.conversation.id,
    context: pendingContext,
  });

  if (!conversationUpdateResult.ok) {
    logError("Failed to update WhatsApp conversation context", {
      conversationId: conversationResult.conversation.id,
      code: conversationUpdateResult.error.code,
    });
    return jsonError("Internal Server Error", 500);
  }

  const sendResults: SendZapiMessageResult[] = [];
  const deliveryResults: Array<{
    message: RouteOutboundMessage;
    phone: string;
    options: number[];
    sendResult: SendZapiMessageResult;
  }> = [];
  let outboundPersistenceFailed = false;

  for (const outboundMessage of outboundMessages) {
    const outboundPhone = outboundMessage.phone ?? incoming.phone;
    const options =
      outboundPhone === incoming.phone
        ? extractNumericOptions(getOutboundMessageText(outboundMessage))
        : [];

    if (outboundMessage.delayMs && outboundMessage.delayMs > 0) {
      await sleep(outboundMessage.delayMs);
    }

    const sendResult = await sendOutboundMessage({
      phone: outboundPhone,
      message: outboundMessage,
    });

    sendResults.push(sendResult);
    deliveryResults.push({
      message: outboundMessage,
      phone: outboundPhone,
      options,
      sendResult,
    });

    if (!sendResult.ok) {
      logWarn("Z-API reply failed after inbound message was persisted", {
        conversationId: conversationResult.conversation.id,
        phoneLast4: outboundPhone.slice(-4),
        messageType: outboundMessage.type,
        error: sendResult.error,
      });
    }

    const outboundResult = await saveWhatsAppMessage({
      conversationId: conversationResult.conversation.id,
      customerId: customerResult.customer.id,
      direction: "outbound",
      messageType: outboundMessage.type,
      body: sanitizeOutboundText(
        outboundMessage.persistedBody ??
          (outboundMessage.type === "image"
            ? outboundMessage.caption
            : outboundMessage.body),
      ),
      providerMessageId: sendResult.ok ? sendResult.providerMessageId : null,
      rawMetadata: buildWhatsAppOutboundMetadata({
        sendResult,
        messageType: outboundMessage.type,
        reason: "webhook_reply",
        businessContext: outboundMessage.participantDeliveryTicketId
          ? {
              participant_delivery_ticket_id:
                outboundMessage.participantDeliveryTicketId,
            }
          : {},
      }),
    });

    if (!outboundResult.ok) {
      logError("Failed to save outbound WhatsApp message", {
        conversationId: conversationResult.conversation.id,
        code: outboundResult.error?.code,
      });
      outboundPersistenceFailed = true;
    }

    if (outboundMessage.participantDeliveryTicketId) {
      if (sendResult.ok) {
        const deliveredResult = await markParticipantTicketDelivered(
          outboundMessage.participantDeliveryTicketId,
        );

        if (!deliveredResult.ok) {
          logError("Failed to mark participant ticket as delivered after QR send", {
            conversationId: conversationResult.conversation.id,
            ticketId: outboundMessage.participantDeliveryTicketId,
            reason: deliveredResult.reason,
          });
        }

      } else {
        logWarn("Participant ticket QR send failed; ticket remains pending for retry", {
          conversationId: conversationResult.conversation.id,
          ticketId: outboundMessage.participantDeliveryTicketId,
          phoneLast4: outboundPhone.slice(-4),
          error: sendResult.error,
        });
      }
    }

  }

  const anyMessageDelivered = deliveryResults.some(
    (result) => result.sendResult.ok,
  );
  const intendedOptions = new Set(
    deliveryResults.flatMap((result) => result.options),
  );
  const deliveredOptions = new Set(
    deliveryResults.flatMap((result) =>
      result.sendResult.ok ? result.options : [],
    ),
  );
  const deliveredOptionMessageIds = deliveryResults.flatMap((result) =>
    result.sendResult.ok &&
    result.options.length > 0 &&
    result.sendResult.providerMessageId
      ? [result.sendResult.providerMessageId]
      : [],
  );
  const reconciledContext = anyMessageDelivered
    ? {
        ...nextContextWithoutDeliveryMetadata,
        ...(boundedRetiredMessageIds.length > 0
          ? { retiredNumericMessageIds: boundedRetiredMessageIds }
          : {}),
        ...(intendedOptions.size > 0
          ? {
              numericPrompt: {
                generationId,
                issuedAt: new Date().toISOString(),
                validOptions: [...deliveredOptions].sort(
                  (left, right) => left - right,
                ),
                messageIds: [...new Set(deliveredOptionMessageIds)],
              },
            }
          : {}),
      }
    : withoutDeliveryGuard(currentContext);
  const reconcileResult = await reconcileConversationDelivery({
    conversationId: conversationResult.conversation.id,
    generationId,
    context: reconciledContext,
  });

  if (!reconcileResult.ok) {
    logError("Failed to reconcile WhatsApp delivery context", {
      conversationId: conversationResult.conversation.id,
      code: reconcileResult.error.code,
    });
    return jsonError("Internal Server Error", 500);
  }

  if (!reconcileResult.applied) {
    logWarn("Skipped stale WhatsApp delivery reconciliation", {
      conversationId: conversationResult.conversation.id,
      generationId,
    });
  }

  if (outboundPersistenceFailed) {
    return jsonError("Internal Server Error", 500);
  }

  logInfo("Processed Z-API inbound message", {
    conversationId: conversationResult.conversation.id,
    phoneLast4: incoming.phone.slice(-4),
    providerMessageId: incoming.providerMessageId,
    intentClassification: incomingIntent.classification,
    immediateReason: immediateDecision.reason,
    zapiSent: sendResults.every((sendResult) => sendResult.ok),
    outboundCount: outboundMessages.length,
  });

  return jsonOk({
    received: true,
    processed: true,
  });
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
