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
}) {
  const supabase = getSupabaseAdmin();

  await supabase.from("ticket_validation_events").insert({
    gate_session_id: input.gateSessionId,
    result: "not_found",
    gate_label: input.gateLabel,
    validator_identifier: input.validatorIdentifier,
    metadata: {
      source: "gate_scan",
      reason: input.reason,
    },
  });
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
    });

    return {
      allowed: false,
      result: "not_found",
      message: "Ingresso não encontrado ou inválido.",
    };
  }

  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase.rpc("validate_ticket_entry", {
    p_ticket_id: ticketPayload.tid,
    p_ticket_code: ticketPayload.code,
    p_gate_session_id: gateSession.gateSession.id,
    p_gate_label: gateSession.gateSession.gateLabel,
    p_validator_identifier: gateSession.gateSession.validatorIdentifier,
    p_metadata: {
      source: "gate_scan",
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

