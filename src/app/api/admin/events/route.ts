import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
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
  orders: MaybeArray<{ status: string; created_at: string }>;
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
  let activeEventsQuery = supabase
    .from("events")
    .select("id")
    .eq("status", "published");

  if (!input.canSeeAll) {
    scopedEventsQuery = scopedEventsQuery.eq("created_by_admin_user_id", input.ownerAdminUserId);
    activeEventsQuery = activeEventsQuery.eq("created_by_admin_user_id", input.ownerAdminUserId);
  }

  const [{ data: scopedEvents, error: scopedEventsError }, { data: activeEvents, error: activeEventsError }] = await Promise.all([
    scopedEventsQuery,
    activeEventsQuery,
  ]);
  if (scopedEventsError) throw scopedEventsError;
  if (activeEventsError) throw activeEventsError;

  const scopedEventIds = (scopedEvents ?? []).map((event) => event.id);
  const activeEventIds = (activeEvents ?? []).map((event) => event.id);
  if (!scopedEventIds.length) {
    const empty = createSummary();
    return {
      today: serializePeriod(todayKey, empty, "Hoje"),
      fridayWindow: serializePeriod(fridayWindow.startKey, empty, fridayWindow.label),
      daily: [],
      weekly: [],
      monthly: [],
    };
  }

  const ticketsQuery = supabase
    .from("tickets")
    .select(
      "id, status, issued_at, used_at, event_sessions!inner(event_id), reservation_items(ticket_type, price_cents, fee_cents), orders!inner(status, created_at)",
    )
    .eq("orders.status", "paid")
    .in("event_sessions.event_id", scopedEventIds);
  const typedTicketsQuery = ticketsQuery.returns<GeneralTicketRow[]>();

  const seatsQuery = activeEventIds.length
    ? supabase
        .from("session_seats")
        .select("id, event_sessions!inner(event_id)", { count: "exact", head: true })
        .in("event_sessions.event_id", activeEventIds)
    : Promise.resolve({ data: null, error: null, count: 0 });

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

  const [ticketsResult, seatsResult, combosResult, redemptionsResult, validationsResult] = await Promise.all([
    fetchAllRows(typedTicketsQuery),
    seatsQuery,
    fetchAllRows(typedCombosQuery),
    fetchAllRows(typedRedemptionsQuery),
    fetchAllRows<{ created_at?: string }>(validationsQuery),
  ]);

  if (seatsResult.error) throw seatsResult.error;

  const capacity = seatsResult.count ?? 0;
  const today = createSummary(capacity);
  const friday = createSummary(capacity);
  const daily = new Map<string, GeneralSummary>();
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

  for (const ticket of ticketsResult) {
    if (ticket.status === "cancelled") continue;
    const item = first(ticket.reservation_items);
    const order = first(ticket.orders);
    const amount = safeCents(item?.price_cents) + safeCents(item?.fee_cents);
    const saleDayKey = getDayKey(order?.created_at ?? ticket.issued_at);

    if (item?.ticket_type === "free" || amount === 0) {
      applyToPeriods(saleDayKey, (summary) => {
        summary.courtesyTickets += 1;
      });
      continue;
    }

    applyToPeriods(saleDayKey, (summary) => {
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
  };
}

export async function GET(request: Request) {
  const auth = await requireAdminEventEditorSession();

  if (!auth.ok) {
    return NextResponse.json({ ok: false, message: "Não autorizado." }, { status: 401 });
  }

  const url = new URL(request.url);
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

    return NextResponse.json({
      ok: true,
      events: result.events,
      dashboard,
    });
  } catch (error) {
    console.error("[admin-events] failed to build general dashboard", error);
    return NextResponse.json({
      ok: true,
      events: result.events,
      dashboard: null,
    });
  }
}
