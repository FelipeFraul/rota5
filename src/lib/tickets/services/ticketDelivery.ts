import "server-only";

import QRCode from "qrcode";
import { logError, logInfo, logWarn } from "@/lib/logger";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { buildInitialConversationState } from "@/lib/tickets/conversationState";
import { updateConversationAfterMessage } from "@/lib/tickets/services/conversations";
import {
  createSignedTicketToken,
  createTicketUrl,
  getTicketsForOrder,
  type TicketForDelivery,
} from "@/lib/tickets/services/tickets";
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

export function buildTicketDeliveryMessage(tickets: TicketForDelivery[]) {
  const ticketBlocks = tickets.map(formatTicket);

  return [
    "*PAGAMENTO CONFIRMADO*",
    ticketBlocks.join("\n\n"),
  ].join("\n");
}

async function buildTicketQrImage(ticket: TicketForDelivery) {
  const ticketUrl = buildTicketUrl(ticket);

  return QRCode.toDataURL(ticketUrl, {
    errorCorrectionLevel: "M",
    margin: 2,
    scale: 8,
    type: "image/png",
  });
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
  const sendResult = await sendZapiText({ phone, message });

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
      qrImage = await buildTicketQrImage(ticket);
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
