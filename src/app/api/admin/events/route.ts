import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import {
  getAdminContactActivity,
  type AdminContactRange,
} from "@/lib/tickets/services/adminContactAnalytics";
import { requireAdminEventEditorSession } from "@/lib/tickets/services/adminWebAuth";
import { listAdminEvents } from "@/lib/tickets/services/adminEvents";

const SAO_PAULO_TIME_ZONE = "America/Sao_Paulo";

type MaybeArray<T> = T | T[] | null | undefined;

type GeneralTicketRow = {
  id: string;
  status: string;
  issued_at: string;
  used_at: string | null;
  event_sessions: MaybeArray<{ event_id: string }>;
  reservation_items: MaybeArray<{ ticket_type: string; price_cents: number; fee_cents: number }>;
  orders: MaybeArray<{
    status: string;
    created_at: string;
    payments: MaybeArray<{ status: string; paid_at: string | null }>;
  }>;
};

type GeneralComboOrderRow = {
  id: string;
  event_id: string;
  status: string;
  quantity: number;
  total_amount_cents: number;
  paid_at: string | null;
  created_at: string;
};

type GeneralComboRedemptionRow = {
  id: string;
  event_id: string;
  status: string;
  quantity: number;
  used_at: string | null;
};

type AdminComboOfferRow = {
  id: string;
  name: string;
  description: string;
  image_url: string | null;
  price_cents: number;
  display_priority?: number | null;
  status: string;
  send_timing_type: string;
  send_offset_minutes: number | null;
  send_time_of_day: string | null;
  created_at: string;
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

type GeneralSeatRow = {
  session_id: string;
  section_id: string;
  seats: MaybeArray<{ status: string }>;
  event_sessions: MaybeArray<{
    starts_at: string;
    status: string;
    events: MaybeArray<{ status: string }>;
    venues: MaybeArray<{ status: string }>;
  }>;
  venue_sections: MaybeArray<{
    status: string;
    venues: MaybeArray<{ status: string }>;
  }>;
};

type GeneralPriceRow = {
  session_id: string;
  section_id: string;
  sales_start_at: string | null;
  sales_end_at: string | null;
  event_sessions: MaybeArray<{
    starts_at: string;
    status: string;
    events: MaybeArray<{ status: string }>;
    venues: MaybeArray<{ status: string }>;
  }>;
  venue_sections: MaybeArray<{
    status: string;
    venues: MaybeArray<{ status: string }>;
  }>;
};

type GeneralSummary = {
  ticketsSold: number;
  capacity: number;
  ticketRevenueCents: number;
  comboRevenueCents: number;
  totalRevenueCents: number;
  comboItemsSold: number;
  comboUsed: number;
  comboOrdersPending: number;
  checkins: number;
  courtesyTickets: number;
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

function createSummary(capacity = 0): GeneralSummary {
  return {
    ticketsSold: 0,
    capacity,
    ticketRevenueCents: 0,
    comboRevenueCents: 0,
    totalRevenueCents: 0,
    comboItemsSold: 0,
    comboUsed: 0,
    comboOrdersPending: 0,
    checkins: 0,
    courtesyTickets: 0,
  };
}

function getDayKey(value: string | Date) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: SAO_PAULO_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date(value));
  const year = parts.find((part) => part.type === "year")?.value ?? "0000";
  const month = parts.find((part) => part.type === "month")?.value ?? "00";
  const day = parts.find((part) => part.type === "day")?.value ?? "00";

  return `${year}-${month}-${day}`;
}

function getSaoPauloHour(value: string | Date) {
  const hour = new Intl.DateTimeFormat("en-US", {
    timeZone: SAO_PAULO_TIME_ZONE,
    hour: "2-digit",
    hourCycle: "h23",
  }).format(new Date(value));

  return Number(hour) || 0;
}

function getDayLabel(key: string) {
  const [year, month, day] = key.split("-");
  return year && month && day ? `${day}/${month}` : key;
}

function dateFromDayKey(key: string) {
  const [year, month, day] = key.split("-").map(Number);
  return new Date(Date.UTC(year || 1970, (month || 1) - 1, day || 1, 12));
}

function addDays(date: Date, days: number) {
  const next = new Date(date);
  next.setUTCDate(next.getUTCDate() + days);
  return next;
}

function dayKeyFromDate(date: Date) {
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}-${String(date.getUTCDate()).padStart(2, "0")}`;
}

function getFridayWindow(now = new Date()) {
  const today = dateFromDayKey(getDayKey(now));
  const daysSinceFriday = (today.getUTCDay() - 5 + 7) % 7;
  const start = addDays(today, -daysSinceFriday);
  const end = addDays(start, 7);
  return {
    startKey: dayKeyFromDate(start),
    endKey: dayKeyFromDate(end),
    label: `${getDayLabel(dayKeyFromDate(start))} a ${getDayLabel(dayKeyFromDate(addDays(end, -1)))}`,
  };
}

function getFridayWeekKey(dayKey: string) {
  const date = dateFromDayKey(dayKey);
  const daysSinceFriday = (date.getUTCDay() - 5 + 7) % 7;
  return dayKeyFromDate(addDays(date, -daysSinceFriday));
}

function addRevenue(summary: GeneralSummary, ticketRevenueCents: number, comboRevenueCents: number) {
  summary.ticketRevenueCents += ticketRevenueCents;
  summary.comboRevenueCents += comboRevenueCents;
  summary.totalRevenueCents += ticketRevenueCents + comboRevenueCents;
}

function serializePeriod(key: string, summary: GeneralSummary, label = key) {
  return {
    key,
    label,
    ...summary,
    repasseCents: Math.round(summary.totalRevenueCents * 0.05),
  };
}

async function fetchAllRows<T>(query: { range: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: unknown }> }) {
  const rows: T[] = [];
  const pageSize = 1000;

  for (let from = 0; ; from += pageSize) {
    const { data, error } = await query.range(from, from + pageSize - 1);
    if (error) throw error;
    const page = data ?? [];
    rows.push(...page);
    if (page.length < pageSize) break;
  }

  return rows;
}

async function buildGeneralDashboard(input: { ownerAdminUserId: string; canSeeAll: boolean }) {
  const supabase = getSupabaseAdmin();
  const now = new Date();
  const todayKey = getDayKey(now);
  const fridayWindow = getFridayWindow(now);
  let scopedEventsQuery = supabase
    .from("events")
    .select("id");
  if (!input.canSeeAll) {
    scopedEventsQuery = scopedEventsQuery.eq("created_by_admin_user_id", input.ownerAdminUserId);
  }

  const { data: scopedEvents, error: scopedEventsError } = await scopedEventsQuery;
  if (scopedEventsError) throw scopedEventsError;

  const scopedEventIds = (scopedEvents ?? []).map((event) => event.id);
  if (!scopedEventIds.length) {
    const empty = createSummary();
    const contactActivity = await getAdminContactActivity({ eventIds: [], includeAllContacts: input.canSeeAll });
    return {
      today: serializePeriod(todayKey, empty, "Hoje"),
      fridayWindow: serializePeriod(fridayWindow.startKey, empty, fridayWindow.label),
      sixHour: [],
      daily: [],
      weekly: [],
      monthly: [],
      contactActivity,
    };
  }

  const ticketsQuery = supabase
    .from("tickets")
    .select(
      "id, status, issued_at, used_at, event_sessions!inner(event_id), reservation_items(ticket_type, price_cents, fee_cents), orders!inner(status, created_at, payments(status, paid_at))",
    )
    .eq("orders.status", "paid")
    .in("event_sessions.event_id", scopedEventIds);
  const typedTicketsQuery = ticketsQuery.returns<GeneralTicketRow[]>();

  const seatsQuery = supabase
    .from("session_seats")
    .select("session_id, section_id, seats(status), event_sessions!inner(event_id, starts_at, status, events(status), venues(status)), venue_sections(status, venues(status))")
    .in("event_sessions.event_id", scopedEventIds)
    .returns<GeneralSeatRow[]>();

  const pricesQuery = supabase
    .from("ticket_prices")
    .select("session_id, section_id, sales_start_at, sales_end_at, event_sessions!inner(event_id, starts_at, status, events(status), venues(status)), venue_sections(status, venues(status))")
    .in("event_sessions.event_id", scopedEventIds)
    .eq("status", "active")
    .neq("ticket_type", "free")
    .returns<GeneralPriceRow[]>();

  const combosQuery = supabase
    .from("combo_orders")
    .select("id, event_id, status, quantity, total_amount_cents, paid_at, created_at")
    .in("event_id", scopedEventIds);
  const typedCombosQuery = combosQuery.returns<GeneralComboOrderRow[]>();

  const redemptionsQuery = supabase
    .from("combo_redemptions")
    .select("id, event_id, status, quantity, used_at")
    .in("event_id", scopedEventIds);
  const typedRedemptionsQuery = redemptionsQuery.returns<GeneralComboRedemptionRow[]>();

  const validationsQuery = supabase
    .from("ticket_validation_events")
    .select("id, created_at, tickets!inner(event_sessions!inner(event_id))")
    .eq("result", "allowed")
    .in("tickets.event_sessions.event_id", scopedEventIds);

  const [ticketsResult, seatsResult, pricesResult, combosResult, redemptionsResult, validationsResult, contactActivity] = await Promise.all([
    fetchAllRows(typedTicketsQuery),
    fetchAllRows(seatsQuery),
    fetchAllRows(pricesQuery),
    fetchAllRows(typedCombosQuery),
    fetchAllRows(typedRedemptionsQuery),
    fetchAllRows<{ created_at?: string }>(validationsQuery),
    getAdminContactActivity({ eventIds: scopedEventIds, includeAllContacts: input.canSeeAll }),
  ]);

  const nowIso = now.toISOString();
  const isOperationallyActive = (status: string | null | undefined) => !status || status === "active";
  const isActiveSalesContext = (
    session: GeneralPriceRow["event_sessions"] extends MaybeArray<infer T> ? T | null : never,
    section: GeneralPriceRow["venue_sections"] extends MaybeArray<infer T> ? T | null : never,
  ) => {
    if (!session || !section) return false;
    const sessionDayKey = getDayKey(session.starts_at);
    const isEventDay = sessionDayKey === todayKey;
    const isFutureDay = sessionDayKey > todayKey;
    const eventStatus = first(session.events)?.status;
    const eventIsEligible = eventStatus === "published" || (isEventDay && eventStatus === "finished");
    const sessionIsEligible = isEventDay
      ? session.status !== "cancelled"
      : session.status === "scheduled" || session.status === "sales_open";

    return Boolean(
      (isEventDay || isFutureDay) &&
      eventIsEligible &&
      sessionIsEligible &&
      isOperationallyActive(first(session.venues)?.status) &&
      section.status === "active" &&
      isOperationallyActive(first(section.venues)?.status)
    );
  };
  const activeSessionSections = new Set(
    pricesResult
      .filter((price) => {
        const session = first(price.event_sessions);
        const section = first(price.venue_sections);
        const isEventDay = Boolean(session && getDayKey(session.starts_at) === todayKey);
        return isActiveSalesContext(session, section) && (isEventDay || (
          (!price.sales_start_at || price.sales_start_at <= nowIso) &&
          (!price.sales_end_at || price.sales_end_at >= nowIso)
        ));
      })
      .map((price) => `${price.session_id}:${price.section_id}`),
  );
  const capacity = seatsResult.filter((seat) => {
    const session = first(seat.event_sessions);
    const section = first(seat.venue_sections);
    return first(seat.seats)?.status !== "inactive" &&
      activeSessionSections.has(`${seat.session_id}:${seat.section_id}`) &&
      isActiveSalesContext(session, section);
  }).length;
  const today = createSummary(capacity);
  const friday = createSummary(capacity);
  const daily = new Map<string, GeneralSummary>();
  const sixHour = new Map<number, GeneralSummary>();
  const weekly = new Map<string, GeneralSummary>();
  const monthly = new Map<string, GeneralSummary>();
  const ensure = (map: Map<string, GeneralSummary>, key: string) => {
    const existing = map.get(key);
    if (existing) return existing;
    const created = createSummary(capacity);
    map.set(key, created);
    return created;
  };
  const applyToPeriods = (dayKey: string, apply: (summary: GeneralSummary) => void) => {
    apply(ensure(daily, dayKey));
    apply(ensure(weekly, getFridayWeekKey(dayKey)));
    apply(ensure(monthly, dayKey.slice(0, 7)));
    if (dayKey === todayKey) apply(today);
    if (dayKey >= fridayWindow.startKey && dayKey < fridayWindow.endKey) apply(friday);
  };
  const applyToSixHour = (timestamp: string, apply: (summary: GeneralSummary) => void) => {
    if (getDayKey(timestamp) !== todayKey) return;
    const endHour = Math.min(24, Math.floor(getSaoPauloHour(timestamp) / 6) * 6 + 6);
    const summary = sixHour.get(endHour) ?? createSummary(capacity);
    apply(summary);
    sixHour.set(endHour, summary);
  };

  for (const ticket of ticketsResult) {
    if (ticket.status === "cancelled") continue;
    const item = first(ticket.reservation_items);
    const order = first(ticket.orders);
    const amount = safeCents(item?.price_cents) + safeCents(item?.fee_cents);
    const approvedAt = (Array.isArray(order?.payments) ? order.payments : order?.payments ? [order.payments] : [])
      .filter((payment) => payment.status === "approved" && payment.paid_at)
      .map((payment) => payment.paid_at as string)
      .sort((left, right) => right.localeCompare(left))[0];
    const saleTimestamp = approvedAt ?? order?.created_at ?? ticket.issued_at;
    const saleDayKey = getDayKey(saleTimestamp);

    if (item?.ticket_type === "free" || amount === 0) {
      const courtesyTimestamp = ticket.issued_at;
      applyToPeriods(getDayKey(courtesyTimestamp), (summary) => {
        summary.courtesyTickets += 1;
      });
      applyToSixHour(courtesyTimestamp, (summary) => {
        summary.courtesyTickets += 1;
      });
      continue;
    }

    applyToPeriods(saleDayKey, (summary) => {
      summary.ticketsSold += 1;
      addRevenue(summary, amount, 0);
    });
    applyToSixHour(saleTimestamp, (summary) => {
      summary.ticketsSold += 1;
      addRevenue(summary, amount, 0);
    });
  }

  for (const combo of combosResult) {
    const dayKey = getDayKey(combo.paid_at ?? combo.created_at);

    if (combo.status === "pending_payment") {
      applyToPeriods(getDayKey(combo.created_at), (summary) => {
        summary.comboOrdersPending += 1;
      });
      continue;
    }

    if (combo.status !== "paid") continue;

    applyToPeriods(dayKey, (summary) => {
      summary.comboItemsSold += Number(combo.quantity) || 0;
      addRevenue(summary, 0, safeCents(combo.total_amount_cents));
    });
  }

  for (const redemption of redemptionsResult) {
    if (redemption.status !== "used" || !redemption.used_at) continue;
    applyToPeriods(getDayKey(redemption.used_at), (summary) => {
      summary.comboUsed += Number(redemption.quantity) || 0;
    });
  }

  for (const validation of validationsResult) {
    const createdAt = typeof validation.created_at === "string" ? validation.created_at : null;
    if (!createdAt) continue;
    applyToPeriods(getDayKey(createdAt), (summary) => {
      summary.checkins += 1;
    });
  }

  return {
    today: serializePeriod(todayKey, today, "Hoje"),
    fridayWindow: serializePeriod(fridayWindow.startKey, friday, fridayWindow.label),
    sixHour: [...sixHour.entries()]
      .sort((left, right) => left[0] - right[0])
      .map(([endHour, summary]) => {
        const startHour = endHour - 6;
        return serializePeriod(
          `${todayKey}-${startHour}`,
          summary,
          `${String(startHour).padStart(2, "0")}h`,
        );
      }),
    daily: [...daily.entries()]
      .sort((left, right) => right[0].localeCompare(left[0]))
      .map(([key, summary]) => serializePeriod(key, summary, getDayLabel(key))),
    weekly: [...weekly.entries()]
      .sort((left, right) => right[0].localeCompare(left[0]))
      .slice(0, 12)
      .map(([key, summary]) => {
        const end = dayKeyFromDate(addDays(dateFromDayKey(key), 6));
        return serializePeriod(key, summary, `${getDayLabel(key)} a ${getDayLabel(end)}`);
      }),
    monthly: [...monthly.entries()]
      .sort((left, right) => right[0].localeCompare(left[0]))
      .slice(0, 12)
      .map(([key, summary]) => serializePeriod(key, summary, key.split("-").reverse().join("/"))),
    contactActivity,
  };
}

function formatComboOfferTiming(offer: AdminComboOfferRow) {
  if (offer.send_timing_type === "custom") {
    return offer.send_offset_minutes
      ? `${offer.send_offset_minutes} min após compra`
      : "Após compra";
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

async function listAdminComboOffers(input: { ownerAdminUserId: string; canSeeAll: boolean; includeMetrics?: boolean }) {
  const supabase = getSupabaseAdmin();
  let offersQuery = supabase
    .from("combo_offers")
    .select("id, name, description, image_url, price_cents, display_priority, status, send_timing_type, send_offset_minutes, send_time_of_day, created_at, created_by_admin_user_id, combo_offer_scopes(scope_type, event_id, weekday, display_priority, events(title))")
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
  const includeMetrics = input.includeMetrics !== false;
  const { data: orders, error: ordersError } = offerIds.length && includeMetrics
    ? await supabase
        .from("combo_orders")
        .select("offer_id, status, quantity, total_amount_cents, raw_metadata")
        .in("offer_id", offerIds)
        .returns<AdminComboOfferOrderRow[]>()
    : { data: [], error: null };
  if (ordersError) throw ordersError;
  const { data: messages, error: messagesError } = offerIds.length && includeMetrics
    ? await supabase
        .from("whatsapp_messages")
        .select("raw_metadata")
        .contains("raw_metadata", { reason: "combo_offer" })
        .in("raw_metadata->>offer_id", offerIds)
        .returns<AdminComboOfferMessageRow[]>()
    : { data: [], error: null };
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

export async function GET(request: Request) {
  const auth = await requireAdminEventEditorSession();

  if (!auth.ok) {
    return NextResponse.json(
      { ok: false, message: "Sessão expirada. Abra um novo link pelo WhatsApp." },
      { status: auth.reason === "forbidden" ? 403 : 401 },
    );
  }

  const url = new URL(request.url);
  if (url.searchParams.get("contacts") === "1") {
    const requestedRange = url.searchParams.get("range");
    const range: AdminContactRange =
      requestedRange === "week" ||
      requestedRange === "30" ||
      requestedRange === "60" ||
      requestedRange === "total"
        ? requestedRange
        : "day";

    try {
      const supabase = getSupabaseAdmin();
      let scopedEventsQuery = supabase.from("events").select("id");
      if (auth.session.adminUser.role !== "root") {
        scopedEventsQuery = scopedEventsQuery.eq(
          "created_by_admin_user_id",
          auth.session.adminUser.id,
        );
      }

      const { data: scopedEvents, error: scopedEventsError } = await scopedEventsQuery;
      if (scopedEventsError) throw scopedEventsError;

      const contactActivity = await getAdminContactActivity({
        eventIds: (scopedEvents ?? []).map((event) => event.id),
        includeAllContacts: auth.session.adminUser.role === "root",
        range,
      });

      return NextResponse.json({ ok: true, contactActivity });
    } catch (error) {
      console.error("[admin-events] failed to load contact activity", error);
      return NextResponse.json(
        { ok: false, message: "Não foi possível carregar os contatos." },
        { status: 500 },
      );
    }
  }

  const search = url.searchParams.get("search");
  const status = url.searchParams.get("status");
  const normalizedStatus = status === "paused" ? "draft" : status;
  const safeStatus =
    normalizedStatus === "draft" ||
    normalizedStatus === "published" ||
    normalizedStatus === "cancelled" ||
    normalizedStatus === "finished" ||
    normalizedStatus === "all"
      ? normalizedStatus
      : "all";

  const result = await listAdminEvents({
    search,
    status: safeStatus,
    ownerAdminUserId: auth.session.adminUser.id,
    canSeeAll: auth.session.adminUser.role === "root",
  });

  if (!result.ok) {
    return NextResponse.json(
      { ok: false, message: "Não foi possível listar os eventos." },
      { status: 500 },
    );
  }

  try {
    const dashboard = await buildGeneralDashboard({
      ownerAdminUserId: auth.session.adminUser.id,
      canSeeAll: auth.session.adminUser.role === "root",
    });
  }

  try {
    const [dashboard, comboOffers] = await Promise.all([
      buildGeneralDashboard({
        ownerAdminUserId: auth.session.adminUser.id,
        canSeeAll: auth.session.adminUser.role === "root",
      }),
      listAdminComboOffers({
        ownerAdminUserId: auth.session.adminUser.id,
        canSeeAll: auth.session.adminUser.role === "root",
      }),
    ]);

    return NextResponse.json({
      ok: true,
      events: result.events,
      dashboard,
      comboOffers,
    });
  } catch (error) {
    console.error("[admin-events] failed to build general dashboard", error);
    let comboOffers: Awaited<ReturnType<typeof listAdminComboOffers>> = [];

    try {
      comboOffers = await listAdminComboOffers({
      ownerAdminUserId: auth.session.adminUser.id,
      canSeeAll: auth.session.adminUser.role === "root",
    });
    } catch (comboError) {
      console.error("[admin-events] failed to list combo offers", comboError);
    }

    return NextResponse.json({
      ok: true,
      events: result.events,
      dashboard: null,
      comboOffers,
    });
  }
}
