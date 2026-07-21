import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { buildInitialConversationState } from "../src/lib/tickets/conversationState.ts";
import { TICKET_MESSAGES } from "../src/lib/tickets/messages.ts";
import { routeTicketMessage } from "../src/lib/tickets/router.ts";

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

const customer = {
  id: "customer-public-initial",
  whatsapp_phone: "5515999999999",
  name: null,
};

function routePublicText(text, context = buildInitialConversationState()) {
  return routeTicketMessage({
    customer,
    conversation: {
      id: "conversation-public-initial",
      context,
    },
    text,
    messageType: "text",
  });
}

function assertInitialOpeningMessages(result) {
  assert.equal(result.outboundMessages?.length, 2);
  assert.equal(result.outboundMessages[0].type, "text");
  assert.equal(result.outboundMessages[0].body, TICKET_MESSAGES.genericHelp);
  assert.equal(result.outboundMessages[0].suppressTitle, true);
  assert.equal(result.outboundMessages[1].type, "text");
  assert.equal(result.outboundMessages[1].body, TICKET_MESSAGES.genericHelpCommands);
  assert.equal(result.outboundMessages[1].suppressTitle, true);
  assert.equal(result.nextContext.publicInitialHelpSent, true);
}

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

test("execucao real: primeira saudacao envia duas mensagens e marca contexto", async () => {
  const result = await routePublicText("Oi");

  assertInitialOpeningMessages(result);
  assert.doesNotMatch(
    result.outboundMessages.map((message) => message.body).join("\n"),
    /ATENDIMENTO/,
  );
});

test("execucao real: saudacao posterior e purchase support nao repetem abertura", async () => {
  const greeting = await routePublicText("Oi");
  const secondGreeting = await routePublicText("bom dia", greeting.nextContext);
  const purchaseSupport = await routePublicText(
    "nao consigo comprar ingresso online",
    greeting.nextContext,
  );

  assertInitialOpeningMessages(greeting);
  assert.notEqual(secondGreeting.outboundMessages?.[0]?.body, TICKET_MESSAGES.genericHelp);
  assert.notEqual(purchaseSupport.outboundMessages?.[0]?.body, TICKET_MESSAGES.genericHelp);
  assert.equal(purchaseSupport.nextContext.publicInitialHelpSent, true);
});

test("execucao real: purchase support inicial inclui abertura uma unica vez e resposta especifica", async () => {
  const result = await routePublicText("nao consigo comprar ingresso online");

  assert.equal(result.outboundMessages?.length, 3);
  assert.equal(result.outboundMessages[0].body, TICKET_MESSAGES.genericHelp);
  assert.equal(result.outboundMessages[1].body, TICKET_MESSAGES.genericHelpCommands);
  assert.equal(result.outboundMessages[2].body, result.reply);
  assert.equal(result.nextContext.publicInitialHelpSent, true);
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
  assert.match(router, /function resolvePublicInitialHelpBootstrap/);
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
    assert.match(block, /bootstrap\.initialMessages/);
    assert.match(block, /bootstrap\.nextContext/);
    assert.doesNotMatch(block, /buildPublicInitialHelpOutboundMessages\(\)/);
    assert.doesNotMatch(block, /publicInitialHelpContext\(baseContext\)/);
  }
  assert.match(router, /const bootstrap = resolvePublicInitialHelpBootstrap\(baseContext\)/);
  assert.match(router, /previousState\.publicInitialHelpSent !== true/);
  assert.match(messages, /noEventsFound:/);
  assert.match(router, /if \(events\.length === 0\)[\s\S]*reply:\s*TICKET_MESSAGES\.noEventsFound/);
});

test("TODOS sem eventos e purchase support usam bootstrap sem genericHelpPrompt", () => {
  const allEventsEmptyBlock = sliceBetween(
    router,
    /if \(events\.length === 0\) \{/,
    /return {\s*reply:\s*formatAllEventsReply\(events\)/,
  );
  const purchaseSupportBlock = sliceBetween(
    router,
    /if \(incomingIntent\.classification === "purchase_support"\)/,
    /if \(incomingIntent\.classification === "unknown" && isPublicInitialHelpCommand/,
  );

  assert.match(allEventsEmptyBlock, /bootstrap\.initialMessages/);
  assert.match(allEventsEmptyBlock, /resetBuyerReservationContext\(bootstrap\.nextContext\)/);
  assert.doesNotMatch(allEventsEmptyBlock, /genericHelpPrompt/);
  assert.match(purchaseSupportBlock, /const bootstrap = resolvePublicInitialHelpBootstrap\(baseContext\)/);
  assert.match(purchaseSupportBlock, /supportResponse\.reply/);
  assert.match(purchaseSupportBlock, /bootstrap\.initialMessages/);
  assert.doesNotMatch(purchaseSupportBlock, /buildPublicInitialHelpResponse\(baseContext\)/);
});
