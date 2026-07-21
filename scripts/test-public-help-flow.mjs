import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  formatPublicHelpAnswer,
  formatPublicHelpPrompt,
  formatPublicHelpResults,
  getPublicHelpTopicById,
  searchPublicHelpTopics,
} from "../src/lib/tickets/services/publicHelp.ts";

const router = readFileSync(
  new URL("../src/lib/tickets/router.ts", import.meta.url),
  "utf8",
);
const publicHelp = readFileSync(
  new URL("../src/lib/tickets/services/publicHelp.ts", import.meta.url),
  "utf8",
);
const publicHelpFlow = readFileSync(
  new URL("../src/lib/tickets/services/publicHelpFlow.ts", import.meta.url),
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

function sliceFrom(source, startPattern) {
  const start = source.search(startPattern);
  assert.notEqual(start, -1, `start pattern not found: ${startPattern}`);
  return source.slice(start);
}

function normalizeNewlines(value) {
  return value.replace(/\r\n/g, "\n");
}

const helpFlowBlock = sliceBetween(
  router,
  /function handlePublicHelpMessage/,
  /function parseTicketQuantity/,
);
const helpSearchBlock = sliceFrom(
  publicHelpFlow,
  /export function buildPublicHelpSearchResponse/,
);
const publicHelpReturnContextBlock = sliceBetween(
  publicHelpFlow,
  /export function publicHelpReturnContext/,
  /export function isPublicHelpFlowState/,
);

const expectedPublicHelpReturnContextBlock = `export function publicHelpReturnContext(baseContext: TicketConversationState) {
  const returnState = baseContext.publicHelp?.returnState;
  const returnStep = baseContext.publicHelp?.returnStep ?? returnState;

  return {
    ...baseContext,
    step: returnStep ?? "idle",
    state: returnState ?? returnStep ?? "idle",
    publicHelp: undefined,
  };
}

`;

const expectedHelpSearchBlock = `export function buildPublicHelpSearchResponse({
  baseContext,
  query,
  page = 0,
  returnStep,
  returnState,
}: {
  baseContext: TicketConversationState;
  query: string;
  page?: number;
  returnStep?: TicketConversationStep;
  returnState?: TicketConversationStep;
}) {
  if (!hasEnoughHelpTerms(query)) {
    return {
      reply: [
        formatPublicHelpPrompt(),
        "",
        "Exemplos:",
        "> pagamento pix",
        "> qr invalido",
        "> reserva expirada",
      ].join("\\n"),
      nextContext: {
        ...baseContext,
        step: "help_topic_collecting" as const,
        state: "help_topic_collecting" as const,
        publicHelp: {
          returnStep: returnStep ?? baseContext.publicHelp?.returnStep ?? baseContext.step,
          returnState: returnState ?? baseContext.publicHelp?.returnState ?? baseContext.state,
        },
      },
    };
  }

  const searchResult = searchPublicHelpTopics(query, page);
  const nextHelpState: TicketConversationStep = searchResult.results.length > 0
    ? "help_results"
    : "help_topic_collecting";

  return {
    reply: formatPublicHelpResults(searchResult),
    suppressTitle: true,
    nextContext: {
      ...baseContext,
      step: nextHelpState,
      state: nextHelpState,
      publicHelp: {
        query,
        hasMore: searchResult.hasMore,
        page: searchResult.page,
        returnStep: returnStep ?? baseContext.publicHelp?.returnStep ?? baseContext.step,
        returnState: returnState ?? baseContext.publicHelp?.returnState ?? baseContext.state,
        lastResults: searchResult.results.map((result) => ({
          option: result.option,
          id: result.id,
          question: result.question,
        })),
      },
    },
  };
}

export function buildPublicHelpSelectedTopicResponse({
  baseContext,
  text,
}: {
  baseContext: TicketConversationState;
  text: string;
}) {
  const selectedOption = text.trim().match(/^\\d+$/) ? Number(text.trim()) : null;
  const selected = selectedOption
    ? baseContext.publicHelp?.lastResults?.find(
        (result) => result.option === selectedOption,
      )
    : null;

  if (selected) {
    const topic = getPublicHelpTopicById(selected.id);

    if (topic) {
      return {
        reply: formatPublicHelpAnswer(topic),
        nextContext: baseContext,
      };
    }
  }

  return null;
}
`;

const expectedHelpFlowBlock = `function handlePublicHelpMessage({
  baseContext,
  text,
}: {
  baseContext: TicketConversationState;
  text: string;
}): RouteTicketMessageOutput | null {
  if (isPublicHelpCommand(text)) {
    return {
      reply: formatPublicHelpPrompt(),
      nextContext: {
        ...baseContext,
        step: "help_topic_collecting",
        state: "help_topic_collecting",
        publicHelp: {
          returnStep: isPublicHelpFlowState(baseContext.state) ? baseContext.publicHelp?.returnStep : baseContext.step,
          returnState: isPublicHelpFlowState(baseContext.state) ? baseContext.publicHelp?.returnState : baseContext.state,
        },
      },
    };
  }

  if (!isPublicHelpFlowState(baseContext.state)) {
    return null;
  }

  if (isBuyerBackIntent(text)) {
    return {
      reply: "Voltando ao atendimento anterior.",
      nextContext: publicHelpReturnContext(baseContext),
    };
  }

  if (isBuyerReservationExitIntent(text)) {
    return {
      reply: TICKET_MESSAGES.genericHelp,
      nextContext: buildInitialConversationState(),
    };
  }

  if (baseContext.state === "help_results") {
    const normalizedText = normalizeIntentText(text);

    if (normalizedText === "ver mais" || normalizedText === "mais") {
      const previousQuery = baseContext.publicHelp?.query;

      if (!previousQuery) {
        return {
          reply: formatPublicHelpPrompt(),
          nextContext: {
            ...baseContext,
            step: "help_topic_collecting",
            state: "help_topic_collecting",
          },
        };
      }

      if (!baseContext.publicHelp?.hasMore) {
        return {
          reply:
            "NÃƒÂ£o encontrei outros tÃƒÂ³picos para essa pesquisa. Digite outras duas palavras para uma nova busca de ajuda ou *VOLTAR* para voltar onde estava.",
          nextContext: baseContext,
        };
      }

      return buildPublicHelpSearchResponse({
        baseContext,
        query: previousQuery,
        page: (baseContext.publicHelp.page ?? 0) + 1,
      });
    }

    const selectedTopicResponse = buildPublicHelpSelectedTopicResponse({
      baseContext,
      text,
    });

    if (selectedTopicResponse) {
      return selectedTopicResponse;
    }
  }

  return buildPublicHelpSearchResponse({
    baseContext,
    query: text,
  });
}

`;

test("blocos de contexto da ajuda publica permanecem identicos", () => {
  assert.equal(normalizeNewlines(publicHelpReturnContextBlock), expectedPublicHelpReturnContextBlock);
  assert.equal(normalizeNewlines(helpSearchBlock), expectedHelpSearchBlock);
  assert.equal(normalizeNewlines(helpFlowBlock), expectedHelpFlowBlock);
});

test("AJUDA entra no fluxo publico de ajuda e exibe prompt", () => {
  assert.equal(
    formatPublicHelpPrompt(),
    "*TÓPICO DE AJUDA*\nDigite duas palavras sobre sua dúvida:",
  );
  assert.match(publicHelp, /export function isPublicHelpCommand/);
  assert.match(publicHelp, /normalized === "ajuda"/);
});

test("busca por topico retorna resultados e preserva publicHelp e step", () => {
  const result = searchPublicHelpTopics("pagamento pix");

  assert.deepEqual(result, {
    query: "pagamento pix",
    page: 0,
    total: 13,
    hasMore: true,
    results: [
      {
        option: 1,
        id: "pix",
        question: "Como pagar por Pix?",
        answer: "Abra o link de pagamento e gere o código Pix. Copie o Pix copia e cola, pague no app do banco e aguarde a confirmação. A tela muda para pagamento aprovado quando o sistema recebe a confirmação.",
      },
      {
        option: 2,
        id: "pagamento-pendente",
        question: "Meu pagamento está pendente. O que faço?",
        answer: "Aguarde a confirmação da Black House. No Pix, a confirmação pode levar alguns instantes após pagar no banco. Se a reserva expirar antes da aprovação, faça uma nova compra.",
      },
      {
        option: 3,
        id: "cpf-email",
        question: "Por que pede CPF e e-mail no pagamento?",
        answer: "O checkout usa CPF e e-mail para a Black House processar a tentativa de pagamento por Pix e validar a compra quando necessário.",
      },
      {
        option: 4,
        id: "checkout-expirado",
        question: "A tela diz pagamento indisponível. Por quê?",
        answer: "A tela de pagamento fica indisponível quando a reserva expirou, foi cancelada ou já não está aguardando pagamento. Volte ao WhatsApp e gere uma nova compra.",
      },
      {
        option: 5,
        id: "link-pagamento-indisponivel",
        question: "O link de pagamento não abriu ou está indisponível.",
        answer: "O link pode ficar indisponível se a reserva expirou, foi cancelada ou deixou de estar aguardando pagamento. Volte ao WhatsApp, busque o evento e gere uma nova compra.",
      },
    ],
  });
  assert.equal(
    formatPublicHelpResults(result),
    [
      "*TÓPICOS DE AJUDA*",
      "Digite o número correspondente a sua dúvida:",
      "> 1. Como pagar por Pix?",
      "> 2. Meu pagamento está pendente. O que faço?",
      "> 3. Por que pede CPF e e-mail no pagamento?",
      "> 4. A tela diz pagamento indisponível. Por quê?",
      "> 5. O link de pagamento não abriu ou está indisponível.",
      "",
      "Encontrei 13 tópicos.",
      'Para ver outros tópicos referente ao assunto, digite "*VER MAIS*"',
      'Para sair do modo AJUDA, digite "*SAIR*"',
    ].join("\n"),
  );
});

test("selecao numerica responde topico encontrado sem trocar contexto", () => {
  const search = searchPublicHelpTopics("pagamento pix");
  const selected = search.results[0];
  const topic = getPublicHelpTopicById(selected.id);

  assert.deepEqual(topic, {
    id: "pix",
    question: "Como pagar por Pix?",
    answer: "Abra o link de pagamento e gere o código Pix. Copie o Pix copia e cola, pague no app do banco e aguarde a confirmação. A tela muda para pagamento aprovado quando o sistema recebe a confirmação.",
    keywords: ["pix", "copia", "cola", "codigo", "código", "pagamento"],
  });
  assert.equal(
    formatPublicHelpAnswer(topic),
    [
      "*COMO PAGAR POR PIX?*",
      "Abra o link de pagamento e gere o código Pix. Copie o Pix copia e cola, pague no app do banco e aguarde a confirmação. A tela muda para pagamento aprovado quando o sistema recebe a confirmação.",
      "",
      "Para escolher uma pergunta da pesquisa anterior, digite o número ou digite outras duas palavras para uma nova pesquisa de ajuda. Para voltar onde estava, digite *VOLTAR*",
    ].join("\n"),
  );
});

test("topico sem resultado mantem coleta de ajuda", () => {
  const result = searchPublicHelpTopics("zzzxxy semresultado");
  const reply = formatPublicHelpResults(result);

  assert.deepEqual(result, {
    query: "zzzxxy semresultado",
    results: [],
    total: 0,
    page: 0,
    hasMore: false,
  });
  assert.equal(
    reply,
    [
      "*TÓPICOS DE AJUDA*",
      "Não encontrei um tópico para essa dúvida.",
      "",
      "Digite outras duas palavras. Exemplos:",
      "> pagamento pix",
      "> qr invalido",
      "> reserva expirada",
    ].join("\n"),
  );
});

test("SAIR dentro da ajuda volta ao inicio sem compra admin ou reenvio", () => {
  assert.doesNotMatch(helpFlowBlock, /createCheckoutForReservation/);
  assert.doesNotMatch(helpFlowBlock, /getActiveAdminSession/);
  assert.doesNotMatch(helpFlowBlock, /handlePaidTicketResendCommand/);
  assert.doesNotMatch(helpFlowBlock, /listPaidTicketResendGroupsForPhone/);
});

test("VOLTAR retorna ao estado anterior salvo no publicHelp", () => {
  assert.equal(normalizeNewlines(publicHelpReturnContextBlock), expectedPublicHelpReturnContextBlock);
});

test("fluxo de ajuda nao intercepta fora dos estados de ajuda", () => {
  assert.match(helpFlowBlock, /if \(!isPublicHelpFlowState\(baseContext\.state\)\)/);
  assert.match(helpFlowBlock, /return null/);
  assert.match(router, /const publicHelpResult = handlePublicHelpMessage/);
  assert.match(router, /if \(publicHelpResult\) \{\s*return publicHelpResult;/);
});
