import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const batchService = readFileSync(
  new URL("../src/lib/tickets/services/whatsappMessageBatches.ts", import.meta.url),
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

test("reschedules retryable batch failures and marks failed after attempt limit", () => {
  assert.match(batchService, /reschedule_whatsapp_message_batch/);
  assert.match(batchService, /retry_after_seconds:\s*retryAfterSeconds/);
  assert.match(batchService, /max_attempts:\s*maxAttempts/);
  assert.match(retryMigration, /when attempt_count >= bounded_max_attempts then 'failed'/);
  assert.match(batchCron, /MAX_BATCH_ATTEMPTS\s*=\s*3/);
  assert.match(batchCron, /rescheduleClaimedBatch/);
});

test("cron records success, retry, cancellation, and failure outcomes", () => {
  assert.match(batchCron, /status:\s*"processed"/);
  assert.match(batchCron, /status:\s*"rescheduled"/);
  assert.match(batchCron, /status:\s*"cancelled"/);
  assert.match(batchCron, /status:\s*"failed"/);
  assert.match(batchCron, /finishWhatsAppMessageBatch\(\{\s*batchId,\s*status:\s*"processed"/);
  assert.match(batchCron, /reason:\s*"reschedule_failed"/);
});

test("cron finalizes inactive open conversations without duplicating finalizers", () => {
  assert.match(batchCron, /finalizeInactiveWhatsAppConversations/);
  assert.match(batchCron, /finalizeAfterMinutes:\s*30/);
  assert.match(conversationFinalizer, /finalizedConversationIds/);
  assert.match(conversationFinalizer, /!finalized\.has\(row\.id\)/);
  assert.doesNotMatch(conversationFinalizer, /latestMessage\?\.direction === "outbound"/);
  assert.match(conversationFinalizer, /status:\s*"closed"/);
  assert.match(conversationFinalizer, /reason:\s*FINALIZER_REASON/);
  assert.match(ticketMessages, /Sessão encerrada\. Para iniciar uma nova digite olá!/);
});

test("public initial reply waits for the 30 second batch before greeting", () => {
  assert.match(zapiWebhook, /publicInitialHelpWasSent/);
  assert.match(zapiWebhook, /shouldDelayPublicInitialReply/);
  assert.match(zapiWebhook, /currentStateName === "idle" && !publicInitialHelpWasSent/);
  assert.match(zapiWebhook, /isActionable:\s*shouldDelayPublicInitialReply\s*\?\s*false\s*:\s*immediateDecision\.immediate/);
  assert.match(ticketRouter, /intent\.classification === "purchase_support" && !hasActiveState/);
  assert.match(ticketRouter, /incomingIntent\.classification === "purchase_support"[\s\S]*baseContext\.state === "idle"[\s\S]*reply:\s*TICKET_MESSAGES\.genericHelp/);
  assert.match(ticketRouter, /function publicInitialHelpContext/);
  assert.match(ticketRouter, /reply:\s*TICKET_MESSAGES\.genericHelp[\s\S]*nextContext:\s*publicInitialHelpContext\(baseContext\)/);
  assert.match(ticketRouter, /previousState\.state === "idle"[\s\S]*previousState\.publicInitialHelpSent !== true[\s\S]*reply:\s*TICKET_MESSAGES\.genericHelp/);
  assert.match(batchCron, /body:\s*TICKET_MESSAGES\.genericHelp/);
  assert.match(batchCron, /body:\s*TICKET_MESSAGES\.genericHelpCommands/);
});
