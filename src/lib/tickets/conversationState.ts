export type TicketConversationStep =
  | "idle"
  | "admin_auth_pending"
  | "admin_menu"
  | "admin_events_menu"
  | "admin_orders_menu"
  | "admin_courtesies_menu"
  | "admin_offers_menu"
  | "admin_offer_create_scope"
  | "admin_offer_create_event_select"
  | "admin_offer_create_weekday_select"
  | "admin_offer_create_name"
  | "admin_offer_create_description"
  | "admin_offer_create_image"
  | "admin_offer_create_price"
  | "admin_offer_create_timing"
  | "admin_offer_select_action"
  | "admin_offer_edit_select_field"
  | "admin_offer_edit_collect_value"
  | "admin_offer_delete_confirm"
  | "admin_courtesy_event_select"
  | "admin_courtesy_session_select"
  | "admin_courtesy_section_select"
  | "admin_courtesy_quantity_collecting"
  | "admin_courtesy_seat_collecting"
  | "admin_courtesy_beneficiary_phone_collecting"
  | "admin_courtesy_beneficiary_name_collecting"
  | "admin_courtesy_reason_collecting"
  | "admin_courtesy_confirm"
  | "admin_courtesy_list_event_select"
  | "admin_courtesy_resend_target_collecting"
  | "admin_courtesy_resend_select"
  | "admin_courtesy_resend_confirm"
  | "admin_courtesy_cancel_target_collecting"
  | "admin_courtesy_cancel_select"
  | "admin_courtesy_cancel_confirm"
  | "admin_gate_menu"
  | "admin_kitchen_menu"
  | "admin_gate_register_event_select"
  | "admin_gate_validator_collecting"
  | "admin_gate_password_collecting"
  | "admin_gate_access_event_select"
  | "admin_gate_accesses_filter"
  | "admin_gate_revoke_select"
  | "admin_gate_revoke_confirm"
  | "admin_fixed_gate_phone_collecting"
  | "admin_fixed_gate_passphrase_collecting"
  | "admin_fixed_gate_delete_select"
  | "admin_fixed_gate_delete_confirm"
  | "admin_users_menu"
  | "admin_user_create_collect_phone"
  | "admin_user_create_collect_name"
  | "admin_user_create_select_role"
  | "admin_user_create_collect_passphrase"
  | "admin_user_create_confirm"
  | "admin_user_reactivate_confirm"
  | "admin_user_role_select_user"
  | "admin_user_role_select_role"
  | "admin_user_role_confirm"
  | "admin_user_disable_select"
  | "admin_user_disable_confirm"
  | "admin_user_unlock_select"
  | "admin_user_unlock_confirm"
  | "admin_user_passphrase_select"
  | "admin_user_passphrase_collect"
  | "admin_user_passphrase_confirm"
  | "admin_reports_menu"
  | "admin_report_event_count_select"
  | "admin_report_event_select"
  | "admin_report_period_select"
  | "admin_report_custom_period_collecting"
  | "admin_report_division_settlement_confirm"
  | "admin_order_phone_collecting"
  | "admin_order_code_collecting"
  | "admin_order_cancel_collecting"
  | "admin_order_cancel_confirm"
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
  | "reviewing_cart"
  | "reservation_created"
  | "help_topic_collecting"
  | "help_results"
  | "ticket_resend_selecting"
  | "gate_access_selecting"
  | "gate_access_passphrase_collecting"
  | "fixed_gate_passphrase_collecting"
  | "fixed_gate_event_selecting"
  | "payment_pending";

export type TicketConversationSearch = {
  artist?: string;
  city?: string;
  dateFrom?: string;
  dateTo?: string;
  timeMinutes?: number;
  originalText?: string;
};

export type TicketConversationEventOption = {
  option: number;
  eventId: string;
  sessionId: string;
  title: string;
  artistName?: string;
  description?: string | null;
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
  hasUnlimitedCapacity: boolean;
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
  | "hasUnlimitedCapacity"
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

export type TicketConversationCartItem = {
  sectionId: string;
  sectionName: string;
  hasNumberedSeats: boolean;
  ticketPriceId: string;
  ticketType: string;
  ticketLabel: string;
  priceCents: number;
  feeCents: number;
  currency: string;
  quantity: number;
  seats?: TicketConversationSelectedSeat[];
};

export type TicketConversationCart = {
  eventId: string;
  sessionId: string;
  items: TicketConversationCartItem[];
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
  authChallengeId?: string;
  authChallengeExpiresAt?: string;
  authChallengePurpose?: "admin_menu" | "event_editor";
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
  mode?: "generate" | "list" | "resend" | "cancel";
  selectedEventId?: string;
  selectedEventTitle?: string | null;
  selectedSessionId?: string;
  selectedSessionLabel?: string | null;
  selectedSectionId?: string;
  selectedSectionName?: string | null;
  hasNumberedSeats?: boolean;
  quantity?: number;
  seatCodes?: string[];
  beneficiaryPhone?: string;
  beneficiaryName?: string | null;
  reason?: string | null;
  pendingCourtesyId?: string;
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
  lastSessions?: Array<{
    option: number;
    sessionId: string;
    startsAt: string;
    status: string;
  }>;
  lastSections?: Array<{
    option: number;
    sectionId: string;
    sectionName: string;
    hasNumberedSeats: boolean;
    availableSeatsCount: number;
  }>;
};

export type TicketConversationAdminUsers = {
  mode?: "add" | "role" | "disable" | "reactivate" | "unlock" | "passphrase";
  pendingRole?: TicketAdminRole;
  pendingPhone?: string;
  pendingName?: string | null;
  pendingPassphraseHash?: string;
  pendingExistingAdminUserId?: string;
  selectedAdminUserId?: string;
  selectedAdminName?: string | null;
  selectedAdminPhone?: string;
  selectedAdminRole?: TicketAdminRole;
  selectedAdminStatus?: "active" | "disabled";
  lastUsers?: Array<{
    option: number;
    adminUserId: string;
    phone: string;
    name?: string | null;
    role?: TicketAdminRole;
    status?: "active" | "disabled";
  }>;
  lastBlockedAuths?: Array<{
    option: number;
    phone: string;
    name?: string | null;
  }>;
};

export type TicketConversationAdminGate = {
  mode?:
    | "self_checkin"
    | "register"
    | "list"
    | "revoke"
    | "kitchen_self_checkin"
    | "kitchen_register"
    | "kitchen_list"
    | "kitchen_revoke"
    | "fixed_register"
    | "fixed_delete";
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
  lastFixedGateAccesses?: Array<{
    option: number;
    fixedGateAccessId: string;
    validatorPhone: string;
    createdAt: string;
  }>;
  pendingFixedGateAccessId?: string;
  pendingFixedGatePhone?: string;
};

export type TicketConversationGateAccess = {
  mode?: "gate" | "kitchen";
  selectedAccessId?: string;
  lastAccesses?: Array<{
    option: number;
    gateAccessId: string;
    eventTitle?: string | null;
  }>;
  fixedAccessId?: string;
  fixedOwnerAdminUserId?: string;
  fixedEvents?: Array<{
    option: number;
    eventId: string;
    title: string;
  }>;
};

export type TicketConversationPublicHelp = {
  query?: string;
  hasMore?: boolean;
  page?: number;
  returnStep?: TicketConversationStep;
  returnState?: TicketConversationStep;
  lastResults?: Array<{
    option: number;
    id: string;
    question: string;
  }>;
};

export type TicketConversationTicketResend = {
  lastOptions?: Array<{
    option: number;
    eventId: string;
    sessionId: string;
    orderIds: string[];
  }>;
};

export type TicketConversationAdminReports = {
  reportType?:
    | "summary"
    | "sales_event"
    | "sales_section"
    | "pending_payments"
    | "expired_cancelled_reservations"
    | "gate_checkins"
    | "ticket_usage"
    | "courtesies"
    | "division";
  selectedEventIds?: string[];
  selectedEventId?: string;
  requestedEventCount?: 1 | 2 | 3;
  pendingDivisionSettlement?: {
    periodKey: string;
    periodLabel: string;
    periodFrom?: string;
    periodTo?: string;
    totalReceivedCents: number;
    amountDueCents: number;
    orderCount: number;
    weekCount: number;
  };
  lastEvents?: Array<{
    option: number;
    eventId: string;
    title: string;
    artistName?: string;
    city?: string;
    state?: string;
    status?: string;
    sessionStartsAt?: string | null;
  }>;
};

export type TicketConversationAdminOrders = {
  lastReservations?: Array<{
    option: number;
    reservationId: string;
    orderId: string;
    customerId: string;
  }>;
  pendingCancel?: {
    reservationId: string;
    orderId: string;
    customerId: string;
  };
};

export type TicketConversationAdminOffers = {
  mode?: "add" | "edit" | "pause" | "delete" | "duplicate";
  draft?: {
    scopeType?: "all_events" | "event" | "weekday";
    eventIds?: string[];
    weekdays?: number[];
    name?: string;
    description?: string;
    imageUrl?: string | null;
    priceCents?: number;
  };
  lastEvents?: Array<{
    option: number;
    eventId: string;
    title: string;
  }>;
  lastOffers?: Array<{
    option: number;
    offerId: string;
    name: string;
  }>;
  pendingOfferId?: string;
  pendingOfferName?: string;
  editField?: "name" | "description" | "image" | "price" | "timing";
};

export type TicketConversationState = {
  step: TicketConversationStep;
  state: TicketConversationStep;
  lastInboundText?: string;
  admin?: TicketConversationAdmin;
  adminEvents?: TicketConversationAdminEvents;
  adminCourtesies?: TicketConversationAdminCourtesies;
  adminOffers?: TicketConversationAdminOffers;
  adminUsers?: TicketConversationAdminUsers;
  adminGate?: TicketConversationAdminGate;
  adminOrders?: TicketConversationAdminOrders;
  adminReports?: TicketConversationAdminReports;
  adminNavigation?: {
    frames: Array<{
      context: Record<string, unknown>;
      reply: string;
      stackable?: boolean;
    }>;
    current: {
      context: Record<string, unknown>;
      reply: string;
      stackable?: boolean;
    };
  };
  gateAccess?: TicketConversationGateAccess;
  lastSearch?: TicketConversationSearch;
  lastEvents?: TicketConversationEventOption[];
  selectedEvent?: TicketConversationSelectedEvent;
  selectedSection?: TicketConversationSelectedSection;
  selectedSeat?: TicketConversationSelectedSeat;
  selectedQuantity?: number;
  cart?: TicketConversationCart;
  eventMoreInfoShown?: boolean;
  publicHelp?: TicketConversationPublicHelp;
  ticketResend?: TicketConversationTicketResend;
  reservation?: TicketConversationReservation;
  payment?: TicketConversationPayment;
  lastSections?: TicketConversationSectionOption[];
  lastSeats?: TicketConversationSeatOption[];
  deliveryGuard?: {
    generationId: string;
    startedAt: string;
  };
  numericPrompt?: {
    generationId: string;
    issuedAt: string;
    validOptions: number[];
    messageIds: string[];
  };
  retiredNumericMessageIds?: string[];
  updatedAt: string;
};

export const DEFAULT_CONVERSATION_INACTIVITY_TTL_MINUTES = 60;

export type ConversationContextResetReason =
  | "inactivity"
  | "admin_auth_expired";

function timestampHasExpired(value: unknown, now: Date) {
  if (typeof value !== "string") return false;
  const timestamp = new Date(value).getTime();
  return Number.isFinite(timestamp) && timestamp <= now.getTime();
}

export function resolveConversationContextForInbound({
  context,
  lastMessageAt,
  now = new Date(),
  inactivityTtlMinutes = DEFAULT_CONVERSATION_INACTIVITY_TTL_MINUTES,
}: {
  context: Record<string, unknown>;
  lastMessageAt?: string | null;
  now?: Date;
  inactivityTtlMinutes?: number;
}): {
  context: Record<string, unknown>;
  resetReason: ConversationContextResetReason | null;
} {
  const state = context as Partial<TicketConversationState>;

  if (
    state.state === "admin_auth_pending" &&
    timestampHasExpired(state.admin?.authChallengeExpiresAt, now)
  ) {
    return {
      context: buildInitialConversationState(now),
      resetReason: "admin_auth_expired",
    };
  }

  const ttl = Number.isFinite(inactivityTtlMinutes) && inactivityTtlMinutes > 0
    ? inactivityTtlMinutes
    : DEFAULT_CONVERSATION_INACTIVITY_TTL_MINUTES;
  const activityTimestamp = lastMessageAt ?? state.updatedAt;
  const activityTime =
    typeof activityTimestamp === "string"
      ? new Date(activityTimestamp).getTime()
      : Number.NaN;
  const inactiveForMs = now.getTime() - activityTime;

  if (
    Number.isFinite(activityTime) &&
    inactiveForMs >= ttl * 60_000
  ) {
    return {
      context: buildInitialConversationState(now),
      resetReason: "inactivity",
    };
  }

  return { context, resetReason: null };
}

export function buildInitialConversationState(
  now = new Date(),
): TicketConversationState {
  return {
    step: "idle",
    state: "idle",
    updatedAt: now.toISOString(),
  };
}
