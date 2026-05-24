import "server-only";

import { getEnv } from "@/lib/env";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { getValidatedEventSession } from "@/lib/tickets/services/events";
import { getAvailableSectionForSession } from "@/lib/tickets/services/sections";
import {
  getValidatedSeatForReservation,
  listAvailableSeats,
} from "@/lib/tickets/services/seats";

export type ReserveSelectedSeatInput = {
  customerId: string;
  conversationId: string;
  eventId: string;
  sessionId: string;
  sectionId: string;
  seatId: string;
  ticketType?: string;
};

export type ReserveUnnumberedSectionInput = {
  customerId: string;
  conversationId: string;
  eventId: string;
  sessionId: string;
  sectionId: string;
  quantity: number;
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

export type ActivePendingReservation = {
  reservationId: string;
  orderId: string;
  expiresAt: string;
  totalAmountCents: number;
  totalFeeCents: number;
  currency: string;
};

export type CancelPendingReservationResult =
  | { ok: true; status: "cancelled" | "expired"; releasedSeatsCount: number }
  | { ok: false; reason: "not_found" | "cancel_failed"; error?: unknown };

export type ReserveSelectedSeatResult =
  | {
      ok: true;
      reservation: ReserveSelectedSeatSuccess;
    }
  | {
      ok: false;
      reason: "active_reservation_exists";
      reservation: ActivePendingReservation;
    }
  | {
      ok: false;
      reason:
        | "seat_unavailable"
        | "seat_not_available"
        | "not_enough_seats"
        | "ticket_price_not_found"
        | "session_not_available"
        | "customer_not_found"
        | "conversation_not_found"
        | "reservation_failed";
      error?: unknown;
    };

type ReserveSelectedSeatFailureReason = Extract<
  ReserveSelectedSeatResult,
  { ok: false }
>["reason"];
type ReserveSeatsRpcFailureReason = Exclude<
  ReserveSelectedSeatFailureReason,
  "active_reservation_exists"
>;

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

type ActivePendingReservationRow = {
  id: string;
  expires_at: string;
  total_amount_cents: number;
  total_fee_cents: number;
  currency: string;
  orders:
    | {
        id: string;
        status: string;
      }
    | {
        id: string;
        status: string;
      }[]
    | null;
};

function getPostgresErrorMessage(error: unknown) {
  if (error && typeof error === "object" && "message" in error) {
    return String((error as { message?: unknown }).message ?? "");
  }

  return "";
}

function mapReserveError(error: unknown): ReserveSeatsRpcFailureReason {
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

  if (message.includes("customer_not_found")) {
    return "customer_not_found";
  }

  if (message.includes("conversation_not_found")) {
    return "conversation_not_found";
  }

  return "reservation_failed";
}

function firstOrder(row: ActivePendingReservationRow) {
  return Array.isArray(row.orders) ? row.orders[0] : row.orders;
}

function mapActivePendingReservation(
  row: ActivePendingReservationRow,
): ActivePendingReservation | null {
  const order = firstOrder(row);

  if (!order?.id || order.status !== "pending_payment") {
    return null;
  }

  return {
    reservationId: row.id,
    orderId: order.id,
    expiresAt: row.expires_at,
    totalAmountCents: row.total_amount_cents,
    totalFeeCents: row.total_fee_cents,
    currency: row.currency,
  };
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

export async function findActivePendingReservationForCustomer(
  customerId: string,
): Promise<ActivePendingReservation | null> {
  const supabase = getSupabaseAdmin();
  const nowIso = new Date().toISOString();
  const { data, error } = await supabase
    .from("reservations")
    .select(
      "id, expires_at, total_amount_cents, total_fee_cents, currency, orders!inner(id, status)",
    )
    .eq("customer_id", customerId)
    .eq("status", "active")
    .gt("expires_at", nowIso)
    .eq("orders.status", "pending_payment")
    .order("expires_at", { ascending: true })
    .limit(1)
    .returns<ActivePendingReservationRow[]>();

  if (error) {
    throw error;
  }

  const row = data?.[0];

  return row ? mapActivePendingReservation(row) : null;
}

export async function cancelPendingReservationForCustomer({
  customerId,
  reservationId,
  orderId,
}: {
  customerId: string;
  reservationId: string;
  orderId: string;
}): Promise<CancelPendingReservationResult> {
  const supabase = getSupabaseAdmin();
  const { data: reservation, error: reservationError } = await supabase
    .from("reservations")
    .select("id, customer_id, status, expires_at")
    .eq("id", reservationId)
    .eq("customer_id", customerId)
    .maybeSingle<{
      id: string;
      customer_id: string;
      status: string;
      expires_at: string;
    }>();

  if (reservationError) {
    return { ok: false, reason: "cancel_failed", error: reservationError };
  }

  if (!reservation || reservation.status !== "active") {
    return { ok: false, reason: "not_found" };
  }

  const { data: order, error: orderError } = await supabase
    .from("orders")
    .select("id, status")
    .eq("id", orderId)
    .eq("reservation_id", reservationId)
    .eq("customer_id", customerId)
    .maybeSingle<{ id: string; status: string }>();

  if (orderError) {
    return { ok: false, reason: "cancel_failed", error: orderError };
  }

  if (!order || !["draft", "pending_payment"].includes(order.status)) {
    return { ok: false, reason: "not_found" };
  }

  if (new Date(reservation.expires_at).getTime() <= Date.now()) {
    const { error } = await supabase.rpc("expire_reservations", { p_limit: 100 });

    if (error) {
      return { ok: false, reason: "cancel_failed", error };
    }

    return { ok: true, status: "expired", releasedSeatsCount: 0 };
  }

  const { data: reservationItems, error: itemsError } = await supabase
    .from("reservation_items")
    .select("session_seat_id")
    .eq("reservation_id", reservationId)
    .returns<Array<{ session_seat_id: string }>>();

  if (itemsError) {
    return { ok: false, reason: "cancel_failed", error: itemsError };
  }

  const sessionSeatIds = (reservationItems ?? []).map(
    (item) => item.session_seat_id,
  );
  let releasedSeatsCount = 0;

  if (sessionSeatIds.length > 0) {
    const { data: releasedSeats, error: releaseError } = await supabase
      .from("session_seats")
      .update({
        status: "available",
        current_reservation_id: null,
      })
      .in("id", sessionSeatIds)
      .eq("status", "reserved")
      .eq("current_reservation_id", reservationId)
      .select("id");

    if (releaseError) {
      return { ok: false, reason: "cancel_failed", error: releaseError };
    }

    releasedSeatsCount = releasedSeats?.length ?? 0;
  }

  const { error: reservationUpdateError } = await supabase
    .from("reservations")
    .update({ status: "cancelled" })
    .eq("id", reservationId)
    .eq("status", "active");

  if (reservationUpdateError) {
    return {
      ok: false,
      reason: "cancel_failed",
      error: reservationUpdateError,
    };
  }

  const { error: orderUpdateError } = await supabase
    .from("orders")
    .update({ status: "cancelled" })
    .eq("id", orderId)
    .in("status", ["draft", "pending_payment"]);

  if (orderUpdateError) {
    return { ok: false, reason: "cancel_failed", error: orderUpdateError };
  }

  return { ok: true, status: "cancelled", releasedSeatsCount };
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
  const activeReservation =
    await findActivePendingReservationForCustomer(customerId);

  if (activeReservation) {
    return {
      ok: false,
      reason: "active_reservation_exists",
      reservation: activeReservation,
    };
  }

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

export async function reserveUnnumberedSectionTickets({
  customerId,
  conversationId,
  eventId,
  sessionId,
  sectionId,
  quantity,
  ticketType = "full",
}: ReserveUnnumberedSectionInput): Promise<ReserveSelectedSeatResult> {
  const activeReservation =
    await findActivePendingReservationForCustomer(customerId);

  if (activeReservation) {
    return {
      ok: false,
      reason: "active_reservation_exists",
      reservation: activeReservation,
    };
  }

  if (!Number.isInteger(quantity) || quantity <= 0) {
    return { ok: false, reason: "seat_unavailable" };
  }

  const selectedSession = await getValidatedEventSession({ eventId, sessionId });

  if (!selectedSession) {
    return { ok: false, reason: "session_not_available" };
  }

  const selectedSection = await getAvailableSectionForSession({
    sessionId: selectedSession.sessionId,
    sectionId,
    venueId: selectedSession.venueId,
  });

  if (!selectedSection || selectedSection.hasNumberedSeats) {
    return { ok: false, reason: "seat_unavailable" };
  }

  const seatList = await listAvailableSeats({
    sessionId: selectedSession.sessionId,
    sectionId: selectedSection.sectionId,
    limit: quantity,
  });

  if (seatList.seats.length < quantity) {
    return { ok: false, reason: "not_enough_seats" };
  }

  const env = getEnv();
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase.rpc("reserve_seats", {
    p_customer_id: customerId,
    p_conversation_id: conversationId,
    p_session_id: selectedSession.sessionId,
    p_seat_ids: seatList.seats.slice(0, quantity).map((seat) => seat.seatId),
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
