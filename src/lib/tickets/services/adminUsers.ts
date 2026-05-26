import "server-only";

import { getSupabaseAdmin } from "@/lib/supabase/admin";
import {
  getAdminProfileLabel,
  normalizeAdminPhone,
  type AdminRole,
} from "@/lib/tickets/services/adminAuth";

export type AdminUserListItem = {
  id: string;
  phone: string;
  role: AdminRole;
  status: "active" | "disabled";
  name: string | null;
  createdAt: string;
  lastLoginAt: string | null;
};

type AdminUserRow = {
  id: string;
  phone: string;
  role: AdminRole;
  status: "active" | "disabled";
  name: string | null;
  created_at: string;
  last_login_at: string | null;
};

function mapAdminUser(row: AdminUserRow): AdminUserListItem {
  return {
    id: row.id,
    phone: row.phone,
    role: row.role,
    status: row.status,
    name: row.name,
    createdAt: row.created_at,
    lastLoginAt: row.last_login_at,
  };
}

export function parseAdminRole(value: string): AdminRole | null {
  const normalized = value
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "");

  if (normalized === "1" || normalized === "diretor" || normalized === "root") {
    return "root";
  }

  if (normalized === "2" || normalized === "gerente" || normalized === "admin") {
    return "admin";
  }

  if (
    normalized === "3" ||
    normalized === "operador" ||
    normalized === "operator"
  ) {
    return "operator";
  }

  return null;
}

export { getAdminProfileLabel };

export async function listAdminUsers() {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("admin_users")
    .select("id, phone, role, status, name, created_at, last_login_at")
    .order("created_at", { ascending: true })
    .returns<AdminUserRow[]>();

  if (error) {
    return { ok: false as const, error };
  }

  return { ok: true as const, users: (data ?? []).map(mapAdminUser) };
}

export function resolveAdminUserId(
  input: string,
  users: Array<{
    option: number;
    adminUserId: string;
    phone: string;
    name?: string | null;
  }>,
) {
  const trimmed = input.trim();
  const option = /^\d+$/.test(trimmed) ? Number(trimmed) : null;

  if (option) {
    const user = users.find((item) => item.option === option);
    if (user) return user.adminUserId;
  }

  const phone = normalizeAdminPhone(trimmed);
  if (phone) {
    const user = users.find((item) => item.phone === phone);
    if (user) return user.adminUserId;
  }

  if (
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      trimmed,
    )
  ) {
    return trimmed;
  }

  const normalized = trimmed.toLocaleLowerCase("pt-BR");
  return (
    users.find((item) => item.name?.toLocaleLowerCase("pt-BR") === normalized)
      ?.adminUserId ??
    null
  );
}

export async function createAdminUser({
  phone,
  name,
  role,
  passphraseHash,
  createdByAdminPhone,
}: {
  phone: string;
  name: string | null;
  role: AdminRole;
  passphraseHash: string;
  createdByAdminPhone: string;
}) {
  const normalizedPhone = normalizeAdminPhone(phone);
  const normalizedCreatorPhone = normalizeAdminPhone(createdByAdminPhone);
  const normalizedPassphraseHash = passphraseHash.trim();

  if (!normalizedPhone || !normalizedCreatorPhone) {
    return { ok: false as const, reason: "invalid_phone" as const };
  }

  if (!normalizedPassphraseHash.startsWith("pbkdf2_sha256$")) {
    return { ok: false as const, reason: "invalid_passphrase" as const };
  }

  const supabase = getSupabaseAdmin();

  const { data: existing, error: existingError } = await supabase
    .from("admin_users")
    .select("id, status")
    .eq("phone", normalizedPhone)
    .maybeSingle<{ id: string; status: "active" | "disabled" }>();

  if (existingError) {
    return { ok: false as const, reason: "database_error" as const, error: existingError };
  }

  if (existing?.status === "active") {
    return { ok: false as const, reason: "already_active" as const, adminUserId: existing.id };
  }

  if (existing?.status === "disabled") {
    return { ok: false as const, reason: "already_disabled" as const, adminUserId: existing.id };
  }

  const { error } = await supabase.from("admin_users").insert(
    {
      phone: normalizedPhone,
      name,
      role,
      status: "active",
      passphrase_hash: normalizedPassphraseHash,
      created_by_admin_phone: normalizedCreatorPhone,
    },
  );

  return error ? { ok: false as const, reason: "database_error" as const, error } : { ok: true as const };
}

export async function updateAdminRole({
  adminUserId,
  role,
  actingAdminUserId,
}: {
  adminUserId: string;
  role: AdminRole;
  actingAdminUserId: string;
}) {
  const supabase = getSupabaseAdmin();
  const { data: target, error: targetError } = await supabase
    .from("admin_users")
    .select("id, phone, role, status")
    .eq("id", adminUserId)
    .maybeSingle<{
      id: string;
      phone: string;
      role: AdminRole;
      status: "active" | "disabled";
    }>();

  if (targetError) return { ok: false as const, reason: "database_error" as const, error: targetError };
  if (!target) return { ok: false as const, reason: "not_found" as const };
  if (target.id === actingAdminUserId && target.role === "root" && role !== "root") {
    return { ok: false as const, reason: "self_downgrade_blocked" as const };
  }

  if (target.role === "root" && role !== "root") {
    const activeRootCount = await countActiveRootAdmins();
    if (!activeRootCount.ok) return activeRootCount;
    if (activeRootCount.count <= 1) {
      return { ok: false as const, reason: "last_root_blocked" as const };
    }
  }

  const { error } = await supabase
    .from("admin_users")
    .update({ role, status: "active" })
    .eq("id", adminUserId);

  if (error) return { ok: false as const, reason: "database_error" as const, error };

  await revokeAdminSessionsForUser(adminUserId);

  return { ok: true as const };
}

export async function disableAdminUser({
  adminUserId,
  actingAdminUserId,
}: {
  adminUserId: string;
  actingAdminUserId: string;
}) {
  const supabase = getSupabaseAdmin();
  const { data: target, error: targetError } = await supabase
    .from("admin_users")
    .select("id, role, status")
    .eq("id", adminUserId)
    .maybeSingle<{ id: string; role: AdminRole; status: "active" | "disabled" }>();

  if (targetError) return { ok: false as const, reason: "database_error" as const, error: targetError };
  if (!target) return { ok: false as const, reason: "not_found" as const };
  if (target.status === "disabled") return { ok: true as const, idempotent: true as const };
  if (target.id === actingAdminUserId) return { ok: false as const, reason: "self_disable_blocked" as const };

  if (target.role === "root") {
    const activeRootCount = await countActiveRootAdmins();
    if (!activeRootCount.ok) return activeRootCount;
    if (activeRootCount.count <= 1) {
      return { ok: false as const, reason: "last_root_blocked" as const };
    }
  }

  const { error } = await supabase
    .from("admin_users")
    .update({ status: "disabled" })
    .eq("id", adminUserId);

  if (error) return { ok: false as const, reason: "database_error" as const, error };

  await revokeAdminSessionsForUser(adminUserId);

  return { ok: true as const };
}

export async function reactivateAdminUser({
  adminUserId,
  phone,
  name,
  role,
  passphraseHash,
  createdByAdminPhone,
}: {
  adminUserId: string;
  phone: string;
  name: string | null;
  role: AdminRole;
  passphraseHash: string;
  createdByAdminPhone: string;
}) {
  const normalizedPhone = normalizeAdminPhone(phone);
  const normalizedCreatorPhone = normalizeAdminPhone(createdByAdminPhone);
  const normalizedPassphraseHash = passphraseHash.trim();
  if (!normalizedPhone || !normalizedCreatorPhone) {
    return { ok: false as const, reason: "invalid_phone" as const };
  }
  if (!normalizedPassphraseHash.startsWith("pbkdf2_sha256$")) {
    return { ok: false as const, reason: "invalid_passphrase" as const };
  }

  const supabase = getSupabaseAdmin();
  const { error } = await supabase
    .from("admin_users")
    .update({
      name,
      role,
      status: "active",
      passphrase_hash: normalizedPassphraseHash,
      created_by_admin_phone: normalizedCreatorPhone,
    })
    .eq("id", adminUserId)
    .eq("phone", normalizedPhone)
    .eq("status", "disabled");

  if (error) return { ok: false as const, reason: "database_error" as const, error };

  await revokeAdminSessionsForUser(adminUserId);

  return { ok: true as const };
}

export async function revokeAdminSessionsForUser(adminUserId: string) {
  const supabase = getSupabaseAdmin();
  const { error } = await supabase
    .from("admin_sessions")
    .update({
      status: "revoked",
      last_used_at: new Date().toISOString(),
    })
    .eq("admin_user_id", adminUserId)
    .eq("status", "active");

  return error ? { ok: false as const, reason: "database_error" as const, error } : { ok: true as const };
}

export async function countActiveRootAdmins() {
  const supabase = getSupabaseAdmin();
  const { count, error } = await supabase
    .from("admin_users")
    .select("id", { count: "exact", head: true })
    .eq("role", "root")
    .eq("status", "active");

  return error
    ? { ok: false as const, reason: "database_error" as const, error }
    : { ok: true as const, count: count ?? 0 };
}
