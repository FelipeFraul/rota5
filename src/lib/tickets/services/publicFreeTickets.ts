import "server-only";

import { logError } from "@/lib/logger";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { buildTicketDeliveryPayload } from "@/lib/tickets/services/ticketDelivery";
import { getTicketsForOrder } from "@/lib/tickets/services/tickets";
import { isPublicEventVisible } from "@/lib/tickets/services/publicEventVisibility";

export type IssuePublicFreeTicketsResult =
  | {
      ok: true;
      orderId: string;
      reservationId: string;
      ticketsCount: number;
      delivery: {
        message: string;
        qrImages: Array<{
          ticketId: string;
          imageUrl: string;
          caption: string;
        }>;
      };
    }
  | {
      ok: false;
      reason:
        | "order_not_found"
        | "order_not_payable"
        | "reservation_not_found"
        | "reservation_not_payable"
        | "reservation_expired"
        | "customer_not_found"
        | "reservation_items_not_found"
        | "free_order_must_be_zero_value"
        | "zero_value_items_required"
        | "free_ticket_limit_exceeded"
        | "reserved_seat_not_available"
        | "tickets_not_found"
        | "issue_failed";
      error?: unknown;
    };

type IssuePublicFreeOrderRpcResponse = {
  order_id?: string;
  reservation_id?: string;
  status?: string;
  tickets_count?: number;
};

type ReservationEventRow = {
  id: string;
  event_sessions:
    | {
        event_id: string;
        starts_at: string;
        timezone?: string | null;
        status: string;
        events: { status: string } | null;
      }
    | null;
};

type FreeReservationItemRow = {
  section_id: string;
  ticket_type: string;
  price_cents: number;
  fee_cents: number;
};

type CourtesySectionLimitRow = {
  section_id: string;
  max_courtesies: number;
  status: string;
};

function getPostgresErrorMessage(error: unknown) {
  if (error && typeof error === "object" && "message" in error) {
    return String((error as { message?: unknown }).message ?? "");
  }

  return "";
}

function mapIssueError(
  error: unknown,
): Extract<IssuePublicFreeTicketsResult, { ok: false }>["reason"] {
  const message = getPostgresErrorMessage(error);

  if (message.includes("order_not_found")) return "order_not_found";
  if (message.includes("order_not_payable")) return "order_not_payable";
  if (message.includes("reservation_not_found")) return "reservation_not_found";
  if (message.includes("reservation_not_payable")) return "reservation_not_payable";
  if (message.includes("reservation_expired")) return "reservation_expired";
  if (message.includes("customer_not_found")) return "customer_not_found";
  if (message.includes("reservation_items_not_found")) {
    return "reservation_items_not_found";
  }
  if (message.includes("free_order_must_be_zero_value")) {
    return "free_order_must_be_zero_value";
  }
  if (message.includes("zero_value_items_required")) {
    return "zero_value_items_required";
  }
  if (message.includes("free_ticket_limit_exceeded")) {
    return "free_ticket_limit_exceeded";
  }
  if (message.includes("reserved_seat_not_available")) {
    return "reserved_seat_not_available";
  }

  return "issue_failed";
}

async function countIssuedFreeTicketsForSection({
  eventId,
  sectionId,
}: {
  eventId: string;
  sectionId: string;
}) {
  const supabase = getSupabaseAdmin();
  const { count, error } = await supabase
    .from("tickets")
    .select(
      "id, event_sessions!inner(event_id), orders!inner(status), reservation_items!inner(ticket_type)",
      { count: "exact", head: true },
    )
    .eq("event_sessions.event_id", eventId)
    .eq("section_id", sectionId)
    .neq("status", "cancelled")
    .eq("orders.status", "paid")
    .eq("reservation_items.ticket_type", "free");

  if (error) throw error;
  return count ?? 0;
}

async function validatePublicCourtesyLimits(reservationId: string) {
  const supabase = getSupabaseAdmin();
  const { data: reservation, error: reservationError } = await supabase
    .from("reservations")
    .select("id, event_sessions!inner(event_id)")
    .eq("id", reservationId)
    .maybeSingle<ReservationEventRow>();

  if (reservationError) throw reservationError;

  const eventId = reservation?.event_sessions?.event_id;
  if (!eventId) return false;

  const { data: items, error: itemsError } = await supabase
    .from("reservation_items")
    .select("section_id, ticket_type, price_cents, fee_cents")
    .eq("reservation_id", reservationId)
    .returns<FreeReservationItemRow[]>();

  if (itemsError) throw itemsError;

  const freeQuantityBySection = new Map<string, number>();

  for (const item of items ?? []) {
    if (item.ticket_type !== "free" && (item.price_cents > 0 || item.fee_cents > 0)) {
      continue;
    }

    freeQuantityBySection.set(
      item.section_id,
      (freeQuantityBySection.get(item.section_id) ?? 0) + 1,
    );
  }

  const sectionIds = Array.from(freeQuantityBySection.keys());
  if (sectionIds.length === 0) return true;

  const { data: limits, error: limitsError } = await supabase
    .from("courtesy_section_limits")
    .select("section_id, max_courtesies, status")
    .eq("event_id", eventId)
    .in("section_id", sectionIds)
    .returns<CourtesySectionLimitRow[]>();

  if (limitsError) throw limitsError;

  const limitBySection = new Map((limits ?? []).map((limit) => [limit.section_id, limit]));

  for (const [sectionId, quantity] of freeQuantityBySection) {
    const limit = limitBySection.get(sectionId);
    if (!limit || limit.status !== "active" || limit.max_courtesies <= 0) {
      return false;
    }

    const issued = await countIssuedFreeTicketsForSection({ eventId, sectionId });
    if (issued + quantity > limit.max_courtesies) {
      return false;
    }
  }

  return true;
}

async function validatePublicFreeReservationVisibility(reservationId: string) {
  const { data, error } = await getSupabaseAdmin()
    .from("reservations")
    .select("id, event_sessions!inner(event_id, starts_at, timezone, status, events(status))")
    .eq("id", reservationId)
    .maybeSingle<ReservationEventRow>();

  if (error) throw error;

  return isPublicEventVisible({
    startsAt: data?.event_sessions?.starts_at,
    timezone: data?.event_sessions?.timezone,
    sessionStatus: data?.event_sessions?.status,
    eventStatus: data?.event_sessions?.events?.status,
    purpose: "checkout",
  });
}

export async function issuePublicFreeTicketsForOrder({
  orderId,
  customerId,
}: {
  orderId: string;
  customerId: string;
}): Promise<IssuePublicFreeTicketsResult> {
  const supabase = getSupabaseAdmin();
  const { data: order, error: orderError } = await supabase
    .from("orders")
    .select("id, reservation_id, customer_id")
    .eq("id", orderId)
    .eq("customer_id", customerId)
    .maybeSingle<{
      id: string;
      reservation_id: string;
      customer_id: string;
    }>();

  if (orderError) {
    return { ok: false, reason: "issue_failed", error: orderError };
  }

  if (!order) {
    return { ok: false, reason: "order_not_found" };
  }

  const { count, error: countError } = await supabase
    .from("reservation_items")
    .select("id", { count: "exact", head: true })
    .eq("reservation_id", order.reservation_id);

  if (countError) {
    return { ok: false, reason: "issue_failed", error: countError };
  }

  if ((count ?? 0) > 4) {
    return { ok: false, reason: "free_ticket_limit_exceeded" };
  }

  try {
    const reservationVisible = await validatePublicFreeReservationVisibility(
      order.reservation_id,
    );
    if (!reservationVisible) {
      return { ok: false, reason: "reservation_not_payable" };
    }

    const courtesyLimitsOk = await validatePublicCourtesyLimits(order.reservation_id);
    if (!courtesyLimitsOk) {
      return { ok: false, reason: "free_ticket_limit_exceeded" };
    }
  } catch (error) {
    return { ok: false, reason: "issue_failed", error };
  }

  const { data, error } = await supabase.rpc("issue_public_free_ticket_order", {
    p_order_id: orderId,
    p_customer_id: customerId,
  });

  if (error || !data || typeof data !== "object") {
    return {
      ok: false,
      reason: mapIssueError(error),
      error,
    };
  }

  const issued = data as IssuePublicFreeOrderRpcResponse;
  const tickets = await getTicketsForOrder(orderId).catch((deliveryError) => {
    logError("Failed to load public free tickets for delivery", {
      orderId,
      error: deliveryError,
    });
    return [];
  });

  if (tickets.length === 0) {
    return { ok: false, reason: "tickets_not_found" };
  }

  try {
    return {
      ok: true,
      orderId: issued.order_id ?? orderId,
      reservationId: issued.reservation_id ?? "",
      ticketsCount: issued.tickets_count ?? tickets.length,
      delivery: await buildTicketDeliveryPayload(
        tickets,
        "*INGRESSO GRATUITO CONFIRMADO*",
      ),
    };
  } catch (error) {
    logError("Failed to build public free ticket delivery payload", {
      orderId,
      error,
    });
    return { ok: false, reason: "issue_failed", error };
  }
}
