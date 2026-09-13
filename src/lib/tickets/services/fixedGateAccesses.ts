import "server-only";

import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { buildWhatsAppPhoneCandidates } from "@/lib/tickets/phones";
import {
  hashGateAccessPassphrase,
  verifyGateAccessPassphrase,
} from "@/lib/tickets/services/gateAccessAuth";
import {
  createGateSession,
  normalizeGatePhone,
  type CreateGateSessionResult,
} from "@/lib/tickets/services/gateSessions";

export type FixedGateAccessListItem = {
  id: string;
  phone: string;
  ownerAdminUserId: string;
  createdAt: string;
};

type FixedGateAccessRow = {
  id: string;
  phone: string;
  passphrase_hash: string;
  status: "active" | "revoked";
  owner_admin_user_id: string;
  created_by_admin_phone: string | null;
  created_at: string;
  updated_at: string;
  revoked_at: string | null;
  revoked_by_admin_user_id: string | null;
};

const FIXED_GATE_ACCESS_COLUMNS = [
  "id",
  "phone",
  "passphrase_hash",
  "status",
  "owner_admin_user_id",
  "created_by_admin_phone",
  "created_at",
  "updated_at",
  "revoked_at",
  "revoked_by_admin_user_id",
].join(", ");

function toListItem(row: FixedGateAccessRow): FixedGateAccessListItem {
  return {
    id: row.id,
    phone: row.phone,
    ownerAdminUserId: row.owner_admin_user_id,
    createdAt: row.created_at,
  };
}

export async function createFixedGateAccess(input: {
  phone: string;
  passphrase: string;
  ownerAdminUserId: string;
  createdByAdminPhone?: string | null;
}) {
  const phone = normalizeGatePhone(input.phone);
  const passphrase = input.passphrase.trim();
  const createdByAdminPhone = normalizeGatePhone(input.createdByAdminPhone);

  if (!phone || phone.length < 10) {
    return { ok: false as const, reason: "invalid_phone" as const };
  }

  if (!passphrase) {
    return { ok: false as const, reason: "invalid_passphrase" as const };
  }

  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("fixed_gate_accesses")
    .insert({
      phone,
      passphrase_hash: hashGateAccessPassphrase(passphrase),
      status: "active",
      owner_admin_user_id: input.ownerAdminUserId,
      created_by_admin_phone: createdByAdminPhone,
    })
    .select(FIXED_GATE_ACCESS_COLUMNS)
    .single<FixedGateAccessRow>();

  if (error) {
    const code = typeof error === "object" && "code" in error ? error.code : null;
    return {
      ok: false as const,
      reason: code === "23505" ? ("already_registered" as const) : ("insert_failed" as const),
      error,
    };
  }

  return { ok: true as const, access: toListItem(data) };
}

export async function listFixedGateAccesses(ownerAdminUserId: string) {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("fixed_gate_accesses")
    .select(FIXED_GATE_ACCESS_COLUMNS)
    .eq("owner_admin_user_id", ownerAdminUserId)
    .eq("status", "active")
    .order("created_at", { ascending: false })
    .limit(50)
    .returns<FixedGateAccessRow[]>();

  if (error) return { ok: false as const, error };
  return { ok: true as const, accesses: (data ?? []).map(toListItem) };
}

export async function revokeFixedGateAccess(input: {
  accessId: string;
  ownerAdminUserId: string;
  revokedByAdminUserId: string;
}) {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase.rpc("revoke_fixed_gate_access_and_revoke_sessions", {
    p_access_id: input.accessId,
    p_owner_admin_user_id: input.ownerAdminUserId,
    p_revoked_by_admin_user_id: input.revokedByAdminUserId,
  });

  if (error) return { ok: false as const, error };
  return { ok: true as const, revoked: Boolean(data && (data as { revoked?: boolean }).revoked) };
}

export async function findActiveFixedGateAccessForPhone(phoneInput: string) {
  const phone = normalizeGatePhone(phoneInput);
  if (!phone) return { ok: false as const, reason: "invalid_phone" as const };

  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("fixed_gate_accesses")
    .select(FIXED_GATE_ACCESS_COLUMNS)
    .in("phone", buildWhatsAppPhoneCandidates(phone))
    .eq("status", "active")
    .maybeSingle<FixedGateAccessRow>();

  if (error) return { ok: false as const, reason: "lookup_failed" as const, error };
  if (!data) return { ok: true as const, access: null };
  return { ok: true as const, access: toListItem(data) };
}

export async function authenticateFixedGateAccess(input: {
  accessId: string;
  phone: string;
  passphrase: string;
}) {
  const phone = normalizeGatePhone(input.phone);
  if (!phone) return { ok: false as const, reason: "not_found" as const };

  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("fixed_gate_accesses")
    .select(FIXED_GATE_ACCESS_COLUMNS)
    .eq("id", input.accessId)
    .in("phone", buildWhatsAppPhoneCandidates(phone))
    .eq("status", "active")
    .maybeSingle<FixedGateAccessRow>();

  if (error || !data) {
    return { ok: false as const, reason: "not_found" as const, error };
  }

  if (!verifyGateAccessPassphrase(input.passphrase, data.passphrase_hash)) {
    return { ok: false as const, reason: "invalid_passphrase" as const };
  }

  return {
    ok: true as const,
    access: toListItem(data),
  };
}

export async function createGateSessionForFixedAccess(input: {
  accessId: string;
  validatorPhone: string;
  eventId: string;
}): Promise<
  | {
      ok: true;
      gateUrl: string;
      gateSession: Extract<CreateGateSessionResult, { ok: true }>["gateSession"];
    }
  | {
      ok: false;
      reason: "not_found" | "event_not_allowed" | "session_create_failed";
      error?: unknown;
    }
> {
  const phone = normalizeGatePhone(input.validatorPhone);
  if (!phone) return { ok: false, reason: "not_found" };

  const supabase = getSupabaseAdmin();
  const { data: access, error: accessError } = await supabase
    .from("fixed_gate_accesses")
    .select(FIXED_GATE_ACCESS_COLUMNS)
    .eq("id", input.accessId)
    .in("phone", buildWhatsAppPhoneCandidates(phone))
    .eq("status", "active")
    .maybeSingle<FixedGateAccessRow>();

  if (accessError || !access) {
    return { ok: false, reason: "not_found", error: accessError };
  }

  const { data: event, error: eventError } = await supabase
    .from("events")
    .select("id")
    .eq("id", input.eventId)
    .eq("created_by_admin_user_id", access.owner_admin_user_id)
    .eq("status", "published")
    .maybeSingle<{ id: string }>();

  if (eventError || !event) {
    return { ok: false, reason: "event_not_allowed", error: eventError };
  }

  const sessionResult = await createGateSession({
    validatorPhone: access.phone,
    createdByAdminPhone: access.created_by_admin_phone ?? access.phone,
    gateLabel: "Portaria fixa",
    eventId: event.id,
    replaceActiveSessions: true,
    source: { kind: "fixed_gate_access", fixedGateAccessId: access.id },
  });

  if (!sessionResult.ok) {
    return {
      ok: false,
      reason: "session_create_failed",
      error: sessionResult.error,
    };
  }

  return {
    ok: true,
    gateUrl: sessionResult.gateUrl,
    gateSession: sessionResult.gateSession,
  };
}
