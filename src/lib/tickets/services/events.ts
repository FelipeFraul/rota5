import "server-only";

import { getSupabaseAdmin } from "@/lib/supabase/admin";

const DEFAULT_EVENT_SEARCH_LIMIT = 5;
const MAX_EVENT_CANDIDATES = 50;
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
  venue_id: string | null;
  venues: { name: string } | null;
};

type SessionRow = {
  id: string;
  event_id: string;
  venue_id: string | null;
  starts_at: string;
  status: string;
  venues: { name: string } | null;
};

function normalizeLimit(limit?: number) {
  if (!Number.isInteger(limit) || !limit || limit <= 0) {
    return DEFAULT_EVENT_SEARCH_LIMIT;
  }

  return Math.min(limit, DEFAULT_EVENT_SEARCH_LIMIT);
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
  let eventQuery = supabase
    .from("events")
    .select("id, title, artist_name, city, state, venue_id, venues(name)")
    .eq("status", "published");

  const artistTerm = artist?.trim();
  const cityTerm = city?.trim();

  if (artistTerm) {
    const escapedTerm = artistTerm.replace(/[%_]/g, "\\$&");
    eventQuery = eventQuery.or(
      `artist_name.ilike.%${escapedTerm}%,title.ilike.%${escapedTerm}%,search_text.ilike.%${escapedTerm.toLowerCase()}%`,
    );
  }

  if (cityTerm) {
    eventQuery = eventQuery.ilike("city", cityTerm);
  }

  const { data: events, error: eventsError } = await eventQuery
    .limit(MAX_EVENT_CANDIDATES)
    .returns<EventRow[]>();

  if (eventsError) {
    throw eventsError;
  }

  if (!events || events.length === 0) {
    return [];
  }

  const eventsById = new Map(events.map((event) => [event.id, event]));
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
