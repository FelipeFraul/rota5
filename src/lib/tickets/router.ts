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
  createGateSession,
  normalizeGatePhone,
  revokeGateSession,
} from "@/lib/tickets/services/gateSessions";
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
};

type RouteTicketMessageOutput = {
  reply: string;
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
    startsAt: event.startsAt,
    city: event.city,
    state: event.state,
    venueId: event.venueId,
    ...(event.venueName ? { venueName: event.venueName } : {}),
  }));
}

function formatEventsReply(events: TicketEventSearchResult[]) {
  const lines = events.flatMap((event, index) => [
    `${index + 1}. ${event.title}`,
    `${event.artistName}`,
    `Local: ${event.city}/${event.state}`,
    `Data: ${formatEventDate(event.startsAt)}`,
    `Casa: ${event.venueName ?? "A confirmar"}`,
    "",
  ]);

  return [
    "Encontrei estes eventos:",
    "",
    ...lines,
    "Responda com o número do evento para continuar.",
  ].join("\n");
}

function buildSelectedEvent(
  event: TicketEventSearchResult,
): TicketConversationSelectedEvent {
  return {
    eventId: event.eventId,
    sessionId: event.sessionId,
    title: event.title,
    startsAt: event.startsAt,
    city: event.city,
    state: event.state,
    venueId: event.venueId,
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
}: RouteTicketMessageInput): Promise<RouteTicketMessageOutput> {
  const previousState = getConversationState(conversation.context);
  const parsedSearch = parseEventSearchMessage(text);
  const baseContext = {
    ...buildInitialConversationState(),
    ...previousState,
    updatedAt: new Date().toISOString(),
  };
  const gateCommand = parseGateCommand(text);

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
      reply: TICKET_MESSAGES.genericHelp,
      nextContext: {
        ...baseContext,
        step: "idle",
        state: "idle",
      },
    };
  }

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
    nextContext: {
      ...baseContext,
      step: "showing_events",
      state: "showing_events",
      lastSearch: parsedSearch,
      lastEvents: buildEventOptions(events),
    },
  };
}
