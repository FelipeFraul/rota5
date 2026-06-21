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
  };
}

function firstPayment(row: PaidTicketResendRow) {
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

  return (data ?? []).flatMap((row) => {
    const ticket = mapTicketRow(row);

    return ticket ? [ticket] : [];
  });
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

  return mapPaidTicketRowsToGroups(data ?? []);
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
