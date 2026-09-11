import "server-only";

import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { normalizeAdminText } from "@/lib/tickets/services/adminAuth";

type MaybeArray<T> = T | T[] | null | undefined;

type ReportEventRow = {
  id: string;
  title: string;
  artist_name: string;
  city: string;
  state: string;
  status: string;
  search_text: string | null;
  event_sessions: MaybeArray<{
    starts_at: string;
    status: string;
  }>;
};

export type AdminReportEventOption = {
  option: number;
  eventId: string;
  title: string;
  artistName: string;
  city: string;
  state: string;
  status: string;
  sessionStartsAt: string | null;
};

const SAO_PAULO_TIME_ZONE = "America/Sao_Paulo";
const MAX_SEARCH_RESULTS = 10;
const SEARCH_PAGE_SIZE = 500;

function asArray<T>(value: MaybeArray<T>): T[] {
  if (Array.isArray(value)) return value;
  return value ? [value] : [];
}

function getSaoPauloDateParts(value: string) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: SAO_PAULO_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date(value));

  return {
    year: Number(parts.find((part) => part.type === "year")?.value),
    month: Number(parts.find((part) => part.type === "month")?.value),
    day: Number(parts.find((part) => part.type === "day")?.value),
  };
}

function parseSearchDate(input: string) {
  const match = input.match(/(?:^|\s)(\d{1,2})\/(\d{1,2})(?:\/(\d{4}))?(?:\s|$)/);
  if (!match) return null;

  const day = Number(match[1]);
  const month = Number(match[2]);
  const year = match[3] ? Number(match[3]) : null;
  const validationYear = year ?? 2000;
  const parsed = new Date(Date.UTC(validationYear, month - 1, day));

  if (
    parsed.getUTCFullYear() !== validationYear ||
    parsed.getUTCMonth() !== month - 1 ||
    parsed.getUTCDate() !== day
  ) {
    return { invalid: true as const, day, month, year, matchedText: match[0].trim() };
  }

  return { invalid: false as const, day, month, year, matchedText: match[0].trim() };
}

function getDisplaySession(row: ReportEventRow, searchedDate: ReturnType<typeof parseSearchDate>) {
  const sessions = asArray(row.event_sessions)
    .filter((session) => session.status !== "cancelled")
    .sort((left, right) => left.starts_at.localeCompare(right.starts_at));

  if (searchedDate && !searchedDate.invalid) {
    const matching = sessions.find((session) => {
      const parts = getSaoPauloDateParts(session.starts_at);
      return (
        parts.day === searchedDate.day &&
        parts.month === searchedDate.month &&
        (!searchedDate.year || parts.year === searchedDate.year)
      );
    });
    if (matching) return matching.starts_at;
  }

  const now = new Date().toISOString();
  return sessions.find((session) => session.starts_at >= now)?.starts_at ??
    sessions.at(-1)?.starts_at ??
    null;
}

function eventMatchesDate(row: ReportEventRow, searchedDate: ReturnType<typeof parseSearchDate>) {
  if (!searchedDate || searchedDate.invalid) return true;

  return asArray(row.event_sessions).some((session) => {
    const parts = getSaoPauloDateParts(session.starts_at);
    return (
      parts.day === searchedDate.day &&
      parts.month === searchedDate.month &&
      (!searchedDate.year || parts.year === searchedDate.year)
    );
  });
}

export async function searchAdminReportEvents(input: {
  query: string;
  ownerAdminUserId: string;
  canSeeAll: boolean;
}) {
  const trimmed = input.query.trim();
  const searchedDate = parseSearchDate(trimmed);
  if (searchedDate?.invalid) {
    return { ok: false as const, reason: "invalid_date" as const };
  }

  const normalizedQuery = normalizeAdminText(
    searchedDate ? trimmed.replace(searchedDate.matchedText, " ") : trimmed,
  );
  const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(trimmed);

  if (!searchedDate && !isUuid && normalizedQuery.length < 2) {
    return { ok: false as const, reason: "query_too_short" as const };
  }

  const scored: Array<{
    row: ReportEventRow;
    score: number;
    sessionStartsAt: string | null;
  }> = [];

  for (let from = 0; ; from += SEARCH_PAGE_SIZE) {
    let query = getSupabaseAdmin()
      .from("events")
      .select("id, title, artist_name, city, state, status, search_text, event_sessions(starts_at, status)")
      .in("status", ["published", "finished"])
      .order("created_at", { ascending: false })
      .range(from, from + SEARCH_PAGE_SIZE - 1);

    if (!input.canSeeAll) {
      query = query.eq("created_by_admin_user_id", input.ownerAdminUserId);
    }

    const { data, error } = await query.returns<ReportEventRow[]>();
    if (error) return { ok: false as const, reason: "database_error" as const, error };

    const rows = data ?? [];
    scored.push(...rows
      .filter((row) => {
      if (isUuid) return row.id.toLowerCase() === trimmed.toLowerCase();
      if (!eventMatchesDate(row, searchedDate)) return false;
      if (!normalizedQuery) return true;

      return [row.title, row.artist_name, row.search_text ?? ""]
        .map(normalizeAdminText)
        .some((value) => value.includes(normalizedQuery));
      })
      .map((row) => {
      const title = normalizeAdminText(row.title);
      const artist = normalizeAdminText(row.artist_name);
      const score = isUuid || title === normalizedQuery || artist === normalizedQuery
        ? 0
        : title.startsWith(normalizedQuery) || artist.startsWith(normalizedQuery)
          ? 1
          : 2;
        return { row, score, sessionStartsAt: getDisplaySession(row, searchedDate) };
      }));

    if (rows.length < SEARCH_PAGE_SIZE || isUuid) break;
  }

  scored.sort((left, right) =>
      left.score - right.score ||
      (right.sessionStartsAt ?? "0000").localeCompare(left.sessionStartsAt ?? "0000") ||
      left.row.title.localeCompare(right.row.title, "pt-BR"),
    );

  const events = scored.slice(0, MAX_SEARCH_RESULTS).map(({ row, sessionStartsAt }, index) => ({
    option: index + 1,
    eventId: row.id,
    title: row.title,
    artistName: row.artist_name,
    city: row.city,
    state: row.state,
    status: row.status,
    sessionStartsAt,
  }));

  return {
    ok: true as const,
    events,
    hasMore: scored.length > MAX_SEARCH_RESULTS,
  };
}

export async function validateAdminReportEventIds(input: {
  eventIds: string[];
  ownerAdminUserId: string;
  canSeeAll: boolean;
}) {
  const eventIds = [...new Set(input.eventIds)].slice(0, 3);
  if (!eventIds.length) return { ok: true as const, eventIds: [] as string[] };

  let query = getSupabaseAdmin()
    .from("events")
    .select("id")
    .in("status", ["published", "finished"])
    .in("id", eventIds);

  if (!input.canSeeAll) {
    query = query.eq("created_by_admin_user_id", input.ownerAdminUserId);
  }

  const { data, error } = await query.returns<Array<{ id: string }>>();
  if (error) return { ok: false as const, error };

  const allowed = new Set((data ?? []).map((event) => event.id));
  return {
    ok: true as const,
    eventIds: eventIds.filter((eventId) => allowed.has(eventId)),
  };
}

export function parseAdminReportEventSelection(
  input: string,
  events: Array<Pick<AdminReportEventOption, "option" | "eventId">>,
  maximum: number,
) {
  const trimmed = input.trim();
  if (!/^\d+(?:\s*[,;]\s*\d+|\s+\d+)*$/.test(trimmed)) {
    return { ok: false as const, reason: "not_a_selection" as const };
  }

  const options = [...new Set(trimmed.split(/[\s,;]+/).filter(Boolean).map(Number))];
  if (options.length > maximum) {
    return { ok: false as const, reason: "too_many" as const };
  }

  const selected = options.map((option) => events.find((event) => event.option === option));
  if (selected.some((event) => !event)) {
    return { ok: false as const, reason: "unknown_option" as const };
  }

  return {
    ok: true as const,
    eventIds: selected.map((event) => event!.eventId),
  };
}

export function formatAdminReportEventSearchResults(input: {
  events: AdminReportEventOption[];
  hasMore: boolean;
  selectionCount: 1 | 2 | 3;
}) {
  const formatDate = (value: string | null) => value
    ? new Intl.DateTimeFormat("pt-BR", {
        timeZone: SAO_PAULO_TIME_ZONE,
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      }).format(new Date(value))
    : "sem data";

  return [
    "*EVENTOS ENCONTRADOS*",
    "",
    ...input.events.map((event) => [
      `${event.option}. *${event.title}*`,
      `> Artista: ${event.artistName}`,
      `> Data: ${formatDate(event.sessionStartsAt)}`,
      `> Local: ${event.city}/${event.state}`,
      `> Status: ${event.status}`,
    ].join("\n")),
    input.hasMore ? "Há mais resultados. Refine a busca para reduzir a lista." : null,
    "",
    input.selectionCount === 1
      ? "Digite o número do evento."
      : `Digite ${input.selectionCount} números separados por vírgula. Ex: ${Array.from(
          { length: input.selectionCount },
          (_, index) => index + 1,
        ).join(", ")}.`,
    "Você também pode fazer outra busca por nome, artista ou data.",
    "",
    'Digite "Vortei" para voltar, "CANCELAR" para abandonar esta tela ou "SAIR" para sair da área de admin.',
  ].filter((line): line is string => line !== null).join("\n");
}
