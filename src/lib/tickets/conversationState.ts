export type TicketConversationStep =
  | "idle"
  | "showing_events"
  | "showing_sections";

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

export type TicketConversationSelectedEvent = Omit<
  TicketConversationEventOption,
  "option"
>;

export type TicketConversationSectionTicketType = {
  ticketPriceId: string;
  ticketType: string;
  label: string;
  priceCents: number;
  feeCents: number;
  currency: string;
};

export type TicketConversationSectionOption = {
  option: number;
  sectionId: string;
  sectionName: string;
  hasNumberedSeats: boolean;
  availableSeatsCount: number;
  minPriceCents: number;
  minFeeCents: number;
  ticketTypes: TicketConversationSectionTicketType[];
};

export type TicketConversationState = {
  step: TicketConversationStep;
  state: TicketConversationStep;
  lastInboundText?: string;
  lastSearch?: TicketConversationSearch;
  lastEvents?: TicketConversationEventOption[];
  selectedEvent?: TicketConversationSelectedEvent;
  lastSections?: TicketConversationSectionOption[];
  updatedAt: string;
};

export function buildInitialConversationState(): TicketConversationState {
  return {
    step: "idle",
    state: "idle",
    updatedAt: new Date().toISOString(),
  };
}
