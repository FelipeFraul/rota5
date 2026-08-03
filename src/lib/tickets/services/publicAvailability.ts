import "server-only";

import { getSupabaseAdmin } from "@/lib/supabase/admin";

export type PublicAvailabilityStatus =
  | "available"
  | "sold_out"
  | "sales_closed"
  | "unavailable"
  | "cancelled"
  | "paused";

export type PublicAvailabilityInput = {
  eventStatus?: string | null;
  sessionStatus?: string | null;
  eventVenueStatus?: string | null;
  sessionVenueStatus?: string | null;
  activeSalesOptionsCount?: number | null;
  endedSalesOptionsCount?: number | null;
  futureSalesOptionsCount?: number | null;
  availableCapacity?: number | null;
  totalCapacity?: number | null;
};

type PublicAvailabilityPriceRow = {
  sales_start_at: string | null;
  sales_end_at: string | null;
  venue_sections: {
    id: string;
    venue_id: string | null;
    status: string;
    capacity: number | null;
    has_numbered_seats: boolean;
    venues: { status: string } | null;
  } | null;
};

type PublicAvailabilitySeatRow = {
  status: string;
  section_id: string;
  seats: { status: string } | null;
  venue_sections: {
    venue_id: string | null;
    status: string;
    venues: { status: string } | null;
  } | null;
};

type PublicAvailabilitySessionRow = {
  id: string;
  venue_id: string | null;
  starts_at: string;
  timezone: string | null;
  status: string;
  events: {
    status: string;
    venue_id: string | null;
    venues: { status: string } | null;
  } | null;
  venues: { status: string } | null;
};

export const PUBLIC_LISTABLE_AVAILABILITY_STATUSES = [
  "available",
  "sold_out",
  "sales_closed",
] as const satisfies readonly PublicAvailabilityStatus[];

const PAUSED_EVENT_STATUSES = new Set(["draft", "paused"]);
const CANCELLED_STATUSES = new Set(["cancelled"]);
const CLOSED_SESSION_STATUSES = new Set(["sales_closed", "finished"]);
const PURCHASABLE_SESSION_STATUSES = new Set(["scheduled", "sales_open"]);

function positive(value?: number | null) {
  return Number.isFinite(value) && Number(value) > 0;
}

function normalizeStatus(value?: string | null) {
  return value?.trim().toLowerCase() || null;
}

function isActiveVenueSection(
  section: {
    venue_id?: string | null;
    status?: string | null;
    venues?: { status?: string | null } | null;
  } | null,
  venueId?: string | null,
) {
  if (!section) return false;
  if (venueId && section.venue_id !== venueId) return false;
  return section.status === "active" && section.venues?.status === "active";
}

function isInsideSalesWindow(
  price: { sales_start_at: string | null; sales_end_at: string | null },
  nowIso: string,
) {
  return (
    (!price.sales_start_at || price.sales_start_at <= nowIso) &&
    (!price.sales_end_at || price.sales_end_at >= nowIso)
  );
}

function isEndedSalesWindow(
  price: { sales_end_at: string | null },
  nowIso: string,
) {
  return Boolean(price.sales_end_at && price.sales_end_at < nowIso);
}

function isFutureSalesWindow(
  price: { sales_start_at: string | null },
  nowIso: string,
) {
  return Boolean(price.sales_start_at && price.sales_start_at > nowIso);
}

export function isPublicAvailabilityListable(status: PublicAvailabilityStatus) {
  return PUBLIC_LISTABLE_AVAILABILITY_STATUSES.includes(
    status as (typeof PUBLIC_LISTABLE_AVAILABILITY_STATUSES)[number],
  );
}

export function classifyPublicAvailability(
  input: PublicAvailabilityInput,
): PublicAvailabilityStatus {
  const eventStatus = normalizeStatus(input.eventStatus);
  const sessionStatus = normalizeStatus(input.sessionStatus);
  const eventVenueStatus = normalizeStatus(input.eventVenueStatus);
  const sessionVenueStatus = normalizeStatus(input.sessionVenueStatus);

  if (
    CANCELLED_STATUSES.has(eventStatus ?? "") ||
    CANCELLED_STATUSES.has(sessionStatus ?? "")
  ) {
    return "cancelled";
  }

  if (PAUSED_EVENT_STATUSES.has(eventStatus ?? "")) {
    return "paused";
  }

  if (
    eventStatus !== "published" ||
    eventVenueStatus === "inactive" ||
    sessionVenueStatus === "inactive"
  ) {
    return "unavailable";
  }

  if (CLOSED_SESSION_STATUSES.has(sessionStatus ?? "")) {
    return "sales_closed";
  }

  if (!PURCHASABLE_SESSION_STATUSES.has(sessionStatus ?? "")) {
    return "unavailable";
  }

  const hasActiveSalesOptions = positive(input.activeSalesOptionsCount);
  const hasEndedSalesOptions = positive(input.endedSalesOptionsCount);
  const hasFutureSalesOptions = positive(input.futureSalesOptionsCount);

  if (!hasActiveSalesOptions) {
    return hasEndedSalesOptions && !hasFutureSalesOptions
      ? "sales_closed"
      : "unavailable";
  }

  if (positive(input.availableCapacity)) {
    return "available";
  }

  return positive(input.totalCapacity) ? "sold_out" : "unavailable";
}

export async function getPublicAvailabilityStatusForSession({
  sessionId,
  venueId,
  eventStatus,
  sessionStatus,
  eventVenueStatus,
  sessionVenueStatus,
  now = new Date(),
}: {
  sessionId: string;
  venueId?: string | null;
  eventStatus?: string | null;
  sessionStatus?: string | null;
  eventVenueStatus?: string | null;
  sessionVenueStatus?: string | null;
  now?: Date;
}) {
  const normalizedEventStatus = normalizeStatus(eventStatus);
  const normalizedSessionStatus = normalizeStatus(sessionStatus);

  if (
    CANCELLED_STATUSES.has(normalizedEventStatus ?? "") ||
    CANCELLED_STATUSES.has(normalizedSessionStatus ?? "") ||
    PAUSED_EVENT_STATUSES.has(normalizedEventStatus ?? "") ||
    normalizedEventStatus !== "published" ||
    CLOSED_SESSION_STATUSES.has(normalizedSessionStatus ?? "") ||
    !PURCHASABLE_SESSION_STATUSES.has(normalizedSessionStatus ?? "")
  ) {
    return classifyPublicAvailability({
      eventStatus,
      sessionStatus,
      eventVenueStatus,
      sessionVenueStatus,
    });
  }

  const supabase = getSupabaseAdmin();
  const nowIso = now.toISOString();
  const { data: prices, error: pricesError } = await supabase
    .from("ticket_prices")
    .select(
      "sales_start_at, sales_end_at, venue_sections!inner(id, venue_id, status, capacity, has_numbered_seats, venues!inner(status))",
    )
    .eq("session_id", sessionId)
    .eq("status", "active")
    .neq("ticket_type", "free")
    .returns<PublicAvailabilityPriceRow[]>();

  if (pricesError) throw pricesError;

  const effectivePrices = (prices ?? []).filter((price) =>
    isActiveVenueSection(price.venue_sections, venueId),
  );
  const activeSalesOptionsCount = effectivePrices.filter((price) =>
    isInsideSalesWindow(price, nowIso),
  ).length;
  const endedSalesOptionsCount = effectivePrices.filter((price) =>
    isEndedSalesWindow(price, nowIso),
  ).length;
  const futureSalesOptionsCount = effectivePrices.filter((price) =>
    isFutureSalesWindow(price, nowIso),
  ).length;
  const activeSectionIds = new Set(
    effectivePrices
      .map((price) => price.venue_sections?.id)
      .filter((sectionId): sectionId is string => Boolean(sectionId)),
  );
  const hasUnlimitedActiveSection = effectivePrices.some((price) => {
    const section = price.venue_sections;
    return (
      section &&
      activeSectionIds.has(section.id) &&
      !section.has_numbered_seats &&
      section.capacity === null
    );
  });

  if (hasUnlimitedActiveSection && activeSalesOptionsCount > 0) {
    return classifyPublicAvailability({
      eventStatus,
      sessionStatus,
      eventVenueStatus,
      sessionVenueStatus,
      activeSalesOptionsCount,
      endedSalesOptionsCount,
      futureSalesOptionsCount,
      availableCapacity: 999_999,
      totalCapacity: 999_999,
    });
  }

  const { data: seats, error: seatsError } = await supabase
    .from("session_seats")
    .select(
      "section_id, status, seats!inner(status), venue_sections!inner(venue_id, status, venues!inner(status))",
    )
    .eq("session_id", sessionId)
    .returns<PublicAvailabilitySeatRow[]>();

  if (seatsError) throw seatsError;

  const effectiveSeats = (seats ?? []).filter(
    (seat) =>
      activeSectionIds.has(seat.section_id) &&
      isActiveVenueSection(seat.venue_sections, venueId),
  );

  return classifyPublicAvailability({
    eventStatus,
    sessionStatus,
    eventVenueStatus,
    sessionVenueStatus,
    activeSalesOptionsCount,
    endedSalesOptionsCount,
    futureSalesOptionsCount,
    availableCapacity: effectiveSeats.filter(
      (seat) => seat.status === "available" && seat.seats?.status === "active",
    ).length,
    totalCapacity: effectiveSeats.length,
  });
}

export async function getCurrentPublicAvailabilityStatusForSession({
  eventId,
  sessionId,
  now = new Date(),
}: {
  eventId: string;
  sessionId: string;
  now?: Date;
}) {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("event_sessions")
    .select(
      "id, venue_id, starts_at, timezone, status, venues!event_sessions_venue_id_fkey(status), events!inner(status, venue_id, venues(status))",
    )
    .eq("id", sessionId)
    .eq("event_id", eventId)
    .maybeSingle<PublicAvailabilitySessionRow>();

  if (error) throw error;

  if (!data?.events || new Date(data.starts_at).getTime() <= now.getTime()) {
    return "unavailable";
  }

  return getPublicAvailabilityStatusForSession({
    sessionId: data.id,
    venueId: data.venue_id ?? data.events.venue_id,
    eventStatus: data.events.status,
    sessionStatus: data.status,
    eventVenueStatus: data.events.venues?.status,
    sessionVenueStatus: data.venues?.status,
    now,
  });
}
