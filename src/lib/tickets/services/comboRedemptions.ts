import "server-only";

import { createHash, randomBytes } from "crypto";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { validateGateSessionToken } from "@/lib/tickets/services/gateSessions";
import {
  hashGateSessionToken,
  hashKitchenDeviceToken,
} from "@/lib/tickets/services/gateTokens";
import {
  getOrCreateOpenConversation,
  updateConversationAfterMessage,
} from "@/lib/tickets/services/conversations";
import { saveWhatsAppMessage } from "@/lib/tickets/services/messages";
import { buildWhatsAppOutboundMetadata } from "@/lib/tickets/services/outboundMessages";
import { sendZapiImage, sendZapiText } from "@/lib/zapi/client";
import { generateComboQrImage } from "@/lib/tickets/services/comboQrImage";
import {
  comboRedemptionTokenMatchesHash,
  createComboRedemptionToken,
  hashComboRedemptionToken,
} from "@/lib/tickets/services/comboQrTokens";
import { formatComboDescription } from "@/lib/tickets/services/comboOffers";
import { getOfficialTableMapPlace } from "@/lib/tickets/tableMap/officialPlaces";
import { isPublicEventVisible } from "@/lib/tickets/services/publicEventVisibility";
import {
  claimWhatsAppOutboundDelivery,
  getWhatsAppOutboundDeliveryByIdempotencyKey,
  markWhatsAppOutboundDeliveryFailed,
  markWhatsAppOutboundDeliverySent,
} from "@/lib/tickets/services/whatsappOutboundDeliveries";

export type KitchenSessionValidation =
  | {
      valid: true;
      kitchenSession: {
        eventTitle: string | null;
        sessionStartsAt: string | null;
        kitchenLabel: string | null;
      };
      summary: {
        redeemedCount: number;
        deniedCount: number;
        lastResult: string | null;
      };
    }
  | {
      valid: false;
      reason: "malformed" | "expired" | "not_found" | "revoked" | "inactive" | "device_mismatch";
    };

export type ComboRedemptionScanResult = {
  allowed: boolean;
  result:
    | "allowed"
    | "already_used"
    | "cancelled"
    | "denied"
    | "not_found"
    | "wrong_event"
    | "wrong_session"
    | "awaiting_preparation"
    | "kitchen_session_invalid";
  message: string;
  redemption?: {
    redemptionId?: string;
    redemptionCode?: string;
    offerName?: string;
    quantity?: number;
    status?: string;
    usedAt?: string | null;
  } | null;
};

export type ComboDeliveryChoice = "table" | "waiter";

export type KitchenOrdersValidation =
  | {
      valid: true;
      kitchenSession: {
        eventTitle: string | null;
        sessionStartsAt: string | null;
        kitchenLabel: string | null;
      };
      summary: {
        pendingCount: number;
        redeemedCount: number;
        totalQuantity: number;
      };
      events: Array<{
        eventId: string;
        title: string;
        startsAt: string;
      }>;
      orders: Array<{
        redemptionId: string;
        redemptionCode: string;
        offerName: string;
        offerDescription: string;
        quantity: number;
        status: "issued" | "used" | "cancelled";
        issuedAt: string;
        usedAt: string | null;
        paidAt: string | null;
        totalAmountCents: number | null;
        customerName: string | null;
        customerPhoneLast4: string | null;
        eventId: string;
        eventTitle: string;
        sessionStartsAt: string;
        kitchenStatus: "pending" | "preparing" | "delivered";
        arrivedAt: string | null;
        kitchenReleasedAt: string | null;
        preparingAt: string | null;
        readyNotifiedAt: string | null;
        deliveredAt: string | null;
      }>;
    }
  | {
      valid: false;
      reason: "malformed" | "expired" | "not_found" | "revoked" | "inactive" | "device_mismatch" | "service_unavailable";
    };

type ComboRedemptionEventRow = {
  result: string;
  redemption_code: string | null;
  offer_name: string | null;
  quantity: number | null;
  created_at: string;
};

type ComboRedemptionOrderRow = {
  id: string;
  event_id: string;
  session_id: string;
  redemption_code: string;
  offer_name: string;
  quantity: number;
  status: "issued" | "used" | "cancelled";
  issued_at: string;
  used_at: string | null;
  raw_metadata: Record<string, unknown> | null;
  customers: { whatsapp_phone: string | null; name: string | null } | { whatsapp_phone: string | null; name: string | null }[] | null;
  combo_orders:
    | {
        status: string;
        paid_at: string | null;
        total_amount_cents: number | null;
        combo_offers:
          | { description: string }
          | { description: string }[]
          | null;
      }
    | {
        status: string;
        paid_at: string | null;
        total_amount_cents: number | null;
        combo_offers:
          | { description: string }
          | { description: string }[]
          | null;
      }[]
    | null;
  events: { title: string } | { title: string }[] | null;
  event_sessions: { starts_at: string } | { starts_at: string }[] | null;
};

type ComboDeliveryReservationRow = {
  place_code: string;
  status: string;
};

type GateTicketForKitchenRow = {
  id: string;
  customer_id: string;
  session_id: string;
  event_sessions:
    | { event_id: string; starts_at: string; timezone?: string | null; status: string; events: { status: string } | null }
    | { event_id: string; starts_at: string; timezone?: string | null; status: string; events: { status: string } | null }[]
    | null;
};

function hashSecret(value: string) {
  return createHash("sha256").update(value).digest("hex");
}

function extractComboToken(rawValue: string) {
  const value = rawValue.trim();

  try {
    const parsedUrl = new URL(value);
    const token = parsedUrl.searchParams.get("combo") ?? parsedUrl.searchParams.get("token");
    if (token) return token.trim();
  } catch {
    // Not a URL; use the raw QR value.
  }

  return value;
}

function parseComboToken(rawValue: string) {
  const value = extractComboToken(rawValue);
  const match = value.match(/^combo:([0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}):([A-Za-z0-9_-]{20,})$/i);

  if (!match) return null;

  return {
    redemptionId: match[1],
    token: match[2],
  };
}

function formatComboRedemptionEvent(row: ComboRedemptionEventRow) {
  const label =
    row.result === "allowed"
      ? "Combo liberado"
      : row.result === "already_used"
        ? "Combo ja retirado"
        : row.result === "cancelled"
          ? "Combo cancelado"
          : row.result === "wrong_event"
            ? "Combo de outro evento"
            : row.result === "wrong_session"
              ? "Combo de outra sessao"
              : row.result === "not_found"
                ? "Combo nao encontrado ou QR invalido"
                : "Combo recusado";

  return [
    label,
    row.redemption_code ? `Codigo: ${row.redemption_code}` : null,
    row.offer_name ? `Oferta: ${row.offer_name}` : null,
    row.quantity ? `Quantidade: ${row.quantity}` : null,
    `Registrado em: ${new Intl.DateTimeFormat("pt-BR", {
      timeZone: "America/Sao_Paulo",
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    })
      .format(new Date(row.created_at))
      .replace(",", " as")}`,
  ]
    .filter(Boolean)
    .join("\n");
}

function firstJoin<T>(value: T | T[] | null | undefined) {
  return Array.isArray(value) ? value[0] ?? null : value ?? null;
}

function phoneLast4(phone: string | null | undefined) {
  const digits = String(phone ?? "").replace(/\D/g, "");
  return digits.length >= 4 ? digits.slice(-4) : null;
}

function formatComboDeliveryPlace(placeCode: string | null | undefined) {
  const code = String(placeCode ?? "").trim().padStart(2, "0");
  const place = getOfficialTableMapPlace(code);
  const displayCode = code.replace(/^0+/, "") || code;
  const kind = place?.type === "bistr?" ? "bistrô" : "mesa";

  return `${kind} ${displayCode}`;
}

async function getComboRedemptionTableMapPlaceCode(input: {
  sourceOrderId: string | null | undefined;
  customerId: string;
  eventId: string;
  sessionId: string;
}) {
  if (!input.sourceOrderId) return null;

  const { data } = await getSupabaseAdmin()
    .from("official_table_map_reservations")
    .select("place_code")
    .eq("order_id", input.sourceOrderId)
    .eq("customer_id", input.customerId)
    .eq("event_id", input.eventId)
    .eq("session_id", input.sessionId)
    .eq("status", "paid")
    .maybeSingle<{ place_code: string | null }>();

  return data?.place_code ?? null;
}

function buildComboDeliveryChoiceMessage(input: {
  product: string;
  placeLabel: string;
}) {
  return [
    "*ENTREGA DE BEBIDA*",
    "",
    `*Produto:* ${input.product}`,
    "",
    `Digite *OK* para receber na sua ${input.placeLabel}`,
    "Digite *1* para solicitar um garçom.",
    "",
    "Mantenha o QR Code vermelho aberto para apresentar na entrega.",
  ].join("\n");
}

export async function validateKitchenSessionToken(
  token: string,
  deviceToken?: string | null,
): Promise<KitchenSessionValidation> {
  const result = await validateGateSessionToken(
    token,
    "kitchen",
    deviceToken,
    "reader",
  );

  if (!result.valid) {
    return { valid: false, reason: result.reason };
  }

  const supabase = getSupabaseAdmin();
  const [{ count: redeemedCount }, { count: deniedCount }, { data: lastEvents }] =
    await Promise.all([
      supabase
        .from("combo_redemption_events")
        .select("id", { count: "exact", head: true })
        .eq("kitchen_session_id", result.gateSession.id)
        .eq("result", "allowed"),
      supabase
        .from("combo_redemption_events")
        .select("id", { count: "exact", head: true })
        .eq("kitchen_session_id", result.gateSession.id)
        .neq("result", "allowed"),
      supabase
        .from("combo_redemption_events")
        .select("result, redemption_code, offer_name, quantity, created_at")
        .eq("kitchen_session_id", result.gateSession.id)
        .order("created_at", { ascending: false })
        .limit(1)
        .returns<ComboRedemptionEventRow[]>(),
    ]);

  const lastEvent = lastEvents?.[0] ?? null;

  return {
    valid: true,
    kitchenSession: {
      eventTitle: result.gateSession.eventTitle,
      sessionStartsAt: result.gateSession.sessionStartsAt,
      kitchenLabel: result.gateSession.gateLabel,
    },
    summary: {
      redeemedCount: redeemedCount ?? 0,
      deniedCount: deniedCount ?? 0,
      lastResult: lastEvent ? formatComboRedemptionEvent(lastEvent) : null,
    },
  };
}

export async function validateKitchenOrdersToken(
  token: string,
  deviceToken?: string | null,
): Promise<KitchenOrdersValidation> {
  const result = await validateGateSessionToken(token, "kitchen", deviceToken);

  if (!result.valid) {
    return { valid: false, reason: result.reason };
  }

  const supabase = getSupabaseAdmin();
  let query = supabase
    .from("combo_redemptions")
    .select(
      "id, event_id, session_id, redemption_code, offer_name, quantity, status, issued_at, used_at, raw_metadata, customers(whatsapp_phone, name), events(title), event_sessions(starts_at), combo_orders!inner(status, paid_at, total_amount_cents, combo_offers(description))",
    )
    .eq("combo_orders.status", "paid")
    .order("issued_at", { ascending: true })
    .limit(200);

  if (result.gateSession.eventId) {
    query = query.eq("event_id", result.gateSession.eventId);
  }

  if (result.gateSession.sessionId) {
    query = query.eq("session_id", result.gateSession.sessionId);
  }

  const { data, error } = await query.returns<ComboRedemptionOrderRow[]>();

  if (error) {
    return { valid: false, reason: "service_unavailable" };
  }

  const orders = (data ?? []).flatMap((row) => {
    const customer = firstJoin(row.customers);
    const order = firstJoin(row.combo_orders);
    const event = firstJoin(row.events);
    const eventSession = firstJoin(row.event_sessions);
    const offer = firstJoin(order?.combo_offers);
    const metadata = row.raw_metadata ?? {};
    const metadataKitchenStatus = metadata.kitchen_status;
    const kitchenStatus =
      row.status === "used"
        ? ("delivered" as const)
        : metadataKitchenStatus === "preparing"
          ? ("preparing" as const)
          : ("pending" as const);
    const kitchenVisible =
      row.status === "used" ||
      metadata.kitchen_visible === true ||
      kitchenStatus === "preparing" ||
      kitchenStatus === "delivered";

    if (!kitchenVisible) return [];

    return [{
      redemptionId: row.id,
      redemptionCode: row.redemption_code,
      offerName: row.offer_name,
      offerDescription: formatComboDescription(offer?.description ?? ""),
      quantity: row.quantity,
      status: row.status,
      issuedAt: row.issued_at,
      usedAt: row.used_at,
      paidAt: order?.paid_at ?? null,
      totalAmountCents: order?.total_amount_cents ?? null,
      customerName: customer?.name ?? null,
      customerPhoneLast4: phoneLast4(customer?.whatsapp_phone),
      eventId: row.event_id,
      eventTitle: event?.title ?? "Evento",
      sessionStartsAt: eventSession?.starts_at ?? "",
      kitchenStatus,
      arrivedAt:
        typeof metadata.kitchen_arrived_at === "string"
          ? metadata.kitchen_arrived_at
          : null,
      kitchenReleasedAt:
        typeof metadata.kitchen_released_at === "string"
          ? metadata.kitchen_released_at
          : null,
      preparingAt:
        typeof metadata.preparing_at === "string" ? metadata.preparing_at : null,
      readyNotifiedAt:
        typeof metadata.ready_notified_at === "string"
          ? metadata.ready_notified_at
          : null,
      deliveredAt:
        typeof metadata.delivered_at === "string"
          ? metadata.delivered_at
          : row.used_at,
    }];
  });

  let eventQuery = supabase
    .from("event_sessions")
    .select("event_id, starts_at, status, events(title)")
    .in("status", ["scheduled", "sales_open", "sales_closed"])
    .gte("starts_at", new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString())
    .order("starts_at", { ascending: true })
    .limit(200);

  if (result.gateSession.eventId) {
    eventQuery = eventQuery.eq("event_id", result.gateSession.eventId);
  }
  if (result.gateSession.sessionId) {
    eventQuery = eventQuery.eq("id", result.gateSession.sessionId);
  }

  const { data: sessionRows } = await eventQuery.returns<
    Array<{
      event_id: string;
      starts_at: string;
      status: string;
      events: { title: string } | { title: string }[] | null;
    }>
  >();
  const eventMap = new Map<
    string,
    { eventId: string; title: string; startsAt: string }
  >();

  for (const row of sessionRows ?? []) {
    if (eventMap.has(row.event_id)) continue;
    const event = firstJoin(row.events);
    eventMap.set(row.event_id, {
      eventId: row.event_id,
      title: event?.title ?? "Evento",
      startsAt: row.starts_at,
    });
  }

  return {
    valid: true,
    kitchenSession: {
      eventTitle: result.gateSession.eventTitle,
      sessionStartsAt: result.gateSession.sessionStartsAt,
      kitchenLabel: result.gateSession.gateLabel,
    },
    summary: {
      pendingCount: orders.filter((order) => order.kitchenStatus === "pending").length,
      redeemedCount: orders.filter((order) => order.kitchenStatus === "delivered").length,
      totalQuantity: orders.reduce((total, order) => total + order.quantity, 0),
    },
    events: [...eventMap.values()],
    orders,
  };
}

export async function releaseComboOrdersForKitchenAfterGateEntry(input: {
  ticketId: string;
  gateSessionId: string;
  gateLabel: string | null;
  validatorIdentifier: string;
}) {
  const supabase = getSupabaseAdmin();
  const { data: ticket, error: ticketError } = await supabase
    .from("tickets")
    .select("id, customer_id, session_id, event_sessions!inner(event_id, starts_at, timezone, status, events(status))")
    .eq("id", input.ticketId)
    .maybeSingle<GateTicketForKitchenRow>();

  if (ticketError || !ticket) {
    return { ok: false as const, releasedCount: 0 };
  }

  const eventSession = firstJoin(ticket.event_sessions);
  if (!eventSession?.event_id) {
    return { ok: false as const, releasedCount: 0 };
  }
  const canNotifyCustomer = isPublicEventVisible({
    startsAt: eventSession.starts_at,
    timezone: eventSession.timezone,
    sessionStatus: eventSession.status,
    eventStatus: firstJoin(eventSession.events)?.status,
    purpose: "issued_access",
  });

  const { data: redemptions, error } = await supabase
    .from("combo_redemptions")
    .select(
      "id, combo_order_id, redemption_code, offer_name, quantity, raw_metadata, customers(id, whatsapp_phone), combo_orders!inner(status)",
    )
    .eq("customer_id", ticket.customer_id)
    .eq("event_id", eventSession.event_id)
    .eq("session_id", ticket.session_id)
    .eq("status", "issued")
    .eq("combo_orders.status", "paid")
    .returns<Array<{
      id: string;
      combo_order_id: string;
      redemption_code: string;
      offer_name: string;
      quantity: number;
      raw_metadata: Record<string, unknown> | null;
      customers:
        | { id: string; whatsapp_phone: string | null }
        | { id: string; whatsapp_phone: string | null }[]
        | null;
      combo_orders: { status: string } | { status: string }[] | null;
    }>>();

  if (error) {
    return { ok: false as const, releasedCount: 0 };
  }

  let releasedCount = 0;

  await Promise.all(
    (redemptions ?? []).map(async (redemption) => {
      const metadata = redemption.raw_metadata ?? {};
      if (typeof metadata.kitchen_arrived_at === "string") {
        return;
      }
      const customer = firstJoin(redemption.customers);
      const message = [
        "*PEDIDO EM PREPARO*",
        "",
        `Pedido: ${redemption.redemption_code}`,
        `Oferta: ${redemption.offer_name}`,
        `Quantidade: ${redemption.quantity}`,
        "",
        "Seu pedido já está sendo preparado.",
        "Em breve você receberá uma mensagem avisando quando estiver disponível para retirada.",
      ].join("\n");
      let notificationSent = false;

      if (
        canNotifyCustomer &&
        typeof metadata.arrival_preparation_notified_at !== "string" &&
        customer?.whatsapp_phone
      ) {
        const conversation = await getOrCreateOpenConversation({
          customerId: customer.id,
        });
        if (conversation.ok) {
          const sendResult = await sendZapiText({
            phone: customer.whatsapp_phone,
            message,
          });
          notificationSent = sendResult.ok;

          await saveWhatsAppMessage({
            conversationId: conversation.conversation.id,
            customerId: customer.id,
            direction: "outbound",
            messageType: "text",
            body: message,
            providerMessageId: sendResult.ok ? sendResult.providerMessageId : null,
            rawMetadata: buildWhatsAppOutboundMetadata({
              sendResult,
              messageType: "text",
              reason: "offer_preparation_started_on_arrival",
              businessContext: {
                combo_order_id: redemption.combo_order_id,
                combo_redemption_id: redemption.id,
              },
            }),
          });
          if (sendResult.ok) {
            await updateConversationAfterMessage({
              conversationId: conversation.conversation.id,
            });
          }
        }
      }

      const { data: transition, error: updateError } = await supabase.rpc(
        "record_combo_gate_arrival",
        {
          p_redemption_id: redemption.id,
          p_ticket_id: ticket.id,
          p_gate_session_id: input.gateSessionId,
          p_gate_label: input.gateLabel,
          p_validator_identifier: input.validatorIdentifier,
          p_notification_sent: notificationSent,
        },
      );

      if (!updateError && transition?.applied === true) releasedCount += 1;
    }),
  );

  return { ok: true as const, releasedCount };
}

export async function deliverComboReadyNotification(redemptionId: string) {
  const supabase = getSupabaseAdmin();
  const { data: redemption, error } = await supabase
    .from("combo_redemptions")
    .select("id, combo_order_id, customer_id, event_id, session_id, redemption_code, offer_name, quantity, status, qr_token_hash, qr_token_version, raw_metadata, customers(id, whatsapp_phone, name), events(title), event_sessions(starts_at, timezone), combo_orders!inner(status, source_order_id, combo_offers(description))")
    .eq("id", redemptionId)
    .maybeSingle<{
      id: string;
      combo_order_id: string;
      customer_id: string;
      event_id: string;
      session_id: string;
      redemption_code: string;
      offer_name: string;
      quantity: number;
      status: "issued" | "used" | "cancelled";
      qr_token_hash: string;
      qr_token_version: number | null;
      raw_metadata: Record<string, unknown> | null;
      customers: { id: string; whatsapp_phone: string | null; name: string | null } | Array<{ id: string; whatsapp_phone: string | null; name: string | null }> | null;
      events: { title: string } | Array<{ title: string }> | null;
      event_sessions: { starts_at: string; timezone?: string | null } | Array<{ starts_at: string; timezone?: string | null }> | null;
      combo_orders: { status: string; source_order_id: string | null; combo_offers: { description: string } | Array<{ description: string }> | null } | Array<{ status: string; source_order_id: string | null; combo_offers: { description: string } | Array<{ description: string }> | null }> | null;
    }>();

  const order = redemption ? firstJoin(redemption.combo_orders) : null;
  const customer = redemption ? firstJoin(redemption.customers) : null;
  const event = redemption ? firstJoin(redemption.events) : null;
  const eventSession = redemption ? firstJoin(redemption.event_sessions) : null;
  const offer = order ? firstJoin(order.combo_offers) : null;
  if (error || !redemption || !order || order.status !== "paid" || redemption.status !== "issued") {
    return { ok: false as const, reason: "not_found" as const, error };
  }
  if (redemption.qr_token_version == null) {
    return { ok: true as const, sent: false as const, reason: "legacy_token_not_reconstructable" as const };
  }
  const preparedVersion = Number(redemption.raw_metadata?.ready_delivery_version);
  if (preparedVersion !== redemption.qr_token_version || !customer?.whatsapp_phone) {
    return { ok: false as const, reason: "ready_delivery_not_prepared" as const };
  }

  const conversation = await getOrCreateOpenConversation({ customerId: customer.id });
  const conversationId = conversation.ok ? conversation.conversation.id : null;
  const itemLines = formatComboDescription(offer?.description ?? "").split("\n").filter(Boolean);
  const message = [
    "*SEU PEDIDO ESTÁ PRONTO. APRESENTE O QRCODE ABAIXO NO BAR PARA RETIRADA*",
    "",
    `Pedido: ${redemption.redemption_code}`,
    `Item: ${redemption.offer_name}`,
    `Quantidade: ${redemption.quantity}`,
    ...(itemLines.length ? ["", "*ITENS DO PEDIDO*", ...itemLines.map((item) => `- ${item}`)] : []),
    ...(event?.title ? [`Evento: ${event.title}`] : []),
  ].join("\n");
  const context = {
    combo_order_id: redemption.combo_order_id,
    combo_redemption_id: redemption.id,
    qr_token_version: preparedVersion,
  };
  const textKey = `combo-ready-redemption:${redemption.id}:text:v${preparedVersion}`;
  const qrKey = `combo-ready-redemption:${redemption.id}:qr:v${preparedVersion}`;
  const textDelivery = await getWhatsAppOutboundDeliveryByIdempotencyKey(textKey);
  if (!textDelivery.ok || !textDelivery.delivery) return { ok: false as const, reason: "text_intent_missing" as const };

  if (textDelivery.delivery.status !== "sent") {
    const claim = await claimWhatsAppOutboundDelivery(textDelivery.delivery.id);
    if (!claim.ok) return { ok: false as const, reason: "database_error" as const, error: claim.error };
    if (!claim.claimed) return { ok: true as const, sent: false as const, reason: "delivery_in_progress" as const };
    const send = await sendZapiText({ phone: customer.whatsapp_phone, message });
    const saved = await saveWhatsAppMessage({
      conversationId,
      customerId: customer.id,
      direction: "outbound",
      messageType: "text",
      body: message,
      providerMessageId: send.ok ? send.providerMessageId : null,
      rawMetadata: buildWhatsAppOutboundMetadata({ sendResult: send, messageType: "text", reason: "combo_ready_at_bar", businessContext: context }),
    });
    if (!send.ok || !saved.ok) {
      await markWhatsAppOutboundDeliveryFailed({ deliveryId: textDelivery.delivery.id, claimToken: claim.delivery.claim_token, error: !send.ok ? send.error : saved.error?.code ?? "whatsapp_message_persist_failed" });
      return { ok: true as const, sent: false as const, reason: !send.ok ? "zapi_failed" as const : "message_persist_failed" as const };
    }
    const marked = await markWhatsAppOutboundDeliverySent({ deliveryId: textDelivery.delivery.id, claimToken: claim.delivery.claim_token, providerMessageId: send.providerMessageId });
    if (!marked.ok) return { ok: false as const, reason: "database_error" as const };
    if (conversation.ok) await updateConversationAfterMessage({ conversationId: conversation.conversation.id });
  }

  const qrDelivery = await getWhatsAppOutboundDeliveryByIdempotencyKey(qrKey);
  if (!qrDelivery.ok || !qrDelivery.delivery) return { ok: false as const, reason: "qr_intent_missing" as const };
  if (qrDelivery.delivery.status === "sent") {
    const completed = await supabase.rpc("complete_combo_ready_delivery", { p_redemption_id: redemption.id, p_qr_token_version: preparedVersion });
    if (completed.error || completed.data !== true) return { ok: false as const, reason: "ready_completion_failed" as const, error: completed.error };
    return { ok: true as const, sent: true as const };
  }
  const claim = await claimWhatsAppOutboundDelivery(qrDelivery.delivery.id);
  if (!claim.ok) return { ok: false as const, reason: "database_error" as const, error: claim.error };
  if (!claim.claimed) return { ok: true as const, sent: false as const, reason: "delivery_in_progress" as const };

  const token = createComboRedemptionToken(redemption.combo_order_id, preparedVersion);
  if (!comboRedemptionTokenMatchesHash(token, redemption.qr_token_hash)) {
    await markWhatsAppOutboundDeliveryFailed({ deliveryId: qrDelivery.delivery.id, claimToken: claim.delivery.claim_token, error: "combo_qr_token_hash_mismatch" });
    return { ok: false as const, reason: "qr_token_hash_mismatch" as const };
  }
  let image: Awaited<ReturnType<typeof generateComboQrImage>>;
  try {
    const tableMapPlaceCode = await getComboRedemptionTableMapPlaceCode({ sourceOrderId: order.source_order_id, customerId: redemption.customer_id, eventId: redemption.event_id, sessionId: redemption.session_id });
    image = await generateComboQrImage({
      qrPayload: `combo:${redemption.id}:${token}`,
      comboName: redemption.offer_name,
      comboItems: offer?.description ?? null,
      eventTitle: event?.title ?? null,
      startsAt: eventSession?.starts_at ?? null,
      timezone: eventSession?.timezone ?? null,
      buyerName: customer.name,
      redemptionCode: redemption.redemption_code,
      tableMapPlaceCode,
    });
  } catch {
    await markWhatsAppOutboundDeliveryFailed({ deliveryId: qrDelivery.delivery.id, claimToken: claim.delivery.claim_token, error: "combo_qr_generation_failed" });
    return { ok: true as const, sent: false as const, reason: "qr_generation_failed" as const };
  }
  const caption = ["*QRCODE DO COMBO*", `Pedido: ${redemption.redemption_code}`, "", "Apresente este QR Code vermelho no bar para retirada."].join("\n");
  const send = await sendZapiImage({ phone: customer.whatsapp_phone, image, caption });
  const saved = await saveWhatsAppMessage({
    conversationId,
    customerId: customer.id,
    direction: "outbound",
    messageType: "image",
    body: caption,
    providerMessageId: send.ok ? send.providerMessageId : null,
    rawMetadata: buildWhatsAppOutboundMetadata({ sendResult: send, messageType: "image", reason: "combo_ready_qr", businessContext: context }),
  });
  if (!send.ok || !saved.ok) {
    await markWhatsAppOutboundDeliveryFailed({ deliveryId: qrDelivery.delivery.id, claimToken: claim.delivery.claim_token, error: !send.ok ? send.error : saved.error?.code ?? "whatsapp_message_persist_failed" });
    return { ok: true as const, sent: false as const, reason: !send.ok ? "zapi_failed" as const : "message_persist_failed" as const };
  }
  const marked = await markWhatsAppOutboundDeliverySent({ deliveryId: qrDelivery.delivery.id, claimToken: claim.delivery.claim_token, providerMessageId: send.providerMessageId });
  if (!marked.ok) return { ok: false as const, reason: "database_error" as const };
  if (conversation.ok) await updateConversationAfterMessage({ conversationId: conversation.conversation.id });
  const completed = await supabase.rpc("complete_combo_ready_delivery", { p_redemption_id: redemption.id, p_qr_token_version: preparedVersion });
  if (completed.error || completed.data !== true) return { ok: false as const, reason: "ready_completion_failed" as const, error: completed.error };
  return { ok: true as const, sent: true as const };
}

export async function startKitchenOrderPreparation(input: {
  token: string;
  redemptionId: string;
  deviceToken?: string | null;
}) {
  const session = await validateGateSessionToken(
    input.token,
    "kitchen",
    input.deviceToken,
  );
  if (!session.valid) {
    return { ok: false as const, reason: "invalid_session" as const };
  }

  const supabase = getSupabaseAdmin();
  let query = supabase
    .from("combo_redemptions")
    .select(
      "id, combo_order_id, customer_id, event_id, session_id, redemption_code, offer_name, quantity, status, qr_token_hash, qr_token_version, raw_metadata, customers(id, whatsapp_phone, name), events(title, city, state, venues(name)), event_sessions(starts_at, timezone, status, events(status)), combo_orders!inner(status, source_order_id, combo_offers(description))",
    )
    .eq("id", input.redemptionId);

  if (session.gateSession.eventId) {
    query = query.eq("event_id", session.gateSession.eventId);
  }
  if (session.gateSession.sessionId) {
    query = query.eq("session_id", session.gateSession.sessionId);
  }

  const { data: redemption, error } = await query.maybeSingle<{
    id: string;
    combo_order_id: string;
    customer_id: string;
    event_id: string;
    session_id: string;
    redemption_code: string;
    offer_name: string;
    quantity: number;
    status: "issued" | "used" | "cancelled";
    qr_token_hash: string;
    qr_token_version: number | null;
    raw_metadata: Record<string, unknown> | null;
    customers:
      | { id: string; whatsapp_phone: string | null; name: string | null }
      | { id: string; whatsapp_phone: string | null; name: string | null }[]
      | null;
    events:
      | { title: string; city?: string | null; state?: string | null; venues?: { name: string | null } | null }
      | { title: string; city?: string | null; state?: string | null; venues?: { name: string | null } | null }[]
      | null;
    event_sessions:
      | { starts_at: string; timezone?: string | null; status: string; events: { status: string } | null }
      | { starts_at: string; timezone?: string | null; status: string; events: { status: string } | null }[]
      | null;
    combo_orders:
      | {
          status: string;
          source_order_id: string | null;
          combo_offers:
            | { description: string }
            | { description: string }[]
            | null;
        }
      | {
          status: string;
          source_order_id: string | null;
          combo_offers:
            | { description: string }
            | { description: string }[]
            | null;
        }[]
      | null;
  }>();

  const order = redemption ? firstJoin(redemption.combo_orders) : null;
  const customer = redemption ? firstJoin(redemption.customers) : null;
  const event = redemption ? firstJoin(redemption.events) : null;
  const eventSession = redemption ? firstJoin(redemption.event_sessions) : null;
  const offer = order ? firstJoin(order.combo_offers) : null;
  const itemLines = formatComboDescription(offer?.description ?? "")
    .split("\n")
    .filter(Boolean);
  const metadata = redemption?.raw_metadata ?? {};
  const kitchenStatus =
    redemption?.status === "used"
      ? "delivered"
      : metadata.kitchen_status === "preparing"
        ? "preparing"
        : "pending";
  const readyNotifiedAt =
    typeof metadata.ready_notified_at === "string"
      ? metadata.ready_notified_at
      : null;

  if (
    error ||
    !redemption ||
    !order ||
    order.status !== "paid" ||
    redemption.status !== "issued"
  ) {
    return { ok: false as const, reason: "not_found" as const };
  }

  if (kitchenStatus === "delivered") {
    return { ok: false as const, reason: "already_delivered" as const };
  }

  const shouldNotifyReady =
    !readyNotifiedAt &&
    Boolean(customer?.whatsapp_phone) &&
    isPublicEventVisible({
      startsAt: eventSession?.starts_at,
      timezone: eventSession?.timezone,
      sessionStatus: eventSession?.status,
      eventStatus: firstJoin(eventSession?.events)?.status,
      purpose: "issued_access",
    });

  if (shouldNotifyReady && redemption.qr_token_version != null) {
    const nextVersion = redemption.qr_token_version + 1;
    const nextToken = createComboRedemptionToken(
      redemption.combo_order_id,
      nextVersion,
    );
    const prepared = await supabase.rpc("prepare_combo_ready_delivery", {
      p_redemption_id: redemption.id,
      p_expected_version: redemption.qr_token_version,
      p_next_version: nextVersion,
      p_next_qr_token_hash: hashComboRedemptionToken(nextToken),
    });
    if (prepared.error) {
      return { ok: false as const, reason: "update_failed" as const };
    }
    const delivery = await deliverComboReadyNotification(redemption.id);
    return {
      ok: delivery.ok,
      notificationSent: delivery.ok && delivery.sent,
      ...(!delivery.ok ? { reason: delivery.reason } : {}),
    };
  }

  if (kitchenStatus === "pending") {
    const { data: transition, error: updateError } = await supabase.rpc(
      "start_combo_kitchen_preparation",
      { p_redemption_id: redemption.id },
    );

    if (updateError || (!transition?.applied && !transition?.idempotent)) {
      return { ok: false as const, reason: "update_failed" as const };
    }
  }

  if (shouldNotifyReady && customer?.whatsapp_phone) {
    const message = [
      "*SEU PEDIDO ESTÁ PRONTO. APRESENTE O QRCODE ABAIXO NO BAR PARA RETIRADA*",
      "",
      `Pedido: ${redemption.redemption_code}`,
      `Item: ${redemption.offer_name}`,
      `Quantidade: ${redemption.quantity}`,
      ...(itemLines.length
        ? ["", "*ITENS DO PEDIDO*", ...itemLines.map((item) => `- ${item}`)]
        : []),
      ...(event?.title ? [`Evento: ${event.title}`] : []),
    ].join("\n");
    const conversation = await getOrCreateOpenConversation({
      customerId: customer.id,
    });
    let textResult: Awaited<ReturnType<typeof sendZapiText>> = {
      ok: false,
      error: "conversation_not_available",
    };
    let qrResult: Awaited<ReturnType<typeof sendZapiImage>> = {
      ok: false,
      error: "qr_not_sent",
    };
    const newQrToken = randomBytes(32).toString("base64url");
    const newQrTokenHash = hashSecret(newQrToken);

    if (conversation.ok) {
      textResult = await sendZapiText({
        phone: customer.whatsapp_phone,
        message,
      });
      await saveWhatsAppMessage({
        conversationId: conversation.conversation.id,
        customerId: customer.id,
        direction: "outbound",
        messageType: "text",
        body: message,
        providerMessageId: textResult.ok ? textResult.providerMessageId : null,
        rawMetadata: buildWhatsAppOutboundMetadata({
          sendResult: textResult,
          messageType: "text",
          reason: "combo_ready_at_bar",
          businessContext: {
            combo_order_id: redemption.combo_order_id,
            combo_redemption_id: redemption.id,
          },
        }),
      });
    }

    if (textResult.ok) {
      if (conversation.ok) {
        await updateConversationAfterMessage({
          conversationId: conversation.conversation.id,
        });
      }

      const { error: rotateError } = await supabase
        .from("combo_redemptions")
        .update({
          qr_token_hash: newQrTokenHash,
        })
        .eq("id", redemption.id)
        .eq("status", "issued");

      if (!rotateError) {
        const tableMapPlaceCode = await getComboRedemptionTableMapPlaceCode({
          sourceOrderId: order.source_order_id,
          customerId: redemption.customer_id,
          eventId: redemption.event_id,
          sessionId: redemption.session_id,
        });
        const image = await generateComboQrImage({
          qrPayload: `combo:${redemption.id}:${newQrToken}`,
          comboName: redemption.offer_name,
          comboItems: offer?.description ?? null,
          eventTitle: event?.title ?? null,
          startsAt: eventSession?.starts_at ?? null,
          timezone: eventSession?.timezone ?? null,
          buyerName: customer.name,
          redemptionCode: redemption.redemption_code,
          tableMapPlaceCode,
        });
        const caption = [
          "*QRCODE DO COMBO*",
          `Pedido: ${redemption.redemption_code}`,
          "",
          "Apresente este QR Code vermelho no bar para retirada.",
        ].join("\n");
        qrResult = await sendZapiImage({
          phone: customer.whatsapp_phone,
          image,
          caption,
        });

        if (conversation.ok) {
          await saveWhatsAppMessage({
            conversationId: conversation.conversation.id,
            customerId: customer.id,
            direction: "outbound",
            messageType: "image",
            body: caption,
            providerMessageId: qrResult.ok ? qrResult.providerMessageId : null,
            rawMetadata: buildWhatsAppOutboundMetadata({
              sendResult: qrResult,
              messageType: "image",
              reason: "combo_ready_qr",
              businessContext: {
                combo_order_id: redemption.combo_order_id,
                combo_redemption_id: redemption.id,
              },
            }),
          });
          if (qrResult.ok) {
            await updateConversationAfterMessage({
              conversationId: conversation.conversation.id,
            });
          }
        }

        if (!qrResult.ok) {
          await supabase
            .from("combo_redemptions")
            .update({ qr_token_hash: redemption.qr_token_hash })
            .eq("id", redemption.id)
            .eq("status", "issued")
            .eq("qr_token_hash", newQrTokenHash);
        }
      }
    }

    if (textResult.ok && qrResult.ok) {
      await supabase.rpc("complete_legacy_combo_ready_recovery", {
        p_redemption_id: redemption.id,
      });
    }

    return {
      ok: true as const,
      notificationSent: textResult.ok && qrResult.ok,
    };
  }

  return { ok: true as const, notificationSent: Boolean(readyNotifiedAt) };
}

export async function validateComboRedemptionScan(input: {
  kitchenSessionToken: string;
  comboToken: string;
  deviceToken?: string | null;
}): Promise<ComboRedemptionScanResult> {
  const kitchenSession = await validateGateSessionToken(
    input.kitchenSessionToken,
    "kitchen",
    input.deviceToken,
    "reader",
  );

  if (!kitchenSession.valid) {
    return {
      allowed: false,
      result: "kitchen_session_invalid",
      message: "Sessao de cozinha invalida ou expirada.",
    };
  }

  const parsedToken = parseComboToken(input.comboToken);

  if (!parsedToken) {
    await getSupabaseAdmin().from("combo_redemption_events").insert({
      kitchen_session_id: kitchenSession.gateSession.id,
      result: "not_found",
      kitchen_label: kitchenSession.gateSession.gateLabel,
      validator_identifier: kitchenSession.gateSession.validatorIdentifier,
      metadata: {
        source: "kitchen_scan",
        reason: "invalid_combo_token",
      },
    });

    return {
      allowed: false,
      result: "not_found",
      message: "Combo nao encontrado ou QR Code invalido.",
    };
  }

  const supabase = getSupabaseAdmin();
  const { data: scannedRedemption } = await supabase
    .from("combo_redemptions")
    .select(
      "id, combo_order_id, customer_id, event_id, session_id, redemption_code, offer_name, quantity, status, qr_token_hash, qr_token_version, raw_metadata, customers(id, whatsapp_phone), events(title), combo_orders!inner(id, status, source_order_id, combo_offers(description))",
    )
    .eq("id", parsedToken.redemptionId)
    .eq("qr_token_hash", hashSecret(parsedToken.token))
    .maybeSingle<{
      id: string;
      combo_order_id: string;
      customer_id: string;
      event_id: string;
      session_id: string;
      redemption_code: string;
      offer_name: string;
      quantity: number;
      status: "issued" | "used" | "cancelled";
      qr_token_hash: string;
      qr_token_version: number | null;
      raw_metadata: Record<string, unknown> | null;
      customers:
        | { id: string; whatsapp_phone: string | null }
        | { id: string; whatsapp_phone: string | null }[]
        | null;
      events: { title: string } | { title: string }[] | null;
      combo_orders:
        | {
            id: string;
            status: string;
            source_order_id: string | null;
            combo_offers:
              | { description: string }
              | { description: string }[]
              | null;
          }
        | {
            id: string;
            status: string;
            source_order_id: string | null;
            combo_offers:
              | { description: string }
              | { description: string }[]
              | null;
          }[]
        | null;
    }>();

  const scannedOrder = scannedRedemption
    ? firstJoin(scannedRedemption.combo_orders)
    : null;
  const wrongEvent =
    scannedRedemption &&
    kitchenSession.gateSession.eventId &&
    scannedRedemption.event_id !== kitchenSession.gateSession.eventId;
  const wrongSession =
    scannedRedemption &&
    kitchenSession.gateSession.sessionId &&
      scannedRedemption.session_id !== kitchenSession.gateSession.sessionId;

  if (
    scannedRedemption &&
    scannedOrder?.status === "paid" &&
    scannedRedemption.status === "issued" &&
    !wrongEvent &&
    !wrongSession &&
    typeof scannedRedemption.raw_metadata?.delivery_choice_confirmed_at !== "string"
  ) {
    const existingMetadata = scannedRedemption.raw_metadata ?? {};
    const customer = firstJoin(scannedRedemption.customers);
    const sourceOrderId =
      typeof scannedOrder.source_order_id === "string"
        ? scannedOrder.source_order_id
        : null;

    if (!sourceOrderId || !customer?.whatsapp_phone) {
      return {
        allowed: false,
        result: "denied",
        message:
          "Combo pago, mas sem reserva de mesa/bistr? vinculada ou telefone do cliente. A entrega nao foi concluida.",
      };
    }

    const { data: reservation } = await supabase
      .from("official_table_map_reservations")
      .select("place_code, status")
      .eq("order_id", sourceOrderId)
      .eq("customer_id", scannedRedemption.customer_id)
      .eq("event_id", scannedRedemption.event_id)
      .eq("session_id", scannedRedemption.session_id)
      .eq("status", "paid")
      .maybeSingle<ComboDeliveryReservationRow>();

    if (!reservation?.place_code) {
      return {
        allowed: false,
        result: "denied",
        message:
          "Combo pago, mas a reserva de mesa/bistr? nao esta valida. A entrega nao foi concluida.",
      };
    }

    const now = new Date().toISOString();
    const placeLabel = formatComboDeliveryPlace(reservation.place_code);
    if (typeof existingMetadata.delivery_choice_confirmed_at === "string") {
      return {
        allowed: true,
        result: "allowed",
        message: `A forma de entrega desse combo ja foi escolhida para ${String(existingMetadata.delivery_place_label ?? placeLabel)}. Mantenha o QR Code vermelho aberto para apresentar na entrega.`,
        redemption: {
          redemptionId: scannedRedemption.id,
          redemptionCode: scannedRedemption.redemption_code,
          offerName: scannedRedemption.offer_name,
          quantity: scannedRedemption.quantity,
          status: scannedRedemption.status,
        },
      };
    }

    const alreadyPrompted =
      typeof existingMetadata.delivery_choice_requested_at === "string";
    let promptSent = alreadyPrompted;

    if (!alreadyPrompted) {
      const conversation = await getOrCreateOpenConversation({
        customerId: customer.id,
      });

      if (!conversation.ok) {
        return {
          allowed: false,
          result: "denied",
          message:
            "Combo valido, mas nao foi possivel abrir a conversa do cliente. A entrega nao foi concluida.",
        };
      }

      const message = buildComboDeliveryChoiceMessage({
        product: scannedRedemption.offer_name,
        placeLabel,
      });
      const sendResult = await sendZapiText({
        phone: customer.whatsapp_phone,
        message,
      });
      promptSent = sendResult.ok;

      await saveWhatsAppMessage({
        conversationId: conversation.conversation.id,
        customerId: customer.id,
        direction: "outbound",
        messageType: "text",
        body: message,
        providerMessageId: sendResult.ok ? sendResult.providerMessageId : null,
        rawMetadata: buildWhatsAppOutboundMetadata({
          sendResult,
          messageType: "text",
          reason: "combo_delivery_choice_requested",
          businessContext: {
            combo_order_id: scannedRedemption.combo_order_id,
            combo_redemption_id: scannedRedemption.id,
            place_code: reservation.place_code,
          },
        }),
      });

      if (sendResult.ok) {
        await updateConversationAfterMessage({
          conversationId: conversation.conversation.id,
          context: {
            state: "combo_delivery_confirming",
            step: "combo_delivery_confirming",
            comboDeliveryConfirmation: {
              redemptionId: scannedRedemption.id,
              comboOrderId: scannedRedemption.combo_order_id,
              placeCode: reservation.place_code,
              placeLabel,
              offerName: scannedRedemption.offer_name,
              createdAt: now,
            },
          },
        });
      }
    }

    const { data: transition, error: transitionError } = await supabase.rpc(
      "record_combo_delivery_choice_prompt",
      {
        p_redemption_id: scannedRedemption.id,
        p_place_code: reservation.place_code,
        p_place_label: placeLabel,
        p_prompt_sent: promptSent,
        p_kitchen_session_id: kitchenSession.gateSession.id,
        p_kitchen_label: kitchenSession.gateSession.gateLabel,
        p_validator_identifier: kitchenSession.gateSession.validatorIdentifier,
      },
    );
    if (transitionError || transition?.reason === "status_incompatible") {
      return {
        allowed: false,
        result: "denied",
        message: "O estado deste combo mudou durante a leitura. Leia o QR Code novamente.",
      };
    }
    if (transition?.reason === "choice_already_confirmed") {
      return {
        allowed: true,
        result: "allowed",
        message: `A forma de entrega desse combo ja foi escolhida para ${String(transition.place_label ?? placeLabel)}. Mantenha o QR Code vermelho aberto para apresentar na entrega.`,
        redemption: {
          redemptionId: scannedRedemption.id,
          redemptionCode: scannedRedemption.redemption_code,
          offerName: scannedRedemption.offer_name,
          quantity: scannedRedemption.quantity,
          status: scannedRedemption.status,
        },
      };
    }
    if (transition?.applied !== true) {
      return {
        allowed: false,
        result: "denied",
        message: "N?o foi poss?vel registrar a leitura deste combo agora.",
      };
    }

    return {
      allowed: true,
      result: "allowed",
      message:
        "COMBO VALIDADO. A entrega ainda nao foi concluida; aguarde o cliente responder OK ou 1 no WhatsApp e mantenha o QR vermelho aberto.",
      redemption: {
        redemptionId: scannedRedemption.id,
        redemptionCode: scannedRedemption.redemption_code,
        offerName: scannedRedemption.offer_name,
        quantity: scannedRedemption.quantity,
        status: scannedRedemption.status,
      },
    };
  }

  if (
    scannedRedemption &&
    scannedOrder?.status === "paid" &&
    scannedRedemption.status === "issued" &&
    !wrongEvent &&
    !wrongSession &&
    scannedRedemption.raw_metadata?.kitchen_status === "preparing" &&
    typeof scannedRedemption.raw_metadata?.ready_notified_at !== "string"
  ) {
    const customer = firstJoin(scannedRedemption.customers);
    const event = firstJoin(scannedRedemption.events);
    const offer = firstJoin(scannedOrder.combo_offers);
    const itemLines = formatComboDescription(offer?.description ?? "")
      .split("\n")
      .filter(Boolean);

    if (scannedRedemption.qr_token_version != null) {
      return {
        allowed: false,
        result: "denied",
        message:
          "PEDIDO EM PREPARO. A notificacao READY e o QR Code ainda estao sendo processados pela fila de entrega.",
      };
    }

    if (!customer?.whatsapp_phone) {
      return {
        allowed: false,
        result: "denied",
        message:
          "PEDIDO EM PREPARO, MAS O CLIENTE AINDA NAO FOI AVISADO. Telefone nao encontrado; nao foi possivel concluir a entrega.",
      };
    }

    const message = [
      "*SEU PEDIDO ESTÁ PRONTO PARA RETIRADA NO BAR*",
      "",
      `Pedido: ${scannedRedemption.redemption_code}`,
      `Item: ${scannedRedemption.offer_name}`,
      `Quantidade: ${scannedRedemption.quantity}`,
      ...(itemLines.length
        ? ["", "*ITENS PRONTOS*", ...itemLines.map((item) => `- ${item}`)]
        : []),
      ...(event?.title ? [`Evento: ${event.title}`] : []),
    ].join("\n");
    const conversation = await getOrCreateOpenConversation({
      customerId: customer.id,
    });
    if (!conversation.ok) {
      return {
        allowed: false,
        result: "denied",
        message:
          "PEDIDO EM PREPARO, MAS O AVISO AO CLIENTE FALHOU. A entrega nao foi concluida; reenvie o aviso pela cozinha.",
      };
    }

    const sendResult = await sendZapiText({
      phone: customer.whatsapp_phone,
      message,
    });
    await saveWhatsAppMessage({
      conversationId: conversation.conversation.id,
      customerId: customer.id,
      direction: "outbound",
      messageType: "text",
      body: message,
      providerMessageId: sendResult.ok ? sendResult.providerMessageId : null,
      rawMetadata: buildWhatsAppOutboundMetadata({
        sendResult,
        messageType: "text",
        reason: "combo_ready_notification_recovered_at_scan",
        businessContext: {
          combo_order_id: scannedRedemption.combo_order_id,
          combo_redemption_id: scannedRedemption.id,
        },
      }),
    });
    if (sendResult.ok) {
      await updateConversationAfterMessage({
        conversationId: conversation.conversation.id,
      });
    }

    if (!sendResult.ok) {
      return {
        allowed: false,
        result: "denied",
        message:
          "PEDIDO EM PREPARO, MAS O AVISO AO CLIENTE FALHOU. A entrega nao foi concluida; reenvie o aviso pela cozinha.",
      };
    }

    const { data: transition, error: notificationUpdateError } = await supabase.rpc(
      "complete_legacy_combo_ready_recovery",
      { p_redemption_id: scannedRedemption.id },
    );

    if (notificationUpdateError || (!transition?.applied && !transition?.idempotent)) {
      return {
        allowed: false,
        result: "denied",
        message:
          "Cliente avisado, mas a confirmacao nao foi salva. Leia novamente antes de entregar.",
      };
    }
  }

  if (
    scannedRedemption &&
    scannedOrder?.status === "paid" &&
    scannedRedemption.status === "issued" &&
    !wrongEvent &&
    !wrongSession &&
    scannedRedemption.raw_metadata?.kitchen_status !== "preparing"
  ) {
    const metadata = scannedRedemption.raw_metadata ?? {};
    const customer = firstJoin(scannedRedemption.customers);
    const alreadyNotified =
      typeof metadata.awaiting_preparation_notified_at === "string";
    let notificationSent = alreadyNotified;

    if (!alreadyNotified && customer?.whatsapp_phone) {
      const message = [
        "*PEDIDO RECEBIDO*",
        "",
        `Pedido: ${scannedRedemption.redemption_code}`,
        `Item: ${scannedRedemption.offer_name}`,
        `Quantidade: ${scannedRedemption.quantity}`,
        "",
        "Seu pedido ainda nao esta em preparo.",
        "Em breve enviaremos uma mensagem avisando quando seus produtos estiverem disponiveis para retirada.",
      ].join("\n");
      const conversation = await getOrCreateOpenConversation({
        customerId: customer.id,
      });
      if (conversation.ok) {
        const sendResult = await sendZapiText({
          phone: customer.whatsapp_phone,
          message,
        });
        notificationSent = sendResult.ok;

        await saveWhatsAppMessage({
          conversationId: conversation.conversation.id,
          customerId: customer.id,
          direction: "outbound",
          messageType: "text",
          body: message,
          providerMessageId: sendResult.ok ? sendResult.providerMessageId : null,
          rawMetadata: buildWhatsAppOutboundMetadata({
            sendResult,
            messageType: "text",
            reason: "combo_awaiting_preparation",
            businessContext: {
              combo_order_id: scannedRedemption.combo_order_id,
              combo_redemption_id: scannedRedemption.id,
            },
          }),
        });
        if (sendResult.ok) {
          await updateConversationAfterMessage({
            conversationId: conversation.conversation.id,
          });
        }
      }
    }

    const { data: transition, error: transitionError } = await supabase.rpc(
      "record_combo_awaiting_preparation",
      {
        p_redemption_id: scannedRedemption.id,
        p_notification_sent: notificationSent,
        p_kitchen_session_id: kitchenSession.gateSession.id,
        p_kitchen_label: kitchenSession.gateSession.gateLabel,
        p_validator_identifier: kitchenSession.gateSession.validatorIdentifier,
      },
    );
    if (transitionError) {
      return {
        allowed: false,
        result: "denied",
        message: "N?o foi poss?vel registrar a leitura deste combo agora.",
      };
    }
    if (transition?.reason === "preparation_started") {
      return {
        allowed: false,
        result: "denied",
        message: "O preparo deste pedido iniciou durante a leitura. Aguarde a notificacao READY.",
      };
    }
    if (transition?.applied !== true) {
      return {
        allowed: false,
        result: "denied",
        message: "O estado deste combo mudou durante a leitura. Leia o QR Code novamente.",
      };
    }

    return {
      allowed: false,
      result: "awaiting_preparation",
      message:
        "PEDIDO AINDA NAO ESTA EM PREPARO. Ele foi mantido em Pedidos e o cliente sera avisado quando estiver dispon?vel para retirada.",
      redemption: {
        redemptionId: scannedRedemption.id,
        redemptionCode: scannedRedemption.redemption_code,
        offerName: scannedRedemption.offer_name,
        quantity: scannedRedemption.quantity,
        status: scannedRedemption.status,
      },
    };
  }

  const { data, error } = await supabase.rpc("validate_combo_redemption", {
    p_redemption_id: parsedToken.redemptionId,
    p_qr_token_hash: hashSecret(parsedToken.token),
    p_kitchen_session_id: kitchenSession.gateSession.id,
    p_kitchen_label: kitchenSession.gateSession.gateLabel,
    p_validator_identifier: kitchenSession.gateSession.validatorIdentifier,
    p_event_id: kitchenSession.gateSession.eventId,
    p_session_id: kitchenSession.gateSession.sessionId,
    p_metadata: {
      source: "kitchen_scan",
      gate_session_token_hash: hashGateSessionToken(input.kitchenSessionToken),
      kitchen_device_binding_hash: input.deviceToken
        ? hashKitchenDeviceToken(input.deviceToken)
        : null,
    },
  });

  if (error || !data || typeof data !== "object") {
    return {
      allowed: false,
      result: "denied",
      message: "N?o foi poss?vel validar este combo agora.",
    };
  }

  const result = data as ComboRedemptionScanResult;

  return {
    allowed: Boolean(result.allowed),
    result: result.result,
    message: result.message,
    redemption: result.redemption ?? null,
  };
}

export async function confirmComboDeliveryChoice(input: {
  customerId: string;
  redemptionId: string;
  choice: ComboDeliveryChoice;
}) {
  const supabase = getSupabaseAdmin();
  const { data: redemption, error } = await supabase
    .from("combo_redemptions")
    .select(
      "id, combo_order_id, customer_id, event_id, session_id, redemption_code, offer_name, quantity, status, combo_orders!inner(id, status, source_order_id)",
    )
    .eq("id", input.redemptionId)
    .eq("customer_id", input.customerId)
    .maybeSingle<{
      id: string;
      combo_order_id: string;
      customer_id: string;
      event_id: string;
      session_id: string;
      redemption_code: string;
      offer_name: string;
      quantity: number;
      status: "issued" | "used" | "cancelled";
      combo_orders:
        | { id: string; status: string; source_order_id: string | null }
        | Array<{ id: string; status: string; source_order_id: string | null }>
        | null;
    }>();
  const order = redemption ? firstJoin(redemption.combo_orders) : null;

  if (error || !redemption || !order || order.status !== "paid" || redemption.status !== "issued") {
    return { ok: false as const, reason: "not_found" as const };
  }

  const sourceOrderId = order.source_order_id;
  if (!sourceOrderId) return { ok: false as const, reason: "place_not_found" as const };

  const { data: reservation } = await supabase
    .from("official_table_map_reservations")
    .select("place_code, status")
    .eq("order_id", sourceOrderId)
    .eq("customer_id", redemption.customer_id)
    .eq("event_id", redemption.event_id)
    .eq("session_id", redemption.session_id)
    .eq("status", "paid")
    .maybeSingle<ComboDeliveryReservationRow>();

  if (!reservation?.place_code) {
    return { ok: false as const, reason: "place_not_found" as const };
  }

  const placeLabel = formatComboDeliveryPlace(reservation.place_code);
  const { data: transition, error: updateError } = await supabase.rpc(
    "confirm_combo_delivery_choice",
    {
      p_redemption_id: redemption.id,
      p_customer_id: input.customerId,
      p_choice: input.choice,
      p_place_code: reservation.place_code,
      p_place_label: placeLabel,
    },
  );

  if (updateError || !transition || transition.conflict === true) {
    return {
      ok: false as const,
      reason: transition?.conflict === true
        ? "choice_conflict" as const
        : "update_failed" as const,
    };
  }
  if (transition.applied !== true && transition.idempotent !== true) {
    return { ok: false as const, reason: "update_failed" as const };
  }

  return {
    ok: true as const,
    duplicate: transition.idempotent === true,
    choice: transition.choice === "waiter" ? "waiter" as const : "table" as const,
    placeLabel: String(transition.place_label ?? placeLabel),
    offerName: redemption.offer_name,
  };
}
