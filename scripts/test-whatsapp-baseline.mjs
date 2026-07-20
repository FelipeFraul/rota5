import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { test } from "node:test";

const COLLECT_SECONDS = 30;
const MAX_WINDOW_SECONDS = 30;
const PROCESSING_TIMEOUT_SECONDS = 300;
const MAX_ATTEMPTS = 3;
const BACKOFF_SECONDS = [60, 300, 900];

function addSeconds(date, seconds) {
  return new Date(date.getTime() + seconds * 1000);
}

function boundedBackoff(attemptCount) {
  return BACKOFF_SECONDS[Math.max(0, Math.min(attemptCount - 1, BACKOFF_SECONDS.length - 1))];
}

class InMemoryWhatsAppBatchStore {
  constructor() {
    this.batches = new Map();
    this.batchMessages = new Map();
    this.messageToBatch = new Map();
    this.sentReplies = new Set();
  }

  append({ conversationId, messageId, isActionable = false, now }) {
    let batch = [...this.batches.values()]
      .filter((candidate) => (
        candidate.conversationId === conversationId &&
        candidate.status === "collecting"
      ))
      .sort((left, right) => left.firstMessageAt - right.firstMessageAt)[0];

    if (!batch) {
      batch = {
        id: randomUUID(),
        conversationId,
        status: "collecting",
        firstMessageAt: now,
        lastMessageAt: now,
        processAfter: addSeconds(now, Math.min(COLLECT_SECONDS, MAX_WINDOW_SECONDS)),
        processingStartedAt: null,
        attemptCount: 0,
        nextAttemptAt: null,
        lastErrorCode: null,
        version: 1,
      };
      this.batches.set(batch.id, batch);
      this.batchMessages.set(batch.id, []);
    } else {
      batch.lastMessageAt = now;
      batch.processAfter = new Date(Math.min(
        addSeconds(now, COLLECT_SECONDS).getTime(),
        addSeconds(batch.firstMessageAt, MAX_WINDOW_SECONDS).getTime(),
      ));
      batch.version += 1;
    }

    if (!this.messageToBatch.has(messageId)) {
      const messages = this.batchMessages.get(batch.id);
      messages.push({ id: messageId, body: messageId, position: messages.length + 1 });
      this.messageToBatch.set(messageId, batch.id);
    }

    if (isActionable && batch.status === "collecting") {
      batch.status = "cancelled";
      batch.cancelledAt = now;
      batch.processAfter = now;
      batch.version += 1;
      return { batchId: batch.id, status: "cancelled", shouldProcessNow: true };
    }

    return { batchId: batch.id, status: batch.status, shouldProcessNow: false };
  }

  claimDue({ now, limit = 20, processingTimeoutSeconds = PROCESSING_TIMEOUT_SECONDS, maxAttempts = MAX_ATTEMPTS }) {
    const due = [...this.batches.values()]
      .filter((batch) => (
        (
          batch.status === "collecting" &&
          batch.processAfter <= now &&
          (batch.nextAttemptAt ?? batch.processAfter) <= now
        ) ||
        (
          batch.status === "processing" &&
          (batch.processingStartedAt ?? batch.claimedAt ?? batch.updatedAt ?? batch.processAfter) <=
            addSeconds(now, -processingTimeoutSeconds) &&
          (batch.nextAttemptAt ?? now) <= now
        )
      ) && batch.attemptCount < maxAttempts)
      .sort((left, right) =>
        (left.nextAttemptAt ?? left.processAfter).getTime() -
        (right.nextAttemptAt ?? right.processAfter).getTime(),
      )
      .slice(0, Math.max(1, Math.min(limit, 100)));

    return due.map((batch) => {
      batch.status = "processing";
      batch.claimedAt = now;
      batch.processingStartedAt = now;
      batch.attemptCount += 1;
      batch.lastErrorCode = null;
      batch.version += 1;
      return {
        batchId: batch.id,
        conversationId: batch.conversationId,
        attemptCount: batch.attemptCount,
      };
    });
  }

  reschedule({ batchId, retryAfterSeconds, errorCode, now, maxAttempts = MAX_ATTEMPTS }) {
    const batch = this.batches.get(batchId);
    if (!batch || batch.status !== "processing") {
      return { rescheduled: false, failed: false, attemptCount: 0, nextAttemptAt: null };
    }

    batch.processingStartedAt = null;
    batch.lastErrorCode = errorCode;
    batch.lastErrorAt = now;
    batch.version += 1;

    if (batch.attemptCount >= maxAttempts) {
      batch.status = "failed";
      batch.cancelledAt = now;
      batch.nextAttemptAt = null;
      return { rescheduled: false, failed: true, attemptCount: batch.attemptCount, nextAttemptAt: null };
    }

    batch.status = "collecting";
    batch.nextAttemptAt = addSeconds(now, retryAfterSeconds);
    batch.processAfter = batch.nextAttemptAt;
    return {
      rescheduled: true,
      failed: false,
      attemptCount: batch.attemptCount,
      nextAttemptAt: batch.nextAttemptAt,
    };
  }

  finish({ batchId, status = "processed", errorCode = null, now }) {
    if (!["processed", "cancelled", "failed"].includes(status)) {
      throw new Error("invalid_batch_final_status");
    }

    const batch = this.batches.get(batchId);
    if (!batch || !["processing", "collecting", "cancelled"].includes(batch.status)) {
      return false;
    }

    batch.status = status;
    batch.processingStartedAt = null;
    batch.nextAttemptAt = null;
    batch.lastErrorCode = errorCode;
    if (status === "processed") batch.processedAt = now;
    if (status === "cancelled" || status === "failed") batch.cancelledAt = now;
    batch.version += 1;
    return true;
  }

  sendReply({ batchId, sequence, sendResult }) {
    const key = `${batchId}:${sequence}`;
    if (this.sentReplies.has(key)) return { ok: true, deduped: true };
    if (!sendResult.ok) return sendResult;
    this.sentReplies.add(key);
    return { ok: true, deduped: false };
  }

  messages(batchId) {
    return [...(this.batchMessages.get(batchId) ?? [])].sort(
      (left, right) => left.position - right.position,
    );
  }
}

function buildAggregatedWhatsAppText(messages) {
  return messages
    .map((message) => message.body?.trim())
    .filter(Boolean)
    .join(". ")
    .replace(/\s+\./g, ".")
    .replace(/\.{2,}/g, ".")
    .trim();
}

function shouldDelayInitialPublicMessage({
  inboundRedaction = false,
  allowedCodexPhone = false,
  state = "idle",
  publicInitialHelpSent = false,
  messageCount = 1,
}) {
  return (
    !inboundRedaction &&
    !allowedCodexPhone &&
    state === "idle" &&
    publicInitialHelpSent !== true &&
    messageCount <= 1
  );
}

test("creates and reuses one collecting batch per conversation", () => {
  const store = new InMemoryWhatsAppBatchStore();
  const first = store.append({ conversationId: "c1", messageId: "olá", now: new Date("2026-07-18T21:55:00Z") });
  const second = store.append({ conversationId: "c1", messageId: "tudo bem?", now: new Date("2026-07-18T21:55:05Z") });
  assert.equal(second.batchId, first.batchId);
  assert.equal(store.messages(first.batchId).length, 2);
});

test("aggregates several messages in arrival order", () => {
  assert.equal(buildAggregatedWhatsAppText([
    { body: "olá " },
    { body: " tudo bem?" },
    { body: "" },
    { body: null },
    { body: "como está" },
  ]), "olá. tudo bem?. como está");
});

test("respects the fixed 30 second max window from the first message", () => {
  const store = new InMemoryWhatsAppBatchStore();
  const firstAt = new Date("2026-07-18T21:55:00Z");
  const first = store.append({ conversationId: "c1", messageId: "m1", now: firstAt });
  store.append({ conversationId: "c1", messageId: "m2", now: new Date("2026-07-18T21:55:20Z") });
  assert.equal(store.batches.get(first.batchId).processAfter.toISOString(), addSeconds(firstAt, 30).toISOString());
});

test("claims a due batch exclusively once across concurrent cron attempts", async () => {
  const store = new InMemoryWhatsAppBatchStore();
  const first = store.append({ conversationId: "c1", messageId: "m1", now: new Date("2026-07-18T21:55:00Z") });
  const now = new Date("2026-07-18T21:55:31Z");
  const [left, right] = await Promise.all([
    Promise.resolve().then(() => store.claimDue({ now })),
    Promise.resolve().then(() => store.claimDue({ now })),
  ]);
  assert.deepEqual([...left, ...right].map((batch) => batch.batchId), [first.batchId]);
});

test("processing batch before timeout is not recovered", () => {
  const store = new InMemoryWhatsAppBatchStore();
  const first = store.append({ conversationId: "c1", messageId: "m1", now: new Date("2026-07-18T21:55:00Z") });
  store.claimDue({ now: new Date("2026-07-18T21:55:31Z") });
  assert.equal(store.claimDue({ now: new Date("2026-07-18T21:59:00Z") }).length, 0);
  assert.equal(store.batches.get(first.batchId).status, "processing");
});

test("processing batch after timeout is recovered", () => {
  const store = new InMemoryWhatsAppBatchStore();
  const first = store.append({ conversationId: "c1", messageId: "m1", now: new Date("2026-07-18T21:55:00Z") });
  store.claimDue({ now: new Date("2026-07-18T21:55:31Z") });
  const recovered = store.claimDue({ now: new Date("2026-07-18T22:00:32Z") });
  assert.equal(recovered.length, 1);
  assert.equal(recovered[0].batchId, first.batchId);
  assert.equal(recovered[0].attemptCount, 2);
});

test("two workers recovering the same stale batch give it to only one worker", async () => {
  const store = new InMemoryWhatsAppBatchStore();
  const first = store.append({ conversationId: "c1", messageId: "m1", now: new Date("2026-07-18T21:55:00Z") });
  store.claimDue({ now: new Date("2026-07-18T21:55:31Z") });
  const now = new Date("2026-07-18T22:00:32Z");
  const [left, right] = await Promise.all([
    Promise.resolve().then(() => store.claimDue({ now })),
    Promise.resolve().then(() => store.claimDue({ now })),
  ]);
  assert.deepEqual([...left, ...right].map((batch) => batch.batchId), [first.batchId]);
});

for (const [name, sendResult] of [
  ["429", { ok: false, retryable: true, errorCode: "zapi_rate_limited" }],
  ["500", { ok: false, retryable: true, errorCode: "zapi_server_error" }],
  ["timeout", { ok: false, retryable: true, errorCode: "zapi_send_timeout" }],
]) {
  test(`retryable Z-API ${name} error reschedules`, () => {
    const store = new InMemoryWhatsAppBatchStore();
    const first = store.append({ conversationId: "c1", messageId: "m1", now: new Date("2026-07-18T21:55:00Z") });
    const [claimed] = store.claimDue({ now: new Date("2026-07-18T21:55:31Z") });
    const sent = store.sendReply({ batchId: first.batchId, sequence: 1, sendResult });
    assert.equal(sent.ok, false);
    const retry = store.reschedule({
      batchId: first.batchId,
      retryAfterSeconds: boundedBackoff(claimed.attemptCount),
      errorCode: sendResult.errorCode,
      now: new Date("2026-07-18T21:55:32Z"),
    });
    assert.equal(retry.rescheduled, true);
    assert.equal(store.batches.get(first.batchId).status, "collecting");
  });
}

test("permanent send error finalizes as failed", () => {
  const store = new InMemoryWhatsAppBatchStore();
  const first = store.append({ conversationId: "c1", messageId: "m1", now: new Date("2026-07-18T21:55:00Z") });
  store.claimDue({ now: new Date("2026-07-18T21:55:31Z") });
  store.finish({ batchId: first.batchId, status: "failed", errorCode: "zapi_send_failed", now: new Date("2026-07-18T21:55:32Z") });
  assert.equal(store.batches.get(first.batchId).status, "failed");
});

test("first failure increments attempt and sets one minute backoff", () => {
  const store = new InMemoryWhatsAppBatchStore();
  const first = store.append({ conversationId: "c1", messageId: "m1", now: new Date("2026-07-18T21:55:00Z") });
  const [claimed] = store.claimDue({ now: new Date("2026-07-18T21:55:31Z") });
  const retry = store.reschedule({
    batchId: first.batchId,
    retryAfterSeconds: boundedBackoff(claimed.attemptCount),
    errorCode: "zapi_rate_limited",
    now: new Date("2026-07-18T21:55:32Z"),
  });
  assert.equal(retry.attemptCount, 1);
  assert.equal(retry.nextAttemptAt.toISOString(), "2026-07-18T21:56:32.000Z");
});

test("batch is not claimed before next_attempt_at and is claimed after it", () => {
  const store = new InMemoryWhatsAppBatchStore();
  const first = store.append({ conversationId: "c1", messageId: "m1", now: new Date("2026-07-18T21:55:00Z") });
  const [claimed] = store.claimDue({ now: new Date("2026-07-18T21:55:31Z") });
  store.reschedule({
    batchId: first.batchId,
    retryAfterSeconds: boundedBackoff(claimed.attemptCount),
    errorCode: "zapi_rate_limited",
    now: new Date("2026-07-18T21:55:32Z"),
  });
  assert.equal(store.claimDue({ now: new Date("2026-07-18T21:56:00Z") }).length, 0);
  assert.equal(store.claimDue({ now: new Date("2026-07-18T21:56:33Z") }).length, 1);
});

test("max attempts prevents retry loop and marks failed", () => {
  const store = new InMemoryWhatsAppBatchStore();
  const first = store.append({ conversationId: "c1", messageId: "m1", now: new Date("2026-07-18T21:55:00Z") });
  for (const now of ["2026-07-18T21:55:31Z", "2026-07-18T21:56:33Z", "2026-07-18T22:01:34Z"]) {
    const [claimed] = store.claimDue({ now: new Date(now) });
    const retry = store.reschedule({
      batchId: first.batchId,
      retryAfterSeconds: boundedBackoff(claimed.attemptCount),
      errorCode: "zapi_server_error",
      now: addSeconds(new Date(now), 1),
    });
    if (claimed.attemptCount < MAX_ATTEMPTS) assert.equal(retry.rescheduled, true);
  }
  assert.equal(store.batches.get(first.batchId).status, "failed");
  assert.equal(store.claimDue({ now: new Date("2026-07-18T23:00:00Z") }).length, 0);
});

test("success marks processed and send failure never marks processed", () => {
  const store = new InMemoryWhatsAppBatchStore();
  const success = store.append({ conversationId: "c1", messageId: "m1", now: new Date("2026-07-18T21:55:00Z") });
  store.claimDue({ now: new Date("2026-07-18T21:55:31Z") });
  assert.equal(store.sendReply({ batchId: success.batchId, sequence: 1, sendResult: { ok: true } }).ok, true);
  store.finish({ batchId: success.batchId, now: new Date("2026-07-18T21:55:32Z") });
  assert.equal(store.batches.get(success.batchId).status, "processed");

  const failed = store.append({ conversationId: "c2", messageId: "m2", now: new Date("2026-07-18T21:55:00Z") });
  const [claimed] = store.claimDue({ now: new Date("2026-07-18T21:55:31Z") });
  store.reschedule({
    batchId: failed.batchId,
    retryAfterSeconds: boundedBackoff(claimed.attemptCount),
    errorCode: "zapi_send_timeout",
    now: new Date("2026-07-18T21:55:32Z"),
  });
  assert.notEqual(store.batches.get(failed.batchId).status, "processed");
});

test("one errored batch does not block other batches", () => {
  const store = new InMemoryWhatsAppBatchStore();
  const left = store.append({ conversationId: "c1", messageId: "m1", now: new Date("2026-07-18T21:55:00Z") });
  const right = store.append({ conversationId: "c2", messageId: "m2", now: new Date("2026-07-18T21:55:00Z") });
  const claimed = store.claimDue({ now: new Date("2026-07-18T21:55:31Z") });
  assert.equal(claimed.length, 2);
  store.reschedule({ batchId: left.batchId, retryAfterSeconds: 60, errorCode: "processing_failed", now: new Date("2026-07-18T21:55:32Z") });
  store.finish({ batchId: right.batchId, now: new Date("2026-07-18T21:55:32Z") });
  assert.equal(store.batches.get(left.batchId).status, "collecting");
  assert.equal(store.batches.get(right.batchId).status, "processed");
});

test("confirmed send followed by crash is deduped when outbound was persisted", () => {
  const store = new InMemoryWhatsAppBatchStore();
  const first = store.append({ conversationId: "c1", messageId: "m1", now: new Date("2026-07-18T21:55:00Z") });
  store.claimDue({ now: new Date("2026-07-18T21:55:31Z") });
  assert.equal(store.sendReply({ batchId: first.batchId, sequence: 1, sendResult: { ok: true } }).deduped, false);
  const duplicate = store.sendReply({ batchId: first.batchId, sequence: 1, sendResult: { ok: true } });
  assert.equal(duplicate.deduped, true);
});

test("preserves publicInitialHelpSent and delays only the first public idle message", () => {
  assert.equal(shouldDelayInitialPublicMessage({ messageCount: 1 }), true);
  assert.equal(shouldDelayInitialPublicMessage({ messageCount: 2 }), false);
  assert.equal(shouldDelayInitialPublicMessage({ state: "showing_events" }), false);
  assert.equal(shouldDelayInitialPublicMessage({ publicInitialHelpSent: true }), false);
});

test("duplicate webhook provider message does not append twice", () => {
  const store = new InMemoryWhatsAppBatchStore();
  const first = store.append({ conversationId: "c1", messageId: "same-provider-message", now: new Date("2026-07-18T21:55:00Z") });
  const duplicate = store.append({ conversationId: "c1", messageId: "same-provider-message", now: new Date("2026-07-18T21:55:01Z") });
  assert.equal(duplicate.batchId, first.batchId);
  assert.equal(store.messages(first.batchId).length, 1);
});

test("new message while a batch is processing creates a separate collecting batch", () => {
  const store = new InMemoryWhatsAppBatchStore();
  const first = store.append({ conversationId: "c1", messageId: "m1", now: new Date("2026-07-18T21:55:00Z") });
  store.claimDue({ now: new Date("2026-07-18T21:55:31Z") });
  const second = store.append({ conversationId: "c1", messageId: "m2", now: new Date("2026-07-18T21:55:32Z") });
  assert.notEqual(second.batchId, first.batchId);
  assert.equal(store.batches.get(first.batchId).status, "processing");
  assert.equal(store.batches.get(second.batchId).status, "collecting");
});
