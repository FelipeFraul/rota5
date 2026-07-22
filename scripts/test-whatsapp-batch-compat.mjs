import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const batchService = readFileSync(
  new URL("../src/lib/tickets/services/whatsappMessageBatches.ts", import.meta.url),
  "utf8",
);
const batchCore = readFileSync(
  new URL("../src/lib/tickets/services/whatsappBatchCore.ts", import.meta.url),
  "utf8",
);
const messagesService = readFileSync(
  new URL("../src/lib/tickets/services/messages.ts", import.meta.url),
  "utf8",
);
const batchCron = readFileSync(
  new URL("../src/app/api/cron/process-whatsapp-batches/route.ts", import.meta.url),
  "utf8",
);
const zapiWebhook = readFileSync(
  new URL("../src/app/api/webhook/zapi/route.ts", import.meta.url),
  "utf8",
);
const conversationFinalizer = readFileSync(
  new URL("../src/lib/tickets/services/conversationFinalizer.ts", import.meta.url),
  "utf8",
);
const ticketRouter = readFileSync(
  new URL("../src/lib/tickets/router.ts", import.meta.url),
  "utf8",
);
const ticketMessages = readFileSync(
  new URL("../src/lib/tickets/messages.ts", import.meta.url),
  "utf8",
);
const retryMigration = readFileSync(
  new URL("../supabase/migrations/20260720000100_add_whatsapp_batch_retry_controls.sql", import.meta.url),
  "utf8",
);

test("claims batches with retry-aware RPC arguments and reads attempt_count", () => {
  assert.match(batchService, /processingTimeoutSeconds\s*=\s*300/);
  assert.match(batchService, /maxAttempts\s*=\s*3/);
  assert.match(batchService, /processing_timeout_seconds:\s*processingTimeoutSeconds/);
  assert.match(batchService, /max_attempts:\s*maxAttempts/);
  assert.match(batchService, /attemptCount:\s*row\.attempt_count/);
});

test("finishes batches with explicit error_code to avoid PostgREST overload ambiguity", () => {
  assert.match(batchService, /errorCode\s*=\s*null/);
  assert.match(batchService, /error_code:\s*errorCode/);
  assert.match(retryMigration, /finish_whatsapp_message_batch\(\s*target_batch_id uuid,\s*final_status text default 'processed',\s*error_code text default null\s*\)/);
});

test("legacy batch aggregation and send metadata do not invent customer-facing state", () => {
  assert.doesNotMatch(batchCore, /\.join\("\. "\)/);
  assert.doesNotMatch(batchCore, /replace\(\/\\s\+\\\.\//);
  assert.match(batchCore, /\.join\("\\n"\)/);
  assert.match(messagesService, /send_status:\s*"sent"/);
  assert.doesNotMatch(messagesService, /sendStatus:\s*"sent"/);
});

test("reschedules retryable batch failures and marks failed after attempt limit", () => {
  assert.match(batchService, /reschedule_whatsapp_message_batch/);
  assert.match(batchService, /retry_after_seconds:\s*retryAfterSeconds/);
  assert.match(batchService, /max_attempts:\s*maxAttempts/);
  assert.match(retryMigration, /when attempt_count >= bounded_max_attempts then 'failed'/);
  assert.match(batchCron, /MAX_BATCH_ATTEMPTS\s*=\s*3/);
  assert.match(batchCron, /rescheduleClaimedBatch/);
});

test("cron records success, retry, cancellation, and failure outcomes", () => {
  assert.match(batchCron, /status:\s*"rescheduled"/);
  assert.match(batchCron, /status:\s*"cancelled"/);
  assert.match(batchCron, /status:\s*"failed"/);
  assert.match(batchCron, /CUSTOMER_REPLY_PIPELINE_DISABLED_REASON\s*=\s*"customer_reply_pipeline_disabled"/);
  assert.match(batchCron, /finishWhatsAppMessageBatch\(\{\s*batchId,\s*status:\s*"cancelled"/);
  assert.match(batchCron, /reason:\s*"reschedule_failed"/);
});

test("cron finalizes inactive open conversations without duplicating finalizers", () => {
  assert.match(batchCron, /finalizeInactiveWhatsAppConversations/);
  assert.match(conversationFinalizer, /CONVERSATION_INACTIVITY_TTL_MINUTES/);
  assert.match(conversationFinalizer, /DEFAULT_FINALIZE_AFTER_MINUTES\s*=\s*30/);
  assert.match(conversationFinalizer, /finalizedConversationIds/);
  assert.match(conversationFinalizer, /finalized\.has\(row\.id\)/);
  assert.doesNotMatch(conversationFinalizer, /latestMessage\?\.direction === "outbound"/);
  assert.match(conversationFinalizer, /status:\s*"closed"/);
  assert.match(conversationFinalizer, /reason:\s*FINALIZER_REASON/);
  assert.match(ticketMessages, /conversationClosed:\s*"[^"]*encerrada\. Para iniciar uma nova digite ol[^"]*"/);
  assert.match(ticketMessages, /adminLogout:\s*"[^"]*administrativa encerrada\."/);
  assert.doesNotMatch(ticketMessages, /conversationClosed:\s*"ATENDIMENTO/);
});

test("public initial reply is sent immediately instead of waiting for the batch", () => {
  assert.match(zapiWebhook, /const effectiveText = incoming\.text \?\? ""/);
  assert.match(zapiWebhook, /routeTicketMessage\(\{[\s\S]*text:\s*effectiveText/);
  assert.doesNotMatch(zapiWebhook, /appendInboundMessageToBatch/);
  assert.doesNotMatch(zapiWebhook, /buildAggregatedWhatsAppText/);
  assert.doesNotMatch(zapiWebhook, /listWhatsAppBatchMessages/);
  assert.doesNotMatch(zapiWebhook, /finishWhatsAppMessageBatch/);
  assert.doesNotMatch(zapiWebhook, /after\(async \(\) =>/);
  assert.doesNotMatch(zapiWebhook, /await sleep\(31_000\)/);
  assert.doesNotMatch(zapiWebhook, /processAfter:\s*true/);
  assert.match(ticketRouter, /intent\.classification === "purchase_support" && !hasActiveState/);
  assert.match(ticketRouter, /incomingIntent\.classification === "purchase_support"[\s\S]*const bootstrap = resolvePublicInitialHelpBootstrap\(baseContext\)/);
  assert.match(ticketRouter, /function publicInitialHelpContext/);
  assert.match(ticketRouter, /isBuyerReservationExitIntent\(text\)\s*&&[\s\S]*previousState\.state !== "reservation_created"[\s\S]*previousState\.state !== "payment_pending"[\s\S]*reply:\s*isBuyerNewIntent\(text\)\s*\?\s*TICKET_MESSAGES\.reentryPrompt\s*:\s*TICKET_MESSAGES\.buyerFlowReset[\s\S]*nextContext:\s*resetBuyerReservationContext\(baseContext\)/);
  assert.match(ticketRouter, /function shouldSendPublicInitialHelp/);
  assert.match(ticketRouter, /function buildPublicInitialHelpResponse/);
  assert.doesNotMatch(batchCron, /routeTicketMessage/);
  assert.doesNotMatch(batchCron, /genericHelpPrompt/);
  assert.doesNotMatch(batchCron, /routeResult\.reply/);
  assert.doesNotMatch(batchCron, /sendAndSaveBatchReply/);
  assert.doesNotMatch(batchCron, /sendZapiText/);
  assert.doesNotMatch(batchCron, /sendZapiImage/);
  assert.doesNotMatch(batchCron, /updateConversationAfterMessage/);
  assert.match(batchCron, /customer_reply_pipeline_disabled/);
});
