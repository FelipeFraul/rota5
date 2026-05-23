import "server-only";

import { getEnv } from "@/lib/env";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { getValidatedEventSession } from "@/lib/tickets/services/events";
import { getAvailableSectionForSession } from "@/lib/tickets/services/sections";
import { getValidatedSeatForReservation } from "@/lib/tickets/services/seats";

export type ReserveSelectedSeatInput = {
  customerId: string;
  conversationId: string;
  eventId: string;
  sessionId: string;
  sectionId: string;
  seatId: string;
  ticketType?: string;
};

export type ReserveSelectedSeatSuccess = {
  reservationId: string;
  orderId: string;
  expiresAt: string;
  status: string;
  totalAmountCents: number;
  totalFeeCents: number;
  currency: string;
  items: Array<{
    seat_id: string;
    session_seat_id: string;
    section_id: string;
    seat_code: string;
    ticket_type: string;
    price_cents: number;
    fee_cents: number;
  }>;
};

export type ReserveSelectedSeatResult =
  | {
      ok: true;
      reservation: ReserveSelectedSeatSuccess;
    }
  | {
      ok: false;
      reason:
        | "seat_unavailable"
        | "seat_not_available"
        | "ticket_price_not_found"
        | "session_not_available"
        | "reservation_failed";
      error?: unknown;
    };

type ReserveSelectedSeatFailureReason = Extract<
  ReserveSelectedSeatResult,
  { ok: false }
>["reason"];

type ReserveSeatsRpcResponse = {
  reservation_id: string;
  order_id: string;
  expires_at: string;
  status: string;
  total_amount_cents: number;
  total_fee_cents: number;
  currency: string;
  items?: ReserveSelectedSeatSuccess["items"];
};

function getPostgresErrorMessage(error: unknown) {
  if (error && typeof error === "object" && "message" in error) {
    return String((error as { message?: unknown }).message ?? "");
  }

  return "";
}

function mapReserveError(error: unknown): ReserveSelectedSeatFailureReason {
  const message = getPostgresErrorMessage(error);

  if (message.includes("seat_not_available")) {
    return "seat_not_available";
  }

  if (message.includes("ticket_price_not_found")) {
    return "ticket_price_not_found";
  }

  if (
    message.includes("session_not_available") ||
    message.includes("session_not_found")
  ) {
    return "session_not_available";
  }

  return "reservation_failed";
}

function mapRpcResponse(data: ReserveSeatsRpcResponse): ReserveSelectedSeatSuccess {
  return {
    reservationId: data.reservation_id,
    orderId: data.order_id,
    expiresAt: data.expires_at,
    status: data.status,
    totalAmountCents: data.total_amount_cents,
    totalFeeCents: data.total_fee_cents,
    currency: data.currency,
    items: data.items ?? [],
  };
}

export async function reserveSelectedSeat({
  customerId,
  conversationId,
  eventId,
  sessionId,
  sectionId,
  seatId,
  ticketType = "full",
}: ReserveSelectedSeatInput): Promise<ReserveSelectedSeatResult> {
  const selectedSession = await getValidatedEventSession({ eventId, sessionId });

  if (!selectedSession) {
    return { ok: false, reason: "session_not_available" };
  }

  const selectedSection = await getAvailableSectionForSession({
    sessionId: selectedSession.sessionId,
    sectionId,
    venueId: selectedSession.venueId,
  });

  if (!selectedSection) {
    return { ok: false, reason: "seat_unavailable" };
  }

  const selectedSeat = await getValidatedSeatForReservation({
    sessionId: selectedSession.sessionId,
    sectionId: selectedSection.sectionId,
    seatId,
  });

  if (!selectedSeat) {
    return { ok: false, reason: "seat_unavailable" };
  }

  const env = getEnv();
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase.rpc("reserve_seats", {
    p_customer_id: customerId,
    p_conversation_id: conversationId,
    p_session_id: selectedSession.sessionId,
    p_seat_ids: [selectedSeat.seatId],
    p_ticket_type: ticketType,
    p_ttl_minutes: env.TICKET_RESERVATION_TTL_MINUTES,
  });

  if (error) {
    return {
      ok: false,
      reason: mapReserveError(error),
      error,
    };
  }

  if (!data || typeof data !== "object") {
    return { ok: false, reason: "reservation_failed" };
  }

  return {
    ok: true,
    reservation: mapRpcResponse(data as ReserveSeatsRpcResponse),
  };
}
