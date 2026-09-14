import "server-only";

import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { buildWhatsAppPhoneCandidates } from "@/lib/tickets/phones";
import {
  cancelPendingReservationForCustomer,
  type CancelPendingReservationResult,
} from "@/lib/tickets/services/reservations";

type MaybeArray<T> = T | T[] | null | undefined;

type CustomerRow = {
  id: string;
  whatsapp_phone: string;
  name: string | null;
};

type TicketLookupRow = {
  id: string;
  ticket_code: string;
  status: string;
  order_id: string;
  issued_at: string;
  used_at: string | null;
  cancelled_at: string | null;
  customers: MaybeArray<CustomerRow>;
  reservation_items: MaybeArray<{
    seat_code: string;
  }>;
  event_sessions: MaybeArray<{
    starts_at: string;
    venues: MaybeArray<{
      name: string;
    }>;
    events: MaybeArray<{
      title: string;
      artist_name: string;
      city: string;
      state: string;
      venues: MaybeArray<{
        name: string;
      }>;
    }>;
  }>;
  venue_sections: MaybeArray<{
    name: string;
  }>;
};

type OrderRow = {
  id: string;
  status: string;
  created_at: string;
  total_amount_cents: number;
  total_fee_cents: number;
};

type PaymentRow = {
  order_id: string;
  provider: string;
  provider_payment_id: string | null;
  status: string;
  amount_cents: number;
  paid_at: string | null;
  created_at: string;
  raw_metadata: unknown;
};

type PendingReservationRow = {
  id: string;
  customer_id: string;
  expires_at: string;
  total_amount_cents: number;
  total_fee_cents: number;
  currency: string;
  customers: MaybeArray<CustomerRow>;
  orders: MaybeArray<{
    id: string;
    status: string;
  }>;
  reservation_items: MaybeArray<{
    seat_code: string;
    venue_sections: MaybeArray<{
      name: string;
    }>;
  }>;
  event_sessions: MaybeArray<{
    starts_at: string;
    venues: MaybeArray<{
      name: string;
    }>;
    events: MaybeArray<{
      title: string;
      city: string;
      state: string;
      venues: MaybeArray<{
        name: string;
      }>;
    }>;
  }>;
};

type TicketValidationRow = {
  result: string;
  gate_label: string | null;
  validator_identifier: string | null;
  created_at: string;
};

export type AdminTicketLookup = {
  ticketId: string;
  ticketCode: string;
  status: string;
  orderId: string;
  issuedAt: string;
  usedAt: string | null;
  cancelledAt: string | null;
  customerPhone: string | null;
  customerName: string | null;
  eventTitle: string;
  artistName: string | null;
  city: string;
  state: string;
  venueName: string | null;
  startsAt: string;
  sectionName: string;
  seatCode: string;
  orderStatus: string | null;
  orderCreatedAt: string | null;
  totalAmountCents: number | null;
  totalFeeCents: number | null;
  paymentProvider: string | null;
  paymentMethod: string | null;
  paymentStatus: string | null;
  purchasedAt: string | null;
};

export type AdminPendingReservationLookup = {
  reservationId: string;
  orderId: string;
  orderStatus: string;
  customerId: string;
  customerPhone: string | null;
  customerName: string | null;
  eventTitle: string;
  city: string;
  state: string;
  venueName: string | null;
  startsAt: string;
  sectionName: string;
  quantity: number;
  totalAmountCents: number;
  totalFeeCents: number;
  currency: string;
  expiresAt: string;
};

export type AdminTicketValidation = {
  result: string;
  gateLabel: string | null;
  validatorIdentifier: string | null;
  createdAt: string;
};

export type AdminTicketByPhoneResult = {
  customer: CustomerRow | null;
  tickets: AdminTicketLookup[];
  pendingReservations: AdminPendingReservationLookup[];
};

export type AdminCancelPendingReservationResult =
  | {
      ok: true;
      reservation: AdminPendingReservationLookup;
      cancelResult: Extract<CancelPendingReservationResult, { ok: true }>;
    }
  | { ok: false; reason: "not_found" | "cancel_failed"; error?: unknown };

function first<T>(value: MaybeArray<T>): T | null {
  if (Array.isArray(value)) {
    return value[0] ?? null;
  }

  return value ?? null;
}

function mapTicket(row: TicketLookupRow): AdminTicketLookup {
  const customer = first(row.customers);
  const reservationItem = first(row.reservation_items);
  const session = first(row.event_sessions);
  const event = first(session?.events);
  const venue = first(session?.venues) ?? first(event?.venues);
  const section = first(row.venue_sections);

  return {
    ticketId: row.id,
    ticketCode: row.ticket_code,
    status: row.status,
    orderId: row.order_id,
    issuedAt: row.issued_at,
    usedAt: row.used_at,
    cancelledAt: row.cancelled_at,
    customerPhone: customer?.whatsapp_phone ?? null,
    customerName: customer?.name ?? null,
    eventTitle: event?.title ?? "Evento",
    artistName: event?.artist_name ?? null,
    city: event?.city ?? "",
    state: event?.state ?? "",
    venueName: venue?.name ?? null,
    startsAt: session?.starts_at ?? row.issued_at,
    sectionName: section?.name ?? "Setor",
    seatCode: reservationItem?.seat_code ?? "A confirmar",
    orderStatus: null,
    orderCreatedAt: null,
    totalAmountCents: null,
    totalFeeCents: null,
    paymentProvider: null,
    paymentMethod: null,
    paymentStatus: null,
    purchasedAt: null,
  };
}

function mapPendingReservation(
  row: PendingReservationRow,
): AdminPendingReservationLookup | null {
  const order = first(row.orders);

  if (!order?.id) {
    return null;
  }

  const customer = first(row.customers);
  const items = Array.isArray(row.reservation_items)
    ? row.reservation_items
    : row.reservation_items
      ? [row.reservation_items]
      : [];
  const firstItem = items[0] ?? null;
  const section = first(firstItem?.venue_sections);
  const session = first(row.event_sessions);
  const event = first(session?.events);
  const venue = first(session?.venues) ?? first(event?.venues);

  return {
    reservationId: row.id,
    orderId: order.id,
    orderStatus: order.status,
    customerId: row.customer_id,
    customerPhone: customer?.whatsapp_phone ?? null,
    customerName: customer?.name ?? null,
    eventTitle: event?.title ?? "Evento",
    city: event?.city ?? "",
    state: event?.state ?? "",
    venueName: venue?.name ?? null,
    startsAt: session?.starts_at ?? row.expires_at,
    sectionName: section?.name ?? "Setor",
    quantity: items.length,
    totalAmountCents: row.total_amount_cents,
    totalFeeCents: row.total_fee_cents,
    currency: row.currency,
    expiresAt: row.expires_at,
  };
}

function mapValidation(row: TicketValidationRow): AdminTicketValidation {
  return {
    result: row.result,
    gateLabel: row.gate_label,
    validatorIdentifier: row.validator_identifier,
    createdAt: row.created_at,
  };
}

function normalizeTicketCode(code: string) {
  return code.trim().toUpperCase();
}

function uniqueValues(values: string[]) {
  return [...new Set(values.filter(Boolean))];
}

function buildPhoneCandidates(phone: string) {
  return uniqueValues(buildWhatsAppPhoneCandidates(phone));
}

function isUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    value.trim(),
  );
}

async function getCustomerByPhone(phone: string) {
  const candidates = buildPhoneCandidates(phone);
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("customers")
    .select("id, whatsapp_phone, name")
    .in("whatsapp_phone", candidates)
    .returns<CustomerRow[]>();

  if (error) {
    throw error;
  }

  return (
    candidates
      .map((candidate) =>
        (data ?? []).find((customer) => customer.whatsapp_phone === candidate),
      )
      .find((customer): customer is CustomerRow => Boolean(customer)) ?? null
  );
}

function getRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function getString(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function formatPaymentProvider(provider: string | null) {
  if (provider === "mercado_pago") {
    return "Black House";
  }

  return provider;
}

function extractPaymentMethod(metadata: unknown) {
  const root = getRecord(metadata);
  const checkoutAttempt = getRecord(root?.checkout_attempt);
  const checkoutMethod = getString(checkoutAttempt?.method);
  const paymentMethodId = getString(root?.payment_method_id);
  const paymentTypeId = getString(root?.payment_type_id);

  if (checkoutMethod === "pix" || paymentMethodId === "pix") {
    return "Pix";
  }

  if (
    checkoutMethod === "card" ||
    paymentTypeId === "credit_card" ||
    paymentTypeId === "debit_card"
  ) {
    return paymentTypeId === "debit_card" ? "Cartão de débito" : "Cartão de crédito";
  }

  if (paymentTypeId) {
    return paymentTypeId;
  }

  return paymentMethodId;
}

function chooseLatestPayment(payments: PaymentRow[]) {
  const approved = payments.find((payment) => payment.status === "approved");

  return approved ?? payments[0] ?? null;
}

async function enrichTicketsWithOrderPayments(tickets: AdminTicketLookup[]) {
  if (tickets.length === 0) {
    return tickets;
  }

  const orderIds = uniqueValues(tickets.map((ticket) => ticket.orderId));
  const supabase = getSupabaseAdmin();
  const [{ data: orders, error: ordersError }, { data: payments, error: paymentsError }] =
    await Promise.all([
      supabase
        .from("orders")
        .select("id, status, created_at, total_amount_cents, total_fee_cents")
        .in("id", orderIds)
        .returns<OrderRow[]>(),
      supabase
        .from("payments")
        .select(
          "order_id, provider, provider_payment_id, status, amount_cents, paid_at, created_at, raw_metadata",
        )
        .in("order_id", orderIds)
        .order("paid_at", { ascending: false, nullsFirst: false })
        .order("created_at", { ascending: false })
        .returns<PaymentRow[]>(),
    ]);

  if (ordersError) {
    throw ordersError;
  }

  if (paymentsError) {
    throw paymentsError;
  }

  const ordersById = new Map((orders ?? []).map((order) => [order.id, order]));
  const paymentsByOrderId = new Map<string, PaymentRow[]>();

  for (const payment of payments ?? []) {
    const orderPayments = paymentsByOrderId.get(payment.order_id) ?? [];
    orderPayments.push(payment);
    paymentsByOrderId.set(payment.order_id, orderPayments);
  }

  return tickets.map((ticket) => {
    const order = ordersById.get(ticket.orderId) ?? null;
    const payment = chooseLatestPayment(paymentsByOrderId.get(ticket.orderId) ?? []);

    return {
      ...ticket,
      orderStatus: order?.status ?? null,
      orderCreatedAt: order?.created_at ?? null,
      totalAmountCents: order?.total_amount_cents ?? payment?.amount_cents ?? null,
      totalFeeCents: order?.total_fee_cents ?? null,
      paymentProvider: formatPaymentProvider(payment?.provider ?? null),
      paymentMethod: payment ? extractPaymentMethod(payment.raw_metadata) : null,
      paymentStatus: payment?.status ?? null,
      purchasedAt: payment?.paid_at ?? order?.created_at ?? ticket.issuedAt,
    };
  });
}

async function listTicketsByCustomerId(customerId: string) {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("tickets")
    .select(
      "id, ticket_code, status, order_id, issued_at, used_at, cancelled_at, customers(id, whatsapp_phone, name), reservation_items(seat_code), event_sessions(starts_at, venues(name), events(title, artist_name, city, state, venues(name))), venue_sections(name)",
    )
    .eq("customer_id", customerId)
    .order("created_at", { ascending: false })
    .limit(10)
    .returns<TicketLookupRow[]>();

  if (error) {
    throw error;
  }

  return enrichTicketsWithOrderPayments((data ?? []).map(mapTicket));
}

async function listPendingReservationsByCustomerId(customerId: string) {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("reservations")
    .select(
      "id, customer_id, expires_at, total_amount_cents, total_fee_cents, currency, customers(id, whatsapp_phone, name), orders!inner(id, status), reservation_items(seat_code, venue_sections(name)), event_sessions(starts_at, venues(name), events(title, city, state, venues(name)))",
    )
    .eq("customer_id", customerId)
    .eq("status", "active")
    .gt("expires_at", new Date().toISOString())
    .in("orders.status", ["draft", "pending_payment"])
    .order("expires_at", { ascending: true })
    .limit(10)
    .returns<PendingReservationRow[]>();

  if (error) {
    throw error;
  }

  return (data ?? []).flatMap((row) => {
    const reservation = mapPendingReservation(row);

    return reservation ? [reservation] : [];
  });
}

export async function findAdminTicketsByPhone(
  phone: string,
): Promise<AdminTicketByPhoneResult> {
  const customer = await getCustomerByPhone(phone);

  if (!customer) {
    return {
      customer: null,
      tickets: [],
      pendingReservations: [],
    };
  }

  const [tickets, pendingReservations] = await Promise.all([
    listTicketsByCustomerId(customer.id),
    listPendingReservationsByCustomerId(customer.id),
  ]);

  return {
    customer,
    tickets,
    pendingReservations,
  };
}

export async function findAdminPendingReservationsByInput(
  input: string,
): Promise<AdminPendingReservationLookup[]> {
  const trimmedInput = input.trim();
  const phone = trimmedInput.replace(/\D/g, "");

  if (isUuid(trimmedInput)) {
    const reservation =
      (await findPendingReservationByReservationId(trimmedInput)) ??
      (await findPendingReservationByOrderId(trimmedInput));

    return reservation ? [reservation] : [];
  }

  if (phone.length < 10) {
    return [];
  }

  const customer = await getCustomerByPhone(phone);

  return customer ? listPendingReservationsByCustomerId(customer.id) : [];
}

export async function findAdminTicketByCode(
  code: string,
): Promise<AdminTicketLookup | null> {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("tickets")
    .select(
      "id, ticket_code, status, order_id, issued_at, used_at, cancelled_at, customers(id, whatsapp_phone, name), reservation_items(seat_code), event_sessions(starts_at, venues(name), events(title, artist_name, city, state, venues(name))), venue_sections(name)",
    )
    .eq("ticket_code", normalizeTicketCode(code))
    .maybeSingle<TicketLookupRow>();

  if (error) {
    throw error;
  }

  const tickets = data ? await enrichTicketsWithOrderPayments([mapTicket(data)]) : [];

  return tickets[0] ?? null;
}

export async function listAdminTicketValidations(
  ticketId: string,
): Promise<AdminTicketValidation[]> {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("ticket_validation_events")
    .select("result, gate_label, validator_identifier, created_at")
    .eq("ticket_id", ticketId)
    .order("created_at", { ascending: false })
    .limit(5)
    .returns<TicketValidationRow[]>();

  if (error) {
    throw error;
  }

  return (data ?? []).map(mapValidation);
}

async function findPendingReservationByReservationId(reservationId: string) {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("reservations")
    .select(
      "id, customer_id, expires_at, total_amount_cents, total_fee_cents, currency, customers(id, whatsapp_phone, name), orders!inner(id, status), reservation_items(seat_code, venue_sections(name)), event_sessions(starts_at, venues(name), events(title, city, state, venues(name)))",
    )
    .eq("id", reservationId)
    .eq("status", "active")
    .in("orders.status", ["draft", "pending_payment"])
    .maybeSingle<PendingReservationRow>();

  if (error) {
    throw error;
  }

  return data ? mapPendingReservation(data) : null;
}

async function findPendingReservationByOrderId(orderId: string) {
  const supabase = getSupabaseAdmin();
  const { data: order, error } = await supabase
    .from("orders")
    .select("reservation_id")
    .eq("id", orderId)
    .in("status", ["draft", "pending_payment"])
    .maybeSingle<{ reservation_id: string }>();

  if (error) {
    throw error;
  }

  return order?.reservation_id
    ? findPendingReservationByReservationId(order.reservation_id)
    : null;
}

export async function cancelAdminPendingReservation(
  input:
    | string
    | {
        reservationId: string;
        orderId: string;
        customerId: string;
      },
): Promise<AdminCancelPendingReservationResult> {
  try {
    let reservation: AdminPendingReservationLookup | null = null;

    if (typeof input === "string") {
      const reservations = await findAdminPendingReservationsByInput(input);
      reservation = reservations[0] ?? null;
    } else {
      const candidate = await findPendingReservationByReservationId(input.reservationId);

      if (
        candidate &&
        candidate.orderId === input.orderId &&
        candidate.customerId === input.customerId
      ) {
        reservation = candidate;
      }
    }

    if (!reservation) {
      return { ok: false, reason: "not_found" };
    }

    const cancelResult = await cancelPendingReservationForCustomer({
      customerId: reservation.customerId,
      reservationId: reservation.reservationId,
      orderId: reservation.orderId,
      skipBuyerRisk: true,
    });

    if (!cancelResult.ok) {
      return {
        ok: false,
        reason: cancelResult.reason === "not_found" ? "not_found" : "cancel_failed",
        error: cancelResult.error,
      };
    }

    return {
      ok: true,
      reservation,
      cancelResult,
    };
  } catch (error) {
    return { ok: false, reason: "cancel_failed", error };
  }
}
