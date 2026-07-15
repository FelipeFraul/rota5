import "server-only";

import {
  createHash,
  createHmac,
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
const ADMIN_EVENT_EDITOR_DIRECT_LINK_TTL_MINUTES = 5;
const ADMIN_EVENT_EDITOR_DIRECT_TOKEN_PREFIX = "event_editor_";
const ADMIN_LOGIN_CODE_TTL_MINUTES = 2;
const ADMIN_LOGIN_CODE_ATTEMPTS = 3;
const ADMIN_WEB_SESSION_COOKIE = "admin_web_session";
const ADMIN_WEB_CSRF_COOKIE = "admin_web_csrf";
const ADMIN_WEB_SESSION_TTL_MINUTES = 240;

export type AdminRole = "root" | "admin" | "operator";
export type AdminPermission =
  | "manage_admins"
  | "manage_events"
  | "manage_tickets"
  | "manage_courtesies"
  | "manage_offers"
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

export type AdminWebSession = AdminSession & {
  adminUser: AdminUser;
  csrfToken: string;
};

export const ADMIN_WEB_AUTH_COOKIES = {
  session: ADMIN_WEB_SESSION_COOKIE,
  csrf: ADMIN_WEB_CSRF_COOKIE,
} as const;

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
    "manage_offers",
    "manage_gate",
    "view_reports",
  ],
  admin: [
    "manage_events",
    "manage_tickets",
    "manage_courtesies",
    "manage_offers",
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

function getSessionTtlMinutes() {
  const rawValue = process.env.ADMIN_SESSION_TTL_MINUTES;

  if (!rawValue) {
    return ADMIN_SESSION_DEFAULT_TTL_MINUTES;
  }

  const ttl = Number(rawValue);

  return Number.isInteger(ttl) && ttl > 0 ? ttl : ADMIN_SESSION_DEFAULT_TTL_MINUTES;
}

function getWebSessionTtlMinutes() {
  const ttl = Number(process.env.ADMIN_WEB_SESSION_TTL_MINUTES);

  return Number.isInteger(ttl) && ttl > 0 ? ttl : ADMIN_WEB_SESSION_TTL_MINUTES;
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
    eventEditorUrl: getAdminEventEditorOpenUrl(token),
    expiresAt: data.expires_at,
    expiresInMinutes: ADMIN_LOGIN_LINK_TTL_MINUTES,
  };
}

export async function getAdminLoginChallengeByToken(token: string) {
  const normalizedToken = token.trim();

  if (!normalizedToken || normalizedToken.startsWith(ADMIN_EVENT_EDITOR_DIRECT_TOKEN_PREFIX)) {
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
  consumeOnPassphrase = false,
}: {
  token: string;
  passphrase: string;
  sourceIdentifier?: string | null;
  consumeOnPassphrase?: boolean;
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

  if (consumeOnPassphrase) {
    const now = new Date().toISOString();
    const { data: consumedChallenge, error: consumeError } = await supabase
      .from("admin_login_challenges")
      .update({
        return_code_hash: null,
        status: "consumed",
        password_verified_at: now,
        consumed_at: now,
        code_expires_at: null,
        source_hash: hashAdminAuthSource(sourceIdentifier),
      })
      .eq("id", challenge.id)
      .eq("status", "pending")
      .select("id")
      .maybeSingle<{ id: string }>();

    if (consumeError) {
      return { ok: false as const, reason: "database_error" as const, error: consumeError };
    }

    if (!consumedChallenge) {
      return { ok: false as const, reason: "not_pending" as const };
    }

    await recordAdminAuthSuccess(challenge.phone);

    return {
      ok: true as const,
      code: null,
      codeExpiresAt: null,
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

export async function consumeAdminLoginChallengeForEventEditor({
  token,
  sourceIdentifier,
}: {
  token: string;
  sourceIdentifier?: string | null;
}) {
  const challengeResult = await getAdminLoginChallengeByToken(token);

  if (!challengeResult.ok) return challengeResult;

  const challenge = challengeResult.challenge;

  if (challenge.status !== "pending") {
    return { ok: false as const, reason: "not_pending" as const };
  }

  const supabase = getSupabaseAdmin();
  const { data: adminUser, error } = await supabase
    .from("admin_users")
    .select("id, phone, role, status, name, last_login_at, courtesy_send_limit, courtesy_receive_limit")
    .eq("id", challenge.admin_user_id)
    .eq("phone", challenge.phone)
    .maybeSingle<Omit<AdminUser, "role"> & { role: string }>();

  if (error) return { ok: false as const, reason: "database_error" as const, error };

  if (!adminUser || !isAdminRole(adminUser.role) || adminUser.status !== "active") {
    return { ok: false as const, reason: "admin_unavailable" as const };
  }

  const now = new Date().toISOString();
  const { data: consumedChallenge, error: consumeError } = await supabase
    .from("admin_login_challenges")
    .update({
      return_code_hash: null,
      status: "consumed",
      consumed_at: now,
      code_expires_at: null,
      source_hash: hashAdminAuthSource(sourceIdentifier),
    })
    .eq("id", challenge.id)
    .eq("status", "pending")
    .select("id")
    .maybeSingle<{ id: string }>();

  if (consumeError) {
    return { ok: false as const, reason: "database_error" as const, error: consumeError };
  }

  if (!consumedChallenge) {
    return { ok: false as const, reason: "not_pending" as const };
  }

  return {
    ok: true as const,
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

export async function createAdminEventEditorDirectLink(adminUser: AdminUser) {
  const normalizedPhone = normalizeAdminPhone(adminUser.phone);

  if (!normalizedPhone || adminUser.status !== "active") {
    return { ok: false as const, reason: "invalid_admin" as const };
  }

  if (!getAdminWebSessionSecret()) {
    return { ok: false as const, reason: "missing_web_session_secret" as const };
  }

  const token = `${ADMIN_EVENT_EDITOR_DIRECT_TOKEN_PREFIX}${randomBytes(32).toString("hex")}`;
  const expiresAt = new Date(
    Date.now() + ADMIN_EVENT_EDITOR_DIRECT_LINK_TTL_MINUTES * 60_000,
  ).toISOString();
  const supabase = getSupabaseAdmin();

  const { error: revokeError } = await supabase
    .from("admin_login_challenges")
    .update({ status: "revoked" })
    .eq("phone", normalizedPhone)
    .in("status", ["pending", "password_verified"]);

  if (isMissingAdminLoginChallengesTable(revokeError)) {
    return { ok: false as const, reason: "missing_migration" as const };
  }

  if (revokeError) {
    return { ok: false as const, reason: "database_error" as const, error: revokeError };
  }

  const { error } = await supabase
    .from("admin_login_challenges")
    .insert({
      admin_user_id: adminUser.id,
      phone: normalizedPhone,
      link_token_hash: hashAdminLoginSecret(token),
      status: "pending",
      expires_at: expiresAt,
    });

  if (isMissingAdminLoginChallengesTable(error)) {
    return { ok: false as const, reason: "missing_migration" as const };
  }

  if (error) {
    return { ok: false as const, reason: "database_error" as const, error };
  }

  return {
    ok: true as const,
    url: `${getEnv().APP_BASE_URL.replace(/\/$/, "")}/admin/eventos/abrir/${encodeURIComponent(token)}`,
    expiresAt,
    expiresInMinutes: ADMIN_EVENT_EDITOR_DIRECT_LINK_TTL_MINUTES,
  };
}

export async function verifyAdminEventEditorDirectToken(token: string) {
  const normalizedToken = token.trim();

  if (
    !normalizedToken.startsWith(ADMIN_EVENT_EDITOR_DIRECT_TOKEN_PREFIX) ||
    !/^event_editor_[a-f0-9]{64}$/.test(normalizedToken)
  ) {
    return { ok: false as const, reason: "invalid_token" as const };
  }

  const supabase = getSupabaseAdmin();
  const { data: challenge, error } = await supabase
    .from("admin_login_challenges")
    .select("id, admin_user_id, phone, status, expires_at")
    .eq("link_token_hash", hashAdminLoginSecret(normalizedToken))
    .maybeSingle<Pick<AdminLoginChallengeRow, "id" | "admin_user_id" | "phone" | "status" | "expires_at">>();

  if (isMissingAdminLoginChallengesTable(error)) {
    return { ok: false as const, reason: "missing_migration" as const };
  }

  if (error) return { ok: false as const, reason: "database_error" as const, error };
  if (!challenge) return { ok: false as const, reason: "not_found" as const };
  if (challenge.status !== "pending") {
    return { ok: false as const, reason: "already_consumed" as const };
  }

  if (new Date(challenge.expires_at).getTime() <= Date.now()) {
    await supabase
      .from("admin_login_challenges")
      .update({ status: "expired" })
      .eq("id", challenge.id)
      .eq("status", "pending");
    return { ok: false as const, reason: "expired" as const };
  }

  const adminUserResult = await getAdminUserByPhone(challenge.phone);

  if (!adminUserResult.ok) return adminUserResult;

  if (
    !adminUserResult.adminUser ||
    adminUserResult.adminUser.id !== challenge.admin_user_id ||
    adminUserResult.adminUser.status !== "active"
  ) {
    return { ok: false as const, reason: "admin_unavailable" as const };
  }

  const now = new Date().toISOString();
  const { data: consumedChallenge, error: consumeError } = await supabase
    .from("admin_login_challenges")
    .update({
      status: "consumed",
      consumed_at: now,
    })
    .eq("id", challenge.id)
    .eq("status", "pending")
    .gt("expires_at", now)
    .select("id")
    .maybeSingle<{ id: string }>();

  if (consumeError) {
    return { ok: false as const, reason: "database_error" as const, error: consumeError };
  }

  if (!consumedChallenge) {
    return { ok: false as const, reason: "already_consumed" as const };
  }

  return {
    ok: true as const,
    adminUser: adminUserResult.adminUser,
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

  if (code !== normalizedCode || !/^\d{6}$/.test(normalizedCode)) {
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

function getAdminWebSessionSecret() {
  return process.env.CHECKOUT_INTERNAL_SECRET?.trim() || null;
}

function signAdminWebSessionPayload(payload: string, secret: string) {
  return createHmac("sha256", secret)
    .update(payload)
    .digest("base64url");
}

function encodeAdminWebSessionCookie(payload: {
  sessionId: string;
  adminUserId: string;
  phone: string;
  expiresAt: string;
  csrfToken: string;
}) {
  const secret = getAdminWebSessionSecret();
  if (!secret) return null;

  const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const signature = signAdminWebSessionPayload(body, secret);

  return `${body}.${signature}`;
}

function decodeAdminWebSessionCookie(value: string | null | undefined) {
  if (!value) return null;
  const secret = getAdminWebSessionSecret();
  if (!secret) return null;

  const [body, signature] = value.split(".");
  if (!body || !signature) return null;
  if (!fixedTimeEqual(signAdminWebSessionPayload(body, secret), signature)) return null;

  try {
    const parsed = JSON.parse(Buffer.from(body, "base64url").toString("utf8")) as {
      sessionId?: unknown;
      adminUserId?: unknown;
      phone?: unknown;
      expiresAt?: unknown;
      csrfToken?: unknown;
    };

    if (
      typeof parsed.sessionId !== "string" ||
      typeof parsed.adminUserId !== "string" ||
      typeof parsed.phone !== "string" ||
      typeof parsed.expiresAt !== "string" ||
      typeof parsed.csrfToken !== "string"
    ) {
      return null;
    }

    return {
      sessionId: parsed.sessionId,
      adminUserId: parsed.adminUserId,
      phone: parsed.phone,
      expiresAt: parsed.expiresAt,
      csrfToken: parsed.csrfToken,
    };
  } catch {
    return null;
  }
}

function generateAdminReturnCode() {
  return randomInt(0, 1_000_000).toString().padStart(6, "0");
}

function getAdminLoginUrl(token: string) {
  return `${getEnv().APP_BASE_URL.replace(/\/$/, "")}/admin/login/${encodeURIComponent(token)}`;
}

function getAdminEventEditorOpenUrl(token: string) {
  return `${getEnv().APP_BASE_URL.replace(/\/$/, "")}/admin/eventos/abrir/${encodeURIComponent(token)}`;
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

function maskAdminAuthPhone(value: string | null | undefined) {
  const digits = normalizeAdminPhone(value) ?? value?.replace(/\D/g, "") ?? "";

  if (!digits) return null;
  if (digits.length <= 4) return digits;

  return `${"*".repeat(Math.max(0, digits.length - 4))}${digits.slice(-4)}`;
}

export async function requireAdminPermission({
  phone,
  sessionId,
  adminUserId,
  permission,
  operation,
}: {
  phone: string;
  sessionId: string | null | undefined;
  adminUserId: string | null | undefined;
  permission: AdminPermission;
  operation: string;
}) {
  const sessionResult = await getActiveAdminSession(phone);
  const adminUserResult = await getAdminUserByPhone(phone);
  const adminSession = sessionResult.ok ? sessionResult.adminSession : null;
  const adminUser = adminUserResult.ok ? adminUserResult.adminUser : null;
  const allowed =
    Boolean(adminSession) &&
    adminSession?.id === sessionId &&
    adminSession?.admin_user_id === adminUserId &&
    Boolean(adminUser) &&
    adminUser?.id === adminUserId &&
    adminUser?.status === "active" &&
    hasAdminPermission(adminUser.role, permission);

  if (!allowed) {
    logWarn("Blocked stale or unauthorized admin operation", {
      operation,
      permission,
      adminUserId,
      adminPhone: maskAdminAuthPhone(phone),
      contextSessionId: sessionId ?? null,
      reloadedSessionId: adminSession?.id ?? null,
      reloadedSessionAdminUserId: adminSession?.admin_user_id ?? null,
      reloadedAdminUserId: adminUser?.id ?? null,
      reloadedRole: adminUser?.role ?? null,
      reloadedStatus: adminUser?.status ?? null,
    });

    return {
      ok: false as const,
      reason: "unauthorized" as const,
      adminSession,
      adminUser,
    };
  }

  return {
    ok: true as const,
    adminSession,
    adminUser,
  };
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
      label: "Editar eventos no navegador",
      permission: "manage_events" satisfies AdminPermission,
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
      label: "Cozinha",
      permission: "manage_gate" satisfies AdminPermission,
    },
    {
      option: 6,
      label: "Ofertas e combos",
      permission: "manage_offers" satisfies AdminPermission,
    },
    {
      option: 7,
      label: "Administradores",
      permission: "manage_admins" satisfies AdminPermission,
    },
    {
      option: 8,
      label: "Relatórios",
      permission: "view_reports" satisfies AdminPermission,
    },
  ];

  return options.filter((option) => permissions.includes(option.permission));
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

export async function createAdminWebSession(adminUser: AdminUser) {
  const normalizedPhone = normalizeAdminPhone(adminUser.phone);

  if (!normalizedPhone) {
    return {
      ok: false as const,
      reason: "invalid_phone" as const,
    };
  }

  const now = new Date();
  const expiresAt = new Date(
    now.getTime() + getWebSessionTtlMinutes() * 60 * 1000,
  ).toISOString();
  const csrfToken = randomBytes(24).toString("base64url");
  const supabase = getSupabaseAdmin();

  if (!getAdminWebSessionSecret()) {
    return {
      ok: false as const,
      reason: "missing_web_session_secret" as const,
    };
  }

  const { data: adminSession, error } = await supabase
    .from("admin_sessions")
    .insert({
      admin_user_id: adminUser.id,
      phone: normalizedPhone,
      status: "active",
      expires_at: expiresAt,
      metadata: {
        source: "web",
        purpose: "event_editor",
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
    csrfToken,
    cookieValue: encodeAdminWebSessionCookie({
      sessionId: adminSession.id,
      adminUserId: adminUser.id,
      phone: normalizedPhone,
      expiresAt,
      csrfToken,
    })!,
    csrfCookieValue: csrfToken,
    expiresAt,
  };
}

export async function getAdminWebSessionFromCookie(cookieValue: string | null | undefined) {
  const cookie = decodeAdminWebSessionCookie(cookieValue);

  if (!cookie || new Date(cookie.expiresAt).getTime() <= Date.now()) {
    return { ok: true as const, adminWebSession: null };
  }

  const supabase = getSupabaseAdmin();
  const { data: adminSession, error: sessionError } = await supabase
    .from("admin_sessions")
    .select("id, admin_user_id, phone, status, expires_at, created_at, last_used_at, metadata")
    .eq("id", cookie.sessionId)
    .eq("admin_user_id", cookie.adminUserId)
    .eq("phone", cookie.phone)
    .eq("status", "active")
    .gt("expires_at", new Date().toISOString())
    .maybeSingle<AdminSession & { metadata?: { source?: string } | null }>();

  if (sessionError) {
    return { ok: false as const, reason: "database_error" as const, error: sessionError };
  }

  if (!adminSession || adminSession.metadata?.source !== "web") {
    return { ok: true as const, adminWebSession: null };
  }

  const { data: adminUser, error: userError } = await supabase
    .from("admin_users")
    .select("id, phone, role, status, name, last_login_at, courtesy_send_limit, courtesy_receive_limit")
    .eq("id", adminSession.admin_user_id)
    .maybeSingle<Omit<AdminUser, "role"> & { role: string }>();

  if (userError) {
    return { ok: false as const, reason: "database_error" as const, error: userError };
  }

  if (
    !adminUser ||
    !isAdminRole(adminUser.role) ||
    adminUser.status !== "active" ||
    !hasAdminPermission(adminUser.role, "manage_events")
  ) {
    return { ok: true as const, adminWebSession: null };
  }

  await supabase
    .from("admin_sessions")
    .update({ last_used_at: new Date().toISOString() })
    .eq("id", adminSession.id);

  return {
    ok: true as const,
    adminWebSession: {
      id: adminSession.id,
      admin_user_id: adminSession.admin_user_id,
      phone: adminSession.phone,
      status: adminSession.status,
      expires_at: adminSession.expires_at,
      created_at: adminSession.created_at,
      last_used_at: adminSession.last_used_at,
      adminUser: { ...adminUser, role: adminUser.role },
      csrfToken: cookie.csrfToken,
    } satisfies AdminWebSession,
  };
}

export async function revokeAdminWebSession(sessionId: string) {
  const { error } = await getSupabaseAdmin()
    .from("admin_sessions")
    .update({
      status: "revoked",
      last_used_at: new Date().toISOString(),
    })
    .eq("id", sessionId)
    .eq("status", "active");

  return error ? { ok: false as const, error } : { ok: true as const };
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
  const { data: adminSessions, error } = await supabase
    .from("admin_sessions")
    .select("id, admin_user_id, phone, status, expires_at, created_at, last_used_at, metadata")
    .eq("phone", normalizedPhone)
    .eq("status", "active")
    .gt("expires_at", new Date().toISOString())
    .order("created_at", { ascending: false })
    .limit(5)
    .returns<Array<AdminSession & { metadata?: { source?: string } | null }>>();

  if (error) {
    return {
      ok: false as const,
      reason: "database_error" as const,
      error,
    };
  }

  const adminSession =
    (adminSessions ?? []).find((session) => session.metadata?.source !== "web") ??
    null;

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
