import "server-only";

import { getSupabaseAdmin } from "@/lib/supabase/admin";
import {
  updateConversationAfterMessage,
  type TicketConversation,
} from "@/lib/tickets/services/conversations";
import { saveWhatsAppMessage } from "@/lib/tickets/services/messages";
import { sendZapiText } from "@/lib/zapi/client";
import { logError, logInfo, logWarn } from "@/lib/logger";

type ExpireReservationsRpcResponse = {
  expired_reservations_count?: number;
  released_seats_count?: number;
  expired_order_count?: number;
  reservation_ids?: string[];
};

type ExpiredReservationNotificationRow = {
  id: string;
  customer_id: string;
  conversation_id: string | null;
  expires_at: string;
  customers: { whatsapp_phone: string } | null;
  conversations: TicketConversation | null;
  orders:
    | { id: string; status: string }
    | { id: string; status: string }[]
    | null;
};

function firstOrder(row: ExpiredReservationNotificationRow) {
  return Array.isArray(row.orders) ? row.orders[0] : row.orders;
}

function buildReservationExpiredMessage() {
  return [
    "⏰ O tempo limite da sua reserva acabou.",
    "",
    "Os ingressos foram liberados novamente para venda.",
    "Para comprar, faça uma nova busca pelo evento.",
  ].join("\n");
}

function resetExpiredReservationContext(
  context: Record<string, unknown>,
  reservationId: string,
) {
  const reservation =
    context.reservation &&
    typeof context.reservation === "object" &&
    !Array.isArray(context.reservation)
      ? (context.reservation as Record<string, unknown>)
      : null;

  if (reservation?.reservationId !== reservationId) {
    return null;
  }

  return {
    ...context,
    step: "idle",
    state: "idle",
    reservation: undefined,
    payment: undefined,
    selectedSeat: undefined,
    updatedAt: new Date().toISOString(),
  };
}

async function loadExpiredReservationNotificationRows(reservationIds: string[]) {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("reservations")
    .select(
      "id, customer_id, conversation_id, expires_at, customers(whatsapp_phone), conversations(id, customer_id, status, context, last_message_at), orders(id, status)",
    )
    .in("id", reservationIds)
    .returns<ExpiredReservationNotificationRow[]>();

  if (error) {
    throw error;
  }

  return data ?? [];
}

async function notifyExpiredReservation(row: ExpiredReservationNotificationRow) {
  const phone = row.customers?.whatsapp_phone;
  const conversation = row.conversations;

  if (!phone || !conversation || row.conversation_id !== conversation.id) {
    logWarn("Skipped expired reservation notification without conversation", {
      reservationId: row.id,
      phoneLast4: phone?.slice(-4),
    });
    return { sent: false };
  }

  const message = buildReservationExpiredMessage();
  const sendResult = await sendZapiText({ phone, message });

  const outboundResult = await saveWhatsAppMessage({
    conversationId: conversation.id,
    customerId: row.customer_id,
    direction: "outbound",
    messageType: "text",
    body: message,
    providerMessageId: sendResult.ok ? sendResult.providerMessageId : null,
    rawMetadata: {
      provider: "zapi",
      message_type: "text",
      send_status: sendResult.ok ? "sent" : "failed",
      reason: "reservation_expired",
      reservation_id: row.id,
      order_id: firstOrder(row)?.id,
      ...(sendResult.ok ? {} : { error: sendResult.error }),
    },
  });

  if (!outboundResult.ok) {
    logError("Failed to save expired reservation notification", {
      reservationId: row.id,
      conversationId: conversation.id,
      code: outboundResult.error?.code,
    });
  }

  const nextContext = resetExpiredReservationContext(conversation.context, row.id);

  if (nextContext) {
    const updateResult = await updateConversationAfterMessage({
      conversationId: conversation.id,
      context: nextContext,
    });

    if (!updateResult.ok) {
      logError("Failed to reset expired reservation context", {
        reservationId: row.id,
        conversationId: conversation.id,
        code: updateResult.error.code,
      });
    }
  }

  if (!sendResult.ok) {
    logWarn("Expired reservation notification failed", {
      reservationId: row.id,
      phoneLast4: phone.slice(-4),
      error: sendResult.error,
    });
  }

  return { sent: sendResult.ok };
}

export async function expireReservationsAndNotify(limit = 100) {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase.rpc("expire_reservations", {
    p_limit: limit,
  });

  if (error) {
    throw error;
  }

  const result = (data ?? {}) as ExpireReservationsRpcResponse;
  const reservationIds = Array.isArray(result.reservation_ids)
    ? result.reservation_ids.filter((id): id is string => typeof id === "string")
    : [];

  if (reservationIds.length === 0) {
    return {
      expiredReservationsCount: result.expired_reservations_count ?? 0,
      releasedSeatsCount: result.released_seats_count ?? 0,
      expiredOrderCount: result.expired_order_count ?? 0,
      notifiedCount: 0,
      failedNotificationCount: 0,
    };
  }

  const rows = await loadExpiredReservationNotificationRows(reservationIds);
  let notifiedCount = 0;
  let failedNotificationCount = 0;

  for (const row of rows) {
    const notification = await notifyExpiredReservation(row);

    if (notification.sent) {
      notifiedCount += 1;
    } else {
      failedNotificationCount += 1;
    }
  }

  logInfo("Expired reservations cron processed", {
    expiredReservationsCount: result.expired_reservations_count ?? 0,
    releasedSeatsCount: result.released_seats_count ?? 0,
    expiredOrderCount: result.expired_order_count ?? 0,
    notifiedCount,
    failedNotificationCount,
  });

  return {
    expiredReservationsCount: result.expired_reservations_count ?? 0,
    releasedSeatsCount: result.released_seats_count ?? 0,
    expiredOrderCount: result.expired_order_count ?? 0,
    notifiedCount,
    failedNotificationCount,
  };
}
