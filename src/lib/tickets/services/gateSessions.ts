import "server-only";

import { randomUUID } from "crypto";
import { getEnv } from "@/lib/env";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import {
  createGateSessionToken,
  hashGateSessionToken,
  verifyGateSessionToken,
} from "@/lib/tickets/services/gateTokens";

export type GateSession = {
  id: string;
  event_id: string | null;
  session_id: string | null;
  gate_label: string | null;
  validator_phone: string;
  validator_name: string | null;
  token_hash: string;
  status: "active" | "revoked" | "expired";
  expires_at: string;
  created_by_admin_phone: string;
  created_at: string;
  updated_at: string;
};

export type CreateGateSessionResult =
  | {
      ok: true;
      gateSession: GateSession;
      gateUrl: string;
      token: string;
    }
  | {
      ok: false;
      reason: "invalid_validator_phone" | "invalid_admin_phone" | "insert_failed";
      error?: unknown;
    };

export type ValidateGateSessionResult =
  | {
      valid: true;
      gateSession: {
        id: string;
        gateLabel: string | null;
        validatorPhoneLast4: string;
        expiresAt: string;
        status: "active";
        validatorIdentifier: string;
      };
    }
  | {
      valid: false;
      reason:
        | "malformed"
        | "invalid_signature"
        | "expired"
        | "not_found"
        | "revoked"
        | "inactive";
    };

export function normalizeGatePhone(phone: string | null | undefined) {
  const digits = phone?.replace(/\D/g, "") ?? "";

  return digits.length > 0 ? digits : null;
}

function buildGateUrl(token: string) {
  const env = getEnv();
  const baseUrl = env.APP_BASE_URL.replace(/\/+$/, "");

  return `${baseUrl}/gate/session/${encodeURIComponent(token)}`;
}

export async function createGateSession(input: {
  validatorPhone: string;
  validatorName?: string | null;
  createdByAdminPhone: string;
  gateLabel?: string | null;
  eventId?: string | null;
  sessionId?: string | null;
  ttlMinutes?: number;
}): Promise<CreateGateSessionResult> {
  const env = getEnv();
  const validatorPhone = normalizeGatePhone(input.validatorPhone);
  const createdByAdminPhone = normalizeGatePhone(input.createdByAdminPhone);

  if (!validatorPhone) {
    return { ok: false, reason: "invalid_validator_phone" };
  }

  if (!createdByAdminPhone) {
    return { ok: false, reason: "invalid_admin_phone" };
  }

  const gateSessionId = randomUUID();
  const ttlMinutes = input.ttlMinutes ?? env.GATE_SESSION_TTL_MINUTES;
  const expiresAt = new Date(Date.now() + ttlMinutes * 60_000).toISOString();
  const token = createGateSessionToken({
    gateSessionId,
    validatorPhone,
    expiresAt,
  });
  const tokenHash = hashGateSessionToken(token);
  const supabase = getSupabaseAdmin();

  const { data, error } = await supabase
    .from("gate_sessions")
    .insert({
      id: gateSessionId,
      event_id: input.eventId ?? null,
      session_id: input.sessionId ?? null,
      gate_label: input.gateLabel?.trim() || null,
      validator_phone: validatorPhone,
      validator_name: input.validatorName?.trim() || null,
      token_hash: tokenHash,
      status: "active",
      expires_at: expiresAt,
      created_by_admin_phone: createdByAdminPhone,
    })
    .select(
      "id, event_id, session_id, gate_label, validator_phone, validator_name, token_hash, status, expires_at, created_by_admin_phone, created_at, updated_at",
    )
    .single<GateSession>();

  if (error) {
    return {
      ok: false,
      reason: "insert_failed",
      error,
    };
  }

  return {
    ok: true,
    gateSession: data,
    gateUrl: buildGateUrl(token),
    token,
  };
}

export async function validateGateSessionToken(
  token: string,
): Promise<ValidateGateSessionResult> {
  const verified = verifyGateSessionToken(token);

  if (!verified.valid) {
    return verified;
  }

  const tokenHash = hashGateSessionToken(token);
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("gate_sessions")
    .select("id, gate_label, validator_phone, status, expires_at, token_hash")
    .eq("id", verified.gateSessionId)
    .eq("token_hash", tokenHash)
    .maybeSingle<
      Pick<
        GateSession,
        "id" | "gate_label" | "validator_phone" | "status" | "expires_at" | "token_hash"
      >
    >();

  if (error || !data) {
    return {
      valid: false,
      reason: "not_found",
    };
  }

  if (data.status === "revoked") {
    return {
      valid: false,
      reason: "revoked",
    };
  }

  if (data.status !== "active") {
    return {
      valid: false,
      reason: "inactive",
    };
  }

  if (new Date(data.expires_at).getTime() <= Date.now()) {
    return {
      valid: false,
      reason: "expired",
    };
  }

  return {
    valid: true,
    gateSession: {
      id: data.id,
      gateLabel: data.gate_label,
      validatorPhoneLast4: data.validator_phone.slice(-4),
      expiresAt: data.expires_at,
      status: "active",
      validatorIdentifier: `whatsapp_last4:${data.validator_phone.slice(-4)}`,
    },
  };
}

export async function revokeGateSession(gateSessionId: string) {
  const supabase = getSupabaseAdmin();
  const { error } = await supabase
    .from("gate_sessions")
    .update({
      status: "revoked",
    })
    .eq("id", gateSessionId)
    .eq("status", "active");

  if (error) {
    return {
      ok: false as const,
      error,
    };
  }

  return {
    ok: true as const,
  };
}
