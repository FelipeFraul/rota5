export type TicketConversationStep = "idle" | "showing_events";

export type TicketConversationSearch = {
  artist?: string;
  city?: string;
  dateFrom?: string;
  dateTo?: string;
  originalText?: string;
};

export type TicketConversationEventOption = {
  option: number;
  eventId: string;
  sessionId: string;
  title: string;
  startsAt: string;
  city: string;
  state: string;
  venueName?: string;
};

export type TicketConversationState = {
  step: TicketConversationStep;
  state: TicketConversationStep;
  lastInboundText?: string;
  lastSearch?: TicketConversationSearch;
  lastEvents?: TicketConversationEventOption[];
  updatedAt: string;
};

export function buildInitialConversationState(): TicketConversationState {
  return {
    step: "idle",
    state: "idle",
    updatedAt: new Date().toISOString(),
  };
}
