import "server-only";

import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { buildWhatsAppPhoneCandidates } from "@/lib/tickets/phones";
import {
  hashGateAccessPassphrase,
  verifyGateAccessPassphrase,
} from "@/lib/tickets/services/gateAccessAuth";
import {
  buildKitchenUrl,
  createGateSession,
  normalizeGatePhone,
  type CreateGateSessionResult,
} from "@/lib/tickets/services/gateSessions";

export type GateAccessStatus = "active" | "paused" | "revoked";

export type GateAccess = {
  id: string;
  event_id: string;
  session_id: string | null;
  phone: string;
  name: string | null;
  passphrase_hash: string;
  status: GateAccessStatus;
  created_by_admin_user_id: string | null;
  created_by_admin_phone: string | null;
  created_at: string;
  updated_at: string;
  revoked_at: string | null;
  revoked_by_admin_user_id: string | null;
};

export type AdminGateAccessListItem = {
  id: string;
  eventId: string;
  eventTitle: string | null;
  sessionId: string | null;
  phone: string;
  name: string | null;
  status: GateAccessStatus;
  createdAt: string;
  updatedAt: string;
};

type GateAccessWithEvent = GateAccess & {
  events: { title: string } | { title: string }[] | null;
};

function getGatePhoneLookupVariants(phone: string) {
  return buildWhatsAppPhoneCandidates(phone);
}

function eventTitleFromJoin(events: GateAccessWithEvent["events"]) {
  return Array.isArray(events) ? events[0]?.title ?? null : events?.title ?? null;
}

function toListItem(access: GateAccessWithEvent): AdminGateAccessListItem {
  return {
    id: access.id,
    eventId: access.event_id,
    eventTitle: eventTitleFromJoin(access.events),
    sessionId: access.session_id,
    phone: access.phone,
    name: access.name,
    status: access.status,
    createdAt: access.created_at,
    updatedAt: access.updated_at,
  };
}

export async function createGateAccess(input: {
  eventId: string;
  sessionId?: string | null;
  phone: string;
  passphrase: string;
  name?: string | null;
  createdByAdminUserId?: string | null;
  createdByAdminPhone?: string | null;
}) {
  const phone = normalizeGatePhone(input.phone);
  const createdByAdminPhone = normalizeGatePhone(input.createdByAdminPhone);
  const passphrase = input.passphrase.trim();

  if (!phone || phone.length < 10) {
    return { ok: false as const, reason: "invalid_phone" as const };
  }

  if (!passphrase) {
    return { ok: false as const, reason: "invalid_passphrase" as const };
  }

  const supabase = getSupabaseAdmin();
  const { data: event, error: eventError } = await supabase
    .from("events")
    .select("id, status")
    .eq("id", input.eventId)
    .maybeSingle<{ id: string; status: string }>();

  if (eventError) {
    return { ok: false as const, reason: "insert_failed" as const, error: eventError };
  }

  if (!event || event.status !== "published") {
    return { ok: false as const, reason: "insert_failed" as const };
  }

  const { data, error } = await supabase
    .from("gate_accesses")
    .insert({
      event_id: input.eventId,
      session_id: input.sessionId ?? null,
      phone,
      name: input.name?.trim() || null,
      passphrase_hash: hashGateAccessPassphrase(passphrase),
      status: "active",
      created_by_admin_user_id: input.createdByAdminUserId ?? null,
      created_by_admin_phone: createdByAdminPhone,
    })
    .select(
      "id, event_id, session_id, phone, name, passphrase_hash, status, created_by_admin_user_id, created_by_admin_phone, created_at, updated_at, revoked_at, revoked_by_admin_user_id",
    )
    .single<GateAccess>();

  if (error) {
    const code = typeof error === "object" && "code" in error ? error.code : null;

    return {
      ok: false as const,
      reason: code === "23505" ? ("already_registered" as const) : ("insert_failed" as const),
      error,
    };
  }

  return { ok: true as const, gateAccess: data };
}

export async function listGateAccesses(input: {
  eventId: string;
  filter?: "active" | "paused" | "open" | "all";
}) {
  const supabase = getSupabaseAdmin();
  let query = supabase
    .from("gate_accesses")
    .select(
      "id, event_id, session_id, phone, name, passphrase_hash, status, created_by_admin_user_id, created_by_admin_phone, created_at, updated_at, revoked_at, revoked_by_admin_user_id, events(title)",
    )
    .eq("event_id", input.eventId)
    .order("created_at", { ascending: false })
    .limit(50);

  if (input.filter === "active") {
    query = query.eq("status", "active");
  } else if (input.filter === "paused") {
    query = query.eq("status", "paused");
  } else if (input.filter === "open") {
    query = query.in("status", ["active", "paused"]);
  }

  const { data, error } = await query.returns<GateAccessWithEvent[]>();

  if (error) return { ok: false as const, error };

  return {
    ok: true as const,
    accesses: (data ?? []).map(toListItem),
  };
}

export async function findActiveGateAccessesForPhone(phoneInput: string) {
  const phone = normalizeGatePhone(phoneInput);

  if (!phone) {
    return { ok: false as const, reason: "invalid_phone" as const };
  }

  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("gate_accesses")
    .select(
      "id, event_id, session_id, phone, name, passphrase_hash, status, created_by_admin_user_id, created_by_admin_phone, created_at, updated_at, revoked_at, revoked_by_admin_user_id, events!inner(title, status)",
    )
    .in("phone", getGatePhoneLookupVariants(phone))
    .eq("status", "active")
    .eq("events.status", "published")
    .order("created_at", { ascending: false })
    .limit(20)
    .returns<GateAccessWithEvent[]>();

  if (error) return { ok: false as const, reason: "lookup_failed" as const, error };

  return {
    ok: true as const,
    accesses: (data ?? []).map(toListItem),
  };
}

export async function pauseGateAccess(input: {
  accessId: string;
  eventId?: string | null;
  revokedByAdminUserId?: string | null;
}) {
  const supabase = getSupabaseAdmin();
  let query = supabase
    .from("gate_accesses")
    .update({
      status: "paused",
      revoked_by_admin_user_id: input.revokedByAdminUserId ?? null,
    })
    .eq("id", input.accessId)
    .in("status", ["active", "paused"]);

  if (input.eventId) {
    query = query.eq("event_id", input.eventId);
  }

  const { data, error } = await query
    .select("id")
    .maybeSingle<{ id: string }>();

  if (error) return { ok: false as const, error };

  return { ok: true as const, paused: Boolean(data) };
}

export async function createGateSessionForGateAccess(input: {
  accessId: string;
  validatorPhone: string;
  passphrase: string;
  purpose?: "gate" | "kitchen";
}): Promise<
  | {
      ok: true;
      gateUrl: string;
      token: string;
      gateSession: Extract<CreateGateSessionResult, { ok: true }>["gateSession"];
      gateAccess: AdminGateAccessListItem;
    }
  | {
      ok: false;
      reason:
        | "invalid_phone"
        | "not_found"
        | "invalid_passphrase"
        | "session_create_failed";
      error?: unknown;
    }
> {
  const phone = normalizeGatePhone(input.validatorPhone);

  if (!phone) {
    return { ok: false, reason: "invalid_phone" };
  }

  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("gate_accesses")
    .select(
      "id, event_id, session_id, phone, name, passphrase_hash, status, created_by_admin_user_id, created_by_admin_phone, created_at, updated_at, revoked_at, revoked_by_admin_user_id, events(title)",
    )
    .eq("id", input.accessId)
    .in("phone", getGatePhoneLookupVariants(phone))
    .eq("status", "active")
    .maybeSingle<GateAccessWithEvent>();

  if (error) return { ok: false, reason: "not_found", error };
  if (!data) return { ok: false, reason: "not_found" };

  if (!verifyGateAccessPassphrase(input.passphrase, data.passphrase_hash)) {
    return { ok: false, reason: "invalid_passphrase" };
  }

  const purpose = input.purpose ?? "gate";
  const gateSessionResult = await createGateSession({
    validatorPhone: data.phone,
    validatorName: data.name,
    createdByAdminPhone: data.created_by_admin_phone ?? data.phone,
    gateLabel: purpose === "kitchen" ? "Cozinha" : "Portaria",
    eventId: data.event_id,
    sessionId: data.session_id,
    replaceActiveSessions: true,
    ttlMinutes: purpose === "kitchen" ? 8 * 60 : undefined,
  });

  if (!gateSessionResult.ok) {
    return {
      ok: false,
      reason: "session_create_failed",
      error: gateSessionResult.error,
    };
  }

  return {
    ok: true,
    token: gateSessionResult.token,
    gateUrl:
      purpose === "kitchen"
        ? buildKitchenUrl(gateSessionResult.token)
        : gateSessionResult.gateUrl,
    gateSession: gateSessionResult.gateSession,
    gateAccess: toListItem(data),
  };
}
