import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const publicAllEventsFormatting = readFileSync(
  new URL("../src/lib/tickets/publicAllEventsFormatting.ts", import.meta.url),
  "utf8",
);
const router = readFileSync(
  new URL("../src/lib/tickets/router.ts", import.meta.url),
  "utf8",
);

const SAO_PAULO_TIME_ZONE = "America/Sao_Paulo";
const ALL_EVENTS_MESSAGE_MAX_LENGTH = 3_500;
const ALL_EVENTS_CONTINUATION_DELAY_MS = 1_200;
const ALL_EVENTS_SEPARATOR = "--";
const ALL_EVENTS_FINAL_INSTRUCTIONS = [
  "> Reenviar seu ingresso, digite *AGAIN*",
  "> Para ajuda, digite *HELP*",
  "> Para uma nova pesquisa, *NEW*",
].join("\n");
const LOWERCASE_NAME_PARTS = new Set([
  "da",
  "das",
  "de",
  "do",
  "dos",
  "e",
]);

function formatEventDate(startsAt) {
  const date = new Date(startsAt);
  const weekday = new Intl.DateTimeFormat("pt-BR", {
    timeZone: SAO_PAULO_TIME_ZONE,
    weekday: "long",
  }).format(date);
  const dayAndTime = new Intl.DateTimeFormat("pt-BR", {
    timeZone: SAO_PAULO_TIME_ZONE,
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  })
    .format(date)
    .replace(",", " às");

  return `${weekday.charAt(0).toLocaleUpperCase("pt-BR") + weekday.slice(1)} ${dayAndTime}`;
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

function formatEventLocation(event) {
  const venueName = formatProperName(event.venueName);
  return venueName || formatCityState(event.city, event.state);
}

function formatSingleAllEventReply(event, index) {
  const buyOption = index * 2 + 1;
  const moreInfoOption = buyOption + 1;

  return [
    `🎟️ *${formatPublicEventTitle(event.title, event.artistName)}*`,
    `| Local: ${formatEventLocation(event)}`,
    `*| Data: ${formatEventDate(event.startsAt)}*`,
    "",
    formatOptionLine(buyOption, "comprar"),
    formatOptionLine(moreInfoOption, "ver mais"),
  ].join("\n");
}

function formatAllEventsReply(events) {
  const blocks = events.map((event, index) => formatSingleAllEventReply(event, index));

  return [
    "Encontrei estes eventos:",
    "",
    blocks.join(`\n\n${ALL_EVENTS_SEPARATOR}\n\n`),
    "",
    ALL_EVENTS_FINAL_INSTRUCTIONS,
  ].join("\n");
}

function buildAllEventsOutboundMessages(events) {
  if (events.some((event) => event.imageUrl)) {
    return [
      {
        type: "text",
        body: "Encontrei estes eventos:",
        suppressTitle: true,
      },
      ...events.map((event, index) => {
        const body = formatSingleAllEventReply(event, index);
        const delayMs = (index + 1) * ALL_EVENTS_CONTINUATION_DELAY_MS;

        return event.imageUrl
          ? {
              type: "image",
              imageUrl: event.imageUrl,
              caption: body,
              suppressTitle: true,
              delayMs,
            }
          : {
              type: "text",
              body,
              suppressTitle: true,
              delayMs,
            };
      }),
      {
        type: "text",
        body: ALL_EVENTS_FINAL_INSTRUCTIONS,
        suppressTitle: true,
        delayMs: (events.length + 1) * ALL_EVENTS_CONTINUATION_DELAY_MS,
      },
    ];
  }

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
    const separator = current === "Encontrei estes eventos:" || current === "*EVENTOS - CONTINUACAO*"
      ? "\n\n"
      : `\n\n${ALL_EVENTS_SEPARATOR}\n\n`;
    const candidate = `${current}${separator}${block}`;

    if (candidate.length <= ALL_EVENTS_MESSAGE_MAX_LENGTH) {
      current = candidate;
      return;
    }

    pushCurrentMessage();
    current = `*EVENTOS - CONTINUACAO*\n\n${block}`;
  });

  if (current) {
    const withFinalInstructions = `${current}\n\n${ALL_EVENTS_FINAL_INSTRUCTIONS}`;
    if (withFinalInstructions.length <= ALL_EVENTS_MESSAGE_MAX_LENGTH) {
      current = withFinalInstructions;
    } else {
      pushCurrentMessage();
      current = ALL_EVENTS_FINAL_INSTRUCTIONS;
    }
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
    venueName: "teatro municipal",
    startsAt: "2026-08-01T23:00:00.000Z",
  },
  {
    eventId: "event-2",
    sessionId: "session-2",
    title: "Xanda Dias",
    artistName: "Xanda Dias",
    city: "ribeirão preto",
    state: "sp",
    venueName: "rock bar pub",
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
  assert.match(publicAllEventsFormatting, /function formatAllEventsReply/);
  assert.match(publicAllEventsFormatting, /function formatSingleAllEventReply/);
  assert.match(publicAllEventsFormatting, /function buildAllEventsOutboundMessages/);
  assert.match(publicAllEventsFormatting, /ALL_EVENTS_MESSAGE_MAX_LENGTH = 3_500/);
  assert.match(publicAllEventsFormatting, /ALL_EVENTS_CONTINUATION_DELAY_MS = 1_200/);
  assert.match(publicAllEventsFormatting, /ALL_EVENTS_FINAL_INSTRUCTIONS/);
  assert.match(router, /events\.length === 0[\s\S]*bootstrap\.initialMessages/);
  assert.match(router, /events\.length === 0[\s\S]*resetBuyerReservationContext\(bootstrap\.nextContext\)/);
  assert.doesNotMatch(
    router,
    /events\.length === 0[\s\S]*reply:\s*`[^`]*\$\{TICKET_MESSAGES\.genericHelpPrompt\}`/,
  );
});

test("TODOS com um evento formata titulo, local, data e opcoes", () => {
  assert.equal(
    formatAllEventsReply([baseEvents[0]]),
    [
      "Encontrei estes eventos:",
      "",
      "🎟️ *YURI MARÇAL - SOLO NOVO*",
      "| Local: Teatro Municipal",
      "*| Data: Sábado 01/08 às 20:00*",
      "",
      "Digite 1 para *comprar*",
      "Digite 2 para *ver mais*",
      "",
      ALL_EVENTS_FINAL_INSTRUCTIONS,
    ].join("\n"),
  );
});

test("TODOS mostra apenas o titulo quando artistName for null", () => {
  assert.equal(formatPublicEventTitle("DEEP ILLUSIONS", null), "DEEP ILLUSIONS");
  assert.match(formatSingleAllEventReply({
    ...baseEvents[2],
    title: "DEEP ILLUSIONS",
    artistName: null,
  }, 0), /🎟️ \*DEEP ILLUSIONS\*/);
});

test("TODOS com varios eventos preserva ordem e numeracao", () => {
  assert.equal(
    formatAllEventsReply(baseEvents),
    [
      "Encontrei estes eventos:",
      "",
      "🎟️ *YURI MARÇAL - SOLO NOVO*",
      "| Local: Teatro Municipal",
      "*| Data: Sábado 01/08 às 20:00*",
      "",
      "Digite 1 para *comprar*",
      "Digite 2 para *ver mais*",
      "",
      "--",
      "",
      "🎟️ *XANDA DIAS*",
      "| Local: Rock Bar Pub",
      "*| Data: Domingo 02/08 às 19:30*",
      "",
      "Digite 3 para *comprar*",
      "Digite 4 para *ver mais*",
      "",
      "--",
      "",
      "🎟️ *NOITE DOS AMIGOS*",
      "| Local: Rio de Janeiro/RJ",
      "*| Data: Domingo 02/08 às 22:00*",
      "",
      "Digite 5 para *comprar*",
      "Digite 6 para *ver mais*",
      "",
      ALL_EVENTS_FINAL_INSTRUCTIONS,
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
  assert.match(messages[1].body, /^\*EVENTOS - CONTINUACAO\*/);
  assert.match(combinedBody, /\n--\n/);
  assert.ok(combinedBody.endsWith(ALL_EVENTS_FINAL_INSTRUCTIONS));
  assert.ok(messages.every((message) => message.body.length <= ALL_EVENTS_MESSAGE_MAX_LENGTH));
  assert.deepEqual(
    [...combinedBody.matchAll(/Digite (\d+) para/g)].map((match) => Number(match[1])),
    longEvents.flatMap((_, index) => [index * 2 + 1, index * 2 + 2]),
  );
});

test("TODOS envia foto dos eventos quando houver imageUrl", () => {
  const events = [
    {
      ...baseEvents[0],
      imageUrl: "https://example.com/evento-1.jpg",
    },
    {
      ...baseEvents[1],
    },
  ];
  const messages = buildAllEventsOutboundMessages(events);

  assert.deepEqual(
    messages.map((message) => ({
      type: message.type,
      imageUrl: message.imageUrl,
      body: message.body,
      caption: message.caption,
      suppressTitle: message.suppressTitle,
      delayMs: message.delayMs,
    })),
    [
      {
        type: "text",
        imageUrl: undefined,
        body: "Encontrei estes eventos:",
        caption: undefined,
        suppressTitle: true,
        delayMs: undefined,
      },
      {
        type: "image",
        imageUrl: "https://example.com/evento-1.jpg",
        body: undefined,
        caption: formatSingleAllEventReply(events[0], 0),
        suppressTitle: true,
        delayMs: ALL_EVENTS_CONTINUATION_DELAY_MS,
      },
      {
        type: "text",
        imageUrl: undefined,
        body: formatSingleAllEventReply(events[1], 1),
        caption: undefined,
        suppressTitle: true,
        delayMs: ALL_EVENTS_CONTINUATION_DELAY_MS * 2,
      },
      {
        type: "text",
        imageUrl: undefined,
        body: ALL_EVENTS_FINAL_INSTRUCTIONS,
        caption: undefined,
        suppressTitle: true,
        delayMs: ALL_EVENTS_CONTINUATION_DELAY_MS * 3,
      },
    ],
  );
});

