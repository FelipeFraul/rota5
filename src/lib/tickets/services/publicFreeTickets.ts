import "server-only";

import { logError } from "@/lib/logger";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { buildTicketDeliveryPayload } from "@/lib/tickets/services/ticketDelivery";
import { getTicketsForOrder } from "@/lib/tickets/services/tickets";

export type IssuePublicFreeTicketsResult =
  | {
      ok: true;
      orderId: string;
      reservationId: string;
      ticketsCount: number;
      delivery: {
        message: string;
        qrImages: Array<{
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
