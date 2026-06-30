import "server-only";

import { createHash, randomBytes } from "crypto";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { validateGateSessionToken } from "@/lib/tickets/services/gateSessions";
import {
  getOrCreateOpenConversation,
  updateConversationAfterMessage,
} from "@/lib/tickets/services/conversations";
import { saveWhatsAppMessage } from "@/lib/tickets/services/messages";
import { sendZapiImage, sendZapiText } from "@/lib/zapi/client";
import {
  formatComboDescription,
  generateComboQrImage,
} from "@/lib/tickets/services/comboOffers";

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

type GateTicketForKitchenRow = {
  id: string;
  customer_id: string;
  session_id: string;
  event_sessions:
    | { event_id: string }
    | { event_id: string }[]
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
    .select("id, customer_id, session_id, event_sessions!inner(event_id)")
    .eq("id", input.ticketId)
    .maybeSingle<GateTicketForKitchenRow>();

  if (ticketError || !ticket) {
    return { ok: false as const, releasedCount: 0 };
  }

  const eventSession = firstJoin(ticket.event_sessions);
  if (!eventSession?.event_id) {
    return { ok: false as const, releasedCount: 0 };
  }

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

  const releasedAt = new Date().toISOString();
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
        typeof metadata.arrival_preparation_notified_at !== "string" &&
        customer?.whatsapp_phone
      ) {
        const sendResult = await sendZapiText({
          phone: customer.whatsapp_phone,
          message,
        });
        notificationSent = sendResult.ok;

        if (sendResult.ok) {
          const conversation = await getOrCreateOpenConversation({
            customerId: customer.id,
          });
          if (conversation.ok) {
            await saveWhatsAppMessage({
              conversationId: conversation.conversation.id,
              customerId: customer.id,
              direction: "outbound",
              messageType: "text",
              body: message,
              providerMessageId: sendResult.providerMessageId,
              rawMetadata: {
                provider: "zapi",
                reason: "offer_preparation_started_on_arrival",
                combo_order_id: redemption.combo_order_id,
                combo_redemption_id: redemption.id,
              },
            });
            await updateConversationAfterMessage({
              conversationId: conversation.conversation.id,
            });
          }
        }
      }

      const { error: updateError } = await supabase
        .from("combo_redemptions")
        .update({
          raw_metadata: {
            ...metadata,
            kitchen_visible: true,
            kitchen_arrived_at: releasedAt,
            kitchen_released_at:
              typeof metadata.kitchen_released_at === "string"
                ? metadata.kitchen_released_at
                : releasedAt,
            kitchen_released_by: "gate_ticket_entry",
            kitchen_released_by_ticket_id: ticket.id,
            kitchen_released_gate_session_id: input.gateSessionId,
            kitchen_released_gate_label: input.gateLabel,
            kitchen_released_validator_identifier: input.validatorIdentifier,
            ...(notificationSent
              ? { arrival_preparation_notified_at: releasedAt }
              : {}),
          },
        })
        .eq("id", redemption.id);

      if (!updateError) releasedCount += 1;
    }),
  );

  return { ok: true as const, releasedCount };
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
      "id, combo_order_id, event_id, session_id, redemption_code, offer_name, quantity, status, qr_token_hash, raw_metadata, customers(id, whatsapp_phone), events(title), combo_orders!inner(status, combo_offers(description))",
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
    event_id: string;
    session_id: string;
    redemption_code: string;
    offer_name: string;
    quantity: number;
    status: "issued" | "used" | "cancelled";
    qr_token_hash: string;
    raw_metadata: Record<string, unknown> | null;
    customers:
      | { id: string; whatsapp_phone: string | null }
      | { id: string; whatsapp_phone: string | null }[]
      | null;
    events: { title: string } | { title: string }[] | null;
    combo_orders:
      | {
          status: string;
          combo_offers:
            | { description: string }
            | { description: string }[]
            | null;
        }
      | {
          status: string;
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

  if (kitchenStatus === "pending") {
    const preparingAt = new Date().toISOString();
    const { error: updateError } = await supabase
      .from("combo_redemptions")
      .update({
        raw_metadata: {
          ...metadata,
          kitchen_status: "preparing",
          preparing_at: preparingAt,
        },
      })
      .eq("id", redemption.id)
      .eq("status", "issued");

    if (updateError) {
      return { ok: false as const, reason: "update_failed" as const };
    }
  }

  if (!readyNotifiedAt && customer?.whatsapp_phone) {
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
    const textResult = await sendZapiText({
      phone: customer.whatsapp_phone,
      message,
    });
    let qrResult: Awaited<ReturnType<typeof sendZapiImage>> = {
      ok: false,
      error: "qr_not_sent",
    };
    const newQrToken = randomBytes(32).toString("base64url");
    const newQrTokenHash = hashSecret(newQrToken);

    if (textResult.ok) {
      const conversation = await getOrCreateOpenConversation({
        customerId: customer.id,
      });
      if (conversation.ok) {
        await saveWhatsAppMessage({
          conversationId: conversation.conversation.id,
          customerId: customer.id,
          direction: "outbound",
          messageType: "text",
          body: message,
          providerMessageId: textResult.providerMessageId,
          rawMetadata: {
            provider: "zapi",
            reason: "combo_ready_at_bar",
            combo_order_id: redemption.combo_order_id,
            combo_redemption_id: redemption.id,
          },
        });
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
        const image = await generateComboQrImage(
          `combo:${redemption.id}:${newQrToken}`,
        );
        const caption =
          "*QRCODE DO COMBO*\nApresente este QR Code vermelho no bar para retirada.";
        qrResult = await sendZapiImage({
          phone: customer.whatsapp_phone,
          image,
          caption,
        });

        if (qrResult.ok && conversation.ok) {
          await saveWhatsAppMessage({
            conversationId: conversation.conversation.id,
            customerId: customer.id,
            direction: "outbound",
            messageType: "image",
            body: caption,
            providerMessageId: qrResult.providerMessageId,
            rawMetadata: {
              provider: "zapi",
              reason: "combo_ready_qr",
              combo_order_id: redemption.combo_order_id,
              combo_redemption_id: redemption.id,
            },
          });
          await updateConversationAfterMessage({
            conversationId: conversation.conversation.id,
          });
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
      await supabase
        .from("combo_redemptions")
        .update({
          raw_metadata: {
            ...metadata,
            kitchen_status: "preparing",
            preparing_at:
              typeof metadata.preparing_at === "string"
                ? metadata.preparing_at
                : new Date().toISOString(),
            ready_notified_at: new Date().toISOString(),
          },
        })
        .eq("id", redemption.id)
        .eq("status", "issued");
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
      "id, combo_order_id, event_id, session_id, redemption_code, offer_name, quantity, status, qr_token_hash, raw_metadata, customers(id, whatsapp_phone), events(title), combo_orders!inner(status, combo_offers(description))",
    )
    .eq("id", parsedToken.redemptionId)
    .eq("qr_token_hash", hashSecret(parsedToken.token))
    .maybeSingle<{
      id: string;
      combo_order_id: string;
      event_id: string;
      session_id: string;
      redemption_code: string;
      offer_name: string;
      quantity: number;
      status: "issued" | "used" | "cancelled";
      qr_token_hash: string;
      raw_metadata: Record<string, unknown> | null;
      customers:
        | { id: string; whatsapp_phone: string | null }
        | { id: string; whatsapp_phone: string | null }[]
        | null;
      events: { title: string } | { title: string }[] | null;
      combo_orders:
        | {
            status: string;
            combo_offers:
              | { description: string }
              | { description: string }[]
              | null;
          }
        | {
            status: string;
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
    scannedRedemption.raw_metadata?.kitchen_status === "preparing" &&
    typeof scannedRedemption.raw_metadata?.ready_notified_at !== "string"
  ) {
    const metadata = scannedRedemption.raw_metadata ?? {};
    const customer = firstJoin(scannedRedemption.customers);
    const event = firstJoin(scannedRedemption.events);
    const offer = firstJoin(scannedOrder.combo_offers);
    const itemLines = formatComboDescription(offer?.description ?? "")
      .split("\n")
      .filter(Boolean);

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
    const sendResult = await sendZapiText({
      phone: customer.whatsapp_phone,
      message,
    });

    if (!sendResult.ok) {
      return {
        allowed: false,
        result: "denied",
        message:
          "PEDIDO EM PREPARO, MAS O AVISO AO CLIENTE FALHOU. A entrega nao foi concluida; reenvie o aviso pela cozinha.",
      };
    }

    const conversation = await getOrCreateOpenConversation({
      customerId: customer.id,
    });
    if (conversation.ok) {
      await saveWhatsAppMessage({
        conversationId: conversation.conversation.id,
        customerId: customer.id,
        direction: "outbound",
        messageType: "text",
        body: message,
        providerMessageId: sendResult.providerMessageId,
        rawMetadata: {
          provider: "zapi",
          reason: "combo_ready_notification_recovered_at_scan",
          combo_order_id: scannedRedemption.combo_order_id,
          combo_redemption_id: scannedRedemption.id,
        },
      });
      await updateConversationAfterMessage({
        conversationId: conversation.conversation.id,
      });
    }

    const notifiedAt = new Date().toISOString();
    const { error: notificationUpdateError } = await supabase
      .from("combo_redemptions")
      .update({
        raw_metadata: {
          ...metadata,
          ready_notified_at: notifiedAt,
          ready_notification_recovered_at_scan: notifiedAt,
        },
      })
      .eq("id", scannedRedemption.id)
      .eq("status", "issued");

    if (notificationUpdateError) {
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
    const now = new Date().toISOString();
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
      const sendResult = await sendZapiText({
        phone: customer.whatsapp_phone,
        message,
      });
      notificationSent = sendResult.ok;

      if (sendResult.ok) {
        const conversation = await getOrCreateOpenConversation({
          customerId: customer.id,
        });
        if (conversation.ok) {
          await saveWhatsAppMessage({
            conversationId: conversation.conversation.id,
            customerId: customer.id,
            direction: "outbound",
            messageType: "text",
            body: message,
            providerMessageId: sendResult.providerMessageId,
            rawMetadata: {
              provider: "zapi",
              reason: "combo_awaiting_preparation",
              combo_order_id: scannedRedemption.combo_order_id,
              combo_redemption_id: scannedRedemption.id,
            },
          });
          await updateConversationAfterMessage({
            conversationId: conversation.conversation.id,
          });
        }
      }
    }

    const { data: latestRedemption } = await supabase
      .from("combo_redemptions")
      .select("raw_metadata")
      .eq("id", scannedRedemption.id)
      .eq("status", "issued")
      .maybeSingle<{ raw_metadata: Record<string, unknown> | null }>();
    const latestMetadata = latestRedemption?.raw_metadata ?? metadata;

    await supabase
      .from("combo_redemptions")
      .update({
        raw_metadata: {
          ...latestMetadata,
          kitchen_visible: true,
          kitchen_released_at:
            typeof latestMetadata.kitchen_released_at === "string"
              ? latestMetadata.kitchen_released_at
              : now,
          kitchen_released_by: "offer_reader_scan",
          ...(notificationSent &&
          typeof latestMetadata.awaiting_preparation_notified_at !== "string"
            ? { awaiting_preparation_notified_at: now }
            : {}),
        },
      })
      .eq("id", scannedRedemption.id)
      .eq("status", "issued");

    await supabase.from("combo_redemption_events").insert({
      combo_redemption_id: scannedRedemption.id,
      combo_order_id: scannedRedemption.combo_order_id,
      kitchen_session_id: kitchenSession.gateSession.id,
      result: "denied",
      redemption_code: scannedRedemption.redemption_code,
      offer_name: scannedRedemption.offer_name,
      quantity: scannedRedemption.quantity,
      kitchen_label: kitchenSession.gateSession.gateLabel,
      validator_identifier: kitchenSession.gateSession.validatorIdentifier,
      metadata: {
        source: "kitchen_scan",
        reason: "awaiting_preparation",
        notification_sent: notificationSent,
      },
    });

    return {
      allowed: false,
      result: "awaiting_preparation",
      message:
        "PEDIDO AINDA NAO ESTA EM PREPARO. Ele foi mantido em Pedidos e o cliente sera avisado quando estiver disponivel para retirada.",
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
    },
  });

  if (error || !data || typeof data !== "object") {
    return {
      allowed: false,
      result: "denied",
      message: "Nao foi possivel validar este combo agora.",
    };
  }

  const result = data as ComboRedemptionScanResult;

  if (result.allowed) {
    const { data: redemption } = await getSupabaseAdmin()
      .from("combo_redemptions")
      .select("raw_metadata")
      .eq("id", parsedToken.redemptionId)
      .maybeSingle<{ raw_metadata: Record<string, unknown> | null }>();

    if (redemption) {
      await getSupabaseAdmin()
        .from("combo_redemptions")
        .update({
          raw_metadata: {
            ...(redemption.raw_metadata ?? {}),
            kitchen_status: "delivered",
            delivered_at: new Date().toISOString(),
          },
        })
        .eq("id", parsedToken.redemptionId)
        .eq("status", "used");
    }
  }

  return {
    allowed: Boolean(result.allowed),
    result: result.result,
    message: result.message,
    redemption: result.redemption ?? null,
  };
}
