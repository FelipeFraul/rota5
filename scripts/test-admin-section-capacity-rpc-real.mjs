import assert from "node:assert/strict";
import test from "node:test";
import { createClient } from "@supabase/supabase-js";
import pg from "pg";
import {
  getPublicAvailabilityStatusForSession,
} from "../src/lib/tickets/services/publicAvailability.ts";
import {
  updateAdminSectionCapacity,
} from "../src/lib/tickets/services/adminEvents.ts";

const supabaseUrl = process.env.SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const databaseUrl = process.env.DATABASE_URL;

if (!supabaseUrl || !serviceRoleKey || !databaseUrl) {
  throw new Error("SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY and DATABASE_URL are required");
}

const db = createClient(supabaseUrl, serviceRoleKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const PREFIX = `TEST_ADMIN_CAPACITY_RPC_${Date.now()}`;

function normalizeConnectionString(value) {
  const schemeMarker = "://";
  const schemeIndex = value.indexOf(schemeMarker);
  const atIndex = value.lastIndexOf("@");
  if (schemeIndex < 0 || atIndex < 0) return value;

  const credentialsStart = schemeIndex + schemeMarker.length;
  const credentials = value.slice(credentialsStart, atIndex);
  const passwordSeparator = credentials.indexOf(":");
  if (passwordSeparator < 0) return value;

  const prefix = value.slice(0, credentialsStart + passwordSeparator + 1);
  const password = credentials.slice(passwordSeparator + 1);
  const suffix = value.slice(atIndex);

  return `${prefix}${encodeURIComponent(password)}${suffix}`;
}

async function execSql(sql) {
  const client = new pg.Client({
    connectionString: normalizeConnectionString(databaseUrl),
    ssl: { rejectUnauthorized: false },
  });
  await client.connect();
  try {
    await client.query(sql);
  } finally {
    await client.end();
  }
}

async function insertOne(table, values) {
  const { data, error } = await db.from(table).insert(values).select("id").single();
  if (error) throw error;
  return data.id;
}

async function createFixture({ capacity = 4, statuses = [] } = {}) {
  const venueId = await insertOne("venues", {
    name: `${PREFIX} Venue`,
    city: "São Paulo",
    state: "SP",
    status: "active",
  });
  const sectionId = await insertOne("venue_sections", {
    venue_id: venueId,
    name: `${PREFIX} Section`,
    slug: `${PREFIX.toLowerCase()}-${Math.random().toString(16).slice(2)}`,
    capacity,
    has_numbered_seats: false,
    status: "active",
  });
  const eventId = await insertOne("events", {
    title: `${PREFIX} Event`,
    artist_name: `${PREFIX} Artist`,
    city: "São Paulo",
    state: "SP",
    venue_id: venueId,
    status: "published",
  });
  const sessionId = await insertOne("event_sessions", {
    event_id: eventId,
    venue_id: venueId,
    starts_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
    timezone: "America/Sao_Paulo",
    status: "sales_open",
  });
  await insertOne("ticket_prices", {
    session_id: sessionId,
    section_id: sectionId,
    ticket_type: "full",
    label: "Inteira",
    price_cents: 1000,
    fee_cents: 0,
    status: "active",
    sales_start_at: new Date(Date.now() - 60_000).toISOString(),
    sales_end_at: new Date(Date.now() + 6 * 24 * 60 * 60 * 1000).toISOString(),
  });

  const seatRows = Array.from({ length: capacity }, (_, index) => ({
    venue_id: venueId,
    section_id: sectionId,
    row_label: null,
    seat_number: String(index + 1),
    seat_code: `${PREFIX}-${String(index + 1).padStart(3, "0")}`,
    status: "active",
  }));
  const { data: seats, error: seatsError } = await db
    .from("seats")
    .insert(seatRows)
    .select("id, seat_number");
  if (seatsError) throw seatsError;

  const sessionSeatRows = seats.map((seat, index) => ({
    session_id: sessionId,
    seat_id: seat.id,
    section_id: sectionId,
    status: statuses[index] ?? "available",
  }));
  const { error: sessionSeatsError } = await db.from("session_seats").insert(sessionSeatRows);
  if (sessionSeatsError) throw sessionSeatsError;

  return {
    venueId,
    sectionId,
    eventId,
    sessionId,
    seatIds: seats.map((seat) => seat.id),
  };
}

async function readState(sectionId, sessionId) {
  const [{ data: section, error: sectionError }, { data: seats, error: seatsError }] =
    await Promise.all([
      db.from("venue_sections").select("capacity").eq("id", sectionId).single(),
      db
        .from("session_seats")
        .select("status, seats!inner(status, seat_number)")
        .eq("section_id", sectionId)
        .eq("session_id", sessionId),
    ]);
  if (sectionError) throw sectionError;
  if (seatsError) throw seatsError;
  return { section, seats };
}

async function cleanup() {
  const { data: events } = await db.from("events").select("id").like("title", `${PREFIX}%`);
  const eventIds = (events ?? []).map((row) => row.id);
  const { data: venues } = await db.from("venues").select("id").like("name", `${PREFIX}%`);
  const venueIds = (venues ?? []).map((row) => row.id);
  const { data: sessions } = eventIds.length
    ? await db.from("event_sessions").select("id").in("event_id", eventIds)
    : { data: [] };
  const sessionIds = (sessions ?? []).map((row) => row.id);
  const { data: sections } = venueIds.length
    ? await db.from("venue_sections").select("id").in("venue_id", venueIds)
    : { data: [] };
  const sectionIds = (sections ?? []).map((row) => row.id);

  if (sessionIds.length) await db.from("ticket_prices").delete().in("session_id", sessionIds);
  if (sessionIds.length) await db.from("session_seats").delete().in("session_id", sessionIds);
  if (sectionIds.length) await db.from("seats").delete().in("section_id", sectionIds);
  if (eventIds.length) await db.from("event_sessions").delete().in("event_id", eventIds);
  if (eventIds.length) await db.from("events").delete().in("id", eventIds);
  if (sectionIds.length) await db.from("venue_sections").delete().in("id", sectionIds);
  if (venueIds.length) await db.from("venues").delete().in("id", venueIds);
}

test.after(async () => {
  await execSql(`
    drop trigger if exists test_admin_capacity_rollback_trigger on public.venue_sections;
    drop function if exists public.test_admin_capacity_rollback_trigger();
  `).catch(() => null);
  await cleanup();
});

test("reduz ate 0 e classificacao publica vira sold_out", async () => {
  const fixture = await createFixture({ capacity: 3 });

  const result = await updateAdminSectionCapacity({
    venueId: fixture.venueId,
    sectionId: fixture.sectionId,
    sessionIds: [fixture.sessionId],
    newCapacity: 0,
  });

  assert.equal(result.ok, true);
  const state = await readState(fixture.sectionId, fixture.sessionId);
  assert.equal(state.section.capacity, 0);
  assert.equal(state.seats.filter((row) => row.status === "blocked").length, 3);

  const availability = await getPublicAvailabilityStatusForSession({
    sessionId: fixture.sessionId,
    venueId: fixture.venueId,
    eventStatus: "published",
    sessionStatus: "sales_open",
    eventVenueStatus: "active",
    sessionVenueStatus: "active",
  });
  assert.equal(availability, "sold_out");
});

test("falha no update final nao deixa mutacao parcial", async () => {
  const fixture = await createFixture({ capacity: 2 });
  await execSql(`
    create or replace function public.test_admin_capacity_rollback_trigger()
    returns trigger
    language plpgsql
    as $$
    begin
      if old.id = '${fixture.sectionId}'::uuid and new.capacity = 0 then
        raise exception 'forced_capacity_update_failure';
      end if;
      return new;
    end;
    $$;

    drop trigger if exists test_admin_capacity_rollback_trigger on public.venue_sections;
    create trigger test_admin_capacity_rollback_trigger
    before update on public.venue_sections
    for each row execute function public.test_admin_capacity_rollback_trigger();
  `);

  const before = await readState(fixture.sectionId, fixture.sessionId);
  const result = await updateAdminSectionCapacity({
    venueId: fixture.venueId,
    sectionId: fixture.sectionId,
    sessionIds: [fixture.sessionId],
    newCapacity: 0,
  });
  const after = await readState(fixture.sectionId, fixture.sessionId);

  assert.equal(result.ok, false);
  assert.deepEqual(after, before);
});

test("preserva sold/reserved e bloqueia reducao abaixo do comprometido", async () => {
  const fixture = await createFixture({
    capacity: 4,
    statuses: ["sold", "reserved", "available", "available"],
  });

  const blocked = await updateAdminSectionCapacity({
    venueId: fixture.venueId,
    sectionId: fixture.sectionId,
    sessionIds: [fixture.sessionId],
    newCapacity: 1,
  });
  assert.equal(blocked.ok, false);
  assert.equal(blocked.reason, "capacity_below_busy");

  const reduced = await updateAdminSectionCapacity({
    venueId: fixture.venueId,
    sectionId: fixture.sectionId,
    sessionIds: [fixture.sessionId],
    newCapacity: 2,
  });
  assert.equal(reduced.ok, true);

  const state = await readState(fixture.sectionId, fixture.sessionId);
  assert.equal(state.section.capacity, 2);
  assert.equal(state.seats.filter((row) => row.status === "sold").length, 1);
  assert.equal(state.seats.filter((row) => row.status === "reserved").length, 1);
  assert.equal(state.seats.filter((row) => row.status === "blocked").length, 2);
});

test("aumento posterior restaura disponibilidade e classificacao available", async () => {
  const fixture = await createFixture({ capacity: 2 });

  assert.equal((await updateAdminSectionCapacity({
    venueId: fixture.venueId,
    sectionId: fixture.sectionId,
    sessionIds: [fixture.sessionId],
    newCapacity: 0,
  })).ok, true);

  const increased = await updateAdminSectionCapacity({
    venueId: fixture.venueId,
    sectionId: fixture.sectionId,
    sessionIds: [fixture.sessionId],
    newCapacity: 2,
  });
  assert.equal(increased.ok, true);

  const state = await readState(fixture.sectionId, fixture.sessionId);
  assert.equal(state.section.capacity, 2);
  assert.equal(state.seats.filter((row) => row.status === "available").length, 2);

  const availability = await getPublicAvailabilityStatusForSession({
    sessionId: fixture.sessionId,
    venueId: fixture.venueId,
    eventStatus: "published",
    sessionStatus: "sales_open",
    eventVenueStatus: "active",
    sessionVenueStatus: "active",
  });
  assert.equal(availability, "available");
});
