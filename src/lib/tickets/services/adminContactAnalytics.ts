import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { buildWhatsAppPhoneCandidates } from "@/lib/tickets/phones";

const SAO_PAULO_TIME_ZONE = "America/Sao_Paulo";

type MaybeArray<T> = T | T[] | null | undefined;

type InboundMessageRow = {
  conversation_id: string | null;
  customer_id: string | null;
  direction: "inbound" | "outbound";
  body: string | null;
  created_at: string;
  customers: MaybeArray<{
    name: string | null;
    whatsapp_phone: string;
  }>;
  conversations: MaybeArray<{
    context: Record<string, unknown> | null;
    status: string | null;
  }>;
};

type PaidReservationRow = {
  conversation_id: string | null;
  customer_id: string;
  event_sessions: MaybeArray<{
    id: string;
    starts_at: string;
    events: MaybeArray<{
      title: string;
      artist_name: string | null;
    }>;
  }>;
};

type AdminPhoneRow = {
  phone: string;
};

type OperationalPhoneRow = {
  phone: string;
};

export type AdminContactActivity = {
  range: AdminContactRange;
  periodLabel: string;
  dayKey: string;
  totalUniqueContacts: number;
  totalMessages: number;
  peakEndHour: number | null;
  peakUniqueContacts: number;
  intervals: Array<{
    endHour: number;
    uniqueContacts: number;
    messagesReceived: number;
  }>;
  points: Array<{
    key: string;
    label: string;
    intervalLabel?: string;
    positionHour?: number;
    uniqueContacts: number;
    messagesReceived: number;
  }>;
  peakLabel: string | null;
  contacts: Array<{
    customerId: string;
    name: string | null;
    phone: string;
    messageCount: number;
    firstContactAt: string;
    lastContactAt: string;
    purchasedTicket: boolean;
    stoppedAtState: string;
    stoppedAtLabel: string;
    lastInboundMessage: string | null;
    lastOutboundMessage: string | null;
    conversationMessages: Array<{
      direction: "inbound" | "outbound";
      body: string;
      createdAt: string;
    }>;
    purchasedEvents: Array<{
      sessionId: string;
      name: string;
      startsAt: string;
    }>;
  }>;
};

export type AdminContactRange = "day" | "week" | "30" | "60" | "total";

function first<T>(value: MaybeArray<T>): T | null {
  if (Array.isArray(value)) return value[0] ?? null;
  return value ?? null;
}

function getSaoPauloDayKey(value: string | Date) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: SAO_PAULO_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(typeof value === "string" ? new Date(value) : value);
  const year = parts.find((part) => part.type === "year")?.value ?? "0000";
  const month = parts.find((part) => part.type === "month")?.value ?? "00";
  const day = parts.find((part) => part.type === "day")?.value ?? "00";
  return `${year}-${month}-${day}`;
}

function getSaoPauloTodayBounds(now = new Date()) {
  const [year, month, day] = getSaoPauloDayKey(now).split("-").map(Number);
  const start = new Date(Date.UTC(year, month - 1, day, 3));
  const end = new Date(start);
  end.setUTCDate(end.getUTCDate() + 1);
  return { startIso: start.toISOString(), endIso: end.toISOString() };
}

function addUtcDays(value: Date, days: number) {
  const next = new Date(value);
  next.setUTCDate(next.getUTCDate() + days);
  return next;
}

function getRangeStart(range: AdminContactRange, todayStart: Date) {
  if (range === "day") return todayStart;
  if (range === "week") return addUtcDays(todayStart, -6);
  if (range === "30") return addUtcDays(todayStart, -29);
  if (range === "60") return addUtcDays(todayStart, -59);
  return null;
}

function getDayLabel(key: string) {
  const [, month, day] = key.split("-");
  return `${day}/${month}`;
}

function getSaoPauloHour(value: string) {
  return Number(new Intl.DateTimeFormat("en-US", {
    timeZone: SAO_PAULO_TIME_ZONE,
    hour: "2-digit",
    hourCycle: "h23",
  }).format(new Date(value))) || 0;
}

function formatHour(hour: number) {
  return `${String(hour).padStart(2, "0")}h`;
}

function getSixHourIntervalLabel(endHour: number) {
  return `${formatHour(endHour - 6)}–${formatHour(endHour)}`;
}

function compactMessageBody(value: string | null | undefined) {
  const compacted = value?.replace(/\s+/g, " ").trim() ?? "";
  if (!compacted) return null;
  if (/^\[(?:GATE_ACCESS|ADMIN_AUTH|ADMIN_LOGIN_LINK|CODEX_AUTH)_REDACTED\]$/.test(compacted)) {
    return "Mensagem protegida";
  }
  return compacted.length > 180 ? `${compacted.slice(0, 177).trimEnd()}...` : compacted;
}

function formatConversationMessageBody(value: string | null | undefined) {
  const compacted = value?.replace(/\s+/g, " ").trim() ?? "";
  if (!compacted) return "Mensagem vazia";
  if (/^\[(?:GATE_ACCESS|ADMIN_AUTH|ADMIN_LOGIN_LINK|CODEX_AUTH)_REDACTED\]$/.test(compacted)) {
    return "Mensagem protegida";
  }
  return compacted;
}

function getConversationState(context: Record<string, unknown> | null | undefined) {
  if (typeof context?.state === "string") return context.state;
  if (typeof context?.step === "string") return context.step;
  return "idle";
}

function getStoppedAtLabel(state: string, purchasedTicket: boolean) {
  const labels: Record<string, string> = {
    idle: purchasedTicket
      ? "Compra concluída / conversa encerrada"
      : "Conversa sem fluxo ativo",
    showing_events: "Lista de eventos",
    showing_sections: "Escolha de setor",
    showing_seats: "Escolha de assentos",
    selecting_quantity: "Escolha de quantidade",
    reviewing_cart: "Revisão do carrinho",
    reservation_created: "Reserva criada, aguardando pagamento",
    payment_pending: "Pagamento pendente",
    help_topic_collecting: "Ajuda: escolhendo assunto",
    help_results: "Ajuda: vendo respostas",
    ticket_resend_selecting: "Reenvio de ingresso",
    gate_access_selecting: "Portaria: escolhendo evento",
    gate_access_passphrase_collecting: "Portaria: aguardando palavra-chave",
    fixed_gate_passphrase_collecting: "Portaria fixa: aguardando palavra-chave",
    fixed_gate_event_selecting: "Portaria fixa: escolhendo evento",
  };

  return labels[state] ?? `Etapa: ${state.replace(/_/g, " ")}`;
}

async function fetchAllRows<T>(
  query: { range: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: unknown }> },
) {
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

function addPhoneWithCandidates(target: Set<string>, phone: string | null | undefined) {
  for (const candidate of buildWhatsAppPhoneCandidates(phone)) {
    target.add(candidate);
  }
}

function phoneMatches(target: Set<string>, phone: string | null | undefined) {
  return buildWhatsAppPhoneCandidates(phone).some((candidate) => target.has(candidate));
}

export async function getAdminContactActivity(input: {
  eventIds: string[];
  includeAllContacts: boolean;
  range?: AdminContactRange;
}): Promise<AdminContactActivity> {
  const supabase = getSupabaseAdmin();
  const now = new Date();
  const range = input.range ?? "day";
  const { startIso, endIso } = getSaoPauloTodayBounds(now);
  const rangeStart = getRangeStart(range, new Date(startIso));
  let messagesQuery = supabase
    .from("whatsapp_messages")
    .select("conversation_id, customer_id, direction, body, created_at, customers(name, whatsapp_phone), conversations(context, status)")
    .eq("direction", "inbound")
    .lt("created_at", endIso)
    .order("created_at", { ascending: true });
  if (rangeStart) messagesQuery = messagesQuery.gte("created_at", rangeStart.toISOString());
  const typedMessagesQuery = messagesQuery.returns<InboundMessageRow[]>();
  let outboundMessagesQuery = supabase
    .from("whatsapp_messages")
    .select("conversation_id, customer_id, direction, body, created_at, customers(name, whatsapp_phone), conversations(context, status)")
    .eq("direction", "outbound")
    .lt("created_at", endIso)
    .order("created_at", { ascending: true });
  if (rangeStart) outboundMessagesQuery = outboundMessagesQuery.gte("created_at", rangeStart.toISOString());
  const typedOutboundMessagesQuery = outboundMessagesQuery.returns<InboundMessageRow[]>();
  const adminPhonesQuery = supabase
    .from("admin_users")
    .select("phone")
    .returns<AdminPhoneRow[]>();
  const gatePhonesQuery = supabase
    .from("gate_accesses")
    .select("phone")
    .returns<OperationalPhoneRow[]>();
  const fixedGatePhonesQuery = supabase
    .from("fixed_gate_accesses")
    .select("phone")
    .returns<OperationalPhoneRow[]>();

  let paidReservations: PaidReservationRow[] = [];
  if (input.eventIds.length) {
    const paidReservationsQuery = supabase
      .from("reservations")
      .select("conversation_id, customer_id, event_sessions!inner(id, event_id, starts_at, events!inner(title, artist_name)), orders!inner(status, total_amount_cents)")
      .in("event_sessions.event_id", input.eventIds)
      .eq("orders.status", "paid")
      .gt("orders.total_amount_cents", 0)
      .returns<PaidReservationRow[]>();
    paidReservations = await fetchAllRows(paidReservationsQuery);
  }

  const [allMessages, allOutboundMessages, adminPhoneRows, gatePhoneRows, fixedGatePhoneRows] = await Promise.all([
    fetchAllRows(typedMessagesQuery),
    fetchAllRows(typedOutboundMessagesQuery),
    fetchAllRows(adminPhonesQuery),
    fetchAllRows(gatePhonesQuery),
    fetchAllRows(fixedGatePhonesQuery),
  ]);
  const operationalPhones = new Set<string>();
  for (const row of adminPhoneRows) addPhoneWithCandidates(operationalPhones, row.phone);
  for (const row of gatePhoneRows) addPhoneWithCandidates(operationalPhones, row.phone);
  for (const row of fixedGatePhoneRows) addPhoneWithCandidates(operationalPhones, row.phone);
  const paidConversationIds = new Set(
    paidReservations.map((reservation) => reservation.conversation_id).filter((id): id is string => Boolean(id)),
  );
  const paidCustomerIds = new Set(paidReservations.map((reservation) => reservation.customer_id));
  const purchasedEventsByCustomer = new Map<string, AdminContactActivity["contacts"][number]["purchasedEvents"]>();
  for (const reservation of paidReservations) {
    const session = first(reservation.event_sessions);
    const event = first(session?.events);
    if (!session || !event) continue;

    const purchasedEvents = purchasedEventsByCustomer.get(reservation.customer_id) ?? [];
    if (!purchasedEvents.some((item) => item.sessionId === session.id)) {
      purchasedEvents.push({
        sessionId: session.id,
        name: event.artist_name?.trim() || event.title,
        startsAt: session.starts_at,
      });
    }
    purchasedEventsByCustomer.set(reservation.customer_id, purchasedEvents);
  }
  const userMessages = allMessages.filter((message) => {
    const customer = first(message.customers);
    return Boolean(
      message.customer_id &&
      customer?.whatsapp_phone &&
      !phoneMatches(operationalPhones, customer.whatsapp_phone),
    );
  });
  const userOutboundMessages = allOutboundMessages.filter((message) => {
    const customer = first(message.customers);
    return Boolean(
      message.customer_id &&
      customer?.whatsapp_phone &&
      !phoneMatches(operationalPhones, customer.whatsapp_phone),
    );
  });
  const messages = input.includeAllContacts
    ? userMessages
    : userMessages.filter((message) => Boolean(message.conversation_id && paidConversationIds.has(message.conversation_id)));
  const outboundMessages = input.includeAllContacts
    ? userOutboundMessages
    : userOutboundMessages.filter((message) => Boolean(message.conversation_id && paidConversationIds.has(message.conversation_id)));
  const lastOutboundMessageByCustomer = new Map<string, { body: string | null; createdAt: string }>();
  for (const message of outboundMessages) {
    if (!message.customer_id) continue;
    const existing = lastOutboundMessageByCustomer.get(message.customer_id);
    if (!existing || message.created_at > existing.createdAt) {
      lastOutboundMessageByCustomer.set(message.customer_id, {
        body: compactMessageBody(message.body),
        createdAt: message.created_at,
      });
    }
  }
  const conversationMessagesByCustomer = new Map<string, AdminContactActivity["contacts"][number]["conversationMessages"]>();
  for (const message of [...messages, ...outboundMessages].sort((left, right) =>
    left.created_at.localeCompare(right.created_at),
  )) {
    if (!message.customer_id) continue;
    const existing = conversationMessagesByCustomer.get(message.customer_id) ?? [];
    existing.push({
      direction: message.direction === "outbound" ? "outbound" : "inbound",
      body: formatConversationMessageBody(message.body),
      createdAt: message.created_at,
    });
    conversationMessagesByCustomer.set(message.customer_id, existing);
  }
  const contactByCustomer = new Map<string, AdminContactActivity["contacts"][number]>();
  const contactIdsByInterval = new Map<number, Set<string>>(
    [6, 12, 18, 24].map((endHour) => [endHour, new Set<string>()]),
  );
  const messagesByInterval = new Map<number, number>(
    [6, 12, 18, 24].map((endHour) => [endHour, 0]),
  );
  const contactIdsByDay = new Map<string, Set<string>>();
  const messagesByDay = new Map<string, number>();

  for (const message of messages) {
    const customer = first(message.customers);
    if (!message.customer_id || !customer?.whatsapp_phone) continue;
    const purchasedTicket = paidCustomerIds.has(message.customer_id);
    const conversation = first(message.conversations);
    const stoppedAtState = getConversationState(conversation?.context);
    const existing = contactByCustomer.get(message.customer_id);
    const contact = existing ?? {
      customerId: message.customer_id,
      name: customer.name,
      phone: customer.whatsapp_phone,
      messageCount: 0,
      firstContactAt: message.created_at,
      lastContactAt: message.created_at,
      purchasedTicket,
      stoppedAtState,
      stoppedAtLabel: getStoppedAtLabel(stoppedAtState, purchasedTicket),
      lastInboundMessage: compactMessageBody(message.body),
      lastOutboundMessage: lastOutboundMessageByCustomer.get(message.customer_id)?.body ?? null,
      conversationMessages: conversationMessagesByCustomer.get(message.customer_id) ?? [],
      purchasedEvents: purchasedEventsByCustomer.get(message.customer_id) ?? [],
    };
    contact.messageCount += 1;
    if (message.created_at < contact.firstContactAt) contact.firstContactAt = message.created_at;
    if (message.created_at > contact.lastContactAt) {
      contact.lastContactAt = message.created_at;
      contact.lastInboundMessage = compactMessageBody(message.body);
      contact.lastOutboundMessage = lastOutboundMessageByCustomer.get(message.customer_id)?.body ?? null;
      contact.conversationMessages = conversationMessagesByCustomer.get(message.customer_id) ?? [];
      contact.stoppedAtState = stoppedAtState;
      contact.stoppedAtLabel = getStoppedAtLabel(stoppedAtState, contact.purchasedTicket);
    }
    contactByCustomer.set(message.customer_id, contact);

    const endHour = Math.min(24, Math.floor(getSaoPauloHour(message.created_at) / 6) * 6 + 6);
    contactIdsByInterval.get(endHour)?.add(message.customer_id);
    messagesByInterval.set(endHour, (messagesByInterval.get(endHour) ?? 0) + 1);
    const messageDayKey = getSaoPauloDayKey(message.created_at);
    const dayContacts = contactIdsByDay.get(messageDayKey) ?? new Set<string>();
    dayContacts.add(message.customer_id);
    contactIdsByDay.set(messageDayKey, dayContacts);
    messagesByDay.set(messageDayKey, (messagesByDay.get(messageDayKey) ?? 0) + 1);
  }

  const intervals = [6, 12, 18, 24].map((endHour) => ({
    endHour,
    uniqueContacts: contactIdsByInterval.get(endHour)?.size ?? 0,
    messagesReceived: messagesByInterval.get(endHour) ?? 0,
  }));
  const peak = intervals.reduce(
    (current, interval) => interval.uniqueContacts > current.uniqueContacts ? interval : current,
    intervals[0],
  );
  const todayKey = getSaoPauloDayKey(now);
  let points: AdminContactActivity["points"];

  if (range === "day") {
    points = [
      ...intervals.map((interval) => ({
        key: `${todayKey}-${interval.endHour - 6}`,
        label: formatHour(interval.endHour - 6),
        intervalLabel: getSixHourIntervalLabel(interval.endHour),
        positionHour: interval.endHour - 3,
        uniqueContacts: interval.uniqueContacts,
        messagesReceived: interval.messagesReceived,
      })),
    ];
  } else {
    const firstDay = rangeStart
      ? getSaoPauloDayKey(rangeStart)
      : [...contactIdsByDay.keys()].sort()[0] ?? todayKey;
    points = [];
    for (let cursor = new Date(`${firstDay}T12:00:00.000Z`); getSaoPauloDayKey(cursor) <= todayKey; cursor = addUtcDays(cursor, 1)) {
      const key = getSaoPauloDayKey(cursor);
      points.push({
        key,
        label: getDayLabel(key),
        uniqueContacts: contactIdsByDay.get(key)?.size ?? 0,
        messagesReceived: messagesByDay.get(key) ?? 0,
      });
    }
  }
  const peakPoint = points.reduce(
    (current, point) => point.uniqueContacts > current.uniqueContacts ? point : current,
    points[0],
  );
  const periodLabels: Record<AdminContactRange, string> = {
    day: "Hoje",
    week: "Últimos 7 dias",
    "30": "Últimos 30 dias",
    "60": "Últimos 60 dias",
    total: "Todo o período",
  };

  return {
    range,
    periodLabel: periodLabels[range],
    dayKey: todayKey,
    totalUniqueContacts: contactByCustomer.size,
    totalMessages: messages.length,
    peakEndHour: peak.uniqueContacts > 0 ? peak.endHour : null,
    peakUniqueContacts: peak.uniqueContacts,
    intervals,
    points,
    peakLabel: peakPoint.uniqueContacts > 0
      ? range === "day"
        ? getSixHourIntervalLabel(peak.endHour)
        : peakPoint.label
      : null,
    contacts: [...contactByCustomer.values()].sort((left, right) =>
      right.lastContactAt.localeCompare(left.lastContactAt),
    ),
  };
}
