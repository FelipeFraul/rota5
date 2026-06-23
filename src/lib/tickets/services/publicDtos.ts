import "server-only";

import { getSupabaseAdmin } from "@/lib/supabase/admin";
import type { GateScanResult } from "@/lib/tickets/services/gateValidation";
import type { ValidateGateSessionResult } from "@/lib/tickets/services/gateSessions";

type GateValidationSummary = {
  allowedCount: number;
  deniedCount: number;
  lastResult: string | null;
};

type GateValidationEventRow = {
  result: string;
  ticket_code: string | null;
  created_at: string;
  metadata: Record<string, unknown> | null;
};

export type PublicGateSessionValidation =
  | {
      valid: true;
      gateSession: {
        gateLabel: string | null;
        eventTitle: string | null;
        sessionStartsAt: string | null;
      };
      summary: GateValidationSummary;
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
  summary: GateValidationSummary = {
    allowedCount: 0,
    deniedCount: 0,
    lastResult: null,
  },
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
    summary,
  };
}

function formatGateValidationEvent(row: GateValidationEventRow) {
  const label =
    row.result === "allowed"
      ? "Entrada liberada"
      : row.result === "already_used"
        ? "Ingresso já usado"
        : row.result === "cancelled"
          ? "Ingresso cancelado"
          : row.result === "wrong_event"
            ? "Ingresso de outro evento"
            : row.result === "wrong_session"
              ? "Ingresso de outra sessão"
              : row.result === "not_found"
                ? "Ingresso não encontrado ou inválido"
                : "Entrada recusada";

  return [
    label,
    row.ticket_code ? `Código: ${row.ticket_code}` : null,
    `Registrado em: ${new Intl.DateTimeFormat("pt-BR", {
      timeZone: "America/Sao_Paulo",
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    })
      .format(new Date(row.created_at))
      .replace(",", " às")}`,
  ]
    .filter(Boolean)
    .join("\n");
}

export async function buildPublicGateSessionDtoWithSummary(
  result: ValidateGateSessionResult,
): Promise<PublicGateSessionValidation> {
  if (!result.valid) {
    return buildPublicGateSessionDto(result);
  }

  const supabase = getSupabaseAdmin();
  const [{ count: allowedCount }, { count: deniedCount }, { data: lastEvents }] =
    await Promise.all([
      supabase
        .from("ticket_validation_events")
        .select("id", { count: "exact", head: true })
        .eq("gate_session_id", result.gateSession.id)
        .eq("result", "allowed"),
      supabase
        .from("ticket_validation_events")
        .select("id", { count: "exact", head: true })
        .eq("gate_session_id", result.gateSession.id)
        .neq("result", "allowed"),
      supabase
        .from("ticket_validation_events")
        .select("result, ticket_code, created_at, metadata")
        .eq("gate_session_id", result.gateSession.id)
        .order("created_at", { ascending: false })
        .limit(1)
        .returns<GateValidationEventRow[]>(),
    ]);

  const lastEvent = lastEvents?.[0] ?? null;

  return buildPublicGateSessionDto(result, {
    allowedCount: allowedCount ?? 0,
    deniedCount: deniedCount ?? 0,
    lastResult: lastEvent ? formatGateValidationEvent(lastEvent) : null,
  });
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
