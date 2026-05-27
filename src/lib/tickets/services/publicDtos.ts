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
      };
    }
  | {
      valid: false;
      reason: Extract<ValidateGateSessionResult, { valid: false }>["reason"];
    };

export type PublicAdminLoginChallenge =
  | {
      ok: true;
    }
  | {
      ok: false;
    };

export type PublicGateScanResponse = {
  allowed: boolean;
  result: GateScanResult["result"];
  message: string;
  section?: string;
  seat?: string;
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
    },
  };
}

export function buildPublicAdminLoginChallengeDto(
  result: { ok: true } | { ok: false },
): PublicAdminLoginChallenge {
  if (!result.ok) {
    return { ok: false };
  }

  return { ok: true };
}

export function buildPublicGateScanResponseDto(
  result: GateScanResult,
): PublicGateScanResponse {
  return {
    allowed: result.allowed,
    result: result.result,
    message: result.message,
    ...(result.allowed && result.ticket
      ? {
          ...(result.ticket.sectionName ? { section: result.ticket.sectionName } : {}),
          ...(result.ticket.seatCode ? { seat: result.ticket.seatCode } : {}),
        }
      : {}),
  };
}
