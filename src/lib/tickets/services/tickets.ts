import "server-only";

import { createHmac, timingSafeEqual } from "crypto";
import { getEnv } from "@/lib/env";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

type TicketRow = {
  id: string;
  ticket_code: string;
  status: string;
  order_id: string;
  customer_id: string;
  session_id: string;
  section_id: string;
  seat_id: string;
  reservation_items: {
    seat_code: string;
  } | null;
  event_sessions: {
    event_id?: string;
    starts_at: string;
    events: {
      title: string;
      artist_name: string;
      city: string;
      state: string;
      venues: {
        name: string;
        address: string | null;
      } | null;
    } | null;
  } | null;
  venue_sections: {
    name: string;
  } | null;
};

type ParticipantAssignmentTicketRow = TicketRow & {
  recipient_name: string | null;
  recipient_phone: string | null;
  participant_delivery_status: string | null;
};

type OfficialTableMapReservationRow = {
  order_id: string;
  place_code: string;
};

type PaidTicketResendRow = TicketRow & {
  issued_at: string;
  orders: {
    id: string;
    status: string;
    payments:
      | {
          id: string;
          status: string;
          paid_at: string | null;
        }
      | Array<{
          id: string;
          status: string;
          paid_at: string | null;
        }>
      | null;
  } | null;
  customers: {
    whatsapp_phone: string;
  } | null;
};

type ParticipantTicketDeliveryRow = TicketRow & {
  issued_at: string;
  participant_delivery_status: string | null;
  participant_delivered_at: string | null;
  orders: {
    id: string;
    status: string;
    payments:
      | {
          id: string;
          status: string;
          paid_at: string | null;
        }
      | Array<{
          id: string;
          status: string;
          paid_at: string | null;
        }>
      | null;
  } | null;
};

type PublicTicketRow = {
  ticket_code: string;
  event_sessions: {
    starts_at: string;
    events: {
      title: string;
      artist_name: string;
      city: string;
      state: string;
      venues: {
        name: string;
        address: string | null;
      } | null;
    } | null;
  } | null;
  venue_sections: {
    name: string;
  } | null;
  reservation_items: {
    seat_code: string;
  } | null;
};

export type TicketForDelivery = {
  ticketId: string;
  ticketCode: string;
  status: string;
  orderId: string;
  customerId: string;
  eventTitle: string;
  artistName: string;
  city: string;
  state: string;
  venueName: string | null;
  venueAddress: string | null;
  startsAt: string;
  sectionName: string;
  seatCode: string;
  tableMapPlaceCode: string | null;
};

export type PublicTicketView = Pick<
  TicketForDelivery,
  | "ticketCode"
  | "eventTitle"
  | "artistName"
  | "city"
  | "state"
  | "venueName"
  | "venueAddress"
  | "startsAt"
  | "sectionName"
  | "seatCode"
>;

export type PaidTicketResendOption = {
  option: number;
  eventId: string;
  sessionId: string;
  title: string;
  startsAt: string;
  city: string;
  state: string;
  orderIds: string[];
  ticketsCount: number;
};

export type PaidTicketResendGroup = PaidTicketResendOption & {
  tickets: TicketForDelivery[];
};

export type ParticipantTicketDelivery = {
  ticket: TicketForDelivery;
  deliveryStatus: "awaiting_participant_request" | "delivered";
  deliveredAt: string | null;
  issuedAt: string;
};

export type ValidatedParticipantContact = {
  displayName: string | null;
  phone: string;
  rawPhone: string;
};

export type SignedTicketTokenPayload = {
  tid: string;
  code: string;
};

function base64UrlEncode(value: string) {
  return Buffer.from(value, "utf8").toString("base64url");
}

function base64UrlDecode(value: string) {
  return Buffer.from(value, "base64url").toString("utf8");
}

function signPayload(encodedPayload: string) {
  const env = getEnv();

  return createHmac("sha256", env.TICKET_QR_SECRET)
    .update(encodedPayload)
    .digest("base64url");
}

function safeSignatureEquals(left: string, right: string) {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);

  return (
    leftBuffer.length === rightBuffer.length &&
    timingSafeEqual(leftBuffer, rightBuffer)
  );
}

function mapTicketRow(row: TicketRow): TicketForDelivery | null {
  if (!row.event_sessions?.events) {
    return null;
  }

  return {
    ticketId: row.id,
    ticketCode: row.ticket_code,
    status: row.status,
    orderId: row.order_id,
    customerId: row.customer_id,
    eventTitle: row.event_sessions.events.title,
    artistName: row.event_sessions.events.artist_name,
    city: row.event_sessions.events.city,
    state: row.event_sessions.events.state,
    venueName: row.event_sessions.events.venues?.name ?? null,
    venueAddress: row.event_sessions.events.venues?.address ?? null,
    startsAt: row.event_sessions.starts_at,
    sectionName: row.venue_sections?.name ?? "Setor",
    seatCode: row.reservation_items?.seat_code ?? "A confirmar",
    tableMapPlaceCode: null,
  };
}

function firstPayment(row: {
  orders: {
    payments:
      | {
          id: string;
          status: string;
          paid_at: string | null;
        }
      | Array<{
          id: string;
          status: string;
          paid_at: string | null;
        }>
      | null;
  } | null;
}) {
  const payments = row.orders?.payments;

  if (Array.isArray(payments)) {
    return payments[0] ?? null;
  }

  return payments ?? null;
}

function uniqueStrings(values: string[]) {
  return [...new Set(values.filter(Boolean))];
}

function mapPaidTicketRowsToGroups(rows: PaidTicketResendRow[]) {
  const groups = new Map<string, PaidTicketResendGroup>();

  for (const row of rows) {
    if (row.orders?.status !== "paid" || firstPayment(row)?.status !== "approved") {
      continue;
    }

    const ticket = mapTicketRow(row);

    if (!ticket || !row.event_sessions?.events) {
      continue;
    }

    const eventId = row.event_sessions.event_id ?? row.session_id;
    const key = `${eventId}:${row.session_id}`;
    const existing = groups.get(key);

    if (existing) {
      existing.tickets.push(ticket);
      existing.ticketsCount = existing.tickets.length;
      existing.orderIds = uniqueStrings([...existing.orderIds, row.order_id]);
      continue;
    }

    groups.set(key, {
      option: groups.size + 1,
      eventId,
      sessionId: row.session_id,
      title: row.event_sessions.events.title,
      startsAt: row.event_sessions.starts_at,
      city: row.event_sessions.events.city,
      state: row.event_sessions.events.state,
      orderIds: [row.order_id],
      ticketsCount: 1,
      tickets: [ticket],
    });
  }

  return [...groups.values()].map((group, index) => ({
    ...group,
    option: index + 1,
    orderIds: uniqueStrings(group.orderIds),
    tickets: group.tickets.sort((left, right) =>
      left.ticketCode.localeCompare(right.ticketCode),
    ),
    ticketsCount: group.tickets.length,
  }));
}

async function getOfficialTableMapPlaceCodesByOrder(
  orderIds: string[],
): Promise<Map<string, string>> {
  const uniqueOrderIds = uniqueStrings(orderIds);

  if (uniqueOrderIds.length === 0) {
    return new Map();
  }

  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("official_table_map_reservations")
    .select("order_id, place_code")
    .in("order_id", uniqueOrderIds)
    .in("status", ["active", "paid"])
    .returns<OfficialTableMapReservationRow[]>();

  if (error) {
    throw error;
  }

  return new Map((data ?? []).map((row) => [row.order_id, row.place_code]));
}

function attachTableMapPlaceCodes(
  tickets: TicketForDelivery[],
  placeCodesByOrder: Map<string, string>,
) {
  return tickets.map((ticket) => ({
    ...ticket,
    tableMapPlaceCode: placeCodesByOrder.get(ticket.orderId) ?? null,
  }));
}

function mapPublicTicketRow(row: PublicTicketRow): PublicTicketView | null {
  if (!row.event_sessions?.events) {
    return null;
  }

  return {
    ticketCode: row.ticket_code,
    eventTitle: row.event_sessions.events.title,
    artistName: row.event_sessions.events.artist_name,
    city: row.event_sessions.events.city,
    state: row.event_sessions.events.state,
    venueName: row.event_sessions.events.venues?.name ?? null,
    venueAddress: row.event_sessions.events.venues?.address ?? null,
    startsAt: row.event_sessions.starts_at,
    sectionName: row.venue_sections?.name ?? "Setor",
    seatCode: row.reservation_items?.seat_code ?? "A confirmar",
  };
}

export function createSignedTicketToken(ticket: {
  ticketId: string;
  ticketCode: string;
}) {
  const payload: SignedTicketTokenPayload = {
    tid: ticket.ticketId,
    code: ticket.ticketCode,
  };
  const encodedPayload = base64UrlEncode(JSON.stringify(payload));
  const signature = signPayload(encodedPayload);

  return `${encodedPayload}.${signature}`;
}

export function verifySignedTicketToken(
  token: string,
): SignedTicketTokenPayload | null {
  const [encodedPayload, signature, extra] = token.split(".");

  if (!encodedPayload || !signature || extra) {
    return null;
  }

  const expectedSignature = signPayload(encodedPayload);

  if (!safeSignatureEquals(signature, expectedSignature)) {
    return null;
  }

  try {
    const payload = JSON.parse(base64UrlDecode(encodedPayload)) as unknown;

    if (
      !payload ||
      typeof payload !== "object" ||
      typeof (payload as SignedTicketTokenPayload).tid !== "string" ||
      typeof (payload as SignedTicketTokenPayload).code !== "string"
    ) {
      return null;
    }

    return payload as SignedTicketTokenPayload;
  } catch {
    return null;
  }
}

export function createTicketUrl(token: string) {
  const env = getEnv();
  const baseUrl = env.APP_BASE_URL.replace(/\/+$/, "");

  return `${baseUrl}/tickets/${encodeURIComponent(token)}`;
}

export async function getTicketsForOrder(
  orderId: string,
): Promise<TicketForDelivery[]> {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("tickets")
    .select(
      "id, ticket_code, status, order_id, customer_id, session_id, section_id, seat_id, reservation_items!inner(seat_code), event_sessions!inner(starts_at, events!inner(title, artist_name, city, state, venues(name, address))), venue_sections!inner(name)",
    )
    .eq("order_id", orderId)
    .eq("status", "issued")
    .order("ticket_code", { ascending: true })
    .returns<TicketRow[]>();

  if (error) {
    throw error;
  }

  const tickets = (data ?? []).flatMap((row) => {
    const ticket = mapTicketRow(row);

    return ticket ? [ticket] : [];
  });
  const placeCodesByOrder = await getOfficialTableMapPlaceCodesByOrder(
    tickets.map((ticket) => ticket.orderId),
  );

  return attachTableMapPlaceCodes(tickets, placeCodesByOrder);
}

export async function getBuyerReservedTicketsForOrder(
  orderId: string,
): Promise<TicketForDelivery[]> {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("tickets")
    .select(
      "id, ticket_code, status, order_id, customer_id, session_id, section_id, seat_id, recipient_name, recipient_phone, participant_delivery_status, reservation_items!inner(seat_code), event_sessions!inner(starts_at, events!inner(title, artist_name, city, state, venues(name, address))), venue_sections!inner(name)",
    )
    .eq("order_id", orderId)
    .eq("status", "issued")
    .is("recipient_name", null)
    .is("recipient_phone", null)
    .is("participant_delivery_status", null)
    .order("ticket_code", { ascending: true })
    .returns<ParticipantAssignmentTicketRow[]>();

  if (error) {
    throw error;
  }

  const tickets = (data ?? []).flatMap((row) => {
    const ticket = mapTicketRow(row);

    return ticket ? [ticket] : [];
  });
  const placeCodesByOrder = await getOfficialTableMapPlaceCodesByOrder(
    tickets.map((ticket) => ticket.orderId),
  );

  return attachTableMapPlaceCodes(tickets, placeCodesByOrder);
}

export async function assignParticipantContactsToOrderTickets({
  orderId,
  contacts,
}: {
  orderId: string;
  contacts: ValidatedParticipantContact[];
}): Promise<
  | {
      ok: true;
      assignedCount: number;
    }
  | {
      ok: false;
      reason: "tickets_not_found" | "count_mismatch" | "persist_failed";
    }
> {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase.rpc(
    "assign_participant_contacts_to_order_tickets",
    {
      p_order_id: orderId,
      p_contacts: contacts.map((contact) => ({
        displayName: contact.displayName,
        phone: contact.phone,
      })),
    },
  );

  if (error) {
    if (error.message.includes("tickets_not_found")) {
      return { ok: false, reason: "tickets_not_found" };
    }

    if (
      error.message.includes("ticket_contact_count_mismatch") ||
      error.message.includes("contacts_required") ||
      error.message.includes("buyer_reserved_ticket_requires_participants")
    ) {
      return { ok: false, reason: "count_mismatch" };
    }

    return { ok: false, reason: "persist_failed" };
  }

  return {
    ok: true,
    assignedCount:
      data &&
      typeof data === "object" &&
      "assigned_count" in data &&
      typeof data.assigned_count === "number"
        ? data.assigned_count
        : contacts.length,
  };
}

export async function listPaidTicketResendGroupsForPhone(
  phone: string,
): Promise<PaidTicketResendGroup[]> {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("tickets")
    .select(
      "id, ticket_code, status, order_id, customer_id, session_id, section_id, seat_id, issued_at, customers!inner(whatsapp_phone), orders!inner(id, status, payments!inner(id, status, paid_at)), reservation_items!inner(seat_code), event_sessions!inner(event_id, starts_at, events!inner(title, artist_name, city, state, venues(name, address))), venue_sections!inner(name)",
    )
    .eq("customers.whatsapp_phone", phone)
    .eq("status", "issued")
    .eq("orders.status", "paid")
    .eq("orders.payments.status", "approved")
    .order("issued_at", { ascending: false })
    .limit(50)
    .returns<PaidTicketResendRow[]>();

  if (error) {
    throw error;
  }

  const groups = mapPaidTicketRowsToGroups(data ?? []);
  const placeCodesByOrder = await getOfficialTableMapPlaceCodesByOrder(
    groups.flatMap((group) => group.orderIds),
  );

  return groups.map((group) => ({
    ...group,
    tickets: attachTableMapPlaceCodes(group.tickets, placeCodesByOrder),
  }));
}

function mapParticipantTicketDeliveryRow(
  row: ParticipantTicketDeliveryRow,
): ParticipantTicketDelivery | null {
  if (
    row.orders?.status !== "paid" ||
    firstPayment(row)?.status !== "approved" ||
    (
      row.participant_delivery_status !== "awaiting_participant_request" &&
      row.participant_delivery_status !== "delivered"
    )
  ) {
    return null;
  }

  const ticket = mapTicketRow(row);

  if (!ticket) return null;

  return {
    ticket,
    deliveryStatus: row.participant_delivery_status,
    deliveredAt: row.participant_delivered_at,
    issuedAt: row.issued_at,
  };
}

export async function listParticipantTicketDeliveriesForPhone(
  phone: string,
): Promise<ParticipantTicketDelivery[]> {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("tickets")
    .select(
      "id, ticket_code, status, order_id, customer_id, session_id, section_id, seat_id, issued_at, participant_delivery_status, participant_delivered_at, orders!inner(id, status, payments!inner(id, status, paid_at)), reservation_items!inner(seat_code), event_sessions!inner(starts_at, events!inner(title, artist_name, city, state, venues(name, address))), venue_sections!inner(name)",
    )
    .eq("recipient_phone", phone)
    .eq("status", "issued")
    .eq("orders.status", "paid")
    .eq("orders.payments.status", "approved")
    .in("participant_delivery_status", [
      "awaiting_participant_request",
      "delivered",
    ])
    .order("issued_at", { ascending: true })
    .order("ticket_code", { ascending: true })
    .returns<ParticipantTicketDeliveryRow[]>();

  if (error) {
    throw error;
  }

  const deliveries = (data ?? [])
    .map(mapParticipantTicketDeliveryRow)
    .filter((item): item is ParticipantTicketDelivery => Boolean(item))
    .sort((left, right) => {
      const eventDateComparison =
        new Date(left.ticket.startsAt).getTime() -
        new Date(right.ticket.startsAt).getTime();

      if (eventDateComparison !== 0) return eventDateComparison;

      const issuedAtComparison =
        new Date(left.issuedAt).getTime() - new Date(right.issuedAt).getTime();

      if (issuedAtComparison !== 0) return issuedAtComparison;

      return left.ticket.ticketCode.localeCompare(right.ticket.ticketCode);
    });

  if (deliveries.length === 0) return [];

  const placeCodesByOrder = await getOfficialTableMapPlaceCodesByOrder([
    ...new Set(deliveries.map((delivery) => delivery.ticket.orderId)),
  ]);

  return deliveries.map((delivery) => ({
    ...delivery,
    ticket: attachTableMapPlaceCodes([delivery.ticket], placeCodesByOrder)[0],
  }));
}

export async function markParticipantTicketDelivered(ticketId: string) {
  const supabase = getSupabaseAdmin();
  const deliveredAt = new Date().toISOString();
  const { error } = await supabase
    .from("tickets")
    .update({
      participant_delivery_status: "delivered",
      participant_delivered_at: deliveredAt,
    })
    .eq("id", ticketId)
    .eq("status", "issued")
    .eq("participant_delivery_status", "awaiting_participant_request");

  if (error) {
    return { ok: false as const, reason: "persist_failed" as const };
  }

  return { ok: true as const, deliveredAt };
}

export async function getTicketBySignedToken(
  token: string,
): Promise<PublicTicketView | null> {
  const payload = verifySignedTicketToken(token);

  if (!payload) {
    return null;
  }

  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("tickets")
    .select(
      "ticket_code, reservation_items!inner(seat_code), event_sessions!inner(starts_at, events!inner(title, artist_name, city, state, venues(name, address))), venue_sections!inner(name)",
    )
    .eq("id", payload.tid)
    .eq("ticket_code", payload.code)
    .eq("status", "issued")
    .maybeSingle<PublicTicketRow>();

  if (error || !data) {
    return null;
  }

  return mapPublicTicketRow(data);
}
