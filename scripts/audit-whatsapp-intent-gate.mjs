import assert from "node:assert/strict";

import {
  resolveIncomingMessageIntent,
  routeTicketMessage,
} from "../src/lib/tickets/router.ts";
import { searchEvents } from "../src/lib/tickets/services/events.ts";

const customer = {
  id: "00000000-0000-0000-0000-000000000001",
  whatsapp_phone: "5515999999999",
  name: "Teste",
};
const conversationId = "00000000-0000-0000-0000-000000000002";
const forbiddenSearchClasses = new Set([
  "empty_message",
  "unsupported_media",
  "greeting",
  "social_reply",
  "courtesy",
  "unknown",
]);
const records = [];
let currentSearchCalls = [];

globalThis.__ticketSearchEventsAudit = (input) => {
  currentSearchCalls.push(input);
};

function summarizeReply(reply) {
  return String(reply ?? "").replace(/\s+/g, " ").trim().slice(0, 180);
}

async function runStep({ label, text, messageType = "text", context }) {
  const previousState = context.state ?? "idle";
  const intent = resolveIncomingMessageIntent({
    text,
    messageType,
    conversationState: context,
  });

  currentSearchCalls = [];
  const result = await routeTicketMessage({
    customer,
    conversation: {
      id: conversationId,
      context,
    },
    text: text ?? "",
    messageType,
  });
  const searchCalls = currentSearchCalls;

  if (forbiddenSearchClasses.has(intent.classification)) {
    assert.equal(
      searchCalls.length,
      0,
      `${label}: ${intent.classification} não pode chamar searchEvents`,
    );
  }

  for (const call of searchCalls) {
    assert.ok(
      call.authorizedByIntent,
      `${label}: searchEvents chamado sem autorização explícita do gate`,
    );
  }

  const record = {
    label,
    input: text ?? "<sem texto>",
    normalizedText: intent.normalizedText,
    previousState,
    classification: intent.classification,
    confidence: intent.confidence,
    evidence: intent.evidence,
    searchExecuted: searchCalls.length > 0,
    searchAuthorizations: searchCalls.map((call) => call.authorizedByIntent),
    reply: summarizeReply(result.reply),
    nextState: result.nextContext.state ?? "idle",
  };

  records.push(record);

  return result.nextContext;
}

async function runSequence(label, steps) {
  let context = {};

  for (const [index, step] of steps.entries()) {
    context = await runStep({
      label: `${label}.${index + 1}`,
      context,
      ...step,
    });
  }
}

await assert.rejects(
  () => searchEvents({ artist: "Nati", limit: 1 }),
  /explicit incoming intent authorization/,
  "searchEvents deve falhar sem autorização explícita do gate",
);

await runSequence("Sequência A", [
  { text: "Oiiiiii boa noite" },
  { text: "TD bem" },
  { text: "Por favor" },
  { text: "Quero Nati gaiteira" },
]);

await runSequence("Sequência B", [
  { text: "Boa noite" },
  { text: "Não estou conseguindo comprar online" },
  { text: "O pagamento não abre" },
]);

await runSequence("Sequência C", [
  { text: "Todos shows" },
  { text: "1" },
  { text: "Quero esse" },
]);

for (const step of [
  { label: "Isolado.sem_texto", text: "" },
  { label: "Isolado.mensagem_vazia", text: "Mensagem vazia" },
  { label: "Isolado.emoji", text: "😂" },
  { label: "Isolado.audio", text: "", messageType: "document" },
  { label: "Isolado.oswaldo", text: "Quero oswaldo" },
  { label: "Isolado.hoje", text: "Tem show hoje?" },
  { label: "Isolado.sem_relacao", text: "abacaxizzz" },
  { label: "Isolado.comedia", text: "comédia" },
  { label: "Isolado.quero_ingresso", text: "Quero ingresso" },
]) {
  await runStep({ ...step, context: {} });
}

console.log(JSON.stringify({ ok: true, records }, null, 2));
