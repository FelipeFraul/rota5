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
  event_sessions: MaybeArray<{ event_id: string; starts_at: string }>;
  venue_sections: MaybeArray<{ id: string; name: string }>;
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
  }>;
  customers: MaybeArray<{
    whatsapp_phone: string | null;
    name: string | null;
  }>;
};

type ReservationRow = {
  id: string;
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
  status: string;
  phone: string;
  beneficiary_name: string | null;
  reason: string | null;
  created_at: string;
  cancelled_at: string | null;
  tickets: MaybeArray<{ status: string; used_at: string | null; ticket_code: string }>;
};

type SessionSeatRow = {
  session_id: string;
  section_id: string;
  status: string;
  event_sessions: MaybeArray<{ event_id: string }>;
  venue_sections: MaybeArray<{ name: string }>;
};

type TicketPriceRow = {
  session_id: string;
  section_id: string;
  ticket_type: string;
  price_cents: number;
  fee_cents: number;
  status: string;
  label: string;
  event_sessions?: MaybeArray<{ event_id: string }>;
  venue_sections?: MaybeArray<{ name: string }>;
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

function reportHeader(title: string, event: EventRow | null, period: AdminReportPeriod) {
  return [
    title,
    event ? `Evento: ${event.title}` : null,
    event ? `> Local: ${getEventLocation(event)}` : null,
    `> Período: ${period.label}`,
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

async function getTickets(eventId?: string) {
  let query = getSupabaseAdmin()
    .from("tickets")
    .select(
      "id, ticket_code, status, issued_at, used_at, cancelled_at, order_id, event_sessions!inner(event_id, starts_at), venue_sections(id, name), reservation_items(ticket_type, price_cents, fee_cents, seat_code), orders(status, created_at, total_amount_cents, total_fee_cents), customers(whatsapp_phone, name)",
    );

  if (eventId) query = query.eq("event_sessions.event_id", eventId);

  const { data, error } = await query.returns<TicketRow[]>();
  if (error) throw error;
  return data ?? [];
}

async function getReservations(eventId?: string) {
  let query = getSupabaseAdmin()
    .from("reservations")
    .select(
      "id, status, expires_at, created_at, updated_at, total_amount_cents, total_fee_cents, event_sessions!inner(event_id, starts_at, events(title)), customers(whatsapp_phone), orders(status), reservation_items(seat_code, venue_sections(name))",
    );

  if (eventId) query = query.eq("event_sessions.event_id", eventId);

  const { data, error } = await query.returns<ReservationRow[]>();
  if (error) throw error;
  return data ?? [];
}

async function getValidations(eventId?: string) {
  let query = getSupabaseAdmin()
    .from("ticket_validation_events")
    .select(
      "result, ticket_code, gate_label, validator_identifier, created_at, tickets!inner(id, session_id, event_sessions!inner(event_id), venue_sections(name))",
    );

  if (eventId) query = query.eq("tickets.event_sessions.event_id", eventId);

  const { data, error } = await query.returns<ValidationRow[]>();
  if (error) throw error;
  return data ?? [];
}

async function getCourtesies(eventId?: string) {
  let query = getSupabaseAdmin()
    .from("courtesies")
    .select(
      "status, phone, beneficiary_name, reason, created_at, cancelled_at, tickets(status, used_at, ticket_code)",
    );

  if (eventId) query = query.eq("event_id", eventId);

  const { data, error } = await query.returns<CourtesyRow[]>();
  if (error) throw error;
  return data ?? [];
}

async function getSessionSeats(eventId?: string) {
  let query = getSupabaseAdmin()
    .from("session_seats")
    .select("session_id, section_id, status, event_sessions!inner(event_id), venue_sections(name)");

  if (eventId) query = query.eq("event_sessions.event_id", eventId);

  const { data, error } = await query.returns<SessionSeatRow[]>();

  if (error) throw error;
  return data ?? [];
}

async function getActiveTicketPrices(eventId?: string) {
  let query = getSupabaseAdmin()
    .from("ticket_prices")
    .select(
      "session_id, section_id, ticket_type, label, price_cents, fee_cents, status, event_sessions!inner(event_id), venue_sections(name)",
    )
    .eq("status", "active")
    .neq("ticket_type", "free");

  if (eventId) query = query.eq("event_sessions.event_id", eventId);

  const { data, error } = await query.returns<TicketPriceRow[]>();

  if (error) throw error;
  return data ?? [];
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
    (ticket) =>
      first(ticket.orders)?.status === "paid" &&
      first(ticket.reservation_items)?.ticket_type !== "free" &&
      ticket.status !== "cancelled" &&
      isWithinPeriod(first(ticket.orders)?.created_at ?? ticket.issued_at, period),
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
  { describeSpecialOffer = false }: { describeSpecialOffer?: boolean } = {},
) {
  const paid = paidTickets(tickets, period);
  const issuedTickets = tickets.filter(
    (ticket) => ticket.status === "issued" || ticket.status === "used",
  );
  const notUsed = issuedTickets.filter((ticket) => ticket.status === "issued");
  const totalSold = paid.reduce((sum, ticket) => sum + getTicketAmount(ticket), 0);

  const maximumPriceBySessionSection = new Map<string, number>();
  for (const price of ticketPrices) {
    const key = `${price.session_id}:${price.section_id}`;
    const amount = price.price_cents + price.fee_cents;
    maximumPriceBySessionSection.set(
      key,
      Math.max(maximumPriceBySessionSection.get(key) ?? 0, amount),
    );
  }

  const capacityBySection = new Map<string, { section: string; capacity: number }>();
  let totalPotential = 0;
  for (const seat of sessionSeats) {
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
    ticketPrices
      .filter((price) => first(price.venue_sections)?.name === "Assento / item especial")
      .map((price) => [price.section_id, price.label.trim()]),
  );

  const sectionLines = [...capacityBySection.entries()]
    .sort(([, valueA], [, valueB]) => compareSummarySections(valueA.section, valueB.section))
    .map(
      ([key, { section, capacity }]) => {
        const specialSectionId = key.startsWith("special:") ? key.slice("special:".length) : null;
        const specialLabel = specialSectionId
          ? specialLabelBySection.get(specialSectionId)
          : null;
        const label =
          section === "Assento / item especial" && describeSpecialOffer && specialLabel
            ? specialLabel.charAt(0).toLocaleUpperCase("pt-BR") + specialLabel.slice(1)
            : formatSummarySectionName(section);
        return `> ${label}: ${soldBySection.get(key) ?? 0} - ${capacity}`;
      },
    );

  return {
    paid,
    issuedTickets,
    notUsed,
    totalSold,
    totalPotential,
    sectionLines,
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
    (validation) =>
      validation.result === "allowed" && isWithinPeriod(validation.created_at, period),
  );
  return [
    "*RESUMO GERAL*",
    `> Período: ${period.label}`,
    "",
    `> Total vendidos: ${formatCurrencyFromCents(summary.totalSold)} - ${formatCurrencyFromCents(summary.totalPotential)}`,
    `> Total ingressos: ${summary.paid.length} - ${sessionSeats.length}`,
    ...summary.sectionLines,
    `> Cortesias emitidas: ${courtesies.filter((courtesy) => isWithinPeriod(courtesy.created_at, period)).length}`,
    `> Reservas expiradas/canceladas: ${countExpiredOrCancelledReservations(reservations, period)}`,
    `> Check-ins realizados: ${validationAllowed.length} - ${summary.issuedTickets.length}`,
    `> Ingressos não usados: ${summary.notUsed.length} - ${summary.issuedTickets.length}`,
  ].join("\n");
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
      { describeSpecialOffer: true },
    );
    const validationAllowed = periodValidations.filter(
      (validation) => validation.result === "allowed",
    );

    return [
      ...reportHeader("*VENDAS POR EVENTO*", event, input.period),
      "",
      `> Total vendidos: ${formatCurrencyFromCents(summary.totalSold)} - ${formatCurrencyFromCents(summary.totalPotential)}`,
      `> Total ingressos: ${summary.paid.length} - ${sessionSeats.length}`,
      ...summary.sectionLines,
      `> Cortesias emitidas: ${courtesies.filter((courtesyRow) => isWithinPeriod(courtesyRow.created_at, input.period)).length}`,
      `> Reservas expiradas/canceladas: ${countExpiredOrCancelledReservations(reservations, input.period)}`,
      `> Check-ins realizados: ${validationAllowed.length} - ${summary.issuedTickets.length}`,
      `> Ingressos não usados: ${summary.notUsed.length} - ${summary.issuedTickets.length}`,
    ].join("\n");
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
