import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const analytics = readFileSync(
  new URL("../src/lib/tickets/services/adminContactAnalytics.ts", import.meta.url),
  "utf8",
);
const editor = readFileSync(
  new URL("../src/app/admin/eventos/AdminEventsEditor.tsx", import.meta.url),
  "utf8",
);

test("analytics loads outbound delivery metadata for the conversation history", () => {
  assert.match(analytics, /provider_message_id, raw_metadata/);
  assert.match(analytics, /outboundStatus\?: "sent" \| "failed" \| "unknown"/);
  assert.match(analytics, /providerMessageId\?: string \| null/);
  assert.match(analytics, /function normalizeOutboundSendStatus/);
});

test("outbound status normalization only accepts known send_status values", () => {
  assert.match(analytics, /metadata\?\.send_status/);
  assert.match(analytics, /status === "sent" \|\| status === "failed" \? status : "unknown"/);
  assert.doesNotMatch(analytics, /sendStatus/);
});

test("admin panel labels outbound statuses without implying delivery or reading", () => {
  assert.match(editor, /Sistema · aceito pela Z-API/);
  assert.match(editor, /Falha no envio · cliente pode não ter recebido/);
  assert.match(editor, /Sistema · status desconhecido/);
  assert.match(editor, /message\.direction === "inbound"\) return "Cliente"/);
  assert.doesNotMatch(editor, /entregue/i);
  assert.doesNotMatch(editor, /lido/i);
});

test("failed outbound attempts remain visible and visually distinct", () => {
  assert.match(editor, /message\.outboundStatus === "failed"/);
  assert.match(editor, /borderColor: "#dc2626"/);
  assert.match(editor, /getMessageLabel\(message\)/);
  assert.match(editor, /message\.body/);
});
