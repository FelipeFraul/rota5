import "server-only";

import {
  createHash,
  pbkdf2Sync,
  randomBytes,
  timingSafeEqual,
} from "crypto";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

export const ADMIN_AUTH_REDACTED_BODY = "[ADMIN_AUTH_REDACTED]";

const ADMIN_SESSION_DEFAULT_TTL_MINUTES = 60;
const ADMIN_HASH_ALGORITHM = "pbkdf2_sha256";
const ADMIN_HASH_ITERATIONS = 210_000;
const ADMIN_HASH_KEY_LENGTH = 32;

export type AdminRole = "root" | "admin" | "operator" | "gate" | "support";
export type AdminPermission =
  | "manage_admins"
  | "manage_events"
  | "manage_tickets"
  | "manage_courtesies"
  | "manage_gate"
  | "view_reports";

export type AdminUser = {
  id: string;
  phone: string;
  role: AdminRole;
  status: "active" | "disabled";
  name: string | null;
  last_login_at: string | null;
  courtesy_send_limit?: number | null;
  courtesy_receive_limit?: number | null;
};

export type AdminSession = {
  id: string;
  admin_user_id: string;
  phone: string;
  status: "active" | "expired" | "revoked";
  expires_at: string;
  created_at: string;
  last_used_at: string | null;
};

export const ADMIN_ROLE_PERMISSIONS: Record<AdminRole, AdminPermission[]> = {
  root: [
    "manage_admins",
    "manage_events",
    "manage_tickets",
    "manage_courtesies",
    "manage_gate",
    "view_reports",
  ],
  admin: [
    "manage_events",
    "manage_tickets",
    "manage_courtesies",
    "manage_gate",
    "view_reports",
  ],
  operator: ["manage_courtesies", "view_reports"],
  gate: [],
  support: [],
};

export function normalizeAdminPhone(phone: string | null | undefined) {
  const digits = phone?.replace(/\D/g, "") ?? "";

  return digits.length > 0 ? digits : null;
}

export function normalizeAdminText(text: string) {
  return text
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/\s+/g, " ");
}

export function isReservedAdminCommand(text: string) {
  const normalized = normalizeAdminText(text);

  return (
    normalized === "admin" ||
    normalized === "adm" ||
    normalized === "administrador"
  );
}

export function isAdminLogoutCommand(text: string) {
  const normalized = normalizeAdminText(text);

  return (
    normalized === "sair" ||
    normalized === "logout" ||
    normalized === "encerrar"
  );
}

function getRootAdminPhones() {
  return (process.env.ADMIN_ROOT_WHATSAPP_PHONES ?? "")
    .split(",")
    .map((phone) => normalizeAdminPhone(phone))
    .filter((phone): phone is string => Boolean(phone));
}

export function isRootAdminPhone(phone: string) {
  const normalizedPhone = normalizeAdminPhone(phone);

  return Boolean(
    normalizedPhone &&
      getRootAdminPhones().some((rootPhone) => rootPhone === normalizedPhone),
  );
}

function getSessionTtlMinutes() {
  const rawValue = process.env.ADMIN_SESSION_TTL_MINUTES;

  if (!rawValue) {
    return ADMIN_SESSION_DEFAULT_TTL_MINUTES;
  }

  const ttl = Number(rawValue);

  return Number.isInteger(ttl) && ttl > 0 ? ttl : ADMIN_SESSION_DEFAULT_TTL_MINUTES;
}

function fixedTimeEqual(left: string, right: string) {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);

  return (
    leftBuffer.length === rightBuffer.length &&
    timingSafeEqual(leftBuffer, rightBuffer)
  );
}

function verifyPassphraseHash(passphrase: string, configuredHash: string) {
  const [algorithm, iterationsRaw, salt, expectedDigest] =
    configuredHash.split("$");

  if (algorithm !== ADMIN_HASH_ALGORITHM || !iterationsRaw || !salt || !expectedDigest) {
    return false;
  }

  const iterations = Number(iterationsRaw);

  if (!Number.isInteger(iterations) || iterations <= 0) {
    return false;
  }

  const digest = pbkdf2Sync(
    passphrase,
    salt,
    iterations,
    Math.max(expectedDigest.length / 2, ADMIN_HASH_KEY_LENGTH),
    "sha256",
  ).toString("hex");

  return fixedTimeEqual(digest, expectedDigest);
}

export function hashAdminPassphrase(passphrase: string): string {
  const salt = randomBytes(16).toString("hex");
  const digest = pbkdf2Sync(
    passphrase,
    salt,
    ADMIN_HASH_ITERATIONS,
    ADMIN_HASH_KEY_LENGTH,
    "sha256",
  ).toString("hex");

  return `${ADMIN_HASH_ALGORITHM}$${ADMIN_HASH_ITERATIONS}$${salt}$${digest}`;
}

export function verifyAdminPassphrase(passphrase: string): boolean {
  const configuredHash = process.env.ADMIN_AUTH_SECRET_HASH?.trim();

  if (!configuredHash) {
    return false;
  }

  return verifyPassphraseHash(passphrase, configuredHash);
}

export async function verifyAdminUserPassphrase(phone: string, passphrase: string) {
  const normalizedPhone = normalizeAdminPhone(phone);

  if (!normalizedPhone) return false;

  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("admin_users")
    .select("passphrase_hash")
    .eq("phone", normalizedPhone)
    .maybeSingle<{ passphrase_hash: string | null }>();

  if (error) {
    return verifyAdminPassphrase(passphrase);
  }

  if (data?.passphrase_hash) {
    return verifyPassphraseHash(passphrase, data.passphrase_hash);
  }

  return verifyAdminPassphrase(passphrase);
}

export function hashAdminAuthMetadata(value: string) {
  return createHash("sha256").update(value).digest("hex");
}

export function hasAdminPermission(role: AdminRole, permission: AdminPermission) {
  return ADMIN_ROLE_PERMISSIONS[role].includes(permission);
}

export function getAdminMenuOptions(role: AdminRole) {
  const permissions = ADMIN_ROLE_PERMISSIONS[role];
  const options: Array<{
    option: number;
    label: string;
    permission: AdminPermission;
  }> = [
    {
      option: 1,
      label: "Meus eventos",
      permission: "manage_events" satisfies AdminPermission,
    },
    {
      option: 2,
      label: "Ingressos e pedidos",
      permission: "manage_tickets" satisfies AdminPermission,
    },
    {
      option: 3,
      label: "Cortesias",
      permission: "manage_courtesies" satisfies AdminPermission,
    },
    {
      option: 4,
      label: "Portaria",
      permission: "manage_gate" satisfies AdminPermission,
    },
    {
      option: 5,
      label: "Administradores",
      permission: "manage_admins" satisfies AdminPermission,
    },
    {
      option: 6,
      label: "Relatórios",
      permission: "view_reports" satisfies AdminPermission,
    },
  ];

  return [
    ...options.filter((option) => permissions.includes(option.permission)),
    { option: 7, label: "Sair", permission: null },
  ];
}

export function formatAdminMenu(role: AdminRole) {
  return [
    "Acesso administrativo liberado.",
    "",
    "*MENU ADMIN*",
    "",
    ...getAdminMenuOptions(role).map(
      (option) => `> ${option.option}. ${option.label}`,
    ),
    "",
    "Responda com o número da opção.",
    'Digite "Voltar" para voltar, "Cancelar" para abandonar esta tela ou "Sair" para sair da área de admin.',
  ].join("\n");
}

export async function getAdminUserByPhone(phone: string) {
  const normalizedPhone = normalizeAdminPhone(phone);

  if (!normalizedPhone) {
    return {
      ok: false as const,
      reason: "invalid_phone" as const,
    };
  }

  const supabase = getSupabaseAdmin();
  const { data: adminUser, error } = await supabase
    .from("admin_users")
    .select("id, phone, role, status, name, last_login_at, courtesy_send_limit, courtesy_receive_limit")
    .eq("phone", normalizedPhone)
    .maybeSingle<AdminUser>();

  if (error) {
    return {
      ok: false as const,
      reason: "database_error" as const,
      error,
    };
  }

  return {
    ok: true as const,
    adminUser,
  };
}

export async function ensureAdminUserForPhone(phone: string) {
  const normalizedPhone = normalizeAdminPhone(phone);

  if (!normalizedPhone) {
    return {
      ok: false as const,
      reason: "invalid_phone" as const,
    };
  }

  const existingResult = await getAdminUserByPhone(normalizedPhone);

  if (!existingResult.ok) {
    return existingResult;
  }

  if (existingResult.adminUser) {
    if (existingResult.adminUser.status !== "active") {
      return {
        ok: false as const,
        reason: "disabled" as const,
      };
    }

    return {
      ok: true as const,
      adminUser: existingResult.adminUser,
      bootstrapped: false,
    };
  }

  if (!isRootAdminPhone(normalizedPhone)) {
    return {
      ok: false as const,
      reason: "not_authorized" as const,
    };
  }

  const supabase = getSupabaseAdmin();
  const { data: adminUser, error } = await supabase
    .from("admin_users")
    .insert({
      phone: normalizedPhone,
      role: "root",
      status: "active",
      created_by_admin_phone: normalizedPhone,
    })
    .select("id, phone, role, status, name, last_login_at, courtesy_send_limit, courtesy_receive_limit")
    .single<AdminUser>();

  if (error) {
    if (error.code === "23505") {
      return ensureAdminUserForPhone(normalizedPhone);
    }

    return {
      ok: false as const,
      reason: "database_error" as const,
      error,
    };
  }

  return {
    ok: true as const,
    adminUser,
    bootstrapped: true,
  };
}

export async function isAuthorizedAdminPhone(phone: string) {
  const normalizedPhone = normalizeAdminPhone(phone);

  if (!normalizedPhone) {
    return false;
  }

  if (isRootAdminPhone(normalizedPhone)) {
    return true;
  }

  const adminResult = await getAdminUserByPhone(normalizedPhone);

  return Boolean(
    adminResult.ok &&
      adminResult.adminUser &&
      adminResult.adminUser.status === "active",
  );
}

export async function createAdminSession(adminUser: AdminUser) {
  const normalizedPhone = normalizeAdminPhone(adminUser.phone);

  if (!normalizedPhone) {
    return {
      ok: false as const,
      reason: "invalid_phone" as const,
    };
  }

  const now = new Date();
  const expiresAt = new Date(
    now.getTime() + getSessionTtlMinutes() * 60 * 1000,
  ).toISOString();
  const supabase = getSupabaseAdmin();

  await supabase
    .from("admin_sessions")
    .update({
      status: "revoked",
      last_used_at: now.toISOString(),
    })
    .eq("phone", normalizedPhone)
    .eq("status", "active");

  const { data: adminSession, error } = await supabase
    .from("admin_sessions")
    .insert({
      admin_user_id: adminUser.id,
      phone: normalizedPhone,
      status: "active",
      expires_at: expiresAt,
      metadata: {
        source: "whatsapp",
      },
    })
    .select("id, admin_user_id, phone, status, expires_at, created_at, last_used_at")
    .single<AdminSession>();

  if (error) {
    return {
      ok: false as const,
      reason: "database_error" as const,
      error,
    };
  }

  await supabase
    .from("admin_users")
    .update({
      last_login_at: now.toISOString(),
    })
    .eq("id", adminUser.id);

  return {
    ok: true as const,
    adminSession,
  };
}

export async function getActiveAdminSession(phone: string) {
  const normalizedPhone = normalizeAdminPhone(phone);

  if (!normalizedPhone) {
    return {
      ok: false as const,
      reason: "invalid_phone" as const,
    };
  }

  const supabase = getSupabaseAdmin();
  const { data: adminSession, error } = await supabase
    .from("admin_sessions")
    .select("id, admin_user_id, phone, status, expires_at, created_at, last_used_at")
    .eq("phone", normalizedPhone)
    .eq("status", "active")
    .gt("expires_at", new Date().toISOString())
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle<AdminSession>();

  if (error) {
    return {
      ok: false as const,
      reason: "database_error" as const,
      error,
    };
  }

  if (!adminSession) {
    await supabase
      .from("admin_sessions")
      .update({ status: "expired", last_used_at: new Date().toISOString() })
      .eq("phone", normalizedPhone)
      .eq("status", "active")
      .lte("expires_at", new Date().toISOString());

    return {
      ok: true as const,
      adminSession: null,
    };
  }

  await supabase
    .from("admin_sessions")
    .update({ last_used_at: new Date().toISOString() })
    .eq("id", adminSession.id);

  return {
    ok: true as const,
    adminSession,
  };
}

export async function revokeActiveAdminSessions(phone: string) {
  const normalizedPhone = normalizeAdminPhone(phone);

  if (!normalizedPhone) {
    return {
      ok: false as const,
      reason: "invalid_phone" as const,
    };
  }

  const { error } = await getSupabaseAdmin()
    .from("admin_sessions")
    .update({
      status: "revoked",
      last_used_at: new Date().toISOString(),
    })
    .eq("phone", normalizedPhone)
    .eq("status", "active");

  if (error) {
    return {
      ok: false as const,
      reason: "database_error" as const,
      error,
    };
  }

  return {
    ok: true as const,
  };
}
