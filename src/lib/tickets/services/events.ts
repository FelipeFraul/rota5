import "server-only";

import { getSupabaseAdmin } from "@/lib/supabase/admin";

const DEFAULT_EVENT_SEARCH_LIMIT = 5;
const MAX_EVENT_CANDIDATES = 100;
const ACTIVE_SESSION_STATUSES = ["scheduled", "sales_open"];

export type SearchEventsInput = {
  artist?: string;
  city?: string;
  dateFrom?: string;
  dateTo?: string;
  limit?: number;
};

export type TicketEventSearchResult = {
  eventId: string;
  title: string;
  artistName: string;
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
    .trim();
}

function eventMatchesArtist(event: EventRow, artistTerm: string) {
  const normalizedTerm = normalizeSearchValue(artistTerm);

  if (!normalizedTerm) {
    return true;
  }

  const haystack = normalizeSearchValue(
    `${event.artist_name} ${event.title} ${event.city} ${event.state}`,
  );

  return haystack.includes(normalizedTerm);
}

function eventMatchesCity(event: EventRow, cityTerm: string) {
  const normalizedTerm = normalizeSearchValue(cityTerm);

  if (!normalizedTerm) {
    return true;
  }

  return normalizeSearchValue(event.city) === normalizedTerm;
}

export async function searchEvents({
  artist,
  city,
  dateFrom,
  dateTo,
  limit,
}: SearchEventsInput): Promise<TicketEventSearchResult[]> {
  const supabase = getSupabaseAdmin();
  const resultLimit = normalizeLimit(limit);
  const eventQuery = supabase
    .from("events")
    .select("id, title, artist_name, city, state, image_url, venue_id, venues(name)")
    .eq("status", "published");

  const artistTerm = artist?.trim();
  const cityTerm = city?.trim();

  const { data: events, error: eventsError } = await eventQuery
    .limit(MAX_EVENT_CANDIDATES)
    .returns<EventRow[]>();

  if (eventsError) {
    throw eventsError;
  }

  const filteredEvents = (events ?? []).filter(
    (event) =>
      (!artistTerm || eventMatchesArtist(event, artistTerm)) &&
      (!cityTerm || eventMatchesCity(event, cityTerm)),
  );

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

  return (sessions ?? [])
    .flatMap((session) => {
      const event = eventsById.get(session.event_id);

      if (!event) {
        return [];
      }

      return [
        {
          eventId: event.id,
          title: event.title,
          artistName: event.artist_name,
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
    })
    .slice(0, resultLimit);
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
      "id, venue_id, starts_at, status, venues(name, status), events(id, title, artist_name, city, state, image_url, venue_id, status, venues(name, status))",
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
