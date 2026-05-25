import { createClient } from "@supabase/supabase-js";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";

const PREFIX = "TEST_CANCEL_PENDING_RESERVATION_REAL";

function parseEnvFile(path) {
  const env = {};
  const raw = readFileSync(path, "utf8");
  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#") || !trimmed.includes("=")) continue;
    const index = trimmed.indexOf("=");
    const key = trimmed.slice(0, index).trim();
    let value = trimmed.slice(index + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    env[key] = value;
  }
  return env;
}

const env = parseEnvFile(".env");
for (const key of ["SUPABASE_URL", "SUPABASE_ANON_KEY", "SUPABASE_SERVICE_ROLE_KEY"]) {
  if (!env[key]) throw new Error(`Missing ${key}`);
}

const service = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});
const anon = createClient(env.SUPABASE_URL, env.SUPABASE_ANON_KEY, {
  auth: { persistSession: false },
});

let authUserId = null;

function assert(condition, label, details) {
  if (!condition) throw new Error(`${label}${details ? `: ${details}` : ""}`);
  console.log(`ok - ${label}`);
}

async function dbInsert(table, payload) {
  const { data, error } = await service.from(table).insert(payload).select("id").single();
  if (error) throw new Error(`insert ${table}: ${error.message}`);
  return data.id;
}

async function dbSelectIds(table, column, values) {
  if (!values.length) return [];
  const { data, error } = await service.from(table).select("id").in(column, values);
  if (error) throw new Error(`select ${table}: ${error.message}`);
  return (data ?? []).map((row) => row.id);
}

async function cleanup() {
  const { data: events } = await service
    .from("events")
    .select("id, venue_id")
    .ilike("title", `${PREFIX}%`);
  const eventIds = (events ?? []).map((event) => event.id);
  const venueIdsFromEvents = (events ?? [])
    .map((event) => event.venue_id)
    .filter(Boolean);

  const { data: venues } = await service
    .from("venues")
    .select("id")
    .ilike("name", `${PREFIX}%`);
  const venueIds = Array.from(
    new Set([...(venues ?? []).map((venue) => venue.id), ...venueIdsFromEvents]),
  );

  const sessionIds = await dbSelectIds("event_sessions", "event_id", eventIds);
  const sectionIds = await dbSelectIds("venue_sections", "venue_id", venueIds);
  const seatIds = await dbSelectIds("seats", "section_id", sectionIds);
  const sessionSeatIds = await dbSelectIds("session_seats", "session_id", sessionIds);
  const { data: reservations } = sessionIds.length
    ? await service.from("reservations").select("id").in("session_id", sessionIds)
    : { data: [] };
  const reservationIds = (reservations ?? []).map((reservation) => reservation.id);
  const orderIds = await dbSelectIds("orders", "reservation_id", reservationIds);
  const ticketIds = await dbSelectIds("tickets", "order_id", orderIds);

  if (ticketIds.length) await service.from("ticket_validation_events").delete().in("ticket_id", ticketIds);
  if (ticketIds.length) await service.from("tickets").delete().in("id", ticketIds);
  if (orderIds.length) await service.from("payments").delete().in("order_id", orderIds);
  if (orderIds.length) await service.from("orders").delete().in("id", orderIds);
  if (reservationIds.length) await service.from("reservation_items").delete().in("reservation_id", reservationIds);
  if (reservationIds.length) await service.from("reservations").delete().in("id", reservationIds);
  if (sessionSeatIds.length) await service.from("session_seats").delete().in("id", sessionSeatIds);
  if (sessionIds.length) await service.from("ticket_prices").delete().in("session_id", sessionIds);
  if (seatIds.length) await service.from("seats").delete().in("id", seatIds);
  if (sectionIds.length) await service.from("venue_sections").delete().in("id", sectionIds);
  if (sessionIds.length) await service.from("event_sessions").delete().in("id", sessionIds);
  if (eventIds.length) await service.from("events").delete().in("id", eventIds);
  if (venueIds.length) await service.from("venues").delete().in("id", venueIds);

  const { data: customers } = await service
    .from("customers")
    .select("id")
    .like("whatsapp_phone", "5599200%");
  const customerIds = (customers ?? []).map((customer) => customer.id);
  const conversationIds = await dbSelectIds("conversations", "customer_id", customerIds);
  if (conversationIds.length) await service.from("whatsapp_messages").delete().in("conversation_id", conversationIds);
  if (conversationIds.length) await service.from("conversations").delete().in("id", conversationIds);
  if (customerIds.length) await service.from("customers").delete().in("id", customerIds);

  if (authUserId) {
    await service.auth.admin.deleteUser(authUserId).catch(() => undefined);
    authUserId = null;
  }
}

async function countRows(table, queryBuilder) {
  const { count, error } = await queryBuilder(
    service.from(table).select("id", { count: "exact", head: true }),
  );
  if (error) throw new Error(`count ${table}: ${error.message}`);
  return count ?? 0;
}

async function verifyCleanup() {
  const [eventCount, venueCount, customerCount] = await Promise.all([
    countRows("events", (query) => query.ilike("title", `${PREFIX}%`)),
    countRows("venues", (query) => query.ilike("name", `${PREFIX}%`)),
    countRows("customers", (query) => query.like("whatsapp_phone", "5599200%")),
  ]);
  assert(eventCount === 0, "cleanup remove eventos temporários", `restaram ${eventCount}`);
  assert(venueCount === 0, "cleanup remove locais temporários", `restaram ${venueCount}`);
  assert(customerCount === 0, "cleanup remove compradores temporários", `restaram ${customerCount}`);
}

async function createCatalog() {
  const venueId = await dbInsert("venues", {
    name: `${PREFIX} Venue`,
    city: "Cidade RPC",
    state: "SP",
    status: "active",
  });
  const sectionId = await dbInsert("venue_sections", {
    venue_id: venueId,
    name: "Assentos",
    slug: `${PREFIX.toLowerCase()}-assentos`,
    has_numbered_seats: true,
    capacity: 10,
    sort_order: 1,
    status: "active",
  });
  const eventId = await dbInsert("events", {
    title: `${PREFIX} Evento`,
    artist_name: `${PREFIX} Artista`,
    city: "Cidade RPC",
    state: "SP",
    venue_id: venueId,
    status: "published",
  });
  const sessionId = await dbInsert("event_sessions", {
    event_id: eventId,
    venue_id: venueId,
    starts_at: "2026-08-08T16:00:00.000Z",
    status: "sales_open",
  });
  await dbInsert("ticket_prices", {
    session_id: sessionId,
    section_id: sectionId,
    ticket_type: "full",
    label: "Inteira",
    price_cents: 1000,
    fee_cents: 0,
    currency: "BRL",
    status: "active",
  });
  return { venueId, sectionId, eventId, sessionId };
}

async function createCustomer(index) {
  const customerId = await dbInsert("customers", {
    whatsapp_phone: `5599200${String(index).padStart(4, "0")}`,
    name: `${PREFIX} Buyer ${index}`,
  });
  const conversationId = await dbInsert("conversations", {
    customer_id: customerId,
    status: "open",
    context: {},
  });
  return { customerId, conversationId };
}

async function createSeatFixture({
  catalog,
  customerId,
  conversationId,
  status = "active",
  orderStatus = "pending_payment",
  sessionSeatStatus = "reserved",
  seatCode,
}) {
  const seatId = await dbInsert("seats", {
    venue_id: catalog.venueId,
    section_id: catalog.sectionId,
    row_label: "A",
    seat_number: seatCode.replace(/\D/g, "") || seatCode,
    seat_code: seatCode,
    status: "active",
  });
  const sessionSeatId = await dbInsert("session_seats", {
    session_id: catalog.sessionId,
    section_id: catalog.sectionId,
    seat_id: seatId,
    status: "available",
  });
  const reservationId = await dbInsert("reservations", {
    customer_id: customerId,
    conversation_id: conversationId,
    session_id: catalog.sessionId,
    status,
    expires_at: new Date(Date.now() + 10 * 60_000).toISOString(),
    total_amount_cents: 1000,
    total_fee_cents: 0,
    currency: "BRL",
  });
  const reservationItemId = await dbInsert("reservation_items", {
    reservation_id: reservationId,
    session_seat_id: sessionSeatId,
    seat_id: seatId,
    section_id: catalog.sectionId,
    seat_code: seatCode,
    ticket_type: "full",
    price_cents: 1000,
    fee_cents: 0,
    currency: "BRL",
  });
  const orderId = await dbInsert("orders", {
    reservation_id: reservationId,
    customer_id: customerId,
    status: orderStatus,
    total_amount_cents: 1000,
    total_fee_cents: 0,
    currency: "BRL",
  });
  await service
    .from("session_seats")
    .update({ status: sessionSeatStatus, current_reservation_id: reservationId })
    .eq("id", sessionSeatId);

  return { seatId, sessionSeatId, reservationId, reservationItemId, orderId };
}

async function loadFixture({ reservationId, orderId, sessionSeatId, ticketId }) {
  const [reservation, order, sessionSeat, ticket] = await Promise.all([
    service.from("reservations").select("status").eq("id", reservationId).single(),
    service.from("orders").select("status").eq("id", orderId).single(),
    service
      .from("session_seats")
      .select("status, current_reservation_id, sold_ticket_id")
      .eq("id", sessionSeatId)
      .single(),
    ticketId
      ? service.from("tickets").select("status").eq("id", ticketId).single()
      : Promise.resolve({ data: null, error: null }),
  ]);

  for (const result of [reservation, order, sessionSeat, ticket]) {
    if (result.error) throw new Error(result.error.message);
  }

  return {
    reservation: reservation.data,
    order: order.data,
    sessionSeat: sessionSeat.data,
    ticket: ticket.data,
  };
}

async function assertPermissions() {
  const args = {
    p_reservation_id: "00000000-0000-0000-0000-000000000000",
    p_customer_id: null,
    p_reason: "permission_check",
  };
  const anonResult = await anon.rpc("cancel_pending_reservation", args);
  assert(Boolean(anonResult.error), "anon não executa RPC");

  const email = `${PREFIX.toLowerCase()}-${Date.now()}@example.com`;
  const password = `A1!${randomUUID()}x`;
  const created = await service.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });
  if (created.error) throw new Error(`create auth user: ${created.error.message}`);
  authUserId = created.data.user.id;

  const authClient = createClient(env.SUPABASE_URL, env.SUPABASE_ANON_KEY, {
    auth: { persistSession: false },
  });
  const signedIn = await authClient.auth.signInWithPassword({ email, password });
  if (signedIn.error) throw new Error(`sign in auth user: ${signedIn.error.message}`);
  const authResult = await authClient.rpc("cancel_pending_reservation", args);
  assert(Boolean(authResult.error), "authenticated não executa RPC");

  const serviceResult = await service.rpc("cancel_pending_reservation", args);
  assert(!serviceResult.error, "service_role executa RPC", serviceResult.error?.message);
}

async function runAudit() {
  await cleanup();
  const catalog = await createCatalog();
  await assertPermissions();

  const activeCustomer = await createCustomer(1);
  const active = await createSeatFixture({
    catalog,
    ...activeCustomer,
    seatCode: "A01",
  });
  const activeResult = await service.rpc("cancel_pending_reservation", {
    p_reservation_id: active.reservationId,
    p_customer_id: activeCustomer.customerId,
    p_reason: "audit_active",
  });
  if (activeResult.error) throw new Error(activeResult.error.message);
  assert(activeResult.data.status === "cancelled", "A RPC cancela reservation active");
  assert(activeResult.data.cancelled_reservations_count === 1, "A retorna 1 reservation cancelada");
  assert(activeResult.data.cancelled_orders_count === 1, "A retorna 1 order cancelada");
  assert(activeResult.data.released_seats_count === 1, "A retorna 1 assento liberado");
  const activeAfter = await loadFixture(active);
  assert(activeAfter.reservation.status === "cancelled", "A reservation vira cancelled");
  assert(activeAfter.order.status === "cancelled", "A order vira cancelled");
  assert(activeAfter.sessionSeat.status === "available", "A session_seat volta para available");
  assert(activeAfter.sessionSeat.current_reservation_id === null, "A current_reservation_id limpo");

  const paidCustomer = await createCustomer(2);
  const paid = await createSeatFixture({
    catalog,
    ...paidCustomer,
    status: "paid",
    orderStatus: "paid",
    sessionSeatStatus: "sold",
    seatCode: "A02",
  });
  await dbInsert("payments", {
    order_id: paid.orderId,
    provider: "mercado_pago",
    provider_payment_id: `${PREFIX}_paid`,
    status: "approved",
    amount_cents: 1000,
    currency: "BRL",
    paid_at: new Date().toISOString(),
    raw_metadata: { audit: true },
  });
  const ticketId = await dbInsert("tickets", {
    order_id: paid.orderId,
    reservation_item_id: paid.reservationItemId,
    customer_id: paidCustomer.customerId,
    session_id: catalog.sessionId,
    seat_id: paid.seatId,
    section_id: catalog.sectionId,
    ticket_code: `${PREFIX}-TICKET-PAID`,
    qr_token_hash: `${PREFIX}-hash-paid`,
    status: "issued",
  });
  await service
    .from("session_seats")
    .update({ status: "sold", current_reservation_id: null, sold_ticket_id: ticketId })
    .eq("id", paid.sessionSeatId);
  const paidResult = await service.rpc("cancel_pending_reservation", {
    p_reservation_id: paid.reservationId,
    p_customer_id: paidCustomer.customerId,
    p_reason: "audit_paid",
  });
  if (paidResult.error) throw new Error(paidResult.error.message);
  assert(paidResult.data.status === "not_cancellable", "B paid não cancela");
  const paidAfter = await loadFixture({ ...paid, ticketId });
  assert(paidAfter.reservation.status === "paid", "B reservation paid preservada");
  assert(paidAfter.order.status === "paid", "B order paid preservada");
  assert(paidAfter.sessionSeat.status === "sold", "B session_seat sold preservado");
  assert(paidAfter.ticket.status === "issued", "B ticket preservado");

  for (const [index, status] of [[3, "expired"], [4, "cancelled"]]) {
    const customer = await createCustomer(index);
    const fixture = await createSeatFixture({
      catalog,
      ...customer,
      status,
      orderStatus: status === "expired" ? "expired" : "cancelled",
      seatCode: `A0${index}`,
    });
    const result = await service.rpc("cancel_pending_reservation", {
      p_reservation_id: fixture.reservationId,
      p_customer_id: customer.customerId,
      p_reason: `audit_${status}`,
    });
    if (result.error) throw new Error(result.error.message);
    assert(result.data.status === "not_cancellable", `C ${status} retorna seguro`);
    const after = await loadFixture(fixture);
    assert(after.reservation.status === status, `C ${status} sem alteração perigosa`);
  }

  const owner = await createCustomer(5);
  const other = await createCustomer(6);
  const owned = await createSeatFixture({ catalog, ...owner, seatCode: "A05" });
  const wrongCustomer = await service.rpc("cancel_pending_reservation", {
    p_reservation_id: owned.reservationId,
    p_customer_id: other.customerId,
    p_reason: "audit_wrong_customer",
  });
  if (wrongCustomer.error) throw new Error(wrongCustomer.error.message);
  assert(wrongCustomer.data.status === "not_found", "D outro customer não cancela");
  const ownedAfter = await loadFixture(owned);
  assert(ownedAfter.reservation.status === "active", "D reservation continua active");
  assert(ownedAfter.sessionSeat.status === "reserved", "D assento continua reserved");

  const concurrentCustomer = await createCustomer(7);
  const concurrent = await createSeatFixture({
    catalog,
    ...concurrentCustomer,
    seatCode: "A06",
  });
  const [first, second] = await Promise.all([
    service.rpc("cancel_pending_reservation", {
      p_reservation_id: concurrent.reservationId,
      p_customer_id: concurrentCustomer.customerId,
      p_reason: "audit_concurrent",
    }),
    service.rpc("cancel_pending_reservation", {
      p_reservation_id: concurrent.reservationId,
      p_customer_id: concurrentCustomer.customerId,
      p_reason: "audit_concurrent",
    }),
  ]);
  if (first.error) throw new Error(first.error.message);
  if (second.error) throw new Error(second.error.message);
  const results = [first.data, second.data];
  assert(results.filter((result) => result.status === "cancelled").length === 1, "E só uma chamada cancela");
  assert(
    results.reduce((sum, result) => sum + (result.released_seats_count ?? 0), 0) === 1,
    "E só uma chamada libera assento",
  );

  await cleanup();
  await verifyCleanup();
}

async function main() {
  try {
    await runAudit();
  } finally {
    await cleanup().catch((error) => {
      console.error("cleanup failed", error);
      process.exitCode = 1;
    });
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
