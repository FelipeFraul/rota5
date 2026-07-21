import "server-only";

import { createHash, randomBytes, timingSafeEqual } from "crypto";
import QRCode from "qrcode";
import { createMercadoPagoPayment } from "@/lib/mercado-pago/client";
import { getEnv } from "@/lib/env";
import { logError, logInfo, logWarn } from "@/lib/logger";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { getOrCreateOpenConversation, updateConversationAfterMessage } from "@/lib/tickets/services/conversations";
import { saveWhatsAppMessage } from "@/lib/tickets/services/messages";
import { buildWhatsAppOutboundMetadata } from "@/lib/tickets/services/outboundMessages";
import { centsToDecimalAmount, decimalAmountToCents } from "@/lib/tickets/services/payments";
import {
  claimWhatsAppOutboundDelivery,
  getOrCreateWhatsAppOutboundDelivery,
  markWhatsAppOutboundDeliveryFailed,
  markWhatsAppOutboundDeliverySent,
} from "@/lib/tickets/services/whatsappOutboundDeliveries";
import { sendZapiImage, sendZapiText } from "@/lib/zapi/client";

const PROVIDER = "mercado_pago";
const COMBO_ORDER_REFERENCE_PREFIX = "combo_order_";
const CHECKOUT_TTL_MINUTES = 30;
const EVENT_OFFER_LOOKAHEAD_MINUTES = 24 * 60;
const EVENT_OFFER_SEND_GRACE_MINUTES = 5;
const CUSTOM_OFFER_LOOKBACK_MINUTES = 180;
const CUSTOM_OFFER_SEND_GRACE_MINUTES = 30;
const SAO_PAULO_TIME_ZONE = "America/Sao_Paulo";

function getDeliveryStateUpdateFailureCode(result: {
  ok: false;
  error?: { code?: string | null } | null;
  reason?: string;
}) {
  return result.error?.code ?? result.reason ?? "delivery_state_update_failed";
}

export function formatComboDescription(value: string) {
  return value
    .replace(/\\n/g, "\n")
    .replace(/\s*>\s*/g, "\n")
    .split(/\r?\n/)
    .map((line) => line.trim().replace(/^[-•]\s*/, ""))
    .filter(Boolean)
    .join("\n");
}

export type ComboOfferTimingType =
  | "three_hours_before"
  | "one_hour_before"
  | "event_day_noon"
  | "custom";

export type ComboOfferScopeInput =
  | { scopeType: "all_events" }
  | { scopeType: "event"; eventIds: string[] }
  | { scopeType: "weekday"; weekdays: number[] };

export type ComboOfferSummary = {
  id: string;
  name: string;
  description: string;
  imageUrl: string | null;
  priceCents: number;
  status: "active" | "paused" | "deleted";
  sendTimingType: ComboOfferTimingType;
  sendOffsetMinutes: number | null;
  sendTimeOfDay: string | null;
  sendWeekdays: number[];
  scopes: string[];
};

type ComboOfferRow = {
  id: string;
  name: string;
  description: string;
  image_url: string | null;
  price_cents: number;
  currency: "BRL";
  send_timing_type: ComboOfferTimingType;
  send_offset_minutes: number | null;
  send_time_of_day: string | null;
  send_weekdays: number[] | null;
  status: "active" | "paused" | "deleted";
};

type ComboOfferScopeRow = {
  offer_id: string;
  scope_type: "all_events" | "event" | "weekday";
  event_id: string | null;
  weekday: number | null;
  events?: { title: string } | { title: string }[] | null;
};

type ComboOrderRow = {
  id: string;
  offer_id: string | null;
  customer_id: string;
  event_id: string;
  session_id: string;
  status: "pending_payment" | "paid" | "cancelled" | "expired";
  quantity: number;
  unit_amount_cents: number;
  total_amount_cents: number;
  currency: "BRL";
  external_reference: string | null;
  checkout_token_hash: string | null;
  checkout_expires_at: string;
  combo_offers:
    | { name: string; description: string; image_url: string | null }
    | { name: string; description: string; image_url: string | null }[]
    | null;
  customers?: { whatsapp_phone: string | null; email?: string | null } | null;
  events?: { title: string; city: string; state: string; venues?: { name: string | null } | null } | null;
  event_sessions?: { starts_at: string } | null;
};

type ComboPaymentRow = {
  id: string;
  provider_payment_id: string | null;
  status: string;
  raw_metadata: Record<string, unknown> | null;
};

type ComboOfferCandidateTicketRow = {
  id: string;
  customer_id: string;
  issued_at: string;
  event_sessions:
    | {
        id: string;
        event_id: string;
        starts_at: string;
        events: { id: string; title: string };
      }
    | {
        id: string;
        event_id: string;
        starts_at: string;
        events: { id: string; title: string };
      }[]
    | null;
  customers: { whatsapp_phone: string | null } | null;
};

type PaidComboOrderRow = ComboOrderRow & {
  customers: { whatsapp_phone: string | null };
  events: { title: string; city: string; state: string; venues?: { name: string | null } | null };
  event_sessions: { starts_at: string };
};

function firstJoin<T>(value: T | T[] | null | undefined) {
  return Array.isArray(value) ? value[0] : value ?? null;
}

function hashSecret(value: string) {
  return createHash("sha256").update(value).digest("hex");
}

function buildComboCheckoutToken() {
  return randomBytes(32).toString("base64url");
}

function checkoutTokenHashMatches(token: string, storedHash: string | null) {
  if (!token || !storedHash) return false;
  const received = Buffer.from(hashSecret(token), "hex");
  const expected = Buffer.from(storedHash, "hex");

  return received.length === expected.length && timingSafeEqual(received, expected);
}

export function buildComboOrderExternalReference(orderId: string) {
  return `${COMBO_ORDER_REFERENCE_PREFIX}${orderId}`;
}

export function extractComboOrderIdFromExternalReference(
  externalReference: string | null | undefined,
) {
  if (!externalReference?.startsWith(COMBO_ORDER_REFERENCE_PREFIX)) return null;
  const id = externalReference.slice(COMBO_ORDER_REFERENCE_PREFIX.length);

  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id)
    ? id
    : null;
}

function buildComboCheckoutUrl(orderId: string, token: string) {
  return `${getEnv().APP_BASE_URL.replace(/\/$/, "")}/combo-checkout/${encodeURIComponent(orderId)}?t=${encodeURIComponent(token)}`;
}

function formatCurrency(cents: number) {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(cents / 100);
}

function parseMaybeTime(value?: string | null) {
  if (!value) return null;
  const match = value.trim().match(/^([01]\d|2[0-3]):([0-5]\d)$/);
  return match ? `${match[1]}:${match[2]}:00` : null;
}

function normalizeOptionalImageUrl(value?: string | null) {
  const trimmed = value?.trim();

  if (!trimmed) return null;
  if (trimmed.length > 2000) return undefined;

  try {
    const url = new URL(trimmed);
    return url.protocol === "http:" || url.protocol === "https:" ? url.toString() : undefined;
  } catch {
    return undefined;
  }
}

function normalizeWeekdays(weekdays: number[]) {
  return [...new Set(weekdays.filter((day) => Number.isInteger(day) && day >= 0 && day <= 6))].sort();
}

async function insertOfferScopes(offerId: string, scope: ComboOfferScopeInput) {
  const supabase = getSupabaseAdmin();
  const rows =
    scope.scopeType === "all_events"
      ? [{ offer_id: offerId, scope_type: "all_events" }]
      : scope.scopeType === "event"
        ? [...new Set(scope.eventIds)].map((eventId) => ({
            offer_id: offerId,
            scope_type: "event",
            event_id: eventId,
          }))
        : normalizeWeekdays(scope.weekdays).map((weekday) => ({
            offer_id: offerId,
            scope_type: "weekday",
            weekday,
          }));

  if (rows.length === 0) {
    throw new Error("combo_offer_scope_required");
  }

  const { error } = await supabase.from("combo_offer_scopes").insert(rows);
  if (error) throw error;
}

export async function createComboOffer({
  name,
  description,
  imageUrl,
  priceCents,
  timingType,
  customOffsetMinutes,
  customTimeOfDay,
  scope,
  adminUserId,
  adminPhone,
}: {
  name: string;
  description: string;
  imageUrl?: string | null;
  priceCents: number;
  timingType: ComboOfferTimingType;
  customOffsetMinutes?: number | null;
  customTimeOfDay?: string | null;
  scope: ComboOfferScopeInput;
  adminUserId?: string | null;
  adminPhone?: string | null;
}) {
  const trimmedName = name.trim();
  const trimmedDescription = formatComboDescription(description);
  const normalizedImageUrl = normalizeOptionalImageUrl(imageUrl);

  if (
    !trimmedName ||
    !trimmedDescription ||
    normalizedImageUrl === undefined ||
    !Number.isInteger(priceCents) ||
    priceCents <= 0
  ) {
    return { ok: false as const, reason: "invalid_input" as const };
  }

  const sendOffsetMinutes =
    timingType === "three_hours_before"
      ? 180
      : timingType === "one_hour_before"
        ? 60
        : timingType === "custom" && customOffsetMinutes
          ? customOffsetMinutes
          : null;
  const sendTimeOfDay =
    timingType === "event_day_noon" ? "12:00:00" : parseMaybeTime(customTimeOfDay);
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("combo_offers")
    .insert({
      name: trimmedName,
      description: trimmedDescription,
      image_url: normalizedImageUrl,
      price_cents: priceCents,
      send_timing_type: timingType,
      send_offset_minutes: sendOffsetMinutes,
      send_time_of_day: sendTimeOfDay,
      send_weekdays: scope.scopeType === "weekday" ? normalizeWeekdays(scope.weekdays) : [],
      created_by_admin_user_id: adminUserId ?? null,
      created_by_admin_phone: adminPhone ?? null,
    })
    .select("id")
    .single<{ id: string }>();

  if (error) return { ok: false as const, reason: "database_error" as const, error };

  try {
    await insertOfferScopes(data.id, scope);
  } catch (scopeError) {
    await supabase.from("combo_offers").update({ status: "deleted" }).eq("id", data.id);
    return { ok: false as const, reason: "database_error" as const, error: scopeError };
  }

  return { ok: true as const, offerId: data.id };
}

function scopeLabel(scope: ComboOfferScopeRow) {
  if (scope.scope_type === "all_events") return "Todos os eventos";
  if (scope.scope_type === "weekday") {
    const labels = ["domingo", "segunda", "terça", "quarta", "quinta", "sexta", "sábado"];
    return labels[scope.weekday ?? 0] ?? "dia da semana";
  }
  return firstJoin(scope.events)?.title ?? "Evento";
}

export async function listComboOffers({
  includeDeleted = false,
}: { includeDeleted?: boolean } = {}) {
  const supabase = getSupabaseAdmin();
  let query = supabase
    .from("combo_offers")
    .select("id, name, description, image_url, price_cents, currency, send_timing_type, send_offset_minutes, send_time_of_day, send_weekdays, status")
    .order("created_at", { ascending: false })
    .limit(30);

  if (!includeDeleted) query = query.neq("status", "deleted");

  const { data: offers, error } = await query.returns<ComboOfferRow[]>();
  if (error) return { ok: false as const, error };

  const ids = (offers ?? []).map((offer) => offer.id);
  const { data: scopes, error: scopesError } = ids.length
    ? await supabase
        .from("combo_offer_scopes")
        .select("offer_id, scope_type, event_id, weekday, events(title)")
        .in("offer_id", ids)
        .returns<ComboOfferScopeRow[]>()
    : { data: [], error: null };

  if (scopesError) return { ok: false as const, error: scopesError };

  const scopesByOffer = new Map<string, string[]>();
  for (const scope of scopes ?? []) {
    const labels = scopesByOffer.get(scope.offer_id) ?? [];
    labels.push(scopeLabel(scope));
    scopesByOffer.set(scope.offer_id, labels);
  }

  const items: ComboOfferSummary[] = (offers ?? []).map((offer) => ({
    id: offer.id,
    name: offer.name,
    description: offer.description,
    imageUrl: offer.image_url,
    priceCents: offer.price_cents,
    status: offer.status,
    sendTimingType: offer.send_timing_type,
    sendOffsetMinutes: offer.send_offset_minutes,
    sendTimeOfDay: offer.send_time_of_day,
    sendWeekdays: offer.send_weekdays ?? [],
    scopes: scopesByOffer.get(offer.id) ?? [],
  }));

  return { ok: true as const, offers: items };
}

export async function updateComboOfferStatus(
  offerId: string,
  status: "active" | "paused" | "deleted",
) {
  const { error } = await getSupabaseAdmin()
    .from("combo_offers")
    .update({ status })
    .eq("id", offerId);

  return error ? { ok: false as const, error } : { ok: true as const };
}

export async function updateComboOfferDetails({
  offerId,
  name,
  description,
  imageUrl,
  priceCents,
  timingType,
  customOffsetMinutes,
}: {
  offerId: string;
  name?: string;
  description?: string;
  imageUrl?: string | null;
  priceCents?: number;
  timingType?: ComboOfferTimingType;
  customOffsetMinutes?: number | null;
}) {
  const payload: Record<string, unknown> = {};

  if (name !== undefined) {
    const trimmed = name.trim();
    if (!trimmed) return { ok: false as const, reason: "invalid_input" as const };
    payload.name = trimmed;
  }

  if (description !== undefined) {
    const trimmed = formatComboDescription(description);
    if (!trimmed) return { ok: false as const, reason: "invalid_input" as const };
    payload.description = trimmed;
  }

  if (imageUrl !== undefined) {
    const normalizedImageUrl = normalizeOptionalImageUrl(imageUrl);
    if (normalizedImageUrl === undefined) {
      return { ok: false as const, reason: "invalid_input" as const };
    }
    payload.image_url = normalizedImageUrl;
  }

  if (priceCents !== undefined) {
    if (!Number.isInteger(priceCents) || priceCents <= 0) {
      return { ok: false as const, reason: "invalid_input" as const };
    }
    payload.price_cents = priceCents;
  }

  if (timingType !== undefined) {
    payload.send_timing_type = timingType;
    payload.send_offset_minutes =
      timingType === "three_hours_before"
        ? 180
        : timingType === "one_hour_before"
          ? 60
          : timingType === "custom"
            ? customOffsetMinutes
            : null;
    payload.send_time_of_day = timingType === "event_day_noon" ? "12:00:00" : null;
  }

  if (Object.keys(payload).length === 0) {
    return { ok: false as const, reason: "invalid_input" as const };
  }

  const { error } = await getSupabaseAdmin()
    .from("combo_offers")
    .update(payload)
    .eq("id", offerId)
    .neq("status", "deleted");

  return error ? { ok: false as const, reason: "database_error" as const, error } : { ok: true as const };
}

export async function duplicateComboOffer(offerId: string) {
  const supabase = getSupabaseAdmin();
  const { data: offer, error } = await supabase
    .from("combo_offers")
    .select("name, description, image_url, price_cents, send_timing_type, send_offset_minutes, send_time_of_day, send_weekdays")
    .eq("id", offerId)
    .maybeSingle<ComboOfferRow>();

  if (error || !offer) return { ok: false as const, reason: "not_found" as const, error };

  const { data: scopes, error: scopesError } = await supabase
    .from("combo_offer_scopes")
    .select("scope_type, event_id, weekday")
    .eq("offer_id", offerId)
    .returns<ComboOfferScopeRow[]>();

  if (scopesError) return { ok: false as const, reason: "database_error" as const, error: scopesError };

  const { data: copy, error: copyError } = await supabase
    .from("combo_offers")
    .insert({
      name: `${offer.name} (cópia)`,
      description: offer.description,
      image_url: offer.image_url,
      price_cents: offer.price_cents,
      send_timing_type: offer.send_timing_type,
      send_offset_minutes: offer.send_offset_minutes,
      send_time_of_day: offer.send_time_of_day,
      send_weekdays: offer.send_weekdays ?? [],
      source_offer_id: offerId,
      status: "paused",
    })
    .select("id")
    .single<{ id: string }>();

  if (copyError) return { ok: false as const, reason: "database_error" as const, error: copyError };

  const rows = (scopes ?? []).map((scope) => ({
    offer_id: copy.id,
    scope_type: scope.scope_type,
    event_id: scope.event_id,
    weekday: scope.weekday,
  }));
  if (rows.length) await supabase.from("combo_offer_scopes").insert(rows);

  return { ok: true as const, offerId: copy.id };
}

export function buildComboOfferListText(offers: ComboOfferSummary[]) {
  if (offers.length === 0) return "Nenhuma oferta cadastrada.";

  return offers
    .map((offer, index) => {
      const customerPreview = buildComboOfferMessage({
        offer: {
          name: offer.name,
          description: offer.description,
          price_cents: offer.priceCents,
        },
        eventTitle: "NOME DO EVENTO",
        checkoutUrl: "LINK DE CHECKOUT",
      });

      return [
        `${index + 1}. ${offer.name}`,
        "",
        "*Mensagem 1/2 - como o usuario recebe:*",
        customerPreview,
        "",
        "*Mensagem 2/2 - informacoes da oferta:*",
        `ID: ${offer.id}`,
        `Nome: ${offer.name}`,
        `Descricao: ${offer.description}`,
        `Status: ${offer.status}`,
        `Valor: ${formatCurrency(offer.priceCents)}`,
        `Foto: ${offer.imageUrl ? "cadastrada" : "ausente"}`,
        ...(offer.imageUrl ? [`URL da foto: ${offer.imageUrl}`] : []),
        `Uso: ${offer.scopes.join(", ") || "Sem escopo"}`,
        `Quando enviar: ${formatComboOfferTiming(offer)}`,
      ].join("\n");
    })
    .join("\n\n");
}

function formatComboOfferTiming(
  offer: Pick<
    ComboOfferSummary,
    "sendTimingType" | "sendOffsetMinutes" | "sendTimeOfDay" | "sendWeekdays"
  >,
) {
  if (offer.sendTimingType === "three_hours_before") return "3h antes do evento";
  if (offer.sendTimingType === "one_hour_before") return "1h antes do evento";
  if (offer.sendTimingType === "event_day_noon") return "No dia do evento as 12h";

  const parts = [
    "Horario personalizado",
    offer.sendOffsetMinutes !== null ? `${offer.sendOffsetMinutes} min` : null,
    offer.sendTimeOfDay ? `as ${offer.sendTimeOfDay}` : null,
    offer.sendWeekdays.length ? `dias ${offer.sendWeekdays.join(", ")}` : null,
  ].filter(Boolean);

  return parts.join(" - ");
}

async function loadOfferForSession(offerId: string, eventId: string, sessionId: string) {
  const supabase = getSupabaseAdmin();
  const { data: offer, error } = await supabase
    .from("combo_offers")
    .select("id, name, description, image_url, price_cents, currency, send_timing_type, send_offset_minutes, send_time_of_day, send_weekdays, status")
    .eq("id", offerId)
    .eq("status", "active")
    .maybeSingle<ComboOfferRow>();

  if (error || !offer) return null;

  const { data: session, error: sessionError } = await supabase
    .from("event_sessions")
    .select("id, event_id")
    .eq("id", sessionId)
    .eq("event_id", eventId)
    .maybeSingle<{ id: string; event_id: string }>();

  if (sessionError || !session) return null;

  return offer;
}

export async function createComboOrderForCheckout({
  offerId,
  customerId,
  eventId,
  sessionId,
  sourceTicketId,
}: {
  offerId: string;
  customerId: string;
  eventId: string;
  sessionId: string;
  sourceTicketId?: string | null;
}) {
  const offer = await loadOfferForSession(offerId, eventId, sessionId);
  if (!offer) return { ok: false as const, reason: "offer_not_found" as const };

  const checkoutExpiresAt = new Date(Date.now() + CHECKOUT_TTL_MINUTES * 60_000).toISOString();
  const supabase = getSupabaseAdmin();
  const { data: order, error } = await supabase
    .from("combo_orders")
    .insert({
      offer_id: offer.id,
      customer_id: customerId,
      event_id: eventId,
      session_id: sessionId,
      source_ticket_id: sourceTicketId ?? null,
      unit_amount_cents: offer.price_cents,
      total_amount_cents: offer.price_cents,
      checkout_expires_at: checkoutExpiresAt,
      raw_metadata: { source: "whatsapp_offer" },
    })
    .select("id")
    .single<{ id: string }>();

  if (error) return { ok: false as const, reason: "database_error" as const, error };

  const externalReference = buildComboOrderExternalReference(order.id);
  const token = buildComboCheckoutToken();
  const checkoutUrl = buildComboCheckoutUrl(order.id, token);

  const updateResult = await supabase
    .from("combo_orders")
    .update({
      external_reference: externalReference,
      checkout_token_hash: hashSecret(token),
    })
    .eq("id", order.id);

  if (updateResult.error) return { ok: false as const, reason: "database_error" as const, error: updateResult.error };

  return {
    ok: true as const,
    orderId: order.id,
    checkoutUrl,
    expiresAt: checkoutExpiresAt,
    offerName: offer.name,
    priceCents: offer.price_cents,
  };
}

export async function getPublicComboCheckoutOrder(orderId: string, token: string) {
  const { data: order, error } = await getSupabaseAdmin()
    .from("combo_orders")
    .select("id, offer_id, customer_id, event_id, session_id, status, quantity, unit_amount_cents, total_amount_cents, currency, external_reference, checkout_token_hash, checkout_expires_at, combo_offers(name, description, image_url), customers(whatsapp_phone, email), events(title, city, state, venues(name)), event_sessions(starts_at)")
    .eq("id", orderId)
    .maybeSingle<ComboOrderRow>();

  if (error || !order || order.status !== "pending_payment") return null;
  if (new Date(order.checkout_expires_at).getTime() <= Date.now()) return null;
  if (!checkoutTokenHashMatches(token, order.checkout_token_hash)) {
    return null;
  }

  const offer = firstJoin(order.combo_offers);

  if (!offer) return null;

  return {
    orderId: order.id,
    checkoutToken: token,
    status: order.status,
    expiresAt: order.checkout_expires_at,
    amountCents: order.total_amount_cents,
    customerEmail: order.customers?.email ?? null,
    offer: {
      name: offer.name,
      description: offer.description,
      imageUrl: offer.image_url,
      quantity: order.quantity,
      unitPriceCents: order.unit_amount_cents,
    },
    event: {
      title: order.events?.title ?? "Evento",
      startsAt: order.event_sessions?.starts_at ?? "",
      venueName: order.events?.venues?.name ?? null,
      city: order.events?.city ?? "",
      state: order.events?.state ?? "",
    },
  };
}

function buildPaymentDescription(order: NonNullable<Awaited<ReturnType<typeof getPublicComboCheckoutOrder>>>) {
  return `${order.offer.name} - ${order.event.title}`;
}

function getCheckoutAttempt(metadata: Record<string, unknown> | null | undefined) {
  const attempt = metadata?.checkout_attempt;
  return attempt && typeof attempt === "object" && !Array.isArray(attempt)
    ? (attempt as Record<string, unknown>)
    : null;
}

export async function payComboCheckout({
  orderId,
  checkoutToken,
  email,
  identificationNumber,
}: {
  orderId: string;
  checkoutToken: string;
  email: string;
  identificationNumber?: string;
}) {
  const order = await getPublicComboCheckoutOrder(orderId, checkoutToken);
  if (!order) return { ok: false as const, reason: "order_not_payable" as const };

  const amount = centsToDecimalAmount(order.amountCents);
  if (!amount || amount <= 0) return { ok: false as const, reason: "invalid_amount" as const };

  const supabase = getSupabaseAdmin();
  const { data: existingPayment, error: existingError } = await supabase
    .from("combo_payments")
    .select("id, provider_payment_id, status, raw_metadata")
    .eq("combo_order_id", order.orderId)
    .eq("provider", PROVIDER)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle<ComboPaymentRow>();

  if (existingError) return { ok: false as const, reason: "payment_persist_failed" as const };

  const attempt = getCheckoutAttempt(existingPayment?.raw_metadata);
  const providerPaymentId =
    typeof attempt?.provider_payment_id === "string"
      ? attempt.provider_payment_id
      : existingPayment?.provider_payment_id;
  const qrCode = typeof attempt?.qr_code === "string" ? attempt.qr_code : null;
  const activeStatus = typeof attempt?.status === "string" ? attempt.status : existingPayment?.status;

  if (providerPaymentId && activeStatus && ["pending", "in_process", "approved"].includes(activeStatus)) {
    return {
      ok: true as const,
      status: activeStatus,
      providerPaymentId,
      qrCode,
      qrImage: await generatePixQrImage(qrCode),
    };
  }

  const paymentRow = existingPayment?.id
    ? { id: existingPayment.id }
    : (
        await supabase
          .from("combo_payments")
          .insert({
            combo_order_id: order.orderId,
            provider: PROVIDER,
            status: "pending",
            amount_cents: order.amountCents,
            currency: "BRL",
          })
          .select("id")
          .single<{ id: string }>()
      ).data;

  if (!paymentRow) return { ok: false as const, reason: "payment_persist_failed" as const };

  const externalReference = buildComboOrderExternalReference(order.orderId);
  const paymentResult = await createMercadoPagoPayment(
    {
      transaction_amount: amount,
      description: buildPaymentDescription(order),
      installments: 1,
      payment_method_id: "pix",
      payer: {
        email: email.trim().toLowerCase() || `combo-${order.orderId}@example.com`,
        ...(identificationNumber?.replace(/\D/g, "").length === 11
          ? {
              identification: {
                type: "CPF",
                number: identificationNumber.replace(/\D/g, ""),
              },
            }
          : {}),
      },
      external_reference: externalReference,
      notification_url: `${getEnv().APP_BASE_URL.replace(/\/$/, "")}/api/webhook/payment/mercado-pago`,
      metadata: {
        combo_order_id: order.orderId,
        checkout_type: "combo",
      },
    },
    `${paymentRow.id}:combo:pix`,
  );

  if (!paymentResult.ok) return { ok: false as const, reason: "payment_create_failed" as const };

  const payment = paymentResult.payment;
  const status = payment.status ?? "pending";
  const mappedStatus =
    status === "approved"
      ? "approved"
      : status === "rejected"
        ? "rejected"
        : status === "cancelled"
          ? "cancelled"
          : status === "refunded"
            ? "refunded"
            : status === "expired"
              ? "expired"
              : "pending";
  const newQrCode = payment.point_of_interaction?.transaction_data?.qr_code ?? null;
  const updateResult = await supabase
    .from("combo_payments")
    .update({
      provider_payment_id: String(payment.id),
      provider_preference_id: `combo_self_hosted_${order.orderId}`,
      status: mappedStatus,
      amount_cents: order.amountCents,
      checkout_url: buildComboCheckoutUrl(order.orderId, checkoutToken),
      raw_metadata: {
        provider_payment_id: String(payment.id),
        status,
        external_reference: payment.external_reference,
        transaction_amount: payment.transaction_amount,
        checkout_attempt: {
          method: "pix",
          status,
          provider_payment_id: String(payment.id),
          qr_code: newQrCode,
          ticket_url: payment.point_of_interaction?.transaction_data?.ticket_url ?? null,
        },
      },
    })
    .eq("id", paymentRow.id);

  if (updateResult.error) return { ok: false as const, reason: "payment_persist_failed" as const };

  return {
    ok: true as const,
    status,
    providerPaymentId: String(payment.id),
    qrCode: newQrCode,
    qrImage: await generatePixQrImage(newQrCode),
  };
}

function formatEventDate(startsAt: string) {
  return new Intl.DateTimeFormat("pt-BR", {
    timeZone: SAO_PAULO_TIME_ZONE,
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(startsAt));
}

export async function generateComboQrImage(token: string) {
  const buffer = await QRCode.toBuffer(token, {
    color: {
      dark: "#DC2626",
      light: "#FFFFFF",
    },
    errorCorrectionLevel: "M",
    margin: 2,
    scale: 8,
    type: "png",
  });

  return `data:image/png;base64,${buffer.toString("base64")}`;
}

async function generatePixQrImage(qrCode: string | null) {
  if (!qrCode) return null;

  return QRCode.toDataURL(qrCode, {
    color: {
      dark: "#DC2626",
      light: "#FFFFFF",
    },
    errorCorrectionLevel: "M",
    margin: 2,
    scale: 8,
  });
}

async function loadPaidComboOrder(orderId: string) {
  const { data, error } = await getSupabaseAdmin()
    .from("combo_orders")
    .select("id, offer_id, customer_id, event_id, session_id, status, quantity, unit_amount_cents, total_amount_cents, currency, external_reference, checkout_token_hash, checkout_expires_at, combo_offers(name, description, image_url), customers(whatsapp_phone), events(title, city, state, venues(name)), event_sessions(starts_at)")
    .eq("id", orderId)
    .maybeSingle<PaidComboOrderRow>();

  if (error) throw error;
  return data;
}

export async function deliverComboOrder(orderId: string) {
  const supabase = getSupabaseAdmin();
  const order = await loadPaidComboOrder(orderId);

  if (!order || order.status !== "paid") return { ok: false as const, reason: "order_not_found" as const };

  const existing = await supabase
    .from("combo_redemptions")
    .select("id")
    .eq("combo_order_id", order.id)
    .maybeSingle<{ id: string }>();

  if (existing.error) return { ok: false as const, reason: "database_error" as const, error: existing.error };

  const token = randomBytes(32).toString("base64url");
  const redemptionCode = `CMB-${order.id.slice(0, 8).toUpperCase()}`;
  const offer = firstJoin(order.combo_offers);
  let redemptionId = existing.data?.id ?? null;

  if (!redemptionId) {
    const { data: redemption, error } = await supabase
      .from("combo_redemptions")
      .insert({
        combo_order_id: order.id,
        customer_id: order.customer_id,
        event_id: order.event_id,
        session_id: order.session_id,
        offer_name: offer?.name ?? "Combo",
        quantity: order.quantity,
        qr_token_hash: hashSecret(token),
        redemption_code: redemptionCode,
      })
      .select("id")
      .single<{ id: string }>();

    if (error) return { ok: false as const, reason: "database_error" as const, error };
    redemptionId = redemption.id;
  }

  const phone = order.customers.whatsapp_phone;

  if (!phone) return { ok: true as const, sent: false as const, reason: "missing_phone" as const };

  const conversationResult = await getOrCreateOpenConversation({
    customerId: order.customer_id,
  });
  if (!conversationResult.ok) {
    logWarn("Continuing paid combo WhatsApp delivery without conversation", {
      comboOrderId: order.id,
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

  const event = order.events;
  const message = [
    "*COMBO CONFIRMADO*",
    "",
    `> Oferta: ${offer?.name ?? "Combo"}`,
    `> Quantidade: ${order.quantity}`,
    `> Evento: ${event.title}`,
    `> Data: ${formatEventDate(order.event_sessions.starts_at)}`,
    `> Local: ${event.venues?.name ?? "Black House"} - ${event.city}/${event.state}`,
    `> Código: ${redemptionCode}`,
  ].join("\n");
  const textBusinessContext = {
    combo_order_id: order.id,
    combo_redemption_id: redemptionId,
    offer_id: order.offer_id,
    event_id: order.event_id,
    session_id: order.session_id,
    ...conversationFallbackMetadata,
  };
  const textDelivery = await getOrCreateWhatsAppOutboundDelivery({
    idempotencyKey: `paid-combo-order:${order.id}:text:v1`,
    customerId: order.customer_id,
    conversationId,
    recipientPhone: phone,
    messageType: "text",
    reason: "paid_combo_delivery",
    businessContext: textBusinessContext,
  });

  if (!textDelivery.ok) {
    return {
      ok: false as const,
      reason: "database_error" as const,
      error: textDelivery.error,
    };
  }

  if (textDelivery.delivery.status === "sent") {
    logInfo("Skipped already sent paid combo WhatsApp delivery text", {
      comboOrderId: order.id,
    });
  } else {
    const textClaim = await claimWhatsAppOutboundDelivery(textDelivery.delivery.id);
    if (!textClaim.ok) {
      return {
        ok: false as const,
        reason: "database_error" as const,
        error: textClaim.error,
      };
    }
    if (!textClaim.claimed) {
      logWarn("Skipped paid combo WhatsApp delivery text already in progress", {
        comboOrderId: order.id,
      });
      return { ok: true as const, sent: false as const, reason: "delivery_in_progress" as const };
    }

    const textResult = await sendZapiText({ phone, message });
    const textSaveResult = await saveWhatsAppMessage({
      conversationId,
      customerId: order.customer_id,
      direction: "outbound",
      messageType: "text",
      body: message,
      providerMessageId: textResult.ok ? textResult.providerMessageId : null,
      rawMetadata: buildWhatsAppOutboundMetadata({
        sendResult: textResult,
        messageType: "text",
        reason: "paid_combo_delivery",
        businessContext: textBusinessContext,
      }),
    });

    if (!textSaveResult.ok) {
      const markFailedResult = await markWhatsAppOutboundDeliveryFailed({
        deliveryId: textDelivery.delivery.id,
        error: textSaveResult.error?.code ?? "whatsapp_message_persist_failed",
      });
      if (!markFailedResult.ok) {
        logError("Failed to mark combo text WhatsApp delivery as failed", {
          comboOrderId: order.id,
          code: getDeliveryStateUpdateFailureCode(markFailedResult),
          originalCode: textSaveResult.error?.code,
        });
      }
      if (!textResult.ok) {
        return { ok: true as const, sent: false as const, reason: "zapi_failed" as const };
      }
      return {
        ok: false as const,
        reason: "database_error" as const,
        error: textSaveResult.error,
      };
    }

    if (!textResult.ok) {
      const markFailedResult = await markWhatsAppOutboundDeliveryFailed({
        deliveryId: textDelivery.delivery.id,
        error: textResult.error,
      });
      if (!markFailedResult.ok) {
        logError("Failed to mark combo text WhatsApp delivery as failed", {
          comboOrderId: order.id,
          code: getDeliveryStateUpdateFailureCode(markFailedResult),
          originalCode: textResult.error,
        });
      }
      logWarn("Combo text delivery failed", { comboOrderId: order.id, phoneLast4: phone.slice(-4), error: textResult.error });
      return { ok: true as const, sent: false as const, reason: "zapi_failed" as const };
    }

    const markSentResult = await markWhatsAppOutboundDeliverySent({
      deliveryId: textDelivery.delivery.id,
      providerMessageId: textResult.providerMessageId,
    });
    if (!markSentResult.ok) {
      logError("Failed to mark combo text WhatsApp delivery as sent", {
        comboOrderId: order.id,
        code: getDeliveryStateUpdateFailureCode(markSentResult),
      });
      return {
        ok: false as const,
        reason: "database_error" as const,
      };
    }
  }

  const qrCaption = [
    "*QRCODE DO COMBO*",
    `Pedido: ${redemptionCode}`,
    "",
    "Apresente no bar. Este QR Code é separado do ingresso da portaria.",
  ].join("\n");
  const image = await generateComboQrImage(`combo:${redemptionId}:${token}`);
  const imageBusinessContext = {
    combo_order_id: order.id,
    combo_redemption_id: redemptionId,
    offer_id: order.offer_id,
    event_id: order.event_id,
    session_id: order.session_id,
    ...conversationFallbackMetadata,
  };
  const imageDelivery = await getOrCreateWhatsAppOutboundDelivery({
    idempotencyKey: `paid-combo-redemption:${redemptionId}:qr:v1`,
    customerId: order.customer_id,
    conversationId,
    recipientPhone: phone,
    messageType: "image",
    reason: "paid_combo_qr_delivery",
    businessContext: imageBusinessContext,
  });

  if (!imageDelivery.ok) {
    return {
      ok: false as const,
      reason: "database_error" as const,
      error: imageDelivery.error,
    };
  }

  if (imageDelivery.delivery.status === "sent") {
    logInfo("Skipped already sent paid combo QR WhatsApp delivery", {
      comboOrderId: order.id,
      comboRedemptionId: redemptionId,
    });
    logInfo("Delivered paid combo by WhatsApp", { comboOrderId: order.id, phoneLast4: phone.slice(-4) });
    return { ok: true as const, sent: true as const };
  }

  const imageClaim = await claimWhatsAppOutboundDelivery(imageDelivery.delivery.id);
  if (!imageClaim.ok) {
    return {
      ok: false as const,
      reason: "database_error" as const,
      error: imageClaim.error,
    };
  }

  if (!imageClaim.claimed) {
    logWarn("Skipped paid combo QR WhatsApp delivery already in progress", {
      comboOrderId: order.id,
      comboRedemptionId: redemptionId,
    });
    return { ok: true as const, sent: false as const, reason: "delivery_in_progress" as const };
  }

  const imageResult = await sendZapiImage({
    phone,
    image,
    caption: qrCaption,
  });
  const imageSaveResult = await saveWhatsAppMessage({
    conversationId,
    customerId: order.customer_id,
    direction: "outbound",
    messageType: "image",
    body: qrCaption,
    providerMessageId: imageResult.ok ? imageResult.providerMessageId : null,
    rawMetadata: buildWhatsAppOutboundMetadata({
      sendResult: imageResult,
      messageType: "image",
      reason: "paid_combo_qr_delivery",
      businessContext: imageBusinessContext,
    }),
  });

  if (!imageSaveResult.ok) {
    const markFailedResult = await markWhatsAppOutboundDeliveryFailed({
      deliveryId: imageDelivery.delivery.id,
      error: imageSaveResult.error?.code ?? "whatsapp_message_persist_failed",
    });
    if (!markFailedResult.ok) {
      logError("Failed to mark combo QR WhatsApp delivery as failed", {
        comboOrderId: order.id,
        comboRedemptionId: redemptionId,
        code: getDeliveryStateUpdateFailureCode(markFailedResult),
        originalCode: imageSaveResult.error?.code,
      });
    }
    if (!imageResult.ok) {
      return { ok: true as const, sent: false as const, reason: "zapi_failed" as const };
    }
    return {
      ok: false as const,
      reason: "database_error" as const,
      error: imageSaveResult.error,
    };
  }

  if (!imageResult.ok) {
    const markFailedResult = await markWhatsAppOutboundDeliveryFailed({
      deliveryId: imageDelivery.delivery.id,
      error: imageResult.error,
    });
    if (!markFailedResult.ok) {
      logError("Failed to mark combo QR WhatsApp delivery as failed", {
        comboOrderId: order.id,
        comboRedemptionId: redemptionId,
        code: getDeliveryStateUpdateFailureCode(markFailedResult),
        originalCode: imageResult.error,
      });
    }
    logWarn("Combo QR delivery failed", { comboOrderId: order.id, phoneLast4: phone.slice(-4), error: imageResult.error });
    return { ok: true as const, sent: false as const, reason: "zapi_failed" as const };
  }

  const markSentResult = await markWhatsAppOutboundDeliverySent({
    deliveryId: imageDelivery.delivery.id,
    providerMessageId: imageResult.providerMessageId,
  });
  if (!markSentResult.ok) {
    logError("Failed to mark combo QR WhatsApp delivery as sent", {
      comboOrderId: order.id,
      comboRedemptionId: redemptionId,
      code: getDeliveryStateUpdateFailureCode(markSentResult),
    });
    return {
      ok: false as const,
      reason: "database_error" as const,
    };
  }

  logInfo("Delivered paid combo by WhatsApp", { comboOrderId: order.id, phoneLast4: phone.slice(-4) });
  return { ok: true as const, sent: true as const };
}

export async function confirmPaidComboOrder({
  orderId,
  providerPaymentId,
  amountCents,
  paidAt,
  rawMetadata,
}: {
  orderId: string;
  providerPaymentId: string;
  amountCents: number;
  paidAt: string;
  rawMetadata: Record<string, unknown>;
}) {
  const supabase = getSupabaseAdmin();
  const { data: order, error } = await supabase
    .from("combo_orders")
    .select("id, status, total_amount_cents")
    .eq("id", orderId)
    .maybeSingle<{ id: string; status: string; total_amount_cents: number }>();

  if (error || !order) return { ok: false as const, reason: "order_not_found" as const, error };
  if (order.status === "paid") return { ok: true as const, idempotent: true as const };
  if (order.status !== "pending_payment") return { ok: false as const, reason: "order_not_payable" as const };
  if (amountCents < order.total_amount_cents) return { ok: false as const, reason: "payment_amount_too_low" as const };

  const existingPayment = await supabase
    .from("combo_payments")
    .select("id, combo_order_id")
    .eq("provider", PROVIDER)
    .eq("provider_payment_id", providerPaymentId)
    .maybeSingle<{ id: string; combo_order_id: string }>();

  if (existingPayment.error) return { ok: false as const, reason: "database_error" as const, error: existingPayment.error };
  if (existingPayment.data && existingPayment.data.combo_order_id !== orderId) {
    return { ok: false as const, reason: "payment_already_linked" as const };
  }

  const orderUpdate = await supabase
    .from("combo_orders")
    .update({ status: "paid", paid_at: paidAt })
    .eq("id", orderId)
    .eq("status", "pending_payment");

  if (orderUpdate.error) return { ok: false as const, reason: "database_error" as const, error: orderUpdate.error };

  const paymentRow = existingPayment.data
    ? await supabase
        .from("combo_payments")
        .update({
          provider_payment_id: providerPaymentId,
          status: "approved",
          amount_cents: amountCents,
          raw_metadata: rawMetadata,
        })
        .eq("id", existingPayment.data.id)
    : await supabase.from("combo_payments").insert({
        combo_order_id: orderId,
        provider: PROVIDER,
        provider_payment_id: providerPaymentId,
        status: "approved",
        amount_cents: amountCents,
        currency: "BRL",
        raw_metadata: rawMetadata,
      });

  if (paymentRow.error) return { ok: false as const, reason: "database_error" as const, error: paymentRow.error };

  return { ok: true as const, idempotent: false as const };
}

export async function expireComboOrders(limit = 100) {
  const now = new Date().toISOString();
  const { data: rows, error: selectError } = await getSupabaseAdmin()
    .from("combo_orders")
    .select("id")
    .eq("status", "pending_payment")
    .lte("checkout_expires_at", now)
    .order("checkout_expires_at", { ascending: true })
    .limit(limit)
    .returns<Array<{ id: string }>>();

  if (selectError) throw selectError;

  const ids = (rows ?? []).map((row) => row.id);

  if (!ids.length) return 0;

  const { error } = await getSupabaseAdmin()
    .from("combo_orders")
    .update({ status: "expired" })
    .in("id", ids)
    .eq("status", "pending_payment")
    .lte("checkout_expires_at", now);

  if (error) throw error;
  return ids.length;
}

export async function listActiveComboOffersForEventSession(eventId: string, startsAt: string) {
  const weekday = new Intl.DateTimeFormat("en-US", {
    timeZone: SAO_PAULO_TIME_ZONE,
    weekday: "short",
  }).format(new Date(startsAt));
  const weekdayIndex = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(weekday);
  const { data, error } = await getSupabaseAdmin()
    .from("combo_offers")
    .select("id, name, description, image_url, price_cents, currency, send_timing_type, send_offset_minutes, send_time_of_day, send_weekdays, status, combo_offer_scopes!inner(scope_type, event_id, weekday)")
    .eq("status", "active")
    .or(`scope_type.eq.all_events,event_id.eq.${eventId},weekday.eq.${weekdayIndex}`, {
      referencedTable: "combo_offer_scopes",
    })
    .order("created_at", { ascending: false })
    .returns<Array<ComboOfferRow & { combo_offer_scopes: ComboOfferScopeRow[] }>>();

  if (error) throw error;
  return data ?? [];
}

export function shouldSendComboOfferNow(
  offer: ComboOfferRow,
  startsAt: string,
  now = new Date(),
  purchasedAt?: string | null,
) {
  const start = new Date(startsAt).getTime();
  const current = now.getTime();

  if (offer.send_timing_type === "custom") {
    const purchaseTime = purchasedAt ? new Date(purchasedAt).getTime() : Number.NaN;
    const offset = offer.send_offset_minutes;

    if (!Number.isFinite(purchaseTime) || !offset || offset <= 0) return false;

    const target = purchaseTime + offset * 60_000;

    return current >= target && current < target + CUSTOM_OFFER_SEND_GRACE_MINUTES * 60_000;
  }

  const eventWindowStart = start - EVENT_OFFER_LOOKAHEAD_MINUTES * 60_000;
  if (current < eventWindowStart || current >= start) return false;

  if (offer.send_timing_type === "event_day_noon") {
    const parts = new Intl.DateTimeFormat("en-CA", {
      timeZone: SAO_PAULO_TIME_ZONE,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    }).formatToParts(now);
    const get = (type: string) => parts.find((part) => part.type === type)?.value ?? "";
    const eventParts = new Intl.DateTimeFormat("en-CA", {
      timeZone: SAO_PAULO_TIME_ZONE,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).formatToParts(new Date(startsAt));
    const eventDay = `${eventParts.find((p) => p.type === "year")?.value}-${eventParts.find((p) => p.type === "month")?.value}-${eventParts.find((p) => p.type === "day")?.value}`;
    const nowDay = `${get("year")}-${get("month")}-${get("day")}`;

    return eventDay === nowDay && get("hour") === "12" && Number(get("minute")) < 5;
  }

  const offset = offer.send_offset_minutes ?? (offer.send_timing_type === "one_hour_before" ? 60 : 180);
  const target = start - offset * 60_000;

  return current >= target && current < target + EVENT_OFFER_SEND_GRACE_MINUTES * 60_000;
}

export function buildComboOfferMessage({
  offer,
  eventTitle,
  checkoutUrl,
}: {
  offer: Pick<ComboOfferRow, "name" | "description" | "price_cents">;
  eventTitle: string;
  checkoutUrl: string;
}) {
  return [
    "*OFERTA PARA HOJE*",
    "",
    `Você tem ingresso para ${eventTitle}.`,
    "",
    `*${offer.name}*`,
    ...formatComboDescription(offer.description)
      .split("\n")
      .map((item) => `- ${item}`),
    `Valor: ${formatCurrency(offer.price_cents)}`,
    "",
    `Voce tem 30 min para realizar a compra desta oferta: ${checkoutUrl}`,
  ].join("\n");
}

export async function getComboCheckoutStatus(orderId: string, checkoutToken: string) {
  const { data, error } = await getSupabaseAdmin()
    .from("combo_orders")
    .select("id, status, checkout_token_hash, checkout_expires_at")
    .eq("id", orderId)
    .maybeSingle<{
      id: string;
      status: string;
      checkout_token_hash: string | null;
      checkout_expires_at: string;
    }>();

  if (error) throw error;
  if (!data) return null;

  const tokenMatches = checkoutTokenHashMatches(
    checkoutToken,
    data.checkout_token_hash,
  );

  if (!tokenMatches) return null;

  if (data.status === "paid") return "approved";
  if (
    data.status === "pending_payment" &&
    new Date(data.checkout_expires_at).getTime() > Date.now()
  ) {
    return "pending";
  }

  return null;
}

async function loadSentComboOfferKeys(sourceTicketIds: string[]) {
  if (!sourceTicketIds.length) return new Set<string>();

  const { data, error } = await getSupabaseAdmin()
    .from("whatsapp_messages")
    .select("raw_metadata")
    .eq("direction", "outbound")
    .contains("raw_metadata", { reason: "combo_offer" })
    .in("raw_metadata->>source_ticket_id", sourceTicketIds);

  if (error) throw error;

  const keys = new Set<string>();

  for (const row of data ?? []) {
    const metadata = row.raw_metadata as Record<string, unknown> | null;
    const sourceTicketId =
      typeof metadata?.source_ticket_id === "string" ? metadata.source_ticket_id : null;
    const offerId = typeof metadata?.offer_id === "string" ? metadata.offer_id : null;

    if (sourceTicketId && offerId) keys.add(`${sourceTicketId}:${offerId}`);
  }

  return keys;
}

function mergeComboOfferCandidateTickets(
  ...groups: Array<ComboOfferCandidateTicketRow[] | null | undefined>
) {
  const byId = new Map<string, ComboOfferCandidateTicketRow>();

  for (const group of groups) {
    for (const ticket of group ?? []) {
      byId.set(ticket.id, ticket);
    }
  }

  return Array.from(byId.values()).sort(
    (left, right) =>
      new Date(left.issued_at).getTime() - new Date(right.issued_at).getTime(),
  );
}

export async function sendScheduledComboOffers(limit = 100) {
  await expireComboOrders(limit);

  const now = new Date();
  const eventWindowFrom = now.toISOString();
  const eventWindowTo = new Date(
    now.getTime() + EVENT_OFFER_LOOKAHEAD_MINUTES * 60_000,
  ).toISOString();
  const recentPurchaseFrom = new Date(
    now.getTime() - CUSTOM_OFFER_LOOKBACK_MINUTES * 60_000,
  ).toISOString();
  const supabase = getSupabaseAdmin();
  const [
    { data: eventWindowTickets, error: eventWindowError },
    { data: recentPurchaseTickets, error: recentPurchaseError },
  ] = await Promise.all([
    supabase
    .from("tickets")
    .select("id, customer_id, issued_at, customers(whatsapp_phone), orders!inner(status), event_sessions!inner(id, event_id, starts_at, events!inner(id, title))")
    .eq("status", "issued")
    .eq("orders.status", "paid")
    .gte("event_sessions.starts_at", eventWindowFrom)
    .lte("event_sessions.starts_at", eventWindowTo)
    .order("issued_at", { ascending: true })
    .limit(limit)
      .returns<ComboOfferCandidateTicketRow[]>(),
    supabase
      .from("tickets")
      .select("id, customer_id, issued_at, customers(whatsapp_phone), orders!inner(status), event_sessions!inner(id, event_id, starts_at, events!inner(id, title))")
      .eq("status", "issued")
      .eq("orders.status", "paid")
      .gte("issued_at", recentPurchaseFrom)
      .gte("event_sessions.starts_at", eventWindowFrom)
      .order("issued_at", { ascending: true })
      .limit(limit)
      .returns<ComboOfferCandidateTicketRow[]>(),
  ]);

  const error = eventWindowError ?? recentPurchaseError;
  if (error) throw error;

  const tickets = mergeComboOfferCandidateTickets(eventWindowTickets, recentPurchaseTickets);
  const sentKeys = await loadSentComboOfferKeys(tickets.map((ticket) => ticket.id));
  let sentCount = 0;
  let failedCount = 0;
  let skippedCount = 0;

  for (const ticket of tickets) {
    const session = firstJoin(ticket.event_sessions);
    const event = session?.events;
    const phone = ticket.customers?.whatsapp_phone;

    if (!session || !event || !phone) {
      skippedCount += 1;
      continue;
    }

    const offers = await listActiveComboOffersForEventSession(
      session.event_id,
      session.starts_at,
    );

    if (!offers.length) {
      skippedCount += 1;
      continue;
    }

    for (const offer of offers) {
      if (!shouldSendComboOfferNow(offer, session.starts_at, now, ticket.issued_at)) {
        skippedCount += 1;
        continue;
      }

      const dedupeKey = `${ticket.id}:${offer.id}`;
      if (sentKeys.has(dedupeKey)) {
        skippedCount += 1;
        continue;
      }

      const checkout = await createComboOrderForCheckout({
        offerId: offer.id,
        customerId: ticket.customer_id,
        eventId: session.event_id,
        sessionId: session.id,
        sourceTicketId: ticket.id,
      });

      if (!checkout.ok) {
        failedCount += 1;
        logWarn("Skipped combo offer without checkout", {
          ticketId: ticket.id,
          offerId: offer.id,
          reason: checkout.reason,
        });
        continue;
      }

      const conversationResult = await getOrCreateOpenConversation({
        customerId: ticket.customer_id,
      });

      if (!conversationResult.ok) {
        failedCount += 1;
        logWarn("Skipped combo offer without conversation", {
          ticketId: ticket.id,
          offerId: offer.id,
          code: conversationResult.error.code,
        });
        continue;
      }

      const message = buildComboOfferMessage({
        offer,
        eventTitle: event.title,
        checkoutUrl: checkout.checkoutUrl,
      });
      const sendResult = offer.image_url
        ? await sendZapiImage({
            phone,
            image: offer.image_url,
            caption: message,
            ensureTitle: true,
          })
        : await sendZapiText({ phone, message });
      const messageType = offer.image_url ? "image" : "text";
      const saveResult = await saveWhatsAppMessage({
        conversationId: conversationResult.conversation.id,
        customerId: ticket.customer_id,
        direction: "outbound",
        messageType,
        body: message,
        providerMessageId: sendResult.ok ? sendResult.providerMessageId : null,
        rawMetadata: buildWhatsAppOutboundMetadata({
          sendResult,
          messageType,
          reason: "combo_offer",
          businessContext: {
            offer_image_url: offer.image_url,
            source_ticket_id: ticket.id,
            offer_id: offer.id,
            combo_order_id: checkout.orderId,
            event_id: session.event_id,
            session_id: session.id,
            customer_id: ticket.customer_id,
          },
        }),
      });

      if (!saveResult.ok) {
        failedCount += 1;
        logWarn("Failed to save combo offer message", {
          ticketId: ticket.id,
          offerId: offer.id,
          code: saveResult.error?.code,
        });
        continue;
      }

      await updateConversationAfterMessage({
        conversationId: conversationResult.conversation.id,
      });

      if (sendResult.ok) {
        sentCount += 1;
        sentKeys.add(dedupeKey);
      } else {
        failedCount += 1;
      }
    }
  }

  return {
    comboOfferSentCount: sentCount,
    comboOfferFailedCount: failedCount,
    comboOfferSkippedCount: skippedCount,
  };
}

export { decimalAmountToCents };
