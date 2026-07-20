import assert from "node:assert/strict";
import test from "node:test";

const SAO_PAULO_TIME_ZONE = "America/Sao_Paulo";
const ALL_EVENTS_MESSAGE_MAX_LENGTH = 3_500;
const ALL_EVENTS_CONTINUATION_DELAY_MS = 1_200;
const LOWERCASE_NAME_PARTS = new Set([
  "da",
  "das",
  "de",
  "do",
  "dos",
  "e",
]);

function formatEventDate(startsAt) {
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

function formatOptionLine(option, label, { preserveCase = false } = {}) {
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

function formatAnnouncementTitle(value) {
  return value.trim().toLocaleUpperCase("pt-BR");
}

function normalizeDisplayComparison(value) {
  return value
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim()
    .toLocaleUpperCase("pt-BR");
}

function formatPublicEventTitle(title, artistName) {
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

function capitalizeNamePart(value) {
  if (!value) return value;
  return value.charAt(0).toLocaleUpperCase("pt-BR") + value.slice(1);
}

function formatProperName(value) {
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

function formatCityState(city, state) {
  return `${formatProperName(city)}/${state.trim().toLocaleUpperCase("pt-BR")}`;
}

function formatSingleAllEventReply(event, index) {
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

function formatAllEventsReply(events) {
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

function buildAllEventsOutboundMessages(events) {
  const messages = [];
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
    current = `*EVENTOS — CONTINUAÇÃO*\n\n${block}`;
  });

  if (current) {
    pushCurrentMessage();
  }

  return messages;
}

const baseEvents = [
  {
    eventId: "event-1",
    sessionId: "session-1",
    title: "Yuri Marçal em Solo Novo",
    artistName: "Yuri Marçal",
    city: "sorocaba",
    state: "sp",
    startsAt: "2026-08-01T23:00:00.000Z",
  },
  {
    eventId: "event-2",
    sessionId: "session-2",
    title: "Xanda Dias",
    artistName: "Xanda Dias",
    city: "ribeirão preto",
    state: "sp",
    startsAt: "2026-08-02T22:30:00.000Z",
  },
  {
    eventId: "event-3",
    sessionId: "session-3",
    title: "Noite dos Amigos",
    artistName: null,
    city: "rio de janeiro",
    state: "rj",
    startsAt: "2026-08-03T01:00:00.000Z",
  },
];

test("TODOS sem eventos preserva a resposta atual do router", () => {
  assert.equal(
    `Não encontrei eventos disponíveis no momento.\n\nOlá, *bem-vindo(a) à Black House*, casa de Comédia de Sorocaba!`,
    "Não encontrei eventos disponíveis no momento.\n\nOlá, *bem-vindo(a) à Black House*, casa de Comédia de Sorocaba!",
  );
});

test("TODOS com um evento formata titulo, cidade, data e opcoes", () => {
  assert.equal(
    formatAllEventsReply([baseEvents[0]]),
    [
      "Encontrei estes eventos:",
      "",
      "🎟️ - *YURI MARÇAL - SOLO NOVO*",
      "| Cidade: Sorocaba/SP",
      "| Data: 01/08/2026 às 20:00",
      "",
      "Digite 1 para *comprar*",
      "Digite 2 para *ver mais*",
      "",
    ].join("\n"),
  );
});

test("TODOS com varios eventos preserva ordem e numeracao", () => {
  assert.equal(
    formatAllEventsReply(baseEvents),
    [
      "Encontrei estes eventos:",
      "",
      "🎟️ - *YURI MARÇAL - SOLO NOVO*",
      "| Cidade: Sorocaba/SP",
      "| Data: 01/08/2026 às 20:00",
      "",
      "Digite 1 para *comprar*",
      "Digite 2 para *ver mais*",
      "",
      "🎟️ - *XANDA DIAS*",
      "| Cidade: Ribeirão Preto/SP",
      "| Data: 02/08/2026 às 19:30",
      "",
      "Digite 3 para *comprar*",
      "Digite 4 para *ver mais*",
      "",
      "🎟️ - *NOITE DOS AMIGOS*",
      "| Cidade: Rio de Janeiro/RJ",
      "| Data: 02/08/2026 às 22:00",
      "",
      "Digite 5 para *comprar*",
      "Digite 6 para *ver mais*",
      "",
    ].join("\n"),
  );
});

test("TODOS divide em multiplas mensagens e aplica delay nas continuacoes", () => {
  const longEvents = Array.from({ length: 45 }, (_, index) => ({
    ...baseEvents[index % baseEvents.length],
    eventId: `event-long-${index + 1}`,
    sessionId: `session-long-${index + 1}`,
    title: `Show Especial ${String(index + 1).padStart(2, "0")} com Nome Muito Longo`,
    artistName: `Artista ${String(index + 1).padStart(2, "0")}`,
  }));
  const messages = buildAllEventsOutboundMessages(longEvents);

  assert.ok(messages.length > 1);
  const combinedBody = messages.map((message) => message.body).join("\n");

  assert.deepEqual(
    messages.map((message) => ({
      type: message.type,
      suppressTitle: message.suppressTitle,
      delayMs: message.delayMs,
    })),
    [
      { type: "text", suppressTitle: true, delayMs: undefined },
      ...messages.slice(1).map(() => ({
        type: "text",
        suppressTitle: true,
        delayMs: ALL_EVENTS_CONTINUATION_DELAY_MS,
      })),
    ],
  );
  assert.match(messages[1].body, /^\*EVENTOS — CONTINUAÇÃO\*/);
  assert.ok(messages.every((message) => message.body.length <= ALL_EVENTS_MESSAGE_MAX_LENGTH));
  assert.deepEqual(
    [...combinedBody.matchAll(/Digite (\d+) para/g)].map((match) => Number(match[1])),
    longEvents.flatMap((_, index) => [index * 2 + 1, index * 2 + 2]),
  );
});
