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

export const LOW_CONFIDENCE_PUBLIC_PROMPT = [
  TICKET_MESSAGES.genericHelp,
  TICKET_MESSAGES.genericHelpCommands,
].join("\n");

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
    return withIntent({
      reply: LOW_CONFIDENCE_PUBLIC_PROMPT,
      nextContext: baseContext,
    });
  }

  if (
    !isOperationalState(baseContext.state) &&
    incomingIntent.classification === "social_reply"
  ) {
    return withIntent({
      reply: LOW_CONFIDENCE_PUBLIC_PROMPT,
      nextContext: baseContext,
    });
  }

  if (
    !isOperationalState(baseContext.state) &&
    incomingIntent.classification === "courtesy"
  ) {
    return withIntent({
      reply: LOW_CONFIDENCE_PUBLIC_PROMPT,
      nextContext: baseContext,
    });
  }

  return null;
}
