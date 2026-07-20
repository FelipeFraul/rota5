import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { test } from "node:test";

const COLLECT_SECONDS = 30;
const MAX_WINDOW_SECONDS = 30;

function addSeconds(date, seconds) {
  return new Date(date.getTime() + seconds * 1000);
}

class InMemoryWhatsAppBatchStore {
  constructor() {
    this.batches = new Map();
    this.batchMessages = new Map();
    this.messageToBatch = new Map();
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
        processAfter: addSeconds(
          now,
          Math.min(COLLECT_SECONDS, MAX_WINDOW_SECONDS),
        ),
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
      messages.push({
        id: messageId,
        body: messageId,
        position: messages.length + 1,
      });
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

  claimDue({ now, limit = 20 }) {
    const due = [...this.batches.values()]
      .filter((batch) => batch.status === "collecting" && batch.processAfter <= now)
      .sort((left, right) => left.processAfter - right.processAfter)
      .slice(0, Math.max(1, Math.min(limit, 100)));

    return due.map((batch) => {
      batch.status = "processing";
      batch.claimedAt = now;
      batch.version += 1;
      return { batchId: batch.id, conversationId: batch.conversationId };
    });
  }

  finish({ batchId, status = "processed", now }) {
    if (!["processed", "cancelled"].includes(status)) {
      throw new Error("invalid_batch_final_status");
    }

    const batch = this.batches.get(batchId);
    if (!batch || !["processing", "collecting", "cancelled"].includes(batch.status)) {
      return false;
    }

    batch.status = status;
    if (status === "processed") batch.processedAt = now;
    if (status === "cancelled") batch.cancelledAt = now;
    batch.version += 1;
    return true;
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

function isRetiredPublicMenu(value) {
  const lines = value
    .replace(/\*/g, "")
    .replace(/\r\n/g, "\n")
    .split("\n")
    .map((line) => line.replace(/[ \t]+/g, " ").trim().toLocaleLowerCase("pt-BR"))
    .filter(Boolean);
  const body = lines.join("\n");

  return (
    body.includes("como posso ajudar?") &&
    lines.includes("1. ver eventos") &&
    lines.includes("2. comprar ingresso") &&
    lines.includes("3. ajuda com uma compra")
  );
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
  const first = store.append({
    conversationId: "conversation-a",
    messageId: "olá",
    now: new Date("2026-07-18T21:55:00Z"),
  });
  const second = store.append({
    conversationId: "conversation-a",
    messageId: "tudo bem?",
    now: new Date("2026-07-18T21:55:05Z"),
  });

  assert.equal(second.batchId, first.batchId);
  assert.equal(store.messages(first.batchId).length, 2);
});

test("aggregates several messages in arrival order", () => {
  const aggregated = buildAggregatedWhatsAppText([
    { body: "olá " },
    { body: " tudo bem?" },
    { body: "" },
    { body: null },
    { body: "como está" },
  ]);

  assert.equal(aggregated, "olá. tudo bem?. como está");
});

test("respects the fixed 30 second max window from the first message", () => {
  const store = new InMemoryWhatsAppBatchStore();
  const firstAt = new Date("2026-07-18T21:55:00Z");
  const first = store.append({
    conversationId: "conversation-a",
    messageId: "m1",
    now: firstAt,
  });
  store.append({
    conversationId: "conversation-a",
    messageId: "m2",
    now: new Date("2026-07-18T21:55:20Z"),
  });

  assert.equal(
    store.batches.get(first.batchId).processAfter.toISOString(),
    addSeconds(firstAt, 30).toISOString(),
  );
});

test("claims a due batch exclusively once across concurrent cron attempts", async () => {
  const store = new InMemoryWhatsAppBatchStore();
  const first = store.append({
    conversationId: "conversation-a",
    messageId: "m1",
    now: new Date("2026-07-18T21:55:00Z"),
  });

  const now = new Date("2026-07-18T21:55:31Z");
  const [left, right] = await Promise.all([
    Promise.resolve().then(() => store.claimDue({ now })),
    Promise.resolve().then(() => store.claimDue({ now })),
  ]);

  assert.deepEqual([...left, ...right].map((batch) => batch.batchId), [first.batchId]);
});

test("does not duplicate response after a batch is processed", () => {
  const store = new InMemoryWhatsAppBatchStore();
  const first = store.append({
    conversationId: "conversation-a",
    messageId: "m1",
    now: new Date("2026-07-18T21:55:00Z"),
  });
  const claimed = store.claimDue({ now: new Date("2026-07-18T21:55:31Z") });
  assert.equal(claimed.length, 1);
  assert.equal(store.finish({
    batchId: first.batchId,
    now: new Date("2026-07-18T21:55:32Z"),
  }), true);

  assert.equal(store.claimDue({ now: new Date("2026-07-18T21:56:00Z") }).length, 0);
});

test("records the current failure mode after a send failure", () => {
  const store = new InMemoryWhatsAppBatchStore();
  const first = store.append({
    conversationId: "conversation-a",
    messageId: "m1",
    now: new Date("2026-07-18T21:55:00Z"),
  });
  store.claimDue({ now: new Date("2026-07-18T21:55:31Z") });
  const sendSucceeded = false;
  const finished = store.finish({
    batchId: first.batchId,
    status: "processed",
    now: new Date("2026-07-18T21:55:32Z"),
  });

  assert.equal(sendSucceeded, false);
  assert.equal(finished, true);
  assert.equal(store.batches.get(first.batchId).status, "processed");
});

test("preserves publicInitialHelpSent when initial help is sent", () => {
  const previousContext = { state: "idle" };
  const nextContext = { ...previousContext, publicInitialHelpSent: true };

  assert.equal(nextContext.publicInitialHelpSent, true);
  assert.equal(shouldDelayInitialPublicMessage({
    state: "idle",
    publicInitialHelpSent: nextContext.publicInitialHelpSent,
    messageCount: 2,
  }), false);
});

test("delays only the first public idle message", () => {
  assert.equal(shouldDelayInitialPublicMessage({ messageCount: 1 }), true);
  assert.equal(shouldDelayInitialPublicMessage({ messageCount: 2 }), false);
  assert.equal(shouldDelayInitialPublicMessage({ state: "showing_events" }), false);
});

test("blocks the retired public menu and allows legitimate messages", () => {
  assert.equal(isRetiredPublicMenu([
    "ATENDIMENTO",
    "",
    "Como posso ajudar?",
    "",
    "1. Ver eventos",
    "2. Comprar ingresso",
    "3. Ajuda com uma compra",
  ].join("\n")), true);
  assert.equal(isRetiredPublicMenu("Como posso ajudar com sua compra paga?"), false);
  assert.equal(isRetiredPublicMenu("1. Ver eventos disponíveis"), false);
});

test("duplicate webhook provider message does not append twice", () => {
  const store = new InMemoryWhatsAppBatchStore();
  const first = store.append({
    conversationId: "conversation-a",
    messageId: "same-provider-message",
    now: new Date("2026-07-18T21:55:00Z"),
  });
  const duplicate = store.append({
    conversationId: "conversation-a",
    messageId: "same-provider-message",
    now: new Date("2026-07-18T21:55:01Z"),
  });

  assert.equal(duplicate.batchId, first.batchId);
  assert.equal(store.messages(first.batchId).length, 1);
});

test("new message while a batch is processing creates a separate collecting batch", () => {
  const store = new InMemoryWhatsAppBatchStore();
  const first = store.append({
    conversationId: "conversation-a",
    messageId: "m1",
    now: new Date("2026-07-18T21:55:00Z"),
  });
  store.claimDue({ now: new Date("2026-07-18T21:55:31Z") });
  const second = store.append({
    conversationId: "conversation-a",
    messageId: "m2",
    now: new Date("2026-07-18T21:55:32Z"),
  });

  assert.notEqual(second.batchId, first.batchId);
  assert.equal(store.batches.get(first.batchId).status, "processing");
  assert.equal(store.batches.get(second.batchId).status, "collecting");
});

test("processing batches can remain stuck without a stale-processing recovery path", () => {
  const store = new InMemoryWhatsAppBatchStore();
  const first = store.append({
    conversationId: "conversation-a",
    messageId: "m1",
    now: new Date("2026-07-18T21:55:00Z"),
  });
  store.claimDue({ now: new Date("2026-07-18T21:55:31Z") });

  assert.equal(store.batches.get(first.batchId).status, "processing");
  assert.equal(store.claimDue({ now: new Date("2026-07-18T23:55:31Z") }).length, 0);
});
