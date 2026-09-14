import "server-only";

import { randomUUID } from "node:crypto";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { buildDuplicatedAdminEventPayload } from "@/lib/tickets/services/adminEventDuplication";
import { OFFICIAL_TABLE_MAP_PLACES } from "@/lib/tickets/tableMap/officialPlaces";

export type AdminEventStatus = "draft" | "published" | "cancelled" | "finished";
export type AdminSessionStatus =
  | "scheduled"
  | "sales_open"
  | "sales_closed"
  | "cancelled"
  | "finished";
export type AdminSectionStatus = "active" | "inactive";
export type AdminSeatStatus = "active" | "inactive" | "blocked";
export type AdminTicketPriceStatus = "active" | "inactive";
export type AdminTicketType = "full" | "half" | "promotional" | "free";
type AdminTicketSalesOverviewEntry = {
  key: string;
  label: string;
  shortLabel: string;
  sold: number;
  available: number;
  courtesySold: number;
  courtesyAvailable: number;
  courtesyCapacity: number;
  salesSold: number;
  salesAvailable: number;
  salesCapacity: number;
};

export type AdminInitialEventSectionInput = {
  name: string;
  slug: string;
  hasNumberedSeats: boolean;
  capacity: number | null;
  createInventorySeats: boolean;
  seatCodes?: string[];
  seatMapPositions?: Record<string, { x: number; y: number }>;
  createVisualMap?: boolean;
  ticketType: AdminTicketType;
  label: string;
  priceCents: number;
  feeCents: number;
  priceOptions?: Array<{
    ticketType: AdminTicketType;
    label: string;
    priceCents: number;
    feeCents: number;
  }>;
};

export type AdminEventSummary = {
  eventId: string;
  title: string;
  artistName: string;
  artistIcon: string | null;
  description: string | null;
  city: string;
  state: string;
  status: AdminEventStatus;
  displayStatus: AdminEventStatus;
  imageUrl: string | null;
  venueId: string | null;
  venueName: string | null;
  createdAt: string;
  wasEdited: boolean;
  createdByAdminUserId: string | null;
  createdByAdminPhone: string | null;
  sessionsCount: number;
  nextSessionStartsAt: string | null;
  nextSessionStatus: AdminSessionStatus | null;
  ticketSalesOverview: AdminTicketSalesOverviewEntry[];
  ticketImpressions: number;
  ticketClicks: number;
};

export type AdminEventDetails = AdminEventSummary & {
  sessions: Array<{
    sessionId: string;
    startsAt: string;
    status: AdminSessionStatus;
    venueId: string | null;
    venueName: string | null;
  }>;
  sections: Array<{
    sectionId: string;
    name: string;
    slug: string;
    capacity: number | null;
    hasNumberedSeats: boolean;
    status: AdminSectionStatus;
  }>;
};

type EventRow = {
  id: string;
  title: string;
  artist_name: string;
  artist_icon: string | null;
  description: string | null;
  city: string;
  state: string;
  status: AdminEventStatus;
  image_url: string | null;
  venue_id: string | null;
  created_at: string;
  updated_at?: string | null;
  created_by_admin_user_id?: string | null;
  created_by_admin_phone?: string | null;
  venues?: {
    name: string;
  } | null;
  event_sessions?: SessionRow | SessionRow[] | null;
};

type SessionRow = {
  id: string;
  event_id: string;
  venue_id: string | null;
  starts_at: string;
  status: AdminSessionStatus;
  venues?: {
    name: string;
  } | null;
};

type SectionRow = {
  id: string;
  venue_id: string;
  name: string;
  slug: string;
  capacity: number | null;
  has_numbered_seats: boolean;
  status: AdminSectionStatus;
};

type TicketPriceRow = {
  session_id: string;
  section_id: string | null;
  ticket_type: AdminTicketType;
  label: string;
  price_cents: number;
  fee_cents: number;
  currency: string;
  sales_start_at: string | null;
  sales_end_at: string | null;
  status: AdminTicketPriceStatus;
};

type SeatStructureRow = {
  id: string;
  section_id: string;
  row_label: string | null;
  seat_number: string;
  seat_code: string;
  map_x: number | string | null;
  map_y: number | string | null;
  status: AdminSeatStatus;
};

type AdminTicketSalesSeatRow = {
  status: string;
  section_id: string;
  event_sessions?: { event_id: string } | { event_id: string }[] | null;
  seats?: { status: string } | { status: string }[] | null;
  venue_sections?: {
    name: string;
    status: string;
    venues?: { status: string } | { status: string }[] | null;
  } | Array<{
    name: string;
    status: string;
    venues?: { status: string } | { status: string }[] | null;
  }> | null;
};

type AdminTicketSalesTicketRow = {
  status: string;
  section_id: string;
  event_sessions?: { event_id: string } | { event_id: string }[] | null;
  venue_sections?: { name: string; status: string } | { name: string; status: string }[] | null;
  orders?: { status: string } | { status: string }[] | null;
  reservation_items?: {
    ticket_type: string;
    price_cents: number | null;
    fee_cents: number | null;
  } | Array<{
    ticket_type: string;
    price_cents: number | null;
    fee_cents: number | null;
  }> | null;
};

type AdminTicketSalesPriceRow = {
  section_id: string;
  status: string;
  sales_start_at: string | null;
  sales_end_at: string | null;
  event_sessions?: { event_id: string } | { event_id: string }[] | null;
  venue_sections?: {
    name: string;
    status: string;
    venues?: { status: string } | { status: string }[] | null;
  } | Array<{
    name: string;
    status: string;
    venues?: { status: string } | { status: string }[] | null;
  }> | null;
};

type AdminTicketSalesCourtesyLimitRow = {
  event_id: string;
  section_id: string;
  max_courtesies: number;
  status: string;
  venue_sections?: {
    name: string;
    status: string;
    venues?: { status: string } | { status: string }[] | null;
  } | Array<{
    name: string;
    status: string;
    venues?: { status: string } | { status: string }[] | null;
  }> | null;
};

type AdminTableMapReservationOverviewRow = {
  place_code: string;
  status: string;
  reservations?: {
    event_sessions?: { event_id: string } | { event_id: string }[] | null;
  } | Array<{
    event_sessions?: { event_id: string } | { event_id: string }[] | null;
  }> | null;
};

type AdminTicketCheckoutPaymentMetricRow = {
  raw_metadata: Record<string, unknown> | null;
  checkout_url: string | null;
  orders?: {
    reservations?: {
      event_sessions?: { event_id: string } | { event_id: string }[] | null;
    } | Array<{
      event_sessions?: { event_id: string } | { event_id: string }[] | null;
    }> | null;
  } | Array<{
    reservations?: {
      event_sessions?: { event_id: string } | { event_id: string }[] | null;
    } | Array<{
      event_sessions?: { event_id: string } | { event_id: string }[] | null;
    }> | null;
  }> | null;
};

type AdminEventsQueryMetric = {
  table: string;
  fields: string;
  filters: string[];
  rows: number;
  durationMs: number;
  mode: "sequential" | "parallel";
};

export function normalizeSlug(value: string) {
  return value
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export function parseBrazilianDateTime(value: string) {
  const match = value
    .trim()
    .match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:\s+|\s+às\s+)(\d{1,2}):(\d{2})$/i);

  if (!match) {
    return null;
  }

  const [, dayRaw, monthRaw, yearRaw, hourRaw, minuteRaw] = match;
  const day = Number(dayRaw);
  const month = Number(monthRaw);
  const year = Number(yearRaw);
  const hour = Number(hourRaw);
  const minute = Number(minuteRaw);

  if (
    month < 1 ||
    month > 12 ||
    day < 1 ||
    day > 31 ||
    hour < 0 ||
    hour > 23 ||
    minute < 0 ||
    minute > 59
  ) {
    return null;
  }

  const iso = `${year.toString().padStart(4, "0")}-${month
    .toString()
    .padStart(2, "0")}-${day.toString().padStart(2, "0")}T${hour
    .toString()
    .padStart(2, "0")}:${minute.toString().padStart(2, "0")}:00-03:00`;
  const parsed = new Date(iso);

  if (Number.isNaN(parsed.getTime())) {
    return null;
  }

  return parsed.toISOString();
}

export function parseMoneyToCents(value: string) {
  const withoutCurrency = value
    .trim()
    .replace(/^r\$\s*/i, "")
    .replace(/\s+/g, "");
  const hasComma = withoutCurrency.includes(",");
  const hasDot = withoutCurrency.includes(".");
  const normalized =
    hasComma && hasDot
      ? withoutCurrency.replace(/\./g, "").replace(",", ".")
      : hasComma
        ? withoutCurrency.replace(",", ".")
        : withoutCurrency;
  const amount = Number(normalized);

  if (!Number.isFinite(amount) || amount < 0) {
    return null;
  }

  return Math.round(amount * 100);
}

export function parseSeatCodes(value: string) {
  return Array.from(
    new Set(
      value
        .split(",")
        .map((code) => code.trim().toUpperCase())
        .filter(Boolean),
    ),
  );
}

export function parseSeatRange(value: string) {
  const match = value
    .trim()
    .match(
      /^(?:prefixo\s+)?(?:fileira\s+)?([a-zA-Z]+)\s*,?\s*(?:(\d+)\s*assentos?)?\s*,?\s*(?:de\s+)?(\d+)\s*(?:a|até|-)\s*(\d+)$/i,
    );

  if (!match) {
    return null;
  }

  const [, prefix, countRaw, startRaw, endRaw] = match;
  const start = Number(startRaw);
  const end = Number(endRaw);
  const expectedCount = countRaw ? Number(countRaw) : null;
  const step = start <= end ? 1 : -1;
  const count = Math.abs(end - start) + 1;

  if (
    !Number.isInteger(start) ||
    !Number.isInteger(end) ||
    start < 1 ||
    end < 1 ||
    (expectedCount !== null &&
      (!Number.isInteger(expectedCount) || expectedCount !== count))
  ) {
    return null;
  }

  const width = Math.max(startRaw.length, endRaw.length, 2);
  return Array.from({ length: count }, (_, index) => {
    const seatNumber = String(start + index * step).padStart(width, "0");
    return `${prefix.toUpperCase()}${seatNumber}`;
  });
}

type ParsedSeatLayoutLine = {
  seatCodes: string[];
  seatMapPositions: Record<string, { x: number; y: number }>;
  invalidLines?: string[];
};

function buildSeatCode(prefix: string, seatNumber: number, width: number) {
  return `${prefix.toUpperCase()}${String(seatNumber).padStart(width, "0")}`;
}

function parseSeatRangeLayoutLine(value: string, rowIndex: number): ParsedSeatLayoutLine | null {
  const match = value
    .trim()
    .match(
      /^(?:fileira\s+)?([a-zA-Z]+)\s+(?:(\d+)\s+assentos?\s+)?(?:de\s+)?(\d+)\s*(?:a|até|-)\s*(\d+)(.*)$/i,
    );

  if (!match) {
    return null;
  }

  const [, prefix, countRaw, startRaw, endRaw, modifiersRaw = ""] = match;
  const start = Number(startRaw);
  const end = Number(endRaw);
  const expectedCount = countRaw ? Number(countRaw) : null;
  const step = start <= end ? 1 : -1;
  const count = Math.abs(end - start) + 1;

  if (
    !Number.isInteger(start) ||
    !Number.isInteger(end) ||
    start < 1 ||
    end < 1 ||
    (expectedCount !== null &&
      (!Number.isInteger(expectedCount) || expectedCount !== count))
  ) {
    return null;
  }

  let xOffset = 0;
  let yOffset = 0;
  const modifiers = modifiersRaw
    .split("-")
    .map((modifier) => modifier.trim())
    .filter(Boolean);

  for (const modifier of modifiers) {
    const modifierMatch = modifier.match(
      /^(\d+)\s*x?\s*(?:a\s+)?(esquerda|direita|abaixo|acima)$/i,
    );

    if (!modifierMatch) {
      return null;
    }

    const amount = Number(modifierMatch[1]);
    const direction = modifierMatch[2].toLowerCase();

    if (!Number.isInteger(amount) || amount < 0) {
      return null;
    }

    // "3x esquerda" means there are 3 empty slots on the left before seats start.
    if (direction === "esquerda") xOffset += amount;
    if (direction === "direita") xOffset -= amount;
    if (direction === "abaixo") yOffset += amount;
    if (direction === "acima") yOffset -= amount;
  }

  const width = Math.max(startRaw.length, endRaw.length, 2);
  const seatCodes: string[] = [];
  const seatMapPositions: Record<string, { x: number; y: number }> = {};

  for (let index = 0; index < count; index += 1) {
    const seatCode = buildSeatCode(prefix, start + index * step, width);
    seatCodes.push(seatCode);
    seatMapPositions[seatCode] = {
      x: xOffset + index + 1,
      y: rowIndex + 1 + yOffset,
    };
  }

  return { seatCodes, seatMapPositions };
}

function parseVisualSeatLayoutLine(value: string, rowIndex: number): ParsedSeatLayoutLine | null {
  const match = value.trim().match(/^([a-zA-Z]+)\s*:\s*(.+)$/i);

  if (!match) {
    return null;
  }

  const [, rowLabel, layoutRaw] = match;
  const tokens = layoutRaw.split(/\s+/).filter(Boolean);
  const numericTokens = tokens.filter((token) => /^\d+$/.test(token));

  if (!numericTokens.length) {
    return null;
  }

  const width = Math.max(2, ...numericTokens.map((token) => token.length));
  const seatCodes: string[] = [];
  const seatMapPositions: Record<string, { x: number; y: number }> = {};
  let x = 1;

  for (const token of tokens) {
    if (/^_+$/.test(token)) {
      x += token.length;
      continue;
    }

    if (!/^\d+$/.test(token)) {
      return null;
    }

    const seatCode = buildSeatCode(rowLabel, Number(token), width);
    seatCodes.push(seatCode);
    seatMapPositions[seatCode] = { x, y: rowIndex + 1 };
    x += 1;
  }

  return { seatCodes, seatMapPositions };
}

function looksLikeStructuredSeatLayoutLine(value: string) {
  return (
    /^[a-zA-Z]\s*:/i.test(value.trim()) ||
    /^(?:fileira\s+)?[a-zA-Z]+\s+\d+.*\b(?:assento|assentos|de)\b/i.test(
      value.trim(),
    )
  );
}

export function parseSeatLayout(value: string): ParsedSeatLayoutLine {
  const lines = value
    .split(/\n|;/)
    .map((line) => line.trim())
    .filter(Boolean);
  const seatCodes: string[] = [];
  const seatMapPositions: Record<string, { x: number; y: number }> = {};
  const invalidLines: string[] = [];

  for (const [index, line] of lines.entries()) {
    const parsed =
      parseVisualSeatLayoutLine(line, index) ??
      parseSeatRangeLayoutLine(line, index);

    if (!parsed && looksLikeStructuredSeatLayoutLine(line)) {
      invalidLines.push(line);
      continue;
    }

    const parsedSeatCodes = parsed?.seatCodes ?? parseSeatCodesOrRange(line);

    for (const seatCode of parsedSeatCodes) {
      if (seatCodes.includes(seatCode)) {
        continue;
      }

      seatCodes.push(seatCode);

      if (parsed?.seatMapPositions[seatCode]) {
        seatMapPositions[seatCode] = parsed.seatMapPositions[seatCode];
      }
    }
  }

  return {
    seatCodes: invalidLines.length ? [] : seatCodes,
    seatMapPositions: invalidLines.length ? {} : seatMapPositions,
    invalidLines,
  };
}

export function parseSeatCodesOrRange(value: string): string[] {
  const lines = value
    .split(/\n|;/)
    .map((line) => line.trim())
    .filter(Boolean);

  if (lines.length > 1) {
    return Array.from(
      new Set(lines.flatMap((line) => parseSeatLayout(line).seatCodes)),
    );
  }

  const parsedLayout =
    parseVisualSeatLayoutLine(value, 0) ??
    parseSeatRangeLayoutLine(value, 0);

  if (parsedLayout) {
    return parsedLayout.seatCodes;
  }

  return value.includes(",") ? parseSeatCodes(value) : parseSeatRange(value) ?? parseSeatCodes(value);
}

export function parseInitialEventSections(value: string, options: { numbered: boolean }) {
  const parts = value
    .split(/\n|,/)
    .map((part) => part.trim())
    .filter(Boolean);
  const sections: AdminInitialEventSectionInput[] = [];
  const usedSlugs = new Set<string>();

  for (const part of parts) {
    const [nameRaw, capacityRaw] = part.split(":").map((item) => item.trim());
    const name = nameRaw?.trim();
    const capacity = capacityRaw ? Number(capacityRaw.replace(/\D/g, "")) : null;
    const slugBase = normalizeSlug(name ?? "");

    if (!name || !slugBase) {
      return null;
    }

    if (!options.numbered && (!Number.isInteger(capacity) || (capacity ?? 0) <= 0)) {
      return null;
    }

    let slug = slugBase;
    let suffix = 2;
    while (usedSlugs.has(slug)) {
      slug = `${slugBase}-${suffix}`;
      suffix += 1;
    }
    usedSlugs.add(slug);

    sections.push({
      name,
      slug,
      hasNumberedSeats: options.numbered,
      capacity: options.numbered ? capacity : capacity ?? null,
      createInventorySeats: !options.numbered,
      ticketType: "full",
      label: name,
      priceCents: 0,
      feeCents: 0,
    });
  }

  return sections.length ? sections : null;
}

export function isEventStatus(value: string): value is AdminEventStatus {
  return ["draft", "published", "cancelled", "finished"].includes(value);
}

export function isSessionStatus(value: string): value is AdminSessionStatus {
  return [
    "scheduled",
    "sales_open",
    "sales_closed",
    "cancelled",
    "finished",
  ].includes(value);
}

export function isTicketType(value: string): value is AdminTicketType {
  return ["full", "half", "promotional", "free"].includes(value);
}

function isMissingEventOwnershipColumnError(error: unknown) {
  if (!error || typeof error !== "object") {
    return false;
  }

  return (
    "message" in error &&
    String((error as { message?: unknown }).message).includes(
      "created_by_admin",
    )
  );
}

function firstJoin<T>(value: T | T[] | null | undefined): T | null {
  if (Array.isArray(value)) return value[0] ?? null;
  return value ?? null;
}

async function fetchAllRows<T>(query: { range: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: unknown }> }) {
  const rows: T[] = [];
  const pageSize = 1000;

  for (let from = 0; ; from += pageSize) {
    const { data, error } = await query.range(from, from + pageSize - 1);
    if (error) throw error;
    const page = data ?? [];
    rows.push(...page);
    if (page.length < pageSize) break;
  }

  return rows;
}

function buildSectionShortLabel(name: string | null | undefined) {
  const normalizedName = (name ?? "")
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toUpperCase();

  if (/\bINDIVIDUAL\b/.test(normalizedName)) return "IN";

  const tableCapacityMatch = normalizedName.match(/\bMESA\b.*\b(?:PARA\s+)?([246])\b/);
  if (tableCapacityMatch) return `M${tableCapacityMatch[1]}`;

  const words = (name ?? "")
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toUpperCase()
    .match(/[A-Z0-9]+/g) ?? [];

  if (!words.length) return "ST";

  const ignored = new Set(["DE", "DA", "DO", "DAS", "DOS", "E", "COM", "SEM", "PARA", "POR", "O", "A"]);
  const significantWords = words.filter((word) => !ignored.has(word));

  if (significantWords.length >= 2) {
    return significantWords.slice(0, 2).map((word) => word[0]).join("");
  }

  const base = significantWords[0] ?? words[0] ?? "ST";
  return base.slice(0, Math.min(base.length, 2));
}

function getTicketSalesOverviewIdentity(sectionId: string | null | undefined, name: string | null | undefined) {
  return {
    key: `section:${sectionId ?? normalizeSlug(name ?? "setor")}`,
    label: name?.trim() || "Setor",
    shortLabel: buildSectionShortLabel(name),
  };
}

const TABLE_MAP_OVERVIEW_IDENTITIES = [
  { key: "table-map:2", label: "Mesa/bistr? para 2", shortLabel: "M2", capacity: 11, placeCapacity: 2 },
  { key: "table-map:4", label: "Mesa/bistr? para 4", shortLabel: "M4", capacity: 20, placeCapacity: 4 },
  { key: "table-map:6", label: "Bistro para 6", shortLabel: "B6", capacity: 6, placeCapacity: 6 },
  { key: "table-map:8", label: "Mesa para 8", shortLabel: "M8", capacity: 3, placeCapacity: 8 },
] as const;

function getTableMapOverviewIdentity(placeCapacity: 2 | 4 | 6 | 8) {
  return TABLE_MAP_OVERVIEW_IDENTITIES.find(
    (identity) => identity.placeCapacity === placeCapacity,
  ) ?? null;
}

function emptyTicketSalesOverview(): AdminEventSummary["ticketSalesOverview"] {
  return [
    {
      key: "total",
      label: "Total de vendas",
      shortLabel: "TT",
      sold: 0,
      available: 0,
      courtesySold: 0,
      courtesyAvailable: 0,
      courtesyCapacity: 0,
      salesSold: 0,
      salesAvailable: 0,
      salesCapacity: 0,
    },
  ];
}

function buildTicketSalesOverviewByEvent({
  eventIds,
  seats,
  tickets,
  prices,
  courtesyLimits,
  tableMapReservations,
}: {
  eventIds: string[];
  seats: AdminTicketSalesSeatRow[];
  tickets: AdminTicketSalesTicketRow[];
  prices: AdminTicketSalesPriceRow[];
  courtesyLimits: AdminTicketSalesCourtesyLimitRow[];
  tableMapReservations: AdminTableMapReservationOverviewRow[];
}) {
  const overviewByEvent = new Map<string, AdminEventSummary["ticketSalesOverview"]>();
  const nowIso = new Date().toISOString();
  const sellableSectionKeys = new Set<string>();
  const courtesySoldBySection = new Map<string, number>();
  const ensure = (eventId: string) => {
    const existing = overviewByEvent.get(eventId);
    if (existing) return existing;
    const created = emptyTicketSalesOverview();
    overviewByEvent.set(eventId, created);
    return created;
  };
  const ensureOverviewItem = (
    eventId: string,
    identity: ReturnType<typeof getTicketSalesOverviewIdentity> | null,
  ) => {
    if (!identity) return null;
    const overview = ensure(eventId);
    let item = overview.find((entry) => entry.key === identity.key);
    if (!item && identity.label && identity.shortLabel) {
      item = {
        key: identity.key,
        label: identity.label,
        shortLabel: identity.shortLabel,
        sold: 0,
        available: 0,
        courtesySold: 0,
        courtesyAvailable: 0,
        courtesyCapacity: 0,
        salesSold: 0,
        salesAvailable: 0,
        salesCapacity: 0,
      };
      overview.push(item);
    }
    return item ?? null;
  };
  const increment = (
    eventId: string,
    identity: ReturnType<typeof getTicketSalesOverviewIdentity> | null,
    field:
      | "courtesySold"
      | "courtesyAvailable"
      | "courtesyCapacity"
      | "salesSold"
      | "salesAvailable"
      | "salesCapacity",
  ) => {
    const overview = ensure(eventId);
    const total = overview.find((entry) => entry.key === "total");
    if (total) {
      total[field] += 1;
      total.sold = total.courtesySold + total.salesSold;
      total.available = total.salesAvailable;
    }
    const item = ensureOverviewItem(eventId, identity);
    if (item) {
      item[field] += 1;
      item.sold = item.courtesySold + item.salesSold;
      item.available = item.salesAvailable;
    }
  };
  const addAmount = (
    eventId: string,
    identity: ReturnType<typeof getTicketSalesOverviewIdentity> | null,
    field:
      | "courtesySold"
      | "courtesyAvailable"
      | "courtesyCapacity"
      | "salesSold"
      | "salesAvailable"
      | "salesCapacity",
    amount: number,
  ) => {
    if (amount <= 0) return;
    const overview = ensure(eventId);
    const total = overview.find((entry) => entry.key === "total");
    if (total) {
      total[field] += amount;
      total.sold = total.courtesySold + total.salesSold;
      total.available = total.salesAvailable;
    }
    const item = ensureOverviewItem(eventId, identity);
    if (item) {
      item[field] += amount;
      item.sold = item.courtesySold + item.salesSold;
      item.available = item.salesAvailable;
    }
  };
  const addTableMapAmount = (
    eventId: string,
    identity: (typeof TABLE_MAP_OVERVIEW_IDENTITIES)[number],
    field: "salesSold" | "salesAvailable" | "salesCapacity",
    amount: number,
  ) => {
    if (amount <= 0) return;
    const item = ensureOverviewItem(eventId, identity);
    if (!item) return;
    item[field] += amount;
    item.sold = item.salesSold;
    item.available = item.salesAvailable;
  };

  eventIds.forEach((eventId) => ensure(eventId));
  const placeCapacityByCode = new Map(
    OFFICIAL_TABLE_MAP_PLACES.map((place) => [place.code, place.capacity]),
  );

  for (const price of prices) {
    const eventId = firstJoin(price.event_sessions)?.event_id;
    const section = firstJoin(price.venue_sections);
    if (!eventId) continue;
    ensureOverviewItem(eventId, getTicketSalesOverviewIdentity(price.section_id, section?.name));
  }

  for (const seat of seats) {
    const eventId = firstJoin(seat.event_sessions)?.event_id;
    const section = firstJoin(seat.venue_sections);
    if (!eventId) continue;
    ensureOverviewItem(eventId, getTicketSalesOverviewIdentity(seat.section_id, section?.name));
  }

  for (const limit of courtesyLimits) {
    const section = firstJoin(limit.venue_sections);
    if (!limit.event_id) continue;
    ensureOverviewItem(limit.event_id, getTicketSalesOverviewIdentity(limit.section_id, section?.name));
  }

  for (const price of prices) {
    if (price.status !== "active") continue;
    if (price.sales_start_at && price.sales_start_at > nowIso) continue;
    if (price.sales_end_at && price.sales_end_at < nowIso) continue;
    const eventId = firstJoin(price.event_sessions)?.event_id;
    const section = firstJoin(price.venue_sections);
    const venue = firstJoin(section?.venues);
    if (!eventId || !price.section_id) continue;
    if (section?.status !== "active" || venue?.status !== "active") continue;
    sellableSectionKeys.add(`${eventId}:${price.section_id}`);
  }

  for (const ticket of tickets) {
    if (ticket.status === "cancelled") continue;
    if (firstJoin(ticket.orders)?.status !== "paid") continue;
    const eventId = firstJoin(ticket.event_sessions)?.event_id;
    if (!eventId) continue;
    const item = firstJoin(ticket.reservation_items);
    const amount = Number(item?.price_cents ?? 0) + Number(item?.fee_cents ?? 0);
    const isCourtesy = item?.ticket_type === "free" || amount === 0;
    const section = firstJoin(ticket.venue_sections);
    if (!isCourtesy && !sellableSectionKeys.has(`${eventId}:${ticket.section_id}`)) continue;
    increment(
      eventId,
      getTicketSalesOverviewIdentity(ticket.section_id, section?.name),
      isCourtesy ? "courtesySold" : "salesSold",
    );
    if (isCourtesy) {
      const key = `${eventId}:${ticket.section_id}`;
      courtesySoldBySection.set(key, (courtesySoldBySection.get(key) ?? 0) + 1);
    }
  }

  for (const limit of courtesyLimits) {
    const section = firstJoin(limit.venue_sections);
    const venue = firstJoin(section?.venues);
    if (limit.status !== "active") continue;
    if (section?.status !== "active" || venue?.status !== "active") continue;
    const sold = courtesySoldBySection.get(`${limit.event_id}:${limit.section_id}`) ?? 0;
    const available = Math.max(0, Number(limit.max_courtesies ?? 0) - sold);
    addAmount(
      limit.event_id,
      getTicketSalesOverviewIdentity(limit.section_id, section?.name),
      "courtesyAvailable",
      available,
    );
    addAmount(
      limit.event_id,
      getTicketSalesOverviewIdentity(limit.section_id, section?.name),
      "courtesyCapacity",
      Number(limit.max_courtesies ?? 0),
    );
  }

  for (const eventId of eventIds) {
    for (const identity of TABLE_MAP_OVERVIEW_IDENTITIES) {
      ensureOverviewItem(eventId, identity);
      addTableMapAmount(eventId, identity, "salesCapacity", identity.capacity);
      addTableMapAmount(eventId, identity, "salesAvailable", identity.capacity);
    }
  }

  for (const reservation of tableMapReservations) {
    if (reservation.status !== "active" && reservation.status !== "paid") continue;
    const eventId = firstJoin(firstJoin(reservation.reservations)?.event_sessions)?.event_id;
    if (!eventId) continue;
    const placeCapacity = placeCapacityByCode.get(reservation.place_code.padStart(2, "0"));
    if (!placeCapacity) continue;
    const identity = getTableMapOverviewIdentity(placeCapacity);
    if (!identity) continue;
    addTableMapAmount(eventId, identity, "salesSold", 1);
    const item = ensureOverviewItem(eventId, identity);
    if (item) {
      item.salesAvailable = Math.max(0, item.salesCapacity - item.salesSold);
      item.available = item.salesAvailable;
      item.sold = item.salesSold;
    }
  }

  for (const seat of seats) {
    const eventId = firstJoin(seat.event_sessions)?.event_id;
    const section = firstJoin(seat.venue_sections);
    const venue = firstJoin(section?.venues);
    const physicalSeat = firstJoin(seat.seats);
    if (!eventId) continue;
    if (physicalSeat?.status !== "active") continue;
    if (section?.status !== "active" || venue?.status !== "active") continue;
    const identity = getTicketSalesOverviewIdentity(seat.section_id, section?.name);
    if (!sellableSectionKeys.has(`${eventId}:${seat.section_id}`)) continue;
    increment(eventId, identity, "salesCapacity");
    if (seat.status === "available") {
      increment(eventId, identity, "salesAvailable");
    }
  }

  return overviewByEvent;
}

function toSummary(
  event: EventRow,
  sessions: SessionRow[],
  ticketSalesOverview: AdminEventSummary["ticketSalesOverview"] = emptyTicketSalesOverview(),
  ticketMetrics: { impressions: number; clicks: number } = { impressions: 0, clicks: 0 },
): AdminEventSummary {
  const eventSessions = sessions
    .filter((session) => session.event_id === event.id)
    .sort(
      (left, right) =>
        new Date(left.starts_at).getTime() - new Date(right.starts_at).getTime(),
    );
  const futureSession =
    eventSessions.find((session) => new Date(session.starts_at).getTime() >= Date.now()) ??
    null;
  const lastSession = eventSessions[eventSessions.length - 1] ?? null;
  const hasOnlyPastSessions = Boolean(
    eventSessions.length &&
      !futureSession &&
      eventSessions.every((session) => new Date(session.starts_at).getTime() < Date.now()),
  );
  const displayStatus =
    event.status === "published" && hasOnlyPastSessions
      ? "finished"
      : event.status;
  const displaySession = futureSession ?? lastSession;

  return {
    eventId: event.id,
    title: event.title,
    artistName: event.artist_name,
    artistIcon: event.artist_icon ?? null,
    description: event.description,
    city: event.city,
    state: event.state,
    status: event.status,
    displayStatus,
    imageUrl: event.image_url,
    venueId: event.venue_id,
    venueName: event.venues?.name ?? null,
    createdAt: event.created_at,
    wasEdited:
      Boolean(event.updated_at) &&
      new Date(event.updated_at ?? event.created_at).getTime() -
        new Date(event.created_at).getTime() >
        5_000,
    createdByAdminUserId: event.created_by_admin_user_id ?? null,
    createdByAdminPhone: event.created_by_admin_phone ?? null,
    sessionsCount: eventSessions.length,
    nextSessionStartsAt: displaySession?.starts_at ?? null,
    nextSessionStatus: displaySession?.status ?? null,
    ticketSalesOverview,
    ticketImpressions: ticketMetrics.impressions,
    ticketClicks: ticketMetrics.clicks,
  };
}

export async function listAdminEvents(input: {
  page?: number;
  search?: string | null;
  status?: AdminEventStatus | "all";
  ownerAdminUserId?: string | null;
  canSeeAll?: boolean;
  includeSalesOverview?: boolean;
}) {
  const supabase = getSupabaseAdmin();
  const includeSalesOverview = input.includeSalesOverview !== false;
  const metrics = {
    eventsQueryMs: 0,
    sessionsQueryMs: 0,
    transformMs: 0,
    queries: [] as AdminEventsQueryMetric[],
  };
  const runEventsQuery = async (includeOwnership: boolean) => {
    let fields = "id, title, artist_name, artist_icon, description, city, state, status, image_url, venue_id, created_at, updated_at, venues(name)";
    if (includeOwnership) {
      fields = "id, title, artist_name, artist_icon, description, city, state, status, image_url, venue_id, created_at, updated_at, created_by_admin_user_id, created_by_admin_phone, venues(name)";
    }
    if (!includeSalesOverview) {
      fields = "id, title, artist_name, artist_icon, city, state, status, image_url, venue_id, created_at, updated_at, venues(name), event_sessions(id, event_id, venue_id, starts_at, status, venues(name))";
      if (includeOwnership) {
        fields = "id, title, artist_name, artist_icon, city, state, status, image_url, venue_id, created_at, updated_at, created_by_admin_user_id, created_by_admin_phone, venues(name), event_sessions(id, event_id, venue_id, starts_at, status, venues(name))";
      }
    }
    let query = supabase
      .from("events")
      .select(fields);
    const filters: string[] = [];

    if (input.status && input.status !== "all" && input.status !== "finished") {
      query = query.eq("status", input.status);
      filters.push(`status = ${input.status}`);
    }

    if (includeOwnership && !input.canSeeAll) {
      query = query.eq("created_by_admin_user_id", input.ownerAdminUserId ?? "");
      filters.push("created_by_admin_user_id = current_admin");
    }

    if (input.search?.trim()) {
      query = query.ilike("search_text", `%${input.search.trim().toLowerCase()}%`);
      filters.push("search_text ilike search");
    }

    const startedAt = performance.now();
    const response = await query
      .order("created_at", { ascending: false })
      .returns<EventRow[]>();
    metrics.eventsQueryMs += Math.round(performance.now() - startedAt);
    if (!response.error) {
      metrics.queries.push({
        table: includeSalesOverview ? "events" : "events + event_sessions",
        fields,
        filters,
        rows: response.data?.length ?? 0,
        durationMs: metrics.eventsQueryMs,
        mode: "sequential",
      });
    }
    return response;
  };

  let { data: events, error } = await runEventsQuery(true);

  if (error && isMissingEventOwnershipColumnError(error)) {
    if (!input.canSeeAll) {
      return { ok: false as const, reason: "ownership_unavailable" as const, error };
    }

    const fallback = await runEventsQuery(false);
    events = fallback.data;
    error = fallback.error;
  }

  if (error) {
    return { ok: false as const, error };
  }

  const eventRows = events ?? [];
  const eventIds = eventRows.map((event) => event.id);
  if (!includeSalesOverview) {
    const transformStartedAt = performance.now();
    const summaries = eventRows
      .map((event) => {
        const sessions = Array.isArray(event.event_sessions)
          ? event.event_sessions
          : event.event_sessions ? [event.event_sessions] : [];
        return toSummary(event, sessions);
      })
      .filter((event) => {
        if (!input.status || input.status === "all") return true;
        return event.displayStatus === input.status;
      })
      .sort((left, right) => {
        if (input.status === "all" && left.wasEdited !== right.wasEdited) {
          return left.wasEdited ? 1 : -1;
        }

        if (left.displayStatus === "finished" && right.displayStatus !== "finished") return 1;
        if (left.displayStatus !== "finished" && right.displayStatus === "finished") return -1;

        const leftTime = left.nextSessionStartsAt
          ? new Date(left.nextSessionStartsAt).getTime()
          : Number.MAX_SAFE_INTEGER;
        const rightTime = right.nextSessionStartsAt
          ? new Date(right.nextSessionStartsAt).getTime()
          : Number.MAX_SAFE_INTEGER;

        return leftTime - rightTime || right.createdAt.localeCompare(left.createdAt);
      });
    metrics.transformMs = Math.round(performance.now() - transformStartedAt);
    return {
      ok: true as const,
      events: summaries,
      page: 0,
      hasMore: false,
      metrics,
    };
  }
  const { data: sessions, error: sessionsError } = eventIds.length
    ? await (async () => {
        const startedAt = performance.now();
        const fields = "id, event_id, venue_id, starts_at, status, venues(name)";
        const response = await supabase
        .from("event_sessions")
        .select(fields)
        .in("event_id", eventIds)
        .order("starts_at", { ascending: true })
        .returns<SessionRow[]>();
        metrics.sessionsQueryMs = Math.round(performance.now() - startedAt);
        if (!response.error) {
          metrics.queries.push({
            table: "event_sessions",
            fields,
            filters: ["event_id in listed_events"],
            rows: response.data?.length ?? 0,
            durationMs: metrics.sessionsQueryMs,
            mode: "sequential",
          });
        }
        return response;
      })()
    : { data: [] as SessionRow[], error: null };

  if (sessionsError) {
    return { ok: false as const, error: sessionsError };
  }

  const [salesSeats, salesTickets, salesPrices, salesCourtesyLimits, tableMapReservations, checkoutPayments] = eventIds.length && includeSalesOverview
    ? await Promise.all([
        fetchAllRows<AdminTicketSalesSeatRow>(
          supabase
            .from("session_seats")
            .select("status, section_id, event_sessions!inner(event_id), seats!inner(status), venue_sections!inner(name, status, venues!inner(status))")
            .in("event_sessions.event_id", eventIds)
            .returns<AdminTicketSalesSeatRow[]>(),
        ),
        fetchAllRows<AdminTicketSalesTicketRow>(
          supabase
            .from("tickets")
            .select("status, section_id, event_sessions!inner(event_id), venue_sections(name, status), orders!inner(status), reservation_items(ticket_type, price_cents, fee_cents)")
            .in("event_sessions.event_id", eventIds)
            .eq("orders.status", "paid")
            .returns<AdminTicketSalesTicketRow[]>(),
        ),
        fetchAllRows<AdminTicketSalesPriceRow>(
          supabase
            .from("ticket_prices")
            .select("section_id, status, sales_start_at, sales_end_at, event_sessions!inner(event_id), venue_sections!inner(name, status, venues!inner(status))")
            .in("event_sessions.event_id", eventIds)
            .neq("ticket_type", "free")
            .returns<AdminTicketSalesPriceRow[]>(),
        ),
        fetchAllRows<AdminTicketSalesCourtesyLimitRow>(
          supabase
            .from("courtesy_section_limits")
            .select("event_id, section_id, max_courtesies, status, venue_sections!inner(name, status, venues!inner(status))")
            .in("event_id", eventIds)
            .returns<AdminTicketSalesCourtesyLimitRow[]>(),
        ),
        fetchAllRows<AdminTableMapReservationOverviewRow>(
          supabase
            .from("official_table_map_reservations")
            .select("place_code, status, reservations!inner(event_sessions!inner(event_id))")
            .in("reservations.event_sessions.event_id", eventIds)
            .in("status", ["active", "paid"])
            .returns<AdminTableMapReservationOverviewRow[]>(),
        ),
        fetchAllRows<AdminTicketCheckoutPaymentMetricRow>(
          supabase
            .from("payments")
            .select("raw_metadata, checkout_url, orders!inner(reservations!inner(event_sessions!inner(event_id)))")
            .in("orders.reservations.event_sessions.event_id", eventIds)
            .not("checkout_url", "is", null)
            .returns<AdminTicketCheckoutPaymentMetricRow[]>(),
        ),
      ])
    : [
        [] as AdminTicketSalesSeatRow[],
        [] as AdminTicketSalesTicketRow[],
        [] as AdminTicketSalesPriceRow[],
        [] as AdminTicketSalesCourtesyLimitRow[],
        [] as AdminTableMapReservationOverviewRow[],
        [] as AdminTicketCheckoutPaymentMetricRow[],
      ];
  const ticketSalesOverviewByEvent = buildTicketSalesOverviewByEvent({
    eventIds,
    seats: salesSeats,
    tickets: salesTickets,
    prices: salesPrices,
    courtesyLimits: salesCourtesyLimits,
    tableMapReservations,
  });
  const ticketMetricsByEvent = new Map<string, { impressions: number; clicks: number }>();
  for (const payment of checkoutPayments) {
    const eventId = firstJoin(firstJoin(firstJoin(payment.orders)?.reservations)?.event_sessions)?.event_id;
    if (!eventId) continue;
    const metrics = ticketMetricsByEvent.get(eventId) ?? { impressions: 0, clicks: 0 };
    if (payment.checkout_url) metrics.impressions += 1;
    const clickCount = Number(payment.raw_metadata?.checkout_click_count ?? 0);
    if (Number.isFinite(clickCount) && clickCount > 0) {
      metrics.clicks += clickCount;
    }
    ticketMetricsByEvent.set(eventId, metrics);
  }

  const summaries = eventRows
    .map((event) => toSummary(
      event,
      sessions ?? [],
      ticketSalesOverviewByEvent.get(event.id),
      ticketMetricsByEvent.get(event.id),
    ))
    .filter((event) => {
      if (!input.status || input.status === "all") return true;
      return event.displayStatus === input.status;
    })
    .sort((left, right) => {
      if (input.status === "all" && left.wasEdited !== right.wasEdited) {
        return left.wasEdited ? 1 : -1;
      }

      if (left.displayStatus === "finished" && right.displayStatus !== "finished") return 1;
      if (left.displayStatus !== "finished" && right.displayStatus === "finished") return -1;

      const leftTime = left.nextSessionStartsAt
        ? new Date(left.nextSessionStartsAt).getTime()
        : Number.MAX_SAFE_INTEGER;
      const rightTime = right.nextSessionStartsAt
        ? new Date(right.nextSessionStartsAt).getTime()
        : Number.MAX_SAFE_INTEGER;

      return leftTime - rightTime || right.createdAt.localeCompare(left.createdAt);
    });
  return {
    ok: true as const,
    events: summaries,
    page: 0,
    hasMore: false,
  };
}

export async function getAdminEventDetails(eventId: string) {
  const supabase = getSupabaseAdmin();
  const runEventQuery = (includeOwnership: boolean) =>
    supabase
      .from("events")
      .select(
        includeOwnership
          ? "id, title, artist_name, artist_icon, description, city, state, status, image_url, venue_id, created_at, created_by_admin_user_id, created_by_admin_phone, venues(name)"
          : "id, title, artist_name, artist_icon, description, city, state, status, image_url, venue_id, created_at, venues(name)",
      )
      .eq("id", eventId)
      .maybeSingle<EventRow>();

  let { data: event, error } = await runEventQuery(true);

  if (error && isMissingEventOwnershipColumnError(error)) {
    const fallback = await runEventQuery(false);
    event = fallback.data;
    error = fallback.error;
  }

  if (error || !event) {
    return { ok: false as const, reason: "not_found" as const, error };
  }

  const { data: sessions, error: sessionsError } = await supabase
    .from("event_sessions")
    .select("id, event_id, venue_id, starts_at, status, venues(name)")
    .eq("event_id", eventId)
    .order("starts_at", { ascending: true })
    .returns<SessionRow[]>();

  if (sessionsError) {
    return { ok: false as const, reason: "database_error" as const, error: sessionsError };
  }

  const sessionIds = (sessions ?? []).map((session) => session.id);
  const [priceLinks, inventoryLinks] = sessionIds.length
    ? await Promise.all([
        supabase
          .from("ticket_prices")
          .select("section_id")
          .in("session_id", sessionIds)
          .returns<Array<{ section_id: string }>>(),
        supabase
          .from("session_seats")
          .select("section_id")
          .in("session_id", sessionIds)
          .returns<Array<{ section_id: string }>>(),
      ])
    : [
        { data: [] as Array<{ section_id: string }>, error: null },
        { data: [] as Array<{ section_id: string }>, error: null },
      ];

  if (priceLinks.error || inventoryLinks.error) {
    return {
      ok: false as const,
      reason: "database_error" as const,
      error: priceLinks.error ?? inventoryLinks.error,
    };
  }

  const eventSectionIds = Array.from(
    new Set([
      ...(priceLinks.data ?? []).map((link) => link.section_id),
      ...(inventoryLinks.data ?? []).map((link) => link.section_id),
    ]),
  );
  const { data: sections, error: sectionsError } = eventSectionIds.length
    ? await supabase
        .from("venue_sections")
        .select("id, venue_id, name, slug, capacity, has_numbered_seats, status")
        .in("id", eventSectionIds)
        .order("sort_order", { ascending: true })
        .returns<SectionRow[]>()
    : { data: [] as SectionRow[], error: null };

  if (sectionsError) {
    return { ok: false as const, reason: "database_error" as const, error: sectionsError };
  }

  return {
    ok: true as const,
    event: {
      ...toSummary(event, sessions ?? []),
      sessions: (sessions ?? []).map((session) => ({
        sessionId: session.id,
        startsAt: session.starts_at,
        status: session.status,
        venueId: session.venue_id,
        venueName: session.venues?.name ?? event.venues?.name ?? null,
      })),
      sections: (sections ?? []).map((section) => ({
        sectionId: section.id,
        name: section.name,
        slug: section.slug,
        capacity: section.capacity,
        hasNumberedSeats: section.has_numbered_seats,
        status: section.status,
      })),
    } satisfies AdminEventDetails,
  };
}

export async function findOrCreateVenue(input: {
  name: string;
  city: string;
  state: string;
}) {
  const supabase = getSupabaseAdmin();
  const { data: existing, error: findError } = await supabase
    .from("venues")
    .select("id, name, city, state, status, created_at")
    .ilike("name", input.name.trim())
    .ilike("city", input.city.trim())
    .ilike("state", input.state.trim().toUpperCase())
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle<{ id: string; name: string }>();

  if (findError) {
    return { ok: false as const, error: findError };
  }

  if (existing) {
    return { ok: true as const, venueId: existing.id, created: false };
  }

  const { data, error } = await supabase
    .from("venues")
    .insert({
      name: input.name.trim(),
      city: input.city.trim(),
      state: input.state.trim().toUpperCase(),
      status: "active",
    })
    .select("id")
    .single<{ id: string }>();

  if (error) {
    return { ok: false as const, error };
  }

  return { ok: true as const, venueId: data.id, created: true };
}

export async function listAdminVenues(input: {
  city?: string | null;
  state?: string | null;
  limit?: number;
}) {
  const supabase = getSupabaseAdmin();
  let query = supabase
    .from("venues")
    .select("id, name, city, state, status, created_at")
    .eq("status", "active");

  if (input.city?.trim()) {
    query = query.ilike("city", input.city.trim());
  }

  if (input.state?.trim()) {
    query = query.ilike("state", input.state.trim().toUpperCase());
  }

  const { data, error } = await query
    .order("name", { ascending: true })
    .limit(input.limit ?? 10)
    .returns<Array<{
      id: string;
      name: string;
      city: string;
      state: string;
      status: string;
    }>>();

  if (error) {
    return { ok: false as const, error };
  }

  return {
    ok: true as const,
    venues: data.map((venue, index) => ({
      option: index + 1,
      venueId: venue.id,
      name: venue.name,
      city: venue.city,
      state: venue.state,
    })),
  };
}

export async function createAdminEvent(input: {
  title: string;
  artistName?: string | null;
  artistIcon?: string | null;
  city: string;
  state: string;
  venueName: string;
  imageUrl: string | null;
  description: string | null;
  sessionsStartsAt: string[];
  status: AdminEventStatus;
  initialSections: AdminInitialEventSectionInput[];
  createdByAdminUserId?: string | null;
  createdByAdminPhone?: string | null;
  operationId?: string;
}) {
  const supabase = getSupabaseAdmin();
  const title = input.title.trim();
  const artistName = input.artistName?.trim() || title;
  const sessions = input.sessionsStartsAt.map((startsAt, index) => ({
    key: `session-${index + 1}`,
    starts_at: startsAt,
    status: "scheduled",
  }));
  const sections = input.initialSections.map((section, sectionIndex) => {
    const priceOptions = section.priceOptions?.length
      ? section.priceOptions
      : [{ ticketType: section.ticketType, label: section.label, priceCents: section.priceCents, feeCents: section.feeCents }];
    const mapPositionBySeatCode = section.seatMapPositions ?? {};
    const seatCodes = section.seatCodes?.length
      ? section.seatCodes
      : section.createInventorySeats && section.capacity
        ? Array.from({ length: section.capacity }, (_, index) => buildInventorySeatCode(section.slug, index + 1))
        : [];
    return {
      key: `section-${sectionIndex + 1}`,
      name: section.name.trim(),
      slug: section.slug,
      has_numbered_seats: section.hasNumberedSeats,
      capacity: section.capacity,
      status: "active",
      prices: sessions.flatMap((session) => priceOptions.map((price) => ({
        session_key: session.key,
        ticket_type: price.ticketType,
        label: price.label.trim(),
        price_cents: price.priceCents,
        fee_cents: price.feeCents,
        currency: "BRL",
        sales_start_at: null,
        sales_end_at: null,
        status: "active",
      }))),
      seats: seatCodes.map((seatCode, index) => {
        const rowMatch = seatCode.match(/^([A-Z]+)/i);
        const numberMatch = seatCode.match(/(\d+)$/);
        const position = section.createVisualMap ? mapPositionBySeatCode[seatCode] : undefined;
        return {
          row_label: rowMatch?.[1]?.toUpperCase() ?? null,
          seat_number: numberMatch?.[1] ?? String(index + 1),
          seat_code: seatCode,
          map_x: position?.x ?? null,
          map_y: position?.y ?? null,
          status: "active",
        };
      }),
    };
  });
  const { data, error } = await supabase.rpc("create_admin_event_catalog", {
    p_operation_id: input.operationId ?? randomUUID(),
    p_operation_type: "create",
    p_payload: {
      venue: { name: input.venueName.trim(), city: input.city.trim(), state: input.state.trim().toUpperCase(), reuse_existing: true },
      event: {
        title,
        artist_name: artistName,
        artist_icon: input.artistIcon?.trim() || "🎤",
        description: input.description?.trim() || null,
        city: input.city.trim(),
        state: input.state.trim().toUpperCase(),
        image_url: input.imageUrl,
        status: input.status,
        created_by_admin_user_id: input.createdByAdminUserId ?? null,
        created_by_admin_phone: input.createdByAdminPhone ?? null,
      },
      sessions,
      sections,
    },
  });

  if (error || !data) return { ok: false as const, error: error ?? new Error("event_not_created") };
  return data as {
    ok: true;
    eventId: string;
    sessionId: string;
    sessionsCount: number;
    venueId: string;
    createdSectionsCount: number;
    createdSeatsCount: number;
    createdPricesCount: number;
  };
}

function buildInventorySeatCode(sectionSlug: string, index: number) {
  const prefix = sectionSlug.replace(/[^a-z0-9]/gi, "").toUpperCase() || "ENTRADA";
  return `${prefix}-${String(index).padStart(4, "0")}`;
}

export async function duplicateAdminEvent(input: {
  eventId: string;
  createdByAdminUserId?: string | null;
  createdByAdminPhone?: string | null;
  operationId?: string;
}) {
  const supabase = getSupabaseAdmin();
  const { data: sourceEvent, error: sourceEventError } = await supabase
    .from("events")
    .select("id, title, artist_name, artist_icon, description, city, state, image_url, venue_id, venues(name)")
    .eq("id", input.eventId)
    .single<Pick<EventRow, "id" | "title" | "artist_name" | "artist_icon" | "description" | "city" | "state" | "image_url" | "venue_id" | "venues">>();
  if (sourceEventError || !sourceEvent) {
    return { ok: false as const, reason: "source_not_found" as const, error: sourceEventError };
  }

  const { data: sourceSessions, error: sourceSessionsError } = await supabase
    .from("event_sessions")
    .select("id, event_id, venue_id, starts_at, status")
    .eq("event_id", input.eventId)
    .order("starts_at", { ascending: true })
    .returns<SessionRow[]>();
  if (sourceSessionsError) return { ok: false as const, reason: "sessions_not_read" as const, error: sourceSessionsError };

  const sourceSessionIds = (sourceSessions ?? []).map((session) => session.id);
  const { data: sourcePrices, error: sourcePricesError } = sourceSessionIds.length
    ? await supabase
        .from("ticket_prices")
        .select("session_id, section_id, ticket_type, label, price_cents, fee_cents, currency, sales_start_at, sales_end_at, status")
        .in("session_id", sourceSessionIds)
        .returns<TicketPriceRow[]>()
    : { data: [] as TicketPriceRow[], error: null };
  if (sourcePricesError) return { ok: false as const, reason: "prices_not_read" as const, error: sourcePricesError };

  const { data: sourceSessionSeats, error: sourceSessionSeatsError } = sourceSessionIds.length
    ? await supabase
        .from("session_seats")
        .select("section_id")
        .in("session_id", sourceSessionIds)
        .returns<Array<{ section_id: string }>>()
    : { data: [] as Array<{ section_id: string }>, error: null };
  if (sourceSessionSeatsError) return { ok: false as const, reason: "session_seats_not_read" as const, error: sourceSessionSeatsError };

  const sectionIds = Array.from(new Set([
    ...(sourcePrices ?? []).flatMap((price) => price.section_id ? [price.section_id] : []),
    ...(sourceSessionSeats ?? []).map((seat) => seat.section_id),
  ]));
  const { data: sourceSections, error: sourceSectionsError } = sectionIds.length
    ? await supabase
        .from("venue_sections")
        .select("id, venue_id, name, slug, capacity, has_numbered_seats, status")
        .in("id", sectionIds)
        .returns<SectionRow[]>()
    : { data: [] as SectionRow[], error: null };
  if (sourceSectionsError) return { ok: false as const, reason: "sections_not_read" as const, error: sourceSectionsError };

  const { data: sourceSeats, error: sourceSeatsError } = sectionIds.length
    ? await supabase
        .from("seats")
        .select("id, section_id, row_label, seat_number, seat_code, map_x, map_y, status")
        .in("section_id", sectionIds)
        .returns<SeatStructureRow[]>()
    : { data: [] as SeatStructureRow[], error: null };
  if (sourceSeatsError) return { ok: false as const, reason: "seats_not_read" as const, error: sourceSeatsError };

  const sessions = (sourceSessions ?? []).map((session, index) => ({
    key: `session-${index + 1}`,
    starts_at: session.starts_at,
    status: "scheduled",
    sourceId: session.id,
  }));
  const sessionKeyBySourceId = new Map(sessions.map((session) => [session.sourceId, session.key]));
  const sections = (sourceSections ?? []).map((section, index) => ({
    key: `section-${index + 1}`,
    name: section.name,
    slug: `${section.slug}-copia`,
    capacity: section.capacity,
    has_numbered_seats: section.has_numbered_seats,
    status: section.status,
    prices: (sourcePrices ?? []).flatMap((price) => {
      if (price.section_id !== section.id) return [];
      const sessionKey = sessionKeyBySourceId.get(price.session_id);
      return sessionKey ? [{
        session_key: sessionKey,
        ticket_type: price.ticket_type,
        label: price.label,
        price_cents: price.price_cents,
        fee_cents: price.fee_cents,
        currency: price.currency,
        sales_start_at: price.sales_start_at,
        sales_end_at: price.sales_end_at,
        status: price.status,
      }] : [];
    }),
    seats: (sourceSeats ?? []).filter((seat) => seat.section_id === section.id).map((seat) => ({
      row_label: seat.row_label,
      seat_number: seat.seat_number,
      seat_code: seat.seat_code,
      map_x: seat.map_x,
      map_y: seat.map_y,
      status: seat.status,
    })),
  }));
  const eventPayload = buildDuplicatedAdminEventPayload({ sourceEvent, venueId: null });
  const { data, error } = await supabase.rpc("create_admin_event_catalog", {
    p_operation_id: input.operationId ?? randomUUID(),
    p_operation_type: "duplicate",
    p_payload: {
      venue: sourceEvent.venues?.name ? {
        name: sourceEvent.venues.name,
        city: sourceEvent.city,
        state: sourceEvent.state,
        reuse_existing: false,
      } : { existing_id: sourceEvent.venue_id },
      event: {
        ...eventPayload,
        created_by_admin_user_id: input.createdByAdminUserId ?? null,
        created_by_admin_phone: input.createdByAdminPhone ?? null,
      },
      sessions: sessions.map((session) => ({
        key: session.key,
        starts_at: session.starts_at,
        status: session.status,
      })),
      sections,
    },
  });
  if (error || !data) return { ok: false as const, reason: "duplicate_failed" as const, error: error ?? new Error("duplicate_failed") };
  return data as {
    ok: true;
    eventId: string;
    sessionsCount: number;
    createdSectionsCount: number;
    createdSeatsCount: number;
    createdPricesCount: number;
  };
}

async function getUniqueSectionSlug(venueId: string, desiredSlug: string) {
  const supabase = getSupabaseAdmin();
  const { data } = await supabase
    .from("venue_sections")
    .select("slug")
    .eq("venue_id", venueId)
    .ilike("slug", `${desiredSlug}%`);
  const existing = new Set(data?.map((section) => section.slug) ?? []);

  if (!existing.has(desiredSlug)) {
    return desiredSlug;
  }

  let suffix = 2;
  while (existing.has(`${desiredSlug}-${suffix}`)) {
    suffix += 1;
  }

  return `${desiredSlug}-${suffix}`;
}

async function createInitialEventSections(input: {
  venueId: string;
  sessionIds: string[];
  sections: AdminInitialEventSectionInput[];
}) {
  const supabase = getSupabaseAdmin();
  let createdSectionsCount = 0;
  let createdSeatsCount = 0;
  let createdPricesCount = 0;

  for (const section of input.sections) {
    const slug = await getUniqueSectionSlug(input.venueId, section.slug);
    const { data: createdSection, error: sectionError } = await supabase
      .from("venue_sections")
      .insert({
        venue_id: input.venueId,
        name: section.name.trim(),
        slug,
        has_numbered_seats: section.hasNumberedSeats,
        capacity: section.capacity,
        status: "active",
      })
      .select("id")
      .single<{ id: string }>();

    if (sectionError) {
      return { ok: false as const, error: sectionError };
    }

    createdSectionsCount += 1;

    const priceOptions = section.priceOptions?.length
      ? section.priceOptions
      : [
          {
            ticketType: section.ticketType,
            label: section.label,
            priceCents: section.priceCents,
            feeCents: section.feeCents,
          },
        ];
    const priceRows = input.sessionIds.flatMap((sessionId) =>
      priceOptions.map((price) => ({
        session_id: sessionId,
        section_id: createdSection.id,
        ticket_type: price.ticketType,
        label: price.label.trim(),
        price_cents: price.priceCents,
        fee_cents: price.feeCents,
        currency: "BRL",
        sales_start_at: null,
        sales_end_at: null,
        status: "active",
      })),
    );
    const { error: priceError } = await supabase
      .from("ticket_prices")
      .insert(priceRows);

    if (priceError) {
      return { ok: false as const, error: priceError };
    }

    createdPricesCount += priceRows.length;

    const mapPositionBySeatCode = section.createVisualMap
      ? new Map<string, { x: number; y: number }>(
          (section.seatCodes ?? []).map((seatCode, index) => {
            const explicitPosition = section.seatMapPositions?.[seatCode];

            if (explicitPosition) {
              return [seatCode, explicitPosition];
            }

            const rowMatch = seatCode.match(/^([A-Z]+)/i);
            const rowLabel = rowMatch?.[1]?.toUpperCase() ?? "";
            const rowLabels = Array.from(
              new Set(
                (section.seatCodes ?? []).map(
                  (code) => code.match(/^([A-Z]+)/i)?.[1]?.toUpperCase() ?? "",
                ),
              ),
            ).sort((left, right) =>
              left.localeCompare(right, "pt-BR", {
                numeric: true,
                sensitivity: "base",
              }),
            );
            const rowIndex = Math.max(0, rowLabels.indexOf(rowLabel));
            const previousInRow = (section.seatCodes ?? [])
              .slice(0, index)
              .filter(
                (code) =>
                  (code.match(/^([A-Z]+)/i)?.[1]?.toUpperCase() ?? "") === rowLabel,
              ).length;

            return [seatCode, { x: previousInRow + 1, y: rowIndex + 1 }];
          }),
        )
      : new Map<string, { x: number; y: number }>();
    const seatRows = section.seatCodes?.length
      ? section.seatCodes.map((seatCode, index) => {
          const rowMatch = seatCode.match(/^([A-Z]+)/i);
          const numberMatch = seatCode.match(/(\d+)$/);
          const mapPosition = mapPositionBySeatCode.get(seatCode);

          return {
            venue_id: input.venueId,
            section_id: createdSection.id,
            row_label: rowMatch?.[1]?.toUpperCase() ?? null,
            seat_number: numberMatch?.[1] ?? String(index + 1),
            seat_code: seatCode,
            map_x: mapPosition?.x ?? null,
            map_y: mapPosition?.y ?? null,
            status: "active",
          };
        })
      : section.createInventorySeats && section.capacity
        ? Array.from({ length: section.capacity }, (_, index) => {
            const seatNumber = index + 1;

            return {
              venue_id: input.venueId,
              section_id: createdSection.id,
              row_label: null,
              seat_number: String(seatNumber),
              seat_code: buildInventorySeatCode(slug, seatNumber),
              map_x: null,
              map_y: null,
              status: "active",
            };
          })
        : [];

    if (!seatRows.length) {
      continue;
    }

    const { data: createdSeats, error: seatsError } = await supabase
      .from("seats")
      .insert(seatRows)
      .select("id, section_id");

    if (seatsError) {
      return { ok: false as const, error: seatsError };
    }

    const sessionSeatRows =
      createdSeats?.flatMap((seat) => input.sessionIds.map((sessionId) => ({
        session_id: sessionId,
        seat_id: seat.id,
        section_id: seat.section_id,
        status: "available",
      }))) ?? [];

    if (sessionSeatRows.length) {
      const { error: sessionSeatsError } = await supabase
        .from("session_seats")
        .insert(sessionSeatRows);

      if (sessionSeatsError) {
        return { ok: false as const, error: sessionSeatsError };
      }
    }

    createdSeatsCount += sessionSeatRows.length;
  }

  return { ok: true as const, createdSectionsCount, createdSeatsCount, createdPricesCount };
}

export async function createAdminEventSections(input: {
  venueId: string;
  sessionIds: string[];
  sections: Array<{
    name: string;
    capacity: number;
    label?: string;
    ticketType?: AdminTicketType;
    priceCents?: number;
    feeCents?: number;
  }>;
}) {
  const sections = input.sections.map((section) => ({
    name: section.name,
    slug: normalizeSlug(section.name),
    hasNumberedSeats: false,
    capacity: section.capacity,
    createInventorySeats: true,
    ticketType: section.ticketType ?? "full",
    label: section.label ?? section.name,
    priceCents: section.priceCents ?? 0,
    feeCents: section.feeCents ?? 0,
  }));

  return createInitialEventSections({
    venueId: input.venueId,
    sessionIds: input.sessionIds,
    sections,
  });
}

export async function updateAdminEvent(
  eventId: string,
  values: Partial<{
    title: string;
    artist_name: string;
    artist_icon: string | null;
    description: string | null;
    city: string;
    state: string;
    venue_id: string | null;
    image_url: string | null;
    status: AdminEventStatus;
  }>,
) {
  const supabase = getSupabaseAdmin();
  const { error } = await supabase.from("events").update(values).eq("id", eventId);

  return error ? { ok: false as const, error } : { ok: true as const };
}

export async function updateAdminEventCatalog(input: {
  operationId: string;
  eventId: string;
  payload: Record<string, unknown>;
}) {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase.rpc("update_admin_event_catalog", {
    p_operation_id: input.operationId,
    p_event_id: input.eventId,
    p_payload: input.payload,
  });

  if (error || !data) {
    return { ok: false as const, error: error ?? new Error("event_catalog_not_updated") };
  }

  return { ok: true as const, eventId: input.eventId };
}

export async function createAdminSession(input: {
  eventId: string;
  venueId: string | null;
  startsAt: string;
  status: AdminSessionStatus;
}) {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("event_sessions")
    .insert({
      event_id: input.eventId,
      venue_id: input.venueId,
      starts_at: input.startsAt,
      status: input.status,
    })
    .select("id")
    .single<{ id: string }>();

  return error ? { ok: false as const, error } : { ok: true as const, sessionId: data.id };
}

export async function getAdminSessionUsage(sessionId: string) {
  const supabase = getSupabaseAdmin();
  const [
    { count: reservationsCount, error: reservationsError },
    { count: ticketsCount, error: ticketsError },
  ] = await Promise.all([
    supabase
      .from("reservations")
      .select("id", { count: "exact", head: true })
      .eq("session_id", sessionId),
    supabase
      .from("tickets")
      .select("id", { count: "exact", head: true })
      .eq("session_id", sessionId),
  ]);

  const error = reservationsError ?? ticketsError;
  if (error) {
    return { ok: false as const, error };
  }

  return {
    ok: true as const,
    reservationsCount: reservationsCount ?? 0,
    ticketsCount: ticketsCount ?? 0,
    hasUsage: (reservationsCount ?? 0) > 0 || (ticketsCount ?? 0) > 0,
  };
}

export async function getAdminSessionCatalogCounts(
  sessions: Array<{ sessionId: string; venueId: string | null }>,
) {
  const supabase = getSupabaseAdmin();
  const sessionIds = sessions.map((session) => session.sessionId);
  const venueIds = Array.from(
    new Set(sessions.map((session) => session.venueId).filter(Boolean)),
  ) as string[];

  const [
    { data: prices, error: pricesError },
    { data: sections, error: sectionsError },
  ] = await Promise.all([
    sessionIds.length
      ? supabase
        .from("ticket_prices")
        .select("session_id")
        .in("session_id", sessionIds)
        .neq("ticket_type", "free")
      : Promise.resolve({ data: [] as Array<{ session_id: string }>, error: null }),
    venueIds.length
      ? supabase.from("venue_sections").select("venue_id").in("venue_id", venueIds)
      : Promise.resolve({ data: [] as Array<{ venue_id: string }>, error: null }),
  ]);

  const error = pricesError ?? sectionsError;
  if (error) {
    return { ok: false as const, error };
  }

  const priceCountBySession = new Map<string, number>();
  for (const price of prices ?? []) {
    priceCountBySession.set(
      price.session_id,
      (priceCountBySession.get(price.session_id) ?? 0) + 1,
    );
  }

  const sectionCountByVenue = new Map<string, number>();
  for (const section of sections ?? []) {
    sectionCountByVenue.set(
      section.venue_id,
      (sectionCountByVenue.get(section.venue_id) ?? 0) + 1,
    );
  }

  return {
    ok: true as const,
    getPricesCount: (sessionId: string) => priceCountBySession.get(sessionId) ?? 0,
    getSectionsCount: (venueId: string | null) =>
      venueId ? (sectionCountByVenue.get(venueId) ?? 0) : 0,
  };
}

export async function updateAdminSession(
  sessionId: string,
  values: Partial<{ starts_at: string; venue_id: string | null; status: AdminSessionStatus }>,
) {
  const supabase = getSupabaseAdmin();
  const { error } = await supabase
    .from("event_sessions")
    .update(values)
    .eq("id", sessionId);

  return error ? { ok: false as const, error } : { ok: true as const };
}

export async function listAdminSections(venueId: string, sessionId?: string) {
  const supabase = getSupabaseAdmin();
  const { data: sections, error } = await supabase
    .from("venue_sections")
    .select("id, venue_id, name, slug, capacity, has_numbered_seats, status")
    .eq("venue_id", venueId)
    .order("sort_order", { ascending: true })
    .returns<SectionRow[]>();

  if (error) {
    return { ok: false as const, error };
  }

  const seatCounts = new Map<string, number>();
  const sessionSeatCounts = new Map<string, number>();

  if (sections.length) {
    const sectionIds = sections.map((section) => section.id);
    const { data: seats } = await supabase
      .from("seats")
      .select("section_id")
      .in("section_id", sectionIds);

    seats?.forEach((seat) => {
      seatCounts.set(seat.section_id, (seatCounts.get(seat.section_id) ?? 0) + 1);
    });

    if (sessionId) {
      const { data: sessionSeats } = await supabase
        .from("session_seats")
        .select("section_id")
        .eq("session_id", sessionId)
        .in("section_id", sectionIds);

      sessionSeats?.forEach((seat) => {
        sessionSeatCounts.set(
          seat.section_id,
          (sessionSeatCounts.get(seat.section_id) ?? 0) + 1,
        );
      });
    }
  }

  return {
    ok: true as const,
    sections: sections.map((section) => ({
      sectionId: section.id,
      name: section.name,
      slug: section.slug,
      capacity: section.capacity,
      hasNumberedSeats: section.has_numbered_seats,
      status: section.status,
      seatsCount: seatCounts.get(section.id) ?? 0,
      sessionSeatsCount: sessionSeatCounts.get(section.id) ?? 0,
    })),
  };
}

export async function createAdminSection(input: {
  venueId: string;
  name: string;
  slug: string;
  hasNumberedSeats: boolean;
  capacity: number | null;
}) {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("venue_sections")
    .insert({
      venue_id: input.venueId,
      name: input.name.trim(),
      slug: input.slug,
      has_numbered_seats: input.hasNumberedSeats,
      capacity: input.capacity,
      status: "active",
    })
    .select("id")
    .single<{ id: string }>();

  return error ? { ok: false as const, error } : { ok: true as const, sectionId: data.id };
}

export async function updateAdminSection(
  sectionId: string,
  values: Partial<{
    name: string;
    capacity: number | null;
    status: AdminSectionStatus;
    has_numbered_seats: boolean;
  }>,
) {
  const supabase = getSupabaseAdmin();
  const { error } = await supabase
    .from("venue_sections")
    .update(values)
    .eq("id", sectionId);

  return error ? { ok: false as const, error } : { ok: true as const };
}

export async function updateAdminSectionCapacity(input: {
  venueId: string;
  sectionId: string;
  sessionIds: string[];
  newCapacity: number;
}) {
  const supabase = getSupabaseAdmin();
  type AdminSectionCapacityResult = {
    currentCapacity: number;
    newCapacity: number;
    createdCount: number;
    blockedCount: number;
    unblockedCount?: number;
  };

  const { data: rawData, error } = await supabase.rpc("update_admin_section_capacity", {
      p_venue_id: input.venueId,
      p_section_id: input.sectionId,
      p_session_ids: input.sessionIds,
      p_new_capacity: input.newCapacity,
    });
  const data = rawData as AdminSectionCapacityResult | null;

  if (!error && data) {
    return {
      ok: true as const,
      currentCapacity: data.currentCapacity,
      newCapacity: data.newCapacity,
      createdCount: data.createdCount,
      blockedCount: data.blockedCount,
      unblockedCount: data.unblockedCount ?? 0,
    };
  }

  const message = String(error?.message ?? "");

  if (message.includes("section_not_found")) {
    return { ok: false as const, reason: "section_not_found" as const, error };
  }

  if (message.includes("numbered_section")) {
    return { ok: false as const, reason: "numbered_section" as const, error };
  }

  if (message.includes("capacity_below_busy")) {
    return {
      ok: false as const,
      reason: "capacity_below_busy" as const,
      currentCapacity: input.newCapacity,
      newCapacity: input.newCapacity,
      error,
    };
  }

  return { ok: false as const, reason: "section_not_updated" as const, error };
}

export async function getAdminSectionUsage(sectionId: string) {
  const supabase = getSupabaseAdmin();
  const [
    { count: reservationItemsCount, error: reservationItemsError },
    { count: ticketsCount, error: ticketsError },
    { count: busySessionSeatsCount, error: sessionSeatsError },
  ] = await Promise.all([
    supabase
      .from("reservation_items")
      .select("id", { count: "exact", head: true })
      .eq("section_id", sectionId),
    supabase
      .from("tickets")
      .select("id", { count: "exact", head: true })
      .eq("section_id", sectionId),
    supabase
      .from("session_seats")
      .select("id", { count: "exact", head: true })
      .eq("section_id", sectionId)
      .in("status", ["reserved", "sold"]),
  ]);

  const error = reservationItemsError ?? ticketsError ?? sessionSeatsError;
  if (error) {
    return { ok: false as const, error };
  }

  return {
    ok: true as const,
    reservationItemsCount: reservationItemsCount ?? 0,
    ticketsCount: ticketsCount ?? 0,
    busySessionSeatsCount: busySessionSeatsCount ?? 0,
    hasUsage:
      (reservationItemsCount ?? 0) > 0 ||
      (ticketsCount ?? 0) > 0 ||
      (busySessionSeatsCount ?? 0) > 0,
  };
}

export async function createAdminSeats(input: {
  venueId: string;
  sectionId: string;
  seatCodes: string[];
}) {
  const supabase = getSupabaseAdmin();
  const { data: existing } = await supabase
    .from("seats")
    .select("seat_code")
    .eq("section_id", input.sectionId)
    .in("seat_code", input.seatCodes);
  const existingCodes = new Set(existing?.map((seat) => seat.seat_code) ?? []);
  const rows = input.seatCodes
    .filter((code) => !existingCodes.has(code))
    .map((code) => {
      const match = code.match(/^([A-Z]+)(.+)$/);

      return {
        venue_id: input.venueId,
        section_id: input.sectionId,
        row_label: match?.[1] ?? null,
        seat_number: match?.[2] ?? code,
        seat_code: code,
        status: "active",
      };
    });

  if (!rows.length) {
    return { ok: true as const, createdCount: 0, skippedCount: input.seatCodes.length };
  }

  const { error } = await supabase.from("seats").insert(rows);

  return error
    ? { ok: false as const, error }
    : {
        ok: true as const,
        createdCount: rows.length,
        skippedCount: input.seatCodes.length - rows.length,
      };
}

export async function getAdminSeatOperationalUsage(input: {
  sectionId: string;
  seatCodes: string[];
}) {
  const supabase = getSupabaseAdmin();
  const { data: seats, error: seatsError } = await supabase
    .from("seats")
    .select("id")
    .eq("section_id", input.sectionId)
    .in("seat_code", input.seatCodes);

  if (seatsError) {
    return { ok: false as const, error: seatsError };
  }

  const seatIds = seats?.map((seat) => seat.id) ?? [];
  const { count, error } = seatIds.length
    ? await supabase
        .from("session_seats")
        .select("id", { count: "exact", head: true })
        .in("seat_id", seatIds)
        .in("status", ["reserved", "sold"])
    : { count: 0, error: null };

  if (error) {
    return { ok: false as const, error };
  }

  return {
    ok: true as const,
    busyCount: count ?? 0,
    hasBusySeats: (count ?? 0) > 0,
  };
}

export async function updateAdminSeatStatuses(input: {
  sectionId: string;
  seatCodes: string[];
  status: AdminSeatStatus;
}) {
  const supabase = getSupabaseAdmin();
  const { data: seats, error: findError } = await supabase
    .from("seats")
    .select("id, seat_code")
    .eq("section_id", input.sectionId)
    .in("seat_code", input.seatCodes);

  if (findError) {
    return { ok: false as const, error: findError };
  }

  const foundCodes = new Set(seats?.map((seat) => seat.seat_code) ?? []);
  const missingCount = input.seatCodes.filter((code) => !foundCodes.has(code)).length;

  if (!seats?.length) {
    return { ok: true as const, updatedCount: 0, missingCount };
  }

  const { error } = await supabase
    .from("seats")
    .update({ status: input.status })
    .in(
      "id",
      seats.map((seat) => seat.id),
    );

  return error
    ? { ok: false as const, error }
    : { ok: true as const, updatedCount: seats.length, missingCount };
}

export async function createMissingSessionSeats(input: {
  sessionId: string;
  sectionIds: string[];
}) {
  const supabase = getSupabaseAdmin();
  const { data: seats, error: seatsError } = await supabase
    .from("seats")
    .select("id, section_id")
    .eq("status", "active")
    .in("section_id", input.sectionIds);

  if (seatsError) {
    return { ok: false as const, error: seatsError };
  }

  const seatIds = seats?.map((seat) => seat.id) ?? [];
  const { data: existing } = seatIds.length
    ? await supabase
        .from("session_seats")
        .select("seat_id")
        .eq("session_id", input.sessionId)
        .in("seat_id", seatIds)
    : { data: [] as Array<{ seat_id: string }> };
  const existingIds = new Set(existing?.map((seat) => seat.seat_id) ?? []);
  const rows =
    seats
      ?.filter((seat) => !existingIds.has(seat.id))
      .map((seat) => ({
        session_id: input.sessionId,
        seat_id: seat.id,
        section_id: seat.section_id,
        status: "available",
      })) ?? [];

  if (!rows.length) {
    return { ok: true as const, createdCount: 0, skippedCount: seatIds.length };
  }

  const { error } = await supabase.from("session_seats").insert(rows);

  return error
    ? { ok: false as const, error }
    : { ok: true as const, createdCount: rows.length, skippedCount: seatIds.length - rows.length };
}

export async function listAdminPrices(input: { sessionId: string; sectionId?: string }) {
  const supabase = getSupabaseAdmin();
  let query = supabase
    .from("ticket_prices")
    .select("id, session_id, section_id, ticket_type, label, price_cents, fee_cents, currency, sales_start_at, sales_end_at, status, venue_sections(name)")
    .eq("session_id", input.sessionId)
    .neq("ticket_type", "free");

  if (input.sectionId) {
    query = query.eq("section_id", input.sectionId);
  }

  const { data, error } = await query.order("created_at", { ascending: true });

  return error ? { ok: false as const, error } : { ok: true as const, prices: data ?? [] };
}

export async function createAdminPrice(input: {
  sessionId: string;
  sectionId: string;
  ticketType: AdminTicketType;
  label: string;
  priceCents: number;
  feeCents: number;
  salesStartAt: string | null;
  salesEndAt: string | null;
}) {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("ticket_prices")
    .insert({
      session_id: input.sessionId,
      section_id: input.sectionId,
      ticket_type: input.ticketType,
      label: input.label.trim(),
      price_cents: input.priceCents,
      fee_cents: input.feeCents,
      currency: "BRL",
      sales_start_at: input.salesStartAt,
      sales_end_at: input.salesEndAt,
      status: "active",
    })
    .select("id")
    .single<{ id: string }>();

  return error ? { ok: false as const, error } : { ok: true as const, priceId: data.id };
}

export async function updateAdminPrice(
  priceId: string,
  values: Partial<{
    label: string;
    price_cents: number;
    fee_cents: number;
    sales_start_at: string | null;
    sales_end_at: string | null;
    status: AdminTicketPriceStatus;
  }>,
) {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("ticket_prices")
    .update(values)
    .eq("id", priceId)
    .select("id, price_cents, fee_cents, status")
    .maybeSingle<{
      id: string;
      price_cents: number;
      fee_cents: number;
      status: AdminTicketPriceStatus;
    }>();

  if (error) return { ok: false as const, reason: "update_failed" as const, error };
  if (!data) return { ok: false as const, reason: "not_found" as const };

  return { ok: true as const, price: data };
}
