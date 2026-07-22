import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const restrictMigration = readFileSync(
  new URL("../supabase/migrations/20260722000100_restrict_whatsapp_outbound_deliveries_access.sql", import.meta.url),
  "utf8",
);
const hardenMigration = readFileSync(
  new URL("../supabase/migrations/20260722000200_harden_whatsapp_outbound_delivery_rpc.sql", import.meta.url),
  "utf8",
);
const service = readFileSync(
  new URL("../src/lib/tickets/services/whatsappOutboundDeliveries.ts", import.meta.url),
  "utf8",
);

const combinedMigrations = `${restrictMigration}\n${hardenMigration}`;

test("WhatsApp outbound deliveries use only the server admin Supabase client", () => {
  assert.match(service, /import "server-only"/);
  assert.match(service, /getSupabaseAdmin\(\)/);
  assert.doesNotMatch(service, /createBrowserClient|createServerClient|SUPABASE_ANON_KEY|NEXT_PUBLIC_SUPABASE_ANON_KEY/);
});

test("security migrations enable RLS and remove public table access", () => {
  assert.match(combinedMigrations, /alter table public\.whatsapp_outbound_deliveries\s+enable row level security/i);
  for (const role of ["public", "anon", "authenticated"]) {
    assert.match(
      combinedMigrations,
      new RegExp(`revoke all privileges\\s+on table public\\.whatsapp_outbound_deliveries\\s+from ${role}`, "i"),
    );
  }
});

test("service role keeps only operational table privileges", () => {
  assert.match(
    hardenMigration,
    /revoke all privileges\s+on table public\.whatsapp_outbound_deliveries\s+from service_role/i,
  );
  assert.match(
    hardenMigration,
    /grant select, insert, update, delete\s+on table public\.whatsapp_outbound_deliveries\s+to service_role/i,
  );
  assert.doesNotMatch(
    hardenMigration,
    /grant\s+.*\b(truncate|references|trigger)\b.*on table public\.whatsapp_outbound_deliveries\s+to service_role/i,
  );
});

test("claim RPC has exact signature, safe execution context, and service-role-only grants", () => {
  assert.match(hardenMigration, /create or replace function public\.claim_whatsapp_outbound_delivery\(p_delivery_id uuid\)/i);
  assert.match(hardenMigration, /returns setof public\.whatsapp_outbound_deliveries/i);
  assert.match(hardenMigration, /security invoker/i);
  assert.match(hardenMigration, /set search_path = ''/i);
  assert.match(hardenMigration, /update public\.whatsapp_outbound_deliveries as delivery/i);
  assert.match(hardenMigration, /returning delivery\.\*/i);

  for (const role of ["public", "anon", "authenticated"]) {
    assert.match(
      combinedMigrations,
      new RegExp(`revoke all privileges\\s+on function public\\.claim_whatsapp_outbound_delivery\\(uuid\\)\\s+from ${role}`, "i"),
    );
  }
  assert.match(
    combinedMigrations,
    /grant execute\s+on function public\.claim_whatsapp_outbound_delivery\(uuid\)\s+to service_role/i,
  );
});

test("future public objects do not inherit anon or authenticated privileges", () => {
  for (const objectType of ["tables", "sequences", "functions"]) {
    assert.match(
      hardenMigration,
      new RegExp(`alter default privileges for role postgres in schema public\\s+revoke all privileges on ${objectType} from public, anon, authenticated`, "i"),
    );
  }
});
