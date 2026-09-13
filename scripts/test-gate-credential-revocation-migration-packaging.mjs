import assert from "node:assert/strict";
import test from "node:test";
import { readdir, readFile } from "node:fs/promises";

const migrationsDirectory = new URL("../supabase/migrations/", import.meta.url);
const contractDraftPath = new URL(
  "../supabase/rollout/gate_credential_session_revocation_contract.sql",
  import.meta.url,
);
const contractMigrationPath = new URL(
  "../supabase/migrations/20260913000100_gate_credential_session_revocation_contract.sql",
  import.meta.url,
);
const rolloutTestPath = new URL(
  "./test-gate-credential-revocation-rollout-postgres.mjs",
  import.meta.url,
);

test("EXPAND and exactly one materialized CONTRACT are queued as active HIGH #1 migrations", async () => {
  const active = (await readdir(migrationsDirectory))
    .filter((name) => name.includes("gate_credential_session_revocation"))
    .sort();

  assert.deepEqual(active, [
    "20260912000100_gate_credential_session_revocation_expand.sql",
    "20260913000100_gate_credential_session_revocation_contract.sql",
  ]);
  assert.equal(active.filter((name) => /contract/i.test(name)).length, 1);
});

test("CONTRACT is a protected draft outside the automatic migration queue", async () => {
  const contract = await readFile(contractDraftPath, "utf8");
  assert.match(contract, /^-- DRAFT - DO NOT APPLY DIRECTLY\./);
  assert.match(contract, /Requires rollout gates A-I/);
  assert.match(contract, /materialize this exact[\s\S]*new timestamped migration/);
  assert.match(contract, /ends support for rollback to OLD_APP/);
});

test("materialized CONTRACT preserves the protected draft SQL body", async () => {
  const [draft, migration] = await Promise.all([
    readFile(contractDraftPath, "utf8"),
    readFile(contractMigrationPath, "utf8"),
  ]);
  const bodyStart = "alter table public.gate_sessions";
  assert.equal(migration.slice(migration.indexOf(bodyStart)), draft.slice(draft.indexOf(bodyStart)));
  assert.match(migration, /^-- Materialized HIGH #1 CONTRACT migration\./);
});

test("the disposable matrix applies EXPAND then the materialized CONTRACT explicitly", async () => {
  const source = await readFile(rolloutTestPath, "utf8");
  const expand = "supabase/migrations/20260912000100_gate_credential_session_revocation_expand.sql";
  const contract = "supabase/migrations/20260913000100_gate_credential_session_revocation_contract.sql";
  assert.match(source, new RegExp(expand.replaceAll("/", "\\/")));
  assert.match(source, new RegExp(contract.replaceAll("/", "\\/")));
  assert.ok(source.indexOf(expand) < source.indexOf(contract));
  assert.doesNotMatch(source, /rollout\/gate_credential_session_revocation_contract\.sql/i);
});
