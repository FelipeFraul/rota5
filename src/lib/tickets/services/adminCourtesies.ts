import "server-only";

import QRCode from "qrcode";
import { createHash } from "crypto";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { normalizeWhatsAppPhone } from "@/lib/tickets/phones";
import { listAvailableSections, type AvailableSection } from "@/lib/tickets/services/sections";
import { listAvailableSeats, listSeatMap } from "@/lib/tickets/services/seats";
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
  beneficiaryName: string | null;
  reason: string | null;
  status: string;
  ticketStatus: string | null;
  ticketCode: string | null;
  sectionName: string | null;
  seatCode: string | null;
  createdAt: string;
  cancelledAt: string | null;
  usedAt: string | null;
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

export type AdminCourtesySessionOption = {
  option: number;
  sessionId: string;
  startsAt: string;
  status: string;
};

export type AdminCourtesySectionOption = {
  option: number;
  sectionId: string;
  sectionName: string;
  hasNumberedSeats: boolean;
  availableSeatsCount: number;
};

export type AdminCourtesyIssueSuccess = {
  ok: true;
  eventTitle: string;
  beneficiaryPhone: string;
  beneficiaryName: string | null;
  quantity: number;
  ticketIds: string[];
  ticketCodes: string[];
  delivery: CourtesyDelivery;
};

export type AdminCourtesyIssueResult =
  | AdminCourtesyIssueSuccess
  | {
      ok: false;
      reason:
        | "not_enough_seats"
        | "seat_unavailable"
        | "event_not_found"
        | "section_not_found"
        | "reservation_failed"
        | "courtesy_limit_exceeded"
        | "issue_failed";
      error?: unknown;
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

type PublishedEventStatusRow = {
  id: string;
  event_sessions: MaybeArray<{
    id: string;
    starts_at: string;
    status: string;
  }>;
};

type CourtesyRow = {
  id: string;
  phone: string;
  beneficiary_name: string | null;
  reason: string | null;
  status: string;
  created_at: string;
  cancelled_at: string | null;
  tickets: MaybeArray<{
    id: string;
    ticket_code: string;
    status: string;
    used_at: string | null;
    cancelled_at: string | null;
    reservation_items: MaybeArray<{ seat_code: string | null }>;
    venue_sections: MaybeArray<{ name: string | null }>;
  }>;
  events: MaybeArray<{
    title: string;
  }>;
};

type TicketRow = {
  id: string;
  ticket_code: string;
  status: string;
  used_at?: string | null;
  cancelled_at?: string | null;
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

type IssueCourtesyOrderRpcResponse = {
  order_id: string;
  reservation_id: string;
  status: string;
  tickets_count: number;
  tickets?: Array<{
    ticket_id: string;
    ticket_code: string;
    reservation_item_id: string;
    seat_id: string;
    seat_code: string;
    section_id: string;
  }>;
};

function getPostgresErrorMessage(error: unknown) {
  if (error && typeof error === "object" && "message" in error) {
    return String((error as { message?: unknown }).message ?? "");
  }

  return "";
}

function mapIssueCourtesyError(
  error: unknown,
): Extract<AdminCourtesyIssueResult, { ok: false }>["reason"] {
  const message = getPostgresErrorMessage(error);

  if (
    message.includes("courtesy_event_limit_exceeded") ||
    message.includes("courtesy_send_limit_exceeded") ||
    message.includes("courtesy_receive_limit_exceeded")
  ) {
    return "courtesy_limit_exceeded";
  }

  if (
    message.includes("seat_not_available") ||
    message.includes("reserved_seat_not_available")
  ) {
    return "seat_unavailable";
  }

  if (
    message.includes("reservation_failed") ||
    message.includes("reservation_not_found") ||
    message.includes("reservation_not_payable") ||
    message.includes("reservation_expired")
  ) {
    return "reservation_failed";
  }

  return "issue_failed";
}

const SAO_PAULO_TIME_ZONE = "America/Sao_Paulo";

function getSaoPauloTodayStartIso(now = new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: SAO_PAULO_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  const year = Number(parts.find((part) => part.type === "year")?.value);
  const month = Number(parts.find((part) => part.type === "month")?.value);
  const day = Number(parts.find((part) => part.type === "day")?.value);

  return new Date(Date.UTC(year, month - 1, day, 3, 0, 0, 0)).toISOString();
}
const QR_CODE_CAPTION = [
  "*APRESENTE O QRCODE NA PORTARIA*",
  "Esta cortesia será validada uma única vez na portaria. Por segurança, não envie para terceiros.",
].join("\n");

function first<T>(value: MaybeArray<T>): T | null {
  if (Array.isArray(value)) return value[0] ?? null;
  return value ?? null;
}

function maskPhone(phone: string) {
  const digits = phone.replace(/\D/g, "");
  if (digits.length <= 4) return "****";
  return `****${digits.slice(-4)}`;
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
  return normalizeWhatsAppPhone(value);
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

function getEventSessions(event: EventRow) {
  return Array.isArray(event.event_sessions)
    ? event.event_sessions
    : event.event_sessions
      ? [event.event_sessions]
      : [];
}

function getEventNextSessionStartsAt(event: EventRow) {
  const sessions = getEventSessions(event);
  const sortedSessions = [...sessions].sort((left, right) =>
    left.starts_at.localeCompare(right.starts_at),
  );

  return sortedSessions[0]?.starts_at ?? null;
}

function isPublishedEventPast(event: PublishedEventStatusRow, todayStartIso: string) {
  const sessions = Array.isArray(event.event_sessions)
    ? event.event_sessions
    : event.event_sessions
      ? [event.event_sessions]
      : [];

  if (!sessions.length) return false;

  const latestSessionStartsAt = [...sessions].sort((left, right) =>
    right.starts_at.localeCompare(left.starts_at),
  )[0]?.starts_at;

  return Boolean(latestSessionStartsAt && latestSessionStartsAt < todayStartIso);
}

async function finishPastPublishedEvents({
  ownerAdminUserId,
  canSeeAll,
}: {
  ownerAdminUserId: string;
  canSeeAll: boolean;
}) {
  const supabase = getSupabaseAdmin();

  let query = supabase
    .from("events")
    .select("id, event_sessions(id, starts_at, status)")
    .eq("status", "published");

  if (!canSeeAll) {
    query = query.eq("created_by_admin_user_id", ownerAdminUserId);
  }

  const { data, error } = await query.returns<PublishedEventStatusRow[]>();
  if (error) return { ok: false as const, error };

  const todayStartIso = getSaoPauloTodayStartIso();
  const finishedEventIds = (data ?? [])
    .filter((event) => isPublishedEventPast(event, todayStartIso))
    .map((event) => event.id);

  if (!finishedEventIds.length) return { ok: true as const };

  const { error: eventUpdateError } = await supabase
    .from("events")
    .update({ status: "finished" })
    .in("id", finishedEventIds)
    .eq("status", "published");

  if (eventUpdateError) return { ok: false as const, error: eventUpdateError };

  const { error: sessionUpdateError } = await supabase
    .from("event_sessions")
    .update({ status: "finished" })
    .in("event_id", finishedEventIds)
    .in("status", ["scheduled", "sales_open", "sales_closed"]);

  return sessionUpdateError
    ? { ok: false as const, error: sessionUpdateError }
    : { ok: true as const };
}

function buildEventOptions(rows: EventRow[]) {
  return rows.map((event, index) => {
    const sortedSessions = [...getEventSessions(event)].sort((left, right) =>
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
  onlyPublished = false,
  sortByNextSession = false,
}: {
  ownerAdminUserId: string;
  canSeeAll: boolean;
  onlyPublished?: boolean;
  sortByNextSession?: boolean;
}) {
  const supabase = getSupabaseAdmin();

  if (onlyPublished) {
    const finishResult = await finishPastPublishedEvents({
      ownerAdminUserId,
      canSeeAll,
    });
    if (!finishResult.ok) return finishResult;
  }

  let query = supabase
    .from("events")
    .select("id, title, city, state, status, event_sessions(id, starts_at, status)")
    .order("created_at", { ascending: false });

  if (!canSeeAll) {
    query = query.eq("created_by_admin_user_id", ownerAdminUserId);
  }

  if (onlyPublished) {
    query = query.eq("status", "published");
  }

  const { data, error } = await query.returns<EventRow[]>();

  if (error) {
    return { ok: false as const, error };
  }

  const rows = sortByNextSession
    ? [...(data ?? [])].sort((left, right) => {
        const leftNextSession = getEventNextSessionStartsAt(left);
        const rightNextSession = getEventNextSessionStartsAt(right);
        const leftTime = leftNextSession
          ? new Date(leftNextSession).getTime()
          : Number.MAX_SAFE_INTEGER;
        const rightTime = rightNextSession
          ? new Date(rightNextSession).getTime()
          : Number.MAX_SAFE_INTEGER;

        return leftTime - rightTime || left.title.localeCompare(right.title);
      })
    : data ?? [];

  return { ok: true as const, events: buildEventOptions(rows) };
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

async function ensureCustomer(phone: string, name?: string | null) {
  const supabase = getSupabaseAdmin();
  const { data: existing, error: existingError } = await supabase
    .from("customers")
    .select("id, whatsapp_phone, name")
    .eq("whatsapp_phone", phone)
    .maybeSingle<{ id: string; whatsapp_phone: string; name: string | null }>();

  if (existingError) throw existingError;
  const normalizedName = name?.trim() || null;
  if (existing) {
    if (normalizedName && existing.name !== normalizedName) {
      const { data, error } = await supabase
        .from("customers")
        .update({ name: normalizedName })
        .eq("id", existing.id)
        .select("id, whatsapp_phone, name")
        .single<{ id: string; whatsapp_phone: string; name: string | null }>();

      if (error) throw error;
      return data;
    }

    return existing;
  }

  const { data, error } = await supabase
    .from("customers")
    .insert({ whatsapp_phone: phone, ...(normalizedName ? { name: normalizedName } : {}) })
    .select("id, whatsapp_phone, name")
    .single<{ id: string; whatsapp_phone: string; name: string | null }>();

  if (error) throw error;
  return data;
}

async function ensureCourtesyPrice(target: { session_id: string; section_id: string }) {
  const supabase = getSupabaseAdmin();
  const { data: existingRows, error: existingError } = await supabase
    .from("ticket_prices")
    .select("id")
    .eq("session_id", target.session_id)
    .eq("section_id", target.section_id)
    .eq("ticket_type", "free")
    .order("created_at", { ascending: true })
    .limit(1)
    .returns<Array<{ id: string }>>();

  if (existingError) throw existingError;
  const existing = existingRows?.[0];
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

export async function listCourtesySessions(eventId: string) {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("event_sessions")
    .select("id, starts_at, status")
    .eq("event_id", eventId)
    .in("status", ["scheduled", "sales_open"])
    .order("starts_at", { ascending: true })
    .returns<Array<{ id: string; starts_at: string; status: string }>>();

  if (error) return { ok: false as const, error };

  return {
    ok: true as const,
    sessions: (data ?? []).map((session, index) => ({
      option: index + 1,
      sessionId: session.id,
      startsAt: session.starts_at,
      status: session.status,
    })),
  };
}

export async function listCourtesySections(sessionId: string) {
  try {
    const sections = await listAvailableSections(sessionId);

    return {
      ok: true as const,
      sections: sections.map((section, index) => ({
        option: index + 1,
        sectionId: section.sectionId,
        sectionName: section.sectionName,
        hasNumberedSeats: section.hasNumberedSeats,
        availableSeatsCount: section.availableSeatsCount,
      })),
    };
  } catch (error) {
    return { ok: false as const, error };
  }
}

export function resolveCourtesySessionId(
  input: string,
  sessions: AdminCourtesySessionOption[],
) {
  const trimmed = input.trim();
  const option = /^\d+$/.test(trimmed) ? Number(trimmed) : null;
  if (option) return sessions.find((session) => session.option === option)?.sessionId ?? null;
  return sessions.find((session) => session.sessionId === trimmed)?.sessionId ?? null;
}

export function resolveCourtesySectionId(
  input: string,
  sections: AdminCourtesySectionOption[],
) {
  const trimmed = input.trim();
  const option = /^\d+$/.test(trimmed) ? Number(trimmed) : null;
  if (option) return sections.find((section) => section.option === option)?.sectionId ?? null;
  const normalized = trimmed.toLocaleLowerCase("pt-BR");
  return (
    sections.find((section) => section.sectionId === trimmed)?.sectionId ??
    sections.find((section) => section.sectionName.toLocaleLowerCase("pt-BR") === normalized)
      ?.sectionId ??
    null
  );
}

async function getCourtesyEventTitle(eventId: string) {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("events")
    .select("title")
    .eq("id", eventId)
    .maybeSingle<{ title: string }>();

  if (error) throw error;
  return data?.title ?? "Evento";
}

async function getSectionForCourtesy(
  sessionId: string,
  sectionId: string,
): Promise<AvailableSection | null> {
  const sections = await listAvailableSections(sessionId);
  return sections.find((section) => section.sectionId === sectionId) ?? null;
}

function normalizeSeatCode(value: string) {
  return value.trim().toLocaleUpperCase("pt-BR");
}

function parseSeatCodes(value: string) {
  return [
    ...new Set(
      value
        .split(/[\s,;|]+/)
        .map(normalizeSeatCode)
        .filter(Boolean),
    ),
  ];
}

async function getSeatIdsForCourtesy({
  sessionId,
  section,
  quantity,
  seatCodes,
}: {
  sessionId: string;
  section: AvailableSection;
  quantity: number;
  seatCodes?: string[];
}) {
  if (section.hasNumberedSeats) {
    const requestedCodes = (seatCodes ?? []).map(normalizeSeatCode);
    if (requestedCodes.length !== quantity) {
      return { ok: false as const, reason: "seat_unavailable" as const };
    }

    const seatMap = await listSeatMap({ sessionId, sectionId: section.sectionId });
    const availableByCode = new Map(
      seatMap.availableSeats.map((seat) => [normalizeSeatCode(seat.seatCode), seat]),
    );
    const seats = requestedCodes.map((code) => availableByCode.get(code));

    if (seats.some((seat) => !seat)) {
      return { ok: false as const, reason: "seat_unavailable" as const };
    }

    return {
      ok: true as const,
      seatIds: seats.map((seat) => seat!.seatId),
    };
  }

  const seatList = await listAvailableSeats({
    sessionId,
    sectionId: section.sectionId,
    limit: quantity,
  });

  if (seatList.seats.length < quantity) {
    return { ok: false as const, reason: "not_enough_seats" as const };
  }

  return {
    ok: true as const,
    seatIds: seatList.seats.slice(0, quantity).map((seat) => seat.seatId),
  };
}

async function getCourtesyTicketsByIds(ticketIds: string[]) {
  if (ticketIds.length === 0) return [];

  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("tickets")
    .select(
      "id, ticket_code, status, used_at, cancelled_at, reservation_items(seat_code), event_sessions(starts_at, events(title, city, state, venues(name))), venue_sections(name)",
    )
    .in("id", ticketIds)
    .order("ticket_code", { ascending: true })
    .returns<TicketRow[]>();

  if (error) throw error;
  return data ?? [];
}

export async function buildCourtesyDeliveryForTicketIds(ticketIds: string[]) {
  const tickets = await getCourtesyTicketsByIds(ticketIds);
  const issuedTickets = tickets.filter((ticket) => ticket.status === "issued");

  if (issuedTickets.length === 0) {
    return { ok: false as const, reason: "not_found" as const };
  }

  return {
    ok: true as const,
    delivery: {
      message: [
        "*VOCÊ RECEBEU UMA CORTESIA*",
        "",
        issuedTickets.map(formatCourtesyTicket).join("\n\n"),
        "",
        "Apresente o QRCode na portaria.",
      ].join("\n"),
      qrImages: await Promise.all(
        issuedTickets.map(async (ticket) => ({
          imageUrl: await ticketQrImage(ticket),
          caption: QR_CODE_CAPTION,
        })),
      ),
    } satisfies CourtesyDelivery,
  };
}

export async function issueAdminCourtesy(input: {
  eventId: string;
  sessionId: string;
  sectionId: string;
  quantity: number;
  seatCodes?: string[];
  beneficiaryPhone: string;
  beneficiaryName?: string | null;
  reason?: string | null;
  issuedByAdminUserId: string;
  issuedByAdminPhone: string;
}): Promise<AdminCourtesyIssueResult> {
  const supabase = getSupabaseAdmin();
  if (!Number.isInteger(input.quantity) || input.quantity <= 0 || input.quantity > 10) {
    return { ok: false, reason: "not_enough_seats" };
  }

  try {
    const availableLimit = await assertCourtesyLimitAvailable(
      input.eventId,
      input.sectionId,
      input.quantity,
    );
    if (!availableLimit.ok) return { ok: false, reason: availableLimit.reason };

    const customer = await ensureCustomer(input.beneficiaryPhone, input.beneficiaryName);
    const section = await getSectionForCourtesy(input.sessionId, input.sectionId);
    if (!section) return { ok: false, reason: "section_not_found" };

    await ensureCourtesyPrice({
      session_id: input.sessionId,
      section_id: input.sectionId,
    });

    const seats = await getSeatIdsForCourtesy({
      sessionId: input.sessionId,
      section,
      quantity: input.quantity,
      seatCodes: input.seatCodes,
    });

    if (!seats.ok) return { ok: false, reason: seats.reason };

    const { data: issued, error: issueError } = await supabase.rpc("issue_admin_courtesy_order", {
      p_customer_id: customer.id,
      p_session_id: input.sessionId,
      p_seat_ids: seats.seatIds,
      p_issued_by_admin_user_id: input.issuedByAdminUserId,
      p_issued_by_admin_phone: input.issuedByAdminPhone,
      p_beneficiary_name: input.beneficiaryName?.trim() || null,
      p_reason: input.reason?.trim() || null,
      p_ttl_minutes: 10,
    });

    if (issueError || !issued || typeof issued !== "object") {
      return {
        ok: false,
        reason: mapIssueCourtesyError(issueError),
        error: issueError,
      };
    }

    const issuedData = issued as IssueCourtesyOrderRpcResponse;
    const ticketIds = (issuedData.tickets ?? []).map((ticket) => ticket.ticket_id);
    const ticketCodes = (issuedData.tickets ?? []).map((ticket) => ticket.ticket_code);
    const deliveryResult = await buildCourtesyDeliveryForTicketIds(ticketIds);

    if (!deliveryResult.ok) {
      return { ok: false, reason: "issue_failed" };
    }

    return {
      ok: true,
      eventTitle: await getCourtesyEventTitle(input.eventId),
      beneficiaryPhone: input.beneficiaryPhone,
      beneficiaryName: input.beneficiaryName?.trim() || null,
      quantity: ticketIds.length,
      ticketIds,
      ticketCodes,
      delivery: deliveryResult.delivery,
    };
  } catch (error) {
    return { ok: false, reason: mapIssueCourtesyError(error), error };
  }
}

function mapCourtesy(row: CourtesyRow): AdminCourtesyRecord {
  const ticket = first(row.tickets);
  const event = first(row.events);
  const reservationItem = first(ticket?.reservation_items);
  const section = first(ticket?.venue_sections);

  return {
    courtesyId: row.id,
    eventTitle: event?.title ?? "Evento",
    phone: row.phone,
    beneficiaryName: row.beneficiary_name,
    reason: row.reason,
    status: row.status,
    ticketStatus: ticket?.status ?? null,
    ticketCode: ticket?.ticket_code ?? null,
    sectionName: section?.name ?? null,
    seatCode: reservationItem?.seat_code ?? null,
    createdAt: row.created_at,
    cancelledAt: row.cancelled_at,
    usedAt: ticket?.used_at ?? null,
  };
}

export async function listCourtesiesForEvent(eventId: string) {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("courtesies")
    .select(
      "id, phone, beneficiary_name, reason, status, created_at, cancelled_at, tickets(id, ticket_code, status, used_at, cancelled_at, reservation_items(seat_code), venue_sections(name)), events(title)",
    )
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
    color: {
      dark: "#047857",
      light: "#FFFFFF",
    },
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

export async function findCourtesyTargets(input: {
  eventId?: string;
  phone?: string;
  ticketCode?: string;
  courtesyId?: string;
}) {
  const supabase = getSupabaseAdmin();
  let query = supabase
    .from("courtesies")
    .select(
      "id, phone, beneficiary_name, reason, status, created_at, cancelled_at, tickets!inner(id, ticket_code, status, used_at, cancelled_at, reservation_items(seat_code), venue_sections(name)), events(title)",
    )
    .order("created_at", { ascending: false });

  if (input.eventId) query = query.eq("event_id", input.eventId);
  if (input.phone) query = query.eq("phone", input.phone);
  if (input.courtesyId) query = query.eq("id", input.courtesyId);
  if (input.ticketCode) query = query.eq("tickets.ticket_code", input.ticketCode);

  const { data, error } = await query.returns<CourtesyRow[]>();
  if (error) return { ok: false as const, error };

  return { ok: true as const, courtesies: (data ?? []).map(mapCourtesy) };
}

export async function buildCourtesyDeliveryForCourtesyId(courtesyId: string) {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("courtesies")
    .select("ticket_id")
    .eq("id", courtesyId)
    .eq("status", "issued")
    .maybeSingle<{ ticket_id: string | null }>();

  if (error || !data?.ticket_id) {
    return { ok: false as const, reason: "not_found" as const };
  }

  return buildCourtesyDeliveryForTicketIds([data.ticket_id]);
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
    .select(
      "id, ticket_id, status, tickets!inner(id, ticket_code, status, used_at, reservation_item_id, reservation_items(session_seat_id))",
    );

  if (eventId) {
    query = query.eq("event_id", eventId);
  }

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

  const { data, error } = await query.returns<
    Array<{
      id: string;
      ticket_id: string | null;
      status: string;
      tickets: MaybeArray<{
        id: string;
        ticket_code: string;
        status: string;
        used_at: string | null;
        reservation_item_id: string;
        reservation_items: MaybeArray<{ session_seat_id: string | null }>;
      }>;
    }>
  >();

  if (error) return { ok: false as const, error };
  const rows = data ?? [];
  if (rows.length === 0) return { ok: true as const, cancelledCount: 0 };

  const cancellableRows = rows.filter((row) => {
    const ticket = first(row.tickets);
    return row.status === "issued" && ticket?.status === "issued" && !ticket.used_at;
  });

  if (cancellableRows.length === 0) {
    return { ok: false as const, reason: "not_cancellable" as const };
  }

  const ids = cancellableRows.map((row) => row.id);
  const ticketIds = cancellableRows
    .map((row) => row.ticket_id)
    .filter((id): id is string => Boolean(id));
  const sessionSeatIds = cancellableRows
    .map((row) => first(first(row.tickets)?.reservation_items)?.session_seat_id)
    .filter((id): id is string => Boolean(id));

  const now = new Date().toISOString();
  const { error: courtesyError } = await supabase
    .from("courtesies")
    .update({ status: "cancelled", cancelled_at: now, cancelled_reason: "admin_cancelled" })
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

  if (sessionSeatIds.length > 0) {
    const { error: seatError } = await supabase
      .from("session_seats")
      .update({
        status: "available",
        sold_ticket_id: null,
        current_reservation_id: null,
        updated_at: now,
      })
      .in("id", sessionSeatIds)
      .eq("status", "sold");

    if (seatError) return { ok: false as const, error: seatError };
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

export type CourtesySectionLimitStatus = "active" | "inactive";

export type CourtesySectionLimitInput = {
  sectionId: string;
  label: string;
  maxCourtesies: number;
  status: CourtesySectionLimitStatus;
};

type CourtesySectionLimitRow = {
  section_id: string;
  label: string;
  max_courtesies: number;
  status: CourtesySectionLimitStatus;
};

export async function listCourtesySectionLimits(eventId: string) {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("courtesy_section_limits")
    .select("section_id, label, max_courtesies, status")
    .eq("event_id", eventId)
    .returns<CourtesySectionLimitRow[]>();

  if (error) return { ok: false as const, error };
  return { ok: true as const, limits: data ?? [] };
}

export async function upsertCourtesySectionLimits(
  eventId: string,
  limits: CourtesySectionLimitInput[],
) {
  if (!limits.length) return { ok: true as const };

  const supabase = getSupabaseAdmin();
  const { error } = await supabase.from("courtesy_section_limits").upsert(
    limits.map((limit) => ({
      event_id: eventId,
      section_id: limit.sectionId,
      label: limit.label.trim() || "Cortesia",
      max_courtesies: Math.max(0, Math.trunc(limit.maxCourtesies)),
      status: limit.status,
    })),
    { onConflict: "event_id,section_id" },
  );

  return error ? { ok: false as const, error } : { ok: true as const };
}

async function getCourtesySectionLimit(eventId: string, sectionId: string) {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("courtesy_section_limits")
    .select("section_id, label, max_courtesies, status")
    .eq("event_id", eventId)
    .eq("section_id", sectionId)
    .maybeSingle<CourtesySectionLimitRow>();

  if (error) return { ok: false as const, error };
  return { ok: true as const, limit: data ?? null };
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

async function assertCourtesyLimitAvailable(eventId: string, sectionId: string, quantity: number) {
  const sectionLimit = await getCourtesySectionLimit(eventId, sectionId);
  if (!sectionLimit.ok) return { ok: false as const, reason: "issue_failed" as const };

  if (sectionLimit.limit) {
    if (sectionLimit.limit.status !== "active" || sectionLimit.limit.max_courtesies <= 0) {
      return { ok: false as const, reason: "courtesy_limit_exceeded" as const };
    }

    const supabase = getSupabaseAdmin();
    const { count, error } = await supabase
      .from("courtesies")
      .select("id, tickets!inner(section_id)", { count: "exact", head: true })
      .eq("event_id", eventId)
      .eq("status", "issued")
      .eq("tickets.section_id", sectionId);

    if (error) return { ok: false as const, reason: "issue_failed" as const };
    if ((count ?? 0) + quantity > sectionLimit.limit.max_courtesies) {
      return { ok: false as const, reason: "courtesy_limit_exceeded" as const };
    }

    return { ok: true as const };
  }

  const limit = await getCourtesyLimit(eventId);
  if (!limit.ok) return { ok: false as const, reason: "issue_failed" as const };
  if (limit.limit <= 0) return { ok: true as const };

  const supabase = getSupabaseAdmin();
  const { count, error } = await supabase
    .from("courtesies")
    .select("id", { count: "exact", head: true })
    .eq("event_id", eventId)
    .eq("status", "issued");

  if (error) return { ok: false as const, reason: "issue_failed" as const };
  if ((count ?? 0) + quantity > limit.limit) {
    return { ok: false as const, reason: "courtesy_limit_exceeded" as const };
  }

  return { ok: true as const };
}

function formatOptionLine(
  option: number | string,
  label: string,
  { preserveCase = false }: { preserveCase?: boolean } = {},
) {
  const normalizedLabel =
    preserveCase || label.length === 0
      ? label
      : label.charAt(0).toLocaleLowerCase("pt-BR") + label.slice(1);

  return `Digite ${option} para ${normalizedLabel}`;
}

export function buildCourtesyEventsReply(title: string, events: AdminCourtesyEventOption[]) {
  const eventBlocks = events.map((event) =>
    [
      formatOptionLine(event.option, event.title, { preserveCase: true }),
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

export function buildCourtesiesListReply(
  courtesies: AdminCourtesyRecord[],
  { selectable = false }: { selectable?: boolean } = {},
) {
  return [
    "*CORTESIAS EMITIDAS*",
    "",
    ...(courtesies.length
      ? courtesies.map((courtesy, index) =>
          [
            selectable
              ? formatOptionLine(index + 1, courtesy.eventTitle, {
                  preserveCase: true,
                })
              : `- ${courtesy.eventTitle}`,
            `   Beneficiário: ${courtesy.beneficiaryName ?? "Não informado"}`,
            `   Telefone: ${maskPhone(courtesy.phone)}`,
            `   Código: ${courtesy.ticketCode ?? "sem ticket"}`,
            `   Setor: ${courtesy.sectionName ?? "Setor"}`,
            courtesy.seatCode ? `   Assento: ${courtesy.seatCode}` : null,
            `   Status: ${courtesy.ticketStatus ?? courtesy.status}`,
            courtesy.usedAt ? `   Usada em: ${formatDateTime(courtesy.usedAt)}` : null,
            `   Emitida em: ${formatDateTime(courtesy.createdAt)}`,
            courtesy.reason ? `   Motivo: ${courtesy.reason}` : null,
          ].join("\n"),
        )
      : ["Nenhuma cortesia emitida para esse evento."]),
  ].join("\n");
}

export function buildCourtesySessionsReply(sessions: AdminCourtesySessionOption[]) {
  return [
    "*ESCOLHA A SESSÃO*",
    "",
    ...(sessions.length
      ? sessions.map(
          (session) =>
            formatOptionLine(
              session.option,
              `${formatDateTime(session.startsAt)} - ${session.status}`,
              { preserveCase: true },
            ),
        )
      : ["Nenhuma sessão disponível para cortesia."]),
    "",
    "Responda com o número da sessão.",
  ].join("\n");
}

export function buildCourtesySectionsReply(sections: AdminCourtesySectionOption[]) {
  return [
    "*ESCOLHA O SETOR*",
    "",
    ...(sections.length
      ? sections.map((section) =>
          [
            formatOptionLine(section.option, section.sectionName, {
              preserveCase: true,
            }),
            `   Disponíveis: ${section.availableSeatsCount}`,
            `   Assento marcado: ${section.hasNumberedSeats ? "sim" : "não"}`,
          ].join("\n"),
        )
      : ["Nenhum setor com disponibilidade."]),
    "",
    "Responda com o número do setor.",
  ].join("\n");
}

export function parseCourtesySeatCodes(value: string) {
  return parseSeatCodes(value);
}

export function buildCourtesyAdminSuccess(result: AdminCourtesyIssueSuccess) {
  return [
    "*CORTESIA GERADA*",
    "",
    `> Evento: ${result.eventTitle}`,
    `> Beneficiário: ${result.beneficiaryName ?? "Não informado"}`,
    `> Telefone: ${maskPhone(result.beneficiaryPhone)}`,
    `> Quantidade: ${result.quantity}`,
    `> Código(s): ${result.ticketCodes.join(", ")}`,
    "",
    "O ingresso foi enviado ao beneficiário pelo WhatsApp.",
  ].join("\n");
}

export function buildCourtesyConfirmation(input: {
  eventTitle?: string | null;
  sessionLabel?: string | null;
  sectionName?: string | null;
  quantity?: number | null;
  seatCodes?: string[] | null;
  beneficiaryPhone?: string | null;
  beneficiaryName?: string | null;
  reason?: string | null;
}) {
  return [
    "*CONFIRMAR CORTESIA*",
    "",
    `> Evento: ${input.eventTitle ?? "Evento"}`,
    `> Sessão: ${input.sessionLabel ?? "A confirmar"}`,
    `> Setor: ${input.sectionName ?? "Setor"}`,
    `> Quantidade: ${input.quantity ?? 0}`,
    input.seatCodes?.length ? `> Assentos: ${input.seatCodes.join(", ")}` : null,
    `> Telefone: ${input.beneficiaryPhone ? maskPhone(input.beneficiaryPhone) : "Não informado"}`,
    `> Beneficiário: ${input.beneficiaryName || "Não informado"}`,
    input.reason ? `> Motivo: ${input.reason}` : null,
    "",
    "Digite CONFIRMAR para emitir a cortesia ou CANCELAR para abandonar.",
  ]
    .filter((line): line is string => Boolean(line))
    .join("\n");
}

export function courtesyBatchKey(phones: string[]) {
  return createHash("sha1").update(phones.join("|")).digest("hex").slice(0, 8);
}
