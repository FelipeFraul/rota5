import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

const PREFIX = "TEST_SYSTEM_CLOSURE";
const TEST_PHONE_ACTIVE_NO_HASH = "559981399001";
const TEST_PHONE_ACTIVE_HASH = "559981399002";
const TEST_PHONE_DISABLED_NO_HASH = "559981399003";
const TEST_HASH =
  "pbkdf2_sha256$210000$00000000000000000000000000000000$1111111111111111111111111111111111111111111111111111111111111111";
const ALLOWED_EXAMPLE_VALUES = new Map([
  ["PAYMENT_PROVIDER", "mercado_pago"],
  ["ADMIN_SESSION_TTL_MINUTES", "60"],
  ["GATE_SESSION_TTL_MINUTES", "480"],
]);

function parseEnvFile(path) {
  const env = {};
  const raw = readFileSync(path, "utf8");
  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#") || !trimmed.includes("=")) continue;
    const index = trimmed.indexOf("=");
    const key = trimmed.slice(0, index).trim();
    let value = trimmed.slice(index + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    env[key] = value;
  }
  return env;
}

function assert(condition, label, detail) {
  if (!condition) throw new Error(`${label}${detail ? `: ${detail}` : ""}`);
  console.log(`ok - ${label}`);
}

function command(args, options = {}) {
  try {
    return execFileSync(args[0], args.slice(1), {
      cwd: process.cwd(),
      encoding: "utf8",
    }).trim();
  } catch (error) {
    if (options.allowNoMatch && error.status === 1) return "";
    throw error;
  }
}

const env = { ...process.env, ...parseEnvFile(".env") };
const anonKey = env.SUPABASE_ANON_KEY || env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
for (const key of ["SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY"]) {
  assert(Boolean(env[key]), `env local contém ${key}`);
}
assert(Boolean(anonKey), "env local contém SUPABASE_ANON_KEY");

const service = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});
const anon = createClient(env.SUPABASE_URL, anonKey, {
  auth: { persistSession: false },
});

async function cleanupAdminConstraintTemps() {
  const phones = [TEST_PHONE_ACTIVE_NO_HASH, TEST_PHONE_ACTIVE_HASH, TEST_PHONE_DISABLED_NO_HASH];
  const { data } = await service.from("admin_users").select("id").in("phone", phones);
  const ids = (data ?? []).map((row) => row.id);
  if (ids.length) await service.from("admin_sessions").delete().in("admin_user_id", ids);
  if (ids.length) await service.from("admin_users").delete().in("id", ids);
}

async function assertRpcPermissions(name, args, serviceErrorPattern) {
  const anonResult = await anon.rpc(name, args);
  assert(Boolean(anonResult.error), `anon não executa ${name}`);
  const serviceResult = await service.rpc(name, args);
  assert(Boolean(serviceResult.error), `service_role alcança ${name}`);
  assert(
    serviceErrorPattern.test(serviceResult.error.message),
    `service_role recebe erro funcional de ${name}`,
    serviceResult.error.message,
  );
}

async function assertRpcServiceRejectsNoop(name, args, serviceErrorPattern) {
  const anonResult = await anon.rpc(name, args);
  assert(Boolean(anonResult.error), `anon não executa ${name}`);
  const serviceResult = await service.rpc(name, args);
  assert(Boolean(serviceResult.error), `service_role alcança ${name} sem mutação`);
  assert(
    serviceErrorPattern.test(serviceResult.error.message),
    `service_role recebe erro funcional sem mutação de ${name}`,
    serviceResult.error.message,
  );
}

async function main() {
  const trackedEnv = command(["git", "ls-files", ".env", ".env.local", ".env.production", ".vercel", ".env.example"])
    .split(/\r?\n/)
    .filter(Boolean);
  assert(trackedEnv.length === 1 && trackedEnv[0] === ".env.example", "somente .env.example está versionado");

  const example = readFileSync(".env.example", "utf8");
  const suspiciousExampleValues = example
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => {
      if (!line || line.startsWith("#") || !/=.+/.test(line)) return false;
      const [key, ...valueParts] = line.split("=");
      return ALLOWED_EXAMPLE_VALUES.get(key) !== valueParts.join("=");
    });
  assert(suspiciousExampleValues.length === 0, ".env.example não contém valores preenchidos");

  const serviceRoleRefs = command(["rg", "-n", "SUPABASE_SERVICE_ROLE_KEY", "src"]);
  assert(
    serviceRoleRefs.split(/\r?\n/).every((line) =>
      line.includes("src/lib/env.ts") || line.includes("src/lib/supabase/admin.ts"),
    ),
    "SUPABASE_SERVICE_ROLE_KEY só aparece em env/admin server-side",
  );

  const noAdminFallback = command(["rg", "-n", "ADMIN_AUTH_SECRET_HASH", "src", ".env.example"], {
    allowNoMatch: true,
  });
  assert(noAdminFallback === "", "ADMIN_AUTH_SECRET_HASH ausente do runtime e .env.example");

  await cleanupAdminConstraintTemps();
  const activeNoHash = await service.from("admin_users").insert({
    phone: TEST_PHONE_ACTIVE_NO_HASH,
    role: "admin",
    status: "active",
    name: `${PREFIX} active no hash`,
    passphrase_hash: null,
  });
  assert(Boolean(activeNoHash.error), "constraint bloqueia admin active sem hash");

  const activeWithHash = await service.from("admin_users").insert({
    phone: TEST_PHONE_ACTIVE_HASH,
    role: "admin",
    status: "active",
    name: `${PREFIX} active hash`,
    passphrase_hash: TEST_HASH,
  });
  assert(!activeWithHash.error, "constraint permite admin active com hash", activeWithHash.error?.message);

  const disabled = await service
    .from("admin_users")
    .insert({
      phone: TEST_PHONE_DISABLED_NO_HASH,
      role: "admin",
      status: "disabled",
      name: `${PREFIX} disabled no hash`,
      passphrase_hash: null,
    })
    .select("id")
    .single();
  assert(!disabled.error, "constraint permite admin disabled sem hash", disabled.error?.message);
  const activate = await service.from("admin_users").update({ status: "active" }).eq("id", disabled.data.id);
  assert(Boolean(activate.error), "constraint bloqueia ativar admin sem hash");
  await cleanupAdminConstraintTemps();

  const { count: activeWithoutHash, error: countError } = await service
    .from("admin_users")
    .select("id", { count: "exact", head: true })
    .eq("status", "active")
    .is("passphrase_hash", null);
  assert(!countError && activeWithoutHash === 0, "zero admins active com passphrase_hash null");

  const { data: roots, error: rootError } = await service
    .from("admin_users")
    .select("role, status, passphrase_hash")
    .eq("role", "root")
    .eq("status", "active");
  assert(
    !rootError &&
      (roots ?? []).some((root) => root.passphrase_hash?.startsWith("pbkdf2_sha256$")),
    "há Diretor/root active com hash PBKDF2",
    rootError?.message,
  );

  await assertRpcPermissions("reserve_seats", {
    p_customer_id: null,
    p_conversation_id: null,
    p_session_id: null,
    p_seat_ids: null,
    p_ticket_type: null,
    p_ttl_minutes: 10,
  }, /customer_id_required|permission denied/i);
  await assertRpcServiceRejectsNoop("expire_reservations", { p_limit: 0 }, /limit_must_be_positive/i);
  await assertRpcPermissions("confirm_paid_ticket_order", {
    p_order_id: null,
    p_provider: null,
    p_provider_payment_id: null,
    p_amount_cents: null,
    p_paid_at: null,
    p_raw_metadata: {},
  }, /order_id_required|permission denied/i);
  await assertRpcPermissions("validate_ticket_entry", {
    p_ticket_id: null,
    p_ticket_code: null,
    p_gate_session_id: null,
    p_gate_label: null,
    p_validator_identifier: null,
    p_metadata: {},
  }, /ticket_id_required|permission denied/i);
  await assertRpcPermissions("cancel_pending_reservation", {
    p_reservation_id: null,
    p_customer_id: null,
    p_reason: null,
  }, /reservation_id_required|permission denied/i);
  await assertRpcPermissions("issue_courtesy_order", {
    p_order_id: null,
    p_issued_by_admin_user_id: null,
    p_issued_by_admin_phone: null,
    p_beneficiary_name: null,
    p_reason: null,
  }, /order_id_required|permission denied/i);

  const residueChecks = [
    service.from("events").select("id", { count: "exact", head: true }).ilike("title", `${PREFIX}%`),
    service.from("admin_users").select("id", { count: "exact", head: true }).like("name", `${PREFIX}%`),
  ];
  const residues = await Promise.all(residueChecks);
  residues.forEach(({ count, error }, index) => {
    assert(!error && count === 0, `sem resíduo ${PREFIX} ${index + 1}`, error?.message ?? `count=${count}`);
  });
}

main().catch(async (error) => {
  console.error(error);
  await cleanupAdminConstraintTemps();
  process.exit(1);
});
