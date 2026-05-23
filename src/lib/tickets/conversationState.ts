export type TicketConversationStep =
  | "idle"
  | "admin_auth_pending"
  | "admin_menu"
  | "showing_events"
  | "showing_sections"
  | "showing_seats"
  | "reservation_created"
  | "payment_pending";

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
  venueId?: string | null;
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

export type TicketConversationSelectedSection = Pick<
  TicketConversationSectionOption,
  "sectionId" | "sectionName" | "hasNumberedSeats" | "availableSeatsCount"
>;

export type TicketConversationSeatOption = {
  sessionSeatId: string;
  seatId: string;
  seatCode: string;
  rowLabel?: string | null;
  seatNumber: string;
};

export type TicketConversationSelectedSeat = {
  seatId: string;
  seatCode: string;
};

export type TicketConversationReservation = {
  reservationId: string;
  orderId: string;
  expiresAt: string;
  totalAmountCents: number;
  totalFeeCents: number;
  currency: string;
};

export type TicketConversationPayment = {
  provider: "mercado_pago";
  checkoutUrl: string;
  preferenceId: string;
  amountCents: number;
  currency: string;
};

export type TicketAdminRole = "root" | "admin" | "operator" | "gate" | "support";

export type TicketConversationAdmin = {
  adminUserId?: string;
  role?: TicketAdminRole;
  sessionId?: string;
  expiresAt?: string;
};

export type TicketConversationState = {
  step: TicketConversationStep;
  state: TicketConversationStep;
  lastInboundText?: string;
  admin?: TicketConversationAdmin;
  lastSearch?: TicketConversationSearch;
  lastEvents?: TicketConversationEventOption[];
  selectedEvent?: TicketConversationSelectedEvent;
  selectedSection?: TicketConversationSelectedSection;
  selectedSeat?: TicketConversationSelectedSeat;
  reservation?: TicketConversationReservation;
  payment?: TicketConversationPayment;
  lastSections?: TicketConversationSectionOption[];
  lastSeats?: TicketConversationSeatOption[];
  updatedAt: string;
};

export function buildInitialConversationState(): TicketConversationState {
  return {
    step: "idle",
    state: "idle",
    updatedAt: new Date().toISOString(),
  };
}
