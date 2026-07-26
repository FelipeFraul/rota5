import "server-only";

export const PUBLIC_VISIBLE_EVENT_STATUSES = ["published"] as const;
export const PUBLIC_VISIBLE_SESSION_STATUSES = [
  "scheduled",
  "sales_open",
  "sales_closed",
] as const;
export const PUBLIC_PURCHASABLE_SESSION_STATUSES = [
  "scheduled",
  "sales_open",
] as const;
export const DEFAULT_PUBLIC_EVENT_TIME_ZONE = "America/Sao_Paulo";
const PUBLIC_EVENT_LOCAL_CUTOFF_HOUR = 23;
const PUBLIC_EVENT_QUERY_FLOOR_LOOKBACK_HOURS = 36;

export type PublicEventVisibilityPurpose =
  | "purchase"
  | "issued_access"
  | "checkout"
  | "offer";

export type PublicEventVisibilityInput = {
  startsAt?: string | null;
  timezone?: string | null;
  sessionStatus?: string | null;
  eventStatus?: string | null;
  now?: Date;
  purpose?: PublicEventVisibilityPurpose;
};

export function getPublicEventVisibilityCutoffIso(now = new Date()) {
  return now.toISOString();
}

export function getPublicEventVisibilityQueryFloorIso(now = new Date()) {
  return new Date(
    now.getTime() - PUBLIC_EVENT_QUERY_FLOOR_LOOKBACK_HOURS * 60 * 60 * 1000,
  ).toISOString();
}

export function getPublicVisibleSessionStatuses(
  purpose: PublicEventVisibilityPurpose = "issued_access",
) {
  return purpose === "purchase" || purpose === "offer"
    ? PUBLIC_PURCHASABLE_SESSION_STATUSES
    : PUBLIC_VISIBLE_SESSION_STATUSES;
}

function getTimeZone(value?: string | null) {
  return value?.trim() || DEFAULT_PUBLIC_EVENT_TIME_ZONE;
}

function getLocalDateParts(date: Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const get = (type: Intl.DateTimeFormatPartTypes) =>
    Number(parts.find((part) => part.type === type)?.value);

  const year = get("year");
  const month = get("month");
  const day = get("day");
  return Number.isFinite(year) && Number.isFinite(month) && Number.isFinite(day)
    ? { year, month, day }
    : null;
}

function getTimeZoneOffsetMs(date: Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).formatToParts(date);
  const get = (type: Intl.DateTimeFormatPartTypes) =>
    Number(parts.find((part) => part.type === type)?.value);
  const hour = get("hour");
  const utcLike = Date.UTC(
    get("year"),
    get("month") - 1,
    get("day"),
    hour === 24 ? 0 : hour,
    get("minute"),
    get("second"),
  );

  return utcLike - date.getTime();
}

function getLocalDateTimeInstant({
  year,
  month,
  day,
  hour,
  minute = 0,
  second = 0,
  timeZone,
}: {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute?: number;
  second?: number;
  timeZone: string;
}) {
  const utcGuess = new Date(Date.UTC(year, month - 1, day, hour, minute, second));
  const offset = getTimeZoneOffsetMs(utcGuess, timeZone);
  const instant = new Date(utcGuess.getTime() - offset);
  const correctedOffset = getTimeZoneOffsetMs(instant, timeZone);

  return correctedOffset === offset
    ? instant
    : new Date(utcGuess.getTime() - correctedOffset);
}

export function getPublicEventVisibilityExpiresAt(input: {
  startsAt?: string | null;
  timezone?: string | null;
}) {
  if (!input.startsAt) return null;

  const startsAt = new Date(input.startsAt);
  if (Number.isNaN(startsAt.getTime())) return null;

  const timeZone = getTimeZone(input.timezone);
  try {
    const localDate = getLocalDateParts(startsAt, timeZone);
    if (!localDate) return null;
    return getLocalDateTimeInstant({
      ...localDate,
      hour: PUBLIC_EVENT_LOCAL_CUTOFF_HOUR,
      timeZone,
    });
  } catch {
    return null;
  }
}

export function isPublicEventVisible(input: PublicEventVisibilityInput) {
  const expiresAt = getPublicEventVisibilityExpiresAt(input);
  if (!expiresAt) return false;
  if (
    input.eventStatus &&
    !PUBLIC_VISIBLE_EVENT_STATUSES.includes(
      input.eventStatus as (typeof PUBLIC_VISIBLE_EVENT_STATUSES)[number],
    )
  ) {
    return false;
  }

  const visibleSessionStatuses: readonly string[] = getPublicVisibleSessionStatuses(input.purpose);
  if (
    input.sessionStatus &&
    !visibleSessionStatuses.includes(input.sessionStatus)
  ) {
    return false;
  }

  return (input.now ?? new Date()).getTime() < expiresAt.getTime();
}
