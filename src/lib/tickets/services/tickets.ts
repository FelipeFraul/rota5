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
    starts_at: string;
    events: {
      title: string;
      artist_name: string;
      city: string;
      state: string;
      venues: {
        name: string;
      } | null;
    } | null;
  } | null;
  venue_sections: {
    name: string;
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
  | "startsAt"
  | "sectionName"
  | "seatCode"
>;

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
    startsAt: row.event_sessions.starts_at,
    sectionName: row.venue_sections?.name ?? "Setor",
    seatCode: row.reservation_items?.seat_code ?? "A confirmar",
  };
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
      "id, ticket_code, status, order_id, customer_id, session_id, section_id, seat_id, reservation_items!inner(seat_code), event_sessions!inner(starts_at, events!inner(title, artist_name, city, state, venues(name))), venue_sections!inner(name)",
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
      "ticket_code, reservation_items!inner(seat_code), event_sessions!inner(starts_at, events!inner(title, artist_name, city, state, venues(name))), venue_sections!inner(name)",
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
