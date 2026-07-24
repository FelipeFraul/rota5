import "server-only";

import { logError, logInfo, logWarn } from "@/lib/logger";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { buildInitialConversationState } from "@/lib/tickets/conversationState";
import {
  getOrCreateOpenConversation,
  updateConversationAfterMessage,
} from "@/lib/tickets/services/conversations";
import { saveWhatsAppMessage } from "@/lib/tickets/services/messages";
import { buildWhatsAppOutboundMetadata } from "@/lib/tickets/services/outboundMessages";
import {
  claimWhatsAppOutboundDelivery,
  getOrCreateWhatsAppOutboundDelivery,
  markWhatsAppOutboundDeliveryFailed,
  markWhatsAppOutboundDeliverySent,
} from "@/lib/tickets/services/whatsappOutboundDeliveries";
import {
  createSignedTicketToken,
  createTicketUrl,
  getTicketsForOrder,
  type TicketForDelivery,
} from "@/lib/tickets/services/tickets";
import {
  generateTicketQrImage,
  ticketQrImageToDataUrl,
} from "@/lib/tickets/services/ticketQrImage";
import {
  getOfficialTableMapPlace,
  normalizeOfficialTableMapCode,
} from "@/lib/tickets/tableMap/officialPlaces";
import { sendZapiImage, sendZapiText } from "@/lib/zapi/client";

type OrderCustomer = {
  id: string;
  customer_id: string;
  customers: {
    whatsapp_phone: string | null;
  } | null;
};

type OpenConversationRow = {
  id: string;
  context: Record<string, unknown>;
};

export type DeliverTicketsForOrderResult =
  | {
      ok: true;
      sent: true;
      ticketsCount: number;
    }
  | {
      ok: true;
      sent: false;
      reason:
        | "missing_phone"
        | "tickets_not_found"
        | "zapi_failed"
        | "delivery_in_progress";
      ticketsCount?: number;
    }
  | {
      ok: false;
      reason: "order_not_found" | "internal_error";
    };

const SAO_PAULO_TIME_ZONE = "America/Sao_Paulo";
function getDeliveryStateUpdateFailureCode(result: {
  ok: false;
  error?: { code?: string | null } | null;
  reason?: string;
}) {
  return result.error?.code ?? result.reason ?? "delivery_state_update_failed";
}

const QR_CODE_CAPTION = [
  "*APRESENTE O QRCODE NA PORTARIA*",
  "Este ingresso será validado uma única vez na portaria. Por segurança, não envie para terceiros.",
].join("\n");

function formatEventDate(startsAt: string) {
  const date = new Date(startsAt);
  const weekday = new Intl.DateTimeFormat("pt-BR", {
    timeZone: SAO_PAULO_TIME_ZONE,
    weekday: "long",
  }).format(date);
  const dayTime = new Intl.DateTimeFormat("pt-BR", {
    timeZone: SAO_PAULO_TIME_ZONE,
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  })
    .format(date)
    .replace(",", " às");

  return `${weekday.charAt(0).toLocaleUpperCase("pt-BR")}${weekday.slice(1)} ${dayTime}`;
}

function buildTicketUrl(ticket: TicketForDelivery) {
  const token = createSignedTicketToken({
    ticketId: ticket.ticketId,
    ticketCode: ticket.ticketCode,
  });

  return createTicketUrl(token);
}

function formatTicketCodes(tickets: TicketForDelivery[]) {
  return tickets.map((ticket) => ticket.ticketCode).join(", ");
}

function formatTicketSeatCodes(tickets: TicketForDelivery[]) {
  return tickets.map((ticket) => ticket.seatCode).join(", ");
}

function formatTableMapPlaceCode(code: string | null) {
  if (!code) return "X";

  const normalizedCode = normalizeOfficialTableMapCode(code);
  const place = getOfficialTableMapPlace(normalizedCode);
  const displayCode = normalizedCode.replace(/^0+/, "") || normalizedCode;

  return place?.capacity
    ? `${displayCode} para ${place.capacity} pessoas`
    : displayCode;
}

function formatTicketSummary(tickets: TicketForDelivery[]) {
  const firstTicket = tickets[0];

  if (!firstTicket) {
    return "";
  }

  return [
    `> ${firstTicket.eventTitle}`,
    `> Data: *${formatEventDate(firstTicket.startsAt)}*`,
    `> Local: *${firstTicket.venueName ?? "A confirmar"}*`,
    `> Ingresso: *${formatTicketSeatCodes(tickets)}*`,
    `> Mesa/ bistrô: *${formatTableMapPlaceCode(firstTicket.tableMapPlaceCode)}*`,
    `> Código: *${formatTicketCodes(tickets)}*`,
  ].join("\n");
}

export type TicketDeliveryPayload = {
  message: string;
  qrImages: Array<{
    imageUrl: string;
    caption: string;
  }>;
};

export function buildTicketDeliveryMessage(
  tickets: TicketForDelivery[],
  title = "*PAGAMENTO CONFIRMADO*",
) {
  return [
    title,
    "",
    formatTicketSummary(tickets),
  ].join("\n");
}

export async function buildTicketDeliveryPayload(
  tickets: TicketForDelivery[],
  title?: string,
): Promise<TicketDeliveryPayload> {
  return {
    message: buildTicketDeliveryMessage(tickets, title),
    qrImages: await Promise.all(
      tickets.map(async (ticket) => {
        const ticketUrl = buildTicketUrl(ticket);
        const ticketQrImage = await generateTicketQrImage({
          ticketUrl,
          ticketCode: ticket.ticketCode,
          eventTitle: ticket.eventTitle,
        });

        return {
          imageUrl: ticketQrImageToDataUrl(ticketQrImage.buffer),
          caption: QR_CODE_CAPTION,
        };
      }),
    ),
  };
}

async function getOrderCustomer(orderId: string) {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("orders")
    .select("id, customer_id, customers!inner(whatsapp_phone)")
    .eq("id", orderId)
    .maybeSingle<OrderCustomer>();

  if (error) {
    throw error;
  }

  return data;
}

function contextReservationOrderId(context: Record<string, unknown>) {
  const reservation =
    context.reservation &&
    typeof context.reservation === "object" &&
    !Array.isArray(context.reservation)
      ? (context.reservation as Record<string, unknown>)
      : null;

  return typeof reservation?.orderId === "string" ? reservation.orderId : null;
}

async function resetPaidOrderConversationContext({
  customerId,
  orderId,
}: {
  customerId: string;
  orderId: string;
}) {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("conversations")
    .select("id, context")
    .eq("customer_id", customerId)
    .eq("status", "open")
    .order("last_message_at", { ascending: false, nullsFirst: false })
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle<OpenConversationRow>();

  if (error) {
    logError("Failed to load conversation for paid order context reset", {
      orderId,
      customerId,
      code: error.code,
    });
    return;
  }

  if (!data || contextReservationOrderId(data.context) !== orderId) {
    return;
  }

  const updateResult = await updateConversationAfterMessage({
    conversationId: data.id,
    context: buildInitialConversationState(),
  });

  if (!updateResult.ok) {
    logError("Failed to reset paid order conversation context", {
      orderId,
      conversationId: data.id,
      code: updateResult.error.code,
    });
  }
}

export async function deliverTicketsForOrder(
  orderId: string,
): Promise<DeliverTicketsForOrderResult> {
  let order: OrderCustomer | null;
  let tickets: TicketForDelivery[];

  try {
    order = await getOrderCustomer(orderId);

    if (!order) {
      return { ok: false, reason: "order_not_found" };
    }

    tickets = await getTicketsForOrder(orderId);
  } catch (error) {
    logError("Failed to load tickets for WhatsApp delivery", {
      orderId,
      error,
    });
    return { ok: false, reason: "internal_error" };
  }

  const phone = order.customers?.whatsapp_phone;

  if (!phone) {
    logWarn("Skipped ticket delivery without customer phone", { orderId });
    return { ok: true, sent: false, reason: "missing_phone" };
  }

  if (tickets.length === 0) {
    logWarn("Skipped ticket delivery without issued tickets", { orderId });
    return { ok: true, sent: false, reason: "tickets_not_found" };
  }

  const message = buildTicketDeliveryMessage(tickets);
  const conversationResult = await getOrCreateOpenConversation({
    customerId: order.customer_id,
  });
  if (!conversationResult.ok) {
    logWarn("Continuing ticket WhatsApp delivery without conversation", {
      orderId,
      customerId: order.customer_id,
      code: conversationResult.error.code,
    });
  }
  const conversationId = conversationResult.ok
    ? conversationResult.conversation.id
    : null;
  const conversationFallbackMetadata = conversationResult.ok
    ? {}
    : { conversation_status: "unavailable" };

  const textBusinessContext = {
    order_id: orderId,
    tickets_count: tickets.length,
    ...conversationFallbackMetadata,
  };
  const textDelivery = await getOrCreateWhatsAppOutboundDelivery({
    idempotencyKey: `paid-ticket-order:${orderId}:text:v1`,
    customerId: order.customer_id,
    conversationId,
    recipientPhone: phone,
    messageType: "text",
    reason: "paid_ticket_delivery",
    businessContext: textBusinessContext,
  });

  if (!textDelivery.ok) {
    logError("Failed to prepare ticket WhatsApp delivery idempotency", {
      orderId,
      code: textDelivery.error.code,
    });
    return { ok: false, reason: "internal_error" };
  }

  if (textDelivery.delivery.status === "sent") {
    logInfo("Skipped already sent ticket WhatsApp delivery text", { orderId });
  } else {
    const textClaim = await claimWhatsAppOutboundDelivery(textDelivery.delivery.id);
    if (!textClaim.ok) {
      logError("Failed to claim ticket WhatsApp delivery text", {
        orderId,
        code: textClaim.error.code,
      });
      return { ok: false, reason: "internal_error" };
    }

    if (!textClaim.claimed) {
      logWarn("Skipped ticket WhatsApp delivery text already in progress", {
        orderId,
      });
      return {
        ok: true,
        sent: false,
        reason: "delivery_in_progress",
        ticketsCount: tickets.length,
      };
    }

    const sendResult = await sendZapiText({ phone, message });
    const textSaveResult = await saveWhatsAppMessage({
      conversationId,
      customerId: order.customer_id,
      direction: "outbound",
      messageType: "text",
      body: message,
      providerMessageId: sendResult.ok ? sendResult.providerMessageId : null,
      rawMetadata: buildWhatsAppOutboundMetadata({
        sendResult,
        messageType: "text",
        reason: "paid_ticket_delivery",
        businessContext: textBusinessContext,
      }),
    });

    if (!textSaveResult.ok) {
      const markFailedResult = await markWhatsAppOutboundDeliveryFailed({
        deliveryId: textDelivery.delivery.id,
        error: textSaveResult.error?.code ?? "whatsapp_message_persist_failed",
      });
      if (!markFailedResult.ok) {
        logError("Failed to mark ticket WhatsApp delivery text as failed", {
          orderId,
          code: getDeliveryStateUpdateFailureCode(markFailedResult),
          originalCode: textSaveResult.error?.code,
        });
      }
      logError("Failed to save ticket WhatsApp delivery message", {
        orderId,
        conversationId,
        code: textSaveResult.error?.code,
      });
      if (!sendResult.ok) {
        return {
          ok: true,
          sent: false,
          reason: "zapi_failed",
          ticketsCount: tickets.length,
        };
      }
      return { ok: false, reason: "internal_error" };
    }

    if (!sendResult.ok) {
      const markFailedResult = await markWhatsAppOutboundDeliveryFailed({
        deliveryId: textDelivery.delivery.id,
        error: sendResult.error,
      });
      if (!markFailedResult.ok) {
        logError("Failed to mark ticket WhatsApp delivery text as failed", {
          orderId,
          code: getDeliveryStateUpdateFailureCode(markFailedResult),
          originalCode: sendResult.error,
        });
      }
      logWarn("Ticket WhatsApp delivery failed after payment confirmation", {
        orderId,
        phoneLast4: phone.slice(-4),
        reason: sendResult.error,
        ticketsCount: tickets.length,
      });

      return {
        ok: true,
        sent: false,
        reason: "zapi_failed",
        ticketsCount: tickets.length,
      };
    }

    const markSentResult = await markWhatsAppOutboundDeliverySent({
      deliveryId: textDelivery.delivery.id,
      providerMessageId: sendResult.providerMessageId,
    });
    if (!markSentResult.ok) {
      logError("Failed to mark ticket WhatsApp delivery text as sent", {
        orderId,
        code: getDeliveryStateUpdateFailureCode(markSentResult),
      });
      return { ok: false, reason: "internal_error" };
    }
  }

  let deliveryInProgress = false;
  for (const ticket of tickets) {
    let qrImage: string;

    try {
      const ticketUrl = buildTicketUrl(ticket);
      const ticketQrImage = await generateTicketQrImage({
        ticketUrl,
        ticketCode: ticket.ticketCode,
        eventTitle: ticket.eventTitle,
      });
      qrImage = ticketQrImageToDataUrl(ticketQrImage.buffer);
    } catch (error) {
      logError("Failed to generate ticket QR Code image", {
        orderId,
        ticketId: ticket.ticketId,
        error,
      });

      return {
        ok: true,
        sent: false,
        reason: "zapi_failed",
        ticketsCount: tickets.length,
      };
    }

    const imageBusinessContext = {
      order_id: orderId,
      ticket_id: ticket.ticketId,
      ticket_code: ticket.ticketCode,
      ...conversationFallbackMetadata,
    };
    const imageDelivery = await getOrCreateWhatsAppOutboundDelivery({
      idempotencyKey: `paid-ticket:${ticket.ticketId}:qr:v1`,
      customerId: order.customer_id,
      conversationId,
      recipientPhone: phone,
      messageType: "image",
      reason: "paid_ticket_qr_delivery",
      businessContext: imageBusinessContext,
    });

    if (!imageDelivery.ok) {
      logError("Failed to prepare ticket QR WhatsApp delivery idempotency", {
        orderId,
        ticketId: ticket.ticketId,
        code: imageDelivery.error.code,
      });
      return { ok: false, reason: "internal_error" };
    }

    if (imageDelivery.delivery.status === "sent") {
      logInfo("Skipped already sent ticket QR WhatsApp delivery", {
        orderId,
        ticketId: ticket.ticketId,
      });
      continue;
    }

    const imageClaim = await claimWhatsAppOutboundDelivery(imageDelivery.delivery.id);
    if (!imageClaim.ok) {
      logError("Failed to claim ticket QR WhatsApp delivery", {
        orderId,
        ticketId: ticket.ticketId,
        code: imageClaim.error.code,
      });
      return { ok: false, reason: "internal_error" };
    }

    if (!imageClaim.claimed) {
      deliveryInProgress = true;
      logWarn("Skipped ticket QR WhatsApp delivery already in progress", {
        orderId,
        ticketId: ticket.ticketId,
      });
      continue;
    }

    const imageSendResult = await sendZapiImage({
      phone,
      image: qrImage,
      caption: QR_CODE_CAPTION,
    });
    const imageSaveResult = await saveWhatsAppMessage({
      conversationId,
      customerId: order.customer_id,
      direction: "outbound",
      messageType: "image",
      body: QR_CODE_CAPTION,
      providerMessageId: imageSendResult.ok
        ? imageSendResult.providerMessageId
        : null,
      rawMetadata: buildWhatsAppOutboundMetadata({
        sendResult: imageSendResult,
        messageType: "image",
        reason: "paid_ticket_qr_delivery",
        businessContext: imageBusinessContext,
      }),
    });

    if (!imageSaveResult.ok) {
      const markFailedResult = await markWhatsAppOutboundDeliveryFailed({
        deliveryId: imageDelivery.delivery.id,
        error: imageSaveResult.error?.code ?? "whatsapp_message_persist_failed",
      });
      if (!markFailedResult.ok) {
        logError("Failed to mark ticket QR WhatsApp delivery as failed", {
          orderId,
          ticketId: ticket.ticketId,
          code: getDeliveryStateUpdateFailureCode(markFailedResult),
          originalCode: imageSaveResult.error?.code,
        });
      }
      logError("Failed to save ticket QR WhatsApp delivery message", {
        orderId,
        ticketId: ticket.ticketId,
        conversationId,
        code: imageSaveResult.error?.code,
      });
      if (!imageSendResult.ok) {
        return {
          ok: true,
          sent: false,
          reason: "zapi_failed",
          ticketsCount: tickets.length,
        };
      }
      return { ok: false, reason: "internal_error" };
    }

    if (!imageSendResult.ok) {
      const markFailedResult = await markWhatsAppOutboundDeliveryFailed({
        deliveryId: imageDelivery.delivery.id,
        error: imageSendResult.error,
      });
      if (!markFailedResult.ok) {
        logError("Failed to mark ticket QR WhatsApp delivery as failed", {
          orderId,
          ticketId: ticket.ticketId,
          code: getDeliveryStateUpdateFailureCode(markFailedResult),
          originalCode: imageSendResult.error,
        });
      }
      logWarn("Ticket QR Code WhatsApp delivery failed after payment confirmation", {
        orderId,
        phoneLast4: phone.slice(-4),
        reason: imageSendResult.error,
        ticketsCount: tickets.length,
      });

      return {
        ok: true,
        sent: false,
        reason: "zapi_failed",
        ticketsCount: tickets.length,
      };
    }

    const markSentResult = await markWhatsAppOutboundDeliverySent({
      deliveryId: imageDelivery.delivery.id,
      providerMessageId: imageSendResult.providerMessageId,
    });
    if (!markSentResult.ok) {
      logError("Failed to mark ticket QR WhatsApp delivery as sent", {
        orderId,
        ticketId: ticket.ticketId,
        code: getDeliveryStateUpdateFailureCode(markSentResult),
      });
      return { ok: false, reason: "internal_error" };
    }
  }

  if (deliveryInProgress) {
    return {
      ok: true,
      sent: false,
      reason: "delivery_in_progress",
      ticketsCount: tickets.length,
    };
  }

  await resetPaidOrderConversationContext({
    customerId: order.customer_id,
    orderId,
  });

  logInfo("Delivered paid tickets by WhatsApp", {
    orderId,
    phoneLast4: phone.slice(-4),
    ticketsCount: tickets.length,
  });

  return {
    ok: true,
    sent: true,
    ticketsCount: tickets.length,
  };
}

