import "server-only";

import { getSupabaseAdmin } from "@/lib/supabase/admin";

type MaybeArray<T> = T | T[] | null | undefined;

export type AdminReportType =
  | "summary"
  | "sales_event"
  | "sales_section"
  | "pending_payments"
  | "expired_cancelled_reservations"
  | "gate_checkins"
  | "ticket_usage"
  | "courtesies"
  | "division";

export type AdminReportPeriod = {
  label: string;
  from?: string;
  to?: string;
  compact?: boolean;
};

type EventRow = {
  id: string;
  title: string;
  city: string;
  state: string;
  venues: MaybeArray<{ name: string | null }>;
};

type TicketRow = {
  id: string;
  ticket_code: string;
  status: string;
  issued_at: string;
  used_at: string | null;
  cancelled_at: string | null;
  order_id: string;
  session_id: string;
  section_id: string;
  event_sessions: MaybeArray<{
    event_id: string;
    starts_at: string;
    events?: MaybeArray<{ title: string }>;
  }>;
  venue_sections: MaybeArray<{
    id: string;
    name: string;
    status: string;
    venues?: MaybeArray<{ status: string }>;
  }>;
  reservation_items: MaybeArray<{
    ticket_type: string;
    price_cents: number;
    fee_cents: number;
    seat_code: string;
  }>;
  orders: MaybeArray<{
    status: string;
    created_at: string;
    total_amount_cents: number;
    total_fee_cents: number;
    payments?: MaybeArray<{
      status: string;
      paid_at: string | null;
    }>;
  }>;
  customers: MaybeArray<{
    whatsapp_phone: string | null;
    name: string | null;
  }>;
};

type ReservationRow = {
  id: string;
  session_id: string;
  status: string;
  expires_at: string;
  created_at: string;
  updated_at: string;
  total_amount_cents: number;
  total_fee_cents: number;
  event_sessions: MaybeArray<{
    event_id: string;
    starts_at: string;
    events: MaybeArray<{ title: string }>;
  }>;
  customers: MaybeArray<{ whatsapp_phone: string | null }>;
  orders: MaybeArray<{ status: string }>;
  reservation_items: MaybeArray<{
    seat_code: string;
    venue_sections: MaybeArray<{ name: string }>;
  }>;
};

type ValidationRow = {
  id: string;
  result: string;
  ticket_code: string | null;
  gate_label: string | null;
  validator_identifier: string | null;
  created_at: string;
  tickets: MaybeArray<{
    id: string;
    session_id: string;
    event_sessions: MaybeArray<{ event_id: string }>;
    venue_sections: MaybeArray<{ name: string }>;
  }>;
};

type CourtesyRow = {
  id: string;
  event_id: string;
  session_id: string;
  status: string;
  phone: string;
  beneficiary_name: string | null;
  reason: string | null;
  created_at: string;
  cancelled_at: string | null;
  tickets: MaybeArray<{ status: string; used_at: string | null; ticket_code: string }>;
};

type SessionSeatRow = {
  id: string;
  session_id: string;
  section_id: string;
  status: string;
  seats?: MaybeArray<{ status: string }>;
  event_sessions: MaybeArray<{
    event_id: string;
    starts_at: string;
    status: string;
    events?: MaybeArray<{ status: string }>;
    venues?: MaybeArray<{ status: string }>;
  }>;
  venue_sections: MaybeArray<{
    name: string;
    status: string;
    venues?: MaybeArray<{ status: string }>;
  }>;
};

type TicketPriceRow = {
  id: string;
  session_id: string;
  section_id: string;
  ticket_type: string;
  price_cents: number;
  fee_cents: number;
  status: string;
  label: string;
  sales_start_at: string | null;
  sales_end_at: string | null;
  event_sessions?: MaybeArray<{
    event_id: string;
    starts_at: string;
    status: string;
    events?: MaybeArray<{ status: string }>;
    venues?: MaybeArray<{ status: string }>;
  }>;
  venue_sections?: MaybeArray<{
    name: string;
    status: string;
    venues?: MaybeArray<{ status: string }>;
  }>;
};

type PaymentRow = {
  id: string;
  order_id: string;
  amount_cents: number;
  paid_at: string | null;
  created_at: string;
  orders: MaybeArray<{
    status: string;
  }>;
};

type DivisionSettlementRow = {
  id: string;
  period_key: string;
  period_label: string;
  period_from: string | null;
  period_to: string | null;
  total_received_cents: number;
  amount_due_cents: number;
  percentage_basis_points: number;
  order_count: number;
  week_count: number;
  status: string;
  paid_at: string;
  paid_by_admin_user_id: string | null;
};

export type AdminDivisionSettlementDraft = {
  periodKey: string;
  periodLabel: string;
  periodFrom?: string;
  periodTo?: string;
  totalReceivedCents: number;
  amountDueCents: number;
  orderCount: number;
  weekCount: number;
};

const SAO_PAULO_TIME_ZONE = "America/Sao_Paulo";
const DEFAULT_LIMIT = 10;
const BLACK_HOUSE_SECTION_ORDER = new Map([
  ["Cadeira meia", 0],
  ["Crianças e adolescentes (2 a 18 anos)", 1],
  ["1ª Fileira", 2],
  ["Mesa 2 lugares", 3],
  ["Mesa 4 lugares", 4],
  ["Cadeira inteira", 5],
  ["Assento / item especial", 6],
]);

function first<T>(value: MaybeArray<T>): T | null {
  if (Array.isArray(value)) return value[0] ?? null;
  return value ?? null;
}

function asArray<T>(value: MaybeArray<T>): T[] {
  if (Array.isArray(value)) return value;
  return value ? [value] : [];
}

function formatDateTime(value: string) {
  return new Intl.DateTimeFormat("pt-BR", {
    timeZone: SAO_PAULO_TIME_ZONE,
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  })
    .format(new Date(value))
    .replace(",", " às");
}

function formatDateOnly(value: Date | string) {
  return new Intl.DateTimeFormat("pt-BR", {
    timeZone: SAO_PAULO_TIME_ZONE,
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(new Date(value));
}

function getSaoPauloDayKey(value: Date | string) {
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

function formatCurrencyFromCents(cents: number) {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(cents / 100);
}

function maskPhone(phone: string | null | undefined) {
  const digits = String(phone ?? "").replace(/\D/g, "");
  if (!digits) return "Não informado";
  return `****${digits.slice(-4)}`;
}

function isWithinPeriod(value: string | null | undefined, period: AdminReportPeriod) {
  if (!value) return false;
  const date = new Date(value).getTime();
  if (!Number.isFinite(date)) return false;
  if (period.from && date < new Date(period.from).getTime()) return false;
  if (period.to && date > new Date(period.to).getTime()) return false;
  return true;
}

function getNextFridayLabel(reference = new Date()) {
  const weekday = new Intl.DateTimeFormat("en-US", {
    timeZone: SAO_PAULO_TIME_ZONE,
    weekday: "short",
  }).format(reference);
  const weekdayIndexes: Record<string, number> = {
    Sun: 0,
    Mon: 1,
    Tue: 2,
    Wed: 3,
    Thu: 4,
    Fri: 5,
    Sat: 6,
  };
  const current = weekdayIndexes[weekday] ?? reference.getDay();
  const daysUntilFriday = (5 - current + 7) % 7;
  const nextFriday = new Date(reference);
  nextFriday.setDate(nextFriday.getDate() + daysUntilFriday);
  return formatDateOnly(nextFriday);
}

function getPeriodKey(period: AdminReportPeriod) {
  return `${period.from ?? "start"}|${period.to ?? "end"}`;
}

type DivisionWeekPeriod = {
  key: string;
  label: string;
  from: string;
  to: string;
};

function endOfNextFriday(from: Date, limit: Date) {
  const date = new Date(from);
  const day = date.getDay();
  const daysUntilFriday = (5 - day + 7) % 7;
  date.setDate(date.getDate() + daysUntilFriday);
  date.setHours(23, 59, 59, 999);
  return date.getTime() > limit.getTime() ? new Date(limit) : date;
}

function buildDivisionWeeks(period: AdminReportPeriod): DivisionWeekPeriod[] {
  if (!period.from || !period.to) return [];

  const finalDate = new Date(period.to);
  let cursor = new Date(period.from);
  const weeks: DivisionWeekPeriod[] = [];

  while (cursor.getTime() <= finalDate.getTime()) {
    const weekEnd = endOfNextFriday(cursor, finalDate);
    const from = cursor.toISOString();
    const to = weekEnd.toISOString();
    weeks.push({
      key: `week:${from.slice(0, 10)}:${to.slice(0, 10)}`,
      label: `${formatDateOnly(from)} a ${formatDateOnly(to)}`,
      from,
      to,
    });
    cursor = new Date(weekEnd.getTime() + 1);
  }

  return weeks;
}

function isWithinIsoRange(value: string | null | undefined, from: string, to: string) {
  if (!value) return false;
  const time = new Date(value).getTime();
  return Number.isFinite(time) && time >= new Date(from).getTime() && time <= new Date(to).getTime();
}

function isMissingDivisionSettlementsTableError(error: unknown) {
  const candidate = error as { code?: string; message?: string } | null;
  return (
    candidate?.code === "42P01" ||
    String(candidate?.message ?? "").includes("division_settlements")
  );
}

function getTicketAmount(ticket: TicketRow) {
  const item = first(ticket.reservation_items);
  return (item?.price_cents ?? 0) + (item?.fee_cents ?? 0);
}

function getSectionName(ticket: TicketRow | SessionSeatRow) {
  return first(ticket.venue_sections)?.name ?? "Sem setor";
}

function formatSummarySectionName(section: string) {
  if (section === "Cadeira meia") {
    return "Cadeira meia";
  }
  if (section === "1ª Fileira") {
    return "*1ª Fileira*";
  }
  return section;
}

function compareSummarySections(sectionA: string, sectionB: string) {
  const orderA = BLACK_HOUSE_SECTION_ORDER.get(sectionA);
  const orderB = BLACK_HOUSE_SECTION_ORDER.get(sectionB);
  if (orderA !== undefined || orderB !== undefined) {
    return (orderA ?? Number.MAX_SAFE_INTEGER) - (orderB ?? Number.MAX_SAFE_INTEGER);
  }
  return sectionA.localeCompare(sectionB, "pt-BR");
}

function getReservationQuantity(reservation: ReservationRow) {
  return asArray(reservation.reservation_items).length;
}

function getEventLocation(event: EventRow | null) {
  if (!event) return "";
  const venue = first(event.venues)?.name;
  return [venue, `${event.city}/${event.state}`].filter(Boolean).join(" - ");
}

function withoutWhatsAppBold(value: string) {
  return value.replace(/\*/g, "");
}

function formatReportCount(label: string, count: number) {
  return `> *${label}:* *${count}*`;
}

function reportHeader(title: string, event: EventRow | null, period: AdminReportPeriod) {
  return [
    title,
    event ? `*Evento:* *${withoutWhatsAppBold(event.title)}*` : null,
    event ? `> *Local:* *${withoutWhatsAppBold(getEventLocation(event))}*` : null,
    `> *Período:* *${withoutWhatsAppBold(period.label)}*`,
  ].filter(Boolean) as string[];
}

async function getEvent(eventId: string) {
  const { data, error } = await getSupabaseAdmin()
    .from("events")
    .select("id, title, city, state, venues(name)")
    .eq("id", eventId)
    .maybeSingle<EventRow>();

  if (error) throw error;
  return data ?? null;
}

async function getEvents(eventIds: string[]) {
  if (!eventIds.length) return [];

  const { data, error } = await getSupabaseAdmin()
    .from("events")
    .select("id, title, city, state, venues(name)")
    .in("id", eventIds)
    .returns<EventRow[]>();

  if (error) throw error;
  return data ?? [];
}

async function fetchAllRows<T>(query: {
  range: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: unknown }>;
}) {
  const rows: T[] = [];
  const pageSize = 1000;

  for (let from = 0; ; from += pageSize) {
    const { data, error } = await query.range(from, from + pageSize - 1);
    if (error) throw error;
    const page = data ?? [];
    rows.push(...page);
    if (page.length < pageSize) return rows;
  }
}

async function getTickets(eventId?: string | string[]) {
  let query = getSupabaseAdmin()
    .from("tickets")
    .select(
      "id, ticket_code, status, issued_at, used_at, cancelled_at, order_id, session_id, section_id, event_sessions!inner(event_id, starts_at, events(title)), venue_sections(id, name, status, venues(status)), reservation_items(ticket_type, price_cents, fee_cents, seat_code), orders(status, created_at, total_amount_cents, total_fee_cents, payments(status, paid_at)), customers(whatsapp_phone, name)",
    )
    .order("id", { ascending: true });

  if (Array.isArray(eventId)) query = query.in("event_sessions.event_id", eventId);
  else if (eventId) query = query.eq("event_sessions.event_id", eventId);

  return fetchAllRows<TicketRow>(query.returns<TicketRow[]>());
}

async function getReservations(eventId?: string | string[]) {
  let query = getSupabaseAdmin()
    .from("reservations")
    .select(
      "id, session_id, status, expires_at, created_at, updated_at, total_amount_cents, total_fee_cents, event_sessions!inner(event_id, starts_at, events(title)), customers(whatsapp_phone), orders(status), reservation_items(seat_code, venue_sections(name))",
    )
    .order("id", { ascending: true });

  if (Array.isArray(eventId)) query = query.in("event_sessions.event_id", eventId);
  else if (eventId) query = query.eq("event_sessions.event_id", eventId);

  return fetchAllRows<ReservationRow>(query.returns<ReservationRow[]>());
}

async function getValidations(eventId?: string | string[]) {
  let query = getSupabaseAdmin()
    .from("ticket_validation_events")
    .select(
      "id, result, ticket_code, gate_label, validator_identifier, created_at, tickets!inner(id, session_id, event_sessions!inner(event_id), venue_sections(name))",
    )
    .order("id", { ascending: true });

  if (Array.isArray(eventId)) query = query.in("tickets.event_sessions.event_id", eventId);
  else if (eventId) query = query.eq("tickets.event_sessions.event_id", eventId);

  return fetchAllRows<ValidationRow>(query.returns<ValidationRow[]>());
}

async function getCourtesies(eventId?: string | string[]) {
  let query = getSupabaseAdmin()
    .from("courtesies")
    .select(
      "id, event_id, session_id, status, phone, beneficiary_name, reason, created_at, cancelled_at, tickets(status, used_at, ticket_code)",
    )
    .order("id", { ascending: true });

  if (Array.isArray(eventId)) query = query.in("event_id", eventId);
  else if (eventId) query = query.eq("event_id", eventId);

  return fetchAllRows<CourtesyRow>(query.returns<CourtesyRow[]>());
}

async function getSessionSeats(eventId?: string | string[]) {
  let query = getSupabaseAdmin()
    .from("session_seats")
    .select(
      "id, session_id, section_id, status, seats(status), event_sessions!inner(event_id, starts_at, status, events(status), venues(status)), venue_sections(name, status, venues(status))",
    )
    .order("id", { ascending: true });

  if (Array.isArray(eventId)) query = query.in("event_sessions.event_id", eventId);
  else if (eventId) query = query.eq("event_sessions.event_id", eventId);

  return fetchAllRows<SessionSeatRow>(query.returns<SessionSeatRow[]>());
}

async function getActiveTicketPrices(eventId?: string | string[]) {
  let query = getSupabaseAdmin()
    .from("ticket_prices")
    .select(
      "id, session_id, section_id, ticket_type, label, price_cents, fee_cents, status, sales_start_at, sales_end_at, event_sessions!inner(event_id, starts_at, status, events(status), venues(status)), venue_sections(name, status, venues(status))",
    )
    .eq("status", "active")
    .neq("ticket_type", "free")
    .order("id", { ascending: true });

  if (Array.isArray(eventId)) query = query.in("event_sessions.event_id", eventId);
  else if (eventId) query = query.eq("event_sessions.event_id", eventId);

  return fetchAllRows<TicketPriceRow>(query.returns<TicketPriceRow[]>());
}

async function getApprovedPayments(period: AdminReportPeriod) {
  let query = getSupabaseAdmin()
    .from("payments")
    .select("id, order_id, amount_cents, paid_at, created_at, orders!inner(status)")
    .eq("status", "approved")
    .eq("orders.status", "paid")
    .not("paid_at", "is", null);

  if (period.from) query = query.gte("paid_at", period.from);
  if (period.to) query = query.lte("paid_at", period.to);

  const { data, error } = await query.returns<PaymentRow[]>();

  if (error) throw error;
  return data ?? [];
}

async function getDivisionSettlement(periodKey: string) {
  const { data, error } = await getSupabaseAdmin()
    .from("division_settlements")
    .select(
      "id, period_key, period_label, period_from, period_to, total_received_cents, amount_due_cents, percentage_basis_points, order_count, week_count, status, paid_at, paid_by_admin_user_id",
    )
    .eq("period_key", periodKey)
    .maybeSingle<DivisionSettlementRow>();

  if (error) {
    if (isMissingDivisionSettlementsTableError(error)) return null;
    throw error;
  }

  return data ?? null;
}

async function getDivisionSettlements(periodKeys: string[]) {
  if (!periodKeys.length) return [] as DivisionSettlementRow[];

  const { data, error } = await getSupabaseAdmin()
    .from("division_settlements")
    .select(
      "id, period_key, period_label, period_from, period_to, total_received_cents, amount_due_cents, percentage_basis_points, order_count, week_count, status, paid_at, paid_by_admin_user_id",
    )
    .in("period_key", periodKeys)
    .returns<DivisionSettlementRow[]>();

  if (error) {
    if (isMissingDivisionSettlementsTableError(error)) return [] as DivisionSettlementRow[];
    throw error;
  }

  return data ?? [];
}

async function getPaidDivisionSettlements() {
  const { data, error } = await getSupabaseAdmin()
    .from("division_settlements")
    .select(
      "id, period_key, period_label, period_from, period_to, total_received_cents, amount_due_cents, percentage_basis_points, order_count, week_count, status, paid_at, paid_by_admin_user_id",
    )
    .eq("status", "paid")
    .returns<DivisionSettlementRow[]>();

  if (error) {
    if (isMissingDivisionSettlementsTableError(error)) return [] as DivisionSettlementRow[];
    throw error;
  }

  return data ?? [];
}

export async function markDivisionSettlementPaid(input: {
  settlement: AdminDivisionSettlementDraft;
  paidByAdminUserId: string;
}) {
  const { settlement, paidByAdminUserId } = input;
  const { data, error } = await getSupabaseAdmin()
    .from("division_settlements")
    .upsert(
      {
        period_key: settlement.periodKey,
        period_label: settlement.periodLabel,
        period_from: settlement.periodFrom ?? null,
        period_to: settlement.periodTo ?? null,
        total_received_cents: settlement.totalReceivedCents,
        amount_due_cents: settlement.amountDueCents,
        percentage_basis_points: 500,
        order_count: settlement.orderCount,
        week_count: settlement.weekCount,
        status: "paid",
        paid_at: new Date().toISOString(),
        paid_by_admin_user_id: paidByAdminUserId,
      },
      { onConflict: "period_key" },
    )
    .select("id")
    .single();

  if (error) {
    if (isMissingDivisionSettlementsTableError(error)) {
      return { ok: false as const, reason: "missing_table" as const };
    }
    throw error;
  }

  return { ok: true as const, settlementId: data.id as string };
}

function paidTickets(tickets: TicketRow[], period: AdminReportPeriod) {
  return tickets.filter(
    (ticket) => {
      const order = first(ticket.orders);
      const approvedPaymentDates = asArray(order?.payments)
        .filter((payment) => payment.status === "approved" && payment.paid_at)
        .map((payment) => payment.paid_at as string)
        .sort((left, right) => right.localeCompare(left));

      return (
        order?.status === "paid" &&
        first(ticket.reservation_items)?.ticket_type !== "free" &&
        ticket.status !== "cancelled" &&
        isWithinPeriod(approvedPaymentDates[0], period)
      );
    },
  );
}

function courtesyTickets(tickets: TicketRow[], period: AdminReportPeriod) {
  return tickets.filter(
    (ticket) =>
      first(ticket.reservation_items)?.ticket_type === "free" &&
      isWithinPeriod(ticket.issued_at, period),
  );
}

function buildCapacitySummary(
  tickets: TicketRow[],
  sessionSeats: SessionSeatRow[],
  ticketPrices: TicketPriceRow[],
  period: AdminReportPeriod,
  {
    describeSpecialOffer = false,
    activeSalesOnly = true,
    includeZeroSections = false,
  }: {
    describeSpecialOffer?: boolean;
    activeSalesOnly?: boolean;
    includeZeroSections?: boolean;
  } = {},
) {
  const now = new Date();
  const nowIso = now.toISOString();
  const todayKey = getSaoPauloDayKey(now);

  const isOperationallyActive = (value: string | null | undefined) =>
    !value || value === "active";
  const isActiveSection = (
    section: {
      status?: string | null;
      venues?: MaybeArray<{ status: string }>;
    } | null,
  ) =>
    Boolean(
      section &&
      section.status === "active" &&
      isOperationallyActive(first(section.venues)?.status),
    );
  const isActiveSalesContext = (
    session: {
      starts_at: string;
      status: string;
      events?: MaybeArray<{ status: string }>;
      venues?: MaybeArray<{ status: string }>;
    } | null,
    section: {
      status: string;
      venues?: MaybeArray<{ status: string }>;
    } | null,
  ) => {
    if (!session || !section) return false;

    const sessionDayKey = getSaoPauloDayKey(session.starts_at);
    const isEventDay = sessionDayKey === todayKey;
    const isFutureDay = sessionDayKey > todayKey;
    const eventStatus = first(session.events)?.status;
    const eventIsEligible =
      eventStatus === "published" || (isEventDay && eventStatus === "finished");
    const sessionIsEligible = isEventDay
      ? session.status !== "cancelled"
      : session.status === "scheduled" || session.status === "sales_open";

    return Boolean(
      (isEventDay || isFutureDay) &&
      eventIsEligible &&
      sessionIsEligible &&
      isOperationallyActive(first(session.venues)?.status) &&
      isActiveSection(section)
    );
  };

  const activeTicketPrices = ticketPrices.filter((price) => {
    const session = first(price.event_sessions);
    const section = first(price.venue_sections);
    const isEventDay = Boolean(
      session && getSaoPauloDayKey(session.starts_at) === todayKey,
    );

    return (
      isActiveSalesContext(session, section) &&
      (isEventDay || (
        (!price.sales_start_at || price.sales_start_at <= nowIso) &&
        (!price.sales_end_at || price.sales_end_at >= nowIso)
      ))
    );
  });
  const reportTicketPrices = activeSalesOnly
    ? activeTicketPrices
    : ticketPrices.filter((price) => isActiveSection(first(price.venue_sections)));
  const activeSessionSections = new Set(
    reportTicketPrices.map((price) => `${price.session_id}:${price.section_id}`),
  );
  const activeSessionIds = new Set(
    activeSalesOnly
      ? activeTicketPrices.map((price) => price.session_id)
      : [
          ...tickets.map((ticket) => ticket.session_id),
          ...sessionSeats.map((seat) => seat.session_id),
          ...ticketPrices.map((price) => price.session_id),
        ],
  );
  const periodPaidTickets = paidTickets(tickets, period);
  const paid = periodPaidTickets.filter((ticket) =>
    isActiveSection(first(ticket.venue_sections)) &&
    (!activeSalesOnly || activeSessionSections.has(`${ticket.session_id}:${ticket.section_id}`)),
  );
  const issuedTickets = paid.filter(
    (ticket) => ticket.status === "issued" || ticket.status === "used",
  );
  const notUsed = issuedTickets.filter((ticket) => ticket.status === "issued");
  const totalSold = paid.reduce((sum, ticket) => sum + getTicketAmount(ticket), 0);
  const activeSessionSeats = sessionSeats.filter((seat) => {
    const session = first(seat.event_sessions);
    const section = first(seat.venue_sections);

    if (first(seat.seats)?.status === "inactive") return false;
    if (!isActiveSection(section)) return false;
    if (!activeSalesOnly) return true;

    return activeSessionSections.has(`${seat.session_id}:${seat.section_id}`) &&
      isActiveSalesContext(session, section);
  });

  const maximumPriceBySessionSection = new Map<string, number>();
  for (const price of reportTicketPrices) {
    const key = `${price.session_id}:${price.section_id}`;
    const amount = price.price_cents + price.fee_cents;
    maximumPriceBySessionSection.set(
      key,
      Math.max(maximumPriceBySessionSection.get(key) ?? 0, amount),
    );
  }

  const capacityBySection = new Map<string, { section: string; capacity: number }>();
  let totalPotential = 0;
  for (const seat of activeSessionSeats) {
    const section = getSectionName(seat);
    const key = section === "Assento / item especial" && describeSpecialOffer
      ? `special:${seat.section_id}`
      : section;
    const current = capacityBySection.get(key) ?? { section, capacity: 0 };
    current.capacity += 1;
    capacityBySection.set(key, current);
    totalPotential +=
      maximumPriceBySessionSection.get(`${seat.session_id}:${seat.section_id}`) ?? 0;
  }

  const soldBySection = new Map<string, number>();
  for (const ticket of paid) {
    const section = getSectionName(ticket);
    const sectionId = first(ticket.venue_sections)?.id;
    const key = section === "Assento / item especial" && describeSpecialOffer && sectionId
      ? `special:${sectionId}`
      : section;
    soldBySection.set(key, (soldBySection.get(key) ?? 0) + 1);
  }

  const specialLabelBySection = new Map(
    reportTicketPrices
      .filter((price) => first(price.venue_sections)?.name === "Assento / item especial")
      .map((price) => [price.section_id, price.label.trim()]),
  );

  const sectionSales = includeZeroSections
    ? [...capacityBySection.keys()].map(
        (key) => [key, soldBySection.get(key) ?? 0] as const,
      )
    : [...soldBySection.entries()].filter(([, sold]) => sold > 0);
  const sectionLines = sectionSales
    .sort(([keyA], [keyB]) =>
      compareSummarySections(
        capacityBySection.get(keyA)?.section ?? keyA,
        capacityBySection.get(keyB)?.section ?? keyB,
      ),
    )
    .map(
      ([key, sold]) => {
        const { section, capacity } = capacityBySection.get(key) ?? {
          section: key.startsWith("special:") ? "Assento / item especial" : key,
          capacity: 0,
        };
        const specialSectionId = key.startsWith("special:") ? key.slice("special:".length) : null;
        const specialLabel = specialSectionId
          ? specialLabelBySection.get(specialSectionId)
          : null;
        const label =
          section === "Assento / item especial" && describeSpecialOffer && specialLabel
            ? specialLabel.charAt(0).toLocaleUpperCase("pt-BR") + specialLabel.slice(1)
            : formatSummarySectionName(section);
        return capacity > 0
          ? `> *${withoutWhatsAppBold(label)}:* *${sold} vendidos* de *${capacity} ${activeSalesOnly ? "assentos ativos" : "lugares cadastrados"}*`
          : `> *${withoutWhatsAppBold(label)}:* *${sold} vendidos*`;
      },
    );

  const salesByEvent = new Map<string, { title: string; tickets: number; amount: number }>();
  for (const ticket of paid) {
    const session = first(ticket.event_sessions);
    const title = first(session?.events)?.title ?? "Evento sem nome";
    const eventId = session?.event_id ?? title;
    const current = salesByEvent.get(eventId) ?? { title, tickets: 0, amount: 0 };
    current.tickets += 1;
    current.amount += getTicketAmount(ticket);
    salesByEvent.set(eventId, current);
  }
  const sortedEventSales = [...salesByEvent.values()]
    .sort((left, right) => right.tickets - left.tickets || left.title.localeCompare(right.title, "pt-BR"));
  const eventLines = sortedEventSales
    .slice(0, DEFAULT_LIMIT)
    .map(
      (event) =>
        `> ${event.title}: ${event.tickets} ${event.tickets === 1 ? "ingresso" : "ingressos"} - ${formatCurrencyFromCents(event.amount)}`,
    );
  if (sortedEventSales.length > DEFAULT_LIMIT) {
    eventLines.push(`> Mais ${sortedEventSales.length - DEFAULT_LIMIT} eventos com compras não exibidos.`);
  }

  return {
    paid,
    issuedTickets,
    notUsed,
    totalSold,
    totalPotential,
    totalCapacity: activeSessionSeats.length,
    activeSessionIds,
    sectionLines,
    eventLines,
  };
}

function countExpiredOrCancelledReservations(
  reservations: ReservationRow[],
  period: AdminReportPeriod,
) {
  return reservations.filter(
    (reservation) =>
      (reservation.status === "expired" || reservation.status === "cancelled") &&
      isWithinPeriod(reservation.updated_at, period),
  ).length;
}

export async function buildAdminGeneralReport(period: AdminReportPeriod) {
  const [tickets, reservations, validations, courtesies, sessionSeats, ticketPrices] = await Promise.all([
    getTickets(),
    getReservations(),
    getValidations().catch(() => [] as ValidationRow[]),
    getCourtesies().catch(() => [] as CourtesyRow[]),
    getSessionSeats(),
    getActiveTicketPrices(),
  ]);
  const summary = buildCapacitySummary(tickets, sessionSeats, ticketPrices, period);
  const validationAllowed = validations.filter(
    (validation) => {
      const ticket = first(validation.tickets);
      return (
        validation.result === "allowed" &&
        Boolean(ticket && summary.activeSessionIds.has(ticket.session_id)) &&
        isWithinPeriod(validation.created_at, period)
      );
    },
  );
  const courtesyCount = courtesies.filter(
    (courtesy) =>
      summary.activeSessionIds.has(courtesy.session_id) &&
      isWithinPeriod(courtesy.created_at, period),
  ).length;
  const expiredOrCancelledCount = countExpiredOrCancelledReservations(
    reservations.filter((reservation) => summary.activeSessionIds.has(reservation.session_id)),
    period,
  );
  const hasSales = summary.paid.length > 0;
  const totalSalesLine = !hasSales
    ? null
    : summary.totalPotential > 0
      ? `> *Total vendido:* *${formatCurrencyFromCents(summary.totalSold)}* de *${formatCurrencyFromCents(summary.totalPotential)}* em capacidade ativa`
      : `> *Total vendido:* *${formatCurrencyFromCents(summary.totalSold)}*`;
  const totalTicketsLine = !hasSales
    ? null
    : summary.totalCapacity > 0
      ? `> *Total ingressos:* *${summary.paid.length} vendidos* de *${summary.totalCapacity} assentos ativos*`
      : formatReportCount("Total ingressos", summary.paid.length);
  const operationalLines = [
    courtesyCount > 0 ? formatReportCount("Cortesias emitidas", courtesyCount) : null,
    expiredOrCancelledCount > 0
      ? formatReportCount("Reservas expiradas/canceladas", expiredOrCancelledCount)
      : null,
    validationAllowed.length > 0
      ? formatReportCount("Check-ins realizados", validationAllowed.length)
      : null,
    summary.notUsed.length > 0
      ? formatReportCount("Ingressos não usados", summary.notUsed.length)
      : null,
  ].filter((line): line is string => line !== null);

  return [
    "*RESUMO GERAL*",
    `> Período: ${period.label}`,
    "",
    hasSales ? null : "Nenhuma venda no período.",
    totalSalesLine,
    totalTicketsLine,
    ...summary.sectionLines,
    summary.eventLines.length ? "" : null,
    summary.eventLines.length ? "*EVENTOS COM COMPRAS*" : null,
    ...summary.eventLines,
    operationalLines.length ? "" : null,
    ...operationalLines,
  ].filter((line): line is string => line !== null).join("\n");
}

export async function buildAdminDivisionReport(period: AdminReportPeriod) {
  const payments = await getApprovedPayments(period);
  const weeks = buildDivisionWeeks(period);
  const paidSettlements = await getPaidDivisionSettlements();
  const paidWeekKeys = new Set(
    weeks
      .filter((week) =>
        paidSettlements.some((settlement) =>
          settlement.period_key === week.key ||
          settlement.period_key.includes(week.key),
        ),
      )
      .map((week) => week.key),
  );
  const openWeeks = weeks.filter((week) => !paidWeekKeys.has(week.key));
  const openWeekKeys = new Set(openWeeks.map((week) => week.key));
  const allPaymentsByOrder = new Map<string, PaymentRow>();
  const openPaymentsByOrder = new Map<string, PaymentRow>();

  for (const payment of payments) {
    const current = allPaymentsByOrder.get(payment.order_id);
    const currentPaidAt = current?.paid_at ? new Date(current.paid_at).getTime() : 0;
    const nextPaidAt = payment.paid_at ? new Date(payment.paid_at).getTime() : 0;

    if (!current || nextPaidAt >= currentPaidAt) {
      allPaymentsByOrder.set(payment.order_id, payment);
    }

    const paymentWeek = weeks.find((week) =>
      isWithinIsoRange(payment.paid_at, week.from, week.to),
    );

    if (paymentWeek && openWeekKeys.has(paymentWeek.key)) {
      const openCurrent = openPaymentsByOrder.get(payment.order_id);
      const openCurrentPaidAt = openCurrent?.paid_at
        ? new Date(openCurrent.paid_at).getTime()
        : 0;
      if (!openCurrent || nextPaidAt >= openCurrentPaidAt) {
        openPaymentsByOrder.set(payment.order_id, payment);
      }
    }
  }

  const periodReceivedCents = [...allPaymentsByOrder.values()].reduce(
    (sum, payment) => sum + payment.amount_cents,
    0,
  );
  const totalReceivedCents = [...openPaymentsByOrder.values()].reduce(
    (sum, payment) => sum + payment.amount_cents,
    0,
  );
  const isBoundedPeriod = Boolean(period.from && period.to);
  const amountBasisCents = isBoundedPeriod ? totalReceivedCents : periodReceivedCents;
  const amountDueCents = Math.round((amountBasisCents * 5) / 100);
  const periodKey = `open:${openWeeks.map((week) => week.key).join("+") || getPeriodKey(period)}`;
  const settlement: AdminDivisionSettlementDraft = {
    periodKey,
    periodLabel: openWeeks.length === 1
      ? openWeeks[0].label
      : `${openWeeks.length} semanas em aberto`,
    periodFrom: openWeeks[0]?.from ?? period.from,
    periodTo: openWeeks[openWeeks.length - 1]?.to ?? period.to,
    totalReceivedCents,
    amountDueCents,
    orderCount: openPaymentsByOrder.size,
    weekCount: openWeeks.length,
  };

  if (period.compact) {
    return {
      text: [
        `> Total de compra no período: ${formatCurrencyFromCents(periodReceivedCents)}`,
        `> Valor a repassar (5%): ${formatCurrencyFromCents(amountDueCents)}`,
      ].join("\n"),
      settlement,
      canMarkPaid: false,
    };
  }

  const text = [
    "*DIVISÃO*",
    `> Período: ${period.label}`,
    period.compact ? null : "> Fechamento: toda sexta-feira",
    period.compact ? null : `> Semanas em aberto: ${openWeeks.length}`,
    period.compact ? null : `> Próximo fechamento: ${getNextFridayLabel()}`,
    "",
    `> Total de compra no período: ${formatCurrencyFromCents(periodReceivedCents)}`,
    `> Valor a repassar (5%): ${formatCurrencyFromCents(amountDueCents)}`,
    amountDueCents > 0 && isBoundedPeriod && !period.compact
      ? "\nDigite *BAIXAR* para marcar as semanas em aberto como pagas."
      : null,
    isBoundedPeriod && weeks.length > 0 && openWeeks.length === 0 && !period.compact
      ? "\nTodas as semanas deste período já foram baixadas."
      : null,
  ].filter(Boolean).join("\n");

  return {
    text,
    settlement,
    canMarkPaid: amountDueCents > 0 && isBoundedPeriod && openWeeks.length > 0 && !period.compact,
  };
}

async function buildAdminDivisionReportLegacy(period: AdminReportPeriod) {
  const payments = await getApprovedPayments(period);
  const paymentsByOrder = new Map<string, PaymentRow>();

  for (const payment of payments) {
    const current = paymentsByOrder.get(payment.order_id);
    const currentPaidAt = current?.paid_at ? new Date(current.paid_at).getTime() : 0;
    const nextPaidAt = payment.paid_at ? new Date(payment.paid_at).getTime() : 0;

    if (!current || nextPaidAt >= currentPaidAt) {
      paymentsByOrder.set(payment.order_id, payment);
    }
  }

  const totalReceivedCents = [...paymentsByOrder.values()].reduce(
    (sum, payment) => sum + payment.amount_cents,
    0,
  );
  const amountDueCents = Math.round((totalReceivedCents * 5) / 100);
  const periodKey = getPeriodKey(period);
  const existingSettlement = await getDivisionSettlement(periodKey);
  const settlement: AdminDivisionSettlementDraft = {
    periodKey,
    periodLabel: period.label,
    periodFrom: period.from,
    periodTo: period.to,
    totalReceivedCents,
    amountDueCents,
    orderCount: paymentsByOrder.size,
    weekCount: 1,
  };
  const isPaid = existingSettlement?.status === "paid";
  const isBoundedPeriod = Boolean(period.from && period.to);

  const text = [
    "*DIVISÃO*",
    `> Período: ${period.label}`,
    "> Base: pagamentos aprovados e pedidos pagos",
    "> Fechamento: toda sexta-feira",
    isPaid
      ? `> Status: pago em ${formatDateTime(existingSettlement.paid_at)}`
      : "> Status: pendente",
    `> Próximo fechamento: ${getNextFridayLabel()}`,
    "",
    `> Total recebido: ${formatCurrencyFromCents(totalReceivedCents)}`,
    `> Valor a pagar (5%): ${formatCurrencyFromCents(amountDueCents)}`,
    `> Pedidos considerados: ${paymentsByOrder.size}`,
    payments.length > paymentsByOrder.size
      ? `> Pagamentos duplicados ignorados: ${payments.length - paymentsByOrder.size}`
      : null,
    !isPaid && amountDueCents > 0 && isBoundedPeriod
      ? "\nDigite *BAIXAR* para marcar este fechamento como pago."
      : null,
    !isBoundedPeriod
      ? "\nPara dar baixa, escolha um período com data inicial e final."
      : null,
  ].filter(Boolean).join("\n");

  return {
    text,
    settlement,
    canMarkPaid: !isPaid && amountDueCents > 0 && isBoundedPeriod,
  };
}

function buildSalesEventReport(input: {
  event: EventRow | null;
  tickets: TicketRow[];
  reservations: ReservationRow[];
  validations: ValidationRow[];
  courtesies: CourtesyRow[];
  sessionSeats: SessionSeatRow[];
  ticketPrices: TicketPriceRow[];
  period: AdminReportPeriod;
}) {
  const summary = buildCapacitySummary(
    input.tickets,
    input.sessionSeats,
    input.ticketPrices,
    input.period,
    { describeSpecialOffer: true, activeSalesOnly: false, includeZeroSections: true },
  );
  const validationAllowed = input.validations.filter((validation) => {
    const ticket = first(validation.tickets);
    return (
      isWithinPeriod(validation.created_at, input.period) &&
      validation.result === "allowed" &&
      Boolean(ticket && summary.activeSessionIds.has(ticket.session_id))
    );
  });
  const courtesyCount = input.courtesies.filter(
    (courtesyRow) =>
      summary.activeSessionIds.has(courtesyRow.session_id) &&
      isWithinPeriod(courtesyRow.created_at, input.period),
  ).length;
  const expiredOrCancelledCount = countExpiredOrCancelledReservations(
    input.reservations.filter((reservation) =>
      summary.activeSessionIds.has(reservation.session_id),
    ),
    input.period,
  );

  return [
    ...reportHeader("*VENDAS POR EVENTO*", input.event, input.period),
    "",
    summary.totalPotential > 0
      ? `> *Total vendido:* *${formatCurrencyFromCents(summary.totalSold)}* de *${formatCurrencyFromCents(summary.totalPotential)}* em capacidade cadastrada`
      : `> *Total vendido:* *${formatCurrencyFromCents(summary.totalSold)}*`,
    summary.totalCapacity > 0
      ? `> *Total ingressos:* *${summary.paid.length} vendidos* de *${summary.totalCapacity} lugares cadastrados*`
      : formatReportCount("Total ingressos", summary.paid.length),
    ...summary.sectionLines,
    courtesyCount > 0 ? formatReportCount("Cortesias emitidas", courtesyCount) : null,
    expiredOrCancelledCount > 0
      ? formatReportCount("Reservas expiradas/canceladas", expiredOrCancelledCount)
      : null,
    validationAllowed.length > 0
      ? formatReportCount("Check-ins realizados", validationAllowed.length)
      : null,
    formatReportCount("Ingressos não usados", summary.notUsed.length),
  ].filter((line): line is string => line !== null).join("\n");
}

function getEventIdFromSessionRelation(value: MaybeArray<{ event_id: string }>) {
  return first(value)?.event_id ?? null;
}

export async function buildAdminSalesEventReports(input: {
  eventIds: string[];
  period: AdminReportPeriod;
}) {
  const eventIds = [...new Set(input.eventIds)].slice(0, 3);
  if (!eventIds.length) return [];

  const [events, tickets, reservations, validations, courtesies, sessionSeats, ticketPrices] =
    await Promise.all([
      getEvents(eventIds),
      getTickets(eventIds),
      getReservations(eventIds),
      getValidations(eventIds).catch(() => [] as ValidationRow[]),
      getCourtesies(eventIds).catch(() => [] as CourtesyRow[]),
      getSessionSeats(eventIds),
      getActiveTicketPrices(eventIds),
    ]);

  const eventById = new Map(events.map((event) => [event.id, event]));
  return eventIds
    .filter((eventId) => eventById.has(eventId))
    .map((eventId) => buildSalesEventReport({
      event: eventById.get(eventId) ?? null,
      tickets: tickets.filter((ticket) =>
        getEventIdFromSessionRelation(ticket.event_sessions) === eventId,
      ),
      reservations: reservations.filter((reservation) =>
        getEventIdFromSessionRelation(reservation.event_sessions) === eventId,
      ),
      validations: validations.filter((validation) => {
        const ticket = first(validation.tickets);
        return getEventIdFromSessionRelation(ticket?.event_sessions) === eventId;
      }),
      courtesies: courtesies.filter((courtesy) => courtesy.event_id === eventId),
      sessionSeats: sessionSeats.filter((seat) =>
        getEventIdFromSessionRelation(seat.event_sessions) === eventId,
      ),
      ticketPrices: ticketPrices.filter((price) =>
        getEventIdFromSessionRelation(price.event_sessions) === eventId,
      ),
      period: input.period,
    }));
}

export async function buildAdminReport(input: {
  eventId: string;
  type: Exclude<AdminReportType, "summary" | "division">;
  period: AdminReportPeriod;
}) {
  const [event, tickets, reservations, validations, courtesies, sessionSeats, ticketPrices] =
    await Promise.all([
      getEvent(input.eventId),
      getTickets(input.eventId),
      getReservations(input.eventId),
      getValidations(input.eventId).catch(() => [] as ValidationRow[]),
      getCourtesies(input.eventId).catch(() => [] as CourtesyRow[]),
      getSessionSeats(input.eventId),
      getActiveTicketPrices(input.eventId),
    ]);

  const paid = paidTickets(tickets, input.period);
  const courtesy = courtesyTickets(tickets, input.period);
  const periodValidations = validations.filter((validation) =>
    isWithinPeriod(validation.created_at, input.period),
  );

  if (input.type === "sales_event") {
    const summary = buildCapacitySummary(
      tickets,
      sessionSeats,
      ticketPrices,
      input.period,
      { describeSpecialOffer: true, activeSalesOnly: false, includeZeroSections: true },
    );
    const validationAllowed = periodValidations.filter(
      (validation) => {
        const ticket = first(validation.tickets);
        return (
          validation.result === "allowed" &&
          Boolean(ticket && summary.activeSessionIds.has(ticket.session_id))
        );
      },
    );
    const courtesyCount = courtesies.filter(
      (courtesyRow) =>
        summary.activeSessionIds.has(courtesyRow.session_id) &&
        isWithinPeriod(courtesyRow.created_at, input.period),
    ).length;
    const expiredOrCancelledCount = countExpiredOrCancelledReservations(
      reservations.filter((reservation) => summary.activeSessionIds.has(reservation.session_id)),
      input.period,
    );

    return [
      ...reportHeader("*VENDAS POR EVENTO*", event, input.period),
      "",
      summary.totalPotential > 0
        ? `> *Total vendido:* *${formatCurrencyFromCents(summary.totalSold)}* de *${formatCurrencyFromCents(summary.totalPotential)}* em capacidade cadastrada`
        : `> *Total vendido:* *${formatCurrencyFromCents(summary.totalSold)}*`,
      summary.totalCapacity > 0
        ? `> *Total ingressos:* *${summary.paid.length} vendidos* de *${summary.totalCapacity} lugares cadastrados*`
        : formatReportCount("Total ingressos", summary.paid.length),
      ...summary.sectionLines,
      courtesyCount > 0 ? formatReportCount("Cortesias emitidas", courtesyCount) : null,
      expiredOrCancelledCount > 0
        ? formatReportCount("Reservas expiradas/canceladas", expiredOrCancelledCount)
        : null,
      validationAllowed.length > 0
        ? formatReportCount("Check-ins realizados", validationAllowed.length)
        : null,
      formatReportCount("Ingressos não usados", summary.notUsed.length),
    ].filter((line): line is string => line !== null).join("\n");
  }

  if (input.type === "sales_section") {
    const bySection = new Map<
      string,
      { paid: number; totalAmount: number; courtesies: number; available: number; used: number; unused: number }
    >();
    for (const seat of sessionSeats) {
      const section = getSectionName(seat);
      const current = bySection.get(section) ?? {
        paid: 0,
        totalAmount: 0,
        courtesies: 0,
        available: 0,
        used: 0,
        unused: 0,
      };
      if (seat.status === "available") current.available += 1;
      bySection.set(section, current);
    }
    for (const ticket of [...paid, ...courtesy]) {
      const section = getSectionName(ticket);
      const current = bySection.get(section) ?? {
        paid: 0,
        totalAmount: 0,
        courtesies: 0,
        available: 0,
        used: 0,
        unused: 0,
      };
      const isCourtesy = first(ticket.reservation_items)?.ticket_type === "free";
      if (isCourtesy) {
        current.courtesies += 1;
      } else {
        current.paid += 1;
        current.totalAmount += getTicketAmount(ticket);
      }
      if (ticket.status === "used") current.used += 1;
      if (ticket.status === "issued") current.unused += 1;
      bySection.set(section, current);
    }

    return [
      ...reportHeader("VENDAS POR SETOR", event, input.period),
      ...([...bySection.entries()].slice(0, DEFAULT_LIMIT).map(
        ([section, values], index) =>
          [
            `${index + 1}. ${section}`,
            `> Pagos emitidos: ${values.paid}`,
            `> Valor vendido: ${formatCurrencyFromCents(values.totalAmount)}`,
            `> Cortesias emitidas: ${values.courtesies}`,
            `> Disponíveis restantes: ${values.available}`,
            `> Usados: ${values.used}`,
            `> Não usados: ${values.unused}`,
          ].join("\n"),
      )),
      bySection.size > DEFAULT_LIMIT ? `Mais ${bySection.size - DEFAULT_LIMIT} setores não exibidos.` : null,
      bySection.size ? null : "Nenhum setor encontrado neste período.",
    ].filter(Boolean).join("\n");
  }

  if (input.type === "pending_payments") {
    const pending = reservations.filter(
      (reservation) =>
        reservation.status === "active" &&
        first(reservation.orders)?.status === "pending_payment" &&
        isWithinPeriod(reservation.created_at, input.period),
    );

    return [
      ...reportHeader("PAGAMENTOS PENDENTES", event, input.period),
      ...(pending.length
        ? pending.slice(0, DEFAULT_LIMIT).map((reservation, index) =>
            [
              `${index + 1}. ${first(first(reservation.event_sessions)?.events)?.title ?? event?.title ?? "Evento"}`,
              `> Telefone: ${maskPhone(first(reservation.customers)?.whatsapp_phone)}`,
              `> Quantidade: ${getReservationQuantity(reservation)}`,
              `> Total: ${formatCurrencyFromCents(reservation.total_amount_cents + reservation.total_fee_cents)}`,
              `> Expira em: ${formatDateTime(reservation.expires_at)}`,
              `> Status: pending_payment`,
            ].join("\n"),
          )
        : ["Nenhum pagamento pendente neste período."]),
      pending.length > DEFAULT_LIMIT ? `Mais ${pending.length - DEFAULT_LIMIT} pendências não exibidas.` : null,
    ].filter(Boolean).join("\n");
  }

  if (input.type === "expired_cancelled_reservations") {
    const items = reservations.filter(
      (reservation) =>
        (reservation.status === "expired" || reservation.status === "cancelled") &&
        isWithinPeriod(reservation.updated_at, input.period),
    );

    return [
      ...reportHeader("RESERVAS EXPIRADAS/CANCELADAS", event, input.period),
      ...(items.length
        ? items.slice(0, DEFAULT_LIMIT).map((reservation, index) =>
            [
              `${index + 1}. ${event?.title ?? "Evento"}`,
              `> Telefone: ${maskPhone(first(reservation.customers)?.whatsapp_phone)}`,
              `> Quantidade: ${getReservationQuantity(reservation)}`,
              `> Valor: ${formatCurrencyFromCents(reservation.total_amount_cents + reservation.total_fee_cents)}`,
              `> Status: ${reservation.status}`,
              `> Atualizado em: ${formatDateTime(reservation.updated_at)}`,
            ].join("\n"),
          )
        : ["Nenhuma reserva expirada/cancelada neste período."]),
      items.length > DEFAULT_LIMIT ? `Mais ${items.length - DEFAULT_LIMIT} reservas não exibidas.` : null,
    ].filter(Boolean).join("\n");
  }

  if (input.type === "gate_checkins") {
    const allowed = periodValidations.filter((validation) => validation.result === "allowed");
    const alreadyUsed = periodValidations.filter((validation) => validation.result === "already_used");
    const denied = periodValidations.filter(
      (validation) => validation.result !== "allowed" && validation.result !== "already_used",
    );

    return [
      ...reportHeader("CHECK-INS DA PORTARIA", event, input.period),
      `> Validados: ${allowed.length}`,
      `> Recusados: ${denied.length}`,
      `> Already used: ${alreadyUsed.length}`,
      ...periodValidations.slice(0, DEFAULT_LIMIT).map((validation, index) =>
        [
          `${index + 1}. ${validation.result}`,
          `> Código: ${validation.ticket_code ?? "Não informado"}`,
          `> Horário: ${formatDateTime(validation.created_at)}`,
          `> Validador: ${maskPhone(validation.validator_identifier ?? validation.gate_label)}`,
        ].join("\n"),
      ),
      periodValidations.length > DEFAULT_LIMIT ? `Mais ${periodValidations.length - DEFAULT_LIMIT} validações não exibidas.` : null,
    ].filter(Boolean).join("\n");
  }

  if (input.type === "ticket_usage") {
    const periodTickets = tickets.filter(
      (ticket) =>
        isWithinPeriod(ticket.issued_at, input.period) ||
        isWithinPeriod(ticket.used_at, input.period) ||
        isWithinPeriod(ticket.cancelled_at, input.period),
    );
    const issued = periodTickets.filter((ticket) => ticket.status !== "cancelled");
    const usedTickets = periodTickets.filter((ticket) => ticket.status === "used");
    const cancelled = periodTickets.filter((ticket) => ticket.status === "cancelled");
    const attendance = issued.length ? Math.round((usedTickets.length / issued.length) * 100) : 0;

    return [
      ...reportHeader("INGRESSOS USADOS E NÃO USADOS", event, input.period),
      `> Emitidos: ${issued.length}`,
      `> Usados: ${usedTickets.length}`,
      `> Não usados: ${Math.max(issued.length - usedTickets.length, 0)}`,
      `> Cancelados: ${cancelled.length}`,
      `> Comparecimento: ${attendance}%`,
    ].join("\n");
  }

  const periodCourtesies = courtesies.filter(
    (courtesyRow) =>
      isWithinPeriod(courtesyRow.created_at, input.period) ||
      isWithinPeriod(courtesyRow.cancelled_at, input.period) ||
      isWithinPeriod(first(courtesyRow.tickets)?.used_at, input.period),
  );
  const usedCourtesies = periodCourtesies.filter((courtesyRow) => first(courtesyRow.tickets)?.status === "used");
  const cancelledCourtesies = periodCourtesies.filter((courtesyRow) => courtesyRow.status === "cancelled");
  const activeCourtesies = periodCourtesies.filter((courtesyRow) => courtesyRow.status !== "cancelled");

  return [
    ...reportHeader("CORTESIAS", event, input.period),
    `> Emitidas: ${periodCourtesies.length}`,
    `> Usadas: ${usedCourtesies.length}`,
    `> Não usadas: ${Math.max(activeCourtesies.length - usedCourtesies.length, 0)}`,
    `> Canceladas: ${cancelledCourtesies.length}`,
    ...periodCourtesies.slice(0, DEFAULT_LIMIT).map((courtesyRow, index) =>
      [
        `${index + 1}. ${courtesyRow.beneficiary_name ?? "Beneficiário"}`,
        `> Telefone: ${maskPhone(courtesyRow.phone)}`,
        `> Status: ${courtesyRow.status}`,
        courtesyRow.reason ? `> Motivo: ${courtesyRow.reason}` : null,
      ].filter(Boolean).join("\n"),
    ),
    periodCourtesies.length > DEFAULT_LIMIT ? `Mais ${periodCourtesies.length - DEFAULT_LIMIT} cortesias não exibidas.` : null,
  ].filter(Boolean).join("\n");
}
