import "server-only";

import { getSupabaseAdmin } from "@/lib/supabase/admin";
import {
  hashAdminPassphrase,
  normalizeAdminPhone,
  type AdminRole,
} from "@/lib/tickets/services/adminAuth";

export type AdminUserListItem = {
  id: string;
  phone: string;
  role: AdminRole;
  status: "active" | "disabled";
  name: string | null;
};

type AdminUserRow = {
  id: string;
  phone: string;
  role: AdminRole;
  status: "active" | "disabled";
  name: string | null;
};

function mapAdminUser(row: AdminUserRow): AdminUserListItem {
  return {
    id: row.id,
    phone: row.phone,
    role: row.role,
    status: row.status,
    name: row.name,
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

export async function listAdminUsers() {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("admin_users")
    .select("id, phone, role, status, name")
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
  passphrase,
  createdByAdminPhone,
}: {
  phone: string;
  name: string | null;
  role: AdminRole;
  passphrase: string;
  createdByAdminPhone: string;
}) {
  const normalizedPhone = normalizeAdminPhone(phone);
  const normalizedCreatorPhone = normalizeAdminPhone(createdByAdminPhone);

  if (!normalizedPhone || !normalizedCreatorPhone) {
    return { ok: false as const, reason: "invalid_phone" as const };
  }

  const supabase = getSupabaseAdmin();
  const { error } = await supabase.from("admin_users").upsert(
    {
      phone: normalizedPhone,
      name,
      role,
      status: "active",
      passphrase_hash: hashAdminPassphrase(passphrase),
      created_by_admin_phone: normalizedCreatorPhone,
    },
    { onConflict: "phone" },
  );

  return error ? { ok: false as const, reason: "database_error" as const, error } : { ok: true as const };
}

export async function updateAdminRole({
  adminUserId,
  role,
}: {
  adminUserId: string;
  role: AdminRole;
}) {
  const supabase = getSupabaseAdmin();
  const { error } = await supabase
    .from("admin_users")
    .update({ role, status: "active" })
    .eq("id", adminUserId);

  return error ? { ok: false as const, error } : { ok: true as const };
}

export async function disableAdminUser(adminUserId: string) {
  const supabase = getSupabaseAdmin();
  const { error } = await supabase
    .from("admin_users")
    .update({ status: "disabled" })
    .eq("id", adminUserId);

  return error ? { ok: false as const, error } : { ok: true as const };
}
