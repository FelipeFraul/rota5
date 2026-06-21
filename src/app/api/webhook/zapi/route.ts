import { timingSafeEqual } from "crypto";
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
  rateLimitResponse,
} from "@/lib/security/rateLimit";
import {
  getOrCreateOpenConversation,
  updateConversationAfterMessage,
} from "@/lib/tickets/services/conversations";
import { upsertCustomerFromWhatsApp } from "@/lib/tickets/services/customers";
import {
  findInboundMessageByProviderId,
  saveWhatsAppMessage,
} from "@/lib/tickets/services/messages";
import { TICKET_MESSAGES } from "@/lib/tickets/messages";
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
import { routeTicketMessage } from "@/lib/tickets/router";
import {
  DEFAULT_CONVERSATION_INACTIVITY_TTL_MINUTES,
  resolveConversationContextForInbound,
} from "@/lib/tickets/conversationState";
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

const MAX_WEBHOOK_BYTES = 256 * 1024;
const PHONE_RATE_LIMIT = 30;
const PHONE_RATE_LIMIT_WINDOW_SECONDS = 60;
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
  fromMe: boolean;
  isGroup: boolean;
  messageType: "text" | "image" | "document" | "system";
  mediaUrl: string | null;
};
type RouteOutboundMessage =
  | { type: "text"; body: string; phone?: string; persistedBody?: string; delayMs?: number }
  | { type: "image"; imageUrl: string; caption: string; phone?: string; persistedBody?: string; delayMs?: number };

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

  if (normalized === "image" || normalized === "document") {
    return normalized;
  }

  return "text";
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
    fromMe,
    isGroup,
    messageType: normalizeMessageType(rawMessageType),
    mediaUrl,
  };
}

function buildInboundMetadata({
  providerMessageId,
  messageType,
  redacted = false,
  redactionReason = "sensitive_input",
}: {
  providerMessageId: string | null;
  messageType: string;
  redacted?: boolean;
  redactionReason?: string;
}) {
  return {
    provider: "zapi",
    provider_message_id: providerMessageId,
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
    context?.state === "gate_access_passphrase_collecting"
  ) {
    return {
      body: GATE_ACCESS_REDACTED_BODY,
      reason: "gate_access_passphrase",
    };
  }

  return null;
}

function buildOutboundMetadata({
  sendResult,
  messageType,
}: {
  sendResult: SendZapiMessageResult;
  messageType: RouteOutboundMessage["type"];
}) {
  if (sendResult.ok) {
    return {
      provider: "zapi",
      message_type: messageType,
      send_status: "sent",
    };
  }

  return {
    provider: "zapi",
    message_type: messageType,
    send_status: "failed",
    error: sendResult.error,
  };
}

function getOutboundMessages(
  routeResult: Awaited<ReturnType<typeof routeTicketMessage>>,
): RouteOutboundMessage[] {
  if (routeResult.outboundMessages?.length) {
    return routeResult.outboundMessages;
  }

  if (routeResult.reply === TICKET_MESSAGES.genericHelp) {
    return [
      { type: "text", body: TICKET_MESSAGES.genericHelp },
      {
        type: "text",
        body: TICKET_MESSAGES.genericHelpCommands,
        delayMs: 5_000,
      },
    ];
  }

  return [{ type: "text", body: routeResult.reply }];
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
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
      caption: message.caption,
    });
  }

  return sendZapiText({
    phone,
    message: message.body,
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
  const sendResult = await sendZapiText({
    phone,
    message: body,
  });

  const outboundResult = await saveWhatsAppMessage({
    conversationId,
    customerId,
    direction: "outbound",
    messageType: "text",
    body,
    providerMessageId: sendResult.ok ? sendResult.providerMessageId : null,
    rawMetadata: buildOutboundMetadata({
      sendResult,
      messageType: "text",
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

  const rateLimit = await consumeRateLimit({
    routeKey: "webhook:zapi",
    limit: 60,
    windowSeconds: 60,
    request,
  });

  if (!rateLimit.allowed) {
    logWarn("Rate limited Z-API webhook", {
      sourceHash: rateLimit.sourceHash,
      count: rateLimit.count,
    });
    return rateLimitResponse(rateLimit);
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

  if (!incoming.text && !incoming.mediaUrl) {
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
    return jsonOk({ received: true, ignored: true, reason: "missing_text" });
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
  const currentContext = resolvedContext.context;

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
    body: inboundRedaction?.body ?? incoming.text,
    providerMessageId: incoming.providerMessageId,
    rawMetadata: buildInboundMetadata({
      providerMessageId: incoming.providerMessageId,
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

  const routeResult = await routeTicketMessage({
    customer: customerResult.customer,
    conversation: {
      ...conversationResult.conversation,
      context: currentContext,
    },
    text: incoming.text ?? incoming.mediaUrl ?? "",
    mediaUrl: incoming.mediaUrl,
    sourceIdentifier: getRequestSourceIdentifier(request),
  });

  const conversationUpdateResult = await updateConversationAfterMessage({
    conversationId: conversationResult.conversation.id,
    context: routeResult.nextContext,
  });

  if (!conversationUpdateResult.ok) {
    logError("Failed to update WhatsApp conversation context", {
      conversationId: conversationResult.conversation.id,
      code: conversationUpdateResult.error.code,
    });
    return jsonError("Internal Server Error", 500);
  }

  const outboundMessages = getOutboundMessages(routeResult);
  const sendResults: SendZapiMessageResult[] = [];

  for (const outboundMessage of outboundMessages) {
    const outboundPhone = outboundMessage.phone ?? incoming.phone;

    if (outboundMessage.delayMs && outboundMessage.delayMs > 0) {
      await sleep(outboundMessage.delayMs);
    }

    const sendResult = await sendOutboundMessage({
      phone: outboundPhone,
      message: outboundMessage,
    });

    sendResults.push(sendResult);

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
      body:
        outboundMessage.persistedBody ??
        (outboundMessage.type === "image"
          ? outboundMessage.caption
          : outboundMessage.body),
      providerMessageId: sendResult.ok ? sendResult.providerMessageId : null,
      rawMetadata: buildOutboundMetadata({
        sendResult,
        messageType: outboundMessage.type,
      }),
    });

    if (!outboundResult.ok) {
      logError("Failed to save outbound WhatsApp message", {
        conversationId: conversationResult.conversation.id,
        code: outboundResult.error?.code,
      });
      return jsonError("Internal Server Error", 500);
    }
  }

  logInfo("Processed Z-API inbound message", {
    conversationId: conversationResult.conversation.id,
    phoneLast4: incoming.phone.slice(-4),
    providerMessageId: incoming.providerMessageId,
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
