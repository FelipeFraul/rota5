import { createServer } from "node:http";
import assert from "node:assert/strict";
import { randomUUID, createHash } from "node:crypto";
import { createClient } from "@supabase/supabase-js";

for (const [key, value] of Object.entries({
  APP_BASE_URL: "http://localhost:3000",
  SUPABASE_ANON_KEY: process.env.SUPABASE_ANON_KEY ?? "test-anon",
  ZAPI_INSTANCE_ID: "combo-priority-audit",
  ZAPI_INSTANCE_TOKEN: "combo-priority-audit",
  ZAPI_CLIENT_TOKEN: "combo-priority-audit",
  ZAPI_WEBHOOK_SECRET: "combo-priority-audit",
  CHECKOUT_INTERNAL_SECRET: "combo-priority-audit",
  PAYMENT_PROVIDER: "mercado_pago",
  MERCADO_PAGO_ACCESS_TOKEN: "combo-priority-audit",
  MERCADO_PAGO_WEBHOOK_SECRET: "combo-priority-audit",
  NEXT_PUBLIC_MERCADO_PAGO_PUBLIC_KEY: "combo-priority-audit",
  TICKET_RESERVATION_TTL_MINUTES: "15",
  TICKET_QR_SECRET: "combo-priority-audit-ticket-secret-0001",
  SEAT_MAP_STORAGE_BUCKET: "seat-maps",
  GATE_ADMIN_SECRET: "combo-priority-audit",
  GATE_SESSION_SECRET: "combo-priority-audit-gate-secret-000001",
  GATE_SESSION_TTL_MINUTES: "15",
})) {
  process.env[key] ||= value;
}

if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
  throw new Error("SUPABASE_URL/SUPABASE_SERVICE_ROLE_KEY ausentes.");
}

const db = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

const audit = `TEST_COMBO_PRIORITY_${Date.now()}_${randomUUID().slice(0, 8)}`;
const created = {
  customerId: null,
  conversationId: null,
  venueId: null,
  sectionId: null,
  eventId: null,
  sessionIds: [],
  seatIds: [],
  sessionSeatIds: [],
  priceIds: [],
  reservationIds: [],
  reservationItemIds: [],
  orderIds: [],
  ticketIds: [],
  offerIds: [],
};

let zapiFailuresRemaining = 0;
const zapiRequests = [];
const server = createServer((request, response) => {
  const chunks = [];
  request.on("data", (chunk) => chunks.push(chunk));
  request.on("end", () => {
    zapiRequests.push({
      url: request.url,
      body: Buffer.concat(chunks).toString("utf8"),
    });
    if (zapiFailuresRemaining > 0) {
      zapiFailuresRemaining -= 1;
      response.writeHead(500, { "content-type": "application/json" });
      response.end(JSON.stringify({ ok: false }));
      return;
    }
    response.writeHead(200, { "content-type": "application/json" });
    response.end(JSON.stringify({ messageId: `mock-${zapiRequests.length}` }));
  });
});

function listen(server) {
  return new Promise((resolve) => {
    server.listen(0, "127.0.0.1", () => resolve(server.address()));
  });
}

async function must(label, query) {
  const { data, error } = await query;
  if (error) throw new Error(`${label}: ${error.message}`);
  return data;
}

function sha(value) {
  return createHash("sha256").update(value).digest("hex");
}

async function ensureMigrationAvailable() {
  await must(
    "check combo_offer_scopes display_priority",
    db.from("combo_offer_scopes").select("display_priority").limit(1),
  );
  await must(
    "check combo_orders source_order_id",
    db.from("combo_orders").select("source_order_id").limit(1),
  );
  await must(
    "check combo_offer_event_locks",
    db.from("combo_offer_event_locks").select("customer_id").limit(1),
  );
}

async function insertOne(table, payload, select = "id") {
  return must(
    `insert ${table}`,
    db.from(table).insert(payload).select(select).single(),
  );
}

async function createTicketOrder({
  sessionId,
  sessionSeatId,
  seatId,
  ticketPriceId,
  orderCreatedAt,
  ticketCode,
}) {
  const reservation = await insertOne("reservations", {
    customer_id: created.customerId,
    conversation_id: created.conversationId,
    session_id: sessionId,
    status: "paid",
    expires_at: new Date(Date.now() + 60 * 60_000).toISOString(),
    total_amount_cents: 1000,
    total_fee_cents: 0,
  });
  created.reservationIds.push(reservation.id);

  const item = await insertOne("reservation_items", {
    reservation_id: reservation.id,
    session_seat_id: sessionSeatId,
    seat_id: seatId,
    section_id: created.sectionId,
    ticket_price_id: ticketPriceId,
    seat_code: ticketCode,
    ticket_type: "full",
    price_cents: 1000,
    fee_cents: 0,
  });
  created.reservationItemIds.push(item.id);

  const order = await insertOne("orders", {
    reservation_id: reservation.id,
    customer_id: created.customerId,
    status: "paid",
    total_amount_cents: 1000,
    total_fee_cents: 0,
    created_at: orderCreatedAt,
  });
  created.orderIds.push(order.id);

  const ticket = await insertOne("tickets", {
    order_id: order.id,
    reservation_item_id: item.id,
    customer_id: created.customerId,
    session_id: sessionId,
    seat_id: seatId,
    section_id: created.sectionId,
    ticket_code: ticketCode,
    qr_token_hash: sha(`${audit}:${ticketCode}`),
    status: "issued",
    issued_at: new Date(Date.now() - 4 * 60_000).toISOString(),
  });
  created.ticketIds.push(ticket.id);

  return { order, ticket };
}

async function setupData() {
  created.customerId = (await insertOne("customers", {
    whatsapp_phone: `5599${String(Date.now()).slice(-9)}`,
    name: audit,
  })).id;
  created.conversationId = (await insertOne("conversations", {
    customer_id: created.customerId,
    status: "open",
    context: {},
  })).id;
  created.venueId = (await insertOne("venues", {
    name: audit,
    city: "Sao Paulo",
    state: "SP",
  })).id;
  created.sectionId = (await insertOne("venue_sections", {
    venue_id: created.venueId,
    name: audit,
    slug: audit.toLowerCase().replace(/_/g, "-"),
    capacity: 8,
    has_numbered_seats: true,
  })).id;
  created.eventId = (await insertOne("events", {
    title: audit,
    artist_name: audit,
    city: "Sao Paulo",
    state: "SP",
    venue_id: created.venueId,
    status: "published",
  })).id;

  for (let index = 0; index < 2; index += 1) {
    const session = await insertOne("event_sessions", {
      event_id: created.eventId,
      venue_id: created.venueId,
      starts_at: new Date(Date.now() + 6 * 60 * 60_000 + index * 60_000).toISOString(),
      status: "scheduled",
    });
    created.sessionIds.push(session.id);
    const price = await insertOne("ticket_prices", {
      session_id: session.id,
      section_id: created.sectionId,
      ticket_type: "full",
      label: "Inteira",
      price_cents: 1000,
      fee_cents: 0,
      status: "active",
    });
    created.priceIds.push(price.id);
  }

  for (let index = 0; index < 4; index += 1) {
    const seat = await insertOne("seats", {
      venue_id: created.venueId,
      section_id: created.sectionId,
      seat_number: String(index + 1),
      seat_code: `A${index + 1}`,
    });
    created.seatIds.push(seat.id);
    const sessionId = index === 2 ? created.sessionIds[1] : created.sessionIds[0];
    const sessionSeat = await insertOne("session_seats", {
      session_id: sessionId,
      seat_id: seat.id,
      section_id: created.sectionId,
      status: "sold",
    });
    created.sessionSeatIds.push(sessionSeat.id);
  }

  for (let priority = 1; priority <= 3; priority += 1) {
    const offer = await insertOne("combo_offers", {
      name: `${audit} oferta ${priority}`,
      description: `Oferta ${priority}`,
      price_cents: 100,
      display_priority: priority,
      send_timing_type: "custom",
      send_offset_minutes: 3,
      status: "active",
    });
    created.offerIds.push(offer.id);
    await insertOne("combo_offer_scopes", {
      offer_id: offer.id,
      scope_type: "event",
      event_id: created.eventId,
      display_priority: priority,
    });
  }

  const base = Date.now() - 10 * 60_000;
  const first = await createTicketOrder({
    sessionId: created.sessionIds[0],
    sessionSeatId: created.sessionSeatIds[0],
    seatId: created.seatIds[0],
    ticketPriceId: created.priceIds[0],
    orderCreatedAt: new Date(base).toISOString(),
    ticketCode: `${audit}-T1`,
  });
  const second = await createTicketOrder({
    sessionId: created.sessionIds[0],
    sessionSeatId: created.sessionSeatIds[1],
    seatId: created.seatIds[1],
    ticketPriceId: created.priceIds[0],
    orderCreatedAt: new Date(base + 1).toISOString(),
    ticketCode: `${audit}-T2`,
  });

  return { first, second };
}

async function getOfferMessages() {
  const messages = await must(
    "select offer messages",
    db
      .from("whatsapp_messages")
      .select("raw_metadata")
      .eq("customer_id", created.customerId)
      .eq("direction", "outbound")
      .contains("raw_metadata", { reason: "combo_offer" }),
  );

  const comboOrderIds = [
    ...new Set(
      messages
        .map((row) => row.raw_metadata?.combo_order_id)
        .filter((id) => typeof id === "string"),
    ),
  ];
  const comboOrders = comboOrderIds.length
    ? await must(
        "select message combo orders",
        db
          .from("combo_orders")
          .select("id, source_order_id")
          .in("id", comboOrderIds),
      )
    : [];
  const sourceOrderByComboOrder = new Map(
    comboOrders.map((order) => [order.id, order.source_order_id]),
  );

  return messages.map((row) => ({
    ...row,
    source_order_id:
      sourceOrderByComboOrder.get(row.raw_metadata?.combo_order_id) ?? null,
  }));
}

function summarize(rows) {
  return rows.map((row) => ({
    status: row.raw_metadata?.send_status,
    orderId: row.source_order_id,
    comboOrderId: row.raw_metadata?.combo_order_id,
    offerId: row.raw_metadata?.offer_id,
    priority: row.raw_metadata?.offer_priority,
    purchase: row.raw_metadata?.event_purchase_number,
    eventId: row.raw_metadata?.event_id,
    sessionId: row.raw_metadata?.session_id,
  }));
}

async function cleanup() {
  await db.from("combo_offer_event_locks").delete().eq("event_id", created.eventId);
  await db.from("whatsapp_messages").delete().eq("customer_id", created.customerId);
  await db.from("combo_orders").delete().eq("customer_id", created.customerId);
  if (created.offerIds.length) await db.from("combo_offers").delete().in("id", created.offerIds);
  if (created.ticketIds.length) await db.from("tickets").delete().in("id", created.ticketIds);
  if (created.orderIds.length) await db.from("orders").delete().in("id", created.orderIds);
  if (created.reservationItemIds.length) await db.from("reservation_items").delete().in("id", created.reservationItemIds);
  if (created.reservationIds.length) await db.from("reservations").delete().in("id", created.reservationIds);
  if (created.priceIds.length) await db.from("ticket_prices").delete().in("id", created.priceIds);
  if (created.sessionSeatIds.length) await db.from("session_seats").delete().in("id", created.sessionSeatIds);
  if (created.seatIds.length) await db.from("seats").delete().in("id", created.seatIds);
  if (created.sessionIds.length) await db.from("event_sessions").delete().in("id", created.sessionIds);
  if (created.eventId) await db.from("events").delete().eq("id", created.eventId);
  if (created.sectionId) await db.from("venue_sections").delete().eq("id", created.sectionId);
  if (created.venueId) await db.from("venues").delete().eq("id", created.venueId);
  if (created.conversationId) await db.from("conversations").delete().eq("id", created.conversationId);
  if (created.customerId) await db.from("customers").delete().eq("id", created.customerId);
}

const address = await listen(server);
process.env.ZAPI_BASE_URL = `http://127.0.0.1:${address.port}`;
const { sendScheduledComboOffers, listActiveComboOffersForEventSession } = await import("../src/lib/tickets/services/comboOffers.ts");

try {
  await ensureMigrationAvailable();
  const { first, second } = await setupData();

  zapiFailuresRemaining = 1;
  await Promise.all([
    sendScheduledComboOffers(100),
    sendScheduledComboOffers(100),
  ]);

  let summary = summarize(await getOfferMessages());
  assert.equal(summary.filter((item) => item.status === "failed").length, 1);
  assert.equal(summary.filter((item) => item.status === "sent").length, 1);
  assert.deepEqual(
    summary
      .filter((item) => item.status === "failed")
      .map((item) => [item.orderId, item.priority, item.purchase]),
    [[first.order.id, 1, 1]],
  );
  assert.deepEqual(
    summary
      .filter((item) => item.status === "sent")
      .map((item) => [item.orderId, item.priority, item.purchase]),
    [[second.order.id, 2, 2]],
  );

  await sendScheduledComboOffers(100);
  summary = summarize(await getOfferMessages());
  assert.equal(summary.filter((item) => item.status === "sent" && item.orderId === first.order.id && item.priority === 1).length, 1);
  assert.equal(summary.filter((item) => item.status === "sent" && item.orderId === second.order.id && item.priority === 2).length, 1);
  assert.equal(new Set(summary.filter((item) => item.status === "sent").map((item) => item.comboOrderId)).size, 2);

  const third = await createTicketOrder({
    sessionId: created.sessionIds[1],
    sessionSeatId: created.sessionSeatIds[2],
    seatId: created.seatIds[2],
    ticketPriceId: created.priceIds[1],
    orderCreatedAt: new Date(Date.now() - 2 * 60_000).toISOString(),
    ticketCode: `${audit}-T3`,
  });
  await sendScheduledComboOffers(100);
  summary = summarize(await getOfferMessages());
  assert.equal(summary.filter((item) => item.status === "sent" && item.orderId === third.order.id && item.priority === 3).length, 1);
  assert.equal(summary.filter((item) => item.status === "sent" && item.eventId === created.eventId && item.priority === 1).length, 1);

  const fourth = await createTicketOrder({
    sessionId: created.sessionIds[0],
    sessionSeatId: created.sessionSeatIds[3],
    seatId: created.seatIds[3],
    ticketPriceId: created.priceIds[0],
    orderCreatedAt: new Date(Date.now() - 60_000).toISOString(),
    ticketCode: `${audit}-T4`,
  });
  await sendScheduledComboOffers(100);
  summary = summarize(await getOfferMessages());
  assert.equal(summary.some((item) => item.orderId === fourth.order.id), false);

  const effective = await listActiveComboOffersForEventSession(
    created.eventId,
    new Date(Date.now() + 6 * 60 * 60_000).toISOString(),
  );
  assert.deepEqual(effective.map((offer) => offer.name), [
    `${audit} oferta 1`,
    `${audit} oferta 2`,
    `${audit} oferta 3`,
  ]);

  console.log(JSON.stringify({
    ok: true,
    audit,
    zapiRequests: zapiRequests.length,
    messages: summary,
  }, null, 2));
} finally {
  await cleanup().catch((error) => {
    console.error("cleanup_failed", error);
  });
  await new Promise((resolve) => server.close(resolve));
}
