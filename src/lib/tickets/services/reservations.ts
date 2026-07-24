import "server-only";

import { getEnv } from "@/lib/env";
import { logWarn } from "@/lib/logger";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { getValidatedEventSession } from "@/lib/tickets/services/events";
import { getAvailableSectionForSession } from "@/lib/tickets/services/sections";
import {
  checkReservationRisk,
  recordReservationCancelled,
  recordReservationCreated,
} from "@/lib/tickets/services/buyerRisk";
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
  seatId?: string;
  seatIds?: string[];
  ticketType?: string;
  sourceIdentifier?: string | null;
  skipBuyerRisk?: boolean;
};

export type ReserveUnnumberedSectionInput = {
  customerId: string;
  conversationId: string;
  eventId: string;
  sessionId: string;
  sectionId: string;
  quantity: number;
  ticketType?: string;
  sourceIdentifier?: string | null;
  skipBuyerRisk?: boolean;
};

export type ReserveTicketCartItemInput = {
  sectionId: string;
  ticketPriceId: string;
  quantity: number;
  priceCents: number;
  feeCents: number;
  currency: string;
  seatIds?: string[];
};

export type ReserveTicketCartInput = {
  customerId: string;
  conversationId: string;
  eventId: string;
  sessionId: string;
  items: ReserveTicketCartItemInput[];
  sourceIdentifier?: string | null;
  skipBuyerRisk?: boolean;
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
      reason: "buyer_risk_limited";
      retryAfterMinutes: number;
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
  "active_reservation_exists" | "buyer_risk_limited"
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

type CancelPendingReservationRpcResponse = {
  status?: string;
  released_seats_count?: number;
};

async function createOnDemandUnnumberedSeats({
  sessionId,
  sectionId,
  quantity,
}: {
  sessionId: string;
  sectionId: string;
  quantity: number;
}) {
  const supabase = getSupabaseAdmin();
  const { data: section, error: sectionError } = await supabase
    .from("venue_sections")
    .select("id, venue_id, slug, has_numbered_seats, capacity")
    .eq("id", sectionId)
    .maybeSingle<{
      id: string;
      venue_id: string;
      slug: string;
      has_numbered_seats: boolean;
      capacity: number | null;
    }>();

  if (sectionError) throw sectionError;

  if (!section || section.has_numbered_seats || section.capacity !== null) {
    return;
  }

  const stamp = Date.now().toString(36).toUpperCase();
  const prefix = section.slug.replace(/[^a-z0-9]/gi, "").toUpperCase() || "INGRESSO";
  const { data: seats, error: seatsError } = await supabase
    .from("seats")
    .insert(
      Array.from({ length: quantity }, (_, index) => ({
        venue_id: section.venue_id,
        section_id: section.id,
        row_label: null,
        seat_number: `${stamp}-${index + 1}`,
        seat_code: `${prefix}-${stamp}-${index + 1}`,
        status: "active",
      })),
    )
    .select("id, section_id")
    .returns<Array<{ id: string; section_id: string }>>();

  if (seatsError) throw seatsError;

  const { error: sessionSeatsError } = await supabase
    .from("session_seats")
    .insert(
      (seats ?? []).map((seat) => ({
        session_id: sessionId,
        seat_id: seat.id,
        section_id: seat.section_id,
        status: "available",
      })),
    );

  if (sessionSeatsError) throw sessionSeatsError;
}

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
  sourceIdentifier,
  skipBuyerRisk = false,
}: {
  customerId: string;
  reservationId: string;
  orderId: string;
  sourceIdentifier?: string | null;
  skipBuyerRisk?: boolean;
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
    const { error } = await supabase.rpc("expire_reservations", { p_limit: 500 });

    if (error) {
      return { ok: false, reason: "cancel_failed", error };
    }

    if (!skipBuyerRisk) {
      await recordReservationCancelled({
        customerId,
        reservationId,
        orderId,
        sourceIdentifier,
        status: "expired",
      });
    }

    return { ok: true, status: "expired", releasedSeatsCount: 0 };
  }

  const { data, error } = await supabase.rpc("cancel_pending_reservation", {
    p_reservation_id: reservationId,
    p_customer_id: customerId,
    p_reason: "buyer_cancelled",
  });

  if (error) {
    logWarn("Failed to cancel pending reservation through RPC", {
      reservationId,
      customerId,
      code: error.code,
    });
    return { ok: false, reason: "cancel_failed", error };
  }

  const payload = data as CancelPendingReservationRpcResponse | null;

  if (payload?.status !== "cancelled") {
    return { ok: false, reason: "not_found" };
  }

  if (!skipBuyerRisk) {
    await recordReservationCancelled({
      customerId,
      reservationId,
      orderId,
      sourceIdentifier,
      status: "cancelled",
    });
  }

  return {
    ok: true,
    status: "cancelled",
    releasedSeatsCount: payload.released_seats_count ?? 0,
  };
}

export async function reserveSelectedSeat({
  customerId,
  conversationId,
  eventId,
  sessionId,
  sectionId,
  seatId,
  seatIds,
  ticketType = "full",
  sourceIdentifier,
  skipBuyerRisk = false,
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

  const requestedSeatIds = seatIds?.length ? seatIds : seatId ? [seatId] : [];

  if (!requestedSeatIds.length || requestedSeatIds.length > 10) {
    return { ok: false, reason: "seat_unavailable" };
  }

  const selectedSeats = await Promise.all(
    requestedSeatIds.map((requestedSeatId) =>
      getValidatedSeatForReservation({
        sessionId: selectedSession.sessionId,
        sectionId: selectedSection.sectionId,
        seatId: requestedSeatId,
      }),
    ),
  );

  if (selectedSeats.some((selectedSeat) => !selectedSeat)) {
    return { ok: false, reason: "seat_unavailable" };
  }
  const validSelectedSeats = selectedSeats.filter(
    (selectedSeat): selectedSeat is NonNullable<typeof selectedSeat> =>
      selectedSeat !== null,
  );

  if (!skipBuyerRisk) {
    const risk = await checkReservationRisk({
      customerId,
      eventId,
      sessionId: selectedSession.sessionId,
      sourceIdentifier,
      quantity: validSelectedSeats.length,
    });

    if (!risk.allowed) {
      return {
        ok: false,
        reason: "buyer_risk_limited",
        retryAfterMinutes: risk.retryAfterMinutes,
      };
    }
  }

  const env = getEnv();
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase.rpc("reserve_seats", {
    p_customer_id: customerId,
    p_conversation_id: conversationId,
    p_session_id: selectedSession.sessionId,
    p_seat_ids: validSelectedSeats.map((selectedSeat) => selectedSeat.seatId),
    p_ticket_type: ticketType,
    p_ttl_minutes: env.TICKET_RESERVATION_TTL_MINUTES,
    p_source_identifier: sourceIdentifier ?? null,
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

  const reservation = mapRpcResponse(data as ReserveSeatsRpcResponse);

  if (!skipBuyerRisk) {
    await recordReservationCreated({
      customerId,
      eventId,
      sessionId: selectedSession.sessionId,
      sourceIdentifier,
      reservationId: reservation.reservationId,
      orderId: reservation.orderId,
      quantity: validSelectedSeats.length,
    });
  }

  return {
    ok: true,
    reservation,
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
  sourceIdentifier,
  skipBuyerRisk = false,
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

  let seatList = await listAvailableSeats({
    sessionId: selectedSession.sessionId,
    sectionId: selectedSection.sectionId,
    limit: quantity,
  });

  if (seatList.seats.length < quantity && selectedSection.hasUnlimitedCapacity) {
    await createOnDemandUnnumberedSeats({
      sessionId: selectedSession.sessionId,
      sectionId: selectedSection.sectionId,
      quantity: quantity - seatList.seats.length,
    });

    seatList = await listAvailableSeats({
      sessionId: selectedSession.sessionId,
      sectionId: selectedSection.sectionId,
      limit: quantity,
    });
  }

  if (seatList.seats.length < quantity) {
    return { ok: false, reason: "not_enough_seats" };
  }

  if (!skipBuyerRisk) {
    const risk = await checkReservationRisk({
      customerId,
      eventId,
      sessionId: selectedSession.sessionId,
      sourceIdentifier,
      quantity,
    });

    if (!risk.allowed) {
      return {
        ok: false,
        reason: "buyer_risk_limited",
        retryAfterMinutes: risk.retryAfterMinutes,
      };
    }
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
    p_source_identifier: sourceIdentifier ?? null,
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

  const reservation = mapRpcResponse(data as ReserveSeatsRpcResponse);

  if (!skipBuyerRisk) {
    await recordReservationCreated({
      customerId,
      eventId,
      sessionId: selectedSession.sessionId,
      sourceIdentifier,
      reservationId: reservation.reservationId,
      orderId: reservation.orderId,
      quantity,
    });
  }

  return {
    ok: true,
    reservation,
  };
}

export async function reserveTicketCart({
  customerId,
  conversationId,
  eventId,
  sessionId,
  items,
  sourceIdentifier,
  skipBuyerRisk = false,
}: ReserveTicketCartInput): Promise<ReserveSelectedSeatResult> {
  const activeReservation =
    await findActivePendingReservationForCustomer(customerId);

  if (activeReservation) {
    return {
      ok: false,
      reason: "active_reservation_exists",
      reservation: activeReservation,
    };
  }

  const totalQuantity = items.reduce((total, item) => total + item.quantity, 0);

  if (
    items.length === 0 ||
    !items.every(
      (item) =>
        item.sectionId &&
        item.ticketPriceId &&
        Number.isInteger(item.quantity) &&
        item.quantity > 0 &&
        Number.isInteger(item.priceCents) &&
        item.priceCents >= 0 &&
        Number.isInteger(item.feeCents) &&
        item.feeCents >= 0 &&
        item.currency === "BRL",
    ) ||
    totalQuantity > 10
  ) {
    return { ok: false, reason: "seat_unavailable" };
  }

  const selectedSession = await getValidatedEventSession({ eventId, sessionId });

  if (!selectedSession) {
    return { ok: false, reason: "session_not_available" };
  }

  const itemsBySection = new Map<string, ReserveTicketCartItemInput[]>();

  for (const item of items) {
    const sectionItems = itemsBySection.get(item.sectionId) ?? [];
    sectionItems.push(item);
    itemsBySection.set(item.sectionId, sectionItems);
  }

  const resolvedSections = new Map<
    string,
    NonNullable<Awaited<ReturnType<typeof getAvailableSectionForSession>>>
  >();
  let freeQuantity = 0;

  for (const [sectionId, sectionItems] of itemsBySection) {
    const section = await getAvailableSectionForSession({
      sessionId: selectedSession.sessionId,
      sectionId,
      venueId: selectedSession.venueId,
    });

    if (!section) {
      return { ok: false, reason: "seat_unavailable" };
    }

    for (const item of sectionItems) {
      const ticketPrice = section.ticketTypes.find(
        (candidate) => candidate.ticketPriceId === item.ticketPriceId,
      );

      if (!ticketPrice) {
        return { ok: false, reason: "ticket_price_not_found" };
      }

      if (
        ticketPrice.priceCents !== item.priceCents ||
        ticketPrice.feeCents !== item.feeCents ||
        ticketPrice.currency !== item.currency
      ) {
        return { ok: false, reason: "ticket_price_not_found" };
      }

      if (ticketPrice.priceCents === 0 && ticketPrice.feeCents === 0) {
        freeQuantity += item.quantity;
      }

      if (
        section.hasNumberedSeats &&
        (!item.seatIds || item.seatIds.length !== item.quantity)
      ) {
        return { ok: false, reason: "seat_unavailable" };
      }

      if (!section.hasNumberedSeats && item.seatIds?.length) {
        return { ok: false, reason: "seat_unavailable" };
      }
    }

    resolvedSections.set(sectionId, section);
  }

  if (freeQuantity > 4) {
    return { ok: false, reason: "seat_unavailable" };
  }

  if (!skipBuyerRisk) {
    const risk = await checkReservationRisk({
      customerId,
      eventId,
      sessionId: selectedSession.sessionId,
      sourceIdentifier,
      quantity: totalQuantity,
    });

    if (!risk.allowed) {
      return {
        ok: false,
        reason: "buyer_risk_limited",
        retryAfterMinutes: risk.retryAfterMinutes,
      };
    }
  }

  const rpcItems: Array<{
    seat_id: string;
    ticket_price_id: string;
    expected_price_cents: number;
    expected_fee_cents: number;
    expected_currency: string;
  }> = [];
  const usedSeatIds = new Set<string>();

  for (const [sectionId, sectionItems] of itemsBySection) {
    const section = resolvedSections.get(sectionId);

    if (!section) {
      return { ok: false, reason: "seat_unavailable" };
    }

    if (section.hasNumberedSeats) {
      for (const item of sectionItems) {
        const validatedSeats = await Promise.all(
          (item.seatIds ?? []).map((seatId) =>
            getValidatedSeatForReservation({
              sessionId: selectedSession.sessionId,
              sectionId,
              seatId,
            }),
          ),
        );

        if (validatedSeats.some((seat) => !seat)) {
          return { ok: false, reason: "seat_unavailable" };
        }

        for (const seat of validatedSeats) {
          if (!seat || usedSeatIds.has(seat.seatId)) {
            return { ok: false, reason: "seat_unavailable" };
          }

          usedSeatIds.add(seat.seatId);
          rpcItems.push({
            seat_id: seat.seatId,
            ticket_price_id: item.ticketPriceId,
            expected_price_cents: item.priceCents,
            expected_fee_cents: item.feeCents,
            expected_currency: item.currency,
          });
        }
      }

      continue;
    }

    const sectionQuantity = sectionItems.reduce(
      (total, item) => total + item.quantity,
      0,
    );
    let availableSeats = await listAvailableSeats({
      sessionId: selectedSession.sessionId,
      sectionId,
      limit: sectionQuantity,
    });

    if (
      availableSeats.seats.length < sectionQuantity &&
      section.hasUnlimitedCapacity
    ) {
      await createOnDemandUnnumberedSeats({
        sessionId: selectedSession.sessionId,
        sectionId,
        quantity: sectionQuantity - availableSeats.seats.length,
      });
      availableSeats = await listAvailableSeats({
        sessionId: selectedSession.sessionId,
        sectionId,
        limit: sectionQuantity,
      });
    }

    if (availableSeats.seats.length < sectionQuantity) {
      return { ok: false, reason: "not_enough_seats" };
    }

    let seatIndex = 0;

    for (const item of sectionItems) {
      for (let index = 0; index < item.quantity; index += 1) {
        const seat = availableSeats.seats[seatIndex];
        seatIndex += 1;

        if (!seat || usedSeatIds.has(seat.seatId)) {
          return { ok: false, reason: "seat_unavailable" };
        }

        usedSeatIds.add(seat.seatId);
        rpcItems.push({
          seat_id: seat.seatId,
          ticket_price_id: item.ticketPriceId,
          expected_price_cents: item.priceCents,
          expected_fee_cents: item.feeCents,
          expected_currency: item.currency,
        });
      }
    }
  }

  const env = getEnv();
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase.rpc("reserve_ticket_cart", {
    p_customer_id: customerId,
    p_conversation_id: conversationId,
    p_session_id: selectedSession.sessionId,
    p_items: rpcItems,
    p_ttl_minutes: env.TICKET_RESERVATION_TTL_MINUTES,
  });

  if (error) {
    if (getPostgresErrorMessage(error).includes("active_reservation_exists")) {
      const concurrentReservation =
        await findActivePendingReservationForCustomer(customerId);

      if (concurrentReservation) {
        return {
          ok: false,
          reason: "active_reservation_exists",
          reservation: concurrentReservation,
        };
      }
    }

    return {
      ok: false,
      reason: mapReserveError(error),
      error,
    };
  }

  if (!data || typeof data !== "object") {
    return { ok: false, reason: "reservation_failed" };
  }

  const reservation = mapRpcResponse(data as ReserveSeatsRpcResponse);

  if (!skipBuyerRisk) {
    await recordReservationCreated({
      customerId,
      eventId,
      sessionId: selectedSession.sessionId,
      sourceIdentifier,
      reservationId: reservation.reservationId,
      orderId: reservation.orderId,
      quantity: totalQuantity,
    });
  }

  return {
    ok: true,
    reservation,
  };
}
