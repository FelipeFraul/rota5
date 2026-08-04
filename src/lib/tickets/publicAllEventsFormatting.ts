import type { TicketConversationEventOption } from "@/lib/tickets/conversationState";
import {
  formatEventDate,
  formatEventLocation,
  formatPublicEventTitle,
} from "@/lib/tickets/eventFormatting";
import type { TicketEventSearchResult } from "@/lib/tickets/services/events";

type PublicEventAction = {
  event: TicketEventSearchResult | TicketConversationEventOption;
  action: "buy" | "more_info";
  option: number;
};

function formatPublicActionLine(option: number, label: "comprar" | "ver mais") {
  return `Digite *${option}* para *${label}*`;
}

export const ALL_EVENTS_MESSAGE_MAX_LENGTH = 3_500;
export const ALL_EVENTS_CONTINUATION_DELAY_MS = 1_200;
const ALL_EVENTS_SEPARATOR = "--";
const ALL_EVENTS_HEADER = "*ENCONTREI ESTES EVENTOS:*";
export const ALL_EVENTS_FINAL_INSTRUCTIONS = [
  "> Reenviar seu ingresso, digite MANDA",
  "> Para ajuda, digite DÁ UMA MÃO",
  "> Para uma nova pesquisa, ZERO BALA",
].join("\n");

export function formatAllEventsReply(
  events: Array<TicketEventSearchResult | TicketConversationEventOption>,
) {
  const actions = buildPublicEventActions(events);
  const blocks = events.map((event) => formatSingleAllEventReply(event, actions));

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
  actionsOrIndex: PublicEventAction[] | number,
) {
  const actions = Array.isArray(actionsOrIndex)
    ? actionsOrIndex.filter((action) => action.event === event)
    : buildPublicEventActions([event]);
  const buyAction = actions.find((action) => action.action === "buy");
  const moreInfoAction = actions.find((action) => action.action === "more_info");
  const optionLines =
    event.availabilityStatus === "sold_out"
      ? ["SOLD OUT", moreInfoAction ? formatPublicActionLine(moreInfoAction.option, "ver mais") : null]
      : event.availabilityStatus === "sales_closed"
        ? [
            "VENDAS ENCERRADAS",
            moreInfoAction ? formatPublicActionLine(moreInfoAction.option, "ver mais") : null,
          ]
        : [
            buyAction ? formatPublicActionLine(buyAction.option, "comprar") : null,
            moreInfoAction ? formatPublicActionLine(moreInfoAction.option, "ver mais") : null,
          ];

  return [
    `🎟️ *${formatPublicEventTitle(event.title, event.artistName)}*`,
    `| Local: *${formatEventLocation(event)}*`,
    `| Data: *${formatEventDate(event.startsAt)}*`,
    "",
    ...optionLines.filter((line): line is string => Boolean(line)),
  ].join("\n");
}

export function buildPublicEventActions(
  events: Array<TicketEventSearchResult | TicketConversationEventOption>,
) {
  let option = 1;
  const actions: PublicEventAction[] = [];

  for (const event of events) {
    if (event.availabilityStatus !== "sold_out" && event.availabilityStatus !== "sales_closed") {
      actions.push({ event, action: "buy", option });
      option += 1;
    }

    actions.push({ event, action: "more_info", option });
    option += 1;
  }

  return actions;
}

export function buildAllEventsOutboundMessages(
  events: Array<TicketEventSearchResult | TicketConversationEventOption>,
) {
  const actions = buildPublicEventActions(events);

  if (events.some((event) => event.imageUrl)) {
    return [
      {
        type: "text",
        body: ALL_EVENTS_HEADER,
        suppressTitle: true,
      },
      ...events.map((event, index) => {
        const body = formatSingleAllEventReply(event, actions);
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

  events.forEach((event) => {
    const block = formatSingleAllEventReply(event, actions);
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

