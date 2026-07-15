import "server-only";

import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { listAvailableSections } from "@/lib/tickets/services/sections";

const DEFAULT_EVENT_SEARCH_LIMIT = 5;
const MAX_EVENT_CANDIDATES = 100;
const DEFAULT_ALL_EVENTS_LIMIT = MAX_EVENT_CANDIDATES;
const ACTIVE_SESSION_STATUSES = ["scheduled", "sales_open"];

export type SearchEventsInput = {
  artist?: string;
  city?: string;
  dateFrom?: string;
  dateTo?: string;
  timeMinutes?: number;
  limit?: number;
};

export type TicketEventSearchResult = {
  eventId: string;
  title: string;
  artistName: string;
  description: string | null;
  city: string;
  state: string;
  venueName: string | null;
  venueId: string | null;
  imageUrl: string | null;
  sessionId: string;
  startsAt: string;
  sessionStatus: string;
};

export type ValidatedEventSession = {
  eventId: string;
  title: string;
  artistName: string;
  description: string | null;
  city: string;
  state: string;
  venueName: string | null;
  venueId: string | null;
  imageUrl: string | null;
  sessionId: string;
  startsAt: string;
  sessionStatus: string;
};

type EventRow = {
  id: string;
  title: string;
  artist_name: string;
  description: string | null;
  city: string;
  state: string;
  image_url: string | null;
  venue_id: string | null;
  venues: { name: string; status?: string } | null;
};

type SessionRow = {
  id: string;
  event_id: string;
  venue_id: string | null;
  starts_at: string;
  status: string;
  venues: { name: string; status?: string } | null;
};

type EventSessionValidationRow = {
  id: string;
  venue_id: string | null;
  starts_at: string;
  status: string;
  events: {
    id: string;
    title: string;
    artist_name: string;
    description: string | null;
    city: string;
    state: string;
    image_url: string | null;
    venue_id: string | null;
    status: string;
    venues: { name: string; status: string } | null;
  } | null;
  venues: { name: string; status: string } | null;
};

function normalizeLimit(limit?: number) {
  if (!Number.isInteger(limit) || !limit || limit <= 0) {
    return DEFAULT_EVENT_SEARCH_LIMIT;
  }

  return Math.min(limit, DEFAULT_EVENT_SEARCH_LIMIT);
}

function normalizeSearchValue(value: string) {
  return value
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function compactSearchValue(value: string) {
  return normalizeSearchValue(value).replace(/\s+/g, "");
}

function eventMatchesSearchTerm({
  event,
  session,
  searchTerm,
}: {
  event: EventRow;
  session?: SessionRow;
  searchTerm: string;
}) {
  const normalizedTerm = normalizeSearchValue(searchTerm);

  if (!normalizedTerm) {
    return true;
  }

  const haystack = normalizeSearchValue(
    [
      event.artist_name,
      event.title,
      event.city,
      event.state,
      event.venues?.name,
      session?.venues?.name,
    ]
      .filter(Boolean)
      .join(" "),
  );
  const compactTerm = compactSearchValue(searchTerm);
  const compactHaystack = compactSearchValue(haystack);

  return (
    haystack.includes(normalizedTerm) ||
    Boolean(compactTerm && compactHaystack.includes(compactTerm))
  );
}

function eventMatchesCity(event: EventRow, cityTerm: string) {
  const normalizedTerm = normalizeSearchValue(cityTerm);

  if (!normalizedTerm) {
    return true;
  }

  return normalizeSearchValue(event.city) === normalizedTerm;
}

function eventMatchesLocationTerm({
  event,
  session,
  locationTerm,
}: {
  event: EventRow;
  session?: SessionRow;
  locationTerm: string;
}) {
  const normalizedTerm = normalizeSearchValue(locationTerm);

  if (!normalizedTerm) {
    return true;
  }

  const compactTerm = compactSearchValue(locationTerm);
  const eventVenue = normalizeSearchValue(event.venues?.name ?? "");
  const sessionVenue = normalizeSearchValue(session?.venues?.name ?? "");

  return (
    eventMatchesCity(event, locationTerm) ||
    eventVenue.includes(normalizedTerm) ||
    sessionVenue.includes(normalizedTerm) ||
    Boolean(
      compactTerm &&
        (
          compactSearchValue(eventVenue).includes(compactTerm) ||
          compactSearchValue(sessionVenue).includes(compactTerm)
        ),
    )
  );
}

export async function searchEvents({
  artist,
  city,
  dateFrom,
  dateTo,
  timeMinutes,
  limit,
}: SearchEventsInput): Promise<TicketEventSearchResult[]> {
  const supabase = getSupabaseAdmin();
  const resultLimit = normalizeLimit(limit);
  const eventQuery = supabase
    .from("events")
    .select("id, title, artist_name, description, city, state, image_url, venue_id, venues(name)")
    .eq("status", "published");

  const artistTerm = artist?.trim();
  const cityTerm = city?.trim();

  const { data: events, error: eventsError } = await eventQuery
    .limit(MAX_EVENT_CANDIDATES)
    .returns<EventRow[]>();

  if (eventsError) {
    throw eventsError;
  }

  const filteredEvents = events ?? [];

  if (filteredEvents.length === 0) {
    return [];
  }

  const eventsById = new Map(filteredEvents.map((event) => [event.id, event]));
  let sessionQuery = supabase
    .from("event_sessions")
    .select("id, event_id, venue_id, starts_at, status, venues(name)")
    .in("event_id", Array.from(eventsById.keys()))
    .in("status", ACTIVE_SESSION_STATUSES)
    .gte("starts_at", dateFrom ?? new Date().toISOString())
    .order("starts_at", { ascending: true });

  if (dateTo) {
    sessionQuery = sessionQuery.lt("starts_at", dateTo);
  }

  const { data: sessions, error: sessionsError } = await sessionQuery
    .limit(MAX_EVENT_CANDIDATES)
    .returns<SessionRow[]>();

  if (sessionsError) {
    throw sessionsError;
  }

  const matchedSessions = (sessions ?? [])
    .flatMap((session) => {
      const event = eventsById.get(session.event_id);
      const sessionTimeParts = new Intl.DateTimeFormat("en-GB", {
        timeZone: "America/Sao_Paulo",
        hour: "2-digit",
        minute: "2-digit",
        hourCycle: "h23",
      })
        .formatToParts(new Date(session.starts_at))
        .reduce<Record<string, string>>((parts, part) => {
          parts[part.type] = part.value;
          return parts;
        }, {});
      const sessionTimeMinutes =
        Number(sessionTimeParts.hour) * 60 + Number(sessionTimeParts.minute);

      if (
        !event ||
        (timeMinutes !== undefined && sessionTimeMinutes !== timeMinutes) ||
        (cityTerm &&
          !eventMatchesLocationTerm({
            event,
            session,
            locationTerm: cityTerm,
          })) ||
        (artistTerm &&
          !eventMatchesSearchTerm({
            event,
            session,
            searchTerm: artistTerm,
          }))
      ) {
        return [];
      }

      return [
        {
          eventId: event.id,
          title: event.title,
          artistName: event.artist_name,
          description: event.description,
          city: event.city,
          state: event.state,
          venueName: session.venues?.name ?? event.venues?.name ?? null,
          venueId: session.venue_id ?? event.venue_id,
          imageUrl: event.image_url,
          sessionId: session.id,
          startsAt: session.starts_at,
          sessionStatus: session.status,
        },
      ];
    });
  const purchasableResults: TicketEventSearchResult[] = [];

  for (const result of matchedSessions) {
    const sections = await listAvailableSections(result.sessionId, {
      venueId: result.venueId,
    });

    if (sections.length === 0) {
      continue;
    }

    purchasableResults.push(result);

    if (purchasableResults.length >= resultLimit) {
      break;
    }
  }

  return purchasableResults;
}

export async function listAllPublicEventsByDate({
  limit = DEFAULT_ALL_EVENTS_LIMIT,
}: { limit?: number } = {}): Promise<TicketEventSearchResult[]> {
  const supabase = getSupabaseAdmin();
  const resultLimit = Math.max(1, Math.min(limit, MAX_EVENT_CANDIDATES));
  const { data: events, error: eventsError } = await supabase
    .from("events")
    .select("id, title, artist_name, description, city, state, image_url, venue_id, venues(name)")
    .eq("status", "published")
    .limit(MAX_EVENT_CANDIDATES)
    .returns<EventRow[]>();

  if (eventsError) {
    throw eventsError;
  }

  if (!events?.length) {
    return [];
  }

  const eventsById = new Map(events.map((event) => [event.id, event]));
  const { data: sessions, error: sessionsError } = await supabase
    .from("event_sessions")
    .select("id, event_id, venue_id, starts_at, status, venues(name)")
    .in("event_id", Array.from(eventsById.keys()))
    .in("status", ACTIVE_SESSION_STATUSES)
    .gte("starts_at", new Date().toISOString())
    .order("starts_at", { ascending: true })
    .order("event_id", { ascending: true })
    .order("id", { ascending: true })
    .limit(MAX_EVENT_CANDIDATES)
    .returns<SessionRow[]>();

  if (sessionsError) {
    throw sessionsError;
  }

  const purchasableResults: TicketEventSearchResult[] = [];

  for (const session of sessions ?? []) {
    const event = eventsById.get(session.event_id);

    if (!event) {
      continue;
    }

    const result = {
      eventId: event.id,
      title: event.title,
      artistName: event.artist_name,
      description: event.description,
      city: event.city,
      state: event.state,
      venueName: session.venues?.name ?? event.venues?.name ?? null,
      venueId: session.venue_id ?? event.venue_id,
      imageUrl: event.image_url,
      sessionId: session.id,
      startsAt: session.starts_at,
      sessionStatus: session.status,
    };
    const sections = await listAvailableSections(result.sessionId, {
      venueId: result.venueId,
    });

    if (sections.length === 0) {
      continue;
    }

    purchasableResults.push(result);

    if (purchasableResults.length >= resultLimit) {
      break;
    }
  }

  return purchasableResults;
}

export async function getEventById(eventId: string) {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("events")
    .select("id, title, artist_name, city, state, venue_id, status")
    .eq("id", eventId)
    .maybeSingle();

  if (error) {
    throw error;
  }

  return data;
}

export async function getValidatedEventSession({
  eventId,
  sessionId,
}: {
  eventId: string;
  sessionId: string;
}): Promise<ValidatedEventSession | null> {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("event_sessions")
    .select(
      "id, venue_id, starts_at, status, venues(name, status), events(id, title, artist_name, description, city, state, image_url, venue_id, status, venues(name, status))",
    )
    .eq("id", sessionId)
    .eq("event_id", eventId)
    .maybeSingle<EventSessionValidationRow>();

  if (error) {
    throw error;
  }

  if (!data?.events) {
    return null;
  }

  if (
    data.events.status !== "published" ||
    !ACTIVE_SESSION_STATUSES.includes(data.status) ||
    data.starts_at < new Date().toISOString() ||
    data.venues?.status === "inactive" ||
    data.events.venues?.status === "inactive"
  ) {
    return null;
  }

  return {
    eventId: data.events.id,
    title: data.events.title,
    artistName: data.events.artist_name,
    description: data.events.description,
    city: data.events.city,
    state: data.events.state,
    venueName: data.venues?.name ?? data.events.venues?.name ?? null,
    venueId: data.venue_id ?? data.events.venue_id,
    imageUrl: data.events.image_url,
    sessionId: data.id,
    startsAt: data.starts_at,
    sessionStatus: data.status,
  };
}
