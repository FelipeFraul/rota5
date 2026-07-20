import { timingSafeEqual } from "crypto";
import {
  jsonError,
  jsonOk,
  unauthorized,
} from "@/lib/http/responses";
import { logError, logWarn } from "@/lib/logger";
import {
  consumeRateLimit,
  rateLimitResponse,
} from "@/lib/security/rateLimit";
import { resolveConversationContextForInbound } from "@/lib/tickets/conversationState";
import { TICKET_MESSAGES } from "@/lib/tickets/messages";
import { routeTicketMessage } from "@/lib/tickets/router";
import {
  getOpenConversationById,
  updateConversationAfterMessage,
} from "@/lib/tickets/services/conversations";
import { getCustomerById } from "@/lib/tickets/services/customers";
import { saveWhatsAppMessage } from "@/lib/tickets/services/messages";
import {
  buildAggregatedWhatsAppText,
  claimDueWhatsAppMessageBatches,
  finishWhatsAppMessageBatch,
  listWhatsAppBatchMessages,
} from "@/lib/tickets/services/whatsappMessageBatches";
import { sendZapiText } from "@/lib/zapi/client";
import { sanitizeWhatsAppText } from "@/lib/zapi/textEncoding";

export const runtime = "nodejs";

function getBearerToken(request: Request) {
  const authorization = request.headers.get("authorization") ?? "";
  return authorization.replace(/^Bearer\s+/i, "").trim();
}

function isSecretMatch(received: string, expected: string) {
  if (!received || !expected) return false;

  const receivedBuffer = Buffer.from(received);
  const expectedBuffer = Buffer.from(expected);

  return (
    receivedBuffer.length === expectedBuffer.length &&
    timingSafeEqual(receivedBuffer, expectedBuffer)
  );
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function sendAndSaveBatchReply({
  conversationId,
  customerId,
  phone,
  batchId,
  body,
  sequence,
}: {
  conversationId: string;
  customerId: string;
  phone: string;
  batchId: string;
  body: string;
  sequence: number;
}) {
  const outboundText = sanitizeWhatsAppText(body);
  const sendResult = await sendZapiText({
    phone,
    message: outboundText,
  });
  const outboundResult = await saveWhatsAppMessage({
    conversationId,
    customerId,
    direction: "outbound",
    messageType: "text",
    body: outboundText,
    providerMessageId: sendResult.ok ? sendResult.providerMessageId : null,
    rawMetadata: {
      provider: "zapi",
      batchId,
      batchExpired: true,
      sequence,
      sendStatus: sendResult.ok ? "sent" : "failed",
      ...(!sendResult.ok ? { error: sendResult.error } : {}),
    },
  });

  if (!outboundResult.ok) {
    throw outboundResult.error;
  }

  return sendResult.ok;
}

async function processClaimedBatch({
  batchId,
  conversationId,
}: {
  batchId: string;
  conversationId: string;
}) {
  const conversationResult = await getOpenConversationById(conversationId);

  if (!conversationResult.ok || !conversationResult.conversation) {
    await finishWhatsAppMessageBatch({ batchId, status: "cancelled" });
    return { ok: false as const, reason: "conversation_not_found" };
  }

  const customerResult = await getCustomerById(
    conversationResult.conversation.customer_id,
  );

  if (!customerResult.ok || !customerResult.customer) {
    await finishWhatsAppMessageBatch({ batchId, status: "cancelled" });
    return { ok: false as const, reason: "customer_not_found" };
  }

  const messagesResult = await listWhatsAppBatchMessages(batchId);

  if (!messagesResult.ok) {
    throw messagesResult.error;
  }

  const resolvedContext = resolveConversationContextForInbound({
    context: conversationResult.conversation.context,
    lastMessageAt: conversationResult.conversation.last_message_at,
  });
  const resolvedState =
    typeof resolvedContext.context.state === "string"
      ? resolvedContext.context.state
      : "idle";
  let routeNextContext = resolvedContext.context;
  let sent = false;

  if (resolvedState === "idle") {
    const firstSent = await sendAndSaveBatchReply({
      conversationId: conversationResult.conversation.id,
      customerId: customerResult.customer.id,
      phone: customerResult.customer.whatsapp_phone,
      batchId,
      body: TICKET_MESSAGES.genericHelp,
      sequence: 1,
    });
    await sleep(5_000);
    const secondSent = await sendAndSaveBatchReply({
      conversationId: conversationResult.conversation.id,
      customerId: customerResult.customer.id,
      phone: customerResult.customer.whatsapp_phone,
      batchId,
      body: TICKET_MESSAGES.genericHelpCommands,
      sequence: 2,
    });
    sent = firstSent && secondSent;
    routeNextContext = {
      ...resolvedContext.context,
      publicInitialHelpSent: true,
    };
  } else {
    const aggregatedText = buildAggregatedWhatsAppText(messagesResult.messages);
    const routeResult = await routeTicketMessage({
      customer: customerResult.customer,
      conversation: {
        ...conversationResult.conversation,
        context: resolvedContext.context,
      },
      text: aggregatedText,
    });
    sent = await sendAndSaveBatchReply({
      conversationId: conversationResult.conversation.id,
      customerId: customerResult.customer.id,
      phone: customerResult.customer.whatsapp_phone,
      batchId,
      body: routeResult.reply,
      sequence: 1,
    });
    routeNextContext = routeResult.nextContext;
  }

  const updateResult = await updateConversationAfterMessage({
    conversationId: conversationResult.conversation.id,
    context: routeNextContext,
  });

  if (!updateResult.ok) {
    throw updateResult.error;
  }

  const finishResult = await finishWhatsAppMessageBatch({
    batchId,
    status: "processed",
  });

  if (!finishResult.ok) {
    throw finishResult.error;
  }

  return {
    ok: true as const,
    sent,
  };
}

async function handleProcessWhatsAppBatchesCron(request: Request) {
  const cronSecret = process.env.CRON_SECRET?.trim();

  if (!cronSecret) {
    logError("WhatsApp batch cron is missing CRON_SECRET");
    return jsonError("Cron not configured", 503);
  }

  if (!isSecretMatch(getBearerToken(request), cronSecret)) {
    logWarn("Rejected WhatsApp batch cron with invalid secret");
    return unauthorized();
  }

  const rateLimit = await consumeRateLimit({
    routeKey: "cron:process-whatsapp-batches",
    limit: 30,
    windowSeconds: 60,
    request,
  });

  if (!rateLimit.allowed) {
    logWarn("Rate limited WhatsApp batch cron", {
      sourceHash: rateLimit.sourceHash,
      count: rateLimit.count,
    });
    return rateLimitResponse(rateLimit);
  }

  const claimedResult = await claimDueWhatsAppMessageBatches({ limit: 20 });

  if (!claimedResult.ok) {
    logError("Failed to claim due WhatsApp batches", {
      code: claimedResult.error?.code,
    });
    return jsonError("Internal Server Error", 500);
  }

  const results = [];

  for (const batch of claimedResult.batches) {
    try {
      results.push(await processClaimedBatch(batch));
    } catch (error) {
      logError("Failed to process claimed WhatsApp batch", {
        batchId: batch.batchId,
        conversationId: batch.conversationId,
        error,
      });
      results.push({ ok: false as const, reason: "processing_failed" });
    }
  }

  return jsonOk({
    ok: true,
    claimed: claimedResult.batches.length,
    processed: results.filter((result) => result.ok).length,
    failed: results.filter((result) => !result.ok).length,
  });
}

export async function GET(request: Request) {
  return handleProcessWhatsAppBatchesCron(request);
}

export async function POST(request: Request) {
  return handleProcessWhatsAppBatchesCron(request);
}
