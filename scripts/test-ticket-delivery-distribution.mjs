import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { buildInitialConversationState } from "../src/lib/tickets/conversationState.ts";
import {
  routeTicketMessage,
  validateParticipantContactsForTest,
} from "../src/lib/tickets/router.ts";

const routerSource = readFileSync(
  new URL("../src/lib/tickets/router.ts", import.meta.url),
  "utf8",
);
const ticketsServiceSource = readFileSync(
  new URL("../src/lib/tickets/services/tickets.ts", import.meta.url),
  "utf8",
);
const zapiWebhookSource = readFileSync(
  new URL("../src/app/api/webhook/zapi/route.ts", import.meta.url),
  "utf8",
);
const ticketDeliverySource = readFileSync(
  new URL("../src/lib/tickets/services/ticketDelivery.ts", import.meta.url),
  "utf8",
);
const comboOffersSource = readFileSync(
  new URL("../src/lib/tickets/services/comboOffers.ts", import.meta.url),
  "utf8",
);
const buyerReservedMigrationSource = readFileSync(
  new URL(
    "../supabase/migrations/20260725000100_reserve_buyer_ticket_in_participant_distribution.sql",
    import.meta.url,
  ),
  "utf8",
);

const customer = {
  id: "customer-ticket-delivery-distribution",
  whatsapp_phone: "5515999999999",
  name: null,
};

function ticketDeliveryContext(overrides = {}) {
  return {
    ...buildInitialConversationState(),
    publicInitialHelpSent: true,
    step: "ticket_delivery_selecting",
    state: "ticket_delivery_selecting",
    ticketDelivery: {
      orderId: "order-ticket-delivery-distribution",
      expectedContactsCount: 2,
      requestedAt: "2026-07-24T12:00:00.000Z",
      mode: "selecting",
    },
    ...overrides,
  };
}

function waitingContext(expectedContactsCount = 2) {
  return ticketDeliveryContext({
    step: "ticket_delivery_contacts_waiting",
    state: "ticket_delivery_contacts_waiting",
    ticketDelivery: {
      orderId: "order-ticket-delivery-distribution",
      expectedContactsCount,
      requestedAt: "2026-07-24T12:00:00.000Z",
      mode: "participant_contacts",
    },
  });
}

function validatedContext() {
  return ticketDeliveryContext({
    step: "ticket_delivery_contacts_validated",
    state: "ticket_delivery_contacts_validated",
    ticketDelivery: {
      orderId: "order-ticket-delivery-distribution",
      expectedContactsCount: 2,
      requestedAt: "2026-07-24T12:00:00.000Z",
      mode: "participant_contacts",
      validatedContacts: [
        { displayName: "Joao Silva", phone: "5515999911111", rawPhone: "+55 15 99991-1111" },
        { displayName: null, phone: "5515999922222", rawPhone: "+55 15 99992-2222" },
      ],
    },
  });
}

function contact(displayName, phones, extra = {}) {
  return {
    contact: {
      displayName,
      phones,
      ...extra,
    },
  };
}

function contactArray(items) {
  return {
    contactArray: items.map((item) => ({
      displayName: item.displayName,
      phones: item.phones,
      ...(item.extra ?? {}),
    })),
  };
}

function route(text, context, rawPayload) {
  return routeTicketMessage({
    customer,
    conversation: {
      id: "conversation-ticket-delivery-distribution",
      context,
    },
    text,
    messageType: rawPayload ? "system" : "text",
    rawPayload,
  });
}

test("comando global cancela conversa antes de executar estado pendente", async () => {
  const result = await route("cancelar", validatedContext());

  assert.equal(result.reply.includes("bem-vindo"), true);
  assert.equal(result.nextContext.state, "idle");
  assert.equal(result.nextContext.step, "idle");
  assert.equal(result.nextContext.ticketDelivery, undefined);
  assert.equal(result.nextContext.reservation, undefined);
  assert.equal(result.nextContext.payment, undefined);
  assert.equal(result.nextContext.publicInitialHelpSent, true);
  assert.doesNotMatch(result.reply, /Confirme os destinatários|Nao consegui vincular/);
});

test("comandos globais de reinicio sao tratados antes dos roteamentos por estado", () => {
  assert.match(routerSource, /isGlobalConversationCancelCommand\(text\)[\s\S]*resetConversationToInitialHelp/);
  assert.match(routerSource, /buildInitialConversationState\(\)/);
  assert.match(routerSource, /"cancelar atendimento"/);
  assert.match(routerSource, /"comecar novamente"/);
  assert.match(routerSource, /"recomecar"/);
});

test("Meu ingresso tem prioridade sobre saudacao inicial e estados antigos", () => {
  const routeBody = routerSource.slice(
    routerSource.indexOf("export async function routeTicketMessage"),
  );
  const participantBlock = routeBody.match(
    /if \(isParticipantTicketRequestIntent\(text\)\) \{[\s\S]*?handleParticipantTicketRequest[\s\S]*?\n  \}/,
  );
  assert.ok(participantBlock, "participant request block not found");
  assert.ok(
    routeBody.indexOf(participantBlock[0]) <
      routeBody.indexOf("shouldSendPublicInitialHelp(baseContext)"),
  );
  assert.ok(
    routeBody.indexOf(participantBlock[0]) <
      routeBody.indexOf('previousState.state === "admin_auth_pending"'),
  );
  assert.match(participantBlock[0], /phone:\s*customer\.whatsapp_phone/);
  assert.match(routerSource, /"meu ingresso"/);
  assert.match(routerSource, /"meus ingressos"/);
  assert.match(routerSource, /"quero meu ingresso"/);
  assert.match(routerSource, /"reenviar meus ingressos"/);
});

test("Meu ingresso como primeira mensagem usa fluxo existente sem boas-vindas", () => {
  assert.match(routerSource, /listParticipantTicketDeliveriesForPhone\(\s*normalizedPhone/);
  assert.match(routerSource, /participantTickets\.length === 0[\s\S]*Não encontrei ingresso disponível para este telefone/);
  assert.match(routerSource, /participantTickets\.length > 1[\s\S]*formatParticipantTicketSelectionPrompt/);
  assert.match(routerSource, /buildParticipantTicketDeliveryResult\(\{[\s\S]*deliveries:\s*participantTickets/);
  assert.match(routerSource, /outboundMessages,\s*\n\s*nextContext:\s*resetBuyerReservationContext\(baseContext\)/);
  assert.doesNotMatch(
    routerSource.match(/function handleParticipantTicketRequest[\s\S]*?\n\}/)?.[0] ?? "",
    /genericHelp|bem-vindo|buildPublicInitialHelpResponse/,
  );
});

test("Meu ingresso cobre telefone com vinculo, sem vinculo, sem estado e estado antigo", () => {
  assert.match(ticketsServiceSource, /\.eq\("recipient_phone", phone\)/);
  assert.match(ticketsServiceSource, /\.in\("participant_delivery_status", \[[\s\S]*awaiting_participant_request[\s\S]*delivered/);
  assert.match(routerSource, /const previousState = getConversationState\(conversation\.context\)/);
  assert.match(routerSource, /\.\.\.buildInitialConversationState\(\),[\s\S]*\.\.\.previousState/);
  assert.match(routerSource, /isParticipantTicketRequestIntent\(text\)[\s\S]*handleParticipantTicketRequest/);
  assert.match(routerSource, /resetBuyerReservationContext\(baseContext\)/);
});

test("opcao 1 entrega normalmente ao comprador e encerra estado sem resposta extra", () => {
  assert.match(routerSource, /if \(option === 1\)[\s\S]*deliverTicketsForOrder\(orderId\)/);
  assert.match(routerSource, /if \(option === 1\)[\s\S]*skipReply:\s*true/);
  assert.match(routerSource, /if \(option === 1\)[\s\S]*nextContext:\s*resetBuyerReservationContext\(baseContext\)/);
});

test("opcao 2 entra em ticket_delivery_contacts_waiting", async () => {
  const result = await route("2", ticketDeliveryContext());

  assert.equal(result.nextContext.state, "ticket_delivery_contacts_waiting");
  assert.equal(result.nextContext.ticketDelivery.mode, "participant_contacts");
  assert.equal(result.nextContext.ticketDelivery.expectedContactsCount, 2);
  assert.match(result.reply, /você deve enviar 2 contatos/i);
});

test("opcao 2 espera quantidade de ingressos menos um e nao e oferecida para compra de 1 ingresso", async () => {
  assert.match(ticketDeliverySource, /expectedContactsCount:\s*Math\.max\(0,\s*tickets\.length - 1\)/);
  assert.match(ticketDeliverySource, /buildTicketDeliveryPreferenceMessage\(tickets\.length\)/);
  assert.match(ticketDeliverySource, /ticketsCount <= 1[\s\S]*Digite \*1\*/);

  const result = await route(
    "2",
    ticketDeliveryContext({
      ticketDelivery: {
        orderId: "order-single-ticket",
        expectedContactsCount: 0,
        requestedAt: "2026-07-24T12:00:00.000Z",
        mode: "selecting",
      },
    }),
  );

  assert.equal(result.nextContext.state, "ticket_delivery_selecting");
  assert.match(result.reply, /apenas 1 ingresso/i);
});

test("leitura de contact valida e exibe confirmacao sem telefone completo", async () => {
  const result = await route(
    "",
    waitingContext(1),
    contact("Joao Silva", ["+55 15 99991-1111"]),
  );

  assert.equal(result.nextContext.state, "ticket_delivery_contacts_validated");
  assert.equal(result.nextContext.ticketDelivery.validatedContacts[0].phone, "5515999911111");
  assert.match(result.reply, /Confirme/i);
  assert.match(result.reply, /Joao Silva/);
  assert.doesNotMatch(result.reply, /5515999911111|\+55 15 99991-1111/);
});

test("leitura de contactArray valida multiplos contatos", async () => {
  const result = await route(
    "",
    waitingContext(2),
    contactArray([
      { displayName: "Joao Silva", phones: ["+55 15 99991-1111"] },
      { displayName: "Maria Souza", phones: ["+55 15 99992-2222"] },
    ]),
  );

  assert.equal(result.nextContext.state, "ticket_delivery_contacts_validated");
  assert.equal(result.nextContext.ticketDelivery.validatedContacts.length, 2);
  assert.deepEqual(
    result.nextContext.ticketDelivery.validatedContacts.map((item) => item.phone),
    ["5515999911111", "5515999922222"],
  );
});

test("contato sem telefone e rejeitado", () => {
  const result = validateParticipantContactsForTest({
    expectedContactsCount: 1,
    rawPayload: contact("Sem Telefone", []),
  });

  assert.equal(result.ok, false);
  assert.equal(result.reason, "missing_phone");
});

test("contato com mais de um telefone unico e rejeitado", () => {
  const result = validateParticipantContactsForTest({
    expectedContactsCount: 1,
    rawPayload: contact("Multi Phone", ["+55 15 99991-1111", "+55 15 99992-2222"]),
  });

  assert.equal(result.ok, false);
  assert.equal(result.reason, "multiple_phones");
});

test("deduplicacao de telefones dentro do mesmo contato considera phones e vCard", () => {
  const result = validateParticipantContactsForTest({
    expectedContactsCount: 1,
    rawPayload: contact("Mesmo Numero", ["(15) 99991-1111"], {
      vCard: "BEGIN:VCARD\nFN:Mesmo Numero\nTEL;TYPE=CELL:+55 15 99991-1111\nEND:VCARD",
    }),
  });

  assert.equal(result.ok, true);
  assert.equal(result.contacts.length, 1);
  assert.equal(result.contacts[0].phone, "5515999911111");
});

test("telefones duplicados entre contatos sao rejeitados com detalhes", () => {
  const result = validateParticipantContactsForTest({
    expectedContactsCount: 2,
    rawPayload: contactArray([
      { displayName: "Joao Silva", phones: ["+55 15 99991-1111"] },
      { displayName: "Maria Souza", phones: ["(15) 99991-1111"] },
    ]),
  });

  assert.equal(result.ok, false);
  assert.equal(result.reason, "duplicate_phones");
  assert.equal(result.duplicates?.length, 1);
});

test("quantidade menor que a esperada nao avanca", () => {
  const result = validateParticipantContactsForTest({
    expectedContactsCount: 2,
    rawPayload: contact("Joao Silva", ["+55 15 99991-1111"]),
  });

  assert.equal(result.ok, false);
  assert.equal(result.reason, "count_mismatch");
  assert.equal(result.receivedCount, 1);
});

test("contatos enviados em partes sao acumulados ate completar a quantidade esperada", async () => {
  const firstResult = await route(
    "",
    waitingContext(2),
    contact("Joao Silva", ["+55 15 99991-1111"]),
  );

  assert.equal(firstResult.nextContext.state, "ticket_delivery_contacts_waiting");
  assert.equal(firstResult.nextContext.ticketDelivery.pendingContacts.length, 1);
  assert.match(firstResult.reply, /Faltam: 1/i);

  const secondResult = await route(
    "",
    firstResult.nextContext,
    contact("Maria Souza", ["+55 15 99992-2222"]),
  );

  assert.equal(secondResult.nextContext.state, "ticket_delivery_contacts_validated");
  assert.equal(secondResult.nextContext.ticketDelivery.validatedContacts.length, 2);
  assert.deepEqual(
    secondResult.nextContext.ticketDelivery.validatedContacts.map((item) => item.phone),
    ["5515999911111", "5515999922222"],
  );
  assert.match(secondResult.reply, /Confirme os/i);
});

test("quantidade maior que a esperada nao avanca", () => {
  const result = validateParticipantContactsForTest({
    expectedContactsCount: 1,
    rawPayload: contactArray([
      { displayName: "Joao Silva", phones: ["+55 15 99991-1111"] },
      { displayName: "Maria Souza", phones: ["+55 15 99992-2222"] },
    ]),
  });

  assert.equal(result.ok, false);
  assert.equal(result.reason, "count_mismatch");
  assert.equal(result.receivedCount, 2);
});

test("CANCELAR global limpa contatos validados e volta ao inicio", async () => {
  const result = await route("cancelar", validatedContext());

  assert.equal(result.nextContext.state, "idle");
  assert.equal(result.nextContext.ticketDelivery, undefined);
  assert.match(result.reply, /bem-vindo/i);
});

test("CONFIRMAR usa RPC de vinculacao e limpa estado apos sucesso", () => {
  assert.match(routerSource, /normalizedText !== "confirmar"/);
  assert.match(routerSource, /assignParticipantContactsToOrderTickets\(\{[\s\S]*orderId,[\s\S]*contacts:\s*validatedContacts/);
  assert.match(routerSource, /getBuyerReservedTicketsForOrder\(orderId\)/);
  assert.match(routerSource, /buildTicketDeliveryPayload\([\s\S]*buyerReservedTickets[\s\S]*"\*INGRESSO RESERVADO\*"/);
  assert.match(routerSource, /outboundMessages = \[[\s\S]*buildPaidTicketResendOutboundMessages\(buyerDelivery\)[\s\S]*PARTICIPANT_TICKET_REQUEST_INSTRUCTIONS/);
  assert.match(routerSource, /reply:\s*PARTICIPANT_TICKET_REQUEST_INSTRUCTIONS/);
  assert.match(ticketsServiceSource, /supabase\.rpc\(\s*"assign_participant_contacts_to_order_tickets"/);
  assert.match(ticketsServiceSource, /p_contacts:\s*contacts\.map/);
});

test("RPC reserva exatamente 1 ingresso do comprador e vincula contatos aos demais", () => {
  assert.match(buyerReservedMigrationSource, /v_expected_contacts_count := v_ticket_count - 1/);
  assert.match(buyerReservedMigrationSource, /if v_contacts_count <> v_expected_contacts_count then[\s\S]*ticket_contact_count_mismatch/);
  assert.match(buyerReservedMigrationSource, /if not v_buyer_ticket_seen then[\s\S]*v_buyer_ticket_id := v_ticket\.id[\s\S]*continue;/);
  assert.match(buyerReservedMigrationSource, /buyer_reserved_count', 1/);
  assert.match(buyerReservedMigrationSource, /for update/);
  assert.match(buyerReservedMigrationSource, /notify pgrst, 'reload schema'/);
});

test("Meu ingresso com 1 ingresso envia diretamente", () => {
  assert.match(routerSource, /normalizeWhatsAppPhone\(phone\)/);
  assert.match(routerSource, /listParticipantTicketDeliveriesForPhone\(\s*normalizedPhone/);
  assert.match(routerSource, /if \(participantTickets\.length > 1\)/);
  assert.match(routerSource, /buildParticipantTicketDeliveryResult\(\{[\s\S]*deliveries:\s*participantTickets/);
  assert.match(routerSource, /buildTicketDeliveryPayload\(\[delivery\.ticket\], "\*INGRESSO\*"\)/);
});

test("Meu ingresso com 2 ou mais ingressos mostra menu e nao envia QR imediatamente", () => {
  assert.match(routerSource, /function formatParticipantTicketSelectionPrompt/);
  assert.match(routerSource, /\*INGRESSO ROCKBAR\*/);
  assert.match(routerSource, /Qual ingresso voc/);
  assert.match(routerSource, /`> Digite \$\{index \+ 1\} para/);
  assert.match(routerSource, /`> Digite \$\{deliveries\.length \+ 1\} para receber todos`/);
  assert.match(routerSource, /participantTickets\.length > 1[\s\S]*reply:\s*formatParticipantTicketSelectionPrompt\(participantTickets\)[\s\S]*nextContext:\s*buildParticipantTicketSelectionContext/);
});

test("opcao individual envia somente ingresso escolhido e todos envia a lista completa", () => {
  assert.match(routerSource, /baseContext\.state !== "participant_ticket_selecting"/);
  assert.match(routerSource, /option === selection\.allOption\s*\? validDeliveries\s*:\s*validDeliveries\.filter/);
  assert.match(routerSource, /item\.option === option[\s\S]*item\.ticketId === delivery\.ticket\.ticketId/);
});

test("opcao invalida reapresenta orientacao", () => {
  assert.match(routerSource, /Op.*inv.*lida\. Responda com um n.*mero da lista/);
  assert.match(routerSource, /nextContext:\s*baseContext/);
});

test("shows iguais com sessoes diferentes sao diferenciados", () => {
  assert.match(routerSource, /function formatParticipantTicketSelectionLabel/);
  assert.match(routerSource, /sameTitleCount > 1/);
  assert.match(routerSource, /formatDateTime\(delivery\.ticket\.startsAt\)/);
});

test("falha parcial mantem pendente e marca apenas imagens enviadas com sucesso", () => {
  assert.match(routerSource, /deliveryStatus === "awaiting_participant_request"/);
  assert.match(routerSource, /shouldMarkDelivered && message\.type === "image"/);
  assert.match(zapiWebhookSource, /if \(!sendResult\.ok\)[\s\S]*Participant ticket QR send failed; ticket remains pending for retry/);
  assert.match(zapiWebhookSource, /if \(outboundMessage\.participantDeliveryTicketId\)[\s\S]*markParticipantTicketDelivered/);
});

test("sair cancelar e menu limpam estado de selecao de ingresso", () => {
  assert.match(routerSource, /normalizedText === "sair"[\s\S]*normalizedText === "cancelar"[\s\S]*normalizedText === "menu"/);
  assert.match(routerSource, /participantTicketSelection:\s*undefined/);
});

test("Meu ingresso durante selecao reapresenta lista atualizada", () => {
  assert.match(routerSource, /if \(isParticipantTicketRequestIntent\(text\)\) \{[\s\S]*handleParticipantTicketRequest/);
  assert.match(routerSource, /phone:\s*baseContext\.participantTicketSelection\?\.phone/);
});

test("revalidacao impede envio de ingresso invalido", () => {
  assert.match(routerSource, /const currentDeliveries = await listParticipantTicketDeliveriesForPhone\(\s*selection\.phone/);
  assert.match(routerSource, /const allowedIds = new Set\(selection\.ticketIds\)/);
  assert.match(routerSource, /allowedIds\.has\(delivery\.ticket\.ticketId\)/);
  assert.match(routerSource, /N.*o encontrei mais esse ingresso dispon.*vel para este telefone/);
});

test("Meu ingresso suporta multiplos ingressos para o mesmo telefone e compras diferentes", () => {
  assert.match(ticketsServiceSource, /recipient_phone",\s*phone/);
  assert.match(ticketsServiceSource, /participant_delivery_status/);
  assert.match(ticketsServiceSource, /orders!inner\(id,\s*status/);
  assert.doesNotMatch(ticketsServiceSource, /\.maybeSingle<[^>]*Participant/);
  assert.match(ticketsServiceSource, /\.returns<ParticipantTicketDeliveryRow\[\]>\(\)/);
  assert.match(ticketsServiceSource, /sort\(\(left,\s*right\) =>/);
});

test("reenvio de ingressos ja delivered preserva status e data", () => {
  assert.match(routerSource, /deliveryStatus === "awaiting_participant_request"/);
  assert.match(routerSource, /shouldMarkDelivered && message\.type === "image"/);
  assert.doesNotMatch(routerSource, /deliveryStatus === "delivered"[\s\S]{0,120}participantDeliveryTicketId/);
});

test("falha parcial no envio mantem awaiting_participant_request para retry", () => {
  assert.match(zapiWebhookSource, /const sendResult = await sendOutboundMessage/);
  assert.match(zapiWebhookSource, /if \(!sendResult\.ok\)[\s\S]*logWarn\("Z-API reply failed/);
  assert.match(zapiWebhookSource, /if \(outboundMessage\.participantDeliveryTicketId\)[\s\S]*markParticipantTicketDelivered/);
  assert.match(zapiWebhookSource, /Participant ticket QR send failed; ticket remains pending for retry/);
});

test("Meu ingresso envia somente QR Code e nenhuma oferta na mesma execucao", () => {
  assert.doesNotMatch(routerSource, /participantComboOfferTicketId/);
  assert.doesNotMatch(zapiWebhookSource, /sendComboOfferForTicket|participant_combo_offer/);
  assert.doesNotMatch(routerSource, /createComboOrderForCheckout/);
});

test("participante fica elegivel para agendamento somente apos QR entregue", () => {
  assert.match(zapiWebhookSource, /if \(outboundMessage\.participantDeliveryTicketId\)[\s\S]*markParticipantTicketDelivered/);
  assert.match(comboOffersSource, /\.eq\("participant_delivery_status",\s*"delivered"\)/);
  assert.match(comboOffersSource, /\.not\("recipient_phone",\s*"is",\s*null\)/);
  assert.match(comboOffersSource, /participant_delivered_at/);
  assert.doesNotMatch(comboOffersSource, /\.eq\("participant_delivery_status",\s*"awaiting_participant_request"\)/);
});

test("scheduler encontra participante entregue e resolve customer proprio pelo recipient_phone", () => {
  assert.match(comboOffersSource, /import \{ upsertCustomerFromWhatsApp \} from "@\/lib\/tickets\/services\/customers"/);
  assert.match(comboOffersSource, /participantPhones[\s\S]*ticket\.recipient_phone/);
  assert.match(comboOffersSource, /upsertCustomerFromWhatsApp\(\{ phone \}\)/);
  assert.match(comboOffersSource, /participantCustomerByPhone\.set\(originalPhone,[\s\S]*id:\s*result\.customer\.id[\s\S]*phone:\s*result\.customer\.whatsapp_phone/);
  assert.match(comboOffersSource, /const customer = phone \? participantCustomerByPhone\.get\(phone\) : null/);
  assert.match(comboOffersSource, /customer_id:\s*customer\.id/);
  assert.match(comboOffersSource, /offer_customer_id:\s*customer\.id/);
  assert.match(comboOffersSource, /customers:\s*\{\s*whatsapp_phone:\s*customer\.phone\s*\}/);
});

test("oferta de participante usa o mesmo agendador e respeita tempo configurado", () => {
  assert.match(comboOffersSource, /export async function sendScheduledComboOffers/);
  assert.match(comboOffersSource, /participantOfferTickets/);
  assert.match(comboOffersSource, /mergeComboOfferCandidateTickets\([\s\S]*eventWindowTickets[\s\S]*recentPurchaseTickets[\s\S]*participantOfferTickets/);
  assert.match(comboOffersSource, /shouldSendComboOfferNow\([\s\S]*offer,[\s\S]*session\.starts_at,[\s\S]*now,[\s\S]*ticket\.issued_at/);
  assert.match(comboOffersSource, /const shouldSendOnSchedule = shouldSendComboOfferNow/);
  assert.match(comboOffersSource, /const offset = offer\.send_offset_minutes/);
});

test("oferta perdida e recuperada uma unica vez quando janela passou mas evento nao iniciou", () => {
  assert.match(comboOffersSource, /function shouldRecoverMissedComboOffer/);
  assert.match(comboOffersSource, /if \(!Number\.isFinite\(start\) \|\| current >= start\) return false/);
  assert.match(comboOffersSource, /const shouldSendAsRecovery =[\s\S]*!shouldSendOnSchedule[\s\S]*shouldRecoverMissedComboOffer\(offer,\s*session\.starts_at,\s*now,\s*ticket\.issued_at\)/);
  assert.match(comboOffersSource, /if \(!shouldSendOnSchedule && !shouldSendAsRecovery\) \{[\s\S]*skippedCount \+= 1/);
  assert.match(comboOffersSource, /combo_offer_delivery_mode:\s*shouldSendAsRecovery \? "recovery" : "scheduled"/);
  assert.match(comboOffersSource, /combo_offer_recovered:\s*shouldSendAsRecovery/);
});

test("recuperacao de oferta perdida continua protegida pela deduplicacao antes do envio", () => {
  assert.match(comboOffersSource, /const dedupeKey = buildComboOfferDedupeKey[\s\S]*const currentSentKeys = await loadSentComboOfferKeys\(\[offerCustomerId\]\)[\s\S]*if \(currentSentKeys\.has\(dedupeKey\)\)[\s\S]*const shouldSendOnSchedule = shouldSendComboOfferNow/);
});

test("oferta de 2 minutos e multiplas prioridades continuam no mecanismo existente", () => {
  assert.match(comboOffersSource, /offer\.send_offset_minutes/);
  assert.match(comboOffersSource, /target = start - offset \* 60_000/);
  assert.match(comboOffersSource, /getComboOfferPriorityForEvent\(offer,\s*session\.event_id\) === purchaseNumber/);
  assert.match(comboOffersSource, /resolveEffectiveComboOffersForEvent/);
});

test("mesma oferta nao duplica para o mesmo participante", () => {
  assert.match(comboOffersSource, /const offerCustomerId = ticket\.offer_customer_id \?\? ticket\.customer_id/);
  assert.match(comboOffersSource, /buildComboOfferDedupeKey\(\{[\s\S]*customerId:\s*offerCustomerId/);
  assert.match(comboOffersSource, /loadSentComboOfferKeys\(\[offerCustomerId\]\)/);
  assert.match(comboOffersSource, /combo_offer_event_locks/);
});

test("comprador e participante usam chaves independentes de deduplicacao", () => {
  assert.match(comboOffersSource, /byId\.set\(`\$\{ticket\.offer_source \?\? "buyer"\}:\$\{customerId\}:\$\{ticket\.id\}`, ticket\)/);
  assert.match(comboOffersSource, /const key = `\$\{ticket\.offer_source \?\? "buyer"\}:\$\{customerId\}:\$\{order\.id\}`/);
  assert.match(comboOffersSource, /customerId:\s*offerCustomerId/);
  assert.match(comboOffersSource, /offer_recipient_source:\s*ticket\.offer_source \?\? "buyer"/);
});

test("multiplos ingressos do mesmo participante no mesmo pedido nao duplicam oferta", () => {
  assert.match(comboOffersSource, /function uniqueComboOfferCandidateTicketsByOrder/);
  assert.match(comboOffersSource, /const customerId = ticket\.offer_customer_id \?\? ticket\.customer_id/);
  assert.match(comboOffersSource, /const key = `\$\{ticket\.offer_source \?\? "buyer"\}:\$\{customerId\}:\$\{order\.id\}`/);
});

test("evento sem oferta nao agenda nada para participante", () => {
  assert.match(comboOffersSource, /listActiveComboOffersForEventSession\(/);
  assert.match(comboOffersSource, /if \(!offers\.length\) \{[\s\S]*skippedCount \+= 1/);
  assert.match(comboOffersSource, /if \(!offer\) \{[\s\S]*skippedCount \+= 1/);
});

test("oferta do participante nao vincula combo ao pedido original", () => {
  assert.match(comboOffersSource, /const isParticipantOffer = ticket\.offer_source === "participant"/);
  assert.match(comboOffersSource, /sourceOrderId:\s*isParticipantOffer \? null : order\.id/);
  assert.match(comboOffersSource, /sourceTicketId:\s*isParticipantOffer \? null : ticket\.id/);
  assert.match(comboOffersSource, /offer_recipient_source:\s*ticket\.offer_source \?\? "buyer"/);
});

test("fluxo do comprador permanece inalterado para oferta de combo", () => {
  assert.match(comboOffersSource, /export async function sendScheduledComboOffers/);
  assert.match(comboOffersSource, /reason:\s*"combo_offer"/);
  assert.match(comboOffersSource, /sourceOrderId:\s*isParticipantOffer \? null : order\.id/);
  assert.match(comboOffersSource, /sourceTicketId:\s*isParticipantOffer \? null : ticket\.id/);
  assert.match(comboOffersSource, /\.eq\("orders\.status",\s*"paid"\)/);
});
