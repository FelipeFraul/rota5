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

function sliceBetween(source, startPattern, endPattern) {
  const start = source.search(startPattern);
  assert.notEqual(start, -1, `start pattern not found: ${startPattern}`);
  const rest = source.slice(start);
  const end = rest.search(endPattern);
  assert.notEqual(end, -1, `end pattern not found: ${endPattern}`);
  return rest.slice(0, end);
}

const helpFlowBlock = sliceBetween(
  router,
  /function handlePublicHelpMessage/,
  /function parseTicketQuantity/,
);
const helpSearchBlock = sliceBetween(
  router,
  /function buildPublicHelpSearchResponse/,
  /function handlePublicHelpMessage/,
);

test("AJUDA entra no fluxo publico de ajuda e exibe prompt", () => {
  assert.equal(
    formatPublicHelpPrompt(),
    "*TÓPICO DE AJUDA*\nDigite duas palavras sobre sua dúvida:",
  );
  assert.match(publicHelp, /export function isPublicHelpCommand/);
  assert.match(publicHelp, /normalized === "ajuda"/);
  assert.match(helpFlowBlock, /if \(isPublicHelpCommand\(text\)\)/);
  assert.match(helpFlowBlock, /reply:\s*formatPublicHelpPrompt\(\)/);
  assert.match(helpFlowBlock, /step:\s*"help_topic_collecting"/);
  assert.match(helpFlowBlock, /state:\s*"help_topic_collecting"/);
});

test("busca por topico retorna resultados e preserva publicHelp e step", () => {
  const result = searchPublicHelpTopics("pagamento pix");

  assert.ok(result.results.length > 0);
  assert.equal(result.page, 0);
  assert.match(formatPublicHelpResults(result), /^\*TÓPICOS DE AJUDA\*/);
  assert.match(formatPublicHelpResults(result), /Digite o número correspondente a sua dúvida:/);
  assert.match(helpSearchBlock, /const searchResult = searchPublicHelpTopics\(query, page\)/);
  assert.match(helpSearchBlock, /step:\s*searchResult\.results\.length > 0 \? "help_results" : "help_topic_collecting"/);
  assert.match(helpSearchBlock, /state:\s*searchResult\.results\.length > 0 \? "help_results" : "help_topic_collecting"/);
  assert.match(helpSearchBlock, /publicHelp:\s*\{/);
  assert.match(helpSearchBlock, /query,/);
  assert.match(helpSearchBlock, /lastResults:\s*searchResult\.results\.map/);
  assert.match(helpSearchBlock, /returnStep:\s*returnStep \?\? baseContext\.publicHelp\?\.returnStep \?\? baseContext\.step/);
  assert.match(helpSearchBlock, /returnState:\s*returnState \?\? baseContext\.publicHelp\?\.returnState \?\? baseContext\.state/);
});

test("selecao numerica responde topico encontrado sem trocar contexto", () => {
  const search = searchPublicHelpTopics("pagamento pix");
  const selected = search.results[0];
  const topic = getPublicHelpTopicById(selected.id);

  assert.ok(topic);
  assert.equal(formatPublicHelpAnswer(topic).startsWith(`*${topic.question.toUpperCase()}*`), true);
  assert.match(formatPublicHelpAnswer(topic), /Para escolher uma pergunta da pesquisa anterior/);
  assert.match(helpFlowBlock, /baseContext\.state === "help_results"/);
  assert.match(helpFlowBlock, /const selectedOption = text\.trim\(\)\.match\(\/\^\\d\+\$\/\) \? Number\(text\.trim\(\)\) : null/);
  assert.match(helpFlowBlock, /baseContext\.publicHelp\?\.lastResults\?\.find/);
  assert.match(helpFlowBlock, /const topic = getPublicHelpTopicById\(selected\.id\)/);
  assert.match(helpFlowBlock, /reply:\s*formatPublicHelpAnswer\(topic\)/);
  assert.match(helpFlowBlock, /nextContext:\s*baseContext/);
});

test("topico sem resultado mantem coleta de ajuda", () => {
  const result = searchPublicHelpTopics("zzzxxy semresultado");
  const reply = formatPublicHelpResults(result);

  assert.equal(result.results.length, 0);
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
  assert.match(helpSearchBlock, /step:\s*searchResult\.results\.length > 0 \? "help_results" : "help_topic_collecting"/);
  assert.match(helpSearchBlock, /state:\s*searchResult\.results\.length > 0 \? "help_results" : "help_topic_collecting"/);
});

test("SAIR dentro da ajuda volta ao inicio sem compra admin ou reenvio", () => {
  assert.match(helpFlowBlock, /if \(isBuyerReservationExitIntent\(text\)\)/);
  assert.match(helpFlowBlock, /reply:\s*TICKET_MESSAGES\.genericHelp/);
  assert.match(helpFlowBlock, /nextContext:\s*buildInitialConversationState\(\)/);
  assert.doesNotMatch(helpFlowBlock, /createCheckoutForReservation/);
  assert.doesNotMatch(helpFlowBlock, /getActiveAdminSession/);
  assert.doesNotMatch(helpFlowBlock, /handlePaidTicketResendCommand/);
  assert.doesNotMatch(helpFlowBlock, /listPaidTicketResendGroupsForPhone/);
});

test("VOLTAR retorna ao estado anterior salvo no publicHelp", () => {
  assert.match(router, /function publicHelpReturnContext/);
  assert.match(router, /const returnStep = baseContext\.publicHelp\?\.returnStep/);
  assert.match(router, /const returnState = baseContext\.publicHelp\?\.returnState/);
  assert.match(router, /step:\s*returnStep \?\? "idle"/);
  assert.match(router, /state:\s*returnState \?\? returnStep \?\? "idle"/);
  assert.match(router, /publicHelp:\s*undefined/);
  assert.match(helpFlowBlock, /if \(isBuyerBackIntent\(text\)\)/);
  assert.match(helpFlowBlock, /reply:\s*"Voltando ao atendimento anterior\."/);
  assert.match(helpFlowBlock, /nextContext:\s*publicHelpReturnContext\(baseContext\)/);
});

test("fluxo de ajuda nao intercepta fora dos estados de ajuda", () => {
  assert.match(helpFlowBlock, /if \(!isPublicHelpFlowState\(baseContext\.state\)\)/);
  assert.match(helpFlowBlock, /return null/);
  assert.match(router, /const publicHelpResult = handlePublicHelpMessage/);
  assert.match(router, /if \(publicHelpResult\) \{\s*return publicHelpResult;/);
});
