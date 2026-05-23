export type TicketConversationStep =
  | "idle"
  | "admin_auth_pending"
  | "admin_menu"
  | "admin_events_menu"
  | "admin_orders_menu"
  | "admin_courtesies_menu"
  | "admin_gate_menu"
  | "admin_users_menu"
  | "admin_reports_menu"
  | "admin_events_list"
  | "admin_event_detail"
  | "admin_event_create_collecting"
  | "admin_event_create_confirm"
  | "admin_event_edit_select"
  | "admin_event_edit_menu"
  | "admin_event_edit_collecting"
  | "admin_event_edit_confirm"
  | "admin_event_status_select"
  | "admin_event_status_confirm"
  | "admin_event_sessions_menu"
  | "admin_event_session_create_collecting"
  | "admin_event_session_edit_collecting"
  | "admin_event_sections_menu"
  | "admin_event_section_create_collecting"
  | "admin_event_seats_create_collecting"
  | "admin_event_session_seats_confirm"
  | "admin_event_prices_menu"
  | "admin_event_price_create_collecting"
  | "admin_event_price_edit_collecting"
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

export type TicketConversationAdminEvents = {
  page?: number;
  lastEvents?: Array<{
    option: number;
    eventId: string;
    title: string;
  }>;
  selectedEventId?: string;
  selectedSessionId?: string;
  selectedSectionId?: string;
  selectedPriceId?: string;
  mode?: string;
  field?: string;
  draft?: Record<string, unknown>;
};

export type TicketConversationState = {
  step: TicketConversationStep;
  state: TicketConversationStep;
  lastInboundText?: string;
  admin?: TicketConversationAdmin;
  adminEvents?: TicketConversationAdminEvents;
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
