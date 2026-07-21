import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const router = readFileSync(
  new URL("../src/lib/tickets/router.ts", import.meta.url),
  "utf8",
);
const publicInitialFlow = readFileSync(
  new URL("../src/lib/tickets/publicInitialFlow.ts", import.meta.url),
  "utf8",
);
const webhook = readFileSync(
  new URL("../src/app/api/webhook/zapi/route.ts", import.meta.url),
  "utf8",
);
const batchCron = readFileSync(
  new URL("../src/app/api/cron/process-whatsapp-batches/route.ts", import.meta.url),
  "utf8",
);
const messages = readFileSync(
  new URL("../src/lib/tickets/messages.ts", import.meta.url),
  "utf8",
);

const homeMessage = /PUBLIC_HOME_MESSAGE\s*=\s*[\s\S]*bem-vindo\(a\)[\s\S]*Black House/;
const homeCommands =
  /PUBLIC_HOME_COMMANDS_MESSAGE\s*=[\s\S]*TODOS[\s\S]*REENVIAR INGRESSO[\s\S]*AJUDA[\s\S]*SAIR/;

function sliceBetween(source, startPattern, endPattern) {
  const start = source.search(startPattern);
  assert.notEqual(start, -1, `start pattern not found: ${startPattern}`);
  const rest = source.slice(start);
  const end = rest.search(endPattern);
  assert.notEqual(end, -1, `end pattern not found: ${endPattern}`);
  return rest.slice(0, end);
}

test("primeira mensagem publica fica em batch e saudacao sai pelo cron", () => {
  assert.match(webhook, /currentStateName === "idle" && !publicInitialHelpWasSent/);
  assert.match(webhook, /isActionable:\s*shouldDelayPublicInitialReply\s*\?\s*false\s*:\s*immediateDecision\.immediate/);
  assert.match(batchCron, /resolvedState === "idle"/);
  assert.match(batchCron, /body:\s*TICKET_MESSAGES\.genericHelp/);
  assert.match(batchCron, /body:\s*TICKET_MESSAGES\.genericHelpCommands/);
  assert.match(batchCron, /publicInitialHelpSent:\s*true/);
  assert.match(messages, homeMessage);
  assert.match(messages, homeCommands);
});

test("AJUDA no fluxo publico inicial nao entra em compra nem admin", () => {
  assert.match(router, /normalizedMessage === "ajuda"/);
  assert.match(router, /intentNormalized === "ajuda"/);
  assert.match(router, /classification:\s*"unknown"/);
  assert.match(publicInitialFlow, /function isPublicInitialHelpCommand/);
  assert.match(publicInitialFlow, /normalized === "ajuda"/);
  assert.match(router, /incomingIntent\.classification === "unknown" && isPublicInitialHelpCommand\(text\)/);
  assert.doesNotMatch(router, /normalizedMessage === "ajuda"[\s\S]{0,600}classification:\s*"buy_/);
  assert.doesNotMatch(router, /normalizedMessage === "ajuda"[\s\S]{0,600}admin_auth_pending/);
});

test("TODOS no fluxo publico inicial segue para listagem publica", () => {
  assert.match(publicInitialFlow, /function isPublicInitialAllEventsCommand/);
  assert.match(publicInitialFlow, /normalized === "todos"/);
  assert.match(router, /classification:\s*"list_events"/);
  assert.match(router, /incomingIntent\.classification === "list_events"[\s\S]*listAllPublicEventsByDate/);
  assert.doesNotMatch(router, /normalized === "todos"[\s\S]{0,600}admin_auth_pending/);
});

test("REENVIAR INGRESSO aciona reenvio pago e nao compra/admin", () => {
  assert.match(publicInitialFlow, /function isPublicInitialTicketResendCommand/);
  assert.match(publicInitialFlow, /normalized === "reenviar ingresso"/);
  assert.match(router, /handlePaidTicketResendCommand/);
  assert.match(router, /if \(isTicketResendCommand\(text\)\)/);
  assert.doesNotMatch(router, /normalized === "reenviar ingresso"[\s\S]{0,600}admin_auth_pending/);
});

test("SAIR cancela e a proxima mensagem volta ao inicio", () => {
  assert.match(router, /function isBuyerReservationExitIntent/);
  assert.match(publicInitialFlow, /function isPublicInitialExitCommand/);
  assert.match(publicInitialFlow, /normalized === "sair"/);
  assert.match(router, /isBuyerReservationExitIntent\(text\)[\s\S]*reply:\s*TICKET_MESSAGES\.buyerFlowReset/);
  assert.match(router, /nextContext:\s*resetBuyerReservationContext\(baseContext\)/);
  assert.match(router, /previousState\.state === "idle"[\s\S]*previousState\.publicInitialHelpSent !== true[\s\S]*reply:\s*TICKET_MESSAGES\.genericHelpPrompt/);
  assert.match(router, /nextContext:\s*publicInitialHelpContext\(baseContext\)/);
  assert.match(publicInitialFlow, /function publicInitialHelpContext/);
});

test("mensagem antiga de busca nao aparece como resposta inicial", () => {
  const initialIdleBlock = sliceBetween(
    router,
    /previousState\.state === "idle"/,
    /const publicHelpResult/,
  );

  assert.match(messages, /noEventsFound:/);
  assert.match(router, /if \(events\.length === 0\)[\s\S]*reply:\s*TICKET_MESSAGES\.noEventsFound/);
  assert.match(initialIdleBlock, /previousState\.publicInitialHelpSent !== true/);
  assert.match(initialIdleBlock, /reply:\s*TICKET_MESSAGES\.genericHelpPrompt/);
  assert.doesNotMatch(initialIdleBlock, /reply:\s*TICKET_MESSAGES\.noEventsFound/);
  assert.doesNotMatch(
    batchCron,
    /resolvedState === "idle"[\s\S]*body:\s*TICKET_MESSAGES\.noEventsFound/,
  );
});
