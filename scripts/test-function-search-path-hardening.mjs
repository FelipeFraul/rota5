import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const migration = readFileSync(
  new URL("../supabase/migrations/20260722000400_fully_qualify_hardened_function_references.sql", import.meta.url),
  "utf8",
);

const functionNames = [
  "cancel_pending_reservation",
  "confirm_paid_ticket_order",
  "consume_rate_limit",
  "enforce_one_active_reservation_per_customer",
  "expire_reservations",
  "issue_admin_courtesy_order",
  "issue_courtesy_order",
  "issue_public_free_ticket_order",
  "lock_and_validate_courtesy_limits",
  "lock_customer_active_reservation_slot",
  "lock_validate_and_record_reservation_buyer_risk",
  "normalize_event_search_text",
  "reserve_seats",
  "reserve_ticket_cart",
  "search_public_events_ranked",
  "set_updated_at",
  "validate_ticket_entry",
];

test("migration preserves all 17 hardened function definitions", () => {
  for (const name of functionNames) {
    assert.match(migration, new RegExp(`CREATE OR REPLACE FUNCTION public\\.${name}\\(`, "i"));
  }

  assert.equal(migration.match(/SET search_path TO ''/g)?.length, functionNames.length);
  assert.doesNotMatch(migration, /SECURITY DEFINER/i);
});

test("native and extension calls are explicitly qualified where search_path is empty", () => {
  for (const fn of [
    "now",
    "btrim",
    "jsonb_build_object",
    "jsonb_strip_nulls",
    "jsonb_agg",
    "jsonb_to_recordset",
    "regexp_replace",
    "lower",
    "gen_random_uuid",
    "clock_timestamp",
    "make_interval",
    "to_timestamp",
    "ceil",
    "floor",
  ]) {
    assert.doesNotMatch(migration, new RegExp(`(?<![\\w.])${fn}\\s*\\(`));
  }

  for (const specialForm of ["coalesce", "nullif", "greatest", "least"]) {
    assert.doesNotMatch(migration, new RegExp(`pg_catalog\\.${specialForm}\\s*\\(`));
  }

  assert.doesNotMatch(migration, /(?<![\w.])digest\s*\(/);
  assert.doesNotMatch(migration, /(?<![\w.])unaccent\s*\(/);
  assert.doesNotMatch(migration, /(?<![\w.])similarity\s*\(/);
  assert.doesNotMatch(migration, /\s%\sinput\.term/);

  assert.match(migration, /extensions\.digest\(/);
  assert.match(migration, /public\.unaccent\(/);
  assert.match(migration, /public\.similarity\(/);
  assert.match(migration, /OPERATOR\(public\.%\)/);
});

test("public execute is revoked only from the three auxiliary functions", () => {
  for (const signature of [
    "public.set_updated_at()",
    "public.normalize_event_search_text(text)",
    "public.enforce_one_active_reservation_per_customer()",
  ]) {
    assert.match(migration, new RegExp(`revoke all privileges on function ${signature.replace(/[()]/g, "\\$&")} from public`, "i"));
    assert.match(migration, new RegExp(`revoke all privileges on function ${signature.replace(/[()]/g, "\\$&")} from anon`, "i"));
    assert.match(migration, new RegExp(`revoke all privileges on function ${signature.replace(/[()]/g, "\\$&")} from authenticated`, "i"));
    assert.match(migration, new RegExp(`grant execute on function ${signature.replace(/[()]/g, "\\$&")} to service_role`, "i"));
  }
});
