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

test("primeira mensagem publica responde imediatamente sem depender do batch", () => {
  assert.match(webhook, /const effectiveText = incoming\.text \?\? ""/);
  assert.match(webhook, /routeTicketMessage\(\{[\s\S]*text:\s*effectiveText/);
  assert.doesNotMatch(webhook, /appendInboundMessageToBatch/);
  assert.doesNotMatch(webhook, /buildAggregatedWhatsAppText/);
  assert.doesNotMatch(webhook, /batched:\s*true/);
  assert.doesNotMatch(batchCron, /resolvedState === "idle"/);
  assert.doesNotMatch(batchCron, /genericHelpPrompt/);
  assert.doesNotMatch(batchCron, /sendZapiText/);
  assert.doesNotMatch(batchCron, /sendZapiImage/);
  assert.match(batchCron, /customer_reply_pipeline_disabled/);
  assert.match(batchCron, /finalizeInactiveWhatsAppConversations/);
  assert.match(messages, homeMessage);
  assert.match(messages, homeCommands);
});

test("mensagens publicas posteriores tambem seguem pelo caminho imediato", () => {
  assert.match(webhook, /resolveIncomingMessageIntent\(\{[\s\S]*text:\s*effectiveText/);
  assert.match(webhook, /shouldProcessImmediately\(\{/);
  assert.match(webhook, /reconcileAdminNavigation\(\{/);
  assert.match(webhook, /const outboundMessages = getOutboundMessages\(routeResult\)/);
  assert.doesNotMatch(webhook, /processAfter:\s*true/);
  assert.doesNotMatch(webhook, /listWhatsAppBatchMessages/);
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
  assert.match(router, /function buildPublicInitialHelpResponse/);
  assert.match(router, /nextContext:\s*publicInitialHelpContext\(baseContext\)/);
  assert.match(publicInitialFlow, /function publicInitialHelpContext/);
});

test("abertura publica inicial usa duas mensagens separadas sem titulo atendimento", () => {
  assert.match(router, /function buildPublicInitialHelpOutboundMessages/);
  assert.match(router, /body:\s*TICKET_MESSAGES\.genericHelp/);
  assert.match(router, /body:\s*TICKET_MESSAGES\.genericHelpCommands/);
  assert.match(router, /suppressTitle:\s*true/);
  assert.match(router, /function shouldSendPublicInitialHelp/);
  assert.match(router, /function buildPublicInitialHelpResponse/);
  assert.doesNotMatch(
    router,
    /function buildPublicInitialHelpResponse[\s\S]{0,400}genericHelpPrompt/,
  );
});

test("saudacao social inicial chama bootstrap oficial e nao genericHelpPrompt", () => {
  const initialIdleBlock = sliceBetween(
    router,
    /shouldSendPublicInitialHelp\(previousState\)/,
    /const publicHelpResult/,
  );

  assert.match(initialIdleBlock, /incomingIntent\.classification === "greeting"/);
  assert.match(initialIdleBlock, /incomingIntent\.classification === "social_reply"/);
  assert.match(initialIdleBlock, /incomingIntent\.classification === "courtesy"/);
  assert.match(initialIdleBlock, /return buildPublicInitialHelpResponse\(baseContext\)/);
  assert.doesNotMatch(initialIdleBlock, /genericHelpPrompt/);
});

test("primeira busca e primeiro TODOS recebem bootstrap sem repetir depois", () => {
  const searchSuccessBlock = sliceBetween(
    router,
    /return {\s*reply:\s*formatEventsReply\(events\)/,
    /eventMoreInfoShown:\s*undefined/,
  );
  const allEventsBlock = sliceBetween(
    router,
    /return {\s*reply:\s*formatAllEventsReply\(events\)/,
    /eventMoreInfoShown:\s*undefined/,
  );

  for (const block of [searchSuccessBlock, allEventsBlock]) {
    assert.match(block, /shouldSendPublicInitialHelp\(previousState\)/);
    assert.match(block, /buildPublicInitialHelpOutboundMessages\(\)/);
    assert.match(block, /publicInitialHelpContext\(baseContext\)/);
  }
  assert.match(router, /previousState\.publicInitialHelpSent !== true/);
  assert.match(messages, /noEventsFound:/);
  assert.match(router, /if \(events\.length === 0\)[\s\S]*reply:\s*TICKET_MESSAGES\.noEventsFound/);
});
