import "server-only";

import QRCode from "qrcode";
import { createHash } from "crypto";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { createSignedTicketToken, createTicketUrl } from "@/lib/tickets/services/tickets";

type MaybeArray<T> = T | T[] | null | undefined;

export type AdminCourtesyEventOption = {
  option: number;
  eventId: string;
  title: string;
  city: string;
  state: string;
  status: string;
  nextSessionStartsAt: string | null;
};

export type AdminCourtesyRecord = {
  courtesyId: string;
  eventTitle: string;
  phone: string;
  status: string;
  ticketCode: string | null;
  createdAt: string;
  cancelledAt: string | null;
};

export type AdminCourtesyCancelTarget = {
  courtesyId?: string;
  phone?: string;
  ticketCode?: string;
};

export type CourtesyDelivery = {
  message: string;
  qrImages: Array<{ imageUrl: string; caption: string }>;
};

type EventRow = {
  id: string;
  title: string;
  city: string;
  state: string;
  status: string;
  event_sessions: MaybeArray<{
    id: string;
    starts_at: string;
    status: string;
  }>;
};

type CourtesyRow = {
  id: string;
  phone: string;
  status: string;
  created_at: string;
  cancelled_at: string | null;
  tickets: MaybeArray<{
    id: string;
    ticket_code: string;
  }>;
  events: MaybeArray<{
    title: string;
  }>;
};

type TicketRow = {
  id: string;
  ticket_code: string;
  status: string;
  event_sessions: MaybeArray<{
    starts_at: string;
    events: MaybeArray<{
      title: string;
      city: string;
      state: string;
      venues: MaybeArray<{ name: string }>;
    }>;
  }>;
  venue_sections: MaybeArray<{ name: string }>;
  reservation_items: MaybeArray<{ seat_code: string }>;
};

const SAO_PAULO_TIME_ZONE = "America/Sao_Paulo";
const QR_CODE_CAPTION = [
  "*APRESENTE O QRCODE NA PORTARIA*",
  "Esta cortesia será validada uma única vez na portaria. Por segurança, não envie para terceiros.",
].join("\n");

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

export function normalizeCourtesyPhone(value: string) {
  const digits = value.replace(/\D/g, "");
  if (!digits) return null;
  if (!digits.startsWith("55") && (digits.length === 10 || digits.length === 11)) {
    return `55${digits}`;
  }
  return digits;
}

export function parseCourtesyPhones(value: string) {
  return [
    ...new Set(
      value
        .split(/[\n,; ]+/)
        .map((part) => normalizeCourtesyPhone(part))
        .filter((phone): phone is string => Boolean(phone && phone.length >= 12)),
    ),
  ];
}

function buildEventOptions(rows: EventRow[]) {
  return rows.map((event, index) => {
    const sessions = Array.isArray(event.event_sessions)
      ? event.event_sessions
      : event.event_sessions
        ? [event.event_sessions]
        : [];
    const sortedSessions = sessions.sort((left, right) =>
      left.starts_at.localeCompare(right.starts_at),
    );

    return {
      option: index + 1,
      eventId: event.id,
      title: event.title,
      city: event.city,
      state: event.state,
      status: event.status,
      nextSessionStartsAt: sortedSessions[0]?.starts_at ?? null,
    };
  });
}

export async function listCourtesyEvents({
  ownerAdminUserId,
  canSeeAll,
}: {
  ownerAdminUserId: string;
  canSeeAll: boolean;
}) {
  const supabase = getSupabaseAdmin();
  let query = supabase
    .from("events")
    .select("id, title, city, state, status, event_sessions(id, starts_at, status)")
    .order("created_at", { ascending: false })
    .limit(20);

  if (!canSeeAll) {
    query = query.eq("created_by_admin_user_id", ownerAdminUserId);
  }

  const { data, error } = await query.returns<EventRow[]>();

  if (error) {
    return { ok: false as const, error };
  }

  return { ok: true as const, events: buildEventOptions(data ?? []) };
}

export function resolveCourtesyEventId(
  input: string,
  events: Array<{ option: number; eventId: string; title: string }>,
) {
  const trimmed = input.trim();
  const numericOption = /^\d+$/.test(trimmed) ? Number(trimmed) : null;

  if (numericOption) {
    return events.find((event) => event.option === numericOption)?.eventId ?? null;
  }

  if (
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      trimmed,
    )
  ) {
    return trimmed;
  }

  const normalized = trimmed.toLocaleLowerCase("pt-BR");
  return (
    events.find((event) => event.title.toLocaleLowerCase("pt-BR") === normalized)
      ?.eventId ??
    events.find((event) =>
      event.title.toLocaleLowerCase("pt-BR").includes(normalized),
    )?.eventId ??
    null
  );
}

async function ensureCustomer(phone: string) {
  const supabase = getSupabaseAdmin();
  const { data: existing, error: existingError } = await supabase
    .from("customers")
    .select("id, whatsapp_phone, name")
    .eq("whatsapp_phone", phone)
    .maybeSingle<{ id: string; whatsapp_phone: string; name: string | null }>();

  if (existingError) throw existingError;
  if (existing) return existing;

  const { data, error } = await supabase
    .from("customers")
    .insert({ whatsapp_phone: phone })
    .select("id, whatsapp_phone, name")
    .single<{ id: string; whatsapp_phone: string; name: string | null }>();

  if (error) throw error;
  return data;
}

async function getCourtesyIssueTarget(eventId: string) {
  const supabase = getSupabaseAdmin();
  const { data: sessionSeat, error } = await supabase
    .from("session_seats")
    .select(
      "id, session_id, seat_id, section_id, event_sessions!inner(event_id, starts_at, status), venue_sections!inner(name)",
    )
    .eq("event_sessions.event_id", eventId)
    .in("event_sessions.status", ["scheduled", "sales_open"])
    .eq("status", "available")
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle<{
      id: string;
      session_id: string;
      seat_id: string;
      section_id: string;
    }>();

  if (error) throw error;
  return sessionSeat ?? null;
}

async function ensureCourtesyPrice(target: { session_id: string; section_id: string }) {
  const supabase = getSupabaseAdmin();
  const { data: existing, error: existingError } = await supabase
    .from("ticket_prices")
    .select("id")
    .eq("session_id", target.session_id)
    .eq("section_id", target.section_id)
    .eq("ticket_type", "free")
    .maybeSingle<{ id: string }>();

  if (existingError) throw existingError;
  if (existing) {
    const { error } = await supabase
      .from("ticket_prices")
      .update({ status: "active", price_cents: 0, fee_cents: 0, label: "Cortesia" })
      .eq("id", existing.id);

    if (error) throw error;
    return existing.id;
  }

  const { data, error } = await supabase
    .from("ticket_prices")
    .insert({
      session_id: target.session_id,
      section_id: target.section_id,
      ticket_type: "free",
      label: "Cortesia",
      price_cents: 0,
      fee_cents: 0,
      currency: "BRL",
      status: "active",
    })
    .select("id")
    .single<{ id: string }>();

  if (error) throw error;
  return data.id;
}

async function issueCourtesyForPhone({
  eventId,
  phone,
  issuedByAdminUserId,
  issuedByAdminPhone,
}: {
  eventId: string;
  phone: string;
  issuedByAdminUserId: string;
  issuedByAdminPhone: string;
}) {
  const supabase = getSupabaseAdmin();
  const customer = await ensureCustomer(phone);
  const { data: limit } = await supabase
    .from("courtesy_limits")
    .select("max_courtesies")
    .eq("event_id", eventId)
    .maybeSingle<{ max_courtesies: number }>();

  if (limit && limit.max_courtesies > 0) {
    const { count, error } = await supabase
      .from("courtesies")
      .select("id", { count: "exact", head: true })
      .eq("event_id", eventId);

    if (error) throw error;
    if ((count ?? 0) >= limit.max_courtesies) {
      return {
        ok: false as const,
        reason: "limit_reached" as const,
        phone,
        limit: limit.max_courtesies,
        issuedCount: count ?? 0,
      };
    }
  }

  const target = await getCourtesyIssueTarget(eventId);
  if (!target) return { ok: false as const, reason: "no_available_seat" as const, phone };
  await ensureCourtesyPrice(target);

  const { data: reservation, error: reserveError } = await supabase.rpc("reserve_seats", {
    p_customer_id: customer.id,
    p_conversation_id: null,
    p_session_id: target.session_id,
    p_seat_ids: [target.seat_id],
    p_ticket_type: "free",
    p_ttl_minutes: 10,
  });

  if (reserveError || !reservation || typeof reservation !== "object") {
    throw reserveError ?? new Error("courtesy_reservation_failed");
  }

  const reservationData = reservation as { order_id?: string };
  const orderId = reservationData.order_id;
  if (!orderId) throw new Error("courtesy_order_missing");

  const { error: confirmError } = await supabase.rpc("confirm_paid_ticket_order", {
    p_order_id: orderId,
    p_provider: "mercado_pago",
    p_provider_payment_id: `courtesy_${orderId}`,
    p_amount_cents: 0,
    p_paid_at: new Date().toISOString(),
    p_raw_metadata: {
      source: "courtesy",
      method: "courtesy",
      issued_by_admin_user_id: issuedByAdminUserId,
      issued_by_admin_phone: issuedByAdminPhone,
    },
  });

  if (confirmError) throw confirmError;

  const { data: ticket, error: ticketError } = await supabase
    .from("tickets")
    .select("id")
    .eq("order_id", orderId)
    .order("created_at", { ascending: true })
    .limit(1)
    .single<{ id: string }>();

  if (ticketError) throw ticketError;

  const { error: courtesyError } = await supabase.from("courtesies").insert({
    event_id: eventId,
    session_id: target.session_id,
    ticket_id: ticket.id,
    order_id: orderId,
    customer_id: customer.id,
    phone,
    issued_by_admin_user_id: issuedByAdminUserId,
    issued_by_admin_phone: issuedByAdminPhone,
    status: "issued",
  });

  if (courtesyError) throw courtesyError;

  return { ok: true as const, phone, orderId, ticketId: ticket.id };
}

export async function issueCourtesies(input: {
  eventId: string;
  phones: string[];
  issuedByAdminUserId: string;
  issuedByAdminPhone: string;
}) {
  const results = [];
  for (const phone of input.phones) {
    results.push(
      await issueCourtesyForPhone({
        eventId: input.eventId,
        phone,
        issuedByAdminUserId: input.issuedByAdminUserId,
        issuedByAdminPhone: input.issuedByAdminPhone,
      }),
    );
  }

  return results;
}

function mapCourtesy(row: CourtesyRow): AdminCourtesyRecord {
  const ticket = first(row.tickets);
  const event = first(row.events);

  return {
    courtesyId: row.id,
    eventTitle: event?.title ?? "Evento",
    phone: row.phone,
    status: row.status,
    ticketCode: ticket?.ticket_code ?? null,
    createdAt: row.created_at,
    cancelledAt: row.cancelled_at,
  };
}

export async function listCourtesiesForEvent(eventId: string) {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("courtesies")
    .select("id, phone, status, created_at, cancelled_at, tickets(id, ticket_code), events(title)")
    .eq("event_id", eventId)
    .order("created_at", { ascending: false })
    .returns<CourtesyRow[]>();

  if (error) return { ok: false as const, error };
  return { ok: true as const, courtesies: (data ?? []).map(mapCourtesy) };
}

async function getCourtesyTicketsByPhone(phone: string, eventId?: string) {
  const supabase = getSupabaseAdmin();
  let query = supabase
    .from("courtesies")
    .select(
      "ticket_id, tickets!inner(id, ticket_code, status, reservation_items(seat_code), event_sessions(starts_at, events(title, city, state, venues(name))), venue_sections(name))",
    )
    .eq("phone", phone)
    .eq("status", "issued")
    .eq("tickets.status", "issued");

  if (eventId) query = query.eq("event_id", eventId);

  const { data, error } = await query.returns<
    Array<{ tickets: MaybeArray<TicketRow> }>
  >();

  if (error) throw error;

  return (data ?? []).flatMap((row) => {
    const ticket = first(row.tickets);
    return ticket ? [ticket] : [];
  });
}

function formatCourtesyTicket(ticket: TicketRow) {
  const session = first(ticket.event_sessions);
  const event = first(session?.events);
  const section = first(ticket.venue_sections);

  return [
    `*${event?.title ?? "CORTESIA"}*`,
    `> Data: ${session?.starts_at ? formatDateTime(session.starts_at) : "A confirmar"}`,
    `> Setor: ${section?.name ?? "Cortesia"}`,
    `> Código: ${ticket.ticket_code}`,
  ].join("\n");
}

async function ticketQrImage(ticket: TicketRow) {
  const token = createSignedTicketToken({
    ticketId: ticket.id,
    ticketCode: ticket.ticket_code,
  });

  return QRCode.toDataURL(createTicketUrl(token), {
    errorCorrectionLevel: "M",
    margin: 2,
    scale: 8,
    type: "image/png",
  });
}

export async function buildCourtesyDeliveryForPhone(phone: string, eventId?: string) {
  const tickets = await getCourtesyTicketsByPhone(phone, eventId);

  if (tickets.length === 0) {
    return { ok: false as const, reason: "not_found" as const };
  }

  return {
    ok: true as const,
    delivery: {
      message: tickets.map(formatCourtesyTicket).join("\n\n"),
      qrImages: await Promise.all(
        tickets.map(async (ticket) => ({
          imageUrl: await ticketQrImage(ticket),
          caption: QR_CODE_CAPTION,
        })),
      ),
    } satisfies CourtesyDelivery,
  };
}

export async function cancelCourtesiesForEvent(eventId: string) {
  return cancelCourtesyForEvent(eventId, {});
}

export async function cancelCourtesyForEvent(
  eventId: string,
  target: AdminCourtesyCancelTarget,
) {
  const supabase = getSupabaseAdmin();
  let query = supabase
    .from("courtesies")
    .select("id, ticket_id")
    .eq("event_id", eventId)
    .eq("status", "issued");

  if (target.courtesyId) {
    query = query.eq("id", target.courtesyId);
  } else if (target.phone) {
    query = query.eq("phone", target.phone);
  } else if (target.ticketCode) {
    query = query.eq("tickets.ticket_code", target.ticketCode);
  } else {
    return { ok: false as const, reason: "target_required" as const };
  }

  if (target.ticketCode) {
    query = query.select("id, ticket_id, tickets!inner(ticket_code)");
  }

  const { data, error } = await query.returns<Array<{ id: string; ticket_id: string | null }>>();

  if (error) return { ok: false as const, error };
  const ids = (data ?? []).map((row) => row.id);
  const ticketIds = (data ?? [])
    .map((row) => row.ticket_id)
    .filter((id): id is string => Boolean(id));

  if (ids.length === 0) return { ok: true as const, cancelledCount: 0 };

  const now = new Date().toISOString();
  const { error: courtesyError } = await supabase
    .from("courtesies")
    .update({ status: "cancelled", cancelled_at: now })
    .in("id", ids);

  if (courtesyError) return { ok: false as const, error: courtesyError };

  if (ticketIds.length > 0) {
    const { error: ticketError } = await supabase
      .from("tickets")
      .update({ status: "cancelled", cancelled_at: now })
      .in("id", ticketIds)
      .eq("status", "issued");

    if (ticketError) return { ok: false as const, error: ticketError };
  }

  return { ok: true as const, cancelledCount: ids.length };
}

export function resolveCourtesyCancelTarget(
  input: string,
  courtesies: Array<{
    option: number;
    courtesyId: string;
    phone: string;
    ticketCode?: string | null;
  }>,
): AdminCourtesyCancelTarget | null {
  const trimmed = input.trim();
  const option = /^\d+$/.test(trimmed) ? Number(trimmed) : null;

  if (option) {
    const courtesy = courtesies.find((item) => item.option === option);
    if (courtesy) return { courtesyId: courtesy.courtesyId };
  }

  const phone = normalizeCourtesyPhone(trimmed);
  if (phone && phone.length >= 12) return { phone };

  if (/^TCK-[A-Z0-9]+$/i.test(trimmed)) {
    return { ticketCode: trimmed.toUpperCase() };
  }

  if (
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      trimmed,
    )
  ) {
    return { courtesyId: trimmed };
  }

  return null;
}

export async function setCourtesyLimit(eventId: string, limit: number) {
  const supabase = getSupabaseAdmin();
  const { error } = await supabase.from("courtesy_limits").upsert({
    event_id: eventId,
    max_courtesies: limit,
  });

  return error ? { ok: false as const, error } : { ok: true as const };
}

export async function getCourtesyLimit(eventId: string) {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("courtesy_limits")
    .select("max_courtesies")
    .eq("event_id", eventId)
    .maybeSingle<{ max_courtesies: number }>();

  if (error) return { ok: false as const, error };
  return { ok: true as const, limit: data?.max_courtesies ?? 0 };
}

export function buildCourtesyIssueSummary(results: Awaited<ReturnType<typeof issueCourtesies>>) {
  const issuedPhones = results
    .filter((result) => result.ok)
    .map((result) => result.phone);
  const limitReachedPhones = results
    .filter((result) => !result.ok && result.reason === "limit_reached")
    .map((result) => result.phone);
  const unavailablePhones = results
    .filter((result) => !result.ok && result.reason === "no_available_seat")
    .map((result) => result.phone);
  const lines: string[] = [];
  const eventLimitResults = results.filter(
    (result) => !result.ok && result.reason === "limit_reached",
  );

  if (
    results.length > 0 &&
    eventLimitResults.length === results.length &&
    eventLimitResults[0]?.limit
  ) {
    return [
      "*NÃO FOI POSSÍVEL EMITIR CORTESIA.*",
      `O LIMITE DO EVENTO É DE ${eventLimitResults[0].limit} CORTESIAS`,
      `CORTESIAS JÁ EMITIDAS PARA O EVENTO: ${eventLimitResults[0].issuedCount ?? eventLimitResults[0].limit}`,
    ].join("\n");
  }

  if (issuedPhones.length > 0) {
    lines.push(
      "*CORTESIA GERADA COM SUCESSO PARA:*",
      ...issuedPhones.map((phone) => `> ${phone}`),
    );
  } else {
    lines.push("*NENHUMA NOVA CORTESIA GERADA*");
  }

  if (limitReachedPhones.length > 0) {
    lines.push(
      "",
      "*NÃO EMITIDAS POR LIMITE DO EVENTO:*",
      ...limitReachedPhones.map((phone) => `> ${phone}`),
    );
  }

  if (unavailablePhones.length > 0) {
    lines.push(
      "",
      "*NÃO EMITIDAS POR FALTA DE DISPONIBILIDADE:*",
      ...unavailablePhones.map((phone) => `> ${phone}`),
    );
  }

  return lines.join("\n");
}

export function buildCourtesyEventsReply(title: string, events: AdminCourtesyEventOption[]) {
  const eventBlocks = events.map((event) =>
    [
      `${event.option}. ${event.title}`,
      `> ${event.city}/${event.state}`,
      `> Status: ${event.status}`,
      event.nextSessionStartsAt
        ? `> Próxima: ${formatDateTime(event.nextSessionStartsAt)}`
        : "> Próxima: sem data",
      `> ID: ${event.eventId}`,
    ].join("\n"),
  );

  return [
    `*${title}*`,
    "",
    ...(events.length
      ? [eventBlocks.join("\n---\n")]
      : ["Nenhum evento encontrado."]),
    "",
    "Responda com o número, nome ou ID do evento.",
  ].join("\n");
}

export function buildCourtesiesListReply(courtesies: AdminCourtesyRecord[]) {
  return [
    "*CORTESIAS EMITIDAS*",
    "",
    ...(courtesies.length
      ? courtesies.map((courtesy, index) =>
          [
            `${index + 1}. ${courtesy.eventTitle}`,
            `   Telefone: ${courtesy.phone}`,
            `   Código: ${courtesy.ticketCode ?? "sem ticket"}`,
            `   Status: ${courtesy.status}`,
            `   Emitida em: ${formatDateTime(courtesy.createdAt)}`,
          ].join("\n"),
        )
      : ["Nenhuma cortesia emitida para esse evento."]),
  ].join("\n");
}

export function courtesyBatchKey(phones: string[]) {
  return createHash("sha1").update(phones.join("|")).digest("hex").slice(0, 8);
}
