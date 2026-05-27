import "server-only";

import type { GateScanResult } from "@/lib/tickets/services/gateValidation";
import type { ValidateGateSessionResult } from "@/lib/tickets/services/gateSessions";

export type PublicGateSessionValidation =
  | {
      valid: true;
      gateSession: {
        gateLabel: string | null;
        eventTitle: string | null;
        sessionStartsAt: string | null;
        validatorPhoneLast4: string;
        expiresAt: string;
        status: "active";
      };
    }
  | {
      valid: false;
      reason: Extract<ValidateGateSessionResult, { valid: false }>["reason"];
    };

export type PublicAdminLoginChallenge =
  | {
      ok: true;
      expiresAt: string;
    }
  | {
      ok: false;
    };

export type PublicGateScanResponse = {
  allowed: boolean;
  result: GateScanResult["result"];
  message: string;
  ticket?: {
    ticketCode?: string;
    sectionName?: string | null;
    seatCode?: string | null;
  };
};

export function buildPublicGateSessionDto(
  result: ValidateGateSessionResult,
): PublicGateSessionValidation {
  if (!result.valid) {
    return {
      valid: false,
      reason: result.reason,
    };
  }

  return {
    valid: true,
    gateSession: {
      gateLabel: result.gateSession.gateLabel,
      eventTitle: result.gateSession.eventTitle,
      sessionStartsAt: result.gateSession.sessionStartsAt,
      validatorPhoneLast4: result.gateSession.validatorPhoneLast4,
      expiresAt: result.gateSession.expiresAt,
      status: "active",
    },
  };
}

export function buildPublicAdminLoginChallengeDto(
  result:
    | { ok: true; challenge: { expires_at: string } }
    | { ok: false },
): PublicAdminLoginChallenge {
  if (!result.ok) {
    return { ok: false };
  }

  return {
    ok: true,
    expiresAt: result.challenge.expires_at,
  };
}

export function buildPublicGateScanResponseDto(
  result: GateScanResult,
): PublicGateScanResponse {
  return {
    allowed: result.allowed,
    result: result.result,
    message: result.message,
    ...(result.ticket
      ? {
          ticket: {
            ...(result.ticket.ticketCode
              ? { ticketCode: result.ticket.ticketCode }
              : {}),
            ...(result.ticket.sectionName
              ? { sectionName: result.ticket.sectionName }
              : {}),
            ...(result.ticket.seatCode ? { seatCode: result.ticket.seatCode } : {}),
          },
        }
      : {}),
  };
}
