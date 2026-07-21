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
  createSignedTicketToken,
  createTicketUrl,
  getTicketsForOrder,
  type TicketForDelivery,
} from "@/lib/tickets/services/tickets";
import {
  generateTicketQrImage,
  ticketQrImageToDataUrl,
} from "@/lib/tickets/services/ticketQrImage";
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
      reason: "missing_phone" | "tickets_not_found" | "zapi_failed";
      ticketsCount?: number;
    }
  | {
      ok: false;
      reason: "order_not_found" | "internal_error";
    };

const SAO_PAULO_TIME_ZONE = "America/Sao_Paulo";
const QR_CODE_CAPTION = [
  "*APRESENTE O QRCODE NA PORTARIA*",
  "Este ingresso será validado uma única vez na portaria. Por segurança, não envie para terceiros.",
].join("\n");

function formatEventDate(startsAt: string) {
  return new Intl.DateTimeFormat("pt-BR", {
    timeZone: SAO_PAULO_TIME_ZONE,
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  })
    .format(new Date(startsAt))
    .replace(",", " às");
}

function buildTicketUrl(ticket: TicketForDelivery) {
  const token = createSignedTicketToken({
    ticketId: ticket.ticketId,
    ticketCode: ticket.ticketCode,
  });

  return createTicketUrl(token);
}

function formatTicket(ticket: TicketForDelivery) {
  return [
    `> ${ticket.eventTitle}`,
    `> Data: ${formatEventDate(ticket.startsAt)}`,
    `> Local: ${ticket.venueName ?? "A confirmar"} - ${ticket.city}/${ticket.state}`,
    `> Setor: ${ticket.sectionName}`,
    `> Ingresso/Assento: ${ticket.seatCode}`,
    `> Código: ${ticket.ticketCode}`,
  ].join("\n");
}

function buildVenueSearchText(ticket: TicketForDelivery) {
  return [
    ticket.venueName,
    ticket.venueAddress,
    ticket.city,
    ticket.state,
  ]
    .filter((value): value is string => Boolean(value?.trim()))
    .join(", ");
}

function buildVenueMapLink(ticket: TicketForDelivery) {
  const searchText = buildVenueSearchText(ticket);

  if (!searchText) {
    return null;
  }

  return `https://maps.google.com/?q=${encodeURIComponent(searchText)}`;
}

function buildVenueLinkLines(tickets: TicketForDelivery[]) {
  const links = new Set<string>();

  for (const ticket of tickets) {
    const link = buildVenueMapLink(ticket);

    if (link) {
      links.add(link);
    }
  }

  return [...links].map((link) => `> Local: ${link}`);
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
  const ticketBlocks = tickets.map(formatTicket);
  const venueLinkLines = buildVenueLinkLines(tickets);

  return [
    title,
    ...venueLinkLines,
    ...(venueLinkLines.length > 0 ? [""] : []),
    ticketBlocks.join("\n\n"),
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
      businessContext: {
        order_id: orderId,
        tickets_count: tickets.length,
        ...conversationFallbackMetadata,
      },
    }),
  });

  if (!textSaveResult.ok) {
    logError("Failed to save ticket WhatsApp delivery message", {
      orderId,
      conversationId,
      code: textSaveResult.error?.code,
    });
    return { ok: false, reason: "internal_error" };
  }

  if (!sendResult.ok) {
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
        businessContext: {
          order_id: orderId,
          ticket_id: ticket.ticketId,
          ticket_code: ticket.ticketCode,
          ...conversationFallbackMetadata,
        },
      }),
    });

    if (!imageSaveResult.ok) {
      logError("Failed to save ticket QR WhatsApp delivery message", {
        orderId,
        ticketId: ticket.ticketId,
        conversationId,
        code: imageSaveResult.error?.code,
      });
      return { ok: false, reason: "internal_error" };
    }

    if (!imageSendResult.ok) {
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
