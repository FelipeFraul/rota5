import { readFileSync } from "node:fs";
import assert from "node:assert/strict";
import { test } from "node:test";

const adminAuth = readFileSync(
  new URL("../src/lib/tickets/services/adminAuth.ts", import.meta.url),
  "utf8",
);
const adminWebAuth = readFileSync(
  new URL("../src/lib/tickets/services/adminWebAuth.ts", import.meta.url),
  "utf8",
);
const eventsRoute = readFileSync(
  new URL("../src/app/api/admin/events/route.ts", import.meta.url),
  "utf8",
);
const comboOffersRoute = readFileSync(
  new URL("../src/app/api/admin/combo-offers/route.ts", import.meta.url),
  "utf8",
);
const eventDetailsRoute = readFileSync(
  new URL("../src/app/api/admin/events/[eventId]/route.ts", import.meta.url),
  "utf8",
);

test("admin API auth validates signed cookie before database lookup", () => {
  assert.match(adminAuth, /function decodeAdminWebSessionCookie/);
  assert.match(adminAuth, /fixedTimeEqual\(signAdminWebSessionPayload\(body, secret\), signature\)/);
  assert.match(adminAuth, /new Date\(cookie\.expiresAt\)\.getTime\(\) <= Date\.now\(\)/);
});

test("admin API auth resolves session and admin user in one Supabase select", () => {
  const optimizedResolver = adminAuth.slice(
    adminAuth.indexOf("export async function getAdminWebSessionFromCookieWithOptions"),
    adminAuth.indexOf("export async function revokeAdminWebSession"),
  );
  assert.match(adminAuth, /getAdminWebSessionFromCookieWithOptions/);
  assert.match(optimizedResolver, /from\("admin_sessions"\)/);
  assert.match(optimizedResolver, /admin_users!inner\(id, phone, role, status, name, last_login_at\)/);
  assert.match(optimizedResolver, /\.eq\("admin_users\.status", "active"\)/);
  assert.doesNotMatch(optimizedResolver, /from\("admin_users"\)/);
});

test("admin API auth preserves authorization and disabled-user blocking", () => {
  assert.match(adminAuth, /adminUser\.status !== "active"/);
  assert.match(adminAuth, /!hasAdminPermission\(adminUser\.role, "manage_events"\)/);
  assert.match(adminWebAuth, /hasAdminPermission\(result\.adminWebSession\.adminUser\.role, "manage_events"\)/);
  assert.match(eventsRoute, /auth\.session\.adminUser\.role === "root"/);
  assert.match(eventsRoute, /ownerAdminUserId: auth\.session\.adminUser\.id/);
});

test("admin API auth skips last_used touch only for route auth helper", () => {
  assert.match(adminAuth, /touchLastUsed\?: boolean/);
  assert.match(adminAuth, /if \(options\.touchLastUsed !== false\)/);
  assert.match(adminWebAuth, /touchLastUsed: false/);
  assert.match(adminWebAuth, /supabaseOperations: 1/);
});

test("target admin routes use the centralized auth helper", () => {
  assert.match(eventsRoute, /requireAdminEventEditorSession\(\)/);
  assert.match(comboOffersRoute, /requireAdminEventEditorSession\(\)/);
  assert.match(eventDetailsRoute, /requireAdminEventEditorSession\(\)/);
  assert.match(eventDetailsRoute, /canEditEvent\(auth\.session\.adminUser\.role, auth\.session\.adminUser\.id/);
});
