import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";
import { z } from "zod";
import { loadProductionModule, MemorySupabase } from "./test-support/production-module-harness.mjs";

const NextResponse = { json: (body, init) => Response.json(body, init) };

async function loadCourtesy(db) {
  return loadProductionModule("src/lib/tickets/services/adminCourtesies.ts", {
    QRCode: {}, createHash, getSupabaseAdmin: () => db,
    getPublicEventVisibilityQueryFloorIso: () => "", isPublicEventVisible: () => true,
    PUBLIC_VISIBLE_EVENT_STATUSES: [], normalizeWhatsAppPhone: (value) => value,
  });
}

async function loadRouteContract() {
  return loadProductionModule(
    "src/app/api/admin/events/[eventId]/route.ts",
    { NextResponse, z },
    ["canEditEvent", "patchSchema"],
  );
}

test("courtesy.section_limit normalizes and persists an authorized section limit", async () => {
  const db = new MemorySupabase({ courtesy_section_limits: [] });
  const service = await loadCourtesy(db);
  const route = await loadRouteContract();
  assert.equal(route.canEditEvent("admin", "owner", { createdByAdminUserId: "owner" }), true);

  assert.equal((await service.upsertCourtesySectionLimits("event-a", [{
    sectionId: "section-a", label: "   ", maxCourtesies: 4.9, status: "active",
  }])).ok, true);
  assert.deepEqual(db.tables.courtesy_section_limits, [{
    event_id: "event-a", section_id: "section-a", label: "Cortesia", max_courtesies: 4, status: "active",
  }]);
});

test("courtesy.section_limit rejects unauthorized ownership before persistence", async () => {
  const db = new MemorySupabase({ courtesy_section_limits: [] });
  const service = await loadCourtesy(db);
  const route = await loadRouteContract();
  const allowed = route.canEditEvent("admin", "other", { createdByAdminUserId: "owner" });
  if (allowed) await service.upsertCourtesySectionLimits("event-a", [{ sectionId: "section-a", label: "VIP", maxCourtesies: 2, status: "active" }]);
  assert.equal(allowed, false);
  assert.deepEqual(db.tables.courtesy_section_limits, []);
});

test("courtesy.section_limit schema rejects invalid quantities without partial mutation", async () => {
  const db = new MemorySupabase({ courtesy_section_limits: [] });
  const route = await loadRouteContract();
  const payload = {
    event: { title: "Evento", artistName: null, artistIcon: null, city: "Cidade", state: "SP", venueName: "Local", description: null, imageUrl: "", status: "published" },
    sessions: [], sections: [], newSections: [], prices: [],
    courtesy: { sections: [{ sectionId: "11111111-1111-4111-8111-111111111111", label: "VIP", limit: -1, status: "active" }] },
  };
  assert.equal(route.patchSchema.safeParse(payload).success, false);
  assert.deepEqual(db.tables.courtesy_section_limits, []);
});
