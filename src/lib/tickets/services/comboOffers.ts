import "server-only";

import { createHash, randomBytes, timingSafeEqual } from "crypto";
import QRCode from "qrcode";
import { createMercadoPagoPayment } from "@/lib/mercado-pago/client";
import { getEnv } from "@/lib/env";
import { logError, logInfo, logWarn } from "@/lib/logger";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { getComboOfferDelayMinutes } from "@/lib/tickets/config";
import { normalizeWhatsAppPhone } from "@/lib/tickets/phones";
import { generateComboQrImage } from "@/lib/tickets/services/comboQrImage";
import { getOrCreateOpenConversation, updateConversationAfterMessage } from "@/lib/tickets/services/conversations";
import { upsertCustomerFromWhatsApp } from "@/lib/tickets/services/customers";
import { saveWhatsAppMessage } from "@/lib/tickets/services/messages";
import { buildWhatsAppOutboundMetadata } from "@/lib/tickets/services/outboundMessages";
import { centsToDecimalAmount, decimalAmountToCents } from "@/lib/tickets/services/payments";
import {
  getPublicEventVisibilityQueryFloorIso,
  getPublicVisibleSessionStatuses,
  isPublicEventVisible,
  PUBLIC_VISIBLE_EVENT_STATUSES,
} from "@/lib/tickets/services/publicEventVisibility";
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
const CUSTOM_OFFER_SEND_GRACE_MINUTES = 3;
const COMBO_OFFER_EVENT_LOCK_TTL_SECONDS = 90;
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
  originalPriceCents: number | null;
  priceCents: number;
  displayPriority: number;
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
  original_price_cents?: number | null;
  price_cents: number;
  display_priority?: number | null;
  currency: "BRL";
  send_timing_type: ComboOfferTimingType;
  send_offset_minutes: number | null;
  send_time_of_day: string | null;
  send_weekdays: number[] | null;
  status: "active" | "paused" | "deleted";
  created_at?: string;
};

type ComboOfferScopeRow = {
  id?: string;
  offer_id: string;
  scope_type: "all_events" | "event" | "weekday";
  event_id: string | null;
  weekday: number | null;
  display_priority?: number | null;
  created_at?: string;
  events?: { title: string } | { title: string }[] | null;
};

type ComboOrderRow = {
  id: string;
  offer_id: string | null;
  customer_id: string;
  event_id: string;
  session_id: string;
  source_order_id?: string | null;
  status: "pending_payment" | "paid" | "cancelled" | "expired";
  quantity: number;
  unit_amount_cents: number;
  total_amount_cents: number;
  currency: "BRL";
  external_reference: string | null;
  checkout_token_hash: string | null;
  checkout_expires_at: string;
  combo_offers:
    | { name: string; description: string; image_url: string | null; original_price_cents?: number | null }
    | { name: string; description: string; image_url: string | null; original_price_cents?: number | null }[]
    | null;
  customers?: { whatsapp_phone: string | null; email?: string | null; name?: string | null } | null;
  events?: { title: string; city: string; state: string; venues?: { name: string | null } | null } | null;
  event_sessions?: { starts_at: string; timezone?: string | null; status?: string; events?: { status: string } | null } | null;
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
  offer_customer_id?: string;
  offer_phone?: string | null;
  offer_source?: "buyer" | "participant";
  recipient_phone?: string | null;
  participant_delivery_status?: string | null;
  buyer_qr_delivered_at?: string | null;
  participant_delivered_at?: string | null;
  issued_at: string;
  orders:
    | {
        id: string;
        created_at: string;
        status: string;
        official_table_map_reservations?: Array<{ place_code: string; status: string }> | { place_code: string; status: string } | null;
      }
    | {
        id: string;
        created_at: string;
        status: string;
        official_table_map_reservations?: Array<{ place_code: string; status: string }> | { place_code: string; status: string } | null;
      }[]
    | null;
  event_sessions:
    | {
        id: string;
        event_id: string;
        starts_at: string;
        timezone?: string | null;
        status?: string;
        events: { id: string; title: string; status?: string };
      }
    | {
        id: string;
        event_id: string;
        starts_at: string;
        timezone?: string | null;
        status?: string;
        events: { id: string; title: string; status?: string };
      }[]
    | null;
  customers: { whatsapp_phone: string | null } | null;
};

type PaidComboOrderRow = ComboOrderRow & {
  source_order_id: string | null;
  customers: { whatsapp_phone: string | null; name: string | null };
  events: { title: string; city: string; state: string; venues?: { name: string | null } | null };
  event_sessions: { starts_at: string; timezone?: string | null; status?: string; events?: { status: string } | null };
};

function firstJoin<T>(value: T | T[] | null | undefined) {
  return Array.isArray(value) ? value[0] : value ?? null;
}

function hashSecret(value: string) {
  return createHash("sha256").update(value).digest("hex");
}

function buildLockToken() {
  return randomBytes(16).toString("hex");
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

function normalizeDisplayPriority(value: number | null | undefined) {
  if (typeof value !== "number") return 1;
  return Number.isInteger(value) && value > 0 && value <= 1000 ? value : 1;
}

async function getNextEventOfferPriority(eventId: string) {
  const { data, error } = await getSupabaseAdmin()
    .from("combo_offer_scopes")
    .select("display_priority")
    .eq("scope_type", "event")
    .eq("event_id", eventId)
    .order("display_priority", { ascending: false })
    .limit(1)
    .maybeSingle<{ display_priority: number | null }>();

  if (error) throw error;
  return normalizeDisplayPriority(data?.display_priority) + 1;
}

async function insertOfferScopes(offerId: string, scope: ComboOfferScopeInput) {
  const supabase = getSupabaseAdmin();
  const rows =
    scope.scopeType === "all_events"
      ? [{ offer_id: offerId, scope_type: "all_events" }]
      : scope.scopeType === "event"
        ? await Promise.all(
            [...new Set(scope.eventIds)].map(async (eventId) => ({
              offer_id: offerId,
              scope_type: "event",
              event_id: eventId,
              display_priority: await getNextEventOfferPriority(eventId),
            })),
          )
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

async function renumberEventScopedOfferPriorities(
  offerId: string,
  requestedPriority: number,
) {
  const supabase = getSupabaseAdmin();
  const { data: targetScopes, error: targetError } = await supabase
    .from("combo_offer_scopes")
    .select("event_id")
    .eq("offer_id", offerId)
    .eq("scope_type", "event")
    .not("event_id", "is", null)
    .returns<Array<{ event_id: string | null }>>();

  if (targetError) throw targetError;

  const eventIds = [...new Set((targetScopes ?? []).map((scope) => scope.event_id).filter(Boolean) as string[])];
  if (!eventIds.length) {
    const { error } = await supabase
      .from("combo_offers")
      .update({ display_priority: requestedPriority })
      .eq("id", offerId)
      .neq("status", "deleted");
    if (error) throw error;
    return;
  }

  for (const eventId of eventIds) {
    const { data: scopes, error } = await supabase
      .from("combo_offer_scopes")
      .select("id, offer_id, display_priority, created_at, combo_offers!inner(status)")
      .eq("scope_type", "event")
      .eq("event_id", eventId)
      .neq("combo_offers.status", "deleted")
      .returns<Array<ComboOfferScopeRow & { id: string }>>();

    if (error) throw error;

    const others = (scopes ?? [])
      .filter((scope) => scope.offer_id !== offerId)
      .sort((left, right) =>
        normalizeDisplayPriority(left.display_priority) - normalizeDisplayPriority(right.display_priority) ||
        String(left.created_at ?? "").localeCompare(String(right.created_at ?? "")) ||
        left.offer_id.localeCompare(right.offer_id),
      );
    const insertAt = Math.min(Math.max(requestedPriority, 1), others.length + 1) - 1;
    const ordered = [
      ...others.slice(0, insertAt),
      ...(scopes ?? []).filter((scope) => scope.offer_id === offerId),
      ...others.slice(insertAt),
    ];

    for (const [index, scope] of ordered.entries()) {
      await supabase
        .from("combo_offer_scopes")
        .update({ display_priority: 10_000 + index })
        .eq("id", scope.id)
        .throwOnError();
    }

    for (const [index, scope] of ordered.entries()) {
      const nextPriority = index + 1;
      await supabase
        .from("combo_offer_scopes")
        .update({ display_priority: nextPriority })
        .eq("id", scope.id)
        .throwOnError();
      await supabase
        .from("combo_offers")
        .update({ display_priority: nextPriority })
        .eq("id", scope.offer_id)
        .throwOnError();
    }
  }
}

export async function createComboOffer({
  name,
  description,
  imageUrl,
  originalPriceCents,
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
  originalPriceCents?: number | null;
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
      original_price_cents: originalPriceCents ?? null,
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
    .select("id, name, description, image_url, original_price_cents, price_cents, display_priority, currency, send_timing_type, send_offset_minutes, send_time_of_day, send_weekdays, status")
    .order("display_priority", { ascending: true })
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
    originalPriceCents: offer.original_price_cents ?? null,
    priceCents: offer.price_cents,
    displayPriority: normalizeDisplayPriority(offer.display_priority),
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
  originalPriceCents,
  priceCents,
  displayPriority,
  timingType,
  customOffsetMinutes,
}: {
  offerId: string;
  name?: string;
  description?: string;
  imageUrl?: string | null;
  originalPriceCents?: number | null;
  priceCents?: number;
  displayPriority?: number;
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

  if (originalPriceCents !== undefined) {
    if (
      originalPriceCents !== null &&
      (!Number.isInteger(originalPriceCents) || originalPriceCents <= 0)
    ) {
      return { ok: false as const, reason: "invalid_input" as const };
    }
    payload.original_price_cents = originalPriceCents;
  }

  if (displayPriority !== undefined) {
    if (!Number.isInteger(displayPriority) || displayPriority <= 0 || displayPriority > 1000) {
      return { ok: false as const, reason: "invalid_input" as const };
    }
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

  if (Object.keys(payload).length === 0 && displayPriority === undefined) {
    return { ok: false as const, reason: "invalid_input" as const };
  }

  if (Object.keys(payload).length > 0) {
    const { error } = await getSupabaseAdmin()
      .from("combo_offers")
      .update(payload)
      .eq("id", offerId)
      .neq("status", "deleted");

    if (error) return { ok: false as const, reason: "database_error" as const, error };
  }

  if (displayPriority !== undefined) {
    try {
      await renumberEventScopedOfferPriorities(offerId, displayPriority);
    } catch (error) {
      return { ok: false as const, reason: "database_error" as const, error };
    }
  }

  return { ok: true as const };
}

export async function updateComboOfferScope(offerId: string, scope: ComboOfferScopeInput) {
  const supabase = getSupabaseAdmin();
  const normalizedScope =
    scope.scopeType === "all_events"
      ? scope
      : scope.scopeType === "event"
        ? { scopeType: "event" as const, eventIds: [...new Set(scope.eventIds)].filter(Boolean) }
        : { scopeType: "weekday" as const, weekdays: normalizeWeekdays(scope.weekdays) };

  if (normalizedScope.scopeType === "event" && normalizedScope.eventIds.length === 0) {
    return { ok: false as const, reason: "invalid_input" as const };
  }
  if (normalizedScope.scopeType === "weekday" && normalizedScope.weekdays.length === 0) {
    return { ok: false as const, reason: "invalid_input" as const };
  }

  const { error: deleteError } = await supabase
    .from("combo_offer_scopes")
    .delete()
    .eq("offer_id", offerId);
  if (deleteError) return { ok: false as const, reason: "database_error" as const, error: deleteError };

  try {
    await insertOfferScopes(offerId, normalizedScope);
  } catch (error) {
    return { ok: false as const, reason: "database_error" as const, error };
  }

  if (normalizedScope.scopeType === "weekday") {
    await supabase
      .from("combo_offers")
      .update({ send_weekdays: normalizedScope.weekdays })
      .eq("id", offerId);
  } else {
    await supabase
      .from("combo_offers")
      .update({ send_weekdays: [] })
      .eq("id", offerId);
  }

  return { ok: true as const };
}

export async function duplicateComboOffer(offerId: string, adminUserId?: string | null) {
  const supabase = getSupabaseAdmin();
  const { data: offer, error } = await supabase
    .from("combo_offers")
    .select("name, description, image_url, original_price_cents, price_cents, display_priority, send_timing_type, send_offset_minutes, send_time_of_day, send_weekdays")
    .eq("id", offerId)
    .maybeSingle<ComboOfferRow>();

  if (error || !offer) return { ok: false as const, reason: "not_found" as const, error };

  const { data: scopes, error: scopesError } = await supabase
    .from("combo_offer_scopes")
    .select("scope_type, event_id, weekday, display_priority")
    .eq("offer_id", offerId)
    .returns<ComboOfferScopeRow[]>();

  if (scopesError) return { ok: false as const, reason: "database_error" as const, error: scopesError };

  const { data: copy, error: copyError } = await supabase
    .from("combo_offers")
    .insert({
      name: `${offer.name} (cópia)`,
      description: offer.description,
      image_url: offer.image_url,
      original_price_cents: offer.original_price_cents ?? null,
      price_cents: offer.price_cents,
      display_priority: normalizeDisplayPriority(offer.display_priority),
      send_timing_type: offer.send_timing_type,
      send_offset_minutes: offer.send_offset_minutes,
      send_time_of_day: offer.send_time_of_day,
      send_weekdays: offer.send_weekdays ?? [],
      source_offer_id: offerId,
      created_by_admin_user_id: adminUserId ?? null,
      status: "paused",
    })
    .select("id")
    .single<{ id: string }>();

  if (copyError) return { ok: false as const, reason: "database_error" as const, error: copyError };

  const rows = await Promise.all(
    (scopes ?? []).map(async (scope) => ({
      offer_id: copy.id,
      scope_type: scope.scope_type,
      event_id: scope.event_id,
      weekday: scope.weekday,
      display_priority:
        scope.scope_type === "event" && scope.event_id
          ? await getNextEventOfferPriority(scope.event_id)
          : normalizeDisplayPriority(scope.display_priority),
    })),
  );
  if (rows.length) {
    const { error: insertScopesError } = await supabase.from("combo_offer_scopes").insert(rows);
    if (insertScopesError) {
      await supabase.from("combo_offers").delete().eq("id", copy.id);
      return { ok: false as const, reason: "database_error" as const, error: insertScopesError };
    }

    const firstPriority = normalizeDisplayPriority(rows[0]?.display_priority);
    await supabase
      .from("combo_offers")
      .update({ display_priority: firstPriority })
      .eq("id", copy.id);
  }

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
          original_price_cents: offer.originalPriceCents,
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
        `Prioridade: ${offer.displayPriority}`,
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
  if (offer.sendTimingType === "custom" && offer.sendOffsetMinutes === 3) {
    return "3 minutos após a compra";
  }
  if (offer.sendTimingType === "custom" && offer.sendOffsetMinutes === 15) {
    return "15 minutos apos a compra";
  }
  if (offer.sendTimingType === "custom" && offer.sendOffsetMinutes === 120) {
    return "2h após a compra";
  }
  if (offer.sendTimingType === "custom" && offer.sendOffsetMinutes === 1440) {
    return "24h após a compra";
  }

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
    .select("id, name, description, image_url, original_price_cents, price_cents, display_priority, currency, send_timing_type, send_offset_minutes, send_time_of_day, send_weekdays, status")
    .eq("id", offerId)
    .eq("status", "active")
    .maybeSingle<ComboOfferRow>();

  if (error || !offer) return null;

  const { data: session, error: sessionError } = await supabase
    .from("event_sessions")
    .select("id, event_id, starts_at, timezone, status, events!inner(status)")
    .eq("id", sessionId)
    .eq("event_id", eventId)
    .gte("starts_at", getPublicEventVisibilityQueryFloorIso())
    .in("events.status", PUBLIC_VISIBLE_EVENT_STATUSES)
    .maybeSingle<{ id: string; event_id: string; starts_at: string; timezone: string | null; status: string; events: { status: string } | null }>();

  if (sessionError || !session) return null;
  if (
    !isPublicEventVisible({
      startsAt: session.starts_at,
      timezone: session.timezone,
      sessionStatus: session.status,
      eventStatus: session.events?.status,
      purpose: "offer",
    })
  ) {
    return null;
  }

  return offer;
}

export async function createComboOrderForCheckout({
  offerId,
  customerId,
  eventId,
  sessionId,
  sourceOrderId,
  sourceTicketId,
}: {
  offerId: string;
  customerId: string;
  eventId: string;
  sessionId: string;
  sourceOrderId?: string | null;
  sourceTicketId?: string | null;
}) {
  const offer = await loadOfferForSession(offerId, eventId, sessionId);
  if (!offer) return { ok: false as const, reason: "offer_not_found" as const };

  const supabase = getSupabaseAdmin();
  const now = await getDatabaseNow(supabase);
  const checkoutExpiresAt = new Date(now.getTime() + CHECKOUT_TTL_MINUTES * 60_000).toISOString();
  if (sourceTicketId) {
    const { data: existingOrder, error: existingError } = await supabase
      .from("combo_orders")
      .select("id, checkout_token_hash, checkout_expires_at, status")
      .eq("source_ticket_id", sourceTicketId)
      .eq("offer_id", offer.id)
      .in("status", ["pending_payment", "expired"])
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle<{
        id: string;
        checkout_token_hash: string | null;
        checkout_expires_at: string;
        status: string;
      }>();

    if (existingError) return { ok: false as const, reason: "database_error" as const, error: existingError };

    if (existingOrder) {
      const token = buildComboCheckoutToken();
      const nextExpiresAt = new Date(existingOrder.status === "expired" ? now.getTime() + CHECKOUT_TTL_MINUTES * 60_000 : new Date(existingOrder.checkout_expires_at).getTime()).toISOString();
      const updateResult = await supabase
        .from("combo_orders")
        .update({
          checkout_token_hash: hashSecret(token),
          checkout_expires_at: nextExpiresAt,
          status: "pending_payment",
        })
        .eq("id", existingOrder.id);

      if (updateResult.error) return { ok: false as const, reason: "database_error" as const, error: updateResult.error };

      return {
        ok: true as const,
        orderId: existingOrder.id,
        checkoutUrl: buildComboCheckoutUrl(existingOrder.id, token),
        expiresAt: nextExpiresAt,
        offerName: offer.name,
        priceCents: offer.price_cents,
      };
    }
  } else if (sourceOrderId) {
    const { data: existingOrder, error: existingError } = await supabase
      .from("combo_orders")
      .select("id, checkout_token_hash, checkout_expires_at, status")
      .eq("source_order_id", sourceOrderId)
      .eq("offer_id", offer.id)
      .in("status", ["pending_payment", "expired"])
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle<{
        id: string;
        checkout_token_hash: string | null;
        checkout_expires_at: string;
        status: string;
      }>();

    if (existingError) return { ok: false as const, reason: "database_error" as const, error: existingError };

    if (existingOrder) {
      const token = buildComboCheckoutToken();
      const nextExpiresAt = new Date(existingOrder.status === "expired" ? now.getTime() + CHECKOUT_TTL_MINUTES * 60_000 : new Date(existingOrder.checkout_expires_at).getTime()).toISOString();
      const updateResult = await supabase
        .from("combo_orders")
        .update({
          checkout_token_hash: hashSecret(token),
          checkout_expires_at: nextExpiresAt,
          status: "pending_payment",
        })
        .eq("id", existingOrder.id);

      if (updateResult.error) return { ok: false as const, reason: "database_error" as const, error: updateResult.error };

      return {
        ok: true as const,
        orderId: existingOrder.id,
        checkoutUrl: buildComboCheckoutUrl(existingOrder.id, token),
        expiresAt: nextExpiresAt,
        offerName: offer.name,
        priceCents: offer.price_cents,
      };
    }
  }

  const { data: order, error } = await supabase
    .from("combo_orders")
    .insert({
      offer_id: offer.id,
      customer_id: customerId,
      event_id: eventId,
      session_id: sessionId,
      source_order_id: sourceOrderId ?? null,
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
    .select("id, offer_id, customer_id, event_id, session_id, status, quantity, unit_amount_cents, total_amount_cents, currency, external_reference, checkout_token_hash, checkout_expires_at, combo_offers(name, description, image_url, original_price_cents), customers(whatsapp_phone, email), events(title, city, state, venues(name)), event_sessions(starts_at, timezone, status, events(status))")
    .eq("id", orderId)
    .gte("event_sessions.starts_at", getPublicEventVisibilityQueryFloorIso())
    .maybeSingle<ComboOrderRow>();

  if (error || !order || order.status !== "pending_payment") return null;
  if (
    !isPublicEventVisible({
      startsAt: order.event_sessions?.starts_at,
      timezone: order.event_sessions?.timezone,
      sessionStatus: order.event_sessions?.status,
      eventStatus: order.event_sessions?.events?.status,
      purpose: "checkout",
    })
  ) {
    return null;
  }
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

export async function trackComboCheckoutClick(orderId: string) {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("combo_orders")
    .select("raw_metadata")
    .eq("id", orderId)
    .maybeSingle<{ raw_metadata: Record<string, unknown> | null }>();

  if (error || !data) return;

  const metadata = data.raw_metadata ?? {};
  const currentCount = Number(metadata.checkout_click_count ?? 0);

  await supabase
    .from("combo_orders")
    .update({
      raw_metadata: {
        ...metadata,
        checkout_click_kind: "offer",
        checkout_clicked_at: new Date().toISOString(),
        checkout_click_count: Number.isFinite(currentCount) ? currentCount + 1 : 1,
      },
    })
    .eq("id", orderId);
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

function getMercadoPagoAccessTokenFingerprint(accessToken: string) {
  return createHash("sha256").update(accessToken).digest("hex").slice(0, 16);
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
  const env = getEnv();
  const accessTokenFingerprint = getMercadoPagoAccessTokenFingerprint(
    env.MERCADO_PAGO_ACCESS_TOKEN,
  );
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
  const attemptAccessTokenFingerprint =
    typeof attempt?.access_token_fingerprint === "string"
      ? attempt.access_token_fingerprint
      : null;

  if (
    providerPaymentId &&
    activeStatus &&
    attemptAccessTokenFingerprint === accessTokenFingerprint &&
    ["pending", "in_process", "approved"].includes(activeStatus)
  ) {
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
      notification_url: `${env.APP_BASE_URL.replace(/\/$/, "")}/api/webhook/payment/mercado-pago`,
      metadata: {
        combo_order_id: order.orderId,
        checkout_type: "combo",
      },
    },
    `${paymentRow.id}:combo:pix:${accessTokenFingerprint}`,
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
          access_token_fingerprint: accessTokenFingerprint,
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

function formatOfferEventDate(startsAt: string) {
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
    .replace(",", " Ã s");

  return `${weekday.charAt(0).toLocaleUpperCase("pt-BR")}${weekday.slice(1)} ${dayTime}`;
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
    .select("id, offer_id, customer_id, event_id, session_id, source_order_id, status, quantity, unit_amount_cents, total_amount_cents, currency, external_reference, checkout_token_hash, checkout_expires_at, combo_offers(name, description, image_url, original_price_cents), customers(whatsapp_phone, name), events(title, city, state, venues(name)), event_sessions(starts_at, timezone, status, events(status))")
    .eq("id", orderId)
    .gte("event_sessions.starts_at", getPublicEventVisibilityQueryFloorIso())
    .maybeSingle<PaidComboOrderRow>();

  if (error) throw error;
  return data;
}

async function getComboOrderTableMapPlaceCode(order: Pick<PaidComboOrderRow, "source_order_id" | "customer_id" | "event_id" | "session_id">) {
  if (!order.source_order_id) return null;

  const { data, error } = await getSupabaseAdmin()
    .from("official_table_map_reservations")
    .select("place_code")
    .eq("order_id", order.source_order_id)
    .eq("customer_id", order.customer_id)
    .eq("event_id", order.event_id)
    .eq("session_id", order.session_id)
    .eq("status", "paid")
    .maybeSingle<{ place_code: string | null }>();

  if (error) {
    logWarn("Failed to load combo table map place for QR image", {
      comboSourceOrderId: order.source_order_id,
      code: error.code,
    });
    return null;
  }

  return data?.place_code ?? null;
}

export async function deliverComboOrder(orderId: string) {
  const supabase = getSupabaseAdmin();
  const order = await loadPaidComboOrder(orderId);

  if (!order || order.status !== "paid") return { ok: false as const, reason: "order_not_found" as const };
  if (
    !isPublicEventVisible({
      startsAt: order.event_sessions.starts_at,
      timezone: order.event_sessions.timezone,
      sessionStatus: order.event_sessions.status,
      eventStatus: order.event_sessions.events?.status,
      purpose: "issued_access",
    })
  ) {
    return { ok: false as const, reason: "order_not_found" as const };
  }

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
  const tableMapPlaceCode = await getComboOrderTableMapPlaceCode(order);
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
  const qrPayload = `combo:${redemptionId}:${token}`;
  const image = await generateComboQrImage({
    qrPayload,
    comboName: offer?.name ?? "Combo",
    comboItems: offer?.description ?? null,
    eventTitle: event.title,
    startsAt: order.event_sessions.starts_at,
    timezone: order.event_sessions.timezone,
    buyerName: order.customers.name,
    redemptionCode,
    tableMapPlaceCode,
  });
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
    .select("id, name, description, image_url, original_price_cents, price_cents, display_priority, currency, send_timing_type, send_offset_minutes, send_time_of_day, send_weekdays, status, created_at, combo_offer_scopes!inner(scope_type, event_id, weekday, display_priority)")
    .eq("status", "active")
    .or(`scope_type.eq.all_events,event_id.eq.${eventId},weekday.eq.${weekdayIndex}`, {
      referencedTable: "combo_offer_scopes",
    })
    .order("display_priority", { ascending: true })
    .order("created_at", { ascending: false })
    .returns<Array<ComboOfferRow & { combo_offer_scopes: ComboOfferScopeRow[] }>>();

  if (error) throw error;
  return resolveEffectiveComboOffersForEvent(data ?? [], eventId);
}

function getComboOfferPriorityForEvent(
  offer: ComboOfferRow & { combo_offer_scopes?: ComboOfferScopeRow[] },
  eventId: string,
) {
  const eventScope = (offer.combo_offer_scopes ?? []).find(
    (scope) => scope.scope_type === "event" && scope.event_id === eventId,
  );

  return normalizeDisplayPriority(eventScope?.display_priority ?? offer.display_priority);
}

function getComboOfferScopeRankForEvent(
  offer: ComboOfferRow & { combo_offer_scopes?: ComboOfferScopeRow[] },
  eventId: string,
) {
  const scopes = offer.combo_offer_scopes ?? [];
  if (scopes.some((scope) => scope.scope_type === "event" && scope.event_id === eventId)) return 0;
  if (scopes.some((scope) => scope.scope_type === "weekday")) return 1;
  return 2;
}

function resolveEffectiveComboOffersForEvent<T extends ComboOfferRow & { combo_offer_scopes?: ComboOfferScopeRow[] }>(
  offers: T[],
  eventId: string,
) {
  const byPriority = new Map<number, T>();

  for (const offer of offers) {
    const priority = getComboOfferPriorityForEvent(offer, eventId);
    const existing = byPriority.get(priority);

    if (!existing) {
      byPriority.set(priority, offer);
      continue;
    }

    const offerRank = getComboOfferScopeRankForEvent(offer, eventId);
    const existingRank = getComboOfferScopeRankForEvent(existing, eventId);
    const offerTime = new Date(offer.created_at ?? 0).getTime();
    const existingTime = new Date(existing.created_at ?? 0).getTime();

    if (
      offerRank < existingRank ||
      (offerRank === existingRank && (
        offerTime > existingTime ||
        (offerTime === existingTime && offer.id.localeCompare(existing.id) < 0)
      ))
    ) {
      byPriority.set(priority, offer);
    }
  }

  return [...byPriority.entries()]
    .sort((left, right) => left[0] - right[0])
    .map(([, offer]) => offer);
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

function shouldRecoverMissedComboOffer(
  offer: ComboOfferRow,
  startsAt: string,
  now = new Date(),
  purchasedAt?: string | null,
) {
  const start = new Date(startsAt).getTime();
  const current = now.getTime();

  if (!Number.isFinite(start) || current >= start) return false;

  if (offer.send_timing_type === "custom") {
    const purchaseTime = purchasedAt ? new Date(purchasedAt).getTime() : Number.NaN;
    const offset = offer.send_offset_minutes;

    if (!Number.isFinite(purchaseTime) || !offset || offset <= 0) return false;

    return current >= purchaseTime + offset * 60_000;
  }

  const eventWindowStart = start - EVENT_OFFER_LOOKAHEAD_MINUTES * 60_000;
  if (current < eventWindowStart) return false;

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

    if (eventDay !== nowDay) return false;
    if (get("hour") > "12") return true;
    return get("hour") === "12" && Number(get("minute")) >= 5;
  }

  const offset = offer.send_offset_minutes ?? (offer.send_timing_type === "one_hour_before" ? 60 : 180);
  return current >= start - offset * 60_000;
}

export function buildComboOfferMessage({
  offer,
  eventTitle,
  eventStartsAt,
  checkoutUrl,
}: {
  offer: Pick<ComboOfferRow, "name" | "description" | "original_price_cents" | "price_cents">;
  eventTitle: string;
  eventStartsAt?: string | null;
  checkoutUrl: string;
}) {
  const originalPriceCents =
    offer.original_price_cents && offer.original_price_cents > offer.price_cents
      ? offer.original_price_cents
      : offer.price_cents + 2000;

  return [
    "*OFERTA ROTA5*",
    "",
    `*${offer.name}*`,
    ...formatComboDescription(offer.description)
      .split("\n")
      .map((item) => `> ${item}`),
    `> De ~${formatCurrency(originalPriceCents)}~ por ${formatCurrency(offer.price_cents)}`,
    "",
    `Voce tem 30 min para comprar: ${checkoutUrl}`,
    "",
    "Oferta valida para:",
    `| ${eventTitle}`,
    ...(eventStartsAt ? [`| ${formatOfferEventDate(eventStartsAt)}`] : []),
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

function buildComboOfferDedupeKey({
  customerId,
  eventId,
  offerId,
}: {
  customerId: string;
  eventId: string;
  offerId: string;
}) {
  return `${customerId}:${eventId}:${offerId}`;
}

function buildComboOfferRecipientDedupeKey({
  phone,
  eventId,
  offerId,
  sourceTicketId,
  recipientType,
}: {
  phone: string;
  eventId: string;
  offerId: string;
  sourceTicketId: string;
  recipientType: "buyer" | "participant";
}) {
  return `${phone}:${eventId}:${offerId}:${sourceTicketId}:${recipientType}`;
}

function comboOfferRecipientFromTicket(ticket: ComboOfferCandidateTicketRow) {
  const recipientPhone = normalizeWhatsAppPhone(ticket.recipient_phone);

  if (recipientPhone) {
    if (ticket.participant_delivery_status !== "delivered") return null;
    return {
      phone: recipientPhone,
      recipientType: "participant" as const,
    };
  }

  const buyerPhone = normalizeWhatsAppPhone(ticket.customers?.whatsapp_phone);
  if (!buyerPhone) return null;

  return {
    phone: buyerPhone,
    recipientType: "buyer" as const,
  };
}

function getComboOfferRecipientQrDeliveredAt(
  ticket: ComboOfferCandidateTicketRow,
  recipientType: "buyer" | "participant",
) {
  return recipientType === "participant"
    ? ticket.participant_delivered_at ?? null
    : ticket.buyer_qr_delivered_at ?? null;
}

function hasRecipientQrDelivery(
  ticket: ComboOfferCandidateTicketRow,
  recipientType: "buyer" | "participant",
) {
  return Boolean(getComboOfferRecipientQrDeliveredAt(ticket, recipientType));
}

function hasComboOfferQrDelayElapsed({
  qrDeliveredAt,
  now,
  delayMinutes = getComboOfferDelayMinutes(),
}: {
  qrDeliveredAt: string | null | undefined;
  now: Date;
  delayMinutes?: number;
}) {
  if (!qrDeliveredAt) return false;

  const deliveredAt = new Date(qrDeliveredAt).getTime();
  if (!Number.isFinite(deliveredAt)) return false;

  return deliveredAt + delayMinutes * 60_000 <= now.getTime();
}

async function loadSentComboOfferKeys(customerIds: string[], recipientPhones: string[] = []) {
  if (!customerIds.length && !recipientPhones.length) {
    return { legacyKeys: new Set<string>(), recipientKeys: new Set<string>() };
  }

  let query = getSupabaseAdmin()
    .from("whatsapp_messages")
    .select("raw_metadata")
    .eq("direction", "outbound")
    .contains("raw_metadata", { reason: "combo_offer", send_status: "sent" });

  if (customerIds.length) {
    query = query.in("customer_id", Array.from(new Set(customerIds)));
  }

  const { data, error } = await query;

  if (error) throw error;

  const legacyKeys = new Set<string>();
  const recipientKeys = new Set<string>();
  const requestedPhones = new Set(recipientPhones);

  for (const row of data ?? []) {
    const metadata = row.raw_metadata as Record<string, unknown> | null;
    const customerId =
      typeof metadata?.customer_id === "string" ? metadata.customer_id : null;
    const eventId =
      typeof metadata?.event_id === "string" ? metadata.event_id : null;
    const offerId = typeof metadata?.offer_id === "string" ? metadata.offer_id : null;
    const phone = normalizeWhatsAppPhone(
      typeof metadata?.recipient_phone === "string" ? metadata.recipient_phone : null,
    );
    const sourceTicketId =
      typeof metadata?.source_ticket_id === "string" ? metadata.source_ticket_id : null;
    const recipientType =
      metadata?.recipient_type === "participant" || metadata?.recipient_type === "buyer"
        ? metadata.recipient_type
        : null;

    if (customerId && eventId && offerId) {
      legacyKeys.add(buildComboOfferDedupeKey({ customerId, eventId, offerId }));
    }

    if (phone && eventId && offerId && sourceTicketId && recipientType && requestedPhones.has(phone)) {
      recipientKeys.add(buildComboOfferRecipientDedupeKey({
        phone,
        eventId,
        offerId,
        sourceTicketId,
        recipientType,
      }));
    }
  }

  return { legacyKeys, recipientKeys };
}

function mergeComboOfferCandidateTickets(
  ...groups: Array<ComboOfferCandidateTicketRow[] | null | undefined>
) {
  const byId = new Map<string, ComboOfferCandidateTicketRow>();

  for (const group of groups) {
    for (const ticket of group ?? []) {
      const customerId = ticket.offer_customer_id ?? ticket.customer_id;
      byId.set(`${ticket.offer_source ?? "buyer"}:${customerId}:${ticket.id}`, ticket);
    }
  }

  return Array.from(byId.values()).sort(
    (left, right) =>
      new Date(left.buyer_qr_delivered_at ?? left.participant_delivered_at ?? left.issued_at).getTime() -
      new Date(right.buyer_qr_delivered_at ?? right.participant_delivered_at ?? right.issued_at).getTime(),
  );
}

function uniqueComboOfferCandidateTicketsByOrder(
  tickets: ComboOfferCandidateTicketRow[],
) {
  const byRecipient = new Map<string, ComboOfferCandidateTicketRow>();

  for (const ticket of tickets) {
    const order = firstJoin(ticket.orders);

    if (!order) {
      continue;
    }

    const recipient = comboOfferRecipientFromTicket(ticket);
    if (!recipient) continue;

    const session = firstJoin(ticket.event_sessions);
    if (!session) continue;

    const key = `${recipient.recipientType}:${recipient.phone}:${session.event_id}:${order.id}`;

    const candidate = {
      ...ticket,
      offer_phone: recipient.phone,
      offer_source: recipient.recipientType,
    };
    const existing = byRecipient.get(key);

    if (
      !existing ||
      (
        !hasRecipientQrDelivery(existing, recipient.recipientType) &&
        hasRecipientQrDelivery(candidate, recipient.recipientType)
      )
    ) {
      byRecipient.set(key, candidate);
    }
  }

  return Array.from(byRecipient.values());
}

async function getPaidTicketPurchaseNumberForEvent({
  customerId,
  eventId,
  currentOrderId,
  currentOrderCreatedAt,
}: {
  customerId: string;
  eventId: string;
  currentOrderId: string;
  currentOrderCreatedAt: string;
}) {
  const { data, error } = await getSupabaseAdmin()
    .from("orders")
    .select("id, created_at, tickets!inner(customer_id, event_sessions!inner(event_id))")
    .eq("status", "paid")
    .eq("tickets.customer_id", customerId)
    .eq("tickets.event_sessions.event_id", eventId)
    .lte("created_at", currentOrderCreatedAt)
    .order("created_at", { ascending: true })
    .returns<Array<{ id: string; created_at: string }>>();

  if (error) throw error;

  const orderedIds = [...new Set((data ?? []).map((order) => order.id))];
  const index = orderedIds.indexOf(currentOrderId);

  return index >= 0 ? index + 1 : orderedIds.length + 1;
}

async function acquireComboOfferEventLock({
  customerId,
  eventId,
}: {
  customerId: string;
  eventId: string;
}) {
  const supabase = getSupabaseAdmin();
  const lockToken = buildLockToken();
  const lockedUntil = new Date(Date.now() + COMBO_OFFER_EVENT_LOCK_TTL_SECONDS * 1000).toISOString();
  const insert = await supabase
    .from("combo_offer_event_locks")
    .insert({
      customer_id: customerId,
      event_id: eventId,
      lock_token: lockToken,
      locked_until: lockedUntil,
    });

  if (!insert.error) return { acquired: true as const, lockToken };

  const update = await supabase
    .from("combo_offer_event_locks")
    .update({ lock_token: lockToken, locked_until: lockedUntil })
    .eq("customer_id", customerId)
    .eq("event_id", eventId)
    .lte("locked_until", new Date().toISOString());

  if (update.error) throw update.error;

  const { data, error } = await supabase
    .from("combo_offer_event_locks")
    .select("lock_token")
    .eq("customer_id", customerId)
    .eq("event_id", eventId)
    .maybeSingle<{ lock_token: string }>();

  if (error) throw error;
  return data?.lock_token === lockToken
    ? { acquired: true as const, lockToken }
    : { acquired: false as const };
}

async function releaseComboOfferEventLock({
  customerId,
  eventId,
  lockToken,
}: {
  customerId: string;
  eventId: string;
  lockToken: string;
}) {
  const { error } = await getSupabaseAdmin()
    .from("combo_offer_event_locks")
    .delete()
    .eq("customer_id", customerId)
    .eq("event_id", eventId)
    .eq("lock_token", lockToken);

  if (error) {
    logWarn("Failed to release combo offer event lock", {
      customerId,
      eventId,
      error,
    });
  }
}

async function getDatabaseNow(supabase = getSupabaseAdmin()) {
  const { data, error } = await supabase.rpc("get_database_now");

  if (error || !data) {
    logWarn("Falling back to application clock for combo offer scheduler", {
      code: error?.code,
    });
    return new Date();
  }

  return new Date(String(data));
}

export async function sendScheduledComboOffers(limit = 100) {
  await expireComboOrders(limit);

  const supabase = getSupabaseAdmin();
  const now = await getDatabaseNow(supabase);
  const eventWindowFrom = getPublicEventVisibilityQueryFloorIso(now);
  const eventWindowTo = new Date(
    now.getTime() + EVENT_OFFER_LOOKAHEAD_MINUTES * 60_000,
  ).toISOString();
  const recentPurchaseFrom = new Date(
    now.getTime() - CUSTOM_OFFER_LOOKBACK_MINUTES * 60_000,
  ).toISOString();
  const recentQrDeliveryFrom = new Date(
    now.getTime() - Math.max(CUSTOM_OFFER_LOOKBACK_MINUTES, getComboOfferDelayMinutes() + CUSTOM_OFFER_SEND_GRACE_MINUTES) * 60_000,
  ).toISOString();
  const [
    { data: eventWindowTickets, error: eventWindowError },
    { data: recentPurchaseTickets, error: recentPurchaseError },
    { data: recentQrDeliveryTickets, error: recentQrDeliveryError },
  ] = await Promise.all([
    supabase
    .from("tickets")
    .select("id, customer_id, recipient_phone, participant_delivery_status, buyer_qr_delivered_at, participant_delivered_at, issued_at, customers(whatsapp_phone), orders!inner(id, created_at, status, official_table_map_reservations(place_code, status)), event_sessions!inner(id, event_id, starts_at, timezone, status, events!inner(id, title, status))")
    .eq("status", "issued")
    .eq("orders.status", "paid")
    .in("event_sessions.status", getPublicVisibleSessionStatuses("offer"))
    .in("event_sessions.events.status", PUBLIC_VISIBLE_EVENT_STATUSES)
    .gte("event_sessions.starts_at", eventWindowFrom)
    .lte("event_sessions.starts_at", eventWindowTo)
    .order("issued_at", { ascending: true })
    .limit(limit)
      .returns<ComboOfferCandidateTicketRow[]>(),
    supabase
      .from("tickets")
      .select("id, customer_id, recipient_phone, participant_delivery_status, buyer_qr_delivered_at, participant_delivered_at, issued_at, customers(whatsapp_phone), orders!inner(id, created_at, status, official_table_map_reservations(place_code, status)), event_sessions!inner(id, event_id, starts_at, timezone, status, events!inner(id, title, status))")
      .eq("status", "issued")
      .eq("orders.status", "paid")
      .gte("issued_at", recentPurchaseFrom)
      .in("event_sessions.status", getPublicVisibleSessionStatuses("offer"))
      .in("event_sessions.events.status", PUBLIC_VISIBLE_EVENT_STATUSES)
      .gte("event_sessions.starts_at", eventWindowFrom)
      .order("issued_at", { ascending: true })
      .limit(limit)
      .returns<ComboOfferCandidateTicketRow[]>(),
    supabase
      .from("tickets")
      .select("id, customer_id, recipient_phone, participant_delivery_status, buyer_qr_delivered_at, participant_delivered_at, issued_at, customers(whatsapp_phone), orders!inner(id, created_at, status, official_table_map_reservations(place_code, status)), event_sessions!inner(id, event_id, starts_at, timezone, status, events!inner(id, title, status))")
      .eq("status", "issued")
      .eq("orders.status", "paid")
      .or(`buyer_qr_delivered_at.gte.${recentQrDeliveryFrom},participant_delivered_at.gte.${recentQrDeliveryFrom}`)
      .in("event_sessions.status", getPublicVisibleSessionStatuses("offer"))
      .in("event_sessions.events.status", PUBLIC_VISIBLE_EVENT_STATUSES)
      .gte("event_sessions.starts_at", eventWindowFrom)
      .order("issued_at", { ascending: true })
      .limit(limit)
      .returns<ComboOfferCandidateTicketRow[]>(),
  ]);

  const error = eventWindowError ?? recentPurchaseError ?? recentQrDeliveryError;
  if (error) throw error;

  const tickets = uniqueComboOfferCandidateTicketsByOrder(
    mergeComboOfferCandidateTickets(
      eventWindowTickets,
      recentPurchaseTickets,
      recentQrDeliveryTickets,
    ),
  );
  let sentCount = 0;
  let failedCount = 0;
  let skippedCount = 0;

  for (const ticket of tickets) {
    const session = firstJoin(ticket.event_sessions);
    const order = firstJoin(ticket.orders);
    const event = session?.events;
    const recipient = comboOfferRecipientFromTicket(ticket);
    const phone = ticket.offer_phone ?? recipient?.phone ?? null;
    const recipientType = ticket.offer_source ?? recipient?.recipientType ?? "buyer";
    const qrDeliveredAt = getComboOfferRecipientQrDeliveredAt(ticket, recipientType);
    let offerCustomerId = ticket.offer_customer_id ?? ticket.customer_id;

    if (
      !session ||
      !order ||
      !event ||
      !phone ||
      !isPublicEventVisible({
        startsAt: session.starts_at,
        timezone: session.timezone,
        sessionStatus: session.status,
        eventStatus: event.status,
        purpose: "offer",
        now,
      })
    ) {
      skippedCount += 1;
      continue;
    }

    if (!qrDeliveredAt) {
      skippedCount += 1;
      continue;
    }

    if (recipientType === "participant") {
      const customerResult = await upsertCustomerFromWhatsApp({ phone });
      if (!customerResult.ok) {
        failedCount += 1;
        logWarn("Skipped participant combo offer without customer identity", {
          ticketId: ticket.id,
          code: customerResult.error.code,
        });
        continue;
      }
      offerCustomerId = customerResult.customer.id;
    }

    const eventLock = await acquireComboOfferEventLock({
      customerId: offerCustomerId,
      eventId: session.event_id,
    });

    if (!eventLock.acquired) {
      skippedCount += 1;
      continue;
    }

    try {
    const purchaseNumber = await getPaidTicketPurchaseNumberForEvent({
      customerId: ticket.customer_id,
      eventId: session.event_id,
      currentOrderId: order.id,
      currentOrderCreatedAt: order.created_at,
    });

    const offers = await listActiveComboOffersForEventSession(
      session.event_id,
      session.starts_at,
    );

    if (!offers.length) {
      skippedCount += 1;
      continue;
    }

    const offer = offers.find(
      (offer) => getComboOfferPriorityForEvent(offer, session.event_id) === purchaseNumber,
    );

      if (!offer) {
        skippedCount += 1;
        continue;
      }

      if (
        offer.send_timing_type !== "custom" &&
        !hasComboOfferQrDelayElapsed({ qrDeliveredAt, now })
      ) {
        skippedCount += 1;
        continue;
      }

      const dedupeKey = buildComboOfferDedupeKey({
        customerId: offerCustomerId,
        eventId: session.event_id,
        offerId: offer.id,
      });
      const recipientDedupeKey = buildComboOfferRecipientDedupeKey({
        phone,
        eventId: session.event_id,
        offerId: offer.id,
        sourceTicketId: ticket.id,
        recipientType,
      });
      const currentSentKeys = await loadSentComboOfferKeys([offerCustomerId], [phone]);
      if (
        currentSentKeys.recipientKeys.has(recipientDedupeKey) ||
        (recipientType === "buyer" && currentSentKeys.legacyKeys.has(dedupeKey))
      ) {
        skippedCount += 1;
        continue;
      }

      const shouldSendOnSchedule = shouldSendComboOfferNow(
        offer,
        session.starts_at,
        now,
        qrDeliveredAt,
      );
      const shouldSendAsRecovery =
        !shouldSendOnSchedule &&
        shouldRecoverMissedComboOffer(offer, session.starts_at, now, qrDeliveredAt);
      if (!shouldSendOnSchedule && !shouldSendAsRecovery) {
        skippedCount += 1;
        continue;
      }

      const checkout = await createComboOrderForCheckout({
        offerId: offer.id,
        customerId: offerCustomerId,
        eventId: session.event_id,
        sessionId: session.id,
        sourceOrderId: order.id,
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
        customerId: offerCustomerId,
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
        eventStartsAt: session.starts_at,
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
        customerId: offerCustomerId,
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
            offer_priority: getComboOfferPriorityForEvent(offer, session.event_id),
            event_purchase_number: purchaseNumber,
            combo_order_id: checkout.orderId,
            event_id: session.event_id,
            session_id: session.id,
            customer_id: offerCustomerId,
            recipient_phone: phone,
            recipient_type: recipientType,
            offer_recipient_source: recipientType,
            combo_offer_qr_delivered_at: qrDeliveredAt,
            combo_offer_delay_minutes:
              offer.send_timing_type === "custom"
                ? offer.send_offset_minutes
                : getComboOfferDelayMinutes(),
            combo_offer_delivery_mode: shouldSendAsRecovery ? "recovery" : "scheduled",
            combo_offer_recovered: shouldSendAsRecovery,
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
      } else {
        failedCount += 1;
      }
    } finally {
      await releaseComboOfferEventLock({
        customerId: offerCustomerId,
        eventId: session.event_id,
        lockToken: eventLock.lockToken,
      });
    }
  }

  return {
    comboOfferSentCount: sentCount,
    comboOfferFailedCount: failedCount,
    comboOfferSkippedCount: skippedCount,
  };
}

export { decimalAmountToCents };
