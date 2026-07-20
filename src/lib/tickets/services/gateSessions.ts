import "server-only";

import { randomUUID } from "crypto";
import { getEnv } from "@/lib/env";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import {
  buildWhatsAppPhoneCandidates,
  normalizeWhatsAppPhone,
} from "@/lib/tickets/phones";
import {
  createKitchenDeviceToken,
  createGateSessionToken,
  hashGateSessionToken,
  hashKitchenDeviceToken,
} from "@/lib/tickets/services/gateTokens";

export const KITCHEN_SESSION_TTL_MINUTES = 8 * 60;
export const KITCHEN_DEVICE_COOKIE = "kitchen_device";
export const KITCHEN_READER_DEVICE_COOKIE = "kitchen_reader_device";
export type KitchenDeviceRole = "board" | "reader";

export type GateSession = {
  id: string;
  event_id: string | null;
  session_id: string | null;
  gate_label: string | null;
  validator_phone: string;
  validator_name: string | null;
  token_hash: string;
  device_binding_hash?: string | null;
  reader_device_binding_hash?: string | null;
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
        eventId: string | null;
        sessionId: string | null;
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
        | "expired"
        | "not_found"
        | "revoked"
        | "inactive"
        | "device_mismatch";
    };

export function normalizeGatePhone(phone: string | null | undefined) {
  return normalizeWhatsAppPhone(phone);
}

function getGatePhoneLookupVariants(phone: string) {
  return buildWhatsAppPhoneCandidates(phone);
}

function isKitchenGateLabel(value: string | null | undefined) {
  return value?.trim().toLowerCase().normalize("NFD").replace(/\p{Diacritic}/gu, "") === "cozinha";
}

function buildGateUrl(token: string) {
  const env = getEnv();
  const baseUrl = env.APP_BASE_URL.replace(/\/+$/, "");

  return `${baseUrl}/gate/session/${encodeURIComponent(token)}`;
}

export function buildKitchenUrl(token: string) {
  const env = getEnv();
  const baseUrl = env.APP_BASE_URL.replace(/\/+$/, "");

  return `${baseUrl}/api/kitchen/session/open?token=${encodeURIComponent(token)}`;
}

export function buildOfferReaderUrl(token: string) {
  const env = getEnv();
  const baseUrl = env.APP_BASE_URL.replace(/\/+$/, "");

  return `${baseUrl}/api/kitchen/session/open?reader=1&token=${encodeURIComponent(token)}`;
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
  const token = createGateSessionToken();
  const tokenHash = hashGateSessionToken(token);
  const supabase = getSupabaseAdmin();
  const phoneVariants = getGatePhoneLookupVariants(validatorPhone);
  const creatingKitchenSession = isKitchenGateLabel(input.gateLabel);

  if (input.eventId) {
    const { data: event, error: eventError } = await supabase
      .from("events")
      .select("id, status")
      .eq("id", input.eventId)
      .maybeSingle<{ id: string; status: string }>();

    if (eventError) {
      return { ok: false, reason: "insert_failed", error: eventError };
    }

    if (!event || event.status !== "published") {
      return { ok: false, reason: "insert_failed" };
    }
  }

  if (input.sessionId) {
    const { data: session, error: sessionError } = await supabase
      .from("event_sessions")
      .select("id, event_id, status")
      .eq("id", input.sessionId)
      .maybeSingle<{ id: string; event_id: string; status: string }>();

    if (sessionError) {
      return { ok: false, reason: "insert_failed", error: sessionError };
    }

    if (
      !session ||
      (input.eventId && session.event_id !== input.eventId) ||
      ["cancelled", "finished"].includes(session.status)
    ) {
      return { ok: false, reason: "insert_failed" };
    }
  }

  if (input.replaceActiveSessions) {
    const { data: activeSessions, error: activeSessionsError } = await supabase
      .from("gate_sessions")
      .select("id, gate_label")
      .in("validator_phone", phoneVariants)
      .eq("status", "active")
      .gt("expires_at", new Date().toISOString())
      .returns<Array<{ id: string; gate_label: string | null }>>();

    if (activeSessionsError) {
      return { ok: false, reason: "insert_failed", error: activeSessionsError };
    }

    const replacedSessionIds = (activeSessions ?? [])
      .filter(
        (session) =>
          isKitchenGateLabel(session.gate_label) === creatingKitchenSession,
      )
      .map((session) => session.id);

    const { error: revokeError } = replacedSessionIds.length
      ? await supabase
      .from("gate_sessions")
      .update({ status: "revoked" })
      .in("id", replacedSessionIds)
      : { error: null };

    if (revokeError) {
      return { ok: false, reason: "insert_failed", error: revokeError };
    }
  }

  const { data: duplicateSessions, error: duplicateError } = await supabase
    .from("gate_sessions")
    .select("id, gate_label")
    .in("validator_phone", phoneVariants)
    .eq("status", "active")
    .gt("expires_at", new Date().toISOString())
    .returns<Array<{ id: string; gate_label: string | null }>>();

  if (duplicateError) {
    return { ok: false, reason: "insert_failed", error: duplicateError };
  }

  if (
    (duplicateSessions ?? []).some(
      (session) =>
        isKitchenGateLabel(session.gate_label) === creatingKitchenSession,
    )
  ) {
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
  expectedPurpose: "gate" | "kitchen" = "gate",
  kitchenDeviceToken?: string | null,
  kitchenDeviceRole: KitchenDeviceRole = "board",
): Promise<ValidateGateSessionResult> {
  const normalizedToken = token.trim();
  if (!normalizedToken) {
    return {
      valid: false,
      reason: "malformed",
    };
  }

  const tokenHash = hashGateSessionToken(normalizedToken);
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("gate_sessions")
    .select(
      "id, event_id, session_id, gate_label, validator_phone, status, expires_at, token_hash, device_binding_hash, reader_device_binding_hash, events(title, status), event_sessions(starts_at, status, event_id)",
    )
    .eq("token_hash", tokenHash)
    .maybeSingle<
      Pick<
        GateSession,
        "id" | "event_id" | "session_id" | "gate_label" | "validator_phone" | "status" | "expires_at" | "token_hash" | "device_binding_hash" | "reader_device_binding_hash"
      > & {
        events: { title: string; status: string } | { title: string; status: string }[] | null;
        event_sessions:
          | { starts_at: string; status: string; event_id: string }
          | { starts_at: string; status: string; event_id: string }[]
          | null;
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

  const linkedEvent = Array.isArray(data.events) ? data.events[0] ?? null : data.events;
  const linkedSession = Array.isArray(data.event_sessions)
    ? data.event_sessions[0] ?? null
    : data.event_sessions;

  if (linkedEvent && linkedEvent.status !== "published") {
    return {
      valid: false,
      reason: "inactive",
    };
  }

  if (
    linkedSession &&
    (["cancelled", "finished"].includes(linkedSession.status) ||
      (data.event_id && linkedSession.event_id !== data.event_id))
  ) {
    return {
      valid: false,
      reason: "inactive",
    };
  }

  const isKitchenSession = isKitchenGateLabel(data.gate_label);

  if (
    (expectedPurpose === "kitchen" && !isKitchenSession) ||
    (expectedPurpose === "gate" && isKitchenSession)
  ) {
    return {
      valid: false,
      reason: "inactive",
    };
  }

  if (
    expectedPurpose === "kitchen" &&
    (!kitchenDeviceToken ||
      !(kitchenDeviceRole === "reader"
        ? data.reader_device_binding_hash
        : data.device_binding_hash) ||
      hashKitchenDeviceToken(kitchenDeviceToken) !==
        (kitchenDeviceRole === "reader"
          ? data.reader_device_binding_hash
          : data.device_binding_hash))
  ) {
    return { valid: false, reason: "device_mismatch" };
  }

  return {
    valid: true,
    gateSession: {
      id: data.id,
      eventId: data.event_id,
      sessionId: data.session_id,
      gateLabel: data.gate_label,
      eventTitle: linkedEvent?.title ?? null,
      sessionStartsAt: linkedSession?.starts_at ?? null,
      validatorPhoneLast4: data.validator_phone.slice(-4),
      expiresAt: data.expires_at,
      status: "active",
      validatorIdentifier: `whatsapp_last4:${data.validator_phone.slice(-4)}`,
    },
  };
}

export async function claimKitchenSessionDevice(
  token: string,
  existingDeviceToken?: string | null,
  role: KitchenDeviceRole = "board",
) {
  const normalizedToken = token.trim();
  if (!normalizedToken) return { ok: false as const, reason: "invalid" as const };

  const supabase = getSupabaseAdmin();
  const tokenHash = hashGateSessionToken(normalizedToken);
  const { data: session } = await supabase
    .from("gate_sessions")
    .select("id, gate_label, status, expires_at, device_binding_hash, reader_device_binding_hash")
    .eq("token_hash", tokenHash)
    .maybeSingle<{
      id: string;
      gate_label: string | null;
      status: string;
      expires_at: string;
      device_binding_hash: string | null;
      reader_device_binding_hash: string | null;
    }>();

  if (
    !session ||
    !isKitchenGateLabel(session.gate_label) ||
    session.status !== "active" ||
    new Date(session.expires_at).getTime() <= Date.now()
  ) {
    return { ok: false as const, reason: "invalid" as const };
  }

  const bindingColumn =
    role === "reader" ? "reader_device_binding_hash" : "device_binding_hash";
  const bindingHash = session[bindingColumn];

  if (bindingHash) {
    if (
      existingDeviceToken &&
      hashKitchenDeviceToken(existingDeviceToken) === bindingHash
    ) {
      return { ok: true as const, deviceToken: existingDeviceToken };
    }

    // The physical device cannot be identified reliably when its cookie was
    // cleared, expired, or created under another Vercel hostname. Possession
    // of the still-valid secret session link is the recovery credential.
    const replacementDeviceToken = createKitchenDeviceToken();
    const replacementDeviceHash = hashKitchenDeviceToken(
      replacementDeviceToken,
    );
    const { data: rebound } = await supabase
      .from("gate_sessions")
      .update({ [bindingColumn]: replacementDeviceHash })
      .eq("id", session.id)
      .eq(bindingColumn, bindingHash)
      .select("id")
      .maybeSingle<{ id: string }>();

    if (!rebound) return { ok: false as const, reason: "claimed" as const };
    return { ok: true as const, deviceToken: replacementDeviceToken };
  }

  const deviceToken = createKitchenDeviceToken();
  const deviceHash = hashKitchenDeviceToken(deviceToken);
  const { data: claimed } = await supabase
    .from("gate_sessions")
    .update({ [bindingColumn]: deviceHash })
    .eq("id", session.id)
    .is(bindingColumn, null)
    .select("id")
    .maybeSingle<{ id: string }>();

  if (!claimed) return { ok: false as const, reason: "claimed" as const };
  return { ok: true as const, deviceToken };
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
  const token = createGateSessionToken();
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
