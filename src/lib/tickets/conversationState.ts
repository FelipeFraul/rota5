export type TicketConversationStep =
  | "idle"
  | "admin_auth_pending"
  | "admin_menu"
  | "admin_events_menu"
  | "admin_orders_menu"
  | "admin_courtesies_menu"
  | "admin_courtesy_generate_type"
  | "admin_courtesy_phone_collecting"
  | "admin_courtesy_event_select"
  | "admin_courtesy_list_event_select"
  | "admin_courtesy_resend_event_select"
  | "admin_courtesy_cancel_event_select"
  | "admin_courtesy_cancel_method_select"
  | "admin_courtesy_cancel_target_collecting"
  | "admin_courtesy_limit_event_select"
  | "admin_courtesy_limit_collecting"
  | "admin_gate_menu"
  | "admin_gate_register_event_select"
  | "admin_gate_validator_collecting"
  | "admin_gate_password_collecting"
  | "admin_gate_access_event_select"
  | "admin_gate_accesses_filter"
  | "admin_gate_revoke_select"
  | "admin_gate_revoke_confirm"
  | "admin_users_menu"
  | "admin_users_add_type_select"
  | "admin_users_add_phone_collecting"
  | "admin_users_add_name_collecting"
  | "admin_users_add_passphrase_collecting"
  | "admin_users_role_select"
  | "admin_users_role_collecting"
  | "admin_users_disable_select"
  | "admin_reports_menu"
  | "admin_report_event_select"
  | "admin_report_period_select"
  | "admin_report_custom_period_collecting"
  | "admin_order_phone_collecting"
  | "admin_order_code_collecting"
  | "admin_order_cancel_collecting"
  | "admin_ticket_consult_collecting"
  | "admin_events_list"
  | "admin_event_detail"
  | "admin_event_create_collecting"
  | "admin_event_create_confirm"
  | "admin_event_create_status"
  | "admin_event_edit_select"
  | "admin_event_edit_menu"
  | "admin_event_edit_collecting"
  | "admin_event_edit_confirm"
  | "admin_event_edit_publish_select"
  | "admin_event_duplicate_confirm"
  | "admin_event_status_select"
  | "admin_event_status_confirm"
  | "admin_event_sessions_menu"
  | "admin_event_session_create_collecting"
  | "admin_event_session_edit_collecting"
  | "admin_event_sections_menu"
  | "admin_event_capacity_collecting"
  | "admin_event_section_create_collecting"
  | "admin_event_seats_create_collecting"
  | "admin_event_session_seats_confirm"
  | "admin_event_prices_menu"
  | "admin_event_price_create_collecting"
  | "admin_event_price_edit_collecting"
  | "showing_events"
  | "showing_sections"
  | "selecting_quantity"
  | "showing_seats"
  | "reservation_created"
  | "gate_access_selecting"
  | "gate_access_passphrase_collecting"
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
  artistName?: string;
  startsAt: string;
  city: string;
  state: string;
  venueId?: string | null;
  venueName?: string;
  imageUrl?: string;
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
  selectedTicketType?: TicketConversationSectionTicketType;
};

export type TicketConversationSelectedSection = Pick<
  TicketConversationSectionOption,
  | "sectionId"
  | "sectionName"
  | "hasNumberedSeats"
  | "availableSeatsCount"
  | "selectedTicketType"
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

export type TicketAdminRole = "root" | "admin" | "operator";

export type TicketConversationAdmin = {
  adminUserId?: string;
  role?: TicketAdminRole;
  sessionId?: string;
  expiresAt?: string;
};

export type TicketConversationAdminEvents = {
  page?: number;
  hasMore?: boolean;
  lastEvents?: Array<{
    option: number;
    eventId: string;
    title: string;
  }>;
  selectedEventId?: string;
  selectedSessionId?: string;
  selectedSectionId?: string;
  selectedPriceId?: string;
  statusFilter?: "active" | "paused" | "cancelled" | "all";
  listTitle?: string;
  listActionLabel?: string;
  mode?: string;
  field?: string;
  draft?: Record<string, unknown>;
};

export type TicketConversationAdminCourtesies = {
  mode?: "single" | "batch" | "list" | "resend" | "cancel" | "limit";
  phones?: string[];
  selectedEventId?: string;
  cancelMethod?: "phone" | "code" | "list";
  lastCourtesies?: Array<{
    option: number;
    courtesyId: string;
    phone: string;
    ticketCode?: string | null;
  }>;
  lastEvents?: Array<{
    option: number;
    eventId: string;
    title: string;
  }>;
};

export type TicketConversationAdminUsers = {
  mode?: "add" | "role" | "disable";
  pendingRole?: TicketAdminRole;
  pendingPhone?: string;
  pendingName?: string;
  selectedAdminUserId?: string;
  lastUsers?: Array<{
    option: number;
    adminUserId: string;
    phone: string;
    name?: string | null;
  }>;
};

export type TicketConversationAdminGate = {
  mode?: "self_checkin" | "register" | "list" | "revoke";
  pendingValidatorPhone?: string;
  selectedEventId?: string;
  lastEvents?: Array<{
    option: number;
    eventId: string;
    title: string;
  }>;
  lastGateSessions?: Array<{
    option: number;
    gateSessionId: string;
    validatorPhone: string;
  }>;
  lastGateAccesses?: Array<{
    option: number;
    gateAccessId: string;
    validatorPhone: string;
    eventId?: string;
    eventTitle?: string | null;
  }>;
  pendingRevokeAccess?: {
    gateAccessId: string;
    validatorPhone: string;
    eventId?: string;
    eventTitle?: string | null;
  };
};

export type TicketConversationGateAccess = {
  selectedAccessId?: string;
  lastAccesses?: Array<{
    option: number;
    gateAccessId: string;
    eventTitle?: string | null;
  }>;
};

export type TicketConversationAdminReports = {
  reportType?:
    | "sales_event"
    | "sales_section"
    | "expired_reservations"
    | "gate_checkins"
    | "ticket_usage"
    | "summary";
  selectedEventId?: string;
  lastEvents?: Array<{
    option: number;
    eventId: string;
    title: string;
  }>;
};

export type TicketConversationState = {
  step: TicketConversationStep;
  state: TicketConversationStep;
  lastInboundText?: string;
  admin?: TicketConversationAdmin;
  adminEvents?: TicketConversationAdminEvents;
  adminCourtesies?: TicketConversationAdminCourtesies;
  adminUsers?: TicketConversationAdminUsers;
  adminGate?: TicketConversationAdminGate;
  adminReports?: TicketConversationAdminReports;
  gateAccess?: TicketConversationGateAccess;
  lastSearch?: TicketConversationSearch;
  lastEvents?: TicketConversationEventOption[];
  selectedEvent?: TicketConversationSelectedEvent;
  selectedSection?: TicketConversationSelectedSection;
  selectedSeat?: TicketConversationSelectedSeat;
  selectedQuantity?: number;
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
