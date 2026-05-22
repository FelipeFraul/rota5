export type TicketConversationStep = "welcome";

export type TicketConversationState = {
  step: TicketConversationStep;
  lastInboundText?: string;
  updatedAt: string;
};

export function buildInitialConversationState(): TicketConversationState {
  return {
    step: "welcome",
    updatedAt: new Date().toISOString(),
  };
}
