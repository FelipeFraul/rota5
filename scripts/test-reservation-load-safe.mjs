import fs from "node:fs";
import path from "node:path";
import { performance } from "node:perf_hooks";
import { createClient } from "@supabase/supabase-js";

const LOAD_PROFILES = {
  full: {
    seatCount: 300,
    readConcurrency: [50, 100, 300],
    reserveConcurrency: [10, 50, 100, 300],
    maxStageMs: 45_000,
  },
  smoke: {
    seatCount: 10,
    readConcurrency: [5],
    reserveConcurrency: [5],
    maxStageMs: 45_000,
  },
};

function parseEnvFile(filePath) {
  const values = {};

  if (!fs.existsSync(filePath)) return values;

  for (const line of fs.readFileSync(filePath, "utf8").split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;

    const separatorIndex = trimmed.indexOf("=");
    if (separatorIndex < 0) continue;

    const key = trimmed.slice(0, separatorIndex).trim();
    let value = trimmed.slice(separatorIndex + 1).trim();

    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }

    values[key] = value;
  }

  return values;
}

const env = {
  ...parseEnvFile(path.join(process.cwd(), ".env")),
  ...process.env,
};

function resolveLoadConfig(rawProfile) {
  const normalizedProfile = rawProfile?.trim() || "full";
  const config = LOAD_PROFILES[normalizedProfile];

  if (!config) {
    console.error(
      JSON.stringify(
        {
          ok: false,
          error: "invalid_reservation_load_profile",
          received: rawProfile,
          accepted: Object.keys(LOAD_PROFILES),
        },
        null,
        2,
      ),
    );
    process.exitCode = 1;
    return null;
  }

  return {
    loadProfile: normalizedProfile,
    ...config,
  };
}

const loadConfig = resolveLoadConfig(env.RESERVATION_LOAD_PROFILE);

if (loadConfig && (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY)) {
  throw new Error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY.");
}

const supabase = loadConfig
  ? createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
    })
  : null;

const runId = `LOAD_RESERVATION_${Date.now()}`;
const created = {
  customerIds: new Set(),
  reservationIds: new Set(),
  orderIds: new Set(),
  venueId: null,
  eventId: null,
  sessionId: null,
  sectionId: null,
  ticketPriceId: null,
  seatIds: [],
  sessionSeatIds: [],
};

function percentile(values, pct) {
  if (values.length === 0) return 0;

  const sorted = [...values].sort((left, right) => left - right);
  const index = Math.min(
    sorted.length - 1,
    Math.ceil((pct / 100) * sorted.length) - 1,
  );

  return sorted[index];
}

function round(value) {
  return Math.round(value * 100) / 100;
}

function summarizeDurations(durations) {
  return {
    p50Ms: round(percentile(durations, 50)),
    p95Ms: round(percentile(durations, 95)),
    p99Ms: round(percentile(durations, 99)),
    maxMs: round(Math.max(0, ...durations)),
  };
}

function classifyError(error) {
  const message = `${error?.message ?? ""} ${error?.details ?? ""}`.toLowerCase();

  if (message.includes("deadlock")) return "deadlock";
  if (message.includes("timeout") || message.includes("timed out")) return "timeout";
  if (message.includes("seat_not_available")) return "expected_seat_not_available";
  if (message.includes("duplicate")) return "duplicate";

  return "unexpected";
}

async function must(label, queryFactory) {
  let lastError = null;

  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      const { data, error } = await queryFactory();

      if (error) {
        lastError = error;
      } else {
        return data;
      }
    } catch (error) {
      lastError = error;
    }

    const message = String(lastError?.message ?? lastError ?? "");
    const retryable =
      message.includes("fetch failed") ||
      message.includes("network") ||
      message.includes("timeout") ||
      message.includes("timed out");

    if (!retryable || attempt === 3) {
      break;
    }

    await new Promise((resolve) => setTimeout(resolve, attempt * 500));
  }

  throw new Error(`${label}: ${lastError?.message ?? String(lastError)}`);
}

async function timed(fn) {
  const start = performance.now();

  try {
    const data = await fn();
    return {
      ok: true,
      durationMs: performance.now() - start,
      data,
    };
  } catch (error) {
    return {
      ok: false,
      durationMs: performance.now() - start,
      error,
      errorClass: classifyError(error),
    };
  }
}

async function setupCatalog() {
  const venue = await must(
    "insert venue",
    () => supabase
      .from("venues")
      .insert({
        name: `${runId} Venue`,
        city: "Sorocaba",
        state: "SP",
        address: "Carga segura",
        status: "active",
      })
      .select("id")
      .single(),
  );
  created.venueId = venue.id;

  const event = await must(
    "insert event",
    () => supabase
      .from("events")
      .insert({
        title: `${runId} Event`,
        artist_name: "Load Test",
        city: "Sorocaba",
        state: "SP",
        venue_id: venue.id,
        status: "published",
      })
      .select("id")
      .single(),
  );
  created.eventId = event.id;

  const session = await must(
    "insert session",
    () => supabase
      .from("event_sessions")
      .insert({
        event_id: event.id,
        venue_id: venue.id,
        starts_at: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString(),
        status: "sales_open",
      })
      .select("id")
      .single(),
  );
  created.sessionId = session.id;

  const section = await must(
    "insert section",
    () => supabase
      .from("venue_sections")
      .insert({
        venue_id: venue.id,
        name: `${runId} Section`,
        slug: runId.toLowerCase().replace(/_/g, "-"),
        capacity: loadConfig.seatCount,
        has_numbered_seats: true,
        status: "active",
      })
      .select("id")
      .single(),
  );
  created.sectionId = section.id;

  const price = await must(
    "insert price",
    () => supabase
      .from("ticket_prices")
      .insert({
        session_id: session.id,
        section_id: section.id,
        ticket_type: "full",
        label: "Inteira",
        price_cents: 100,
        fee_cents: 0,
        currency: "BRL",
        status: "active",
      })
      .select("id")
      .single(),
  );
  created.ticketPriceId = price.id;

  const seats = await must(
    "insert seats",
    () => supabase
      .from("seats")
      .insert(
        Array.from({ length: loadConfig.seatCount }, (_, index) => ({
          venue_id: venue.id,
          section_id: section.id,
          row_label: "A",
          seat_number: String(index + 1),
          seat_code: `LT-${String(index + 1).padStart(3, "0")}`,
          status: "active",
        })),
      )
      .select("id")
      .returns(),
  );
  created.seatIds = seats.map((seat) => seat.id);

  const sessionSeats = await must(
    "insert session seats",
    () => supabase
      .from("session_seats")
      .insert(
        created.seatIds.map((seatId) => ({
          session_id: session.id,
          seat_id: seatId,
          section_id: section.id,
          status: "available",
        })),
      )
      .select("id")
      .returns(),
  );
  created.sessionSeatIds = sessionSeats.map((seat) => seat.id);
}

async function readScenario() {
  const events = await must(
    "read events",
    () => supabase
      .from("events")
      .select("id, title, event_sessions!inner(id, status, starts_at)")
      .eq("id", created.eventId)
      .eq("status", "published")
      .eq("event_sessions.status", "sales_open")
      .limit(1),
  );

  const sections = await must(
    "read sections and prices",
    () => supabase
      .from("venue_sections")
      .select("id, name, has_numbered_seats, ticket_prices!inner(id, ticket_type, price_cents, fee_cents, status)")
      .eq("id", created.sectionId)
      .eq("status", "active")
      .eq("ticket_prices.session_id", created.sessionId)
      .eq("ticket_prices.status", "active"),
  );

  const seats = await must(
    "read seat availability",
    () => supabase
      .from("session_seats")
      .select("id", { count: "exact", head: true })
      .eq("session_id", created.sessionId)
      .eq("section_id", created.sectionId)
      .eq("status", "available"),
  );

  return {
    events: events.length,
    sections: sections.length,
    availableSeats: seats?.length ?? null,
  };
}

function summarizeResults(name, concurrency, results) {
  const successes = results.filter((result) => result.ok);
  const failures = results.filter((result) => !result.ok);
  const errorClasses = failures.reduce((acc, result) => {
    acc[result.errorClass] = (acc[result.errorClass] ?? 0) + 1;
    return acc;
  }, {});

  const unexpectedFailures = failures.filter(
    (result) => result.errorClass !== "expected_seat_not_available",
  );

  return {
    name,
    concurrency,
    totalRequests: results.length,
    success: successes.length,
    expectedFailures: failures.length - unexpectedFailures.length,
    unexpectedFailures: unexpectedFailures.length,
    ...summarizeDurations(results.map((result) => result.durationMs)),
    errorsSupabase: failures.length,
    deadlocks: errorClasses.deadlock ?? 0,
    timeouts: errorClasses.timeout ?? 0,
    errorClasses,
  };
}

async function runReadLoad(concurrency) {
  const stageStart = performance.now();
  const results = await Promise.all(
    Array.from({ length: concurrency }, () => timed(readScenario)),
  );
  const summary = summarizeResults("read", concurrency, results);
  summary.stageMs = round(performance.now() - stageStart);
  summary.over45s = summary.stageMs > loadConfig.maxStageMs;
  return summary;
}

function phoneFor(stage, index) {
  const suffix = String(stage).padStart(3, "0") + String(index).padStart(6, "0");
  return `5591${suffix}`.slice(0, 13);
}

async function createCustomers(stage, count) {
  const customers = await must(
    "insert customers",
    () => supabase
      .from("customers")
      .insert(
        Array.from({ length: count }, (_, index) => ({
          whatsapp_phone: phoneFor(stage, index),
          name: `${runId} Customer ${stage}-${index}`,
        })),
      )
      .select("id")
      .returns(),
  );

  for (const customer of customers) {
    created.customerIds.add(customer.id);
  }

  return customers;
}

async function reserveScenario(customerId, seatId) {
  const data = await must(
    "reserve seats",
    () => supabase.rpc("reserve_seats", {
      p_customer_id: customerId,
      p_conversation_id: null,
      p_session_id: created.sessionId,
      p_seat_ids: [seatId],
      p_ticket_type: "full",
      p_ttl_minutes: 30,
    }),
  );

  if (data?.reservation_id) created.reservationIds.add(data.reservation_id);
  if (data?.order_id) created.orderIds.add(data.order_id);

  return data;
}

async function validateReservationStage(customerIds) {
  const reservations = await must(
    "load stage reservations",
    () => supabase
      .from("reservations")
      .select("id, customer_id, status, orders(id, status), reservation_items(id, seat_id, session_seat_id)")
      .in("customer_id", customerIds)
      .returns(),
  );

  for (const reservation of reservations) {
    created.reservationIds.add(reservation.id);
    const orders = Array.isArray(reservation.orders)
      ? reservation.orders
      : reservation.orders
        ? [reservation.orders]
        : [];
    for (const order of orders) created.orderIds.add(order.id);
  }

  const activeByCustomer = new Map();
  const activeSeatUses = new Map();

  for (const reservation of reservations) {
    if (reservation.status !== "active") continue;

    activeByCustomer.set(
      reservation.customer_id,
      (activeByCustomer.get(reservation.customer_id) ?? 0) + 1,
    );

    const items = Array.isArray(reservation.reservation_items)
      ? reservation.reservation_items
      : reservation.reservation_items
        ? [reservation.reservation_items]
        : [];

    for (const item of items) {
      activeSeatUses.set(item.seat_id, (activeSeatUses.get(item.seat_id) ?? 0) + 1);
    }
  }

  const duplicateActiveCustomers = [...activeByCustomer.values()].filter(
    (count) => count > 1,
  ).length;
  const duplicateSeatReservations = [...activeSeatUses.values()].filter(
    (count) => count > 1,
  ).length;

  const sessionSeats = await must(
    "load session seats",
    () => supabase
      .from("session_seats")
      .select("seat_id, status, current_reservation_id")
      .eq("session_id", created.sessionId)
      .returns(),
  );

  const reservedSessionSeatDuplicates =
    sessionSeats.filter((seat) => seat.status === "reserved").length -
    new Set(
      sessionSeats
        .filter((seat) => seat.status === "reserved")
        .map((seat) => seat.seat_id),
    ).size;

  return {
    activeReservations: reservations.filter((row) => row.status === "active").length,
    duplicateActiveCustomers,
    duplicateSeatReservations,
    reservedSessionSeatDuplicates,
  };
}

async function cancelReservations(reservationIds) {
  const results = await Promise.all(
    reservationIds.map((reservationId) =>
      timed(async () =>
        must(
          "cancel reservation",
          () => supabase.rpc("cancel_pending_reservation", {
            p_reservation_id: reservationId,
            p_customer_id: null,
            p_reason: "load_test_cleanup",
          }),
        ),
      ),
    ),
  );

  return summarizeResults("cancel", reservationIds.length, results);
}

async function runReserveLoad(concurrency, stage) {
  const customers = await createCustomers(stage, concurrency);
  const customerIds = customers.map((customer) => customer.id);
  const stageReservationIds = [];
  const stageStart = performance.now();

  const results = await Promise.all(
    customers.map((customer, index) =>
      timed(async () => {
        const data = await reserveScenario(customer.id, created.seatIds[index]);
        if (data?.reservation_id) stageReservationIds.push(data.reservation_id);
        return data;
      }),
    ),
  );

  const summary = summarizeResults("reserve", concurrency, results);
  const validationBeforeCleanup = await validateReservationStage(customerIds);
  const cleanup = await cancelReservations(stageReservationIds);
  const validationAfterCleanup = await validateReservationStage(customerIds);

  summary.stageMs = round(performance.now() - stageStart);
  summary.over45s = summary.stageMs > loadConfig.maxStageMs;
  summary.validationBeforeCleanup = validationBeforeCleanup;
  summary.cleanup = cleanup;
  summary.validationAfterCleanup = validationAfterCleanup;

  return summary;
}

async function finalCleanup() {
  const reservationIds = [...created.reservationIds];

  if (reservationIds.length > 0) {
    await must(
      "cleanup orders",
      () => supabase.from("orders").delete().in("reservation_id", reservationIds),
    );
    await must(
      "cleanup reservations",
      () => supabase.from("reservations").delete().in("id", reservationIds),
    );
  }

  if (created.sessionId) {
    await must(
      "cleanup session seats",
      () => supabase.from("session_seats").delete().eq("session_id", created.sessionId),
    );
  }

  if (created.seatIds.length > 0) {
    await must("cleanup seats", () =>
      supabase.from("seats").delete().in("id", created.seatIds),
    );
  }

  if (created.ticketPriceId) {
    await must(
      "cleanup ticket price",
      () => supabase.from("ticket_prices").delete().eq("id", created.ticketPriceId),
    );
  }

  if (created.sectionId) {
    await must(
      "cleanup section",
      () => supabase.from("venue_sections").delete().eq("id", created.sectionId),
    );
  }

  if (created.sessionId) {
    await must(
      "cleanup session",
      () => supabase.from("event_sessions").delete().eq("id", created.sessionId),
    );
  }

  if (created.eventId) {
    await must("cleanup event", () =>
      supabase.from("events").delete().eq("id", created.eventId),
    );
  }

  if (created.venueId) {
    await must("cleanup venue", () =>
      supabase.from("venues").delete().eq("id", created.venueId),
    );
  }

  const customerIds = [...created.customerIds];
  if (customerIds.length > 0) {
    await must(
      "cleanup customers",
      () => supabase.from("customers").delete().in("id", customerIds),
    );
  }

  try {
    return await verifyCleanup();
  } catch (error) {
    return {
      verificationError: error.message,
      sessionSeatsRemaining: null,
      activeReservationsRemaining: null,
      customersRemaining: null,
    };
  }
}

async function verifyCleanup() {
  const [sessionSeats, activeReservations, customers] = await Promise.all([
    created.sessionId
      ? must(
          "verify session seats",
          () => supabase
            .from("session_seats")
            .select("id", { count: "exact", head: true })
            .eq("session_id", created.sessionId),
        )
      : null,
    created.reservationIds.size
      ? must(
          "verify reservations",
          () => supabase
            .from("reservations")
            .select("id, status")
            .in("id", [...created.reservationIds])
            .eq("status", "active"),
        )
      : [],
    created.customerIds.size
      ? must(
          "verify customers",
          () => supabase
            .from("customers")
            .select("id")
            .in("id", [...created.customerIds]),
        )
      : [],
  ]);

  return {
    sessionSeatsRemaining: Array.isArray(sessionSeats) ? sessionSeats.length : 0,
    activeReservationsRemaining: activeReservations.length,
    customersRemaining: customers.length,
  };
}

async function main() {
  if (!loadConfig) {
    return;
  }

  const startedAt = new Date().toISOString();
  const results = {
    runId,
    startedAt,
    loadProfile: loadConfig.loadProfile,
    seatCount: loadConfig.seatCount,
    readConcurrency: loadConfig.readConcurrency,
    reserveConcurrency: loadConfig.reserveConcurrency,
    maxStageMs: loadConfig.maxStageMs,
    read: [],
    reserve: [],
    cleanup: null,
  };

  try {
    await setupCatalog();

    for (const concurrency of loadConfig.readConcurrency) {
      const summary = await runReadLoad(concurrency);
      results.read.push(summary);
    }

    for (const concurrency of loadConfig.reserveConcurrency) {
      if (concurrency > created.seatIds.length) {
        results.reserve.push({
          name: "reserve",
          concurrency,
          skipped: true,
          reason: "not_enough_test_seats",
        });
        continue;
      }

      const summary = await runReserveLoad(concurrency, concurrency);
      results.reserve.push(summary);
    }
  } finally {
    results.cleanup = await finalCleanup();
  }

  results.finishedAt = new Date().toISOString();
  results.pass =
    results.read.every((stage) => stage.unexpectedFailures === 0) &&
    results.reserve
      .filter((stage) => !stage.skipped)
      .every(
        (stage) =>
          stage.unexpectedFailures === 0 &&
          stage.validationBeforeCleanup.duplicateActiveCustomers === 0 &&
          stage.validationBeforeCleanup.duplicateSeatReservations === 0 &&
          stage.validationBeforeCleanup.reservedSessionSeatDuplicates === 0 &&
          stage.validationAfterCleanup.activeReservations === 0,
      ) &&
    results.cleanup.activeReservationsRemaining === 0 &&
    results.cleanup.sessionSeatsRemaining === 0;

  console.log(JSON.stringify(results, null, 2));

  if (!results.pass) {
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error(
    JSON.stringify(
      {
        ok: false,
        runId,
        error: error.message,
      },
      null,
      2,
    ),
  );
  process.exitCode = 1;
});
