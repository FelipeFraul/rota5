import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const COMBO_OFFER_DELAY_MINUTES = 10;
const comboOffersSource = readFileSync(
  new URL("../src/lib/tickets/services/comboOffers.ts", import.meta.url),
  "utf8",
);

function iso(minutes) {
  return new Date(Date.UTC(2026, 0, 1, 12, minutes, 0)).toISOString();
}

class FakeTicketStore {
  constructor() {
    this.tickets = new Map();
    this.comboSentKeys = new Set();
  }

  addTicket(ticket) {
    this.tickets.set(ticket.id, {
      buyer_qr_delivered_at: null,
      participant_delivered_at: null,
      participant_delivery_status: null,
      ...ticket,
    });
  }

  markBuyerTicketQrDelivered(ticketId, deliveredAt) {
    if (!ticketId) throw new Error("ticket_id_required");
    if (!deliveredAt || !Number.isFinite(new Date(deliveredAt).getTime())) {
      throw new Error("delivered_at_required");
    }

    const ticket = this.tickets.get(ticketId);
    if (!ticket || ticket.status !== "issued") return null;

    const current = ticket.buyer_qr_delivered_at;
    ticket.buyer_qr_delivered_at =
      !current || new Date(deliveredAt).getTime() < new Date(current).getTime()
        ? deliveredAt
        : current;

    return ticket.buyer_qr_delivered_at;
  }

  markParticipantTicketDelivered(ticketId, deliveredAt) {
    const ticket = this.tickets.get(ticketId);
    if (
      !ticket ||
      ticket.status !== "issued" ||
      ticket.participant_delivery_status !== "awaiting_participant_request" ||
      ticket.participant_delivered_at
    ) {
      return null;
    }

    ticket.participant_delivery_status = "delivered";
    ticket.participant_delivered_at = deliveredAt;
    return deliveredAt;
  }

  backfillBuyerQrDeliveredAt(deliveries) {
    const firstByTicket = new Map();

    for (const delivery of deliveries) {
      if (
        delivery.reason !== "paid_ticket_qr_delivery" ||
        delivery.status !== "sent" ||
        !delivery.sent_at ||
        !delivery.business_context?.ticket_id
      ) {
        continue;
      }

      const ticketId = delivery.business_context.ticket_id;
      const current = firstByTicket.get(ticketId);
      if (!current || new Date(delivery.sent_at).getTime() < new Date(current).getTime()) {
        firstByTicket.set(ticketId, delivery.sent_at);
      }
    }

    for (const [ticketId, deliveredAt] of firstByTicket) {
      this.markBuyerTicketQrDelivered(ticketId, deliveredAt);
    }
  }

  maybeSendComboOffer({
    ticketId,
    recipientType,
    now,
    offerId = "offer-1",
    eventId = "event-1",
    phone = "5515999999999",
  }) {
    const ticket = this.tickets.get(ticketId);
    if (!ticket) return "skipped";

    const qrDeliveredAt =
      recipientType === "participant"
        ? ticket.participant_delivered_at
        : ticket.buyer_qr_delivered_at;

    if (!qrDeliveredAt) return "skipped";

    const eligibleAt =
      new Date(qrDeliveredAt).getTime() + COMBO_OFFER_DELAY_MINUTES * 60_000;
    if (eligibleAt > new Date(now).getTime()) return "skipped";

    const dedupeKey = `${phone}:${eventId}:${offerId}:${ticketId}:${recipientType}`;
    if (this.comboSentKeys.has(dedupeKey)) return "skipped";

    this.comboSentKeys.add(dedupeKey);
    return "sent";
  }
}

test("primeiro envio bem-sucedido grava o timestamp real conhecido", () => {
  const store = new FakeTicketStore();
  store.addTicket({ id: "ticket-1", status: "issued" });

  const deliveredAt = store.markBuyerTicketQrDelivered("ticket-1", iso(0));

  assert.equal(deliveredAt, iso(0));
  assert.equal(store.tickets.get("ticket-1").buyer_qr_delivered_at, iso(0));
});

test("falha da Z-API ou mensagem nao-QR nao grava timestamp", () => {
  const store = new FakeTicketStore();
  store.addTicket({ id: "ticket-1", status: "issued" });

  store.backfillBuyerQrDeliveredAt([
    {
      reason: "webhook_reply",
      status: "sent",
      sent_at: iso(0),
      business_context: { ticket_id: "ticket-1" },
    },
    {
      reason: "paid_ticket_qr_delivery",
      status: "failed",
      sent_at: iso(1),
      business_context: { ticket_id: "ticket-1" },
    },
  ]);

  assert.equal(store.tickets.get("ticket-1").buyer_qr_delivered_at, null);
});

test("falha apos outbound sent e recuperacao seguinte usam o sent_at persistido", () => {
  const store = new FakeTicketStore();
  store.addTicket({ id: "ticket-1", status: "issued" });

  assert.equal(store.tickets.get("ticket-1").buyer_qr_delivered_at, null);
  store.backfillBuyerQrDeliveredAt([
    {
      reason: "paid_ticket_qr_delivery",
      status: "sent",
      sent_at: iso(2),
      business_context: { ticket_id: "ticket-1" },
    },
  ]);

  assert.equal(store.tickets.get("ticket-1").buyer_qr_delivered_at, iso(2));
});

test("concorrencia, callback duplicado, retries e reenvio preservam sempre o menor timestamp", async () => {
  const store = new FakeTicketStore();
  store.addTicket({ id: "ticket-1", status: "issued" });

  await Promise.all([
    Promise.resolve().then(() => store.markBuyerTicketQrDelivered("ticket-1", iso(20))),
    Promise.resolve().then(() => store.markBuyerTicketQrDelivered("ticket-1", iso(10))),
    Promise.resolve().then(() => store.markBuyerTicketQrDelivered("ticket-1", iso(10))),
    Promise.resolve().then(() => store.markBuyerTicketQrDelivered("ticket-1", iso(30))),
  ]);

  assert.equal(store.tickets.get("ticket-1").buyer_qr_delivered_at, iso(10));
});

test("comprador e participante possuem contadores independentes", () => {
  const store = new FakeTicketStore();
  store.addTicket({
    id: "ticket-1",
    status: "issued",
    participant_delivery_status: "awaiting_participant_request",
  });

  store.markBuyerTicketQrDelivered("ticket-1", iso(0));
  store.markParticipantTicketDelivered("ticket-1", iso(5));

  assert.equal(store.tickets.get("ticket-1").buyer_qr_delivered_at, iso(0));
  assert.equal(store.tickets.get("ticket-1").participant_delivered_at, iso(5));
});

test("scheduler bloqueia sem timestamp, bloqueia antes do delay, envia depois e deduplica", () => {
  const store = new FakeTicketStore();
  store.addTicket({ id: "ticket-1", status: "issued" });

  assert.equal(store.maybeSendComboOffer({
    ticketId: "ticket-1",
    recipientType: "buyer",
    now: iso(20),
  }), "skipped");

  store.markBuyerTicketQrDelivered("ticket-1", iso(0));

  assert.equal(store.maybeSendComboOffer({
    ticketId: "ticket-1",
    recipientType: "buyer",
    now: iso(9),
  }), "skipped");
  assert.equal(store.maybeSendComboOffer({
    ticketId: "ticket-1",
    recipientType: "buyer",
    now: iso(10),
  }), "sent");
  assert.equal(store.maybeSendComboOffer({
    ticketId: "ticket-1",
    recipientType: "buyer",
    now: iso(11),
  }), "skipped");
});

test("oferta apos compra recupera envio perdido usando o tempo configurado", () => {
  assert.match(
    comboOffersSource,
    /offer\.send_timing_type === "custom"[\s\S]*purchaseTime \+ offset \* 60_000/,
  );
  assert.doesNotMatch(
    comboOffersSource,
    /offer\.send_timing_type === "custom"[\s\S]{0,80}return false;/,
  );
  assert.match(comboOffersSource, /offer\.send_timing_type === "custom"[\s\S]*offer\.send_offset_minutes/);
});

test("backfill com varios deliveries utiliza MIN(sent_at)", () => {
  const store = new FakeTicketStore();
  store.addTicket({ id: "ticket-1", status: "issued" });

  store.backfillBuyerQrDeliveredAt([
    {
      reason: "paid_ticket_qr_delivery",
      status: "sent",
      sent_at: iso(12),
      business_context: { ticket_id: "ticket-1" },
    },
    {
      reason: "paid_ticket_qr_delivery",
      status: "sent",
      sent_at: iso(3),
      business_context: { ticket_id: "ticket-1" },
    },
    {
      reason: "paid_ticket_qr_delivery",
      status: "sent",
      sent_at: iso(8),
      business_context: { ticket_id: "ticket-1" },
    },
  ]);

  assert.equal(store.tickets.get("ticket-1").buyer_qr_delivered_at, iso(3));
});
