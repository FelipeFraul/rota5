import "server-only";

import {
  createHash,
  pbkdf2Sync,
  randomBytes,
  randomInt,
  timingSafeEqual,
} from "crypto";
import { getEnv } from "@/lib/env";
import { logWarn } from "@/lib/logger";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { normalizeWhatsAppPhone } from "@/lib/tickets/phones";

export const ADMIN_AUTH_REDACTED_BODY = "[ADMIN_AUTH_REDACTED]";
export const ADMIN_LOGIN_LINK_REDACTED_BODY = "[ADMIN_LOGIN_LINK_REDACTED]";

const ADMIN_SESSION_DEFAULT_TTL_MINUTES = 60;
const ADMIN_HASH_ALGORITHM = "pbkdf2_sha256";
const ADMIN_HASH_ITERATIONS = 210_000;
const ADMIN_HASH_KEY_LENGTH = 32;
const ADMIN_AUTH_TEMP_LOCK_FAILED_ATTEMPTS = 3;
const ADMIN_AUTH_HARD_LOCK_FAILED_ATTEMPTS = 5;
const ADMIN_AUTH_TEMP_LOCK_MINUTES = 15;
const ADMIN_LOGIN_LINK_TTL_MINUTES = 2;
const ADMIN_LOGIN_CODE_TTL_MINUTES = 2;
const ADMIN_LOGIN_CODE_ATTEMPTS = 3;

export type AdminRole = "root" | "admin" | "operator";
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

type AdminAuthAttemptRow = {
  phone: string;
  sequential_failed_attempts: number;
  locked_until: string | null;
  hard_locked_at: string | null;
  alert_level: number;
  last_failed_at: string | null;
  last_success_at: string | null;
  last_source_hash: string | null;
  unlocked_at: string | null;
  unlocked_by_admin_user_id: string | null;
  created_at: string;
  updated_at: string;
};

type AdminLoginChallengeRow = {
  id: string;
  admin_user_id: string;
  phone: string;
  link_token_hash: string;
  return_code_hash: string | null;
  status: "pending" | "password_verified" | "consumed" | "expired" | "revoked";
  expires_at: string;
  code_expires_at: string | null;
  password_verified_at: string | null;
  consumed_at: string | null;
  failed_passphrase_attempts: number;
  failed_code_attempts: number;
  source_hash: string | null;
  created_at: string;
  updated_at: string;
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
};

export function isAdminRole(value: string | null | undefined): value is AdminRole {
  return value === "root" || value === "admin" || value === "operator";
}

export function getAdminProfileLabel(role: string) {
  if (role === "root") return "Diretor";
  if (role === "admin") return "Gerente";
  if (role === "operator") return "Operador";
  return "Perfil legado sem acesso administrativo";
}

export function getAdminPermissions(role: AdminRole): AdminPermission[] {
  return ADMIN_ROLE_PERMISSIONS[role];
}

export function normalizeAdminPhone(phone: string | null | undefined) {
  return normalizeWhatsAppPhone(phone);
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

export function verifyPassphraseHash(passphrase: string, configuredHash: string) {
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

export async function verifyAdminUserPassphrase(phone: string, passphrase: string) {
  const normalizedPhone = normalizeAdminPhone(phone);

  if (!normalizedPhone) return { ok: false as const, reason: "invalid_phone" as const };

  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("admin_users")
    .select("passphrase_hash")
    .eq("phone", normalizedPhone)
    .maybeSingle<{ passphrase_hash: string | null }>();

  if (error) {
    return { ok: false as const, reason: "database_error" as const, error };
  }

  if (!data?.passphrase_hash) {
    return { ok: false as const, reason: "missing_passphrase_hash" as const };
  }

  return verifyPassphraseHash(passphrase, data.passphrase_hash)
    ? { ok: true as const }
    : { ok: false as const, reason: "invalid_passphrase" as const };
}

export function hashAdminAuthMetadata(value: string) {
  return createHash("sha256").update(value).digest("hex");
}

export async function createAdminLoginChallenge({
  adminUser,
  sourceIdentifier,
}: {
  adminUser: AdminUser;
  sourceIdentifier?: string | null;
}) {
  const normalizedPhone = normalizeAdminPhone(adminUser.phone);

  if (!normalizedPhone) {
    return { ok: false as const, reason: "invalid_phone" as const };
  }

  if (adminUser.status !== "active") {
    return { ok: false as const, reason: "disabled" as const };
  }

  const token = randomBytes(32).toString("hex");
  const expiresAt = new Date(
    Date.now() + ADMIN_LOGIN_LINK_TTL_MINUTES * 60_000,
  ).toISOString();
  const supabase = getSupabaseAdmin();

  await supabase
    .from("admin_login_challenges")
    .update({ status: "revoked" })
    .eq("phone", normalizedPhone)
    .in("status", ["pending", "password_verified"]);

  const { data, error } = await supabase
    .from("admin_login_challenges")
    .insert({
      admin_user_id: adminUser.id,
      phone: normalizedPhone,
      link_token_hash: hashAdminLoginSecret(token),
      status: "pending",
      expires_at: expiresAt,
      source_hash: hashAdminAuthSource(sourceIdentifier),
    })
    .select("id, expires_at")
    .single<{ id: string; expires_at: string }>();

  if (isMissingAdminLoginChallengesTable(error)) {
    logWarn("admin_login_challenges table is missing; admin web login challenge cannot be created");
    return { ok: false as const, reason: "missing_migration" as const };
  }

  if (error) {
    return { ok: false as const, reason: "database_error" as const, error };
  }

  return {
    ok: true as const,
    challengeId: data.id,
    loginUrl: getAdminLoginUrl(token),
    expiresAt: data.expires_at,
    expiresInMinutes: ADMIN_LOGIN_LINK_TTL_MINUTES,
  };
}

export async function getAdminLoginChallengeByToken(token: string) {
  const normalizedToken = token.trim();

  if (!normalizedToken) {
    return { ok: false as const, reason: "invalid_token" as const };
  }

  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("admin_login_challenges")
    .select(
      "id, admin_user_id, phone, link_token_hash, return_code_hash, status, expires_at, code_expires_at, password_verified_at, consumed_at, failed_passphrase_attempts, failed_code_attempts, source_hash, created_at, updated_at",
    )
    .eq("link_token_hash", hashAdminLoginSecret(normalizedToken))
    .maybeSingle<AdminLoginChallengeRow>();

  if (isMissingAdminLoginChallengesTable(error)) {
    return { ok: false as const, reason: "missing_migration" as const };
  }

  if (error) return { ok: false as const, reason: "database_error" as const, error };

  if (!data) return { ok: false as const, reason: "not_found" as const };

  if (
    data.status === "consumed" ||
    data.status === "revoked" ||
    new Date(data.expires_at).getTime() <= Date.now()
  ) {
    if (data.status !== "consumed" && data.status !== "revoked") {
      await expireAdminLoginChallenge(data.id);
    }

    return { ok: false as const, reason: "expired" as const };
  }

  return { ok: true as const, challenge: data };
}

export async function verifyAdminLoginChallengePassphrase({
  token,
  passphrase,
  sourceIdentifier,
}: {
  token: string;
  passphrase: string;
  sourceIdentifier?: string | null;
}) {
  const challengeResult = await getAdminLoginChallengeByToken(token);

  if (!challengeResult.ok) return challengeResult;

  const challenge = challengeResult.challenge;

  if (challenge.status !== "pending") {
    return { ok: false as const, reason: "not_pending" as const };
  }

  const blockStatus = await getAdminAuthBlockStatus(challenge.phone);

  if (blockStatus.ok && blockStatus.blocked) {
    return {
      ok: false as const,
      reason: "blocked" as const,
      blockStatus,
    };
  }

  const supabase = getSupabaseAdmin();
  const { data: adminUser, error } = await supabase
    .from("admin_users")
    .select("id, phone, role, status, name, last_login_at, courtesy_send_limit, courtesy_receive_limit, passphrase_hash")
    .eq("id", challenge.admin_user_id)
    .maybeSingle<
      Omit<AdminUser, "role"> & {
        role: string;
        passphrase_hash: string | null;
      }
    >();

  if (error) return { ok: false as const, reason: "database_error" as const, error };

  if (!adminUser || !isAdminRole(adminUser.role) || adminUser.status !== "active") {
    return { ok: false as const, reason: "admin_unavailable" as const };
  }

  if (!adminUser.passphrase_hash) {
    return { ok: false as const, reason: "missing_passphrase_hash" as const };
  }

  if (!verifyPassphraseHash(passphrase, adminUser.passphrase_hash)) {
    const failureResult = await recordAdminAuthFailure({
      phone: challenge.phone,
      sourceIdentifier,
    });

    await supabase
      .from("admin_login_challenges")
      .update({
        failed_passphrase_attempts: challenge.failed_passphrase_attempts + 1,
        source_hash: hashAdminAuthSource(sourceIdentifier),
      })
      .eq("id", challenge.id);

    return {
      ok: false as const,
      reason: "invalid_passphrase" as const,
      failureResult,
    };
  }

  const code = generateAdminReturnCode();
  const codeExpiresAt = new Date(
    Date.now() + ADMIN_LOGIN_CODE_TTL_MINUTES * 60_000,
  ).toISOString();

  const { data: verifiedChallenge, error: updateError } = await supabase
    .from("admin_login_challenges")
    .update({
      return_code_hash: hashAdminLoginSecret(code),
      status: "password_verified",
      password_verified_at: new Date().toISOString(),
      code_expires_at: codeExpiresAt,
      source_hash: hashAdminAuthSource(sourceIdentifier),
    })
    .eq("id", challenge.id)
    .eq("status", "pending")
    .select("id")
    .maybeSingle<{ id: string }>();

  if (updateError) {
    return { ok: false as const, reason: "database_error" as const, error: updateError };
  }

  if (!verifiedChallenge) {
    return { ok: false as const, reason: "not_pending" as const };
  }

  await recordAdminAuthSuccess(challenge.phone);

  return {
    ok: true as const,
    code,
    codeExpiresAt,
    adminUser: {
      id: adminUser.id,
      phone: adminUser.phone,
      role: adminUser.role,
      status: adminUser.status,
      name: adminUser.name,
      last_login_at: adminUser.last_login_at,
      courtesy_send_limit: adminUser.courtesy_send_limit,
      courtesy_receive_limit: adminUser.courtesy_receive_limit,
    } satisfies AdminUser,
  };
}

export async function consumeAdminLoginChallengeCode({
  phone,
  code,
  challengeId,
  sourceIdentifier,
}: {
  phone: string;
  code: string;
  challengeId?: string | null;
  sourceIdentifier?: string | null;
}) {
  const normalizedPhone = normalizeAdminPhone(phone);
  const normalizedCode = code.trim();

  if (!normalizedPhone) {
    return { ok: false as const, reason: "invalid_phone" as const };
  }

  if (!/^\d{6}$/.test(normalizedCode)) {
    return { ok: false as const, reason: "invalid_code_format" as const };
  }

  const supabase = getSupabaseAdmin();
  let query = supabase
    .from("admin_login_challenges")
    .select(
      "id, admin_user_id, phone, link_token_hash, return_code_hash, status, expires_at, code_expires_at, password_verified_at, consumed_at, failed_passphrase_attempts, failed_code_attempts, source_hash, created_at, updated_at",
    )
    .eq("phone", normalizedPhone)
    .eq("status", "password_verified")
    .order("created_at", { ascending: false })
    .limit(1);

  if (challengeId) {
    query = query.eq("id", challengeId);
  }

  const { data, error } = await query.maybeSingle<AdminLoginChallengeRow>();

  if (isMissingAdminLoginChallengesTable(error)) {
    return { ok: false as const, reason: "missing_migration" as const };
  }

  if (error) return { ok: false as const, reason: "database_error" as const, error };
  if (!data || !data.return_code_hash || !data.code_expires_at) {
    return { ok: false as const, reason: "not_found" as const };
  }

  if (
    new Date(data.expires_at).getTime() <= Date.now() ||
    new Date(data.code_expires_at).getTime() <= Date.now()
  ) {
    await expireAdminLoginChallenge(data.id);
    return { ok: false as const, reason: "expired" as const };
  }

  if (!fixedTimeEqual(hashAdminLoginSecret(normalizedCode), data.return_code_hash)) {
    const nextFailedAttempts = data.failed_code_attempts + 1;
    await supabase
      .from("admin_login_challenges")
      .update({
        failed_code_attempts: nextFailedAttempts,
        status: nextFailedAttempts >= ADMIN_LOGIN_CODE_ATTEMPTS ? "revoked" : data.status,
        source_hash: hashAdminAuthSource(sourceIdentifier),
      })
      .eq("id", data.id);

    const failureResult = await recordAdminAuthFailure({
      phone: normalizedPhone,
      sourceIdentifier,
    });

    return {
      ok: false as const,
      reason: nextFailedAttempts >= ADMIN_LOGIN_CODE_ATTEMPTS
        ? "too_many_code_attempts"
        : "invalid_code",
      failureResult,
    };
  }

  const adminUserResult = await getAdminUserByPhone(normalizedPhone);

  if (!adminUserResult.ok) return adminUserResult;

  if (
    !adminUserResult.adminUser ||
    adminUserResult.adminUser.status !== "active" ||
    adminUserResult.adminUser.id !== data.admin_user_id
  ) {
    return { ok: false as const, reason: "admin_unavailable" as const };
  }

  const { data: consumedChallenge, error: consumeError } = await supabase
    .from("admin_login_challenges")
    .update({
      status: "consumed",
      consumed_at: new Date().toISOString(),
      source_hash: hashAdminAuthSource(sourceIdentifier),
    })
    .eq("id", data.id)
    .eq("status", "password_verified")
    .select("id")
    .maybeSingle<{ id: string }>();

  if (consumeError) {
    return { ok: false as const, reason: "database_error" as const, error: consumeError };
  }

  if (!consumedChallenge) {
    return { ok: false as const, reason: "already_consumed" as const };
  }

  await recordAdminAuthSuccess(normalizedPhone);

  return {
    ok: true as const,
    adminUser: adminUserResult.adminUser,
  };
}

function isMissingAdminAuthAttemptsTable(error: { code?: string; message?: string } | null | undefined) {
  return (
    error?.code === "42P01" ||
    error?.message?.includes("admin_auth_attempts") === true
  );
}

function hashAdminAuthSource(sourceIdentifier?: string | null) {
  const normalized = sourceIdentifier?.trim();

  return normalized ? createHash("sha256").update(normalized).digest("hex") : null;
}

function hashAdminLoginSecret(value: string) {
  return createHash("sha256").update(value).digest("hex");
}

function generateAdminReturnCode() {
  return randomInt(0, 1_000_000).toString().padStart(6, "0");
}

function getAdminLoginUrl(token: string) {
  return `${getEnv().APP_BASE_URL.replace(/\/$/, "")}/admin/login/${encodeURIComponent(token)}`;
}

function isMissingAdminLoginChallengesTable(error: { code?: string; message?: string } | null | undefined) {
  return (
    error?.code === "42P01" ||
    error?.message?.includes("admin_login_challenges") === true
  );
}

async function expireAdminLoginChallenge(challengeId: string) {
  await getSupabaseAdmin()
    .from("admin_login_challenges")
    .update({ status: "expired" })
    .eq("id", challengeId)
    .in("status", ["pending", "password_verified"]);
}

function minutesUntil(isoDate: string) {
  return Math.max(1, Math.ceil((new Date(isoDate).getTime() - Date.now()) / 60_000));
}

async function getAdminAuthAttemptRow(phone: string) {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("admin_auth_attempts")
    .select(
      "phone, sequential_failed_attempts, locked_until, hard_locked_at, alert_level, last_failed_at, last_success_at, last_source_hash, unlocked_at, unlocked_by_admin_user_id, created_at, updated_at",
    )
    .eq("phone", phone)
    .maybeSingle<AdminAuthAttemptRow>();

  if (isMissingAdminAuthAttemptsTable(error)) {
    logWarn("admin_auth_attempts table is missing; admin lockout is disabled until migration is applied");
    return { ok: true as const, row: null, missingTable: true as const };
  }

  if (error) return { ok: false as const, error };

  return { ok: true as const, row: data ?? null, missingTable: false as const };
}

export async function getAdminAuthBlockStatus(phone: string) {
  const normalizedPhone = normalizeAdminPhone(phone);
  if (!normalizedPhone) return { ok: false as const, reason: "invalid_phone" as const };

  const rowResult = await getAdminAuthAttemptRow(normalizedPhone);
  if (!rowResult.ok) return { ok: false as const, reason: "database_error" as const, error: rowResult.error };

  const row = rowResult.row;
  if (!row) return { ok: true as const, blocked: false as const };

  if (row.hard_locked_at) {
    return {
      ok: true as const,
      blocked: true as const,
      type: "hard" as const,
      failedAttempts: row.sequential_failed_attempts,
    };
  }

  if (row.locked_until && new Date(row.locked_until).getTime() > Date.now()) {
    return {
      ok: true as const,
      blocked: true as const,
      type: "temporary" as const,
      lockedUntil: row.locked_until,
      retryAfterMinutes: minutesUntil(row.locked_until),
      failedAttempts: row.sequential_failed_attempts,
    };
  }

  return { ok: true as const, blocked: false as const };
}

async function getAdminAuthAlertPhone(phone: string) {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("admin_users")
    .select("created_by_admin_phone")
    .eq("phone", phone)
    .maybeSingle<{ created_by_admin_phone: string | null }>();

  if (error) return null;

  return normalizeAdminPhone(data?.created_by_admin_phone);
}

export async function recordAdminAuthFailure({
  phone,
  sourceIdentifier,
}: {
  phone: string;
  sourceIdentifier?: string | null;
}) {
  const normalizedPhone = normalizeAdminPhone(phone);
  if (!normalizedPhone) return { ok: false as const, reason: "invalid_phone" as const };

  const rowResult = await getAdminAuthAttemptRow(normalizedPhone);
  if (!rowResult.ok) return { ok: false as const, reason: "database_error" as const, error: rowResult.error };
  if (rowResult.missingTable) return { ok: true as const, failedAttempts: 0 };

  const now = new Date();
  const previousAttempts = rowResult.row?.sequential_failed_attempts ?? 0;
  const failedAttempts = previousAttempts + 1;
  const hardLocked = failedAttempts >= ADMIN_AUTH_HARD_LOCK_FAILED_ATTEMPTS;
  const lockedUntil = hardLocked
    ? null
    : failedAttempts >= ADMIN_AUTH_TEMP_LOCK_FAILED_ATTEMPTS
      ? new Date(now.getTime() + ADMIN_AUTH_TEMP_LOCK_MINUTES * 60_000).toISOString()
      : null;
  const nextAlertLevel = hardLocked
    ? ADMIN_AUTH_HARD_LOCK_FAILED_ATTEMPTS
    : failedAttempts >= ADMIN_AUTH_TEMP_LOCK_FAILED_ATTEMPTS
      ? ADMIN_AUTH_TEMP_LOCK_FAILED_ATTEMPTS
      : 0;
  const previousAlertLevel = rowResult.row?.alert_level ?? 0;
  const shouldAlert = nextAlertLevel > previousAlertLevel;

  const supabase = getSupabaseAdmin();
  const { error } = await supabase
    .from("admin_auth_attempts")
    .upsert({
      phone: normalizedPhone,
      sequential_failed_attempts: failedAttempts,
      locked_until: lockedUntil,
      hard_locked_at: hardLocked ? now.toISOString() : null,
      alert_level: Math.max(previousAlertLevel, nextAlertLevel),
      last_failed_at: now.toISOString(),
      last_source_hash: hashAdminAuthSource(sourceIdentifier),
      unlocked_at: null,
      unlocked_by_admin_user_id: null,
    }, { onConflict: "phone" });

  if (error) return { ok: false as const, reason: "database_error" as const, error };

  return {
    ok: true as const,
    failedAttempts,
    temporaryLocked: Boolean(lockedUntil),
    hardLocked,
    retryAfterMinutes: lockedUntil ? minutesUntil(lockedUntil) : null,
    alertPhone: shouldAlert ? await getAdminAuthAlertPhone(normalizedPhone) : null,
    alertLevel: shouldAlert ? nextAlertLevel : null,
  };
}

export async function recordAdminAuthSuccess(phone: string) {
  const normalizedPhone = normalizeAdminPhone(phone);
  if (!normalizedPhone) return { ok: false as const, reason: "invalid_phone" as const };

  const supabase = getSupabaseAdmin();
  const { error } = await supabase
    .from("admin_auth_attempts")
    .upsert({
      phone: normalizedPhone,
      sequential_failed_attempts: 0,
      locked_until: null,
      hard_locked_at: null,
      alert_level: 0,
      last_success_at: new Date().toISOString(),
      unlocked_at: null,
      unlocked_by_admin_user_id: null,
    }, { onConflict: "phone" });

  if (isMissingAdminAuthAttemptsTable(error)) return { ok: true as const };
  if (error) return { ok: false as const, reason: "database_error" as const, error };

  return { ok: true as const };
}

export function hasAdminPermission(role: AdminRole, permission: AdminPermission) {
  return getAdminPermissions(role).includes(permission);
}

export function canAccessAdminArea(role: AdminRole, permission: AdminPermission) {
  return hasAdminPermission(role, permission);
}

export function getAdminMenuOptions(role: AdminRole) {
  const permissions = getAdminPermissions(role);
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

function formatOptionLine(option: number | string, label: string) {
  const normalizedLabel =
    label.length > 0
      ? label.charAt(0).toLocaleLowerCase("pt-BR") + label.slice(1)
      : label;

  return `Digite ${option} para ${normalizedLabel}`;
}

export function formatAdminMenu(role: AdminRole) {
  return [
    "Acesso administrativo liberado.",
    `Perfil: ${getAdminProfileLabel(role)}`,
    "",
    "*MENU ADMIN*",
    "",
    ...getAdminMenuOptions(role).map(
      (option) => formatOptionLine(option.option, option.label),
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
    .maybeSingle<Omit<AdminUser, "role"> & { role: string }>();

  if (error) {
    return {
      ok: false as const,
      reason: "database_error" as const,
      error,
    };
  }

  return {
    ok: true as const,
      adminUser: adminUser && isAdminRole(adminUser.role) ? { ...adminUser, role: adminUser.role } : null,
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
