import "server-only";

import {
  buildInitialConversationState,
  type TicketConversationState,
} from "@/lib/tickets/conversationState";
import { TICKET_MESSAGES } from "@/lib/tickets/messages";

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

export async function routeTicketMessage({
  customer,
  conversation,
  text,
}: RouteTicketMessageInput): Promise<RouteTicketMessageOutput> {
  void customer;

  const previousState =
    conversation.context && typeof conversation.context === "object"
      ? (conversation.context as Partial<TicketConversationState>)
      : {};
  const nextContext = {
    ...buildInitialConversationState(),
    ...previousState,
    step: "welcome" as const,
    lastInboundText: text,
    updatedAt: new Date().toISOString(),
  };

  return {
    reply: TICKET_MESSAGES.foundationPending,
    nextContext,
  };
}
