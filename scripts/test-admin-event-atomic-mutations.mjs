import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { loadProductionModule, MemorySupabase } from "./test-support/production-module-harness.mjs";

function atomicRpcHarness(initialTables = {}) {
  const completed = new Map();
  let sequence = 0;
  const db = new MemorySupabase(initialTables, {
    create_admin_event_catalog: (args) => {
      const serialized = JSON.stringify({ type: args.p_operation_type, payload: args.p_payload });
      const prior = completed.get(args.p_operation_id);
      if (prior && prior.serialized !== serialized) {
        return { data: null, error: new Error("admin_event_operation_payload_mismatch") };
      }
      if (prior) return { data: prior.result, error: null };
      const result = {
        ok: true,
        eventId: `event-${++sequence}`,
        venueId: `venue-${sequence}`,
        sessionId: `session-${sequence}`,
        sessionsCount: args.p_payload.sessions.length,
        createdSectionsCount: args.p_payload.sections.length,
        createdSeatsCount: args.p_payload.sections.reduce(
          (total, section) => total + section.seats.length * args.p_payload.sessions.length,
          0,
        ),
        createdPricesCount: args.p_payload.sections.reduce(
          (total, section) => total + section.prices.length,
          0,
        ),
      };
      completed.set(args.p_operation_id, { serialized, result });
      return { data: result, error: null };
    },
    update_admin_event_catalog: (args) => {
      const serialized = JSON.stringify({ eventId: args.p_event_id, payload: args.p_payload });
      const prior = completed.get(args.p_operation_id);
      if (prior && prior.serialized !== serialized) {
        return { data: null, error: new Error("admin_event_operation_payload_mismatch") };
      }
      if (prior) return { data: prior.result, error: null };
      const result = { ok: true, eventId: args.p_event_id };
      completed.set(args.p_operation_id, { serialized, result });
      return { data: result, error: null };
    },
  });
  return db;
}

async function loadService(db) {
  return loadProductionModule("src/lib/tickets/services/adminEvents.ts", {
    randomUUID: () => "00000000-0000-4000-8000-000000000000",
    getSupabaseAdmin: () => db,
    buildDuplicatedAdminEventPayload: ({ sourceEvent, venueId }) => ({
      title: `${sourceEvent.title} - CÓPIA`,
      artist_name: `${sourceEvent.title} - CÓPIA`,
      artist_icon: sourceEvent.artist_icon,
      description: sourceEvent.description,
      city: sourceEvent.city,
      state: sourceEvent.state,
      image_url: sourceEvent.image_url,
      venue_id: venueId,
      status: "draft",
    }),
    OFFICIAL_TABLE_MAP_PLACES: [],
  });
}

const createInput = {
  title: "Evento atômico",
  artistName: "Artista",
  city: "Sorocaba",
  state: "SP",
  venueName: "Casa",
  imageUrl: null,
  description: null,
  sessionsStartsAt: ["2099-01-01T20:00:00.000Z"],
  status: "draft",
  initialSections: [{
    name: "Pista",
    slug: "pista",
    hasNumberedSeats: false,
    capacity: 2,
    createInventorySeats: true,
    ticketType: "full",
    label: "Inteira",
    priceCents: 1000,
    feeCents: 100,
  }],
};

test("CREATE uses one atomic RPC and never performs the former insert chain", async () => {
  const db = atomicRpcHarness();
  const service = await loadService(db);
  const result = await service.createAdminEvent({ ...createInput, operationId: "10000000-0000-4000-8000-000000000001" });
  assert.equal(result.ok, true);
  assert.deepEqual(db.calls.map((call) => call.operation), ["create_admin_event_catalog"]);
  assert.equal(db.calls[0].args.p_operation_type, "create");
});

test("CREATE retry is idempotent while a new intentional operation creates another event", async () => {
  const db = atomicRpcHarness();
  const service = await loadService(db);
  const operationId = "10000000-0000-4000-8000-000000000002";
  const first = await service.createAdminEvent({ ...createInput, operationId });
  const retry = await service.createAdminEvent({ ...createInput, operationId });
  const next = await service.createAdminEvent({ ...createInput, operationId: "10000000-0000-4000-8000-000000000003" });
  assert.equal(retry.eventId, first.eventId);
  assert.notEqual(next.eventId, first.eventId);
});

test("same operation id with a different CREATE payload is rejected", async () => {
  const db = atomicRpcHarness();
  const service = await loadService(db);
  const operationId = "10000000-0000-4000-8000-000000000004";
  assert.equal((await service.createAdminEvent({ ...createInput, operationId })).ok, true);
  assert.equal((await service.createAdminEvent({ ...createInput, title: "Outro", operationId })).ok, false);
});

test("DUPLICATE preserves reusable structure and sends no transactional history", async () => {
  const sourceTables = {
    events: [{ id: "source", title: "Original", artist_name: "X", artist_icon: "🎤", description: "D", city: "Sorocaba", state: "SP", image_url: "https://example.com/x.jpg", venue_id: "venue-source", status: "published", venues: { name: "Casa" } }],
    event_sessions: [{ id: "source-session", event_id: "source", venue_id: "venue-source", starts_at: "2099-02-01T20:00:00.000Z", status: "sales_open" }],
    venue_sections: [{ id: "source-section", venue_id: "venue-source", name: "Pista", slug: "pista", capacity: 1, has_numbered_seats: true, status: "active" }],
    seats: [{ id: "source-seat", section_id: "source-section", row_label: "A", seat_number: "1", seat_code: "A01", map_x: 10, map_y: 20, status: "active" }],
    session_seats: [{ id: "source-session-seat", session_id: "source-session", section_id: "source-section", seat_id: "source-seat", status: "sold" }],
    ticket_prices: [{ id: "source-price", session_id: "source-session", section_id: "source-section", ticket_type: "full", label: "Inteira", price_cents: 5000, fee_cents: 500, currency: "BRL", sales_start_at: null, sales_end_at: null, status: "active" }],
    reservations: [{ id: "history-reservation", session_id: "source-session" }],
    orders: [{ id: "history-order" }],
    payments: [{ id: "history-payment" }],
    tickets: [{ id: "history-ticket", session_id: "source-session" }],
  };
  const before = structuredClone(sourceTables);
  const db = atomicRpcHarness(sourceTables);
  const service = await loadService(db);
  const result = await service.duplicateAdminEvent({ eventId: "source", operationId: "20000000-0000-4000-8000-000000000001" });
  assert.equal(result.ok, true);
  assert.deepEqual(db.tables, before);
  const call = db.calls.find((item) => item.operation === "create_admin_event_catalog");
  assert.equal(call.args.p_operation_type, "duplicate");
  assert.deepEqual(call.args.p_payload.sections[0].seats[0], { row_label: "A", seat_number: "1", seat_code: "A01", map_x: 10, map_y: 20, status: "active" });
  assert.equal(call.args.p_payload.sections[0].prices[0].price_cents, 5000);
  assert.equal(call.args.p_payload.event.status, "draft");
  assert.doesNotMatch(JSON.stringify(call.args.p_payload), /reservations|orders|payments|tickets|check.?ins|analytics|messages|conversations/i);
});

test("DUPLICATE retry is idempotent and a second intentional duplication remains available", async () => {
  const db = atomicRpcHarness({
    events: [{ id: "source", title: "Original", artist_name: "X", artist_icon: "🎤", description: null, city: "S", state: "SP", image_url: null, venue_id: "v", status: "published", venues: { name: "Casa" } }],
    event_sessions: [{ id: "s", event_id: "source", venue_id: "v", starts_at: "2099-01-01T00:00:00Z", status: "sales_open" }],
  });
  const service = await loadService(db);
  const operationId = "20000000-0000-4000-8000-000000000002";
  const first = await service.duplicateAdminEvent({ eventId: "source", operationId });
  const retry = await service.duplicateAdminEvent({ eventId: "source", operationId });
  const second = await service.duplicateAdminEvent({ eventId: "source", operationId: "20000000-0000-4000-8000-000000000003" });
  assert.equal(retry.eventId, first.eventId);
  assert.notEqual(second.eventId, first.eventId);
});

test("UPDATE uses one atomic and idempotent aggregate RPC", async () => {
  const db = atomicRpcHarness();
  const service = await loadService(db);
  const input = { operationId: "30000000-0000-4000-8000-000000000001", eventId: "event-a", payload: { event: { title: "Novo" }, new_sections: [{ name: "VIP" }] } };
  assert.equal((await service.updateAdminEventCatalog(input)).ok, true);
  assert.equal((await service.updateAdminEventCatalog(input)).ok, true);
  assert.deepEqual(db.calls.map((call) => call.operation), ["update_admin_event_catalog", "update_admin_event_catalog"]);
});

test("a duplicated event remains independently editable", async () => {
  const db = atomicRpcHarness({
    events: [{ id: "source", title: "Original", artist_name: "X", artist_icon: "X", description: null, city: "S", state: "SP", image_url: null, venue_id: "v", status: "published", venues: { name: "Casa" } }],
    event_sessions: [{ id: "s", event_id: "source", venue_id: "v", starts_at: "2099-01-01T00:00:00Z", status: "sales_open" }],
  });
  const service = await loadService(db);
  const duplicated = await service.duplicateAdminEvent({ eventId: "source", operationId: "40000000-0000-4000-8000-000000000001" });
  const edited = await service.updateAdminEventCatalog({
    operationId: "40000000-0000-4000-8000-000000000002",
    eventId: duplicated.eventId,
    payload: { event: { title: "Edited copy" } },
  });
  assert.equal(edited.ok, true);
  assert.equal(edited.eventId, duplicated.eventId);
  assert.equal(db.tables.events[0].title, "Original");
});

test("admin web PATCH no longer invokes the independent mutation chain", () => {
  const source = readFileSync("src/app/api/admin/events/[eventId]/route.ts", "utf8");
  const patchBody = source.slice(source.indexOf("export async function PATCH"), source.indexOf("export async function POST", source.indexOf("export async function PATCH")));
  assert.match(patchBody, /updateAdminEventCatalog\(\{/);
  assert.doesNotMatch(patchBody, /findOrCreateVenue\(|updateAdminEvent\(|updateAdminSession\(|updateAdminSectionCapacity\(|updateAdminSection\(|createAdminEventSections\(|updateAdminPrice\(|upsertCourtesySectionLimits\(/);
  assert.match(patchBody, /x-idempotency-key/);
});

test("CREATE and UPDATE browser callers retain one operation id for retry", () => {
  const create = readFileSync("src/app/admin/eventos/event-editor/CreateEventModal.tsx", "utf8");
  const update = readFileSync("src/app/admin/eventos/event-editor/EventEditorModal.tsx", "utf8");
  assert.match(create, /useRef\(crypto\.randomUUID\(\)\)/);
  assert.match(update, /operationId\.current = crypto\.randomUUID\(\)/);
  assert.match(create + update, /x-idempotency-key/);
});

test("DUPLICATE operation lifecycle preserves network and ambiguous HTTP retries", async () => {
  const ids = ["operation-A", "operation-B"];
  const {
    createDuplicateOperationIdStore,
    runDuplicateOperation,
    shouldConcludeDuplicateOperation,
  } = await loadProductionModule(
    "src/app/admin/eventos/duplicateOperationId.ts",
  );
  const store = createDuplicateOperationIdStore(() => ids.shift());
  const attempts = [];

  await assert.rejects(
    runDuplicateOperation(store, "event-1", async (operationId) => {
      attempts.push(operationId);
      throw new TypeError("network unavailable");
    }),
    /network unavailable/,
    "NETWORK_FAILURE",
  );
  const retryResult = await runDuplicateOperation(store, "event-1", async (operationId) => {
    attempts.push(operationId);
    return {
      value: { status: 500 },
      conclude: shouldConcludeDuplicateOperation(500, false),
    };
  });
  const unavailableResult = await runDuplicateOperation(store, "event-1", async (operationId) => {
    attempts.push(operationId);
    return {
      value: { status: 503 },
      conclude: shouldConcludeDuplicateOperation(503, false),
    };
  });
  const successResult = await runDuplicateOperation(store, "event-1", async (operationId) => {
    attempts.push(operationId);
    return {
      value: { status: 200, eventId: "copy-1" },
      conclude: shouldConcludeDuplicateOperation(200, true),
    };
  });
  const secondResult = await runDuplicateOperation(store, "event-1", async (operationId) => {
    attempts.push(operationId);
    return {
      value: { status: 200, eventId: "copy-2" },
      conclude: shouldConcludeDuplicateOperation(200, true),
    };
  });

  assert.deepEqual(attempts, ["operation-A", "operation-A", "operation-A", "operation-A", "operation-B"]);
  assert.equal(retryResult.status, 500, "HTTP_500");
  assert.equal(unavailableResult.status, 503, "HTTP_503");
  assert.equal(successResult.eventId, "copy-1", "CONCLUSIVE_SUCCESS");
  assert.equal(secondResult.eventId, "copy-2", "SECOND_INTENTIONAL_DUPLICATION");
  assert.notEqual(attempts[3], attempts[4], "operation B must differ from operation A");
});

test("DUPLICATE operation lifecycle concludes proven pre-mutation 4xx", async () => {
  const ids = ["operation-A", "operation-B"];
  const {
    createDuplicateOperationIdStore,
    runDuplicateOperation,
    shouldConcludeDuplicateOperation,
  } = await loadProductionModule(
    "src/app/admin/eventos/duplicateOperationId.ts",
  );
  const store = createDuplicateOperationIdStore(() => ids.shift());
  const attempts = [];

  assert.deepEqual(
    [400, 401, 403, 404].map((status) => shouldConcludeDuplicateOperation(status, false)),
    [true, true, true, true],
  );
  assert.deepEqual(
    [409, 500, 502, 503, 504].map((status) => shouldConcludeDuplicateOperation(status, false)),
    [false, false, false, false, false],
  );

  const forbidden = await runDuplicateOperation(store, "event-1", async (operationId) => {
    attempts.push(operationId);
    return {
      value: { status: 403 },
      conclude: shouldConcludeDuplicateOperation(403, false),
    };
  });
  await runDuplicateOperation(store, "event-1", async (operationId) => {
    attempts.push(operationId);
    return {
      value: { status: 200 },
      conclude: shouldConcludeDuplicateOperation(200, true),
    };
  });

  assert.equal(forbidden.status, 403, "CONCLUSIVE_PRE_MUTATION_4XX");
  assert.deepEqual(attempts, ["operation-A", "operation-B"]);
});

test("WhatsApp retains operation ids across CREATE and DUPLICATE retries", () => {
  const router = readFileSync("src/lib/tickets/router.ts", "utf8");
  assert.match(router, /if \(typeof draft\.operationId !== "string"\) draft\.operationId = randomUUID\(\)/);
  assert.match(router, /draft: \{ operationId: randomUUID\(\) \}/);
  assert.match(router, /operationId: typeof adminEvents\.draft\?\.operationId === "string"/);
});
