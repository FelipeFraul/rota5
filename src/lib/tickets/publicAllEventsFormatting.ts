import type { TicketConversationEventOption } from "@/lib/tickets/conversationState";
import {
  formatEventDate,
  formatEventLocation,
  formatOptionLine,
  formatPublicEventTitle,
} from "@/lib/tickets/eventFormatting";
import type { TicketEventSearchResult } from "@/lib/tickets/services/events";

export const ALL_EVENTS_MESSAGE_MAX_LENGTH = 3_500;
export const ALL_EVENTS_CONTINUATION_DELAY_MS = 1_200;
const ALL_EVENTS_SEPARATOR = "--";
const ALL_EVENTS_HEADER = "*ENCONTREI ESTES EVENTOS:*";
export const ALL_EVENTS_FINAL_INSTRUCTIONS = [
  "> Reenviar seu ingresso, digite *AGAIN*",
  "> Para ajuda, digite *HELP*",
  "> Para uma nova pesquisa, *NEW*",
].join("\n");

export function formatAllEventsReply(
  events: Array<TicketEventSearchResult | TicketConversationEventOption>,
) {
  const blocks = events.map((event, index) => formatSingleAllEventReply(event, index));

  return [
    ALL_EVENTS_HEADER,
    "",
    blocks.join(`\n\n${ALL_EVENTS_SEPARATOR}\n\n`),
    "",
    ALL_EVENTS_FINAL_INSTRUCTIONS,
  ].join("\n");
}

export function formatSingleAllEventReply(
  event: TicketEventSearchResult | TicketConversationEventOption,
  index: number,
) {
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

export function buildAllEventsOutboundMessages(
  events: Array<TicketEventSearchResult | TicketConversationEventOption>,
) {
  if (events.some((event) => event.imageUrl)) {
    return [
      {
        type: "text",
        body: ALL_EVENTS_HEADER,
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
            } as const
          : {
              type: "text",
              body,
              suppressTitle: true,
              delayMs,
            } as const;
      }),
      {
        type: "text",
        body: ALL_EVENTS_FINAL_INSTRUCTIONS,
        suppressTitle: true,
        delayMs: (events.length + 1) * ALL_EVENTS_CONTINUATION_DELAY_MS,
      },
    ] satisfies Array<
      | {
          type: "text";
          body: string;
          suppressTitle: true;
          delayMs?: number;
        }
      | {
          type: "image";
          imageUrl: string;
          caption: string;
          suppressTitle: true;
          delayMs?: number;
        }
    >;
  }

  const messages: Array<{
    type: "text";
    body: string;
    suppressTitle: true;
    delayMs?: number;
  }> = [];
  let current = ALL_EVENTS_HEADER;
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
    const separator = current === ALL_EVENTS_HEADER || current === "*EVENTOS - CONTINUACAO*"
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

