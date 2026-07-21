import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const webhook = readFileSync(
  new URL("../src/app/api/webhook/zapi/route.ts", import.meta.url),
  "utf8",
);
const batchCron = readFileSync(
  new URL("../src/app/api/cron/process-whatsapp-batches/route.ts", import.meta.url),
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

function sliceBetween(source, startPattern, endPattern) {
  const start = source.search(startPattern);
  assert.notEqual(start, -1, `start pattern not found: ${startPattern}`);
  const rest = source.slice(start);
  const end = rest.search(endPattern);
  assert.notEqual(end, -1, `end pattern not found: ${endPattern}`);
  return rest.slice(0, end);
}

test("isolated greeting in idle is routed once immediately and is not queued for later batch processing", () => {
  const batchingBlock = sliceBetween(
    webhook,
    /resolveIncomingMessageIntent\(/,
    /if \(\s*deliveryGuardIsFresh/,
  );

  assert.match(webhook, /routeTicketMessage\(/);
  assert.match(webhook, /const effectiveText = incoming\.text \?\? ""/);
  assert.match(webhook, /routeTicketMessage\(\{[\s\S]*text:\s*effectiveText/);
  assert.doesNotMatch(
    batchingBlock,
    /appendInboundMessageToBatch\(/,
    "valid public inbound messages must not be queued in a later batch before routing",
  );
  assert.doesNotMatch(
    batchCron,
    /resolvedState === "idle"[\s\S]*TICKET_MESSAGES\.genericHelpPrompt/,
    "idle must not force the initial prompt from the batch worker without routing the inbound",
  );
  assert.match(batchCron, /customer_reply_pipeline_disabled/);
});

test("separate inbound messages are never semantically merged with punctuation before classification", () => {
  assert.doesNotMatch(
    batchCore,
    /\.join\("\. "\)/,
    "batch aggregation must not transform `Bom dia` + `Gostaria...` into `Bom dia. Gostaria...`",
  );
  assert.match(
    batchCore,
    /\.join\("\\n"\)/,
    "legacy batch aggregation may preserve order but must not add semantic punctuation",
  );
  assert.doesNotMatch(
    webhook,
    /buildAggregatedWhatsAppText\(/,
    "webhook processing must classify each inbound independently, not a synthetic aggregate",
  );
  assert.doesNotMatch(
    batchCron,
    /buildAggregatedWhatsAppText\(/,
    "later processing must not classify a synthetic aggregate as one user message",
  );
});

test("idle context never bypasses routeTicketMessage for a valid inbound", () => {
  assert.doesNotMatch(
    batchCron,
    /resolvedState === "idle"/,
    "batch worker must not branch on idle to answer customer-facing messages",
  );
  assert.doesNotMatch(
    batchCron,
    /routeTicketMessage\(/,
    "batch worker must not route stale customer-facing batches",
  );
  assert.doesNotMatch(
    batchCron,
    /genericHelpPrompt/,
    "batch worker must not send genericHelpPrompt only because the loaded state is idle",
  );
});

test("one inbound has only one response path and cannot be answered by both webhook and batch", () => {
  assert.doesNotMatch(
    webhook,
    /appendInboundMessageToBatch\(/,
    "webhook must not enqueue an inbound that it can also route and answer",
  );
  assert.doesNotMatch(
    batchCron,
    /sendAndSaveBatchReply\(/,
    "batch worker must not have an independent customer-facing send path for the same inbound",
  );
  assert.match(batchCron, /finishWhatsAppMessageBatch\(\{[\s\S]*status:\s*"cancelled"/);
  assert.match(batchCron, /customer_reply_pipeline_disabled/);
});

test("full outbound contract is preserved instead of collapsing to routeResult.reply", () => {
  assert.match(webhook, /function getOutboundMessages/);
  assert.match(webhook, /routeResult\.outboundMessages/);
  assert.match(webhook, /sendZapiImage/);
  assert.match(webhook, /persistedBody/);
  assert.match(webhook, /delayMs/);
  assert.match(webhook, /outboundMessage\.phone/);
  assert.match(webhook, /suppressTitle/);

  assert.doesNotMatch(
    batchCron,
    /body:\s*routeResult\.reply/,
    "deferred processing must not reduce multiple text/image outboundMessages to reply",
  );
  assert.doesNotMatch(
    batchCron,
    /sendZapiText[\s\S]*body:\s*routeResult\.reply/,
    "deferred processing must preserve the same outbound contract as the webhook",
  );
});

test("failed delivery remains explicitly failed and cannot be treated as delivered", () => {
  assert.match(webhook, /send_status:\s*"failed"/);
  assert.doesNotMatch(
    batchCron,
    /sendStatus:\s*sendResult\.ok \? "sent" : "failed"/,
    "all delivery metadata must use send_status so failed sends can be queried consistently",
  );
  assert.doesNotMatch(
    messagesService,
    /sendStatus:\s*"sent"/,
    "outbound dedupe must not depend on non-standard sendStatus metadata",
  );
});
