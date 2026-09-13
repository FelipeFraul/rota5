import assert from "node:assert/strict";
import test from "node:test";
import { readdir, readFile } from "node:fs/promises";

const migrationsDirectory = new URL("../supabase/migrations/", import.meta.url);
const contractDraftPath = new URL(
  "../supabase/rollout/gate_credential_session_revocation_contract.sql",
  import.meta.url,
);
const rolloutTestPath = new URL(
  "./test-gate-credential-revocation-rollout-postgres.mjs",
  import.meta.url,
);

test("only EXPAND is queued as an active HIGH #1 migration", async () => {
  const active = (await readdir(migrationsDirectory))
    .filter((name) => name.includes("gate_credential_session_revocation"))
    .sort();

  assert.deepEqual(active, [
    "20260912000100_gate_credential_session_revocation_expand.sql",
  ]);
  assert.equal(active.some((name) => /contract/i.test(name)), false);
});

test("CONTRACT is a protected draft outside the automatic migration queue", async () => {
  const contract = await readFile(contractDraftPath, "utf8");
  assert.match(contract, /^-- DRAFT - DO NOT APPLY DIRECTLY\./);
  assert.match(contract, /Requires rollout gates A-I/);
  assert.match(contract, /materialize this exact[\s\S]*new timestamped migration/);
  assert.match(contract, /ends support for rollback to OLD_APP/);
});

test("the disposable matrix applies EXPAND then the CONTRACT draft explicitly", async () => {
  const source = await readFile(rolloutTestPath, "utf8");
  const expand = "supabase/migrations/20260912000100_gate_credential_session_revocation_expand.sql";
  const contract = "supabase/rollout/gate_credential_session_revocation_contract.sql";
  assert.match(source, new RegExp(expand.replaceAll("/", "\\/")));
  assert.match(source, new RegExp(contract.replaceAll("/", "\\/")));
  assert.ok(source.indexOf(expand) < source.indexOf(contract));
  assert.doesNotMatch(source, /migrations\/[^"']*contract[^"']*\.sql/i);
});
