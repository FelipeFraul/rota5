import "server-only";

import { getSupabaseAdmin } from "@/lib/supabase/admin";
import {
  ROTA5_PRESENTATION_COURTESY_ENABLED,
  ROTA5_PRESENTATION_INDIVIDUAL_TICKETS_ONLY,
  isRota5PresentationTableLikeSectionName,
} from "@/lib/tickets/rota5Presentation";

export type AvailableSectionTicketType = {
  ticketPriceId: string;
  ticketType: string;
  label: string;
  priceCents: number;
  feeCents: number;
  currency: string;
};

export type AvailableSection = {
  sectionId: string;
  sectionName: string;
  venueId: string;
  hasNumberedSeats: boolean;
  hasUnlimitedCapacity: boolean;
  availableSeatsCount: number;
  minPriceCents: number;
  minFeeCents: number;
  ticketTypes: AvailableSectionTicketType[];
};

type SessionSeatRow = {
  section_id: string;
  seats: { status: string } | null;
};

type VenueSectionRow = {
  id: string;
  venue_id: string;
  name: string;
  capacity: number | null;
  has_numbered_seats: boolean;
  sort_order: number;
  venues: { status: string } | null;
};

type TicketPriceRow = {
  id: string;
  section_id: string;
  ticket_type: string;
  label: string;
  price_cents: number;
  fee_cents: number;
  currency: string;
  sales_start_at: string | null;
  sales_end_at: string | null;
};

type EventSessionRow = {
  event_id: string;
};

type CourtesySectionLimitRow = {
  section_id: string;
  label: string;
  max_courtesies: number;
  status: string;
};

function isPriceInsideSalesWindow(price: TicketPriceRow, nowIso: string) {
  return (
    (!price.sales_start_at || price.sales_start_at <= nowIso) &&
    (!price.sales_end_at || price.sales_end_at >= nowIso)
  );
}

function findCheapestTicketType(ticketTypes: AvailableSectionTicketType[]) {
  return ticketTypes.reduce((cheapest, current) => {
    const cheapestTotal = cheapest.priceCents + cheapest.feeCents;
    const currentTotal = current.priceCents + current.feeCents;

    return currentTotal < cheapestTotal ? current : cheapest;
  });
}

function sortTicketTypes(
  left: AvailableSectionTicketType,
  right: AvailableSectionTicketType,
) {
  const leftTotal = left.priceCents + left.feeCents;
  const rightTotal = right.priceCents + right.feeCents;

  return (
    leftTotal - rightTotal ||
    left.label.localeCompare(right.label) ||
    left.ticketType.localeCompare(right.ticketType)
  );
}

function filterPresentationTicketTypes(
  ticketTypes: AvailableSectionTicketType[],
) {
  if (!ROTA5_PRESENTATION_INDIVIDUAL_TICKETS_ONLY) return ticketTypes;

  return [...ticketTypes]
    .filter((ticketType) => ticketType.ticketType !== "free")
    .sort(sortTicketTypes)
    .slice(0, 1);
}

function normalizeCourtesyLabel(label: string | null | undefined) {
  const normalized = (label ?? "").trim();
  return normalized || "Cortesia";
}

async function ensureCourtesyTicketPrice({
  sessionId,
  sectionId,
  label,
}: {
  sessionId: string;
  sectionId: string;
  label: string;
}) {
  const supabase = getSupabaseAdmin();
  const normalizedLabel = normalizeCourtesyLabel(label);
  const { data: existingRows, error: existingError } = await supabase
    .from("ticket_prices")
    .select("id")
    .eq("session_id", sessionId)
    .eq("section_id", sectionId)
    .eq("ticket_type", "free")
    .order("created_at", { ascending: true })
    .limit(1)
    .returns<Array<{ id: string }>>();

  if (existingError) throw existingError;

  const existing = existingRows?.[0];
  if (existing) {
    const { error } = await supabase
      .from("ticket_prices")
      .update({
        status: "active",
        price_cents: 0,
        fee_cents: 0,
        label: normalizedLabel,
      })
      .eq("id", existing.id);

    if (error) throw error;
    return existing.id;
  }

  const { data, error } = await supabase
    .from("ticket_prices")
    .insert({
      session_id: sessionId,
      section_id: sectionId,
      ticket_type: "free",
      label: normalizedLabel,
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

async function countIssuedFreeTicketsForSection({
  eventId,
  sectionId,
}: {
  eventId: string;
  sectionId: string;
}) {
  const supabase = getSupabaseAdmin();
  const { count, error } = await supabase
    .from("tickets")
    .select(
      "id, event_sessions!inner(event_id), orders!inner(status), reservation_items!inner(ticket_type)",
      { count: "exact", head: true },
    )
    .eq("event_sessions.event_id", eventId)
    .eq("section_id", sectionId)
    .neq("status", "cancelled")
    .eq("orders.status", "paid")
    .eq("reservation_items.ticket_type", "free");

  if (error) throw error;
  return count ?? 0;
}

export async function listAvailableSections(
  sessionId: string,
  options: { venueId?: string | null } = {},
): Promise<AvailableSection[]> {
  const supabase = getSupabaseAdmin();
  const nowIso = new Date().toISOString();
  const { data: sessionSeats, error: seatsError } = await supabase
    .from("session_seats")
    .select("section_id, seats!inner(status)")
    .eq("session_id", sessionId)
    .eq("status", "available")
    .eq("seats.status", "active")
    .returns<SessionSeatRow[]>();

  if (seatsError) {
    throw seatsError;
  }

  const availableSeatsBySection = new Map<string, number>();

  for (const seat of sessionSeats ?? []) {
    availableSeatsBySection.set(
      seat.section_id,
      (availableSeatsBySection.get(seat.section_id) ?? 0) + 1,
    );
  }

  const { data: sessionPrices, error: sessionPricesError } = await supabase
    .from("ticket_prices")
    .select(
      "id, section_id, ticket_type, label, price_cents, fee_cents, currency, sales_start_at, sales_end_at",
    )
    .eq("session_id", sessionId)
    .eq("status", "active")
    .neq("ticket_type", "free")
    .returns<TicketPriceRow[]>();

  if (sessionPricesError) {
    throw sessionPricesError;
  }

  const { data: selectedSession, error: sessionError } = await supabase
    .from("event_sessions")
    .select("event_id")
    .eq("id", sessionId)
    .maybeSingle<EventSessionRow>();

  if (sessionError) {
    throw sessionError;
  }

  const { data: courtesyLimits, error: courtesyLimitsError } = selectedSession?.event_id
    ? await supabase
        .from("courtesy_section_limits")
        .select("section_id, label, max_courtesies, status")
        .eq("event_id", selectedSession.event_id)
        .eq("status", "active")
        .gt("max_courtesies", 0)
        .returns<CourtesySectionLimitRow[]>()
    : { data: [] as CourtesySectionLimitRow[], error: null };

  if (courtesyLimitsError) {
    throw courtesyLimitsError;
  }

  const sectionIds = Array.from(
    new Set([
      ...availableSeatsBySection.keys(),
      ...(sessionPrices ?? []).map((price) => price.section_id),
      ...(courtesyLimits ?? []).map((limit) => limit.section_id),
    ]),
  );

  if (sectionIds.length === 0) return [];

  const { data: sections, error: sectionsError } = await supabase
    .from("venue_sections")
    .select("id, venue_id, name, capacity, has_numbered_seats, sort_order, venues!inner(status)")
    .in("id", sectionIds)
    .eq("status", "active")
    .eq("venues.status", "active")
    .returns<VenueSectionRow[]>();

  if (sectionsError) {
    throw sectionsError;
  }

  const filteredSections = (sections ?? []).filter(
    (section) => !options.venueId || section.venue_id === options.venueId,
  );
  const activeSectionIds = filteredSections.map((section) => section.id);

  if (activeSectionIds.length === 0) {
    return [];
  }

  const ticketTypesBySection = new Map<string, AvailableSectionTicketType[]>();

  for (const price of sessionPrices ?? []) {
    if (!activeSectionIds.includes(price.section_id)) {
      continue;
    }

    if (!isPriceInsideSalesWindow(price, nowIso)) {
      continue;
    }

    const ticketTypes = ticketTypesBySection.get(price.section_id) ?? [];

    ticketTypes.push({
      ticketPriceId: price.id,
      ticketType: price.ticket_type,
      label: price.label,
      priceCents: price.price_cents,
      feeCents: price.fee_cents,
      currency: price.currency,
    });

    ticketTypesBySection.set(price.section_id, ticketTypes);
  }

  if (ROTA5_PRESENTATION_COURTESY_ENABLED && selectedSession?.event_id) {
    for (const limit of courtesyLimits ?? []) {
      if (!activeSectionIds.includes(limit.section_id)) {
        continue;
      }

      const issuedFreeTickets = await countIssuedFreeTicketsForSection({
        eventId: selectedSession.event_id,
        sectionId: limit.section_id,
      });

      if (issuedFreeTickets >= limit.max_courtesies) {
        continue;
      }

      const ticketPriceId = await ensureCourtesyTicketPrice({
        sessionId,
        sectionId: limit.section_id,
        label: limit.label,
      });
      const ticketTypes = ticketTypesBySection.get(limit.section_id) ?? [];

      if (!ticketTypes.some((ticketType) => ticketType.ticketPriceId === ticketPriceId)) {
        ticketTypes.push({
          ticketPriceId,
          ticketType: "free",
          label: normalizeCourtesyLabel(limit.label),
          priceCents: 0,
          feeCents: 0,
          currency: "BRL",
        });
      }

      ticketTypesBySection.set(limit.section_id, ticketTypes);
    }
  }

  const sectionSortOrderById = new Map(
    filteredSections.map((section) => [section.id, section.sort_order]),
  );

  return filteredSections
    .flatMap((section) => {
      const ticketTypes = filterPresentationTicketTypes(
        ticketTypesBySection.get(section.id) ?? [],
      );
      const hasUnlimitedCapacity =
        !section.has_numbered_seats && section.capacity === null;
      const availableSeatsCount =
        availableSeatsBySection.get(section.id) ??
        (hasUnlimitedCapacity ? 999_999 : 0);

      if (
        ticketTypes.length === 0 ||
        availableSeatsCount <= 0 ||
        (ROTA5_PRESENTATION_INDIVIDUAL_TICKETS_ONLY &&
          isRota5PresentationTableLikeSectionName(section.name))
      ) {
        return [];
      }

      ticketTypes.sort(sortTicketTypes);

      const cheapest = findCheapestTicketType(ticketTypes);

      return [
        {
          sectionId: section.id,
          sectionName: section.name,
          venueId: section.venue_id,
          hasNumberedSeats: section.has_numbered_seats,
          hasUnlimitedCapacity,
          availableSeatsCount,
          minPriceCents: cheapest.priceCents,
          minFeeCents: cheapest.feeCents,
          ticketTypes,
        },
      ];
    })
    .sort(
      (left, right) =>
        (sectionSortOrderById.get(left.sectionId) ?? 0) -
          (sectionSortOrderById.get(right.sectionId) ?? 0) ||
        left.sectionName.localeCompare(right.sectionName),
    );
}

export async function getAvailableSectionForSession({
  sessionId,
  sectionId,
  venueId,
}: {
  sessionId: string;
  sectionId: string;
  venueId?: string | null;
}): Promise<AvailableSection | null> {
  const sections = await listAvailableSections(sessionId, { venueId });

  return sections.find((section) => section.sectionId === sectionId) ?? null;
}
