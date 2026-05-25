import "server-only";

import { getEnv } from "@/lib/env";
import { logError } from "@/lib/logger";
import {
  buildInitialConversationState,
  type TicketConversationEventOption,
  type TicketConversationSearch,
  type TicketConversationSectionOption,
  type TicketConversationSectionTicketType,
  type TicketConversationSeatOption,
  type TicketConversationReservation,
  type TicketConversationPayment,
  type TicketConversationSelectedSection,
  type TicketConversationSelectedEvent,
  type TicketConversationSelectedSeat,
  type TicketConversationStep,
  type TicketConversationState,
} from "@/lib/tickets/conversationState";
import { TICKET_MESSAGES } from "@/lib/tickets/messages";
import {
  createCheckoutForReservation,
  type CheckoutForReservation,
  type CreateCheckoutForReservationResult,
} from "@/lib/tickets/services/checkout";
import {
  getValidatedEventSession,
  searchEvents,
  type TicketEventSearchResult,
} from "@/lib/tickets/services/events";
import {
  getAvailableSectionForSession,
  listAvailableSections,
  type AvailableSection,
} from "@/lib/tickets/services/sections";
import {
  listSeatMap,
  type AvailableSeat,
  type SeatMap,
} from "@/lib/tickets/services/seats";
import { buildSeatMapPngDataUrl } from "@/lib/tickets/services/seatMapImage";
import {
  cancelPendingReservationForCustomer,
  reserveUnnumberedSectionTickets,
  reserveSelectedSeat,
  type ReserveSelectedSeatResult,
  type ReserveSelectedSeatSuccess,
} from "@/lib/tickets/services/reservations";
import {
  createAdminEvent,
  duplicateAdminEvent,
  findOrCreateVenue,
  getAdminEventDetails,
  isEventStatus,
  isTicketType,
  listAdminEvents,
  listAdminVenues,
  normalizeSlug,
  parseBrazilianDateTime,
  updateAdminEvent,
  type AdminEventDetails,
  type AdminEventStatus,
  type AdminTicketType,
} from "@/lib/tickets/services/adminEvents";
import {
  createAdminPrice,
  listAdminPrices,
  parseMoneyToCents,
  updateAdminPrice,
  type AdminTicketPriceStatus,
} from "@/lib/tickets/services/adminPrices";
import {
  createAdminSeats,
  createMissingSessionSeats,
  getAdminSeatOperationalUsage,
  parseSeatCodesOrRange,
  parseSeatLayout,
  updateAdminSeatStatuses,
  type AdminSeatStatus,
} from "@/lib/tickets/services/adminSeats";
import {
  createAdminSection,
  getAdminSectionUsage,
  listAdminSections,
  updateAdminSection,
  type AdminSectionStatus,
} from "@/lib/tickets/services/adminSections";
import {
  createAdminSession as createEventAdminSession,
  getAdminSessionCatalogCounts,
  getAdminSessionUsage,
  updateAdminSession,
  type AdminSessionStatus,
} from "@/lib/tickets/services/adminSessions";
import {
  cancelAdminPendingReservation,
  findAdminTicketByCode,
  findAdminTicketsByPhone,
  listAdminTicketValidations,
  type AdminPendingReservationLookup,
  type AdminTicketLookup,
  type AdminTicketValidation,
} from "@/lib/tickets/services/adminTickets";
import {
  buildCourtesyDeliveryForPhone,
  buildCourtesyEventsReply,
  buildCourtesyIssueSummary,
  buildCourtesiesListReply,
  cancelCourtesyForEvent,
  getCourtesyLimit,
  issueCourtesies,
  listCourtesyEvents,
  listCourtesiesForEvent,
  normalizeCourtesyPhone,
  parseCourtesyPhones,
  resolveCourtesyEventId,
  resolveCourtesyCancelTarget,
  setCourtesyLimit,
} from "@/lib/tickets/services/adminCourtesies";
import {
  createAdminUser,
  disableAdminUser,
  getAdminProfileLabel,
  listAdminUsers,
  parseAdminRole,
  resolveAdminUserId,
  updateAdminRole,
  type AdminUserListItem,
} from "@/lib/tickets/services/adminUsers";
import {
  createGateSession,
  normalizeGatePhone,
  revokeGateSession,
} from "@/lib/tickets/services/gateSessions";
import {
  createGateAccess,
  createGateSessionForGateAccess,
  findActiveGateAccessesForPhone,
  listGateAccesses,
  pauseGateAccess,
  type AdminGateAccessListItem,
} from "@/lib/tickets/services/gateAccesses";
import {
  buildAdminReport,
  type AdminReportPeriod,
  type AdminReportType,
} from "@/lib/tickets/services/adminReports";
import {
  createAdminSession,
  ensureAdminUserForPhone,
  formatAdminMenu,
  getActiveAdminSession,
  getAdminUserByPhone,
  hasAdminPermission,
  isAdminLogoutCommand,
  isAuthorizedAdminPhone,
  isReservedAdminCommand,
  normalizeAdminText,
  revokeActiveAdminSessions,
  type AdminRole,
  type AdminPermission,
  verifyAdminUserPassphrase,
} from "@/lib/tickets/services/adminAuth";
import { sendZapiText } from "@/lib/zapi/client";

const SAO_PAULO_TIME_ZONE = "America/Sao_Paulo";
const GENERIC_SEARCH_WORDS = new Set([
  "show",
  "shows",
  "evento",
  "eventos",
  "ingresso",
  "ingressos",
  "em",
  "na",
  "no",
]);
const LEADING_INTENT_PATTERN =
  /^(?:quero\s+(?:comprar|ver)?|queria\s+(?:comprar|ver)?|comprar|ver|procuro|procurar|tem|ingressos?\s+(?:para|pra|do|da|de)?|eventos?\s+(?:de|do|da)?|shows?\s+(?:de|do|da)?)\s+/i;
const GENERIC_MESSAGES = new Set([
  "oi",
  "ola",
  "olá",
  "bom dia",
  "boa tarde",
  "boa noite",
  "ajuda",
  "menu",
  "inicio",
  "início",
]);
const PAYMENT_LINK_INTENTS = new Set([
  "comprar",
  "pagar",
  "pagamento",
  "link",
  "gerar link",
  "sim",
  "continuar",
  "ok",
  "blz",
  "beleza",
]);
const SIMPLE_PAYMENT_CONTINUATIONS = new Set([
  "manda",
  "mandar",
  "envia",
  "enviar",
  "pode",
  "pode ser",
  "certo",
  "bora",
  "vamos",
]);
const GATE_COMMAND_PATTERN = /^portaria(?:\s+(.+))?$/i;
const ADMIN_MENU_UNAVAILABLE_MESSAGE =
  "Essa opção não está disponível para o seu nível de acesso.";
const ADMIN_CONSTRUCTION_MESSAGE = "Essa função será ativada em breve.";
const WEEKDAY_OFFSETS: Record<string, number> = {
  domingo: 0,
  segunda: 1,
  "segunda-feira": 1,
  terça: 2,
  terca: 2,
  "terça-feira": 2,
  "terca-feira": 2,
  quarta: 3,
  "quarta-feira": 3,
  quinta: 4,
  "quinta-feira": 4,
  sexta: 5,
  "sexta-feira": 5,
  sábado: 6,
  sabado: 6,
};
const MONTHS: Record<string, number> = {
  janeiro: 0,
  fevereiro: 1,
  março: 2,
  marco: 2,
  abril: 3,
  maio: 4,
  junho: 5,
  julho: 6,
  agosto: 7,
  setembro: 8,
  outubro: 9,
  novembro: 10,
  dezembro: 11,
};

type RouteTicketMessageInput = {
  customer: {
    id: string;
    whatsapp_phone: string;
    name: string | null;
  };
  conversation: {
    id: string;
    context: Record<string, unknown>;
  };
  text: string;
  mediaUrl?: string | null;
};

type RouteTicketMessageOutput = {
  reply: string;
  outboundMessages?: Array<
    | { type: "text"; body: string }
    | { type: "image"; imageUrl: string; caption: string }
  >;
  nextContext: TicketConversationState;
};

export type ParsedEventSearchMessage = TicketConversationSearch & {
  isGeneric: boolean;
  numericSelection?: number;
};

function getSaoPauloDateParts(now = new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: SAO_PAULO_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    weekday: "long",
  })
    .formatToParts(now)
    .reduce<Record<string, string>>((acc, part) => {
      acc[part.type] = part.value;
      return acc;
    }, {});

  return {
    year: Number(parts.year),
    month: Number(parts.month),
    day: Number(parts.day),
    weekday: new Date(
      Date.UTC(Number(parts.year), Number(parts.month) - 1, Number(parts.day)),
    ).getUTCDay(),
  };
}

function makeZonedIsoDate(year: number, month: number, day: number) {
  const utc = Date.UTC(year, month, day, 3, 0, 0, 0);

  return new Date(utc).toISOString();
}

function addDays(parts: { year: number; month: number; day: number }, days: number) {
  const date = new Date(Date.UTC(parts.year, parts.month - 1, parts.day + days));

  return {
    year: date.getUTCFullYear(),
    month: date.getUTCMonth() + 1,
    day: date.getUTCDate(),
  };
}

function buildDayRange(parts: { year: number; month: number; day: number }) {
  const nextDay = addDays(parts, 1);

  return {
    dateFrom: makeZonedIsoDate(parts.year, parts.month - 1, parts.day),
    dateTo: makeZonedIsoDate(nextDay.year, nextDay.month - 1, nextDay.day),
  };
}

function buildWeekendRange(now = new Date()) {
  const today = getSaoPauloDateParts(now);
  const saturdayOffset = (6 - today.weekday + 7) % 7;
  const saturday = addDays(today, saturdayOffset);
  const monday = addDays(saturday, 2);

  return {
    dateFrom: makeZonedIsoDate(saturday.year, saturday.month - 1, saturday.day),
    dateTo: makeZonedIsoDate(monday.year, monday.month - 1, monday.day),
  };
}

function buildNextWeekdayRange(weekday: number, now = new Date()) {
  const today = getSaoPauloDateParts(now);
  const offset = (weekday - today.weekday + 7) % 7;

  return buildDayRange(addDays(today, offset));
}

function buildMonthRange(month: number, now = new Date()) {
  const today = getSaoPauloDateParts(now);
  const year = month < today.month - 1 ? today.year + 1 : today.year;

  return {
    dateFrom: makeZonedIsoDate(year, month, 1),
    dateTo: makeZonedIsoDate(year, month + 1, 1),
  };
}

function isValidCalendarDate(year: number, month: number, day: number) {
  const date = new Date(Date.UTC(year, month - 1, day));

  return (
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day
  );
}

function parseExplicitDate(text: string, now = new Date()) {
  const match = text.match(/\b(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?\b/);

  if (!match) {
    return null;
  }

  const today = getSaoPauloDateParts(now);
  const day = Number(match[1]);
  const month = Number(match[2]);
  const parsedYear = match[3]
    ? Number(match[3].length === 2 ? `20${match[3]}` : match[3])
    : today.year;

  if (day < 1 || day > 31 || month < 1 || month > 12) {
    return null;
  }

  if (!isValidCalendarDate(parsedYear, month, day)) {
    return null;
  }

  const range = buildDayRange({ year: parsedYear, month, day });

  if (!match[3] && range.dateTo < now.toISOString()) {
    return buildDayRange({ year: parsedYear + 1, month, day });
  }

  return range;
}

function parseNaturalDate(text: string, now = new Date()) {
  const monthAlternation = Object.keys(MONTHS).join("|");
  const match = text.match(
    new RegExp(`\\b(\\d{1,2})(?:\\s+de)?\\s+(${monthAlternation})(?:\\s+de\\s+(\\d{2,4}))?\\b`, "i"),
  );

  if (!match) {
    return null;
  }

  const today = getSaoPauloDateParts(now);
  const day = Number(match[1]);
  const month = MONTHS[match[2].toLowerCase()] + 1;
  const parsedYear = match[3]
    ? Number(match[3].length === 2 ? `20${match[3]}` : match[3])
    : today.year;

  if (!isValidCalendarDate(parsedYear, month, day)) {
    return null;
  }

  const range = buildDayRange({ year: parsedYear, month, day });

  if (!match[3] && range.dateTo < now.toISOString()) {
    return buildDayRange({ year: parsedYear + 1, month, day });
  }

  return range;
}

function parseDateRange(
  text: string,
  now = new Date(),
): { dateFrom?: string; dateTo?: string } {
  const normalized = text.toLowerCase();

  if (/\bfim de semana\b|\beste fim de semana\b/.test(normalized)) {
    return buildWeekendRange(now);
  }

  if (/\bamanhã\b|\bamanha\b/.test(normalized)) {
    return buildDayRange(addDays(getSaoPauloDateParts(now), 1));
  }

  if (/\bhoje\b/.test(normalized)) {
    return buildDayRange(getSaoPauloDateParts(now));
  }

  const explicitDate = parseExplicitDate(normalized, now);

  if (explicitDate) {
    return explicitDate;
  }

  const naturalDate = parseNaturalDate(normalized, now);

  if (naturalDate) {
    return naturalDate;
  }

  for (const [monthName, month] of Object.entries(MONTHS)) {
    if (new RegExp(`\\b${monthName}\\b`).test(normalized)) {
      return buildMonthRange(month, now);
    }
  }

  for (const [weekdayName, weekday] of Object.entries(WEEKDAY_OFFSETS)) {
    if (new RegExp(`\\b${weekdayName}\\b`).test(normalized)) {
      return buildNextWeekdayRange(weekday, now);
    }
  }

  return {};
}

function extractCity(text: string) {
  const match = text.match(
    /\b(?:em|na|no)\s+([a-zA-ZÀ-ÿ][a-zA-ZÀ-ÿ\s-]{1,40})(?=\s+(?:hoje|amanh[ãa]|s[áa]bado|domingo|segunda|ter[cç]a|quarta|quinta|sexta|fim|janeiro|fevereiro|mar[cç]o|abril|maio|junho|julho|agosto|setembro|outubro|novembro|dezembro|\d{1,2}\/\d{1,2})|$)/i,
  );

  const city = match?.[1]
    ?.replace(/\b(show|shows|evento|eventos|ingresso|ingressos)\b/gi, "")
    .trim();

  if (!city) {
    return undefined;
  }

  const normalizedCity = city.toLowerCase();

  if (
    normalizedCity in MONTHS ||
    normalizedCity in WEEKDAY_OFFSETS ||
    /^(hoje|amanh[ãa]|fim de semana|este fim de semana)$/.test(normalizedCity)
  ) {
    return undefined;
  }

  return city;
}

function stripSearchNoise(text: string) {
  const monthAlternation = Object.keys(MONTHS).join("|");
  const cleaned = text
    .replace(/\b(?:em|na|no)\s+[a-zA-ZÀ-ÿ][a-zA-ZÀ-ÿ\s-]{1,40}$/i, "")
    .replace(/\b\d{1,2}\/\d{1,2}(?:\/\d{2,4})?\b/g, " ")
    .replace(
      new RegExp(`\\b\\d{1,2}(?:\\s+de)?\\s+(?:${monthAlternation})(?:\\s+de\\s+\\d{2,4})?\\b`, "gi"),
      " ",
    )
    .replace(
      /\b(hoje|amanh[ãa]|s[áa]bado|domingo|segunda(?:-feira)?|ter[cç]a(?:-feira)?|quarta(?:-feira)?|quinta(?:-feira)?|sexta(?:-feira)?|fim de semana|este fim de semana|janeiro|fevereiro|mar[cç]o|abril|maio|junho|julho|agosto|setembro|outubro|novembro|dezembro)\b/gi,
      " ",
    );
  const withoutLeadingIntent = cleaned
    .replace(LEADING_INTENT_PATTERN, "")
    .replace(/\b(?:em|na|no)\s*$/i, "")
    .split(/\s+/)
    .filter((word) => word)
    .join(" ")
    .trim();
  const words = withoutLeadingIntent.split(/\s+/).filter(Boolean);

  if (
    words.length > 0 &&
    words.every((word) => GENERIC_SEARCH_WORDS.has(word.toLowerCase()))
  ) {
    return undefined;
  }

  return withoutLeadingIntent || undefined;
}

export function parseEventSearchMessage(
  text: string,
  now = new Date(),
): ParsedEventSearchMessage {
  const originalText = text.trim();
  const normalized = originalText.toLowerCase().replace(/\s+/g, " ").trim();
  const numericMatch = normalized.match(/^\d+$/);

  if (numericMatch) {
    return {
      originalText,
      isGeneric: false,
      numericSelection: Number(numericMatch[0]),
    };
  }

  if (!normalized || GENERIC_MESSAGES.has(normalized)) {
    return {
      originalText,
      isGeneric: true,
    };
  }

  const city = extractCity(originalText);
  const { dateFrom, dateTo } = parseDateRange(originalText, now);
  const artist = stripSearchNoise(originalText);

  if (!artist && !city && !dateFrom && !dateTo) {
    return {
      originalText,
      isGeneric: true,
    };
  }

  return {
    originalText,
    isGeneric: false,
    ...(artist ? { artist } : {}),
    ...(city ? { city } : {}),
    ...(dateFrom ? { dateFrom } : {}),
    ...(dateTo ? { dateTo } : {}),
  };
}

function formatEventDate(startsAt: string) {
  return new Intl.DateTimeFormat("pt-BR", {
    timeZone: SAO_PAULO_TIME_ZONE,
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  })
    .format(new Date(startsAt))
    .replace(",", " às");
}

function formatTime(startsAt: string) {
  return new Intl.DateTimeFormat("pt-BR", {
    timeZone: SAO_PAULO_TIME_ZONE,
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(startsAt));
}

function formatDateTime(startsAt: string) {
  return new Intl.DateTimeFormat("pt-BR", {
    timeZone: SAO_PAULO_TIME_ZONE,
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  })
    .format(new Date(startsAt))
    .replace(",", " às");
}

function formatSearchSessionStatus(status: string) {
  if (status === "sales_open") {
    return "vendas abertas";
  }

  if (status === "scheduled") {
    return "em breve";
  }

  return status;
}

function formatCurrencyFromCents(cents: number) {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(cents / 100);
}

const LOWERCASE_NAME_PARTS = new Set([
  "a",
  "as",
  "com",
  "da",
  "das",
  "de",
  "do",
  "dos",
  "e",
  "em",
  "na",
  "nas",
  "no",
  "nos",
  "o",
  "os",
  "para",
  "por",
]);

function formatAnnouncementTitle(value: string) {
  return value.trim().toLocaleUpperCase("pt-BR");
}

function capitalizeNamePart(value: string) {
  if (!value) return value;
  return value.charAt(0).toLocaleUpperCase("pt-BR") + value.slice(1);
}

function formatProperName(value: string | null | undefined) {
  const trimmed = value?.trim();
  if (!trimmed) return "";

  return trimmed
    .toLocaleLowerCase("pt-BR")
    .split(/(\s+|-)/)
    .map((part, index) => {
      if (!part.trim() || part === "-") return part;
      if (index > 0 && LOWERCASE_NAME_PARTS.has(part)) return part;
      return part
        .split("/")
        .map((piece) => capitalizeNamePart(piece))
        .join("/");
    })
    .join("");
}

function formatCityState(city: string, state: string) {
  return `${formatProperName(city)}/${state.trim().toLocaleUpperCase("pt-BR")}`;
}

function buildEventOptions(
  events: TicketEventSearchResult[],
): TicketConversationEventOption[] {
  return events.map((event, index) => ({
    option: index + 1,
    eventId: event.eventId,
    sessionId: event.sessionId,
    title: event.title,
    artistName: event.artistName,
    startsAt: event.startsAt,
    city: event.city,
    state: event.state,
    venueId: event.venueId,
    ...(event.imageUrl ? { imageUrl: event.imageUrl } : {}),
    ...(event.venueName ? { venueName: event.venueName } : {}),
  }));
}

function formatEventsReply(events: TicketEventSearchResult[]) {
  const lines = events.flatMap((event, index) => [
    formatSingleEventReply(event, index, events.length),
    "",
  ]);

  return [
    "Encontrei estes eventos:",
    "",
    ...lines,
  ].join("\n");
}

function formatSingleEventReply(
  event: TicketEventSearchResult,
  index: number,
  totalEvents: number,
) {
  const title = formatAnnouncementTitle(event.title);
  const details = [
    `> 🎤 Artista: ${formatProperName(event.artistName)}`,
    `> 📍 Cidade: ${formatCityState(event.city, event.state)}`,
    `> 🗓️ Data: ${formatEventDate(event.startsAt)}`,
    `> 🏟️ Local: ${event.venueName ? formatProperName(event.venueName) : "A confirmar"}`,
    `> 🎫 Status: ${formatSearchSessionStatus(event.sessionStatus)}`,
  ];
  const options =
    totalEvents === 1
      ? ["1. Comprar", "2. Saber mais", "3. Buscar outro evento"]
      : [`${index + 1}. Comprar este evento`];

  return [
    `🎟️ - *${title}*`,
    ...details,
    "",
    ...options,
  ].join("\n");
}

function buildEventSearchOutboundMessages(events: TicketEventSearchResult[]) {
  return events.map((event, index) => {
    const caption = formatSingleEventReply(event, index, events.length);

    return event.imageUrl
      ? ({ type: "image", imageUrl: event.imageUrl, caption } as const)
      : ({ type: "text", body: caption } as const);
  });
}

function formatSingleEventMoreInfo(event: TicketConversationEventOption) {
  return [
    `🎟️ - *${formatAnnouncementTitle(event.title)}*`,
    ...(event.artistName ? [`> 🎤 Artista: ${formatProperName(event.artistName)}`] : []),
    `> 📍 Cidade: ${formatCityState(event.city, event.state)}`,
    `> 🗓️ Data: ${formatEventDate(event.startsAt)}`,
    `> 🏟️ Local: ${event.venueName ? formatProperName(event.venueName) : "A confirmar"}`,
    "",
    "1. Comprar",
    "3. Buscar outro evento",
  ].join("\n");
}

function buildSelectedEvent(
  event: TicketEventSearchResult,
): TicketConversationSelectedEvent {
  return {
    eventId: event.eventId,
    sessionId: event.sessionId,
    title: event.title,
    artistName: event.artistName,
    startsAt: event.startsAt,
    city: event.city,
    state: event.state,
    venueId: event.venueId,
    ...(event.imageUrl ? { imageUrl: event.imageUrl } : {}),
    ...(event.venueName ? { venueName: event.venueName } : {}),
  };
}

function buildSectionOptions(
  sections: AvailableSection[],
): TicketConversationSectionOption[] {
  let option = 1;

  return sections.flatMap((section) => {
    const ticketTypes = section.ticketTypes.length > 1
      ? section.ticketTypes
      : [section.ticketTypes[0]].filter(Boolean);

    return ticketTypes.map((ticketType) => ({
      option: option++,
      sectionId: section.sectionId,
      sectionName: section.sectionName,
      hasNumberedSeats: section.hasNumberedSeats,
      availableSeatsCount: section.availableSeatsCount,
      minPriceCents: section.minPriceCents,
      minFeeCents: section.minFeeCents,
      ticketTypes: section.ticketTypes,
      selectedTicketType: ticketType,
    }));
  });
}

function buildSelectedSection(
  section: AvailableSection,
  ticketType?: TicketConversationSectionTicketType,
): TicketConversationSelectedSection {
  return {
    sectionId: section.sectionId,
    sectionName: section.sectionName,
    hasNumberedSeats: section.hasNumberedSeats,
    availableSeatsCount: section.availableSeatsCount,
    selectedTicketType: ticketType ?? section.ticketTypes[0],
  };
}

function buildSeatOptions(seats: AvailableSeat[]): TicketConversationSeatOption[] {
  return seats.map((seat) => ({
    sessionSeatId: seat.sessionSeatId,
    seatId: seat.seatId,
    seatCode: seat.seatCode,
    rowLabel: seat.rowLabel,
    seatNumber: seat.seatNumber,
  }));
}

function formatSectionPrice(section: AvailableSection) {
  if (section.ticketTypes.length === 1) {
    const ticketType = section.ticketTypes[0];

    return formatPriceWithOptionalFee(ticketType.priceCents, ticketType.feeCents);
  }

  return `A partir de: ${formatPriceWithOptionalFee(section.minPriceCents, section.minFeeCents)}`;
}

function formatPriceWithOptionalFee(priceCents: number, feeCents: number) {
  const price = formatCurrencyFromCents(priceCents);

  if (feeCents <= 0) {
    return price;
  }

  return `${price} + ${formatCurrencyFromCents(feeCents)} taxa`;
}

function formatSectionsReply({
  sections,
}: {
  sections: AvailableSection[];
}) {
  let option = 1;
  const sectionLines = sections.flatMap((section) =>
    section.ticketTypes.map((ticketType) => {
      const label = section.ticketTypes.length > 1
        ? `${section.sectionName} - ${ticketType.label}`
        : section.sectionName;
      const line = `> ${option}. ${label} - ${formatPriceWithOptionalFee(ticketType.priceCents, ticketType.feeCents)}`;
      option += 1;
      return line;
    }),
  );

  return [
    "*ESCOLHA SEU INGRESSO/SETOR*",
    ...sectionLines,
    "",
    "Responda com o número do setor para continuar.",
  ].join("\n");
}

function formatQuantityPrompt(
  section: AvailableSection,
  ticketType = section.ticketTypes[0],
) {
  const selectedPrice = ticketType
    ? formatPriceWithOptionalFee(ticketType.priceCents, ticketType.feeCents)
    : formatSectionPrice(section);

  return [
    `*${section.sectionName.toLocaleUpperCase("pt-BR")}*`,
    "",
    ...(ticketType ? [`> Ingresso: ${ticketType.label}`] : []),
    `> 🎫 Valor: ${selectedPrice}`,
    "",
    "Digite o número de ingressos para compra, ex: 2",
  ].join("\n");
}

function formatSeatsReply({
  seatMap,
  ticketType,
  quantity = 1,
}: {
  seatMap: SeatMap;
  ticketType?: TicketConversationSectionTicketType;
  quantity?: number;
}) {
  return [
    "*ESCOLHA SEUS ASSENTOS*",
    ...(ticketType
      ? [
          `> Ingresso: ${ticketType.label}`,
          `> Valor: ${formatPriceWithOptionalFee(ticketType.priceCents, ticketType.feeCents)}`,
        ]
      : []),
    `> Verde: livre (${seatMap.totalAvailableCount})`,
    `> Cinza: ocupado (${seatMap.totalSeatsCount - seatMap.totalAvailableCount})`,
    "",
    "Enviamos o mapa atualizado do setor.",
    quantity > 1
      ? `Responda com os ${quantity} códigos dos assentos desejados.`
      : "Responda com o código do assento desejado.",
    quantity > 1 ? "Exemplo: A03,A04" : "Exemplo: A03",
  ].join("\n");
}

function normalizeSeatCode(value: string) {
  return value.trim().replace(/[\s-]+/g, "").toUpperCase();
}

function parseRequestedSeatCodes(value: string) {
  const matches = value.toUpperCase().match(/[A-Z]+\s*\d+/g) ?? [];

  return Array.from(
    new Set(matches.map((match) => normalizeSeatCode(match)).filter(Boolean)),
  );
}

function normalizeIntentText(value: string) {
  return value
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/\s+/g, " ");
}

function isPaymentLinkIntent(text: string) {
  const normalized = normalizeIntentText(text);

  return (
    PAYMENT_LINK_INTENTS.has(normalized) ||
    normalized.includes("pagar") ||
    normalized.includes("pagamento") ||
    normalized.includes("link")
  );
}

function isSimpleReservationReply(text: string) {
  const normalized = normalizeIntentText(text);

  return SIMPLE_PAYMENT_CONTINUATIONS.has(normalized);
}

function isBuyerReservationExitIntent(text: string) {
  const normalized = normalizeIntentText(text);

  return (
    normalized === "sair" ||
    normalized === "cancela" ||
    normalized === "cancelar" ||
    normalized === "apagar" ||
    normalized === "encerrar" ||
    normalized === "logout"
  );
}

function isReservationContextExpired(
  reservation?: TicketConversationReservation,
) {
  if (!reservation?.expiresAt) {
    return false;
  }

  return new Date(reservation.expiresAt).getTime() <= Date.now();
}

function resetBuyerReservationContext(
  baseContext: TicketConversationState,
): TicketConversationState {
  return {
    ...baseContext,
    step: "idle",
    state: "idle",
    reservation: undefined,
    payment: undefined,
    selectedEvent: undefined,
    selectedSection: undefined,
    selectedSeat: undefined,
    selectedQuantity: undefined,
    lastSeats: [],
    lastSections: [],
    lastEvents: [],
  };
}

function parseTicketQuantity(text: string) {
  const normalized = normalizeIntentText(text);

  if (!/^\d+$/.test(normalized)) {
    return null;
  }

  const quantity = Number(normalized);

  return Number.isInteger(quantity) && quantity > 0 ? quantity : null;
}

function getAdminPhones() {
  const env = getEnv();

  return env.ADMIN_WHATSAPP_PHONES.split(",")
    .map((phone) => normalizeGatePhone(phone))
    .filter((phone): phone is string => Boolean(phone));
}

function isAdminPhone(phone: string) {
  const normalizedPhone = normalizeGatePhone(phone);

  return Boolean(
    normalizedPhone && getAdminPhones().some((adminPhone) => adminPhone === normalizedPhone),
  );
}

function buildAdminContext({
  adminUserId,
  role,
  sessionId,
  expiresAt,
}: {
  adminUserId?: string;
  role?: AdminRole;
  sessionId?: string;
  expiresAt?: string;
}) {
  return {
    ...(adminUserId ? { adminUserId } : {}),
    ...(role ? { role } : {}),
    ...(sessionId ? { sessionId } : {}),
    ...(expiresAt ? { expiresAt } : {}),
  };
}

type AdminSubmenuState =
  | "admin_events_menu"
  | "admin_orders_menu"
  | "admin_courtesies_menu"
  | "admin_gate_menu"
  | "admin_users_menu"
  | "admin_reports_menu";

type AdminReportFlowState =
  | "admin_report_event_select"
  | "admin_report_period_select"
  | "admin_report_custom_period_collecting";

type AdminSubmenuConfig = {
  title: string;
  state: AdminSubmenuState;
  mainOption: number;
  permission: AdminPermission;
  backOption: number;
  exitOption: number;
  options: string[];
};

type AdminEventScope = {
  adminUserId: string;
  adminPhone: string;
  canSeeAllEvents: boolean;
};

const GLOBAL_ADMIN_EVENT_PHONE = "15997503836";

function buildAdminEventScope(adminUser: {
  id: string;
  phone: string;
  role: AdminRole;
}): AdminEventScope {
  const normalizedPhone = normalizeGatePhone(adminUser.phone) ?? adminUser.phone;

  return {
    adminUserId: adminUser.id,
    adminPhone: normalizedPhone,
    canSeeAllEvents:
      adminUser.role === "root" || normalizedPhone === GLOBAL_ADMIN_EVENT_PHONE,
  };
}

const ADMIN_SUBMENUS: Record<AdminSubmenuState, AdminSubmenuConfig> = {
  admin_events_menu: {
    title: "Meus eventos",
    state: "admin_events_menu",
    mainOption: 1,
    permission: "manage_events",
    backOption: 6,
    exitOption: 7,
    options: [
      "Listar meus eventos",
      "Criar meu evento",
      "Editar meu evento",
      "Ativar/Pausar meu evento",
      "Duplicar evento",
    ],
  },
  admin_orders_menu: {
    title: "Ingressos e pedidos",
    state: "admin_orders_menu",
    mainOption: 2,
    permission: "manage_tickets",
    backOption: 5,
    exitOption: 6,
    options: [
      "Buscar ingresso por telefone",
      "Buscar ingresso por código",
      "Cancelar reserva pendente",
      "Consultar ticket",
    ],
  },
  admin_courtesies_menu: {
    title: "Cortesias",
    state: "admin_courtesies_menu",
    mainOption: 3,
    permission: "manage_courtesies",
    backOption: 6,
    exitOption: 7,
    options: [
      "Gerar cortesia",
      "Listar cortesias emitidas",
      "Reenviar cortesia",
      "Cancelar cortesia",
      "Definir limite de cortesias",
    ],
  },
  admin_gate_menu: {
    title: "Portaria",
    state: "admin_gate_menu",
    mainOption: 4,
    permission: "manage_gate",
    backOption: 6,
    exitOption: 7,
    options: [
      "Check-in neste telefone",
      "Definir outro telefone para check-in",
      "Ver todos os acessos",
      "Revogar acessos",
    ],
  },
  admin_users_menu: {
    title: "Administradores",
    state: "admin_users_menu",
    mainOption: 5,
    permission: "manage_admins",
    backOption: 5,
    exitOption: 6,
    options: [
      "Listar administradores",
      "Adicionar administrador",
      "Alterar nível de administrador",
      "Desativar administrador",
    ],
  },
  admin_reports_menu: {
    title: "Relatórios",
    state: "admin_reports_menu",
    mainOption: 6,
    permission: "view_reports",
    backOption: 7,
    exitOption: 8,
    options: [
      "Vendas por evento",
      "Vendas por setor",
      "Reservas expiradas",
      "Check-ins da portaria",
      "Ingressos usados e não usados",
      "Resumo geral",
    ],
  },
};

function renderAdminSubmenu(config: AdminSubmenuConfig) {
  return [
    `*${config.title.toUpperCase()}*`,
    "",
    ...config.options.map((label, index) => `> ${index + 1}. ${label}`),
    `> ${config.backOption}. Voltar`,
    `> ${config.exitOption}. Sair`,
    "",
    "Responda com o número da opção.",
    'Digite "Voltar" para voltar, "Cancelar" para abandonar esta tela ou "Sair" para sair da área de admin.',
  ].join("\n");
}

function renderAdminEventsMenu() {
  return renderAdminSubmenu(ADMIN_SUBMENUS.admin_events_menu);
}

function renderAdminEventListFilterMenu() {
  return [
    "*LISTAR MEUS EVENTOS*",
    "",
    "> 1. Eventos ativos",
    "> 2. Eventos pausados",
    "> 3. Eventos cancelados",
    "> 4. Todos os eventos",
    "> 5. Voltar",
    "> 6. Sair",
    "",
    "Responda com o número da opção.",
    'Digite "Voltar" para voltar, "Cancelar" para abandonar esta tela ou "Sair" para sair da área de admin.',
  ].join("\n");
}

function getAdminSubmenuByMainOption(option: number) {
  return Object.values(ADMIN_SUBMENUS).find(
    (submenu) => submenu.mainOption === option,
  );
}

function isAdminSubmenuState(
  value: string | undefined,
): value is AdminSubmenuState {
  return Boolean(value && value in ADMIN_SUBMENUS);
}

function canAccessAdminMenu(role: AdminRole, submenu: AdminSubmenuConfig) {
  return hasAdminPermission(role, submenu.permission);
}

function parseAdminMainMenuOption(text: string) {
  const normalized = normalizeAdminText(text);
  const aliases: Record<number, string[]> = {
    1: ["evento", "eventos", "meus eventos"],
    2: ["ingresso", "ingressos", "pedido", "pedidos"],
    3: ["cortesia", "cortesias"],
    4: ["portaria", "check-in", "checkin"],
    5: ["administrador", "administradores", "admins"],
    6: ["relatorio", "relatorios"],
    7: ["sair", "logout", "encerrar"],
  };

  const option = Object.entries(aliases).find(([, optionAliases]) =>
    optionAliases.includes(normalized),
  )?.[0];

  if (!option) {
    return null;
  }

  const numericOption = Number(option);

  return numericOption;
}

function parseAdminSubmenuOption(text: string) {
  const normalized = normalizeAdminText(text);

  if (normalized === "voltar" || normalized === "cancelar") {
    return "back" as const;
  }

  if (normalized === "menu" || normalized === "menu principal") {
    return "menu" as const;
  }

  if (normalized === "sair" || normalized === "logout" || normalized === "encerrar") {
    return "exit" as const;
  }

  return text.trim().match(/^\d+$/) ? Number(text.trim()) : null;
}

function buildGateCheckInReply({
  gateUrl,
  expiresAt,
}: {
  gateUrl: string;
  expiresAt: string;
}) {
  return [
    "Acesso de check-in criado.",
    "",
    "Abra o link abaixo neste celular para ler QR Codes:",
    gateUrl,
    "",
    `Validade: até ${formatDateTime(expiresAt)}`,
    "",
    "Esse link é temporário e deve ser usado apenas pela equipe autorizada.",
  ].join("\n");
}

function parseGateCommand(text: string) {
  const match = text.trim().match(GATE_COMMAND_PATTERN);

  if (!match) {
    return null;
  }

  const rest = match[1]?.trim();

  if (!rest) {
    return {
      valid: false as const,
    };
  }

  const phoneMatch = rest.match(/(?:\+?\d[\d\s().-]{7,}\d)/);
  const validatorPhone = normalizeGatePhone(phoneMatch?.[0]);

  if (!validatorPhone) {
    return {
      valid: false as const,
    };
  }

  const gateLabel =
    rest
      .slice((phoneMatch?.index ?? 0) + (phoneMatch?.[0].length ?? 0))
      .trim()
      .replace(/\s+/g, " ") || null;

  return {
    valid: true as const,
    validatorPhone,
    gateLabel,
  };
}

function buildGateValidatorMessage(gateUrl: string) {
  return [
    "Você recebeu acesso temporário à portaria.",
    "",
    "Abra o link abaixo no celular para validar ingressos:",
    gateUrl,
    "",
    "Este acesso é temporário e deve ser usado apenas pela equipe autorizada.",
  ].join("\n");
}

function buildGateAdminReply({
  validatorPhone,
  gateLabel,
  expiresAt,
  sent,
}: {
  validatorPhone: string;
  gateLabel: string | null;
  expiresAt: string;
  sent: boolean;
}) {
  return [
    "Acesso de portaria criado.",
    "",
    `Validador: ${validatorPhone}`,
    `Portaria: ${gateLabel ?? "Entrada"}`,
    `Validade: até ${formatDateTime(expiresAt)}`,
    "",
    sent
      ? "O link foi enviado ao validador."
      : "Não consegui enviar o link ao validador. Crie um novo acesso ou tente novamente.",
  ].join("\n");
}

function buildReservationContext(
  reservation: ReserveSelectedSeatSuccess,
): TicketConversationReservation {
  return {
    reservationId: reservation.reservationId,
    orderId: reservation.orderId,
    expiresAt: reservation.expiresAt,
    totalAmountCents: reservation.totalAmountCents,
    totalFeeCents: reservation.totalFeeCents,
    currency: reservation.currency,
  };
}

function buildPaymentContext(
  checkout: CheckoutForReservation,
): TicketConversationPayment {
  return {
    provider: checkout.provider,
    checkoutUrl: checkout.checkoutUrl,
    preferenceId: checkout.preferenceId,
    amountCents: checkout.amountCents,
    currency: checkout.currency,
  };
}

function buildSelectedSeatContext(
  seat: TicketConversationSeatOption,
): TicketConversationSelectedSeat {
  return {
    seatId: seat.seatId,
    seatCode: seat.seatCode,
  };
}

function formatReservationReply({
  selectedEvent,
  selectedSection,
  selectedSeat,
  reservation,
}: {
  selectedEvent: TicketConversationSelectedEvent;
  selectedSection: TicketConversationSelectedSection;
  selectedSeat?: TicketConversationSelectedSeat;
  reservation: ReserveSelectedSeatSuccess;
}) {
  const quantity = reservation.items.length || 1;

  return [
    "RESERVA CRIADA. VOCÊ TEM 10 MINUTOS PARA EFETUAR A COMPRA",
    `> Evento: ${selectedEvent.title}`,
    `> Setor: ${selectedSection.sectionName}`,
    ...(selectedSection.selectedTicketType
      ? [`> Ingresso: ${selectedSection.selectedTicketType.label}`]
      : []),
    ...(selectedSeat ? [`> Assento: ${selectedSeat.seatCode}`] : []),
    `> Quantidade: ${quantity}`,
    "",
    `Valor: ${formatPriceWithOptionalFee(reservation.totalAmountCents, reservation.totalFeeCents)}`,
    `> Reserva válida até: ${formatTime(reservation.expiresAt)}`,
    "",
    "Para comprar, digite COMPRAR. Você receberá o link de pagamento na próxima mensagem.",
  ].join("\n");
}

function formatPaymentLinkReply({
  selectedEvent,
  selectedSection,
  selectedSeat,
  reservation,
  checkout,
}: {
  selectedEvent?: TicketConversationSelectedEvent;
  selectedSection?: TicketConversationSelectedSection;
  selectedSeat?: TicketConversationSelectedSeat;
  reservation?: TicketConversationReservation;
  checkout: CheckoutForReservation;
}) {
  const totalLabel = reservation
    ? formatPriceWithOptionalFee(
        reservation.totalAmountCents,
        reservation.totalFeeCents,
      )
    : formatCurrencyFromCents(checkout.amountCents);
  const lines = [
    "*LINK DE PAGAMENTO GERADO*",
    ...(selectedEvent ? [`> Evento: ${selectedEvent.title}`] : []),
    ...(selectedSection ? [`> Setor: ${selectedSection.sectionName}`] : []),
    ...(selectedSeat ? [`> Assento: ${selectedSeat.seatCode}`] : []),
    `> Total: ${totalLabel}`,
    "",
    "Pague clicando neste link (crédito ou pix):",
    checkout.checkoutUrl,
    "",
    "Após a confirmação do pagamento, seu ingresso será emitido automaticamente.",
  ];

  return lines.join("\n");
}

function isConfirmText(text: string) {
  return normalizeAdminText(text) === "confirmar";
}

function isCancelText(text: string) {
  const normalized = normalizeAdminText(text);

  return normalized === "cancelar";
}

function isBackText(text: string) {
  return normalizeAdminText(text) === "voltar";
}

function isAbortText(text: string) {
  return normalizeAdminText(text) === "cancelar";
}

function withAdminNavigationHint(reply: string) {
  const normalized = normalizeAdminText(reply);

  if (
    normalized.includes("voltar") &&
    normalized.includes("cancelar") &&
    normalized.includes("sair")
  ) {
    return reply;
  }

  return [
    reply,
    "",
    'Digite "Voltar" para voltar, "Cancelar" para abandonar esta tela ou "Sair" para sair da área de admin.',
  ].join("\n");
}

function isAdminOrdersFlowState(
  state: string | undefined,
): state is
  | "admin_order_phone_collecting"
  | "admin_order_code_collecting"
  | "admin_order_cancel_collecting"
  | "admin_ticket_consult_collecting" {
  return (
    state === "admin_order_phone_collecting" ||
    state === "admin_order_code_collecting" ||
    state === "admin_order_cancel_collecting" ||
    state === "admin_ticket_consult_collecting"
  );
}

function isAdminCourtesyFlowState(
  state: string | undefined,
): state is
  | "admin_courtesy_generate_type"
  | "admin_courtesy_phone_collecting"
  | "admin_courtesy_event_select"
  | "admin_courtesy_list_event_select"
  | "admin_courtesy_resend_event_select"
  | "admin_courtesy_cancel_event_select"
  | "admin_courtesy_cancel_method_select"
  | "admin_courtesy_cancel_target_collecting"
  | "admin_courtesy_limit_event_select"
  | "admin_courtesy_limit_collecting" {
  return (
    state === "admin_courtesy_generate_type" ||
    state === "admin_courtesy_phone_collecting" ||
    state === "admin_courtesy_event_select" ||
    state === "admin_courtesy_list_event_select" ||
    state === "admin_courtesy_resend_event_select" ||
    state === "admin_courtesy_cancel_event_select" ||
    state === "admin_courtesy_cancel_method_select" ||
    state === "admin_courtesy_cancel_target_collecting" ||
    state === "admin_courtesy_limit_event_select" ||
    state === "admin_courtesy_limit_collecting"
  );
}

function renderCourtesyCancelMethodMenu() {
  return [
    "*CANCELAR CORTESIA*",
    "",
    "> 1. Cancelar pelo número de telefone",
    "> 2. Cancelar pelo código",
    "> 3. Ver todas as cortesias",
    "> 4. Voltar",
    "> 5. Sair",
    "",
    "Responda com o número da opção.",
  ].join("\n");
}

function isAdminUsersFlowState(
  state: string | undefined,
): state is
  | "admin_users_add_type_select"
  | "admin_users_add_phone_collecting"
  | "admin_users_add_name_collecting"
  | "admin_users_add_passphrase_collecting"
  | "admin_users_role_select"
  | "admin_users_role_collecting"
  | "admin_users_disable_select" {
  return (
    state === "admin_users_add_type_select" ||
    state === "admin_users_add_phone_collecting" ||
    state === "admin_users_add_name_collecting" ||
    state === "admin_users_add_passphrase_collecting" ||
    state === "admin_users_role_select" ||
    state === "admin_users_role_collecting" ||
    state === "admin_users_disable_select"
  );
}

function isAdminGateFlowState(
  state: string | undefined,
): state is
  | "admin_gate_register_event_select"
  | "admin_gate_validator_collecting"
  | "admin_gate_password_collecting"
  | "admin_gate_access_event_select"
  | "admin_gate_accesses_filter"
  | "admin_gate_revoke_select"
  | "admin_gate_revoke_confirm" {
  return (
    state === "admin_gate_register_event_select" ||
    state === "admin_gate_validator_collecting" ||
    state === "admin_gate_password_collecting" ||
    state === "admin_gate_access_event_select" ||
    state === "admin_gate_accesses_filter" ||
    state === "admin_gate_revoke_select" ||
    state === "admin_gate_revoke_confirm"
  );
}

function isGateAccessFlowState(
  state: string | undefined,
): state is "gate_access_selecting" | "gate_access_passphrase_collecting" {
  return (
    state === "gate_access_selecting" ||
    state === "gate_access_passphrase_collecting"
  );
}

function isAdminReportsFlowState(
  state: string | undefined,
): state is AdminReportFlowState {
  return (
    state === "admin_report_event_select" ||
    state === "admin_report_period_select" ||
    state === "admin_report_custom_period_collecting"
  );
}

function withAdminUsersContext(
  baseContext: TicketConversationState,
  state: TicketConversationState["state"],
  adminUsers: NonNullable<TicketConversationState["adminUsers"]>,
) {
  return {
    ...baseContext,
    step: state,
    state,
    adminUsers,
  };
}

function withAdminGateContext(
  baseContext: TicketConversationState,
  state: TicketConversationState["state"],
  adminGate: NonNullable<TicketConversationState["adminGate"]>,
) {
  return {
    ...baseContext,
    step: state,
    state,
    adminGate,
  };
}

function withAdminReportsContext(
  baseContext: TicketConversationState,
  state: TicketConversationState["state"],
  adminReports: NonNullable<TicketConversationState["adminReports"]>,
) {
  return {
    ...baseContext,
    step: state,
    state,
    adminReports,
  };
}

function getAdminReportsContext(baseContext: TicketConversationState) {
  return baseContext.adminReports ?? {};
}

function renderGateAccessFilterMenu() {
  return [
    "*VER TODOS OS ACESSOS*",
    "",
    "> 1. Ativos",
    "> 2. Pausados",
    "> 3. Voltar",
    "> 4. Sair",
    "",
    "Responda com o número da opção.",
    'Digite "Voltar" para voltar, "Cancelar" para abandonar esta tela ou "Sair" para sair da área de admin.',
  ].join("\n");
}

function formatGateAccessStatus(status: AdminGateAccessListItem["status"]) {
  if (status === "active") return "ativo";
  if (status === "paused") return "pausado";
  if (status === "revoked") return "revogado";
  return status;
}

function maskGatePhone(phone: string) {
  const digits = phone.replace(/\D/g, "");

  if (digits.length <= 4) return "****";

  return `****${digits.slice(-4)}`;
}

function renderGateAccessesList({
  title,
  accesses,
}: {
  title: string;
  accesses: AdminGateAccessListItem[];
}) {
  const blocks = accesses.map((access, index) =>
    [
      `${index + 1}. ${access.eventTitle ?? "Evento"}`,
      `> Telefone: ${maskGatePhone(access.phone)}`,
      access.name ? `> Nome: ${access.name}` : null,
      `> Status: ${formatGateAccessStatus(access.status)}`,
      `> Criado em: ${formatDateTime(access.createdAt)}`,
    ]
      .filter(Boolean)
      .join("\n"),
  );

  return [
    `*${title}*`,
    "",
    blocks.length > 0 ? blocks.join("\n---\n") : "Nenhum acesso encontrado.",
  ].join("\n");
}

function renderGateAccessRevokeConfirm(access: {
  validatorPhone: string;
  eventTitle?: string | null;
}) {
  return [
    "*CONFIRMAR PAUSA DO ACESSO*",
    "",
    `> Telefone: ${maskGatePhone(access.validatorPhone)}`,
    `> Evento: ${access.eventTitle ?? "Evento"}`,
    "",
    "Responda SIM para pausar este acesso de portaria.",
    'Digite "Voltar" para voltar ou "Sair" para sair da área de admin.',
  ].join("\n");
}

function renderGateAccessPausedReply(access: {
  validatorPhone: string;
  eventTitle?: string | null;
}) {
  return [
    "*ACESSO DE PORTARIA PAUSADO*",
    "",
    `> Telefone: ${maskGatePhone(access.validatorPhone)}`,
    `> Evento: ${access.eventTitle ?? "Evento"}`,
  ].join("\n");
}

function renderGateValidatorPhonePrompt() {
  return [
    "*DEFINIR TELEFONE PARA CHECK-IN*",
    "",
    "> Digite o número de telefone",
    "",
    'Digite "Voltar" para voltar, "Cancelar" para abandonar esta tela ou "Sair" para sair da área de admin.',
  ].join("\n");
}

function renderGateValidatorPasswordPrompt() {
  return [
    "*DEFINIR PALAVRA CHAVE (SENHA) PARA CHECK-IN*",
    "",
    "> Digite a senha para entrar no sistema",
    "",
    'Digite "Voltar" para voltar, "Cancelar" para abandonar esta tela ou "Sair" para sair da área de admin.',
  ].join("\n");
}

function buildGateValidatorRegisteredReply({
  validatorPhone,
  passphrase,
}: {
  validatorPhone: string;
  passphrase: string;
}) {
  return [
    "*NOVO TELEFONE CADASTRADO PARA CHECK-IN*",
    "",
    `> Telefone: ${validatorPhone}`,
    `> Palavra chave: ${passphrase}`,
    "",
    "O telefone cadastrado deve enviar uma mensagem com a palavra Portaria para o telefone 15 99642-6671",
  ].join("\n");
}

function renderGateAccessSelection(accesses: AdminGateAccessListItem[]) {
  return [
    "*Você tem acesso de portaria para estes eventos:*",
    "",
    ...accesses.map(
      (access, index) => `> ${index + 1}. ${access.eventTitle ?? "Evento"}`,
    ),
    "",
    "Responda com o número do evento para continuar.",
  ].join("\n");
}

function renderGateAccessSelectionFromContext(
  accesses: NonNullable<TicketConversationState["gateAccess"]>["lastAccesses"] = [],
) {
  return [
    "*Você tem acesso de portaria para estes eventos:*",
    "",
    ...accesses.map(
      (access) => `> ${access.option}. ${access.eventTitle ?? "Evento"}`,
    ),
    "",
    "Responda com o número do evento para continuar.",
  ].join("\n");
}

function renderGateAccessPassphrasePrompt(eventTitle?: string | null) {
  return [
    "*PALAVRA CHAVE DA PORTARIA*",
    ...(eventTitle ? [`> Evento: ${eventTitle}`] : []),
    "",
    "Digite a palavra-chave cadastrada para liberar o check-in.",
  ].join("\n");
}

function renderAdminReportPeriodMenu() {
  return [
    "*QUAL PERÍODO DO RELATÓRIO?*",
    "",
    "> 1. Hoje",
    "> 2. Últimos 7 dias",
    "> 3. Últimos 30 dias",
    "> 4. Todo o período",
    "> 5. Escolher datas",
    "> 6. Voltar",
    "> 7. Sair",
    "",
    "Responda com o número da opção.",
    'Digite "Voltar" para voltar, "Cancelar" para abandonar esta tela ou "Sair" para sair da área de admin.',
  ].join("\n");
}

function parseAdminReportPeriodOption(input: string): AdminReportPeriod | "custom" | null {
  const option = input.trim().match(/^\d+$/) ? Number(input.trim()) : null;
  const now = new Date();
  const startOfToday = new Date(now);
  startOfToday.setHours(0, 0, 0, 0);
  const endOfToday = new Date(now);
  endOfToday.setHours(23, 59, 59, 999);

  if (option === 1) {
    return { label: "Hoje", from: startOfToday.toISOString(), to: endOfToday.toISOString() };
  }

  if (option === 2 || option === 3) {
    const days = option === 2 ? 7 : 30;
    const from = new Date(now);
    from.setDate(from.getDate() - (days - 1));
    from.setHours(0, 0, 0, 0);

    return { label: `Últimos ${days} dias`, from: from.toISOString(), to: endOfToday.toISOString() };
  }

  if (option === 4) return { label: "Todo o período" };
  if (option === 5) return "custom";

  return null;
}

function parseBrazilianDateOnly(value: string) {
  const match = value.trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (!match) return null;

  const [, day, month, year] = match;
  const parsed = new Date(Number(year), Number(month) - 1, Number(day));

  if (
    parsed.getFullYear() !== Number(year) ||
    parsed.getMonth() !== Number(month) - 1 ||
    parsed.getDate() !== Number(day)
  ) {
    return null;
  }

  return parsed;
}

function parseAdminReportCustomPeriod(input: string): AdminReportPeriod | null {
  const parts = input
    .split(/\s+(?:a|até|-)\s+/i)
    .map((part) => part.trim())
    .filter(Boolean);

  if (parts.length !== 2) return null;

  const from = parseBrazilianDateOnly(parts[0]);
  const to = parseBrazilianDateOnly(parts[1]);

  if (!from || !to || from.getTime() > to.getTime()) return null;

  from.setHours(0, 0, 0, 0);
  to.setHours(23, 59, 59, 999);

  return {
    label: `${parts[0]} a ${parts[1]}`,
    from: from.toISOString(),
    to: to.toISOString(),
  };
}

function renderAdminUserTypePrompt() {
  return [
    "*QUAL O TIPO DE ADMINISTRADOR VOCÊ QUER CADASTRAR?*",
    "",
    "> 1. Diretor - Acesso total ao sistema. Pode gerenciar eventos, ingressos, cortesias, portaria, relatórios e outros administradores.",
    "> 2. Gerente - Pode gerenciar eventos, ingressos, cortesias, portaria e relatórios. Não gerencia, inclui ou exclui outros administradores.",
    "> 3. Operador - Gerencia cortesias e relatórios",
    "",
    'Digite "Voltar" para voltar, "Cancelar" para abandonar esta tela ou "Sair" para sair da área de admin.',
  ].join("\n");
}

function renderAdminUserPhonePrompt() {
  return [
    "*QUAL TELEFONE DO ADMINISTRADOR?*",
    "",
    'Digite "Voltar" para voltar, "Cancelar" para abandonar esta tela ou "Sair" para sair da área de admin.',
  ].join("\n");
}

function renderAdminUserNamePrompt() {
  return [
    "*QUAL O NOME DO ADMINISTRADOR?*",
    "",
    'Digite "Voltar" para voltar, "Cancelar" para abandonar esta tela ou "Sair" para sair da área de admin.',
  ].join("\n");
}

function renderAdminUserPassphrasePrompt() {
  return [
    "*QUAL A PALAVRA CHAVE (SENHA) DO ADMINISTRADOR?*",
    "",
    'Digite "Voltar" para voltar, "Cancelar" para abandonar esta tela ou "Sair" para sair da área de admin.',
  ].join("\n");
}

function renderAdminUserRolePrompt() {
  return renderAdminUserTypePrompt().replace(
    "*QUAL O TIPO DE ADMINISTRADOR VOCÊ QUER CADASTRAR?*",
    "*QUAL O NOVO TIPO DE ADMINISTRADOR?*",
  );
}

function formatAdminRoleLabel(role: string) {
  return getAdminProfileLabel(role);
}

function renderAdminUsersList(users: AdminUserListItem[]) {
  const userBlocks = users.map((user, index) =>
    [
      `${index + 1}. ${user.name ?? "Sem nome"}`,
      `> Telefone: ${user.phone}`,
      `> Perfil: ${formatAdminRoleLabel(user.role)}`,
      `> Status: ${user.status}`,
      `> ID: ${user.id}`,
    ].join("\n"),
  );

  return [
    "*ADMINISTRADORES*",
    "",
    users.length ? userBlocks.join("\n---\n") : "Nenhum administrador encontrado.",
  ].join("\n");
}

function formatTicketStatus(status: string) {
  if (status === "issued") {
    return "emitido";
  }

  if (status === "used") {
    return "usado";
  }

  if (status === "cancelled") {
    return "cancelado";
  }

  return status;
}

function formatOrderStatus(status: string) {
  if (status === "draft") {
    return "rascunho";
  }

  if (status === "pending_payment") {
    return "pagamento pendente";
  }

  if (status === "paid") {
    return "pago";
  }

  if (status === "cancelled") {
    return "cancelado";
  }

  if (status === "expired") {
    return "expirado";
  }

  return status;
}

function formatPaymentStatus(status: string) {
  if (status === "approved") {
    return "aprovado";
  }

  if (status === "pending") {
    return "pendente";
  }

  if (status === "rejected") {
    return "recusado";
  }

  if (status === "cancelled") {
    return "cancelado";
  }

  if (status === "expired") {
    return "expirado";
  }

  return status;
}

function formatAdminTicketPaymentLabel(ticket: AdminTicketLookup) {
  return [
    ticket.paymentMethod,
    ticket.paymentProvider,
    ticket.paymentStatus ? formatPaymentStatus(ticket.paymentStatus) : null,
  ]
    .filter(Boolean)
    .join(" - ");
}

function formatAdminTicket(ticket: AdminTicketLookup, index?: number) {
  const prefix = typeof index === "number" ? `${index}. ` : "";
  const venue = ticket.venueName
    ? `${ticket.venueName} - ${ticket.city}/${ticket.state}`
    : `${ticket.city}/${ticket.state}`;
  const lines = [
    `${prefix}${ticket.eventTitle}`,
    `   Data: ${formatDateTime(ticket.startsAt)}`,
    `   Local: ${venue}`,
    `   Setor: ${ticket.sectionName}`,
    `   Ingresso/Assento: ${ticket.seatCode}`,
    `   Código: ${ticket.ticketCode}`,
    `   Status: ${formatTicketStatus(ticket.status)}`,
  ];

  if (ticket.customerPhone) {
    lines.push(`   Telefone: ${ticket.customerPhone}`);
  }

  if (ticket.purchasedAt) {
    lines.push(`   Compra: ${formatDateTime(ticket.purchasedAt)}`);
  }

  if (ticket.paymentMethod || ticket.paymentProvider || ticket.paymentStatus) {
    const paymentLabel = formatAdminTicketPaymentLabel(ticket);

    lines.push(`   Pagamento: ${paymentLabel}`);
  }

  if (ticket.totalAmountCents != null) {
    const totalFeeText =
      ticket.totalFeeCents && ticket.totalFeeCents > 0
        ? ` + ${formatCurrencyFromCents(ticket.totalFeeCents)} taxa`
        : "";

    lines.push(
      `   Total: ${formatCurrencyFromCents(ticket.totalAmountCents)}${totalFeeText}`,
    );
  }

  if (ticket.usedAt) {
    lines.push(`   Validado em: ${formatDateTime(ticket.usedAt)}`);
  }

  return lines.join("\n");
}

function formatAdminTicketForPhoneSearch(
  ticket: AdminTicketLookup,
  index: number,
) {
  const lines = [
    `${index}. ${ticket.eventTitle}`,
    `   Data: ${formatDateTime(ticket.startsAt)}`,
    `   Setor: ${ticket.sectionName}`,
    `   Código: ${ticket.ticketCode}`,
  ];

  if (ticket.purchasedAt) {
    lines.push(`   Compra: ${formatDateTime(ticket.purchasedAt)}`);
  }

  if (ticket.paymentMethod || ticket.paymentProvider || ticket.paymentStatus) {
    lines.push(`   Pagamento: ${formatAdminTicketPaymentLabel(ticket)}`);
  }

  if (ticket.totalAmountCents != null) {
    const totalFeeText =
      ticket.totalFeeCents && ticket.totalFeeCents > 0
        ? ` + ${formatCurrencyFromCents(ticket.totalFeeCents)} taxa`
        : "";

    lines.push(
      `   Total: ${formatCurrencyFromCents(ticket.totalAmountCents)}${totalFeeText}`,
    );
  }

  lines.push(`   Status: ${formatTicketStatus(ticket.status)}`);

  if (ticket.usedAt) {
    lines.push(`   Validado em: ${formatDateTime(ticket.usedAt)}`);
  }

  return lines.join("\n");
}

function formatAdminPendingReservation(
  reservation: AdminPendingReservationLookup,
  index?: number,
) {
  const prefix = typeof index === "number" ? `${index}. ` : "";
  const venue = reservation.venueName
    ? `${reservation.venueName} - ${reservation.city}/${reservation.state}`
    : `${reservation.city}/${reservation.state}`;
  const totalFeeText =
    reservation.totalFeeCents > 0
      ? ` + ${formatCurrencyFromCents(reservation.totalFeeCents)} taxa`
      : "";

  return [
    `${prefix}${reservation.eventTitle}`,
    `   Data: ${formatDateTime(reservation.startsAt)}`,
    `   Local: ${venue}`,
    `   Setor: ${reservation.sectionName}`,
    `   Quantidade: ${reservation.quantity}`,
    `   Valor: ${formatCurrencyFromCents(reservation.totalAmountCents)}${totalFeeText}`,
    `   Pedido: ${reservation.orderId}`,
    `   Reserva: ${reservation.reservationId}`,
    `   Status: ${formatOrderStatus(reservation.orderStatus)}`,
    `   Expira em: ${formatDateTime(reservation.expiresAt)}`,
  ].join("\n");
}

function formatAdminTicketValidations(validations: AdminTicketValidation[]) {
  if (validations.length === 0) {
    return "Nenhuma validação registrada.";
  }

  return validations
    .map((validation, index) => {
      const gate = validation.gateLabel ? ` - ${validation.gateLabel}` : "";
      const validator = validation.validatorIdentifier
        ? ` (${validation.validatorIdentifier})`
        : "";

      return `${index + 1}. ${formatDateTime(validation.createdAt)} - ${validation.result}${gate}${validator}`;
    })
    .join("\n");
}

async function buildAdminCourtesyEventSelect({
  baseContext,
  scope,
  state,
  title,
  context,
}: {
  baseContext: TicketConversationState;
  scope: AdminEventScope;
  state: TicketConversationState["state"];
  title: string;
  context: NonNullable<TicketConversationState["adminCourtesies"]>;
}) {
  const result = await listCourtesyEvents({
    ownerAdminUserId: scope.adminUserId,
    canSeeAll: scope.canSeeAllEvents,
  });

  if (!result.ok) {
    return {
      reply: TICKET_MESSAGES.adminGenericError,
      nextContext: withAdminCourtesiesContext(baseContext, "admin_courtesies_menu", {}),
    };
  }

  return {
    reply: buildCourtesyEventsReply(title, result.events),
    nextContext: withAdminCourtesiesContext(baseContext, state, {
      ...context,
      lastEvents: result.events.map((event) => ({
        option: event.option,
        eventId: event.eventId,
        title: event.title,
      })),
    }),
  };
}

async function buildAdminReportEventSelect({
  baseContext,
  scope,
  reportType,
}: {
  baseContext: TicketConversationState;
  scope: AdminEventScope;
  reportType: AdminReportType;
}) {
  const result = await listCourtesyEvents({
    ownerAdminUserId: scope.adminUserId,
    canSeeAll: scope.canSeeAllEvents,
  });

  if (!result.ok) {
    return {
      reply: TICKET_MESSAGES.adminGenericError,
      nextContext: withAdminReportsContext(baseContext, "admin_reports_menu", {}),
    };
  }

  return {
    reply: buildCourtesyEventsReply("RELATÓRIO - ESCOLHA O EVENTO", result.events),
    nextContext: withAdminReportsContext(baseContext, "admin_report_event_select", {
      reportType,
      lastEvents: result.events.map((event) => ({
        option: event.option,
        eventId: event.eventId,
        title: event.title,
      })),
    }),
  };
}

async function buildAdminGateEventSelect({
  baseContext,
  scope,
  title,
  nextState = "admin_gate_access_event_select",
  mode = "list",
}: {
  baseContext: TicketConversationState;
  scope: AdminEventScope;
  title: string;
  nextState?: "admin_gate_register_event_select" | "admin_gate_access_event_select";
  mode?: NonNullable<TicketConversationState["adminGate"]>["mode"];
}) {
  const result = await listCourtesyEvents({
    ownerAdminUserId: scope.adminUserId,
    canSeeAll: scope.canSeeAllEvents,
  });

  if (!result.ok) {
    return {
      reply: TICKET_MESSAGES.adminGenericError,
      nextContext: withAdminGateContext(baseContext, "admin_gate_menu", {}),
    };
  }

  return {
    reply: buildCourtesyEventsReply(title, result.events),
    nextContext: withAdminGateContext(
      baseContext,
      nextState,
      {
        mode,
        lastEvents: result.events.map((event) => ({
          option: event.option,
          eventId: event.eventId,
          title: event.title,
        })),
      },
    ),
  };
}

function normalizeEventImageUrl(value: string | null | undefined) {
  const trimmed = value?.trim();

  if (!trimmed || trimmed.length > 2000) {
    return null;
  }

  try {
    const url = new URL(trimmed);
    return url.protocol === "http:" || url.protocol === "https:" ? url.toString() : null;
  } catch {
    return null;
  }
}

function getInitialSectionsFromDraft(draft: Record<string, unknown>) {
  const rawSections = draft.initialSections;
  if (!Array.isArray(rawSections)) {
    return [];
  }

  return rawSections.flatMap((section) => {
    if (!section || typeof section !== "object") {
      return [];
    }

    const item = section as Record<string, unknown>;
    const ticketType = isTicketType(String(item.ticketType ?? ""))
      ? (String(item.ticketType) as AdminTicketType)
      : "full";
    return [
      {
        priceOptions: Array.isArray(item.priceOptions)
          ? item.priceOptions.flatMap((option) => {
              if (!option || typeof option !== "object") return [];
              const price = option as Record<string, unknown>;
              const optionTicketType = isTicketType(String(price.ticketType ?? ""))
                ? (String(price.ticketType) as AdminTicketType)
                : "full";
              return [
                {
                  ticketType: optionTicketType,
                  label: String(price.label ?? ""),
                  priceCents: typeof price.priceCents === "number" ? price.priceCents : 0,
                  feeCents: typeof price.feeCents === "number" ? price.feeCents : 0,
                },
              ];
            })
          : undefined,
        name: String(item.name ?? ""),
        slug: String(item.slug ?? ""),
        hasNumberedSeats: item.hasNumberedSeats === true,
        capacity: typeof item.capacity === "number" ? item.capacity : null,
        createInventorySeats: item.createInventorySeats === true,
        seatCodes: Array.isArray(item.seatCodes)
          ? item.seatCodes.map((seatCode) => String(seatCode)).filter(Boolean)
          : undefined,
        seatMapPositions:
          item.seatMapPositions && typeof item.seatMapPositions === "object"
            ? Object.fromEntries(
                Object.entries(item.seatMapPositions).flatMap(([seatCode, position]) => {
                  if (!position || typeof position !== "object") return [];
                  const point = position as Record<string, unknown>;
                  const x = Number(point.x);
                  const y = Number(point.y);

                  if (!Number.isFinite(x) || !Number.isFinite(y)) return [];

                  return [[seatCode, { x, y }]];
                }),
              )
            : undefined,
        createVisualMap: item.createVisualMap === true,
        ticketType,
        label: String(item.label ?? item.name ?? ""),
        priceCents: typeof item.priceCents === "number" ? item.priceCents : 0,
        feeCents: typeof item.feeCents === "number" ? item.feeCents : 0,
      },
    ];
  });
}

function renderInitialSectionsSummary(draft: Record<string, unknown>) {
  const sections = getInitialSectionsFromDraft(draft);
  if (!sections.length) {
    return ["Estrutura de entradas: não definida"];
  }

  return [
    `Estrutura: ${
      draft.entryModel === "single_general"
        ? "entrada única sem assento marcado"
        : draft.entryModel === "multiple_general"
          ? "vários tipos/setores sem assento marcado"
          : "setores com assentos marcados"
    }`,
    ...sections.map((section) =>
      section.priceOptions?.length
        ? [
            `- ${section.name}`,
            section.hasNumberedSeats ? "assento marcado" : "sem assento marcado",
            section.capacity ? `carga compartilhada ${section.capacity}` : "carga a definir",
            `ofertas ${section.priceOptions.length}`,
          ].join(" | ")
        : [
        `- ${section.name}`,
        section.hasNumberedSeats ? "assento marcado" : "sem assento marcado",
        section.hasNumberedSeats && section.seatCodes?.length
          ? `assentos ${section.seatCodes.length}`
          : section.capacity
            ? `capacidade ${section.capacity}`
            : "capacidade a definir",
        `valor ${formatCurrencyFromCents(section.priceCents)}`,
        `taxa ${formatCurrencyFromCents(section.feeCents)}`,
      ].join(" | "),
    ),
  ];
}

function parseInitialEntryDefinition(
  value: string,
  options: { numbered: boolean; requireCapacity?: boolean },
) {
  const requireCapacity = options.requireCapacity !== false;
  const moneyPattern = "(?:R\\$\\s*)?\\d+(?:[.,]\\d{2})?";
  const separatorPattern = "\\s*(?:\\||,|\\s+-\\s+|-|\\s+)\\s*";
  const match = requireCapacity
    ? value
        .trim()
        .match(new RegExp(`^(.+?)${separatorPattern}(\\d+)${separatorPattern}(${moneyPattern})(?:${separatorPattern}(${moneyPattern}))?$`, "i"))
    : value
        .trim()
        .match(new RegExp(`^(.+?)${separatorPattern}(${moneyPattern})(?:${separatorPattern}(${moneyPattern}))?$`, "i"));

  if (!match) return null;

  const [, nameRaw, secondRaw, thirdRaw, fourthRaw = "0"] = match;
  const name = nameRaw?.trim();
  const capacity = requireCapacity ? Number(secondRaw?.replace(/\D/g, "")) : null;
  const priceCents = parseMoneyToCents(requireCapacity ? thirdRaw ?? "" : secondRaw ?? "");
  const feeCents = parseMoneyToCents(requireCapacity ? fourthRaw : thirdRaw ?? "0");
  const slug = normalizeSlug(name ?? "");

  if (
    !name ||
    !slug ||
    (requireCapacity &&
      (!Number.isInteger(capacity) || !capacity || capacity <= 0 || capacity > 5000)) ||
    priceCents === null ||
    feeCents === null
  ) {
    return null;
  }

  return {
    name,
    slug,
    hasNumberedSeats: options.numbered,
    capacity,
    createInventorySeats: !options.numbered && capacity !== null,
    ticketType: "full" as const,
    label: name,
    priceCents,
    feeCents,
  };
}

function renderEntryItemPrompt() {
  return renderCreateEventPrompt("entryItem");
}

function parseInitialOfferDefinition(value: string) {
  const moneyPattern = "(?:R\\$\\s*)?\\d+(?:[.,]\\d{2})?";
  const separatorPattern = "\\s*(?:\\||,|\\s+-\\s+|-|\\s+)\\s*";
  const match = value
    .trim()
    .match(new RegExp(`^(.+?)${separatorPattern}(${moneyPattern})(?:${separatorPattern}(${moneyPattern}))?$`, "i"));
  if (!match) return null;

  const [, nameRaw, priceRaw, feeRaw = "0"] = match;
  const name = nameRaw?.trim();
  const priceCents = parseMoneyToCents(priceRaw ?? "");
  const feeCents = parseMoneyToCents(feeRaw);

  if (!name || priceCents === null || feeCents === null) return null;
  const normalizedName = normalizeAdminText(name);
  const ticketType: AdminTicketType =
    /\b(meia|estudante|senior|sênior|idoso|pcd|professor)\b/.test(normalizedName)
      ? "half"
      : /\b(cortesia|gratis|grátis|gratuito|free)\b/.test(normalizedName)
        ? "free"
        : /\b(promocional|promo)\b/.test(normalizedName)
          ? "promotional"
          : "full";

  return {
    ticketType,
    label: name,
    priceCents,
    feeCents,
  };
}

function parseCreateEventSessionQuantities(value: string) {
  const normalized = normalizeAdminText(value);
  const extractBefore = (word: string) => {
    const match = normalized.match(new RegExp(`(\\d+)\\s*${word}`));
    return match ? Number(match[1]) : null;
  };
  const numbers = normalized.match(/\d+/g)?.map(Number) ?? [];

  const datesCount =
    extractBefore("data") ??
    extractBefore("datas") ??
    (normalized.includes("data") && numbers.length > 1 ? numbers[numbers.length - 1] : null);
  const sessionsPerDate =
    extractBefore("sessao") ??
    extractBefore("sessoes") ??
    extractBefore("sess") ??
    null;

  if (datesCount) {
    return {
      datesCount,
      sessionsPerDate: sessionsPerDate ?? null,
    };
  }

  return {
    datesCount: numbers[0] ?? null,
    sessionsPerDate,
  };
}

function getPreviousCreateEventField(draft: Record<string, unknown>) {
  const field = String(draft.field ?? "title");
  const previousByField: Record<string, string | null> = {
    title: null,
    artistName: "title",
    city: "artistName",
    state: "city",
    venueName: "state",
    imageUrl: "venueName",
    dateCount: "imageUrl",
    sessionsPerDate: "dateCount",
    sessionItem: "sessionsPerDate",
    entryModel: "sessionItem",
    singleEntryDetails: "entryModel",
    entryCapacityMode: "entryModel",
    sharedEntryCapacity: "entryCapacityMode",
    entryCount: "entryCapacityMode",
    entryItem: "entryCount",
    entrySeatItem: "entryItem",
    entrySeatMapVisual: "entrySeatItem",
    entryOfferItem: "entryCount",
    status: "entryModel",
  };

  return previousByField[field] ?? null;
}

function stepBackCreateEventDraft(draft: Record<string, unknown>) {
  const currentField = String(draft.field ?? "title");
  const nextDraft = { ...draft };

  if (currentField === "entryItem") {
    const sections = getInitialSectionsFromDraft(nextDraft);
    if (sections.length > 0) {
      nextDraft.initialSections = sections.slice(0, -1);
      nextDraft.currentEntryIndex = sections.length;
      nextDraft.field = "entryItem";
      return nextDraft;
    }
  }

  if (currentField === "entrySeatItem") {
    delete nextDraft.pendingNumberedSection;
    nextDraft.field = "entryItem";
    return nextDraft;
  }

  if (currentField === "entrySeatMapVisual") {
    delete nextDraft.pendingNumberedSection;
    nextDraft.field = "entrySeatItem";
    return nextDraft;
  }

  if (currentField === "entryOfferItem") {
    const offers = getDraftArray<{
      ticketType: AdminTicketType;
      label: string;
      priceCents: number;
      feeCents: number;
    }>(nextDraft, "sharedPriceOptions");
    if (offers.length > 0) {
      nextDraft.sharedPriceOptions = offers.slice(0, -1);
      nextDraft.currentEntryIndex = offers.length;
      nextDraft.field = "entryOfferItem";
      return nextDraft;
    }
  }

  if (currentField === "sessionItem") {
    const sessionsStartsAt = getDraftArray<string>(nextDraft, "sessionsStartsAt");
    if (sessionsStartsAt.length > 0) {
      nextDraft.sessionsStartsAt = sessionsStartsAt.slice(0, -1);
      nextDraft.currentSessionIndex = sessionsStartsAt.length;
      nextDraft.field = "sessionItem";
      return nextDraft;
    }
  }

  const previousField = getPreviousCreateEventField(nextDraft);
  if (!previousField) {
    return null;
  }

  nextDraft.field = previousField;

  if (previousField === "entryModel") {
    delete nextDraft.initialSections;
    delete nextDraft.expectedEntryCount;
    delete nextDraft.currentEntryIndex;
  }

  if (previousField === "dateCount") {
    delete nextDraft.sessionsStartsAt;
    delete nextDraft.currentSessionIndex;
    delete nextDraft.expectedSessionCount;
    delete nextDraft.expectedDateCount;
    delete nextDraft.sessionsPerDate;
  }

  if (previousField === "sessionsPerDate") {
    delete nextDraft.sessionsStartsAt;
    delete nextDraft.currentSessionIndex;
    delete nextDraft.expectedSessionCount;
    delete nextDraft.sessionsPerDate;
  }

  if (previousField === "entryCount") {
    delete nextDraft.initialSections;
    delete nextDraft.sharedPriceOptions;
    delete nextDraft.currentEntryIndex;
  }

  return nextDraft;
}

function getCreateEventConfirmBackDraft(draft: Record<string, unknown>) {
  const nextDraft = { ...draft };
  const sections = getInitialSectionsFromDraft(nextDraft);

  if (nextDraft.entryModel === "single_general") {
    delete nextDraft.initialSections;
    nextDraft.field = "singleEntryDetails";
    return nextDraft;
  }

  if (sections.length > 0) {
    nextDraft.initialSections = sections.slice(0, -1);
    nextDraft.currentEntryIndex = sections.length;
    nextDraft.field = "entryItem";
    return nextDraft;
  }

  nextDraft.field = "entryCount";
  return nextDraft;
}

function renderCreateEventSeatPrompt(sectionName?: string) {
  return [
    `Envie os assentos do setor${sectionName ? ` ${sectionName}` : ""}.`,
    "",
    "Use uma fileira por linha.",
    "Ex:",
    "A 10 assentos 1 a 10",
    "B 13 assentos de 13 a 1 - 1X esquerda",
    "C: __ 1 2 3 4 5 6 7 8 9 10 11 12 13",
    "D: 1 2 _ 4 5 6 7 8 9 10 11 12 13 14 15",
  ].join("\n");
}

function renderCreateEventSeatMapVisualPrompt(sectionName?: string) {
  return [
    `Deseja criar o mapa visual do setor${sectionName ? ` ${sectionName}` : ""}?`,
    "",
    "> 1. Sim, criar mapa visual automaticamente",
    "> 2. Não, apenas cadastrar os assentos",
  ].join("\n");
}

function renderAdminEventListReply({
  events,
  hasMore,
  title = "*EVENTOS ENCONTRADOS:*",
  actionLabel = "detalhes",
}: {
  events: Array<{
    option: number;
    title: string;
    city: string;
    state: string;
    status: string;
    sessionsCount: number;
    nextSessionStartsAt: string | null;
  }>;
  hasMore: boolean;
  title?: string;
  actionLabel?: string;
}) {
  const navigationLines = [
    "Responda com o",
    `> Digite o número do evento para ${actionLabel}`,
    '> Digite "Mais" para ver mais eventos',
  ];

  if (!events.length) {
    return withAdminNavigationHint([
      title,
      "",
      "Nenhum evento encontrado.",
      "",
      ...navigationLines,
    ].join("\n"));
  }

  void hasMore;
  const eventBlocks = events.map((event) =>
    [
      `${event.option}. ${event.title}`,
      `   ${event.city}/${event.state}`,
      `   Status: ${event.status}`,
      `   Sessões: ${event.sessionsCount}`,
      `   Próxima: ${
        event.nextSessionStartsAt
          ? formatDateTime(event.nextSessionStartsAt)
          : "sem sessão futura"
      }`,
    ].join("\n"),
  );

  return withAdminNavigationHint([
    title,
    "",
    eventBlocks.join("\n---\n"),
    "",
    ...navigationLines,
  ].join("\n"));
}

function renderAdminEventDetails(event: AdminEventDetails) {
  return withAdminNavigationHint([
    `Evento: ${event.title}`,
    `ID curto: ${event.eventId.slice(0, 8)}`,
    `Status: ${event.status}`,
    `Foto: ${event.imageUrl ? "cadastrada" : "ausente"}`,
    `Cidade: ${event.city}/${event.state}`,
    `Local: ${event.venueName ?? "não definido"}`,
    "",
    "Sessões:",
    ...(event.sessions.length
      ? event.sessions.map(
          (session, index) =>
            `${index + 1}. ${formatDateTime(session.startsAt)} - ${session.status}`,
        )
      : ["nenhuma sessão cadastrada"]),
    "",
    "Setores:",
    ...(event.sections.length
      ? event.sections.map((section) => `- ${section.name}`)
      : ["nenhum setor cadastrado"]),
    "",
    "*OPÇÕES:*",
    "> 1. Editar evento",
    "> 2. Setores e assentos",
    "> 3. Ativar/Pausar evento",
    "> 4. Voltar",
    "> 5. Sair",
  ].join("\n"));
}

function getAdminEventStatusActions(status: AdminEventStatus) {
  if (status === "published") {
    return [
      {
        option: 1,
        status: "draft" as const,
        label: "Pausar evento",
      },
      { option: 2, status: "cancelled" as const, label: "Cancelar evento" },
    ];
  }

  if (status === "draft") {
    return [
      { option: 1, status: "published" as const, label: "Ativar evento" },
      { option: 2, status: "cancelled" as const, label: "Cancelar evento" },
    ];
  }

  return [];
}

function renderAdminEventStatusMenu(event: AdminEventDetails) {
  const actions = getAdminEventStatusActions(event.status);

  return withAdminNavigationHint([
    `*ATIVAR/PAUSAR EVENTO: ${event.title.toUpperCase()}*`,
    `Status atual: ${event.status}`,
    "",
    ...(actions.length
      ? actions.map((action) => `> ${action.option}. ${action.label}`)
      : [
          event.status === "cancelled"
            ? "Este evento está cancelado. Reativação não está disponível por aqui."
            : "Este evento está finalizado. Alteração de publicação não está disponível por aqui.",
        ]),
    `> ${actions.length + 1}. Voltar`,
  ].join("\n"));
}

function renderCreateEventPrompt(field?: string) {
  const prompts: Record<string, string> = {
    title: "Qual o nome/título do evento?",
    artistName: "Qual o artista ou atração principal?",
    city: "Em qual cidade?",
    state: "Qual UF? Ex: SP",
    venueName:
      "Qual o nome do local/teatro/arena?\n\nEscreva o nome ou responda 1 para ver os locais cadastrados.",
    imageUrl:
      "Envie a foto do evento agora ou cole uma URL pública https://...\nPara salvar como rascunho sem foto, responda PULAR. Para publicar, a foto é obrigatória.",
    dateCount:
      "Quantas datas esse evento terá?\n\nSe quiser, responda junto com as sessões por data. Ex: 1 sessão, 3 datas",
    sessionsPerDate: "Quantas sessões por data esse evento terá?",
    sessionItem: "Qual a data e horário da sessão? Ex: 10/06/2026 22:00",
    status:
      "Para finalizar, escolha como deseja salvar o evento.\n\n> 1. Deixar como rascunho\n> 2. Publicar",
    entryModel:
      "Como serão as entradas/lugares?\n1. Entrada única sem assento marcado\n2. Vários setores/tipos sem assento marcado\n3. Setores com assentos marcados",
    singleEntryDetails:
      "Envie a entrada com capacidade e valor.\nFormato: nome capacidade valor taxa opcional\nEx: Entrada Geral 500 120,00 12,00",
    entryCapacityMode:
      "Como a carga de ingressos será controlada?\n\n> 1. Carga total compartilhada entre todos os tipos de compra\n> 2. Carga separada para cada tipo/setor",
    sharedEntryCapacity:
      "Qual a carga total compartilhada de ingressos?\nEx: 200",
    entryCount: "Quantos tipos/setores de ingresso serão cadastrados agora?",
    entryItem:
      "Envie o tipo/setor com capacidade e valor.\nFormato: nome capacidade valor taxa opcional\nEx: Pista 500 120,00 12,00",
    entrySeatItem: renderCreateEventSeatPrompt(),
    entryOfferItem:
      "Envie o tipo de compra/oferta com valor.\nFormato: nome valor taxa opcional\nEx: Meia entrada professor 60,00 0",
  };

  return withAdminNavigationHint(prompts[field ?? "title"]);
}

function renderCreateEventSummary(draft: Record<string, unknown>) {
  const sessionsStartsAt = getDraftArray<string>(draft, "sessionsStartsAt");

  return [
    "Confirme o novo evento:",
    "",
    `Título: ${draft.title}`,
    `Artista: ${draft.artistName}`,
    `Cidade/UF: ${draft.city}/${draft.state}`,
    `Local: ${draft.venueName}`,
    `Foto: ${draft.imageUrl ? "cadastrada" : "ausente"}`,
    "Sessões:",
    ...(sessionsStartsAt.length
      ? sessionsStartsAt.map(
          (startsAt, index) => `${index + 1}. ${formatDateTime(startsAt)}`,
        )
      : ["nenhuma sessão definida"]),
    `Publicação: ${draft.status === "published" ? "publicar" : "rascunho"}`,
    "",
    ...renderInitialSectionsSummary(draft),
    "",
    "Responda CONFIRMAR para criar ou CANCELAR para abandonar.",
  ].join("\n");
}

function renderEditEventSummary(draft: Record<string, unknown>) {
  const field = String(draft.field ?? "");
  const labelByField: Record<string, string> = {
    title: "Título",
    artist_name: "Artista",
    city: "Cidade",
    state: "Estado",
    starts_at: "Data/hora",
    venue: "Local",
    image_url: "Foto do evento",
    description: "Informações gerais",
    status: "Status",
  };
  const value =
    field === "venue"
        ? draft.venueName
        : field === "image_url"
          ? draft.imageUrl
          : field === "starts_at"
            ? draft.startsAt
          : field === "status"
            ? draft.status
            : field === "title"
              ? draft.title
              : field === "artist_name"
                ? draft.artist_name
                : field === "city"
                  ? draft.city
                  : field === "state"
                    ? draft.state
                    : field === "description"
                      ? draft.description
                      : "";

  return [
    "Confirmar alteração do evento?",
    "",
    `Campo: ${labelByField[field] ?? field}`,
    `Novo valor: ${value}`,
    "",
    field === "status" && draft.status === "cancelled"
      ? "Digite CANCELAR EVENTO para confirmar o cancelamento. Não haverá exclusão física nem estorno automático."
      : "Responda CONFIRMAR ou CANCELAR.",
  ].join("\n");
}

function renderAdminEventEditMenu(eventTitle?: string) {
  return withAdminNavigationHint([
    eventTitle
      ? `*EDITAR MEU EVENTO: ${eventTitle.toUpperCase()}*`
      : "*EDITAR MEU EVENTO*",
    "",
    "> 1. Editar nome",
    "> 2. Editar artista",
    "> 3. Editar cidade",
    "> 4. Editar estado",
    "> 5. Editar local",
    "> 6. Editar foto",
    "> 7. Editar data/hora",
    "> 8. Editar setores/lugares",
    "> 9. Editar carga",
    "> 10. Editar valores",
    "> 11. Editar informações gerais",
    "> 12. Voltar",
    "> 13. Sair",
  ].join("\n"));
}

function renderAdminEventPublishSelectReply(eventTitle?: string) {
  return withAdminNavigationHint([
    eventTitle
      ? `*PUBLICAR EVENTO: ${eventTitle.toUpperCase()}*`
      : "*PUBLICAR EVENTO*",
    "",
    "A edição foi salva.",
    "",
    "> 1. Deixar como rascunho",
    "> 2. Publicar evento",
    "> 3. Voltar",
    "> 4. Sair",
    "",
    "Responda com o número da opção.",
  ].join("\n"));
}

function getAdminEventsContext(baseContext: Partial<TicketConversationState>) {
  return baseContext.adminEvents ?? {};
}

function getAdminEventStatusFromListFilter(
  filter?: NonNullable<TicketConversationState["adminEvents"]>["statusFilter"],
) {
  if (filter === "active") return "published" as const;
  if (filter === "paused") return "draft" as const;
  if (filter === "cancelled") return "cancelled" as const;
  return "all" as const;
}

function getAdminEventListOptionsForMode(mode?: string) {
  const optionsByMode: Record<string, { title: string; actionLabel: string }> = {
    edit: {
      title: "*ESCOLHA O EVENTO PARA EDITAR*",
      actionLabel: "editar",
    },
    status: {
      title: "*ESCOLHA O EVENTO PARA ATIVAR/PAUSAR*",
      actionLabel: "ativar/pausar",
    },
    duplicate: {
      title: "*ESCOLHA O EVENTO PARA DUPLICAR*",
      actionLabel: "duplicar",
    },
    sections: {
      title: "*ESCOLHA O EVENTO PARA GERENCIAR SETORES E ASSENTOS*",
      actionLabel: "gerenciar setores e assentos",
    },
  };

  return mode ? optionsByMode[mode] : undefined;
}

function canAdminAccessEvent(
  event: Pick<AdminEventDetails, "createdByAdminUserId">,
  scope: AdminEventScope,
) {
  return (
    scope.canSeeAllEvents ||
    !event.createdByAdminUserId ||
    event.createdByAdminUserId === scope.adminUserId
  );
}

async function getScopedAdminEventDetails(
  eventId: string,
  scope: AdminEventScope,
) {
  const details = await getAdminEventDetails(eventId);

  if (!details.ok || !canAdminAccessEvent(details.event, scope)) {
    return { ok: false as const, reason: "not_found" as const };
  }

  return details;
}

function withAdminEventsContext(
  baseContext: TicketConversationState,
  state: TicketConversationState["state"],
  adminEvents: NonNullable<TicketConversationState["adminEvents"]>,
) {
  return {
    ...baseContext,
    step: state,
    state,
    adminEvents,
  };
}

function withAdminCourtesiesContext(
  baseContext: TicketConversationState,
  state: TicketConversationState["state"],
  adminCourtesies: NonNullable<TicketConversationState["adminCourtesies"]>,
) {
  return {
    ...baseContext,
    step: state,
    state,
    adminCourtesies,
  };
}

function getAdminCourtesiesContext(baseContext: TicketConversationState) {
  return baseContext.adminCourtesies ?? {};
}

async function buildAdminEventsListContext(
  baseContext: TicketConversationState,
  scope: AdminEventScope,
  page: number,
  search?: string | null,
  statusFilter?: NonNullable<TicketConversationState["adminEvents"]>["statusFilter"],
  listOptions?: {
    title?: string;
    actionLabel?: string;
  },
) {
  const resolvedListOptions =
    listOptions ?? getAdminEventListOptionsForMode(baseContext.adminEvents?.mode);
  const result = await listAdminEvents({
    page,
    search,
    status: getAdminEventStatusFromListFilter(statusFilter),
    ownerAdminUserId: scope.adminUserId,
    canSeeAll: scope.canSeeAllEvents,
  });

  if (!result.ok) {
    return {
      reply: TICKET_MESSAGES.adminGenericError,
      nextContext: withAdminEventsContext(baseContext, "admin_events_menu", {}),
    };
  }

  const events = result.events.map((event, index) => ({
    ...event,
    option: index + 1,
  }));

  return {
    reply: renderAdminEventListReply({
      events,
      hasMore: result.hasMore,
      title: resolvedListOptions?.title,
      actionLabel: resolvedListOptions?.actionLabel,
    }),
    nextContext: withAdminEventsContext(baseContext, "admin_events_list", {
      ...getAdminEventsContext(baseContext),
      page: result.page,
      hasMore: result.hasMore,
      statusFilter,
      ...(resolvedListOptions?.title
        ? { listTitle: resolvedListOptions.title }
        : {}),
      ...(resolvedListOptions?.actionLabel
        ? { listActionLabel: resolvedListOptions.actionLabel }
        : {}),
      lastEvents: events.map((event) => ({
        option: event.option,
        eventId: event.eventId,
        title: event.title,
      })),
    }),
  };
}

function getSelectedAdminEventId(
  text: string,
  adminEvents: NonNullable<TicketConversationState["adminEvents"]>,
) {
  const trimmed = text.trim();
  const option = trimmed.match(/^\d+$/) ? Number(trimmed) : null;

  if (!option) {
    if (
      /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
        trimmed,
      )
    ) {
      return trimmed;
    }

    const normalized = trimmed.toLocaleLowerCase("pt-BR");
    const byName =
      adminEvents.lastEvents?.find(
        (event) => event.title.toLocaleLowerCase("pt-BR") === normalized,
      ) ??
      adminEvents.lastEvents?.find((event) =>
        event.title.toLocaleLowerCase("pt-BR").includes(normalized),
      );

    return byName?.eventId ?? adminEvents.selectedEventId ?? null;
  }

  return (
    adminEvents.lastEvents?.find((event) => event.option === option)?.eventId ??
    null
  );
}

async function showAdminEventDetails(
  baseContext: TicketConversationState,
  scope: AdminEventScope,
  eventId: string,
  prefix?: string,
) {
  const details = await getScopedAdminEventDetails(eventId, scope);

  if (!details.ok) {
    return {
      reply: "Não encontrei esse evento.",
      nextContext: withAdminEventsContext(baseContext, "admin_events_menu", {}),
    };
  }

  return {
    reply: prefix ? `${prefix}\n\n${renderAdminEventDetails(details.event)}` : renderAdminEventDetails(details.event),
    nextContext: withAdminEventsContext(baseContext, "admin_event_detail", {
      selectedEventId: eventId,
    }),
  };
}

async function adminEventHasPurchasableInventory(event: AdminEventDetails) {
  for (const session of event.sessions) {
    const sections = await listAvailableSections(session.sessionId, {
      venueId: session.venueId,
    });

    if (sections.length > 0) {
      return true;
    }
  }

  return false;
}

async function handleAdminEventsFlow({
  baseContext,
  scope,
  text,
  mediaUrl,
}: {
  baseContext: TicketConversationState;
  scope: AdminEventScope;
  text: string;
  mediaUrl?: string | null;
}): Promise<RouteTicketMessageOutput | null> {
  const adminEvents = getAdminEventsContext(baseContext);
  const normalized = normalizeAdminText(text);
  const numericOption = text.trim().match(/^\d+$/) ? Number(text.trim()) : null;

  if (baseContext.state === "admin_events_menu" && normalized === "voltar") {
    return {
      reply: formatAdminMenu(baseContext.admin?.role as AdminRole),
      nextContext: {
        ...baseContext,
        step: "admin_menu",
        state: "admin_menu",
        adminEvents: undefined,
      },
    };
  }

  if (baseContext.state === "admin_events_menu" && numericOption === 6) {
    return {
      reply: "__ADMIN_BACK__",
      nextContext: withAdminEventsContext(baseContext, "admin_events_menu", adminEvents),
    };
  }

  if (baseContext.state === "admin_events_menu" && numericOption === 7) {
    return {
      reply: "__ADMIN_EXIT__",
      nextContext: withAdminEventsContext(baseContext, "admin_events_menu", adminEvents),
    };
  }

  if (normalized === "menu") {
    return {
      reply: renderAdminEventsMenu(),
      nextContext: withAdminEventsContext(baseContext, "admin_events_menu", adminEvents),
    };
  }

  if (baseContext.state === "admin_events_menu") {
    if (numericOption === 1) {
      return {
        reply: renderAdminEventListFilterMenu(),
        nextContext: withAdminEventsContext(baseContext, "admin_events_list", {
          mode: "select_list_filter",
        }),
      };
    }

    if (numericOption === 2) {
      return {
        reply: renderCreateEventPrompt("title"),
        nextContext: withAdminEventsContext(baseContext, "admin_event_create_collecting", {
          draft: { field: "title" },
        }),
      };
    }

    if ([3, 4, 5].includes(numericOption ?? 0)) {
      const modeByOption: Record<number, string> = {
        3: "edit",
        4: "status",
        5: "duplicate",
      };
      const mode = modeByOption[numericOption ?? 0];
      const list = await buildAdminEventsListContext(
        withAdminEventsContext(baseContext, "admin_events_menu", {
          ...adminEvents,
          mode,
        }),
        scope,
        0,
        null,
        undefined,
      );

      return {
        reply: list.reply,
        nextContext: {
          ...list.nextContext,
          state: "admin_events_list",
          step: "admin_events_list",
          adminEvents: {
            ...list.nextContext.adminEvents,
            mode,
          },
        },
      };
    }

    return {
      reply: renderAdminEventsMenu(),
      nextContext: withAdminEventsContext(baseContext, "admin_events_menu", adminEvents),
    };
  }

  if (baseContext.state === "admin_events_list") {
    if (isBackText(text) || isAbortText(text)) {
      return {
        reply: renderAdminEventsMenu(),
        nextContext: withAdminEventsContext(baseContext, "admin_events_menu", {}),
      };
    }

    if (adminEvents.mode === "select_list_filter") {
      const filterByOption: Record<
        number,
        NonNullable<TicketConversationState["adminEvents"]>["statusFilter"]
      > = {
        1: "active",
        2: "paused",
        3: "cancelled",
        4: "all",
      };

      if (numericOption === 5) {
        return {
          reply: renderAdminEventsMenu(),
          nextContext: withAdminEventsContext(baseContext, "admin_events_menu", {}),
        };
      }

      if (numericOption === 6) {
        return {
          reply: "__ADMIN_EXIT__",
          nextContext: withAdminEventsContext(baseContext, "admin_events_menu", {}),
        };
      }

      const statusFilter = numericOption ? filterByOption[numericOption] : undefined;

      if (!statusFilter) {
        return {
          reply: renderAdminEventListFilterMenu(),
          nextContext: withAdminEventsContext(baseContext, "admin_events_list", {
            mode: "select_list_filter",
          }),
        };
      }

      const list = await buildAdminEventsListContext(
        baseContext,
        scope,
        0,
        null,
        statusFilter,
      );
      const adminEventsAfterFilter = { ...(list.nextContext.adminEvents ?? {}) };
      delete adminEventsAfterFilter.mode;

      return {
        ...list,
        nextContext: {
          ...list.nextContext,
          adminEvents: adminEventsAfterFilter,
        },
      };
    }

    if (normalized === "mais") {
      if (adminEvents.hasMore === false) {
        return {
          reply: [
            adminEvents.listTitle ?? "*EVENTOS ENCONTRADOS:*",
            "",
            "Não há mais eventos para mostrar.",
            "",
            "Responda com o",
            `> Digite o número do evento para ${adminEvents.listActionLabel ?? "detalhes"}`,
            '> Digite "Mais" para ver mais eventos',
          ].join("\n"),
          nextContext: withAdminEventsContext(baseContext, "admin_events_list", adminEvents),
        };
      }

      return buildAdminEventsListContext(
        baseContext,
        scope,
        (adminEvents.page ?? 0) + 1,
        null,
        adminEvents.statusFilter,
        {
          title: adminEvents.listTitle,
          actionLabel: adminEvents.listActionLabel,
        },
      );
    }

    const eventId = getSelectedAdminEventId(text, adminEvents);

    if (!eventId) {
      if (numericOption) {
        return {
          reply: [
            "Não encontrei essa opção na lista atual.",
            "",
            "Digite o número do evento que aparece na lista, \"Mais\" para ver mais eventos ou \"Voltar\".",
          ].join("\n"),
          nextContext: withAdminEventsContext(baseContext, "admin_events_list", adminEvents),
        };
      }

      return buildAdminEventsListContext(
        baseContext,
        scope,
        0,
        text,
        adminEvents.statusFilter,
      );
    }

    if (adminEvents.mode === "edit") {
      const details = await getScopedAdminEventDetails(eventId, scope);

      if (!details.ok) {
        return {
          reply: "Não encontrei esse evento.",
          nextContext: withAdminEventsContext(baseContext, "admin_events_menu", {}),
        };
      }

      return {
        reply: renderAdminEventEditMenu(details.event.title),
        nextContext: withAdminEventsContext(baseContext, "admin_event_edit_menu", {
          selectedEventId: eventId,
        }),
      };
    }

    if (adminEvents.mode === "status") {
      const details = await getScopedAdminEventDetails(eventId, scope);

      if (!details.ok) {
        return {
          reply: "Não encontrei esse evento.",
          nextContext: withAdminEventsContext(baseContext, "admin_events_menu", {}),
        };
      }

      return {
        reply: renderAdminEventStatusMenu(details.event),
        nextContext: withAdminEventsContext(baseContext, "admin_event_status_select", {
          selectedEventId: eventId,
        }),
      };
    }

    if (adminEvents.mode === "duplicate") {
      const details = await getScopedAdminEventDetails(eventId, scope);

      if (!details.ok) {
        return {
          reply: "Não encontrei esse evento.",
          nextContext: withAdminEventsContext(baseContext, "admin_events_menu", {}),
        };
      }

      const duplicateResult = await duplicateAdminEvent({
        eventId,
        createdByAdminUserId: scope.adminUserId,
        createdByAdminPhone: scope.adminPhone,
      });

      if (!duplicateResult.ok) {
        return {
          reply: "Não consegui duplicar esse evento agora.",
          nextContext: withAdminEventsContext(baseContext, "admin_events_menu", {}),
        };
      }

      const duplicatedDetails = await getScopedAdminEventDetails(
        duplicateResult.eventId,
        scope,
      );

      return {
        reply: [
          "*EVENTO DUPLICADO*",
          `> Origem: ${details.event.title}`,
          duplicatedDetails.ok
            ? `> Novo evento: ${duplicatedDetails.event.title}`
            : "> Novo evento criado como rascunho",
          `> Sessões copiadas: ${duplicateResult.sessionsCount}`,
          `> Setores copiados: ${duplicateResult.createdSectionsCount}`,
          `> Assentos/unidades copiados: ${duplicateResult.createdSeatsCount}`,
          `> Valores copiados: ${duplicateResult.createdPricesCount}`,
          "",
          renderAdminEventEditMenu(
            duplicatedDetails.ok ? duplicatedDetails.event.title : undefined,
          ),
        ].join("\n"),
        nextContext: withAdminEventsContext(baseContext, "admin_event_edit_menu", {
          selectedEventId: duplicateResult.eventId,
        }),
      };
    }

    if (adminEvents.mode === "sections") {
      return showAdminEventSectionsMenu(baseContext, scope, eventId);
    }

    return showAdminEventDetails(baseContext, scope, eventId);
  }

  if (baseContext.state === "admin_event_detail") {
    const eventId = adminEvents.selectedEventId;

    if (!eventId) {
      return {
        reply: renderAdminEventsMenu(),
        nextContext: withAdminEventsContext(baseContext, "admin_events_menu", {}),
      };
    }

    if (numericOption === 1) {
      const details = await getScopedAdminEventDetails(eventId, scope);

      return {
        reply: renderAdminEventEditMenu(details.ok ? details.event.title : undefined),
        nextContext: withAdminEventsContext(baseContext, "admin_event_edit_menu", {
          selectedEventId: eventId,
        }),
      };
    }

    if (numericOption === 2) return showAdminEventSectionsMenu(baseContext, scope, eventId);
    if (numericOption === 3) {
      const details = await getScopedAdminEventDetails(eventId, scope);

      if (!details.ok) {
        return {
          reply: "Não encontrei esse evento.",
          nextContext: withAdminEventsContext(baseContext, "admin_events_menu", {}),
        };
      }

      return {
        reply: renderAdminEventStatusMenu(details.event),
        nextContext: withAdminEventsContext(baseContext, "admin_event_status_select", {
          selectedEventId: eventId,
        }),
      };
    }

    if (numericOption === 4) {
      return buildAdminEventsListContext(
        baseContext,
        scope,
        adminEvents.page ?? 0,
        null,
        adminEvents.statusFilter,
      );
    }

    if (isBackText(text) || isAbortText(text)) {
      return buildAdminEventsListContext(
        baseContext,
        scope,
        adminEvents.page ?? 0,
        null,
        adminEvents.statusFilter,
      );
    }
  }

  if (baseContext.state === "admin_event_create_collecting") {
    const draft = { ...(adminEvents.draft ?? {}) };
    const field = String(draft.field ?? "title");

    if (isAbortText(text)) {
      return {
        reply: "Criação de evento cancelada.",
        nextContext: withAdminEventsContext(baseContext, "admin_events_menu", {}),
      };
    }

    if (isBackText(text)) {
      const previousDraft = stepBackCreateEventDraft(draft);

      if (!previousDraft) {
        return {
          reply: renderAdminEventsMenu(),
          nextContext: withAdminEventsContext(baseContext, "admin_events_menu", {}),
        };
      }

      return {
        reply: renderCreateEventPrompt(String(previousDraft.field ?? "title")),
        nextContext: withAdminEventsContext(baseContext, "admin_event_create_collecting", {
          draft: previousDraft,
        }),
      };
    }

    const nextFieldByField: Record<string, string | null> = {
      title: "artistName",
      artistName: "city",
      city: "state",
      state: "venueName",
      venueName: "imageUrl",
      imageUrl: "dateCount",
      dateCount: null,
      sessionsPerDate: null,
      sessionItem: null,
      status: null,
      entryModel: null,
      singleEntryDetails: null,
      entryCapacityMode: null,
      sharedEntryCapacity: null,
      entryCount: null,
      entryItem: null,
      entrySeatItem: null,
      entrySeatMapVisual: null,
      entryOfferItem: null,
    };

    if (
      ["entryCount", "entryItem", "singleEntryDetails"].includes(field) &&
      !draft.entryCapacityModeConfirmed
    ) {
      draft.field = "entryCapacityMode";

      return {
        reply: renderCreateEventPrompt("entryCapacityMode"),
        nextContext: withAdminEventsContext(baseContext, "admin_event_create_collecting", {
          draft,
        }),
      };
    }

    if (field === "state") {
      const state = text.trim().toUpperCase();
      if (!/^[A-Z]{2}$/.test(state)) {
        return {
          reply: "UF inválida. Envie com 2 letras. Ex: SP",
          nextContext: withAdminEventsContext(baseContext, "admin_event_create_collecting", {
            draft,
          }),
        };
      }
      draft[field] = state;
    } else if (field === "venueName") {
      const venueOption = text.trim().match(/^\d+$/) ? Number(text.trim()) : null;
      const lastVenues = getDraftArray<{
        option: number;
        name: string;
        city: string;
        state: string;
      }>(draft, "lastVenues");
      const selectedVenue = lastVenues.find((venue) => venue.option === venueOption);

      if (selectedVenue) {
        draft[field] = selectedVenue.name;
      } else if (venueOption === 1) {
        const venuesResult = await listAdminVenues({
          city: String(draft.city ?? ""),
          state: String(draft.state ?? ""),
          limit: 10,
        });

        if (!venuesResult.ok) {
          return {
            reply: "Não consegui listar os locais cadastrados agora. Escreva o nome do local.",
            nextContext: withAdminEventsContext(baseContext, "admin_event_create_collecting", {
              draft,
            }),
          };
        }

        return {
          reply: [
            "Locais cadastrados:",
            "",
            ...(venuesResult.venues.length
              ? venuesResult.venues.map(
                  (venue) =>
                    `${venue.option}. ${venue.name} - ${venue.city}/${venue.state}`,
                )
              : ["Nenhum local cadastrado para essa cidade/UF."]),
            "",
            "Responda com o número do local ou escreva o nome de um novo local.",
          ].join("\n"),
          nextContext: withAdminEventsContext(baseContext, "admin_event_create_collecting", {
            draft: {
              ...draft,
              lastVenues: venuesResult.venues,
            },
          }),
        };
      } else {
        const value = text.trim();
        if (!value) {
          return {
            reply: "Valor vazio. Envie o nome do local.",
            nextContext: withAdminEventsContext(baseContext, "admin_event_create_collecting", {
              draft,
            }),
          };
        }
        draft[field] = value;
      }
    } else if (field === "dateCount") {
      const quantities = parseCreateEventSessionQuantities(text);
      const datesCount = quantities.datesCount;
      const sessionsPerDate = quantities.sessionsPerDate;

      if (!Number.isInteger(datesCount) || !datesCount || datesCount < 1 || datesCount > 30) {
        return {
          reply: "Quantidade inválida. Envie o número de datas, de 1 a 30.",
          nextContext: withAdminEventsContext(baseContext, "admin_event_create_collecting", {
            draft,
          }),
        };
      }

      draft.expectedDateCount = datesCount;

      if (
        !Number.isInteger(sessionsPerDate) ||
        !sessionsPerDate ||
        sessionsPerDate < 1 ||
        sessionsPerDate > 10
      ) {
        draft.field = "sessionsPerDate";

        return {
          reply: renderCreateEventPrompt("sessionsPerDate"),
          nextContext: withAdminEventsContext(baseContext, "admin_event_create_collecting", {
            draft,
          }),
        };
      }

      const totalSessions = datesCount * sessionsPerDate;
      if (totalSessions > 60) {
        return {
          reply: "Quantidade muito alta. Crie até 60 sessões por evento.",
          nextContext: withAdminEventsContext(baseContext, "admin_event_create_collecting", {
            draft,
          }),
        };
      }

      draft.sessionsPerDate = sessionsPerDate;
      draft.expectedSessionCount = totalSessions;
      draft.currentSessionIndex = 1;
      draft.sessionsStartsAt = [];
      draft.field = "sessionItem";

      return {
        reply: [
          `Sessão/data 1 de ${totalSessions}.`,
          "",
          renderCreateEventPrompt("sessionItem"),
        ].join("\n"),
        nextContext: withAdminEventsContext(baseContext, "admin_event_create_collecting", {
          draft,
        }),
      };
    } else if (field === "sessionsPerDate") {
      const sessionsPerDate = Number(text.trim().match(/\d+/)?.[0] ?? "");
      const datesCount = Number(draft.expectedDateCount ?? 0);

      if (
        !Number.isInteger(sessionsPerDate) ||
        sessionsPerDate < 1 ||
        sessionsPerDate > 10 ||
        !Number.isInteger(datesCount) ||
        datesCount < 1
      ) {
        return {
          reply: "Quantidade inválida. Envie o número de sessões por data, de 1 a 10.",
          nextContext: withAdminEventsContext(baseContext, "admin_event_create_collecting", {
            draft,
          }),
        };
      }

      const totalSessions = datesCount * sessionsPerDate;
      if (totalSessions > 60) {
        return {
          reply: "Quantidade muito alta. Crie até 60 sessões por evento.",
          nextContext: withAdminEventsContext(baseContext, "admin_event_create_collecting", {
            draft,
          }),
        };
      }

      draft.sessionsPerDate = sessionsPerDate;
      draft.expectedSessionCount = totalSessions;
      draft.currentSessionIndex = 1;
      draft.sessionsStartsAt = [];
      draft.field = "sessionItem";

      return {
        reply: [
          `Sessão/data 1 de ${totalSessions}.`,
          "",
          renderCreateEventPrompt("sessionItem"),
        ].join("\n"),
        nextContext: withAdminEventsContext(baseContext, "admin_event_create_collecting", {
          draft,
        }),
      };
    } else if (field === "sessionItem") {
      const startsAt = parseBrazilianDateTime(text);
      if (!startsAt || new Date(startsAt).getTime() <= Date.now()) {
        return {
          reply: "Data inválida ou no passado. Envie no formato 10/06/2026 22:00.",
          nextContext: withAdminEventsContext(baseContext, "admin_event_create_collecting", {
            draft,
          }),
        };
      }

      const expectedCount = Number(draft.expectedSessionCount ?? 0);
      const currentIndex = Number(draft.currentSessionIndex ?? 1);
      const sessionsStartsAt = getDraftArray<string>(draft, "sessionsStartsAt");
      draft.sessionsStartsAt = [...sessionsStartsAt, startsAt];

      if (currentIndex < expectedCount) {
        draft.currentSessionIndex = currentIndex + 1;
        draft.field = "sessionItem";

        return {
          reply: [
            `Sessão cadastrada: ${formatDateTime(startsAt)}.`,
            "",
            `Sessão/data ${currentIndex + 1} de ${expectedCount}.`,
            "",
            renderCreateEventPrompt("sessionItem"),
          ].join("\n"),
          nextContext: withAdminEventsContext(baseContext, "admin_event_create_collecting", {
            draft,
          }),
        };
      }

      draft.field = "entryModel";
      return {
        reply: renderCreateEventPrompt("entryModel"),
        nextContext: withAdminEventsContext(baseContext, "admin_event_create_collecting", {
          draft,
        }),
      };
    } else if (field === "imageUrl") {
      const normalized = normalizeAdminText(text);
      if (["pular", "sem", "nenhum"].includes(normalized)) {
        draft[field] = null;
      } else {
        const imageUrl = normalizeEventImageUrl(mediaUrl ?? text);
        if (!imageUrl) {
          return {
            reply:
              "Não consegui identificar a foto. Envie uma imagem pelo WhatsApp ou cole uma URL pública https://...",
            nextContext: withAdminEventsContext(baseContext, "admin_event_create_collecting", {
              draft,
            }),
          };
        }
        draft[field] = imageUrl;
      }
    } else if (field === "status") {
      const status = text.trim() === "2" ? "published" : text.trim() === "1" ? "draft" : null;
      if (!status) {
        return {
          reply: renderCreateEventPrompt("status"),
          nextContext: withAdminEventsContext(baseContext, "admin_event_create_collecting", {
            draft,
          }),
        };
      }
      if (status === "published" && !draft.imageUrl) {
        draft.field = "imageUrl";
        return {
          reply:
            "Para publicar, a foto do evento é obrigatória. Envie a foto agora ou cole uma URL pública https://...",
          nextContext: withAdminEventsContext(baseContext, "admin_event_create_collecting", {
            draft,
          }),
        };
      }
      draft[field] = status;
    } else if (field === "entryModel") {
      const option = text.trim();
      if (option === "1") {
        draft.entryModel = "single_general";
        draft.field = "entryCapacityMode";
        return {
          reply: renderCreateEventPrompt("entryCapacityMode"),
          nextContext: withAdminEventsContext(baseContext, "admin_event_create_collecting", {
            draft,
          }),
        };
      }
      if (option === "2") {
        draft.entryModel = "multiple_general";
        draft.field = "entryCapacityMode";
        return {
          reply: renderCreateEventPrompt("entryCapacityMode"),
          nextContext: withAdminEventsContext(baseContext, "admin_event_create_collecting", {
            draft,
          }),
        };
      }
      if (option === "3") {
        draft.entryModel = "numbered";
        draft.field = "entryCapacityMode";
        return {
          reply: renderCreateEventPrompt("entryCapacityMode"),
          nextContext: withAdminEventsContext(baseContext, "admin_event_create_collecting", {
            draft,
          }),
        };
      }

      return {
        reply: renderCreateEventPrompt("entryModel"),
        nextContext: withAdminEventsContext(baseContext, "admin_event_create_collecting", {
          draft,
        }),
      };
    } else if (field === "entryCapacityMode") {
      const option = text.trim();
      if (option === "1") {
        draft.entryCapacityMode = "shared";
        draft.entryCapacityModeConfirmed = true;
        draft.field = "sharedEntryCapacity";
        return {
          reply: renderCreateEventPrompt("sharedEntryCapacity"),
          nextContext: withAdminEventsContext(baseContext, "admin_event_create_collecting", {
            draft,
          }),
        };
      }

      if (option === "2") {
        draft.entryCapacityMode = "per_type";
        draft.entryCapacityModeConfirmed = true;
        const existingCount = Number(draft.expectedEntryCount ?? 0);
        draft.field =
          draft.entryModel === "single_general"
            ? "singleEntryDetails"
            : Number.isInteger(existingCount) && existingCount > 0
              ? "entryItem"
              : "entryCount";
        return {
          reply:
            draft.field === "entryItem"
              ? [
                  `Envie o tipo/setor ${Number(draft.currentEntryIndex ?? 1)} de ${existingCount}.`,
                  "",
                  renderEntryItemPrompt(),
                ].join("\n")
              : renderCreateEventPrompt(String(draft.field)),
          nextContext: withAdminEventsContext(baseContext, "admin_event_create_collecting", {
            draft,
          }),
        };
      }

      return {
        reply: renderCreateEventPrompt("entryCapacityMode"),
        nextContext: withAdminEventsContext(baseContext, "admin_event_create_collecting", {
          draft,
        }),
      };
    } else if (field === "sharedEntryCapacity") {
      const capacity = Number(text.trim().replace(/\D/g, ""));
      if (!Number.isInteger(capacity) || capacity < 1 || capacity > 5000) {
        return {
          reply: "Carga inválida. Envie um número de 1 a 5000.",
          nextContext: withAdminEventsContext(baseContext, "admin_event_create_collecting", {
            draft,
          }),
        };
      }

      draft.sharedEntryCapacity = capacity;
      const existingCount = Number(draft.expectedEntryCount ?? 0);

      if (Number.isInteger(existingCount) && existingCount > 0) {
        draft.sharedPriceOptions = [];
        draft.currentEntryIndex = Number(draft.currentEntryIndex ?? 1) || 1;
        draft.field = "entryOfferItem";

        return {
          reply: [
            `Envie o tipo de compra/oferta ${draft.currentEntryIndex} de ${existingCount}.`,
            "",
            renderCreateEventPrompt("entryOfferItem"),
          ].join("\n"),
          nextContext: withAdminEventsContext(baseContext, "admin_event_create_collecting", {
            draft,
          }),
        };
      }

      draft.field = "entryCount";
      return {
        reply: renderCreateEventPrompt("entryCount"),
        nextContext: withAdminEventsContext(baseContext, "admin_event_create_collecting", {
          draft,
        }),
      };
    } else if (field === "singleEntryDetails") {
      const section = parseInitialEntryDefinition(text, {
        numbered: false,
        requireCapacity: true,
      });
      if (!section) {
        return {
          reply: "Não consegui entender. Envie assim: Entrada Geral 500 120,00 12,00",
          nextContext: withAdminEventsContext(baseContext, "admin_event_create_collecting", {
            draft,
          }),
        };
      }
      draft.initialSections = [section];
      draft.field = "status";
      return {
        reply: renderCreateEventPrompt("status"),
        nextContext: withAdminEventsContext(baseContext, "admin_event_create_collecting", {
          draft,
        }),
      };
    } else if (field === "entryCount") {
      const count = Number(text.trim().replace(/\D/g, ""));
      if (!Number.isInteger(count) || count < 1 || count > 20) {
        return {
          reply: "Quantidade inválida. Envie um número de 1 a 20.",
          nextContext: withAdminEventsContext(baseContext, "admin_event_create_collecting", {
            draft,
          }),
        };
      }
      draft.expectedEntryCount = count;
      draft.currentEntryIndex = 1;
      if (draft.entryCapacityMode === "shared") {
        draft.sharedPriceOptions = [];
        draft.field = "entryOfferItem";
      } else {
        draft.initialSections = [];
        draft.field = "entryItem";
      }
      return {
        reply: [
          draft.entryCapacityMode === "shared"
            ? `Envie o tipo de compra/oferta 1 de ${count}.`
            : `Envie o tipo/setor 1 de ${count}.`,
          "",
          draft.entryCapacityMode === "shared"
            ? renderCreateEventPrompt("entryOfferItem")
            : renderEntryItemPrompt(),
        ].join("\n"),
        nextContext: withAdminEventsContext(baseContext, "admin_event_create_collecting", {
          draft,
        }),
      };
    } else if (field === "entryOfferItem") {
      const expectedCount = Number(draft.expectedEntryCount ?? 0);
      const currentIndex = Number(draft.currentEntryIndex ?? 1);
      const offer = parseInitialOfferDefinition(text);
      const currentOffers = getDraftArray<{
        ticketType: AdminTicketType;
        label: string;
        priceCents: number;
        feeCents: number;
      }>(draft, "sharedPriceOptions");

      if (!offer) {
        return {
          reply: "Não consegui entender. Envie assim: Meia entrada professor 60,00 0",
          nextContext: withAdminEventsContext(baseContext, "admin_event_create_collecting", {
            draft,
          }),
        };
      }

      draft.sharedPriceOptions = [...currentOffers, offer];

      if (currentIndex < expectedCount) {
        draft.currentEntryIndex = currentIndex + 1;
        draft.field = "entryOfferItem";
        return {
          reply: [
            `Oferta cadastrada: ${offer.label}.`,
            "",
            `Envie o tipo de compra/oferta ${currentIndex + 1} de ${expectedCount}.`,
            "",
            renderCreateEventPrompt("entryOfferItem"),
          ].join("\n"),
          nextContext: withAdminEventsContext(baseContext, "admin_event_create_collecting", {
            draft,
          }),
        };
      }

      const sharedCapacity = Number(draft.sharedEntryCapacity ?? 0);
      const priceOptions = getDraftArray<{
        ticketType: AdminTicketType;
        label: string;
        priceCents: number;
        feeCents: number;
      }>({ sharedPriceOptions: draft.sharedPriceOptions }, "sharedPriceOptions");

      const sharedSection = {
        name: draft.entryModel === "numbered" ? "Assentos" : "Entrada Geral",
        slug: draft.entryModel === "numbered" ? "assentos" : "entrada-geral",
        hasNumberedSeats: draft.entryModel === "numbered",
        capacity: sharedCapacity,
        createInventorySeats: true,
        ticketType: priceOptions[0]?.ticketType ?? "full",
        label: priceOptions[0]?.label ?? "Entrada Geral",
        priceCents: priceOptions[0]?.priceCents ?? 0,
        feeCents: priceOptions[0]?.feeCents ?? 0,
        priceOptions,
      };

      if (draft.entryModel === "numbered") {
        draft.pendingNumberedSection = sharedSection;
        draft.field = "entrySeatItem";

        return {
          reply: renderCreateEventSeatPrompt(sharedSection.name),
          nextContext: withAdminEventsContext(baseContext, "admin_event_create_collecting", {
            draft,
          }),
        };
      }

      draft.initialSections = [sharedSection];
      draft.field = "status";
      return {
        reply: renderCreateEventPrompt("status"),
        nextContext: withAdminEventsContext(baseContext, "admin_event_create_collecting", {
          draft,
        }),
      };
    } else if (field === "entrySeatItem") {
      const pendingSectionRaw = draft.pendingNumberedSection;
      const pendingSection =
        pendingSectionRaw && typeof pendingSectionRaw === "object"
          ? (pendingSectionRaw as Record<string, unknown>)
          : null;
      const seatLayout = parseSeatLayout(text);
      const seatCodes = seatLayout.seatCodes;

      if (
        !pendingSection ||
        seatLayout.invalidLines?.length ||
        seatCodes.length === 0 ||
        seatCodes.length > 5000
      ) {
        return {
          reply: [
            "Não consegui entender os assentos.",
            ...(seatLayout.invalidLines?.length
              ? [
                  "",
                  "Revise estas linhas:",
                  ...seatLayout.invalidLines.map((line) => `> ${line}`),
                ]
              : []),
            "",
            renderCreateEventSeatPrompt(String(pendingSection?.name ?? "")),
          ].join("\n"),
          nextContext: withAdminEventsContext(baseContext, "admin_event_create_collecting", {
            draft,
          }),
        };
      }

      const section = {
        ...pendingSection,
        capacity: seatCodes.length,
        createInventorySeats: true,
        seatCodes,
        seatMapPositions: seatLayout.seatMapPositions,
      };
      const sectionName = String(pendingSection.name ?? "");
      draft.pendingNumberedSection = section;
      draft.field = "entrySeatMapVisual";

      return {
        reply: renderCreateEventSeatMapVisualPrompt(sectionName),
        nextContext: withAdminEventsContext(baseContext, "admin_event_create_collecting", {
          draft,
        }),
      };
    } else if (field === "entrySeatMapVisual") {
      const expectedCount = Number(draft.expectedEntryCount ?? 0);
      const currentIndex = Number(draft.currentEntryIndex ?? 1);
      const pendingSectionRaw = draft.pendingNumberedSection;
      const pendingSection =
        pendingSectionRaw && typeof pendingSectionRaw === "object"
          ? (pendingSectionRaw as Record<string, unknown>)
          : null;
      const option = text.trim();

      if (!pendingSection || !["1", "2"].includes(option)) {
        return {
          reply: renderCreateEventSeatMapVisualPrompt(
            String(pendingSection?.name ?? ""),
          ),
          nextContext: withAdminEventsContext(baseContext, "admin_event_create_collecting", {
            draft,
          }),
        };
      }

      const section = {
        ...pendingSection,
        createVisualMap: option === "1",
      };
      const sectionName = String(pendingSection.name ?? "");
      const currentSections = getInitialSectionsFromDraft(draft);
      draft.initialSections = [...currentSections, section];
      delete draft.pendingNumberedSection;

      if (currentIndex < expectedCount) {
        draft.currentEntryIndex = currentIndex + 1;
        draft.field = "entryItem";
        return {
          reply: [
            `Setor cadastrado com assentos: ${sectionName}.`,
            "",
            `Envie o tipo/setor ${currentIndex + 1} de ${expectedCount}.`,
            "",
            renderCreateEventPrompt("entryItem"),
          ].join("\n"),
          nextContext: withAdminEventsContext(baseContext, "admin_event_create_collecting", {
            draft,
          }),
        };
      }

      draft.field = "status";
      return {
        reply: renderCreateEventPrompt("status"),
        nextContext: withAdminEventsContext(baseContext, "admin_event_create_collecting", {
          draft,
        }),
      };
    } else if (field === "entryItem") {
      const expectedCount = Number(draft.expectedEntryCount ?? 0);
      const currentIndex = Number(draft.currentEntryIndex ?? 1);
      const numbered = draft.entryModel === "numbered";
      const section = parseInitialEntryDefinition(text, {
        numbered,
        requireCapacity: true,
      });
      const currentSections = getInitialSectionsFromDraft(draft);
      const totalCapacity = currentSections.reduce(
        (sum, item) => sum + (item.capacity ?? 0),
        section?.capacity ?? 0,
      );

      if (!section || totalCapacity > 5000) {
        return {
          reply: "Não consegui entender. Envie assim: Pista 500 120,00 12,00",
          nextContext: withAdminEventsContext(baseContext, "admin_event_create_collecting", {
            draft,
          }),
        };
      }

      if (numbered) {
        draft.pendingNumberedSection = section;
        draft.field = "entrySeatItem";
        return {
          reply: renderCreateEventSeatPrompt(section.name),
          nextContext: withAdminEventsContext(baseContext, "admin_event_create_collecting", {
            draft,
          }),
        };
      }

      draft.initialSections = [...currentSections, section];

      if (currentIndex < expectedCount) {
        draft.currentEntryIndex = currentIndex + 1;
        draft.field = "entryItem";
        return {
          reply: [
            `Entrada cadastrada: ${section.name}.`,
            "",
            `Envie o tipo/setor ${currentIndex + 1} de ${expectedCount}.`,
            "",
            renderEntryItemPrompt(),
          ].join("\n"),
          nextContext: withAdminEventsContext(baseContext, "admin_event_create_collecting", {
            draft,
          }),
        };
      }

      draft.field = "status";
      return {
        reply: renderCreateEventPrompt("status"),
        nextContext: withAdminEventsContext(baseContext, "admin_event_create_collecting", {
          draft,
        }),
      };
    } else {
      const value = text.trim();
      if (!value) {
        return {
          reply: "Valor vazio. Envie novamente.",
          nextContext: withAdminEventsContext(baseContext, "admin_event_create_collecting", {
            draft,
          }),
        };
      }
      draft[field] = value;
    }

    const nextField = nextFieldByField[field];
    if (nextField) {
      draft.field = nextField;
      return {
        reply: renderCreateEventPrompt(nextField),
        nextContext: withAdminEventsContext(baseContext, "admin_event_create_collecting", {
          draft,
        }),
      };
    }

    delete draft.field;
    return {
      reply: renderCreateEventSummary(draft),
      nextContext: withAdminEventsContext(baseContext, "admin_event_create_confirm", {
        draft,
      }),
    };
  }

  if (baseContext.state === "admin_event_create_confirm") {
    if (isBackText(text)) {
      const draft = getCreateEventConfirmBackDraft(adminEvents.draft ?? {});

      return {
        reply: renderCreateEventPrompt(String(draft.field ?? "title")),
        nextContext: withAdminEventsContext(baseContext, "admin_event_create_collecting", {
          draft,
        }),
      };
    }

    if (isAbortText(text)) {
      return {
        reply: "Criação de evento cancelada.",
        nextContext: withAdminEventsContext(baseContext, "admin_events_menu", {}),
      };
    }

    if (!isConfirmText(text)) {
      return {
        reply: "Responda CONFIRMAR para criar ou CANCELAR para abandonar.",
        nextContext: withAdminEventsContext(baseContext, "admin_event_create_confirm", adminEvents),
      };
    }

    const draft = adminEvents.draft ?? {};
    const title = String(draft.title ?? "").trim();
    const artistName = String(draft.artistName ?? "").trim();
    const city = String(draft.city ?? "").trim();
    const state = String(draft.state ?? "").trim().toUpperCase();
    const venueName = String(draft.venueName ?? "").trim();
    const imageUrl = normalizeEventImageUrl(String(draft.imageUrl ?? ""));
    const sessionsStartsAt = getDraftArray<string>(draft, "sessionsStartsAt");
    const status = String(draft.status ?? "");
    const initialSections = getInitialSectionsFromDraft(draft);

    if (
      !title ||
      !artistName ||
      !city ||
      !/^[A-Z]{2}$/.test(state) ||
      !venueName ||
      sessionsStartsAt.length === 0 ||
      sessionsStartsAt.some((startsAt) => new Date(startsAt).getTime() <= Date.now()) ||
      !isEventStatus(status) ||
      !["draft", "published"].includes(status) ||
      (status === "published" && !imageUrl) ||
      initialSections.length === 0
    ) {
      return {
        reply:
          status === "published" && !imageUrl
            ? "Para publicar o evento, cadastre a foto antes. Comece a criação novamente."
            : initialSections.length === 0
              ? "Antes de confirmar, defina a estrutura de entradas/lugares. Comece a criação novamente."
              : "Os dados do evento ficaram incompletos ou inválidos. Comece a criação novamente.",
        nextContext: withAdminEventsContext(baseContext, "admin_events_menu", {}),
      };
    }

    const result = await createAdminEvent({
      title,
      artistName,
      city,
      state,
      venueName,
      imageUrl,
      sessionsStartsAt,
      status,
      initialSections,
      createdByAdminUserId: scope.adminUserId,
      createdByAdminPhone: scope.adminPhone,
    });

    if (!result.ok) {
      return {
        reply: result.partialEventCreated
          ? "O evento foi salvo como rascunho, mas não consegui criar a data. Revise o evento antes de publicar."
          : "Não consegui criar o evento agora. Verifique os dados e tente novamente.",
        nextContext: withAdminEventsContext(baseContext, "admin_events_menu", {}),
      };
    }

    return {
      reply: [
        "Evento criado.",
        `Sessões criadas: ${result.sessionsCount}`,
        `Setores/entradas criados: ${result.createdSectionsCount}`,
        `Assentos/unidades criados: ${result.createdSeatsCount}`,
        `Valores de venda criados: ${result.createdPricesCount}`,
      ].join("\n"),
      nextContext: withAdminEventsContext(baseContext, "admin_event_detail", {
        selectedEventId: result.eventId,
      }),
    };
  }

  if (baseContext.state === "admin_event_edit_menu") {
    const eventId = adminEvents.selectedEventId;
    const fieldByOption: Record<number, string> = {
      1: "title",
      2: "artist_name",
      3: "city",
      4: "state",
      5: "venue",
      6: "image_url",
      7: "starts_at",
      11: "description",
    };
    const field = numericOption ? fieldByOption[numericOption] : null;

    if (!eventId) {
      return showAdminEventDetails(
        baseContext,
        scope,
        adminEvents.selectedEventId ?? "",
      );
    }

    if (numericOption === 8 || numericOption === 9) {
      return showAdminEventSectionsMenu(baseContext, scope, eventId);
    }

    if (numericOption === 10) {
      return showAdminEventPricesMenu(baseContext, scope, eventId);
    }

    if (numericOption === 13) {
      return {
        reply: "__ADMIN_EXIT__",
        nextContext: withAdminEventsContext(baseContext, "admin_events_menu", {}),
      };
    }

    if (numericOption === 12 || !field) {
      return showAdminEventDetails(baseContext, scope, eventId);
    }

    if (field === "starts_at") {
      const details = await getScopedAdminEventDetails(eventId, scope);

      return {
        reply: [
          details.ok ? "Sessões cadastradas:" : "Sessões cadastradas:",
          "",
          details.ok && details.event.sessions.length
            ? details.event.sessions
                .map(
                  (session, index) =>
                    `${index + 1}. ${formatDateTime(session.startsAt)} - ${session.status}`,
                )
                .join("\n")
            : "Nenhuma sessão cadastrada.",
          "",
          "Envie: número da sessão | nova data/hora",
          "Ex: 1 | 10/06/2026 22:00",
        ].join("\n"),
        nextContext: withAdminEventsContext(baseContext, "admin_event_edit_collecting", {
          ...adminEvents,
          field,
        }),
      };
    }

    return {
      reply:
        field === "city"
          ? "Envie a nova cidade. Ex: Sorocaba"
          : field === "state"
            ? "Envie o novo estado/UF. Ex: SP"
          : field === "venue"
            ? "Envie o novo nome do local."
            : field === "image_url"
              ? "Envie a nova foto do evento ou cole uma URL pública https://..."
              : field === "description"
                  ? "Envie as informações gerais do evento."
                  : "Envie o novo valor.",
      nextContext: withAdminEventsContext(baseContext, "admin_event_edit_collecting", {
        ...adminEvents,
        field,
      }),
    };
  }

  if (baseContext.state === "admin_event_edit_collecting") {
    const eventId = adminEvents.selectedEventId;
    const field = adminEvents.field;

    if (!eventId || !field) {
      return {
        reply: renderAdminEventsMenu(),
        nextContext: withAdminEventsContext(baseContext, "admin_events_menu", {}),
      };
    }

    if (isBackText(text) || isAbortText(text)) {
      const details = await getScopedAdminEventDetails(eventId, scope);

      return {
        reply: renderAdminEventEditMenu(details.ok ? details.event.title : undefined),
        nextContext: withAdminEventsContext(baseContext, "admin_event_edit_menu", {
          selectedEventId: eventId,
        }),
      };
    }

    let value: Record<string, unknown> | null = null;
    if (field === "city") {
      if (!text.trim()) {
        return {
          reply: "Cidade inválida. Envie novamente.",
          nextContext: withAdminEventsContext(baseContext, "admin_event_edit_collecting", adminEvents),
        };
      }
      value = { field, city: text.trim() };
    } else if (field === "state") {
      const state = text.trim().toUpperCase();
      if (!/^[A-Z]{2}$/.test(state)) {
        return {
          reply: "UF inválida. Envie com 2 letras. Ex: SP",
          nextContext: withAdminEventsContext(baseContext, "admin_event_edit_collecting", adminEvents),
        };
      }
      value = { field, state };
    } else if (field === "venue") {
      if (!text.trim()) {
        return {
          reply: "Valor vazio. Envie novamente.",
          nextContext: withAdminEventsContext(baseContext, "admin_event_edit_collecting", adminEvents),
        };
      }
      value = { field, venueName: text.trim() };
    } else if (field === "status") {
      const status = normalizeAdminText(text);
      if (!isEventStatus(status)) {
        return {
          reply: "Status inválido. Use draft, published, cancelled ou finished.",
          nextContext: withAdminEventsContext(baseContext, "admin_event_edit_collecting", adminEvents),
        };
      }
      value = { field, status };
    } else if (field === "image_url") {
      const imageUrl = normalizeEventImageUrl(mediaUrl ?? text);
      if (!imageUrl) {
        return {
          reply: "Foto inválida. Envie uma imagem pelo WhatsApp ou cole uma URL pública https://...",
          nextContext: withAdminEventsContext(baseContext, "admin_event_edit_collecting", adminEvents),
        };
      }
      value = { field, imageUrl };
    } else if (field === "starts_at") {
      const details = await getScopedAdminEventDetails(eventId, scope);
      const [sessionOptionRaw, startsAtRaw] = text.includes("|")
        ? text.split("|").map((part) => part.trim())
        : details.ok && details.event.sessions.length === 1
          ? ["1", text.trim()]
          : ["", ""];
      const session = details.ok
        ? details.event.sessions[Number(sessionOptionRaw) - 1] ?? null
        : null;
      const startsAt = parseBrazilianDateTime(startsAtRaw ?? "");

      if (!session) {
        return {
          reply: [
            "Sessão inválida. Envie: número da sessão | nova data/hora",
            "Ex: 1 | 10/06/2026 22:00",
          ].join("\n"),
          nextContext: withAdminEventsContext(baseContext, "admin_event_edit_collecting", adminEvents),
        };
      }

      if (!startsAt || new Date(startsAt).getTime() <= Date.now()) {
        return {
          reply: "Data inválida ou no passado. Envie no formato 10/06/2026 22:00.",
          nextContext: withAdminEventsContext(baseContext, "admin_event_edit_collecting", adminEvents),
        };
      }

      const usage = await getAdminSessionUsage(session.sessionId);

      if (!usage.ok) {
        return {
          reply: "Não consegui verificar reservas/ingressos dessa data agora.",
          nextContext: withAdminEventsContext(baseContext, "admin_event_edit_menu", adminEvents),
        };
      }

      if (usage.hasUsage) {
        return {
          reply: [
            "Essa data já tem reservas ou ingressos vinculados.",
            "Para evitar quebrar ingressos emitidos, a alteração de data/hora está bloqueada neste fluxo.",
          ].join("\n"),
          nextContext: withAdminEventsContext(baseContext, "admin_event_edit_menu", adminEvents),
        };
      }

      value = { field, startsAt, sessionId: session.sessionId };
    } else if (field === "description") {
      value = { field, description: text.trim() || null };
    } else {
      if (!text.trim()) {
        return {
          reply: "Valor vazio. Envie novamente.",
          nextContext: withAdminEventsContext(baseContext, "admin_event_edit_collecting", adminEvents),
        };
      }
      value = { field, [field]: text.trim() };
    }

    return {
      reply: renderEditEventSummary(value),
      nextContext: withAdminEventsContext(baseContext, "admin_event_edit_confirm", {
        selectedEventId: eventId,
        draft: value,
      }),
    };
  }

  if (baseContext.state === "admin_event_edit_confirm") {
    const eventId = adminEvents.selectedEventId;
    if (!eventId) {
      return showAdminEventDetails(baseContext, scope, eventId ?? "");
    }

    if (isBackText(text)) {
      const details = await getScopedAdminEventDetails(eventId, scope);

      return {
        reply: renderAdminEventEditMenu(details.ok ? details.event.title : undefined),
        nextContext: withAdminEventsContext(baseContext, "admin_event_edit_menu", {
          selectedEventId: eventId,
        }),
      };
    }

    if (isCancelText(text)) {
      return showAdminEventDetails(baseContext, scope, eventId);
    }

    const draft = adminEvents.draft ?? {};
    const field = String(draft.field ?? "");
    const confirmed =
      field === "status" && draft.status === "cancelled"
        ? normalizeAdminText(text) === "cancelar evento"
        : isConfirmText(text);

    if (!confirmed) {
      return {
        reply:
          field === "status" && draft.status === "cancelled"
            ? "Digite CANCELAR EVENTO para confirmar ou CANCELAR para abandonar."
            : "Responda CONFIRMAR ou CANCELAR.",
        nextContext: withAdminEventsContext(baseContext, "admin_event_edit_confirm", adminEvents),
      };
    }

    let values: Parameters<typeof updateAdminEvent>[1] | null = null;

    if (field === "title") {
      const title = String(draft.title ?? "").trim();
      if (title) values = { title };
    } else if (field === "artist_name") {
      const artistName = String(draft.artist_name ?? "").trim();
      if (artistName) values = { artist_name: artistName };
    } else if (field === "city") {
      const city = String(draft.city ?? "").trim();
      if (city) values = { city };
    } else if (field === "state") {
      const state = String(draft.state ?? "").trim().toUpperCase();
      if (/^[A-Z]{2}$/.test(state)) values = { state };
    } else if (field === "venue") {
      const venueName = String(draft.venueName ?? "").trim();
      const details = await getScopedAdminEventDetails(eventId, scope);

      if (!details.ok || !venueName) {
        values = null;
      } else {
        const venue = await findOrCreateVenue({
          name: venueName,
          city: details.event.city,
          state: details.event.state,
        });

        if (!venue.ok) {
          return {
            reply: "Não consegui preparar esse local agora.",
            nextContext: withAdminEventsContext(baseContext, "admin_event_edit_menu", {
              selectedEventId: eventId,
            }),
          };
        }

        values = { venue_id: venue.venueId };
      }
    } else if (field === "status") {
      const status = String(draft.status ?? "");
      if (isEventStatus(status)) {
        if (status === "published") {
          const details = await getScopedAdminEventDetails(eventId, scope);
          if (!details.ok || !details.event.imageUrl) {
            return {
              reply:
                "Antes de publicar, cadastre a foto do evento em Editar evento > Foto do evento.",
              nextContext: withAdminEventsContext(baseContext, "admin_event_edit_menu", {
                selectedEventId: eventId,
              }),
            };
          }
        }
        values = { status };
      }
    } else if (field === "image_url") {
      const imageUrl = normalizeEventImageUrl(String(draft.imageUrl ?? ""));
      if (imageUrl) values = { image_url: imageUrl };
    } else if (field === "description") {
      values = { description: String(draft.description ?? "").trim() || null };
    } else if (field === "starts_at") {
      const startsAt = String(draft.startsAt ?? "");
      const sessionId = String(draft.sessionId ?? "");

      if (!startsAt || !sessionId) {
        values = null;
      } else {
        const result = await updateAdminSession(sessionId, { starts_at: startsAt });

        if (!result.ok) {
          return {
            reply: "Não consegui salvar a nova data/hora.",
            nextContext: withAdminEventsContext(baseContext, "admin_event_edit_menu", {
              selectedEventId: eventId,
            }),
          };
        }

        const details = await getScopedAdminEventDetails(eventId, scope);

        return {
          reply: renderAdminEventPublishSelectReply(
            details.ok ? details.event.title : undefined,
          ),
          nextContext: withAdminEventsContext(
            baseContext,
            "admin_event_edit_publish_select",
            {
              selectedEventId: eventId,
            },
          ),
        };
      }
    }

    if (!values) {
      return {
        reply: "Os dados da alteração ficaram inválidos. Comece a edição novamente.",
        nextContext: withAdminEventsContext(baseContext, "admin_event_edit_menu", {
          selectedEventId: eventId,
        }),
      };
    }

    const result = await updateAdminEvent(eventId, values);
    if (!result.ok) {
      return {
        reply: "Não consegui salvar a alteração.",
        nextContext: withAdminEventsContext(baseContext, "admin_event_edit_menu", {
          selectedEventId: eventId,
        }),
      };
    }

    const details = await getScopedAdminEventDetails(eventId, scope);

    return {
      reply: renderAdminEventPublishSelectReply(
        details.ok ? details.event.title : undefined,
      ),
      nextContext: withAdminEventsContext(
        baseContext,
        "admin_event_edit_publish_select",
        {
          selectedEventId: eventId,
        },
      ),
    };
  }

  if (baseContext.state === "admin_event_edit_publish_select") {
    const eventId = adminEvents.selectedEventId;

    if (!eventId) {
      return {
        reply: renderAdminEventsMenu(),
        nextContext: withAdminEventsContext(baseContext, "admin_events_menu", {}),
      };
    }

    if (numericOption === 4) {
      return {
        reply: "__ADMIN_EXIT__",
        nextContext: withAdminEventsContext(baseContext, "admin_events_menu", {}),
      };
    }

    if (numericOption === 3 || isCancelText(text) || isBackText(text)) {
      return showAdminEventDetails(baseContext, scope, eventId);
    }

    const targetStatus =
      numericOption === 1 ? "draft" : numericOption === 2 ? "published" : null;

    if (!targetStatus) {
      const details = await getScopedAdminEventDetails(eventId, scope);

      return {
        reply: renderAdminEventPublishSelectReply(
          details.ok ? details.event.title : undefined,
        ),
        nextContext: withAdminEventsContext(
          baseContext,
          "admin_event_edit_publish_select",
          adminEvents,
        ),
      };
    }

    const details = await getScopedAdminEventDetails(eventId, scope);

    if (!details.ok) {
      return {
        reply: "Não encontrei esse evento.",
        nextContext: withAdminEventsContext(baseContext, "admin_events_menu", {}),
      };
    }

    if (targetStatus === "published" && !details.event.imageUrl) {
      return {
        reply:
          "Antes de publicar, cadastre a foto do evento em Editar meu evento > Editar foto.",
        nextContext: withAdminEventsContext(
          baseContext,
          "admin_event_edit_publish_select",
          adminEvents,
        ),
      };
    }

    if (
      targetStatus === "published" &&
      !(await adminEventHasPurchasableInventory(details.event))
    ) {
      return {
        reply:
          "Antes de publicar, cadastre setores/assentos e valores disponíveis para venda.",
        nextContext: withAdminEventsContext(
          baseContext,
          "admin_event_edit_publish_select",
          adminEvents,
        ),
      };
    }

    const result = await updateAdminEvent(eventId, {
      status: targetStatus as AdminEventStatus,
    });

    return result.ok
      ? showAdminEventDetails(
          baseContext,
          scope,
          eventId,
          targetStatus === "published"
            ? "EVENTO PUBLICADO!"
            : "EVENTO SALVO COMO RASCUNHO!",
        )
      : {
          reply: "Não consegui alterar o status do evento.",
          nextContext: withAdminEventsContext(
            baseContext,
            "admin_event_edit_publish_select",
            adminEvents,
          ),
        };
  }

  if (baseContext.state === "admin_event_status_select") {
    const eventId = adminEvents.selectedEventId;
    if (!eventId) {
      return showAdminEventDetails(baseContext, scope, eventId ?? "");
    }
    const details = await getScopedAdminEventDetails(eventId, scope);

    if (!details.ok) {
      return {
        reply: "Não encontrei esse evento.",
        nextContext: withAdminEventsContext(baseContext, "admin_events_menu", {}),
      };
    }

    if (isBackText(text) || isAbortText(text)) {
      return showAdminEventDetails(baseContext, scope, eventId);
    }

    const actions = getAdminEventStatusActions(details.event.status);
    const backOption = actions.length + 1;

    if (numericOption === backOption) {
      return showAdminEventDetails(baseContext, scope, eventId);
    }

    const targetStatus =
      actions.find((action) => action.option === numericOption)?.status ?? null;

    if (!targetStatus) {
      return {
        reply: renderAdminEventStatusMenu(details.event),
        nextContext: withAdminEventsContext(baseContext, "admin_event_status_select", adminEvents),
      };
    }

    if (targetStatus === "published" && !details.event.imageUrl) {
      return {
        reply:
          "Antes de publicar, cadastre a foto do evento em Editar evento > Foto do evento.",
        nextContext: withAdminEventsContext(baseContext, "admin_event_status_select", adminEvents),
      };
    }

    return {
      reply:
        targetStatus === "cancelled"
          ? "Digite CANCELAR EVENTO para confirmar o cancelamento. Não haverá exclusão física nem estorno automático."
          : targetStatus === "draft"
            ? "Responda CONFIRMAR para pausar o evento."
          : "Responda CONFIRMAR para ativar o evento.",
      nextContext: withAdminEventsContext(baseContext, "admin_event_status_confirm", {
        selectedEventId: eventId,
        draft: { status: targetStatus },
      }),
    };
  }

  if (baseContext.state === "admin_event_status_confirm") {
    const eventId = adminEvents.selectedEventId;
    const status = adminEvents.draft?.status;
    const confirmed =
      status === "cancelled"
        ? normalizeAdminText(text) === "cancelar evento"
        : isConfirmText(text);

    if (!eventId || isBackText(text) || isCancelText(text)) {
      return showAdminEventDetails(baseContext, scope, eventId ?? "");
    }
    if (!confirmed || !isEventStatus(String(status))) {
      return {
        reply: "Confirmação inválida. Operação cancelada por segurança.",
        nextContext: withAdminEventsContext(baseContext, "admin_events_menu", {}),
      };
    }

    const result = await updateAdminEvent(eventId, { status: status as AdminEventStatus });
    return result.ok
      ? showAdminEventDetails(
          baseContext,
          scope,
          eventId,
          status === "cancelled" ? "EVENTO CANCELADO!" : undefined,
        )
      : {
          reply: "Não consegui alterar o status.",
          nextContext: withAdminEventsContext(baseContext, "admin_events_menu", {}),
        };
  }

  return handleAdminEventOperationalSubmenus({ baseContext, scope, text });
}

async function showAdminEventSessionsMenu(
  baseContext: TicketConversationState,
  scope: AdminEventScope,
  eventId: string,
) {
  const details = await getScopedAdminEventDetails(eventId, scope);

  if (!details.ok) {
    return {
      reply: "Não encontrei esse evento.",
      nextContext: withAdminEventsContext(baseContext, "admin_events_menu", {}),
    };
  }

  return {
    reply: renderAdminSessionsMenu(details.event.title),
    nextContext: withAdminEventsContext(baseContext, "admin_event_sessions_menu", {
      selectedEventId: eventId,
    }),
  };
}

function renderAdminSessionsMenu(eventTitle: string) {
  return withAdminNavigationHint([
    `*DATAS DO EVENTO - ${eventTitle.toUpperCase()}*`,
    "",
    "> 1. Listar sessões",
    "> 2. Criar sessão",
    "> 3. Editar data/hora de sessão",
    "> 4. Pausar/abrir vendas da sessão",
    "> 5. Cancelar sessão",
    "> 6. Voltar",
    "> 7. Sair",
  ].join("\n"));
}

async function showAdminEventSectionsMenu(
  baseContext: TicketConversationState,
  scope: AdminEventScope,
  eventId: string,
) {
  const details = await getScopedAdminEventDetails(eventId, scope);

  if (!details.ok) {
    return {
      reply: "Não encontrei esse evento.",
      nextContext: withAdminEventsContext(baseContext, "admin_events_menu", {}),
    };
  }

  return {
    reply: renderAdminSectionsMenu(details.event.title),
    nextContext: withAdminEventsContext(baseContext, "admin_event_sections_menu", {
      selectedEventId: eventId,
    }),
  };
}

function renderAdminSectionsMenu(eventTitle: string) {
  return withAdminNavigationHint([
    `*SETORES E ASSENTOS - ${eventTitle.toUpperCase()}*`,
    "",
    "> 1. Listar setores",
    "> 2. Criar setor",
    "> 3. Editar setor",
    "> 4. Cadastrar assentos em lote",
    "> 5. Bloquear/desbloquear assentos",
    "> 6. Criar assentos da sessão",
    "> 7. Voltar",
    "> 8. Sair",
  ].join("\n"));
}

async function showAdminEventPricesMenu(
  baseContext: TicketConversationState,
  scope: AdminEventScope,
  eventId: string,
) {
  const details = await getScopedAdminEventDetails(eventId, scope);

  if (!details.ok) {
    return {
      reply: "Não encontrei esse evento.",
      nextContext: withAdminEventsContext(baseContext, "admin_events_menu", {}),
    };
  }

  return {
    reply: renderAdminPricesMenu(details.event.title),
    nextContext: withAdminEventsContext(baseContext, "admin_event_prices_menu", {
      selectedEventId: eventId,
    }),
  };
}

function renderAdminPricesMenu(eventTitle: string) {
  return withAdminNavigationHint([
    `*VALORES DE VENDA - ${eventTitle.toUpperCase()}*`,
    "",
    "> 1. Listar preços",
    "> 2. Criar preço/lote",
    "> 3. Editar preço/lote",
    "> 4. Ativar/desativar preço",
    "> 5. Voltar",
    "> 6. Sair",
  ].join("\n"));
}

async function renderSessionsList(eventId: string, scope: AdminEventScope) {
  const details = await getScopedAdminEventDetails(eventId, scope);
  if (!details.ok) return "Não encontrei esse evento.";
  const counts = await getAdminSessionCatalogCounts(details.event.sessions);

  return [
    `Sessões de ${details.event.title}:`,
    "",
    ...(details.event.sessions.length
      ? details.event.sessions.map(
          (session, index) =>
            [
              `${index + 1}. ${formatDateTime(session.startsAt)} - ${session.status}`,
              `   Local: ${session.venueName ?? details.event.venueName ?? "não definido"}`,
              counts.ok
                ? `   Setores: ${counts.getSectionsCount(session.venueId)} | Preços: ${counts.getPricesCount(session.sessionId)}`
                : "   Setores/preços: não consegui calcular agora",
            ].join("\n"),
        )
      : ["Nenhuma sessão cadastrada."]),
  ].join("\n");
}

async function renderSectionsList(
  eventId: string,
  scope: AdminEventScope,
  sessionId?: string,
) {
  const details = await getScopedAdminEventDetails(eventId, scope);
  if (!details.ok || !details.event.venueId) return "Não encontrei venue para esse evento.";
  const result = await listAdminSections(details.event.venueId, sessionId);
  if (!result.ok) return "Não consegui listar setores.";

  return [
    `Setores de ${details.event.venueName ?? details.event.title}:`,
    "",
    ...(result.sections.length
      ? result.sections.map(
          (section, index) =>
            [
              `${index + 1}. ${section.name}`,
              `   slug: ${section.slug}`,
              `   capacidade: ${section.capacity ?? "não definida"}`,
              `   assento marcado: ${section.hasNumberedSeats ? "sim" : "não"}`,
              `   status: ${section.status}`,
              `   assentos estruturais: ${section.seatsCount}`,
              `   assentos da sessão: ${section.sessionSeatsCount}`,
            ].join("\n"),
        )
      : ["Nenhum setor cadastrado."]),
  ].join("\n");
}

async function getAdminPriceListForEvent(eventId: string, scope: AdminEventScope) {
  const details = await getScopedAdminEventDetails(eventId, scope);
  if (!details.ok) return { ok: false as const, reply: "Não encontrei esse evento." };
  if (!details.event.sessions.length) {
    return { ok: false as const, reply: "Esse evento ainda não tem sessões." };
  }
  const priceGroups = await Promise.all(
    details.event.sessions.map(async (session) => {
      const result = await listAdminPrices({ sessionId: session.sessionId });
      return { session, result };
    }),
  );
  const failed = priceGroups.find((group) => !group.result.ok);
  if (failed) return { ok: false as const, reply: "Não consegui listar preços." };
  let option = 1;
  const prices = priceGroups.flatMap(({ session, result }) =>
    (result.ok ? result.prices : []).map((price) => {
      const rawSection = price.venue_sections as
        | { name?: string }
        | Array<{ name?: string }>
        | null
        | undefined;
      const sectionName = Array.isArray(rawSection)
        ? rawSection[0]?.name
        : rawSection?.name;

      return {
        option: option++,
        priceId: String(price.id),
        sessionId: session.sessionId,
        sessionStartsAt: session.startsAt,
        sectionName: sectionName ?? String(price.section_id),
        label: String(price.label),
        ticketType: String(price.ticket_type),
        priceCents: Number(price.price_cents),
        feeCents: Number(price.fee_cents),
        salesStartAt: price.sales_start_at ? String(price.sales_start_at) : null,
        salesEndAt: price.sales_end_at ? String(price.sales_end_at) : null,
        status: String(price.status),
      };
    }),
  );

  return {
    ok: true as const,
    eventTitle: details.event.title,
    prices,
    reply: [
    `Preços de ${details.event.title}:`,
    "",
    ...(prices.length
      ? prices.map((price) =>
          [
            `${price.option}. ${price.label} (${price.ticketType})`,
            `   Sessão: ${formatDateTime(price.sessionStartsAt)}`,
            `   Setor: ${price.sectionName}`,
            `   Valor: ${formatCurrencyFromCents(price.priceCents)} + ${formatCurrencyFromCents(price.feeCents)} taxa`,
            `   Janela: ${price.salesStartAt ? formatDateTime(price.salesStartAt) : "início livre"} até ${price.salesEndAt ? formatDateTime(price.salesEndAt) : "fim livre"}`,
            `   Status: ${price.status}`,
          ].join("\n"),
        )
      : ["Nenhum preço cadastrado."]),
  ].join("\n"),
  };
}

function formatCompactAdminPriceLabel(label: string) {
  return label
    .replace(/\s*\([^)]*\)\s*/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function parseOptionalAdminDateTime(value: string | undefined) {
  const normalized = normalizeAdminText(value ?? "");
  if (!normalized || normalized === "-" || normalized === "nenhum" || normalized === "sem") {
    return { ok: true as const, value: null };
  }

  const parsed = parseBrazilianDateTime(value ?? "");
  return parsed ? { ok: true as const, value: parsed } : { ok: false as const };
}

function parseAdminTicketType(value: string) {
  const normalized = normalizeAdminText(value);
  const aliases: Record<string, AdminTicketType> = {
    promo: "promotional",
    promocional: "promotional",
    courtesy: "free",
    cortesia: "free",
  };
  const ticketType = aliases[normalized] ?? normalized;

  return isTicketType(ticketType) ? ticketType : null;
}

function getDraftArray<T>(draft: Record<string, unknown> | undefined, key: string) {
  const value = draft?.[key];
  return Array.isArray(value) ? (value as T[]) : [];
}

function selectSessionByOption(event: AdminEventDetails, value: string) {
  const option = Number(value.trim());
  return Number.isInteger(option) ? event.sessions[option - 1] ?? null : null;
}

function selectSectionByOption(event: AdminEventDetails, value: string) {
  const option = Number(value.trim());
  return Number.isInteger(option) ? event.sections[option - 1] ?? null : null;
}

async function handleAdminEventOperationalSubmenus({
  baseContext,
  scope,
  text,
}: {
  baseContext: TicketConversationState;
  scope: AdminEventScope;
  text: string;
}): Promise<RouteTicketMessageOutput | null> {
  const adminEvents = getAdminEventsContext(baseContext);
  const eventId = adminEvents.selectedEventId;
  const numericOption = text.trim().match(/^\d+$/) ? Number(text.trim()) : null;

  if (!eventId) return null;

  if (isBackText(text) || isCancelText(text)) {
    if (baseContext.state === "admin_event_sessions_menu") {
      return showAdminEventDetails(baseContext, scope, eventId);
    }

    if (baseContext.state === "admin_event_sections_menu") {
      return showAdminEventDetails(baseContext, scope, eventId);
    }

    if (baseContext.state === "admin_event_prices_menu") {
      return showAdminEventDetails(baseContext, scope, eventId);
    }

    if (
      baseContext.state === "admin_event_session_create_collecting" ||
      baseContext.state === "admin_event_session_edit_collecting"
    ) {
      return showAdminEventSessionsMenu(baseContext, scope, eventId);
    }

    if (
      baseContext.state === "admin_event_section_create_collecting" ||
      baseContext.state === "admin_event_seats_create_collecting" ||
      baseContext.state === "admin_event_session_seats_confirm"
    ) {
      return showAdminEventSectionsMenu(baseContext, scope, eventId);
    }

    if (
      baseContext.state === "admin_event_price_create_collecting" ||
      baseContext.state === "admin_event_price_edit_collecting"
    ) {
      return showAdminEventPricesMenu(baseContext, scope, eventId);
    }
  }

  if (baseContext.state === "admin_event_sessions_menu") {
    if (numericOption === 1) {
      return {
        reply: await renderSessionsList(eventId, scope),
        nextContext: withAdminEventsContext(baseContext, "admin_event_sessions_menu", adminEvents),
      };
    }
    if (numericOption === 2) {
      return {
        reply:
          "Envie data/hora e status da nova sessão. Ex: 10/06/2026 22:00 | sales_open\nStatus inicial permitido: scheduled ou sales_open.",
        nextContext: withAdminEventsContext(baseContext, "admin_event_session_create_collecting", adminEvents),
      };
    }
    if (numericOption === 3) {
      return {
        reply: [
          await renderSessionsList(eventId, scope),
          "",
          "Envie: número da sessão | nova data/hora. Ex: 1 | 10/06/2026 22:30",
        ].join("\n"),
        nextContext: withAdminEventsContext(baseContext, "admin_event_session_edit_collecting", {
          ...adminEvents,
          mode: "edit_session_datetime",
        }),
      };
    }
    if (numericOption === 4) {
      return {
        reply: [
          await renderSessionsList(eventId, scope),
          "",
          "Envie: número da sessão | status. Ex: 1 | sales_open",
          "Status: scheduled, sales_open ou sales_closed.",
          "Para cancelar, use a opção Cancelar sessão.",
        ].join("\n"),
        nextContext: withAdminEventsContext(baseContext, "admin_event_session_edit_collecting", {
          ...adminEvents,
          mode: "edit_session_status",
        }),
      };
    }
    if (numericOption === 5) {
      return {
        reply: [
          await renderSessionsList(eventId, scope),
          "",
          "Envie o número da sessão que deseja cancelar.",
        ].join("\n"),
        nextContext: withAdminEventsContext(baseContext, "admin_event_session_edit_collecting", {
          ...adminEvents,
          mode: "cancel_session_select",
        }),
      };
    }
    if (numericOption === 6) return showAdminEventDetails(baseContext, scope, eventId);
  }

  if (baseContext.state === "admin_event_session_create_collecting") {
    if (adminEvents.mode === "confirm_create_session") {
      if (isCancelText(text)) {
        return showAdminEventSessionsMenu(baseContext, scope, eventId);
      }
      if (!isConfirmText(text)) {
        return {
          reply: "Responda CONFIRMAR ou CANCELAR.",
          nextContext: withAdminEventsContext(
            baseContext,
            "admin_event_session_create_collecting",
            adminEvents,
          ),
        };
      }
      const result = await createEventAdminSession({
        eventId,
        venueId: String(adminEvents.draft?.venueId ?? "") || null,
        startsAt: String(adminEvents.draft?.startsAt),
        status: String(adminEvents.draft?.status) as AdminSessionStatus,
      });
      return {
        reply: result.ok
          ? "Sessão criada. Agora configure setores/assentos para essa sessão."
          : "Não consegui criar a sessão.",
        nextContext: withAdminEventsContext(baseContext, "admin_event_sessions_menu", {
          selectedEventId: eventId,
        }),
      };
    }

    const [dateText, statusTextRaw] = text.split("|").map((part) => part.trim());
    const startsAt = parseBrazilianDateTime(dateText);
    const statusText = normalizeAdminText(statusTextRaw ?? "scheduled");
    const details = await getScopedAdminEventDetails(eventId, scope);
    if (!details.ok) return null;
    if (
      !startsAt ||
      new Date(startsAt).getTime() <= Date.now() ||
      !["scheduled", "sales_open"].includes(statusText)
    ) {
      return {
        reply: "Dados inválidos. Use: 10/06/2026 22:00 | sales_open ou scheduled.",
        nextContext: withAdminEventsContext(baseContext, "admin_event_session_create_collecting", adminEvents),
      };
    }
    return {
      reply: [
        "Confirmar nova sessão?",
        `Data: ${formatDateTime(startsAt)}`,
        `Status: ${statusText}`,
        "",
        "Responda CONFIRMAR ou CANCELAR.",
      ].join("\n"),
      nextContext: withAdminEventsContext(baseContext, "admin_event_session_create_collecting", {
        ...adminEvents,
        draft: { startsAt, status: statusText, venueId: details.event.venueId },
        mode: "confirm_create_session",
      }),
    };
  }

  if (baseContext.state === "admin_event_session_edit_collecting") {
    const details = await getScopedAdminEventDetails(eventId, scope);
    if (!details.ok) return null;

    if (adminEvents.mode === "confirm_edit_session") {
      if (isCancelText(text)) return showAdminEventSessionsMenu(baseContext, scope, eventId);
      if (!isConfirmText(text)) {
        return {
          reply: "Responda CONFIRMAR ou CANCELAR.",
          nextContext: withAdminEventsContext(
            baseContext,
            "admin_event_session_edit_collecting",
            adminEvents,
          ),
        };
      }
      const result = await updateAdminSession(String(adminEvents.draft?.sessionId), {
        starts_at: adminEvents.draft?.startsAt
          ? String(adminEvents.draft.startsAt)
          : undefined,
        status: adminEvents.draft?.status
          ? (String(adminEvents.draft.status) as AdminSessionStatus)
          : undefined,
      });

      return {
        reply: result.ok ? "Sessão atualizada." : "Não consegui atualizar a sessão.",
        nextContext: withAdminEventsContext(baseContext, "admin_event_sessions_menu", {
          selectedEventId: eventId,
        }),
      };
    }

    if (adminEvents.mode === "confirm_cancel_session") {
      if (isCancelText(text)) return showAdminEventSessionsMenu(baseContext, scope, eventId);
      if (normalizeAdminText(text) !== "cancelar sessao") {
        return {
          reply: "Digite CANCELAR SESSÃO para confirmar ou CANCELAR para abandonar.",
          nextContext: withAdminEventsContext(
            baseContext,
            "admin_event_session_edit_collecting",
            adminEvents,
          ),
        };
      }
      const result = await updateAdminSession(String(adminEvents.draft?.sessionId), {
        status: "cancelled",
      });

      return {
        reply: result.ok
          ? "Sessão cancelada. Nenhum ticket, pagamento ou reserva foi apagado."
          : "Não consegui cancelar a sessão.",
        nextContext: withAdminEventsContext(baseContext, "admin_event_sessions_menu", {
          selectedEventId: eventId,
        }),
      };
    }

    if (adminEvents.mode === "cancel_session_select") {
      const session = selectSessionByOption(details.event, text);
      if (!session) {
        return {
          reply: "Sessão inválida. Envie o número da sessão.",
          nextContext: withAdminEventsContext(
            baseContext,
            "admin_event_session_edit_collecting",
            adminEvents,
          ),
        };
      }

      return {
        reply: [
          `Cancelar sessão ${formatDateTime(session.startsAt)}?`,
          "Não haverá exclusão física nem estorno automático neste passo.",
          "",
          "Digite CANCELAR SESSÃO para confirmar.",
        ].join("\n"),
        nextContext: withAdminEventsContext(
          baseContext,
          "admin_event_session_edit_collecting",
          {
            ...adminEvents,
            mode: "confirm_cancel_session",
            draft: { sessionId: session.sessionId },
          },
        ),
      };
    }

    const [sessionNumberRaw, valueRaw] = text.split("|").map((part) => part.trim());
    const session = selectSessionByOption(details.event, sessionNumberRaw ?? "");

    if (!session || !valueRaw) {
      return {
        reply: "Dados inválidos. Envie no formato indicado.",
        nextContext: withAdminEventsContext(
          baseContext,
          "admin_event_session_edit_collecting",
          adminEvents,
        ),
      };
    }

    if (adminEvents.mode === "edit_session_datetime") {
      const startsAt = parseBrazilianDateTime(valueRaw);
      if (!startsAt || new Date(startsAt).getTime() <= Date.now()) {
        return {
          reply: "Data inválida ou no passado. Use: 10/06/2026 22:30",
          nextContext: withAdminEventsContext(
            baseContext,
            "admin_event_session_edit_collecting",
            adminEvents,
          ),
        };
      }
      const usage = await getAdminSessionUsage(session.sessionId);
      if (!usage.ok) {
        return {
          reply: "Não consegui verificar reservas/ingressos dessa sessão agora.",
          nextContext: withAdminEventsContext(
            baseContext,
            "admin_event_session_edit_collecting",
            adminEvents,
          ),
        };
      }
      if (usage.hasUsage) {
        return {
          reply: [
            "Essa sessão já tem reservas ou ingressos vinculados.",
            "Para evitar quebrar ingressos emitidos, a alteração de data/hora está bloqueada neste fluxo.",
            "",
            "Ajuste operacional manual deve ser tratado em um passo específico.",
          ].join("\n"),
          nextContext: withAdminEventsContext(baseContext, "admin_event_sessions_menu", {
            selectedEventId: eventId,
          }),
        };
      }

      return {
        reply: [
          "Confirmar alteração da sessão?",
          `De: ${formatDateTime(session.startsAt)}`,
          `Para: ${formatDateTime(startsAt)}`,
          "",
          "Responda CONFIRMAR ou CANCELAR.",
        ].join("\n"),
        nextContext: withAdminEventsContext(
          baseContext,
          "admin_event_session_edit_collecting",
          {
            ...adminEvents,
            mode: "confirm_edit_session",
            draft: { sessionId: session.sessionId, startsAt },
          },
        ),
      };
    }

    const status = normalizeAdminText(valueRaw);
    if (!["scheduled", "sales_open", "sales_closed"].includes(status)) {
      return {
        reply:
          "Status inválido. Use scheduled, sales_open ou sales_closed. Para cancelar, use a opção Cancelar sessão.",
        nextContext: withAdminEventsContext(
          baseContext,
          "admin_event_session_edit_collecting",
          adminEvents,
        ),
      };
    }

    return {
      reply: [
        "Confirmar alteração de status da sessão?",
        `Sessão: ${formatDateTime(session.startsAt)}`,
        `Status atual: ${session.status}`,
        `Novo status: ${status}`,
        "",
        "Responda CONFIRMAR ou CANCELAR.",
      ].join("\n"),
      nextContext: withAdminEventsContext(
        baseContext,
        "admin_event_session_edit_collecting",
        {
          ...adminEvents,
          mode: "confirm_edit_session",
          draft: { sessionId: session.sessionId, status },
        },
      ),
    };
  }

  if (baseContext.state === "admin_event_sections_menu") {
    if (numericOption === 1) {
      return {
        reply: await renderSectionsList(eventId, scope),
        nextContext: withAdminEventsContext(baseContext, "admin_event_sections_menu", adminEvents),
      };
    }
    if (numericOption === 2) {
      return {
        reply: "Envie: Nome do setor | capacidade | numerado sim/não. Ex: Pista Premium | 500 | sim",
        nextContext: withAdminEventsContext(baseContext, "admin_event_section_create_collecting", adminEvents),
      };
    }
    if (numericOption === 3) {
      return {
        reply: [
          await renderSectionsList(eventId, scope),
          "",
          "Envie: número do setor | nome | capacidade | status | numerado sim/não.",
          "Ex: 1 | Pista Premium | 500 | active | sim",
        ].join("\n"),
        nextContext: withAdminEventsContext(baseContext, "admin_event_section_create_collecting", {
          ...adminEvents,
          mode: "edit_section",
        }),
      };
    }
    if (numericOption === 4) {
      return {
        reply: [
          "Envie: número do setor | fileiras/assentos.",
          "Ex: 1 | A 10 assentos 1 a 10",
          "Ex: 1 | A 10 assentos 10 a 1",
          "Você pode enviar várias linhas:",
          "1 | A 10 assentos 1 a 10",
          "B 15 assentos 11 a 25",
          "C 20 assentos 26 a 45",
        ].join("\n"),
        nextContext: withAdminEventsContext(baseContext, "admin_event_seats_create_collecting", adminEvents),
      };
    }
    if (numericOption === 5) {
      return {
        reply: [
          await renderSectionsList(eventId, scope),
          "",
          "Envie: número do setor | status | assentos.",
          "Ex: 1 | blocked | A01,A02 ou 1 | active | A01,A02",
        ].join("\n"),
        nextContext: withAdminEventsContext(baseContext, "admin_event_seats_create_collecting", {
          ...adminEvents,
          mode: "edit_seat_status",
        }),
      };
    }
    if (numericOption === 6) {
      return {
        reply: "Envie: número da sessão | número do setor ou todos. Ex: 1 | todos",
        nextContext: withAdminEventsContext(baseContext, "admin_event_session_seats_confirm", adminEvents),
      };
    }
    if (numericOption === 7) return showAdminEventDetails(baseContext, scope, eventId);
  }

  if (baseContext.state === "admin_event_section_create_collecting") {
    if (adminEvents.mode === "confirm_edit_section") {
      if (isCancelText(text)) {
        return showAdminEventSectionsMenu(baseContext, scope, eventId);
      }
      if (!isConfirmText(text)) {
        return {
          reply: "Responda CONFIRMAR ou CANCELAR.",
          nextContext: withAdminEventsContext(
            baseContext,
            "admin_event_section_create_collecting",
            adminEvents,
          ),
        };
      }
      const hasNumberedSeats = adminEvents.draft?.hasNumberedSeats;
      const result = await updateAdminSection(String(adminEvents.draft?.sectionId), {
        name: String(adminEvents.draft?.name),
        capacity:
          adminEvents.draft?.capacity === null
            ? null
            : Number(adminEvents.draft?.capacity),
        status: String(adminEvents.draft?.status) as AdminSectionStatus,
        ...(typeof hasNumberedSeats === "boolean"
          ? { has_numbered_seats: hasNumberedSeats }
          : {}),
      });

      return {
        reply: result.ok
          ? "Setor atualizado."
          : "Não consegui atualizar o setor.",
        nextContext: withAdminEventsContext(baseContext, "admin_event_sections_menu", {
          selectedEventId: eventId,
        }),
      };
    }

    if (adminEvents.mode === "confirm_create_section") {
      if (isCancelText(text)) {
        return showAdminEventSectionsMenu(baseContext, scope, eventId);
      }
      if (!isConfirmText(text)) {
        return {
          reply: "Responda CONFIRMAR ou CANCELAR.",
          nextContext: withAdminEventsContext(
            baseContext,
            "admin_event_section_create_collecting",
            adminEvents,
          ),
        };
      }
      const details = await getScopedAdminEventDetails(eventId, scope);
      if (!details.ok || !details.event.venueId) return null;
      const result = await createAdminSection({
        venueId: details.event.venueId,
        name: String(adminEvents.draft?.name),
        slug: String(adminEvents.draft?.slug),
        hasNumberedSeats: Boolean(adminEvents.draft?.hasNumberedSeats),
        capacity:
          adminEvents.draft?.capacity === null
            ? null
            : Number(adminEvents.draft?.capacity),
      });
      return {
        reply: result.ok
          ? "Setor criado."
          : "Não consegui criar o setor. Verifique se o slug já existe nesse local.",
        nextContext: withAdminEventsContext(baseContext, "admin_event_sections_menu", {
          selectedEventId: eventId,
        }),
      };
    }

    const details = await getScopedAdminEventDetails(eventId, scope);
    if (!details.ok || !details.event.venueId) return null;

    if (adminEvents.mode === "edit_section") {
      const [sectionNumberRaw, nameRaw, capacityRaw, statusRaw, numberedRaw] = text
        .split("|")
        .map((part) => part.trim());
      const section = selectSectionByOption(details.event, sectionNumberRaw ?? "");
      const capacity = capacityRaw ? Number(capacityRaw) : null;
      const status = normalizeAdminText(statusRaw ?? "");
      const numberedText = normalizeAdminText(numberedRaw ?? "");
      const hasNumberedSeats =
        numberedText === ""
          ? section?.hasNumberedSeats
          : ["sim", "s", "yes"].includes(numberedText)
            ? true
            : ["nao", "n", "no"].includes(numberedText)
              ? false
              : null;
      if (
        !section ||
        !nameRaw ||
        (capacity !== null && (!Number.isInteger(capacity) || capacity <= 0)) ||
        !["active", "inactive"].includes(status) ||
        hasNumberedSeats === null
      ) {
        return {
          reply: "Dados inválidos. Use: 1 | Pista Premium | 500 | active | sim",
          nextContext: withAdminEventsContext(
            baseContext,
            "admin_event_section_create_collecting",
            adminEvents,
          ),
        };
      }
      if (section.hasNumberedSeats !== hasNumberedSeats) {
        const usage = await getAdminSectionUsage(section.sectionId);
        if (!usage.ok) {
          return {
            reply: "Não consegui verificar reservas/ingressos desse setor agora.",
            nextContext: withAdminEventsContext(
              baseContext,
              "admin_event_section_create_collecting",
              adminEvents,
            ),
          };
        }
        if (usage.hasUsage) {
          return {
            reply: [
              "Esse setor já tem reservas, ingressos ou assentos de sessão ocupados.",
              "Para evitar quebrar vendas existentes, a alteração de assento marcado foi bloqueada neste fluxo.",
            ].join("\n"),
            nextContext: withAdminEventsContext(baseContext, "admin_event_sections_menu", {
              selectedEventId: eventId,
            }),
          };
        }
      }

      return {
        reply: [
          "Confirmar alteração do setor?",
          `Setor: ${section.name}`,
          `Novo nome: ${nameRaw}`,
          `Capacidade: ${capacity ?? "não definida"}`,
          `Status: ${status}`,
          `Assento marcado: ${hasNumberedSeats ? "sim" : "não"}`,
          "",
          "Responda CONFIRMAR ou CANCELAR.",
        ].join("\n"),
        nextContext: withAdminEventsContext(
          baseContext,
          "admin_event_section_create_collecting",
          {
            ...adminEvents,
            mode: "confirm_edit_section",
            draft: {
              sectionId: section.sectionId,
              name: nameRaw,
              capacity,
              status,
              hasNumberedSeats,
            },
          },
        ),
      };
    }

    const [nameRaw, capacityRaw, numberedRaw] = text.split("|").map((part) => part.trim());
    const capacity = capacityRaw ? Number(capacityRaw) : null;
    const numberedText = normalizeAdminText(numberedRaw ?? "sim");
    const hasNumberedSeats = ["nao", "n", "no"].includes(numberedText) ? false : true;
    const slug = normalizeSlug(nameRaw ?? "");
    if (
      !nameRaw ||
      !slug ||
      (capacity !== null && (!Number.isInteger(capacity) || capacity <= 0))
    ) {
      return {
        reply: "Dados inválidos. Use: Pista Premium | 500 | sim",
        nextContext: withAdminEventsContext(baseContext, "admin_event_section_create_collecting", adminEvents),
      };
    }
    return {
      reply: [
        "Confirmar criação do setor?",
        `Nome: ${nameRaw}`,
        `Slug: ${slug}`,
        `Capacidade: ${capacity ?? "não definida"}`,
        `Assento marcado: ${hasNumberedSeats ? "sim" : "não"}`,
        "",
        "Responda CONFIRMAR ou CANCELAR.",
      ].join("\n"),
      nextContext: withAdminEventsContext(
        baseContext,
        "admin_event_section_create_collecting",
        {
          ...adminEvents,
          mode: "confirm_create_section",
          draft: {
            name: nameRaw,
            slug,
            capacity,
            hasNumberedSeats,
          },
        },
      ),
    };
  }

  if (baseContext.state === "admin_event_seats_create_collecting") {
    if (adminEvents.mode === "confirm_edit_seat_status") {
      if (isCancelText(text)) {
        return showAdminEventSectionsMenu(baseContext, scope, eventId);
      }
      if (!isConfirmText(text)) {
        return {
          reply: "Responda CONFIRMAR ou CANCELAR.",
          nextContext: withAdminEventsContext(
            baseContext,
            "admin_event_seats_create_collecting",
            adminEvents,
          ),
        };
      }
      const result = await updateAdminSeatStatuses({
        sectionId: String(adminEvents.draft?.sectionId),
        seatCodes: (adminEvents.draft?.seatCodes as string[]) ?? [],
        status: String(adminEvents.draft?.status) as AdminSeatStatus,
      });

      return {
        reply: result.ok
          ? `Assentos atualizados: ${result.updatedCount}. Não encontrados: ${result.missingCount}.`
          : "Não consegui atualizar os assentos.",
        nextContext: withAdminEventsContext(baseContext, "admin_event_sections_menu", {
          selectedEventId: eventId,
        }),
      };
    }

    if (adminEvents.mode === "confirm_create_seats") {
      if (isCancelText(text)) {
        return showAdminEventSectionsMenu(baseContext, scope, eventId);
      }
      if (!isConfirmText(text)) {
        return {
          reply: "Responda CONFIRMAR ou CANCELAR.",
          nextContext: withAdminEventsContext(
            baseContext,
            "admin_event_seats_create_collecting",
            adminEvents,
          ),
        };
      }
      const details = await getScopedAdminEventDetails(eventId, scope);
      if (!details.ok || !details.event.venueId) return null;
      const result = await createAdminSeats({
        venueId: details.event.venueId,
        sectionId: String(adminEvents.draft?.sectionId),
        seatCodes: (adminEvents.draft?.seatCodes as string[]) ?? [],
      });
      return {
        reply: result.ok
          ? `Assentos criados: ${result.createdCount}. Ignorados por duplicidade: ${result.skippedCount}.`
          : "Não consegui criar os assentos.",
        nextContext: withAdminEventsContext(baseContext, "admin_event_sections_menu", {
          selectedEventId: eventId,
        }),
      };
    }

    const details = await getScopedAdminEventDetails(eventId, scope);
    if (!details.ok || !details.event.venueId) return null;

    if (adminEvents.mode === "edit_seat_status") {
      const [sectionNumberRaw, statusRaw, seatsRaw] = text.split("|").map((part) => part.trim());
      const section = selectSectionByOption(details.event, sectionNumberRaw ?? "");
      const status = normalizeAdminText(statusRaw ?? "");
      const seatCodes = parseSeatCodesOrRange(seatsRaw ?? "");

      if (!section || !["active", "inactive", "blocked"].includes(status) || !seatCodes.length) {
        return {
          reply: "Dados inválidos. Use: 1 | blocked | A01,A02",
          nextContext: withAdminEventsContext(
            baseContext,
            "admin_event_seats_create_collecting",
            adminEvents,
          ),
        };
      }
      if (["inactive", "blocked"].includes(status)) {
        const usage = await getAdminSeatOperationalUsage({
          sectionId: section.sectionId,
          seatCodes,
        });
        if (!usage.ok) {
          return {
            reply: "Não consegui verificar reservas/vendas desses assentos agora.",
            nextContext: withAdminEventsContext(
              baseContext,
              "admin_event_seats_create_collecting",
              adminEvents,
            ),
          };
        }
        if (usage.hasBusySeats) {
          return {
            reply: [
              "Um ou mais assentos informados estão reservados ou vendidos em alguma sessão.",
              "A alteração estrutural foi bloqueada para não afetar vendas existentes.",
            ].join("\n"),
            nextContext: withAdminEventsContext(baseContext, "admin_event_sections_menu", {
              selectedEventId: eventId,
            }),
          };
        }
      }

      return {
        reply: [
          "Confirmar alteração dos assentos?",
          `Setor: ${section.name}`,
          `Status: ${status}`,
          `Quantidade: ${seatCodes.length}`,
          `Assentos: ${seatCodes.slice(0, 20).join(", ")}${seatCodes.length > 20 ? "..." : ""}`,
          "",
          "Responda CONFIRMAR ou CANCELAR.",
        ].join("\n"),
        nextContext: withAdminEventsContext(baseContext, "admin_event_seats_create_collecting", {
          ...adminEvents,
          mode: "confirm_edit_seat_status",
          draft: {
            sectionId: section.sectionId,
            status,
            seatCodes,
          },
        }),
      };
    }

    const [sectionNumberRaw, ...seatParts] = text.split("|").map((part) => part.trim());
    const seatsRaw = seatParts.join("|");
    const section = details.event.sections[Number(sectionNumberRaw) - 1];
    const seatCodes = parseSeatCodesOrRange(seatsRaw ?? "");
    if (!section || !seatCodes.length) {
      return {
        reply: "Dados inválidos. Use: 1 | A01,A02,A03",
        nextContext: withAdminEventsContext(baseContext, "admin_event_seats_create_collecting", adminEvents),
      };
    }
    if (!section.hasNumberedSeats) {
      return {
        reply: "Esse setor não usa assento marcado. Altere o setor com cuidado antes de cadastrar assentos.",
        nextContext: withAdminEventsContext(baseContext, "admin_event_sections_menu", {
          selectedEventId: eventId,
        }),
      };
    }
    return {
      reply: [
        "Confirmar criação de assentos?",
        `Setor: ${section.name}`,
        `Quantidade: ${seatCodes.length}`,
        `Prévia: ${seatCodes.slice(0, 20).join(", ")}${seatCodes.length > 20 ? "..." : ""}`,
        "",
        "Responda CONFIRMAR ou CANCELAR.",
      ].join("\n"),
      nextContext: withAdminEventsContext(baseContext, "admin_event_seats_create_collecting", {
        ...adminEvents,
        mode: "confirm_create_seats",
        draft: { sectionId: section.sectionId, seatCodes },
      }),
    };
  }

  if (baseContext.state === "admin_event_session_seats_confirm") {
    if (adminEvents.mode === "confirm_create_session_seats") {
      if (isCancelText(text)) {
        return showAdminEventSectionsMenu(baseContext, scope, eventId);
      }
      if (!isConfirmText(text)) {
        return {
          reply: "Responda CONFIRMAR ou CANCELAR.",
          nextContext: withAdminEventsContext(
            baseContext,
            "admin_event_session_seats_confirm",
            adminEvents,
          ),
        };
      }
      const result = await createMissingSessionSeats({
        sessionId: String(adminEvents.draft?.sessionId),
        sectionIds: (adminEvents.draft?.sectionIds as string[]) ?? [],
      });
      return {
        reply: result.ok
          ? `Assentos da sessão criados: ${result.createdCount}. Já existentes: ${result.skippedCount}.`
          : "Não consegui criar os assentos da sessão.",
        nextContext: withAdminEventsContext(baseContext, "admin_event_sections_menu", {
          selectedEventId: eventId,
        }),
      };
    }

    const details = await getScopedAdminEventDetails(eventId, scope);
    if (!details.ok) return null;
    const [sessionNumberRaw, sectionNumberRaw] = text.split("|").map((part) => part.trim());
    const session = details.event.sessions[Number(sessionNumberRaw) - 1];
    const sectionIds =
      normalizeAdminText(sectionNumberRaw ?? "") === "todos"
        ? details.event.sections.map((section) => section.sectionId)
        : [details.event.sections[Number(sectionNumberRaw) - 1]?.sectionId].filter(Boolean);
    if (!session || !sectionIds.length) {
      return {
        reply: "Dados inválidos. Use: 1 | todos ou 1 | 2",
        nextContext: withAdminEventsContext(baseContext, "admin_event_session_seats_confirm", adminEvents),
      };
    }
    return {
      reply: [
        "Confirmar criação de assentos da sessão?",
        `Sessão: ${formatDateTime(session.startsAt)}`,
        `Setores: ${sectionIds.length}`,
        "",
        "Responda CONFIRMAR ou CANCELAR.",
      ].join("\n"),
      nextContext: withAdminEventsContext(baseContext, "admin_event_session_seats_confirm", {
        ...adminEvents,
        mode: "confirm_create_session_seats",
        draft: { sessionId: session.sessionId, sectionIds },
      }),
    };
  }

  if (baseContext.state === "admin_event_prices_menu") {
    if (numericOption === 1) {
      const list = await getAdminPriceListForEvent(eventId, scope);
      return {
        reply: list.reply,
        nextContext: withAdminEventsContext(baseContext, "admin_event_price_edit_collecting", {
          ...adminEvents,
          mode: "view_prices",
          draft: list.ok ? { lastPrices: list.prices } : adminEvents.draft,
        }),
      };
    }
    if (numericOption === 2) {
      return {
        reply: [
          "Envie: sessão | setor | tipo | label | preço | taxa | início opcional | fim opcional.",
          "Ex: 1 | 1 | full | Inteira | 120,00 | 12,00 | - | -",
          "Tipos: full, half, promotional/free. Também aceito promo/courtesy como apelidos.",
        ].join("\n"),
        nextContext: withAdminEventsContext(baseContext, "admin_event_price_create_collecting", adminEvents),
      };
    }
    if (numericOption === 3) {
      const list = await getAdminPriceListForEvent(eventId, scope);
      return {
        reply: [
          list.ok
            ? [
                `Preços de ${list.eventTitle}:`,
                "",
                ...(list.prices.length
                  ? list.prices.map(
                      (price) => `${price.option}. ${formatCompactAdminPriceLabel(price.label)}`,
                    )
                  : ["Nenhum preço cadastrado."]),
              ].join("\n")
            : list.reply,
          "",
          "QUAL PREÇO DESEJA EDITAR?",
          "Responda com o número do preço.",
        ].join("\n"),
        nextContext: withAdminEventsContext(baseContext, "admin_event_price_edit_collecting", {
          ...adminEvents,
          mode: "select_price_value",
          draft: list.ok ? { lastPrices: list.prices } : {},
        }),
      };
    }
    if (numericOption === 4) {
      const list = await getAdminPriceListForEvent(eventId, scope);
      return {
        reply: [
          list.reply,
          "",
          "Envie: número do preço | active ou inactive.",
          "Ex: 1 | inactive",
        ].join("\n"),
        nextContext: withAdminEventsContext(baseContext, "admin_event_price_edit_collecting", {
          ...adminEvents,
          mode: "price_status",
          draft: list.ok ? { lastPrices: list.prices } : {},
        }),
      };
    }
    if (numericOption === 5) return showAdminEventDetails(baseContext, scope, eventId);
  }

  if (baseContext.state === "admin_event_price_edit_collecting") {
    if (adminEvents.mode === "confirm_edit_price") {
      if (isCancelText(text)) return showAdminEventPricesMenu(baseContext, scope, eventId);
      if (!isConfirmText(text)) {
        return {
          reply: "Responda CONFIRMAR ou CANCELAR.",
          nextContext: withAdminEventsContext(
            baseContext,
            "admin_event_price_edit_collecting",
            adminEvents,
          ),
        };
      }

      const result = await updateAdminPrice(String(adminEvents.draft?.priceId), {
        label: adminEvents.draft?.label ? String(adminEvents.draft.label) : undefined,
        price_cents:
          adminEvents.draft?.priceCents === undefined
            ? undefined
            : Number(adminEvents.draft.priceCents),
        fee_cents:
          adminEvents.draft?.feeCents === undefined
            ? undefined
            : Number(adminEvents.draft.feeCents),
        sales_start_at:
          adminEvents.draft?.salesStartAt === undefined
            ? undefined
            : adminEvents.draft.salesStartAt === null
              ? null
              : String(adminEvents.draft.salesStartAt),
        sales_end_at:
          adminEvents.draft?.salesEndAt === undefined
            ? undefined
            : adminEvents.draft.salesEndAt === null
              ? null
              : String(adminEvents.draft.salesEndAt),
        status: adminEvents.draft?.status
          ? (String(adminEvents.draft.status) as AdminTicketPriceStatus)
          : undefined,
      });

      return {
        reply: result.ok
          ? "Preço/lote atualizado. Reservas já criadas mantêm o valor congelado."
          : "Não consegui atualizar o preço/lote.",
        nextContext: withAdminEventsContext(baseContext, "admin_event_prices_menu", {
          selectedEventId: eventId,
        }),
      };
    }

    const lastPrices = getDraftArray<{
      option: number;
      priceId: string;
      label: string;
      priceCents: number;
      feeCents: number;
      status: string;
    }>(adminEvents.draft, "lastPrices");

    if (adminEvents.mode === "collect_price_value") {
      const priceCents = parseMoneyToCents(text);
      if (priceCents === null) {
        return {
          reply: withAdminNavigationHint([
            "VALOR INVÁLIDO",
            "",
            "Digite somente o novo valor.",
            "Ex: 140,00",
          ].join("\n")),
          nextContext: withAdminEventsContext(
            baseContext,
            "admin_event_price_edit_collecting",
            adminEvents,
          ),
        };
      }

      const result = await updateAdminPrice(String(adminEvents.draft?.priceId), {
        price_cents: priceCents,
      });

      return {
        reply: withAdminNavigationHint([
          result.ok ? "*VALOR ATUALIZADO*" : "Não consegui atualizar o valor.",
          ...(result.ok
            ? [
                `> Preço: ${String(adminEvents.draft?.priceLabel ?? "Preço")}`,
                `> Valor anterior: ${formatCurrencyFromCents(Number(adminEvents.draft?.oldPriceCents ?? 0))}`,
                `> Novo valor: ${formatCurrencyFromCents(priceCents)}`,
                "",
                "Reservas já criadas mantêm o valor congelado. A alteração afeta novas reservas.",
              ]
            : []),
        ].join("\n")),
        nextContext: withAdminEventsContext(baseContext, "admin_event_price_edit_collecting", {
          selectedEventId: eventId,
          mode: "price_value_updated",
        }),
      };
    }

    if (adminEvents.mode === "view_prices" || adminEvents.mode === "price_value_updated") {
      return {
        reply: withAdminNavigationHint("Digite \"Voltar\" para voltar ao menu de valores."),
        nextContext: withAdminEventsContext(
          baseContext,
          "admin_event_price_edit_collecting",
          adminEvents,
        ),
      };
    }

    const [priceNumberRaw, valueOneRaw, valueTwoRaw, valueThreeRaw, salesStartRaw, salesEndRaw] = text
      .split("|")
      .map((part) => part.trim());
    const price = lastPrices.find((item) => item.option === Number(priceNumberRaw));

    if (!price) {
      return {
        reply: "Preço inválido. Liste os preços novamente e envie o número correspondente.",
        nextContext: withAdminEventsContext(
          baseContext,
          "admin_event_price_edit_collecting",
          adminEvents,
        ),
      };
    }

    if (adminEvents.mode === "select_price_value") {
      return {
        reply: withAdminNavigationHint([
          `*NOVO VALOR - ${price.label.toUpperCase()}*`,
          "",
          "Digite somente o novo valor.",
          "Ex: 140,00",
        ].join("\n")),
        nextContext: withAdminEventsContext(baseContext, "admin_event_price_edit_collecting", {
          ...adminEvents,
          mode: "collect_price_value",
          draft: {
            priceId: price.priceId,
            priceLabel: price.label,
            oldPriceCents: price.priceCents,
          },
        }),
      };
    }

    if (adminEvents.mode === "price_status") {
      const status = normalizeAdminText(valueOneRaw ?? "");
      if (!["active", "inactive"].includes(status)) {
        return {
          reply: "Status inválido. Use active ou inactive.",
          nextContext: withAdminEventsContext(
            baseContext,
            "admin_event_price_edit_collecting",
            adminEvents,
          ),
        };
      }

      return {
        reply: [
          "Confirmar alteração do preço/lote?",
          `Preço: ${price.label}`,
          `Status atual: ${price.status}`,
          `Novo status: ${status}`,
          "",
          "Responda CONFIRMAR ou CANCELAR.",
        ].join("\n"),
        nextContext: withAdminEventsContext(baseContext, "admin_event_price_edit_collecting", {
          ...adminEvents,
          mode: "confirm_edit_price",
          draft: { priceId: price.priceId, status },
        }),
      };
    }

    const priceCents = parseMoneyToCents(valueTwoRaw ?? "");
    const feeCents = parseMoneyToCents(valueThreeRaw ?? "");
    const salesStart = parseOptionalAdminDateTime(salesStartRaw);
    const salesEnd = parseOptionalAdminDateTime(salesEndRaw);
    if (
      !valueOneRaw ||
      priceCents === null ||
      feeCents === null ||
      !salesStart.ok ||
      !salesEnd.ok ||
      (salesStart.value &&
        salesEnd.value &&
        new Date(salesStart.value).getTime() >= new Date(salesEnd.value).getTime())
    ) {
      return {
        reply: "Dados inválidos. Use: 1 | Inteira 2 lote | 140,00 | 14,00 | - | -",
        nextContext: withAdminEventsContext(
          baseContext,
          "admin_event_price_edit_collecting",
          adminEvents,
        ),
      };
    }

    return {
      reply: [
        "Confirmar alteração do preço/lote?",
        `Preço: ${price.label}`,
        `Novo label: ${valueOneRaw}`,
        `Novo valor: ${formatCurrencyFromCents(priceCents)}`,
        `Nova taxa: ${formatCurrencyFromCents(feeCents)}`,
        `Início: ${salesStart.value ? formatDateTime(salesStart.value) : "livre"}`,
        `Fim: ${salesEnd.value ? formatDateTime(salesEnd.value) : "livre"}`,
        "",
        "Reservas já criadas mantêm o valor congelado. A alteração afeta novas reservas.",
        "",
        "Responda CONFIRMAR ou CANCELAR.",
      ].join("\n"),
      nextContext: withAdminEventsContext(baseContext, "admin_event_price_edit_collecting", {
        ...adminEvents,
        mode: "confirm_edit_price",
        draft: {
          priceId: price.priceId,
          label: valueOneRaw,
          priceCents,
          feeCents,
          salesStartAt: salesStart.value,
          salesEndAt: salesEnd.value,
        },
      }),
    };
  }

  if (baseContext.state === "admin_event_price_create_collecting") {
    if (adminEvents.mode === "confirm_create_price") {
      if (isCancelText(text)) {
        return showAdminEventPricesMenu(baseContext, scope, eventId);
      }
      if (!isConfirmText(text)) {
        return {
          reply: "Responda CONFIRMAR ou CANCELAR.",
          nextContext: withAdminEventsContext(
            baseContext,
            "admin_event_price_create_collecting",
            adminEvents,
          ),
        };
      }
      const result = await createAdminPrice({
        sessionId: String(adminEvents.draft?.sessionId),
        sectionId: String(adminEvents.draft?.sectionId),
        ticketType: String(adminEvents.draft?.ticketType) as AdminTicketType,
        label: String(adminEvents.draft?.label),
        priceCents: Number(adminEvents.draft?.priceCents),
        feeCents: Number(adminEvents.draft?.feeCents),
        salesStartAt:
          typeof adminEvents.draft?.salesStartAt === "string"
            ? adminEvents.draft.salesStartAt
            : null,
        salesEndAt:
          typeof adminEvents.draft?.salesEndAt === "string"
            ? adminEvents.draft.salesEndAt
            : null,
      });
      return {
        reply: result.ok
          ? "Preço/lote criado."
          : "Não consegui criar o preço. Se já existir esse tipo para sessão/setor, use edição.",
        nextContext: withAdminEventsContext(baseContext, "admin_event_prices_menu", {
          selectedEventId: eventId,
        }),
      };
    }

    const details = await getScopedAdminEventDetails(eventId, scope);
    if (!details.ok) return null;
    const [
      sessionRaw,
      sectionRaw,
      ticketTypeRaw,
      label,
      priceRaw,
      feeRaw,
      salesStartRaw,
      salesEndRaw,
    ] = text
      .split("|")
      .map((part) => part.trim());
    const session = details.event.sessions[Number(sessionRaw) - 1];
    const section = details.event.sections[Number(sectionRaw) - 1];
    const ticketType = parseAdminTicketType(ticketTypeRaw ?? "");
    const priceCents = parseMoneyToCents(priceRaw ?? "");
    const feeCents = parseMoneyToCents(feeRaw ?? "0");
    const salesStart = parseOptionalAdminDateTime(salesStartRaw);
    const salesEnd = parseOptionalAdminDateTime(salesEndRaw);
    if (
      !session ||
      !section ||
      !ticketType ||
      !label ||
      priceCents === null ||
      feeCents === null ||
      !salesStart.ok ||
      !salesEnd.ok ||
      (salesStart.value &&
        salesEnd.value &&
        new Date(salesStart.value).getTime() >= new Date(salesEnd.value).getTime())
    ) {
      return {
        reply: "Dados inválidos. Use: 1 | 1 | full | Inteira | 120,00 | 12,00 | - | -",
        nextContext: withAdminEventsContext(baseContext, "admin_event_price_create_collecting", adminEvents),
      };
    }
    return {
      reply: [
        "Confirmar criação do preço/lote?",
        `Sessão: ${formatDateTime(session.startsAt)}`,
        `Setor: ${section.name}`,
        `Tipo: ${ticketType}`,
        `Label: ${label}`,
        `Preço: ${formatCurrencyFromCents(priceCents)}`,
        `Taxa: ${formatCurrencyFromCents(feeCents)}`,
        "Moeda: BRL",
        `Início: ${salesStart.value ? formatDateTime(salesStart.value) : "livre"}`,
        `Fim: ${salesEnd.value ? formatDateTime(salesEnd.value) : "livre"}`,
        "",
        "Responda CONFIRMAR ou CANCELAR.",
      ].join("\n"),
      nextContext: withAdminEventsContext(baseContext, "admin_event_price_create_collecting", {
        ...adminEvents,
        mode: "confirm_create_price",
        draft: {
          sessionId: session.sessionId,
          sectionId: section.sectionId,
          ticketType,
          label,
          priceCents,
          feeCents,
          salesStartAt: salesStart.value,
          salesEndAt: salesEnd.value,
        },
      }),
    };
  }

  return null;
}

function messageForReservationFailure(
  result: Extract<ReserveSelectedSeatResult, { ok: false }>,
) {
  if (result.reason === "active_reservation_exists") {
    return TICKET_MESSAGES.reservationAlreadyCreated;
  }

  if (result.reason === "seat_not_available") {
    return TICKET_MESSAGES.seatInvalidOption;
  }

  if (result.reason === "seat_unavailable") {
    return TICKET_MESSAGES.seatInvalidOption;
  }

  if (result.reason === "not_enough_seats") {
    return "Não temos essa quantidade disponível nesse ingresso/setor. Envie uma quantidade menor.";
  }

  if (result.reason === "ticket_price_not_found") {
    return TICKET_MESSAGES.sectionPriceUnavailable;
  }

  if (result.reason === "session_not_available") {
    return TICKET_MESSAGES.sessionUnavailable;
  }

  if (
    result.reason === "customer_not_found" ||
    result.reason === "conversation_not_found"
  ) {
    return TICKET_MESSAGES.reservationGenericError;
  }

  return TICKET_MESSAGES.reservationGenericError;
}

function isUnavailableCheckoutFailure(
  result: Extract<CreateCheckoutForReservationResult, { ok: false }>,
) {
  return (
    result.reason === "order_not_found" ||
    result.reason === "order_not_payable" ||
    result.reason === "reservation_not_found" ||
    result.reason === "reservation_not_payable" ||
    result.reason === "reservation_expired" ||
    result.reason === "customer_not_found" ||
    result.reason === "reservation_items_not_found" ||
    result.reason === "reservation_seats_not_reserved" ||
    result.reason === "checkout_amount_mismatch"
  );
}

function formatCheckoutFailureMessage(
  result: Extract<CreateCheckoutForReservationResult, { ok: false }>,
) {
  if (result.reason === "reservation_expired") {
    return TICKET_MESSAGES.reservationExpired;
  }

  return isUnavailableCheckoutFailure(result)
    ? TICKET_MESSAGES.reservationUnavailableForPayment
    : TICKET_MESSAGES.checkoutGenericError;
}

function messageForBuyerReservationCancellation({
  expired,
  cancelResult,
}: {
  expired: boolean;
  cancelResult: Awaited<ReturnType<typeof cancelPendingReservationForCustomer>>;
}) {
  if (expired || (cancelResult.ok && cancelResult.status === "expired")) {
    return TICKET_MESSAGES.reservationExpired;
  }

  if (cancelResult.ok && cancelResult.status === "cancelled") {
    return TICKET_MESSAGES.reservationCancelled;
  }

  return TICKET_MESSAGES.buyerFlowReset;
}

function getConversationState(
  context: Record<string, unknown>,
): Partial<TicketConversationState> {
  return context && typeof context === "object"
    ? (context as Partial<TicketConversationState>)
    : {};
}

export async function routeTicketMessage({
  customer,
  conversation,
  text,
  mediaUrl,
}: RouteTicketMessageInput): Promise<RouteTicketMessageOutput> {
  const previousState = getConversationState(conversation.context);
  const baseContext = {
    ...buildInitialConversationState(),
    ...previousState,
    updatedAt: new Date().toISOString(),
  };
  const gateCommand = parseGateCommand(text);
  const reservedAdminCommand = isReservedAdminCommand(text);

  if (previousState.state === "admin_auth_pending") {
    const adminUserResult = await ensureAdminUserForPhone(customer.whatsapp_phone);

    if (!adminUserResult.ok) {
      return {
        reply: TICKET_MESSAGES.adminReservedNeutral,
        nextContext: {
          ...baseContext,
          step: "idle",
          state: "idle",
          admin: undefined,
        },
      };
    }

    if (!(await verifyAdminUserPassphrase(customer.whatsapp_phone, text))) {
      return {
        reply: TICKET_MESSAGES.adminAuthInvalid,
        nextContext: {
          ...baseContext,
          step: "admin_auth_pending",
          state: "admin_auth_pending",
          admin: buildAdminContext({
            adminUserId: adminUserResult.adminUser.id,
            role: adminUserResult.adminUser.role,
          }),
        },
      };
    }

    const sessionResult = await createAdminSession(adminUserResult.adminUser);

    if (!sessionResult.ok) {
      return {
        reply: TICKET_MESSAGES.adminGenericError,
        nextContext: {
          ...baseContext,
          step: "idle",
          state: "idle",
          admin: undefined,
        },
      };
    }

    return {
      reply: formatAdminMenu(adminUserResult.adminUser.role),
      nextContext: {
        ...baseContext,
        step: "admin_menu",
        state: "admin_menu",
        admin: buildAdminContext({
          adminUserId: adminUserResult.adminUser.id,
          role: adminUserResult.adminUser.role,
          sessionId: sessionResult.adminSession.id,
          expiresAt: sessionResult.adminSession.expires_at,
        }),
      },
    };
  }

  if (isGateAccessFlowState(previousState.state)) {
    if (previousState.state === "gate_access_selecting") {
      const option = text.trim().match(/^\d+$/) ? Number(text.trim()) : null;
      const selected = option
        ? baseContext.gateAccess?.lastAccesses?.find(
            (access) => access.option === option,
          )
        : null;

      if (!selected) {
        return {
          reply: renderGateAccessSelectionFromContext(
            baseContext.gateAccess?.lastAccesses,
          ),
          nextContext: baseContext,
        };
      }

      return {
        reply: renderGateAccessPassphrasePrompt(selected.eventTitle),
        nextContext: {
          ...baseContext,
          step: "gate_access_passphrase_collecting",
          state: "gate_access_passphrase_collecting",
          gateAccess: {
            ...baseContext.gateAccess,
            selectedAccessId: selected.gateAccessId,
          },
        },
      };
    }

    const selectedAccessId = baseContext.gateAccess?.selectedAccessId;

    if (!selectedAccessId) {
      return {
        reply:
          "Não encontrei acesso de portaria ativo para este telefone.",
        nextContext: {
          ...baseContext,
          step: "idle",
          state: "idle",
          gateAccess: undefined,
        },
      };
    }

    const gateSessionResult = await createGateSessionForGateAccess({
      accessId: selectedAccessId,
      validatorPhone: customer.whatsapp_phone,
      passphrase: text,
    });

    if (!gateSessionResult.ok) {
      return {
        reply:
          gateSessionResult.reason === "invalid_passphrase"
            ? "Palavra-chave inválida."
            : "Não encontrei acesso de portaria ativo para este telefone.",
        nextContext:
          gateSessionResult.reason === "invalid_passphrase"
            ? baseContext
            : {
                ...baseContext,
                step: "idle",
                state: "idle",
                gateAccess: undefined,
              },
      };
    }

    return {
      reply: buildGateCheckInReply({
        gateUrl: gateSessionResult.gateUrl,
        expiresAt: gateSessionResult.gateSession.expires_at,
      }),
      nextContext: {
        ...baseContext,
        step: "idle",
        state: "idle",
        gateAccess: undefined,
      },
    };
  }

  if (
    reservedAdminCommand &&
    previousState.state !== "admin_menu" &&
    !isAdminSubmenuState(previousState.state) &&
    !previousState.admin?.sessionId
  ) {
    if (!(await isAuthorizedAdminPhone(customer.whatsapp_phone))) {
      return {
        reply: TICKET_MESSAGES.adminReservedNeutral,
        nextContext: {
          ...baseContext,
          step: "idle",
          state: "idle",
          admin: undefined,
        },
      };
    }

    const adminUserResult = await ensureAdminUserForPhone(customer.whatsapp_phone);

    if (!adminUserResult.ok) {
      return {
        reply: TICKET_MESSAGES.adminReservedNeutral,
        nextContext: {
          ...baseContext,
          step: "idle",
          state: "idle",
          admin: undefined,
        },
      };
    }

    return {
      reply: TICKET_MESSAGES.adminAuthPrompt,
      nextContext: {
        ...baseContext,
        step: "admin_auth_pending",
        state: "admin_auth_pending",
        admin: buildAdminContext({
          adminUserId: adminUserResult.adminUser.id,
          role: adminUserResult.adminUser.role,
        }),
      },
    };
  }

  if (
    previousState.state === "admin_menu" ||
    isAdminSubmenuState(previousState.state) ||
    previousState.admin?.sessionId
  ) {
    const adminReplyContext = ({
      state,
      role,
      sessionId,
      adminUserId,
      expiresAt,
    }: {
      state: TicketConversationStep;
      role: AdminRole;
      sessionId: string;
      adminUserId: string;
      expiresAt: string;
    }) => ({
      ...baseContext,
      step: state,
      state,
      admin: buildAdminContext({
        adminUserId,
        role,
        sessionId,
        expiresAt,
      }),
    });

    const endAdminSession = async () => {
      await revokeActiveAdminSessions(customer.whatsapp_phone);

      return {
        reply: "Sessão administrativa encerrada com segurança.\n\nPara acessar novamente, envie admin.",
        nextContext: {
          ...buildInitialConversationState(),
          updatedAt: new Date().toISOString(),
        },
      };
    };

    if (isAdminLogoutCommand(text)) {
      return endAdminSession();
    }

    const sessionResult = await getActiveAdminSession(customer.whatsapp_phone);

    if (!sessionResult.ok || !sessionResult.adminSession) {
      return {
        reply: TICKET_MESSAGES.adminSessionExpired,
        nextContext: {
          ...baseContext,
          step: "idle",
          state: "idle",
          admin: undefined,
        },
      };
    }

    const adminUserResult = await getAdminUserByPhone(customer.whatsapp_phone);

    if (
      !adminUserResult.ok ||
      !adminUserResult.adminUser ||
      adminUserResult.adminUser.status !== "active"
    ) {
      return {
        reply: TICKET_MESSAGES.adminReservedNeutral,
        nextContext: {
          ...baseContext,
          step: "idle",
          state: "idle",
          admin: undefined,
        },
      };
    }

    const { adminUser } = adminUserResult;
    const adminSession = sessionResult.adminSession;
    const numericOption = text.trim().match(/^\d+$/)
      ? Number(text.trim())
      : null;
    const typedMainMenuOption = numericOption
      ? null
      : parseAdminMainMenuOption(text);

    if (typedMainMenuOption === 7) {
      return endAdminSession();
    }

    if (normalizeAdminText(text) === "menu") {
      return {
        reply: formatAdminMenu(adminUser.role),
        nextContext: adminReplyContext({
          state: "admin_menu",
          role: adminUser.role,
          sessionId: adminSession.id,
          adminUserId: adminUser.id,
          expiresAt: adminSession.expires_at,
        }),
      };
    }

    if (isAdminOrdersFlowState(baseContext.state)) {
      const ordersSubmenu = ADMIN_SUBMENUS.admin_orders_menu;

      if (!canAccessAdminMenu(adminUser.role, ordersSubmenu)) {
        return {
          reply: ADMIN_MENU_UNAVAILABLE_MESSAGE,
          nextContext: adminReplyContext({
            state: "admin_menu",
            role: adminUser.role,
            sessionId: adminSession.id,
            adminUserId: adminUser.id,
            expiresAt: adminSession.expires_at,
          }),
        };
      }

      const submenuOption = parseAdminSubmenuOption(text);

      if (submenuOption === "menu" || submenuOption === "back") {
        return {
          reply: renderAdminSubmenu(ordersSubmenu),
          nextContext: adminReplyContext({
            state: "admin_orders_menu",
            role: adminUser.role,
            sessionId: adminSession.id,
            adminUserId: adminUser.id,
            expiresAt: adminSession.expires_at,
          }),
        };
      }

      if (submenuOption === "exit") {
        return endAdminSession();
      }

      if (baseContext.state === "admin_order_phone_collecting") {
        const phone = normalizeGatePhone(text) ?? text.replace(/\D/g, "");

        if (phone.length < 10) {
          return {
            reply: withAdminNavigationHint(
              "Envie um telefone com DDD para buscar os ingressos.",
            ),
            nextContext: adminReplyContext({
              state: "admin_order_phone_collecting",
              role: adminUser.role,
              sessionId: adminSession.id,
              adminUserId: adminUser.id,
              expiresAt: adminSession.expires_at,
            }),
          };
        }

        const result = await findAdminTicketsByPhone(phone);
        const ticketBlocks = result.tickets.map((ticket, index) =>
          formatAdminTicketForPhoneSearch(ticket, index + 1),
        );
        const reservationBlocks = result.pendingReservations.map(
          (reservation, index) =>
            formatAdminPendingReservation(reservation, index + 1),
        );
        const reply = [
          "*BUSCA POR TELEFONE*",
          "",
          result.customer
            ? `Telefone: ${result.customer.whatsapp_phone}`
            : `Telefone: ${phone}`,
          "",
          "*INGRESSOS:*",
          ticketBlocks.length > 0
            ? ticketBlocks.join("\n---\n")
            : "Nenhum ingresso encontrado.",
          "",
          "*RESERVAS PENDENTES:*",
          reservationBlocks.length > 0
            ? reservationBlocks.join("\n---\n")
            : "Nenhuma reserva pendente encontrada.",
        ].join("\n");

        return {
          reply: withAdminNavigationHint(reply),
          nextContext: adminReplyContext({
            state: "admin_orders_menu",
            role: adminUser.role,
            sessionId: adminSession.id,
            adminUserId: adminUser.id,
            expiresAt: adminSession.expires_at,
          }),
        };
      }

      if (
        baseContext.state === "admin_order_code_collecting" ||
        baseContext.state === "admin_ticket_consult_collecting"
      ) {
        const ticket = await findAdminTicketByCode(text);

        if (!ticket) {
          return {
            reply: withAdminNavigationHint(
              "Ingresso não encontrado. Confira o código e tente novamente.",
            ),
            nextContext: adminReplyContext({
              state: baseContext.state,
              role: adminUser.role,
              sessionId: adminSession.id,
              adminUserId: adminUser.id,
              expiresAt: adminSession.expires_at,
            }),
          };
        }

        const validations =
          baseContext.state === "admin_ticket_consult_collecting"
            ? await listAdminTicketValidations(ticket.ticketId)
            : [];
        const reply = [
          baseContext.state === "admin_ticket_consult_collecting"
            ? "*CONSULTA DE TICKET*"
            : "*INGRESSO ENCONTRADO*",
          "",
          formatAdminTicket(ticket),
          ...(baseContext.state === "admin_ticket_consult_collecting"
            ? ["", "*VALIDAÇÕES:*", formatAdminTicketValidations(validations)]
            : []),
        ].join("\n");

        return {
          reply: withAdminNavigationHint(reply),
          nextContext: adminReplyContext({
            state: "admin_orders_menu",
            role: adminUser.role,
            sessionId: adminSession.id,
            adminUserId: adminUser.id,
            expiresAt: adminSession.expires_at,
          }),
        };
      }

      if (baseContext.state === "admin_order_cancel_collecting") {
        const result = await cancelAdminPendingReservation(text);

        if (!result.ok) {
          return {
            reply: withAdminNavigationHint(
              result.reason === "not_found"
                ? "Nenhuma reserva pendente ativa foi encontrada para esse dado."
                : "Não foi possível cancelar a reserva agora. Tente novamente.",
            ),
            nextContext: adminReplyContext({
              state: "admin_order_cancel_collecting",
              role: adminUser.role,
              sessionId: adminSession.id,
              adminUserId: adminUser.id,
              expiresAt: adminSession.expires_at,
            }),
          };
        }

        const reply = [
          result.cancelResult.status === "expired"
            ? "*RESERVA EXPIRADA*"
            : "*RESERVA CANCELADA*",
          "",
          formatAdminPendingReservation(result.reservation),
          "",
          `Assentos liberados: ${result.cancelResult.releasedSeatsCount}`,
        ].join("\n");

        return {
          reply: withAdminNavigationHint(reply),
          nextContext: adminReplyContext({
            state: "admin_orders_menu",
            role: adminUser.role,
            sessionId: adminSession.id,
            adminUserId: adminUser.id,
            expiresAt: adminSession.expires_at,
          }),
        };
      }
    }

    if (isAdminCourtesyFlowState(baseContext.state)) {
      const courtesiesSubmenu = ADMIN_SUBMENUS.admin_courtesies_menu;
      const scope = buildAdminEventScope(adminUser);
      const adminCourtesies = getAdminCourtesiesContext(baseContext);
      const submenuOption = parseAdminSubmenuOption(text);

      if (!canAccessAdminMenu(adminUser.role, courtesiesSubmenu)) {
        return {
          reply: ADMIN_MENU_UNAVAILABLE_MESSAGE,
          nextContext: adminReplyContext({
            state: "admin_menu",
            role: adminUser.role,
            sessionId: adminSession.id,
            adminUserId: adminUser.id,
            expiresAt: adminSession.expires_at,
          }),
        };
      }

      if (submenuOption === "exit") {
        return endAdminSession();
      }

      if (submenuOption === "menu") {
        return {
          reply: renderAdminSubmenu(courtesiesSubmenu),
          nextContext: adminReplyContext({
            state: "admin_courtesies_menu",
            role: adminUser.role,
            sessionId: adminSession.id,
            adminUserId: adminUser.id,
            expiresAt: adminSession.expires_at,
          }),
        };
      }

      if (submenuOption === "back") {
        if (baseContext.state === "admin_courtesy_generate_type") {
          return {
            reply: renderAdminSubmenu(courtesiesSubmenu),
            nextContext: adminReplyContext({
              state: "admin_courtesies_menu",
              role: adminUser.role,
              sessionId: adminSession.id,
              adminUserId: adminUser.id,
              expiresAt: adminSession.expires_at,
            }),
          };
        }

        if (baseContext.state === "admin_courtesy_phone_collecting") {
          return {
            reply: [
              "*GERAR CORTESIA*",
              "",
              "> 1. Individual",
              "> 2. Lote",
              "> 3. Voltar",
              "> 4. Sair",
            ].join("\n"),
            nextContext: withAdminCourtesiesContext(
              baseContext,
              "admin_courtesy_generate_type",
              {},
            ),
          };
        }

        return {
          reply: renderAdminSubmenu(courtesiesSubmenu),
          nextContext: adminReplyContext({
            state: "admin_courtesies_menu",
            role: adminUser.role,
            sessionId: adminSession.id,
            adminUserId: adminUser.id,
            expiresAt: adminSession.expires_at,
          }),
        };
      }

      if (baseContext.state === "admin_courtesy_generate_type") {
        const option = text.trim().match(/^\d+$/) ? Number(text.trim()) : null;

        if (option === 4) return endAdminSession();
        if (option === 3) {
          return {
            reply: renderAdminSubmenu(courtesiesSubmenu),
            nextContext: adminReplyContext({
              state: "admin_courtesies_menu",
              role: adminUser.role,
              sessionId: adminSession.id,
              adminUserId: adminUser.id,
              expiresAt: adminSession.expires_at,
            }),
          };
        }

        if (option !== 1 && option !== 2) {
          return {
            reply: [
              "*GERAR CORTESIA*",
              "",
              "> 1. Individual",
              "> 2. Lote",
              "> 3. Voltar",
              "> 4. Sair",
            ].join("\n"),
            nextContext: withAdminCourtesiesContext(
              baseContext,
              "admin_courtesy_generate_type",
              {},
            ),
          };
        }

        return {
          reply:
            option === 1
              ? "*CORTESIA INDIVIDUAL*\n\nEnvie o telefone que receberá a cortesia."
              : "*CORTESIA EM LOTE*\n\nEnvie a lista de telefones, separados por vírgula, espaço ou linha.",
          nextContext: withAdminCourtesiesContext(
            baseContext,
            "admin_courtesy_phone_collecting",
            { mode: option === 1 ? "single" : "batch" },
          ),
        };
      }

      if (baseContext.state === "admin_courtesy_phone_collecting") {
        const phones = parseCourtesyPhones(text);

        if (phones.length === 0 || (adminCourtesies.mode === "single" && phones.length !== 1)) {
          return {
            reply:
              adminCourtesies.mode === "single"
                ? "Envie um telefone válido com DDD."
                : "Envie pelo menos um telefone válido com DDD.",
            nextContext: withAdminCourtesiesContext(
              baseContext,
              "admin_courtesy_phone_collecting",
              adminCourtesies,
            ),
          };
        }

        return buildAdminCourtesyEventSelect({
          baseContext,
          scope,
          state: "admin_courtesy_event_select",
          title: "ESCOLHA O EVENTO PARA A CORTESIA",
          context: { ...adminCourtesies, phones },
        });
      }

      if (baseContext.state === "admin_courtesy_cancel_target_collecting") {
        const eventId = adminCourtesies.selectedEventId;
        const cancelMethod = adminCourtesies.cancelMethod;
        const target =
          cancelMethod === "phone"
            ? (() => {
                const phone = normalizeCourtesyPhone(text);
                return phone ? { phone } : null;
              })()
            : cancelMethod === "code"
              ? /^TCK-[A-Z0-9]+$/i.test(text.trim())
                ? { ticketCode: text.trim().toUpperCase() }
                : null
              : resolveCourtesyCancelTarget(
                  text,
                  adminCourtesies.lastCourtesies ?? [],
                );

        if (!eventId || !target) {
          return {
            reply:
              cancelMethod === "phone"
                ? "Telefone inválido. Digite o número de telefone da cortesia."
                : cancelMethod === "code"
                  ? "Código inválido. Digite o código do ticket. Ex: TCK-XXXXXXXXXXXX"
                  : "Não encontrei essa cortesia. Responda com o número da lista, telefone ou código do ticket.",
            nextContext: withAdminCourtesiesContext(
              baseContext,
              "admin_courtesy_cancel_target_collecting",
              adminCourtesies,
            ),
          };
        }

        const result = await cancelCourtesyForEvent(eventId, target);

        return {
          reply: result.ok
            ? `Cortesias canceladas: ${result.cancelledCount}`
            : "Não consegui cancelar essa cortesia. Confira se ela ainda está ativa.",
          nextContext: adminReplyContext({
            state: "admin_courtesies_menu",
            role: adminUser.role,
            sessionId: adminSession.id,
            adminUserId: adminUser.id,
            expiresAt: adminSession.expires_at,
          }),
        };
      }

      if (
        baseContext.state === "admin_courtesy_event_select" ||
        baseContext.state === "admin_courtesy_list_event_select" ||
        baseContext.state === "admin_courtesy_resend_event_select" ||
        baseContext.state === "admin_courtesy_cancel_event_select" ||
        baseContext.state === "admin_courtesy_limit_event_select"
      ) {
        const eventId = resolveCourtesyEventId(
          text,
          adminCourtesies.lastEvents ?? [],
        );

        if (!eventId) {
          return {
            reply: "Evento não encontrado. Responda com número, nome ou ID.",
            nextContext: withAdminCourtesiesContext(
              baseContext,
              baseContext.state,
              adminCourtesies,
            ),
          };
        }

        if (baseContext.state === "admin_courtesy_event_select") {
          const phones = adminCourtesies.phones ?? [];
          let results: Awaited<ReturnType<typeof issueCourtesies>>;
          try {
            results = await issueCourtesies({
              eventId,
              phones,
              issuedByAdminUserId: adminUser.id,
              issuedByAdminPhone: normalizeGatePhone(adminUser.phone) ?? adminUser.phone,
            });
          } catch (error) {
            logError("Failed to issue admin courtesies", {
              error,
              eventId,
              phonesCount: phones.length,
              adminUserId: adminUser.id,
            });

            return {
              reply:
                "Não consegui gerar cortesias agora. Registrei o erro técnico nos logs para conferência.",
              nextContext: adminReplyContext({
                state: "admin_courtesies_menu",
                role: adminUser.role,
                sessionId: adminSession.id,
                adminUserId: adminUser.id,
                expiresAt: adminSession.expires_at,
              }),
            };
          }
          return {
            reply: [
              buildCourtesyIssueSummary(results),
              "",
              results.every(
                (result) => !result.ok && result.reason === "limit_reached",
              )
                ? ""
                : results.some((result) => result.ok)
                ? 'Informe ao contato que para receber sua cortesia, deve enviar "Cortesia" para este mesmo número.'
                : "Nenhuma nova cortesia foi registrada. Quem já tem cortesia ativa pode escrever CORTESIA na conversa para receber o QR Code.",
            ].filter(Boolean).join("\n"),
            nextContext: adminReplyContext({
              state: "admin_courtesies_menu",
              role: adminUser.role,
              sessionId: adminSession.id,
              adminUserId: adminUser.id,
              expiresAt: adminSession.expires_at,
            }),
          };
        }

        if (baseContext.state === "admin_courtesy_list_event_select") {
          const list = await listCourtesiesForEvent(eventId);

          return {
            reply: list.ok
              ? buildCourtesiesListReply(list.courtesies)
              : TICKET_MESSAGES.adminGenericError,
            nextContext: adminReplyContext({
              state: "admin_courtesies_menu",
              role: adminUser.role,
              sessionId: adminSession.id,
              adminUserId: adminUser.id,
              expiresAt: adminSession.expires_at,
            }),
          };
        }

        if (baseContext.state === "admin_courtesy_resend_event_select") {
          const list = await listCourtesiesForEvent(eventId);

          return {
            reply: list.ok
              ? [
                  "Reenvio automático desativado por segurança do WhatsApp.",
                  "Peça para o convidado escrever CORTESIA na conversa para receber o QR Code.",
                  `Cortesias ativas neste evento: ${list.courtesies.filter((courtesy) => courtesy.status === "issued").length}`,
                ].join("\n")
              : TICKET_MESSAGES.adminGenericError,
            nextContext: adminReplyContext({
              state: "admin_courtesies_menu",
              role: adminUser.role,
              sessionId: adminSession.id,
              adminUserId: adminUser.id,
              expiresAt: adminSession.expires_at,
            }),
          };
        }

        if (baseContext.state === "admin_courtesy_cancel_event_select") {
          return {
            reply: renderCourtesyCancelMethodMenu(),
            nextContext: withAdminCourtesiesContext(
              baseContext,
              "admin_courtesy_cancel_method_select",
              {
              ...adminCourtesies,
              selectedEventId: eventId,
              },
            ),
          };
        }

        const currentLimit = await getCourtesyLimit(eventId);

        return {
          reply: [
            "*DEFINIR NOVO LIMITE DE CORTESIAS*",
            `> Hoje, limite de ${currentLimit.ok ? currentLimit.limit : 0} cortesias`,
            "",
            "Digite o novo limite TOTAL de cortesias para este evento. Use 0 para remover limite.",
          ].join("\n"),
          nextContext: withAdminCourtesiesContext(
            baseContext,
            "admin_courtesy_limit_collecting",
            { ...adminCourtesies, selectedEventId: eventId },
          ),
        };
      }

      if (baseContext.state === "admin_courtesy_cancel_method_select") {
        const option = text.trim().match(/^\d+$/) ? Number(text.trim()) : null;
        const eventId = adminCourtesies.selectedEventId;

        if (!eventId) {
          return {
            reply: renderAdminSubmenu(courtesiesSubmenu),
            nextContext: adminReplyContext({
              state: "admin_courtesies_menu",
              role: adminUser.role,
              sessionId: adminSession.id,
              adminUserId: adminUser.id,
              expiresAt: adminSession.expires_at,
            }),
          };
        }

        if (option === 5) return endAdminSession();
        if (option === 4) {
          return buildAdminCourtesyEventSelect({
            baseContext,
            scope,
            state: "admin_courtesy_cancel_event_select",
            title: "CANCELAR CORTESIA - ESCOLHA O EVENTO",
            context: { mode: "cancel" },
          });
        }

        if (option === 1 || option === 2) {
          return {
            reply:
              option === 1
                ? "*CANCELAR PELO TELEFONE*\n\nDigite o número de telefone da cortesia."
                : "*CANCELAR PELO CÓDIGO*\n\nDigite o código do ticket da cortesia. Ex: TCK-XXXXXXXXXXXX",
            nextContext: withAdminCourtesiesContext(
              baseContext,
              "admin_courtesy_cancel_target_collecting",
              {
                ...adminCourtesies,
                cancelMethod: option === 1 ? "phone" : "code",
              },
            ),
          };
        }

        if (option === 3) {
          const list = await listCourtesiesForEvent(eventId);

          if (!list.ok) {
            return {
              reply: TICKET_MESSAGES.adminGenericError,
              nextContext: withAdminCourtesiesContext(
                baseContext,
                "admin_courtesy_cancel_method_select",
                adminCourtesies,
              ),
            };
          }

          const issuedCourtesies = list.courtesies.filter(
            (courtesy) => courtesy.status === "issued",
          );

          return {
            reply: [
              buildCourtesiesListReply(issuedCourtesies),
              "",
              "*QUAL CORTESIA DESEJA CANCELAR?*",
              "Responda com o número da cortesia, telefone ou código do ticket.",
            ].join("\n"),
            nextContext: withAdminCourtesiesContext(
              baseContext,
              "admin_courtesy_cancel_target_collecting",
              {
                ...adminCourtesies,
                cancelMethod: "list",
                lastCourtesies: issuedCourtesies.map((courtesy, index) => ({
                  option: index + 1,
                  courtesyId: courtesy.courtesyId,
                  phone: courtesy.phone,
                  ticketCode: courtesy.ticketCode,
                })),
              },
            ),
          };
        }

        return {
          reply: renderCourtesyCancelMethodMenu(),
          nextContext: withAdminCourtesiesContext(
            baseContext,
            "admin_courtesy_cancel_method_select",
            adminCourtesies,
          ),
        };
      }

      if (baseContext.state === "admin_courtesy_limit_collecting") {
        const eventId = adminCourtesies.selectedEventId;
        const limit = Number(text.trim().replace(/\D/g, ""));

        if (!eventId || !Number.isInteger(limit) || limit < 0) {
          return {
            reply: "Limite inválido. Envie um número inteiro maior ou igual a 0.",
            nextContext: withAdminCourtesiesContext(
              baseContext,
              "admin_courtesy_limit_collecting",
              adminCourtesies,
            ),
          };
        }

        const result = await setCourtesyLimit(eventId, limit);

        return {
          reply: result.ok
            ? `Limite de cortesias definido: ${limit}`
            : TICKET_MESSAGES.adminGenericError,
          nextContext: adminReplyContext({
            state: "admin_courtesies_menu",
            role: adminUser.role,
            sessionId: adminSession.id,
            adminUserId: adminUser.id,
            expiresAt: adminSession.expires_at,
          }),
        };
      }
    }

    if (isAdminGateFlowState(baseContext.state)) {
      const gateSubmenu = ADMIN_SUBMENUS.admin_gate_menu;
      const submenuOption = parseAdminSubmenuOption(text);

      if (!canAccessAdminMenu(adminUser.role, gateSubmenu)) {
        return {
          reply: ADMIN_MENU_UNAVAILABLE_MESSAGE,
          nextContext: adminReplyContext({
            state: "admin_menu",
            role: adminUser.role,
            sessionId: adminSession.id,
            adminUserId: adminUser.id,
            expiresAt: adminSession.expires_at,
          }),
        };
      }

      if (submenuOption === "exit" || submenuOption === gateSubmenu.exitOption) {
        return endAdminSession();
      }
      if (isBackText(text)) {
        if (baseContext.state === "admin_gate_accesses_filter") {
          return buildAdminGateEventSelect({
            baseContext,
            scope: buildAdminEventScope(adminUser),
            title: "PORTARIA - ESCOLHA O EVENTO",
          });
        }

        if (baseContext.state === "admin_gate_revoke_select") {
          return buildAdminGateEventSelect({
            baseContext,
            scope: buildAdminEventScope(adminUser),
            title: "REVOGAR ACESSOS - ESCOLHA O EVENTO",
            mode: "revoke",
          });
        }

        if (baseContext.state === "admin_gate_revoke_confirm") {
          const adminGate = baseContext.adminGate ?? {};
          const eventId = adminGate.selectedEventId;

          if (eventId) {
            const result = await listGateAccesses({
              filter: "open",
              eventId,
            });

            if (result.ok) {
              return {
                reply: [
                  renderGateAccessesList({
                    title: "REVOGAR ACESSOS",
                    accesses: result.accesses,
                  }),
                  "",
                  "Digite o número do acesso que deseja pausar.",
                ].join("\n"),
                nextContext: withAdminGateContext(
                  baseContext,
                  "admin_gate_revoke_select",
                  {
                    ...adminGate,
                    pendingRevokeAccess: undefined,
                    lastGateAccesses: result.accesses.map((access, index) => ({
                      option: index + 1,
                      gateAccessId: access.id,
                      validatorPhone: access.phone,
                      eventId: access.eventId,
                      eventTitle: access.eventTitle,
                    })),
                  },
                ),
              };
            }
          }
        }
      }
      if (
        submenuOption === "menu" ||
        submenuOption === "back" ||
        submenuOption === gateSubmenu.backOption
      ) {
        return {
          reply: renderAdminSubmenu(gateSubmenu),
          nextContext: adminReplyContext({
            state: "admin_gate_menu",
            role: adminUser.role,
            sessionId: adminSession.id,
            adminUserId: adminUser.id,
            expiresAt: adminSession.expires_at,
          }),
        };
      }

      if (baseContext.state === "admin_gate_validator_collecting") {
        const adminGate = baseContext.adminGate ?? {};
        const validatorPhone = normalizeGatePhone(text);

        if (!validatorPhone || validatorPhone.length < 10) {
          return {
            reply: renderGateValidatorPhonePrompt(),
            nextContext: adminReplyContext({
              state: "admin_gate_validator_collecting",
              role: adminUser.role,
              sessionId: adminSession.id,
              adminUserId: adminUser.id,
              expiresAt: adminSession.expires_at,
            }),
          };
        }

        return {
          reply: renderGateValidatorPasswordPrompt(),
          nextContext: withAdminGateContext(
            adminReplyContext({
              state: "admin_gate_password_collecting",
              role: adminUser.role,
              sessionId: adminSession.id,
              adminUserId: adminUser.id,
              expiresAt: adminSession.expires_at,
            }),
            "admin_gate_password_collecting",
            { ...adminGate, pendingValidatorPhone: validatorPhone },
          ),
        };
      }

      if (baseContext.state === "admin_gate_password_collecting") {
        const adminGate = baseContext.adminGate ?? {};
        const passphrase = text.trim();
        const validatorPhone = adminGate.pendingValidatorPhone;
        const eventId = adminGate.selectedEventId;

        if (!validatorPhone || !eventId || !passphrase) {
          return {
            reply: renderGateValidatorPasswordPrompt(),
            nextContext: withAdminGateContext(
              baseContext,
              "admin_gate_password_collecting",
              adminGate,
            ),
          };
        }

        const gateAccessResult = await createGateAccess({
          phone: validatorPhone,
          passphrase,
          eventId,
          createdByAdminUserId: adminUser.id,
          createdByAdminPhone: customer.whatsapp_phone,
        });

        if (!gateAccessResult.ok) {
          return {
            reply:
              gateAccessResult.reason === "already_registered"
                ? "Este telefone já possui acesso de portaria para este evento."
                : TICKET_MESSAGES.gateAdminCreateError,
            nextContext: adminReplyContext({
              state: "admin_gate_menu",
              role: adminUser.role,
              sessionId: adminSession.id,
              adminUserId: adminUser.id,
              expiresAt: adminSession.expires_at,
            }),
          };
        }

        return {
          reply: buildGateValidatorRegisteredReply({
            validatorPhone,
            passphrase,
          }),
          nextContext: adminReplyContext({
            state: "admin_gate_menu",
            role: adminUser.role,
            sessionId: adminSession.id,
            adminUserId: adminUser.id,
            expiresAt: adminSession.expires_at,
          }),
        };
      }

      if (
        baseContext.state === "admin_gate_register_event_select" ||
        baseContext.state === "admin_gate_access_event_select"
      ) {
        const adminGate = baseContext.adminGate ?? {};
        const eventId = resolveCourtesyEventId(text, adminGate.lastEvents ?? []);

        if (!eventId) {
          return {
            reply: "Evento não encontrado. Responda com número, nome ou ID.",
            nextContext: withAdminGateContext(
              baseContext,
              "admin_gate_access_event_select",
              adminGate,
            ),
          };
        }

        if (baseContext.state === "admin_gate_register_event_select") {
          return {
            reply: renderGateValidatorPhonePrompt(),
            nextContext: withAdminGateContext(
              baseContext,
              "admin_gate_validator_collecting",
              {
                ...adminGate,
                selectedEventId: eventId,
              },
            ),
          };
        }

        if (adminGate.mode === "self_checkin") {
          const gateSessionResult = await createGateSession({
            validatorPhone: customer.whatsapp_phone,
            createdByAdminPhone: customer.whatsapp_phone,
            gateLabel: "Check-in",
            eventId,
            replaceActiveSessions: true,
          });

          return {
            reply: gateSessionResult.ok
              ? buildGateCheckInReply({
                  gateUrl: gateSessionResult.gateUrl,
                  expiresAt: gateSessionResult.gateSession.expires_at,
                })
              : TICKET_MESSAGES.gateAdminCreateError,
            nextContext: adminReplyContext({
              state: "admin_gate_menu",
              role: adminUser.role,
              sessionId: adminSession.id,
              adminUserId: adminUser.id,
              expiresAt: adminSession.expires_at,
            }),
          };
        }

        if (adminGate.mode === "revoke") {
          const result = await listGateAccesses({
            filter: "open",
            eventId,
          });

          if (!result.ok) {
            return {
              reply: TICKET_MESSAGES.adminGenericError,
              nextContext: adminReplyContext({
                state: "admin_gate_menu",
                role: adminUser.role,
                sessionId: adminSession.id,
                adminUserId: adminUser.id,
                expiresAt: adminSession.expires_at,
              }),
            };
          }

          const reply = [
            renderGateAccessesList({
              title: "REVOGAR ACESSOS",
              accesses: result.accesses,
            }),
            "",
            "Digite o número do acesso que deseja pausar.",
          ].join("\n");

          return {
            reply,
            nextContext: withAdminGateContext(
              adminReplyContext({
                state: "admin_gate_revoke_select",
                role: adminUser.role,
                sessionId: adminSession.id,
                adminUserId: adminUser.id,
                expiresAt: adminSession.expires_at,
              }),
              "admin_gate_revoke_select",
              {
                ...adminGate,
                selectedEventId: eventId,
                lastGateAccesses: result.accesses.map((access, index) => ({
                  option: index + 1,
                  gateAccessId: access.id,
                  validatorPhone: access.phone,
                  eventId: access.eventId,
                  eventTitle: access.eventTitle,
                })),
              },
            ),
          };
        }

        return {
          reply: renderGateAccessFilterMenu(),
          nextContext: withAdminGateContext(
            baseContext,
            "admin_gate_accesses_filter",
            {
              ...adminGate,
              selectedEventId: eventId,
            },
          ),
        };
      }

      if (baseContext.state === "admin_gate_accesses_filter") {
        const option = text.trim().match(/^\d+$/) ? Number(text.trim()) : null;
        const adminGate = baseContext.adminGate ?? {};

        if (option === 4) return endAdminSession();
        if (option === 3) {
          return buildAdminGateEventSelect({
            baseContext,
            scope: buildAdminEventScope(adminUser),
            title: "PORTARIA - ESCOLHA O EVENTO",
          });
        }

        if (option !== 1 && option !== 2) {
          return {
            reply: renderGateAccessFilterMenu(),
            nextContext: withAdminGateContext(
              adminReplyContext({
                state: "admin_gate_accesses_filter",
                role: adminUser.role,
                sessionId: adminSession.id,
                adminUserId: adminUser.id,
                expiresAt: adminSession.expires_at,
              }),
              "admin_gate_accesses_filter",
              adminGate,
            ),
          };
        }

        if (!adminGate.selectedEventId) {
          return {
            reply: TICKET_MESSAGES.adminGenericError,
            nextContext: adminReplyContext({
              state: "admin_gate_menu",
              role: adminUser.role,
              sessionId: adminSession.id,
              adminUserId: adminUser.id,
              expiresAt: adminSession.expires_at,
            }),
          };
        }

        const result = await listGateAccesses({
          filter: option === 1 ? "active" : "paused",
          eventId: adminGate.selectedEventId,
        });

        return {
          reply: result.ok
            ? withAdminNavigationHint(
                renderGateAccessesList({
                  title: option === 1 ? "ACESSOS ATIVOS" : "ACESSOS PAUSADOS",
                  accesses: result.accesses,
                }),
              )
            : TICKET_MESSAGES.adminGenericError,
          nextContext: withAdminGateContext(
            adminReplyContext({
              state: "admin_gate_accesses_filter",
              role: adminUser.role,
              sessionId: adminSession.id,
              adminUserId: adminUser.id,
              expiresAt: adminSession.expires_at,
            }),
            "admin_gate_accesses_filter",
            adminGate,
          ),
        };
      }

      if (baseContext.state === "admin_gate_revoke_select") {
        const adminGate = baseContext.adminGate ?? {};
        const option = text.trim().match(/^\d+$/) ? Number(text.trim()) : null;
        const selected = option
          ? adminGate.lastGateAccesses?.find((access) => access.option === option)
          : null;

        if (!selected) {
          return {
            reply: "Não encontrei esse acesso. Digite o número do acesso que deseja pausar.",
            nextContext: withAdminGateContext(
              baseContext,
              "admin_gate_revoke_select",
              adminGate,
            ),
          };
        }

        return {
          reply: renderGateAccessRevokeConfirm(selected),
          nextContext: withAdminGateContext(
            baseContext,
            "admin_gate_revoke_confirm",
            {
              ...adminGate,
              pendingRevokeAccess: {
                gateAccessId: selected.gateAccessId,
                validatorPhone: selected.validatorPhone,
                eventId: selected.eventId,
                eventTitle: selected.eventTitle,
              },
            },
          ),
        };
      }

      if (baseContext.state === "admin_gate_revoke_confirm") {
        const adminGate = baseContext.adminGate ?? {};
        const selected = adminGate.pendingRevokeAccess;
        const normalized = normalizeAdminText(text);

        if (!selected) {
          return {
            reply: TICKET_MESSAGES.adminGenericError,
            nextContext: adminReplyContext({
              state: "admin_gate_menu",
              role: adminUser.role,
              sessionId: adminSession.id,
              adminUserId: adminUser.id,
              expiresAt: adminSession.expires_at,
            }),
          };
        }

        if (normalized !== "sim" && normalized !== "s") {
          return {
            reply: renderGateAccessRevokeConfirm(selected),
            nextContext: withAdminGateContext(
              baseContext,
              "admin_gate_revoke_confirm",
              adminGate,
            ),
          };
        }

        const revokeResult = await pauseGateAccess({
          accessId: selected.gateAccessId,
          eventId: selected.eventId,
          revokedByAdminUserId: adminUser.id,
        });

        return {
          reply: revokeResult.ok
            ? renderGateAccessPausedReply(selected)
            : TICKET_MESSAGES.adminGenericError,
          nextContext: adminReplyContext({
            state: "admin_gate_menu",
            role: adminUser.role,
            sessionId: adminSession.id,
            adminUserId: adminUser.id,
            expiresAt: adminSession.expires_at,
          }),
        };
      }
    }

    if (isAdminReportsFlowState(baseContext.state)) {
      const reportsSubmenu = ADMIN_SUBMENUS.admin_reports_menu;
      const submenuOption = parseAdminSubmenuOption(text);
      const adminReports = getAdminReportsContext(baseContext);

      if (!canAccessAdminMenu(adminUser.role, reportsSubmenu)) {
        return {
          reply: ADMIN_MENU_UNAVAILABLE_MESSAGE,
          nextContext: adminReplyContext({
            state: "admin_menu",
            role: adminUser.role,
            sessionId: adminSession.id,
            adminUserId: adminUser.id,
            expiresAt: adminSession.expires_at,
          }),
        };
      }

      if (submenuOption === "exit" || submenuOption === 7) return endAdminSession();
      if (submenuOption === "menu" || submenuOption === "back" || submenuOption === 6) {
        return {
          reply: renderAdminSubmenu(reportsSubmenu),
          nextContext: adminReplyContext({
            state: "admin_reports_menu",
            role: adminUser.role,
            sessionId: adminSession.id,
            adminUserId: adminUser.id,
            expiresAt: adminSession.expires_at,
          }),
        };
      }

      if (baseContext.state === "admin_report_event_select") {
        const eventId = resolveCourtesyEventId(text, adminReports.lastEvents ?? []);

        if (!eventId) {
          return {
            reply: "Evento não encontrado. Responda com número, nome ou ID.",
            nextContext: withAdminReportsContext(
              baseContext,
              "admin_report_event_select",
              adminReports,
            ),
          };
        }

        return {
          reply: renderAdminReportPeriodMenu(),
          nextContext: withAdminReportsContext(
            baseContext,
            "admin_report_period_select",
            { ...adminReports, selectedEventId: eventId },
          ),
        };
      }

      const buildReportReply = async (period: AdminReportPeriod) => {
        if (!adminReports.selectedEventId || !adminReports.reportType) {
          return {
            reply: renderAdminSubmenu(reportsSubmenu),
            nextContext: adminReplyContext({
              state: "admin_reports_menu",
              role: adminUser.role,
              sessionId: adminSession.id,
              adminUserId: adminUser.id,
              expiresAt: adminSession.expires_at,
            }),
          };
        }

        try {
          const report = await buildAdminReport({
            eventId: adminReports.selectedEventId,
            type: adminReports.reportType,
            period,
          });

          return {
            reply: withAdminNavigationHint(report),
            nextContext: adminReplyContext({
              state: "admin_reports_menu",
              role: adminUser.role,
              sessionId: adminSession.id,
              adminUserId: adminUser.id,
              expiresAt: adminSession.expires_at,
            }),
          };
        } catch (error) {
          logError("Failed to build admin report", {
            error,
            eventId: adminReports.selectedEventId,
            reportType: adminReports.reportType,
          });

          return {
            reply: TICKET_MESSAGES.adminGenericError,
            nextContext: adminReplyContext({
              state: "admin_reports_menu",
              role: adminUser.role,
              sessionId: adminSession.id,
              adminUserId: adminUser.id,
              expiresAt: adminSession.expires_at,
            }),
          };
        }
      };

      if (baseContext.state === "admin_report_period_select") {
        const period = parseAdminReportPeriodOption(text);

        if (period === "custom") {
          return {
            reply: [
              "*ESCOLHER DATAS*",
              "",
              "Digite o intervalo no formato DD/MM/AAAA a DD/MM/AAAA.",
              "Ex: 01/05/2026 a 24/05/2026",
              "",
              'Digite "Voltar" para voltar, "Cancelar" para abandonar esta tela ou "Sair" para sair da área de admin.',
            ].join("\n"),
            nextContext: withAdminReportsContext(
              baseContext,
              "admin_report_custom_period_collecting",
              adminReports,
            ),
          };
        }

        if (!period) {
          return {
            reply: renderAdminReportPeriodMenu(),
            nextContext: withAdminReportsContext(
              baseContext,
              "admin_report_period_select",
              adminReports,
            ),
          };
        }

        return buildReportReply(period);
      }

      if (baseContext.state === "admin_report_custom_period_collecting") {
        const period = parseAdminReportCustomPeriod(text);

        if (!period) {
          return {
            reply:
              "Intervalo inválido. Digite no formato DD/MM/AAAA a DD/MM/AAAA.",
            nextContext: withAdminReportsContext(
              baseContext,
              "admin_report_custom_period_collecting",
              adminReports,
            ),
          };
        }

        return buildReportReply(period);
      }
    }

    if (isAdminUsersFlowState(baseContext.state)) {
      const usersSubmenu = ADMIN_SUBMENUS.admin_users_menu;
      const submenuOption = parseAdminSubmenuOption(text);

      if (!canAccessAdminMenu(adminUser.role, usersSubmenu)) {
        return {
          reply: ADMIN_MENU_UNAVAILABLE_MESSAGE,
          nextContext: adminReplyContext({
            state: "admin_menu",
            role: adminUser.role,
            sessionId: adminSession.id,
            adminUserId: adminUser.id,
            expiresAt: adminSession.expires_at,
          }),
        };
      }

      if (submenuOption === "exit") return endAdminSession();
      if (submenuOption === "menu" || submenuOption === "back") {
        return {
          reply: renderAdminSubmenu(usersSubmenu),
          nextContext: adminReplyContext({
            state: "admin_users_menu",
            role: adminUser.role,
            sessionId: adminSession.id,
            adminUserId: adminUser.id,
            expiresAt: adminSession.expires_at,
          }),
        };
      }

      if (baseContext.state === "admin_users_add_type_select") {
        const selectedRole = parseAdminRole(text);

        if (!selectedRole) {
          return {
            reply: renderAdminUserTypePrompt(),
            nextContext: adminReplyContext({
              state: "admin_users_add_type_select",
              role: adminUser.role,
              sessionId: adminSession.id,
              adminUserId: adminUser.id,
              expiresAt: adminSession.expires_at,
            }),
          };
        }

        return {
          reply: renderAdminUserPhonePrompt(),
          nextContext: withAdminUsersContext(
            baseContext,
            "admin_users_add_phone_collecting",
            { mode: "add", pendingRole: selectedRole },
          ),
        };
      }

      if (baseContext.state === "admin_users_add_phone_collecting") {
        const adminUsersContext = baseContext.adminUsers ?? {};
        const phone = normalizeGatePhone(text);

        if (!phone || phone.length < 10 || !adminUsersContext.pendingRole) {
          return {
            reply: renderAdminUserPhonePrompt(),
            nextContext: withAdminUsersContext(
              baseContext,
              "admin_users_add_phone_collecting",
              adminUsersContext,
            ),
          };
        }

        return {
          reply: renderAdminUserNamePrompt(),
          nextContext: withAdminUsersContext(
            baseContext,
            "admin_users_add_name_collecting",
            { ...adminUsersContext, pendingPhone: phone },
          ),
        };
      }

      if (baseContext.state === "admin_users_add_name_collecting") {
        const adminUsersContext = baseContext.adminUsers ?? {};
        const name = text.trim();

        if (
          !adminUsersContext.pendingPhone ||
          !adminUsersContext.pendingRole ||
          !name
        ) {
          return {
            reply: renderAdminUserNamePrompt(),
            nextContext: withAdminUsersContext(
              baseContext,
              "admin_users_add_name_collecting",
              adminUsersContext,
            ),
          };
        }

        return {
          reply: renderAdminUserPassphrasePrompt(),
          nextContext: withAdminUsersContext(
            baseContext,
            "admin_users_add_passphrase_collecting",
            { ...adminUsersContext, pendingName: name },
          ),
        };
      }

      if (baseContext.state === "admin_users_add_passphrase_collecting") {
        const adminUsersContext = baseContext.adminUsers ?? {};
        const passphrase = text.trim();

        if (
          !adminUsersContext.pendingPhone ||
          !adminUsersContext.pendingRole ||
          !adminUsersContext.pendingName ||
          !passphrase
        ) {
          return {
            reply: renderAdminUserPassphrasePrompt(),
            nextContext: withAdminUsersContext(
              baseContext,
              "admin_users_add_passphrase_collecting",
              adminUsersContext,
            ),
          };
        }

        const result = await createAdminUser({
          phone: adminUsersContext.pendingPhone,
          name: adminUsersContext.pendingName,
          role: adminUsersContext.pendingRole,
          passphrase,
          createdByAdminPhone: adminUser.phone,
        });

        return {
          reply: result.ok
            ? [
                "*ADMINISTRADOR CADASTRADO*",
                `> Telefone: ${adminUsersContext.pendingPhone}`,
                `> Nome: ${adminUsersContext.pendingName}`,
                `> Perfil: ${formatAdminRoleLabel(adminUsersContext.pendingRole)}`,
                `> Palavra chave: ${passphrase}`,
                "",
                'Digite "Voltar" para voltar, "Cancelar" para abandonar esta tela ou "Sair" para sair da área de admin.',
              ].join("\n")
            : TICKET_MESSAGES.adminGenericError,
          nextContext: adminReplyContext({
            state: "admin_users_menu",
            role: adminUser.role,
            sessionId: adminSession.id,
            adminUserId: adminUser.id,
            expiresAt: adminSession.expires_at,
          }),
        };
      }

      if (
        baseContext.state === "admin_users_role_select" ||
        baseContext.state === "admin_users_disable_select"
      ) {
        const adminUsersContext = baseContext.adminUsers ?? {};
        const selectedAdminUserId = resolveAdminUserId(
          text,
          adminUsersContext.lastUsers ?? [],
        );

        if (!selectedAdminUserId) {
          return {
            reply: "Administrador não encontrado. Responda com número, telefone ou ID.",
            nextContext: withAdminUsersContext(
              baseContext,
              baseContext.state,
              adminUsersContext,
            ),
          };
        }

        if (baseContext.state === "admin_users_disable_select") {
          const result = await disableAdminUser(selectedAdminUserId);

          return {
            reply: result.ok
              ? "*ADMINISTRADOR DESATIVADO*"
              : TICKET_MESSAGES.adminGenericError,
            nextContext: adminReplyContext({
              state: "admin_users_menu",
              role: adminUser.role,
              sessionId: adminSession.id,
              adminUserId: adminUser.id,
              expiresAt: adminSession.expires_at,
            }),
          };
        }

        return {
          reply: renderAdminUserRolePrompt(),
          nextContext: withAdminUsersContext(
            baseContext,
            "admin_users_role_collecting",
            { ...adminUsersContext, selectedAdminUserId },
          ),
        };
      }

      if (baseContext.state === "admin_users_role_collecting") {
        const adminUsersContext = baseContext.adminUsers ?? {};
        const newRole = parseAdminRole(text);

        if (!adminUsersContext.selectedAdminUserId || !newRole) {
          return {
            reply: renderAdminUserRolePrompt(),
            nextContext: withAdminUsersContext(
              baseContext,
              "admin_users_role_collecting",
              adminUsersContext,
            ),
          };
        }

        const result = await updateAdminRole({
          adminUserId: adminUsersContext.selectedAdminUserId,
          role: newRole,
        });

        return {
          reply: result.ok
            ? [
                "*NÍVEL DE ADMINISTRADOR ATUALIZADO*",
                `> Perfil: ${formatAdminRoleLabel(newRole)}`,
                'Digite "Voltar" para voltar, "Cancelar" para abandonar esta tela ou "Sair" para sair da área de admin.',
              ].join("\n")
            : TICKET_MESSAGES.adminGenericError,
          nextContext: adminReplyContext({
            state: "admin_users_menu",
            role: adminUser.role,
            sessionId: adminSession.id,
            adminUserId: adminUser.id,
            expiresAt: adminSession.expires_at,
          }),
        };
      }

    }

    if (previousState.state !== "admin_menu" && typedMainMenuOption) {
      const targetSubmenu = getAdminSubmenuByMainOption(typedMainMenuOption);

      if (!targetSubmenu || !canAccessAdminMenu(adminUser.role, targetSubmenu)) {
        return {
          reply: ADMIN_MENU_UNAVAILABLE_MESSAGE,
          nextContext: {
            ...baseContext,
            admin: buildAdminContext({
              adminUserId: adminUser.id,
              role: adminUser.role,
              sessionId: adminSession.id,
              expiresAt: adminSession.expires_at,
            }),
          },
        };
      }

      return {
        reply: renderAdminSubmenu(targetSubmenu),
        nextContext: adminReplyContext({
          state: targetSubmenu.state,
          role: adminUser.role,
          sessionId: adminSession.id,
          adminUserId: adminUser.id,
          expiresAt: adminSession.expires_at,
        }),
      };
    }

    if (
      baseContext.state === "admin_events_menu" ||
      baseContext.state === "admin_events_list" ||
      baseContext.state.startsWith("admin_event_")
    ) {
      if (baseContext.state === "admin_events_menu" && numericOption === 6) {
        return {
          reply: formatAdminMenu(adminUser.role),
          nextContext: adminReplyContext({
            state: "admin_menu",
            role: adminUser.role,
            sessionId: adminSession.id,
            adminUserId: adminUser.id,
            expiresAt: adminSession.expires_at,
          }),
        };
      }

      const isEventFlowExitOption =
        (baseContext.state === "admin_events_menu" && numericOption === 7) ||
        (baseContext.state === "admin_events_list" &&
          baseContext.adminEvents?.mode === "select_list_filter" &&
          numericOption === 6) ||
        (baseContext.state === "admin_event_detail" && numericOption === 5) ||
        (baseContext.state === "admin_event_sessions_menu" && numericOption === 7) ||
        (baseContext.state === "admin_event_sections_menu" && numericOption === 8) ||
        (baseContext.state === "admin_event_prices_menu" && numericOption === 6);

      if (isEventFlowExitOption) {
        return endAdminSession();
      }

      const eventFlowResult = await handleAdminEventsFlow({
        baseContext,
        scope: buildAdminEventScope(adminUser),
        text,
        mediaUrl,
      });

      if (eventFlowResult) {
        if (eventFlowResult.reply === "__ADMIN_BACK__") {
          return {
            reply: formatAdminMenu(adminUser.role),
            nextContext: adminReplyContext({
              state: "admin_menu",
              role: adminUser.role,
              sessionId: adminSession.id,
              adminUserId: adminUser.id,
              expiresAt: adminSession.expires_at,
            }),
          };
        }

        if (eventFlowResult.reply === "__ADMIN_EXIT__") {
          return endAdminSession();
        }

        return {
          ...eventFlowResult,
          reply: withAdminNavigationHint(eventFlowResult.reply),
        };
      }
    }

    if (previousState.state === "admin_menu") {
      const mainMenuOption = numericOption ?? typedMainMenuOption;

      if (mainMenuOption === null) {
        return {
          reply: formatAdminMenu(adminUser.role),
          nextContext: adminReplyContext({
            state: "admin_menu",
            role: adminUser.role,
            sessionId: adminSession.id,
            adminUserId: adminUser.id,
            expiresAt: adminSession.expires_at,
          }),
        };
      }

      if (mainMenuOption === 7) {
        return endAdminSession();
      }

      const submenu = getAdminSubmenuByMainOption(mainMenuOption);

      if (!submenu || !canAccessAdminMenu(adminUser.role, submenu)) {
        return {
          reply: ADMIN_MENU_UNAVAILABLE_MESSAGE,
          nextContext: adminReplyContext({
            state: "admin_menu",
            role: adminUser.role,
            sessionId: adminSession.id,
            adminUserId: adminUser.id,
            expiresAt: adminSession.expires_at,
          }),
        };
      }

      return {
        reply: renderAdminSubmenu(submenu),
        nextContext: adminReplyContext({
          state: submenu.state,
          role: adminUser.role,
          sessionId: adminSession.id,
          adminUserId: adminUser.id,
          expiresAt: adminSession.expires_at,
        }),
      };
    }

    if (isAdminSubmenuState(previousState.state)) {
      const currentSubmenu = ADMIN_SUBMENUS[previousState.state];

      if (!canAccessAdminMenu(adminUser.role, currentSubmenu)) {
        return {
          reply: ADMIN_MENU_UNAVAILABLE_MESSAGE,
          nextContext: adminReplyContext({
            state: "admin_menu",
            role: adminUser.role,
            sessionId: adminSession.id,
            adminUserId: adminUser.id,
            expiresAt: adminSession.expires_at,
          }),
        };
      }

      if (typedMainMenuOption) {
        if (typedMainMenuOption === 7) {
          return endAdminSession();
        }

        const targetSubmenu = getAdminSubmenuByMainOption(typedMainMenuOption);

        if (!targetSubmenu || !canAccessAdminMenu(adminUser.role, targetSubmenu)) {
          return {
            reply: ADMIN_MENU_UNAVAILABLE_MESSAGE,
            nextContext: adminReplyContext({
              state: previousState.state,
              role: adminUser.role,
              sessionId: adminSession.id,
              adminUserId: adminUser.id,
              expiresAt: adminSession.expires_at,
            }),
          };
        }

        return {
          reply: renderAdminSubmenu(targetSubmenu),
          nextContext: adminReplyContext({
            state: targetSubmenu.state,
            role: adminUser.role,
            sessionId: adminSession.id,
            adminUserId: adminUser.id,
            expiresAt: adminSession.expires_at,
          }),
        };
      }

      const submenuOption = parseAdminSubmenuOption(text);

      if (submenuOption === "menu" || submenuOption === "back") {
        return {
          reply: formatAdminMenu(adminUser.role),
          nextContext: adminReplyContext({
            state: "admin_menu",
            role: adminUser.role,
            sessionId: adminSession.id,
            adminUserId: adminUser.id,
            expiresAt: adminSession.expires_at,
          }),
        };
      }

      if (
        submenuOption === "exit" ||
        submenuOption === currentSubmenu.exitOption
      ) {
        return endAdminSession();
      }

      if (submenuOption === currentSubmenu.backOption) {
        return {
          reply: formatAdminMenu(adminUser.role),
          nextContext: adminReplyContext({
            state: "admin_menu",
            role: adminUser.role,
            sessionId: adminSession.id,
            adminUserId: adminUser.id,
            expiresAt: adminSession.expires_at,
          }),
        };
      }

      if (previousState.state === "admin_orders_menu") {
        const orderPrompts: Record<
          number,
          { reply: string; state: TicketConversationStep }
        > = {
          1: {
            reply:
              "*BUSCAR INGRESSO POR TELEFONE*\n\nEnvie o telefone do comprador com DDD.",
            state: "admin_order_phone_collecting",
          },
          2: {
            reply:
              "*BUSCAR INGRESSO POR CÓDIGO*\n\nEnvie o código do ingresso. Ex: TCK-XXXXXXXXXXXX",
            state: "admin_order_code_collecting",
          },
          3: {
            reply:
              "*CANCELAR RESERVA PENDENTE*\n\nEnvie o telefone do comprador, o ID da reserva ou o ID do pedido.",
            state: "admin_order_cancel_collecting",
          },
          4: {
            reply:
              "*CONSULTAR TICKET*\n\nEnvie o código do ticket/ingresso. Ex: TCK-XXXXXXXXXXXX",
            state: "admin_ticket_consult_collecting",
          },
        };
        const prompt = typeof submenuOption === "number"
          ? orderPrompts[submenuOption]
          : undefined;

        if (prompt) {
          return {
            reply: withAdminNavigationHint(prompt.reply),
            nextContext: adminReplyContext({
              state: prompt.state,
              role: adminUser.role,
              sessionId: adminSession.id,
              adminUserId: adminUser.id,
              expiresAt: adminSession.expires_at,
            }),
          };
        }
      }

      if (previousState.state === "admin_courtesies_menu") {
        if (submenuOption === 1) {
          return {
            reply: [
              "*GERAR CORTESIA*",
              "",
              "> 1. Individual",
              "> 2. Lote",
              "> 3. Voltar",
              "> 4. Sair",
            ].join("\n"),
            nextContext: withAdminCourtesiesContext(
              baseContext,
              "admin_courtesy_generate_type",
              {},
            ),
          };
        }

        const courtesyEventSelectByOption: Record<
          number,
          {
            state: TicketConversationStep;
            title: string;
            mode: NonNullable<TicketConversationState["adminCourtesies"]>["mode"];
          }
        > = {
          2: {
            state: "admin_courtesy_list_event_select",
            title: "LISTAR CORTESIAS - ESCOLHA O EVENTO",
            mode: "list",
          },
          3: {
            state: "admin_courtesy_resend_event_select",
            title: "REENVIAR CORTESIA - ESCOLHA O EVENTO",
            mode: "resend",
          },
          4: {
            state: "admin_courtesy_cancel_event_select",
            title: "CANCELAR CORTESIA - ESCOLHA O EVENTO",
            mode: "cancel",
          },
          5: {
            state: "admin_courtesy_limit_event_select",
            title: "LIMITE DE CORTESIAS - ESCOLHA O EVENTO",
            mode: "limit",
          },
        };
        const target = typeof submenuOption === "number"
          ? courtesyEventSelectByOption[submenuOption]
          : undefined;

        if (target) {
          return buildAdminCourtesyEventSelect({
            baseContext,
            scope: buildAdminEventScope(adminUser),
            state: target.state,
            title: target.title,
            context: { mode: target.mode },
          });
        }
      }

      if (previousState.state === "admin_users_menu") {
        if (submenuOption === 2) {
          return {
            reply: renderAdminUserTypePrompt(),
            nextContext: adminReplyContext({
              state: "admin_users_add_type_select",
              role: adminUser.role,
              sessionId: adminSession.id,
              adminUserId: adminUser.id,
              expiresAt: adminSession.expires_at,
            }),
          };
        }

        if (
          submenuOption === 1 ||
          submenuOption === 3 ||
          submenuOption === 4
        ) {
          const usersResult = await listAdminUsers();

          if (!usersResult.ok) {
            return {
              reply: TICKET_MESSAGES.adminGenericError,
              nextContext: adminReplyContext({
                state: "admin_users_menu",
                role: adminUser.role,
                sessionId: adminSession.id,
                adminUserId: adminUser.id,
                expiresAt: adminSession.expires_at,
              }),
            };
          }

          if (submenuOption === 1) {
            return {
              reply: withAdminNavigationHint(renderAdminUsersList(usersResult.users)),
              nextContext: adminReplyContext({
                state: "admin_users_menu",
                role: adminUser.role,
                sessionId: adminSession.id,
                adminUserId: adminUser.id,
                expiresAt: adminSession.expires_at,
              }),
            };
          }

          if (submenuOption === 3 || submenuOption === 4) {
            return {
              reply: [
                "*ADMINISTRADORES*",
                submenuOption === 3
                  ? "*QUAL ADMINISTRADOR DESEJA ALTERAR?*"
                  : "*QUAL ADMINISTRADOR DESEJA DESATIVAR?*",
                "Responda com número, telefone ou ID.",
                "",
                renderAdminUsersList(usersResult.users).replace(
                  /^\*ADMINISTRADORES\*\n\n/,
                  "",
                ),
              ].join("\n"),
              nextContext: withAdminUsersContext(
                {
                  ...baseContext,
                  admin: buildAdminContext({
                    adminUserId: adminUser.id,
                    role: adminUser.role,
                    sessionId: adminSession.id,
                    expiresAt: adminSession.expires_at,
                  }),
                },
                submenuOption === 3
                  ? "admin_users_role_select"
                  : "admin_users_disable_select",
                {
                  mode: submenuOption === 3 ? "role" : "disable",
                  lastUsers: usersResult.users.map((user, index) => ({
                    option: index + 1,
                    adminUserId: user.id,
                    phone: user.phone,
                    name: user.name,
                  })),
                },
              ),
            };
          }

        }
      }

      if (previousState.state === "admin_reports_menu") {
        const reportTypeByOption: Record<number, AdminReportType> = {
          1: "sales_event",
          2: "sales_section",
          3: "expired_reservations",
          4: "gate_checkins",
          5: "ticket_usage",
          6: "summary",
        };
        const reportType = typeof submenuOption === "number"
          ? reportTypeByOption[submenuOption]
          : undefined;

        if (reportType) {
          return buildAdminReportEventSelect({
            baseContext,
            scope: buildAdminEventScope(adminUser),
            reportType,
          });
        }
      }

      if (
        previousState.state === "admin_gate_menu" &&
        submenuOption === 1
      ) {
        return buildAdminGateEventSelect({
          baseContext,
          scope: buildAdminEventScope(adminUser),
          title: "CHECK-IN NESTE TELEFONE - ESCOLHA O EVENTO",
          mode: "self_checkin",
        });
      }

      if (
        previousState.state === "admin_gate_menu" &&
        submenuOption === 2
      ) {
        return buildAdminGateEventSelect({
          baseContext,
          scope: buildAdminEventScope(adminUser),
          title: "CHECK-IN - ESCOLHA O EVENTO",
          nextState: "admin_gate_register_event_select",
          mode: "register",
        });
      }

      if (
        previousState.state === "admin_gate_menu" &&
        submenuOption === 3
      ) {
        return buildAdminGateEventSelect({
          baseContext,
          scope: buildAdminEventScope(adminUser),
          title: "PORTARIA - ESCOLHA O EVENTO",
          mode: "list",
        });
      }

      if (
        previousState.state === "admin_gate_menu" &&
        submenuOption === 4
      ) {
        return buildAdminGateEventSelect({
          baseContext,
          scope: buildAdminEventScope(adminUser),
          title: "REVOGAR ACESSOS - ESCOLHA O EVENTO",
          mode: "revoke",
        });
      }

      if (
        typeof submenuOption === "number" &&
        submenuOption >= 1 &&
        submenuOption <= currentSubmenu.options.length
      ) {
        return {
          reply: ADMIN_CONSTRUCTION_MESSAGE,
          nextContext: adminReplyContext({
            state: previousState.state,
            role: adminUser.role,
            sessionId: adminSession.id,
            adminUserId: adminUser.id,
            expiresAt: adminSession.expires_at,
          }),
        };
      }

      return {
        reply: renderAdminSubmenu(currentSubmenu),
        nextContext: adminReplyContext({
          state: previousState.state,
          role: adminUser.role,
          sessionId: adminSession.id,
          adminUserId: adminUser.id,
          expiresAt: adminSession.expires_at,
        }),
      };
    }

    return {
      reply: formatAdminMenu(adminUser.role),
      nextContext: adminReplyContext({
        state: "admin_menu",
        role: adminUser.role,
        sessionId: adminSession.id,
        adminUserId: adminUser.id,
        expiresAt: adminSession.expires_at,
      }),
    };
  }

  if (gateCommand && isAdminPhone(customer.whatsapp_phone)) {
    if (!gateCommand.valid) {
      return {
        reply: TICKET_MESSAGES.gateAdminInvalidCommand,
        nextContext: {
          ...baseContext,
          step: previousState.step ?? "idle",
          state: previousState.state ?? "idle",
        },
      };
    }

    const gateSessionResult = await createGateSession({
      validatorPhone: gateCommand.validatorPhone,
      createdByAdminPhone: customer.whatsapp_phone,
      gateLabel: gateCommand.gateLabel,
    });

    if (!gateSessionResult.ok) {
      return {
        reply: TICKET_MESSAGES.gateAdminCreateError,
        nextContext: {
          ...baseContext,
          step: previousState.step ?? "idle",
          state: previousState.state ?? "idle",
        },
      };
    }

    const sendResult = await sendZapiText({
      phone: gateCommand.validatorPhone,
      message: buildGateValidatorMessage(gateSessionResult.gateUrl),
    });

    if (!sendResult.ok) {
      await revokeGateSession(gateSessionResult.gateSession.id);
    }

    return {
      reply: buildGateAdminReply({
        validatorPhone: gateCommand.validatorPhone,
        gateLabel: gateCommand.gateLabel,
        expiresAt: gateSessionResult.gateSession.expires_at,
        sent: sendResult.ok,
      }),
      nextContext: {
        ...baseContext,
        step: previousState.step ?? "idle",
        state: previousState.state ?? "idle",
      },
    };
  }

  if (gateCommand && !isAdminPhone(customer.whatsapp_phone)) {
    if (!gateCommand.valid && normalizeAdminText(text) === "portaria") {
      const accessResult = await findActiveGateAccessesForPhone(
        customer.whatsapp_phone,
      );

      if (accessResult.ok && accessResult.accesses.length === 1) {
        const access = accessResult.accesses[0];

        return {
          reply: renderGateAccessPassphrasePrompt(access.eventTitle),
          nextContext: {
            ...baseContext,
            step: "gate_access_passphrase_collecting",
            state: "gate_access_passphrase_collecting",
            gateAccess: {
              selectedAccessId: access.id,
              lastAccesses: [
                {
                  option: 1,
                  gateAccessId: access.id,
                  eventTitle: access.eventTitle,
                },
              ],
            },
          },
        };
      }

      if (accessResult.ok && accessResult.accesses.length > 1) {
        return {
          reply: renderGateAccessSelection(accessResult.accesses),
          nextContext: {
            ...baseContext,
            step: "gate_access_selecting",
            state: "gate_access_selecting",
            gateAccess: {
              lastAccesses: accessResult.accesses.map((access, index) => ({
                option: index + 1,
                gateAccessId: access.id,
                eventTitle: access.eventTitle,
              })),
            },
          },
        };
      }

      return {
        reply:
          "Não encontrei acesso de portaria ativo para este telefone.",
        nextContext: {
          ...baseContext,
          step: "idle",
          state: "idle",
        },
      };
    }

    return {
      reply: TICKET_MESSAGES.adminReservedNeutral,
      nextContext: {
        ...baseContext,
        step: "idle",
        state: "idle",
      },
    };
  }

  if (normalizeAdminText(text) === "cortesia") {
    const deliveryResult = await buildCourtesyDeliveryForPhone(
      customer.whatsapp_phone,
    ).catch(() => ({ ok: false as const, reason: "not_found" as const }));

    if (!deliveryResult.ok) {
      return {
        reply:
          "Não encontrei cortesia disponível para este telefone. Confira se ela já foi emitida para este número.",
        nextContext: resetBuyerReservationContext(baseContext),
      };
    }

    return {
      reply: deliveryResult.delivery.message,
      outboundMessages: [
        { type: "text", body: deliveryResult.delivery.message },
        ...deliveryResult.delivery.qrImages.map((image) => ({
          type: "image" as const,
          imageUrl: image.imageUrl,
          caption: image.caption,
        })),
      ],
      nextContext: resetBuyerReservationContext(baseContext),
    };
  }

  if (
    isBuyerReservationExitIntent(text) &&
    previousState.state !== "reservation_created" &&
    previousState.state !== "payment_pending"
  ) {
    return {
      reply: TICKET_MESSAGES.buyerFlowReset,
      nextContext: resetBuyerReservationContext(baseContext),
    };
  }

  const parsedSearch = parseEventSearchMessage(text);

  if (
    previousState.state === "payment_pending" &&
    previousState.reservation?.reservationId &&
    previousState.reservation.orderId
  ) {
    const shouldExitReservationFlow = isBuyerReservationExitIntent(text);
    const reservationContextExpired = isReservationContextExpired(
      previousState.reservation,
    );

    if (shouldExitReservationFlow || reservationContextExpired) {
      const cancelResult = await cancelPendingReservationForCustomer({
        customerId: customer.id,
        reservationId: previousState.reservation.reservationId,
        orderId: previousState.reservation.orderId,
      });

      return {
        reply: messageForBuyerReservationCancellation({
          expired: reservationContextExpired,
          cancelResult,
        }),
        nextContext: resetBuyerReservationContext(baseContext),
      };
    }

    if (!isPaymentLinkIntent(text) && !isSimpleReservationReply(text)) {
      return {
        reply: TICKET_MESSAGES.paymentLinkPrompt,
        nextContext: {
          ...baseContext,
          step: "payment_pending",
          state: "payment_pending",
        },
      };
    }

    const checkoutResult = await createCheckoutForReservation({
      reservationId: previousState.reservation.reservationId,
      orderId: previousState.reservation.orderId,
      customerId: customer.id,
    });

    if (!checkoutResult.ok) {
      return {
        reply: formatCheckoutFailureMessage(checkoutResult),
        nextContext: {
          ...baseContext,
          step: "idle",
          state: "idle",
          reservation: undefined,
          payment: undefined,
          selectedSeat: undefined,
          lastSeats: [],
          lastSections: [],
          lastEvents: [],
        },
      };
    }

    return {
      reply: formatPaymentLinkReply({
        selectedEvent: previousState.selectedEvent,
        selectedSection: previousState.selectedSection,
        selectedSeat: previousState.selectedSeat,
        reservation: previousState.reservation,
        checkout: checkoutResult.checkout,
      }),
      nextContext: {
        ...baseContext,
        step: "payment_pending",
        state: "payment_pending",
        reservation: {
          reservationId: checkoutResult.checkout.reservationId,
          orderId: checkoutResult.checkout.orderId,
          expiresAt: checkoutResult.checkout.expiresAt,
          totalAmountCents:
            previousState.reservation?.totalAmountCents ??
            checkoutResult.checkout.amountCents,
          totalFeeCents: previousState.reservation?.totalFeeCents ?? 0,
          currency: checkoutResult.checkout.currency,
        },
        payment: buildPaymentContext(checkoutResult.checkout),
      },
    };
  }

  if (previousState.state === "reservation_created") {
    if (
      !previousState.reservation?.reservationId ||
      !previousState.reservation.orderId
    ) {
      return {
        reply: TICKET_MESSAGES.reservationUnavailableForPayment,
        nextContext: {
          ...baseContext,
          step: "idle",
          state: "idle",
          reservation: undefined,
          selectedSeat: undefined,
          lastSeats: [],
        },
      };
    }

    const shouldExitReservationFlow = isBuyerReservationExitIntent(text);
    const reservationContextExpired = isReservationContextExpired(
      previousState.reservation,
    );

    if (shouldExitReservationFlow || reservationContextExpired) {
      const cancelResult = await cancelPendingReservationForCustomer({
        customerId: customer.id,
        reservationId: previousState.reservation.reservationId,
        orderId: previousState.reservation.orderId,
      });

      return {
        reply: messageForBuyerReservationCancellation({
          expired: reservationContextExpired,
          cancelResult,
        }),
        nextContext: resetBuyerReservationContext(baseContext),
      };
    }

    if (!isPaymentLinkIntent(text) && !isSimpleReservationReply(text)) {
      return {
        reply: TICKET_MESSAGES.paymentLinkPrompt,
        nextContext: {
          ...baseContext,
          step: "reservation_created",
          state: "reservation_created",
        },
      };
    }

    const checkoutResult = await createCheckoutForReservation({
      reservationId: previousState.reservation.reservationId,
      orderId: previousState.reservation.orderId,
      customerId: customer.id,
    });

    if (!checkoutResult.ok) {
      return {
        reply: formatCheckoutFailureMessage(checkoutResult),
        nextContext: {
          ...baseContext,
          step: "idle",
          state: "idle",
          reservation: undefined,
          payment: undefined,
          selectedSeat: undefined,
          lastSeats: [],
          lastSections: [],
          lastEvents: [],
        },
      };
    }

    return {
      reply: formatPaymentLinkReply({
        selectedEvent: previousState.selectedEvent,
        selectedSection: previousState.selectedSection,
        selectedSeat: previousState.selectedSeat,
        reservation: previousState.reservation,
        checkout: checkoutResult.checkout,
      }),
      nextContext: {
        ...baseContext,
        step: "payment_pending",
        state: "payment_pending",
        reservation: {
          reservationId: checkoutResult.checkout.reservationId,
          orderId: checkoutResult.checkout.orderId,
          expiresAt: checkoutResult.checkout.expiresAt,
          totalAmountCents: previousState.reservation.totalAmountCents,
          totalFeeCents: previousState.reservation.totalFeeCents,
          currency: checkoutResult.checkout.currency,
        },
        payment: buildPaymentContext(checkoutResult.checkout),
      },
    };
  }

  if (previousState.state === "selecting_quantity") {
    const quantity = parseTicketQuantity(text);

    if (!previousState.selectedEvent || !previousState.selectedSection) {
      return {
        reply: TICKET_MESSAGES.sectionUnavailable,
        nextContext: {
          ...baseContext,
          step: "idle",
          state: "idle",
          selectedSection: undefined,
          lastSeats: [],
        },
      };
    }

    if (!quantity) {
      return {
        reply: "Envie a quantidade de ingressos usando apenas números. Ex: 2",
        nextContext: {
          ...baseContext,
          step: "selecting_quantity",
          state: "selecting_quantity",
        },
      };
    }

    if (quantity > 10) {
      return {
        reply:
          "Para esta compra, escolha até 10 ingressos por vez. Envie uma quantidade menor.",
        nextContext: {
          ...baseContext,
          step: "selecting_quantity",
          state: "selecting_quantity",
        },
      };
    }

    if (previousState.selectedSection.hasNumberedSeats) {
      const seatMap = await listSeatMap({
        sessionId: previousState.selectedEvent.sessionId,
        sectionId: previousState.selectedSection.sectionId,
      });

      if (seatMap.availableSeats.length < quantity) {
        return {
          reply: TICKET_MESSAGES.noSeatsAvailable,
          nextContext: {
            ...baseContext,
            step: "selecting_quantity",
            state: "selecting_quantity",
          },
        };
      }

      const seatsReply = formatSeatsReply({
        seatMap,
        ticketType: previousState.selectedSection.selectedTicketType,
        quantity,
      });

      return {
        reply: seatsReply,
        outboundMessages: [
          {
            type: "image",
            imageUrl: buildSeatMapPngDataUrl({
              seatMap,
              title: previousState.selectedSection.sectionName,
              stageLabel: "PALCO",
            }),
            caption: seatsReply,
          },
        ],
        nextContext: {
          ...baseContext,
          step: "showing_seats",
          state: "showing_seats",
          selectedQuantity: quantity,
          lastSeats: buildSeatOptions(seatMap.availableSeats),
        },
      };
    }

    const reservationResult = await reserveUnnumberedSectionTickets({
      customerId: customer.id,
      conversationId: conversation.id,
      eventId: previousState.selectedEvent.eventId,
      sessionId: previousState.selectedEvent.sessionId,
      sectionId: previousState.selectedSection.sectionId,
      quantity,
      ticketType: previousState.selectedSection.selectedTicketType?.ticketType ?? "full",
    });

    if (!reservationResult.ok) {
      return {
        reply: messageForReservationFailure(reservationResult),
        nextContext: {
          ...baseContext,
          step: "selecting_quantity",
          state: "selecting_quantity",
          selectedSeat: undefined,
        },
      };
    }

    return {
      reply: formatReservationReply({
        selectedEvent: previousState.selectedEvent,
        selectedSection: previousState.selectedSection,
        reservation: reservationResult.reservation,
      }),
      nextContext: {
        ...baseContext,
        step: "reservation_created",
        state: "reservation_created",
        selectedSeat: undefined,
        reservation: buildReservationContext(reservationResult.reservation),
        lastSeats: [],
      },
    };
  }

  if (previousState.state === "showing_seats" && previousState.lastSeats?.length) {
    const quantity = previousState.selectedQuantity ?? 1;
    const requestedSeatCodes = parseRequestedSeatCodes(text);
    const selectedSeats = requestedSeatCodes.flatMap((requestedSeatCode) => {
      const selectedSeat = previousState.lastSeats?.find(
        (seat) => normalizeSeatCode(seat.seatCode) === requestedSeatCode,
      );

      return selectedSeat ? [selectedSeat] : [];
    });

    if (
      requestedSeatCodes.length !== quantity ||
      selectedSeats.length !== quantity
    ) {
      return {
        reply:
          quantity > 1
            ? `Envie exatamente ${quantity} assentos disponíveis. Ex: A03 A04`
            : TICKET_MESSAGES.seatInvalidOption,
        nextContext: {
          ...baseContext,
          step: "showing_seats",
          state: "showing_seats",
        },
      };
    }

    if (!previousState.selectedEvent || !previousState.selectedSection) {
      return {
        reply: TICKET_MESSAGES.seatUnavailable,
        nextContext: {
          ...baseContext,
          step: "showing_sections",
          state: "showing_sections",
          selectedSeat: undefined,
          reservation: undefined,
        },
      };
    }

    const reservationResult = await reserveSelectedSeat({
      customerId: customer.id,
      conversationId: conversation.id,
      eventId: previousState.selectedEvent.eventId,
      sessionId: previousState.selectedEvent.sessionId,
      sectionId: previousState.selectedSection.sectionId,
      seatIds: selectedSeats.map((selectedSeat) => selectedSeat.seatId),
      ticketType: previousState.selectedSection.selectedTicketType?.ticketType ?? "full",
    });

    if (!reservationResult.ok) {
      if (reservationResult.reason === "active_reservation_exists") {
        return {
          reply: messageForReservationFailure(reservationResult),
          nextContext: {
            ...baseContext,
            step: "reservation_created",
            state: "reservation_created",
            reservation: reservationResult.reservation,
            selectedSeat: undefined,
            lastSeats: [],
          },
        };
      }

      return {
        reply: messageForReservationFailure(reservationResult),
        nextContext: {
          ...baseContext,
          step: "showing_seats",
          state: "showing_seats",
          selectedSeat: undefined,
          reservation: undefined,
        },
      };
    }

    const selectedSeatContext =
      selectedSeats.length === 1 ? buildSelectedSeatContext(selectedSeats[0]!) : undefined;
    const reservationContext = buildReservationContext(
      reservationResult.reservation,
    );

    return {
      reply: formatReservationReply({
        selectedEvent: previousState.selectedEvent,
        selectedSection: previousState.selectedSection,
        selectedSeat: selectedSeatContext,
        reservation: reservationResult.reservation,
      }),
      nextContext: {
        ...baseContext,
        step: "reservation_created",
        state: "reservation_created",
        selectedSeat: selectedSeatContext,
        selectedQuantity: undefined,
        reservation: reservationContext,
        lastSeats: [],
      },
    };
  }

  if (
    parsedSearch.numericSelection &&
    previousState.state === "showing_events" &&
    previousState.lastEvents?.length === 1 &&
    (parsedSearch.numericSelection === 2 || parsedSearch.numericSelection === 3)
  ) {
    if (parsedSearch.numericSelection === 2) {
      return {
        reply: formatSingleEventMoreInfo(previousState.lastEvents[0]),
        nextContext: {
          ...baseContext,
          step: "showing_events",
          state: "showing_events",
        },
      };
    }

    return {
      reply: TICKET_MESSAGES.genericHelp,
      nextContext: {
        ...baseContext,
        step: "idle",
        state: "idle",
        lastEvents: [],
        lastSections: [],
        selectedEvent: undefined,
      },
    };
  }

  if (
    parsedSearch.numericSelection &&
    previousState.state === "showing_events" &&
    previousState.lastEvents?.some(
      (event) => event.option === parsedSearch.numericSelection,
    )
  ) {
    const selectedContextEvent = previousState.lastEvents.find(
      (event) => event.option === parsedSearch.numericSelection,
    );

    if (!selectedContextEvent) {
      return {
        reply: TICKET_MESSAGES.numericInvalidOption,
        nextContext: {
          ...baseContext,
          step: "showing_events",
          state: "showing_events",
        },
      };
    }

    const selectedSession = await getValidatedEventSession({
      eventId: selectedContextEvent.eventId,
      sessionId: selectedContextEvent.sessionId,
    });

    if (!selectedSession) {
      return {
        reply: TICKET_MESSAGES.eventOptionUnavailable,
        nextContext: {
          ...baseContext,
          step: "idle",
          state: "idle",
          lastEvents: [],
          lastSections: [],
          selectedEvent: undefined,
        },
      };
    }

    const selectedEvent = buildSelectedEvent(selectedSession);
    const sections = await listAvailableSections(selectedSession.sessionId, {
      venueId: selectedSession.venueId,
    });

    if (sections.length === 0) {
      return {
        reply: TICKET_MESSAGES.noSectionsAvailable,
        nextContext: {
          ...baseContext,
          step: "idle",
          state: "idle",
          selectedEvent,
          lastEvents: [],
          lastSections: [],
        },
      };
    }

    return {
      reply: formatSectionsReply({ sections }),
      nextContext: {
        ...baseContext,
        step: "showing_sections",
        state: "showing_sections",
        selectedEvent,
        lastSections: buildSectionOptions(sections),
      },
    };
  }

  if (
    parsedSearch.numericSelection &&
    previousState.state === "showing_events" &&
    previousState.lastEvents?.length
  ) {
    return {
      reply: TICKET_MESSAGES.numericInvalidOption,
      nextContext: {
        ...baseContext,
        step: "showing_events",
        state: "showing_events",
      },
    };
  }

  if (parsedSearch.numericSelection) {
    if (
      previousState.state === "showing_sections" &&
      previousState.lastSections?.length
    ) {
      const selectedContextSection = previousState.lastSections.find(
        (section) => section.option === parsedSearch.numericSelection,
      );

      if (!selectedContextSection) {
        return {
          reply: TICKET_MESSAGES.sectionInvalidOption,
          nextContext: {
            ...baseContext,
            step: "showing_sections",
            state: "showing_sections",
          },
        };
      }

      if (!previousState.selectedEvent) {
        return {
          reply: TICKET_MESSAGES.sectionUnavailable,
          nextContext: {
            ...baseContext,
            step: "idle",
            state: "idle",
            selectedSection: undefined,
            lastSeats: [],
          },
        };
      }

      const selectedSession = await getValidatedEventSession({
        eventId: previousState.selectedEvent.eventId,
        sessionId: previousState.selectedEvent.sessionId,
      });

      if (!selectedSession) {
        return {
          reply: TICKET_MESSAGES.sectionUnavailable,
          nextContext: {
            ...baseContext,
            step: "showing_sections",
            state: "showing_sections",
            selectedSection: undefined,
            lastSeats: [],
          },
        };
      }

      const selectedSection = await getAvailableSectionForSession({
        sessionId: selectedSession.sessionId,
        sectionId: selectedContextSection.sectionId,
        venueId: selectedSession.venueId,
      });

      if (!selectedSection) {
        return {
          reply: TICKET_MESSAGES.sectionUnavailable,
          nextContext: {
            ...baseContext,
            step: "showing_sections",
            state: "showing_sections",
            selectedSection: undefined,
            lastSeats: [],
          },
        };
      }

      const selectedTicketType =
        selectedSection.ticketTypes.find(
          (ticketType) =>
            ticketType.ticketPriceId ===
            selectedContextSection.selectedTicketType?.ticketPriceId,
        ) ?? selectedSection.ticketTypes[0];
      const selectedSectionContext = buildSelectedSection(
        selectedSection,
        selectedTicketType,
      );

      if (!selectedSection.hasNumberedSeats) {
        return {
          reply: formatQuantityPrompt(selectedSection, selectedTicketType),
          nextContext: {
            ...baseContext,
            step: "selecting_quantity",
            state: "selecting_quantity",
            selectedEvent: buildSelectedEvent(selectedSession),
            selectedSection: selectedSectionContext,
            lastSeats: [],
          },
        };
      }

      return {
        reply: formatQuantityPrompt(selectedSection, selectedTicketType),
        nextContext: {
          ...baseContext,
          step: "selecting_quantity",
          state: "selecting_quantity",
          selectedEvent: buildSelectedEvent(selectedSession),
          selectedSection: selectedSectionContext,
          selectedQuantity: undefined,
          lastSeats: [],
        },
      };
    }

    return {
      reply: TICKET_MESSAGES.numericWithoutContext,
      nextContext: {
        ...baseContext,
        step: "idle",
        state: "idle",
        lastEvents: [],
        lastSections: [],
        selectedEvent: undefined,
        selectedSeat: undefined,
        reservation: undefined,
      },
    };
  }

  if (parsedSearch.isGeneric) {
    return {
      reply: TICKET_MESSAGES.genericHelp,
      nextContext: {
        ...baseContext,
        step: "idle",
        state: "idle",
      },
    };
  }

  const events = await searchEvents(parsedSearch);

  if (events.length === 0) {
    return {
      reply: TICKET_MESSAGES.noEventsFound,
      nextContext: {
        ...baseContext,
        step: "idle",
        state: "idle",
        lastSearch: parsedSearch,
        lastEvents: [],
      },
    };
  }

  return {
    reply: formatEventsReply(events),
    outboundMessages: buildEventSearchOutboundMessages(events),
    nextContext: {
      ...baseContext,
      step: "showing_events",
      state: "showing_events",
      lastSearch: parsedSearch,
      lastEvents: buildEventOptions(events),
    },
  };
}
