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
  | "courtesies";

export type AdminReportPeriod = {
  label: string;
  from?: string;
  to?: string;
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
};

const SAO_PAULO_TIME_ZONE = "America/Sao_Paulo";
const DEFAULT_LIMIT = 10;
const BLACK_HOUSE_SECTION_ORDER = new Map([
  ["Cadeira Individual (TODOS pagam meia)", 0],
  ["1ª FILEIRA (com balcão)", 1],
  ["Poltrona+Mesa 2 lugares", 2],
  ["Poltrona+Mesa 4 lugares", 3],
  ["Cadeira Individual (Inteira)", 4],
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

function getTicketAmount(ticket: TicketRow) {
  const item = first(ticket.reservation_items);
  return (item?.price_cents ?? 0) + (item?.fee_cents ?? 0);
}

function getSectionName(ticket: TicketRow | SessionSeatRow) {
  return first(ticket.venue_sections)?.name ?? "Sem setor";
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

async function getActiveTicketPrices() {
  const { data, error } = await getSupabaseAdmin()
    .from("ticket_prices")
    .select("session_id, section_id, ticket_type, price_cents, fee_cents, status")
    .eq("status", "active")
    .neq("ticket_type", "free")
    .returns<TicketPriceRow[]>();

  if (error) throw error;
  return data ?? [];
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

export async function buildAdminGeneralReport(period: AdminReportPeriod) {
  const [tickets, validations, courtesies, sessionSeats, ticketPrices] = await Promise.all([
    getTickets(),
    getValidations().catch(() => [] as ValidationRow[]),
    getCourtesies().catch(() => [] as CourtesyRow[]),
    getSessionSeats(),
    getActiveTicketPrices(),
  ]);
  const paid = paidTickets(tickets, period);
  const validationAllowed = validations.filter(
    (validation) =>
      validation.result === "allowed" && isWithinPeriod(validation.created_at, period),
  );
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

  const capacityBySection = new Map<string, number>();
  let totalPotential = 0;
  for (const seat of sessionSeats) {
    const section = getSectionName(seat);
    capacityBySection.set(section, (capacityBySection.get(section) ?? 0) + 1);
    totalPotential +=
      maximumPriceBySessionSection.get(`${seat.session_id}:${seat.section_id}`) ?? 0;
  }

  const soldBySection = new Map<string, number>();
  for (const ticket of paid) {
    const section = getSectionName(ticket);
    soldBySection.set(section, (soldBySection.get(section) ?? 0) + 1);
  }

  const sectionLines = [...capacityBySection.entries()]
    .sort(([sectionA], [sectionB]) => {
      const orderA = BLACK_HOUSE_SECTION_ORDER.get(sectionA);
      const orderB = BLACK_HOUSE_SECTION_ORDER.get(sectionB);
      if (orderA !== undefined || orderB !== undefined) {
        return (orderA ?? Number.MAX_SAFE_INTEGER) - (orderB ?? Number.MAX_SAFE_INTEGER);
      }
      return sectionA.localeCompare(sectionB, "pt-BR");
    })
    .map(
      ([section, capacity]) =>
        `> ${section}: ${soldBySection.get(section) ?? 0} - ${capacity}`,
    );

  return [
    "RESUMO GERAL",
    `> Período: ${period.label}`,
    "",
    `> Total vendidos: ${formatCurrencyFromCents(totalSold)} - ${formatCurrencyFromCents(totalPotential)}`,
    `> Total ingressos: ${paid.length} - ${sessionSeats.length}`,
    ...sectionLines,
    `> Cortesias emitidas: ${courtesies.filter((courtesy) => isWithinPeriod(courtesy.created_at, period)).length}`,
    `> Check-ins realizados: ${validationAllowed.length} - ${issuedTickets.length}`,
    `> Ingressos não usados: ${notUsed.length} - ${issuedTickets.length}`,
  ].join("\n");
}

export async function buildAdminReport(input: {
  eventId: string;
  type: Exclude<AdminReportType, "summary">;
  period: AdminReportPeriod;
}) {
  const [event, tickets, reservations, validations, courtesies, sessionSeats] =
    await Promise.all([
      getEvent(input.eventId),
      getTickets(input.eventId),
      getReservations(input.eventId),
      getValidations(input.eventId).catch(() => [] as ValidationRow[]),
      getCourtesies(input.eventId).catch(() => [] as CourtesyRow[]),
      getSessionSeats(input.eventId),
    ]);

  const paid = paidTickets(tickets, input.period);
  const courtesy = courtesyTickets(tickets, input.period);
  const used = tickets.filter((ticket) => isWithinPeriod(ticket.used_at, input.period));
  const periodValidations = validations.filter((validation) =>
    isWithinPeriod(validation.created_at, input.period),
  );

  if (input.type === "sales_event") {
    const revenue = paid.reduce((sum, ticket) => sum + getTicketAmount(ticket), 0);
    const paidOrderIds = new Set(paid.map((ticket) => ticket.order_id));
    const activeReservations = reservations.filter((reservation) => reservation.status === "active");
    const inactiveReservations = reservations.filter(
      (reservation) =>
        (reservation.status === "expired" || reservation.status === "cancelled") &&
        isWithinPeriod(reservation.updated_at, input.period),
    );

    return [
      ...reportHeader("VENDAS POR EVENTO", event, input.period),
      `> Valor vendido bruto: ${formatCurrencyFromCents(revenue)}`,
      `> Pedidos pagos: ${paidOrderIds.size}`,
      `> Ingressos vendidos: ${paid.length}`,
      `> Cortesias emitidas: ${courtesy.length}`,
      `> Reservas ativas: ${activeReservations.length}`,
      `> Reservas expiradas/canceladas: ${inactiveReservations.length}`,
      `> Ingressos usados: ${used.length}`,
      `> Ingressos não usados: ${Math.max(paid.length + courtesy.length - used.length, 0)}`,
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
