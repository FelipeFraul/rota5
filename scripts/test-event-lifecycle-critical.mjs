import assert from "node:assert/strict";
import test from "node:test";
import { z } from "zod";
import { loadProductionModule, MemorySupabase } from "./test-support/production-module-harness.mjs";

const NextResponse = { json: (body, init) => Response.json(body, init) };

function eventMocks(db) {
  return {
    getSupabaseAdmin: () => db,
    buildDuplicatedAdminEventPayload: () => ({}),
    OFFICIAL_TABLE_MAP_PLACES: [],
  };
}

test("event.change_status persists only the requested status on the selected event", async () => {
  const db = new MemorySupabase({
    events: [
      { id: "event-a", title: "A", status: "draft" },
      { id: "event-b", title: "B", status: "published" },
    ],
  });
  const service = await loadProductionModule("src/lib/tickets/services/adminEvents.ts", eventMocks(db));

  assert.deepEqual(await service.updateAdminEvent("event-a", { status: "published" }), { ok: true });
  assert.deepEqual(db.tables.events, [
    { id: "event-a", title: "A", status: "published" },
    { id: "event-b", title: "B", status: "published" },
  ]);
  assert.deepEqual(db.calls.at(-1).payload, { status: "published" });
});

test("event.cancel enforces owner/CSRF authorization and is safely repeatable", async () => {
  const db = new MemorySupabase({ events: [{ id: "event-a", title: "A", status: "published" }] });
  const service = await loadProductionModule("src/lib/tickets/services/adminEvents.ts", eventMocks(db));
  let session = { adminUser: { id: "owner", role: "admin", phone: "5511000000000" } };
  let csrfAllowed = false;
  const route = await loadProductionModule("src/app/api/admin/events/[eventId]/route.ts", {
    NextResponse,
    z,
    getSupabaseAdmin: () => db,
    requireAdminEventEditorSession: async () => ({ ok: true, session }),
    assertAdminCsrf: () => csrfAllowed,
    getAdminEventDetails: async (id) => ({
      ok: true,
      event: { eventId: id, createdByAdminUserId: "owner", sessions: [], sections: [] },
    }),
    updateAdminEvent: service.updateAdminEvent,
  });
  const context = { params: Promise.resolve({ eventId: "event-a" }) };

  assert.equal((await route.DELETE(new Request("http://local", { method: "DELETE" }), context)).status, 403);
  assert.equal(db.tables.events[0].status, "published");

  csrfAllowed = true;
  assert.equal((await route.DELETE(new Request("http://local", { method: "DELETE" }), context)).status, 200);
  assert.equal(db.tables.events[0].status, "cancelled");
  assert.equal(db.tables.events.length, 1);

  assert.equal((await route.DELETE(new Request("http://local", { method: "DELETE" }), context)).status, 200);
  assert.equal(db.tables.events[0].status, "cancelled");

  session = { adminUser: { id: "other", role: "admin", phone: "5511000000001" } };
  assert.equal((await route.DELETE(new Request("http://local", { method: "DELETE" }), context)).status, 403);
});

test("event.auto_finish finishes only past published events and is idempotent", async () => {
  const past = "2020-01-01T12:00:00.000Z";
  const future = "2099-01-01T12:00:00.000Z";
  const db = new MemorySupabase({
    events: [
      { id: "past", status: "published", created_by_admin_user_id: "owner", event_sessions: [{ starts_at: past }] },
      { id: "future", status: "published", created_by_admin_user_id: "owner", event_sessions: [{ starts_at: future }] },
      { id: "finished", status: "finished", created_by_admin_user_id: "owner", event_sessions: [{ starts_at: past }] },
    ],
    event_sessions: [
      { id: "s-past", event_id: "past", status: "sales_open" },
      { id: "s-future", event_id: "future", status: "sales_open" },
      { id: "s-finished", event_id: "finished", status: "finished" },
    ],
  });
  const service = await loadProductionModule(
    "src/lib/tickets/services/adminCourtesies.ts",
    {
      QRCode: {}, createHash: () => {}, getSupabaseAdmin: () => db,
      getPublicEventVisibilityQueryFloorIso: () => "", isPublicEventVisible: () => true,
      PUBLIC_VISIBLE_EVENT_STATUSES: [], normalizeWhatsAppPhone: (v) => v,
    },
    ["finishPastPublishedEvents"],
  );

  assert.deepEqual(await service.finishPastPublishedEvents({ ownerAdminUserId: "owner", canSeeAll: false }), { ok: true });
  assert.equal(db.tables.events.find((row) => row.id === "past").status, "finished");
  assert.equal(db.tables.events.find((row) => row.id === "future").status, "published");
  assert.equal(db.tables.events.find((row) => row.id === "finished").status, "finished");
  assert.equal(db.tables.event_sessions.find((row) => row.id === "s-past").status, "finished");
  assert.equal(db.tables.event_sessions.find((row) => row.id === "s-future").status, "sales_open");

  const mutations = db.calls.filter((call) => call.operation === "update").length;
  await service.finishPastPublishedEvents({ ownerAdminUserId: "owner", canSeeAll: false });
  assert.equal(db.calls.filter((call) => call.operation === "update").length, mutations);
});
