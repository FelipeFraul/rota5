import "server-only";

import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { TICKET_MESSAGES } from "@/lib/tickets/messages";
import { buildInitialConversationState } from "@/lib/tickets/conversationState";
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
  updated_at?: string;
  customers: { whatsapp_phone: string } | null;
  conversations: TicketConversation | null;
  orders:
    | { id: string; status: string }
    | { id: string; status: string }[]
    | null;
};

type InterestReminderConversationRow = TicketConversation & {
  customers: { whatsapp_phone: string } | null;
};

type AdminSessionNotificationRow = {
  id: string;
  admin_user_id: string;
  phone: string;
  status: "active" | "expired" | "revoked";
  expires_at: string;
};

const BUYER_INTEREST_REMINDER_AFTER_MS = 2 * 60 * 60 * 1000;
const BUYER_INTEREST_REMINDER_WINDOW_MS = 6 * 60 * 60 * 1000;

function firstOrder(row: ExpiredReservationNotificationRow) {
  return Array.isArray(row.orders) ? row.orders[0] : row.orders;
}

function buildReservationExpiredMessage() {
  return TICKET_MESSAGES.reservationExpired;
}

function buildBuyerInterestReminderMessage(eventTitle: string) {
  return TICKET_MESSAGES.buyerInterestReminder.replace("{EVENTO}", eventTitle);
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
    selectedEvent: undefined,
    selectedSection: undefined,
    selectedSeat: undefined,
    lastEvents: [],
    lastSections: [],
    lastSeats: [],
    updatedAt: new Date().toISOString(),
  };
}

async function loadExpiredReservationNotificationRows(reservationIds: string[]) {
  if (reservationIds.length === 0) {
    return [];
  }

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

async function loadSentExpiredReservationNotificationIds(
  reservationIds: string[],
) {
  if (reservationIds.length === 0) {
    return new Set<string>();
  }

  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("whatsapp_messages")
    .select("raw_metadata")
    .eq("direction", "outbound")
    .eq("raw_metadata->>reason", "reservation_expired")
    .eq("raw_metadata->>send_status", "sent")
    .in("raw_metadata->>reservation_id", reservationIds)
    .returns<{ raw_metadata: Record<string, unknown> | null }[]>();

  if (error) {
    throw error;
  }

  return new Set(
    (data ?? [])
      .map((row) => row.raw_metadata?.reservation_id)
      .filter((reservationId): reservationId is string => {
        return typeof reservationId === "string";
      }),
  );
}

async function loadRecentlyExpiredReservationNotificationRows(limit: number) {
  const since = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString();
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("reservations")
    .select(
      "id, customer_id, conversation_id, expires_at, updated_at, customers(whatsapp_phone), conversations(id, customer_id, status, context, last_message_at), orders(id, status)",
    )
    .eq("status", "expired")
    .gte("updated_at", since)
    .order("updated_at", { ascending: false })
    .limit(limit)
    .returns<ExpiredReservationNotificationRow[]>();

  if (error) {
    throw error;
  }

  const rows = data ?? [];
  const sentNotificationIds = await loadSentExpiredReservationNotificationIds(
    rows.map((row) => row.id),
  );

  return rows.filter((row) => !sentNotificationIds.has(row.id));
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

function getContextRecord(value: unknown) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function getSelectedInterestEvent(context: Record<string, unknown>) {
  const selectedEvent = getContextRecord(context.selectedEvent);
  const selectedTitle = selectedEvent?.title;
  const selectedEventId = selectedEvent?.eventId;

  if (typeof selectedTitle === "string" && selectedTitle.trim()) {
    return {
      eventId: typeof selectedEventId === "string" ? selectedEventId : null,
      title: selectedTitle.trim(),
    };
  }

  const lastEvents = Array.isArray(context.lastEvents) ? context.lastEvents : [];

  if (lastEvents.length !== 1) {
    return null;
  }

  const event = getContextRecord(lastEvents[0]);
  const title = event?.title;
  const eventId = event?.eventId;

  if (typeof title !== "string" || !title.trim()) {
    return null;
  }

  return {
    eventId: typeof eventId === "string" ? eventId : null,
    title: title.trim(),
  };
}

function isBuyerInterestReminderState(context: Record<string, unknown>) {
  return (
    context.state === "showing_events" ||
    context.state === "showing_sections" ||
    context.state === "showing_seats" ||
    context.state === "selecting_quantity" ||
    context.state === "reviewing_cart"
  );
}

function hasGeneratedPurchase(context: Record<string, unknown>) {
  return Boolean(context.reservation || context.payment);
}

async function loadSentBuyerInterestReminderConversationIds(
  conversationIds: string[],
) {
  if (conversationIds.length === 0) {
    return new Set<string>();
  }

  const { data, error } = await getSupabaseAdmin()
    .from("whatsapp_messages")
    .select("conversation_id")
    .eq("direction", "outbound")
    .eq("raw_metadata->>reason", "buyer_interest_no_purchase")
    .eq("raw_metadata->>send_status", "sent")
    .in("conversation_id", conversationIds)
    .returns<Array<{ conversation_id: string | null }>>();

  if (error) {
    throw error;
  }

  return new Set(
    (data ?? [])
      .map((row) => row.conversation_id)
      .filter((conversationId): conversationId is string => {
        return typeof conversationId === "string";
      }),
  );
}

async function loadCustomerIdsWithActiveOrPaidReservations(
  customerIds: string[],
  since: string,
) {
  if (customerIds.length === 0) {
    return new Set<string>();
  }

  const { data, error } = await getSupabaseAdmin()
    .from("reservations")
    .select("customer_id")
    .in("customer_id", customerIds)
    .in("status", ["active", "paid"])
    .gte("created_at", since)
    .returns<Array<{ customer_id: string }>>();

  if (error) {
    throw error;
  }

  return new Set((data ?? []).map((row) => row.customer_id));
}

async function loadBuyerInterestReminderRows(limit: number) {
  const now = Date.now();
  const olderThan = new Date(now - BUYER_INTEREST_REMINDER_AFTER_MS).toISOString();
  const newerThan = new Date(now - BUYER_INTEREST_REMINDER_WINDOW_MS).toISOString();
  const { data, error } = await getSupabaseAdmin()
    .from("conversations")
    .select("id, customer_id, status, context, last_message_at, customers(whatsapp_phone)")
    .eq("status", "open")
    .not("last_message_at", "is", null)
    .lte("last_message_at", olderThan)
    .gte("last_message_at", newerThan)
    .order("last_message_at", { ascending: true })
    .limit(limit)
    .returns<InterestReminderConversationRow[]>();

  if (error) {
    throw error;
  }

  const rows = (data ?? []).filter((row) => {
    return (
      isBuyerInterestReminderState(row.context) &&
      !hasGeneratedPurchase(row.context) &&
      Boolean(getSelectedInterestEvent(row.context)) &&
      Boolean(row.customers?.whatsapp_phone)
    );
  });
  const [sentConversationIds, customerIdsWithReservations] = await Promise.all([
    loadSentBuyerInterestReminderConversationIds(rows.map((row) => row.id)),
    loadCustomerIdsWithActiveOrPaidReservations(
      rows.map((row) => row.customer_id),
      newerThan,
    ),
  ]);

  return rows.filter(
    (row) =>
      !sentConversationIds.has(row.id) &&
      !customerIdsWithReservations.has(row.customer_id),
  );
}

async function notifyBuyerInterest(row: InterestReminderConversationRow) {
  const phone = row.customers?.whatsapp_phone;
  const event = getSelectedInterestEvent(row.context);

  if (!phone || !event) {
    return { sent: false };
  }

  const message = buildBuyerInterestReminderMessage(event.title);
  const sendResult = await sendZapiText({ phone, message });
  const outboundResult = await saveWhatsAppMessage({
    conversationId: row.id,
    customerId: row.customer_id,
    direction: "outbound",
    messageType: "text",
    body: message,
    providerMessageId: sendResult.ok ? sendResult.providerMessageId : null,
    rawMetadata: {
      provider: "zapi",
      message_type: "text",
      send_status: sendResult.ok ? "sent" : "failed",
      reason: "buyer_interest_no_purchase",
      event_id: event.eventId,
      reminder_after_minutes: 120,
      ...(sendResult.ok ? {} : { error: sendResult.error }),
    },
  });

  if (!outboundResult.ok) {
    logError("Failed to save buyer interest reminder", {
      conversationId: row.id,
      code: outboundResult.error?.code,
    });
  }

  const updateResult = await updateConversationAfterMessage({
    conversationId: row.id,
  });

  if (!updateResult.ok) {
    logError("Failed to update buyer interest reminder conversation", {
      conversationId: row.id,
      code: updateResult.error.code,
    });
  }

  if (!sendResult.ok) {
    logWarn("Buyer interest reminder failed", {
      conversationId: row.id,
      phoneLast4: phone.slice(-4),
      error: sendResult.error,
    });
  }

  return { sent: sendResult.ok };
}

async function sendBuyerInterestReminders(limit: number) {
  const rows = await loadBuyerInterestReminderRows(limit);
  let sentCount = 0;
  let failedCount = 0;

  for (const row of rows) {
    const notification = await notifyBuyerInterest(row);

    if (notification.sent) {
      sentCount += 1;
    } else {
      failedCount += 1;
    }
  }

  return {
    buyerInterestReminderCount: sentCount,
    failedBuyerInterestReminderCount: failedCount,
  };
}

async function loadSentAdminSessionNotificationIds(sessionIds: string[]) {
  if (sessionIds.length === 0) {
    return new Set<string>();
  }

  const { data, error } = await getSupabaseAdmin()
    .from("whatsapp_messages")
    .select("raw_metadata")
    .eq("direction", "outbound")
    .eq("raw_metadata->>reason", "admin_session_expired")
    .eq("raw_metadata->>send_status", "sent")
    .in("raw_metadata->>admin_session_id", sessionIds)
    .returns<{ raw_metadata: Record<string, unknown> | null }[]>();

  if (error) {
    throw error;
  }

  return new Set(
    (data ?? [])
      .map((row) => row.raw_metadata?.admin_session_id)
      .filter((sessionId): sessionId is string => typeof sessionId === "string"),
  );
}

async function loadOpenConversationByPhone(phone: string) {
  const { data: customer, error: customerError } = await getSupabaseAdmin()
    .from("customers")
    .select("id, whatsapp_phone")
    .eq("whatsapp_phone", phone)
    .maybeSingle<{ id: string; whatsapp_phone: string }>();

  if (customerError) {
    throw customerError;
  }

  if (!customer) {
    return null;
  }

  const { data: conversation, error: conversationError } = await getSupabaseAdmin()
    .from("conversations")
    .select("id, customer_id, status, context, last_message_at")
    .eq("customer_id", customer.id)
    .eq("status", "open")
    .order("last_message_at", { ascending: false, nullsFirst: false })
    .limit(1)
    .maybeSingle<TicketConversation>();

  if (conversationError) {
    throw conversationError;
  }

  return conversation ? { customer, conversation } : null;
}

function resetExpiredAdminSessionContext(
  context: Record<string, unknown>,
  sessionId: string,
) {
  const admin = getContextRecord(context.admin);

  if (admin?.sessionId !== sessionId) {
    return null;
  }

  return buildInitialConversationState();
}

async function notifyExpiredAdminSession(row: AdminSessionNotificationRow) {
  const loaded = await loadOpenConversationByPhone(row.phone);

  if (!loaded) {
    logWarn("Skipped admin session expiry notification without conversation", {
      adminSessionId: row.id,
      phoneLast4: row.phone.slice(-4),
    });
    return { sent: false };
  }

  const message = TICKET_MESSAGES.adminLogout;
  const sendResult = await sendZapiText({ phone: row.phone, message });
  const outboundResult = await saveWhatsAppMessage({
    conversationId: loaded.conversation.id,
    customerId: loaded.customer.id,
    direction: "outbound",
    messageType: "text",
    body: message,
    providerMessageId: sendResult.ok ? sendResult.providerMessageId : null,
    rawMetadata: {
      provider: "zapi",
      message_type: "text",
      send_status: sendResult.ok ? "sent" : "failed",
      reason: "admin_session_expired",
      admin_session_id: row.id,
      admin_user_id: row.admin_user_id,
      ...(sendResult.ok ? {} : { error: sendResult.error }),
    },
  });

  if (!outboundResult.ok) {
    logError("Failed to save admin session expiry notification", {
      adminSessionId: row.id,
      conversationId: loaded.conversation.id,
      code: outboundResult.error?.code,
    });
  }

  const nextContext = resetExpiredAdminSessionContext(
    loaded.conversation.context,
    row.id,
  );
  const updateResult = await updateConversationAfterMessage({
    conversationId: loaded.conversation.id,
    ...(nextContext ? { context: nextContext } : {}),
  });

  if (!updateResult.ok) {
    logError("Failed to update expired admin session conversation", {
      adminSessionId: row.id,
      conversationId: loaded.conversation.id,
      code: updateResult.error.code,
    });
  }

  if (!sendResult.ok) {
    logWarn("Admin session expiry notification failed", {
      adminSessionId: row.id,
      phoneLast4: row.phone.slice(-4),
      error: sendResult.error,
    });
  }

  return { sent: sendResult.ok };
}

async function expireAdminSessionsAndNotify(limit: number) {
  const now = new Date().toISOString();
  const { data, error } = await getSupabaseAdmin()
    .from("admin_sessions")
    .select("id, admin_user_id, phone, status, expires_at")
    .eq("status", "active")
    .lte("expires_at", now)
    .order("expires_at", { ascending: true })
    .limit(limit)
    .returns<AdminSessionNotificationRow[]>();

  if (error) {
    throw error;
  }

  const rows = data ?? [];
  const sentNotificationIds = await loadSentAdminSessionNotificationIds(
    rows.map((row) => row.id),
  );
  let notifiedCount = 0;
  let failedNotificationCount = 0;

  for (const row of rows) {
    if (!sentNotificationIds.has(row.id)) {
      const notification = await notifyExpiredAdminSession(row);

      if (notification.sent) {
        notifiedCount += 1;
      } else {
        failedNotificationCount += 1;
      }
    }
  }

  if (rows.length > 0) {
    const { error: updateError } = await getSupabaseAdmin()
      .from("admin_sessions")
      .update({ status: "expired", last_used_at: now })
      .in("id", rows.map((row) => row.id))
      .eq("status", "active");

    if (updateError) {
      throw updateError;
    }
  }

  return {
    expiredAdminSessionCount: rows.length,
    adminSessionNotificationCount: notifiedCount,
    failedAdminSessionNotificationCount: failedNotificationCount,
  };
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

  const rowsById = new Map<string, ExpiredReservationNotificationRow>();
  const expiredRows = await loadExpiredReservationNotificationRows(reservationIds);
  const retryRows = await loadRecentlyExpiredReservationNotificationRows(limit);

  for (const row of [...expiredRows, ...retryRows]) {
    rowsById.set(row.id, row);
  }

  let notifiedCount = 0;
  let failedNotificationCount = 0;

  for (const row of rowsById.values()) {
    const notification = await notifyExpiredReservation(row);

    if (notification.sent) {
      notifiedCount += 1;
    } else {
      failedNotificationCount += 1;
    }
  }

  const buyerInterestResult = await sendBuyerInterestReminders(limit);
  const adminSessionResult = await expireAdminSessionsAndNotify(limit);

  logInfo("Expired reservations cron processed", {
    expiredReservationsCount: result.expired_reservations_count ?? 0,
    releasedSeatsCount: result.released_seats_count ?? 0,
    expiredOrderCount: result.expired_order_count ?? 0,
    notifiedCount,
    failedNotificationCount,
    ...buyerInterestResult,
    ...adminSessionResult,
  });

  return {
    expiredReservationsCount: result.expired_reservations_count ?? 0,
    releasedSeatsCount: result.released_seats_count ?? 0,
    expiredOrderCount: result.expired_order_count ?? 0,
    notifiedCount,
    failedNotificationCount,
    ...buyerInterestResult,
    ...adminSessionResult,
  };
}
