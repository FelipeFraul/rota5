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

export type AdminGateSessionListItem = {
  id: string;
  gateLabel: string | null;
  validatorPhone: string;
  validatorName: string | null;
  status: "active" | "revoked" | "expired";
  expiresAt: string;
  createdByAdminPhone: string;
  createdAt: string;
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
      reason:
        | "invalid_validator_phone"
        | "invalid_admin_phone"
        | "already_registered"
        | "insert_failed";
      error?: unknown;
    };

export type ValidateGateSessionResult =
  | {
      valid: true;
      gateSession: {
        id: string;
        gateLabel: string | null;
        eventTitle: string | null;
        sessionStartsAt: string | null;
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

function getGatePhoneLookupVariants(phone: string) {
  const variants = new Set([phone]);

  if (phone.startsWith("55") && (phone.length === 12 || phone.length === 13)) {
    variants.add(phone.slice(2));
  }

  if (!phone.startsWith("55") && (phone.length === 10 || phone.length === 11)) {
    variants.add(`55${phone}`);
  }

  return [...variants];
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
  replaceActiveSessions?: boolean;
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
  const phoneVariants = getGatePhoneLookupVariants(validatorPhone);

  if (input.replaceActiveSessions) {
    const { error: revokeError } = await supabase
      .from("gate_sessions")
      .update({ status: "revoked" })
      .in("validator_phone", phoneVariants)
      .eq("status", "active")
      .gt("expires_at", new Date().toISOString());

    if (revokeError) {
      return { ok: false, reason: "insert_failed", error: revokeError };
    }
  }

  const { count, error: duplicateError } = await supabase
    .from("gate_sessions")
    .select("id", { count: "exact", head: true })
    .in("validator_phone", phoneVariants)
    .eq("status", "active")
    .gt("expires_at", new Date().toISOString());

  if (duplicateError) {
    return { ok: false, reason: "insert_failed", error: duplicateError };
  }

  if ((count ?? 0) > 0) {
    return { ok: false, reason: "already_registered" };
  }

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
    .select(
      "id, gate_label, validator_phone, status, expires_at, token_hash, events(title), event_sessions(starts_at)",
    )
    .eq("id", verified.gateSessionId)
    .eq("token_hash", tokenHash)
    .maybeSingle<
      Pick<
        GateSession,
        "id" | "gate_label" | "validator_phone" | "status" | "expires_at" | "token_hash"
      > & {
        events: { title: string } | { title: string }[] | null;
        event_sessions: { starts_at: string } | { starts_at: string }[] | null;
      }
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
      eventTitle: Array.isArray(data.events)
        ? data.events[0]?.title ?? null
        : data.events?.title ?? null,
      sessionStartsAt: Array.isArray(data.event_sessions)
        ? data.event_sessions[0]?.starts_at ?? null
        : data.event_sessions?.starts_at ?? null,
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

export async function listGateSessions(input?: {
  filter?: "active" | "paused" | "all";
  eventId?: string;
}) {
  const supabase = getSupabaseAdmin();
  let query = supabase
    .from("gate_sessions")
    .select(
      "id, gate_label, validator_phone, validator_name, status, expires_at, created_by_admin_phone, created_at",
    )
    .order("created_at", { ascending: false })
    .limit(50);

  if (input?.eventId) {
    query = query.eq("event_id", input.eventId);
  }

  const { data, error } = await query.returns<
    Array<{
      id: string;
      gate_label: string | null;
      validator_phone: string;
      validator_name: string | null;
      status: "active" | "revoked" | "expired";
      expires_at: string;
      created_by_admin_phone: string;
      created_at: string;
    }>
  >();

  if (error) return { ok: false as const, error };

  const now = Date.now();
  const sessions = (data ?? [])
    .filter((session) => {
      if (input?.filter === "active") {
        return session.status === "active" && new Date(session.expires_at).getTime() > now;
      }

      if (input?.filter === "paused") {
        return session.status !== "active" || new Date(session.expires_at).getTime() <= now;
      }

      return true;
    })
    .map(
      (session): AdminGateSessionListItem => ({
        id: session.id,
        gateLabel: session.gate_label,
        validatorPhone: session.validator_phone,
        validatorName: session.validator_name,
        status:
          session.status === "active" &&
          new Date(session.expires_at).getTime() <= now
            ? "expired"
            : session.status,
        expiresAt: session.expires_at,
        createdByAdminPhone: session.created_by_admin_phone,
        createdAt: session.created_at,
      }),
    );

  return { ok: true as const, sessions };
}

export async function createGateSessionForRegisteredValidator(validatorPhoneInput: string) {
  const env = getEnv();
  const validatorPhone = normalizeGatePhone(validatorPhoneInput);

  if (!validatorPhone) {
    return { ok: false as const, reason: "invalid_validator_phone" as const };
  }

  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("gate_sessions")
    .select(
      "id, event_id, session_id, gate_label, validator_phone, validator_name, token_hash, status, expires_at, created_by_admin_phone, created_at, updated_at",
    )
    .in("validator_phone", getGatePhoneLookupVariants(validatorPhone))
    .eq("status", "active")
    .gt("expires_at", new Date().toISOString())
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle<GateSession>();

  if (error) return { ok: false as const, reason: "lookup_failed" as const, error };

  if (!data) {
    return { ok: false as const, reason: "not_registered" as const };
  }

  const expiresAt = new Date(
    Date.now() + env.GATE_SESSION_TTL_MINUTES * 60_000,
  ).toISOString();
  const token = createGateSessionToken({
    gateSessionId: data.id,
    validatorPhone: data.validator_phone,
    expiresAt,
  });
  const tokenHash = hashGateSessionToken(token);

  const { data: updated, error: updateError } = await supabase
    .from("gate_sessions")
    .update({
      token_hash: tokenHash,
      expires_at: expiresAt,
      status: "active",
    })
    .eq("id", data.id)
    .select(
      "id, event_id, session_id, gate_label, validator_phone, validator_name, token_hash, status, expires_at, created_by_admin_phone, created_at, updated_at",
    )
    .single<GateSession>();

  if (updateError) {
    return { ok: false as const, reason: "update_failed" as const, error: updateError };
  }

  return {
    ok: true as const,
    gateSession: updated,
    gateUrl: buildGateUrl(token),
    token,
  };
}
