import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  isPublicEventVisible,
  getPublicVisibleSessionStatuses,
  getPublicEventVisibilityExpiresAt,
} from "../src/lib/tickets/services/publicEventVisibility.ts";

const files = {
  events: readFileSync(new URL("../src/lib/tickets/services/events.ts", import.meta.url), "utf8"),
  tickets: readFileSync(new URL("../src/lib/tickets/services/tickets.ts", import.meta.url), "utf8"),
  checkout: readFileSync(new URL("../src/lib/tickets/services/checkout.ts", import.meta.url), "utf8"),
  comboOffers: readFileSync(new URL("../src/lib/tickets/services/comboOffers.ts", import.meta.url), "utf8"),
  comboRedemptions: readFileSync(new URL("../src/lib/tickets/services/comboRedemptions.ts", import.meta.url), "utf8"),
  publicFreeTickets: readFileSync(new URL("../src/lib/tickets/services/publicFreeTickets.ts", import.meta.url), "utf8"),
  adminCourtesies: readFileSync(new URL("../src/lib/tickets/services/adminCourtesies.ts", import.meta.url), "utf8"),
};

test("politica publica expira exatamente as 23h do dia local da sessao", () => {
  const startsAt = "2026-08-15T23:00:00.000Z"; // 20h em America/Sao_Paulo.

  assert.equal(
    isPublicEventVisible({
      startsAt,
      timezone: "America/Sao_Paulo",
      sessionStatus: "sales_open",
      eventStatus: "published",
      purpose: "issued_access",
      now: new Date("2026-08-16T01:59:59.000Z"),
    }),
    true,
  );
  assert.equal(
    isPublicEventVisible({
      startsAt,
      timezone: "America/Sao_Paulo",
      sessionStatus: "sales_open",
      eventStatus: "published",
      purpose: "issued_access",
      now: new Date("2026-08-16T02:00:00.000Z"),
    }),
    false,
  );
  assert.equal(
    getPublicEventVisibilityExpiresAt({
      startsAt,
      timezone: "America/Sao_Paulo",
    })?.toISOString(),
    "2026-08-16T02:00:00.000Z",
  );
});

test("politica publica trata ontem amanha timezone diferente e sessoes multiplas", () => {
  assert.equal(
    isPublicEventVisible({
      startsAt: "2026-08-14T23:00:00.000Z",
      timezone: "America/Sao_Paulo",
      sessionStatus: "sales_open",
      eventStatus: "published",
      purpose: "purchase",
      now: new Date("2026-08-16T01:59:59.000Z"),
    }),
    false,
  );
  assert.equal(
    isPublicEventVisible({
      startsAt: "2026-08-16T23:00:00.000Z",
      timezone: "America/Sao_Paulo",
      sessionStatus: "sales_open",
      eventStatus: "published",
      purpose: "purchase",
      now: new Date("2026-08-16T02:00:00.000Z"),
    }),
    true,
  );
  assert.equal(
    isPublicEventVisible({
      startsAt: "2026-08-15T23:00:00.000Z",
      timezone: "America/New_York",
      sessionStatus: "sales_open",
      eventStatus: "published",
      purpose: "issued_access",
      now: new Date("2026-08-16T02:59:59.000Z"),
    }),
    true,
  );
  assert.equal(
    isPublicEventVisible({
      startsAt: "2026-08-15T23:00:00.000Z",
      timezone: "America/New_York",
      sessionStatus: "sales_open",
      eventStatus: "published",
      purpose: "issued_access",
      now: new Date("2026-08-16T03:00:00.000Z"),
    }),
    false,
  );
  assert.equal(
    isPublicEventVisible({
      startsAt: null,
      sessionStatus: "sales_open",
      eventStatus: "published",
      purpose: "issued_access",
      now: new Date("2026-08-15T20:00:00.000Z"),
    }),
    false,
  );
});

test("politica publica diferencia compra/oferta de acesso a ingresso emitido", () => {
  assert.deepEqual([...getPublicVisibleSessionStatuses("purchase")], ["scheduled", "sales_open"]);
  assert.deepEqual([...getPublicVisibleSessionStatuses("offer")], ["scheduled", "sales_open"]);
  assert.deepEqual([...getPublicVisibleSessionStatuses("issued_access")], [
    "scheduled",
    "sales_open",
    "sales_closed",
  ]);

  assert.equal(
    isPublicEventVisible({
      startsAt: "2026-08-16T20:00:00.000Z",
      sessionStatus: "sales_closed",
      eventStatus: "published",
      purpose: "purchase",
      now: new Date("2026-08-15T20:00:00.000Z"),
    }),
    false,
  );
  assert.equal(
    isPublicEventVisible({
      startsAt: "2026-08-16T20:00:00.000Z",
      sessionStatus: "sales_closed",
      eventStatus: "published",
      purpose: "issued_access",
      now: new Date("2026-08-15T20:00:00.000Z"),
    }),
    true,
  );
});

test("fluxos publicos criticos importam a politica central", () => {
  for (const [name, source] of Object.entries(files)) {
    assert.match(
      source,
      /services\/publicEventVisibility/,
      `${name} deve depender da politica central de visibilidade publica`,
    );
  }
});

test("servico de tickets protege reenvio, participante, entrega e token assinado", () => {
  assert.match(files.tickets, /function mapTicketRow[\s\S]*isPublicEventVisible/);
  assert.match(files.tickets, /function mapPublicTicketRow[\s\S]*isPublicEventVisible/);
  assert.match(files.tickets, /listPaidTicketResendGroupsForPhone[\s\S]*getPublicEventVisibilityQueryFloorIso/);
  assert.match(files.tickets, /listParticipantTicketDeliveriesForPhone[\s\S]*getPublicEventVisibilityQueryFloorIso/);
  assert.match(files.tickets, /getTicketBySignedToken[\s\S]*getPublicEventVisibilityQueryFloorIso/);
  assert.match(files.tickets, /getTicketsForOrder[\s\S]*getPublicEventVisibilityQueryFloorIso/);
  assert.match(files.tickets, /event_sessions!inner\(starts_at, timezone, status/);
});

test("ingresso gratuito publico bloqueia reserva encerrada antes da emissao", () => {
  assert.match(files.publicFreeTickets, /validatePublicFreeReservationVisibility[\s\S]*isPublicEventVisible/);
  assert.match(files.publicFreeTickets, /validatePublicFreeReservationVisibility[\s\S]*issue_public_free_ticket_order/);
});

test("checkouts e combos bloqueiam sessao encerrada pela politica central", () => {
  assert.match(files.checkout, /getPublicVisibleCheckoutSession[\s\S]*isPublicEventVisible/);
  assert.match(files.checkout, /event_sessions[\s\S]*starts_at, timezone, status/);
  assert.match(files.comboOffers, /loadOfferForSession[\s\S]*isPublicEventVisible/);
  assert.match(files.comboOffers, /getPublicComboCheckoutOrder[\s\S]*isPublicEventVisible/);
  assert.match(files.comboOffers, /deliverComboOrder[\s\S]*isPublicEventVisible/);
  assert.match(files.comboOffers, /sendScheduledComboOffers[\s\S]*isPublicEventVisible/);
  assert.match(files.comboOffers, /getPublicEventVisibilityQueryFloorIso/);
  assert.match(files.comboRedemptions, /releaseComboOrdersForKitchenAfterGateEntry[\s\S]*isPublicEventVisible/);
  assert.match(files.comboRedemptions, /startKitchenOrderPreparation[\s\S]*isPublicEventVisible/);
});

test("cortesias publicas por telefone passam pela politica central", () => {
  assert.match(files.adminCourtesies, /getCourtesyTicketsByPhone[\s\S]*isPublicEventVisible/);
});
