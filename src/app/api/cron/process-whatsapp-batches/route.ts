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
import { finalizeInactiveWhatsAppConversations } from "@/lib/tickets/services/conversationFinalizer";
import { getCustomerById } from "@/lib/tickets/services/customers";
import {
  findSentBatchReplyMessage,
  saveWhatsAppMessage,
} from "@/lib/tickets/services/messages";
import {
  buildAggregatedWhatsAppText,
  claimDueWhatsAppMessageBatches,
  finishWhatsAppMessageBatch,
  listWhatsAppBatchMessages,
  rescheduleWhatsAppMessageBatch,
} from "@/lib/tickets/services/whatsappMessageBatches";
import { sendZapiText, type SendZapiMessageResult } from "@/lib/zapi/client";
import { sanitizeWhatsAppText } from "@/lib/zapi/textEncoding";

export const runtime = "nodejs";

const PROCESSING_TIMEOUT_SECONDS = 5 * 60;
const MAX_BATCH_ATTEMPTS = 3;
const RETRY_BACKOFF_SECONDS = [60, 5 * 60, 15 * 60] as const;

type BatchProcessingResult =
  | { status: "processed"; sent: boolean }
  | { status: "rescheduled"; reason: string }
  | { status: "failed"; reason: string }
  | { status: "cancelled"; reason: string };

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

function getRetryBackoffSeconds(attemptCount: number) {
  return RETRY_BACKOFF_SECONDS[
    Math.max(0, Math.min(attemptCount - 1, RETRY_BACKOFF_SECONDS.length - 1))
  ];
}

function sanitizeBatchErrorCode(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9_:-]+/g, "_")
    .slice(0, 80);
}

function getSendFailureCode(sendResult: SendZapiMessageResult) {
  return sendResult.ok ? null : sanitizeBatchErrorCode(sendResult.error);
}

async function rescheduleClaimedBatch({
  batchId,
  attemptCount,
  errorCode,
}: {
  batchId: string;
  attemptCount: number;
  errorCode: string;
}): Promise<BatchProcessingResult> {
  const retryResult = await rescheduleWhatsAppMessageBatch({
    batchId,
    retryAfterSeconds: getRetryBackoffSeconds(attemptCount),
    errorCode,
    maxAttempts: MAX_BATCH_ATTEMPTS,
  });

  if (!retryResult.ok) {
    throw retryResult.error;
  }

  if (retryResult.failed) {
    return {
      status: "failed",
      reason: errorCode,
    };
  }

  return {
    status: retryResult.rescheduled ? "rescheduled" : "failed",
    reason: retryResult.rescheduled ? errorCode : "reschedule_not_applied",
  };
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
  const existingSentResult = await findSentBatchReplyMessage({
    batchId,
    sequence,
  });

  if (!existingSentResult.ok) {
    throw existingSentResult.error;
  }

  if (existingSentResult.message) {
    return {
      ok: true as const,
      deduped: true,
    };
  }

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

  if (!sendResult.ok) {
    return {
      ok: false as const,
      retryable: true,
      errorCode: getSendFailureCode(sendResult) ?? "zapi_send_failed",
    };
  }

  return {
    ok: true as const,
    deduped: false,
  };
}

async function processClaimedBatch({
  batchId,
  conversationId,
  attemptCount,
}: {
  batchId: string;
  conversationId: string;
  attemptCount: number;
}): Promise<BatchProcessingResult> {
  const conversationResult = await getOpenConversationById(conversationId);

  if (!conversationResult.ok || !conversationResult.conversation) {
    const finishResult = await finishWhatsAppMessageBatch({
      batchId,
      status: "cancelled",
      errorCode: "conversation_not_found",
    });

    if (!finishResult.ok) {
      throw finishResult.error;
    }

    return { status: "cancelled", reason: "conversation_not_found" };
  }

  const customerResult = await getCustomerById(
    conversationResult.conversation.customer_id,
  );

  if (!customerResult.ok || !customerResult.customer) {
    const finishResult = await finishWhatsAppMessageBatch({
      batchId,
      status: "cancelled",
      errorCode: "customer_not_found",
    });

    if (!finishResult.ok) {
      throw finishResult.error;
    }

    return { status: "cancelled", reason: "customer_not_found" };
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
  let allSent = false;

  if (resolvedState === "idle") {
    const firstSent = await sendAndSaveBatchReply({
      conversationId: conversationResult.conversation.id,
      customerId: customerResult.customer.id,
      phone: customerResult.customer.whatsapp_phone,
      batchId,
      body: TICKET_MESSAGES.genericHelp,
      sequence: 1,
    });

    if (!firstSent.ok) {
      if (!firstSent.retryable) {
        const finishResult = await finishWhatsAppMessageBatch({
          batchId,
          status: "failed",
          errorCode: firstSent.errorCode,
        });

        if (!finishResult.ok) {
          throw finishResult.error;
        }

        return { status: "failed", reason: firstSent.errorCode };
      }

      return rescheduleClaimedBatch({
        batchId,
        attemptCount,
        errorCode: firstSent.errorCode,
      });
    }

    await sleep(5_000);
    const secondSent = await sendAndSaveBatchReply({
      conversationId: conversationResult.conversation.id,
      customerId: customerResult.customer.id,
      phone: customerResult.customer.whatsapp_phone,
      batchId,
      body: TICKET_MESSAGES.genericHelpCommands,
      sequence: 2,
    });

    if (!secondSent.ok) {
      if (!secondSent.retryable) {
        const finishResult = await finishWhatsAppMessageBatch({
          batchId,
          status: "failed",
          errorCode: secondSent.errorCode,
        });

        if (!finishResult.ok) {
          throw finishResult.error;
        }

        return { status: "failed", reason: secondSent.errorCode };
      }

      return rescheduleClaimedBatch({
        batchId,
        attemptCount,
        errorCode: secondSent.errorCode,
      });
    }

    allSent = true;
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
    const sendResult = await sendAndSaveBatchReply({
      conversationId: conversationResult.conversation.id,
      customerId: customerResult.customer.id,
      phone: customerResult.customer.whatsapp_phone,
      batchId,
      body: routeResult.reply,
      sequence: 1,
    });

    if (!sendResult.ok) {
      if (!sendResult.retryable) {
        const finishResult = await finishWhatsAppMessageBatch({
          batchId,
          status: "failed",
          errorCode: sendResult.errorCode,
        });

        if (!finishResult.ok) {
          throw finishResult.error;
        }

        return { status: "failed", reason: sendResult.errorCode };
      }

      return rescheduleClaimedBatch({
        batchId,
        attemptCount,
        errorCode: sendResult.errorCode,
      });
    }

    allSent = true;
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
    status: "processed",
    sent: allSent,
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

  const claimedResult = await claimDueWhatsAppMessageBatches({
    limit: 20,
    processingTimeoutSeconds: PROCESSING_TIMEOUT_SECONDS,
    maxAttempts: MAX_BATCH_ATTEMPTS,
  });

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
      try {
        results.push(await rescheduleClaimedBatch({
          batchId: batch.batchId,
          attemptCount: batch.attemptCount,
          errorCode: "processing_failed",
        }));
      } catch (rescheduleError) {
        logError("Failed to reschedule errored WhatsApp batch", {
          batchId: batch.batchId,
          conversationId: batch.conversationId,
          error: rescheduleError,
        });
        results.push({ status: "failed" as const, reason: "reschedule_failed" });
      }
    }
  }

  const processed = results.filter((result) => result.status === "processed").length;
  const rescheduled = results.filter((result) => result.status === "rescheduled").length;
  const failed = results.filter((result) => result.status === "failed").length;
  const cancelled = results.filter((result) => result.status === "cancelled").length;
  let finalizedConversations = {
    checked: 0,
    closed: 0,
    failed: 0,
  };

  try {
    finalizedConversations = await finalizeInactiveWhatsAppConversations({
      limit: 20,
      finalizeAfterMinutes: 30,
    });
  } catch (error) {
    logError("Failed to finalize inactive WhatsApp conversations", { error });
    finalizedConversations.failed += 1;
  }

  const hasOnlyFailures =
    claimedResult.batches.length > 0 && processed === 0 && rescheduled === 0 && cancelled === 0;

  const responseBody = {
    ok: true,
    claimed: claimedResult.batches.length,
    processed,
    rescheduled,
    failed,
    cancelled,
    finalizedConversations,
  };

  return hasOnlyFailures
    ? jsonError("WhatsApp batch cron failed", 500, responseBody)
    : jsonOk(responseBody);
}

export async function GET(request: Request) {
  return handleProcessWhatsAppBatchesCron(request);
}

export async function POST(request: Request) {
  return handleProcessWhatsAppBatchesCron(request);
}
