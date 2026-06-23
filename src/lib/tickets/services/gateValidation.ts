import "server-only";

import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { validateGateSessionToken } from "@/lib/tickets/services/gateSessions";
import { verifySignedTicketToken } from "@/lib/tickets/services/tickets";

export type GateScanResult = {
  allowed: boolean;
  result:
    | "allowed"
    | "already_used"
    | "cancelled"
    | "denied"
    | "not_found"
    | "wrong_event"
    | "wrong_session"
    | "gate_session_invalid";
  message: string;
  ticket?: {
    ticketId?: string;
    ticketCode?: string;
    status?: string;
    usedAt?: string | null;
    eventTitle?: string | null;
    startsAt?: string | null;
    sectionName?: string | null;
    seatCode?: string | null;
  };
};

type GateTicketCodeRow = {
  id: string;
  ticket_code: string;
};

function extractTicketToken(rawValue: string) {
  const value = rawValue.trim();

  try {
    const parsedUrl = new URL(value);
    const match = parsedUrl.pathname.match(/\/tickets\/([^/]+)\/?$/);

    if (match?.[1]) {
      return decodeURIComponent(match[1]);
    }
  } catch {
    // Not a URL; treat the raw value as the token.
  }

  return value;
}

async function recordInvalidTicketAttempt(input: {
  gateSessionId: string;
  gateLabel: string | null;
  validatorIdentifier: string;
  reason: string;
  source: "gate_scan" | "gate_manual_code";
}) {
  const supabase = getSupabaseAdmin();

  await supabase.from("ticket_validation_events").insert({
    gate_session_id: input.gateSessionId,
    result: "not_found",
    gate_label: input.gateLabel,
    validator_identifier: input.validatorIdentifier,
    metadata: {
      source: input.source,
      reason: input.reason,
    },
  });
}

async function validateTicketEntry(input: {
  gateSessionToken: string;
  ticketId: string;
  ticketCode: string;
  source: "gate_scan" | "gate_manual_code";
}): Promise<GateScanResult> {
  const gateSession = await validateGateSessionToken(input.gateSessionToken);

  if (!gateSession.valid) {
    return {
      allowed: false,
      result: "gate_session_invalid",
      message: "Sessão de portaria inválida ou expirada.",
    };
  }

  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase.rpc("validate_ticket_entry", {
    p_ticket_id: input.ticketId,
    p_ticket_code: input.ticketCode,
    p_gate_session_id: gateSession.gateSession.id,
    p_gate_label: gateSession.gateSession.gateLabel,
    p_validator_identifier: gateSession.gateSession.validatorIdentifier,
    p_metadata: {
      source: input.source,
    },
  });

  if (error || !data || typeof data !== "object") {
    return {
      allowed: false,
      result: "denied",
      message: "Não foi possível validar este ingresso agora.",
    };
  }

  const result = data as GateScanResult;

  return {
    allowed: Boolean(result.allowed),
    result: result.result,
    message: result.message,
    ...(result.ticket ? { ticket: result.ticket } : {}),
  };
}

async function loadTicketByCodeForGateSession(input: {
  ticketCode: string;
  eventId: string | null;
  sessionId: string | null;
}) {
  const { eventId, sessionId } = input;

  if (!eventId && !sessionId) {
    return null;
  }

  const supabase = getSupabaseAdmin();
  let query = supabase
    .from("tickets")
    .select("id, ticket_code, session_id, event_sessions!inner(event_id)")
    .eq("ticket_code", input.ticketCode.trim().toUpperCase());

  query = sessionId
    ? query.eq("session_id", sessionId)
    : query.eq("event_sessions.event_id", eventId as string);

  const { data, error } = await query.maybeSingle<GateTicketCodeRow>();
  if (error) throw error;

  return data;
}

export async function validateGateScan(input: {
  gateSessionToken: string;
  ticketToken: string;
}): Promise<GateScanResult> {
  const gateSession = await validateGateSessionToken(input.gateSessionToken);

  if (!gateSession.valid) {
    return {
      allowed: false,
      result: "gate_session_invalid",
      message: "Sessão de portaria inválida ou expirada.",
    };
  }

  const ticketToken = extractTicketToken(input.ticketToken);
  const ticketPayload = verifySignedTicketToken(ticketToken);

  if (!ticketPayload) {
    await recordInvalidTicketAttempt({
      gateSessionId: gateSession.gateSession.id,
      gateLabel: gateSession.gateSession.gateLabel,
      validatorIdentifier: gateSession.gateSession.validatorIdentifier,
      reason: "invalid_ticket_token",
      source: "gate_scan",
    });

    return {
      allowed: false,
      result: "not_found",
      message: "Ingresso não encontrado ou inválido.",
    };
  }

  return validateTicketEntry({
    gateSessionToken: input.gateSessionToken,
    ticketId: ticketPayload.tid,
    ticketCode: ticketPayload.code,
    source: "gate_scan",
  });
}

export async function validateGateTicketCode(input: {
  gateSessionToken: string;
  ticketCode: string;
}): Promise<GateScanResult> {
  const gateSession = await validateGateSessionToken(input.gateSessionToken);

  if (!gateSession.valid) {
    return {
      allowed: false,
      result: "gate_session_invalid",
      message: "Sessão de portaria inválida ou expirada.",
    };
  }

  const ticket = await loadTicketByCodeForGateSession({
    ticketCode: input.ticketCode,
    eventId: gateSession.gateSession.eventId,
    sessionId: gateSession.gateSession.sessionId,
  });

  if (!ticket) {
    await recordInvalidTicketAttempt({
      gateSessionId: gateSession.gateSession.id,
      gateLabel: gateSession.gateSession.gateLabel,
      validatorIdentifier: gateSession.gateSession.validatorIdentifier,
      reason: "ticket_code_not_found",
      source: "gate_manual_code",
    });

    return {
      allowed: false,
      result: "not_found",
      message: "Ingresso não encontrado ou inválido.",
    };
  }

  return validateTicketEntry({
    gateSessionToken: input.gateSessionToken,
    ticketId: ticket.id,
    ticketCode: ticket.ticket_code,
    source: "gate_manual_code",
  });
}
