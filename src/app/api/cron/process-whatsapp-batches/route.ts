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
import { finalizeInactiveWhatsAppConversations } from "@/lib/tickets/services/conversationFinalizer";
import { processDuePaidTicketDeliveries } from "@/lib/tickets/services/paidTicketDeliveryWorker";
import {
  claimDueWhatsAppMessageBatches,
  finishWhatsAppMessageBatch,
  rescheduleWhatsAppMessageBatch,
} from "@/lib/tickets/services/whatsappMessageBatches";

export const runtime = "nodejs";

const PROCESSING_TIMEOUT_SECONDS = 5 * 60;
const MAX_BATCH_ATTEMPTS = 3;
const RETRY_BACKOFF_SECONDS = [60, 5 * 60, 15 * 60] as const;
const CUSTOMER_REPLY_PIPELINE_DISABLED_REASON =
  "customer_reply_pipeline_disabled";

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

function getRetryBackoffSeconds(attemptCount: number) {
  return RETRY_BACKOFF_SECONDS[
    Math.max(0, Math.min(attemptCount - 1, RETRY_BACKOFF_SECONDS.length - 1))
  ];
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

async function processClaimedBatch({
  batchId,
}: {
  batchId: string;
  conversationId: string;
  attemptCount: number;
}): Promise<BatchProcessingResult> {
  const finishResult = await finishWhatsAppMessageBatch({
    batchId,
    status: "cancelled",
    errorCode: CUSTOMER_REPLY_PIPELINE_DISABLED_REASON,
  });

  if (!finishResult.ok) {
    throw finishResult.error;
  }

  return { status: "cancelled", reason: CUSTOMER_REPLY_PIPELINE_DISABLED_REASON };
}

export async function processDueWhatsAppMessageBatches({
  limit = 20,
}: {
  limit?: number;
} = {}) {
  const claimedResult = await claimDueWhatsAppMessageBatches({
    limit,
    processingTimeoutSeconds: PROCESSING_TIMEOUT_SECONDS,
    maxAttempts: MAX_BATCH_ATTEMPTS,
  });

  if (!claimedResult.ok) {
    logError("Failed to claim due WhatsApp batches", {
      code: claimedResult.error?.code,
    });
    throw claimedResult.error;
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
    });
  } catch (error) {
    logError("Failed to finalize inactive WhatsApp conversations", { error });
    finalizedConversations.failed += 1;
  }

  return {
    claimed: claimedResult.batches.length,
    processed,
    rescheduled,
    failed,
    cancelled,
    finalizedConversations,
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

  let responseBody: Awaited<ReturnType<typeof processDueWhatsAppMessageBatches>>;
  let paidTicketDeliveries: Awaited<
    ReturnType<typeof processDuePaidTicketDeliveries>
  >;

  try {
    responseBody = await processDueWhatsAppMessageBatches();
    paidTicketDeliveries = await processDuePaidTicketDeliveries();
  } catch (error) {
    logError("Failed to process durable WhatsApp queues", {
      error,
    });
    return jsonError("Internal Server Error", 500);
  }

  const hasOnlyFailures =
    responseBody.claimed > 0 &&
    responseBody.processed === 0 &&
    responseBody.rescheduled === 0 &&
    responseBody.cancelled === 0;

  const jsonBody = {
    ok: true,
    ...responseBody,
    paidTicketDeliveries,
  };

  return hasOnlyFailures
    ? jsonError("WhatsApp batch cron failed", 500, jsonBody)
    : jsonOk(jsonBody);
}

export async function GET(request: Request) {
  return handleProcessWhatsAppBatchesCron(request);
}

export async function POST(request: Request) {
  return handleProcessWhatsAppBatchesCron(request);
}
