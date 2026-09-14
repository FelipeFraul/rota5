import { NextResponse } from "next/server";
import { z } from "zod";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import {
  assertAdminCsrf,
  requireAdminEventEditorSession,
} from "@/lib/tickets/services/adminWebAuth";
import {
  duplicateAdminEvent,
  getAdminEventDetails,
  getAdminSessionUsage,
  listAdminPrices,
  parseMoneyToCents,
  updateAdminEvent,
  updateAdminEventCatalog,
} from "@/lib/tickets/services/adminEvents";
import { isAdminEventLocationUnchanged } from "@/lib/tickets/adminEventLocation";
import {
  getAdminContactActivity,
  type AdminContactRange,
} from "@/lib/tickets/services/adminContactAnalytics";

type RouteContext = {
  params: Promise<{ eventId: string }>;
};

const eventStatuses = ["draft", "published", "cancelled", "finished"] as const;
const sessionStatuses = ["scheduled", "sales_open", "sales_closed", "cancelled", "finished"] as const;
const sectionStatuses = ["active", "inactive"] as const;
const priceStatuses = ["active", "inactive"] as const;
const SAO_PAULO_TIME_ZONE = "America/Sao_Paulo";

type MaybeArray<T> = T | T[] | null | undefined;

type DashboardTicketRow = {
  id: string;
  status: string;
  issued_at: string;
  used_at: string | null;
  venue_sections: MaybeArray<{ id: string; name: string }>;
  reservation_items: MaybeArray<{ ticket_type: string; price_cents: number; fee_cents: number }>;
  orders: MaybeArray<{
    status: string;
    created_at: string;
    payments: MaybeArray<{ status: string; paid_at: string | null }>;
  }>;
};

type DashboardSeatRow = {
  section_id: string;
  status: string;
  seats: MaybeArray<{ status: string }>;
  venue_sections: MaybeArray<{ name: string; status: string; venues?: MaybeArray<{ status: string }> }>;
};

type DashboardPriceRow = {
  section_id: string;
  status: string;
  sales_start_at: string | null;
  sales_end_at: string | null;
  venue_sections: MaybeArray<{ status: string; venues?: MaybeArray<{ status: string }> }>;
};

type DashboardComboOrderRow = {
  id: string;
  status: string;
  quantity: number;
  total_amount_cents: number;
  paid_at: string | null;
  created_at: string;
  combo_offers: MaybeArray<{ name: string }>;
};

type DashboardComboRedemptionRow = {
  id: string;
  status: string;
  quantity: number;
  used_at: string | null;
  created_at: string;
};

const patchSchema = z.object({
  event: z.object({
    title: z.string().trim().min(1).max(160),
    artistName: z.string().trim().max(160).nullable().optional(),
    artistIcon: z.string().trim().max(8).nullable().optional(),
    city: z.string().trim().min(1).max(90),
    state: z.string().trim().min(2).max(2),
    venueName: z.string().trim().min(1).max(160),
    description: z.string().trim().max(3000).nullable(),
    imageUrl: z.string().trim().url().max(1000).nullable().or(z.literal("")),
    status: z.enum(eventStatuses),
  }),
  sessions: z.array(z.object({
    sessionId: z.string().uuid(),
    startsAt: z.string().datetime({ offset: true }),
    status: z.enum(sessionStatuses),
  })).max(24),
  sections: z.array(z.object({
    sectionId: z.string().uuid(),
    name: z.string().trim().min(1).max(120),
    capacity: z.number().int().positive().max(100000).nullable(),
    status: z.enum(sectionStatuses),
  })).max(60),
  newSections: z.array(z.object({
    name: z.string().trim().min(1).max(120),
    capacity: z.number().int().positive().max(100000),
  })).max(30).optional().default([]),
  prices: z.array(z.object({
    priceId: z.string().uuid(),
    label: z.string().trim().min(1).max(120),
    price: z.string().trim().min(1).max(30),
    fee: z.string().trim().min(1).max(30),
    salesStartAt: z.string().datetime({ offset: true }).nullable(),
    salesEndAt: z.string().datetime({ offset: true }).nullable(),
    status: z.enum(priceStatuses),
  })).max(200),
  courtesy: z.object({
    sections: z.array(z.object({
      sectionId: z.string().uuid(),
      label: z.string().trim().min(1).max(120),
      limit: z.number().int().min(0).max(100000),
      status: z.enum(sectionStatuses),
    })).max(60),
  }),
});

function jsonForbidden(message = "Não autorizado.") {
  return NextResponse.json({ ok: false, message }, { status: 403 });
}

function first<T>(value: MaybeArray<T>): T | null {
  if (Array.isArray(value)) return value[0] ?? null;
  return value ?? null;
}

function safeCents(value: number | null | undefined) {
  return Number.isFinite(value) ? Number(value) : 0;
}

function getDayKey(value: string) {
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

function getSaoPauloHour(value: string) {
  const hour = new Intl.DateTimeFormat("en-US", {
    timeZone: SAO_PAULO_TIME_ZONE,
    hour: "2-digit",
    hourCycle: "h23",
  }).format(new Date(value));

  return Number(hour) || 0;
}

function getSaoPauloTodayStart(now = new Date()) {
  const [year, month, day] = getDayKey(now.toISOString()).split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day, 3));
}

function getDashboardRangeStart(range: AdminContactRange, now = new Date()) {
  if (range === "total") return null;
  const start = getSaoPauloTodayStart(now);
  const daysBack = range === "day" ? 0 : range === "week" ? 6 : range === "30" ? 29 : 59;
  start.setUTCDate(start.getUTCDate() - daysBack);
  return start;
}

function getDayLabel(key: string) {
  const [year, month, day] = key.split("-");
  return year && month && day ? `${day}/${month}` : key;
}

function ensureSection(
  sections: Map<string, {
    sectionId: string;
    name: string;
    capacity: number;
    available: number;
    sold: number;
    reserved: number;
    blocked: number;
    revenueCents: number;
  }>,
  sectionId: string,
  name: string,
) {
  const existing = sections.get(sectionId);
  if (existing) return existing;
  const created = {
    sectionId,
    name,
    capacity: 0,
    available: 0,
    sold: 0,
    reserved: 0,
    blocked: 0,
    revenueCents: 0,
  };
  sections.set(sectionId, created);
  return created;
}

function canEditEvent(
  role: string,
  adminUserId: string,
  event: { createdByAdminUserId: string | null },
) {
  return role === "root" || event.createdByAdminUserId === adminUserId;
}

async function loadEventForAdmin(eventId: string) {
  const auth = await requireAdminEventEditorSession();

  if (!auth.ok) {
    return { ok: false as const, response: NextResponse.json({ ok: false, message: "Não autorizado." }, { status: 401 }) };
  }

  const details = await getAdminEventDetails(eventId);

  if (!details.ok) {
    return { ok: false as const, response: NextResponse.json({ ok: false, message: "Evento não encontrado." }, { status: 404 }) };
  }

  if (!canEditEvent(auth.session.adminUser.role, auth.session.adminUser.id, details.event)) {
    return { ok: false as const, response: jsonForbidden() };
  }

  return { ok: true as const, auth: auth.session, event: details.event };
}

async function buildEventPayload(eventId: string) {
  const auth = await requireAdminEventEditorSession();

  if (!auth.ok) {
    return { ok: false as const, response: NextResponse.json({ ok: false, message: "Não autorizado." }, { status: 401 }) };
  }

  const { data, error } = await getSupabaseAdmin().rpc("get_admin_event_editor_payload", {
    p_event_id: eventId,
  });

  if (error) {
    console.error("[admin-event] optimized detail rpc failed", error);
    return {
      ok: false as const,
      response: NextResponse.json(
        { ok: false, message: "Não foi possível carregar o evento." },
        { status: 500 },
      ),
    };
  }

  const result = data as { ok?: boolean; reason?: string; event?: { createdByAdminUserId?: string | null } } | null;
  if (!result?.ok || !result.event) {
    return { ok: false as const, response: NextResponse.json({ ok: false, message: "Evento não encontrado." }, { status: 404 }) };
  }

  if (!canEditEvent(auth.session.adminUser.role, auth.session.adminUser.id, {
    createdByAdminUserId: result.event.createdByAdminUserId ?? null,
  })) {
    return { ok: false as const, response: jsonForbidden() };
  }

  return {
    ok: true as const,
    auth: auth.session,
    event: result.event,
  };
}

function slugifySection(value: string) {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase()
    .replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "entrada";
}

async function buildEventDashboard(eventId: string, range: AdminContactRange = "day") {
  const supabase = getSupabaseAdmin();
  const dashboardNow = new Date();
  const rangeStart = getDashboardRangeStart(range, dashboardNow);
  const isInRange = (value: string | null | undefined) => {
    if (!value) return false;
    const timestamp = new Date(value).getTime();
    return timestamp <= dashboardNow.getTime() && (!rangeStart || timestamp >= rangeStart.getTime());
  };
  const [ticketsResult, seatsResult, pricesResult, combosResult, redemptionsResult, validationsResult, contactActivity] = await Promise.all([
    supabase
      .from("tickets")
      .select(
        "id, status, issued_at, used_at, event_sessions!inner(event_id), venue_sections(id, name), reservation_items(ticket_type, price_cents, fee_cents), orders!inner(status, created_at, payments(status, paid_at))",
      )
      .eq("event_sessions.event_id", eventId)
      .eq("orders.status", "paid")
      .returns<DashboardTicketRow[]>(),
    supabase
      .from("session_seats")
      .select("section_id, status, seats!inner(status), venue_sections!inner(name, status, venues!inner(status)), event_sessions!inner(event_id)")
      .eq("event_sessions.event_id", eventId)
      .returns<DashboardSeatRow[]>(),
    supabase
      .from("ticket_prices")
      .select("section_id, status, sales_start_at, sales_end_at, venue_sections!inner(status, venues!inner(status)), event_sessions!inner(event_id)")
      .eq("event_sessions.event_id", eventId)
      .neq("ticket_type", "free")
      .returns<DashboardPriceRow[]>(),
    supabase
      .from("combo_orders")
      .select("id, status, quantity, total_amount_cents, paid_at, created_at, combo_offers(name)")
      .eq("event_id", eventId)
      .returns<DashboardComboOrderRow[]>(),
    supabase
      .from("combo_redemptions")
      .select("id, status, quantity, used_at, created_at")
      .eq("event_id", eventId)
      .returns<DashboardComboRedemptionRow[]>(),
    supabase
      .from("ticket_validation_events")
      .select("result, created_at, tickets!inner(id, event_sessions!inner(event_id))")
      .eq("tickets.event_sessions.event_id", eventId)
      .eq("result", "allowed"),
    getAdminContactActivity({ eventIds: [eventId], includeAllContacts: false, range }),
  ]);

  if (ticketsResult.error) throw ticketsResult.error;
  if (seatsResult.error) throw seatsResult.error;
  if (pricesResult.error) throw pricesResult.error;
  if (combosResult.error) throw combosResult.error;
  if (redemptionsResult.error) throw redemptionsResult.error;
  if (validationsResult.error) throw validationsResult.error;

  const sections = new Map<string, {
    sectionId: string;
    name: string;
    capacity: number;
    available: number;
    sold: number;
    reserved: number;
    blocked: number;
    revenueCents: number;
  }>();
  const nowIso = new Date().toISOString();
  const sellableSectionIds = new Set<string>();
  const daily = new Map<string, {
    key: string;
    label: string;
    ticketsSold: number;
    courtesyTickets: number;
    ticketRevenueCents: number;
    comboRevenueCents: number;
    sections: Map<string, { quantity: number; revenueCents: number }>;
  }>();
  const sixHourSales = new Map<string, {
    dayKey: string;
    endHour: number;
    ticketsSold: number;
    courtesyTickets: number;
    ticketRevenueCents: number;
    sections: Map<string, { quantity: number; revenueCents: number }>;
  }>();
  const comboOffers = new Map<string, { name: string; quantity: number; revenueCents: number }>();

  for (const price of pricesResult.data ?? []) {
    if (price.status !== "active") continue;
    if (price.sales_start_at && price.sales_start_at > nowIso) continue;
    if (price.sales_end_at && price.sales_end_at < nowIso) continue;
    const section = first(price.venue_sections);
    const venue = first(section?.venues);
    if (section?.status !== "active" || venue?.status !== "active") continue;
    sellableSectionIds.add(price.section_id);
  }

  for (const seat of seatsResult.data ?? []) {
    const sectionJoin = first(seat.venue_sections);
    const venue = first(sectionJoin?.venues);
    const physicalSeat = first(seat.seats);
    const isSellableSection =
      sellableSectionIds.has(seat.section_id) &&
      sectionJoin?.status === "active" &&
      venue?.status === "active" &&
      physicalSeat?.status === "active";

    if (!isSellableSection) {
      continue;
    }

    const section = ensureSection(
      sections,
      seat.section_id,
      sectionJoin?.name ?? "Sem setor",
    );
    section.capacity += 1;
    if (seat.status === "available") section.available += 1;
    if (seat.status === "reserved") section.reserved += 1;
    if (seat.status === "blocked") section.blocked += 1;
  }

  let soldTickets = 0;
  let courtesyTickets = 0;
  let ticketRevenueCents = 0;
  let usedTickets = 0;

  for (const ticket of ticketsResult.data ?? []) {
    if (ticket.status === "cancelled") continue;

    const item = first(ticket.reservation_items);
    const sectionJoin = first(ticket.venue_sections);
    const order = first(ticket.orders);
    const amount = safeCents(item?.price_cents) + safeCents(item?.fee_cents);
    const isCourtesy = item?.ticket_type === "free" || amount === 0;
    const sectionId = sectionJoin?.id ?? "sem-setor";
    const approvedAt = (Array.isArray(order?.payments) ? order.payments : order?.payments ? [order.payments] : [])
      .filter((payment) => payment.status === "approved" && payment.paid_at)
      .map((payment) => payment.paid_at as string)
      .sort((left, right) => right.localeCompare(left))[0];
    const purchaseTimestamp = approvedAt ?? order?.created_at ?? ticket.issued_at;
    const activityTimestamp = isCourtesy ? ticket.issued_at : purchaseTimestamp;
    if ((ticket.status === "used" || ticket.used_at) && isInRange(ticket.used_at)) usedTickets += 1;
    if (!isInRange(activityTimestamp)) continue;
    const saleDayKey = getDayKey(activityTimestamp);
    const day = daily.get(saleDayKey) ?? {
      key: saleDayKey,
      label: getDayLabel(saleDayKey),
      ticketsSold: 0,
      courtesyTickets: 0,
      ticketRevenueCents: 0,
      comboRevenueCents: 0,
      sections: new Map<string, { quantity: number; revenueCents: number }>(),
    };

    if (isCourtesy) {
      courtesyTickets += 1;
      day.courtesyTickets += 1;

      const saleTimestamp = activityTimestamp;
      const endHour = Math.min(24, Math.floor(getSaoPauloHour(saleTimestamp) / 6) * 6 + 6);
      const intervalKey = `${saleDayKey}-${endHour}`;
      const interval = sixHourSales.get(intervalKey) ?? {
        dayKey: saleDayKey,
        endHour,
        ticketsSold: 0,
        courtesyTickets: 0,
        ticketRevenueCents: 0,
        sections: new Map<string, { quantity: number; revenueCents: number }>(),
      };
      interval.courtesyTickets += 1;
      sixHourSales.set(intervalKey, interval);
      daily.set(saleDayKey, day);
    } else {
      const section = ensureSection(sections, sectionId, sectionJoin?.name ?? "Sem setor");
      soldTickets += 1;
      ticketRevenueCents += amount;
      section.sold += 1;
      section.revenueCents += amount;
      day.ticketsSold += 1;
      day.ticketRevenueCents += amount;
      const sectionDay = day.sections.get(sectionId) ?? { quantity: 0, revenueCents: 0 };
      day.sections.set(sectionId, {
        quantity: sectionDay.quantity + 1,
        revenueCents: sectionDay.revenueCents + amount,
      });

      const saleTimestamp = activityTimestamp;
      const endHour = Math.min(24, Math.floor(getSaoPauloHour(saleTimestamp) / 6) * 6 + 6);
      const intervalKey = `${saleDayKey}-${endHour}`;
      const interval = sixHourSales.get(intervalKey) ?? {
        dayKey: saleDayKey,
        endHour,
        ticketsSold: 0,
        courtesyTickets: 0,
        ticketRevenueCents: 0,
        sections: new Map<string, { quantity: number; revenueCents: number }>(),
      };
      const intervalSection = interval.sections.get(sectionId) ?? { quantity: 0, revenueCents: 0 };
      interval.ticketsSold += 1;
      interval.ticketRevenueCents += amount;
      interval.sections.set(sectionId, {
        quantity: intervalSection.quantity + 1,
        revenueCents: intervalSection.revenueCents + amount,
      });
      sixHourSales.set(intervalKey, interval);
      daily.set(saleDayKey, day);
    }

  }

  let comboOrdersPaid = 0;
  let comboOrdersPending = 0;
  let comboItemsSold = 0;
  let comboRevenueCents = 0;

  for (const combo of combosResult.data ?? []) {
    const comboTimestamp = combo.paid_at ?? combo.created_at;
    if (combo.status === "pending_payment" && isInRange(combo.created_at)) comboOrdersPending += 1;
    if (combo.status !== "paid" || !isInRange(comboTimestamp)) continue;

    const name = first(combo.combo_offers)?.name ?? "Combo";
    const quantity = Number(combo.quantity) || 0;
    const revenue = safeCents(combo.total_amount_cents);
    const saleDayKey = getDayKey(combo.paid_at ?? combo.created_at);
    const day = daily.get(saleDayKey) ?? {
      key: saleDayKey,
      label: getDayLabel(saleDayKey),
      ticketsSold: 0,
      courtesyTickets: 0,
      ticketRevenueCents: 0,
      comboRevenueCents: 0,
      sections: new Map<string, { quantity: number; revenueCents: number }>(),
    };
    const offer = comboOffers.get(name) ?? { name, quantity: 0, revenueCents: 0 };

    comboOrdersPaid += 1;
    comboItemsSold += quantity;
    comboRevenueCents += revenue;
    day.comboRevenueCents += revenue;
    offer.quantity += quantity;
    offer.revenueCents += revenue;
    daily.set(saleDayKey, day);
    comboOffers.set(name, offer);
  }

  const redemptions = redemptionsResult.data ?? [];
  const sectionTotals = [...sections.values()];
  const capacity = sectionTotals.reduce((total, section) => total + section.capacity, 0);
  const available = sectionTotals.reduce((total, section) => total + section.available, 0);
  const reserved = sectionTotals.reduce((total, section) => total + section.reserved, 0);
  const blocked = sectionTotals.reduce((total, section) => total + section.blocked, 0);
  const comboIssued = redemptions
    .filter((redemption) => redemption.status !== "cancelled" && isInRange(redemption.created_at))
    .reduce((total, redemption) => total + (Number(redemption.quantity) || 0), 0);
  const comboUsed = redemptions
    .filter((redemption) => (redemption.status === "used" || redemption.used_at) && isInRange(redemption.used_at))
    .reduce((total, redemption) => total + (Number(redemption.quantity) || 0), 0);
  return {
    range,
    summary: {
      soldTickets,
      capacity,
      available,
      reserved,
      blocked,
      courtesyTickets,
      ticketRevenueCents,
      comboRevenueCents,
      totalRevenueCents: ticketRevenueCents + comboRevenueCents,
      checkins: (validationsResult.data ?? []).filter((validation) =>
        isInRange(typeof validation.created_at === "string" ? validation.created_at : null),
      ).length,
      usedTickets,
      comboOrdersPaid,
      comboOrdersPending,
      comboItemsSold,
      comboIssued,
      comboUsed,
    },
    sections: [...sections.values()]
      .sort((left, right) => {
        if (right.sold !== left.sold) return right.sold - left.sold;
        return left.name.localeCompare(right.name, "pt-BR");
      })
      .map((section) => ({
        ...section,
        occupancyPercent: section.capacity > 0 ? Math.round((section.sold / section.capacity) * 100) : 0,
      })),
    dailySales: [...daily.values()]
      .sort((left, right) => left.key.localeCompare(right.key))
      .map((day) => ({
        key: day.key,
        label: day.label,
        ticketsSold: day.ticketsSold,
        courtesyTickets: day.courtesyTickets,
        ticketRevenueCents: day.ticketRevenueCents,
        comboRevenueCents: day.comboRevenueCents,
        sections: [...day.sections.entries()].map(([sectionId, totals]) => ({
          sectionId,
          sectionName: sections.get(sectionId)?.name ?? "Sem setor",
          quantity: totals.quantity,
          revenueCents: totals.revenueCents,
        })),
      })),
    sixHourSales: [...sixHourSales.values()]
      .sort((left, right) => left.dayKey.localeCompare(right.dayKey) || left.endHour - right.endHour)
      .map((interval) => ({
        dayKey: interval.dayKey,
        endHour: interval.endHour,
        ticketsSold: interval.ticketsSold,
        courtesyTickets: interval.courtesyTickets,
        ticketRevenueCents: interval.ticketRevenueCents,
        sections: [...interval.sections.entries()].map(([sectionId, totals]) => ({
          sectionId,
          sectionName: sections.get(sectionId)?.name ?? "Sem setor",
          quantity: totals.quantity,
          revenueCents: totals.revenueCents,
        })),
      })),
    contactActivity,
    combos: {
      offers: [...comboOffers.values()].sort((left, right) => right.revenueCents - left.revenueCents),
    },
  };
}

export async function GET(request: Request, context: RouteContext) {
  const { eventId } = await context.params;
  const url = new URL(request.url);

  if (url.searchParams.get("contacts") === "1") {
    const loaded = await loadEventForAdmin(eventId);
    if (!loaded.ok) return loaded.response;
    const requestedRange = url.searchParams.get("range");
    const range: AdminContactRange = requestedRange === "week" || requestedRange === "30" || requestedRange === "60" || requestedRange === "total"
      ? requestedRange
      : "day";

    try {
      const contactActivity = await getAdminContactActivity({
        eventIds: [eventId],
        includeAllContacts: false,
        range,
      });
      return NextResponse.json({ ok: true, contactActivity });
    } catch {
      return NextResponse.json({ ok: false, message: "Não foi possível carregar os contatos." }, { status: 500 });
    }
  }

  if (url.searchParams.get("dashboard") === "1") {
    const loaded = await loadEventForAdmin(eventId);
    if (!loaded.ok) return loaded.response;

    try {
      const requestedRange = url.searchParams.get("range");
      const range: AdminContactRange = requestedRange === "week" || requestedRange === "30" || requestedRange === "60" || requestedRange === "total"
        ? requestedRange
        : "day";
      const dashboard = await buildEventDashboard(eventId, range);

      return NextResponse.json({
        ok: true,
        dashboard,
      });
    } catch {
      return NextResponse.json({ ok: false, message: "Não foi possível carregar a dashboard." }, { status: 500 });
    }
  }

  const payload = await buildEventPayload(eventId);

  if (!payload.ok) return payload.response;

  return NextResponse.json({
    ok: true,
    event: payload.event,
    admin: {
      role: payload.auth.adminUser.role,
      name: payload.auth.adminUser.name,
    },
  });
}

export async function PATCH(request: Request, context: RouteContext) {
  const { eventId } = await context.params;
  const loaded = await loadEventForAdmin(eventId);

  if (!loaded.ok) return loaded.response;

  if (!assertAdminCsrf(request, loaded.auth)) {
    return NextResponse.json({ ok: false, message: "Sessão inválida." }, { status: 403 });
  }

  let body: unknown;

  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, message: "Requisição inválida." }, { status: 400 });
  }

  const parsed = patchSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json(
      { ok: false, message: "Revise os campos destacados.", issues: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const existing = loaded.event;
  const sessionIds = new Set(existing.sessions.map((session) => session.sessionId));
  const sectionById = new Map(existing.sections.map((section) => [section.sectionId, section]));
  const existingPriceIds = new Set(existing.sessions.flatMap(() => [] as string[]));
  const priceSectionIdById = new Map<string, string | null>();
  const priceRows = await Promise.all(
    existing.sessions.map((session) => listAdminPrices({ sessionId: session.sessionId })),
  );

  for (const result of priceRows) {
    if (!result.ok) {
      return NextResponse.json({ ok: false, message: "Não foi possível validar preços." }, { status: 500 });
    }

    result.prices.forEach((price) => {
      existingPriceIds.add(price.id);
      priceSectionIdById.set(price.id, price.section_id);
    });
  }

  if (parsed.data.sessions.some((session) => !sessionIds.has(session.sessionId))) {
    return jsonForbidden();
  }

  if (parsed.data.sections.some((section) => !sectionById.has(section.sectionId))) {
    return jsonForbidden();
  }

  if (parsed.data.prices.some((price) => !existingPriceIds.has(price.priceId))) {
    return jsonForbidden();
  }

  if (parsed.data.courtesy.sections.some((section) => !sectionById.has(section.sectionId))) {
    return jsonForbidden();
  }

  const operationId = request.headers.get("x-idempotency-key");
  if (!operationId || !z.string().uuid().safeParse(operationId).success) {
    return NextResponse.json({ ok: false, message: "Identidade da operação inválida." }, { status: 400 });
  }
  for (const session of parsed.data.sessions) {
    const currentSession = existing.sessions.find((item) => item.sessionId === session.sessionId);
    const startsAtChanged = currentSession?.startsAt !== session.startsAt;

    if (startsAtChanged) {
      const usage = await getAdminSessionUsage(session.sessionId);
      if (!usage.ok) {
        return NextResponse.json({ ok: false, message: "Não foi possível validar a sessão." }, { status: 500 });
      }

      if (usage.hasUsage) {
        return NextResponse.json(
          { ok: false, message: "Não alterei data/hora de sessão com reserva, pedido ou ingresso." },
          { status: 409 },
        );
      }
    }
  }

  if (parsed.data.newSections.length && !existing.sessions.length) {
    return NextResponse.json({ ok: false, message: "Crie uma sessão antes de criar setores." }, { status: 409 });
  }

  const keepsCurrentVenue = Boolean(existing.venueId && isAdminEventLocationUnchanged(
    { venueName: existing.venueName ?? "", city: existing.city, state: existing.state },
    {
      venueName: parsed.data.event.venueName,
      city: parsed.data.event.city,
      state: parsed.data.event.state,
    },
  ));
  const prices = parsed.data.prices.map((price) => ({
    price_id: price.priceId,
    label: price.label,
    price_cents: parseMoneyToCents(price.price),
    fee_cents: parseMoneyToCents(price.fee),
    sales_start_at: price.salesStartAt,
    sales_end_at: price.salesEndAt,
    status: price.status,
  }));
  if (prices.some((price) => price.price_cents === null || price.fee_cents === null)) {
    return NextResponse.json({ ok: false, message: "Preço ou taxa inválidos." }, { status: 400 });
  }

  const updated = await updateAdminEventCatalog({
    operationId,
    eventId,
    payload: {
      venue: {
        keep_current: keepsCurrentVenue,
        name: parsed.data.event.venueName,
        city: parsed.data.event.city,
        state: parsed.data.event.state,
      },
      event: {
        title: parsed.data.event.title,
        artist_name: parsed.data.event.artistName?.trim() || parsed.data.event.title,
        artist_icon: parsed.data.event.artistIcon?.trim() || "🎤",
        description: parsed.data.event.description || null,
        city: parsed.data.event.city,
        state: parsed.data.event.state.toUpperCase(),
        image_url: parsed.data.event.imageUrl || null,
        status: parsed.data.event.status,
      },
      sessions: parsed.data.sessions.map((session) => ({
        session_id: session.sessionId,
        starts_at: session.startsAt,
        status: session.status,
      })),
      sections: parsed.data.sections.map((section) => ({
        section_id: section.sectionId,
        name: section.name,
        capacity: section.capacity,
        status: section.status,
        has_numbered_seats: sectionById.get(section.sectionId)?.hasNumberedSeats ?? false,
      })),
      new_sections: parsed.data.newSections.map((section) => ({
        name: section.name,
        slug: slugifySection(section.name),
        capacity: section.capacity,
      })),
      prices,
      courtesy_limits: parsed.data.courtesy.sections.map((section) => ({
        section_id: section.sectionId,
        label: section.label,
        max_courtesies: section.limit,
        status: section.status,
      })),
    },
  });
  if (!updated.ok) {
    const message = String(updated.error?.message ?? "");
    const multiVenue = message.includes("admin_event_multi_venue_location_change_unsupported");
    const requiresRemap = message.includes("admin_event_location_requires_remap");
    const conflict = multiVenue || requiresRemap || message.includes("session_has_usage") || message.includes("capacity_below_busy");
    const conflictMessage = multiVenue
      ? "Este evento possui sessões em locais diferentes e exige remapeamento explícito."
      : requiresRemap
        ? "A localização não pode mudar enquanto houver catálogo, cortesias, reservas ou ingressos vinculados; faça o remapeamento primeiro."
        : "Não foi possível alterar o catálogo sem afetar uso existente.";
    return NextResponse.json(
      { ok: false, message: conflict ? conflictMessage : "Não foi possível salvar o evento." },
      { status: conflict ? 409 : 500 },
    );
  }

  const payload = await buildEventPayload(eventId);

  if (!payload.ok) return payload.response;

  return NextResponse.json({
    ok: true,
    event: payload.event,
  });
}

export async function POST(request: Request, context: RouteContext) {
  const { eventId } = await context.params;
  const loaded = await loadEventForAdmin(eventId);

  if (!loaded.ok) return loaded.response;

  if (!assertAdminCsrf(request, loaded.auth)) {
    return NextResponse.json({ ok: false, message: "Sessão inválida." }, { status: 403 });
  }

  const operationId = request.headers.get("x-idempotency-key");
  if (!operationId || !z.string().uuid().safeParse(operationId).success) {
    return NextResponse.json({ ok: false, message: "Identidade da operação inválida." }, { status: 400 });
  }

  const duplicated = await duplicateAdminEvent({
    eventId,
    createdByAdminUserId: loaded.auth.adminUser.id,
    createdByAdminPhone: loaded.auth.adminUser.phone,
    operationId,
  });

  if (!duplicated.ok) {
    return NextResponse.json({ ok: false, message: "Não foi possível duplicar o evento." }, { status: 500 });
  }

  const payload = await buildEventPayload(duplicated.eventId);

  if (!payload.ok) {
    return NextResponse.json({ ok: true, eventId: duplicated.eventId });
  }

  return NextResponse.json({
    ok: true,
    eventId: duplicated.eventId,
    event: payload.event,
  });
}

export async function DELETE(request: Request, context: RouteContext) {
  const { eventId } = await context.params;
  const loaded = await loadEventForAdmin(eventId);

  if (!loaded.ok) return loaded.response;

  if (!assertAdminCsrf(request, loaded.auth)) {
    return NextResponse.json({ ok: false, message: "Sessão inválida." }, { status: 403 });
  }

  const updated = await updateAdminEvent(eventId, { status: "cancelled" });

  if (!updated.ok) {
    return NextResponse.json({ ok: false, message: "Não foi possível excluir o evento." }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}


