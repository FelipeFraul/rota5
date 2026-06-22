import "server-only";

import { logError } from "@/lib/logger";
import {
  buildInitialConversationState,
  type TicketConversationCart,
  type TicketConversationCartItem,
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
  listAllPublicEventsByDate,
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
  reserveTicketCart,
  type ReserveSelectedSeatResult,
  type ReserveSelectedSeatSuccess,
} from "@/lib/tickets/services/reservations";
import {
  issuePublicFreeTicketsForOrder,
  type IssuePublicFreeTicketsResult,
} from "@/lib/tickets/services/publicFreeTickets";
import {
  buildTicketDeliveryPayload,
} from "@/lib/tickets/services/ticketDelivery";
import {
  listPaidTicketResendGroupsForPhone,
  type PaidTicketResendGroup,
} from "@/lib/tickets/services/tickets";
import {
  formatPublicHelpAnswer,
  formatPublicHelpPrompt,
  formatPublicHelpResults,
  getPublicHelpTopicById,
  isPublicHelpCommand,
  searchPublicHelpTopics,
} from "@/lib/tickets/services/publicHelp";
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
  updateAdminSectionCapacity,
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
  findAdminPendingReservationsByInput,
  findAdminTicketByCode,
  findAdminTicketsByPhone,
  listAdminTicketValidations,
  type AdminPendingReservationLookup,
  type AdminTicketLookup,
  type AdminTicketValidation,
} from "@/lib/tickets/services/adminTickets";
import {
  buildCourtesyAdminSuccess,
  buildCourtesyDeliveryForPhone,
  buildCourtesyDeliveryForCourtesyId,
  buildCourtesyEventsReply,
  buildCourtesyConfirmation,
  buildCourtesySectionsReply,
  buildCourtesySessionsReply,
  buildCourtesiesListReply,
  cancelCourtesyForEvent,
  findCourtesyTargets,
  issueAdminCourtesy,
  listCourtesySections,
  listCourtesyEvents,
  listCourtesySessions,
  listCourtesiesForEvent,
  normalizeCourtesyPhone,
  parseCourtesySeatCodes,
  resolveCourtesyEventId,
  resolveCourtesyCancelTarget,
  resolveCourtesySectionId,
  resolveCourtesySessionId,
} from "@/lib/tickets/services/adminCourtesies";
import {
  createAdminUser,
  disableAdminUser,
  getAdminProfileLabel,
  listBlockedAdminAuths,
  listAdminUsers,
  parseAdminRole,
  reactivateAdminUser,
  resolveBlockedAdminAuthPhone,
  resolveAdminUserId,
  unlockAdminAuthForPhone,
  updateAdminRole,
  type AdminAuthBlockedListItem,
  type AdminUserListItem,
} from "@/lib/tickets/services/adminUsers";
import {
  normalizeGatePhone,
  createGateSession,
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
  buildAdminGeneralReport,
  type AdminReportPeriod,
  type AdminReportType,
} from "@/lib/tickets/services/adminReports";
import {
  ADMIN_LOGIN_LINK_REDACTED_BODY,
  consumeAdminLoginChallengeCode,
  createAdminLoginChallenge,
  createAdminSession,
  formatAdminMenu,
  getActiveAdminSession,
  getAdminAuthBlockStatus,
  getAdminUserByPhone,
  hasAdminPermission,
  isAdminLogoutCommand,
  isReservedAdminCommand,
  hashAdminPassphrase,
  normalizeAdminPhone,
  normalizeAdminText,
  requireAdminPermission,
  revokeActiveAdminSessions,
  type AdminRole,
  type AdminPermission,
} from "@/lib/tickets/services/adminAuth";

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
  sourceIdentifier?: string | null;
};

type RouteTicketMessageOutput = {
  reply: string;
  outboundMessages?: Array<
    | { type: "text"; body: string; phone?: string; persistedBody?: string; delayMs?: number }
    | { type: "image"; imageUrl: string; caption: string; phone?: string; persistedBody?: string; delayMs?: number }
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

function formatCurrencyFromCents(cents: number) {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(cents / 100);
}

function formatOptionLine(
  option: number | string,
  label: string,
  { preserveCase = false }: { preserveCase?: boolean } = {},
) {
  const normalizedLabel =
    preserveCase || label.length === 0
      ? label
      : label.charAt(0).toLocaleLowerCase("pt-BR") + label.slice(1);
  const emphasizedLabel =
    /\b(?:comprar|saber mais|voltar|ver mais|nova pesquisa)\b/iu.test(
      normalizedLabel,
    )
      ? `*${normalizedLabel}*`
      : normalizedLabel;

  return `Digite ${option} para ${emphasizedLabel}`;
}

const CANONICAL_TICKET_OPTION_LABELS: Record<string, string> = {
  "cadeira individual (todos pagam meia)":
    "Cadeira Individual (TODOS pagam meia)",
  "1ª fileira (com balcão) - cadeira individual":
    "1ª FILEIRA (com balcão) - cadeira Individual",
  "poltrona+mesa 2 lugares (1 deste vale para 2)":
    "Poltrona+Mesa 2 lugares (1 deste vale para 2)",
  "poltrona+mesa 4 lugares (1 deste vale para 4)":
    "Poltrona+Mesa 4 lugares (1 deste vale para 4)",
};

function formatTicketOptionLabel(label: string) {
  const formattedLabel = label
    .trim()
    .toLocaleLowerCase("pt-BR")
    .replace(/\bmesa\s+para\s+08\s+pessoas\b/gi, "mesa 8 pessoas")
    .replace(/\bmesa\s+para\s+/gi, "mesa ")
    .replace(/\s+/g, " ");

  return CANONICAL_TICKET_OPTION_LABELS[formattedLabel] ?? formattedLabel;
}

function formatTicketOptionLine(
  option: number | string,
  label: string,
  priceLabel: string,
) {
  return `Digite ${option} *${formatTicketOptionLabel(label)}* - ${priceLabel}`;
}

function shouldUseTicketLabelForSingleOffer(sectionName: string) {
  const normalized = sectionName
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLocaleLowerCase("pt-BR")
    .trim();

  return ["cadeira", "1ª fileira", "mesa", "mesas"].includes(normalized);
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
    description: event.description,
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

function formatEventOptionsReply(events: TicketConversationEventOption[]) {
  const lines = events.flatMap((event, index) => [
    formatSingleEventOptionReply(event, index, events.length),
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
  ];
  const buyOption = totalEvents === 1 ? 1 : index * 2 + 1;
  const moreInfoOption = buyOption + 1;
  const options = [
    formatOptionLine(buyOption, "comprar"),
    formatOptionLine(moreInfoOption, "saber mais"),
    "Digite uma palavra para *nova pesquisa*",
  ];

  return [
    `🎟️ - *${title}*`,
    ...details,
    "",
    ...options,
  ].join("\n");
}

function formatSingleEventOptionReply(
  event: TicketConversationEventOption,
  index: number,
  totalEvents: number,
) {
  const title = formatAnnouncementTitle(event.title);
  const details = [
    ...(event.artistName ? [`> 🎤 Artista: ${formatProperName(event.artistName)}`] : []),
    `> 📍 Cidade: ${formatCityState(event.city, event.state)}`,
    `> 🗓️ Data: ${formatEventDate(event.startsAt)}`,
  ];
  const buyOption = totalEvents === 1 ? 1 : index * 2 + 1;
  const moreInfoOption = buyOption + 1;
  const options = [
    formatOptionLine(buyOption, "comprar"),
    formatOptionLine(moreInfoOption, "saber mais"),
    "Digite uma palavra para *nova pesquisa*",
  ];

  return [
    `🎟️ - *${title}*`,
    ...details,
    "",
    ...options,
  ].join("\n");
}

function formatAllEventsReply(
  events: Array<TicketEventSearchResult | TicketConversationEventOption>,
) {
  const lines = events.flatMap((event, index) => [
    formatSingleAllEventReply(event, index),
    "",
  ]);

  return [
    "Encontrei estes eventos:",
    "",
    ...lines,
  ].join("\n");
}

function formatSingleAllEventReply(
  event: TicketEventSearchResult | TicketConversationEventOption,
  index: number,
) {
  const buyOption = index * 2 + 1;
  const moreInfoOption = buyOption + 1;

  return [
    `🎟️ - *${formatAnnouncementTitle(event.title)}*`,
    `> 🎤 Artista: ${formatProperName(event.artistName)}`,
    `> 📍 Cidade: ${formatCityState(event.city, event.state)}`,
    `> 🗓️ Data: ${formatEventDate(event.startsAt)}`,
    "",
    formatOptionLine(buyOption, "comprar"),
    formatOptionLine(moreInfoOption, "ver mais"),
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

function buildEventOptionOutboundMessages(events: TicketConversationEventOption[]) {
  return events.map((event, index) => {
    const caption = formatSingleEventOptionReply(event, index, events.length);

    return event.imageUrl
      ? ({ type: "image", imageUrl: event.imageUrl, caption } as const)
      : ({ type: "text", body: caption } as const);
  });
}

function buildEventMoreInfoOutboundMessages(
  event: TicketConversationEventOption | TicketConversationSelectedEvent,
) {
  const body = formatSingleEventMoreInfo(event);

  return [
    event.imageUrl
      ? ({ type: "image", imageUrl: event.imageUrl, caption: body } as const)
      : ({ type: "text", body } as const),
    { type: "text", body: formatSingleEventMoreInfoOptions() } as const,
  ];
}

function formatSingleEventMoreInfo(
  event: TicketConversationEventOption | TicketConversationSelectedEvent,
) {
  const description = event.description?.trim();

  return [
    `🎟️ - *${formatAnnouncementTitle(event.title)}*`,
    ...(event.artistName ? [`> 🎤 Artista: ${formatProperName(event.artistName)}`] : []),
    `> 📍 Cidade: ${formatCityState(event.city, event.state)}`,
    `> 🗓️ Data: ${formatEventDate(event.startsAt)}`,
    ...(event.venueName ? [`> 🏟️ Local: ${formatProperName(event.venueName)}`] : []),
    "",
    "*INFORMAÇÕES DO EVENTO*",
    description || "Nenhuma informação adicional cadastrada para este evento.",
  ].join("\n");
}

function formatSingleEventMoreInfoOptions() {
  return [
    formatOptionLine(1, "comprar"),
    formatOptionLine(2, "voltar"),
    "Digite uma palavra para *nova pesquisa*",
  ].join("\n");
}

const ALL_EVENTS_MESSAGE_MAX_LENGTH = 3_500;

function buildAllEventsOutboundMessages(
  events: Array<TicketEventSearchResult | TicketConversationEventOption>,
) {
  const messages: Array<{ type: "text"; body: string }> = [];
  let current = "Encontrei estes eventos:";

  events.forEach((event, index) => {
    const block = formatSingleAllEventReply(event, index);
    const candidate = `${current}\n\n${block}`;

    if (candidate.length <= ALL_EVENTS_MESSAGE_MAX_LENGTH) {
      current = candidate;
      return;
    }

    messages.push({ type: "text", body: current });
    current = `*EVENTOS — CONTINUAÇÃO*\n\n${block}`;
  });

  if (current) {
    messages.push({ type: "text", body: current });
  }

  return messages;
}

function buildSelectedEvent(
  event: TicketEventSearchResult,
): TicketConversationSelectedEvent {
  return {
    eventId: event.eventId,
    sessionId: event.sessionId,
    title: event.title,
    artistName: event.artistName,
    description: event.description,
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
      hasUnlimitedCapacity: section.hasUnlimitedCapacity,
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
    hasUnlimitedCapacity: section.hasUnlimitedCapacity,
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
  if (priceCents === 0 && feeCents === 0) {
    return "Gratuito";
  }

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
        : shouldUseTicketLabelForSingleOffer(section.sectionName)
          ? ticketType.label
        : section.sectionName;
      const line = formatTicketOptionLine(
        option,
        label,
        formatPriceWithOptionalFee(ticketType.priceCents, ticketType.feeCents),
      );
      option += 1;
      return line;
    }),
  );

  return [
    "*ESCOLHA SEU INGRESSO/SETOR*",
    sectionLines.join("\n---\n"),
    "",
    "Responda com o número do setor para continuar.",
    'Digite "Voltar" para voltar.',
  ].join("\n");
}

function formatQuantityPrompt(
  section: AvailableSection,
  ticketType = section.ticketTypes[0],
) {
  const isFree = isPublicFreeTicketType(ticketType);
  const selectedPrice = ticketType
    ? formatPriceWithOptionalFee(ticketType.priceCents, ticketType.feeCents)
    : formatSectionPrice(section);

  return [
    `*${section.sectionName.toLocaleUpperCase("pt-BR")}*`,
    "",
    ...(ticketType ? [`> Ingresso: ${ticketType.label}`] : []),
    `> 🎫 Valor: ${selectedPrice}`,
    "",
    isFree
      ? "Digite o número de ingressos gratuitos, até 4 por pedido. Ex: 2"
      : "Digite o número de ingressos para compra, ex: 2",
    'Digite "Voltar" para voltar.',
  ].join("\n");
}

function isPublicFreeTicketType(
  ticketType?: TicketConversationSectionTicketType | AvailableSection["ticketTypes"][number],
) {
  return Boolean(ticketType && ticketType.priceCents === 0 && ticketType.feeCents === 0);
}

function getMaxTicketsPerOrder(
  ticketType?: TicketConversationSectionTicketType,
) {
  return isPublicFreeTicketType(ticketType) ? 4 : 10;
}

function getCartQuantity(cart?: TicketConversationCart) {
  return cart?.items.reduce((total, item) => total + item.quantity, 0) ?? 0;
}

function getCartFreeQuantity(cart?: TicketConversationCart) {
  return (
    cart?.items.reduce(
      (total, item) =>
        total +
        (item.priceCents === 0 && item.feeCents === 0 ? item.quantity : 0),
      0,
    ) ?? 0
  );
}

function getCartSectionQuantity(
  cart: TicketConversationCart | undefined,
  sectionId: string,
) {
  return (
    cart?.items.reduce(
      (total, item) =>
        total + (item.sectionId === sectionId ? item.quantity : 0),
      0,
    ) ?? 0
  );
}

function getCartSeatIds(cart?: TicketConversationCart) {
  return new Set(
    cart?.items.flatMap((item) =>
      (item.seats ?? []).map((seat) => seat.seatId),
    ) ?? [],
  );
}

function addSelectionToCart({
  cart,
  selectedEvent,
  selectedSection,
  quantity,
  seats,
}: {
  cart?: TicketConversationCart;
  selectedEvent: TicketConversationSelectedEvent;
  selectedSection: TicketConversationSelectedSection;
  quantity: number;
  seats?: TicketConversationSelectedSeat[];
}) {
  const ticket = selectedSection.selectedTicketType;

  if (!ticket) return null;
  if (
    cart &&
    (cart.eventId !== selectedEvent.eventId ||
      cart.sessionId !== selectedEvent.sessionId)
  ) {
    return null;
  }

  const nextItem: TicketConversationCartItem = {
    sectionId: selectedSection.sectionId,
    sectionName: selectedSection.sectionName,
    hasNumberedSeats: selectedSection.hasNumberedSeats,
    ticketPriceId: ticket.ticketPriceId,
    ticketType: ticket.ticketType,
    ticketLabel: ticket.label,
    priceCents: ticket.priceCents,
    feeCents: ticket.feeCents,
    currency: ticket.currency,
    quantity,
    ...(seats?.length ? { seats } : {}),
  };
  const existingItems = cart?.items ?? [];
  const matchingIndex = existingItems.findIndex(
    (item) => item.ticketPriceId === ticket.ticketPriceId,
  );
  let nextItems: TicketConversationCartItem[];

  if (matchingIndex < 0) {
    nextItems = [...existingItems, nextItem];
  } else {
    const matchingItem = existingItems[matchingIndex]!;
    const mergedSeats = [
      ...(matchingItem.seats ?? []),
      ...(nextItem.seats ?? []),
    ];
    const uniqueSeatIds = new Set(mergedSeats.map((seat) => seat.seatId));

    if (uniqueSeatIds.size !== mergedSeats.length) return null;

    nextItems = existingItems.map((item, index) =>
      index === matchingIndex
        ? {
            ...item,
            quantity: item.quantity + quantity,
            ...(mergedSeats.length ? { seats: mergedSeats } : {}),
          }
        : item,
    );
  }

  return {
    eventId: selectedEvent.eventId,
    sessionId: selectedEvent.sessionId,
    items: nextItems,
  } satisfies TicketConversationCart;
}

function formatCartDecisionReply({ cart }: { cart: TicketConversationCart }) {
  const totalAmountCents = cart.items.reduce(
    (total, item) => total + item.priceCents * item.quantity,
    0,
  );
  const totalFeeCents = cart.items.reduce(
    (total, item) => total + item.feeCents * item.quantity,
    0,
  );
  const cartItemLines = cart.items.flatMap((item, index) => [
    ...(index > 0 ? ["---"] : []),
    `> Item ${index + 1}: ${item.ticketLabel}`,
    `> Quantidade: ${item.quantity}`,
    ...(item.seats?.length
      ? [`> Assentos: ${item.seats.map((seat) => seat.seatCode).join(", ")}`]
      : []),
    `> Subtotal: ${formatPriceWithOptionalFee(
      item.priceCents * item.quantity,
      item.feeCents * item.quantity,
    )}`,
  ]);

  return [
    "*ITEM ADICIONADO À COMPRA*",
    "",
    "*ITENS NA COMPRA*",
    ...cartItemLines,
    "",
    `> Total da compra: ${formatPriceWithOptionalFee(totalAmountCents, totalFeeCents)}`,
    "",
    "Digite 1 para *continuar comprando*",
    "Digite 2 para *finalizar a compra*",
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

function isBuyerBackIntent(text: string) {
  const normalized = normalizeIntentText(text);

  return normalized === "voltar" || normalized === "volta";
}

function isAllPublicEventsIntent(text: string) {
  const normalized = normalizeIntentText(text);

  return normalized === "todos";
}

function isTicketResendCommand(text: string) {
  const normalized = normalizeIntentText(text);

  return normalized === "reenviar ingresso";
}

function isAllPublicEventsContext(context: Partial<TicketConversationState>) {
  return context.lastSearch?.originalText
    ? isAllPublicEventsIntent(context.lastSearch.originalText)
    : false;
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
    cart: undefined,
    eventMoreInfoShown: undefined,
    lastSeats: [],
    lastSections: [],
    lastEvents: [],
    publicHelp: undefined,
    ticketResend: undefined,
  };
}

function publicHelpReturnContext(baseContext: TicketConversationState) {
  const returnState = baseContext.publicHelp?.returnState;
  const returnStep = baseContext.publicHelp?.returnStep ?? returnState;

  return {
    ...baseContext,
    step: returnStep ?? "idle",
    state: returnState ?? returnStep ?? "idle",
    publicHelp: undefined,
  };
}

function isPublicHelpFlowState(state?: string) {
  return state === "help_topic_collecting" || state === "help_results";
}

function hasEnoughHelpTerms(text: string) {
  return normalizeIntentText(text)
    .split(" ")
    .filter((word) => word.length >= 2).length >= 2;
}

function buildPublicHelpSearchResponse({
  baseContext,
  query,
  page = 0,
  returnStep,
  returnState,
}: {
  baseContext: TicketConversationState;
  query: string;
  page?: number;
  returnStep?: TicketConversationStep;
  returnState?: TicketConversationStep;
}): RouteTicketMessageOutput {
  if (!hasEnoughHelpTerms(query)) {
    return {
      reply: [
        formatPublicHelpPrompt(),
        "",
        "Exemplos:",
        "> pagamento pix",
        "> qr invalido",
        "> reserva expirada",
      ].join("\n"),
      nextContext: {
        ...baseContext,
        step: "help_topic_collecting",
        state: "help_topic_collecting",
        publicHelp: {
          returnStep: returnStep ?? baseContext.publicHelp?.returnStep ?? baseContext.step,
          returnState: returnState ?? baseContext.publicHelp?.returnState ?? baseContext.state,
        },
      },
    };
  }

  const searchResult = searchPublicHelpTopics(query, page);

  return {
    reply: formatPublicHelpResults(searchResult),
    nextContext: {
      ...baseContext,
      step: searchResult.results.length > 0 ? "help_results" : "help_topic_collecting",
      state: searchResult.results.length > 0 ? "help_results" : "help_topic_collecting",
      publicHelp: {
        query,
        hasMore: searchResult.hasMore,
        page: searchResult.page,
        returnStep: returnStep ?? baseContext.publicHelp?.returnStep ?? baseContext.step,
        returnState: returnState ?? baseContext.publicHelp?.returnState ?? baseContext.state,
        lastResults: searchResult.results.map((result) => ({
          option: result.option,
          id: result.id,
          question: result.question,
        })),
      },
    },
  };
}

function handlePublicHelpMessage({
  baseContext,
  text,
}: {
  baseContext: TicketConversationState;
  text: string;
}): RouteTicketMessageOutput | null {
  if (isPublicHelpCommand(text)) {
    return {
      reply: formatPublicHelpPrompt(),
      nextContext: {
        ...baseContext,
        step: "help_topic_collecting",
        state: "help_topic_collecting",
        publicHelp: {
          returnStep: isPublicHelpFlowState(baseContext.state) ? baseContext.publicHelp?.returnStep : baseContext.step,
          returnState: isPublicHelpFlowState(baseContext.state) ? baseContext.publicHelp?.returnState : baseContext.state,
        },
      },
    };
  }

  if (!isPublicHelpFlowState(baseContext.state)) {
    return null;
  }

  if (isBuyerBackIntent(text)) {
    return {
      reply: "Voltando ao atendimento anterior.",
      nextContext: publicHelpReturnContext(baseContext),
    };
  }

  if (isBuyerReservationExitIntent(text)) {
    return {
      reply: TICKET_MESSAGES.genericHelp,
      nextContext: buildInitialConversationState(),
    };
  }

  if (baseContext.state === "help_results") {
    const normalizedText = normalizeIntentText(text);

    if (normalizedText === "ver mais" || normalizedText === "mais") {
      const previousQuery = baseContext.publicHelp?.query;

      if (!previousQuery) {
        return {
          reply: formatPublicHelpPrompt(),
          nextContext: {
            ...baseContext,
            step: "help_topic_collecting",
            state: "help_topic_collecting",
          },
        };
      }

      if (!baseContext.publicHelp?.hasMore) {
        return {
          reply:
            "Não encontrei outros tópicos para essa pesquisa. Digite outras duas palavras para uma nova busca de ajuda ou *VOLTAR* para voltar onde estava.",
          nextContext: baseContext,
        };
      }

      return buildPublicHelpSearchResponse({
        baseContext,
        query: previousQuery,
        page: (baseContext.publicHelp.page ?? 0) + 1,
      });
    }

    const selectedOption = text.trim().match(/^\d+$/) ? Number(text.trim()) : null;
    const selected = selectedOption
      ? baseContext.publicHelp?.lastResults?.find(
          (result) => result.option === selectedOption,
        )
      : null;

    if (selected) {
      const topic = getPublicHelpTopicById(selected.id);

      if (topic) {
        return {
          reply: formatPublicHelpAnswer(topic),
          nextContext: baseContext,
        };
      }
    }
  }

  return buildPublicHelpSearchResponse({
    baseContext,
    query: text,
  });
}

function parseTicketQuantity(text: string) {
  const normalized = normalizeIntentText(text);

  if (!/^\d+$/.test(normalized)) {
    return null;
  }

  const quantity = Number(normalized);

  return Number.isInteger(quantity) && quantity > 0 ? quantity : null;
}

function buildAdminContext({
  adminUserId,
  role,
  sessionId,
  expiresAt,
  authChallengeId,
  authChallengeExpiresAt,
}: {
  adminUserId?: string;
  role?: AdminRole;
  sessionId?: string;
  expiresAt?: string;
  authChallengeId?: string;
  authChallengeExpiresAt?: string;
}) {
  return {
    ...(adminUserId ? { adminUserId } : {}),
    ...(role ? { role } : {}),
    ...(sessionId ? { sessionId } : {}),
    ...(expiresAt ? { expiresAt } : {}),
    ...(authChallengeId ? { authChallengeId } : {}),
    ...(authChallengeExpiresAt ? { authChallengeExpiresAt } : {}),
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

function buildAdminEventScope(adminUser: {
  id: string;
  phone: string;
  role: AdminRole;
}): AdminEventScope {
  const normalizedPhone = normalizeGatePhone(adminUser.phone) ?? adminUser.phone;

  return {
    adminUserId: adminUser.id,
    adminPhone: normalizedPhone,
    canSeeAllEvents: adminUser.role === "root",
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
    backOption: 5,
    exitOption: 6,
    options: [
      "Gerar cortesia",
      "Listar cortesias emitidas",
      "Reenviar cortesia",
      "Cancelar cortesia",
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
    backOption: 6,
    exitOption: 7,
    options: [
      "Listar administradores",
      "Adicionar administrador",
      "Alterar nível de administrador",
      "Desativar administrador",
      "Liberar administrador bloqueado",
    ],
  },
  admin_reports_menu: {
    title: "Relatórios",
    state: "admin_reports_menu",
    mainOption: 6,
    permission: "view_reports",
    backOption: 9,
    exitOption: 10,
    options: [
      "Resumo geral",
      "Vendas por evento",
      "Vendas por setor",
      "Pagamentos pendentes",
      "Reservas expiradas/canceladas",
      "Check-ins da portaria",
      "Ingressos usados e não usados",
      "Cortesias",
    ],
  },
};

function renderAdminSubmenu(config: AdminSubmenuConfig) {
  return [
    `*${config.title.toUpperCase()}*`,
    "",
    ...config.options.map((label, index) => formatOptionLine(index + 1, label)),
    formatOptionLine(config.backOption, "voltar"),
    formatOptionLine(config.exitOption, "sair"),
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
    formatOptionLine(1, "eventos ativos"),
    formatOptionLine(2, "eventos pausados"),
    formatOptionLine(3, "eventos cancelados"),
    formatOptionLine(4, "todos os eventos"),
    formatOptionLine(5, "voltar"),
    formatOptionLine(6, "sair"),
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

  if (normalized === "voltar" || normalized === "volta" || normalized === "cancelar") {
    return "back" as const;
  }

  if (normalized === "menu" || normalized === "menu principal" || normalized === "inicio") {
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

function formatCartSummaryLines(cart: TicketConversationCart) {
  return cart.items.flatMap((item, index) => [
    ...(index > 0 ? ["---"] : []),
    `> Setor: ${item.sectionName}`,
    `> Ingresso: ${item.ticketLabel}`,
    ...(item.seats?.length
      ? [`> Assentos: ${item.seats.map((seat) => seat.seatCode).join(", ")}`]
      : []),
    `> Quantidade: ${item.quantity}`,
  ]);
}

function formatReservationReply({
  selectedEvent,
  selectedSection,
  selectedSeat,
  reservation,
  cart,
}: {
  selectedEvent: TicketConversationSelectedEvent;
  selectedSection?: TicketConversationSelectedSection;
  selectedSeat?: TicketConversationSelectedSeat;
  reservation: ReserveSelectedSeatSuccess;
  cart?: TicketConversationCart;
}) {
  const quantity = reservation.items.length || 1;

  return [
    "RESERVA CRIADA. VOCÊ TEM 10 MINUTOS PARA EFETUAR A COMPRA",
    `> Evento: ${selectedEvent.title}`,
    ...(cart
      ? formatCartSummaryLines(cart)
      : [
          ...(selectedSection ? [`> Setor: ${selectedSection.sectionName}`] : []),
          ...(selectedSection?.selectedTicketType
            ? [`> Ingresso: ${selectedSection.selectedTicketType.label}`]
            : []),
          ...(selectedSeat ? [`> Assento: ${selectedSeat.seatCode}`] : []),
          `> Quantidade: ${quantity}`,
        ]),
    "",
    `Valor: ${formatPriceWithOptionalFee(reservation.totalAmountCents, reservation.totalFeeCents)}`,
    `> Reserva válida até: ${formatTime(reservation.expiresAt)}`,
    "",
    "Para comprar, digite COMPRAR. Você receberá o link de pagamento na próxima mensagem.",
  ].join("\n");
}

function formatReservationContextReply({
  selectedEvent,
  selectedSection,
  selectedSeat,
  reservation,
  quantity = 1,
  cart,
}: {
  selectedEvent?: TicketConversationSelectedEvent;
  selectedSection?: TicketConversationSelectedSection;
  selectedSeat?: TicketConversationSelectedSeat;
  reservation: TicketConversationReservation;
  quantity?: number;
  cart?: TicketConversationCart;
}) {
  return [
    "RESERVA EM ANDAMENTO. VOCÊ AINDA PODE EFETUAR A COMPRA",
    ...(selectedEvent ? [`> Evento: ${selectedEvent.title}`] : []),
    ...(cart
      ? formatCartSummaryLines(cart)
      : [
          ...(selectedSection ? [`> Setor: ${selectedSection.sectionName}`] : []),
          ...(selectedSection?.selectedTicketType
            ? [`> Ingresso: ${selectedSection.selectedTicketType.label}`]
            : []),
          ...(selectedSeat ? [`> Assento: ${selectedSeat.seatCode}`] : []),
          `> Quantidade: ${quantity}`,
        ]),
    "",
    `Valor: ${formatPriceWithOptionalFee(reservation.totalAmountCents, reservation.totalFeeCents)}`,
    `> Reserva válida até: ${formatTime(reservation.expiresAt)}`,
    "",
    "Para comprar, digite COMPRAR. Para alterar sua escolha, digite VOLTAR.",
  ].join("\n");
}

function formatPaymentLinkReply({
  selectedEvent,
  selectedSection,
  selectedSeat,
  reservation,
  checkout,
  cart,
}: {
  selectedEvent?: TicketConversationSelectedEvent;
  selectedSection?: TicketConversationSelectedSection;
  selectedSeat?: TicketConversationSelectedSeat;
  reservation?: TicketConversationReservation;
  checkout: CheckoutForReservation;
  cart?: TicketConversationCart;
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
    ...(cart
      ? formatCartSummaryLines(cart)
      : [
          ...(selectedSection ? [`> Setor: ${selectedSection.sectionName}`] : []),
          ...(selectedSeat ? [`> Assento: ${selectedSeat.seatCode}`] : []),
        ]),
    `> Total: ${totalLabel}`,
    "",
    "Pague clicando neste link (crédito ou pix):",
    checkout.checkoutUrl,
    "",
    "Após a confirmação do pagamento, seu ingresso será emitido automaticamente.",
  ];

  return lines.join("\n");
}

function buildPublicFreeTicketOutboundMessages(
  result: Extract<IssuePublicFreeTicketsResult, { ok: true }>,
) {
  return [
    { type: "text" as const, body: result.delivery.message },
    ...result.delivery.qrImages.map((image) => ({
      type: "image" as const,
      imageUrl: image.imageUrl,
      caption: image.caption,
    })),
  ];
}

function buildPaidTicketResendOutboundMessages(
  delivery: Awaited<ReturnType<typeof buildTicketDeliveryPayload>>,
) {
  return [
    { type: "text" as const, body: delivery.message },
    ...delivery.qrImages.map((image) => ({
      type: "image" as const,
      imageUrl: image.imageUrl,
      caption: image.caption,
    })),
  ];
}

function formatPaidTicketResendOptions(groups: PaidTicketResendGroup[]) {
  return [
    "*REENVIAR INGRESSO*",
    "",
    "Encontrei ingressos emitidos para este telefone.",
    "Escolha o evento que deseja receber novamente:",
    "",
    ...groups.map((group) =>
      formatOptionLine(
        group.option,
        `${group.title} - ${formatDateTime(group.startsAt)} - ${group.city}/${group.state} (${group.ticketsCount} ingresso${group.ticketsCount === 1 ? "" : "s"})`,
        { preserveCase: true },
      ),
    ),
  ].join("\n");
}

async function buildPaidTicketResendResult({
  baseContext,
  group,
}: {
  baseContext: TicketConversationState;
  group: PaidTicketResendGroup;
}): Promise<RouteTicketMessageOutput> {
  const delivery = await buildTicketDeliveryPayload(
    group.tickets,
    "*REENVIO DE INGRESSO*",
  );

  return {
    reply: delivery.message,
    outboundMessages: buildPaidTicketResendOutboundMessages(delivery),
    nextContext: resetBuyerReservationContext(baseContext),
  };
}

async function handlePaidTicketResendCommand({
  baseContext,
  phone,
}: {
  baseContext: TicketConversationState;
  phone: string;
}): Promise<RouteTicketMessageOutput> {
  const groups = await listPaidTicketResendGroupsForPhone(phone);
  const ticketsCount = groups.reduce((total, group) => total + group.tickets.length, 0);

  if (ticketsCount === 0) {
    return {
      reply:
        "Não encontrei ingresso pago emitido para este telefone. Confira se o pagamento foi aprovado e se este é o mesmo WhatsApp usado na compra.",
      nextContext: resetBuyerReservationContext(baseContext),
    };
  }

  if (ticketsCount === 1) {
    return buildPaidTicketResendResult({ baseContext, group: groups[0] });
  }

  return {
    reply: formatPaidTicketResendOptions(groups),
    nextContext: {
      ...resetBuyerReservationContext(baseContext),
      step: "ticket_resend_selecting",
      state: "ticket_resend_selecting",
      ticketResend: {
        lastOptions: groups.map((group) => ({
          option: group.option,
          eventId: group.eventId,
          sessionId: group.sessionId,
          orderIds: group.orderIds,
        })),
      },
    },
  };
}

async function handlePaidTicketResendSelection({
  baseContext,
  phone,
  text,
}: {
  baseContext: TicketConversationState;
  phone: string;
  text: string;
}): Promise<RouteTicketMessageOutput | null> {
  if (baseContext.state !== "ticket_resend_selecting") {
    return null;
  }

  if (isBuyerBackIntent(text) || isBuyerReservationExitIntent(text)) {
    return {
      reply: TICKET_MESSAGES.genericHelp,
      nextContext: resetBuyerReservationContext(baseContext),
    };
  }

  const option = text.trim().match(/^\d+$/) ? Number(text.trim()) : null;
  const selected = option
    ? baseContext.ticketResend?.lastOptions?.find((item) => item.option === option)
    : null;

  if (!selected) {
    return {
      reply: "Não encontrei essa opção. Responda com um número da lista.",
      nextContext: baseContext,
    };
  }

  const groups = await listPaidTicketResendGroupsForPhone(phone);
  const group = groups.find(
    (item) =>
      item.eventId === selected.eventId &&
      item.sessionId === selected.sessionId &&
      selected.orderIds.every((orderId) => item.orderIds.includes(orderId)),
  );

  if (!group) {
    return {
      reply:
        "Não encontrei mais esse ingresso disponível para reenvio. Confira com a equipe da Black House.",
      nextContext: resetBuyerReservationContext(baseContext),
    };
  }

  return buildPaidTicketResendResult({ baseContext, group });
}

function formatPublicFreeTicketFailureMessage(
  result: Extract<IssuePublicFreeTicketsResult, { ok: false }>,
) {
  if (result.reason === "reservation_expired") {
    return TICKET_MESSAGES.reservationExpired;
  }

  if (result.reason === "free_ticket_limit_exceeded") {
    return "*QUANTIDADE INVALIDA*\nPara ingresso gratuito, o número máximo de ingressos por pedido são 4. Digite novamente o número de 1 a 4.";
  }

  if (
    result.reason === "order_not_found" ||
    result.reason === "order_not_payable" ||
    result.reason === "reservation_not_found" ||
    result.reason === "reservation_not_payable" ||
    result.reason === "reservation_items_not_found" ||
    result.reason === "reserved_seat_not_available"
  ) {
    return TICKET_MESSAGES.reservationUnavailableForPayment;
  }

  return TICKET_MESSAGES.freeTicketGenericError;
}

function isConfirmText(text: string) {
  return normalizeAdminText(text) === "confirmar";
}

function isCancelText(text: string) {
  const normalized = normalizeAdminText(text);

  return normalized === "cancelar";
}

function isBackText(text: string) {
  const normalized = normalizeAdminText(text);

  return normalized === "voltar" || normalized === "volta";
}

function isAdminHomeText(text: string) {
  return normalizeAdminText(text) === "inicio";
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
  | "admin_order_cancel_confirm"
  | "admin_ticket_consult_collecting" {
  return (
    state === "admin_order_phone_collecting" ||
    state === "admin_order_code_collecting" ||
    state === "admin_order_cancel_collecting" ||
    state === "admin_order_cancel_confirm" ||
    state === "admin_ticket_consult_collecting"
  );
}

function isAdminCourtesyFlowState(
  state: string | undefined,
): state is
  | "admin_courtesy_event_select"
  | "admin_courtesy_session_select"
  | "admin_courtesy_section_select"
  | "admin_courtesy_quantity_collecting"
  | "admin_courtesy_seat_collecting"
  | "admin_courtesy_beneficiary_phone_collecting"
  | "admin_courtesy_beneficiary_name_collecting"
  | "admin_courtesy_reason_collecting"
  | "admin_courtesy_confirm"
  | "admin_courtesy_list_event_select"
  | "admin_courtesy_cancel_target_collecting"
  | "admin_courtesy_cancel_select"
  | "admin_courtesy_cancel_confirm"
  | "admin_courtesy_resend_target_collecting"
  | "admin_courtesy_resend_select"
  | "admin_courtesy_resend_confirm" {
  return (
    state === "admin_courtesy_event_select" ||
    state === "admin_courtesy_session_select" ||
    state === "admin_courtesy_section_select" ||
    state === "admin_courtesy_quantity_collecting" ||
    state === "admin_courtesy_seat_collecting" ||
    state === "admin_courtesy_beneficiary_phone_collecting" ||
    state === "admin_courtesy_beneficiary_name_collecting" ||
    state === "admin_courtesy_reason_collecting" ||
    state === "admin_courtesy_confirm" ||
    state === "admin_courtesy_list_event_select" ||
    state === "admin_courtesy_resend_target_collecting" ||
    state === "admin_courtesy_resend_select" ||
    state === "admin_courtesy_resend_confirm" ||
    state === "admin_courtesy_cancel_target_collecting" ||
    state === "admin_courtesy_cancel_select" ||
    state === "admin_courtesy_cancel_confirm"
  );
}

function isAdminUsersFlowState(
  state: string | undefined,
): state is
  | "admin_user_create_collect_phone"
  | "admin_user_create_collect_name"
  | "admin_user_create_select_role"
  | "admin_user_create_collect_passphrase"
  | "admin_user_create_confirm"
  | "admin_user_reactivate_confirm"
  | "admin_user_role_select_user"
  | "admin_user_role_select_role"
  | "admin_user_role_confirm"
  | "admin_user_disable_select"
  | "admin_user_disable_confirm"
  | "admin_user_unlock_select"
  | "admin_user_unlock_confirm" {
  return (
    state === "admin_user_create_collect_phone" ||
    state === "admin_user_create_collect_name" ||
    state === "admin_user_create_select_role" ||
    state === "admin_user_create_collect_passphrase" ||
    state === "admin_user_create_confirm" ||
    state === "admin_user_reactivate_confirm" ||
    state === "admin_user_role_select_user" ||
    state === "admin_user_role_select_role" ||
    state === "admin_user_role_confirm" ||
    state === "admin_user_disable_select" ||
    state === "admin_user_disable_confirm" ||
    state === "admin_user_unlock_select" ||
    state === "admin_user_unlock_confirm"
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
    formatOptionLine(1, "ativos"),
    formatOptionLine(2, "pausados"),
    formatOptionLine(3, "voltar"),
    formatOptionLine(4, "sair"),
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
  selectable = false,
}: {
  title: string;
  accesses: AdminGateAccessListItem[];
  selectable?: boolean;
}) {
  const blocks = accesses.map((access, index) =>
    [
      selectable
        ? formatOptionLine(index + 1, access.eventTitle ?? "Evento", {
            preserveCase: true,
          })
        : `- ${access.eventTitle ?? "Evento"}`,
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
      (access, index) =>
        formatOptionLine(index + 1, access.eventTitle ?? "Evento", {
          preserveCase: true,
        }),
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
      (access) =>
        formatOptionLine(access.option, access.eventTitle ?? "Evento", {
          preserveCase: true,
        }),
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
    formatOptionLine(1, "hoje"),
    formatOptionLine(2, "últimos 7 dias"),
    formatOptionLine(3, "últimos 30 dias"),
    formatOptionLine(4, "todo o período"),
    formatOptionLine(5, "escolher datas"),
    formatOptionLine(6, "voltar"),
    formatOptionLine(7, "sair"),
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
    "*QUAL NÍVEL DE ACESSO?*",
    "",
    formatOptionLine(1, "diretor"),
    formatOptionLine(2, "gerente"),
    formatOptionLine(3, "operador"),
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
    "Digite o nome ou responda PULAR.",
    "",
    'Digite "Voltar" para voltar, "Cancelar" para abandonar esta tela ou "Sair" para sair da área de admin.',
  ].join("\n");
}

function renderAdminUserRolePrompt() {
  return renderAdminUserTypePrompt().replace("*QUAL NÍVEL DE ACESSO?*", "*NOVO NÍVEL*");
}

function renderAdminUserPassphrasePrompt() {
  return [
    "*QUAL A PALAVRA-CHAVE DO ADMINISTRADOR?*",
    "",
    "Digite a senha individual que este administrador usará para entrar.",
    "",
    'Digite "Voltar" para voltar, "Cancelar" para abandonar esta tela ou "Sair" para sair da área de admin.',
  ].join("\n");
}

function formatAdminRoleLabel(role: string) {
  return getAdminProfileLabel(role);
}

function renderAdminUsersList(users: AdminUserListItem[]) {
  const userBlocks = users.map((user) =>
    [
      `- ${user.name ?? "Sem nome"}`,
      `   Telefone: ${maskAdminPhone(user.phone)}`,
      `   Perfil: ${formatAdminRoleLabel(user.role)}`,
      `   Status: ${user.status === "active" ? "ativo" : "desativado"}`,
      `   Criado em: ${formatDateTime(user.createdAt)}`,
      ...(user.lastLoginAt ? [`   Último login: ${formatDateTime(user.lastLoginAt)}`] : []),
    ].join("\n"),
  );

  return [
    "*ADMINISTRADORES*",
    "",
    users.length ? userBlocks.join("\n\n") : "Nenhum administrador encontrado.",
  ].join("\n");
}

function renderAdminUsersSelectionList(users: AdminUserListItem[]) {
  const userBlocks = users.map((user, index) =>
    [
      formatOptionLine(index + 1, user.name ?? "Sem nome", {
        preserveCase: true,
      }),
      `> Telefone: ${maskAdminPhone(user.phone)}`,
      `> Perfil: ${formatAdminRoleLabel(user.role)}`,
      `> Status: ${user.status === "active" ? "ativo" : "desativado"}`,
    ].join("\n"),
  );

  return [
    "*ADMINISTRADORES*",
    "",
    users.length ? userBlocks.join("\n---\n") : "Nenhum administrador encontrado.",
  ].join("\n");
}

function renderBlockedAdminAuthList(blocked: AdminAuthBlockedListItem[]) {
  const blocks = blocked.map((item, index) =>
    [
      formatOptionLine(index + 1, item.name ?? "Sem nome", {
        preserveCase: true,
      }),
      `> Telefone: ${maskAdminPhone(item.phone)}`,
      ...(item.role ? [`> Perfil: ${formatAdminRoleLabel(item.role)}`] : []),
      `> Tentativas: ${item.failedAttempts}`,
      `> Bloqueio: ${item.hardLockedAt ? "até Diretor liberar" : "temporário"}`,
      ...(item.lockedUntil ? [`> Até: ${formatDateTime(item.lockedUntil)}`] : []),
      ...(item.lastFailedAt ? [`> Última tentativa: ${formatDateTime(item.lastFailedAt)}`] : []),
    ].join("\n"),
  );

  return [
    "*ADMINISTRADORES BLOQUEADOS*",
    "",
    blocked.length
      ? blocks.join("\n---\n")
      : "Nenhum administrador bloqueado no momento.",
  ].join("\n");
}

function renderAdminUnlockConfirm({
  phone,
  name,
}: {
  phone: string;
  name?: string | null;
}) {
  return [
    "*LIBERAR ADMINISTRADOR*",
    "",
    `> Nome: ${name || "Sem nome"}`,
    `> Telefone: ${maskAdminPhone(phone)}`,
    "",
    "Digite LIBERAR ADMIN para confirmar.",
    'Digite "Cancelar" para abandonar esta tela.',
  ].join("\n");
}

function renderAdminUserCreateConfirm({
  phone,
  name,
  role,
  reactivation = false,
}: {
  phone: string;
  name?: string | null;
  role: AdminRole;
  reactivation?: boolean;
}) {
  return [
    reactivation ? "*REATIVAR ADMINISTRADOR*" : "*CONFIRMAR NOVO ADMINISTRADOR*",
    "",
    `> Nome: ${name || "Sem nome"}`,
    `> Telefone: ${maskAdminPhone(phone)}`,
    `> Perfil: ${formatAdminRoleLabel(role)}`,
    "> Palavra-chave: definida e protegida por hash",
    "",
    `Digite ${reactivation ? "REATIVAR ADMIN" : "CONFIRMAR ADMIN"} para confirmar.`,
    'Digite "Cancelar" para abandonar esta tela.',
  ].join("\n");
}

function renderAdminUserRoleConfirm({
  name,
  phone,
  currentRole,
  newRole,
}: {
  name?: string | null;
  phone?: string;
  currentRole?: AdminRole;
  newRole: AdminRole;
}) {
  return [
    "*ALTERAR NÍVEL DE ADMINISTRADOR*",
    "",
    `> Nome: ${name || "Sem nome"}`,
    `> Telefone: ${phone ? maskAdminPhone(phone) : "não informado"}`,
    ...(currentRole ? [`> Perfil atual: ${formatAdminRoleLabel(currentRole)}`] : []),
    `> Novo perfil: ${formatAdminRoleLabel(newRole)}`,
    "",
    "Digite ALTERAR NÍVEL para confirmar.",
    'Digite "Cancelar" para abandonar esta tela.',
  ].join("\n");
}

function renderAdminUserDisableConfirm(user: AdminUserListItem) {
  return [
    "*DESATIVAR ADMINISTRADOR*",
    "",
    `> Nome: ${user.name || "Sem nome"}`,
    `> Telefone: ${maskAdminPhone(user.phone)}`,
    `> Perfil: ${formatAdminRoleLabel(user.role)}`,
    "",
    "Digite DESATIVAR ADMIN para confirmar.",
    'Digite "Cancelar" para abandonar esta tela.',
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
    ticket.paymentProvider,
    ticket.paymentStatus ? formatPaymentStatus(ticket.paymentStatus) : null,
    ticket.paymentMethod,
  ]
    .filter(Boolean)
    .join(" - ");
}

function maskAdminPhone(value: string | null | undefined) {
  const digits = String(value ?? "").replace(/\D/g, "");

  if (digits.length < 4) {
    return "não informado";
  }

  return `****${digits.slice(-4)}`;
}

function maskAdminIdentifier(value: string | null | undefined) {
  const raw = String(value ?? "").trim();
  const digits = raw.replace(/\D/g, "");

  if (digits.length >= 8) {
    return maskAdminPhone(digits);
  }

  if (raw.length > 12) {
    return `${raw.slice(0, 4)}...${raw.slice(-4)}`;
  }

  return raw || "não informado";
}

function formatAdminTicket(ticket: AdminTicketLookup, index?: number) {
  const venue = ticket.venueName
    ? `${ticket.venueName} - ${ticket.city}/${ticket.state}`
    : `${ticket.city}/${ticket.state}`;
  const lines = [
    typeof index === "number"
      ? formatOptionLine(index, ticket.eventTitle, { preserveCase: true })
      : ticket.eventTitle,
    `   Data: ${formatDateTime(ticket.startsAt)}`,
    `   Local: ${venue}`,
    `   Setor: ${ticket.sectionName}`,
    `   Ingresso/Assento: ${ticket.seatCode}`,
    `   Código: ${ticket.ticketCode}`,
    `   Status: ${formatTicketStatus(ticket.status)}`,
  ];

  if (ticket.customerPhone) {
    lines.push(`   Comprador: ${maskAdminPhone(ticket.customerPhone)}`);
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

function formatAdminTicketForPhoneSearch(ticket: AdminTicketLookup) {
  const lines = [
    `- ${ticket.eventTitle}`,
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
  const venue = reservation.venueName
    ? `${reservation.venueName} - ${reservation.city}/${reservation.state}`
    : `${reservation.city}/${reservation.state}`;
  const totalFeeText =
    reservation.totalFeeCents > 0
      ? ` + ${formatCurrencyFromCents(reservation.totalFeeCents)} taxa`
      : "";

  return [
    typeof index === "number"
      ? formatOptionLine(index, reservation.eventTitle, { preserveCase: true })
      : reservation.eventTitle,
    `   Data: ${formatDateTime(reservation.startsAt)}`,
    `   Local: ${venue}`,
    `   Setor: ${reservation.sectionName}`,
    `   Quantidade: ${reservation.quantity}`,
    `   Valor: ${formatCurrencyFromCents(reservation.totalAmountCents)}${totalFeeText}`,
    `   Status: ${formatOrderStatus(reservation.orderStatus)}`,
    `   Expira em: ${formatDateTime(reservation.expiresAt)}`,
  ].join("\n");
}

function renderAdminPendingReservationCancelConfirm(
  reservation: AdminPendingReservationLookup,
) {
  return withAdminNavigationHint([
    "*CANCELAR RESERVA PENDENTE*",
    "",
    formatAdminPendingReservation(reservation),
    "",
    "Para confirmar, responda exatamente:",
    "CANCELAR RESERVA",
  ].join("\n"));
}

function formatAdminTicketValidations(validations: AdminTicketValidation[]) {
  if (validations.length === 0) {
    return "Nenhuma validação registrada.";
  }

  return validations
    .map((validation) => {
      const gate = validation.gateLabel ? ` - ${validation.gateLabel}` : "";
      const validator = validation.validatorIdentifier
        ? ` (${maskAdminIdentifier(validation.validatorIdentifier)})`
        : "";

      return `- ${formatDateTime(validation.createdAt)} - ${validation.result}${gate}${validator}`;
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
  const ticketType = inferTicketTypeFromLabel(name ?? "");

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
    ticketType,
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

  return {
    ticketType: inferTicketTypeFromLabel(name),
    label: name,
    priceCents,
    feeCents,
  };
}

function inferTicketTypeFromLabel(label: string): AdminTicketType {
  const normalizedName = normalizeAdminText(label);

  if (/\b(meia|estudante|senior|sênior|idoso|pcd|professor)\b/.test(normalizedName)) {
    return "half";
  }

  if (/\b(cortesia|gratis|grátis|gratuito|free)\b/.test(normalizedName)) {
    return "free";
  }

  if (/\b(promocional|promo)\b/.test(normalizedName)) {
    return "promotional";
  }

  return "full";
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

function parseBrazilianEventDateOnly(value: string) {
  const match = value.trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (!match) return null;

  const [, dayRaw, monthRaw, yearRaw] = match;
  const day = Number(dayRaw);
  const month = Number(monthRaw);
  const year = Number(yearRaw);

  if (month < 1 || month > 12 || day < 1 || day > 31) return null;

  const isoDate = `${year.toString().padStart(4, "0")}-${month
    .toString()
    .padStart(2, "0")}-${day.toString().padStart(2, "0")}`;
  const parsed = new Date(`${isoDate}T00:00:00-03:00`);

  if (
    Number.isNaN(parsed.getTime()) ||
    parsed.getUTCFullYear() !== year ||
    parsed.getUTCMonth() + 1 !== month ||
    parsed.getUTCDate() !== day
  ) {
    return null;
  }

  return isoDate;
}

function parseBrazilianTimeOnly(value: string) {
  const match = value.trim().match(/^(\d{1,2}):(\d{2})$/);
  if (!match) return null;

  const [, hourRaw, minuteRaw] = match;
  const hour = Number(hourRaw);
  const minute = Number(minuteRaw);

  if (hour < 0 || hour > 23 || minute < 0 || minute > 59) return null;

  return `${hour.toString().padStart(2, "0")}:${minute.toString().padStart(2, "0")}`;
}

function buildSaoPauloDateTime(date: string, time: string) {
  const parsed = new Date(`${date}T${time}:00-03:00`);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
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
    sessionDateItem: "sessionsPerDate",
    sessionTimeItem: "sessionDateItem",
    sessionItem: "sessionsPerDate",
    entryModel: "sessionDateItem",
    singleEntryDetails: "entryModel",
    entryCapacityMode: "entryModel",
    sharedEntryCapacity: "entryCapacityMode",
    entryCount: "entryCapacityMode",
    entryItem: "entryCount",
    entrySeatItem: "entryItem",
    entrySeatMapVisual: "entrySeatItem",
    entryOfferItem: "entryCount",
    description: "entryModel",
    status: "description",
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

  if (currentField === "description") {
    const sections = getInitialSectionsFromDraft(nextDraft);

    if (nextDraft.entryCapacityMode === "shared") {
      const offers = getDraftArray<{
        ticketType: AdminTicketType;
        label: string;
        priceCents: number;
        feeCents: number;
      }>(nextDraft, "sharedPriceOptions");
      if (offers.length > 0) {
        nextDraft.sharedPriceOptions = offers.slice(0, -1);
        delete nextDraft.initialSections;
        delete nextDraft.pendingNumberedSection;
        nextDraft.currentEntryIndex = offers.length;
        nextDraft.field = "entryOfferItem";
        return nextDraft;
      }
    }

    if (nextDraft.entryModel === "single_general") {
      delete nextDraft.initialSections;
      nextDraft.field = "singleEntryDetails";
      return nextDraft;
    }

    if (nextDraft.entryModel === "numbered" && sections.length > 0) {
      const previousSection = sections[sections.length - 1];
      nextDraft.initialSections = sections.slice(0, -1);
      nextDraft.pendingNumberedSection = previousSection;
      nextDraft.currentEntryIndex = sections.length;
      nextDraft.field = "entrySeatMapVisual";
      return nextDraft;
    }

    if (sections.length > 0) {
      nextDraft.initialSections = sections.slice(0, -1);
      nextDraft.currentEntryIndex = sections.length;
      nextDraft.field = "entryItem";
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

  if (currentField === "sessionTimeItem") {
    const currentTimeIndex = Number(nextDraft.currentSessionTimeIndex ?? 1);
    const sessionsStartsAt = getDraftArray<string>(nextDraft, "sessionsStartsAt");

    if (currentTimeIndex > 1 && sessionsStartsAt.length > 0) {
      nextDraft.sessionsStartsAt = sessionsStartsAt.slice(0, -1);
      nextDraft.currentSessionTimeIndex = currentTimeIndex - 1;
      nextDraft.field = "sessionTimeItem";
      return nextDraft;
    }

    nextDraft.field = "sessionDateItem";
    return nextDraft;
  }

  if (currentField === "sessionDateItem") {
    const eventDates = getDraftArray<string>(nextDraft, "eventDates");
    if (eventDates.length > 0) {
      nextDraft.eventDates = eventDates.slice(0, -1);
      nextDraft.currentSessionDateIndex = eventDates.length;
      delete nextDraft.pendingSessionDate;
      delete nextDraft.currentSessionTimeIndex;
      nextDraft.field = "sessionDateItem";
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
    delete nextDraft.currentSessionDateIndex;
    delete nextDraft.currentSessionTimeIndex;
    delete nextDraft.eventDates;
    delete nextDraft.pendingSessionDate;
    delete nextDraft.expectedSessionCount;
    delete nextDraft.expectedDateCount;
    delete nextDraft.sessionsPerDate;
  }

  if (previousField === "sessionsPerDate") {
    delete nextDraft.sessionsStartsAt;
    delete nextDraft.currentSessionIndex;
    delete nextDraft.currentSessionDateIndex;
    delete nextDraft.currentSessionTimeIndex;
    delete nextDraft.eventDates;
    delete nextDraft.pendingSessionDate;
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
  nextDraft.field = "description";
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
    formatOptionLine(1, "sim, criar mapa visual automaticamente"),
    formatOptionLine(2, "não, apenas cadastrar os assentos"),
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
      formatOptionLine(event.option, event.title, { preserveCase: true }),
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
          (session) => `- ${formatDateTime(session.startsAt)} - ${session.status}`,
        )
      : ["nenhuma sessão cadastrada"]),
    "",
    "Setores:",
    ...(event.sections.length
      ? event.sections.map((section) => `- ${section.name}`)
      : ["nenhum setor cadastrado"]),
    "",
    "*OPÇÕES:*",
    formatOptionLine(1, "editar evento"),
    formatOptionLine(2, "setores e assentos"),
    formatOptionLine(3, "ativar/pausar evento"),
    formatOptionLine(4, "voltar"),
    formatOptionLine(5, "sair"),
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
      ? actions.map((action) => formatOptionLine(action.option, action.label))
      : [
          event.status === "cancelled"
            ? "Este evento está cancelado. Reativação não está disponível por aqui."
            : "Este evento está finalizado. Alteração de publicação não está disponível por aqui.",
        ]),
    formatOptionLine(actions.length + 1, "voltar"),
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
    dateCount: "Quantas datas terá este evento?\nEx: 3",
    sessionsPerDate: "Quantas sessões por data esse evento terá?",
    sessionDateItem: "Qual a data do evento? Ex: 10/06/2026",
    sessionTimeItem: "Qual o horário desta sessão? Ex: 20:00",
    sessionItem: "Qual a data e horário da sessão? Ex: 10/06/2026 22:00",
    description:
      "Envie as informações gerais do evento.\n\nEx: abertura dos portões, classificação, observações importantes.\nSe não quiser adicionar agora, responda PULAR.",
    status:
      `Para finalizar, escolha como deseja salvar o evento.\n\n${formatOptionLine(1, "deixar como rascunho")}\n${formatOptionLine(2, "publicar")}`,
    entryModel:
      [
        "Como serão as entradas/lugares?",
        formatOptionLine(1, "entrada única sem assento marcado"),
        formatOptionLine(2, "vários setores/tipos sem assento marcado"),
        formatOptionLine(3, "setores com assentos marcados"),
      ].join("\n"),
    singleEntryDetails:
      "Envie a entrada com capacidade e valor.\nFormato: nome capacidade valor taxa opcional\nEx: Entrada Geral 500 120,00 12,00",
    entryCapacityMode:
      `Como a carga de ingressos será controlada?\n\n${formatOptionLine(1, "carga total compartilhada entre todos os tipos de compra")}\n${formatOptionLine(2, "carga separada para cada tipo/setor")}`,
    sharedEntryCapacity:
      "Qual a carga total compartilhada de ingressos?\nEx: 200",
    entryCount: "Quantos tipos/setores de ingresso serão cadastrados agora?",
    entryItem:
      "Envie o tipo/setor com capacidade e valor.\nFormato: nome capacidade valor taxa opcional\nEx: Pista 500 120,00 12,00",
    entrySeatItem: renderCreateEventSeatPrompt(),
    entrySeatMapVisual: renderCreateEventSeatMapVisualPrompt(),
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
    `Informações gerais: ${draft.description ? "cadastradas" : "ausentes"}`,
    "Sessões:",
    ...(sessionsStartsAt.length
      ? sessionsStartsAt.map(
          (startsAt, index) =>
            formatOptionLine(index + 1, formatDateTime(startsAt), {
              preserveCase: true,
            }),
        )
      : ["nenhuma sessão definida"]),
    "",
    ...renderInitialSectionsSummary(draft),
    "",
    "Responda CONFIRMAR para escolher rascunho/publicação ou CANCELAR para abandonar.",
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
    formatOptionLine(1, "editar nome"),
    formatOptionLine(2, "editar artista"),
    formatOptionLine(3, "editar cidade"),
    formatOptionLine(4, "editar estado"),
    formatOptionLine(5, "editar local"),
    formatOptionLine(6, "editar foto"),
    formatOptionLine(7, "editar data/hora"),
    formatOptionLine(8, "editar setores/lugares"),
    formatOptionLine(9, "editar carga"),
    formatOptionLine(10, "editar valores"),
    formatOptionLine(11, "editar informações gerais"),
    formatOptionLine(12, "voltar"),
    formatOptionLine(13, "sair"),
  ].join("\n"));
}

function renderAdminEventDuplicateConfirmReply(event: AdminEventDetails) {
  return withAdminNavigationHint([
    "*DUPLICAR EVENTO*",
    "",
    `> Origem: ${event.title}`,
    `> Novo nome: ${event.title} - CÓPIA`,
    `> Sessões: ${event.sessions.length}`,
    `> Setores/lugares: ${event.sections.length}`,
    "",
    "O evento duplicado será criado como rascunho.",
    "Reservas, pedidos, pagamentos, tickets, cortesias e acessos de portaria não serão duplicados.",
    "",
    "Responda CONFIRMAR ou CANCELAR.",
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
    formatOptionLine(1, "deixar como rascunho"),
    formatOptionLine(2, "publicar evento"),
    formatOptionLine(3, "voltar"),
    formatOptionLine(4, "sair"),
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

function getAdminOrdersContext(baseContext: TicketConversationState) {
  return baseContext.adminOrders ?? {};
}

function withAdminOrdersContext(
  baseContext: TicketConversationState,
  state: TicketConversationState["state"],
  adminOrders: NonNullable<TicketConversationState["adminOrders"]>,
) {
  return {
    ...baseContext,
    step: state,
    state,
    adminOrders,
  };
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

async function requireFreshAdminPermission({
  baseContext,
  scope,
  permission,
  operation,
}: {
  baseContext: TicketConversationState;
  scope: Pick<AdminEventScope, "adminPhone" | "adminUserId">;
  permission: AdminPermission;
  operation: string;
}) {
  const authResult = await requireAdminPermission({
    phone: scope.adminPhone,
    sessionId: baseContext.admin?.sessionId,
    adminUserId: scope.adminUserId,
    permission,
    operation,
  });

  if (!authResult.ok) {
    return {
      ok: false as const,
      response: {
        reply: ADMIN_MENU_UNAVAILABLE_MESSAGE,
        nextContext: {
          ...baseContext,
          step: "admin_menu",
          state: "admin_menu",
          adminEvents: undefined,
        },
      } satisfies RouteTicketMessageOutput,
    };
  }

  return {
    ok: true as const,
    scope: buildAdminEventScope(authResult.adminUser),
  };
}

async function requireFreshAdminEventsPermission(
  baseContext: TicketConversationState,
  scope: AdminEventScope,
  operation: string,
) {
  return requireFreshAdminPermission({
    baseContext,
    scope,
    permission: "manage_events",
    operation,
  });
}

function buildFreshAdminScope(adminUser: {
  id: string;
  phone: string;
}) {
  return {
    adminPhone: adminUser.phone,
    adminUserId: adminUser.id,
  } satisfies Pick<AdminEventScope, "adminPhone" | "adminUserId">;
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

      return {
        reply: renderAdminEventDuplicateConfirmReply(details.event),
        nextContext: withAdminEventsContext(baseContext, "admin_event_duplicate_confirm", {
          selectedEventId: eventId,
        }),
      };
    }

    if (adminEvents.mode === "sections") {
      return showAdminEventSectionsMenu(baseContext, scope, eventId);
    }

    return showAdminEventDetails(baseContext, scope, eventId);
  }

  if (baseContext.state === "admin_event_duplicate_confirm") {
    const eventId = adminEvents.selectedEventId;

    if (!eventId) {
      return {
        reply: renderAdminEventsMenu(),
        nextContext: withAdminEventsContext(baseContext, "admin_events_menu", {}),
      };
    }

    if (isBackText(text) || isCancelText(text)) {
      return {
        reply: renderAdminEventsMenu(),
        nextContext: withAdminEventsContext(baseContext, "admin_events_menu", {}),
      };
    }

    if (!isConfirmText(text)) {
      const details = await getScopedAdminEventDetails(eventId, scope);

      return {
        reply: details.ok
          ? renderAdminEventDuplicateConfirmReply(details.event)
          : "Não encontrei esse evento.",
        nextContext: withAdminEventsContext(
          baseContext,
          "admin_event_duplicate_confirm",
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

    const freshAuth = await requireFreshAdminEventsPermission(
      baseContext,
      scope,
      "admin_event_duplicate",
    );
    if (!freshAuth.ok) return freshAuth.response;

    const duplicateResult = await duplicateAdminEvent({
      eventId,
      createdByAdminUserId: freshAuth.scope.adminUserId,
      createdByAdminPhone: freshAuth.scope.adminPhone,
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
        reply: ["Criação de evento cancelada.", "", renderAdminEventsMenu()].join("\n"),
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
      sessionDateItem: null,
      sessionTimeItem: null,
      sessionItem: null,
      description: null,
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
                    formatOptionLine(
                      venue.option,
                      `${venue.name} - ${venue.city}/${venue.state}`,
                      { preserveCase: true },
                    ),
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

      if (!Number.isInteger(datesCount) || !datesCount || datesCount < 1 || datesCount > 30) {
        return {
          reply: "Quantidade inválida. Envie o número de datas, de 1 a 30.",
          nextContext: withAdminEventsContext(baseContext, "admin_event_create_collecting", {
            draft,
          }),
        };
      }

      draft.expectedDateCount = datesCount;
      draft.field = "sessionsPerDate";

      return {
        reply: renderCreateEventPrompt("sessionsPerDate"),
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
      draft.currentSessionDateIndex = 1;
      draft.currentSessionTimeIndex = 1;
      draft.eventDates = [];
      draft.sessionsStartsAt = [];
      draft.field = "sessionDateItem";

      return {
        reply: [
          `Data 1 de ${datesCount}.`,
          "",
          renderCreateEventPrompt("sessionDateItem"),
        ].join("\n"),
        nextContext: withAdminEventsContext(baseContext, "admin_event_create_collecting", {
          draft,
        }),
      };
    } else if (field === "sessionDateItem") {
      const date = parseBrazilianEventDateOnly(text);
      const dateAtEndOfDay = date ? new Date(`${date}T23:59:59-03:00`) : null;

      if (!date || !dateAtEndOfDay || dateAtEndOfDay.getTime() <= Date.now()) {
        return {
          reply: "Data inválida ou no passado. Envie no formato 10/06/2026.",
          nextContext: withAdminEventsContext(baseContext, "admin_event_create_collecting", {
            draft,
          }),
        };
      }

      const currentDateIndex = Number(draft.currentSessionDateIndex ?? 1);
      const eventDates = getDraftArray<string>(draft, "eventDates");
      draft.eventDates = [...eventDates, date];
      draft.pendingSessionDate = date;
      draft.currentSessionTimeIndex = 1;
      draft.field = "sessionTimeItem";

      return {
        reply: [
          `Data cadastrada: ${text.trim()}.`,
          "",
          `Horário 1 de ${Number(draft.sessionsPerDate ?? 1)} da data ${currentDateIndex}.`,
          "",
          renderCreateEventPrompt("sessionTimeItem"),
        ].join("\n"),
        nextContext: withAdminEventsContext(baseContext, "admin_event_create_collecting", {
          draft,
        }),
      };
    } else if (field === "sessionTimeItem") {
      const time = parseBrazilianTimeOnly(text);
      const pendingDate = String(draft.pendingSessionDate ?? "");
      const startsAt = time ? buildSaoPauloDateTime(pendingDate, time) : null;

      if (!startsAt || new Date(startsAt).getTime() <= Date.now()) {
        return {
          reply: "Horário inválido ou no passado. Envie no formato 20:00.",
          nextContext: withAdminEventsContext(baseContext, "admin_event_create_collecting", {
            draft,
          }),
        };
      }

      const datesCount = Number(draft.expectedDateCount ?? 0);
      const sessionsPerDate = Number(draft.sessionsPerDate ?? 0);
      const currentDateIndex = Number(draft.currentSessionDateIndex ?? 1);
      const currentTimeIndex = Number(draft.currentSessionTimeIndex ?? 1);
      const sessionsStartsAt = getDraftArray<string>(draft, "sessionsStartsAt");
      draft.sessionsStartsAt = [...sessionsStartsAt, startsAt];

      if (currentTimeIndex < sessionsPerDate) {
        draft.currentSessionTimeIndex = currentTimeIndex + 1;
        draft.field = "sessionTimeItem";

        return {
          reply: [
            `Sessão cadastrada: ${formatDateTime(startsAt)}.`,
            "",
            `Horário ${currentTimeIndex + 1} de ${sessionsPerDate} da data ${currentDateIndex}.`,
            "",
            renderCreateEventPrompt("sessionTimeItem"),
          ].join("\n"),
          nextContext: withAdminEventsContext(baseContext, "admin_event_create_collecting", {
            draft,
          }),
        };
      }

      if (currentDateIndex < datesCount) {
        draft.currentSessionDateIndex = currentDateIndex + 1;
        draft.currentSessionTimeIndex = 1;
        delete draft.pendingSessionDate;
        draft.field = "sessionDateItem";

        return {
          reply: [
            `Sessão cadastrada: ${formatDateTime(startsAt)}.`,
            "",
            `Data ${currentDateIndex + 1} de ${datesCount}.`,
            "",
            renderCreateEventPrompt("sessionDateItem"),
          ].join("\n"),
          nextContext: withAdminEventsContext(baseContext, "admin_event_create_collecting", {
            draft,
          }),
        };
      }

      delete draft.pendingSessionDate;
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

      if (draft.returnToCreateStatus) {
        delete draft.returnToCreateStatus;
        delete draft.field;
        return {
          reply: renderCreateEventPrompt("status"),
          nextContext: withAdminEventsContext(baseContext, "admin_event_create_status", {
            draft,
          }),
        };
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
      draft.field = "description";
      return {
        reply: renderCreateEventPrompt("description"),
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
      draft.field = "description";
      return {
        reply: renderCreateEventPrompt("description"),
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

      draft.field = "description";
      return {
        reply: renderCreateEventPrompt("description"),
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

      draft.field = "description";
      return {
        reply: renderCreateEventPrompt("description"),
        nextContext: withAdminEventsContext(baseContext, "admin_event_create_collecting", {
          draft,
        }),
      };
    } else if (field === "description") {
      const normalized = normalizeAdminText(text);
      draft.description = ["pular", "sem", "nenhum", "nao", "não"].includes(normalized)
        ? null
        : text.trim();
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
        reply: ["Criação de evento cancelada.", "", renderAdminEventsMenu()].join("\n"),
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
    const sessionsStartsAt = getDraftArray<string>(draft, "sessionsStartsAt");
    const initialSections = getInitialSectionsFromDraft(draft);

    if (
      !title ||
      !artistName ||
      !city ||
      !/^[A-Z]{2}$/.test(state) ||
      !venueName ||
      sessionsStartsAt.length === 0 ||
      sessionsStartsAt.some((startsAt) => new Date(startsAt).getTime() <= Date.now()) ||
      initialSections.length === 0
    ) {
      return {
        reply:
          initialSections.length === 0
              ? "Antes de confirmar, defina a estrutura de entradas/lugares. Comece a criação novamente."
              : "Os dados do evento ficaram incompletos ou inválidos. Comece a criação novamente.",
        nextContext: withAdminEventsContext(baseContext, "admin_events_menu", {}),
      };
    }

    return {
      reply: renderCreateEventPrompt("status"),
      nextContext: withAdminEventsContext(baseContext, "admin_event_create_status", {
        draft,
      }),
    };
  }

  if (baseContext.state === "admin_event_create_status") {
    if (isBackText(text)) {
      return {
        reply: renderCreateEventSummary(adminEvents.draft ?? {}),
        nextContext: withAdminEventsContext(baseContext, "admin_event_create_confirm", adminEvents),
      };
    }

    if (isAbortText(text)) {
      return {
        reply: ["Criação de evento cancelada.", "", renderAdminEventsMenu()].join("\n"),
        nextContext: withAdminEventsContext(baseContext, "admin_events_menu", {}),
      };
    }

    const draft = adminEvents.draft ?? {};
    const status = text.trim() === "2" ? "published" : text.trim() === "1" ? "draft" : null;

    if (!status) {
      return {
        reply: renderCreateEventPrompt("status"),
        nextContext: withAdminEventsContext(baseContext, "admin_event_create_status", adminEvents),
      };
    }

    const title = String(draft.title ?? "").trim();
    const artistName = String(draft.artistName ?? "").trim();
    const city = String(draft.city ?? "").trim();
    const state = String(draft.state ?? "").trim().toUpperCase();
    const venueName = String(draft.venueName ?? "").trim();
    const imageUrl = normalizeEventImageUrl(String(draft.imageUrl ?? ""));
    const descriptionRaw = String(draft.description ?? "").trim();
    const description = descriptionRaw ? descriptionRaw : null;
    const sessionsStartsAt = getDraftArray<string>(draft, "sessionsStartsAt");
    const initialSections = getInitialSectionsFromDraft(draft);

    if (status === "published" && !imageUrl) {
      const nextDraft: Record<string, unknown> = { ...draft, field: "imageUrl" };
      nextDraft.returnToCreateStatus = true;
      return {
        reply:
          "Para publicar, a foto do evento é obrigatória. Envie a foto agora ou cole uma URL pública https://...",
        nextContext: withAdminEventsContext(baseContext, "admin_event_create_collecting", {
          draft: nextDraft,
        }),
      };
    }

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
      initialSections.length === 0
    ) {
      return {
        reply:
          initialSections.length === 0
            ? "Antes de confirmar, defina a estrutura de entradas/lugares. Comece a criação novamente."
            : "Os dados do evento ficaram incompletos ou inválidos. Comece a criação novamente.",
        nextContext: withAdminEventsContext(baseContext, "admin_events_menu", {}),
      };
    }

    const freshAuth = await requireFreshAdminEventsPermission(
      baseContext,
      scope,
      "admin_event_create",
    );
    if (!freshAuth.ok) return freshAuth.response;

    const result = await createAdminEvent({
      title,
      artistName,
      city,
      state,
      venueName,
      imageUrl,
      description,
      sessionsStartsAt,
      status,
      initialSections,
      createdByAdminUserId: freshAuth.scope.adminUserId,
      createdByAdminPhone: freshAuth.scope.adminPhone,
    });

    if (!result.ok) {
      return {
        reply: result.partialEventCreated
          ? "O evento foi salvo como rascunho, mas não consegui concluir toda a estrutura. Revise o evento antes de publicar."
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

    if (numericOption === 8) {
      return showAdminEventSectionsMenu(baseContext, scope, eventId);
    }

    if (numericOption === 9) {
      const details = await getScopedAdminEventDetails(eventId, scope);

      return {
        reply: [
          details.ok
            ? await renderSectionsList(eventId, scope, undefined, {
                selectable: true,
              })
            : "Não encontrei esse evento.",
          "",
          "Envie: número do setor | nova carga.",
          "Ex: 1 | 500",
          "",
          "A redução só bloqueia unidades disponíveis. Vendidos e reservados não são alterados.",
        ].join("\n"),
        nextContext: withAdminEventsContext(baseContext, "admin_event_capacity_collecting", {
          selectedEventId: eventId,
        }),
      };
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
                    formatOptionLine(
                      index + 1,
                      `${formatDateTime(session.startsAt)} - ${session.status}`,
                      { preserveCase: true },
                    ),
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
      if (["pular", "remover", "sem", "nenhum", "nao", "não"].includes(normalizeAdminText(text))) {
        value = { field, imageUrl: null };
      } else {
      const imageUrl = normalizeEventImageUrl(mediaUrl ?? text);
      if (!imageUrl) {
        return {
          reply: "Foto inválida. Envie uma imagem pelo WhatsApp ou cole uma URL pública https://...",
          nextContext: withAdminEventsContext(baseContext, "admin_event_edit_collecting", adminEvents),
        };
      }
      value = { field, imageUrl };
      }
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
        const freshAuth = await requireFreshAdminEventsPermission(
          baseContext,
          scope,
          "admin_event_venue_prepare",
        );
        if (!freshAuth.ok) return freshAuth.response;

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
      const imageValue = draft.imageUrl;
      const imageUrl =
        imageValue === null ? null : normalizeEventImageUrl(String(imageValue ?? ""));
      if (imageValue === null || imageUrl) values = { image_url: imageUrl };
    } else if (field === "description") {
      values = { description: String(draft.description ?? "").trim() || null };
    } else if (field === "starts_at") {
      const startsAt = String(draft.startsAt ?? "");
      const sessionId = String(draft.sessionId ?? "");

      if (!startsAt || !sessionId) {
        values = null;
      } else {
        const freshAuth = await requireFreshAdminEventsPermission(
          baseContext,
          scope,
          "admin_event_session_datetime_update",
        );
        if (!freshAuth.ok) return freshAuth.response;

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

    const freshAuth = await requireFreshAdminEventsPermission(
      baseContext,
      scope,
      "admin_event_update",
    );
    if (!freshAuth.ok) return freshAuth.response;

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

    const freshAuth = await requireFreshAdminEventsPermission(
      baseContext,
      scope,
      "admin_event_publish_select_status_update",
    );
    if (!freshAuth.ok) return freshAuth.response;

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

    const freshAuth = await requireFreshAdminEventsPermission(
      baseContext,
      scope,
      "admin_event_status_update",
    );
    if (!freshAuth.ok) return freshAuth.response;

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
    formatOptionLine(1, "listar sessões"),
    formatOptionLine(2, "criar sessão"),
    formatOptionLine(3, "editar data/hora de sessão"),
    formatOptionLine(4, "pausar/abrir vendas da sessão"),
    formatOptionLine(5, "cancelar sessão"),
    formatOptionLine(6, "voltar"),
    formatOptionLine(7, "sair"),
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
    formatOptionLine(1, "listar setores"),
    formatOptionLine(2, "criar setor"),
    formatOptionLine(3, "editar setor"),
    formatOptionLine(4, "cadastrar assentos em lote"),
    formatOptionLine(5, "bloquear/desbloquear assentos"),
    formatOptionLine(6, "criar assentos da sessão"),
    formatOptionLine(7, "voltar"),
    formatOptionLine(8, "sair"),
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
    `*EDITAR VALORES - ${eventTitle.toUpperCase()}*`,
    "",
    formatOptionLine(1, "ver valores"),
    formatOptionLine(2, "alterar valor"),
    formatOptionLine(3, "voltar"),
    formatOptionLine(4, "sair"),
  ].join("\n"));
}

async function renderSessionsList(
  eventId: string,
  scope: AdminEventScope,
  { selectable = false }: { selectable?: boolean } = {},
) {
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
              selectable
                ? formatOptionLine(
                    index + 1,
                    `${formatDateTime(session.startsAt)} - ${session.status}`,
                    { preserveCase: true },
                  )
                : `- ${formatDateTime(session.startsAt)} - ${session.status}`,
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
  { selectable = false }: { selectable?: boolean } = {},
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
              selectable
                ? formatOptionLine(index + 1, section.name, { preserveCase: true })
                : `- ${section.name}`,
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
      `Valores de ${details.event.title}:`,
      "",
      ...(prices.length
        ? prices.map((price) =>
            [
              `- ${price.label}`,
              `   Sessão: ${formatDateTime(price.sessionStartsAt)}`,
              `   Setor: ${price.sectionName}`,
              `   Valor: ${formatPriceWithOptionalFee(price.priceCents, price.feeCents)}`,
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
  };
  const ticketType = aliases[normalized] ?? normalized;

  return isTicketType(ticketType) && ticketType !== "free" ? ticketType : null;
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

    if (baseContext.state === "admin_event_capacity_collecting") {
      const details = await getScopedAdminEventDetails(eventId, scope);

      return {
        reply: renderAdminEventEditMenu(details.ok ? details.event.title : undefined),
        nextContext: withAdminEventsContext(baseContext, "admin_event_edit_menu", {
          selectedEventId: eventId,
        }),
      };
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
          await renderSessionsList(eventId, scope, { selectable: true }),
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
          await renderSessionsList(eventId, scope, { selectable: true }),
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
          await renderSessionsList(eventId, scope, { selectable: true }),
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
      const freshAuth = await requireFreshAdminEventsPermission(
        baseContext,
        scope,
        "admin_event_session_create",
      );
      if (!freshAuth.ok) return freshAuth.response;

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
      const freshAuth = await requireFreshAdminEventsPermission(
        baseContext,
        scope,
        "admin_event_session_update",
      );
      if (!freshAuth.ok) return freshAuth.response;

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
      const freshAuth = await requireFreshAdminEventsPermission(
        baseContext,
        scope,
        "admin_event_session_cancel",
      );
      if (!freshAuth.ok) return freshAuth.response;

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
          await renderSectionsList(eventId, scope, undefined, {
            selectable: true,
          }),
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
          await renderSectionsList(eventId, scope, undefined, {
            selectable: true,
          }),
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

  if (baseContext.state === "admin_event_capacity_collecting") {
    if (adminEvents.mode === "confirm_edit_capacity") {
      if (isCancelText(text)) {
        const details = await getScopedAdminEventDetails(eventId, scope);

        return {
          reply: renderAdminEventEditMenu(details.ok ? details.event.title : undefined),
          nextContext: withAdminEventsContext(baseContext, "admin_event_edit_menu", {
            selectedEventId: eventId,
          }),
        };
      }

      if (!isConfirmText(text)) {
        return {
          reply: "Responda CONFIRMAR ou CANCELAR.",
          nextContext: withAdminEventsContext(
            baseContext,
            "admin_event_capacity_collecting",
            adminEvents,
          ),
        };
      }

      const details = await getScopedAdminEventDetails(eventId, scope);
      const sectionId = String(adminEvents.draft?.sectionId ?? "");
      const newCapacity = Number(adminEvents.draft?.newCapacity);

      if (!details.ok || !details.event.venueId || !sectionId || !Number.isInteger(newCapacity)) {
        return {
          reply: "Os dados da carga ficaram inválidos. Comece novamente.",
          nextContext: withAdminEventsContext(baseContext, "admin_event_edit_menu", {
            selectedEventId: eventId,
          }),
        };
      }

      const freshAuth = await requireFreshAdminEventsPermission(
        baseContext,
        scope,
        "admin_event_section_capacity_update",
      );
      if (!freshAuth.ok) return freshAuth.response;

      const result = await updateAdminSectionCapacity({
        venueId: details.event.venueId,
        sectionId,
        sessionIds: details.event.sessions.map((session) => session.sessionId),
        newCapacity,
      });

      if (!result.ok && result.reason === "capacity_below_busy") {
        return {
          reply:
            "Não é possível reduzir para esse valor porque já existem ingressos vendidos ou reservados.",
          nextContext: withAdminEventsContext(baseContext, "admin_event_edit_menu", {
            selectedEventId: eventId,
          }),
        };
      }

      if (!result.ok && result.reason === "numbered_section") {
        return {
          reply:
            "Esse setor usa assento marcado. Ajuste a carga pelo fluxo de edição de assentos.",
          nextContext: withAdminEventsContext(baseContext, "admin_event_edit_menu", {
            selectedEventId: eventId,
          }),
        };
      }

      const updatedDetails = await getScopedAdminEventDetails(eventId, scope);

      return {
        reply: result.ok
          ? [
              "Carga atualizada.",
              `> Carga anterior: ${result.currentCapacity}`,
              `> Nova carga: ${result.newCapacity}`,
              `> Unidades criadas: ${result.createdCount}`,
              `> Unidades bloqueadas: ${result.blockedCount}`,
              "",
              renderAdminEventEditMenu(updatedDetails.ok ? updatedDetails.event.title : undefined),
            ].join("\n")
          : "Não consegui atualizar a carga.",
        nextContext: withAdminEventsContext(baseContext, "admin_event_edit_menu", {
          selectedEventId: eventId,
        }),
      };
    }

    const details = await getScopedAdminEventDetails(eventId, scope);
    const [sectionNumberRaw, capacityRaw] = text.split("|").map((part) => part.trim());
    const section = details.ok ? selectSectionByOption(details.event, sectionNumberRaw ?? "") : null;
    const newCapacity = Number(capacityRaw);

    if (
      !details.ok ||
      !section ||
      !Number.isInteger(newCapacity) ||
      newCapacity < 0 ||
      newCapacity > 5000
    ) {
      return {
        reply: [
          "Dados inválidos. Envie: número do setor | nova carga.",
          "Ex: 1 | 500",
        ].join("\n"),
        nextContext: withAdminEventsContext(
          baseContext,
          "admin_event_capacity_collecting",
          adminEvents,
        ),
      };
    }

    if (section.hasNumberedSeats) {
      return {
        reply: "Esse setor usa assento marcado. Ajuste a carga pelo fluxo de edição de assentos.",
        nextContext: withAdminEventsContext(baseContext, "admin_event_edit_menu", {
          selectedEventId: eventId,
        }),
      };
    }

    return {
      reply: [
        "Confirmar alteração de carga?",
        `Setor: ${section.name}`,
        `Carga atual: ${section.capacity ?? "não definida"}`,
        `Nova carga: ${newCapacity}`,
        "",
        "A redução só bloqueia unidades disponíveis. Vendidos e reservados não são alterados.",
        "",
        "Responda CONFIRMAR ou CANCELAR.",
      ].join("\n"),
      nextContext: withAdminEventsContext(baseContext, "admin_event_capacity_collecting", {
        ...adminEvents,
        mode: "confirm_edit_capacity",
        draft: {
          sectionId: section.sectionId,
          newCapacity,
        },
      }),
    };
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
      const freshAuth = await requireFreshAdminEventsPermission(
        baseContext,
        scope,
        "admin_event_section_update",
      );
      if (!freshAuth.ok) return freshAuth.response;

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
      const freshAuth = await requireFreshAdminEventsPermission(
        baseContext,
        scope,
        "admin_event_section_create",
      );
      if (!freshAuth.ok) return freshAuth.response;

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
      const freshAuth = await requireFreshAdminEventsPermission(
        baseContext,
        scope,
        "admin_event_seat_status_update",
      );
      if (!freshAuth.ok) return freshAuth.response;

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
      const freshAuth = await requireFreshAdminEventsPermission(
        baseContext,
        scope,
        "admin_event_seats_create",
      );
      if (!freshAuth.ok) return freshAuth.response;

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
      const freshAuth = await requireFreshAdminEventsPermission(
        baseContext,
        scope,
        "admin_event_session_seats_create",
      );
      if (!freshAuth.ok) return freshAuth.response;

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
        nextContext: withAdminEventsContext(baseContext, "admin_event_prices_menu", {
          ...adminEvents,
          draft: list.ok ? { lastPrices: list.prices } : adminEvents.draft,
        }),
      };
    }
    if (numericOption === 2) {
      const list = await getAdminPriceListForEvent(eventId, scope);
      return {
        reply: [
          list.ok
            ? [
                `*VALORES CADASTRADOS - ${list.eventTitle.toUpperCase()}*`,
                "",
                ...(list.prices.length
                  ? list.prices.map(
                      (price) =>
                        [
                          formatOptionLine(price.option, formatCompactAdminPriceLabel(price.label), {
                            preserveCase: true,
                          }),
                          price.sectionName,
                          formatPriceWithOptionalFee(price.priceCents, price.feeCents),
                        ].join(" - "),
                    )
                  : ["Nenhum preço cadastrado."]),
              ].join("\n")
            : list.reply,
          "",
          "*QUAL VALOR DESEJA ALTERAR?*",
          "Responda com o número.",
        ].join("\n"),
        nextContext: withAdminEventsContext(baseContext, "admin_event_price_edit_collecting", {
          ...adminEvents,
          mode: "select_price_value",
          draft: list.ok ? { lastPrices: list.prices } : {},
        }),
      };
    }
    if (numericOption === 3) return showAdminEventDetails(baseContext, scope, eventId);
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

      const freshAuth = await requireFreshAdminEventsPermission(
        baseContext,
        scope,
        "admin_event_price_update",
      );
      if (!freshAuth.ok) return freshAuth.response;

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

      const freshAuth = await requireFreshAdminEventsPermission(
        baseContext,
        scope,
        "admin_event_price_value_update",
      );
      if (!freshAuth.ok) return freshAuth.response;

      const result = await updateAdminPrice(String(adminEvents.draft?.priceId), {
        price_cents: priceCents,
      });
      const details = await getScopedAdminEventDetails(eventId, scope);

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
          ...(details.ok ? ["", renderAdminPricesMenu(details.event.title)] : []),
        ].join("\n")),
        nextContext: withAdminEventsContext(baseContext, "admin_event_prices_menu", {
          selectedEventId: eventId,
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

    const [priceNumberRaw, valueOneRaw] = text
      .split("|")
      .map((part) => part.trim());
    const price = lastPrices.find((item) => item.option === Number(priceNumberRaw));

    if (!price) {
      return {
        reply: "Valor inválido. Responda com o número do valor que deseja alterar.",
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

    return {
      reply: "Responda somente com o número do valor que deseja alterar.",
      nextContext: withAdminEventsContext(
        baseContext,
        "admin_event_price_edit_collecting",
        adminEvents,
      ),
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
      const freshAuth = await requireFreshAdminEventsPermission(
        baseContext,
        scope,
        "admin_event_price_create",
      );
      if (!freshAuth.ok) return freshAuth.response;

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

  if (result.reason === "buyer_risk_limited") {
    return TICKET_MESSAGES.buyerAntiAbuseLimited;
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
  if (result.reason === "checkout_risk_limited") {
    return TICKET_MESSAGES.buyerAntiAbuseLimited;
  }

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

async function renderBuyerSectionsStep({
  baseContext,
  selectedEvent,
}: {
  baseContext: TicketConversationState;
  selectedEvent?: TicketConversationSelectedEvent;
}): Promise<RouteTicketMessageOutput> {
  if (!selectedEvent) {
    return {
      reply: TICKET_MESSAGES.genericHelp,
      nextContext: resetBuyerReservationContext(baseContext),
    };
  }

  const selectedSession = await getValidatedEventSession({
    eventId: selectedEvent.eventId,
    sessionId: selectedEvent.sessionId,
  });

  if (!selectedSession) {
    return {
      reply: TICKET_MESSAGES.eventOptionUnavailable,
      nextContext: resetBuyerReservationContext(baseContext),
    };
  }

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
        selectedEvent: buildSelectedEvent(selectedSession),
        selectedSection: undefined,
        lastSections: [],
        lastSeats: [],
      },
    };
  }

  return {
    reply: formatSectionsReply({ sections }),
    nextContext: {
      ...baseContext,
      step: "showing_sections",
      state: "showing_sections",
      selectedEvent: buildSelectedEvent(selectedSession),
      selectedSection: undefined,
      selectedSeat: undefined,
      selectedQuantity: undefined,
      reservation: undefined,
      payment: undefined,
      lastSections: buildSectionOptions(sections),
      lastSeats: [],
    },
  };
}

async function renderBuyerQuantityStep({
  baseContext,
  selectedEvent,
  selectedSection,
}: {
  baseContext: TicketConversationState;
  selectedEvent?: TicketConversationSelectedEvent;
  selectedSection?: TicketConversationSelectedSection;
}): Promise<RouteTicketMessageOutput> {
  if (!selectedEvent || !selectedSection) {
    return renderBuyerSectionsStep({ baseContext, selectedEvent });
  }

  const selectedSession = await getValidatedEventSession({
    eventId: selectedEvent.eventId,
    sessionId: selectedEvent.sessionId,
  });

  if (!selectedSession) {
    return renderBuyerSectionsStep({ baseContext, selectedEvent });
  }

  const section = await getAvailableSectionForSession({
    sessionId: selectedSession.sessionId,
    sectionId: selectedSection.sectionId,
    venueId: selectedSession.venueId,
  });

  if (!section) {
    return renderBuyerSectionsStep({ baseContext, selectedEvent });
  }

  const ticketType =
    section.ticketTypes.find(
      (item) =>
        item.ticketPriceId === selectedSection.selectedTicketType?.ticketPriceId,
    ) ?? section.ticketTypes[0];

  return {
    reply: formatQuantityPrompt(section, ticketType),
    nextContext: {
      ...baseContext,
      step: "selecting_quantity",
      state: "selecting_quantity",
      selectedEvent: buildSelectedEvent(selectedSession),
      selectedSection: buildSelectedSection(section, ticketType),
      selectedSeat: undefined,
      selectedQuantity: undefined,
      reservation: undefined,
      payment: undefined,
      lastSeats: [],
    },
  };
}

async function handleBuyerBack({
  baseContext,
  customerId,
  sourceIdentifier,
}: {
  baseContext: TicketConversationState;
  customerId: string;
  sourceIdentifier?: string | null;
}): Promise<RouteTicketMessageOutput | null> {
  if (baseContext.state === "reviewing_cart") {
    return renderBuyerSectionsStep({
      baseContext,
      selectedEvent: baseContext.selectedEvent,
    });
  }

  if (baseContext.state === "showing_events") {
    return {
      reply: TICKET_MESSAGES.genericHelp,
      nextContext: resetBuyerReservationContext(baseContext),
    };
  }

  if (baseContext.state === "showing_sections") {
    if (baseContext.cart?.items.length) {
      return {
        reply: formatCartDecisionReply({ cart: baseContext.cart }),
        nextContext: {
          ...baseContext,
          step: "reviewing_cart",
          state: "reviewing_cart",
        },
      };
    }

    if (baseContext.lastEvents?.length) {
      return {
        reply: formatEventOptionsReply(baseContext.lastEvents),
        outboundMessages: buildEventOptionOutboundMessages(baseContext.lastEvents),
        nextContext: {
          ...baseContext,
          step: "showing_events",
          state: "showing_events",
          selectedEvent: undefined,
          selectedSection: undefined,
          selectedSeat: undefined,
          selectedQuantity: undefined,
          eventMoreInfoShown: undefined,
          reservation: undefined,
          payment: undefined,
          lastSections: [],
          lastSeats: [],
        },
      };
    }

    return {
      reply: TICKET_MESSAGES.genericHelp,
      nextContext: resetBuyerReservationContext(baseContext),
    };
  }

  if (baseContext.state === "selecting_quantity") {
    return renderBuyerSectionsStep({
      baseContext,
      selectedEvent: baseContext.selectedEvent,
    });
  }

  if (baseContext.state === "showing_seats") {
    return renderBuyerQuantityStep({
      baseContext,
      selectedEvent: baseContext.selectedEvent,
      selectedSection: baseContext.selectedSection,
    });
  }

  if (
    baseContext.state === "payment_pending" &&
    baseContext.reservation?.reservationId &&
    baseContext.reservation.orderId
  ) {
    return {
      reply: formatReservationContextReply({
        selectedEvent: baseContext.selectedEvent,
        selectedSection: baseContext.selectedSection,
        selectedSeat: baseContext.selectedSeat,
        reservation: baseContext.reservation,
        quantity: baseContext.selectedQuantity,
        cart: baseContext.cart,
      }),
      nextContext: {
        ...baseContext,
        step: "reservation_created",
        state: "reservation_created",
        payment: undefined,
      },
    };
  }

  if (
    baseContext.state === "reservation_created" &&
    baseContext.reservation?.reservationId &&
    baseContext.reservation.orderId
  ) {
    await cancelPendingReservationForCustomer({
      customerId,
      reservationId: baseContext.reservation.reservationId,
      orderId: baseContext.reservation.orderId,
      sourceIdentifier,
    });

    return renderBuyerSectionsStep({
      baseContext: { ...baseContext, cart: undefined },
      selectedEvent: baseContext.selectedEvent,
    });
  }

  return null;
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
  sourceIdentifier,
}: RouteTicketMessageInput): Promise<RouteTicketMessageOutput> {
  const previousState = getConversationState(conversation.context);
  const baseContext = {
    ...buildInitialConversationState(),
    ...previousState,
    updatedAt: new Date().toISOString(),
  };
  const gateCommand = parseGateCommand(text);
  const reservedAdminCommand = isReservedAdminCommand(text);

  const startAdminLogin = async (): Promise<RouteTicketMessageOutput> => {
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

    const blockStatus = await getAdminAuthBlockStatus(customer.whatsapp_phone);

    if (blockStatus.ok && blockStatus.blocked) {
      return {
        reply:
          blockStatus.type === "temporary"
            ? TICKET_MESSAGES.adminAuthTemporaryLocked.replace(
                "{minutes}",
                String(blockStatus.retryAfterMinutes),
              )
            : TICKET_MESSAGES.adminAuthHardLocked,
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

    const challengeResult = await createAdminLoginChallenge({
      adminUser: adminUserResult.adminUser,
      sourceIdentifier,
    });

    if (!challengeResult.ok) {
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

    const authReply = [
      "*LOGIN ADMINISTRATIVO*",
      "",
      "Abra este link para informar sua senha individual:",
      challengeResult.loginUrl,
      "",
      `O link expira em ${challengeResult.expiresInMinutes} minutos.`,
      "Depois de confirmar a senha, envie aqui o código de uso único exibido na página.",
    ].join("\n");

    return {
      reply: authReply,
      outboundMessages: [
        {
          type: "text",
          body: authReply,
          persistedBody: ADMIN_LOGIN_LINK_REDACTED_BODY,
        },
      ],
      nextContext: {
        ...baseContext,
        step: "admin_auth_pending",
        state: "admin_auth_pending",
        admin: buildAdminContext({
          adminUserId: adminUserResult.adminUser.id,
          role: adminUserResult.adminUser.role,
          authChallengeId: challengeResult.challengeId,
          authChallengeExpiresAt: challengeResult.expiresAt,
        }),
      },
    };
  };

  if (previousState.state === "admin_auth_pending") {
    if (isAdminLogoutCommand(text)) {
      return {
        reply: "Login administrativo cancelado. Para acessar novamente, envie admin.",
        nextContext: {
          ...buildInitialConversationState(),
          updatedAt: new Date().toISOString(),
        },
      };
    }

    if (reservedAdminCommand) {
      return startAdminLogin();
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

    const blockStatus = await getAdminAuthBlockStatus(customer.whatsapp_phone);

    if (blockStatus.ok && blockStatus.blocked) {
      return {
        reply:
          blockStatus.type === "temporary"
            ? TICKET_MESSAGES.adminAuthTemporaryLocked.replace(
                "{minutes}",
                String(blockStatus.retryAfterMinutes),
              )
            : TICKET_MESSAGES.adminAuthHardLocked,
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

    const codeResult = await consumeAdminLoginChallengeCode({
      phone: customer.whatsapp_phone,
      code: text,
      challengeId: previousState.admin?.authChallengeId,
      sourceIdentifier,
    });

    if (!codeResult.ok) {
      const failureResult =
        "failureResult" in codeResult ? codeResult.failureResult : null;
      const alertMessage =
        failureResult?.ok && failureResult.alertPhone
          ? {
              type: "text" as const,
              phone: failureResult.alertPhone,
              body: [
                "*ALERTA DE ACESSO ADMIN*",
                "",
                `O telefone ${maskAdminPhone(customer.whatsapp_phone)} teve ${failureResult.failedAttempts} tentativas incorretas de login administrativo.`,
                failureResult.hardLocked
                  ? "O acesso foi bloqueado até liberação manual por Diretor."
                  : `O acesso foi bloqueado temporariamente por ${failureResult.retryAfterMinutes ?? 15} minutos.`,
                "",
                "Entre em Administradores > Liberar administrador bloqueado se reconhecer o acesso.",
              ].join("\n"),
            }
          : null;
      const authFailureReply = failureResult?.ok && failureResult.hardLocked
          ? TICKET_MESSAGES.adminAuthHardLocked
        : failureResult?.ok && failureResult.temporaryLocked
          ? TICKET_MESSAGES.adminAuthTemporaryLocked.replace(
              "{minutes}",
              String(failureResult.retryAfterMinutes ?? 15),
            )
          : TICKET_MESSAGES.adminAuthInvalid;

      return {
        reply: authFailureReply,
        outboundMessages: alertMessage
          ? [{ type: "text", body: authFailureReply }, alertMessage]
          : undefined,
        nextContext: {
          ...baseContext,
          step: "admin_auth_pending",
          state: "admin_auth_pending",
          admin: buildAdminContext({
            adminUserId: adminUserResult.adminUser.id,
            role: adminUserResult.adminUser.role,
            authChallengeId: previousState.admin?.authChallengeId,
            authChallengeExpiresAt: previousState.admin?.authChallengeExpiresAt,
          }),
        },
      };
    }

    const sessionResult = await createAdminSession(codeResult.adminUser);

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
      reply: formatAdminMenu(codeResult.adminUser.role),
      nextContext: {
        ...baseContext,
        step: "admin_menu",
        state: "admin_menu",
        admin: buildAdminContext({
          adminUserId: codeResult.adminUser.id,
          role: codeResult.adminUser.role,
          sessionId: sessionResult.adminSession.id,
          expiresAt: sessionResult.adminSession.expires_at,
        }),
      },
    };
  }

  if (
    !isBuyerReservationExitIntent(text) &&
    !previousState.admin?.sessionId &&
    previousState.state !== "admin_menu" &&
    !isAdminSubmenuState(previousState.state)
  ) {
    const publicHelpResult = handlePublicHelpMessage({
      baseContext,
      text,
    });

    if (publicHelpResult) {
      return publicHelpResult;
    }
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
    return startAdminLogin();
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
    }) => {
      const nextContext: TicketConversationState = {
        ...baseContext,
        step: state,
        state,
        admin: buildAdminContext({
          adminUserId,
          role,
          sessionId,
          expiresAt,
        }),
      };

      if (state === "admin_menu") {
        delete nextContext.adminEvents;
        delete nextContext.adminCourtesies;
        delete nextContext.adminUsers;
        delete nextContext.adminGate;
        delete nextContext.adminOrders;
        delete nextContext.adminReports;
      } else if (!state.startsWith("admin_courtesy")) {
        delete nextContext.adminCourtesies;
      }

      return nextContext;
    };

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

    if (isAdminHomeText(text)) {
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
      const adminOrders = getAdminOrdersContext(baseContext);

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
        const ticketBlocks = result.tickets.map((ticket) =>
          formatAdminTicketForPhoneSearch(ticket),
        );
        const reservationBlocks = result.pendingReservations.map(
          (reservation) => formatAdminPendingReservation(reservation),
        );
        const reply = [
          "*BUSCA POR TELEFONE*",
          "",
          result.customer
            ? `Telefone: ${maskAdminPhone(result.customer.whatsapp_phone)}`
            : `Telefone: ${maskAdminPhone(phone)}`,
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
        const selectedOption =
          adminOrders.lastReservations?.length && text.trim().match(/^\d+$/)
            ? Number(text.trim())
            : null;
        const selectedReservation = selectedOption
          ? adminOrders.lastReservations?.find(
              (reservation) => reservation.option === selectedOption,
            )
          : null;

        if (selectedOption && !selectedReservation) {
          return {
            reply: withAdminNavigationHint(
              "Escolha uma reserva da lista ou envie outro telefone/código para buscar.",
            ),
            nextContext: withAdminOrdersContext(baseContext, "admin_order_cancel_collecting", {
              ...adminOrders,
            }),
          };
        }

        const normalizedCancelInput = text.trim();
        const cancelInputDigits = normalizedCancelInput.replace(/\D/g, "");
        const shouldListReservationOptions =
          !selectedReservation &&
          cancelInputDigits.length >= 10 &&
          !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
            normalizedCancelInput,
          );
        const reservations = selectedReservation
          ? await findAdminPendingReservationsByInput(selectedReservation.reservationId)
          : await findAdminPendingReservationsByInput(text);

        if (reservations.length === 0) {
          return {
            reply: withAdminNavigationHint(
              "Nenhuma reserva pendente ativa foi encontrada para esse dado.",
            ),
            nextContext: withAdminOrdersContext(baseContext, "admin_order_cancel_collecting", {}),
          };
        }

        if (shouldListReservationOptions || (reservations.length > 1 && !selectedReservation)) {
          const options = reservations.map((reservation, index) => ({
            option: index + 1,
            reservationId: reservation.reservationId,
            orderId: reservation.orderId,
            customerId: reservation.customerId,
          }));

          return {
            reply: withAdminNavigationHint([
              "*RESERVAS PENDENTES ENCONTRADAS*",
              "",
              reservations
                .map((reservation, index) =>
                  formatAdminPendingReservation(reservation, index + 1),
                )
                .join("\n---\n"),
              "",
              "Digite o número da reserva que deseja cancelar.",
            ].join("\n")),
            nextContext: withAdminOrdersContext(baseContext, "admin_order_cancel_collecting", {
              lastReservations: options,
            }),
          };
        }

        const reservation = reservations[0];

        return {
          reply: renderAdminPendingReservationCancelConfirm(reservation),
          nextContext: withAdminOrdersContext(baseContext, "admin_order_cancel_confirm", {
            pendingCancel: {
              reservationId: reservation.reservationId,
              orderId: reservation.orderId,
              customerId: reservation.customerId,
            },
          }),
        };
      }

      if (baseContext.state === "admin_order_cancel_confirm") {
        if (normalizeAdminText(text) !== "cancelar reserva") {
          const pending = adminOrders.pendingCancel;
          const reservations = pending
            ? await findAdminPendingReservationsByInput(pending.reservationId)
            : [];
          const reservation = reservations[0] ?? null;

          return {
            reply: reservation
              ? renderAdminPendingReservationCancelConfirm(reservation)
              : withAdminNavigationHint(
                  "Reserva pendente não encontrada. A ação não foi executada.",
                ),
            nextContext: reservation
              ? withAdminOrdersContext(baseContext, "admin_order_cancel_confirm", adminOrders)
              : withAdminOrdersContext(baseContext, "admin_orders_menu", {}),
          };
        }

        const pending = adminOrders.pendingCancel;

        if (!pending) {
          return {
            reply: withAdminNavigationHint(
              "Reserva pendente não encontrada. A ação não foi executada.",
            ),
            nextContext: withAdminOrdersContext(baseContext, "admin_orders_menu", {}),
          };
        }

        const freshAuth = await requireFreshAdminPermission({
          baseContext,
          scope: buildFreshAdminScope(adminUser),
          permission: "manage_tickets",
          operation: "admin_order_cancel_pending_reservation",
        });
        if (!freshAuth.ok) return freshAuth.response;

        const result = await cancelAdminPendingReservation(pending);

        if (!result.ok) {
          return {
            reply: withAdminNavigationHint(
              result.reason === "not_found"
                ? "Essa reserva não está mais pendente ou não pode ser cancelada."
                : "Não foi possível cancelar a reserva agora. Tente novamente.",
            ),
            nextContext: withAdminOrdersContext(baseContext, "admin_orders_menu", {}),
          };
        }

        const reply = [
          result.cancelResult.status === "expired"
            ? "*RESERVA EXPIRADA*"
            : "*RESERVA CANCELADA*",
          "",
          "Os ingressos foram liberados para venda novamente.",
          "",
          formatAdminPendingReservation(result.reservation),
        ].join("\n");

        return {
          reply: withAdminNavigationHint(reply),
          nextContext: withAdminOrdersContext(baseContext, "admin_orders_menu", {}),
        };
      }
    }

    if (isAdminCourtesyFlowState(baseContext.state)) {
      const courtesiesSubmenu = ADMIN_SUBMENUS.admin_courtesies_menu;
      const adminCourtesies = getAdminCourtesiesContext(baseContext);
      const submenuOption = parseAdminSubmenuOption(text);

      const returnToCourtesyMenu = () => ({
        reply: renderAdminSubmenu(courtesiesSubmenu),
        nextContext: adminReplyContext({
          state: "admin_courtesies_menu",
          role: adminUser.role,
          sessionId: adminSession.id,
          adminUserId: adminUser.id,
          expiresAt: adminSession.expires_at,
        }),
      });

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

      if (submenuOption === "exit") return endAdminSession();
      if (submenuOption === "menu" || submenuOption === "back") return returnToCourtesyMenu();

      if (
        baseContext.state === "admin_courtesy_event_select" ||
        baseContext.state === "admin_courtesy_list_event_select"
      ) {
        const eventId = resolveCourtesyEventId(text, adminCourtesies.lastEvents ?? []);
        const event = (adminCourtesies.lastEvents ?? []).find((item) => item.eventId === eventId);

        if (!eventId) {
          return {
            reply: "Evento não encontrado. Responda com número, nome ou ID.",
            nextContext: withAdminCourtesiesContext(baseContext, baseContext.state, adminCourtesies),
          };
        }

        if (baseContext.state === "admin_courtesy_list_event_select") {
          const list = await listCourtesiesForEvent(eventId);

          return {
            reply: list.ok ? buildCourtesiesListReply(list.courtesies) : TICKET_MESSAGES.adminGenericError,
            nextContext: adminReplyContext({
              state: "admin_courtesies_menu",
              role: adminUser.role,
              sessionId: adminSession.id,
              adminUserId: adminUser.id,
              expiresAt: adminSession.expires_at,
            }),
          };
        }

        const sessions = await listCourtesySessions(eventId);
        if (!sessions.ok || sessions.sessions.length === 0) {
          return {
            reply: "Nenhuma sessão disponível para gerar cortesia neste evento.",
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
          reply: buildCourtesySessionsReply(sessions.sessions),
          nextContext: withAdminCourtesiesContext(baseContext, "admin_courtesy_session_select", {
            ...adminCourtesies,
            mode: "generate",
            selectedEventId: eventId,
            selectedEventTitle: event?.title ?? null,
            lastSessions: sessions.sessions.map((session) => ({
              option: session.option,
              sessionId: session.sessionId,
              startsAt: session.startsAt,
              status: session.status,
            })),
          }),
        };
      }

      if (baseContext.state === "admin_courtesy_session_select") {
        const sessionId = resolveCourtesySessionId(text, adminCourtesies.lastSessions ?? []);
        const session = (adminCourtesies.lastSessions ?? []).find((item) => item.sessionId === sessionId);
        if (!sessionId) {
          return {
            reply: "Sessão não encontrada. Responda com o número da sessão.",
            nextContext: withAdminCourtesiesContext(baseContext, "admin_courtesy_session_select", adminCourtesies),
          };
        }

        const sections = await listCourtesySections(sessionId);
        if (!sections.ok || sections.sections.length === 0) {
          return {
            reply: "Nenhum setor com disponibilidade para cortesia nessa sessão.",
            nextContext: returnToCourtesyMenu().nextContext,
          };
        }

        return {
          reply: buildCourtesySectionsReply(sections.sections),
          nextContext: withAdminCourtesiesContext(baseContext, "admin_courtesy_section_select", {
            ...adminCourtesies,
            selectedSessionId: sessionId,
            selectedSessionLabel: session?.startsAt ? formatDateTime(session.startsAt) : null,
            lastSections: sections.sections,
          }),
        };
      }

      if (baseContext.state === "admin_courtesy_section_select") {
        const sectionId = resolveCourtesySectionId(text, adminCourtesies.lastSections ?? []);
        const section = (adminCourtesies.lastSections ?? []).find((item) => item.sectionId === sectionId);
        if (!sectionId || !section) {
          return {
            reply: "Setor não encontrado. Responda com o número do setor.",
            nextContext: withAdminCourtesiesContext(baseContext, "admin_courtesy_section_select", adminCourtesies),
          };
        }

        return {
          reply: "*QUANTIDADE DE CORTESIAS*\n\nDigite a quantidade que deseja emitir.",
          nextContext: withAdminCourtesiesContext(baseContext, "admin_courtesy_quantity_collecting", {
            ...adminCourtesies,
            selectedSectionId: sectionId,
            selectedSectionName: section.sectionName,
            hasNumberedSeats: section.hasNumberedSeats,
          }),
        };
      }

      if (baseContext.state === "admin_courtesy_quantity_collecting") {
        const quantity = /^\d+$/.test(text.trim()) ? Number(text.trim()) : null;
        if (!quantity || quantity <= 0 || quantity > 10) {
          return {
            reply: "Quantidade inválida. Envie um número de 1 a 10.",
            nextContext: withAdminCourtesiesContext(baseContext, "admin_courtesy_quantity_collecting", adminCourtesies),
          };
        }

        if (adminCourtesies.hasNumberedSeats) {
          const sessionId = adminCourtesies.selectedSessionId;
          const sectionId = adminCourtesies.selectedSectionId;
          if (!sessionId || !sectionId) return returnToCourtesyMenu();
          const seatMap = await listSeatMap({ sessionId, sectionId });
          const seatsReply = [
            "*ESCOLHA OS ASSENTOS DA CORTESIA*",
            "",
            `Digite ${quantity} código(s) de assento.`,
          ].join("\n");
          return {
            reply: seatsReply,
            outboundMessages: [
              {
                type: "image",
                imageUrl: buildSeatMapPngDataUrl({
                  seatMap,
                  title: adminCourtesies.selectedSectionName ?? "Assentos",
                  stageLabel: "PALCO",
                }),
                caption: seatsReply,
              },
            ],
            nextContext: withAdminCourtesiesContext(baseContext, "admin_courtesy_seat_collecting", {
              ...adminCourtesies,
              quantity,
            }),
          };
        }

        return {
          reply: "*TELEFONE DO BENEFICIÁRIO*\n\nDigite o telefone que receberá a cortesia.",
          nextContext: withAdminCourtesiesContext(baseContext, "admin_courtesy_beneficiary_phone_collecting", {
            ...adminCourtesies,
            quantity,
          }),
        };
      }

      if (baseContext.state === "admin_courtesy_seat_collecting") {
        const seatCodes = parseCourtesySeatCodes(text);
        if (!adminCourtesies.quantity || seatCodes.length !== adminCourtesies.quantity) {
          return {
            reply: "ASSENTO INDISPONÍVEL",
            nextContext: withAdminCourtesiesContext(baseContext, "admin_courtesy_seat_collecting", adminCourtesies),
          };
        }

        return {
          reply: "*TELEFONE DO BENEFICIÁRIO*\n\nDigite o telefone que receberá a cortesia.",
          nextContext: withAdminCourtesiesContext(baseContext, "admin_courtesy_beneficiary_phone_collecting", {
            ...adminCourtesies,
            seatCodes,
          }),
        };
      }

      if (baseContext.state === "admin_courtesy_beneficiary_phone_collecting") {
        const phone = normalizeCourtesyPhone(text);
        if (!phone || phone.length < 12) {
          return {
            reply: "Telefone inválido. Envie um telefone com DDD.",
            nextContext: withAdminCourtesiesContext(baseContext, "admin_courtesy_beneficiary_phone_collecting", adminCourtesies),
          };
        }

        return {
          reply: "*NOME DO BENEFICIÁRIO*\n\nDigite o nome ou responda PULAR.",
          nextContext: withAdminCourtesiesContext(baseContext, "admin_courtesy_beneficiary_name_collecting", {
            ...adminCourtesies,
            beneficiaryPhone: phone,
          }),
        };
      }

      if (baseContext.state === "admin_courtesy_beneficiary_name_collecting") {
        const normalized = normalizeIntentText(text);
        const beneficiaryName = normalized === "pular" ? null : text.trim();
        return {
          reply: "*MOTIVO/OBSERVAÇÃO*\n\nDigite uma observação ou responda PULAR.",
          nextContext: withAdminCourtesiesContext(baseContext, "admin_courtesy_reason_collecting", {
            ...adminCourtesies,
            beneficiaryName: beneficiaryName || null,
          }),
        };
      }

      if (baseContext.state === "admin_courtesy_reason_collecting") {
        const normalized = normalizeIntentText(text);
        const reason = normalized === "pular" ? null : text.trim();
        const nextCourtesy = { ...adminCourtesies, reason: reason || null };

        return {
          reply: buildCourtesyConfirmation({
            eventTitle: nextCourtesy.selectedEventTitle,
            sessionLabel: nextCourtesy.selectedSessionLabel,
            sectionName: nextCourtesy.selectedSectionName,
            quantity: nextCourtesy.quantity,
            seatCodes: nextCourtesy.seatCodes,
            beneficiaryPhone: nextCourtesy.beneficiaryPhone,
            beneficiaryName: nextCourtesy.beneficiaryName,
            reason: nextCourtesy.reason,
          }),
          nextContext: withAdminCourtesiesContext(baseContext, "admin_courtesy_confirm", nextCourtesy),
        };
      }

      if (baseContext.state === "admin_courtesy_confirm") {
        if (normalizeIntentText(text) !== "confirmar") {
          return {
            reply: "Digite CONFIRMAR para emitir a cortesia ou CANCELAR para abandonar.",
            nextContext: withAdminCourtesiesContext(baseContext, "admin_courtesy_confirm", adminCourtesies),
          };
        }

        const eventId = adminCourtesies.selectedEventId;
        const sessionId = adminCourtesies.selectedSessionId;
        const sectionId = adminCourtesies.selectedSectionId;
        const quantity = adminCourtesies.quantity;
        const beneficiaryPhone = adminCourtesies.beneficiaryPhone;
        if (!eventId || !sessionId || !sectionId || !quantity || !beneficiaryPhone) {
          return returnToCourtesyMenu();
        }

        const freshAuth = await requireFreshAdminPermission({
          baseContext,
          scope: buildFreshAdminScope(adminUser),
          permission: "manage_courtesies",
          operation: "admin_courtesy_issue",
        });
        if (!freshAuth.ok) return freshAuth.response;

        const issueResult = await issueAdminCourtesy({
          eventId,
          sessionId,
          sectionId,
          quantity,
          seatCodes: adminCourtesies.seatCodes,
          beneficiaryPhone,
          beneficiaryName: adminCourtesies.beneficiaryName,
          reason: adminCourtesies.reason,
          issuedByAdminUserId: freshAuth.scope.adminUserId,
          issuedByAdminPhone: normalizeGatePhone(freshAuth.scope.adminPhone) ?? freshAuth.scope.adminPhone,
        });

        if (!issueResult.ok) {
          logError("Failed to issue admin courtesy", {
            reason: issueResult.reason,
            error: issueResult.error,
            eventId,
            adminUserId: adminUser.id,
          });
          return {
            reply:
              issueResult.reason === "seat_unavailable"
                ? "ASSENTO INDISPONÍVEL"
                : "Não consegui gerar a cortesia. Nenhum ingresso foi emitido parcialmente.",
            nextContext: returnToCourtesyMenu().nextContext,
          };
        }

        const adminSuccessReply = buildCourtesyAdminSuccess(issueResult);

        return {
          reply: adminSuccessReply,
          outboundMessages: [
            { type: "text", body: adminSuccessReply },
            { type: "text", body: issueResult.delivery.message, phone: issueResult.beneficiaryPhone },
            ...issueResult.delivery.qrImages.map((image) => ({
              type: "image" as const,
              imageUrl: image.imageUrl,
              caption: image.caption,
              phone: issueResult.beneficiaryPhone,
            })),
          ],
          nextContext: returnToCourtesyMenu().nextContext,
        };
      }

      if (
        baseContext.state === "admin_courtesy_resend_target_collecting" ||
        baseContext.state === "admin_courtesy_cancel_target_collecting"
      ) {
        const phone = normalizeCourtesyPhone(text);
        const ticketCode = /^TCK-[A-Z0-9]+$/i.test(text.trim())
          ? text.trim().toUpperCase()
          : undefined;

        if (!phone && !ticketCode) {
          return {
            reply: "Digite um telefone válido ou código de ticket. Ex: TCK-XXXXXXXXXXXX",
            nextContext: withAdminCourtesiesContext(baseContext, baseContext.state, adminCourtesies),
          };
        }

        const found = await findCourtesyTargets({ phone: phone ?? undefined, ticketCode });
        if (!found.ok || found.courtesies.length === 0) {
          return {
            reply: "Nenhuma cortesia encontrada para esse dado.",
            nextContext: returnToCourtesyMenu().nextContext,
          };
        }

        const nextState =
          baseContext.state === "admin_courtesy_resend_target_collecting"
            ? "admin_courtesy_resend_select"
            : "admin_courtesy_cancel_select";

        return {
          reply: [
            buildCourtesiesListReply(found.courtesies, { selectable: true }),
            "",
            nextState === "admin_courtesy_resend_select"
              ? "*QUAL CORTESIA DESEJA REENVIAR?*"
              : "*QUAL CORTESIA DESEJA CANCELAR?*",
            "Responda com o número da cortesia.",
          ].join("\n"),
          nextContext: withAdminCourtesiesContext(baseContext, nextState, {
            ...adminCourtesies,
            lastCourtesies: found.courtesies.map((courtesy, index) => ({
              option: index + 1,
              courtesyId: courtesy.courtesyId,
              phone: courtesy.phone,
              ticketCode: courtesy.ticketCode,
            })),
          }),
        };
      }

      if (
        baseContext.state === "admin_courtesy_resend_select" ||
        baseContext.state === "admin_courtesy_cancel_select"
      ) {
        const target = resolveCourtesyCancelTarget(text, adminCourtesies.lastCourtesies ?? []);
        if (!target?.courtesyId) {
          return {
            reply: "Não encontrei essa cortesia. Responda com o número da lista.",
            nextContext: withAdminCourtesiesContext(baseContext, baseContext.state, adminCourtesies),
          };
        }

        return {
          reply:
            baseContext.state === "admin_courtesy_resend_select"
              ? "Digite CONFIRMAR para reenviar esta cortesia."
              : "Digite CANCELAR CORTESIA para cancelar esta cortesia.",
          nextContext: withAdminCourtesiesContext(
            baseContext,
            baseContext.state === "admin_courtesy_resend_select"
              ? "admin_courtesy_resend_confirm"
              : "admin_courtesy_cancel_confirm",
            { ...adminCourtesies, pendingCourtesyId: target.courtesyId },
          ),
        };
      }

      if (baseContext.state === "admin_courtesy_resend_confirm") {
        if (normalizeIntentText(text) !== "confirmar") {
          return {
            reply: "Reenvio não confirmado. Voltando ao menu de Cortesias.",
            nextContext: returnToCourtesyMenu().nextContext,
          };
        }

        const courtesyId = adminCourtesies.pendingCourtesyId;
        if (!courtesyId) return returnToCourtesyMenu();
        const found = await findCourtesyTargets({ courtesyId });
        const courtesy = found.ok ? found.courtesies[0] : null;
        if (!courtesy || courtesy.status !== "issued" || courtesy.ticketStatus !== "issued" || courtesy.usedAt) {
          return {
            reply: "Não é possível reenviar esta cortesia porque ela está cancelada ou já foi usada.",
            nextContext: returnToCourtesyMenu().nextContext,
          };
        }
        const delivery = await buildCourtesyDeliveryForCourtesyId(courtesyId);
        if (!delivery.ok) {
          return { reply: TICKET_MESSAGES.adminGenericError, nextContext: returnToCourtesyMenu().nextContext };
        }
        const resendReply = "Cortesia reenviada ao beneficiário pelo WhatsApp.";
        return {
          reply: resendReply,
          outboundMessages: [
            { type: "text", body: resendReply },
            { type: "text", body: delivery.delivery.message, phone: courtesy.phone },
            ...delivery.delivery.qrImages.map((image) => ({
              type: "image" as const,
              imageUrl: image.imageUrl,
              caption: image.caption,
              phone: courtesy.phone,
            })),
          ],
          nextContext: returnToCourtesyMenu().nextContext,
        };
      }

      if (baseContext.state === "admin_courtesy_cancel_confirm") {
        if (normalizeIntentText(text) !== "cancelar cortesia") {
          return {
            reply: "Texto não confirmado. A cortesia não foi cancelada.",
            nextContext: returnToCourtesyMenu().nextContext,
          };
        }

        const courtesyId = adminCourtesies.pendingCourtesyId;
        if (!courtesyId) return returnToCourtesyMenu();
        const freshAuth = await requireFreshAdminPermission({
          baseContext,
          scope: buildFreshAdminScope(adminUser),
          permission: "manage_courtesies",
          operation: "admin_courtesy_cancel",
        });
        if (!freshAuth.ok) return freshAuth.response;

        const result = await cancelCourtesyForEvent(adminCourtesies.selectedEventId ?? "", {
          courtesyId,
        });

        return {
          reply:
            result.ok && result.cancelledCount > 0
              ? "CORTESIA CANCELADA\nOs ingressos foram liberados para venda novamente."
              : "Não foi possível cancelar esta cortesia. Ela pode já estar usada ou cancelada.",
          nextContext: returnToCourtesyMenu().nextContext,
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
                    selectable: true,
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

        const freshAuth = await requireFreshAdminPermission({
          baseContext,
          scope: buildFreshAdminScope(adminUser),
          permission: "manage_gate",
          operation: "admin_gate_access_create",
        });
        if (!freshAuth.ok) return freshAuth.response;

        const gateAccessResult = await createGateAccess({
          phone: validatorPhone,
          passphrase,
          eventId,
          createdByAdminUserId: freshAuth.scope.adminUserId,
          createdByAdminPhone: freshAuth.scope.adminPhone,
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
          const freshAuth = await requireFreshAdminPermission({
            baseContext,
            scope: buildFreshAdminScope(adminUser),
            permission: "manage_gate",
            operation: "admin_gate_self_checkin_create",
          });
          if (!freshAuth.ok) return freshAuth.response;

          const gateSessionResult = await createGateSession({
            validatorPhone: freshAuth.scope.adminPhone,
            createdByAdminPhone: freshAuth.scope.adminPhone,
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
              selectable: true,
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

        const freshAuth = await requireFreshAdminPermission({
          baseContext,
          scope: buildFreshAdminScope(adminUser),
          permission: "manage_gate",
          operation: "admin_gate_access_pause",
        });
        if (!freshAuth.ok) return freshAuth.response;

        const revokeResult = await pauseGateAccess({
          accessId: selected.gateAccessId,
          eventId: selected.eventId,
          revokedByAdminUserId: freshAuth.scope.adminUserId,
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

      if (submenuOption === "exit") return endAdminSession();
      if (
        baseContext.state === "admin_report_period_select" &&
        submenuOption === 7
      ) return endAdminSession();
      if (
        submenuOption === "menu" ||
        submenuOption === "back" ||
        (baseContext.state === "admin_report_period_select" && submenuOption === 6)
      ) {
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
        if (!adminReports.reportType) {
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
          const freshAuth = await requireFreshAdminPermission({
            baseContext,
            scope: buildFreshAdminScope(adminUser),
            permission: "view_reports",
            operation: "admin_report_generate",
          });
          if (!freshAuth.ok) return freshAuth.response;

          const report =
            adminReports.reportType === "summary"
              ? await buildAdminGeneralReport(period)
              : adminReports.selectedEventId
                ? await buildAdminReport({
                    eventId: adminReports.selectedEventId,
                    type: adminReports.reportType,
                    period,
                  })
                : null;

          if (!report) {
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

      if (baseContext.state === "admin_user_create_collect_phone") {
        const adminUsersContext = baseContext.adminUsers ?? {};
        const phone = normalizeAdminPhone(text);

        if (!phone || phone.length < 10) {
          return {
            reply: renderAdminUserPhonePrompt(),
            nextContext: withAdminUsersContext(
              baseContext,
              "admin_user_create_collect_phone",
              adminUsersContext,
            ),
          };
        }

        return {
          reply: renderAdminUserNamePrompt(),
          nextContext: withAdminUsersContext(
            baseContext,
            "admin_user_create_collect_name",
            { ...adminUsersContext, pendingPhone: phone },
          ),
        };
      }

      if (baseContext.state === "admin_user_create_collect_name") {
        const adminUsersContext = baseContext.adminUsers ?? {};
        const normalizedName = normalizeAdminText(text);
        const name = normalizedName === "pular" ? null : text.trim();

        if (!adminUsersContext.pendingPhone || (!name && normalizedName !== "pular")) {
          return {
            reply: renderAdminUserNamePrompt(),
            nextContext: withAdminUsersContext(
              baseContext,
              "admin_user_create_collect_name",
              adminUsersContext,
            ),
          };
        }

        return {
          reply: renderAdminUserTypePrompt(),
          nextContext: withAdminUsersContext(
            baseContext,
            "admin_user_create_select_role",
            { ...adminUsersContext, pendingName: name },
          ),
        };
      }

      if (baseContext.state === "admin_user_create_select_role") {
        const adminUsersContext = baseContext.adminUsers ?? {};
        const selectedRole = parseAdminRole(text);

        if (!adminUsersContext.pendingPhone || !selectedRole) {
          return {
            reply: renderAdminUserTypePrompt(),
            nextContext: withAdminUsersContext(
              baseContext,
              "admin_user_create_select_role",
              adminUsersContext,
            ),
          };
        }

        return {
          reply: renderAdminUserPassphrasePrompt(),
          nextContext: withAdminUsersContext(baseContext, "admin_user_create_collect_passphrase", {
            ...adminUsersContext,
            pendingRole: selectedRole,
          }),
        };
      }

      if (baseContext.state === "admin_user_create_collect_passphrase") {
        const adminUsersContext = baseContext.adminUsers ?? {};
        const passphrase = text.trim();

        if (
          !adminUsersContext.pendingPhone ||
          !adminUsersContext.pendingRole ||
          !passphrase
        ) {
          return {
            reply: renderAdminUserPassphrasePrompt(),
            nextContext: withAdminUsersContext(
              baseContext,
              "admin_user_create_collect_passphrase",
              adminUsersContext,
            ),
          };
        }

        const passphraseHash = hashAdminPassphrase(passphrase);

        return {
          reply: renderAdminUserCreateConfirm({
            phone: adminUsersContext.pendingPhone,
            name: adminUsersContext.pendingName,
            role: adminUsersContext.pendingRole,
          }),
          nextContext: withAdminUsersContext(baseContext, "admin_user_create_confirm", {
            ...adminUsersContext,
            pendingPassphraseHash: passphraseHash,
          }),
        };
      }

      if (baseContext.state === "admin_user_create_confirm") {
        const adminUsersContext = baseContext.adminUsers ?? {};

        if (normalizeAdminText(text) !== "confirmar admin") {
          return {
            reply: "Digite CONFIRMAR ADMIN para confirmar ou CANCELAR para abandonar.",
            nextContext: withAdminUsersContext(
              baseContext,
              "admin_user_create_confirm",
              adminUsersContext,
            ),
          };
        }

        if (
          !adminUsersContext.pendingPhone ||
          !adminUsersContext.pendingRole ||
          !adminUsersContext.pendingPassphraseHash
        ) {
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

        const freshAuth = await requireFreshAdminPermission({
          baseContext,
          scope: buildFreshAdminScope(adminUser),
          permission: "manage_admins",
          operation: "admin_user_create",
        });
        if (!freshAuth.ok) return freshAuth.response;

        const result = await createAdminUser({
          phone: adminUsersContext.pendingPhone,
          name: adminUsersContext.pendingName ?? null,
          role: adminUsersContext.pendingRole,
          passphraseHash: adminUsersContext.pendingPassphraseHash,
          createdByAdminPhone: freshAuth.scope.adminPhone,
        });

        if (!result.ok && result.reason === "already_disabled" && result.adminUserId) {
          return {
            reply: renderAdminUserCreateConfirm({
              phone: adminUsersContext.pendingPhone,
              name: adminUsersContext.pendingName,
              role: adminUsersContext.pendingRole,
              reactivation: true,
            }),
            nextContext: withAdminUsersContext(baseContext, "admin_user_reactivate_confirm", {
              ...adminUsersContext,
              pendingExistingAdminUserId: result.adminUserId,
              mode: "reactivate",
            }),
          };
        }

        if (!result.ok && result.reason === "already_active") {
          return {
            reply: "Este telefone já possui administrador ativo cadastrado.",
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
          reply: result.ok
            ? [
                "*ADMINISTRADOR ADICIONADO*",
                "",
                `> Nome: ${adminUsersContext.pendingName || "Sem nome"}`,
                `> Telefone: ${maskAdminPhone(adminUsersContext.pendingPhone)}`,
                `> Perfil: ${formatAdminRoleLabel(adminUsersContext.pendingRole)}`,
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

      if (baseContext.state === "admin_user_reactivate_confirm") {
        const adminUsersContext = baseContext.adminUsers ?? {};

        if (normalizeAdminText(text) !== "reativar admin") {
          return {
            reply: "Digite REATIVAR ADMIN para confirmar ou CANCELAR para abandonar.",
            nextContext: withAdminUsersContext(
              baseContext,
              "admin_user_reactivate_confirm",
              adminUsersContext,
            ),
          };
        }

        if (
          !adminUsersContext.pendingExistingAdminUserId ||
          !adminUsersContext.pendingPhone ||
          !adminUsersContext.pendingRole ||
          !adminUsersContext.pendingPassphraseHash
        ) {
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

        const freshAuth = await requireFreshAdminPermission({
          baseContext,
          scope: buildFreshAdminScope(adminUser),
          permission: "manage_admins",
          operation: "admin_user_reactivate",
        });
        if (!freshAuth.ok) return freshAuth.response;

        const result = await reactivateAdminUser({
          adminUserId: adminUsersContext.pendingExistingAdminUserId,
          phone: adminUsersContext.pendingPhone,
          name: adminUsersContext.pendingName ?? null,
          role: adminUsersContext.pendingRole,
          passphraseHash: adminUsersContext.pendingPassphraseHash,
          createdByAdminPhone: freshAuth.scope.adminPhone,
        });

        return {
          reply: result.ok
            ? [
                "*ADMINISTRADOR REATIVADO*",
                "",
                `> Nome: ${adminUsersContext.pendingName || "Sem nome"}`,
                `> Telefone: ${maskAdminPhone(adminUsersContext.pendingPhone)}`,
                `> Perfil: ${formatAdminRoleLabel(adminUsersContext.pendingRole)}`,
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
        baseContext.state === "admin_user_role_select_user" ||
        baseContext.state === "admin_user_disable_select"
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

        const selectedUser = adminUsersContext.lastUsers?.find(
          (user) => user.adminUserId === selectedAdminUserId,
        );

        if (baseContext.state === "admin_user_disable_select") {
          const listedUser = selectedUser
            ? ({
                id: selectedUser.adminUserId,
                phone: selectedUser.phone,
                name: selectedUser.name ?? null,
                role: selectedUser.role ?? "operator",
                status: selectedUser.status ?? "active",
                createdAt: new Date().toISOString(),
                lastLoginAt: null,
              } satisfies AdminUserListItem)
            : null;

          return {
            reply: listedUser
              ? renderAdminUserDisableConfirm(listedUser)
              : "Administrador não encontrado. Responda com número, telefone ou ID.",
            nextContext: withAdminUsersContext(baseContext, "admin_user_disable_confirm", {
              ...adminUsersContext,
              selectedAdminUserId,
              selectedAdminName: selectedUser?.name ?? null,
              selectedAdminPhone: selectedUser?.phone,
              selectedAdminRole: selectedUser?.role,
              selectedAdminStatus: selectedUser?.status,
            }),
          };
        }

        return {
          reply: renderAdminUserRolePrompt(),
          nextContext: withAdminUsersContext(
            baseContext,
            "admin_user_role_select_role",
            {
              ...adminUsersContext,
              selectedAdminUserId,
              selectedAdminName: selectedUser?.name ?? null,
              selectedAdminPhone: selectedUser?.phone,
              selectedAdminRole: selectedUser?.role,
              selectedAdminStatus: selectedUser?.status,
            },
          ),
        };
      }

      if (baseContext.state === "admin_user_unlock_select") {
        const adminUsersContext = baseContext.adminUsers ?? {};
        const selectedPhone = resolveBlockedAdminAuthPhone(
          text,
          adminUsersContext.lastBlockedAuths ?? [],
        );

        if (!selectedPhone) {
          return {
            reply: "Administrador bloqueado não encontrado. Responda com número ou telefone.",
            nextContext: withAdminUsersContext(
              baseContext,
              "admin_user_unlock_select",
              adminUsersContext,
            ),
          };
        }

        const selected = adminUsersContext.lastBlockedAuths?.find(
          (item) => item.phone === selectedPhone,
        );

        return {
          reply: renderAdminUnlockConfirm({
            phone: selectedPhone,
            name: selected?.name,
          }),
          nextContext: withAdminUsersContext(baseContext, "admin_user_unlock_confirm", {
            ...adminUsersContext,
            selectedAdminPhone: selectedPhone,
            selectedAdminName: selected?.name ?? null,
          }),
        };
      }

      if (baseContext.state === "admin_user_role_select_role") {
        const adminUsersContext = baseContext.adminUsers ?? {};
        const newRole = parseAdminRole(text);

        if (!adminUsersContext.selectedAdminUserId || !newRole) {
          return {
            reply: renderAdminUserRolePrompt(),
            nextContext: withAdminUsersContext(
              baseContext,
              "admin_user_role_select_role",
              adminUsersContext,
            ),
          };
        }

        return {
          reply: renderAdminUserRoleConfirm({
            name: adminUsersContext.selectedAdminName,
            phone: adminUsersContext.selectedAdminPhone,
            currentRole: adminUsersContext.selectedAdminRole,
            newRole,
          }),
          nextContext: withAdminUsersContext(baseContext, "admin_user_role_confirm", {
            ...adminUsersContext,
            pendingRole: newRole,
          }),
        };
      }

      if (baseContext.state === "admin_user_role_confirm") {
        const adminUsersContext = baseContext.adminUsers ?? {};

        if (normalizeAdminText(text) !== "alterar nivel") {
          return {
            reply: "Digite ALTERAR NÍVEL para confirmar ou CANCELAR para abandonar.",
            nextContext: withAdminUsersContext(
              baseContext,
              "admin_user_role_confirm",
              adminUsersContext,
            ),
          };
        }

        if (!adminUsersContext.selectedAdminUserId || !adminUsersContext.pendingRole) {
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

        const freshAuth = await requireFreshAdminPermission({
          baseContext,
          scope: buildFreshAdminScope(adminUser),
          permission: "manage_admins",
          operation: "admin_user_role_update",
        });
        if (!freshAuth.ok) return freshAuth.response;

        const result = await updateAdminRole({
          adminUserId: adminUsersContext.selectedAdminUserId,
          role: adminUsersContext.pendingRole,
          actingAdminUserId: freshAuth.scope.adminUserId,
        });

        const blockedMessage =
          !result.ok && result.reason === "self_downgrade_blocked"
            ? "Não é permitido rebaixar o próprio Diretor neste fluxo."
            : !result.ok && result.reason === "last_root_blocked"
              ? "Não é permitido remover o último Diretor ativo."
              : null;

        return {
          reply: result.ok
            ? [
                "*NÍVEL DE ADMINISTRADOR ATUALIZADO*",
                `> Perfil: ${formatAdminRoleLabel(adminUsersContext.pendingRole)}`,
                'Digite "Voltar" para voltar, "Cancelar" para abandonar esta tela ou "Sair" para sair da área de admin.',
              ].join("\n")
            : (blockedMessage ?? TICKET_MESSAGES.adminGenericError),
          nextContext: adminReplyContext({
            state: "admin_users_menu",
            role: adminUser.role,
            sessionId: adminSession.id,
            adminUserId: adminUser.id,
            expiresAt: adminSession.expires_at,
          }),
        };
      }

      if (baseContext.state === "admin_user_disable_confirm") {
        const adminUsersContext = baseContext.adminUsers ?? {};

        if (normalizeAdminText(text) !== "desativar admin") {
          return {
            reply: "Digite DESATIVAR ADMIN para confirmar ou CANCELAR para abandonar.",
            nextContext: withAdminUsersContext(
              baseContext,
              "admin_user_disable_confirm",
              adminUsersContext,
            ),
          };
        }

        if (!adminUsersContext.selectedAdminUserId) {
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

        const freshAuth = await requireFreshAdminPermission({
          baseContext,
          scope: buildFreshAdminScope(adminUser),
          permission: "manage_admins",
          operation: "admin_user_disable",
        });
        if (!freshAuth.ok) return freshAuth.response;

        const result = await disableAdminUser({
          adminUserId: adminUsersContext.selectedAdminUserId,
          actingAdminUserId: freshAuth.scope.adminUserId,
        });

        const blockedMessage =
          !result.ok && result.reason === "self_disable_blocked"
            ? "Não é permitido desativar o próprio Diretor neste fluxo."
            : !result.ok && result.reason === "last_root_blocked"
              ? "Não é permitido desativar o último Diretor ativo."
              : null;

        return {
          reply: result.ok
            ? [
                "*ADMINISTRADOR DESATIVADO*",
                "",
                `> Nome: ${adminUsersContext.selectedAdminName || "Sem nome"}`,
                `> Telefone: ${adminUsersContext.selectedAdminPhone ? maskAdminPhone(adminUsersContext.selectedAdminPhone) : "não informado"}`,
                `> Perfil: ${adminUsersContext.selectedAdminRole ? formatAdminRoleLabel(adminUsersContext.selectedAdminRole) : "não informado"}`,
              ].join("\n")
            : (blockedMessage ?? TICKET_MESSAGES.adminGenericError),
          nextContext: adminReplyContext({
            state: "admin_users_menu",
            role: adminUser.role,
            sessionId: adminSession.id,
            adminUserId: adminUser.id,
            expiresAt: adminSession.expires_at,
          }),
        };
      }

      if (baseContext.state === "admin_user_unlock_confirm") {
        const adminUsersContext = baseContext.adminUsers ?? {};

        if (normalizeAdminText(text) !== "liberar admin") {
          return {
            reply: "Digite LIBERAR ADMIN para confirmar ou CANCELAR para abandonar.",
            nextContext: withAdminUsersContext(
              baseContext,
              "admin_user_unlock_confirm",
              adminUsersContext,
            ),
          };
        }

        if (!adminUsersContext.selectedAdminPhone) {
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

        const freshAuth = await requireFreshAdminPermission({
          baseContext,
          scope: buildFreshAdminScope(adminUser),
          permission: "manage_admins",
          operation: "admin_user_unlock",
        });
        if (!freshAuth.ok) return freshAuth.response;

        const result = await unlockAdminAuthForPhone({
          phone: adminUsersContext.selectedAdminPhone,
          unlockedByAdminUserId: freshAuth.scope.adminUserId,
        });

        return {
          reply: result.ok
            ? [
                "*ADMINISTRADOR LIBERADO*",
                "",
                `> Nome: ${adminUsersContext.selectedAdminName || "Sem nome"}`,
                `> Telefone: ${maskAdminPhone(adminUsersContext.selectedAdminPhone)}`,
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
      if (!canAccessAdminMenu(adminUser.role, ADMIN_SUBMENUS.admin_events_menu)) {
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
        (baseContext.state === "admin_event_prices_menu" && numericOption === 4);

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
          return buildAdminCourtesyEventSelect({
            baseContext,
            scope: buildAdminEventScope(adminUser),
            state: "admin_courtesy_event_select",
            title: "GERAR CORTESIA - ESCOLHA O EVENTO",
            context: { mode: "generate" },
          });
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

        if (submenuOption === 3 || submenuOption === 4) {
          return {
            reply:
              submenuOption === 3
                ? "*REENVIAR CORTESIA*\n\nDigite o telefone do beneficiário ou o código da cortesia."
                : "*CANCELAR CORTESIA*\n\nDigite o telefone do beneficiário ou o código da cortesia.",
            nextContext: withAdminCourtesiesContext(
              baseContext,
              submenuOption === 3
                ? "admin_courtesy_resend_target_collecting"
                : "admin_courtesy_cancel_target_collecting",
              { mode: submenuOption === 3 ? "resend" : "cancel" },
            ),
          };
        }
      }

      if (previousState.state === "admin_users_menu") {
        if (submenuOption === 2) {
          return {
            reply: renderAdminUserPhonePrompt(),
            nextContext: adminReplyContext({
              state: "admin_user_create_collect_phone",
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
          submenuOption === 4 ||
          submenuOption === 5
        ) {
          if (submenuOption === 5) {
            const blockedResult = await listBlockedAdminAuths();

            if (!blockedResult.ok) {
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

            if (!blockedResult.blocked.length) {
              return {
                reply: withAdminNavigationHint(renderBlockedAdminAuthList([])),
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
              reply: [
                renderBlockedAdminAuthList(blockedResult.blocked),
                "",
                "Responda com o número ou telefone que deseja liberar.",
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
                "admin_user_unlock_select",
                {
                  mode: "unlock",
                  lastBlockedAuths: blockedResult.blocked.map((item, index) => ({
                    option: index + 1,
                    phone: item.phone,
                    name: item.name,
                  })),
                },
              ),
            };
          }

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
            const selectableUsers = submenuOption === 4
              ? usersResult.users.filter((user) => user.status === "active")
              : usersResult.users;
            return {
              reply: [
                "*ADMINISTRADORES*",
                submenuOption === 3
                  ? "*QUAL ADMINISTRADOR DESEJA ALTERAR?*"
                  : "*QUAL ADMINISTRADOR DESEJA DESATIVAR?*",
                "Responda com número, telefone ou ID.",
                "",
                renderAdminUsersSelectionList(selectableUsers).replace(
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
                  ? "admin_user_role_select_user"
                  : "admin_user_disable_select",
                {
                  mode: submenuOption === 3 ? "role" : "disable",
                  lastUsers: selectableUsers.map((user, index) => ({
                    option: index + 1,
                    adminUserId: user.id,
                    phone: user.phone,
                    name: user.name,
                    role: user.role,
                    status: user.status,
                  })),
                },
              ),
            };
          }

        }
      }

      if (previousState.state === "admin_reports_menu") {
        const reportTypeByOption: Record<number, AdminReportType> = {
          1: "summary",
          2: "sales_event",
          3: "sales_section",
          4: "pending_payments",
          5: "expired_cancelled_reservations",
          6: "gate_checkins",
          7: "ticket_usage",
          8: "courtesies",
        };
        const reportType = typeof submenuOption === "number"
          ? reportTypeByOption[submenuOption]
          : undefined;

        if (reportType === "summary") {
          return {
            reply: renderAdminReportPeriodMenu(),
            nextContext: withAdminReportsContext(
              baseContext,
              "admin_report_period_select",
              { reportType },
            ),
          };
        }

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

  if (gateCommand) {
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
      reply: gateCommand.valid
        ? TICKET_MESSAGES.adminReservedNeutral
        : TICKET_MESSAGES.gateAdminInvalidCommand,
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

  const paidTicketResendSelection = await handlePaidTicketResendSelection({
    baseContext,
    phone: customer.whatsapp_phone,
    text,
  });

  if (paidTicketResendSelection) {
    return paidTicketResendSelection;
  }

  if (isTicketResendCommand(text)) {
    return handlePaidTicketResendCommand({
      baseContext,
      phone: customer.whatsapp_phone,
    });
  }

  if (isBuyerBackIntent(text)) {
    const backResult = await handleBuyerBack({
      baseContext,
      customerId: customer.id,
      sourceIdentifier,
    });

    if (backResult) {
      return backResult;
    }
  }

  if (
    isBuyerReservationExitIntent(text) &&
    isPublicHelpFlowState(previousState.state) &&
    (previousState.publicHelp?.returnState === "reservation_created" ||
      previousState.publicHelp?.returnState === "payment_pending") &&
    previousState.reservation?.reservationId &&
    previousState.reservation.orderId
  ) {
    const reservationContextExpired = isReservationContextExpired(
      previousState.reservation,
    );
    const cancelResult = await cancelPendingReservationForCustomer({
      customerId: customer.id,
      reservationId: previousState.reservation.reservationId,
      orderId: previousState.reservation.orderId,
      sourceIdentifier,
    });

    return {
      reply: messageForBuyerReservationCancellation({
        expired: reservationContextExpired,
        cancelResult,
      }),
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

  const publicHelpResult = handlePublicHelpMessage({
    baseContext,
    text,
  });

  if (publicHelpResult) {
    return publicHelpResult;
  }

  if (
    isAllPublicEventsIntent(text) &&
    previousState.state !== "reservation_created" &&
    previousState.state !== "payment_pending"
  ) {
    const events = await listAllPublicEventsByDate();

    if (events.length === 0) {
      return {
        reply: `Não encontrei eventos disponíveis no momento.\n\n${TICKET_MESSAGES.genericHelp}`,
        nextContext: resetBuyerReservationContext(baseContext),
      };
    }

    return {
      reply: formatAllEventsReply(events),
      outboundMessages: buildAllEventsOutboundMessages(events),
      nextContext: {
        ...baseContext,
        step: "showing_events",
        state: "showing_events",
        lastSearch: {
          originalText: text.trim(),
        },
        lastEvents: buildEventOptions(events),
        selectedEvent: undefined,
        selectedSection: undefined,
        selectedSeat: undefined,
        selectedQuantity: undefined,
        cart: undefined,
        eventMoreInfoShown: undefined,
        reservation: undefined,
        payment: undefined,
        lastSections: [],
        lastSeats: [],
      },
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
        sourceIdentifier,
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

    if (
      previousState.reservation.totalAmountCents === 0 &&
      previousState.reservation.totalFeeCents === 0
    ) {
      const issueResult = await issuePublicFreeTicketsForOrder({
        orderId: previousState.reservation.orderId,
        customerId: customer.id,
      });

      if (!issueResult.ok) {
        return {
          reply: formatPublicFreeTicketFailureMessage(issueResult),
          nextContext: resetBuyerReservationContext(baseContext),
        };
      }

      return {
        reply: issueResult.delivery.message,
        outboundMessages: buildPublicFreeTicketOutboundMessages(issueResult),
        nextContext: resetBuyerReservationContext(baseContext),
      };
    }

    const checkoutResult = await createCheckoutForReservation({
      reservationId: previousState.reservation.reservationId,
      orderId: previousState.reservation.orderId,
      customerId: customer.id,
      sourceIdentifier,
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
          cart: undefined,
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
        cart: previousState.cart,
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
          cart: undefined,
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
        sourceIdentifier,
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

    if (
      previousState.reservation.totalAmountCents === 0 &&
      previousState.reservation.totalFeeCents === 0
    ) {
      const issueResult = await issuePublicFreeTicketsForOrder({
        orderId: previousState.reservation.orderId,
        customerId: customer.id,
      });

      if (!issueResult.ok) {
        return {
          reply: formatPublicFreeTicketFailureMessage(issueResult),
          nextContext: resetBuyerReservationContext(baseContext),
        };
      }

      return {
        reply: issueResult.delivery.message,
        outboundMessages: buildPublicFreeTicketOutboundMessages(issueResult),
        nextContext: resetBuyerReservationContext(baseContext),
      };
    }

    const checkoutResult = await createCheckoutForReservation({
      reservationId: previousState.reservation.reservationId,
      orderId: previousState.reservation.orderId,
      customerId: customer.id,
      sourceIdentifier,
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
          cart: undefined,
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
        cart: previousState.cart,
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

  if (previousState.state === "reviewing_cart") {
    const selectedOption = /^\d+$/.test(text.trim()) ? Number(text.trim()) : null;
    const cart = previousState.cart;

    if (!cart?.items.length) {
      if (previousState.selectedEvent) {
        const sectionsResult = await renderBuyerSectionsStep({
          baseContext: { ...baseContext, cart: undefined },
          selectedEvent: previousState.selectedEvent,
        });

        return {
          ...sectionsResult,
          reply: [
            "Não encontrei itens nessa compra. Escolha o ingresso novamente.",
            "",
            sectionsResult.reply,
          ].join("\n"),
        };
      }

      return {
        reply: "Não encontrei itens nessa compra. Escolha o ingresso novamente.",
        nextContext: resetBuyerReservationContext(baseContext),
      };
    }

    const selectedSession = await getValidatedEventSession({
      eventId: cart.eventId,
      sessionId: cart.sessionId,
    });

    if (!selectedSession) {
      return {
        reply: TICKET_MESSAGES.sessionUnavailable,
        nextContext: resetBuyerReservationContext(baseContext),
      };
    }

    const selectedEvent = buildSelectedEvent(selectedSession);

    if (selectedOption === 1) {
      return renderBuyerSectionsStep({
        baseContext,
        selectedEvent,
      });
    }

    if (selectedOption !== 2) {
      return {
        reply: formatCartDecisionReply({ cart }),
        nextContext: {
          ...baseContext,
          step: "reviewing_cart",
          state: "reviewing_cart",
        },
      };
    }

    const reservationResult = await reserveTicketCart({
      customerId: customer.id,
      conversationId: conversation.id,
      eventId: cart.eventId,
      sessionId: cart.sessionId,
      items: cart.items.map((item) => ({
        sectionId: item.sectionId,
        ticketPriceId: item.ticketPriceId,
        quantity: item.quantity,
        priceCents: item.priceCents,
        feeCents: item.feeCents,
        currency: item.currency,
        ...(item.seats?.length
          ? { seatIds: item.seats.map((seat) => seat.seatId) }
          : {}),
      })),
      sourceIdentifier,
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
            cart: undefined,
            selectedEvent: undefined,
            selectedSection: undefined,
            selectedSeat: undefined,
            selectedQuantity: undefined,
            lastSeats: [],
          },
        };
      }

      if (reservationResult.reason === "buyer_risk_limited") {
        return {
          reply: messageForReservationFailure(reservationResult),
          nextContext: {
            ...baseContext,
            step: "reviewing_cart",
            state: "reviewing_cart",
          },
        };
      }

      const sectionsResult = await renderBuyerSectionsStep({
        baseContext: { ...baseContext, cart: undefined },
        selectedEvent,
      });

      return {
        ...sectionsResult,
        reply: [
          "O estoque mudou antes da finalização e a reserva não foi criada. Selecione os ingressos novamente.",
          "",
          sectionsResult.reply,
        ].join("\n"),
      };
    }

    if (
      reservationResult.reservation.totalAmountCents === 0 &&
      reservationResult.reservation.totalFeeCents === 0
    ) {
      const issueResult = await issuePublicFreeTicketsForOrder({
        orderId: reservationResult.reservation.orderId,
        customerId: customer.id,
      });

      if (!issueResult.ok) {
        return {
          reply: formatPublicFreeTicketFailureMessage(issueResult),
          nextContext: resetBuyerReservationContext(baseContext),
        };
      }

      return {
        reply: issueResult.delivery.message,
        outboundMessages: buildPublicFreeTicketOutboundMessages(issueResult),
        nextContext: resetBuyerReservationContext(baseContext),
      };
    }

    return {
      reply: formatReservationReply({
        selectedEvent,
        selectedSection: previousState.selectedSection,
        selectedSeat: previousState.selectedSeat,
        reservation: reservationResult.reservation,
        cart,
      }),
      nextContext: {
        ...baseContext,
        step: "reservation_created",
        state: "reservation_created",
        selectedEvent,
        selectedQuantity: getCartQuantity(cart),
        cart,
        reservation: buildReservationContext(reservationResult.reservation),
        lastSeats: [],
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

    const maxTicketsPerOrder = getMaxTicketsPerOrder(
      previousState.selectedSection.selectedTicketType,
    );

    if (quantity > maxTicketsPerOrder) {
      return {
        reply: isPublicFreeTicketType(previousState.selectedSection.selectedTicketType)
          ? "*QUANTIDADE INVALIDA*\nPara ingresso gratuito, o número máximo de ingressos por pedido são 4. Digite novamente o número de 1 a 4."
          : "Para esta compra, escolha até 10 ingressos por vez. Envie uma quantidade menor.",
        nextContext: {
          ...baseContext,
          step: "selecting_quantity",
          state: "selecting_quantity",
        },
      };
    }

    const nextCartQuantity = getCartQuantity(previousState.cart) + quantity;
    const nextFreeQuantity =
      getCartFreeQuantity(previousState.cart) +
      (isPublicFreeTicketType(previousState.selectedSection.selectedTicketType)
        ? quantity
        : 0);

    if (nextCartQuantity > 10 || nextFreeQuantity > 4) {
      return {
        reply:
          nextFreeQuantity > 4
            ? "Para ingresso gratuito, o máximo são 4 ingressos por pedido. Escolha uma quantidade menor."
            : "A compra pode ter no máximo 10 ingressos no total. Escolha uma quantidade menor.",
        nextContext: {
          ...baseContext,
          step: "selecting_quantity",
          state: "selecting_quantity",
        },
      };
    }

    const sectionQuantityInCart = getCartSectionQuantity(
      previousState.cart,
      previousState.selectedSection.sectionId,
    );

    if (
      !previousState.selectedSection.hasUnlimitedCapacity &&
      sectionQuantityInCart + quantity >
        previousState.selectedSection.availableSeatsCount
    ) {
      return {
        reply: TICKET_MESSAGES.noSeatsAvailable,
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
      const cartSeatIds = getCartSeatIds(previousState.cart);
      const selectableSeatMap: SeatMap = {
        ...seatMap,
        seats: seatMap.seats.map((seat) =>
          cartSeatIds.has(seat.seatId)
            ? { ...seat, status: "selected_in_cart", isAvailable: false }
            : seat,
        ),
        availableSeats: seatMap.availableSeats.filter(
          (seat) => !cartSeatIds.has(seat.seatId),
        ),
        totalAvailableCount: seatMap.availableSeats.filter(
          (seat) => !cartSeatIds.has(seat.seatId),
        ).length,
      };

      if (selectableSeatMap.availableSeats.length < quantity) {
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
        seatMap: selectableSeatMap,
        ticketType: previousState.selectedSection.selectedTicketType,
        quantity,
      });

      return {
        reply: seatsReply,
        outboundMessages: [
          {
            type: "image",
            imageUrl: buildSeatMapPngDataUrl({
              seatMap: selectableSeatMap,
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
          lastSeats: buildSeatOptions(selectableSeatMap.availableSeats),
        },
      };
    }

    const cart = addSelectionToCart({
      cart: previousState.cart,
      selectedEvent: previousState.selectedEvent,
      selectedSection: previousState.selectedSection,
      quantity,
    });

    if (!cart) {
      return {
        reply: "Não consegui adicionar esse ingresso à compra. Escolha o setor novamente.",
        nextContext: {
          ...baseContext,
          step: "showing_sections",
          state: "showing_sections",
          selectedSection: undefined,
          selectedQuantity: undefined,
        },
      };
    }

    return {
      reply: formatCartDecisionReply({ cart }),
      nextContext: {
        ...baseContext,
        step: "reviewing_cart",
        state: "reviewing_cart",
        selectedSeat: undefined,
        selectedQuantity: quantity,
        cart,
        reservation: undefined,
        payment: undefined,
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

    const selectedSeatContexts = selectedSeats.map(buildSelectedSeatContext);
    const cart = addSelectionToCart({
      cart: previousState.cart,
      selectedEvent: previousState.selectedEvent,
      selectedSection: previousState.selectedSection,
      quantity,
      seats: selectedSeatContexts,
    });

    if (!cart) {
      return {
        reply: "Não consegui adicionar esses assentos à compra. Escolha novamente.",
        nextContext: {
          ...baseContext,
          step: "showing_seats",
          state: "showing_seats",
          selectedSeat: undefined,
        },
      };
    }

    return {
      reply: formatCartDecisionReply({ cart }),
      nextContext: {
        ...baseContext,
        step: "reviewing_cart",
        state: "reviewing_cart",
        selectedSeat:
          selectedSeatContexts.length === 1 ? selectedSeatContexts[0] : undefined,
        selectedQuantity: quantity,
        cart,
        reservation: undefined,
        payment: undefined,
        lastSeats: [],
      },
    };
  }

  if (
    parsedSearch.numericSelection &&
    previousState.state === "showing_events" &&
    isAllPublicEventsContext(previousState) &&
    previousState.eventMoreInfoShown
  ) {
    if (parsedSearch.numericSelection === 2) {
      return {
        reply: formatAllEventsReply(previousState.lastEvents ?? []),
        outboundMessages: buildAllEventsOutboundMessages(
          previousState.lastEvents ?? [],
        ),
        nextContext: {
          ...baseContext,
          step: "showing_events",
          state: "showing_events",
          selectedEvent: undefined,
          eventMoreInfoShown: undefined,
        },
      };
    }

    if (parsedSearch.numericSelection === 3) {
      return {
        reply: TICKET_MESSAGES.genericHelp,
        nextContext: resetBuyerReservationContext(baseContext),
      };
    }

    if (parsedSearch.numericSelection === 1 && previousState.selectedEvent) {
      const selectedSession = await getValidatedEventSession({
        eventId: previousState.selectedEvent.eventId,
        sessionId: previousState.selectedEvent.sessionId,
      });

      if (!selectedSession) {
        return {
          reply: TICKET_MESSAGES.eventOptionUnavailable,
          nextContext: resetBuyerReservationContext(baseContext),
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
            eventMoreInfoShown: undefined,
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
          selectedSection: undefined,
          selectedSeat: undefined,
          selectedQuantity: undefined,
          eventMoreInfoShown: undefined,
          lastSections: buildSectionOptions(sections),
          lastSeats: [],
        },
      };
    }

    return {
      reply: TICKET_MESSAGES.numericInvalidOption,
      nextContext: baseContext,
    };
  }

  if (
    parsedSearch.numericSelection &&
    previousState.state === "showing_events" &&
    isAllPublicEventsContext(previousState) &&
    previousState.lastEvents?.length
  ) {
    const selectedOption = parsedSearch.numericSelection;
    const selectedIndex = Math.floor((selectedOption - 1) / 2);
    const selectedContextEvent = previousState.lastEvents[selectedIndex];
    const isMoreInfoOption = selectedOption % 2 === 0;

    if (!selectedContextEvent || selectedOption < 1) {
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
        nextContext: resetBuyerReservationContext(baseContext),
      };
    }

    const selectedEvent = buildSelectedEvent(selectedSession);

    if (isMoreInfoOption) {
      return {
        reply: formatSingleEventMoreInfo(selectedEvent),
        outboundMessages: buildEventMoreInfoOutboundMessages(selectedEvent),
        nextContext: {
          ...baseContext,
          step: "showing_events",
          state: "showing_events",
          selectedEvent,
          eventMoreInfoShown: true,
        },
      };
    }

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
          eventMoreInfoShown: undefined,
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
        eventMoreInfoShown: undefined,
      },
    };
  }

  if (
    parsedSearch.numericSelection &&
    previousState.state === "showing_events" &&
    !isAllPublicEventsContext(previousState) &&
    previousState.eventMoreInfoShown &&
    previousState.selectedEvent
  ) {
    if (parsedSearch.numericSelection === 2) {
      return {
        reply: formatEventOptionsReply(previousState.lastEvents ?? []),
        outboundMessages: buildEventOptionOutboundMessages(
          previousState.lastEvents ?? [],
        ),
        nextContext: {
          ...baseContext,
          step: "showing_events",
          state: "showing_events",
          selectedEvent: undefined,
          eventMoreInfoShown: undefined,
        },
      };
    }

    if (parsedSearch.numericSelection === 1) {
      const selectedSession = await getValidatedEventSession({
        eventId: previousState.selectedEvent.eventId,
        sessionId: previousState.selectedEvent.sessionId,
      });

      if (!selectedSession) {
        return {
          reply: TICKET_MESSAGES.eventOptionUnavailable,
          nextContext: resetBuyerReservationContext(baseContext),
        };
      }

      const selectedEvent = buildSelectedEvent(selectedSession);
      const sections = await listAvailableSections(selectedSession.sessionId, {
        venueId: selectedSession.venueId,
      });

      if (sections.length === 0) {
        return {
          reply: TICKET_MESSAGES.noSectionsAvailable,
          nextContext: resetBuyerReservationContext(baseContext),
        };
      }

      return {
        reply: formatSectionsReply({ sections }),
        nextContext: {
          ...baseContext,
          step: "showing_sections",
          state: "showing_sections",
          selectedEvent,
          selectedSection: undefined,
          selectedSeat: undefined,
          selectedQuantity: undefined,
          eventMoreInfoShown: undefined,
          lastSections: buildSectionOptions(sections),
          lastSeats: [],
        },
      };
    }

    return {
      reply: TICKET_MESSAGES.numericInvalidOption,
      nextContext: baseContext,
    };
  }

  if (
    parsedSearch.numericSelection &&
    previousState.state === "showing_events" &&
    !isAllPublicEventsContext(previousState) &&
    previousState.lastEvents &&
    previousState.lastEvents.length > 1
  ) {
    const selectedOption = parsedSearch.numericSelection;
    const selectedIndex = Math.floor((selectedOption - 1) / 2);
    const selectedContextEvent = previousState.lastEvents[selectedIndex];
    const isMoreInfoOption = selectedOption % 2 === 0;

    if (!selectedContextEvent || selectedOption < 1) {
      return {
        reply: TICKET_MESSAGES.numericInvalidOption,
        nextContext: baseContext,
      };
    }

    const selectedSession = await getValidatedEventSession({
      eventId: selectedContextEvent.eventId,
      sessionId: selectedContextEvent.sessionId,
    });

    if (!selectedSession) {
      return {
        reply: TICKET_MESSAGES.eventOptionUnavailable,
        nextContext: resetBuyerReservationContext(baseContext),
      };
    }

    const selectedEvent = buildSelectedEvent(selectedSession);

    if (isMoreInfoOption) {
      return {
        reply: formatSingleEventMoreInfo(selectedEvent),
        outboundMessages: buildEventMoreInfoOutboundMessages(selectedEvent),
        nextContext: {
          ...baseContext,
          step: "showing_events",
          state: "showing_events",
          selectedEvent,
          eventMoreInfoShown: true,
        },
      };
    }

    const sections = await listAvailableSections(selectedSession.sessionId, {
      venueId: selectedSession.venueId,
    });

    if (sections.length === 0) {
      return {
        reply: TICKET_MESSAGES.noSectionsAvailable,
        nextContext: resetBuyerReservationContext(baseContext),
      };
    }

    return {
      reply: formatSectionsReply({ sections }),
      nextContext: {
        ...baseContext,
        step: "showing_sections",
        state: "showing_sections",
        selectedEvent,
        selectedSection: undefined,
        selectedSeat: undefined,
        selectedQuantity: undefined,
        cart: undefined,
        eventMoreInfoShown: undefined,
        lastSections: buildSectionOptions(sections),
        lastSeats: [],
      },
    };
  }

  if (
    parsedSearch.numericSelection &&
    previousState.state === "showing_events" &&
    previousState.lastEvents?.length === 1 &&
    (
      parsedSearch.numericSelection === 2 ||
      parsedSearch.numericSelection === 3
    )
  ) {
    if (!previousState.eventMoreInfoShown && parsedSearch.numericSelection === 2) {
      const contextEvent = previousState.lastEvents[0];
      const validatedSession = await getValidatedEventSession({
        eventId: contextEvent.eventId,
        sessionId: contextEvent.sessionId,
      });
      const eventMoreInfo = validatedSession
        ? buildSelectedEvent(validatedSession)
        : contextEvent;

      return {
        reply: formatSingleEventMoreInfo(eventMoreInfo),
        outboundMessages: buildEventMoreInfoOutboundMessages(eventMoreInfo),
        nextContext: {
          ...baseContext,
          step: "showing_events",
          state: "showing_events",
          eventMoreInfoShown: true,
        },
      };
    }

    if (previousState.eventMoreInfoShown && parsedSearch.numericSelection === 2) {
      return {
        reply: formatEventOptionsReply(previousState.lastEvents),
        outboundMessages: buildEventOptionOutboundMessages(previousState.lastEvents),
        nextContext: {
          ...baseContext,
          step: "showing_events",
          state: "showing_events",
          selectedEvent: undefined,
          eventMoreInfoShown: undefined,
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
        eventMoreInfoShown: undefined,
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
          eventMoreInfoShown: undefined,
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
        eventMoreInfoShown: undefined,
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
      eventMoreInfoShown: undefined,
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
        cart: undefined,
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
      cart: undefined,
      eventMoreInfoShown: undefined,
    },
  };
}
