export type TicketConversationStep = "foundation_pending";

export type TicketConversationState = {
  phone: string;
  step: TicketConversationStep;
  updatedAt: string;
};
