import "server-only";

import { getSupabaseAdmin } from "@/lib/supabase/admin";

type MaybeArray<T> = T | T[] | null | undefined;

export type AdminReportType =
  | "sales_event"
  | "sales_section"
  | "expired_reservations"
  | "gate_checkins"
  | "ticket_usage"
  | "summary";

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
  venues: MaybeArray<{ name: string }>;
};

type TicketRow = {
  id: string;
  ticket_code: string;
  status: string;
  issued_at: string;
  used_at: string | null;
  cancelled_at: string | null;
  order_id: string;
  event_sessions: MaybeArray<{ event_id: string }>;
  venue_sections: MaybeArray<{ name: string }>;
  reservation_items: MaybeArray<{
    ticket_type: string;
    price_cents: number;
    fee_cents: number;
  }>;
  orders: MaybeArray<{
    status: string;
    created_at: string;
    total_amount_cents: number;
    total_fee_cents: number;
  }>;
};

type ReservationRow = {
  id: string;
  status: string;
  expires_at: string;
  created_at: string;
  total_amount_cents: number;
  total_fee_cents: number;
  event_sessions: MaybeArray<{ event_id: string }>;
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

const SAO_PAULO_TIME_ZONE = "America/Sao_Paulo";

function first<T>(value: MaybeArray<T>): T | null {
  if (Array.isArray(value)) return value[0] ?? null;
  return value ?? null;
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

function isWithinPeriod(value: string | null | undefined, period: AdminReportPeriod) {
  if (!value) return false;
  const date = new Date(value).getTime();
  if (!Number.isFinite(date)) return false;
  if (period.from && date < new Date(period.from).getTime()) return false;
  if (period.to && date > new Date(period.to).getTime()) return false;
  return true;
}

function getSectionName(ticket: TicketRow) {
  return first(ticket.venue_sections)?.name ?? "Sem setor";
}

function getTicketAmount(ticket: TicketRow) {
  const item = first(ticket.reservation_items);
  return (item?.price_cents ?? 0) + (item?.fee_cents ?? 0);
}

function getEventLocation(event: EventRow | null) {
  if (!event) return "";
  const venue = first(event.venues)?.name;
  return [venue, `${event.city}/${event.state}`].filter(Boolean).join(" - ");
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

async function getEventTickets(eventId: string) {
  const { data, error } = await getSupabaseAdmin()
    .from("tickets")
    .select(
      "id, ticket_code, status, issued_at, used_at, cancelled_at, order_id, event_sessions!inner(event_id), venue_sections(name), reservation_items(ticket_type, price_cents, fee_cents), orders(status, created_at, total_amount_cents, total_fee_cents)",
    )
    .eq("event_sessions.event_id", eventId)
    .returns<TicketRow[]>();

  if (error) throw error;
  return data ?? [];
}

async function getExpiredReservations(eventId: string) {
  const { data, error } = await getSupabaseAdmin()
    .from("reservations")
    .select(
      "id, status, expires_at, created_at, total_amount_cents, total_fee_cents, event_sessions!inner(event_id), customers(whatsapp_phone), orders(status), reservation_items(seat_code, venue_sections(name))",
    )
    .eq("event_sessions.event_id", eventId)
    .returns<ReservationRow[]>();

  if (error) throw error;
  const now = Date.now();
  return (data ?? []).filter(
    (reservation) =>
      reservation.status === "expired" ||
      (reservation.status === "active" &&
        new Date(reservation.expires_at).getTime() <= now),
  );
}

async function getGateValidations(eventId: string) {
  const { data, error } = await getSupabaseAdmin()
    .from("ticket_validation_events")
    .select(
      "result, ticket_code, gate_label, validator_identifier, created_at, tickets!inner(id, session_id, event_sessions!inner(event_id), venue_sections(name))",
    )
    .eq("tickets.event_sessions.event_id", eventId)
    .returns<ValidationRow[]>();

  if (error) throw error;
  return data ?? [];
}

function reportHeader(title: string, event: EventRow | null, period: AdminReportPeriod) {
  return [
    title,
    event ? `> Evento: ${event.title}` : null,
    event ? `> Local: ${getEventLocation(event)}` : null,
    `> Período: ${period.label}`,
  ].filter(Boolean) as string[];
}

function gateCheckinsReportHeader(
  title: string,
  event: EventRow | null,
  period: AdminReportPeriod,
) {
  return [
    title,
    event ? `Evento: ${event.title}` : null,
    `> Período: ${period.label}`,
  ].filter(Boolean) as string[];
}

function compactEventReportHeader(
  title: string,
  event: EventRow | null,
  period: AdminReportPeriod,
) {
  return [
    title,
    event ? `Evento: ${event.title}` : null,
    `> Período: ${period.label}`,
  ].filter(Boolean) as string[];
}

export async function buildAdminReport(input: {
  eventId: string;
  type: AdminReportType;
  period: AdminReportPeriod;
}) {
  const [event, tickets, expiredReservations, validations] = await Promise.all([
    getEvent(input.eventId),
    getEventTickets(input.eventId),
    getExpiredReservations(input.eventId),
    getGateValidations(input.eventId).catch(() => [] as ValidationRow[]),
  ]);

  const soldTickets = tickets.filter(
    (ticket) =>
      ticket.status !== "cancelled" &&
      first(ticket.reservation_items)?.ticket_type !== "free" &&
      isWithinPeriod(first(ticket.orders)?.created_at ?? ticket.issued_at, input.period),
  );
  const courtesyTickets = tickets.filter(
    (ticket) =>
      first(ticket.reservation_items)?.ticket_type === "free" &&
      isWithinPeriod(ticket.issued_at, input.period),
  );
  const usedTickets = tickets.filter((ticket) =>
    isWithinPeriod(ticket.used_at, input.period),
  );
  const periodExpiredReservations = expiredReservations.filter((reservation) =>
    isWithinPeriod(reservation.expires_at, input.period),
  );
  const periodValidations = validations.filter((validation) =>
    isWithinPeriod(validation.created_at, input.period),
  );

  if (input.type === "sales_event") {
    const totalAmount = soldTickets.reduce(
      (sum, ticket) => sum + getTicketAmount(ticket),
      0,
    );

    return [
      ...reportHeader("VENDAS POR EVENTO", event, input.period),
      `> Ingressos vendidos: ${soldTickets.length}`,
      `> Cortesias emitidas: ${courtesyTickets.length}`,
      `> Receita: ${formatCurrencyFromCents(totalAmount)}`,
      `> Ingressos usados: ${usedTickets.length}`,
      `> Ingressos não usados: ${Math.max(soldTickets.length + courtesyTickets.length - usedTickets.length, 0)}`,
    ].join("\n");
  }

  if (input.type === "sales_section") {
    const bySection = new Map<
      string,
      { sold: number; courtesies: number; totalIssued: number; totalAmount: number; used: number }
    >();
    for (const ticket of [...soldTickets, ...courtesyTickets]) {
      const section = getSectionName(ticket);
      const current = bySection.get(section) ?? {
        sold: 0,
        courtesies: 0,
        totalIssued: 0,
        totalAmount: 0,
        used: 0,
      };
      const isCourtesy = first(ticket.reservation_items)?.ticket_type === "free";
      if (isCourtesy) {
        current.courtesies += 1;
      } else {
        current.sold += 1;
        current.totalAmount += getTicketAmount(ticket);
      }
      current.totalIssued += 1;
      if (ticket.used_at && isWithinPeriod(ticket.used_at, input.period)) {
        current.used += 1;
      }
      bySection.set(section, current);
    }

    return [
      ...reportHeader("VENDAS POR SETOR", event, input.period),
      ...(bySection.size
        ? [...bySection.entries()].map(
            ([section, values], index) =>
              [
                `${index + 1}. ${section}`,
                `> Vendidos: ${values.sold}`,
                `> Cortesias: ${values.courtesies}`,
                `> Emitidos: ${values.totalIssued}`,
                `> Usados: ${values.used}`,
                `> Receita: ${formatCurrencyFromCents(values.totalAmount)}`,
              ].join("\n"),
          )
        : ["Nenhum ingresso encontrado neste período."]),
    ].join("\n");
  }

  if (input.type === "expired_reservations") {
    return [
      ...reportHeader("RESERVAS EXPIRADAS", event, input.period),
      periodExpiredReservations.length
        ? periodExpiredReservations
            .slice(0, 20)
            .map((reservation, index) => {
              const items = Array.isArray(reservation.reservation_items)
                ? reservation.reservation_items
                : reservation.reservation_items
                  ? [reservation.reservation_items]
                  : [];
              const section = first(items[0]?.venue_sections)?.name ?? "Sem setor";
              return [
                `${index + 1}. ${first(reservation.customers)?.whatsapp_phone ?? "Sem telefone"}`,
                `> Setor: ${section}`,
                `> Quantidade: ${items.length}`,
                `> Valor: ${formatCurrencyFromCents(reservation.total_amount_cents + reservation.total_fee_cents)}`,
                `> Expirou em: ${formatDateTime(reservation.expires_at)}`,
              ].join("\n");
            })
            .join("\n")
        : "Nenhuma reserva expirada neste período.",
    ].join("\n");
  }

  if (input.type === "gate_checkins") {
    const allowed = periodValidations.filter((validation) => validation.result === "allowed");
    const denied = periodValidations.length - allowed.length;
    return [
      ...gateCheckinsReportHeader("CHECK-INS DA PORTARIA", event, input.period),
      `> Entradas liberadas: ${allowed.length}`,
      `> Leituras negadas: ${denied}`,
      ...(allowed.length
        ? allowed.slice(0, 20).map((validation, index) =>
            [
              `${index + 1}. ${validation.ticket_code ?? "Sem código"}`,
              `> Horário: ${formatDateTime(validation.created_at)}`,
              `> Validador: ${validation.validator_identifier ?? validation.gate_label ?? "Não informado"}`,
            ].join("\n"),
          )
        : ["Nenhum check-in liberado neste período."]),
    ].join("\n");
  }

  if (input.type === "ticket_usage") {
    const periodTickets = tickets.filter((ticket) =>
      isWithinPeriod(ticket.issued_at, input.period) ||
      isWithinPeriod(ticket.used_at, input.period) ||
      isWithinPeriod(ticket.cancelled_at, input.period),
    );
    const issued = periodTickets.filter(
      (ticket) =>
        ticket.status !== "cancelled",
    );
    const used = periodTickets.filter(
      (ticket) =>
        ticket.status === "used" &&
        (isWithinPeriod(ticket.used_at, input.period) ||
          isWithinPeriod(ticket.issued_at, input.period)),
    );
    const cancelled = periodTickets.filter(
      (ticket) =>
        ticket.status === "cancelled" &&
        (isWithinPeriod(ticket.cancelled_at, input.period) ||
          isWithinPeriod(ticket.issued_at, input.period)),
    );
    const deniedValidations = periodValidations.filter(
      (validation) => validation.result !== "allowed",
    );
    const blockedSystemQr = deniedValidations.filter(
      (validation) => validation.result !== "not_found",
    );
    const blockedExternalQr = deniedValidations.filter(
      (validation) => validation.result === "not_found",
    );

    return [
      ...compactEventReportHeader("INGRESSOS USADOS E NÃO USADOS", event, input.period),
      `> Emitidos: ${issued.length}`,
      `> Não usados: ${Math.max(issued.length - used.length, 0)}`,
      `> Usados: ${used.length}`,
      `> Cancelados: ${cancelled.length}`,
      `> Barrados: ${deniedValidations.length}`,
      "Barrados:",
      `> QRCode gerado pelo sistema: ${blockedSystemQr.length}`,
      `> QRCode não gerado pelo sistema: ${blockedExternalQr.length}`,
    ].join("\n");
  }

  const revenue = soldTickets.reduce((sum, ticket) => sum + getTicketAmount(ticket), 0);

  return [
    ...compactEventReportHeader("RESUMO GERAL", event, input.period),
    `> Vendas: ${soldTickets.length}`,
    `> Cortesias: ${courtesyTickets.length}`,
    `> Receita: ${formatCurrencyFromCents(revenue)}`,
    `> Check-ins liberados: ${periodValidations.filter((validation) => validation.result === "allowed").length}`,
    `> Reservas expiradas: ${periodExpiredReservations.length}`,
    `> Ingressos usados: ${usedTickets.length}`,
  ].join("\n");
}
