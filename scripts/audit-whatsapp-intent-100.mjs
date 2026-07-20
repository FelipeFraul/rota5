import {
  resolveIncomingMessageIntent,
  shouldProcessImmediately,
} from "../src/lib/tickets/router.ts";

const idle = {};
const showingEvents = { state: "showing_events" };
const showingSections = { state: "showing_sections" };
const selectingQuantity = { state: "selecting_quantity" };
const reviewingCart = { state: "reviewing_cart" };
const paymentPending = { state: "payment_pending" };

const cases = [
  ["greeting", "Oi", idle, false, "greeting"],
  ["greeting", "Oii", idle, false, "greeting"],
  ["greeting", "Oiiiiiiii", idle, false, "greeting"],
  ["greeting", "Olá", idle, false, "greeting"],
  ["greeting", "Olaaa", idle, false, "greeting"],
  ["greeting", "Opa", idle, false, "greeting"],
  ["greeting", "E aí", idle, false, "greeting"],
  ["greeting", "Eae", idle, false, "greeting"],
  ["greeting", "Salve", idle, false, "greeting"],
  ["greeting", "Bom dia", idle, false, "greeting"],
  ["greeting", "Boa tarde", idle, false, "greeting"],
  ["greeting", "Boa noite", idle, false, "greeting"],
  ["greeting", "Oii boa noite", idle, false, "greeting"],
  ["greeting", "Boa noite tudo bem", idle, false, "social_reply"],
  ["greeting", "Oiiii boa tarde tudo bem", idle, false, "social_reply"],
  ["social", "Tudo bem?", idle, false, "social_reply"],
  ["social", "TD bem", idle, false, "social_reply"],
  ["social", "Tudo bom", idle, false, "social_reply"],
  ["social", "Tudo certo", idle, false, "social_reply"],
  ["social", "Tudo joia", idle, false, "social_reply"],
  ["social", "Estou bem", idle, false, "social_reply"],
  ["social", "To bem", idle, false, "social_reply"],
  ["social", "Tô bem", idle, false, "social_reply"],
  ["social", "E você?", idle, false, "social_reply"],
  ["social", "Como vai", idle, false, "social_reply"],
  ["social", "Beleza", idle, false, "social_reply"],
  ["social", "Blz", idle, false, "social_reply"],
  ["social", "De boa", idle, false, "social_reply"],
  ["social", "Tranquilo", idle, false, "social_reply"],
  ["social", "Suave", idle, false, "social_reply"],
  ["courtesy", "Por favor", idle, false, "courtesy"],
  ["courtesy", "Por gentileza", idle, false, "courtesy"],
  ["courtesy", "Obrigado", idle, false, "courtesy"],
  ["courtesy", "Obrigada", idle, false, "courtesy"],
  ["courtesy", "Obg", idle, false, "courtesy"],
  ["courtesy", "Valeu", idle, false, "courtesy"],
  ["courtesy", "Brigado", idle, false, "courtesy"],
  ["courtesy", "Brigada", idle, false, "courtesy"],
  ["courtesy", "Obrigado amigo", idle, false, "courtesy"],
  ["courtesy", "Boa noite por favor", idle, false, "courtesy"],
  ["intent+greeting", "Oi quero Santana", idle, true, "search_event"],
  ["intent+greeting", "Boa noite quero Nati gaiteira", idle, true, "search_event"],
  ["intent+greeting", "Opa quero oswaldo", idle, true, "search_event"],
  ["intent+greeting", "Salve tem show hoje?", idle, true, "events_by_date"],
  ["intent+greeting", "Boa tarde todos shows", idle, true, "list_events"],
  ["intent+courtesy", "Por favor quero Santana", idle, true, "search_event"],
  ["intent+courtesy", "Obrigado quero oswaldo", idle, true, "search_event"],
  ["intent+courtesy", "Por gentileza tem ingresso pro Santana?", idle, true, "buy_event"],
  ["buy", "Quero comprar", idle, true, "buy_without_event"],
  ["buy", "Quero ingresso", idle, true, "buy_without_event"],
  ["buy", "Quero comprar ingresso", idle, true, "buy_without_event"],
  ["buy", "Quero comprar Santana", idle, true, "buy_event"],
  ["buy", "Gostaria de comprar pro William", idle, true, "buy_event"],
  ["buy", "Tem ingresso para Nati gaiteira", idle, true, "buy_event"],
  ["buy", "Ingresso do Oswaldo", idle, true, "buy_event"],
  ["buy", "Comprar pro Gui Santana", idle, true, "buy_event"],
  ["buy", "Quero dois ingressos pro Santana", idle, true, "buy_event"],
  ["search", "Santana", idle, true, "search_event"],
  ["search", "Gui Santana", idle, true, "search_event"],
  ["search", "Nati gaiteira", idle, true, "search_event"],
  ["search", "Oswaldo", idle, true, "search_event"],
  ["search", "Osvaldo", idle, true, "search_event"],
  ["search", "show do Santana", idle, true, "search_event"],
  ["search", "tem o Santana?", idle, true, "search_event"],
  ["search", "comédia", idle, true, "search_event"],
  ["search", "cara da gaita", idle, true, "search_event"],
  ["search", "o do Corinthians", idle, true, "search_event"],
  ["date", "Tem show hoje?", idle, true, "events_by_date"],
  ["date", "Tem show hj?", idle, true, "events_by_date"],
  ["date", "Tem show amanhã?", idle, true, "search_event"],
  ["date", "Tem show sábado?", idle, true, "search_event"],
  ["date", "Eventos domingo", idle, true, "search_event"],
  ["date", "Show 20/07", idle, true, "search_event"],
  ["date", "Tem ingresso dia 25/07?", idle, true, "buy_event"],
  ["list", "Todos", idle, true, "list_events"],
  ["list", "Todos shows", idle, true, "list_events"],
  ["list", "Todos os eventos", idle, true, "list_events"],
  ["list", "Shows disponíveis", idle, true, "list_events"],
  ["list", "Ver todos eventos", idle, true, "list_events"],
  ["help", "Ajuda", idle, true, "unknown"],
  ["help", "Menu", idle, true, "unknown"],
  ["help", "Não consigo comprar online", idle, false, "purchase_support"],
  ["help", "O pagamento não abre", idle, false, "purchase_support"],
  ["help", "Erro no pix", idle, false, "purchase_support"],
  ["help", "Ola, tem ingresso?", idle, false, "greeting"],
  ["unknown", "abacaxizzz", idle, false, "unknown"],
  ["unknown", "Viu..", idle, false, "unknown"],
  ["unknown", "Sabe o que eu queria perguntar", idle, false, "unknown"],
  ["active", "1", showingEvents, true, "active_flow_reply"],
  ["active", "2", showingEvents, true, "active_flow_reply"],
  ["active", "Quero esse", showingEvents, true, "active_flow_reply"],
  ["active", "Sim", reviewingCart, true, "active_flow_reply"],
  ["active", "Não", reviewingCart, true, "active_flow_reply"],
  ["active", "Cancelar", showingSections, true, "active_flow_reply"],
  ["active", "Voltar", showingSections, true, "active_flow_reply"],
  ["active-social", "Boa noite", showingSections, false, "greeting"],
  ["active-social", "Tudo bem?", selectingQuantity, false, "social_reply"],
  ["active-social", "Por favor", paymentPending, false, "courtesy"],
  ["active-action", "duas", selectingQuantity, true, "active_flow_reply"],
  ["active-action", "meia", selectingQuantity, true, "active_flow_reply"],
];

if (cases.length !== 100) {
  throw new Error(`Expected 100 cases, got ${cases.length}`);
}

const rows = cases.map(([group, text, state, expectedImmediate, expectedClass], index) => {
  const intent = resolveIncomingMessageIntent({
    text,
    messageType: "text",
    conversationState: state,
  });
  const decision = shouldProcessImmediately({
    intent,
    message: text,
    activeState: state.state,
  });

  const passed =
    decision.immediate === expectedImmediate &&
    intent.classification === expectedClass;

  return {
    number: index + 1,
    group,
    text,
    state: state.state ?? "idle",
    expectedImmediate,
    expectedClass,
    classification: intent.classification,
    immediate: decision.immediate,
    reason: decision.reason,
    searchAuthorized: intent.searchAuthorized,
    term: intent.search?.artist ?? intent.search?.city ?? null,
    passed,
  };
});

const failed = rows.filter((row) => !row.passed);
const summaryByGroup = rows.reduce((accumulator, row) => {
  const current = accumulator[row.group] ?? { total: 0, passed: 0, failed: 0 };
  current.total += 1;
  if (row.passed) {
    current.passed += 1;
  } else {
    current.failed += 1;
  }
  accumulator[row.group] = current;
  return accumulator;
}, {});

console.log(JSON.stringify({
  ok: failed.length === 0,
  total: rows.length,
  passed: rows.length - failed.length,
  failed: failed.length,
  summaryByGroup,
  failedRows: failed,
  rows: process.env.FULL_INTENT_AUDIT === "1" ? rows : undefined,
}, null, 2));

if (failed.length > 0) {
  process.exit(1);
}
