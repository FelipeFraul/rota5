import "server-only";

import { getSupabaseAdmin } from "@/lib/supabase/admin";

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
    .returns<TicketPriceRow[]>();

  if (sessionPricesError) {
    throw sessionPricesError;
  }

  const sectionIds = Array.from(
    new Set([
      ...availableSeatsBySection.keys(),
      ...(sessionPrices ?? []).map((price) => price.section_id),
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

  const sectionSortOrderById = new Map(
    filteredSections.map((section) => [section.id, section.sort_order]),
  );

  return filteredSections
    .flatMap((section) => {
      const ticketTypes = ticketTypesBySection.get(section.id) ?? [];
      const availableSeatsCount =
        availableSeatsBySection.get(section.id) ??
        (!section.has_numbered_seats && section.capacity === null ? 999_999 : 0);

      if (ticketTypes.length === 0 || availableSeatsCount <= 0) {
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
