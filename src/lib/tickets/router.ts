import "server-only";

import { getEnv } from "@/lib/env";
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
  type AdminPendingReservationLookup,
  type AdminTicketLookup,
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
  renewAdminPassphrase,
  resolveBlockedAdminAuthPhone,
  resolveAdminUserId,
  unlockAdminAuthForPhone,
  updateAdminRole,
  type AdminAuthBlockedListItem,
  type AdminUserListItem,
} from "@/lib/tickets/services/adminUsers";
import {
  buildKitchenUrl,
  buildOfferReaderUrl,
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
  buildAdminDivisionReport,
  buildAdminReport,
  buildAdminGeneralReport,
  markDivisionSettlementPaid,
  type AdminReportPeriod,
  type AdminReportType,
} from "@/lib/tickets/services/adminReports";
import {
  buildComboOfferListText,
  createComboOffer,
  duplicateComboOffer,
  listComboOffers,
  updateComboOfferDetails,
  updateComboOfferStatus,
  type ComboOfferScopeInput,
  type ComboOfferTimingType,
} from "@/lib/tickets/services/comboOffers";
import {
  ADMIN_LOGIN_LINK_REDACTED_BODY,
  consumeAdminLoginChallengeCode,
  createAdminEventEditorDirectLink,
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
  "olÃƒÂ¡",
  "bom dia",
  "boa tarde",
  "boa noite",
  "ajuda",
  "menu",
  "inicio",
  "inÃƒÂ­cio",
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
const GATE_COMMAND_PATTERN =
  /^(?:sistema\s+)?(portaria|cozinha)(?:\s+(.+))?$/i;
const ADMIN_MAIN_EXIT_OPTION = 9;
const ADMIN_MENU_UNAVAILABLE_MESSAGE =
  "Essa opÃƒÂ§ÃƒÂ£o nÃƒÂ£o estÃƒÂ¡ disponÃƒÂ­vel para o seu nÃƒÂ­vel de acesso.";
const ADMIN_CONSTRUCTION_MESSAGE = "Essa funÃƒÂ§ÃƒÂ£o serÃƒÂ¡ ativada em breve.";
const WEEKDAY_OFFSETS: Record<string, number> = {
  domingo: 0,
  segunda: 1,
  "segunda-feira": 1,
  "terÃƒÂ§a": 2,
  terca: 2,
  "terÃƒÂ§a-feira": 2,
  "terca-feira": 2,
  quarta: 3,
  "quarta-feira": 3,
  quinta: 4,
  "quinta-feira": 4,
  sexta: 5,
  "sexta-feira": 5,
  "sÃƒÂ¡bado": 6,
  sabado: 6,
};
const MONTHS: Record<string, number> = {
  janeiro: 0,
  fevereiro: 1,
  "marÃƒÂ§o": 2,
  marco: 2,
  abril: 3,
  maio: 4,
  junho: 5,
  julho: 6,
  agosto: 7,
  setembro: 8,
  outubro: 9,
  ooutubro: 9,
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

export type RouteTicketMessageOutput = {
  reply: string;
  suppressTitle?: boolean;
  outboundMessages?: Array<
    | {
        type: "text";
        body: string;
        phone?: string;
        persistedBody?: string;
        delayMs?: number;
        suppressTitle?: boolean;
      }
    | {
        type: "image";
        imageUrl: string;
        caption: string;
        phone?: string;
        persistedBody?: string;
        delayMs?: number;
        suppressTitle?: boolean;
      }
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
  const match = text.match(
    /\b(\d{1,2})\/(\d{1,2})(?:(?:\/(\d{2,4}))|(\d{4}))?\b/,
  );

  if (!match) {
    return null;
  }

  const today = getSaoPauloDateParts(now);
  const day = Number(match[1]);
  const month = Number(match[2]);
  const yearText = match[3] ?? match[4];
  const parsedYear = yearText
    ? Number(yearText.length === 2 ? `20${yearText}` : yearText)
    : today.year;

  if (day < 1 || day > 31 || month < 1 || month > 12) {
    return null;
  }

  if (!isValidCalendarDate(parsedYear, month, day)) {
    return null;
  }

  const range = buildDayRange({ year: parsedYear, month, day });

  if (!yearText && range.dateTo < now.toISOString()) {
    return buildDayRange({ year: parsedYear + 1, month, day });
  }

  return range;
}

function parseEventTime(text: string) {
  const match = text.match(
    /\b([01]?\d|2[0-3])(?::([0-5]\d)|h(?:rs?)?(?:\s*([0-5]\d))?)\b/i,
  );

  if (!match) {
    return undefined;
  }

  return Number(match[1]) * 60 + Number(match[2] ?? match[3] ?? "0");
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

  if (/\bamanhÃƒÂ£\b|\bamanha\b/.test(normalized)) {
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
    /\b(?:em|na|no)\s+([\p{L}][\p{L}\s-]{1,40})(?=\s+(?:hoje|amanh[aã]|s[áa]bado|domingo|segunda|ter[cç]a|quarta|quinta|sexta|fim|janeiro|fevereiro|mar[cç]o|abril|maio|junho|julho|agosto|setembro|outubro|novembro|dezembro|\d{1,2}\/\d{1,2})|$)/iu,
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
    /^(hoje|amanh[ÃƒÂ£a]|fim de semana|este fim de semana)$/.test(normalizedCity)
  ) {
    return undefined;
  }

  return city;
}

function stripSearchNoise(text: string) {
  const monthAlternation = Object.keys(MONTHS).join("|");
  const cleaned = text
    .replace(/\b(?:em|na|no)\s+[\p{L}][\p{L}\s-]{1,40}$/iu, "")
    .replace(/\b\d{1,2}\/\d{1,2}(?:\/\d{2,4})?\b/g, " ")
    .replace(/\b\d{1,2}\/\d{1,2}\d{4}\b/g, " ")
    .replace(
      new RegExp(`\\b\\d{1,2}(?:\\s+de)?\\s+(?:${monthAlternation})(?:\\s+de\\s+\\d{2,4})?\\b`, "gi"),
      " ",
    )
    .replace(
      /\b(hoje|amanh[ÃƒÂ£a]|s[ÃƒÂ¡a]bado|domingo|segunda(?:-feira)?|ter[cÃƒÂ§]a(?:-feira)?|quarta(?:-feira)?|quinta(?:-feira)?|sexta(?:-feira)?|fim de semana|este fim de semana|janeiro|fevereiro|mar[cÃƒÂ§]o|abril|maio|junho|julho|agosto|setembro|outubro|novembro|dezembro)\b/gi,
      " ",
    )
    .replace(/\booutubro\b/gi, " ")
    .replace(/\b(?:[01]?\d|2[0-3])(?::[0-5]\d|h(?:rs?)?(?:\s*[0-5]\d)?)\b/gi, " ");
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
  const timeMinutes = parseEventTime(originalText);
  const artist = stripSearchNoise(originalText);

  if (!artist && !city && !dateFrom && !dateTo && timeMinutes === undefined) {
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
    ...(timeMinutes !== undefined ? { timeMinutes } : {}),
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
    .replace(",", " ÃƒÂ s");
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
    .replace(",", " ÃƒÂ s");
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
  "1Ã‚Âª fileira (com balcÃƒÂ£o) - cadeira individual":
    "1Ã‚Âª FILEIRA (com balcÃƒÂ£o) - cadeira Individual",
  "poltrona+mesa 2 lugares (1 deste vale para 2)":
    "Poltrona+Mesa 2 lugares (1 deste vale para 2)",
  "poltrona+mesa 4 lugares (1 deste vale para 4)":
    "Poltrona+Mesa 4 lugares (1 deste vale para 4)",
  "cadeira individual (inteira)": "Cadeira Individual (Inteira)",
  "crianÃƒÂ§as e adolescentes (2 a 18 anos)":
    "CrianÃƒÂ§as e adolescentes (2 a 18 anos)",
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

  return ["cadeira", "1Ã‚Âª fileira", "mesa", "mesas"].includes(normalized);
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

function normalizeDisplayComparison(value: string) {
  return value
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim()
    .toLocaleUpperCase("pt-BR");
}

function formatPublicEventTitle(title: string, artistName: string | null | undefined) {
  const trimmedTitle = title.trim();
  const trimmedArtist = artistName?.trim();

  if (!trimmedTitle) return formatAnnouncementTitle(trimmedArtist ?? "");
  if (!trimmedArtist) return formatAnnouncementTitle(trimmedTitle);

  const normalizedTitle = normalizeDisplayComparison(trimmedTitle);
  const normalizedArtist = normalizeDisplayComparison(trimmedArtist);

  if (normalizedTitle === normalizedArtist) {
    return formatAnnouncementTitle(trimmedArtist);
  }

  const escapedArtist = trimmedArtist
    .replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
    .replace(/\s+/g, "\\s+");
  const artistPrefix = new RegExp(
    `^${escapedArtist}\\s*(?:(?:-|:)\\s*|(?:em|apresenta)\\s+)`,
    "iu",
  );
  const showTitle = trimmedTitle.replace(artistPrefix, "").trim();

  return formatAnnouncementTitle(`${trimmedArtist} - ${showTitle || trimmedTitle}`);
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
  const title = formatPublicEventTitle(event.title, event.artistName);
  const details = [
    `| Cidade: ${formatCityState(event.city, event.state)}`,
    `| Data: ${formatEventDate(event.startsAt)}`,
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
  const title = formatPublicEventTitle(event.title, event.artistName);
  const details = [
    `| Cidade: ${formatCityState(event.city, event.state)}`,
    `| Data: ${formatEventDate(event.startsAt)}`,
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
    `🎟️ - *${formatPublicEventTitle(event.title, event.artistName)}*`,
    `| Cidade: ${formatCityState(event.city, event.state)}`,
    `| Data: ${formatEventDate(event.startsAt)}`,
    "",
    formatOptionLine(buyOption, "comprar"),
    formatOptionLine(moreInfoOption, "ver mais"),
  ].join("\n");
}

function buildEventSearchOutboundMessages(events: TicketEventSearchResult[]) {
  return events.map((event, index) => {
    const caption = formatSingleEventReply(event, index, events.length);

    return event.imageUrl
      ? ({ type: "image", imageUrl: event.imageUrl, caption, suppressTitle: true } as const)
      : ({ type: "text", body: caption, suppressTitle: true } as const);
  });
}

function buildEventOptionOutboundMessages(events: TicketConversationEventOption[]) {
  return events.map((event, index) => {
    const caption = formatSingleEventOptionReply(event, index, events.length);

    return event.imageUrl
      ? ({ type: "image", imageUrl: event.imageUrl, caption, suppressTitle: true } as const)
      : ({ type: "text", body: caption, suppressTitle: true } as const);
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
    `🎟️ - *${formatPublicEventTitle(event.title, event.artistName)}*`,
    `| Cidade: ${formatCityState(event.city, event.state)}`,
    `| Data: ${formatEventDate(event.startsAt)}`,
    ...(event.venueName ? [`> Ã°Å¸ÂÅ¸Ã¯Â¸Â Local: ${formatProperName(event.venueName)}`] : []),
    "",
    "*INFORMAÃƒâ€¡Ãƒâ€¢ES DO EVENTO*",
    description || "Nenhuma informaÃƒÂ§ÃƒÂ£o adicional cadastrada para este evento.",
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
const ALL_EVENTS_CONTINUATION_DELAY_MS = 1_200;

function buildAllEventsOutboundMessages(
  events: Array<TicketEventSearchResult | TicketConversationEventOption>,
) {
  const messages: Array<{
    type: "text";
    body: string;
    suppressTitle: true;
    delayMs?: number;
  }> = [];
  let current = "Encontrei estes eventos:";
  const pushCurrentMessage = () => {
    messages.push({
      type: "text",
      body: current,
      suppressTitle: true,
      ...(messages.length > 0
        ? { delayMs: ALL_EVENTS_CONTINUATION_DELAY_MS }
        : {}),
    });
  };

  events.forEach((event, index) => {
    const block = formatSingleAllEventReply(event, index);
    const candidate = `${current}\n\n${block}`;

    if (candidate.length <= ALL_EVENTS_MESSAGE_MAX_LENGTH) {
      current = candidate;
      return;
    }

    pushCurrentMessage();
    current = `*EVENTOS Ã¢â‚¬â€ CONTINUAÃƒâ€¡ÃƒÆ’O*\n\n${block}`;
  });

  if (current) {
    pushCurrentMessage();
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
      return `> ${line}`;
    }),
  );

  return [
    "*ESCOLHA SEU INGRESSO/SETOR*",
    sectionLines.join("\n---\n"),
    "",
    "Responda com o número do setor para continuar.",
    "Digite *CANCELAR* para zerar o pedido de compra.",
    'Digite "VOLTAR" para voltar à seção anterior.',
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
    `> Valor: ${selectedPrice}`,
    "",
    isFree
      ? "Digite o número de ingressos gratuitos, até 4 por pedido. Ex: 2"
      : "Digite o número de ingressos para compra, ex: 2",
    "Digite *CANCELAR* para zerar o pedido de compra.",
    'Digite "VOLTAR" para voltar à seção anterior.',
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
    "*ITEM ADICIONADO Ãƒâ‚¬ COMPRA*",
    "",
    "*ITENS NA COMPRA*",
    ...cartItemLines,
    "",
    `> Total da compra: ${formatPriceWithOptionalFee(totalAmountCents, totalFeeCents)}`,
    "",
    "Digite 1 para *para finalizar a compra do seu ingresso*",
    "Digite 2 para *comprar outros/mais ingressos*",
    "Digite *CANCELAR* para zerar o pedido de compra.",
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
      ? `Responda com os ${quantity} cÃƒÂ³digos dos assentos desejados.`
      : "Responda com o cÃƒÂ³digo do assento desejado.",
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
    suppressTitle: true,
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
            "NÃƒÂ£o encontrei outros tÃƒÂ³picos para essa pesquisa. Digite outras duas palavras para uma nova busca de ajuda ou *VOLTAR* para voltar onde estava.",
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
  authChallengePurpose,
}: {
  adminUserId?: string;
  role?: AdminRole;
  sessionId?: string;
  expiresAt?: string;
  authChallengeId?: string;
  authChallengeExpiresAt?: string;
  authChallengePurpose?: "admin_menu" | "event_editor";
}) {
  return {
    ...(adminUserId ? { adminUserId } : {}),
    ...(role ? { role } : {}),
    ...(sessionId ? { sessionId } : {}),
    ...(expiresAt ? { expiresAt } : {}),
    ...(authChallengeId ? { authChallengeId } : {}),
    ...(authChallengeExpiresAt ? { authChallengeExpiresAt } : {}),
    ...(authChallengePurpose ? { authChallengePurpose } : {}),
  };
}

type AdminSubmenuState =
  | "admin_events_menu"
  | "admin_orders_menu"
  | "admin_courtesies_menu"
  | "admin_offers_menu"
  | "admin_gate_menu"
  | "admin_kitchen_menu"
  | "admin_users_menu"
  | "admin_reports_menu";

type AdminReportFlowState =
  | "admin_report_event_select"
  | "admin_report_period_select"
  | "admin_report_custom_period_collecting"
  | "admin_report_division_settlement_confirm";

type AdminSubmenuConfig = {
  title: string;
  state: AdminSubmenuState;
  mainOption: number;
  permission: AdminPermission;
  backOption: number;
  exitOption: number;
  options: string[];
  optionDescriptions?: string[];
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
      "Buscar ingresso por cÃƒÂ³digo",
      "Cancelar reserva pendente",
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
  admin_offers_menu: {
    title: "Ofertas e combos",
    state: "admin_offers_menu",
    mainOption: 6,
    permission: "manage_offers",
    backOption: 6,
    exitOption: 7,
    options: [
      "Adicionar oferta",
      "Ver ofertas ativas",
      "Editar oferta",
      "Pausar oferta",
      "Excluir oferta",
      "Duplicar oferta",
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
      "Gerar links de leitura neste telefone",
      "Definir outro telefone para leitura",
      "Ver todos os acessos",
      "Revogar acessos",
    ],
  },
  admin_kitchen_menu: {
    title: "Cozinha",
    state: "admin_kitchen_menu",
    mainOption: 5,
    permission: "manage_gate",
    backOption: 5,
    exitOption: 6,
    options: [
      "Gerar links de leitura neste telefone",
      "Definir outro telefone para leitura",
      "Ver todos os acessos",
      "Revogar acessos",
    ],
  },
  admin_users_menu: {
    title: "Administradores",
    state: "admin_users_menu",
    mainOption: 7,
    permission: "manage_admins",
    backOption: 7,
    exitOption: 8,
    options: [
      "Listar administradores",
      "Adicionar administrador",
      "Alterar nÃƒÂ­vel de administrador",
      "Desativar administrador",
      "Liberar administrador bloqueado",
      "Renovar palavra-chave",
    ],
  },
  admin_reports_menu: {
    title: "RelatÃƒÂ³rios",
    state: "admin_reports_menu",
    mainOption: 8,
    permission: "view_reports",
    backOption: 10,
    exitOption: 11,
    options: [
      "Resumo geral",
      "Vendas por evento",
      "Vendas por setor",
      "Pagamentos pendentes",
      "Reservas expiradas/canceladas",
      "Check-ins da portaria",
      "Ingressos usados e nÃƒÂ£o usados",
      "Cortesias",
      "DivisÃƒÂ£o",
    ],
  },
};

function renderAdminSubmenu(config: AdminSubmenuConfig) {
  return [
    `*${config.title.toUpperCase()}*`,
    "",
    ...config.options.flatMap((label, index) => [
      formatOptionLine(index + 1, label),
      ...(config.optionDescriptions?.[index]
        ? [`> ${config.optionDescriptions[index]}`]
        : []),
    ]),
    ...(config.state === "admin_kitchen_menu"
      ? [
          "",
          "*Atalho do sistema da cozinha:*",
          "Digite SISTEMA COZINHA para informar a palavra-passe e receber o link de acesso.",
        ]
      : []),
    "",
    "Responda com o nÃƒÂºmero da opÃƒÂ§ÃƒÂ£o.",
    'Digite "Voltar" para voltar, "Cancelar" para abandonar esta tela ou "Sair" para sair da ÃƒÂ¡rea de admin.',
  ].join("\n");
}

function renderAdminEventsMenu() {
  return renderAdminSubmenu(ADMIN_SUBMENUS.admin_events_menu);
}

function renderAdminBrowserEventEditorReply(loginUrl: string, expiresInMinutes: number) {
  return [
    "*EDITAR EVENTOS NO NAVEGADOR*",
    "",
    "Abra o link abaixo para acessar direto a pagina de edicao:",
    loginUrl,
    "",
    `> Link vÃƒÂ¡lido por ${expiresInMinutes} minutos.`,
    "> Link de uso unico, criado a partir da sua sessao admin no WhatsApp.",
  ].join("\n");
}

function buildAdminBrowserEventEditorReply(loginUrl: string, expiresInMinutes: number) {
  const reply = renderAdminBrowserEventEditorReply(loginUrl, expiresInMinutes);

  return {
    reply,
    outboundMessages: [
      {
        type: "text" as const,
        body: reply,
        persistedBody: ADMIN_LOGIN_LINK_REDACTED_BODY,
      },
    ],
  };
}

function renderAdminBrowserEventEditorUnlockedReply() {
  const editorUrl = `${getEnv().APP_BASE_URL.replace(/\/$/, "")}/admin/eventos`;

  return [
    "*EDITAR EVENTOS NO NAVEGADOR*",
    "",
    "Editor liberado.",
    "No navegador em que voce informou a senha, toque em \"Abrir editor de eventos\".",
    "",
    `Link direto: ${editorUrl}`,
    "",
    "> O acesso continua protegido por sessao segura e validacao no servidor.",
  ].join("\n");
}

function renderAdminEventListFilterMenu() {
  return [
    "*LISTAR MEUS EVENTOS*",
    "",
    formatOptionLine(1, "eventos ativos"),
    formatOptionLine(2, "eventos pausados"),
    formatOptionLine(3, "eventos cancelados"),
    formatOptionLine(4, "todos os eventos"),
    "",
    "Responda com o nÃƒÂºmero da opÃƒÂ§ÃƒÂ£o.",
    'Digite "Voltar" para voltar, "Cancelar" para abandonar esta tela ou "Sair" para sair da ÃƒÂ¡rea de admin.',
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
    2: ["editar eventos no navegador", "navegador", "editor", "editar eventos"],
    3: ["cortesia", "cortesias"],
    4: ["portaria", "check-in", "checkin"],
    5: ["cozinha", "bar"],
    6: ["oferta", "ofertas", "combo", "combos", "ofertas e combos"],
    7: ["administrador", "administradores", "admins"],
    8: ["relatorio", "relatorios"],
    9: ["sair", "logout", "encerrar"],
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

function isKitchenAdminGateMode(
  mode: NonNullable<TicketConversationState["adminGate"]>["mode"] | undefined,
) {
  return Boolean(mode?.startsWith("kitchen_"));
}

type AdminEventShortcutAction =
  | "event_details"
  | "event_edit"
  | "event_status"
  | "event_duplicate"
  | "event_sessions"
  | "event_sections"
  | "event_prices"
  | "increase_tickets"
  | "create_section"
  | "create_special_sale"
  | "event_summary"
  | "section_sales"
  | "pending_payments"
  | "expired_reservations"
  | "gate_checkins"
  | "ticket_usage"
  | "courtesy_report"
  | "list_courtesies"
  | "add_courtesy"
  | "resend_courtesy"
  | "cancel_courtesy"
  | "edit_title"
  | "edit_artist"
  | "edit_city"
  | "edit_state"
  | "edit_venue"
  | "edit_image"
  | "edit_datetime"
  | "edit_description"
  | "gate_menu"
  | "gate_self_checkin"
  | "gate_register"
  | "gate_accesses"
  | "gate_revoke";

const ADMIN_EVENT_SHORTCUT_ALIASES: Array<[
  AdminEventShortcutAction,
  string,
  string[],
]> = [
  ["event_details", "evento", ["evento", "eventos", "meus eventos", "ver evento", "detalhes do evento", "consultar evento"]],
  ["event_edit", "editar evento", ["editar evento", "alterar evento"]],
  ["event_status", "ativar/pausar evento", ["ativar evento", "pausar evento", "ativar pausar evento", "status do evento", "alterar status do evento"]],
  ["event_duplicate", "duplicar evento", ["duplicar evento", "copiar evento"]],
  ["event_sessions", "datas do evento", ["datas do evento", "sessoes do evento", "editar sessoes", "gerenciar sessoes"]],
  ["event_sections", "setores e assentos", ["setores e assentos", "setores do evento", "editar setores", "editar lugares", "editar carga", "carga de ingressos"]],
  ["event_prices", "editar valores", ["editar valores", "valores do evento", "editar precos", "precos do evento"]],
  ["increase_tickets", "aumentar ingressos", ["aumentar ingresso", "aumentar ingressos", "aumentar carga", "aumentar capacidade", "alterar carga do setor"]],
  ["create_section", "criar setor", ["criar setor", "adicionar setor", "novo setor"]],
  ["create_special_sale", "criar venda especial", ["criar venda especial", "adicionar venda especial", "novo tipo de venda", "criar oferta especial", "adicionar oferta especial"]],
  [
    "event_summary",
    "resumo geral",
    [
      "resumo geral",
      "resumo",
      "relatorio",
      "relatorios",
      "relatorio do evento",
      "ingressos",
      "ingressos e pedidos",
      "ingressos vendidos",
      "vendas do evento",
      "vendas por evento",
    ],
  ],
  ["section_sales", "vendas por setor", ["vendas por setor", "relatorio por setor"]],
  ["pending_payments", "pagamentos pendentes", ["pagamentos pendentes", "pedidos pendentes"]],
  ["expired_reservations", "reservas expiradas/canceladas", ["reservas expiradas", "reservas canceladas", "reservas expiradas canceladas"]],
  ["gate_checkins", "check-ins da portaria", ["checkins da portaria", "check ins da portaria", "relatorio de checkins", "relatorio da portaria"]],
  ["ticket_usage", "ingressos usados e nÃƒÂ£o usados", ["ingressos usados", "ingressos nao usados", "ingressos usados e nao usados", "uso dos ingressos"]],
  ["courtesy_report", "relatÃƒÂ³rio de cortesias", ["relatorio de cortesias", "cortesias emitidas"]],
  ["list_courtesies", "ver cortesias", ["cortesias", "ver cortesias", "listar cortesias", "consultar cortesias"]],
  ["add_courtesy", "adicionar cortesia", ["adicionar cortesia", "adicionar cortesias", "criar cortesia", "gerar cortesia"]],
  ["resend_courtesy", "reenviar cortesia", ["reenviar cortesia", "reenviar cortesias"]],
  ["cancel_courtesy", "cancelar cortesia", ["cancelar cortesia", "cancelar cortesias"]],
  ["edit_title", "editar nome evento", ["editar nome evento", "editar nome do evento", "alterar nome evento", "editar titulo evento"]],
  ["edit_artist", "editar artista", ["editar artista", "alterar artista", "editar atracao"]],
  ["edit_city", "editar cidade", ["editar cidade", "alterar cidade"]],
  ["edit_state", "editar estado", ["editar estado", "alterar estado", "editar uf"]],
  ["edit_venue", "editar local", ["editar local", "alterar local", "editar teatro"]],
  ["edit_image", "enviar foto", ["enviar foto", "alterar foto", "trocar foto", "editar foto", "trocar imagem"]],
  ["edit_datetime", "editar data/hora", ["editar data", "editar horario", "editar data hora", "alterar data", "alterar horario"]],
  ["edit_description", "editar informaÃƒÂ§ÃƒÂµes gerais", ["editar informacoes", "editar informacoes gerais", "alterar informacoes", "editar descricao"]],
  ["gate_menu", "portaria", ["portaria", "menu portaria"]],
  ["gate_self_checkin", "check-in neste telefone", ["check in neste telefone", "checkin neste telefone", "abrir checkin", "fazer checkin"]],
  ["gate_register", "definir outro telefone", ["definir outro telefone", "cadastrar telefone da portaria", "adicionar operador da portaria"]],
  ["gate_accesses", "ver acessos", ["ver acessos", "listar acessos", "acessos da portaria"]],
  ["gate_revoke", "revogar acessos", ["revogar acessos", "pausar acessos", "revogar acesso"]],
];

function getAdminShortcutActionLabel(action: AdminEventShortcutAction) {
  return ADMIN_EVENT_SHORTCUT_ALIASES.find(([candidate]) => candidate === action)?.[1] ?? action;
}

function formatAdminEventShortcutCommand(
  actionLabel: string,
  eventTitle: string,
  period?: AdminReportPeriod,
  targetQuery?: string,
) {
  return [actionLabel, period?.label ?? targetQuery, eventTitle].filter(Boolean).join(", ");
}

function textDistance(left: string, right: string) {
  const previous = Array.from({ length: right.length + 1 }, (_, index) => index);
  for (let leftIndex = 1; leftIndex <= left.length; leftIndex += 1) {
    let diagonal = previous[0];
    previous[0] = leftIndex;
    for (let rightIndex = 1; rightIndex <= right.length; rightIndex += 1) {
      const above = previous[rightIndex];
      previous[rightIndex] = Math.min(
        previous[rightIndex] + 1,
        previous[rightIndex - 1] + 1,
        diagonal + (left[leftIndex - 1] === right[rightIndex - 1] ? 0 : 1),
      );
      diagonal = above;
    }
  }
  return previous[right.length];
}

function suggestAdminShortcutActions(actionText: string) {
  const inputWords = new Set(actionText.split(" ").filter(Boolean));
  return ADMIN_EVENT_SHORTCUT_ALIASES
    .map(([action, label, aliases]) => ({
      action,
      label,
      overlap: Math.max(
        ...aliases.map((alias) =>
          alias.split(" ").filter((word) => inputWords.has(word)).length,
        ),
      ),
      distance: Math.min(...aliases.map((alias) => textDistance(actionText, alias))),
    }))
    .sort((left, right) => right.overlap - left.overlap || left.distance - right.distance)
    .slice(0, 3);
}

function parseAdminShortcutReportPeriod(input: string): AdminReportPeriod | null {
  const normalized = normalizeAdminText(input);
  const optionByText: Record<string, number> = {
    hoje: 1,
    "ultimos 7 dias": 2,
    "7 dias": 2,
    "ultima semana": 2,
    "ultimos 30 dias": 3,
    "30 dias": 3,
    "ultimo mes": 3,
    "todo o periodo": 4,
    "todo periodo": 4,
    tudo: 4,
  };
  const option = optionByText[normalized] ?? (
    /^[1-4]$/.test(normalized) ? Number(normalized) : null
  );

  if (option) {
    const period = parseAdminReportPeriodOption(String(option));
    return period && period !== "custom" ? period : null;
  }

  return parseAdminReportCustomPeriod(input);
}

function parseAdminEventShortcut(text: string): {
  action: AdminEventShortcutAction | null;
  actionText: string;
  eventQuery: string;
  period?: AdminReportPeriod;
  targetQuery?: string;
} | null {
  const parts = text
    .split(/(?:\s*\|\s*|\s*,\s+)/)
    .map((part) => part.trim().replace(/^[*_'"Ã¢â‚¬Å“Ã¢â‚¬Â]+|[*_'"Ã¢â‚¬Å“Ã¢â‚¬Â]+$/g, "").trim())
    .filter(Boolean);
  if (parts.length < 2) return null;

  const actionText = normalizeAdminText(parts[0]);
  const action = ADMIN_EVENT_SHORTCUT_ALIASES.find(([, , names]) =>
    names.includes(actionText),
  )?.[0] ?? null;
  const needsTarget = action === "increase_tickets" || action === "create_special_sale";
  const targetQuery = needsTarget && parts.length >= 3 ? parts[1] : null;
  const period = !needsTarget && parts.length >= 3
    ? parseAdminShortcutReportPeriod(parts[1])
    : null;
  const eventQuery = (
    targetQuery || period ? parts.slice(2) : parts.slice(1)
  ).join(", ").trim();
  if (!eventQuery) return null;

  if (!action) {
    const shortcutWords = new Set([
      "resumo",
      "relatorio",
      "vendas",
      "ingressos",
      "vendidos",
      "cortesia",
      "cortesias",
      "editar",
      "alterar",
      "foto",
      "imagem",
      "enviar",
      "trocar",
      "criar",
      "gerar",
      "ver",
      "listar",
      "consultar",
      "evento",
      "eventos",
      "setores",
      "assentos",
      "lugares",
      "datas",
      "sessoes",
      "precos",
      "valores",
      "pagamentos",
      "reservas",
      "portaria",
      "checkin",
      "acessos",
      "revogar",
      "aumentar",
      "capacidade",
      "especial",
      "oferta",
    ]);
    const resemblesShortcut = actionText
      .split(" ")
      .some((word) => shortcutWords.has(word));
    const closeToAction = Math.min(
      ...ADMIN_EVENT_SHORTCUT_ALIASES.flatMap(([, , names]) =>
        names.map((name) => textDistance(actionText, name)),
      ),
    ) <= 3;
    if (!resemblesShortcut && !closeToAction) return null;
  }

  return {
    action,
    actionText,
    eventQuery,
    period: period ?? undefined,
    targetQuery: targetQuery ?? undefined,
  };
}

async function resolveAdminShortcutEvent(
  eventQuery: string,
  scope: AdminEventScope,
) {
  const result = await listAdminEvents({
    status: "all",
    ownerAdminUserId: scope.adminUserId,
    canSeeAll: scope.canSeeAllEvents,
  });
  if (!result.ok) return { ok: false as const, reason: "database_error" as const };

  const normalizedQuery = normalizeAdminText(eventQuery);
  const eventSearchValues = (event: (typeof result.events)[number]) => [
    normalizeAdminText(event.title),
    normalizeAdminText(event.artistName),
  ];
  const exact = result.events.filter(
    (event) => eventSearchValues(event).some((value) => value === normalizedQuery),
  );
  const matches = exact.length
    ? exact
    : result.events.filter((event) => eventSearchValues(event).some(
        (value) => value.includes(normalizedQuery),
      ));

  if (matches.length === 1) {
    return { ok: true as const, event: matches[0] };
  }

  const suggestions = matches.length
    ? matches
    : [...result.events]
        .map((event) => ({
          event,
          distance: Math.min(...eventSearchValues(event).map(
            (value) => textDistance(normalizedQuery, value),
          )),
        }))
        .sort((left, right) => left.distance - right.distance)
        .slice(0, 5)
        .map(({ event }) => event);

  return {
    ok: false as const,
    reason: matches.length ? "ambiguous" as const : "not_found" as const,
    matches: suggestions.slice(0, 10),
  };
}

function resolveAdminShortcutSection(
  sectionQuery: string,
  sections: AdminEventDetails["sections"],
) {
  const normalizedQuery = normalizeAdminText(sectionQuery);
  const exact = sections.filter(
    (section) => normalizeAdminText(section.name) === normalizedQuery,
  );
  const matches = exact.length
    ? exact
    : sections.filter((section) =>
        normalizeAdminText(section.name).includes(normalizedQuery),
      );

  if (matches.length === 1) return { ok: true as const, section: matches[0] };

  const suggestions = matches.length
    ? matches
    : [...sections]
        .map((section) => ({
          section,
          distance: textDistance(normalizedQuery, normalizeAdminText(section.name)),
        }))
        .sort((left, right) => left.distance - right.distance)
        .slice(0, 5)
        .map(({ section }) => section);

  return {
    ok: false as const,
    reason: matches.length ? "ambiguous" as const : "not_found" as const,
    matches: suggestions,
  };
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
    "Portaria - ler QR Codes de ingresso:",
    gateUrl,
    "",
    `Validade: atÃƒÂ© ${formatDateTime(expiresAt)}`,
    "",
    "Esse link ÃƒÂ© temporÃƒÂ¡rio e deve ser usado apenas pela equipe autorizada.",
  ].join("\n");
}

function buildKitchenCheckInReply({
  kitchenUrl,
  offerReaderUrl,
  expiresAt,
}: {
  kitchenUrl: string;
  offerReaderUrl?: string;
  expiresAt: string;
}) {
  return [
    "Acesso de cozinha criado.",
    "",
    "Sistema Cozinha - acompanhar e preparar pedidos:",
    kitchenUrl,
    ...(offerReaderUrl
      ? [
          "",
          "Leitor de Oferta - validar QR Code e concluir entrega:",
          offerReaderUrl,
        ]
      : []),
    "",
    `Validade: ate ${formatDateTime(expiresAt)}`,
    "",
    "Esse link e temporario e deve ser usado apenas pela equipe autorizada.",
  ].join("\n");
}

function parseGateCommand(text: string) {
  const match = text.trim().match(GATE_COMMAND_PATTERN);

  if (!match) {
    return null;
  }

  const purpose: "gate" | "kitchen" = normalizeAdminText(match[1] ?? "") === "cozinha"
    ? "kitchen"
    : "gate";
  const rest = match[2]?.trim();

  if (!rest) {
    return {
      valid: false as const,
      purpose,
    };
  }

  const phoneMatch = rest.match(/(?:\+?\d[\d\s().-]{7,}\d)/);
  const validatorPhone = normalizeGatePhone(phoneMatch?.[0]);

  if (!validatorPhone) {
    return {
      valid: false as const,
      purpose,
    };
  }

  const gateLabel =
    rest
      .slice((phoneMatch?.index ?? 0) + (phoneMatch?.[0].length ?? 0))
      .trim()
      .replace(/\s+/g, " ") || null;

  return {
    valid: true as const,
    purpose,
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
    "RESERVA CRIADA. VOCÃƒÅ  TEM 10 MINUTOS PARA EFETUAR A COMPRA",
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
    `> Reserva vÃƒÂ¡lida atÃƒÂ©: ${formatTime(reservation.expiresAt)}`,
    "",
    "Para comprar, digite COMPRAR. VocÃƒÂª receberÃƒÂ¡ o link de pagamento na prÃƒÂ³xima mensagem.",
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
    "RESERVA EM ANDAMENTO. VOCÃƒÅ  AINDA PODE EFETUAR A COMPRA",
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
    `> Reserva vÃƒÂ¡lida atÃƒÂ©: ${formatTime(reservation.expiresAt)}`,
    "",
    "Para comprar, digite COMPRAR. Para alterar sua escolha, digite VOLTAR.",
  ].join("\n");
}

function formatPaymentLinkReply({
  checkout,
}: {
  checkout: CheckoutForReservation;
}) {
  const lines = [
    "*LINK DE PAGAMENTO GERADO*",
    "",
    "Pague por Pix clicando neste link:",
    checkout.checkoutUrl,
    "",
    "ApÃƒÂ³s a confirmaÃƒÂ§ÃƒÂ£o do pagamento, seu ingresso serÃƒÂ¡ emitido automaticamente.",
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
        "NÃƒÂ£o encontrei ingresso pago emitido para este telefone. Confira se o pagamento foi aprovado e se este ÃƒÂ© o mesmo WhatsApp usado na compra.",
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
      reply: "NÃƒÂ£o encontrei essa opÃƒÂ§ÃƒÂ£o. Responda com um nÃƒÂºmero da lista.",
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
        "NÃƒÂ£o encontrei mais esse ingresso disponÃƒÂ­vel para reenvio. Confira com a equipe da Black House.",
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
    return "*QUANTIDADE INVALIDA*\nPara ingresso gratuito, o nÃƒÂºmero mÃƒÂ¡ximo de ingressos por pedido sÃƒÂ£o 4. Digite novamente o nÃƒÂºmero de 1 a 4.";
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
  const normalized = normalizeAdminText(text);

  return (
    normalized === "inicio" ||
    normalized === "menu" ||
    normalized === "admin" ||
    normalized === "adm" ||
    normalized === "administrador"
  );
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
    'Digite "Voltar" para voltar, "Cancelar" para abandonar esta tela ou "Sair" para sair da ÃƒÂ¡rea de admin.',
  ].join("\n");
}

function isAdminOrdersFlowState(
  state: string | undefined,
): state is
  | "admin_order_phone_collecting"
  | "admin_order_code_collecting"
  | "admin_order_cancel_collecting"
  | "admin_order_cancel_confirm" {
  return (
    state === "admin_order_phone_collecting" ||
    state === "admin_order_code_collecting" ||
    state === "admin_order_cancel_collecting" ||
    state === "admin_order_cancel_confirm"
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
  | "admin_user_unlock_confirm"
  | "admin_user_passphrase_select"
  | "admin_user_passphrase_collect"
  | "admin_user_passphrase_confirm" {
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
    state === "admin_user_unlock_confirm" ||
    state === "admin_user_passphrase_select" ||
    state === "admin_user_passphrase_collect" ||
    state === "admin_user_passphrase_confirm"
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
    state === "admin_report_custom_period_collecting" ||
    state === "admin_report_division_settlement_confirm"
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
    "",
    "Responda com o nÃƒÂºmero da opÃƒÂ§ÃƒÂ£o.",
    'Digite "Voltar" para voltar, "Cancelar" para abandonar esta tela ou "Sair" para sair da ÃƒÂ¡rea de admin.',
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
    'Digite "Voltar" para voltar ou "Sair" para sair da ÃƒÂ¡rea de admin.',
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
    "> Digite o nÃƒÂºmero de telefone",
    "",
    'Digite "Voltar" para voltar, "Cancelar" para abandonar esta tela ou "Sair" para sair da ÃƒÂ¡rea de admin.',
  ].join("\n");
}

function renderGateValidatorPasswordPrompt() {
  return [
    "*DEFINIR PALAVRA CHAVE (SENHA) PARA CHECK-IN*",
    "",
    "> Digite a senha para entrar no sistema",
    "",
    'Digite "Voltar" para voltar, "Cancelar" para abandonar esta tela ou "Sair" para sair da ÃƒÂ¡rea de admin.',
  ].join("\n");
}

function buildGateValidatorRegisteredReply({
  validatorPhone,
  passphrase,
  purpose = "gate",
}: {
  validatorPhone: string;
  passphrase: string;
  purpose?: "gate" | "kitchen";
}) {
  const isKitchen = purpose === "kitchen";

  return [
    isKitchen
      ? "*NOVO TELEFONE CADASTRADO PARA COZINHA*"
      : "*NOVO TELEFONE CADASTRADO PARA CHECK-IN*",
    "",
    `> Telefone: ${validatorPhone}`,
    `> Palavra chave: ${passphrase}`,
    "",
    isKitchen
      ? "O telefone cadastrado deve enviar SISTEMA COZINHA para informar a palavra-passe e receber o link do painel."
      : "O telefone cadastrado deve enviar uma mensagem com a palavra Portaria para o telefone 15 99642-6671",
  ].join("\n");
}

function renderGateAccessSelection(accesses: AdminGateAccessListItem[]) {
  return [
    "*VocÃƒÂª tem acesso de portaria para estes eventos:*",
    "",
    ...accesses.map(
      (access, index) =>
        formatOptionLine(index + 1, access.eventTitle ?? "Evento", {
          preserveCase: true,
        }),
    ),
    "",
    "Responda com o nÃƒÂºmero do evento para continuar.",
  ].join("\n");
}

function renderGateAccessSelectionFromContext(
  accesses: NonNullable<TicketConversationState["gateAccess"]>["lastAccesses"] = [],
) {
  return [
    "*VocÃƒÂª tem acesso de portaria para estes eventos:*",
    "",
    ...accesses.map(
      (access) =>
        formatOptionLine(access.option, access.eventTitle ?? "Evento", {
          preserveCase: true,
        }),
    ),
    "",
    "Responda com o nÃƒÂºmero do evento para continuar.",
  ].join("\n");
}

function renderGateAccessPassphrasePrompt(
  eventTitle?: string | null,
  purpose: "gate" | "kitchen" = "gate",
) {
  const isKitchen = purpose === "kitchen";

  return [
    isKitchen ? "*PALAVRA-PASSE DA COZINHA*" : "*PALAVRA CHAVE DA PORTARIA*",
    ...(eventTitle ? [`> Evento: ${eventTitle}`] : []),
    "",
    isKitchen
      ? "Digite a palavra-passe cadastrada para abrir o sistema da cozinha."
      : "Digite a palavra-chave cadastrada para liberar o check-in.",
  ].join("\n");
}

function renderAdminReportPeriodMenu() {
  return [
    "*QUAL PERÃƒÂODO DO RELATÃƒâ€œRIO?*",
    "",
    formatOptionLine(1, "hoje"),
    formatOptionLine(2, "ÃƒÂºltimos 7 dias"),
    formatOptionLine(3, "ÃƒÂºltimos 30 dias"),
    formatOptionLine(4, "todo o perÃƒÂ­odo"),
    formatOptionLine(5, "escolher datas"),
    "",
    "Responda com o nÃƒÂºmero da opÃƒÂ§ÃƒÂ£o.",
    'Digite "Voltar" para voltar, "Cancelar" para abandonar esta tela ou "Sair" para sair da ÃƒÂ¡rea de admin.',
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

    return { label: `ÃƒÅ¡ltimos ${days} dias`, from: from.toISOString(), to: endOfToday.toISOString() };
  }

  if (option === 4) return { label: "Todo o perÃƒÂ­odo" };
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
    .split(/\s+(?:a|atÃƒÂ©|-)\s+/i)
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

function parseAdminDivisionWeekPeriod(input: string): AdminReportPeriod | null {
  const normalized = normalizeAdminText(input);
  const match = normalized.match(/^(?:semana\s+([1-5]|primeira|segunda|terceira|quarta|quinta|ultima|ÃƒÂºltima)|([1-5]|primeira|segunda|terceira|quarta|quinta|ultima|ÃƒÂºltima)\s+semana)\s+(?:de\s+)?([a-z]+)(?:\s+(\d{4}))?$/);
  if (!match) return null;

  const monthByName: Record<string, number> = {
    janeiro: 0,
    fevereiro: 1,
    marco: 2,
    "marÃƒÂ§o": 2,
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
  const weekToken = match[1] ?? match[2];
  const ordinalByName: Record<string, number> = {
    primeira: 1,
    segunda: 2,
    terceira: 3,
    quarta: 4,
    quinta: 5,
    ultima: -1,
    ÃƒÂºltima: -1,
  };
  const monthName = match[3];
  const month = monthByName[monthName];
  if (month === undefined) return null;

  const year = match[4] ? Number(match[4]) : new Date().getFullYear();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const numericWeek = /^\d+$/.test(weekToken)
    ? Number(weekToken)
    : ordinalByName[weekToken];
  if (!numericWeek) return null;

  const weekNumber = numericWeek === -1 ? Math.ceil(daysInMonth / 7) : numericWeek;
  const firstDay = (weekNumber - 1) * 7 + 1;
  if (firstDay > daysInMonth) return null;

  const from = new Date(year, month, firstDay);
  const to = new Date(year, month, Math.min(firstDay + 6, daysInMonth));
  from.setHours(0, 0, 0, 0);
  to.setHours(23, 59, 59, 999);

  const monthLabel = new Intl.DateTimeFormat("pt-BR", {
    month: "long",
    timeZone: "America/Sao_Paulo",
  }).format(from);

  return {
    label: `Semana ${weekNumber} de ${monthLabel}/${year}`,
    from: from.toISOString(),
    to: to.toISOString(),
    compact: true,
  };
}

function renderAdminUserTypePrompt() {
  return [
    "*QUAL NÃƒÂVEL DE ACESSO?*",
    "",
    formatOptionLine(1, "diretor"),
    formatOptionLine(2, "gerente"),
    formatOptionLine(3, "operador"),
    "",
    'Digite "Voltar" para voltar, "Cancelar" para abandonar esta tela ou "Sair" para sair da ÃƒÂ¡rea de admin.',
  ].join("\n");
}

function renderAdminUserPhonePrompt() {
  return [
    "*QUAL TELEFONE DO ADMINISTRADOR?*",
    "",
    'Digite "Voltar" para voltar, "Cancelar" para abandonar esta tela ou "Sair" para sair da ÃƒÂ¡rea de admin.',
  ].join("\n");
}

function renderAdminUserNamePrompt() {
  return [
    "*QUAL O NOME DO ADMINISTRADOR?*",
    "",
    "Digite o nome ou responda PULAR.",
    "",
    'Digite "Voltar" para voltar, "Cancelar" para abandonar esta tela ou "Sair" para sair da ÃƒÂ¡rea de admin.',
  ].join("\n");
}

function renderAdminUserRolePrompt() {
  return renderAdminUserTypePrompt().replace("*QUAL NÃƒÂVEL DE ACESSO?*", "*NOVO NÃƒÂVEL*");
}

function renderAdminUserPassphrasePrompt() {
  return [
    "*QUAL A PALAVRA-CHAVE DO ADMINISTRADOR?*",
    "",
    "Digite a senha individual que este administrador usarÃƒÂ¡ para entrar.",
    "",
    'Digite "Voltar" para voltar, "Cancelar" para abandonar esta tela ou "Sair" para sair da ÃƒÂ¡rea de admin.',
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
      ...(user.lastLoginAt ? [`   ÃƒÅ¡ltimo login: ${formatDateTime(user.lastLoginAt)}`] : []),
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
      `> Bloqueio: ${item.hardLockedAt ? "atÃƒÂ© Diretor liberar" : "temporÃƒÂ¡rio"}`,
      ...(item.lockedUntil ? [`> AtÃƒÂ©: ${formatDateTime(item.lockedUntil)}`] : []),
      ...(item.lastFailedAt ? [`> ÃƒÅ¡ltima tentativa: ${formatDateTime(item.lastFailedAt)}`] : []),
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
    "*ALTERAR NÃƒÂVEL DE ADMINISTRADOR*",
    "",
    `> Nome: ${name || "Sem nome"}`,
    `> Telefone: ${phone ? maskAdminPhone(phone) : "nÃƒÂ£o informado"}`,
    ...(currentRole ? [`> Perfil atual: ${formatAdminRoleLabel(currentRole)}`] : []),
    `> Novo perfil: ${formatAdminRoleLabel(newRole)}`,
    "",
    "Digite ALTERAR NÃƒÂVEL para confirmar.",
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

function renderAdminUserPassphraseConfirm({
  name,
  phone,
  role,
}: {
  name?: string | null;
  phone?: string;
  role?: AdminRole;
}) {
  return [
    "*RENOVAR PALAVRA-CHAVE*",
    "",
    `> Nome: ${name || "Sem nome"}`,
    `> Telefone: ${phone ? maskAdminPhone(phone) : "nÃƒÂ£o informado"}`,
    ...(role ? [`> Perfil: ${formatAdminRoleLabel(role)}`] : []),
    "> Nova palavra-chave: definida e protegida por hash",
    "",
    "Digite RENOVAR PALAVRA para confirmar.",
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
    return "nÃƒÂ£o informado";
  }

  return `****${digits.slice(-4)}`;
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
    `   CÃƒÂ³digo: ${ticket.ticketCode}`,
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
    `   CÃƒÂ³digo: ${ticket.ticketCode}`,
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
    reply: buildCourtesyEventsReply("RELATÃƒâ€œRIO - ESCOLHA O EVENTO", result.events),
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
    onlyPublished: true,
    sortByNextSession: true,
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
    return ["Estrutura de entradas: nÃƒÂ£o definida"];
  }

  return [
    `Estrutura: ${
      draft.entryModel === "single_general"
        ? "entrada ÃƒÂºnica sem assento marcado"
        : draft.entryModel === "multiple_general"
          ? "vÃƒÂ¡rios tipos/setores sem assento marcado"
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

  if (/\b(meia|estudante|senior|sÃƒÂªnior|idoso|pcd|professor|crianca|criancas|adolescente|adolescentes)\b/.test(normalizedName)) {
    return "half";
  }

  if (/\b(cortesia|gratis|grÃƒÂ¡tis|gratuito|free)\b/.test(normalizedName)) {
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
    formatOptionLine(2, "nÃƒÂ£o, apenas cadastrar os assentos"),
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
    `> Digite o nÃƒÂºmero do evento para ${actionLabel}`,
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
      `   SessÃƒÂµes: ${event.sessionsCount}`,
      `   PrÃƒÂ³xima: ${
        event.nextSessionStartsAt
          ? formatDateTime(event.nextSessionStartsAt)
          : "sem sessÃƒÂ£o futura"
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
    `Local: ${event.venueName ?? "nÃƒÂ£o definido"}`,
    "",
    "SessÃƒÂµes:",
    ...(event.sessions.length
      ? event.sessions.map(
          (session) => `- ${formatDateTime(session.startsAt)} - ${session.status}`,
        )
      : ["nenhuma sessÃƒÂ£o cadastrada"]),
    "",
    "Setores:",
    ...(event.sections.length
      ? event.sections.map((section) => `- ${section.name}`)
      : ["nenhum setor cadastrado"]),
    "",
    "*OPÃƒâ€¡Ãƒâ€¢ES:*",
    formatOptionLine(1, "editar evento"),
    formatOptionLine(2, "setores e assentos"),
    formatOptionLine(3, "ativar/pausar evento"),
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
            ? "Este evento estÃƒÂ¡ cancelado. ReativaÃƒÂ§ÃƒÂ£o nÃƒÂ£o estÃƒÂ¡ disponÃƒÂ­vel por aqui."
            : "Este evento estÃƒÂ¡ finalizado. AlteraÃƒÂ§ÃƒÂ£o de publicaÃƒÂ§ÃƒÂ£o nÃƒÂ£o estÃƒÂ¡ disponÃƒÂ­vel por aqui.",
        ]),
  ].join("\n"));
}

function renderCreateEventPrompt(field?: string) {
  const prompts: Record<string, string> = {
    title: "Qual o nome/tÃƒÂ­tulo do evento?",
    artistName: "Qual o artista ou atraÃƒÂ§ÃƒÂ£o principal?",
    city: "Em qual cidade?",
    state: "Qual UF? Ex: SP",
    venueName:
      "Qual o nome do local/teatro/arena?\n\nEscreva o nome ou responda 1 para ver os locais cadastrados.",
    imageUrl:
      "Envie a foto do evento agora ou cole uma URL pÃƒÂºblica https://...\nPara salvar como rascunho sem foto, responda PULAR. Para publicar, a foto ÃƒÂ© obrigatÃƒÂ³ria.",
    dateCount: "Quantas datas terÃƒÂ¡ este evento?\nEx: 3",
    sessionsPerDate: "Quantas sessÃƒÂµes por data esse evento terÃƒÂ¡?",
    sessionDateItem: "Qual a data do evento? Ex: 10/06/2026",
    sessionTimeItem: "Qual o horÃƒÂ¡rio desta sessÃƒÂ£o? Ex: 20:00",
    sessionItem: "Qual a data e horÃƒÂ¡rio da sessÃƒÂ£o? Ex: 10/06/2026 22:00",
    description:
      "Envie as informaÃƒÂ§ÃƒÂµes gerais do evento.\n\nEx: abertura dos portÃƒÂµes, classificaÃƒÂ§ÃƒÂ£o, observaÃƒÂ§ÃƒÂµes importantes.\nSe nÃƒÂ£o quiser adicionar agora, responda PULAR.",
    status:
      `Para finalizar, escolha como deseja salvar o evento.\n\n${formatOptionLine(1, "deixar como rascunho")}\n${formatOptionLine(2, "publicar")}`,
    entryModel:
      [
        "Como serÃƒÂ£o as entradas/lugares?",
        formatOptionLine(1, "entrada ÃƒÂºnica sem assento marcado"),
        formatOptionLine(2, "vÃƒÂ¡rios setores/tipos sem assento marcado"),
        formatOptionLine(3, "setores com assentos marcados"),
      ].join("\n"),
    singleEntryDetails:
      "Envie a entrada com capacidade e valor.\nFormato: nome capacidade valor taxa opcional\nEx: Entrada Geral 500 120,00 12,00",
    entryCapacityMode:
      `Como a carga de ingressos serÃƒÂ¡ controlada?\n\n${formatOptionLine(1, "carga total compartilhada entre todos os tipos de compra")}\n${formatOptionLine(2, "carga separada para cada tipo/setor")}`,
    sharedEntryCapacity:
      "Qual a carga total compartilhada de ingressos?\nEx: 200",
    entryCount: "Quantos tipos/setores de ingresso serÃƒÂ£o cadastrados agora?",
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
    `TÃƒÂ­tulo: ${draft.title}`,
    `Cidade/UF: ${draft.city}/${draft.state}`,
    `Local: ${draft.venueName}`,
    `Foto: ${draft.imageUrl ? "cadastrada" : "ausente"}`,
    `InformaÃƒÂ§ÃƒÂµes gerais: ${draft.description ? "cadastradas" : "ausentes"}`,
    "SessÃƒÂµes:",
    ...(sessionsStartsAt.length
      ? sessionsStartsAt.map(
          (startsAt, index) =>
            formatOptionLine(index + 1, formatDateTime(startsAt), {
              preserveCase: true,
            }),
        )
      : ["nenhuma sessÃƒÂ£o definida"]),
    "",
    ...renderInitialSectionsSummary(draft),
    "",
    "Responda CONFIRMAR para escolher rascunho/publicaÃƒÂ§ÃƒÂ£o ou CANCELAR para abandonar.",
  ].join("\n");
}

function renderEditEventSummary(draft: Record<string, unknown>) {
  const field = String(draft.field ?? "");
  const eventTitle = String(draft.eventTitle ?? "").trim();
  const labelByField: Record<string, string> = {
    title: "TÃƒÂ­tulo",
    artist_name: "Artista",
    city: "Cidade",
    state: "Estado",
    starts_at: "Data/hora",
    venue: "Local",
    image_url: "Foto do evento",
    description: "InformaÃƒÂ§ÃƒÂµes gerais",
    status: "Status",
  };
  const value =
    field === "venue"
        ? draft.venueName
        : field === "image_url"
          ? draft.imageUrl
          : field === "starts_at"
            ? formatDateTime(String(draft.startsAt ?? ""))
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
    "Confirmar alteraÃƒÂ§ÃƒÂ£o do evento?",
    ...(eventTitle ? [`Evento: ${eventTitle}`] : []),
    "",
    `Campo: ${labelByField[field] ?? field}`,
    `Novo valor: ${value}`,
    "",
    field === "status" && draft.status === "cancelled"
      ? "Digite CANCELAR EVENTO para confirmar o cancelamento. NÃƒÂ£o haverÃƒÂ¡ exclusÃƒÂ£o fÃƒÂ­sica nem estorno automÃƒÂ¡tico."
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
    formatOptionLine(11, "editar informaÃƒÂ§ÃƒÂµes gerais"),
  ].join("\n"));
}

function renderAdminEventDuplicateConfirmReply(event: AdminEventDetails) {
  return withAdminNavigationHint([
    "*DUPLICAR EVENTO*",
    "",
    `> Origem: ${event.title}`,
    `> Novo nome: ${event.title} - CÃƒâ€œPIA`,
    `> SessÃƒÂµes: ${event.sessions.length}`,
    `> Setores/lugares: ${event.sections.length}`,
    "",
    "O evento duplicado serÃƒÂ¡ criado como rascunho.",
    "Reservas, pedidos, pagamentos, tickets, cortesias e acessos de portaria nÃƒÂ£o serÃƒÂ£o duplicados.",
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
    "A ediÃƒÂ§ÃƒÂ£o foi salva.",
    "",
    formatOptionLine(1, "deixar como rascunho"),
    formatOptionLine(2, "publicar evento"),
    "",
    "Responda com o nÃƒÂºmero da opÃƒÂ§ÃƒÂ£o.",
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

function withAdminOffersContext(
  baseContext: TicketConversationState,
  state: TicketConversationState["state"],
  adminOffers: NonNullable<TicketConversationState["adminOffers"]>,
) {
  return {
    ...baseContext,
    step: state,
    state,
    adminOffers,
  };
}

function getAdminOffersContext(baseContext: TicketConversationState) {
  return baseContext.adminOffers ?? {};
}

function parseWeekdaysFromAdminText(text: string) {
  const normalized = normalizeAdminText(text);
  const labels: Record<string, number> = {
    domingo: 0,
    dom: 0,
    "0": 0,
    segunda: 1,
    seg: 1,
    "1": 1,
    terca: 2,
    "terÃƒÂ§a": 2,
    ter: 2,
    "2": 2,
    quarta: 3,
    qua: 3,
    "3": 3,
    quinta: 4,
    qui: 4,
    "4": 4,
    sexta: 5,
    sex: 5,
    "5": 5,
    sabado: 6,
    "sÃƒÂ¡bado": 6,
    sab: 6,
    "6": 6,
  };
  const values = normalized
    .split(/[,\s]+/)
    .map((part) => labels[part])
    .filter((value): value is number => Number.isInteger(value));

  return [...new Set(values)].sort();
}

function buildAdminOfferScopeFromDraft(
  draft: NonNullable<TicketConversationState["adminOffers"]>["draft"],
): ComboOfferScopeInput | null {
  if (!draft?.scopeType) return null;
  if (draft.scopeType === "all_events") return { scopeType: "all_events" };
  if (draft.scopeType === "event" && draft.eventIds?.length) {
    return { scopeType: "event", eventIds: draft.eventIds };
  }
  if (draft.scopeType === "weekday" && draft.weekdays?.length) {
    return { scopeType: "weekday", weekdays: draft.weekdays };
  }

  return null;
}

function parseComboOfferTiming(option: number | null): {
  timingType: ComboOfferTimingType;
  customOffsetMinutes?: number | null;
} | null {
  if (option === 1) return { timingType: "three_hours_before" };
  if (option === 2) return { timingType: "one_hour_before" };
  if (option === 3) return { timingType: "event_day_noon" };
  if (option === 4) return { timingType: "custom", customOffsetMinutes: 15 };
  if (option === 5) return { timingType: "custom", customOffsetMinutes: 120 };

  return null;
}

function formatMoneyFromCents(cents: number) {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(cents / 100);
}

function buildAdminOfferNamePrompt() {
  return "*ADICIONAR OFERTA*\n\nDigite o nome da oferta:\nBLACK HOUSE COMBO";
}

function buildAdminOfferImagePrompt() {
  return "Envie a foto da oferta pelo WhatsApp, cole uma URL publica https://... ou digite PULAR.";
}

function parseAdminOfferImageInput({
  text,
  mediaUrl,
  allowRemove = false,
}: {
  text: string;
  mediaUrl?: string | null;
  allowRemove?: boolean;
}) {
  const normalized = normalizeAdminText(text);

  if (allowRemove && ["remover", "remove", "sem foto", "tirar foto"].includes(normalized)) {
    return { ok: true as const, imageUrl: null };
  }

  if (["pular", "sem foto", "skip"].includes(normalized)) {
    return { ok: true as const, imageUrl: null };
  }

  const imageUrl = normalizeEventImageUrl(mediaUrl ?? text);

  return imageUrl
    ? { ok: true as const, imageUrl }
    : { ok: false as const };
}

function buildAdminOfferTimingPrompt() {
  return [
    "Quando enviar?",
    "1. 3h antes do evento",
    "2. 1h antes do evento",
    "3. No dia do evento as 12h",
    "4. 15 minutos apos a compra",
    "5. 2h apos a compra",
  ].join("\n");
}

function buildAdminOfferEditFieldPrompt(offerName: string) {
  return [
    "*EDITAR OFERTA*",
    "",
    `Oferta: ${offerName}`,
    "",
    "1. Editar nome",
    "2. Editar descricao",
    "3. Editar valor",
    "4. Editar quando enviar",
    "5. Editar foto",
  ].join("\n");
}

async function buildAdminOfferEventSelect({
  baseContext,
  scope,
  multi,
}: {
  baseContext: TicketConversationState;
  scope: AdminEventScope;
  multi: boolean;
}) {
  const result = await listAdminEvents({
    status: "published",
    ownerAdminUserId: scope.adminUserId,
    canSeeAll: scope.canSeeAllEvents,
  });

  if (!result.ok) {
    return {
      reply: TICKET_MESSAGES.adminGenericError,
      nextContext: withAdminOffersContext(baseContext, "admin_offers_menu", {}),
    };
  }

  const events = result.events.slice(0, 20).map((event, index) => ({
    option: index + 1,
    eventId: event.eventId,
    title: event.title,
  }));

  if (!events.length) {
    return {
      reply: "Nenhum evento publicado encontrado para usar na oferta.",
      nextContext: withAdminOffersContext(baseContext, "admin_offers_menu", {}),
    };
  }

  return {
    reply: [
      multi ? "*ESCOLHER VARIOS EVENTOS*" : "*ESCOLHER UM EVENTO*",
      "",
      ...events.map((event) =>
        formatOptionLine(event.option, event.title, { preserveCase: true }),
      ),
      "",
      multi
        ? "Envie os numeros separados por virgula. Ex: 1, 3, 5"
        : "Envie o numero do evento.",
    ].join("\n"),
    nextContext: withAdminOffersContext(baseContext, "admin_offer_create_event_select", {
      ...getAdminOffersContext(baseContext),
      lastEvents: events,
      draft: {
        ...(getAdminOffersContext(baseContext).draft ?? {}),
        scopeType: "event",
      },
    }),
  };
}

async function renderAdminOfferListForAction(
  baseContext: TicketConversationState,
  mode: NonNullable<TicketConversationState["adminOffers"]>["mode"],
) {
  const result = await listComboOffers();

  if (!result.ok) {
    return {
      reply: TICKET_MESSAGES.adminGenericError,
      nextContext: withAdminOffersContext(baseContext, "admin_offers_menu", {}),
    };
  }

  const offers = result.offers
    .filter((offer) => (mode === "pause" ? offer.status === "active" : true))
    .slice(0, 20);

  if (!offers.length) {
    return {
      reply: "Nenhuma oferta encontrada para esta acao.",
      nextContext: withAdminOffersContext(baseContext, "admin_offers_menu", {}),
    };
  }

  return {
    reply: [
      mode === "pause"
        ? "*PAUSAR OFERTA*"
        : mode === "delete"
          ? "*EXCLUIR OFERTA*"
          : mode === "edit"
            ? "*EDITAR OFERTA*"
            : "*DUPLICAR OFERTA*",
      "",
      ...offers.map((offer, index) =>
        `${index + 1}. ${offer.name} - ${offer.status} - ${formatMoneyFromCents(offer.priceCents)}`,
      ),
      "",
      "Envie o numero da oferta.",
    ].join("\n"),
    nextContext: withAdminOffersContext(baseContext, "admin_offer_select_action", {
      mode,
      lastOffers: offers.map((offer, index) => ({
        option: index + 1,
        offerId: offer.id,
        name: offer.name,
      })),
    }),
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
      reply: "NÃƒÂ£o encontrei esse evento.",
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

    const eventId = getSelectedAdminEventId(text, adminEvents);

    if (!eventId) {
      if (numericOption) {
        return {
          reply: [
            "NÃƒÂ£o encontrei essa opÃƒÂ§ÃƒÂ£o na lista atual.",
            "",
            "Digite o nÃƒÂºmero do evento que aparece na lista ou \"Voltar\".",
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
          reply: "NÃƒÂ£o encontrei esse evento.",
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
          reply: "NÃƒÂ£o encontrei esse evento.",
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
          reply: "NÃƒÂ£o encontrei esse evento.",
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
          : "NÃƒÂ£o encontrei esse evento.",
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
        reply: "NÃƒÂ£o encontrei esse evento.",
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
        reply: "NÃƒÂ£o consegui duplicar esse evento agora.",
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
        `> SessÃƒÂµes copiadas: ${duplicateResult.sessionsCount}`,
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
          reply: "NÃƒÂ£o encontrei esse evento.",
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
        reply: ["CriaÃƒÂ§ÃƒÂ£o de evento cancelada.", "", renderAdminEventsMenu()].join("\n"),
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
          reply: "UF invÃƒÂ¡lida. Envie com 2 letras. Ex: SP",
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
            reply: "NÃƒÂ£o consegui listar os locais cadastrados agora. Escreva o nome do local.",
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
            "Responda com o nÃƒÂºmero do local ou escreva o nome de um novo local.",
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
          reply: "Quantidade invÃƒÂ¡lida. Envie o nÃƒÂºmero de datas, de 1 a 30.",
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
          reply: "Quantidade invÃƒÂ¡lida. Envie o nÃƒÂºmero de sessÃƒÂµes por data, de 1 a 10.",
          nextContext: withAdminEventsContext(baseContext, "admin_event_create_collecting", {
            draft,
          }),
        };
      }

      const totalSessions = datesCount * sessionsPerDate;
      if (totalSessions > 60) {
        return {
          reply: "Quantidade muito alta. Crie atÃƒÂ© 60 sessÃƒÂµes por evento.",
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
          reply: "Data invÃƒÂ¡lida ou no passado. Envie no formato 10/06/2026.",
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
          `HorÃƒÂ¡rio 1 de ${Number(draft.sessionsPerDate ?? 1)} da data ${currentDateIndex}.`,
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
          reply: "HorÃƒÂ¡rio invÃƒÂ¡lido ou no passado. Envie no formato 20:00.",
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
            `SessÃƒÂ£o cadastrada: ${formatDateTime(startsAt)}.`,
            "",
            `HorÃƒÂ¡rio ${currentTimeIndex + 1} de ${sessionsPerDate} da data ${currentDateIndex}.`,
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
            `SessÃƒÂ£o cadastrada: ${formatDateTime(startsAt)}.`,
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
              "NÃƒÂ£o consegui identificar a foto. Envie uma imagem pelo WhatsApp ou cole uma URL pÃƒÂºblica https://...",
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
            "Para publicar, a foto do evento ÃƒÂ© obrigatÃƒÂ³ria. Envie a foto agora ou cole uma URL pÃƒÂºblica https://...",
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
          reply: "Carga invÃƒÂ¡lida. Envie um nÃƒÂºmero de 1 a 5000.",
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
          reply: "NÃƒÂ£o consegui entender. Envie assim: Entrada Geral 500 120,00 12,00",
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
          reply: "Quantidade invÃƒÂ¡lida. Envie um nÃƒÂºmero de 1 a 20.",
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
          reply: "NÃƒÂ£o consegui entender. Envie assim: Meia entrada professor 60,00 0",
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
            "NÃƒÂ£o consegui entender os assentos.",
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
          reply: "NÃƒÂ£o consegui entender. Envie assim: Pista 500 120,00 12,00",
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
      draft.description = ["pular", "sem", "nenhum", "nao", "nÃƒÂ£o"].includes(normalized)
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
        reply: ["CriaÃƒÂ§ÃƒÂ£o de evento cancelada.", "", renderAdminEventsMenu()].join("\n"),
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
              ? "Antes de confirmar, defina a estrutura de entradas/lugares. Comece a criaÃƒÂ§ÃƒÂ£o novamente."
              : "Os dados do evento ficaram incompletos ou invÃƒÂ¡lidos. Comece a criaÃƒÂ§ÃƒÂ£o novamente.",
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
        reply: ["CriaÃƒÂ§ÃƒÂ£o de evento cancelada.", "", renderAdminEventsMenu()].join("\n"),
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
          "Para publicar, a foto do evento ÃƒÂ© obrigatÃƒÂ³ria. Envie a foto agora ou cole uma URL pÃƒÂºblica https://...",
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
            ? "Antes de confirmar, defina a estrutura de entradas/lugares. Comece a criaÃƒÂ§ÃƒÂ£o novamente."
            : "Os dados do evento ficaram incompletos ou invÃƒÂ¡lidos. Comece a criaÃƒÂ§ÃƒÂ£o novamente.",
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
          ? "O evento foi salvo como rascunho, mas nÃƒÂ£o consegui concluir toda a estrutura. Revise o evento antes de publicar."
          : "NÃƒÂ£o consegui criar o evento agora. Verifique os dados e tente novamente.",
        nextContext: withAdminEventsContext(baseContext, "admin_events_menu", {}),
      };
    }

    return {
      reply: [
        "Evento criado.",
        `SessÃƒÂµes criadas: ${result.sessionsCount}`,
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
            : "NÃƒÂ£o encontrei esse evento.",
          "",
          "Envie: nÃƒÂºmero do setor | nova carga.",
          "Ex: 1 | 500",
          "",
          "A reduÃƒÂ§ÃƒÂ£o sÃƒÂ³ bloqueia unidades disponÃƒÂ­veis. Vendidos e reservados nÃƒÂ£o sÃƒÂ£o alterados.",
        ].join("\n"),
        nextContext: withAdminEventsContext(baseContext, "admin_event_capacity_collecting", {
          selectedEventId: eventId,
        }),
      };
    }

    if (numericOption === 10) {
      return showAdminEventPricesMenu(baseContext, scope, eventId);
    }

    if (!field) {
      return showAdminEventDetails(baseContext, scope, eventId);
    }

    if (field === "starts_at") {
      const details = await getScopedAdminEventDetails(eventId, scope);

      return {
        reply: [
          details.ok ? "SessÃƒÂµes cadastradas:" : "SessÃƒÂµes cadastradas:",
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
            : "Nenhuma sessÃƒÂ£o cadastrada.",
          "",
          "Envie: nÃƒÂºmero da sessÃƒÂ£o | nova data/hora",
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
              ? "Envie a nova foto do evento ou cole uma URL pÃƒÂºblica https://..."
              : field === "description"
                  ? "Envie as informaÃƒÂ§ÃƒÂµes gerais do evento."
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
          reply: "Cidade invÃƒÂ¡lida. Envie novamente.",
          nextContext: withAdminEventsContext(baseContext, "admin_event_edit_collecting", adminEvents),
        };
      }
      value = { field, city: text.trim() };
    } else if (field === "state") {
      const state = text.trim().toUpperCase();
      if (!/^[A-Z]{2}$/.test(state)) {
        return {
          reply: "UF invÃƒÂ¡lida. Envie com 2 letras. Ex: SP",
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
          reply: "Status invÃƒÂ¡lido. Use draft, published, cancelled ou finished.",
          nextContext: withAdminEventsContext(baseContext, "admin_event_edit_collecting", adminEvents),
        };
      }
      value = { field, status };
    } else if (field === "image_url") {
      if (["pular", "remover", "sem", "nenhum", "nao", "nÃƒÂ£o"].includes(normalizeAdminText(text))) {
        value = { field, imageUrl: null };
      } else {
      const imageUrl = normalizeEventImageUrl(mediaUrl ?? text);
      if (!imageUrl) {
        return {
          reply: "Foto invÃƒÂ¡lida. Envie uma imagem pelo WhatsApp ou cole uma URL pÃƒÂºblica https://...",
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
            "SessÃƒÂ£o invÃƒÂ¡lida. Envie: nÃƒÂºmero da sessÃƒÂ£o | nova data/hora",
            "Ex: 1 | 10/06/2026 22:00",
          ].join("\n"),
          nextContext: withAdminEventsContext(baseContext, "admin_event_edit_collecting", adminEvents),
        };
      }

      if (!startsAt || new Date(startsAt).getTime() <= Date.now()) {
        return {
          reply: "Data invÃƒÂ¡lida ou no passado. Envie no formato 10/06/2026 22:00.",
          nextContext: withAdminEventsContext(baseContext, "admin_event_edit_collecting", adminEvents),
        };
      }

      const usage = await getAdminSessionUsage(session.sessionId);

      if (!usage.ok) {
        return {
          reply: "NÃƒÂ£o consegui verificar reservas/ingressos dessa data agora.",
          nextContext: withAdminEventsContext(baseContext, "admin_event_edit_menu", adminEvents),
        };
      }

      if (usage.hasUsage) {
        return {
          reply: [
            "Essa data jÃƒÂ¡ tem reservas ou ingressos vinculados.",
            "Para evitar quebrar ingressos emitidos, a alteraÃƒÂ§ÃƒÂ£o de data/hora estÃƒÂ¡ bloqueada neste fluxo.",
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

    const shortcutEventTitle = String(adminEvents.draft?.eventTitle ?? "").trim();
    if (shortcutEventTitle) value.eventTitle = shortcutEventTitle;

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
            reply: "NÃƒÂ£o consegui preparar esse local agora.",
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
            reply: "NÃƒÂ£o consegui salvar a nova data/hora.",
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
        reply: "Os dados da alteraÃƒÂ§ÃƒÂ£o ficaram invÃƒÂ¡lidos. Comece a ediÃƒÂ§ÃƒÂ£o novamente.",
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
        reply: "NÃƒÂ£o consegui salvar a alteraÃƒÂ§ÃƒÂ£o.",
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

    if (isCancelText(text) || isBackText(text)) {
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
        reply: "NÃƒÂ£o encontrei esse evento.",
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
          "Antes de publicar, cadastre setores/assentos e valores disponÃƒÂ­veis para venda.",
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
          reply: "NÃƒÂ£o consegui alterar o status do evento.",
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
        reply: "NÃƒÂ£o encontrei esse evento.",
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
          ? "Digite CANCELAR EVENTO para confirmar o cancelamento. NÃƒÂ£o haverÃƒÂ¡ exclusÃƒÂ£o fÃƒÂ­sica nem estorno automÃƒÂ¡tico."
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
        reply: "ConfirmaÃƒÂ§ÃƒÂ£o invÃƒÂ¡lida. OperaÃƒÂ§ÃƒÂ£o cancelada por seguranÃƒÂ§a.",
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
          reply: "NÃƒÂ£o consegui alterar o status.",
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
      reply: "NÃƒÂ£o encontrei esse evento.",
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
    formatOptionLine(1, "listar sessÃƒÂµes"),
    formatOptionLine(2, "criar sessÃƒÂ£o"),
    formatOptionLine(3, "editar data/hora de sessÃƒÂ£o"),
    formatOptionLine(4, "pausar/abrir vendas da sessÃƒÂ£o"),
    formatOptionLine(5, "cancelar sessÃƒÂ£o"),
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
      reply: "NÃƒÂ£o encontrei esse evento.",
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
    formatOptionLine(6, "criar assentos da sessÃƒÂ£o"),
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
      reply: "NÃƒÂ£o encontrei esse evento.",
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
  ].join("\n"));
}

async function renderSessionsList(
  eventId: string,
  scope: AdminEventScope,
  { selectable = false }: { selectable?: boolean } = {},
) {
  const details = await getScopedAdminEventDetails(eventId, scope);
  if (!details.ok) return "NÃƒÂ£o encontrei esse evento.";
  const counts = await getAdminSessionCatalogCounts(details.event.sessions);

  return [
    `SessÃƒÂµes de ${details.event.title}:`,
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
              `   Local: ${session.venueName ?? details.event.venueName ?? "nÃƒÂ£o definido"}`,
              counts.ok
                ? `   Setores: ${counts.getSectionsCount(session.venueId)} | PreÃƒÂ§os: ${counts.getPricesCount(session.sessionId)}`
                : "   Setores/preÃƒÂ§os: nÃƒÂ£o consegui calcular agora",
            ].join("\n"),
        )
      : ["Nenhuma sessÃƒÂ£o cadastrada."]),
  ].join("\n");
}

async function renderSectionsList(
  eventId: string,
  scope: AdminEventScope,
  sessionId?: string,
  { selectable = false }: { selectable?: boolean } = {},
) {
  const details = await getScopedAdminEventDetails(eventId, scope);
  if (!details.ok || !details.event.venueId) return "NÃƒÂ£o encontrei venue para esse evento.";
  const result = await listAdminSections(details.event.venueId, sessionId);
  if (!result.ok) return "NÃƒÂ£o consegui listar setores.";

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
              `   capacidade: ${section.capacity ?? "nÃƒÂ£o definida"}`,
              `   assento marcado: ${section.hasNumberedSeats ? "sim" : "nÃƒÂ£o"}`,
              `   status: ${section.status}`,
              `   assentos estruturais: ${section.seatsCount}`,
              `   assentos da sessÃƒÂ£o: ${section.sessionSeatsCount}`,
            ].join("\n"),
        )
      : ["Nenhum setor cadastrado."]),
  ].join("\n");
}

async function renderCapacityShortcutSectionsList(
  eventId: string,
  scope: AdminEventScope,
) {
  const details = await getScopedAdminEventDetails(eventId, scope);
  if (!details.ok) return "NÃƒÂ£o encontrei setores para esse evento.";

  return details.event.sections.length
    ? details.event.sections
        .map((section, index) =>
          `> ${formatOptionLine(index + 1, section.name, { preserveCase: true })} - *capacidade: ${section.capacity ?? "nÃƒÂ£o definida"}*`,
        )
        .join("\n")
    : "Nenhum setor cadastrado.";
}

async function getAdminPriceListForEvent(eventId: string, scope: AdminEventScope) {
  const details = await getScopedAdminEventDetails(eventId, scope);
  if (!details.ok) return { ok: false as const, reply: "NÃƒÂ£o encontrei esse evento." };
  if (!details.event.sessions.length) {
    return { ok: false as const, reply: "Esse evento ainda nÃƒÂ£o tem sessÃƒÂµes." };
  }
  const priceGroups = await Promise.all(
    details.event.sessions.map(async (session) => {
      const result = await listAdminPrices({ sessionId: session.sessionId });
      return { session, result };
    }),
  );
  const failed = priceGroups.find((group) => !group.result.ok);
  if (failed) return { ok: false as const, reply: "NÃƒÂ£o consegui listar preÃƒÂ§os." };
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
              `   SessÃƒÂ£o: ${formatDateTime(price.sessionStartsAt)}`,
              `   Setor: ${price.sectionName}`,
              `   Valor: ${formatPriceWithOptionalFee(price.priceCents, price.feeCents)}`,
            ].join("\n"),
          )
        : ["Nenhum preÃƒÂ§o cadastrado."]),
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
          "Envie data/hora e status da nova sessÃƒÂ£o. Ex: 10/06/2026 22:00 | sales_open\nStatus inicial permitido: scheduled ou sales_open.",
        nextContext: withAdminEventsContext(baseContext, "admin_event_session_create_collecting", adminEvents),
      };
    }
    if (numericOption === 3) {
      return {
        reply: [
          await renderSessionsList(eventId, scope, { selectable: true }),
          "",
          "Envie: nÃƒÂºmero da sessÃƒÂ£o | nova data/hora. Ex: 1 | 10/06/2026 22:30",
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
          "Envie: nÃƒÂºmero da sessÃƒÂ£o | status. Ex: 1 | sales_open",
          "Status: scheduled, sales_open ou sales_closed.",
          "Para cancelar, use a opÃƒÂ§ÃƒÂ£o Cancelar sessÃƒÂ£o.",
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
          "Envie o nÃƒÂºmero da sessÃƒÂ£o que deseja cancelar.",
        ].join("\n"),
        nextContext: withAdminEventsContext(baseContext, "admin_event_session_edit_collecting", {
          ...adminEvents,
          mode: "cancel_session_select",
        }),
      };
    }
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
          ? "SessÃƒÂ£o criada. Agora configure setores/assentos para essa sessÃƒÂ£o."
          : "NÃƒÂ£o consegui criar a sessÃƒÂ£o.",
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
        reply: "Dados invÃƒÂ¡lidos. Use: 10/06/2026 22:00 | sales_open ou scheduled.",
        nextContext: withAdminEventsContext(baseContext, "admin_event_session_create_collecting", adminEvents),
      };
    }
    return {
      reply: [
        "Confirmar nova sessÃƒÂ£o?",
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
        reply: result.ok ? "SessÃƒÂ£o atualizada." : "NÃƒÂ£o consegui atualizar a sessÃƒÂ£o.",
        nextContext: withAdminEventsContext(baseContext, "admin_event_sessions_menu", {
          selectedEventId: eventId,
        }),
      };
    }

    if (adminEvents.mode === "confirm_cancel_session") {
      if (isCancelText(text)) return showAdminEventSessionsMenu(baseContext, scope, eventId);
      if (normalizeAdminText(text) !== "cancelar sessao") {
        return {
          reply: "Digite CANCELAR SESSÃƒÆ’O para confirmar ou CANCELAR para abandonar.",
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
          ? "SessÃƒÂ£o cancelada. Nenhum ticket, pagamento ou reserva foi apagado."
          : "NÃƒÂ£o consegui cancelar a sessÃƒÂ£o.",
        nextContext: withAdminEventsContext(baseContext, "admin_event_sessions_menu", {
          selectedEventId: eventId,
        }),
      };
    }

    if (adminEvents.mode === "cancel_session_select") {
      const session = selectSessionByOption(details.event, text);
      if (!session) {
        return {
          reply: "SessÃƒÂ£o invÃƒÂ¡lida. Envie o nÃƒÂºmero da sessÃƒÂ£o.",
          nextContext: withAdminEventsContext(
            baseContext,
            "admin_event_session_edit_collecting",
            adminEvents,
          ),
        };
      }

      return {
        reply: [
          `Cancelar sessÃƒÂ£o ${formatDateTime(session.startsAt)}?`,
          "NÃƒÂ£o haverÃƒÂ¡ exclusÃƒÂ£o fÃƒÂ­sica nem estorno automÃƒÂ¡tico neste passo.",
          "",
          "Digite CANCELAR SESSÃƒÆ’O para confirmar.",
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
        reply: "Dados invÃƒÂ¡lidos. Envie no formato indicado.",
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
          reply: "Data invÃƒÂ¡lida ou no passado. Use: 10/06/2026 22:30",
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
          reply: "NÃƒÂ£o consegui verificar reservas/ingressos dessa sessÃƒÂ£o agora.",
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
            "Essa sessÃƒÂ£o jÃƒÂ¡ tem reservas ou ingressos vinculados.",
            "Para evitar quebrar ingressos emitidos, a alteraÃƒÂ§ÃƒÂ£o de data/hora estÃƒÂ¡ bloqueada neste fluxo.",
            "",
            "Ajuste operacional manual deve ser tratado em um passo especÃƒÂ­fico.",
          ].join("\n"),
          nextContext: withAdminEventsContext(baseContext, "admin_event_sessions_menu", {
            selectedEventId: eventId,
          }),
        };
      }

      return {
        reply: [
          "Confirmar alteraÃƒÂ§ÃƒÂ£o da sessÃƒÂ£o?",
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
          "Status invÃƒÂ¡lido. Use scheduled, sales_open ou sales_closed. Para cancelar, use a opÃƒÂ§ÃƒÂ£o Cancelar sessÃƒÂ£o.",
        nextContext: withAdminEventsContext(
          baseContext,
          "admin_event_session_edit_collecting",
          adminEvents,
        ),
      };
    }

    return {
      reply: [
        "Confirmar alteraÃƒÂ§ÃƒÂ£o de status da sessÃƒÂ£o?",
        `SessÃƒÂ£o: ${formatDateTime(session.startsAt)}`,
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
        reply: "Envie: Nome do setor | capacidade | numerado sim/nÃƒÂ£o. Ex: Pista Premium | 500 | sim",
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
          "Envie: nÃƒÂºmero do setor | nome | capacidade | status | numerado sim/nÃƒÂ£o.",
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
          "Envie: nÃƒÂºmero do setor | fileiras/assentos.",
          "Ex: 1 | A 10 assentos 1 a 10",
          "Ex: 1 | A 10 assentos 10 a 1",
          "VocÃƒÂª pode enviar vÃƒÂ¡rias linhas:",
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
          "Envie: nÃƒÂºmero do setor | status | assentos.",
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
        reply: "Envie: nÃƒÂºmero da sessÃƒÂ£o | nÃƒÂºmero do setor ou todos. Ex: 1 | todos",
        nextContext: withAdminEventsContext(baseContext, "admin_event_session_seats_confirm", adminEvents),
      };
    }
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
          reply: "Os dados da carga ficaram invÃƒÂ¡lidos. Comece novamente.",
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
            "NÃƒÂ£o ÃƒÂ© possÃƒÂ­vel reduzir para esse valor porque jÃƒÂ¡ existem ingressos vendidos ou reservados.",
          nextContext: withAdminEventsContext(baseContext, "admin_event_edit_menu", {
            selectedEventId: eventId,
          }),
        };
      }

      if (!result.ok && result.reason === "numbered_section") {
        return {
          reply:
            "Esse setor usa assento marcado. Ajuste a carga pelo fluxo de ediÃƒÂ§ÃƒÂ£o de assentos.",
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
          : "NÃƒÂ£o consegui atualizar a carga.",
        nextContext: withAdminEventsContext(baseContext, "admin_event_edit_menu", {
          selectedEventId: eventId,
        }),
      };
    }

    if (adminEvents.mode === "shortcut_capacity_section_select") {
      const sections = (adminEvents.draft?.lastSections as Array<{
        option: number;
        sectionId: string;
        name: string;
        capacity: number | null;
        hasNumberedSeats: boolean;
      }> | undefined) ?? [];
      const selected = numericOption
        ? sections.find((section) => section.option === numericOption)
        : null;
      const details = await getScopedAdminEventDetails(eventId, scope);

      if (!selected || !details.ok) {
        return {
          reply: withAdminNavigationHint([
            "Escolha uma das opÃƒÂ§ÃƒÂµes pelo nÃƒÂºmero:",
            "",
            ...sections.map(
              (section) =>
                `> ${formatOptionLine(section.option, section.name, { preserveCase: true })} - *capacidade: ${section.capacity ?? "nÃƒÂ£o definida"}*`,
            ),
          ].join("\n")),
          nextContext: withAdminEventsContext(
            baseContext,
            "admin_event_capacity_collecting",
            adminEvents,
          ),
        };
      }

      if (selected.hasNumberedSeats) {
        return {
          reply: [
            `Evento: ${details.event.title}`,
            `Setor: ${selected.name}`,
            "",
            "Esse setor usa assentos marcados. Para aumentar a carga, primeiro cadastre os novos assentos.",
          ].join("\n"),
          nextContext: baseContext,
        };
      }

      return {
        reply: [
          "*AUMENTAR INGRESSOS*",
          `Evento: ${details.event.title}`,
          `Setor: ${selected.name}`,
          `Carga atual: ${selected.capacity ?? "nÃƒÂ£o definida"}`,
          "",
          "Digite a nova carga total do setor. Ex: 500",
        ].join("\n"),
        nextContext: withAdminEventsContext(
          baseContext,
          "admin_event_capacity_collecting",
          {
            ...adminEvents,
            mode: "shortcut_capacity",
            draft: { sectionId: selected.sectionId },
          },
        ),
      };
    }

    if (adminEvents.mode === "shortcut_capacity") {
      const details = await getScopedAdminEventDetails(eventId, scope);
      const sectionId = String(adminEvents.draft?.sectionId ?? "");
      const section = details.ok
        ? details.event.sections.find((item) => item.sectionId === sectionId)
        : null;
      const newCapacity = Number(text.trim());

      if (
        !section ||
        !Number.isInteger(newCapacity) ||
        newCapacity < 0 ||
        newCapacity > 5000
      ) {
        return {
          reply: "Carga invÃƒÂ¡lida. Digite um nÃƒÂºmero inteiro entre 0 e 5000. Ex: 500",
          nextContext: withAdminEventsContext(
            baseContext,
            "admin_event_capacity_collecting",
            adminEvents,
          ),
        };
      }

      if (section.capacity !== null && newCapacity <= section.capacity) {
        return {
          reply: `A nova carga precisa ser maior que a atual (${section.capacity}).`,
          nextContext: withAdminEventsContext(
            baseContext,
            "admin_event_capacity_collecting",
            adminEvents,
          ),
        };
      }

      return {
        reply: [
          "Confirmar alteraÃƒÂ§ÃƒÂ£o de carga?",
          `Evento: ${details.ok ? details.event.title : ""}`,
          `Setor: ${section.name}`,
          `Carga atual: ${section.capacity ?? "nÃƒÂ£o definida"}`,
          `Nova carga: ${newCapacity}`,
          "",
          "A reduÃƒÂ§ÃƒÂ£o sÃƒÂ³ bloqueia unidades disponÃƒÂ­veis. Vendidos e reservados nÃƒÂ£o sÃƒÂ£o alterados.",
          "",
          "Responda CONFIRMAR ou CANCELAR.",
        ].join("\n"),
        nextContext: withAdminEventsContext(
          baseContext,
          "admin_event_capacity_collecting",
          {
            ...adminEvents,
            mode: "confirm_edit_capacity",
            draft: { sectionId, newCapacity },
          },
        ),
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
          "Dados invÃƒÂ¡lidos. Envie: nÃƒÂºmero do setor | nova carga.",
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
        reply: "Esse setor usa assento marcado. Ajuste a carga pelo fluxo de ediÃƒÂ§ÃƒÂ£o de assentos.",
        nextContext: withAdminEventsContext(baseContext, "admin_event_edit_menu", {
          selectedEventId: eventId,
        }),
      };
    }

    return {
      reply: [
        "Confirmar alteraÃƒÂ§ÃƒÂ£o de carga?",
        `Setor: ${section.name}`,
        `Carga atual: ${section.capacity ?? "nÃƒÂ£o definida"}`,
        `Nova carga: ${newCapacity}`,
        "",
        "A reduÃƒÂ§ÃƒÂ£o sÃƒÂ³ bloqueia unidades disponÃƒÂ­veis. Vendidos e reservados nÃƒÂ£o sÃƒÂ£o alterados.",
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
          : "NÃƒÂ£o consegui atualizar o setor.",
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
          : "NÃƒÂ£o consegui criar o setor. Verifique se o slug jÃƒÂ¡ existe nesse local.",
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
          reply: "Dados invÃƒÂ¡lidos. Use: 1 | Pista Premium | 500 | active | sim",
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
            reply: "NÃƒÂ£o consegui verificar reservas/ingressos desse setor agora.",
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
              "Esse setor jÃƒÂ¡ tem reservas, ingressos ou assentos de sessÃƒÂ£o ocupados.",
              "Para evitar quebrar vendas existentes, a alteraÃƒÂ§ÃƒÂ£o de assento marcado foi bloqueada neste fluxo.",
            ].join("\n"),
            nextContext: withAdminEventsContext(baseContext, "admin_event_sections_menu", {
              selectedEventId: eventId,
            }),
          };
        }
      }

      return {
        reply: [
          "Confirmar alteraÃƒÂ§ÃƒÂ£o do setor?",
          `Setor: ${section.name}`,
          `Novo nome: ${nameRaw}`,
          `Capacidade: ${capacity ?? "nÃƒÂ£o definida"}`,
          `Status: ${status}`,
          `Assento marcado: ${hasNumberedSeats ? "sim" : "nÃƒÂ£o"}`,
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
        reply: "Dados invÃƒÂ¡lidos. Use: Pista Premium | 500 | sim",
        nextContext: withAdminEventsContext(baseContext, "admin_event_section_create_collecting", adminEvents),
      };
    }
    return {
      reply: [
        "Confirmar criaÃƒÂ§ÃƒÂ£o do setor?",
        `Nome: ${nameRaw}`,
        `Slug: ${slug}`,
        `Capacidade: ${capacity ?? "nÃƒÂ£o definida"}`,
        `Assento marcado: ${hasNumberedSeats ? "sim" : "nÃƒÂ£o"}`,
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
          ? `Assentos atualizados: ${result.updatedCount}. NÃƒÂ£o encontrados: ${result.missingCount}.`
          : "NÃƒÂ£o consegui atualizar os assentos.",
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
          : "NÃƒÂ£o consegui criar os assentos.",
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
          reply: "Dados invÃƒÂ¡lidos. Use: 1 | blocked | A01,A02",
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
            reply: "NÃƒÂ£o consegui verificar reservas/vendas desses assentos agora.",
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
              "Um ou mais assentos informados estÃƒÂ£o reservados ou vendidos em alguma sessÃƒÂ£o.",
              "A alteraÃƒÂ§ÃƒÂ£o estrutural foi bloqueada para nÃƒÂ£o afetar vendas existentes.",
            ].join("\n"),
            nextContext: withAdminEventsContext(baseContext, "admin_event_sections_menu", {
              selectedEventId: eventId,
            }),
          };
        }
      }

      return {
        reply: [
          "Confirmar alteraÃƒÂ§ÃƒÂ£o dos assentos?",
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
        reply: "Dados invÃƒÂ¡lidos. Use: 1 | A01,A02,A03",
        nextContext: withAdminEventsContext(baseContext, "admin_event_seats_create_collecting", adminEvents),
      };
    }
    if (!section.hasNumberedSeats) {
      return {
        reply: "Esse setor nÃƒÂ£o usa assento marcado. Altere o setor com cuidado antes de cadastrar assentos.",
        nextContext: withAdminEventsContext(baseContext, "admin_event_sections_menu", {
          selectedEventId: eventId,
        }),
      };
    }
    return {
      reply: [
        "Confirmar criaÃƒÂ§ÃƒÂ£o de assentos?",
        `Setor: ${section.name}`,
        `Quantidade: ${seatCodes.length}`,
        `PrÃƒÂ©via: ${seatCodes.slice(0, 20).join(", ")}${seatCodes.length > 20 ? "..." : ""}`,
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
          ? `Assentos da sessÃƒÂ£o criados: ${result.createdCount}. JÃƒÂ¡ existentes: ${result.skippedCount}.`
          : "NÃƒÂ£o consegui criar os assentos da sessÃƒÂ£o.",
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
        reply: "Dados invÃƒÂ¡lidos. Use: 1 | todos ou 1 | 2",
        nextContext: withAdminEventsContext(baseContext, "admin_event_session_seats_confirm", adminEvents),
      };
    }
    return {
      reply: [
        "Confirmar criaÃƒÂ§ÃƒÂ£o de assentos da sessÃƒÂ£o?",
        `SessÃƒÂ£o: ${formatDateTime(session.startsAt)}`,
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
                  : ["Nenhum preÃƒÂ§o cadastrado."]),
              ].join("\n")
            : list.reply,
          "",
          "*QUAL VALOR DESEJA ALTERAR?*",
          "Responda com o nÃƒÂºmero.",
        ].join("\n"),
        nextContext: withAdminEventsContext(baseContext, "admin_event_price_edit_collecting", {
          ...adminEvents,
          mode: "select_price_value",
          draft: list.ok ? { lastPrices: list.prices } : {},
        }),
      };
    }
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
          ? "PreÃƒÂ§o/lote atualizado. Reservas jÃƒÂ¡ criadas mantÃƒÂªm o valor congelado."
          : "NÃƒÂ£o consegui atualizar o preÃƒÂ§o/lote.",
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
            "VALOR INVÃƒÂLIDO",
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
      const persistedPriceCents = result.ok
        ? result.price.price_cents
        : null;

      return {
        reply: withAdminNavigationHint([
          result.ok ? "*VALOR ATUALIZADO*" : "NÃƒÂ£o consegui atualizar o valor.",
          ...(result.ok
            ? [
                `> PreÃƒÂ§o: ${String(adminEvents.draft?.priceLabel ?? "PreÃƒÂ§o")}`,
                `> Valor anterior: ${formatCurrencyFromCents(Number(adminEvents.draft?.oldPriceCents ?? 0))}`,
                `> Novo valor confirmado no banco: ${formatCurrencyFromCents(persistedPriceCents ?? priceCents)}`,
                "",
                "Reservas jÃƒÂ¡ criadas mantÃƒÂªm o valor congelado. A alteraÃƒÂ§ÃƒÂ£o afeta novas reservas.",
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
        reply: "Valor invÃƒÂ¡lido. Responda com o nÃƒÂºmero do valor que deseja alterar.",
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
          reply: "Status invÃƒÂ¡lido. Use active ou inactive.",
          nextContext: withAdminEventsContext(
            baseContext,
            "admin_event_price_edit_collecting",
            adminEvents,
          ),
        };
      }

      return {
        reply: [
          "Confirmar alteraÃƒÂ§ÃƒÂ£o do preÃƒÂ§o/lote?",
          `PreÃƒÂ§o: ${price.label}`,
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
      reply: "Responda somente com o nÃƒÂºmero do valor que deseja alterar.",
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
          ? "PreÃƒÂ§o/lote criado."
          : "NÃƒÂ£o consegui criar o preÃƒÂ§o. Se jÃƒÂ¡ existir esse tipo para sessÃƒÂ£o/setor, use ediÃƒÂ§ÃƒÂ£o.",
        nextContext: withAdminEventsContext(baseContext, "admin_event_prices_menu", {
          selectedEventId: eventId,
        }),
      };
    }

    const details = await getScopedAdminEventDetails(eventId, scope);
    if (!details.ok) return null;

    if (adminEvents.mode === "shortcut_special_sale") {
      const parts = text.split("|").map((part) => part.trim());
      const fixedSessionId = String(adminEvents.draft?.sessionId ?? "");
      const session = fixedSessionId
        ? details.event.sessions.find((item) => item.sessionId === fixedSessionId)
        : details.event.sessions[Number(parts.shift()) - 1];
      const [label, priceRaw, feeRaw, salesStartRaw, salesEndRaw] = parts;
      const sectionId = String(adminEvents.draft?.sectionId ?? "");
      const section = details.event.sections.find((item) => item.sectionId === sectionId);
      const priceCents = parseMoneyToCents(priceRaw ?? "");
      const feeCents = parseMoneyToCents(feeRaw || "0");
      const salesStart = parseOptionalAdminDateTime(salesStartRaw);
      const salesEnd = parseOptionalAdminDateTime(salesEndRaw);

      if (
        !session ||
        !section ||
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
          reply: fixedSessionId
            ? "Dados invÃƒÂ¡lidos. Use: Lote promocional | 60,00 | 0 | - | -"
            : "Dados invÃƒÂ¡lidos. Use: 1 | Lote promocional | 60,00 | 0 | - | -",
          nextContext: withAdminEventsContext(
            baseContext,
            "admin_event_price_create_collecting",
            adminEvents,
          ),
        };
      }

      return {
        reply: [
          "Confirmar criaÃƒÂ§ÃƒÂ£o da venda especial?",
          `Evento: ${details.event.title}`,
          `SessÃƒÂ£o: ${formatDateTime(session.startsAt)}`,
          `Setor: ${section.name}`,
          `Oferta: ${label}`,
          `PreÃƒÂ§o: ${formatCurrencyFromCents(priceCents)}`,
          `Taxa: ${formatCurrencyFromCents(feeCents)}`,
          `InÃƒÂ­cio: ${salesStart.value ? formatDateTime(salesStart.value) : "livre"}`,
          `Fim: ${salesEnd.value ? formatDateTime(salesEnd.value) : "livre"}`,
          "",
          "Responda CONFIRMAR ou CANCELAR.",
        ].join("\n"),
        nextContext: withAdminEventsContext(
          baseContext,
          "admin_event_price_create_collecting",
          {
            ...adminEvents,
            mode: "confirm_create_price",
            draft: {
              sessionId: session.sessionId,
              sectionId: section.sectionId,
              ticketType: "promotional",
              label,
              priceCents,
              feeCents,
              salesStartAt: salesStart.value,
              salesEndAt: salesEnd.value,
            },
          },
        ),
      };
    }

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
        reply: "Dados invÃƒÂ¡lidos. Use: 1 | 1 | full | Inteira | 120,00 | 12,00 | - | -",
        nextContext: withAdminEventsContext(baseContext, "admin_event_price_create_collecting", adminEvents),
      };
    }
    return {
      reply: [
        "Confirmar criaÃƒÂ§ÃƒÂ£o do preÃƒÂ§o/lote?",
        `SessÃƒÂ£o: ${formatDateTime(session.startsAt)}`,
        `Setor: ${section.name}`,
        `Tipo: ${ticketType}`,
        `Label: ${label}`,
        `PreÃƒÂ§o: ${formatCurrencyFromCents(priceCents)}`,
        `Taxa: ${formatCurrencyFromCents(feeCents)}`,
        "Moeda: BRL",
        `InÃƒÂ­cio: ${salesStart.value ? formatDateTime(salesStart.value) : "livre"}`,
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
    return "NÃƒÂ£o temos essa quantidade disponÃƒÂ­vel nesse ingresso/setor. Envie uma quantidade menor.";
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

async function renderNoSeatsWithAlternatives({
  baseContext,
  selectedEvent,
}: {
  baseContext: TicketConversationState;
  selectedEvent?: TicketConversationSelectedEvent;
}): Promise<RouteTicketMessageOutput> {
  const alternatives = await renderBuyerSectionsStep({
    baseContext,
    selectedEvent,
  });

  return {
    ...alternatives,
    reply: [
      TICKET_MESSAGES.noSeatsAvailable,
      "",
      alternatives.reply,
      "",
      'Digite "SAIR" para voltar ao inÃƒÂ­cio.',
    ].join("\n"),
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
      "Depois de confirmar a senha, envie aqui o cÃƒÂ³digo de uso ÃƒÂºnico exibido na pÃƒÂ¡gina.",
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
          authChallengePurpose: "admin_menu",
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
                  ? "O acesso foi bloqueado atÃƒÂ© liberaÃƒÂ§ÃƒÂ£o manual por Diretor."
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
        reply: renderGateAccessPassphrasePrompt(
          selected.eventTitle,
          baseContext.gateAccess?.mode ?? "gate",
        ),
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
          "NÃƒÂ£o encontrei acesso de portaria ativo para este telefone.",
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
      purpose: baseContext.gateAccess?.mode ?? "gate",
    });

    if (!gateSessionResult.ok) {
      return {
        reply:
          gateSessionResult.reason === "invalid_passphrase"
            ? "Palavra-chave invÃƒÂ¡lida."
            : "NÃƒÂ£o encontrei acesso de portaria ativo para este telefone.",
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

    const kitchenMode = baseContext.gateAccess?.mode === "kitchen";

    return {
      reply: kitchenMode
        ? buildKitchenCheckInReply({
            kitchenUrl: gateSessionResult.gateUrl,
            offerReaderUrl: buildOfferReaderUrl(gateSessionResult.token),
            expiresAt: gateSessionResult.gateSession.expires_at,
          })
        : buildGateCheckInReply({
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
        delete nextContext.adminOffers;
        delete nextContext.adminUsers;
        delete nextContext.adminGate;
        delete nextContext.adminOrders;
        delete nextContext.adminReports;
      } else {
        if (!state.startsWith("admin_courtesy")) {
        delete nextContext.adminCourtesies;
        }

        if (!state.startsWith("admin_offer") && state !== "admin_offers_menu") {
          delete nextContext.adminOffers;
        }
      }

      return nextContext;
    };

    const endAdminSession = async () => {
      await revokeActiveAdminSessions(customer.whatsapp_phone);

      return {
        reply: "SessÃƒÂ£o administrativa encerrada com seguranÃƒÂ§a.\n\nPara acessar novamente, envie admin.",
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

    if (/^\d{6,}$/.test(text.trim())) {
      const codeResult = await consumeAdminLoginChallengeCode({
        phone: customer.whatsapp_phone,
        code: text,
        challengeId: previousState.admin?.authChallengeId,
        sourceIdentifier,
      });

      if (!codeResult.ok) {
        return {
          reply: TICKET_MESSAGES.adminAuthInvalid,
          nextContext: adminReplyContext({
            state: "admin_menu",
            role: adminUser.role,
            sessionId: adminSession.id,
            adminUserId: adminUser.id,
            expiresAt: adminSession.expires_at,
          }),
        };
      }

      const refreshedSessionResult = await createAdminSession(codeResult.adminUser);

      return {
        reply: refreshedSessionResult.ok
          ? previousState.admin?.authChallengePurpose === "event_editor"
            ? renderAdminBrowserEventEditorUnlockedReply()
            : formatAdminMenu(codeResult.adminUser.role)
          : TICKET_MESSAGES.adminGenericError,
        nextContext: adminReplyContext({
          state: "admin_menu",
          role: codeResult.adminUser.role,
          sessionId: refreshedSessionResult.ok
            ? refreshedSessionResult.adminSession.id
            : adminSession.id,
          adminUserId: codeResult.adminUser.id,
          expiresAt: refreshedSessionResult.ok
            ? refreshedSessionResult.adminSession.expires_at
            : adminSession.expires_at,
        }),
      };
    }

    if (reservedAdminCommand) {
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

    if (normalizeAdminText(text) === "sistema cozinha") {
      const kitchenMenu = ADMIN_SUBMENUS.admin_kitchen_menu;

      if (!canAccessAdminMenu(adminUser.role, kitchenMenu)) {
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

      const shortcutContext = adminReplyContext({
        state: "admin_kitchen_menu",
        role: adminUser.role,
        sessionId: adminSession.id,
        adminUserId: adminUser.id,
        expiresAt: adminSession.expires_at,
      });
      const freshAuth = await requireFreshAdminPermission({
        baseContext: shortcutContext,
        scope: buildFreshAdminScope(adminUser),
        permission: "manage_gate",
        operation: "admin_kitchen_global_session_create",
      });
      if (!freshAuth.ok) return freshAuth.response;

      const gateSessionResult = await createGateSession({
        validatorPhone: freshAuth.scope.adminPhone,
        createdByAdminPhone: freshAuth.scope.adminPhone,
        gateLabel: "Cozinha",
        replaceActiveSessions: true,
        ttlMinutes: 8 * 60,
      });

      return {
        reply: gateSessionResult.ok
          ? buildKitchenCheckInReply({
              kitchenUrl: buildKitchenUrl(gateSessionResult.token),
              offerReaderUrl: buildOfferReaderUrl(gateSessionResult.token),
              expiresAt: gateSessionResult.gateSession.expires_at,
            })
          : TICKET_MESSAGES.gateAdminCreateError,
        nextContext: adminReplyContext({
          state: "admin_kitchen_menu",
          role: adminUser.role,
          sessionId: adminSession.id,
          adminUserId: adminUser.id,
          expiresAt: adminSession.expires_at,
        }),
      };
    }

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

    if (typedMainMenuOption === ADMIN_MAIN_EXIT_OPTION) {
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

    const eventShortcut = parseAdminEventShortcut(text);
    if (eventShortcut) {
      if (!eventShortcut.action) {
        const suggestions = suggestAdminShortcutActions(eventShortcut.actionText);
        return {
          reply: withAdminNavigationHint([
            `NÃƒÂ£o reconheci a aÃƒÂ§ÃƒÂ£o "${eventShortcut.actionText}".`,
            "",
            "VocÃƒÂª quis dizer:",
            ...suggestions.map(
              ({ label }) => `- ${formatAdminEventShortcutCommand(label, eventShortcut.eventQuery, eventShortcut.period, eventShortcut.targetQuery)}`,
            ),
          ].join("\n")),
          nextContext: baseContext,
        };
      }

      const permissionByAction: Record<AdminEventShortcutAction, AdminPermission> = {
        event_details: "manage_events",
        event_edit: "manage_events",
        event_status: "manage_events",
        event_duplicate: "manage_events",
        event_sessions: "manage_events",
        event_sections: "manage_events",
        event_prices: "manage_events",
        increase_tickets: "manage_events",
        create_section: "manage_events",
        create_special_sale: "manage_events",
        event_summary: "view_reports",
        section_sales: "view_reports",
        pending_payments: "view_reports",
        expired_reservations: "view_reports",
        gate_checkins: "view_reports",
        ticket_usage: "view_reports",
        courtesy_report: "view_reports",
        list_courtesies: "manage_courtesies",
        add_courtesy: "manage_courtesies",
        resend_courtesy: "manage_courtesies",
        cancel_courtesy: "manage_courtesies",
        edit_title: "manage_events",
        edit_artist: "manage_events",
        edit_city: "manage_events",
        edit_state: "manage_events",
        edit_venue: "manage_events",
        edit_image: "manage_events",
        edit_datetime: "manage_events",
        edit_description: "manage_events",
        gate_menu: "manage_gate",
        gate_self_checkin: "manage_gate",
        gate_register: "manage_gate",
        gate_accesses: "manage_gate",
        gate_revoke: "manage_gate",
      };
      const permission = permissionByAction[eventShortcut.action];

      if (!hasAdminPermission(adminUser.role, permission)) {
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

      const resolvedEvent = await resolveAdminShortcutEvent(
        eventShortcut.eventQuery,
        buildAdminEventScope(adminUser),
      );

      if (!resolvedEvent.ok) {
        const candidates = resolvedEvent.matches ?? [];
        const actionLabel = getAdminShortcutActionLabel(eventShortcut.action);
        return {
          reply: withAdminNavigationHint([
            resolvedEvent.reason === "ambiguous"
              ? "Encontrei mais de um evento. Digite o nome mais completo:"
              : `NÃƒÂ£o encontrei exatamente o evento "${eventShortcut.eventQuery}". VocÃƒÂª quis dizer:`,
            ...(candidates.length
              ? [
                  "",
                  ...candidates.map(
                    (event) => [
                      `- ${formatAdminEventShortcutCommand(actionLabel, event.title, eventShortcut.period, eventShortcut.targetQuery)}`,
                    ].join("\n"),
                  ),
                ]
              : []),
          ].join("\n")),
          nextContext: baseContext,
        };
      }

      const freshAuth = await requireFreshAdminPermission({
        baseContext,
        scope: buildFreshAdminScope(adminUser),
        permission,
        operation: `admin_shortcut_${eventShortcut.action}`,
      });
      if (!freshAuth.ok) return freshAuth.response;

      const selectedEvent = resolvedEvent.event;

      if (eventShortcut.action === "create_section") {
        return {
          reply: [
            "*CRIAR NOVO SETOR*",
            `Evento: ${selectedEvent.title}`,
            "",
            "Envie: nome do setor | capacidade | numerado sim/nÃƒÂ£o.",
            "Ex: Pista Premium | 500 | nÃƒÂ£o",
          ].join("\n"),
          nextContext: withAdminEventsContext(
            baseContext,
            "admin_event_section_create_collecting",
            { selectedEventId: selectedEvent.eventId },
          ),
        };
      }

      if (
        eventShortcut.action === "increase_tickets" ||
        eventShortcut.action === "create_special_sale"
      ) {
        const details = await getScopedAdminEventDetails(
          selectedEvent.eventId,
          buildAdminEventScope(adminUser),
        );
        if (!details.ok) {
          return { reply: "NÃƒÂ£o encontrei esse evento.", nextContext: baseContext };
        }

        if (eventShortcut.action === "increase_tickets" && !eventShortcut.targetQuery) {
          return {
            reply: [
              "*AUMENTAR INGRESSOS*",
              `Evento: ${selectedEvent.title}`,
              "",
              await renderCapacityShortcutSectionsList(
                selectedEvent.eventId,
                buildAdminEventScope(adminUser),
              ),
              "",
              "Envie: nÃƒÂºmero do setor | nova carga.",
              "Ex: 1 | 500",
            ].join("\n"),
            nextContext: withAdminEventsContext(baseContext, "admin_event_capacity_collecting", {
              selectedEventId: selectedEvent.eventId,
            }),
          };
        }

        if (eventShortcut.action === "create_special_sale" && !eventShortcut.targetQuery) {
          const actionLabel = getAdminShortcutActionLabel(eventShortcut.action);
          return {
            reply: withAdminNavigationHint([
              "Escolha o setor da venda especial:",
              "",
              ...details.event.sections.map(
                (section) => `- ${formatAdminEventShortcutCommand(
                  actionLabel,
                  selectedEvent.title,
                  undefined,
                  section.name,
                )}`,
              ),
            ].join("\n")),
            nextContext: baseContext,
          };
        }

        const resolvedSection = resolveAdminShortcutSection(
          eventShortcut.targetQuery ?? "",
          details.event.sections,
        );
        if (!resolvedSection.ok) {
          const actionLabel = getAdminShortcutActionLabel(eventShortcut.action);
          if (eventShortcut.action === "increase_tickets" && resolvedSection.matches.length) {
            const sectionOptions = resolvedSection.matches.map((section, index) => ({
              option: index + 1,
              sectionId: section.sectionId,
              name: section.name,
              capacity: section.capacity,
              hasNumberedSeats: section.hasNumberedSeats,
            }));

            return {
              reply: withAdminNavigationHint([
                resolvedSection.reason === "ambiguous"
                  ? `Encontrei mais de um setor para "${eventShortcut.targetQuery}". Digite o nÃƒÂºmero:`
                  : `NÃƒÂ£o encontrei exatamente o setor "${eventShortcut.targetQuery}". VocÃƒÂª quis dizer:`,
                "",
                ...sectionOptions.map(
                  (section) =>
                    `> ${formatOptionLine(section.option, section.name, { preserveCase: true })} - *capacidade: ${section.capacity ?? "nÃƒÂ£o definida"}*`,
                ),
              ].join("\n")),
              nextContext: withAdminEventsContext(
                baseContext,
                "admin_event_capacity_collecting",
                {
                  selectedEventId: selectedEvent.eventId,
                  mode: "shortcut_capacity_section_select",
                  draft: { lastSections: sectionOptions },
                },
              ),
            };
          }

          return {
            reply: withAdminNavigationHint([
              resolvedSection.reason === "ambiguous"
                ? "Encontrei mais de um setor. Digite o nome mais completo:"
                : `NÃƒÂ£o encontrei o setor "${eventShortcut.targetQuery}". VocÃƒÂª quis dizer:`,
              "",
              ...resolvedSection.matches.map(
                (section) => `- ${formatAdminEventShortcutCommand(
                  actionLabel,
                  selectedEvent.title,
                  undefined,
                  section.name,
                )}`,
              ),
            ].join("\n")),
            nextContext: baseContext,
          };
        }

        const section = resolvedSection.section;
        if (eventShortcut.action === "increase_tickets") {
          if (section.hasNumberedSeats) {
            return {
              reply: [
                `Evento: ${selectedEvent.title}`,
                `Setor: ${section.name}`,
                "",
                "Esse setor usa assentos marcados. Para aumentar a carga, primeiro cadastre os novos assentos.",
              ].join("\n"),
              nextContext: baseContext,
            };
          }
          return {
            reply: [
              "*AUMENTAR INGRESSOS*",
              `Evento: ${selectedEvent.title}`,
              `Setor: ${section.name}`,
              `Carga atual: ${section.capacity ?? "nÃƒÂ£o definida"}`,
              "",
              "Digite a nova carga total do setor. Ex: 500",
            ].join("\n"),
            nextContext: withAdminEventsContext(
              baseContext,
              "admin_event_capacity_collecting",
              {
                selectedEventId: selectedEvent.eventId,
                mode: "shortcut_capacity",
                draft: { sectionId: section.sectionId },
              },
            ),
          };
        }

        if (details.event.sessions.length === 0) {
          return {
            reply: "Esse evento ainda nÃƒÂ£o tem sessÃƒÂ£o para receber uma venda especial.",
            nextContext: baseContext,
          };
        }
        const multipleSessions = details.event.sessions.length > 1;
        return {
          reply: [
            "*CRIAR VENDA ESPECIAL*",
            `Evento: ${selectedEvent.title}`,
            `Setor: ${section.name}`,
            ...(multipleSessions
              ? [
                  "",
                  "SessÃƒÂµes:",
                  ...details.event.sessions.map((session, index) =>
                    `${index + 1}. ${formatDateTime(session.startsAt)}`,
                  ),
                ]
              : []),
            "",
            multipleSessions
              ? "Envie: sessÃƒÂ£o | nome da oferta | valor | taxa opcional | inÃƒÂ­cio opcional | fim opcional"
              : "Envie: nome da oferta | valor | taxa opcional | inÃƒÂ­cio opcional | fim opcional",
            multipleSessions
              ? "Ex: 1 | Lote promocional | 60,00 | 0 | - | -"
              : "Ex: Lote promocional | 60,00 | 0 | - | -",
          ].join("\n"),
          nextContext: withAdminEventsContext(
            baseContext,
            "admin_event_price_create_collecting",
            {
              selectedEventId: selectedEvent.eventId,
              mode: "shortcut_special_sale",
              draft: {
                sectionId: section.sectionId,
                sectionName: section.name,
                sessionId: multipleSessions
                  ? undefined
                  : details.event.sessions[0].sessionId,
              },
            },
          ),
        };
      }

      const reportTypeByShortcut: Partial<Record<
        AdminEventShortcutAction,
        Exclude<AdminReportType, "summary" | "division">
      >> = {
        event_summary: "sales_event",
        section_sales: "sales_section",
        pending_payments: "pending_payments",
        expired_reservations: "expired_cancelled_reservations",
        gate_checkins: "gate_checkins",
        ticket_usage: "ticket_usage",
        courtesy_report: "courtesies",
      };
      const shortcutReportType = reportTypeByShortcut[eventShortcut.action];

      if (shortcutReportType) {
        try {
          const report = await buildAdminReport({
            eventId: selectedEvent.eventId,
            type: shortcutReportType,
            period: eventShortcut.period ?? { label: "Todo o perÃƒÂ­odo" },
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
          logError("Failed to build report from admin shortcut", {
            error,
            eventId: selectedEvent.eventId,
            action: eventShortcut.action,
          });
          return {
            reply: TICKET_MESSAGES.adminGenericError,
            nextContext: baseContext,
          };
        }
      }

      if (eventShortcut.action === "event_details") {
        return showAdminEventDetails(
          baseContext,
          buildAdminEventScope(adminUser),
          selectedEvent.eventId,
        );
      }

      if (
        eventShortcut.action === "event_sessions" ||
        eventShortcut.action === "event_sections" ||
        eventShortcut.action === "event_prices"
      ) {
        const scope = buildAdminEventScope(adminUser);
        if (eventShortcut.action === "event_sessions") {
          return showAdminEventSessionsMenu(baseContext, scope, selectedEvent.eventId);
        }
        if (eventShortcut.action === "event_sections") {
          return showAdminEventSectionsMenu(baseContext, scope, selectedEvent.eventId);
        }
        return showAdminEventPricesMenu(baseContext, scope, selectedEvent.eventId);
      }

      if (
        eventShortcut.action === "event_edit" ||
        eventShortcut.action === "event_status" ||
        eventShortcut.action === "event_duplicate"
      ) {
        const details = await getScopedAdminEventDetails(
          selectedEvent.eventId,
          buildAdminEventScope(adminUser),
        );
        if (!details.ok) {
          return { reply: "NÃƒÂ£o encontrei esse evento.", nextContext: baseContext };
        }

        if (eventShortcut.action === "event_edit") {
          return {
            reply: renderAdminEventEditMenu(details.event.title),
            nextContext: withAdminEventsContext(baseContext, "admin_event_edit_menu", {
              selectedEventId: selectedEvent.eventId,
            }),
          };
        }
        if (eventShortcut.action === "event_status") {
          return {
            reply: renderAdminEventStatusMenu(details.event),
            nextContext: withAdminEventsContext(baseContext, "admin_event_status_select", {
              selectedEventId: selectedEvent.eventId,
            }),
          };
        }
        return {
          reply: renderAdminEventDuplicateConfirmReply(details.event),
          nextContext: withAdminEventsContext(baseContext, "admin_event_duplicate_confirm", {
            selectedEventId: selectedEvent.eventId,
          }),
        };
      }

      if (eventShortcut.action === "list_courtesies") {
        const list = await listCourtesiesForEvent(selectedEvent.eventId);
        return {
          reply: list.ok
            ? [
                "*VER CORTESIAS*",
                `Evento: ${selectedEvent.title}`,
                "",
                buildCourtesiesListReply(list.courtesies),
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

      if (
        eventShortcut.action === "resend_courtesy" ||
        eventShortcut.action === "cancel_courtesy"
      ) {
        const list = await listCourtesiesForEvent(selectedEvent.eventId);
        if (!list.ok || list.courtesies.length === 0) {
          return {
            reply: list.ok
              ? `Nenhuma cortesia encontrada para o evento ${selectedEvent.title}.`
              : TICKET_MESSAGES.adminGenericError,
            nextContext: baseContext,
          };
        }
        const isResend = eventShortcut.action === "resend_courtesy";
        const nextState = isResend
          ? "admin_courtesy_resend_select"
          : "admin_courtesy_cancel_select";
        return {
          reply: [
            `Evento: ${selectedEvent.title}`,
            "",
            buildCourtesiesListReply(list.courtesies, { selectable: true }),
            "",
            isResend
              ? "*QUAL CORTESIA DESEJA REENVIAR?*"
              : "*QUAL CORTESIA DESEJA CANCELAR?*",
            "Responda com o nÃƒÂºmero da cortesia.",
          ].join("\n"),
          nextContext: withAdminCourtesiesContext(baseContext, nextState, {
            mode: isResend ? "resend" : "cancel",
            selectedEventId: selectedEvent.eventId,
            selectedEventTitle: selectedEvent.title,
            lastCourtesies: list.courtesies.map((courtesy, index) => ({
              option: index + 1,
              courtesyId: courtesy.courtesyId,
              phone: courtesy.phone,
              ticketCode: courtesy.ticketCode,
            })),
          }),
        };
      }

      if (eventShortcut.action === "add_courtesy") {
        const sessions = await listCourtesySessions(selectedEvent.eventId);
        if (!sessions.ok || sessions.sessions.length === 0) {
          return {
            reply: "Nenhuma sessÃƒÂ£o disponÃƒÂ­vel para gerar cortesia neste evento.",
            nextContext: adminReplyContext({
              state: "admin_courtesies_menu",
              role: adminUser.role,
              sessionId: adminSession.id,
              adminUserId: adminUser.id,
              expiresAt: adminSession.expires_at,
            }),
          };
        }

        const shortcutContext = adminReplyContext({
          state: "admin_courtesy_session_select",
          role: adminUser.role,
          sessionId: adminSession.id,
          adminUserId: adminUser.id,
          expiresAt: adminSession.expires_at,
        });
        return {
          reply: [
            "*ADICIONAR CORTESIA*",
            `Evento: ${selectedEvent.title}`,
            "",
            buildCourtesySessionsReply(sessions.sessions),
          ].join("\n"),
          nextContext: withAdminCourtesiesContext(
            shortcutContext,
            "admin_courtesy_session_select",
            {
              mode: "generate",
              selectedEventId: selectedEvent.eventId,
              selectedEventTitle: selectedEvent.title,
              lastSessions: sessions.sessions.map((session) => ({
                option: session.option,
                sessionId: session.sessionId,
                startsAt: session.startsAt,
                status: session.status,
              })),
            },
          ),
        };
      }

      if (eventShortcut.action === "gate_menu") {
        return {
          reply: withAdminNavigationHint([
            `*PORTARIA Ã¢â‚¬â€ ${selectedEvent.title.toUpperCase()}*`,
            "",
            `- check-in neste telefone, ${selectedEvent.title}`,
            `- definir outro telefone, ${selectedEvent.title}`,
            `- ver acessos, ${selectedEvent.title}`,
            `- revogar acessos, ${selectedEvent.title}`,
          ].join("\n")),
          nextContext: baseContext,
        };
      }

      if (eventShortcut.action === "gate_self_checkin") {
        const gateSessionResult = await createGateSession({
          validatorPhone: freshAuth.scope.adminPhone,
          createdByAdminPhone: freshAuth.scope.adminPhone,
          gateLabel: "Check-in",
          eventId: selectedEvent.eventId,
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

      if (eventShortcut.action === "gate_register") {
        return {
          reply: [
            `*DEFINIR OUTRO TELEFONE Ã¢â‚¬â€ ${selectedEvent.title.toUpperCase()}*`,
            "",
            renderGateValidatorPhonePrompt(),
          ].join("\n"),
          nextContext: withAdminGateContext(
            baseContext,
            "admin_gate_validator_collecting",
            {
              mode: "register",
              selectedEventId: selectedEvent.eventId,
            },
          ),
        };
      }

      if (eventShortcut.action === "gate_accesses") {
        return {
          reply: `Evento: ${selectedEvent.title}\n\n${renderGateAccessFilterMenu()}`,
          nextContext: withAdminGateContext(
            baseContext,
            "admin_gate_accesses_filter",
            {
              mode: "list",
              selectedEventId: selectedEvent.eventId,
            },
          ),
        };
      }

      if (eventShortcut.action === "gate_revoke") {
        const accesses = await listGateAccesses({
          filter: "open",
          eventId: selectedEvent.eventId,
        });
        if (!accesses.ok) {
          return { reply: TICKET_MESSAGES.adminGenericError, nextContext: baseContext };
        }
        return {
          reply: [
            `Evento: ${selectedEvent.title}`,
            "",
            renderGateAccessesList({
              title: "REVOGAR ACESSOS",
              accesses: accesses.accesses,
              selectable: true,
            }),
            "",
            "Digite o nÃƒÂºmero do acesso que deseja pausar.",
          ].join("\n"),
          nextContext: withAdminGateContext(
            baseContext,
            "admin_gate_revoke_select",
            {
              mode: "revoke",
              selectedEventId: selectedEvent.eventId,
              lastGateAccesses: accesses.accesses.map((access, index) => ({
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

      const editFieldByAction: Partial<Record<AdminEventShortcutAction, string>> = {
        edit_title: "title",
        edit_artist: "artist_name",
        edit_city: "city",
        edit_state: "state",
        edit_venue: "venue",
        edit_image: "image_url",
        edit_datetime: "starts_at",
        edit_description: "description",
      };
      const field = editFieldByAction[eventShortcut.action];
      if (!field) {
        return { reply: TICKET_MESSAGES.adminGenericError, nextContext: baseContext };
      }
      const shortcutContext = adminReplyContext({
        state: "admin_event_edit_collecting",
        role: adminUser.role,
        sessionId: adminSession.id,
        adminUserId: adminUser.id,
        expiresAt: adminSession.expires_at,
      });
      const promptByField: Record<string, string> = {
        title: "Envie o novo nome.",
        artist_name: "Envie o novo artista ou atraÃƒÂ§ÃƒÂ£o.",
        city: "Envie a nova cidade. Ex: Sorocaba",
        state: "Envie o novo estado/UF. Ex: SP",
        venue: "Envie o novo nome do local.",
        image_url: "Envie a nova foto ou cole uma URL pÃƒÂºblica https://...",
        starts_at: "Envie: nÃƒÂºmero da sessÃƒÂ£o | nova data/hora. Ex: 1 | 10/06/2026 22:00",
        description: "Envie as novas informaÃƒÂ§ÃƒÂµes gerais do evento.",
      };
      return {
        reply: `*${getAdminShortcutActionLabel(eventShortcut.action).toUpperCase()}*\n\nEvento: ${selectedEvent.title}\n\n${promptByField[field]}`,
        nextContext: withAdminEventsContext(
          shortcutContext,
          "admin_event_edit_collecting",
          {
            selectedEventId: selectedEvent.eventId,
            field,
            draft: { eventTitle: selectedEvent.title },
          },
        ),
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

      if (baseContext.state === "admin_order_code_collecting") {
        const ticket = await findAdminTicketByCode(text);

        if (!ticket) {
          return {
            reply: withAdminNavigationHint(
              "Ingresso nÃƒÂ£o encontrado. Confira o cÃƒÂ³digo e tente novamente.",
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

        const reply = [
          "*INGRESSO ENCONTRADO*",
          "",
          formatAdminTicket(ticket),
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
              "Escolha uma reserva da lista ou envie outro telefone/cÃƒÂ³digo para buscar.",
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
              "Digite o nÃƒÂºmero da reserva que deseja cancelar.",
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
                  "Reserva pendente nÃƒÂ£o encontrada. A aÃƒÂ§ÃƒÂ£o nÃƒÂ£o foi executada.",
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
              "Reserva pendente nÃƒÂ£o encontrada. A aÃƒÂ§ÃƒÂ£o nÃƒÂ£o foi executada.",
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
                ? "Essa reserva nÃƒÂ£o estÃƒÂ¡ mais pendente ou nÃƒÂ£o pode ser cancelada."
                : "NÃƒÂ£o foi possÃƒÂ­vel cancelar a reserva agora. Tente novamente.",
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
            reply: "Evento nÃƒÂ£o encontrado. Responda com nÃƒÂºmero, nome ou ID.",
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
            reply: "Nenhuma sessÃƒÂ£o disponÃƒÂ­vel para gerar cortesia neste evento.",
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
            reply: "SessÃƒÂ£o nÃƒÂ£o encontrada. Responda com o nÃƒÂºmero da sessÃƒÂ£o.",
            nextContext: withAdminCourtesiesContext(baseContext, "admin_courtesy_session_select", adminCourtesies),
          };
        }

        const sections = await listCourtesySections(sessionId);
        if (!sections.ok || sections.sections.length === 0) {
          return {
            reply: "Nenhum setor com disponibilidade para cortesia nessa sessÃƒÂ£o.",
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
            reply: "Setor nÃƒÂ£o encontrado. Responda com o nÃƒÂºmero do setor.",
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
            reply: "Quantidade invÃƒÂ¡lida. Envie um nÃƒÂºmero de 1 a 10.",
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
            `Digite ${quantity} cÃƒÂ³digo(s) de assento.`,
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
          reply: "*TELEFONE DO BENEFICIÃƒÂRIO*\n\nDigite o telefone que receberÃƒÂ¡ a cortesia.",
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
            reply: "ASSENTO INDISPONÃƒÂVEL",
            nextContext: withAdminCourtesiesContext(baseContext, "admin_courtesy_seat_collecting", adminCourtesies),
          };
        }

        return {
          reply: "*TELEFONE DO BENEFICIÃƒÂRIO*\n\nDigite o telefone que receberÃƒÂ¡ a cortesia.",
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
            reply: "Telefone invÃƒÂ¡lido. Envie um telefone com DDD.",
            nextContext: withAdminCourtesiesContext(baseContext, "admin_courtesy_beneficiary_phone_collecting", adminCourtesies),
          };
        }

        return {
          reply: "*NOME DO BENEFICIÃƒÂRIO*\n\nDigite o nome ou responda PULAR.",
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
          reply: "*MOTIVO/OBSERVAÃƒâ€¡ÃƒÆ’O*\n\nDigite uma observaÃƒÂ§ÃƒÂ£o ou responda PULAR.",
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
                ? "ASSENTO INDISPONÃƒÂVEL"
                : "NÃƒÂ£o consegui gerar a cortesia. Nenhum ingresso foi emitido parcialmente.",
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
            reply: "Digite um telefone vÃƒÂ¡lido ou cÃƒÂ³digo de ticket. Ex: TCK-XXXXXXXXXXXX",
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
            "Responda com o nÃƒÂºmero da cortesia.",
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
            reply: "NÃƒÂ£o encontrei essa cortesia. Responda com o nÃƒÂºmero da lista.",
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
            reply: "Reenvio nÃƒÂ£o confirmado. Voltando ao menu de Cortesias.",
            nextContext: returnToCourtesyMenu().nextContext,
          };
        }

        const courtesyId = adminCourtesies.pendingCourtesyId;
        if (!courtesyId) return returnToCourtesyMenu();
        const found = await findCourtesyTargets({ courtesyId });
        const courtesy = found.ok ? found.courtesies[0] : null;
        if (!courtesy || courtesy.status !== "issued" || courtesy.ticketStatus !== "issued" || courtesy.usedAt) {
          return {
            reply: "NÃƒÂ£o ÃƒÂ© possÃƒÂ­vel reenviar esta cortesia porque ela estÃƒÂ¡ cancelada ou jÃƒÂ¡ foi usada.",
            nextContext: returnToCourtesyMenu().nextContext,
          };
        }
        const delivery = await buildCourtesyDeliveryForCourtesyId(courtesyId);
        if (!delivery.ok) {
          return { reply: TICKET_MESSAGES.adminGenericError, nextContext: returnToCourtesyMenu().nextContext };
        }
        const resendReply = "Cortesia reenviada ao beneficiÃƒÂ¡rio pelo WhatsApp.";
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
            reply: "Texto nÃƒÂ£o confirmado. A cortesia nÃƒÂ£o foi cancelada.",
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
              : "NÃƒÂ£o foi possÃƒÂ­vel cancelar esta cortesia. Ela pode jÃƒÂ¡ estar usada ou cancelada.",
          nextContext: returnToCourtesyMenu().nextContext,
        };
      }
    }

    if (isAdminGateFlowState(baseContext.state)) {
      const adminGateContext = baseContext.adminGate ?? {};
      const gateSubmenu = isKitchenAdminGateMode(adminGateContext.mode)
        ? ADMIN_SUBMENUS.admin_kitchen_menu
        : ADMIN_SUBMENUS.admin_gate_menu;
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

      if (submenuOption === "exit") {
        return endAdminSession();
      }
      if (isBackText(text)) {
        if (baseContext.state === "admin_gate_accesses_filter") {
          const adminGate = baseContext.adminGate ?? {};
          const kitchenMode = isKitchenAdminGateMode(adminGate.mode);
          return buildAdminGateEventSelect({
            baseContext,
            scope: buildAdminEventScope(adminUser),
            title: kitchenMode
              ? "COZINHA - ESCOLHA O EVENTO"
              : "PORTARIA - ESCOLHA O EVENTO",
            mode: kitchenMode ? "kitchen_list" : "list",
          });
        }

        if (baseContext.state === "admin_gate_revoke_select") {
          const adminGate = baseContext.adminGate ?? {};
          const kitchenMode = isKitchenAdminGateMode(adminGate.mode);
          return buildAdminGateEventSelect({
            baseContext,
            scope: buildAdminEventScope(adminUser),
            title: kitchenMode
              ? "REVOGAR ACESSOS DE COZINHA - ESCOLHA O EVENTO"
              : "REVOGAR ACESSOS - ESCOLHA O EVENTO",
            mode: kitchenMode ? "kitchen_revoke" : "revoke",
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
                  "Digite o nÃƒÂºmero do acesso que deseja pausar.",
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
        submenuOption === "back"
      ) {
        return {
          reply: renderAdminSubmenu(gateSubmenu),
          nextContext: adminReplyContext({
            state: gateSubmenu.state,
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
        const kitchenMode = adminGate.mode === "kitchen_register";
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
                ? "Este telefone jÃƒÂ¡ possui acesso de portaria para este evento."
                : TICKET_MESSAGES.gateAdminCreateError,
            nextContext: adminReplyContext({
              state: kitchenMode ? "admin_kitchen_menu" : "admin_gate_menu",
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
            purpose: kitchenMode ? "kitchen" : "gate",
          }),
          nextContext: adminReplyContext({
            state: kitchenMode ? "admin_kitchen_menu" : "admin_gate_menu",
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
            reply: "Evento nÃƒÂ£o encontrado. Responda com nÃƒÂºmero, nome ou ID.",
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

        if (adminGate.mode === "self_checkin" || adminGate.mode === "kitchen_self_checkin") {
          const kitchenMode = adminGate.mode === "kitchen_self_checkin";
          const freshAuth = await requireFreshAdminPermission({
            baseContext,
            scope: buildFreshAdminScope(adminUser),
            permission: "manage_gate",
            operation: kitchenMode
              ? "admin_kitchen_self_checkin_create"
              : "admin_gate_self_checkin_create",
          });
          if (!freshAuth.ok) return freshAuth.response;

          const gateSessionResult = await createGateSession({
            validatorPhone: freshAuth.scope.adminPhone,
            createdByAdminPhone: freshAuth.scope.adminPhone,
            gateLabel: kitchenMode ? "Cozinha" : "Check-in",
            eventId,
            replaceActiveSessions: true,
            ttlMinutes: kitchenMode ? 8 * 60 : undefined,
          });

          return {
            reply: gateSessionResult.ok
              ? kitchenMode
                ? buildKitchenCheckInReply({
                    kitchenUrl: buildKitchenUrl(gateSessionResult.token),
                    offerReaderUrl: buildOfferReaderUrl(gateSessionResult.token),
                    expiresAt: gateSessionResult.gateSession.expires_at,
                  })
                : buildGateCheckInReply({
                    gateUrl: gateSessionResult.gateUrl,
                    expiresAt: gateSessionResult.gateSession.expires_at,
                  })
              : TICKET_MESSAGES.gateAdminCreateError,
            nextContext: adminReplyContext({
              state: kitchenMode ? "admin_kitchen_menu" : "admin_gate_menu",
              role: adminUser.role,
              sessionId: adminSession.id,
              adminUserId: adminUser.id,
              expiresAt: adminSession.expires_at,
            }),
          };
        }

        if (adminGate.mode === "revoke" || adminGate.mode === "kitchen_revoke") {
          const result = await listGateAccesses({
            filter: "open",
            eventId,
          });

          if (!result.ok) {
            return {
              reply: TICKET_MESSAGES.adminGenericError,
              nextContext: adminReplyContext({
                state: gateSubmenu.state,
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
            "Digite o nÃƒÂºmero do acesso que deseja pausar.",
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
              state: gateSubmenu.state,
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
            reply: "NÃƒÂ£o encontrei esse acesso. Digite o nÃƒÂºmero do acesso que deseja pausar.",
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
              state: gateSubmenu.state,
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
            state: gateSubmenu.state,
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
        submenuOption === "menu" ||
        submenuOption === "back"
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

      if (baseContext.state === "admin_report_division_settlement_confirm") {
        const normalized = normalizeAdminText(text);
        const pendingSettlement = adminReports.pendingDivisionSettlement;

        if (!pendingSettlement) {
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

        if (
          normalized !== "baixar" &&
          normalized !== "dar baixa" &&
          normalized !== "pago" &&
          normalized !== "sim" &&
          normalized !== "s"
        ) {
          return {
            reply: [
              "*DIVISÃƒÆ’O*",
              "Digite *BAIXAR* para marcar este fechamento como pago.",
              'Digite "Voltar" para voltar, "Cancelar" para abandonar esta tela ou "Sair" para sair da ÃƒÂ¡rea de admin.',
            ].join("\n"),
            nextContext: withAdminReportsContext(
              baseContext,
              "admin_report_division_settlement_confirm",
              adminReports,
            ),
          };
        }

        try {
          const freshAuth = await requireFreshAdminPermission({
            baseContext,
            scope: buildFreshAdminScope(adminUser),
            permission: "view_reports",
            operation: "admin_division_settlement_paid",
          });
          if (!freshAuth.ok) return freshAuth.response;

          const result = await markDivisionSettlementPaid({
            settlement: pendingSettlement,
            paidByAdminUserId: freshAuth.scope.adminUserId,
          });

          return {
            reply: result.ok
              ? withAdminNavigationHint([
                  "*DIVISÃƒÆ’O*",
                  "Fechamento marcado como pago.",
                  `> PerÃƒÂ­odo: ${pendingSettlement.periodLabel}`,
                  `> Valor baixado: ${new Intl.NumberFormat("pt-BR", {
                    style: "currency",
                    currency: "BRL",
                  }).format(pendingSettlement.amountDueCents / 100)}`,
                ].join("\n"))
              : "NÃƒÂ£o consegui gravar a baixa. A tabela de fechamentos ainda precisa ser aplicada no banco.",
            nextContext: adminReplyContext({
              state: "admin_reports_menu",
              role: adminUser.role,
              sessionId: adminSession.id,
              adminUserId: adminUser.id,
              expiresAt: adminSession.expires_at,
            }),
          };
        } catch (error) {
          logError("Failed to mark division settlement as paid", {
            error,
            adminUserId: adminUser.id,
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
      }

      if (baseContext.state === "admin_report_event_select") {
        const eventId = resolveCourtesyEventId(text, adminReports.lastEvents ?? []);

        if (!eventId) {
          return {
            reply: "Evento nÃƒÂ£o encontrado. Responda com nÃƒÂºmero, nome ou ID.",
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

          if (adminReports.reportType === "division") {
            const divisionReport = await buildAdminDivisionReport(period);

            return {
              reply: withAdminNavigationHint(divisionReport.text),
              nextContext: divisionReport.canMarkPaid
                ? withAdminReportsContext(
                    baseContext,
                    "admin_report_division_settlement_confirm",
                    {
                      reportType: "division",
                      pendingDivisionSettlement: divisionReport.settlement,
                    },
                  )
                : withAdminReportsContext(
                    adminReplyContext({
                      state: "admin_report_period_select",
                      role: adminUser.role,
                      sessionId: adminSession.id,
                      adminUserId: adminUser.id,
                      expiresAt: adminSession.expires_at,
                    }),
                    "admin_report_period_select",
                    { reportType: "division" },
                  ),
            };
          }

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
        const period = adminReports.reportType === "division"
          ? parseAdminDivisionWeekPeriod(text) ?? parseAdminReportPeriodOption(text)
          : parseAdminReportPeriodOption(text);

        if (period === "custom") {
          return {
            reply: [
              "*ESCOLHER DATAS*",
              "",
              "Digite o intervalo no formato DD/MM/AAAA a DD/MM/AAAA.",
              "Ex: 01/05/2026 a 24/05/2026",
              "",
              'Digite "Voltar" para voltar, "Cancelar" para abandonar esta tela ou "Sair" para sair da ÃƒÂ¡rea de admin.',
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
              "Intervalo invÃƒÂ¡lido. Digite no formato DD/MM/AAAA a DD/MM/AAAA.",
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
            reply: "Este telefone jÃƒÂ¡ possui administrador ativo cadastrado.",
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
        baseContext.state === "admin_user_disable_select" ||
        baseContext.state === "admin_user_passphrase_select"
      ) {
        const adminUsersContext = baseContext.adminUsers ?? {};
        const selectedAdminUserId = resolveAdminUserId(
          text,
          adminUsersContext.lastUsers ?? [],
        );

        if (!selectedAdminUserId) {
          return {
            reply: "Administrador nÃƒÂ£o encontrado. Responda com nÃƒÂºmero, telefone ou ID.",
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
              : "Administrador nÃƒÂ£o encontrado. Responda com nÃƒÂºmero, telefone ou ID.",
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

        if (baseContext.state === "admin_user_passphrase_select") {
          return {
            reply: renderAdminUserPassphrasePrompt(),
            nextContext: withAdminUsersContext(baseContext, "admin_user_passphrase_collect", {
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

      if (baseContext.state === "admin_user_passphrase_collect") {
        const adminUsersContext = baseContext.adminUsers ?? {};
        const passphrase = text.trim();

        if (!adminUsersContext.selectedAdminUserId || !passphrase) {
          return {
            reply: renderAdminUserPassphrasePrompt(),
            nextContext: withAdminUsersContext(
              baseContext,
              "admin_user_passphrase_collect",
              adminUsersContext,
            ),
          };
        }

        return {
          reply: renderAdminUserPassphraseConfirm({
            name: adminUsersContext.selectedAdminName,
            phone: adminUsersContext.selectedAdminPhone,
            role: adminUsersContext.selectedAdminRole,
          }),
          nextContext: withAdminUsersContext(baseContext, "admin_user_passphrase_confirm", {
            ...adminUsersContext,
            pendingPassphraseHash: hashAdminPassphrase(passphrase),
          }),
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
            reply: "Administrador bloqueado nÃƒÂ£o encontrado. Responda com nÃƒÂºmero ou telefone.",
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
            reply: "Digite ALTERAR NÃƒÂVEL para confirmar ou CANCELAR para abandonar.",
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
            ? "NÃƒÂ£o ÃƒÂ© permitido rebaixar o prÃƒÂ³prio Diretor neste fluxo."
            : !result.ok && result.reason === "last_root_blocked"
              ? "NÃƒÂ£o ÃƒÂ© permitido remover o ÃƒÂºltimo Diretor ativo."
              : null;

        return {
          reply: result.ok
            ? [
                "*NÃƒÂVEL DE ADMINISTRADOR ATUALIZADO*",
                `> Perfil: ${formatAdminRoleLabel(adminUsersContext.pendingRole)}`,
                'Digite "Voltar" para voltar, "Cancelar" para abandonar esta tela ou "Sair" para sair da ÃƒÂ¡rea de admin.',
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
            ? "NÃƒÂ£o ÃƒÂ© permitido desativar o prÃƒÂ³prio Diretor neste fluxo."
            : !result.ok && result.reason === "last_root_blocked"
              ? "NÃƒÂ£o ÃƒÂ© permitido desativar o ÃƒÂºltimo Diretor ativo."
              : null;

        return {
          reply: result.ok
            ? [
                "*ADMINISTRADOR DESATIVADO*",
                "",
                `> Nome: ${adminUsersContext.selectedAdminName || "Sem nome"}`,
                `> Telefone: ${adminUsersContext.selectedAdminPhone ? maskAdminPhone(adminUsersContext.selectedAdminPhone) : "nÃƒÂ£o informado"}`,
                `> Perfil: ${adminUsersContext.selectedAdminRole ? formatAdminRoleLabel(adminUsersContext.selectedAdminRole) : "nÃƒÂ£o informado"}`,
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

      if (baseContext.state === "admin_user_passphrase_confirm") {
        const adminUsersContext = baseContext.adminUsers ?? {};

        const confirmation = normalizeAdminText(text);

        if (
          confirmation !== "renovar palavra" &&
          confirmation !== "renovar palavra chave"
        ) {
          return {
            reply: "Digite RENOVAR PALAVRA para confirmar ou CANCELAR para abandonar.",
            nextContext: withAdminUsersContext(
              baseContext,
              "admin_user_passphrase_confirm",
              adminUsersContext,
            ),
          };
        }

        if (!adminUsersContext.selectedAdminUserId || !adminUsersContext.pendingPassphraseHash) {
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
          operation: "admin_user_passphrase_renew",
        });
        if (!freshAuth.ok) return freshAuth.response;

        const result = await renewAdminPassphrase({
          adminUserId: adminUsersContext.selectedAdminUserId,
          passphraseHash: adminUsersContext.pendingPassphraseHash,
        });

        return {
          reply: result.ok
            ? [
                "*PALAVRA-CHAVE RENOVADA*",
                "",
                `> Nome: ${adminUsersContext.selectedAdminName || "Sem nome"}`,
                `> Telefone: ${adminUsersContext.selectedAdminPhone ? maskAdminPhone(adminUsersContext.selectedAdminPhone) : "nÃƒÂ£o informado"}`,
                ...(adminUsersContext.selectedAdminRole
                  ? [`> Perfil: ${formatAdminRoleLabel(adminUsersContext.selectedAdminRole)}`]
                  : []),
                "> SessÃƒÂµes ativas revogadas",
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
      if (typedMainMenuOption === 2) {
        if (!hasAdminPermission(adminUser.role, "manage_events")) {
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

        const editorLink = await createAdminEventEditorDirectLink(adminUser);

        return {
          ...(editorLink.ok
            ? buildAdminBrowserEventEditorReply(editorLink.url, editorLink.expiresInMinutes)
            : { reply: TICKET_MESSAGES.adminGenericError }),
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

    if (previousState.state?.startsWith("admin_offer_create_")) {
      const navigation = parseAdminSubmenuOption(text);
      const offersContext = getAdminOffersContext(baseContext);
      const draft = offersContext.draft ?? {};

      if (navigation === "back") {
        if (previousState.state === "admin_offer_create_timing") {
          return {
            reply: "Digite o valor:\nEx: 49,90",
            nextContext: withAdminOffersContext(baseContext, "admin_offer_create_price", offersContext),
          };
        }

        if (previousState.state === "admin_offer_create_price") {
          return {
            reply: buildAdminOfferImagePrompt(),
            nextContext: withAdminOffersContext(baseContext, "admin_offer_create_image", offersContext),
          };
        }

        if (previousState.state === "admin_offer_create_image") {
          return {
            reply: "Digite a descricao:\nEx: 2 cervejas + 1 x-burger",
            nextContext: withAdminOffersContext(baseContext, "admin_offer_create_description", offersContext),
          };
        }

        if (previousState.state === "admin_offer_create_description") {
          return {
            reply: buildAdminOfferNamePrompt(),
            nextContext: withAdminOffersContext(baseContext, "admin_offer_create_name", offersContext),
          };
        }

        if (previousState.state === "admin_offer_create_name") {
          if (draft.scopeType === "event") {
            return buildAdminOfferEventSelect({
              baseContext,
              scope: buildAdminEventScope(adminUser),
              multi: (draft.eventIds?.length ?? 0) > 1,
            });
          }

          if (draft.scopeType === "weekday") {
            return {
              reply: "*ESCOLHER POR DIAS DA SEMANA*\n\nDigite o dia da semana.\nEx: sexta",
              nextContext: withAdminOffersContext(baseContext, "admin_offer_create_weekday_select", offersContext),
            };
          }

          return {
            reply: [
              "*ADICIONAR OFERTA*",
              "",
              "Essa oferta sera usada em:",
              "1. Todos os eventos",
              "2. Escolher um evento",
              "3. Escolher por dias da semana (toda sexta)",
              "4. Escolher varios eventos",
            ].join("\n"),
            nextContext: withAdminOffersContext(baseContext, "admin_offer_create_scope", offersContext),
          };
        }

        if (
          previousState.state === "admin_offer_create_event_select" ||
          previousState.state === "admin_offer_create_weekday_select"
        ) {
          return {
            reply: [
              "*ADICIONAR OFERTA*",
              "",
              "Essa oferta sera usada em:",
              "1. Todos os eventos",
              "2. Escolher um evento",
              "3. Escolher por dias da semana (toda sexta)",
              "4. Escolher varios eventos",
            ].join("\n"),
            nextContext: withAdminOffersContext(baseContext, "admin_offer_create_scope", offersContext),
          };
        }

        return {
          reply: renderAdminSubmenu(ADMIN_SUBMENUS.admin_offers_menu),
          nextContext: adminReplyContext({
            state: "admin_offers_menu",
            role: adminUser.role,
            sessionId: adminSession.id,
            adminUserId: adminUser.id,
            expiresAt: adminSession.expires_at,
          }),
        };
      }

      if (navigation === "menu") {
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

      if (navigation === "exit") {
        return endAdminSession();
      }

      if (previousState.state === "admin_offer_create_scope") {
        const option = parseAdminSubmenuOption(text);

        if (option === 1) {
          return {
            reply: buildAdminOfferNamePrompt(),
            nextContext: withAdminOffersContext(baseContext, "admin_offer_create_name", {
              mode: "add",
              draft: { scopeType: "all_events" },
            }),
          };
        }

        if (option === 2 || option === 4) {
          return buildAdminOfferEventSelect({
            baseContext: withAdminOffersContext(baseContext, "admin_offer_create_scope", {
              mode: "add",
              draft,
            }),
            scope: buildAdminEventScope(adminUser),
            multi: option === 4,
          });
        }

        if (option === 3) {
          return {
            reply: "*ESCOLHER POR DIAS DA SEMANA*\n\nDigite o dia da semana.\nEx: sexta",
            nextContext: withAdminOffersContext(baseContext, "admin_offer_create_weekday_select", {
              mode: "add",
              draft: { scopeType: "weekday" },
            }),
          };
        }

        return {
          reply: renderAdminSubmenu(ADMIN_SUBMENUS.admin_offers_menu),
          nextContext: withAdminOffersContext(baseContext, "admin_offers_menu", {}),
        };
      }

      if (previousState.state === "admin_offer_create_event_select") {
        const values = text
          .split(/[,\s]+/)
          .map((part) => Number(part.trim()))
          .filter((value) => Number.isInteger(value));
        const selected = (offersContext.lastEvents ?? []).filter((event) =>
          values.includes(event.option),
        );

        if (!selected.length) {
          return buildAdminOfferEventSelect({
            baseContext,
            scope: buildAdminEventScope(adminUser),
            multi: true,
          });
        }

        return {
          reply: buildAdminOfferNamePrompt(),
          nextContext: withAdminOffersContext(baseContext, "admin_offer_create_name", {
            mode: "add",
            draft: {
              ...draft,
              scopeType: "event",
              eventIds: selected.map((event) => event.eventId),
            },
          }),
        };
      }

      if (previousState.state === "admin_offer_create_weekday_select") {
        const weekdays = parseWeekdaysFromAdminText(text);

        if (!weekdays.length) {
          return {
            reply: "Nao entendi o dia. Digite algo como sexta, sabado ou 5.",
            nextContext: baseContext,
          };
        }

        return {
          reply: buildAdminOfferNamePrompt(),
          nextContext: withAdminOffersContext(baseContext, "admin_offer_create_name", {
            mode: "add",
            draft: { ...draft, scopeType: "weekday", weekdays },
          }),
        };
      }

      if (previousState.state === "admin_offer_create_name") {
        if (text.trim().length < 3) {
          return { reply: "Digite um nome com pelo menos 3 caracteres.", nextContext: baseContext };
        }

        return {
          reply: "Digite a descricao:\nEx: 2 cervejas + 1 x-burger",
          nextContext: withAdminOffersContext(baseContext, "admin_offer_create_description", {
            mode: "add",
            draft: { ...draft, name: text.trim() },
          }),
        };
      }

      if (previousState.state === "admin_offer_create_description") {
        if (text.trim().length < 3) {
          return { reply: "Digite uma descricao com pelo menos 3 caracteres.", nextContext: baseContext };
        }

        return {
          reply: buildAdminOfferImagePrompt(),
          nextContext: withAdminOffersContext(baseContext, "admin_offer_create_image", {
            mode: "add",
            draft: { ...draft, description: text.trim() },
          }),
        };
      }

      if (previousState.state === "admin_offer_create_image") {
        const parsedImage = parseAdminOfferImageInput({ text, mediaUrl });

        if (!parsedImage.ok) {
          return {
            reply: "Foto invalida. Envie uma imagem pelo WhatsApp, cole uma URL publica https://... ou digite PULAR.",
            nextContext: baseContext,
          };
        }

        return {
          reply: "Digite o valor:\nEx: 49,90",
          nextContext: withAdminOffersContext(baseContext, "admin_offer_create_price", {
            mode: "add",
            draft: { ...draft, imageUrl: parsedImage.imageUrl },
          }),
        };
      }

      if (previousState.state === "admin_offer_create_price") {
        const priceCents = parseMoneyToCents(text);

        if (!priceCents || priceCents <= 0) {
          return { reply: "Valor invalido. Envie como 49,90.", nextContext: baseContext };
        }

        return {
          reply: buildAdminOfferTimingPrompt(),
          nextContext: withAdminOffersContext(baseContext, "admin_offer_create_timing", {
            mode: "add",
            draft: { ...draft, priceCents },
          }),
        };
      }

      if (previousState.state === "admin_offer_create_timing") {
        const timing = parseComboOfferTiming(
          text.trim().match(/^\d+$/) ? Number(text.trim()) : null,
        );
        const scope = buildAdminOfferScopeFromDraft(draft);

        if (!timing || !scope || !draft.name || !draft.description || !draft.priceCents) {
          return {
            reply: "Nao consegui fechar esta oferta. Volte ao menu e tente novamente.",
            nextContext: withAdminOffersContext(baseContext, "admin_offers_menu", {}),
          };
        }

        const result = await createComboOffer({
          name: draft.name,
          description: draft.description,
          imageUrl: draft.imageUrl ?? null,
          priceCents: draft.priceCents,
          timingType: timing.timingType,
          customOffsetMinutes: timing.customOffsetMinutes ?? null,
          scope,
          adminUserId: adminUser.id,
          adminPhone: adminUser.phone,
        });

        return {
          reply: result.ok
            ? "*OFERTA CADASTRADA*\n\nA oferta ja esta ativa para os envios programados."
            : TICKET_MESSAGES.adminGenericError,
          nextContext: withAdminOffersContext(baseContext, "admin_offers_menu", {}),
        };
      }
    }

    if (
      previousState.state === "admin_offer_select_action" ||
      previousState.state === "admin_offer_edit_select_field" ||
      previousState.state === "admin_offer_edit_collect_value" ||
      previousState.state === "admin_offer_delete_confirm"
    ) {
      const navigation = parseAdminSubmenuOption(text);
      const offersContext = getAdminOffersContext(baseContext);

      if (navigation === "back") {
        if (previousState.state === "admin_offer_edit_collect_value") {
          return {
            reply: buildAdminOfferEditFieldPrompt(offersContext.pendingOfferName ?? "Oferta"),
            nextContext: withAdminOffersContext(baseContext, "admin_offer_edit_select_field", offersContext),
          };
        }

        if (previousState.state === "admin_offer_edit_select_field") {
          return renderAdminOfferListForAction(baseContext, "edit");
        }

        return {
          reply: renderAdminSubmenu(ADMIN_SUBMENUS.admin_offers_menu),
          nextContext: adminReplyContext({
            state: "admin_offers_menu",
            role: adminUser.role,
            sessionId: adminSession.id,
            adminUserId: adminUser.id,
            expiresAt: adminSession.expires_at,
          }),
        };
      }

      if (navigation === "menu") {
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

      if (navigation === "exit") {
        return endAdminSession();
      }

      if (previousState.state === "admin_offer_edit_select_field") {
        const option = text.trim().match(/^\d+$/) ? Number(text.trim()) : null;
        const field =
          option === 1
            ? "name"
            : option === 2
              ? "description"
              : option === 3
                ? "price"
                : option === 4
                  ? "timing"
                  : option === 5
                    ? "image"
                  : null;

        if (!field || !offersContext.pendingOfferId) {
          return {
            reply: buildAdminOfferEditFieldPrompt(offersContext.pendingOfferName ?? "Oferta"),
            nextContext: baseContext,
          };
        }

        const prompt =
          field === "name"
            ? "Digite o novo nome da oferta:\nBLACK HOUSE COMBO"
            : field === "description"
              ? "Digite a nova descricao:"
              : field === "price"
                ? "Digite o novo valor:\nEx: 49,90"
                : field === "timing"
                  ? buildAdminOfferTimingPrompt()
                  : "Envie a nova foto da oferta pelo WhatsApp, cole uma URL publica https://... ou digite REMOVER.";

        return {
          reply: prompt,
          nextContext: withAdminOffersContext(baseContext, "admin_offer_edit_collect_value", {
            ...offersContext,
            editField: field,
          }),
        };
      }

      if (previousState.state === "admin_offer_edit_collect_value") {
        if (!offersContext.pendingOfferId || !offersContext.editField) {
          return {
            reply: TICKET_MESSAGES.adminGenericError,
            nextContext: withAdminOffersContext(baseContext, "admin_offers_menu", {}),
          };
        }

        const field = offersContext.editField;
        const result = field === "name"
          ? await updateComboOfferDetails({ offerId: offersContext.pendingOfferId, name: text })
          : field === "description"
            ? await updateComboOfferDetails({ offerId: offersContext.pendingOfferId, description: text })
            : field === "price"
              ? await updateComboOfferDetails({
                  offerId: offersContext.pendingOfferId,
                  priceCents: parseMoneyToCents(text) ?? 0,
                })
              : field === "image"
                ? await (async () => {
                    const parsedImage = parseAdminOfferImageInput({
                      text,
                      mediaUrl,
                      allowRemove: true,
                    });

                    return parsedImage.ok
                      ? updateComboOfferDetails({
                          offerId: offersContext.pendingOfferId as string,
                          imageUrl: parsedImage.imageUrl,
                        })
                      : { ok: false as const, reason: "invalid_input" as const };
                  })()
                : await (async () => {
                  const timing = parseComboOfferTiming(
                    text.trim().match(/^\d+$/) ? Number(text.trim()) : null,
                  );

                  return timing
                    ? updateComboOfferDetails({
                        offerId: offersContext.pendingOfferId as string,
                        timingType: timing.timingType,
                        customOffsetMinutes: timing.customOffsetMinutes ?? null,
                      })
                    : { ok: false as const, reason: "invalid_input" as const };
                })();

        return {
          reply: result.ok ? "*OFERTA ATUALIZADA*" : "Nao consegui atualizar. Confira o valor enviado.",
          nextContext: withAdminOffersContext(baseContext, "admin_offers_menu", {}),
        };
      }

      if (previousState.state === "admin_offer_delete_confirm") {
        if (normalizeAdminText(text) !== "excluir oferta" || !offersContext.pendingOfferId) {
          return {
            reply: "Digite EXCLUIR OFERTA para confirmar ou CANCELAR para abandonar.",
            nextContext: baseContext,
          };
        }

        const result = await updateComboOfferStatus(
          offersContext.pendingOfferId,
          "deleted",
        );

        return {
          reply: result.ok ? "*OFERTA EXCLUIDA*" : TICKET_MESSAGES.adminGenericError,
          nextContext: withAdminOffersContext(baseContext, "admin_offers_menu", {}),
        };
      }

      const option = text.trim().match(/^\d+$/) ? Number(text.trim()) : null;
      const selected = (offersContext.lastOffers ?? []).find(
        (offer) => offer.option === option,
      );

      if (!selected || !offersContext.mode) {
        return renderAdminOfferListForAction(baseContext, offersContext.mode ?? "pause");
      }

      if (offersContext.mode === "edit") {
        return {
          reply: buildAdminOfferEditFieldPrompt(selected.name),
          nextContext: withAdminOffersContext(baseContext, "admin_offer_edit_select_field", {
            mode: "edit",
            pendingOfferId: selected.offerId,
            pendingOfferName: selected.name,
            lastOffers: offersContext.lastOffers,
          }),
        };
      }

      if (offersContext.mode === "delete") {
        return {
          reply: `Digite EXCLUIR OFERTA para confirmar a exclusao de ${selected.name}.`,
          nextContext: withAdminOffersContext(baseContext, "admin_offer_delete_confirm", {
            mode: "delete",
            pendingOfferId: selected.offerId,
            lastOffers: offersContext.lastOffers,
          }),
        };
      }

      const result = offersContext.mode === "pause"
        ? await updateComboOfferStatus(selected.offerId, "paused")
        : await duplicateComboOffer(selected.offerId);

      return {
        reply: result.ok
          ? offersContext.mode === "pause"
            ? "*OFERTA PAUSADA*"
            : "*OFERTA DUPLICADA*\n\nA copia foi criada pausada para revisao."
          : TICKET_MESSAGES.adminGenericError,
        nextContext: withAdminOffersContext(baseContext, "admin_offers_menu", {}),
      };
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

      if (mainMenuOption === ADMIN_MAIN_EXIT_OPTION) {
        return endAdminSession();
      }

      if (mainMenuOption === 2) {
        if (!hasAdminPermission(adminUser.role, "manage_events")) {
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

        const editorLink = await createAdminEventEditorDirectLink(adminUser);

        return {
          ...(editorLink.ok
            ? buildAdminBrowserEventEditorReply(editorLink.url, editorLink.expiresInMinutes)
            : { reply: TICKET_MESSAGES.adminGenericError }),
          nextContext: adminReplyContext({
            state: "admin_menu",
            role: adminUser.role,
            sessionId: adminSession.id,
            adminUserId: adminUser.id,
            expiresAt: adminSession.expires_at,
          }),
        };
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
        if (typedMainMenuOption === ADMIN_MAIN_EXIT_OPTION) {
          return endAdminSession();
        }

        if (typedMainMenuOption === 2) {
          if (!hasAdminPermission(adminUser.role, "manage_events")) {
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

          const editorLink = await createAdminEventEditorDirectLink(adminUser);

          return {
            ...(editorLink.ok
              ? buildAdminBrowserEventEditorReply(editorLink.url, editorLink.expiresInMinutes)
              : { reply: TICKET_MESSAGES.adminGenericError }),
            nextContext: adminReplyContext({
              state: previousState.state,
              role: adminUser.role,
              sessionId: adminSession.id,
              adminUserId: adminUser.id,
              expiresAt: adminSession.expires_at,
            }),
          };
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

      if (submenuOption === "exit") {
        return endAdminSession();
      }

      if (previousState.state === "admin_offers_menu") {
        if (submenuOption === 1) {
          return {
            reply: [
              "*ADICIONAR OFERTA*",
              "",
              "Essa oferta sera usada em:",
              "1. Todos os eventos",
              "2. Escolher um evento",
              "3. Escolher por dias da semana (toda sexta)",
              "4. Escolher varios eventos",
            ].join("\n"),
            nextContext: withAdminOffersContext(baseContext, "admin_offer_create_scope", {
              mode: "add",
              draft: {},
            }),
          };
        }

        if (submenuOption === 2) {
          const result = await listComboOffers();

          return {
            reply: result.ok
              ? ["*OFERTAS ATIVAS*", "", buildComboOfferListText(result.offers.filter((offer) => offer.status === "active"))].join("\n")
              : TICKET_MESSAGES.adminGenericError,
            nextContext: withAdminOffersContext(baseContext, "admin_offers_menu", {}),
          };
        }

        if (submenuOption === 3) {
          return renderAdminOfferListForAction(baseContext, "edit");
        }

        if (submenuOption === 4) {
          return renderAdminOfferListForAction(baseContext, "pause");
        }

        if (submenuOption === 5) {
          return renderAdminOfferListForAction(baseContext, "delete");
        }

        if (submenuOption === 6) {
          return renderAdminOfferListForAction(baseContext, "duplicate");
        }
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
              "*BUSCAR INGRESSO POR CÃƒâ€œDIGO*\n\nEnvie o cÃƒÂ³digo do ingresso. Ex: TCK-XXXXXXXXXXXX",
            state: "admin_order_code_collecting",
          },
          3: {
            reply:
              "*CANCELAR RESERVA PENDENTE*\n\nEnvie o telefone do comprador, o ID da reserva ou o ID do pedido.",
            state: "admin_order_cancel_collecting",
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
                ? "*REENVIAR CORTESIA*\n\nDigite o telefone do beneficiÃƒÂ¡rio ou o cÃƒÂ³digo da cortesia."
                : "*CANCELAR CORTESIA*\n\nDigite o telefone do beneficiÃƒÂ¡rio ou o cÃƒÂ³digo da cortesia.",
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
          submenuOption === 5 ||
          submenuOption === 6
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
                "Responda com o nÃƒÂºmero ou telefone que deseja liberar.",
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

          if (submenuOption === 3 || submenuOption === 4 || submenuOption === 6) {
            const selectableUsers = submenuOption === 4
              ? usersResult.users.filter((user) => user.status === "active")
              : usersResult.users;
            return {
              reply: [
                "*ADMINISTRADORES*",
                submenuOption === 3
                  ? "*QUAL ADMINISTRADOR DESEJA ALTERAR?*"
                  : submenuOption === 4
                    ? "*QUAL ADMINISTRADOR DESEJA DESATIVAR?*"
                    : "*QUAL ADMINISTRADOR DESEJA RENOVAR A PALAVRA-CHAVE?*",
                "Responda com nÃƒÂºmero, telefone ou ID.",
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
                  : submenuOption === 4
                    ? "admin_user_disable_select"
                    : "admin_user_passphrase_select",
                {
                  mode:
                    submenuOption === 3
                      ? "role"
                      : submenuOption === 4
                        ? "disable"
                        : "passphrase",
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
          9: "division",
        };
        const reportType = typeof submenuOption === "number"
          ? reportTypeByOption[submenuOption]
          : undefined;

        if (reportType === "summary" || reportType === "division") {
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
          title: "LEITURA NESTE TELEFONE - ESCOLHA O EVENTO",
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
          title: "LEITURA - ESCOLHA O EVENTO",
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
        previousState.state === "admin_kitchen_menu" &&
        submenuOption === 1
      ) {
        return buildAdminGateEventSelect({
          baseContext,
          scope: buildAdminEventScope(adminUser),
          title: "COZINHA - ESCOLHA O EVENTO",
          mode: "kitchen_self_checkin",
        });
      }

      if (
        previousState.state === "admin_kitchen_menu" &&
        submenuOption === 2
      ) {
        return buildAdminGateEventSelect({
          baseContext,
          scope: buildAdminEventScope(adminUser),
          title: "COZINHA - ESCOLHA O EVENTO",
          nextState: "admin_gate_register_event_select",
          mode: "kitchen_register",
        });
      }

      if (
        previousState.state === "admin_kitchen_menu" &&
        submenuOption === 3
      ) {
        return buildAdminGateEventSelect({
          baseContext,
          scope: buildAdminEventScope(adminUser),
          title: "COZINHA - ESCOLHA O EVENTO",
          mode: "kitchen_list",
        });
      }

      if (
        previousState.state === "admin_kitchen_menu" &&
        submenuOption === 4
      ) {
        return buildAdminGateEventSelect({
          baseContext,
          scope: buildAdminEventScope(adminUser),
          title: "REVOGAR ACESSOS DE COZINHA - ESCOLHA O EVENTO",
          mode: "kitchen_revoke",
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
    if (!gateCommand.valid) {
      const accessResult = await findActiveGateAccessesForPhone(
        customer.whatsapp_phone,
      );

      if (accessResult.ok && accessResult.accesses.length === 1) {
        const access = accessResult.accesses[0];

        return {
          reply: renderGateAccessPassphrasePrompt(
            access.eventTitle,
            gateCommand.purpose,
          ),
          nextContext: {
            ...baseContext,
            step: "gate_access_passphrase_collecting",
            state: "gate_access_passphrase_collecting",
            gateAccess: {
              mode: gateCommand.purpose,
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
              mode: gateCommand.purpose,
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
          "NÃƒÂ£o encontrei acesso de portaria ativo para este telefone.",
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
          "NÃƒÂ£o encontrei cortesia disponÃƒÂ­vel para este telefone. Confira se ela jÃƒÂ¡ foi emitida para este nÃƒÂºmero.",
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
        reply: `NÃƒÂ£o encontrei eventos disponÃƒÂ­veis no momento.\n\n${TICKET_MESSAGES.genericHelp}`,
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
            "NÃƒÂ£o encontrei itens nessa compra. Escolha o ingresso novamente.",
            "",
            sectionsResult.reply,
          ].join("\n"),
        };
      }

      return {
        reply: "NÃƒÂ£o encontrei itens nessa compra. Escolha o ingresso novamente.",
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

    if (selectedOption === 2) {
      return renderBuyerSectionsStep({
        baseContext,
        selectedEvent,
      });
    }

    if (selectedOption !== 1) {
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
          "O estoque mudou antes da finalizaÃƒÂ§ÃƒÂ£o e a reserva nÃƒÂ£o foi criada. Selecione os ingressos novamente.",
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
        reply: "Envie a quantidade de ingressos usando apenas nÃƒÂºmeros. Ex: 2",
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
          ? "*QUANTIDADE INVALIDA*\nPara ingresso gratuito, o nÃƒÂºmero mÃƒÂ¡ximo de ingressos por pedido sÃƒÂ£o 4. Digite novamente o nÃƒÂºmero de 1 a 4."
          : "Para esta compra, escolha atÃƒÂ© 10 ingressos por vez. Envie uma quantidade menor.",
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
            ? "Para ingresso gratuito, o mÃƒÂ¡ximo sÃƒÂ£o 4 ingressos por pedido. Escolha uma quantidade menor."
            : "A compra pode ter no mÃƒÂ¡ximo 10 ingressos no total. Escolha uma quantidade menor.",
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
      return renderNoSeatsWithAlternatives({
        baseContext,
        selectedEvent: previousState.selectedEvent,
      });
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
        return renderNoSeatsWithAlternatives({
          baseContext,
          selectedEvent: previousState.selectedEvent,
        });
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
        reply: "NÃƒÂ£o consegui adicionar esse ingresso ÃƒÂ  compra. Escolha o setor novamente.",
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
            ? `Envie exatamente ${quantity} assentos disponÃƒÂ­veis. Ex: A03 A04`
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
        reply: "NÃƒÂ£o consegui adicionar esses assentos ÃƒÂ  compra. Escolha novamente.",
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
