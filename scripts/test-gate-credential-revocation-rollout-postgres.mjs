import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { readFile } from "node:fs/promises";

const container = process.env.ROTA5_POSTGRES_TEST_CONTAINER ?? "rota5-high1-rollout-test";
const root = new URL("../", import.meta.url);

function run(command, args, { input, allowFailure = false } = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { windowsHide: true, stdio: ["pipe", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => { stdout += chunk; });
    child.stderr.on("data", (chunk) => { stderr += chunk; });
    child.on("error", reject);
    child.on("close", (code) => {
      const result = { code: code ?? -1, stdout: stdout.trim(), stderr: stderr.trim() };
      if (result.code !== 0 && !allowFailure) reject(new Error(result.stderr || result.stdout));
      else resolve(result);
    });
    if (input) child.stdin.end(input);
    else child.stdin.end();
  });
}

const docker = (args, options) => run("docker", args, options);
const psql = (database, sql, options) => docker([
  "exec", container, "psql", "-v", "ON_ERROR_STOP=1", "-U", "postgres", "-d", database, "-At", "-c", sql,
], options);
async function psqlFile(database, relativePath) {
  const sql = await readFile(new URL(relativePath, root), "utf8");
  return docker(["exec", "-i", container, "psql", "-v", "ON_ERROR_STOP=1", "-U", "postgres", "-d", database], { input: sql });
}

async function waitUntilReady() {
  for (let attempt = 0; attempt < 30; attempt += 1) {
    const result = await psql("postgres", "select 1", { allowFailure: true });
    if (result.code === 0) return;
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error("PostgreSQL container did not become ready");
}

async function createOldDatabase(database) {
  await psql("postgres", `create database ${database}`);
  await psqlFile(database, "supabase/tests/gate_credential_session_revocation_fixture.sql");
  await psqlFile(database, "supabase/migrations/20260526000700_enforce_gate_session_ticket_scope.sql");
  await psqlFile(database, "supabase/migrations/20260629000300_require_combo_preparation_before_redemption.sql");
}

async function proveOldAppOldDb() {
  await psql("old_db", `
    set role service_role;
    insert into public.events(id,title,status) values ('10000000-0000-4000-8000-000000000001','Old event','published');
    insert into public.event_sessions(id,event_id,status) values ('20000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001','scheduled');
    insert into public.gate_sessions(id,event_id,session_id,gate_label,validator_phone,token_hash,status,expires_at,created_by_admin_phone)
      values ('60000000-0000-4000-8000-000000000010','10000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000001','Portaria','5515000000010','old-token','active',now()+interval '1 hour','5515000000000');
    insert into public.tickets(id,ticket_code,status,session_id) values ('70000000-0000-4000-8000-000000000010','OLD-T','issued','20000000-0000-4000-8000-000000000001');
    insert into public.combo_redemptions(id,combo_order_id,event_id,session_id,redemption_code,offer_name,quantity,status,qr_token_hash,raw_metadata)
      values ('80000000-0000-4000-8000-000000000010','81000000-0000-4000-8000-000000000010','10000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000001','OLD-C','Combo',1,'issued','old-combo','{"kitchen_status":"preparing","ready_notified_at":"2026-09-12T10:00:00Z"}');
  `);
  const ticket = await psql("old_db", "set role service_role; select public.validate_ticket_entry('70000000-0000-4000-8000-000000000010','OLD-T','60000000-0000-4000-8000-000000000010','Portaria','old','{}'::jsonb)->>'result';");
  const combo = await psql("old_db", "set role service_role; select public.validate_combo_redemption('80000000-0000-4000-8000-000000000010','old-combo','60000000-0000-4000-8000-000000000010','Cozinha','old',null,null,'{}'::jsonb)->>'result';");
  assert.match(ticket.stdout, /allowed/);
  assert.match(combo.stdout, /allowed/);

  const newRead = await psql("old_db", "select source_kind from public.gate_sessions limit 1", { allowFailure: true });
  assert.notEqual(newRead.code, 0);
  assert.match(newRead.stderr, /column "source_kind" does not exist/);
  const newRpc = await psql("old_db", "select public.pause_gate_access_and_revoke_sessions(null,null,null)", { allowFailure: true });
  assert.notEqual(newRpc.code, 0);
  assert.match(newRpc.stderr, /function public\.pause_gate_access_and_revoke_sessions/);
}

async function proveContractRejectsOldApp() {
  const oldInsert = await psql("contract_db", `set role service_role;
    insert into public.gate_sessions(id,gate_label,validator_phone,token_hash,status,expires_at,created_by_admin_phone)
    values ('60000000-0000-4000-8000-000000000097','Portaria','5515000000097','old-after-contract','active',now()+interval '1 hour','5515000000000')`, { allowFailure: true });
  assert.notEqual(oldInsert.code, 0);
  assert.match(oldInsert.stderr, /null value in column "source_kind"/);

  const oldRpc = await psql("contract_db", "set role service_role; select public.validate_ticket_entry('70000000-0000-4000-8000-000000000001','TICKET-A','60000000-0000-4000-8000-000000000003','Portaria','old','{}'::jsonb)", { allowFailure: true });
  assert.notEqual(oldRpc.code, 0);
  assert.match(oldRpc.stderr, /gate_session_token_mismatch/);
}

await docker(["rm", "-f", container], { allowFailure: true });
try {
  await docker(["run", "--name", container, "-e", "POSTGRES_PASSWORD=postgres", "-d", "postgres:16-alpine"]);
  await waitUntilReady();
  for (const database of ["old_db", "expand_db", "contract_db"]) await createOldDatabase(database);

  await proveOldAppOldDb();

  await psqlFile("expand_db", "supabase/migrations/20260912000100_gate_credential_session_revocation_expand.sql");
  await psqlFile("expand_db", "supabase/tests/gate_credential_session_revocation_expand_test.sql");

  await psqlFile("contract_db", "supabase/migrations/20260912000100_gate_credential_session_revocation_expand.sql");
  await psqlFile("contract_db", "supabase/rollout/gate_credential_session_revocation_contract.sql");
  await psqlFile("contract_db", "supabase/tests/gate_credential_session_revocation_contract_test.sql");
  await proveContractRejectsOldApp();

  process.env.ROTA5_POSTGRES_TEST_CONTAINER = container;
  process.env.ROTA5_POSTGRES_TEST_DATABASE = "contract_db";
  await import("./test-gate-credential-revocation-postgres.mjs");

  console.log("Rollout matrix passed: OLD_APP+OLD_DB, OLD_APP+EXPAND_DB, NEW_APP+EXPAND_DB, NEW_APP+CONTRACT_DB");
  console.log("Expected incompatibilities passed: OLD_APP+CONTRACT_DB, NEW_APP+OLD_DB");
} finally {
  await docker(["rm", "-f", container], { allowFailure: true });
}
