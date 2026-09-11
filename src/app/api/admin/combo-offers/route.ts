import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { formatComboOfferAfterPurchaseTiming } from "@/lib/tickets/comboOfferCron";
import { requireAdminEventEditorSession } from "@/lib/tickets/services/adminWebAuth";

type MaybeArray<T> = T | T[] | null | undefined;

type AdminComboOfferRow = {
  id: string;
  name: string;
  description: string;
  image_url: string | null;
  original_price_cents: number | null;
  price_cents: number;
  display_priority?: number | null;
  status: string;
  send_timing_type: string;
  send_offset_minutes: number | null;
  send_time_of_day: string | null;
  created_at: string;
  created_by_admin_user_id?: string | null;
  combo_offer_scopes: MaybeArray<{
    scope_type: string;
    event_id: string | null;
    weekday: number | null;
    display_priority?: number | null;
    events: MaybeArray<{ title: string }>;
  }>;
};

type AdminComboOfferOrderRow = {
  offer_id: string;
  status: string;
  quantity: number;
  total_amount_cents: number;
  raw_metadata: Record<string, unknown> | null;
};

type AdminComboOfferMessageRow = {
  raw_metadata: Record<string, unknown> | null;
};

function first<T>(value: MaybeArray<T>): T | null {
  if (Array.isArray(value)) return value[0] ?? null;
  return value ?? null;
}

function safeCents(value: number | null | undefined) {
  return Number.isFinite(value) ? Number(value) : 0;
}

function safeDisplayPriority(value: number | null | undefined) {
  return Number.isInteger(value) && Number(value) > 0 ? Number(value) : 1;
}

function formatComboOfferTiming(offer: AdminComboOfferRow) {
  if (offer.send_timing_type === "custom") {
    return formatComboOfferAfterPurchaseTiming(Number(offer.send_offset_minutes ?? 0));
  }
  if (offer.send_timing_type === "event_day_noon") return "Meio-dia do evento";
  if (offer.send_timing_type === "one_hour_before") return "1h antes do evento";
  if (offer.send_timing_type === "three_hours_before") return "3h antes do evento";
  return offer.send_timing_type;
}

function formatComboOfferScope(scope: AdminComboOfferRow["combo_offer_scopes"]) {
  const scopes = Array.isArray(scope) ? scope : scope ? [scope] : [];
  if (!scopes.length) return "Sem escopo";
  if (scopes.some((item) => item.scope_type === "all_events")) return "Todos os eventos";

  const eventNames = scopes
    .filter((item) => item.scope_type === "event")
    .map((item) => first(item.events)?.title)
    .filter(Boolean);
  if (eventNames.length) return eventNames.slice(0, 2).join(", ") + (eventNames.length > 2 ? ` +${eventNames.length - 2}` : "");

  const weekdays = ["domingo", "segunda", "terça", "quarta", "quinta", "sexta", "sábado"];
  const weekdayNames = scopes
    .filter((item) => item.scope_type === "weekday")
    .map((item) => weekdays[item.weekday ?? -1])
    .filter(Boolean);

  return weekdayNames.length ? weekdayNames.join(", ") : "Escopo configurado";
}

async function listAdminComboOffers(input: { ownerAdminUserId: string; canSeeAll: boolean }) {
  const supabase = getSupabaseAdmin();
  let offersQuery = supabase
    .from("combo_offers")
    .select("id, name, description, image_url, original_price_cents, price_cents, display_priority, status, send_timing_type, send_offset_minutes, send_time_of_day, created_at, created_by_admin_user_id, combo_offer_scopes(scope_type, event_id, weekday, display_priority, events(title))")
    .neq("status", "deleted")
    .order("display_priority", { ascending: true })
    .order("created_at", { ascending: false })
    .limit(100);

  if (!input.canSeeAll) {
    offersQuery = offersQuery.eq("created_by_admin_user_id", input.ownerAdminUserId);
  }

  const { data: offers, error: offersError } = await offersQuery.returns<AdminComboOfferRow[]>();
  if (offersError) throw offersError;

  const offerIds = (offers ?? []).map((offer) => offer.id);
  const [{ data: orders, error: ordersError }, { data: messages, error: messagesError }] = offerIds.length
    ? await Promise.all([
        supabase
          .from("combo_orders")
          .select("offer_id, status, quantity, total_amount_cents, raw_metadata")
          .in("offer_id", offerIds)
          .returns<AdminComboOfferOrderRow[]>(),
        supabase
          .from("whatsapp_messages")
          .select("raw_metadata")
          .contains("raw_metadata", { reason: "combo_offer" })
          .in("raw_metadata->>offer_id", offerIds)
          .returns<AdminComboOfferMessageRow[]>(),
      ])
    : [
        { data: [] as AdminComboOfferOrderRow[], error: null },
        { data: [] as AdminComboOfferMessageRow[], error: null },
      ];
  if (ordersError) throw ordersError;
  if (messagesError) throw messagesError;

  const totals = new Map<string, {
    paidOrders: number;
    impressions: number;
    clicks: number;
    itemsSold: number;
    revenueCents: number;
  }>();

  for (const order of orders ?? []) {
    const current = totals.get(order.offer_id) ?? {
      paidOrders: 0,
      impressions: 0,
      clicks: 0,
      itemsSold: 0,
      revenueCents: 0,
    };

    if (order.status === "paid") {
      current.paidOrders += 1;
      current.itemsSold += Number(order.quantity) || 0;
      current.revenueCents += safeCents(order.total_amount_cents);
    }
    const clickCount = Number(order.raw_metadata?.checkout_click_count ?? 0);
    if (Number.isFinite(clickCount) && clickCount > 0) current.clicks += clickCount;

    totals.set(order.offer_id, current);
  }

  for (const message of messages ?? []) {
    const offerId = typeof message.raw_metadata?.offer_id === "string"
      ? message.raw_metadata.offer_id
      : null;
    if (!offerId) continue;
    const current = totals.get(offerId) ?? {
      paidOrders: 0,
      impressions: 0,
      clicks: 0,
      itemsSold: 0,
      revenueCents: 0,
    };
    current.impressions += 1;
    totals.set(offerId, current);
  }

  return (offers ?? []).map((offer) => {
    const scopes = Array.isArray(offer.combo_offer_scopes)
      ? offer.combo_offer_scopes
      : offer.combo_offer_scopes ? [offer.combo_offer_scopes] : [];
    const eventScopes = scopes.filter((scope) => scope.scope_type === "event" && scope.event_id);
    const weekdayScopes = scopes.filter((scope) => scope.scope_type === "weekday" && Number.isInteger(scope.weekday));
    const scopeType = eventScopes.length ? "event" : weekdayScopes.length ? "weekday" : "all_events";
    return {
      offerId: offer.id,
      name: offer.name,
      description: offer.description,
      imageUrl: offer.image_url,
      originalPriceCents: offer.original_price_cents === null ? null : safeCents(offer.original_price_cents),
      priceCents: safeCents(offer.price_cents),
      displayPriority: safeDisplayPriority(offer.display_priority),
      status: offer.status,
      sendTimingType: offer.send_timing_type,
      sendOffsetMinutes: offer.send_offset_minutes,
      timingLabel: formatComboOfferTiming(offer),
      scopeLabel: formatComboOfferScope(offer.combo_offer_scopes),
      scopeType,
      eventIds: eventScopes.map((scope) => scope.event_id).filter(Boolean),
      weekdays: weekdayScopes.map((scope) => Number(scope.weekday)).filter((day) => Number.isInteger(day)),
      createdAt: offer.created_at,
      ...(totals.get(offer.id) ?? {
        paidOrders: 0,
        impressions: 0,
        clicks: 0,
        itemsSold: 0,
        revenueCents: 0,
      }),
    };
  });
}

export async function GET() {
  const auth = await requireAdminEventEditorSession();

  if (!auth.ok) {
    return NextResponse.json(
      { ok: false, message: "Sessão expirada. Abra um novo link pelo WhatsApp." },
      { status: auth.reason === "forbidden" ? 403 : 401 },
    );
  }

  try {
    const comboOffers = await listAdminComboOffers({
      ownerAdminUserId: auth.session.adminUser.id,
      canSeeAll: auth.session.adminUser.role === "root",
    });

    return NextResponse.json({ ok: true, comboOffers });
  } catch (error) {
    console.error("[admin-combo-offers] failed to list combo offers", error);
    return NextResponse.json(
      { ok: false, message: "Não foi possível listar os combos." },
      { status: 500 },
    );
  }
}
