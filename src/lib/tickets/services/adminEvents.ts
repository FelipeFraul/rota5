import "server-only";

import { getSupabaseAdmin } from "@/lib/supabase/admin";

export const ADMIN_EVENTS_PAGE_SIZE = 5;

export type AdminEventStatus = "draft" | "published" | "cancelled" | "finished";
export type AdminSessionStatus =
  | "scheduled"
  | "sales_open"
  | "sales_closed"
  | "cancelled"
  | "finished";
export type AdminSectionStatus = "active" | "inactive";
export type AdminSeatStatus = "active" | "inactive" | "blocked";
export type AdminTicketPriceStatus = "active" | "inactive";
export type AdminTicketType = "full" | "half" | "promotional" | "free";

export type AdminEventSummary = {
  eventId: string;
  title: string;
  artistName: string;
  city: string;
  state: string;
  status: AdminEventStatus;
  venueId: string | null;
  venueName: string | null;
  createdAt: string;
  sessionsCount: number;
  nextSessionStartsAt: string | null;
  nextSessionStatus: AdminSessionStatus | null;
};

export type AdminEventDetails = AdminEventSummary & {
  sessions: Array<{
    sessionId: string;
    startsAt: string;
    status: AdminSessionStatus;
    venueId: string | null;
    venueName: string | null;
  }>;
  sections: Array<{
    sectionId: string;
    name: string;
    slug: string;
    capacity: number | null;
    hasNumberedSeats: boolean;
    status: AdminSectionStatus;
  }>;
};

type EventRow = {
  id: string;
  title: string;
  artist_name: string;
  city: string;
  state: string;
  status: AdminEventStatus;
  venue_id: string | null;
  created_at: string;
  venues?: {
    name: string;
  } | null;
};

type SessionRow = {
  id: string;
  event_id: string;
  venue_id: string | null;
  starts_at: string;
  status: AdminSessionStatus;
  venues?: {
    name: string;
  } | null;
};

type SectionRow = {
  id: string;
  venue_id: string;
  name: string;
  slug: string;
  capacity: number | null;
  has_numbered_seats: boolean;
  status: AdminSectionStatus;
};

export function normalizeSlug(value: string) {
  return value
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export function parseBrazilianDateTime(value: string) {
  const match = value
    .trim()
    .match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:\s+|\s+às\s+)(\d{1,2}):(\d{2})$/i);

  if (!match) {
    return null;
  }

  const [, dayRaw, monthRaw, yearRaw, hourRaw, minuteRaw] = match;
  const day = Number(dayRaw);
  const month = Number(monthRaw);
  const year = Number(yearRaw);
  const hour = Number(hourRaw);
  const minute = Number(minuteRaw);

  if (
    month < 1 ||
    month > 12 ||
    day < 1 ||
    day > 31 ||
    hour < 0 ||
    hour > 23 ||
    minute < 0 ||
    minute > 59
  ) {
    return null;
  }

  const iso = `${year.toString().padStart(4, "0")}-${month
    .toString()
    .padStart(2, "0")}-${day.toString().padStart(2, "0")}T${hour
    .toString()
    .padStart(2, "0")}:${minute.toString().padStart(2, "0")}:00-03:00`;
  const parsed = new Date(iso);

  if (Number.isNaN(parsed.getTime())) {
    return null;
  }

  return parsed.toISOString();
}

export function parseMoneyToCents(value: string) {
  const withoutCurrency = value
    .trim()
    .replace(/^r\$\s*/i, "")
    .replace(/\s+/g, "");
  const hasComma = withoutCurrency.includes(",");
  const hasDot = withoutCurrency.includes(".");
  const normalized =
    hasComma && hasDot
      ? withoutCurrency.replace(/\./g, "").replace(",", ".")
      : hasComma
        ? withoutCurrency.replace(",", ".")
        : withoutCurrency;
  const amount = Number(normalized);

  if (!Number.isFinite(amount) || amount < 0) {
    return null;
  }

  return Math.round(amount * 100);
}

export function parseSeatCodes(value: string) {
  return Array.from(
    new Set(
      value
        .split(",")
        .map((code) => code.trim().toUpperCase())
        .filter(Boolean),
    ),
  );
}

export function parseSeatRange(value: string) {
  const match = value
    .trim()
    .match(/^(?:prefixo\s+)?([a-zA-Z]+)\s*,?\s*(?:de\s+)?(\d+)\s*(?:a|até|-)\s*(\d+)$/i);

  if (!match) {
    return null;
  }

  const [, prefix, startRaw, endRaw] = match;
  const start = Number(startRaw);
  const end = Number(endRaw);

  if (!Number.isInteger(start) || !Number.isInteger(end) || start < 1 || end < start) {
    return null;
  }

  const width = Math.max(startRaw.length, endRaw.length, 2);
  return Array.from({ length: end - start + 1 }, (_, index) => {
    const seatNumber = String(start + index).padStart(width, "0");
    return `${prefix.toUpperCase()}${seatNumber}`;
  });
}

export function parseSeatCodesOrRange(value: string) {
  return value.includes(",") ? parseSeatCodes(value) : parseSeatRange(value) ?? parseSeatCodes(value);
}

export function isEventStatus(value: string): value is AdminEventStatus {
  return ["draft", "published", "cancelled", "finished"].includes(value);
}

export function isSessionStatus(value: string): value is AdminSessionStatus {
  return [
    "scheduled",
    "sales_open",
    "sales_closed",
    "cancelled",
    "finished",
  ].includes(value);
}

export function isTicketType(value: string): value is AdminTicketType {
  return ["full", "half", "promotional", "free"].includes(value);
}

function toSummary(event: EventRow, sessions: SessionRow[]): AdminEventSummary {
  const eventSessions = sessions
    .filter((session) => session.event_id === event.id)
    .sort(
      (left, right) =>
        new Date(left.starts_at).getTime() - new Date(right.starts_at).getTime(),
    );
  const futureSession =
    eventSessions.find((session) => new Date(session.starts_at).getTime() >= Date.now()) ??
    null;

  return {
    eventId: event.id,
    title: event.title,
    artistName: event.artist_name,
    city: event.city,
    state: event.state,
    status: event.status,
    venueId: event.venue_id,
    venueName: event.venues?.name ?? null,
    createdAt: event.created_at,
    sessionsCount: eventSessions.length,
    nextSessionStartsAt: futureSession?.starts_at ?? null,
    nextSessionStatus: futureSession?.status ?? null,
  };
}

export async function listAdminEvents(input: {
  page?: number;
  search?: string | null;
}) {
  const page = Math.max(input.page ?? 0, 0);
  const supabase = getSupabaseAdmin();
  let query = supabase
    .from("events")
    .select("id, title, artist_name, city, state, status, venue_id, created_at, venues(name)");

  if (input.search?.trim()) {
    query = query.ilike("search_text", `%${input.search.trim().toLowerCase()}%`);
  }

  const { data: events, error } = await query
    .order("created_at", { ascending: false })
    .limit(50)
    .returns<EventRow[]>();

  if (error) {
    return { ok: false as const, error };
  }

  const eventIds = events.map((event) => event.id);
  const { data: sessions, error: sessionsError } = eventIds.length
    ? await supabase
        .from("event_sessions")
        .select("id, event_id, venue_id, starts_at, status, venues(name)")
        .in("event_id", eventIds)
        .order("starts_at", { ascending: true })
        .returns<SessionRow[]>()
    : { data: [] as SessionRow[], error: null };

  if (sessionsError) {
    return { ok: false as const, error: sessionsError };
  }

  const summaries = events
    .map((event) => toSummary(event, sessions ?? []))
    .sort((left, right) => {
      const leftTime = left.nextSessionStartsAt
        ? new Date(left.nextSessionStartsAt).getTime()
        : Number.MAX_SAFE_INTEGER;
      const rightTime = right.nextSessionStartsAt
        ? new Date(right.nextSessionStartsAt).getTime()
        : Number.MAX_SAFE_INTEGER;

      return leftTime - rightTime || right.createdAt.localeCompare(left.createdAt);
    });
  const offset = page * ADMIN_EVENTS_PAGE_SIZE;

  return {
    ok: true as const,
    events: summaries.slice(offset, offset + ADMIN_EVENTS_PAGE_SIZE),
    page,
    hasMore: offset + ADMIN_EVENTS_PAGE_SIZE < summaries.length,
  };
}

export async function getAdminEventDetails(eventId: string) {
  const supabase = getSupabaseAdmin();
  const { data: event, error } = await supabase
    .from("events")
    .select("id, title, artist_name, city, state, status, venue_id, created_at, venues(name)")
    .eq("id", eventId)
    .maybeSingle<EventRow>();

  if (error || !event) {
    return { ok: false as const, reason: "not_found" as const, error };
  }

  const { data: sessions, error: sessionsError } = await supabase
    .from("event_sessions")
    .select("id, event_id, venue_id, starts_at, status, venues(name)")
    .eq("event_id", eventId)
    .order("starts_at", { ascending: true })
    .returns<SessionRow[]>();

  if (sessionsError) {
    return { ok: false as const, reason: "database_error" as const, error: sessionsError };
  }

  const sectionVenueIds = Array.from(
    new Set([event.venue_id, ...(sessions ?? []).map((session) => session.venue_id)].filter(Boolean)),
  ) as string[];
  const { data: sections, error: sectionsError } = sectionVenueIds.length
    ? await supabase
        .from("venue_sections")
        .select("id, venue_id, name, slug, capacity, has_numbered_seats, status")
        .in("venue_id", sectionVenueIds)
        .order("sort_order", { ascending: true })
        .returns<SectionRow[]>()
    : { data: [] as SectionRow[], error: null };

  if (sectionsError) {
    return { ok: false as const, reason: "database_error" as const, error: sectionsError };
  }

  return {
    ok: true as const,
    event: {
      ...toSummary(event, sessions ?? []),
      sessions: (sessions ?? []).map((session) => ({
        sessionId: session.id,
        startsAt: session.starts_at,
        status: session.status,
        venueId: session.venue_id,
        venueName: session.venues?.name ?? event.venues?.name ?? null,
      })),
      sections: (sections ?? []).map((section) => ({
        sectionId: section.id,
        name: section.name,
        slug: section.slug,
        capacity: section.capacity,
        hasNumberedSeats: section.has_numbered_seats,
        status: section.status,
      })),
    } satisfies AdminEventDetails,
  };
}

export async function findOrCreateVenue(input: {
  name: string;
  city: string;
  state: string;
}) {
  const supabase = getSupabaseAdmin();
  const { data: existing, error: findError } = await supabase
    .from("venues")
    .select("id, name, city, state, status, created_at")
    .ilike("name", input.name.trim())
    .ilike("city", input.city.trim())
    .ilike("state", input.state.trim().toUpperCase())
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle<{ id: string; name: string }>();

  if (findError) {
    return { ok: false as const, error: findError };
  }

  if (existing) {
    return { ok: true as const, venueId: existing.id, created: false };
  }

  const { data, error } = await supabase
    .from("venues")
    .insert({
      name: input.name.trim(),
      city: input.city.trim(),
      state: input.state.trim().toUpperCase(),
      status: "active",
    })
    .select("id")
    .single<{ id: string }>();

  if (error) {
    return { ok: false as const, error };
  }

  return { ok: true as const, venueId: data.id, created: true };
}

export async function createAdminEvent(input: {
  title: string;
  artistName: string;
  city: string;
  state: string;
  venueName: string;
  startsAt: string;
  status: AdminEventStatus;
}) {
  const venue = await findOrCreateVenue({
    name: input.venueName,
    city: input.city,
    state: input.state,
  });

  if (!venue.ok) {
    return { ok: false as const, error: venue.error };
  }

  const supabase = getSupabaseAdmin();
  const { data: event, error: eventError } = await supabase
    .from("events")
    .insert({
      title: input.title.trim(),
      artist_name: input.artistName.trim(),
      city: input.city.trim(),
      state: input.state.trim().toUpperCase(),
      venue_id: venue.venueId,
      status: input.status,
    })
    .select("id")
    .single<{ id: string }>();

  if (eventError) {
    return { ok: false as const, error: eventError };
  }

  const sessionStatus: AdminSessionStatus =
    input.status === "published" ? "sales_open" : "scheduled";
  const { data: session, error: sessionError } = await supabase
    .from("event_sessions")
    .insert({
      event_id: event.id,
      venue_id: venue.venueId,
      starts_at: input.startsAt,
      status: sessionStatus,
    })
    .select("id")
    .single<{ id: string }>();

  if (sessionError) {
    await supabase.from("events").update({ status: "draft" }).eq("id", event.id);

    return {
      ok: false as const,
      error: sessionError,
      eventId: event.id,
      partialEventCreated: true as const,
    };
  }

  return {
    ok: true as const,
    eventId: event.id,
    sessionId: session.id,
    venueId: venue.venueId,
  };
}

export async function updateAdminEvent(
  eventId: string,
  values: Partial<{
    title: string;
    artist_name: string;
    city: string;
    state: string;
    venue_id: string | null;
    status: AdminEventStatus;
  }>,
) {
  const supabase = getSupabaseAdmin();
  const { error } = await supabase.from("events").update(values).eq("id", eventId);

  return error ? { ok: false as const, error } : { ok: true as const };
}

export async function createAdminSession(input: {
  eventId: string;
  venueId: string | null;
  startsAt: string;
  status: AdminSessionStatus;
}) {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("event_sessions")
    .insert({
      event_id: input.eventId,
      venue_id: input.venueId,
      starts_at: input.startsAt,
      status: input.status,
    })
    .select("id")
    .single<{ id: string }>();

  return error ? { ok: false as const, error } : { ok: true as const, sessionId: data.id };
}

export async function getAdminSessionUsage(sessionId: string) {
  const supabase = getSupabaseAdmin();
  const [
    { count: reservationsCount, error: reservationsError },
    { count: ticketsCount, error: ticketsError },
  ] = await Promise.all([
    supabase
      .from("reservations")
      .select("id", { count: "exact", head: true })
      .eq("session_id", sessionId),
    supabase
      .from("tickets")
      .select("id", { count: "exact", head: true })
      .eq("session_id", sessionId),
  ]);

  const error = reservationsError ?? ticketsError;
  if (error) {
    return { ok: false as const, error };
  }

  return {
    ok: true as const,
    reservationsCount: reservationsCount ?? 0,
    ticketsCount: ticketsCount ?? 0,
    hasUsage: (reservationsCount ?? 0) > 0 || (ticketsCount ?? 0) > 0,
  };
}

export async function getAdminSessionCatalogCounts(
  sessions: Array<{ sessionId: string; venueId: string | null }>,
) {
  const supabase = getSupabaseAdmin();
  const sessionIds = sessions.map((session) => session.sessionId);
  const venueIds = Array.from(
    new Set(sessions.map((session) => session.venueId).filter(Boolean)),
  ) as string[];

  const [
    { data: prices, error: pricesError },
    { data: sections, error: sectionsError },
  ] = await Promise.all([
    sessionIds.length
      ? supabase.from("ticket_prices").select("session_id").in("session_id", sessionIds)
      : Promise.resolve({ data: [] as Array<{ session_id: string }>, error: null }),
    venueIds.length
      ? supabase.from("venue_sections").select("venue_id").in("venue_id", venueIds)
      : Promise.resolve({ data: [] as Array<{ venue_id: string }>, error: null }),
  ]);

  const error = pricesError ?? sectionsError;
  if (error) {
    return { ok: false as const, error };
  }

  const priceCountBySession = new Map<string, number>();
  for (const price of prices ?? []) {
    priceCountBySession.set(
      price.session_id,
      (priceCountBySession.get(price.session_id) ?? 0) + 1,
    );
  }

  const sectionCountByVenue = new Map<string, number>();
  for (const section of sections ?? []) {
    sectionCountByVenue.set(
      section.venue_id,
      (sectionCountByVenue.get(section.venue_id) ?? 0) + 1,
    );
  }

  return {
    ok: true as const,
    getPricesCount: (sessionId: string) => priceCountBySession.get(sessionId) ?? 0,
    getSectionsCount: (venueId: string | null) =>
      venueId ? (sectionCountByVenue.get(venueId) ?? 0) : 0,
  };
}

export async function updateAdminSession(
  sessionId: string,
  values: Partial<{ starts_at: string; venue_id: string | null; status: AdminSessionStatus }>,
) {
  const supabase = getSupabaseAdmin();
  const { error } = await supabase
    .from("event_sessions")
    .update(values)
    .eq("id", sessionId);

  return error ? { ok: false as const, error } : { ok: true as const };
}

export async function listAdminSections(venueId: string, sessionId?: string) {
  const supabase = getSupabaseAdmin();
  const { data: sections, error } = await supabase
    .from("venue_sections")
    .select("id, venue_id, name, slug, capacity, has_numbered_seats, status")
    .eq("venue_id", venueId)
    .order("sort_order", { ascending: true })
    .returns<SectionRow[]>();

  if (error) {
    return { ok: false as const, error };
  }

  const seatCounts = new Map<string, number>();
  const sessionSeatCounts = new Map<string, number>();

  if (sections.length) {
    const sectionIds = sections.map((section) => section.id);
    const { data: seats } = await supabase
      .from("seats")
      .select("section_id")
      .in("section_id", sectionIds);

    seats?.forEach((seat) => {
      seatCounts.set(seat.section_id, (seatCounts.get(seat.section_id) ?? 0) + 1);
    });

    if (sessionId) {
      const { data: sessionSeats } = await supabase
        .from("session_seats")
        .select("section_id")
        .eq("session_id", sessionId)
        .in("section_id", sectionIds);

      sessionSeats?.forEach((seat) => {
        sessionSeatCounts.set(
          seat.section_id,
          (sessionSeatCounts.get(seat.section_id) ?? 0) + 1,
        );
      });
    }
  }

  return {
    ok: true as const,
    sections: sections.map((section) => ({
      sectionId: section.id,
      name: section.name,
      slug: section.slug,
      capacity: section.capacity,
      hasNumberedSeats: section.has_numbered_seats,
      status: section.status,
      seatsCount: seatCounts.get(section.id) ?? 0,
      sessionSeatsCount: sessionSeatCounts.get(section.id) ?? 0,
    })),
  };
}

export async function createAdminSection(input: {
  venueId: string;
  name: string;
  slug: string;
  hasNumberedSeats: boolean;
  capacity: number | null;
}) {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("venue_sections")
    .insert({
      venue_id: input.venueId,
      name: input.name.trim(),
      slug: input.slug,
      has_numbered_seats: input.hasNumberedSeats,
      capacity: input.capacity,
      status: "active",
    })
    .select("id")
    .single<{ id: string }>();

  return error ? { ok: false as const, error } : { ok: true as const, sectionId: data.id };
}

export async function updateAdminSection(
  sectionId: string,
  values: Partial<{
    name: string;
    capacity: number | null;
    status: AdminSectionStatus;
    has_numbered_seats: boolean;
  }>,
) {
  const supabase = getSupabaseAdmin();
  const { error } = await supabase
    .from("venue_sections")
    .update(values)
    .eq("id", sectionId);

  return error ? { ok: false as const, error } : { ok: true as const };
}

export async function getAdminSectionUsage(sectionId: string) {
  const supabase = getSupabaseAdmin();
  const [
    { count: reservationItemsCount, error: reservationItemsError },
    { count: ticketsCount, error: ticketsError },
    { count: busySessionSeatsCount, error: sessionSeatsError },
  ] = await Promise.all([
    supabase
      .from("reservation_items")
      .select("id", { count: "exact", head: true })
      .eq("section_id", sectionId),
    supabase
      .from("tickets")
      .select("id", { count: "exact", head: true })
      .eq("section_id", sectionId),
    supabase
      .from("session_seats")
      .select("id", { count: "exact", head: true })
      .eq("section_id", sectionId)
      .in("status", ["reserved", "sold"]),
  ]);

  const error = reservationItemsError ?? ticketsError ?? sessionSeatsError;
  if (error) {
    return { ok: false as const, error };
  }

  return {
    ok: true as const,
    reservationItemsCount: reservationItemsCount ?? 0,
    ticketsCount: ticketsCount ?? 0,
    busySessionSeatsCount: busySessionSeatsCount ?? 0,
    hasUsage:
      (reservationItemsCount ?? 0) > 0 ||
      (ticketsCount ?? 0) > 0 ||
      (busySessionSeatsCount ?? 0) > 0,
  };
}

export async function createAdminSeats(input: {
  venueId: string;
  sectionId: string;
  seatCodes: string[];
}) {
  const supabase = getSupabaseAdmin();
  const { data: existing } = await supabase
    .from("seats")
    .select("seat_code")
    .eq("section_id", input.sectionId)
    .in("seat_code", input.seatCodes);
  const existingCodes = new Set(existing?.map((seat) => seat.seat_code) ?? []);
  const rows = input.seatCodes
    .filter((code) => !existingCodes.has(code))
    .map((code) => {
      const match = code.match(/^([A-Z]+)(.+)$/);

      return {
        venue_id: input.venueId,
        section_id: input.sectionId,
        row_label: match?.[1] ?? null,
        seat_number: match?.[2] ?? code,
        seat_code: code,
        status: "active",
      };
    });

  if (!rows.length) {
    return { ok: true as const, createdCount: 0, skippedCount: input.seatCodes.length };
  }

  const { error } = await supabase.from("seats").insert(rows);

  return error
    ? { ok: false as const, error }
    : {
        ok: true as const,
        createdCount: rows.length,
        skippedCount: input.seatCodes.length - rows.length,
      };
}

export async function getAdminSeatOperationalUsage(input: {
  sectionId: string;
  seatCodes: string[];
}) {
  const supabase = getSupabaseAdmin();
  const { data: seats, error: seatsError } = await supabase
    .from("seats")
    .select("id")
    .eq("section_id", input.sectionId)
    .in("seat_code", input.seatCodes);

  if (seatsError) {
    return { ok: false as const, error: seatsError };
  }

  const seatIds = seats?.map((seat) => seat.id) ?? [];
  const { count, error } = seatIds.length
    ? await supabase
        .from("session_seats")
        .select("id", { count: "exact", head: true })
        .in("seat_id", seatIds)
        .in("status", ["reserved", "sold"])
    : { count: 0, error: null };

  if (error) {
    return { ok: false as const, error };
  }

  return {
    ok: true as const,
    busyCount: count ?? 0,
    hasBusySeats: (count ?? 0) > 0,
  };
}

export async function updateAdminSeatStatuses(input: {
  sectionId: string;
  seatCodes: string[];
  status: AdminSeatStatus;
}) {
  const supabase = getSupabaseAdmin();
  const { data: seats, error: findError } = await supabase
    .from("seats")
    .select("id, seat_code")
    .eq("section_id", input.sectionId)
    .in("seat_code", input.seatCodes);

  if (findError) {
    return { ok: false as const, error: findError };
  }

  const foundCodes = new Set(seats?.map((seat) => seat.seat_code) ?? []);
  const missingCount = input.seatCodes.filter((code) => !foundCodes.has(code)).length;

  if (!seats?.length) {
    return { ok: true as const, updatedCount: 0, missingCount };
  }

  const { error } = await supabase
    .from("seats")
    .update({ status: input.status })
    .in(
      "id",
      seats.map((seat) => seat.id),
    );

  return error
    ? { ok: false as const, error }
    : { ok: true as const, updatedCount: seats.length, missingCount };
}

export async function createMissingSessionSeats(input: {
  sessionId: string;
  sectionIds: string[];
}) {
  const supabase = getSupabaseAdmin();
  const { data: seats, error: seatsError } = await supabase
    .from("seats")
    .select("id, section_id")
    .eq("status", "active")
    .in("section_id", input.sectionIds);

  if (seatsError) {
    return { ok: false as const, error: seatsError };
  }

  const seatIds = seats?.map((seat) => seat.id) ?? [];
  const { data: existing } = seatIds.length
    ? await supabase
        .from("session_seats")
        .select("seat_id")
        .eq("session_id", input.sessionId)
        .in("seat_id", seatIds)
    : { data: [] as Array<{ seat_id: string }> };
  const existingIds = new Set(existing?.map((seat) => seat.seat_id) ?? []);
  const rows =
    seats
      ?.filter((seat) => !existingIds.has(seat.id))
      .map((seat) => ({
        session_id: input.sessionId,
        seat_id: seat.id,
        section_id: seat.section_id,
        status: "available",
      })) ?? [];

  if (!rows.length) {
    return { ok: true as const, createdCount: 0, skippedCount: seatIds.length };
  }

  const { error } = await supabase.from("session_seats").insert(rows);

  return error
    ? { ok: false as const, error }
    : { ok: true as const, createdCount: rows.length, skippedCount: seatIds.length - rows.length };
}

export async function listAdminPrices(input: { sessionId: string; sectionId?: string }) {
  const supabase = getSupabaseAdmin();
  let query = supabase
    .from("ticket_prices")
    .select("id, session_id, section_id, ticket_type, label, price_cents, fee_cents, currency, sales_start_at, sales_end_at, status, venue_sections(name)")
    .eq("session_id", input.sessionId);

  if (input.sectionId) {
    query = query.eq("section_id", input.sectionId);
  }

  const { data, error } = await query.order("created_at", { ascending: true });

  return error ? { ok: false as const, error } : { ok: true as const, prices: data ?? [] };
}

export async function createAdminPrice(input: {
  sessionId: string;
  sectionId: string;
  ticketType: AdminTicketType;
  label: string;
  priceCents: number;
  feeCents: number;
  salesStartAt: string | null;
  salesEndAt: string | null;
}) {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("ticket_prices")
    .insert({
      session_id: input.sessionId,
      section_id: input.sectionId,
      ticket_type: input.ticketType,
      label: input.label.trim(),
      price_cents: input.priceCents,
      fee_cents: input.feeCents,
      currency: "BRL",
      sales_start_at: input.salesStartAt,
      sales_end_at: input.salesEndAt,
      status: "active",
    })
    .select("id")
    .single<{ id: string }>();

  return error ? { ok: false as const, error } : { ok: true as const, priceId: data.id };
}

export async function updateAdminPrice(
  priceId: string,
  values: Partial<{
    label: string;
    price_cents: number;
    fee_cents: number;
    sales_start_at: string | null;
    sales_end_at: string | null;
    status: AdminTicketPriceStatus;
  }>,
) {
  const supabase = getSupabaseAdmin();
  const { error } = await supabase
    .from("ticket_prices")
    .update(values)
    .eq("id", priceId);

  return error ? { ok: false as const, error } : { ok: true as const };
}
