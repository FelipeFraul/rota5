import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { buildInitialConversationState } from "../src/lib/tickets/conversationState.ts";
import { TICKET_MESSAGES } from "../src/lib/tickets/messages.ts";
import {
  classifyPublicMessageIntent,
  resolveIncomingMessageIntent,
  routeTicketMessage,
} from "../src/lib/tickets/router.ts";

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

const homeMessage = /PUBLIC_HOME_MESSAGE\s*=\s*[\s\S]*bem-vindo\(a\)[\s\S]*Rota5/;
const homeCommands =
  /PUBLIC_HOME_COMMANDS_MESSAGE\s*=[\s\S]*\*SHOW\*[\s\S]*\*TODOS\*[\s\S]*\*ENVIAR\*[\s\S]*\*AJUDA\*[\s\S]*\*NOVO\*/;

const customer = {
  id: "customer-public-initial",
  whatsapp_phone: "5515999999999",
  name: null,
};

function routePublicText(text, context = buildInitialConversationState(), messageType = "text") {
  return routeTicketMessage({
    customer,
    conversation: {
      id: "conversation-public-initial",
      context,
    },
    text,
    messageType,
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

function assertNotInitialOpeningMessages(result) {
  assert.notDeepEqual(
    result.outboundMessages?.map((message) => message.body),
    [TICKET_MESSAGES.genericHelp, TICKET_MESSAGES.genericHelpCommands],
  );
}

async function assertActiveContextDoesNotBootstrap(text, context) {
  try {
    const result = await routePublicText(text, context);
    assertNotInitialOpeningMessages(result);
    return result;
  } catch (error) {
    assert.match(String(error), /supabase|env|environment|url|key/i);
    return null;
  }
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

test("execucao real: saudacao posterior tambem envia abertura em duas mensagens", async () => {
  const greeting = await routePublicText("Oi");
  const secondGreeting = await routePublicText("bom dia", greeting.nextContext);
  const purchaseSupport = await routePublicText(
    "nao consigo comprar ingresso online",
    greeting.nextContext,
  );

  assertInitialOpeningMessages(greeting);
  assertInitialOpeningMessages(secondGreeting);
  assert.doesNotMatch(
    secondGreeting.outboundMessages.map((message) => message.body).join("\n"),
    /ATENDIMENTO|EVENTOS/,
  );
  assert.notEqual(purchaseSupport.outboundMessages?.[0]?.body, TICKET_MESSAGES.genericHelp);
  assert.equal(purchaseSupport.nextContext.publicInitialHelpSent, true);
});

test("execucao real: primeiro contato publico sempre envia somente abertura oficial", async () => {
  const cases = [
    ["Oi", {}],
    ["AJUDA", {}],
    ["cortesia", {}],
    ["", {}],
    ["1", {}],
    ["Willian", {}],
    ["TODOS", {}],
  ];

  for (const [text, context] of cases) {
    const result = await routePublicText(text, context);
    assertInitialOpeningMessages(result);
    assert.equal(result.reply, TICKET_MESSAGES.genericHelp);
  }

  const mediaResult = await routePublicText("", {}, "image");
  assertInitialOpeningMessages(mediaResult);
  assert.equal(mediaResult.reply, TICKET_MESSAGES.genericHelp);
});

test("execucao real: bootstrap nao se repete apos contexto inicializado", async () => {
  const initializedContext = {
    ...buildInitialConversationState(),
    publicInitialHelpSent: true,
  };
  const help = await routePublicText("AJUDA", initializedContext);

  assert.notEqual(help.outboundMessages?.[0]?.body, TICKET_MESSAGES.genericHelp);
});

test("execucao real: atalho novo retorna reentrada atendimento", async () => {
  const result = await routePublicText("NOVO", {
    ...buildInitialConversationState(),
    state: "showing_events",
    step: "showing_events",
  });

  assert.equal(result.reply, TICKET_MESSAGES.reentryPrompt);
  assert.match(result.reply, /^ATENDIMENTO\n\n>/);
  assert.doesNotMatch(result.reply, /bem-vindo\(a\)/);
  assert.equal(result.nextContext.state, "idle");
  assert.equal(result.nextContext.publicInitialHelpSent, true);
  assert.match(webhook, /routeResult\.reply === TICKET_MESSAGES\.reentryPrompt[\s\S]{0,180}suppressTitle:\s*true/);
});

test("execucao real: sair publico encerra sessao antes de voltar ao inicio", async () => {
  const result = await routePublicText("SAIR", {
    ...buildInitialConversationState(),
    publicInitialHelpSent: true,
    state: "showing_events",
    step: "showing_events",
  });

  assert.equal(result.reply, TICKET_MESSAGES.conversationClosed);
  assert.equal(result.nextContext.state, "idle");
  assert.equal(result.nextContext.publicInitialHelpSent, true);
});

test("busca curta com letra e numero, como u2, vira busca de evento", () => {
  const publicIntent = classifyPublicMessageIntent("u2");
  const incomingIntent = resolveIncomingMessageIntent({
    text: "u2",
    conversationState: {
      ...buildInitialConversationState(),
      publicInitialHelpSent: true,
    },
  });

  assert.equal(publicIntent.intent, "search_event");
  assert.equal(incomingIntent.classification, "search_event");
  assert.equal(incomingIntent.searchAuthorized, true);
});

test("execucao real: excecao admin_auth_pending nao recebe bootstrap", async () => {
  const result = await routePublicText("sair", {
    ...buildInitialConversationState(),
    state: "admin_auth_pending",
    step: "admin_auth_pending",
    admin: {
      authChallengeId: "challenge-public-initial",
      authChallengeExpiresAt: new Date(Date.now() + 60_000).toISOString(),
    },
  });

  assertNotInitialOpeningMessages(result);
  assert.equal(result.nextContext.state, "idle");
});

test("execucao real: excecoes administrativas ativas nao recebem bootstrap", async () => {
  const adminMenuContext = {
    ...buildInitialConversationState(),
    state: "admin_menu",
    step: "admin_menu",
  };
  const adminSubmenuContext = {
    ...buildInitialConversationState(),
    state: "admin_events_menu",
    step: "admin_events_menu",
  };
  const adminSessionContext = {
    ...buildInitialConversationState(),
    admin: {
      sessionId: "session-public-initial",
    },
  };

  await assertActiveContextDoesNotBootstrap("menu", adminMenuContext);
  await assertActiveContextDoesNotBootstrap("menu", adminSubmenuContext);
  await assertActiveContextDoesNotBootstrap("Oi", adminSessionContext);
});

test("execucao real: excecoes de portaria e cozinha ativas nao recebem bootstrap", async () => {
  const fixedGateResult = await routePublicText("senha", {
    ...buildInitialConversationState(),
    state: "fixed_gate_passphrase_collecting",
    step: "fixed_gate_passphrase_collecting",
  });
  const gateSelectionResult = await routePublicText("99", {
    ...buildInitialConversationState(),
    state: "gate_access_selecting",
    step: "gate_access_selecting",
    gateAccess: {
      mode: "gate",
      lastAccesses: [],
    },
  });
  const gatePassphraseResult = await routePublicText("senha", {
    ...buildInitialConversationState(),
    state: "gate_access_passphrase_collecting",
    step: "gate_access_passphrase_collecting",
  });

  assertNotInitialOpeningMessages(fixedGateResult);
  assertNotInitialOpeningMessages(gateSelectionResult);
  assertNotInitialOpeningMessages(gatePassphraseResult);
});

test("mensagens publicas posteriores tambem seguem pelo caminho imediato", () => {
  assert.match(webhook, /resolveIncomingMessageIntent\(\{[\s\S]*text:\s*effectiveText/);
  assert.match(webhook, /shouldProcessImmediately\(\{/);
  assert.match(webhook, /reconcileAdminNavigation\(\{/);
  assert.match(webhook, /const outboundMessages = getOutboundMessages\(routeResult\)/);
  assert.match(webhook, /routeKey:\s*"webhook:zapi:phone"/);
  assert.doesNotMatch(webhook, /routeKey:\s*"webhook:zapi"/);
  assert.doesNotMatch(webhook, /processAfter:\s*true/);
  assert.doesNotMatch(webhook, /listWhatsAppBatchMessages/);
});

test("AJUDA no fluxo publico inicial nao entra em compra nem admin", () => {
  assert.match(router, /normalizedMessage === "ajuda"/);
  assert.match(router, /normalizedMessage === "help"/);
  assert.match(router, /intentNormalized === "ajuda"/);
  assert.match(router, /intentNormalized === "help"/);
  assert.match(router, /classification:\s*"unknown"/);
  assert.match(publicInitialFlow, /function isPublicInitialHelpCommand/);
  assert.match(publicInitialFlow, /normalized === "da uma mao"/);
  assert.match(publicInitialFlow, /normalized === "help"/);
  assert.match(publicInitialFlow, /normalized === "ajuda"/);
  assert.match(router, /incomingIntent\.classification === "unknown" && isPublicInitialHelpCommand\(text\)/);
  assert.doesNotMatch(router, /normalizedMessage === "ajuda"[\s\S]{0,600}classification:\s*"buy_/);
  assert.doesNotMatch(router, /normalizedMessage === "ajuda"[\s\S]{0,600}admin_auth_pending/);
});

test("TODOS no fluxo publico inicial segue para listagem publica", () => {
  assert.match(publicInitialFlow, /function isPublicInitialAllEventsCommand/);
  assert.match(publicInitialFlow, /normalized === "cambada"/);
  assert.match(publicInitialFlow, /normalized === "all"/);
  assert.match(publicInitialFlow, /normalized === "todos"/);
  assert.match(router, /\^cambada\$/);
  assert.match(router, /\^all\$/);
  assert.match(router, /classification:\s*"list_events"/);
  assert.match(router, /incomingIntent\.classification === "list_events"[\s\S]*listAllPublicEventsByDate/);
  assert.doesNotMatch(router, /normalized === "todos"[\s\S]{0,600}admin_auth_pending/);
});

test("BAILAO no fluxo publico inicial mostra o proximo evento", () => {
  assert.match(publicInitialFlow, /function isPublicInitialNextEventCommand/);
  assert.match(publicInitialFlow, /normalized === "bailao"/);
  assert.match(publicInitialFlow, /normalized === "show"/);
  assert.match(router, /isPublicInitialNextEventCommand\(text\)[\s\S]*listAllPublicEventsByDate\(\{ limit: 1 \}\)/);
  assert.match(router, /isPublicInitialNextEventCommand\(text\)[\s\S]*buildEventSearchOutboundMessages\(events\)/);
  assert.doesNotMatch(router, /normalized === "show"[\s\S]{0,600}admin_auth_pending/);
});

test("REENVIAR aciona reenvio pago e nao compra/admin", () => {
  assert.match(publicInitialFlow, /function isPublicInitialTicketResendCommand/);
  assert.match(publicInitialFlow, /normalized === "manda"/);
  assert.match(publicInitialFlow, /normalized === "again"/);
  assert.match(publicInitialFlow, /normalized === "reenviar"/);
  assert.match(router, /handlePaidTicketResendCommand/);
  assert.match(router, /if \(isTicketResendCommand\(text\)\)/);
  assert.doesNotMatch(router, /normalized === "reenviar ingresso"[\s\S]{0,600}admin_auth_pending/);
});

test("SAIR encerra e NOVO volta ao inicio", () => {
  assert.match(router, /function isBuyerReservationExitIntent/);
  assert.match(router, /function isBuyerNewIntent/);
  assert.match(publicInitialFlow, /function isPublicInitialExitCommand/);
  assert.match(publicInitialFlow, /function isPublicInitialNewCommand/);
  assert.match(publicInitialFlow, /normalized === "novo"/);
  assert.match(publicInitialFlow, /normalized === "new"/);
  assert.match(publicInitialFlow, /normalized === "sair"/);
  assert.match(router, /isBuyerNewIntent\(text\)[\s\S]*TICKET_MESSAGES\.reentryPrompt[\s\S]*TICKET_MESSAGES\.conversationClosed/);
  assert.match(router, /resetBuyerReservationContextAfterPublicReentry\(baseContext\)/);
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

test("primeiro contato publico chama bootstrap oficial antes de caminhos publicos", () => {
  const initialIdleBlock = sliceBetween(
    router,
    /const reservedAdminCommand = isReservedAdminCommand\(text\)/,
    /const publicEntryGateResponse/,
  );

  assert.match(initialIdleBlock, /shouldSendPublicInitialHelp\(baseContext\)/);
  assert.match(initialIdleBlock, /return buildPublicInitialHelpResponse\(baseContext\)/);
  assert.match(initialIdleBlock, /previousState\.state !== "admin_auth_pending"/);
  assert.match(initialIdleBlock, /previousState\.state !== "admin_menu"/);
  assert.match(initialIdleBlock, /!isAdminSubmenuState\(previousState\.state\)/);
  assert.match(initialIdleBlock, /!previousState\.admin\?\.sessionId/);
  assert.match(initialIdleBlock, /!isFixedGateAccessFlowState\(previousState\.state\)/);
  assert.match(initialIdleBlock, /!isGateAccessFlowState\(previousState\.state\)/);
  assert.doesNotMatch(initialIdleBlock, /genericHelpPrompt/);
});

test("caminhos publicos normais ficam depois da guarda de bootstrap inicial", () => {
  const bootstrapIndex = router.indexOf("if (\n    shouldSendPublicInitialHelp(baseContext)");
  const publicEntryIndex = router.indexOf("const publicEntryGateResponse = buildPublicEntryGateResponse");
  const earlyHelpIndex = router.indexOf("const publicHelpResult = handlePublicHelpMessage");
  const courtesyIndex = router.indexOf('if (normalizeAdminText(text) === "cortesia")');

  assert.ok(bootstrapIndex > 0);
  assert.ok(publicEntryIndex > bootstrapIndex);
  assert.ok(earlyHelpIndex > bootstrapIndex);
  assert.ok(courtesyIndex > bootstrapIndex);
});

test("prompt de quantidade limpa carrinho antigo fora de adicionar mais ingressos", () => {
  assert.match(router, /function getCartForQuantityPrompt/);
  assert.match(router, /baseContext\.state !== "reviewing_cart"/);
  assert.match(router, /cart: preservedCart/);
  assert.match(router, /tableMapPlace: preservedCart\?\.tableMapPlace/);
});

test("link de pagamento usa apenas um dois-pontos", () => {
  assert.match(router, /"Link de pagamento:"/);
  assert.doesNotMatch(router, /Link de pagamento::/);
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
