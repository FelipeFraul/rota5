import "server-only";

import { TICKET_MESSAGES } from "@/lib/tickets/messages";

type RouteTicketMessageInput = {
  phone: string;
  text: string;
};

type RouteTicketMessageOutput = {
  reply: string;
};

export async function routeTicketMessage({
  phone,
  text,
}: RouteTicketMessageInput): Promise<RouteTicketMessageOutput> {
  void phone;
  void text;

  return {
    reply: TICKET_MESSAGES.foundationPending,
  };
}
