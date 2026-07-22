import { type TicketConversationState } from "@/lib/tickets/conversationState";
import { TICKET_MESSAGES } from "@/lib/tickets/messages";

type PublicEntryGateIntent = {
  classification:
    | "empty_message"
    | "unsupported_media"
    | "greeting"
    | "social_reply"
    | "courtesy"
    | string;
};

export const LOW_CONFIDENCE_PUBLIC_PROMPT = TICKET_MESSAGES.genericHelpPrompt;

function buildSeparatedPublicPrompt(baseContext: TicketConversationState) {
  const outboundMessages: Array<{
    type: "text";
    body: string;
    suppressTitle: boolean;
  }> = [
    {
      type: "text",
      body: TICKET_MESSAGES.genericHelp,
      suppressTitle: true,
    },
    {
      type: "text",
      body: TICKET_MESSAGES.genericHelpCommands,
      suppressTitle: true,
    },
  ];

  return {
    reply: TICKET_MESSAGES.genericHelp,
    outboundMessages,
    nextContext: baseContext,
  };
}

function isOperationalState(state?: string) {
  return (
    state?.startsWith("admin") ||
    state?.startsWith("gate") ||
    state === "reservation_created" ||
    state === "payment_pending"
  );
}

export function buildPublicEntryGateResponse<TIntent extends PublicEntryGateIntent>({
  incomingIntent,
  baseContext,
}: {
  incomingIntent: TIntent;
  baseContext: TicketConversationState;
}) {
  const withIntent = (output: {
    reply: string;
    nextContext: TicketConversationState;
    outboundMessages?: Array<{
      type: "text";
      body: string;
      suppressTitle?: boolean;
    }>;
  }) => ({
    ...output,
    intentResolution: incomingIntent,
  });

  if (incomingIntent.classification === "empty_message") {
    return withIntent({
      reply:
        "Não consegui identificar sua mensagem. Você pode escrever o que deseja ou digitar *TODOS* para ver os eventos.",
      nextContext: baseContext,
    });
  }

  if (incomingIntent.classification === "unsupported_media") {
    return withIntent({
      reply:
        "Não consegui identificar sua mensagem. Você pode escrever o que deseja ou digitar *TODOS* para ver os eventos.",
      nextContext: baseContext,
    });
  }

  if (
    !isOperationalState(baseContext.state) &&
    incomingIntent.classification === "greeting"
  ) {
    return withIntent(buildSeparatedPublicPrompt(baseContext));
  }

  if (
    !isOperationalState(baseContext.state) &&
    incomingIntent.classification === "social_reply"
  ) {
    return withIntent(buildSeparatedPublicPrompt(baseContext));
  }

  if (
    !isOperationalState(baseContext.state) &&
    incomingIntent.classification === "courtesy"
  ) {
    return withIntent(buildSeparatedPublicPrompt(baseContext));
  }

  return null;
}
