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
  hasNumberedSeats: boolean;
  availableSeatsCount: number;
  minPriceCents: number;
  minFeeCents: number;
  ticketTypes: AvailableSectionTicketType[];
};

type SessionSeatRow = {
  section_id: string;
};

type VenueSectionRow = {
  id: string;
  name: string;
  has_numbered_seats: boolean;
  sort_order: number;
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

export async function listAvailableSections(
  sessionId: string,
): Promise<AvailableSection[]> {
  const supabase = getSupabaseAdmin();
  const nowIso = new Date().toISOString();
  const { data: sessionSeats, error: seatsError } = await supabase
    .from("session_seats")
    .select("section_id")
    .eq("session_id", sessionId)
    .eq("status", "available")
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

  const sectionIds = Array.from(availableSeatsBySection.keys());

  if (sectionIds.length === 0) {
    return [];
  }

  const { data: sections, error: sectionsError } = await supabase
    .from("venue_sections")
    .select("id, name, has_numbered_seats, sort_order")
    .in("id", sectionIds)
    .eq("status", "active")
    .returns<VenueSectionRow[]>();

  if (sectionsError) {
    throw sectionsError;
  }

  const activeSectionIds = (sections ?? []).map((section) => section.id);

  if (activeSectionIds.length === 0) {
    return [];
  }

  const { data: prices, error: pricesError } = await supabase
    .from("ticket_prices")
    .select(
      "id, section_id, ticket_type, label, price_cents, fee_cents, currency, sales_start_at, sales_end_at",
    )
    .eq("session_id", sessionId)
    .eq("status", "active")
    .in("section_id", activeSectionIds)
    .returns<TicketPriceRow[]>();

  if (pricesError) {
    throw pricesError;
  }

  const ticketTypesBySection = new Map<string, AvailableSectionTicketType[]>();

  for (const price of prices ?? []) {
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

  return (sections ?? [])
    .flatMap((section) => {
      const ticketTypes = ticketTypesBySection.get(section.id) ?? [];

      if (ticketTypes.length === 0) {
        return [];
      }

      ticketTypes.sort((left, right) => {
        const leftTotal = left.priceCents + left.feeCents;
        const rightTotal = right.priceCents + right.feeCents;

        return leftTotal - rightTotal || left.label.localeCompare(right.label);
      });

      const cheapest = findCheapestTicketType(ticketTypes);

      return [
        {
          sectionId: section.id,
          sectionName: section.name,
          hasNumberedSeats: section.has_numbered_seats,
          availableSeatsCount: availableSeatsBySection.get(section.id) ?? 0,
          minPriceCents: cheapest.priceCents,
          minFeeCents: cheapest.feeCents,
          ticketTypes,
        },
      ];
    })
    .sort(
      (left, right) =>
        ((sections ?? []).find((section) => section.id === left.sectionId)
          ?.sort_order ?? 0) -
          ((sections ?? []).find((section) => section.id === right.sectionId)
            ?.sort_order ?? 0) || left.sectionName.localeCompare(right.sectionName),
    );
}
