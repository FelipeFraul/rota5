import "server-only";

import { logError, logInfo, logWarn } from "@/lib/logger";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import {
  createSignedTicketToken,
  createTicketUrl,
  getTicketsForOrder,
  type TicketForDelivery,
} from "@/lib/tickets/services/tickets";
import { sendZapiText } from "@/lib/zapi/client";

type OrderCustomer = {
  id: string;
  customer_id: string;
  customers: {
    whatsapp_phone: string | null;
  } | null;
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

function formatTicket(ticket: TicketForDelivery, index: number) {
  const token = createSignedTicketToken({
    ticketId: ticket.ticketId,
    ticketCode: ticket.ticketCode,
  });
  const ticketUrl = createTicketUrl(token);

  return [
    `${index + 1}. ${ticket.eventTitle}`,
    `Data: ${formatEventDate(ticket.startsAt)}`,
    `Local: ${ticket.venueName ?? "A confirmar"} - ${ticket.city}/${ticket.state}`,
    `Setor: ${ticket.sectionName}`,
    `Assento: ${ticket.seatCode}`,
    `Código: ${ticket.ticketCode}`,
    "",
    "Apresente este link/QR Code na entrada:",
    ticketUrl,
  ].join("\n");
}

export function buildTicketDeliveryMessage(tickets: TicketForDelivery[]) {
  const ticketBlocks = tickets.map(formatTicket);

  return [
    "Pagamento confirmado!",
    "",
    tickets.length === 1
      ? "Seu ingresso foi emitido:"
      : "Seus ingressos foram emitidos:",
    "",
    ticketBlocks.join("\n\n"),
    "",
    "Este ingresso é pessoal e será validado uma única vez na portaria.",
  ].join("\n");
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
