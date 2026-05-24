import "server-only";

import { getEnv } from "@/lib/env";
import {
  buildInitialConversationState,
  type TicketConversationEventOption,
  type TicketConversationSearch,
  type TicketConversationSectionOption,
  type TicketConversationSeatOption,
  type TicketConversationReservation,
  type TicketConversationPayment,
  type TicketConversationSelectedSection,
  type TicketConversationSelectedEvent,
  type TicketConversationSelectedSeat,
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
  listAvailableSeats,
  type AvailableSeat,
  type AvailableSeatList,
} from "@/lib/tickets/services/seats";
import {
  reserveSelectedSeat,
  type ReserveSelectedSeatResult,
  type ReserveSelectedSeatSuccess,
} from "@/lib/tickets/services/reservations";
import {
  createAdminEvent,
  findOrCreateVenue,
  getAdminEventDetails,
  isEventStatus,
  isTicketType,
  listAdminEvents,
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
  createGateSession,
  normalizeGatePhone,
  revokeGateSession,
} from "@/lib/tickets/services/gateSessions";
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
  verifyAdminPassphrase,
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

  const range = buildDayRange({ year: parsedYear, month, day });

  if (!match[3] && range.dateTo < new Date().toISOString()) {
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
  const cleaned = text
    .replace(/\b(?:em|na|no)\s+[a-zA-ZÀ-ÿ][a-zA-ZÀ-ÿ\s-]{1,40}$/i, "")
    .replace(/\b\d{1,2}\/\d{1,2}(?:\/\d{2,4})?\b/g, " ")
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
  const title = event.title.toLocaleUpperCase("pt-BR");
  const details = [
    `> 🎤 Artista: ${event.artistName}`,
    `> 📍 Cidade: ${event.city}/${event.state}`,
    `> 🗓️ Data: ${formatEventDate(event.startsAt)}`,
    `> 🏟️ Local: ${event.venueName ?? "A confirmar"}`,
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
    `🎟️ - *${event.title.toLocaleUpperCase("pt-BR")}*`,
    ...(event.artistName ? [`> 🎤 Artista: ${event.artistName}`] : []),
    `> 📍 Cidade: ${event.city}/${event.state}`,
    `> 🗓️ Data: ${formatEventDate(event.startsAt)}`,
    `> 🏟️ Local: ${event.venueName ?? "A confirmar"}`,
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
  return sections.map((section, index) => ({
    option: index + 1,
    sectionId: section.sectionId,
    sectionName: section.sectionName,
    hasNumberedSeats: section.hasNumberedSeats,
    availableSeatsCount: section.availableSeatsCount,
    minPriceCents: section.minPriceCents,
    minFeeCents: section.minFeeCents,
    ticketTypes: section.ticketTypes,
  }));
}

function buildSelectedSection(
  section: AvailableSection,
): TicketConversationSelectedSection {
  return {
    sectionId: section.sectionId,
    sectionName: section.sectionName,
    hasNumberedSeats: section.hasNumberedSeats,
    availableSeatsCount: section.availableSeatsCount,
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

    return `${ticketType.label}: ${formatCurrencyFromCents(ticketType.priceCents)} + ${formatCurrencyFromCents(ticketType.feeCents)} taxa`;
  }

  return `A partir de: ${formatCurrencyFromCents(section.minPriceCents)} + ${formatCurrencyFromCents(section.minFeeCents)} taxa`;
}

function formatSectionsReply({
  selectedEvent,
  sections,
}: {
  selectedEvent: TicketConversationSelectedEvent;
  sections: AvailableSection[];
}) {
  const sectionLines = sections.flatMap((section, index) => [
    `${index + 1}. ${section.sectionName}`,
    `Disponíveis: ${section.availableSeatsCount}`,
    formatSectionPrice(section),
    "",
  ]);

  return [
    "Você escolheu:",
    "",
    selectedEvent.title,
    `Local: ${selectedEvent.city}/${selectedEvent.state}`,
    `Data: ${formatEventDate(selectedEvent.startsAt)}`,
    `Casa: ${selectedEvent.venueName ?? "A confirmar"}`,
    "",
    "Setores disponíveis:",
    "",
    ...sectionLines,
    "Responda com o número do setor para continuar.",
  ].join("\n");
}

function groupSeatCodesByRow(seats: AvailableSeat[]) {
  const rows = new Map<string, string[]>();

  for (const seat of seats) {
    const row = seat.rowLabel?.trim() || "Assentos";
    rows.set(row, [...(rows.get(row) ?? []), seat.seatCode]);
  }

  return Array.from(rows.entries()).map(([row, seatCodes]) =>
    row === "Assentos" ? seatCodes.join(", ") : `${row}: ${seatCodes.join(", ")}`,
  );
}

function formatSeatsReply({
  section,
  seatList,
}: {
  section: AvailableSection;
  seatList: AvailableSeatList;
}) {
  const intro = seatList.hasMore
    ? [`Mostrando os primeiros ${seatList.limit} assentos disponíveis.`]
    : [];

  return [
    `Setor escolhido: ${section.sectionName}`,
    "",
    "Assentos disponíveis:",
    ...intro,
    ...groupSeatCodesByRow(seatList.seats),
    "",
    "Responda com o código do assento desejado.",
    "Exemplo: A03",
  ].join("\n");
}

function normalizeSeatCode(value: string) {
  return value.trim().replace(/[\s-]+/g, "").toUpperCase();
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

type AdminSubmenuConfig = {
  title: string;
  state: AdminSubmenuState;
  mainOption: number;
  permission: AdminPermission;
  backOption: number;
  exitOption: number;
  options: string[];
};

const ADMIN_SUBMENUS: Record<AdminSubmenuState, AdminSubmenuConfig> = {
  admin_events_menu: {
    title: "Eventos",
    state: "admin_events_menu",
    mainOption: 1,
    permission: "manage_events",
    backOption: 8,
    exitOption: 9,
    options: [
      "Listar eventos",
      "Criar evento",
      "Editar evento",
      "Tirar da publicação/ativar evento",
      "Sessões e datas",
      "Setores e assentos",
      "Preços e lotes",
    ],
  },
  admin_orders_menu: {
    title: "Ingressos e pedidos",
    state: "admin_orders_menu",
    mainOption: 2,
    permission: "manage_tickets",
    backOption: 8,
    exitOption: 9,
    options: [
      "Buscar pedido por telefone",
      "Buscar pedido por código",
      "Reenviar ingresso",
      "Ver reservas ativas",
      "Ver pagamentos pendentes",
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
      "Enviar acesso para outro validador",
      "Ver acessos ativos",
      "Revogar acesso de portaria",
      "Contadores da portaria",
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
      "Ver sessões administrativas",
    ],
  },
  admin_reports_menu: {
    title: "Relatórios",
    state: "admin_reports_menu",
    mainOption: 6,
    permission: "view_reports",
    backOption: 8,
    exitOption: 9,
    options: [
      "Vendas por evento",
      "Vendas por setor",
      "Pagamentos pendentes",
      "Reservas expiradas",
      "Check-ins da portaria",
      "Ingressos usados e não usados",
      "Resumo geral",
    ],
  },
};

function renderAdminSubmenu(config: AdminSubmenuConfig) {
  return [
    config.title,
    "",
    ...config.options.map((label, index) => `${index + 1}. ${label}`),
    `${config.backOption}. Voltar`,
    `${config.exitOption}. Sair`,
    "",
    "Responda com o número da opção.",
    "Digite voltar para voltar ou cancelar para abandonar esta tela.",
  ].join("\n");
}

function renderAdminEventsMenu() {
  return renderAdminSubmenu(ADMIN_SUBMENUS.admin_events_menu);
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
    1: ["evento", "eventos"],
    2: ["ingresso", "ingressos", "pedido", "pedidos"],
    3: ["cortesia", "cortesias"],
    4: ["portaria"],
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
  selectedSeat: TicketConversationSelectedSeat;
  reservation: ReserveSelectedSeatSuccess;
}) {
  return [
    "Assento reservado por alguns minutos!",
    "",
    `Evento: ${selectedEvent.title}`,
    `Setor: ${selectedSection.sectionName}`,
    `Assento: ${selectedSeat.seatCode}`,
    "",
    `Valor: ${formatCurrencyFromCents(reservation.totalAmountCents)} + ${formatCurrencyFromCents(reservation.totalFeeCents)} taxa`,
    `Reserva válida até: ${formatTime(reservation.expiresAt)}`,
    "",
    "No próximo passo você receberá o link de pagamento.",
  ].join("\n");
}

function formatPaymentLinkReply({
  selectedEvent,
  selectedSection,
  selectedSeat,
  checkout,
}: {
  selectedEvent?: TicketConversationSelectedEvent;
  selectedSection?: TicketConversationSelectedSection;
  selectedSeat?: TicketConversationSelectedSeat;
  checkout: CheckoutForReservation;
}) {
  const lines = [
    "Link de pagamento gerado!",
    "",
    ...(selectedEvent ? [`Evento: ${selectedEvent.title}`] : []),
    ...(selectedSection ? [`Setor: ${selectedSection.sectionName}`] : []),
    ...(selectedSeat ? [`Assento: ${selectedSeat.seatCode}`] : []),
    `Total: ${formatCurrencyFromCents(checkout.amountCents)}`,
    "",
    "Pague por aqui:",
    checkout.checkoutUrl,
    "",
    `Sua reserva é válida até ${formatTime(checkout.expiresAt)}.`,
    "Após a confirmação do Mercado Pago, seu ingresso será emitido automaticamente.",
  ];

  return lines.join("\n");
}

function isConfirmText(text: string) {
  return normalizeAdminText(text) === "confirmar";
}

function isCancelText(text: string) {
  const normalized = normalizeAdminText(text);

  return normalized === "cancelar" || normalized === "voltar";
}

function isBackText(text: string) {
  return normalizeAdminText(text) === "voltar";
}

function isAbortText(text: string) {
  return normalizeAdminText(text) === "cancelar";
}

function withAdminNavigationHint(reply: string) {
  const normalized = normalizeAdminText(reply);

  if (normalized.includes("voltar") && normalized.includes("cancelar")) {
    return reply;
  }

  return [
    reply,
    "",
    "Digite voltar para voltar ou cancelar para abandonar esta tela.",
  ].join("\n");
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
        name: String(item.name ?? ""),
        slug: String(item.slug ?? ""),
        hasNumberedSeats: item.hasNumberedSeats === true,
        capacity: typeof item.capacity === "number" ? item.capacity : null,
        createInventorySeats: item.createInventorySeats === true,
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
      [
        `- ${section.name}`,
        section.hasNumberedSeats ? "assento marcado" : "sem assento marcado",
        section.capacity ? `capacidade ${section.capacity}` : "capacidade a definir",
        `valor ${formatCurrencyFromCents(section.priceCents)}`,
        `taxa ${formatCurrencyFromCents(section.feeCents)}`,
      ].join(" | "),
    ),
  ];
}

function parseInitialEntryDefinition(value: string, options: { numbered: boolean }) {
  const parts = value.split("|").map((part) => part.trim());

  if (parts.length < 3) {
    return null;
  }

  const [nameRaw, capacityRaw, priceRaw, feeRaw = "0"] = parts;
  const name = nameRaw?.trim();
  const capacity = Number(capacityRaw?.replace(/\D/g, ""));
  const priceCents = parseMoneyToCents(priceRaw ?? "");
  const feeCents = parseMoneyToCents(feeRaw);
  const slug = normalizeSlug(name ?? "");

  if (
    !name ||
    !slug ||
    !Number.isInteger(capacity) ||
    capacity <= 0 ||
    capacity > 5000 ||
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
    createInventorySeats: !options.numbered,
    ticketType: "full" as const,
    label: name,
    priceCents,
    feeCents,
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
    startsAt: "imageUrl",
    entryModel: "startsAt",
    singleEntryDetails: "entryModel",
    entryCount: "entryModel",
    entryItem: "entryCount",
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

  if (previousField === "entryCount") {
    delete nextDraft.initialSections;
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

function renderAdminEventListReply({
  events,
  hasMore,
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
}) {
  if (!events.length) {
    return withAdminNavigationHint("Não encontrei eventos cadastrados.");
  }

  return withAdminNavigationHint([
    "Eventos encontrados:",
    "",
    ...events.map((event) =>
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
    ),
    "",
    'Responda com o número para ver detalhes, "mais" para próxima página ou "voltar".',
    ...(hasMore ? [] : ["Não há mais páginas."]),
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
    "Opções:",
    "1. Editar evento",
    "2. Sessões e datas",
    "3. Setores e assentos",
    "4. Preços e lotes",
    "5. Tirar da publicação/ativar",
    "6. Voltar",
    "7. Sair",
  ].join("\n"));
}

function getAdminEventStatusActions(status: AdminEventStatus) {
  if (status === "published") {
    return [
      {
        option: 1,
        status: "draft" as const,
        label: "Voltar para rascunho / tirar da publicação",
      },
      { option: 2, status: "cancelled" as const, label: "Cancelar evento" },
    ];
  }

  if (status === "draft") {
    return [
      { option: 1, status: "published" as const, label: "Ativar/publicar" },
      { option: 2, status: "cancelled" as const, label: "Cancelar evento" },
    ];
  }

  return [];
}

function renderAdminEventStatusMenu(event: AdminEventDetails) {
  const actions = getAdminEventStatusActions(event.status);

  return withAdminNavigationHint([
    `Evento: ${event.title}`,
    `Status atual: ${event.status}`,
    "",
    ...(actions.length
      ? actions.map((action) => `${action.option}. ${action.label}`)
      : [
          event.status === "cancelled"
            ? "Este evento está cancelado. Reativação não está disponível por aqui."
            : "Este evento está finalizado. Alteração de publicação não está disponível por aqui.",
        ]),
    `${actions.length + 1}. Voltar`,
  ].join("\n"));
}

function renderCreateEventPrompt(field?: string) {
  const prompts: Record<string, string> = {
    title: "Qual o nome/título do evento?",
    artistName: "Qual o artista ou atração principal?",
    city: "Em qual cidade?",
    state: "Qual UF? Ex: SP",
    venueName: "Qual o nome do local/teatro/arena?",
    imageUrl:
      "Envie a foto do evento agora ou cole uma URL pública https://...\nPara salvar como rascunho sem foto, responda PULAR. Para publicar, a foto é obrigatória.",
    startsAt: "Qual a data e horário do evento? Ex: 10/06/2026 22:00",
    status: "Agora escolha o status do evento.\n1. Rascunho\n2. Publicado",
    entryModel:
      "Como serão as entradas/lugares?\n1. Entrada única sem assento marcado\n2. Vários setores/tipos sem assento marcado\n3. Setores com assentos marcados",
    singleEntryDetails:
      "Envie a entrada com capacidade e valor.\nFormato: nome | capacidade | valor | taxa opcional\nEx: Entrada Geral | 500 | 120,00 | 12,00",
    entryCount: "Quantos tipos/setores de ingresso serão cadastrados agora?",
    entryItem:
      "Envie o tipo/setor com capacidade e valor.\nFormato: nome | capacidade | valor | taxa opcional\nEx: Pista | 500 | 120,00 | 12,00",
  };

  return withAdminNavigationHint(prompts[field ?? "title"]);
}

function renderCreateEventSummary(draft: Record<string, unknown>) {
  return [
    "Confirme o novo evento:",
    "",
    `Título: ${draft.title}`,
    `Artista: ${draft.artistName}`,
    `Cidade/UF: ${draft.city}/${draft.state}`,
    `Local: ${draft.venueName}`,
    `Foto: ${draft.imageUrl ? "cadastrada" : "ausente"}`,
    `Data: ${formatDateTime(String(draft.startsAt))}`,
    `Status: ${draft.status}`,
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
    city_state: "Cidade/UF",
    venue: "Local",
    image_url: "Foto do evento",
    status: "Status",
  };
  const value =
    field === "city_state"
      ? `${draft.city}/${draft.state}`
      : field === "venue"
        ? draft.venueName
        : field === "image_url"
          ? draft.imageUrl
        : field === "status"
          ? draft.status
          : field === "title"
            ? draft.title
            : field === "artist_name"
              ? draft.artist_name
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

function getAdminEventsContext(baseContext: Partial<TicketConversationState>) {
  return baseContext.adminEvents ?? {};
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

async function buildAdminEventsListContext(
  baseContext: TicketConversationState,
  page: number,
  search?: string | null,
) {
  const result = await listAdminEvents({ page, search });

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
    }),
    nextContext: withAdminEventsContext(baseContext, "admin_events_list", {
      ...getAdminEventsContext(baseContext),
      page: result.page,
      hasMore: result.hasMore,
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
  const option = text.trim().match(/^\d+$/) ? Number(text.trim()) : null;

  if (!option) {
    return adminEvents.selectedEventId ?? null;
  }

  return (
    adminEvents.lastEvents?.find((event) => event.option === option)?.eventId ??
    null
  );
}

async function showAdminEventDetails(
  baseContext: TicketConversationState,
  eventId: string,
  prefix?: string,
) {
  const details = await getAdminEventDetails(eventId);

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

async function handleAdminEventsFlow({
  baseContext,
  text,
  mediaUrl,
}: {
  baseContext: TicketConversationState;
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
      return buildAdminEventsListContext(baseContext, 0);
    }

    if (numericOption === 2) {
      return {
        reply: renderCreateEventPrompt("title"),
        nextContext: withAdminEventsContext(baseContext, "admin_event_create_collecting", {
          draft: { field: "title" },
        }),
      };
    }

    if ([3, 4, 5, 6, 7].includes(numericOption ?? 0)) {
      const modeByOption: Record<number, string> = {
        3: "edit",
        4: "status",
        5: "sessions",
        6: "sections",
        7: "prices",
      };
      const list = await buildAdminEventsListContext(baseContext, 0);

      return {
        reply: [
          `Escolha o evento para ${
            numericOption === 3
              ? "editar"
              : numericOption === 4
                ? "tirar da publicação/ativar"
                : numericOption === 5
                  ? "gerenciar sessões"
                  : numericOption === 6
                    ? "gerenciar setores e assentos"
                    : "gerenciar preços"
          }.`,
          "",
          list.reply,
        ].join("\n"),
        nextContext: {
          ...list.nextContext,
          state: "admin_events_list",
          step: "admin_events_list",
          adminEvents: {
            ...list.nextContext.adminEvents,
            mode: modeByOption[numericOption ?? 0],
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

    if (normalized === "mais") {
      if (adminEvents.hasMore === false) {
        return {
          reply: [
            "Não há mais páginas de eventos.",
            "",
            'Responda com o número para ver detalhes ou "voltar".',
          ].join("\n"),
          nextContext: withAdminEventsContext(baseContext, "admin_events_list", adminEvents),
        };
      }

      return buildAdminEventsListContext(baseContext, (adminEvents.page ?? 0) + 1);
    }

    const eventId = getSelectedAdminEventId(text, adminEvents);

    if (!eventId) {
      return buildAdminEventsListContext(baseContext, 0, text);
    }

    if (adminEvents.mode === "edit") {
      const details = await getAdminEventDetails(eventId);

      if (!details.ok) {
        return {
          reply: "Não encontrei esse evento.",
          nextContext: withAdminEventsContext(baseContext, "admin_events_menu", {}),
        };
      }

      return {
        reply: [
          `Editar evento: ${details.event.title}`,
          "",
          "1. Título",
          "2. Artista",
          "3. Cidade/UF",
          "4. Local",
          "5. Foto do evento",
          "6. Status",
          "7. Voltar",
          "",
          "Responda com o número do campo.",
        ].join("\n"),
        nextContext: withAdminEventsContext(baseContext, "admin_event_edit_menu", {
          selectedEventId: eventId,
        }),
      };
    }

    if (adminEvents.mode === "status") {
      const details = await getAdminEventDetails(eventId);

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

    if (adminEvents.mode === "sessions") {
      return showAdminEventSessionsMenu(baseContext, eventId);
    }

    if (adminEvents.mode === "sections") {
      return showAdminEventSectionsMenu(baseContext, eventId);
    }

    if (adminEvents.mode === "prices") {
      return showAdminEventPricesMenu(baseContext, eventId);
    }

    return showAdminEventDetails(baseContext, eventId);
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
      return {
        reply: [
          "1. Título",
          "2. Artista",
          "3. Cidade/UF",
          "4. Local",
          "5. Foto do evento",
          "6. Status",
          "7. Voltar",
        ].join("\n"),
        nextContext: withAdminEventsContext(baseContext, "admin_event_edit_menu", {
          selectedEventId: eventId,
        }),
      };
    }

    if (numericOption === 2) return showAdminEventSessionsMenu(baseContext, eventId);
    if (numericOption === 3) return showAdminEventSectionsMenu(baseContext, eventId);
    if (numericOption === 4) return showAdminEventPricesMenu(baseContext, eventId);
    if (numericOption === 5) {
      const details = await getAdminEventDetails(eventId);

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

    if (numericOption === 6) {
      return buildAdminEventsListContext(baseContext, adminEvents.page ?? 0);
    }

    if (isBackText(text) || isAbortText(text)) {
      return buildAdminEventsListContext(baseContext, adminEvents.page ?? 0);
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
      imageUrl: "startsAt",
      startsAt: "entryModel",
      status: null,
      entryModel: null,
      singleEntryDetails: null,
      entryCount: null,
      entryItem: null,
    };

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
    } else if (field === "startsAt") {
      const startsAt = parseBrazilianDateTime(text);
      if (!startsAt || new Date(startsAt).getTime() <= Date.now()) {
        return {
          reply: "Data inválida ou no passado. Envie no formato 10/06/2026 22:00.",
          nextContext: withAdminEventsContext(baseContext, "admin_event_create_collecting", {
            draft,
          }),
        };
      }
      draft[field] = startsAt;
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
        draft.field = "singleEntryDetails";
        return {
          reply: renderCreateEventPrompt("singleEntryDetails"),
          nextContext: withAdminEventsContext(baseContext, "admin_event_create_collecting", {
            draft,
          }),
        };
      }
      if (option === "2") {
        draft.entryModel = "multiple_general";
        draft.field = "entryCount";
        return {
          reply: renderCreateEventPrompt("entryCount"),
          nextContext: withAdminEventsContext(baseContext, "admin_event_create_collecting", {
            draft,
          }),
        };
      }
      if (option === "3") {
        draft.entryModel = "numbered";
        draft.field = "entryCount";
        return {
          reply: renderCreateEventPrompt("entryCount"),
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
    } else if (field === "singleEntryDetails") {
      const section = parseInitialEntryDefinition(text, { numbered: false });
      if (!section) {
        return {
          reply:
            "Não consegui entender. Envie assim: Entrada Geral | 500 | 120,00 | 12,00",
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
      draft.initialSections = [];
      draft.field = "entryItem";
      return {
        reply: [
          `Envie o tipo/setor 1 de ${count}.`,
          "",
          renderCreateEventPrompt("entryItem"),
        ].join("\n"),
        nextContext: withAdminEventsContext(baseContext, "admin_event_create_collecting", {
          draft,
        }),
      };
    } else if (field === "entryItem") {
      const expectedCount = Number(draft.expectedEntryCount ?? 0);
      const currentIndex = Number(draft.currentEntryIndex ?? 1);
      const numbered = draft.entryModel === "numbered";
      const section = parseInitialEntryDefinition(text, { numbered });
      const currentSections = getInitialSectionsFromDraft(draft);
      const totalCapacity = currentSections.reduce(
        (sum, item) => sum + (item.capacity ?? 0),
        section?.capacity ?? 0,
      );

      if (!section || totalCapacity > 5000) {
        return {
          reply:
            "Não consegui entender. Envie assim: Pista | 500 | 120,00 | 12,00",
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
    const startsAt = String(draft.startsAt ?? "");
    const status = String(draft.status ?? "");
    const initialSections = getInitialSectionsFromDraft(draft);

    if (
      !title ||
      !artistName ||
      !city ||
      !/^[A-Z]{2}$/.test(state) ||
      !venueName ||
      !startsAt ||
      new Date(startsAt).getTime() <= Date.now() ||
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
      startsAt,
      status,
      initialSections,
    });

    if (!result.ok) {
      return {
        reply: result.partialEventCreated
          ? "O evento foi salvo como rascunho, mas não consegui criar a data. Entre em Sessões e datas para cadastrar a data antes de publicar."
          : "Não consegui criar o evento agora. Verifique os dados e tente novamente.",
        nextContext: withAdminEventsContext(baseContext, "admin_events_menu", {}),
      };
    }

    return {
      reply: [
        "Evento criado.",
        `Setores/entradas criados: ${result.createdSectionsCount}`,
        `Preços/lotes criados: ${result.createdPricesCount}`,
        result.createdSeatsCount
          ? `Unidades de entrada disponíveis criadas: ${result.createdSeatsCount}`
          : "Assentos marcados ainda precisam ser cadastrados no menu Setores e assentos.",
        "",
        "Agora você pode cadastrar ou revisar assentos e preços.",
      ].join("\n"),
      nextContext: withAdminEventsContext(baseContext, "admin_event_detail", {
        selectedEventId: result.eventId,
      }),
    };
  }

  if (baseContext.state === "admin_event_edit_menu") {
    const fieldByOption: Record<number, string> = {
      1: "title",
      2: "artist_name",
      3: "city_state",
      4: "venue",
      5: "image_url",
      6: "status",
    };
    const field = numericOption ? fieldByOption[numericOption] : null;

    if (!field || numericOption === 7) {
      return showAdminEventDetails(baseContext, adminEvents.selectedEventId ?? "");
    }

    return {
      reply:
        field === "city_state"
          ? "Envie a nova cidade/UF. Ex: Sorocaba/SP"
          : field === "venue"
            ? "Envie o novo nome do local."
            : field === "image_url"
              ? "Envie a nova foto do evento ou cole uma URL pública https://..."
            : field === "status"
              ? "Envie o novo status: draft, published, cancelled ou finished."
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

    let value: Record<string, unknown> | null = null;
    if (field === "city_state") {
      const [city, state] = text.split("/").map((part) => part.trim());
      if (!city || !/^[A-Za-z]{2}$/.test(state ?? "")) {
        return {
          reply: "Formato inválido. Envie como Sorocaba/SP.",
          nextContext: withAdminEventsContext(baseContext, "admin_event_edit_collecting", adminEvents),
        };
      }
      value = { field, city, state: state.toUpperCase() };
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
    if (!eventId || isCancelText(text)) {
      return showAdminEventDetails(baseContext, eventId ?? "");
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
    } else if (field === "city_state") {
      const city = String(draft.city ?? "").trim();
      const state = String(draft.state ?? "").trim().toUpperCase();
      if (city && /^[A-Z]{2}$/.test(state)) values = { city, state };
    } else if (field === "venue") {
      const venueName = String(draft.venueName ?? "").trim();
      const details = await getAdminEventDetails(eventId);

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
          const details = await getAdminEventDetails(eventId);
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
    return result.ok
      ? showAdminEventDetails(
          baseContext,
          eventId,
          field === "status" && draft.status === "cancelled" ? "EVENTO CANCELADO!" : undefined,
        )
      : {
          reply: "Não consegui salvar a alteração.",
          nextContext: withAdminEventsContext(baseContext, "admin_event_edit_menu", {
            selectedEventId: eventId,
          }),
        };
  }

  if (baseContext.state === "admin_event_status_select") {
    const eventId = adminEvents.selectedEventId;
    if (!eventId) {
      return showAdminEventDetails(baseContext, eventId ?? "");
    }
    const details = await getAdminEventDetails(eventId);

    if (!details.ok) {
      return {
        reply: "Não encontrei esse evento.",
        nextContext: withAdminEventsContext(baseContext, "admin_events_menu", {}),
      };
    }

    const actions = getAdminEventStatusActions(details.event.status);
    const backOption = actions.length + 1;

    if (numericOption === backOption) {
      return showAdminEventDetails(baseContext, eventId);
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
            ? "Responda CONFIRMAR para voltar o evento para rascunho (draft) e tirá-lo da publicação."
          : `Responda CONFIRMAR para alterar o status para ${targetStatus}.`,
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

    if (!eventId || isCancelText(text)) {
      return showAdminEventDetails(baseContext, eventId ?? "");
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
          eventId,
          status === "cancelled" ? "EVENTO CANCELADO!" : undefined,
        )
      : {
          reply: "Não consegui alterar o status.",
          nextContext: withAdminEventsContext(baseContext, "admin_events_menu", {}),
        };
  }

  return handleAdminEventOperationalSubmenus({ baseContext, text });
}

async function showAdminEventSessionsMenu(
  baseContext: TicketConversationState,
  eventId: string,
) {
  const details = await getAdminEventDetails(eventId);

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
    `Sessões e datas - ${eventTitle}`,
    "",
    "1. Listar sessões",
    "2. Criar sessão",
    "3. Editar data/hora de sessão",
    "4. Pausar/abrir vendas da sessão",
    "5. Cancelar sessão",
    "6. Voltar",
    "7. Sair",
  ].join("\n"));
}

async function showAdminEventSectionsMenu(
  baseContext: TicketConversationState,
  eventId: string,
) {
  const details = await getAdminEventDetails(eventId);

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
    `Setores e assentos - ${eventTitle}`,
    "",
    "1. Listar setores",
    "2. Criar setor",
    "3. Editar setor",
    "4. Cadastrar assentos em lote",
    "5. Bloquear/desbloquear assentos",
    "6. Criar assentos da sessão",
    "7. Voltar",
    "8. Sair",
  ].join("\n"));
}

async function showAdminEventPricesMenu(
  baseContext: TicketConversationState,
  eventId: string,
) {
  const details = await getAdminEventDetails(eventId);

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
    `Preços e lotes - ${eventTitle}`,
    "",
    "1. Listar preços",
    "2. Criar preço/lote",
    "3. Editar preço/lote",
    "4. Ativar/desativar preço",
    "5. Voltar",
    "6. Sair",
  ].join("\n"));
}

async function renderSessionsList(eventId: string) {
  const details = await getAdminEventDetails(eventId);
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

async function renderSectionsList(eventId: string, sessionId?: string) {
  const details = await getAdminEventDetails(eventId);
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

async function getAdminPriceListForEvent(eventId: string) {
  const details = await getAdminEventDetails(eventId);
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
  text,
}: {
  baseContext: TicketConversationState;
  text: string;
}): Promise<RouteTicketMessageOutput | null> {
  const adminEvents = getAdminEventsContext(baseContext);
  const eventId = adminEvents.selectedEventId;
  const numericOption = text.trim().match(/^\d+$/) ? Number(text.trim()) : null;

  if (!eventId) return null;

  if (isCancelText(text)) {
    if (baseContext.state === "admin_event_sessions_menu") {
      return showAdminEventDetails(baseContext, eventId);
    }

    if (baseContext.state === "admin_event_sections_menu") {
      return showAdminEventDetails(baseContext, eventId);
    }

    if (baseContext.state === "admin_event_prices_menu") {
      return showAdminEventDetails(baseContext, eventId);
    }

    if (
      baseContext.state === "admin_event_session_create_collecting" ||
      baseContext.state === "admin_event_session_edit_collecting"
    ) {
      return showAdminEventSessionsMenu(baseContext, eventId);
    }

    if (
      baseContext.state === "admin_event_section_create_collecting" ||
      baseContext.state === "admin_event_seats_create_collecting" ||
      baseContext.state === "admin_event_session_seats_confirm"
    ) {
      return showAdminEventSectionsMenu(baseContext, eventId);
    }

    if (
      baseContext.state === "admin_event_price_create_collecting" ||
      baseContext.state === "admin_event_price_edit_collecting"
    ) {
      return showAdminEventPricesMenu(baseContext, eventId);
    }
  }

  if (baseContext.state === "admin_event_sessions_menu") {
    if (numericOption === 1) {
      return {
        reply: await renderSessionsList(eventId),
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
          await renderSessionsList(eventId),
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
          await renderSessionsList(eventId),
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
          await renderSessionsList(eventId),
          "",
          "Envie o número da sessão que deseja cancelar.",
        ].join("\n"),
        nextContext: withAdminEventsContext(baseContext, "admin_event_session_edit_collecting", {
          ...adminEvents,
          mode: "cancel_session_select",
        }),
      };
    }
    if (numericOption === 6) return showAdminEventDetails(baseContext, eventId);
  }

  if (baseContext.state === "admin_event_session_create_collecting") {
    if (adminEvents.mode === "confirm_create_session") {
      if (isCancelText(text)) {
        return showAdminEventSessionsMenu(baseContext, eventId);
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
    const details = await getAdminEventDetails(eventId);
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
    const details = await getAdminEventDetails(eventId);
    if (!details.ok) return null;

    if (adminEvents.mode === "confirm_edit_session") {
      if (isCancelText(text)) return showAdminEventSessionsMenu(baseContext, eventId);
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
      if (isCancelText(text)) return showAdminEventSessionsMenu(baseContext, eventId);
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
        reply: await renderSectionsList(eventId),
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
          await renderSectionsList(eventId),
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
        reply: "Envie: número do setor | assentos. Ex: 1 | A01,A02,A03 ou 1 | A, de 1 até 20",
        nextContext: withAdminEventsContext(baseContext, "admin_event_seats_create_collecting", adminEvents),
      };
    }
    if (numericOption === 5) {
      return {
        reply: [
          await renderSectionsList(eventId),
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
    if (numericOption === 7) return showAdminEventDetails(baseContext, eventId);
  }

  if (baseContext.state === "admin_event_section_create_collecting") {
    if (adminEvents.mode === "confirm_edit_section") {
      if (isCancelText(text)) {
        return showAdminEventSectionsMenu(baseContext, eventId);
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
        return showAdminEventSectionsMenu(baseContext, eventId);
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
      const details = await getAdminEventDetails(eventId);
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

    const details = await getAdminEventDetails(eventId);
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
        return showAdminEventSectionsMenu(baseContext, eventId);
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
        return showAdminEventSectionsMenu(baseContext, eventId);
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
      const details = await getAdminEventDetails(eventId);
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

    const details = await getAdminEventDetails(eventId);
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

    const [sectionNumberRaw, seatsRaw] = text.split("|").map((part) => part.trim());
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
        return showAdminEventSectionsMenu(baseContext, eventId);
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

    const details = await getAdminEventDetails(eventId);
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
      const list = await getAdminPriceListForEvent(eventId);
      return {
        reply: list.reply,
        nextContext: withAdminEventsContext(baseContext, "admin_event_prices_menu", {
          ...adminEvents,
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
      const list = await getAdminPriceListForEvent(eventId);
      return {
        reply: [
          list.reply,
          "",
          "Envie: número do preço | label | preço | taxa | início opcional | fim opcional.",
          "Ex: 1 | Inteira 2 lote | 140,00 | 14,00 | - | -",
        ].join("\n"),
        nextContext: withAdminEventsContext(baseContext, "admin_event_price_edit_collecting", {
          ...adminEvents,
          mode: "edit_price",
          draft: list.ok ? { lastPrices: list.prices } : {},
        }),
      };
    }
    if (numericOption === 4) {
      const list = await getAdminPriceListForEvent(eventId);
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
    if (numericOption === 5) return showAdminEventDetails(baseContext, eventId);
  }

  if (baseContext.state === "admin_event_price_edit_collecting") {
    if (adminEvents.mode === "confirm_edit_price") {
      if (isCancelText(text)) return showAdminEventPricesMenu(baseContext, eventId);
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
        return showAdminEventPricesMenu(baseContext, eventId);
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

    const details = await getAdminEventDetails(eventId);
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
    return TICKET_MESSAGES.seatJustBecameUnavailable;
  }

  if (result.reason === "seat_unavailable") {
    return TICKET_MESSAGES.seatUnavailable;
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

    if (!verifyAdminPassphrase(text)) {
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
      state: "admin_menu" | AdminSubmenuState;
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
      if (baseContext.state === "admin_events_menu" && numericOption === 8) {
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
        (baseContext.state === "admin_events_menu" && numericOption === 9) ||
        (baseContext.state === "admin_event_detail" && numericOption === 7) ||
        (baseContext.state === "admin_event_sessions_menu" && numericOption === 7) ||
        (baseContext.state === "admin_event_sections_menu" && numericOption === 8) ||
        (baseContext.state === "admin_event_prices_menu" && numericOption === 6);

      if (isEventFlowExitOption) {
        return endAdminSession();
      }

      const eventFlowResult = await handleAdminEventsFlow({ baseContext, text, mediaUrl });

      if (eventFlowResult) {
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

      if (
        previousState.state === "admin_gate_menu" &&
        submenuOption === 1
      ) {
        const gateSessionResult = await createGateSession({
          validatorPhone: customer.whatsapp_phone,
          createdByAdminPhone: customer.whatsapp_phone,
          gateLabel: "Check-in",
        });

        if (!gateSessionResult.ok) {
          return {
            reply: TICKET_MESSAGES.gateAdminCreateError,
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
          reply: buildGateCheckInReply({
            gateUrl: gateSessionResult.gateUrl,
            expiresAt: gateSessionResult.gateSession.expires_at,
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
    return {
      reply: TICKET_MESSAGES.adminReservedNeutral,
      nextContext: {
        ...baseContext,
        step: "idle",
        state: "idle",
      },
    };
  }

  const parsedSearch = parseEventSearchMessage(text);

  if (
    previousState.state === "payment_pending" &&
    previousState.reservation?.reservationId &&
    previousState.reservation.orderId
  ) {
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
        reply: isUnavailableCheckoutFailure(checkoutResult)
          ? TICKET_MESSAGES.reservationUnavailableForPayment
          : TICKET_MESSAGES.checkoutGenericError,
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
        reply: isUnavailableCheckoutFailure(checkoutResult)
          ? TICKET_MESSAGES.reservationUnavailableForPayment
          : TICKET_MESSAGES.checkoutGenericError,
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

  if (previousState.state === "showing_seats" && previousState.lastSeats?.length) {
    const requestedSeatCode = normalizeSeatCode(text);
    const selectedSeat = previousState.lastSeats.find(
      (seat) => normalizeSeatCode(seat.seatCode) === requestedSeatCode,
    );

    if (!selectedSeat) {
      return {
        reply: TICKET_MESSAGES.seatInvalidOption,
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
      seatId: selectedSeat.seatId,
      ticketType: "full",
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

    const selectedSeatContext = buildSelectedSeatContext(selectedSeat);
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
      reply: formatSectionsReply({ selectedEvent, sections }),
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

      const selectedSectionContext = buildSelectedSection(selectedSection);

      if (!selectedSection.hasNumberedSeats) {
        return {
          reply: TICKET_MESSAGES.unnumberedSectionPending,
          nextContext: {
            ...baseContext,
            step: "showing_sections",
            state: "showing_sections",
            selectedEvent: buildSelectedEvent(selectedSession),
            selectedSection: selectedSectionContext,
            lastSeats: [],
          },
        };
      }

      const seatList = await listAvailableSeats({
        sessionId: selectedSession.sessionId,
        sectionId: selectedSection.sectionId,
      });

      if (seatList.seats.length === 0) {
        return {
          reply: TICKET_MESSAGES.noSeatsAvailable,
          nextContext: {
            ...baseContext,
            step: "showing_sections",
            state: "showing_sections",
            selectedSection: undefined,
            lastSeats: [],
          },
        };
      }

      return {
        reply: formatSeatsReply({ section: selectedSection, seatList }),
        nextContext: {
          ...baseContext,
          step: "showing_seats",
          state: "showing_seats",
          selectedEvent: buildSelectedEvent(selectedSession),
          selectedSection: selectedSectionContext,
          lastSeats: buildSeatOptions(seatList.seats),
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
