import "server-only";

import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { listAvailableSections } from "@/lib/tickets/services/sections";
import {
  getPublicEventVisibilityQueryFloorIso,
  getPublicVisibleSessionStatuses,
  isPublicEventVisible,
  PUBLIC_VISIBLE_EVENT_STATUSES,
} from "@/lib/tickets/services/publicEventVisibility";

const DEFAULT_EVENT_SEARCH_LIMIT = 5;
const MAX_EVENT_CANDIDATES = 100;
const DEFAULT_ALL_EVENTS_LIMIT = MAX_EVENT_CANDIDATES;

export type SearchEventsInput = {
  artist?: string;
  city?: string;
  dateFrom?: string;
  dateTo?: string;
  timeMinutes?: number;
  limit?: number;
  authorizedByIntent?: "search_event" | "buy_event" | "events_by_date";
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
  timezone?: string | null;
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
  timezone?: string | null;
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
  timezone?: string | null;
  status: string;
  venues: { name: string; status?: string } | null;
};

type EventSessionValidationRow = {
  id: string;
  venue_id: string | null;
  starts_at: string;
  timezone?: string | null;
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

type RankedPublicEventSearchRow = {
  event_id: string;
  title: string;
  artist_name: string;
  description: string | null;
  city: string;
  state: string;
  image_url: string | null;
  venue_id: string | null;
  venue_name: string | null;
  session_id: string;
  starts_at: string;
  timezone?: string | null;
  session_status: string;
  score: number;
};

function normalizeLimit(limit?: number) {
  if (!Number.isInteger(limit) || !limit || limit <= 0) {
    return DEFAULT_EVENT_SEARCH_LIMIT;
  }

  return Math.min(limit, DEFAULT_EVENT_SEARCH_LIMIT);
}

function clampPublicSearchDateFrom(dateFrom?: string) {
  const nowIso = getPublicEventVisibilityQueryFloorIso();

  if (!dateFrom) {
    return nowIso;
  }

  const parsedDate = new Date(dateFrom);

  if (Number.isNaN(parsedDate.getTime())) {
    return nowIso;
  }

  return parsedDate > new Date(nowIso) ? parsedDate.toISOString() : nowIso;
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

function phoneticSearchValue(value: string) {
  return normalizeSearchValue(value).replace(/w/g, "v");
}

function levenshteinDistance(a: string, b: string, maxDistance = 2) {
  if (Math.abs(a.length - b.length) > maxDistance) {
    return maxDistance + 1;
  }

  let previous = Array.from({ length: b.length + 1 }, (_, index) => index);

  for (let i = 1; i <= a.length; i += 1) {
    const current = [i];
    let rowMin = current[0];

    for (let j = 1; j <= b.length; j += 1) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      const value = Math.min(
        previous[j] + 1,
        current[j - 1] + 1,
        previous[j - 1] + cost,
      );

      current[j] = value;
      rowMin = Math.min(rowMin, value);
    }

    if (rowMin > maxDistance) {
      return maxDistance + 1;
    }

    previous = current;
  }

  return previous[b.length] ?? maxDistance + 1;
}

function fuzzyTokenMatchesSearchTerm(searchTerm: string, haystack: string) {
  const termTokens = phoneticSearchValue(searchTerm)
    .split(" ")
    .filter((token) => token.length >= 3);
  const haystackTokens = phoneticSearchValue(haystack)
    .split(" ")
    .filter((token) => token.length >= 3);

  if (termTokens.length === 0 || haystackTokens.length === 0) {
    return false;
  }

  return termTokens.every((termToken) =>
    haystackTokens.some((haystackToken) => {
      if (haystackToken.includes(termToken) || termToken.includes(haystackToken)) {
        return true;
      }

      if (
        termToken.length >= 4 &&
        haystackToken.length >= 4 &&
        haystackToken.startsWith(termToken.slice(0, 4))
      ) {
        return true;
      }

      const maxDistance = termToken.length >= 6 ? 2 : 1;

      return levenshteinDistance(termToken, haystackToken, maxDistance) <= maxDistance;
    }),
  );
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
      event.description,
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
    Boolean(compactTerm && compactHaystack.includes(compactTerm)) ||
    fuzzyTokenMatchesSearchTerm(searchTerm, haystack)
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

function mapRankedSearchRow(row: RankedPublicEventSearchRow): TicketEventSearchResult {
  return {
    eventId: row.event_id,
    title: row.title,
    artistName: row.artist_name,
    description: row.description,
    city: row.city,
    state: row.state,
    venueName: row.venue_name,
    venueId: row.venue_id,
    imageUrl: row.image_url,
    sessionId: row.session_id,
    startsAt: row.starts_at,
    sessionStatus: row.session_status,
    timezone: row.timezone,
  };
}

async function getSessionTimezones(sessionIds: string[]) {
  if (!sessionIds.length) return new Map<string, string | null>();

  const { data } = await getSupabaseAdmin()
    .from("event_sessions")
    .select("id, timezone")
    .in("id", sessionIds)
    .returns<Array<{ id: string; timezone: string | null }>>();

  return new Map((data ?? []).map((row) => [row.id, row.timezone]));
}

async function searchEventsRankedInDatabase({
  searchTerm,
  dateFrom,
  dateTo,
  limit,
}: {
  searchTerm: string;
  dateFrom?: string;
  dateTo?: string;
  limit: number;
}) {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .rpc("search_public_events_ranked", {
      search_term: searchTerm,
      date_from: dateFrom ?? new Date().toISOString(),
      date_to: dateTo ?? null,
      result_limit: Math.max(limit * 4, 20),
    })
    .returns<RankedPublicEventSearchRow[]>();

  if (error) {
    const message = String(error.message ?? "");

    if (
      message.includes("search_public_events_ranked") ||
      message.includes("Could not find the function")
    ) {
      return null;
    }

    throw error;
  }

  return (data ?? []) as RankedPublicEventSearchRow[];
}

export async function searchEvents({
  artist,
  city,
  dateFrom,
  dateTo,
  timeMinutes,
  limit,
  authorizedByIntent,
}: SearchEventsInput): Promise<TicketEventSearchResult[]> {
  (
    globalThis as typeof globalThis & {
      __ticketSearchEventsAudit?: (input: SearchEventsInput) => void;
    }
  ).__ticketSearchEventsAudit?.({
    artist,
    city,
    dateFrom,
    dateTo,
    timeMinutes,
    limit,
    authorizedByIntent,
  });

  if (!authorizedByIntent) {
    throw new Error("searchEvents requires explicit incoming intent authorization");
  }

  const supabase = getSupabaseAdmin();
  const resultLimit = normalizeLimit(limit);
  const effectiveDateFrom = clampPublicSearchDateFrom(dateFrom);
  const eventQuery = supabase
    .from("events")
    .select("id, title, artist_name, description, city, state, image_url, venue_id, venues(name)")
    .in("status", PUBLIC_VISIBLE_EVENT_STATUSES);

  const artistTerm = artist?.trim();
  const cityTerm = city?.trim();

  if (artistTerm && !cityTerm && timeMinutes === undefined) {
    const rankedRows = await searchEventsRankedInDatabase({
      searchTerm: artistTerm,
      dateFrom: effectiveDateFrom,
      dateTo,
      limit: resultLimit,
    });

    if (rankedRows) {
      const sessionTimezones = await getSessionTimezones(
        rankedRows.map((row) => row.session_id),
      );
      const purchasableResults: TicketEventSearchResult[] = [];

      for (const row of rankedRows) {
        const result = {
          ...mapRankedSearchRow(row),
          timezone: sessionTimezones.get(row.session_id) ?? row.timezone,
        };
        if (
          !isPublicEventVisible({
            startsAt: result.startsAt,
            timezone: result.timezone,
            sessionStatus: result.sessionStatus,
            purpose: "purchase",
          })
        ) {
          continue;
        }
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
  }

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
    .select("id, event_id, venue_id, starts_at, timezone, status, venues(name)")
    .in("event_id", Array.from(eventsById.keys()))
    .in("status", getPublicVisibleSessionStatuses("purchase"))
    .gte("starts_at", effectiveDateFrom)
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
          timezone: session.timezone,
        },
      ];
    });
  const purchasableResults: TicketEventSearchResult[] = [];

  for (const result of matchedSessions) {
    if (
      !isPublicEventVisible({
        startsAt: result.startsAt,
        timezone: result.timezone,
        sessionStatus: result.sessionStatus,
        purpose: "purchase",
      })
    ) {
      continue;
    }

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
    .in("status", PUBLIC_VISIBLE_EVENT_STATUSES)
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
    .select("id, event_id, venue_id, starts_at, timezone, status, venues(name)")
    .in("event_id", Array.from(eventsById.keys()))
    .in("status", getPublicVisibleSessionStatuses("purchase"))
    .gte("starts_at", getPublicEventVisibilityQueryFloorIso())
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
      timezone: session.timezone,
    };
    if (
      !isPublicEventVisible({
        startsAt: result.startsAt,
        timezone: result.timezone,
        sessionStatus: result.sessionStatus,
        purpose: "purchase",
      })
    ) {
      continue;
    }

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
      "id, venue_id, starts_at, timezone, status, venues(name, status), events(id, title, artist_name, description, city, state, image_url, venue_id, status, venues(name, status))",
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
    !isPublicEventVisible({
      startsAt: data.starts_at,
      timezone: data.timezone,
      sessionStatus: data.status,
      eventStatus: data.events.status,
      purpose: "purchase",
    }) ||
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
    timezone: data.timezone,
  };
}
