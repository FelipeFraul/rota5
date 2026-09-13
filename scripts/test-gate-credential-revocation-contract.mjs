import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";

const expandMigrationPath = new URL(
  "../supabase/migrations/20260912000100_gate_credential_session_revocation_expand.sql",
  import.meta.url,
);
const contractMigrationPath = new URL(
  "../supabase/rollout/gate_credential_session_revocation_contract.sql",
  import.meta.url,
);
const gateSessionsPath = new URL("../src/lib/tickets/services/gateSessions.ts", import.meta.url);
const gateAccessesPath = new URL("../src/lib/tickets/services/gateAccesses.ts", import.meta.url);
const fixedAccessesPath = new URL("../src/lib/tickets/services/fixedGateAccesses.ts", import.meta.url);
const routerPath = new URL("../src/lib/tickets/router.ts", import.meta.url);
const gateValidationPath = new URL("../src/lib/tickets/services/gateValidation.ts", import.meta.url);
const comboRedemptionsPath = new URL("../src/lib/tickets/services/comboRedemptions.ts", import.meta.url);

async function sources() {
  const [expand, contract, sessions, temporary, fixed, router, gateValidation, combo] = await Promise.all([
    readFile(expandMigrationPath, "utf8"),
    readFile(contractMigrationPath, "utf8"),
    readFile(gateSessionsPath, "utf8"),
    readFile(gateAccessesPath, "utf8"),
    readFile(fixedAccessesPath, "utf8"),
    readFile(routerPath, "utf8"),
    readFile(gateValidationPath, "utf8"),
    readFile(comboRedemptionsPath, "utf8"),
  ]);
  return { expand, contract, migration: `${expand}\n${contract}`, sessions, temporary, fixed, router, gateValidation, combo };
}

test("temporary credentials are linked and revoked through one database operation", async () => {
  const { migration, temporary } = await sources();
  assert.match(temporary, /source: \{ kind: "temporary_gate_access", gateAccessId: data\.id \}/);
  assert.match(temporary, /pause_gate_access_and_revoke_sessions/);
  assert.match(migration, /source_gate_access_id uuid null references public\.gate_accesses/);
  assert.match(migration, /revoke_linked_gate_sessions_on_credential_change/);
  assert.match(migration, /source_gate_access_id = v_access\.id and status = 'active'/);
});

test("fixed credentials are linked and revoked through one database operation", async () => {
  const { migration, fixed } = await sources();
  assert.match(fixed, /source: \{ kind: "fixed_gate_access", fixedGateAccessId: access\.id \}/);
  assert.match(fixed, /revoke_fixed_gate_access_and_revoke_sessions/);
  assert.match(migration, /source_fixed_gate_access_id uuid null references public\.fixed_gate_accesses/);
  assert.match(migration, /revoke_linked_gate_sessions_on_credential_change/);
  assert.match(migration, /source_fixed_gate_access_id = v_access\.id and status = 'active'/);
});

test("direct and legacy sessions have distinct, fail-safe source classifications", async () => {
  const { expand, contract, migration, sessions } = await sources();
  assert.match(sessions, /\{ kind: "admin_direct" \}/);
  assert.match(migration, /'legacy_unattributed', 'admin_direct', 'temporary_gate_access', 'fixed_gate_access'/);
  assert.match(migration, /legacy_gate_session_requires_reissue/);
  assert.match(migration, /gate_sessions_source_reference_check/);
  assert.doesNotMatch(migration, /source_kind text not null default 'legacy_unattributed'/);
  assert.doesNotMatch(migration, /alter column source_kind set default/);
  assert.match(migration, /alter column source_kind set not null/);
  assert.doesNotMatch(expand, /alter column source_kind set not null/);
  assert.match(expand, /source_kind is null and source_gate_access_id is null/);
  assert.ok(contract.indexOf("set source_kind = 'legacy_unattributed'") < contract.indexOf("alter column source_kind set not null"));
  assert.ok(contract.indexOf("alter column source_kind set not null") < contract.indexOf("create trigger prevent_gate_session_source_change"));
});

test("expand is dual-mode, observable, and never falls back after strict input", async () => {
  const { expand } = await sources();
  assert.match(expand, /p_metadata \? 'gate_session_token_hash'/);
  assert.match(expand, /v_authorization_mode := 'strict'/);
  assert.match(expand, /v_authorization_mode := 'legacy_compat'/);
  assert.match(expand, /jsonb_build_object\('authorization_mode', v_authorization_mode\)/);
  assert.match(expand, /transition_legacy_gate_session_requires_reissue/);
  assert.match(expand, /gate_session_source_rollout_status/);
  assert.match(expand, /revoke_linked_gate_sessions_on_credential_change/);
});

test("contract removes legacy compatibility and enforces final source invariants", async () => {
  const { contract } = await sources();
  assert.match(contract, /^-- DRAFT - DO NOT APPLY DIRECTLY\./);
  assert.doesNotMatch(contract, /v_authorization_mode := 'legacy_compat'/);
  assert.match(contract, /alter column source_kind set not null/);
  assert.match(contract, /set status = 'revoked'[\s\S]*source_kind is null/);
  assert.match(contract, /legacy_gate_session_requires_reissue/);
  assert.match(contract, /jsonb_build_object\('authorization_mode', 'strict'\)/);
});

test("all new-row creation callers provide an explicit source and renewal preserves it", async () => {
  const { temporary, fixed, router, sessions } = await sources();
  assert.equal((temporary.match(/createGateSession\(\{/g) ?? []).length, 1);
  assert.equal((fixed.match(/createGateSession\(\{/g) ?? []).length, 1);
  assert.equal((router.match(/createGateSession\(\{/g) ?? []).length, 3);
  assert.equal((router.match(/source: \{ kind: "admin_direct" \}/g) ?? []).length, 3);
  assert.match(temporary, /source: \{ kind: "temporary_gate_access"/);
  assert.match(fixed, /source: \{ kind: "fixed_gate_access"/);
  assert.match(sessions, /createGateSessionForRegisteredValidator[\s\S]*\.update\(\{[\s\S]*token_hash: tokenHash[\s\S]*expires_at: expiresAt/);
  assert.doesNotMatch(sessions, /createGateSessionForRegisteredValidator[\s\S]*source_kind:\s*"admin_direct"/);
});

test("ticket and combo mutations authorize while holding credential then session locks", async () => {
  const { migration } = await sources();
  assert.match(migration, /source credential row, then gate_sessions row, then the ticket\/combo row/);
  assert.match(migration, /from public\.gate_accesses[\s\S]*for update[\s\S]*from public\.gate_sessions[\s\S]*for update/);
  assert.match(migration, /p_metadata->>'gate_session_token_hash'/);
  assert.match(migration, /v_gate_session := public\.lock_authorized_gate_session\(p_kitchen_session_id, 'kitchen'/);
  assert.match(migration, /reader_device_binding_hash/);
});

test("ticket token and kitchen reader bindings are revalidated in database", async () => {
  const { migration, gateValidation, combo } = await sources();
  assert.match(gateValidation, /gate_session_token_hash: hashGateSessionToken\(input\.gateSessionToken\)/);
  assert.match(combo, /gate_session_token_hash: hashGateSessionToken\(input\.kitchenSessionToken\)/);
  assert.match(combo, /kitchen_device_binding_hash:[\s\S]*hashKitchenDeviceToken\(input\.deviceToken\)/);
  assert.match(migration, /v_session\.token_hash <> p_gate_session_token_hash/);
  assert.match(migration, /v_session\.reader_device_binding_hash <> p_kitchen_device_binding_hash/);
  assert.match(migration, /p_metadata - 'gate_session_token_hash'/);
});

test("RPC contracts and permission boundaries preserve existing behavior", async () => {
  const { migration } = await sources();
  for (const result of ["not_found", "wrong_event", "wrong_session", "allowed", "already_used", "cancelled", "denied", "awaiting_preparation"]) {
    assert.match(migration, new RegExp(`'${result}'`));
  }
  assert.match(migration, /validate_ticket_entry\([\s\S]*p_metadata jsonb default '\{\}'::jsonb/);
  assert.match(migration, /validate_combo_redemption\([\s\S]*p_session_id uuid default null, p_metadata jsonb default '\{\}'::jsonb/);
  assert.match(migration, /validate_ticket_entry[\s\S]*security invoker/);
  assert.match(migration, /validate_combo_redemption[\s\S]*security definer/);
  assert.match(migration, /from public, anon, authenticated/);
  assert.match(migration, /grant execute on function public\.lock_authorized_gate_session[\s\S]*to service_role/);
});

test("database mutation authorization remains independent of TypeScript validation", async () => {
  const { migration, sessions } = await sources();
  assert.match(sessions, /Protected mutations repeat the[\s\S]*PostgreSQL row locks/);
  assert.match(migration, /create or replace function public\.validate_ticket_entry/);
  assert.match(migration, /create or replace function public\.validate_combo_redemption/);
  assert.match(migration, /lock_authorized_gate_session/);
});
