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
  assert.match(result.reply, /quantidade de contatos/i);
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

test("Meu ingresso busca por telefone e envia ingressos individualmente", () => {
  assert.match(routerSource, /normalizeWhatsAppPhone\(phone\)/);
  assert.match(routerSource, /listParticipantTicketDeliveriesForPhone\(\s*normalizedPhone/);
  assert.match(routerSource, /participantTickets\.map\(\(participantTicket\)[\s\S]*buildTicketDeliveryPayload\(\[participantTicket\.ticket\]/);
  assert.match(routerSource, /buildPaidTicketResendOutboundMessages\(delivery\)/);
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
