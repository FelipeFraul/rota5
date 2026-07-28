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
const paymentWebhookSource = readFileSync(
  new URL("../src/app/api/webhook/payment/mercado-pago/route.ts", import.meta.url),
  "utf8",
);
const ticketDeliverySource = readFileSync(
  new URL("../src/lib/tickets/services/ticketDelivery.ts", import.meta.url),
  "utf8",
);
const outboundDeliveriesSource = readFileSync(
  new URL("../src/lib/tickets/services/whatsappOutboundDeliveries.ts", import.meta.url),
  "utf8",
);
const messagesServiceSource = readFileSync(
  new URL("../src/lib/tickets/services/messages.ts", import.meta.url),
  "utf8",
);
const comboOffersSource = readFileSync(
  new URL("../src/lib/tickets/services/comboOffers.ts", import.meta.url),
  "utf8",
);
const comboOfferTicketUniquenessMigration = readFileSync(
  new URL("../supabase/migrations/20260725000400_scope_combo_order_offer_uniqueness_by_ticket.sql", import.meta.url),
  "utf8",
);
const buyerQrDeliveryMigration = readFileSync(
  new URL("../supabase/migrations/20260726000100_add_buyer_qr_delivered_at.sql", import.meta.url),
  "utf8",
);
const comboRedemptionsSource = readFileSync(
  new URL("../src/lib/tickets/services/comboRedemptions.ts", import.meta.url),
  "utf8",
);
const ticketsConfigSource = readFileSync(
  new URL("../src/lib/tickets/config.ts", import.meta.url),
  "utf8",
);
const conversationStateSource = readFileSync(
  new URL("../src/lib/tickets/conversationState.ts", import.meta.url),
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
  assert.match(result.reply, /\*ENVIANDO OS INGRESSOS\*/);
  assert.match(result.reply, /Você pode \*enviar o ingresso\* de forma segura \*para o seu acompanhante\*/);
  assert.match(result.reply, /você tem \*2 acompanhante\(s\) para convidar\*/i);
  assert.match(result.reply, /Envie o contato\(s\) abaixo:/);
});

test("opcao 2 espera quantidade de ingressos menos um e nao e oferecida para compra de 1 ingresso", async () => {
  const singleTicketPreferenceBlock =
    ticketDeliverySource.match(/if \(ticketsCount <= 1\) \{[\s\S]*?\n  \}/)?.[0] ?? "";

  assert.match(ticketDeliverySource, /expectedContactsCount:\s*Math\.max\(0,\s*tickets\.length - 1\)/);
  assert.match(ticketDeliverySource, /buildTicketDeliveryPreferenceMessage\(tickets\.length\)/);
  assert.doesNotMatch(singleTicketPreferenceBlock, /Digite \*1\*/);

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

test("compra com 1 ingresso entrega direto sem pedir opcao 1", () => {
  assert.match(paymentWebhookSource, /tickets_count[\s\S]*<= 1[\s\S]*deliverTicketsForOrder\(orderId\)/);
  assert.match(paymentWebhookSource, /requestTicketDeliveryPreferenceForOrder\(orderId\)/);
  assert.doesNotMatch(ticketDeliverySource, /> Digite \*1\* para receber o QRCode/);
  assert.doesNotMatch(routerSource, /> Digite \*1\* para receber o QRCode/);
});

test("imagem do ingresso e instrucao de portaria sao mensagens separadas", () => {
  assert.match(ticketDeliverySource, /const EMPTY_QR_IMAGE_CAPTION = ""/);
  assert.match(ticketDeliverySource, /caption:\s*EMPTY_QR_IMAGE_CAPTION/);
  assert.match(ticketDeliverySource, /sendZapiImage\(\{[\s\S]*phone,[\s\S]*image:\s*qrImage,[\s\S]*\}\)/);
  assert.match(ticketDeliverySource, /paid-ticket-order:\$\{orderId\}:qr-instruction:v1/);
  assert.match(routerSource, /\.\.\.delivery\.qrImages\.map[\s\S]*\{ type: "text" as const, body: delivery\.qrInstructionMessage \}/);
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

test("comprador registra primeira entrega valida do QR sem depender de pagamento para oferta", () => {
  assert.match(ticketDeliverySource, /markBuyerTicketQrDelivered/);
  assert.match(ticketDeliverySource, /markWhatsAppOutboundDeliverySent\([\s\S]*providerMessageId:\s*imageSendResult\.providerMessageId[\s\S]*markBuyerTicketQrDelivered\(\{[\s\S]*ticketId:\s*ticket\.ticketId,[\s\S]*deliveredAt:\s*markSentResult\.sentAt/);
  assert.match(ticketsServiceSource, /export async function markBuyerTicketQrDelivered/);
  assert.match(ticketsServiceSource, /deliveredAt:\s*string/);
  assert.match(ticketsServiceSource, /\.rpc\("mark_buyer_ticket_qr_delivered"/);
  assert.doesNotMatch(ticketsServiceSource, /\.is\("buyer_qr_delivered_at",\s*null\)/);
  assert.doesNotMatch(ticketsServiceSource.match(/export async function markBuyerTicketQrDelivered[\s\S]*?^}/m)?.[0] ?? "", /new Date\(/);
  assert.match(ticketDeliverySource, /ticketId:\s*ticket\.ticketId/);
  assert.match(routerSource, /buyerDeliveryTicketId:\s*image\.ticketId/);
  assert.match(zapiWebhookSource, /markBuyerTicketQrDelivered/);
  assert.match(zapiWebhookSource, /outboundMessage\.buyerDeliveryTicketId[\s\S]*markBuyerTicketQrDelivered/);
});

test("migration cria e preenche buyer_qr_delivered_at pelo primeiro QR automatico enviado", () => {
  assert.match(buyerQrDeliveryMigration, /add column if not exists buyer_qr_delivered_at timestamptz/);
  assert.match(buyerQrDeliveryMigration, /tickets_buyer_qr_delivered_at_idx/);
  assert.match(buyerQrDeliveryMigration, /create or replace function public\.mark_buyer_ticket_qr_delivered/);
  assert.match(buyerQrDeliveryMigration, /least\([\s\S]*coalesce\(ticket\.buyer_qr_delivered_at,\s*p_delivered_at\),[\s\S]*p_delivered_at/);
  assert.match(buyerQrDeliveryMigration, /grant execute on function public\.mark_buyer_ticket_qr_delivered\(uuid, timestamptz\) to service_role/);
  assert.match(buyerQrDeliveryMigration, /min\(delivery\.sent_at\) as first_sent_at/);
  assert.match(buyerQrDeliveryMigration, /delivery\.reason = 'paid_ticket_qr_delivery'/);
  assert.match(buyerQrDeliveryMigration, /delivery\.status = 'sent'/);
  assert.match(buyerQrDeliveryMigration, /first_buyer_qr_delivery\.first_sent_at < ticket\.buyer_qr_delivered_at/);
});

test("delivery pago ja marcado como sent reconcilia buyer_qr_delivered_at com sent_at existente", () => {
  assert.match(outboundDeliveriesSource, /const sentAt = new Date\(\)\.toISOString\(\)/);
  assert.match(outboundDeliveriesSource, /\.select\("id, sent_at"\)/);
  assert.match(outboundDeliveriesSource, /return \{ ok: true as const, sentAt: data\.sent_at \?\? sentAt \}/);
  assert.match(ticketDeliverySource, /if \(imageDelivery\.delivery\.status === "sent"\) \{[\s\S]*imageDelivery\.delivery\.sent_at[\s\S]*markBuyerTicketQrDelivered\(\{[\s\S]*deliveredAt:\s*imageDelivery\.delivery\.sent_at/);
});

test("webhook de reenvio usa created_at persistido e nao inventa horario para QR do comprador", () => {
  assert.match(messagesServiceSource, /created_at:\s*string/);
  assert.match(messagesServiceSource, /provider_message_id, created_at, raw_metadata/);
  assert.match(zapiWebhookSource, /outboundResult\.ok[\s\S]*deliveredAt:\s*outboundResult\.message\.created_at/);
  assert.match(zapiWebhookSource, /outbound_message_not_persisted/);
  assert.doesNotMatch(zapiWebhookSource.match(/if \(outboundMessage\.buyerDeliveryTicketId\)[\s\S]*?if \(outboundMessage\.participantDeliveryTicketId\)/)?.[0] ?? "", /new Date\(/);
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

test("Meu ingresso do participante prioriza nome do proprio WhatsApp", () => {
  assert.match(ticketsServiceSource, /function normalizeParticipantHolderName/);
  assert.match(ticketsServiceSource, /async function getParticipantWhatsAppName\(phone: string\)/);
  assert.match(ticketsServiceSource, /\.from\("customers"\)[\s\S]*\.eq\("whatsapp_phone", phone\)/);
  assert.doesNotMatch(
    ticketsServiceSource.match(/export async function listParticipantTicketDeliveriesForPhone[\s\S]*?\.returns<ParticipantTicketDeliveryRow\[\]>\(\);/)?.[0] ?? "",
    /customers\(name\)/,
  );
  assert.match(
    ticketsServiceSource,
    /holderName:\s*participantWhatsAppName\s*\?\?\s*normalizeParticipantHolderName\(delivery\.ticket\.holderName\)\s*\?\?\s*"Participante"/,
  );
});

test("Meu ingresso com 2 ou mais ingressos mostra menu e nao envia QR imediatamente", () => {
  assert.match(routerSource, /function formatParticipantTicketSelectionPrompt/);
  assert.match(routerSource, /\*INGRESSO ROCKBAR\*/);
  assert.match(routerSource, /Qual ingresso voc/);
  assert.match(routerSource, /groupParticipantTicketDeliveries\(deliveries\)/);
  assert.match(routerSource, /`> Digite \$\{index \+ 1\} para/);
  assert.match(routerSource, /`> Digite \$\{groups\.length \+ 1\} para receber todos`/);
  assert.match(routerSource, /participantTickets\.length > 1[\s\S]*reply:\s*formatParticipantTicketSelectionPrompt\(participantTickets\)[\s\S]*nextContext:\s*buildParticipantTicketSelectionContext/);
});

test("REENVIAR INGRESSO lista somente eventos e comandos finais", () => {
  assert.match(routerSource, /function formatPaidTicketResendOptions/);
  assert.match(routerSource, /Escolha o evento que deseja receber novamente seu ingresso/);
  assert.match(routerSource, /formatOptionLine\(\s*group\.option,\s*group\.title/);
  assert.match(routerSource, /Digite \*BACK\* para voltar/);
  assert.match(routerSource, /Para uma nova pesquisa, \*NEW\*/);
  assert.doesNotMatch(routerSource, /Encontrei ingressos emitidos para este telefone/);
  assert.doesNotMatch(routerSource, /group\.ticketsCount === 1/);
});

test("opcao individual envia ingressos do grupo escolhido e todos envia a lista completa", () => {
  assert.match(routerSource, /baseContext\.state !== "participant_ticket_selecting"/);
  assert.match(routerSource, /option === selection\.allOption\s*\? validDeliveries\s*:\s*validDeliveries\.filter/);
  assert.match(routerSource, /const selectedOption = selection\.options\.find/);
  assert.match(routerSource, /selectedOption\?\.ticketIds\.includes\(delivery\.ticket\.ticketId\)/);
});

test("selecao de ingresso agrupa por evento e sessao", () => {
  assert.match(routerSource, /type ParticipantTicketSelectionGroup/);
  assert.match(routerSource, /const groupKey = `\$\{delivery\.ticket\.eventId\}:\$\{delivery\.ticket\.sessionId\}`/);
  assert.match(routerSource, /groupKey: group\.groupKey/);
  assert.match(routerSource, /ticketIds: group\.deliveries\.map/);
  assert.doesNotMatch(conversationStateSource, /ticketId: string;/);
  assert.match(conversationStateSource, /groupKey: string;/);
  assert.match(conversationStateSource, /ticketIds: string\[\];/);
});

test("opcao invalida reapresenta orientacao", () => {
  assert.match(routerSource, /Op.*inv.*lida\. Responda com um n.*mero da lista/);
  assert.match(routerSource, /nextContext:\s*baseContext/);
});

test("shows iguais com sessoes diferentes sao diferenciados", () => {
  assert.match(routerSource, /function formatParticipantTicketSelectionLabel/);
  assert.match(routerSource, /sameTitleCount > 1/);
  assert.match(routerSource, /formatDateTime\(group\.startsAt\)/);
});

test("falha parcial mantem pendente e marca apenas imagens enviadas com sucesso", () => {
  assert.match(routerSource, /deliveryStatus === "awaiting_participant_request"/);
  assert.match(routerSource, /if \(message\.type !== "image"\) return message/);
  assert.match(routerSource, /shouldMarkDelivered[\s\S]*participantDeliveryTicketId:\s*delivery\.ticket\.ticketId/);
  assert.match(zapiWebhookSource, /if \(!sendResult\.ok\)[\s\S]*Participant ticket QR send failed; ticket remains pending for retry/);
  assert.match(zapiWebhookSource, /if \(outboundMessage\.participantDeliveryTicketId\)[\s\S]*markParticipantTicketDelivered/);
  assert.match(ticketsServiceSource, /\.is\("participant_delivered_at",\s*null\)/);
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
  const participantListBlock =
    ticketsServiceSource.match(/export async function listParticipantTicketDeliveriesForPhone[\s\S]*?\.returns<ParticipantTicketDeliveryRow\[\]>\(\);/)?.[0] ?? "";

  assert.match(ticketsServiceSource, /recipient_phone",\s*phone/);
  assert.match(ticketsServiceSource, /participant_delivery_status/);
  assert.match(ticketsServiceSource, /orders!inner\(id,\s*status/);
  assert.doesNotMatch(participantListBlock, /\.maybeSingle</);
  assert.match(ticketsServiceSource, /\.returns<ParticipantTicketDeliveryRow\[\]>\(\)/);
  assert.match(ticketsServiceSource, /sort\(\(left,\s*right\) =>/);
});

test("reenvio de ingressos ja delivered preserva status e data", () => {
  assert.match(routerSource, /deliveryStatus === "awaiting_participant_request"/);
  assert.match(routerSource, /if \(message\.type !== "image"\) return message/);
  assert.match(routerSource, /shouldMarkDelivered[\s\S]*participantDeliveryTicketId:\s*delivery\.ticket\.ticketId/);
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
  assert.doesNotMatch(comboOffersSource, /\.eq\("participant_delivery_status",\s*"delivered"\)/);
  assert.match(comboOffersSource, /recipientPhone[\s\S]*participant_delivery_status !== "delivered"/);
  assert.match(comboOffersSource, /participant_delivered_at/);
  assert.match(comboOffersSource, /getComboOfferRecipientQrDeliveredAt[\s\S]*ticket\.participant_delivered_at/);
  assert.doesNotMatch(comboOffersSource, /\.eq\("participant_delivery_status",\s*"awaiting_participant_request"\)/);
});

test("scheduler coleta comprador e participantes entregues para combo", () => {
  assert.match(comboOffersSource, /export async function sendScheduledComboOffers/);
  assert.match(comboOffersSource, /recipient_phone, participant_delivery_status, buyer_qr_delivered_at, participant_delivered_at/);
  assert.doesNotMatch(comboOffersSource, /\.is\("recipient_phone",\s*null\)/);
  assert.match(comboOffersSource, /upsertCustomerFromWhatsApp/);
  assert.match(comboOffersSource, /const phone = ticket\.offer_phone \?\? recipient\?\.phone/);
});

test("scheduler envia combo para pedido com mesa ou bistro pago", () => {
  assert.match(comboOffersSource, /official_table_map_reservations!inner\(place_code, status\)/);
  assert.match(comboOffersSource, /\.eq\("orders\.status",\s*"paid"\)/);
  assert.match(comboOffersSource, /\.eq\("orders\.official_table_map_reservations\.status",\s*"paid"\)/);
  assert.match(comboOffersSource, /mergeComboOfferCandidateTickets\([\s\S]*eventWindowTickets[\s\S]*recentPurchaseTickets[\s\S]*recentQrDeliveryTickets/);
  assert.match(comboOffersSource, /shouldSendComboOfferNow\([\s\S]*offer,[\s\S]*session\.starts_at,[\s\S]*now,[\s\S]*qrDeliveredAt/);
  assert.match(comboOffersSource, /const shouldSendOnSchedule = shouldSendComboOfferNow/);
  assert.match(comboOffersSource, /const offset = offer\.send_offset_minutes/);
});

test("oferta perdida e recuperada uma unica vez quando janela passou mas evento nao iniciou", () => {
  assert.match(comboOffersSource, /function shouldRecoverMissedComboOffer/);
  assert.match(comboOffersSource, /if \(!Number\.isFinite\(start\) \|\| current >= start\) return false/);
  assert.match(comboOffersSource, /const shouldSendAsRecovery =[\s\S]*!shouldSendOnSchedule[\s\S]*shouldRecoverMissedComboOffer\(offer,\s*session\.starts_at,\s*now,\s*qrDeliveredAt\)/);
  assert.match(comboOffersSource, /if \(!shouldSendOnSchedule && !shouldSendAsRecovery\) \{[\s\S]*skippedCount \+= 1/);
  assert.match(comboOffersSource, /combo_offer_delivery_mode:\s*shouldSendAsRecovery \? "recovery" : "scheduled"/);
  assert.match(comboOffersSource, /combo_offer_recovered:\s*shouldSendAsRecovery/);
});

test("oferta de combo depende exclusivamente de primeira entrega do QR mais delay configurado", () => {
  assert.match(ticketsConfigSource, /DEFAULT_COMBO_OFFER_DELAY_MINUTES = 10/);
  assert.match(ticketsConfigSource, /COMBO_OFFER_DELAY_MINUTES/);
  assert.match(comboOffersSource, /getComboOfferDelayMinutes/);
  assert.match(comboOffersSource, /function hasComboOfferQrDelayElapsed/);
  assert.match(comboOffersSource, /if \(!qrDeliveredAt\) return false/);
  assert.match(comboOffersSource, /deliveredAt \+ delayMinutes \* 60_000 <= now\.getTime\(\)/);
  assert.match(comboOffersSource, /if \(!hasComboOfferQrDelayElapsed\(\{ qrDeliveredAt, now \}\)\) \{[\s\S]*skippedCount \+= 1/);
  assert.match(comboOffersSource, /combo_offer_qr_delivered_at:\s*qrDeliveredAt/);
  assert.match(comboOffersSource, /combo_offer_delay_minutes:\s*getComboOfferDelayMinutes\(\)/);
  assert.doesNotMatch(comboOffersSource, /shouldSendComboOfferNow\([\s\S]*ticket\.issued_at/);
});

test("recuperacao de oferta perdida continua protegida pela deduplicacao antes do envio", () => {
  assert.match(comboOffersSource, /const recipientDedupeKey = buildComboOfferRecipientDedupeKey[\s\S]*const currentSentKeys = await loadSentComboOfferKeys\(\[offerCustomerId\], \[phone\]\)[\s\S]*currentSentKeys\.recipientKeys\.has\(recipientDedupeKey\)[\s\S]*const shouldSendOnSchedule = shouldSendComboOfferNow/);
});

test("oferta de 2 minutos e multiplas prioridades continuam no mecanismo existente", () => {
  assert.match(comboOffersSource, /offer\.send_offset_minutes/);
  assert.match(comboOffersSource, /target = start - offset \* 60_000/);
  assert.match(comboOffersSource, /getComboOfferPriorityForEvent\(offer,\s*session\.event_id\) === purchaseNumber/);
  assert.match(comboOffersSource, /resolveEffectiveComboOffersForEvent/);
});

test("mesma oferta nao duplica para o mesmo comprador", () => {
  assert.match(comboOffersSource, /let offerCustomerId = ticket\.offer_customer_id \?\? ticket\.customer_id/);
  assert.match(comboOffersSource, /buildComboOfferDedupeKey\(\{[\s\S]*customerId:\s*offerCustomerId/);
  assert.match(comboOffersSource, /buildComboOfferRecipientDedupeKey/);
  assert.match(comboOffersSource, /loadSentComboOfferKeys\(\[offerCustomerId\], \[phone\]\)/);
  assert.match(comboOffersSource, /combo_offer_event_locks/);
});

test("deduplicacao fica por telefone evento oferta ticket e tipo de destinatario", () => {
  assert.match(comboOffersSource, /byId\.set\(`\$\{ticket\.offer_source \?\? "buyer"\}:\$\{customerId\}:\$\{ticket\.id\}`, ticket\)/);
  assert.match(comboOffersSource, /return `\$\{phone\}:\$\{eventId\}:\$\{offerId\}:\$\{sourceTicketId\}:\$\{recipientType\}`/);
  assert.match(comboOffersSource, /customerId:\s*offerCustomerId/);
  assert.match(comboOffersSource, /recipient_phone:\s*phone/);
  assert.match(comboOffersSource, /recipient_type:\s*recipientType/);
});

test("multiplos ingressos do mesmo comprador no mesmo pedido nao duplicam oferta", () => {
  assert.match(comboOffersSource, /function uniqueComboOfferCandidateTicketsByOrder/);
  assert.match(comboOffersSource, /const key = `\$\{recipient\.phone\}:\$\{session\.event_id\}`/);
});

test("evento sem oferta nao agenda nada para combo", () => {
  assert.match(comboOffersSource, /listActiveComboOffersForEventSession\(/);
  assert.match(comboOffersSource, /if \(!offers\.length\) \{[\s\S]*skippedCount \+= 1/);
  assert.match(comboOffersSource, /if \(!offer\) \{[\s\S]*skippedCount \+= 1/);
});

test("oferta temporaria do comprador vincula combo ao pedido e ticket origem", () => {
  assert.doesNotMatch(comboOffersSource, /const isParticipantOffer = ticket\.offer_source === "participant"/);
  assert.match(comboOffersSource, /sourceOrderId:\s*order\.id/);
  assert.match(comboOffersSource, /sourceTicketId:\s*ticket\.id/);
  assert.match(comboOffersSource, /offer_recipient_source:\s*recipientType/);
});

test("ofertas de combo incluem comprador e participantes entregues do pedido elegivel", () => {
  assert.match(comboOffersSource, /\.eq\("orders\.official_table_map_reservations\.status",\s*"paid"\)/);
  assert.match(comboOffersSource, /const buyerPhone = normalizeWhatsAppPhone\(ticket\.customers\?\.whatsapp_phone\)/);
  assert.match(comboOffersSource, /const recipientPhone = normalizeWhatsAppPhone\(ticket\.recipient_phone\)/);
  assert.match(comboOffersSource, /participant_delivery_status !== "delivered"/);
});

test("ofertas de combo ignoram pedido sem mesa ou bistro pago", () => {
  assert.match(comboOffersSource, /official_table_map_reservations!inner\(place_code, status\)/);
  assert.match(comboOffersSource, /\.eq\("orders\.official_table_map_reservations\.status",\s*"paid"\)/);
});

test("ofertas de combo consolidam mesmo telefone e permitem telefones diferentes", () => {
  assert.match(comboOffersSource, /normalizeWhatsAppPhone/);
  assert.match(comboOffersSource, /const key = `\$\{recipient\.phone\}:\$\{session\.event_id\}`/);
  assert.match(comboOffersSource, /byRecipient\.set\(key/);
});

test("nova execucao do scheduler nao duplica oferta enviada", () => {
  assert.match(comboOffersSource, /loadSentComboOfferKeys\(\[offerCustomerId\], \[phone\]\)/);
  assert.match(comboOffersSource, /recipientKeys\.has\(recipientDedupeKey\)/);
  assert.match(comboOffersSource, /recipientType === "buyer" && currentSentKeys\.legacyKeys\.has\(dedupeKey\)/);
});

test("cada destinatario pode gerar seu proprio checkout por ticket e oferta", () => {
  assert.match(comboOffersSource, /\.eq\("source_ticket_id", sourceTicketId\)/);
  assert.match(comboOfferTicketUniquenessMigration, /drop index if exists combo_orders_source_order_offer_unique_idx/);
  assert.match(comboOfferTicketUniquenessMigration, /combo_orders_source_ticket_offer_unique_idx/);
  assert.match(comboOfferTicketUniquenessMigration, /on public\.combo_orders\(source_ticket_id, offer_id\)/);
  assert.match(comboOfferTicketUniquenessMigration, /combo_orders_legacy_source_order_offer_unique_idx/);
});

test("falha da zapi em oferta de combo nao fica marcada como envio concluido", () => {
  assert.match(comboOffersSource, /providerMessageId:\s*sendResult\.ok \? sendResult\.providerMessageId : null/);
  assert.match(comboOffersSource, /if \(sendResult\.ok\) \{[\s\S]*sentCount \+= 1;[\s\S]*\} else \{[\s\S]*failedCount \+= 1;/);
});

test("fluxo do comprador permanece inalterado para oferta de combo", () => {
  assert.match(comboOffersSource, /export async function sendScheduledComboOffers/);
  assert.match(comboOffersSource, /reason:\s*"combo_offer"/);
  assert.match(comboOffersSource, /sourceOrderId:\s*order\.id/);
  assert.match(comboOffersSource, /sourceTicketId:\s*ticket\.id/);
  assert.match(comboOffersSource, /\.eq\("orders\.status",\s*"paid"\)/);
});

test("QR vermelho solicita escolha de entrega sem marcar usado", () => {
  assert.match(comboRedemptionsSource, /\*ENTREGA DE BEBIDA\*/);
  assert.match(comboRedemptionsSource, /Digite \*OK\* para receber na sua \$\{input\.placeLabel\}/);
  assert.match(comboRedemptionsSource, /Digite \*1\* para solicitar um garçom/);
  assert.match(comboRedemptionsSource, /delivery_choice_status:\s*"awaiting_customer"/);
  assert.match(comboRedemptionsSource, /reason:\s*"combo_delivery_choice_requested"/);
  assert.match(comboRedemptionsSource, /redemption\.status !== "issued"/);
});

test("respostas OK e 1 revalidam compra e reserva e nao concluem entrega", () => {
  assert.match(conversationStateSource, /"combo_delivery_confirming"/);
  assert.match(conversationStateSource, /comboDeliveryConfirmation\?:/);
  assert.match(routerSource, /handleComboDeliveryConfirmation/);
  assert.match(routerSource, /normalized !== "ok" && normalized !== "1"/);
  assert.match(routerSource, /choice:\s*normalized === "1" \? "waiter" : "table"/);
  assert.match(comboRedemptionsSource, /export async function confirmComboDeliveryChoice/);
  assert.match(comboRedemptionsSource, /\.eq\("customer_id", input\.customerId\)/);
  assert.match(comboRedemptionsSource, /order\.status !== "paid" \|\| redemption\.status !== "issued"/);
  assert.match(comboRedemptionsSource, /\.from\("official_table_map_reservations"\)[\s\S]*\.eq\("status", "paid"\)/);
  assert.match(comboRedemptionsSource, /delivery_choice_status:\s*input\.choice === "waiter" \? "waiter_requested" : "table_requested"/);
});

test("QR vermelho repetido apos OK ou 1 nao reabre entrega nem cria evento operacional", () => {
  const guardIndex = comboRedemptionsSource.indexOf(
    'typeof existingMetadata.delivery_choice_confirmed_at === "string"',
  );
  const awaitingIndex = comboRedemptionsSource.indexOf(
    'delivery_choice_status: "awaiting_customer"',
  );
  const promptStateIndex = comboRedemptionsSource.indexOf(
    'state: "combo_delivery_confirming"',
  );
  const operationalEventIndex = comboRedemptionsSource.indexOf(
    'reason: "delivery_choice_requested"',
  );

  assert.notEqual(guardIndex, -1);
  assert.ok(guardIndex < awaitingIndex);
  assert.ok(guardIndex < promptStateIndex);
  assert.ok(guardIndex < operationalEventIndex);
  assert.match(comboRedemptionsSource, /A forma de entrega desse combo ja foi escolhida/);
  assert.match(comboRedemptionsSource, /Mantenha o QR Code vermelho aberto para apresentar na entrega/);
});
