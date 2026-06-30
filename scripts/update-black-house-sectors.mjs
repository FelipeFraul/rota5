import { createClient } from "@supabase/supabase-js";

const APPLY = process.argv.includes("--apply");
const VERIFY = process.argv.includes("--verify");

const PLACES = [
  { key: "chair_half", name: "Cadeira meia", slug: "cadeira-individual-todos-pagam-meia", capacity: 15 },
  { key: "front_row", name: "1ª Fileira", slug: "primeira-fileira-com-balcao", capacity: 5 },
  { key: "table_2", name: "Mesa 2 lugares", slug: "poltrona-mesa-2-lugares", capacity: 1 },
  { key: "table_4", name: "Mesa 4 lugares", slug: "poltrona-mesa-4-lugares", capacity: 1 },
  { key: "chair_full", name: "Cadeira inteira", slug: "cadeira-individual-inteira", capacity: 15 },
];

function normalize(value) {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

function placeKeyForLabel(label) {
  const value = normalize(label);
  if (value === "poltrona+mesa 2 lugares (1 deste vale para 2)") return "table_2";
  if (value === "poltrona+mesa 4 lugares (1 deste vale para 4)") return "table_4";
  if (value === "1ª fileira (com balcao) - cadeira individual") return "front_row";
  if (value === "cadeira individual (todos pagam meia)") return "chair_half";
  if (value === "cadeira individual (inteira)") return "chair_full";
  return null;
}

const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) throw new Error("SUPABASE_URL/SUPABASE_SERVICE_ROLE_KEY ausentes");
const db = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });

async function loadScope() {
  const { data: venue, error: venueError } = await db
    .from("venues")
    .select("id, name")
    .ilike("name", "Black House")
    .ilike("city", "Sorocaba")
    .maybeSingle();
  if (venueError || !venue) throw venueError ?? new Error("Black House não encontrada");

  const { data: events, error: eventsError } = await db
    .from("events")
    .select("id, title, event_sessions(id)")
    .eq("venue_id", venue.id);
  if (eventsError) throw eventsError;
  const sessionIds = (events ?? []).flatMap((event) => event.event_sessions ?? []).map((session) => session.id);

  const { data: prices, error: pricesError } = await db
    .from("ticket_prices")
    .select("id, session_id, section_id, label")
    .in("session_id", sessionIds);
  if (pricesError) throw pricesError;

  return { venue, events: events ?? [], sessionIds, prices: prices ?? [] };
}

async function ensureCanonicalPlaces(venueId) {
  const result = new Map();

  for (const [sortOrder, place] of PLACES.entries()) {
    let { data: section, error } = await db
      .from("venue_sections")
      .select("id, name, slug, capacity")
      .eq("venue_id", venueId)
      .eq("slug", place.slug)
      .maybeSingle();
    if (error) throw error;

    if (!section) {
      const created = await db
        .from("venue_sections")
        .insert({
          venue_id: venueId,
          name: place.name,
          slug: place.slug,
          capacity: place.capacity,
          has_numbered_seats: false,
          sort_order: sortOrder,
          status: "active",
        })
        .select("id, name, slug, capacity")
        .single();
      if (created.error) throw created.error;
      section = created.data;
    } else {
      const updated = await db
        .from("venue_sections")
        .update({ name: place.name, capacity: place.capacity, sort_order: sortOrder, status: "active" })
        .eq("id", section.id)
        .select("id, name, slug, capacity")
        .single();
      if (updated.error) throw updated.error;
      section = updated.data;
    }

    const { data: existingSeats, error: seatsError } = await db
      .from("seats")
      .select("id, seat_number, seat_code")
      .eq("section_id", section.id)
      .order("seat_number");
    if (seatsError) throw seatsError;

    let seats = existingSeats ?? [];
    if (seats.length < place.capacity) {
      const rows = Array.from({ length: place.capacity - seats.length }, (_, index) => {
        const number = seats.length + index + 1;
        return {
          venue_id: venueId,
          section_id: section.id,
          row_label: null,
          seat_number: String(number).padStart(3, "0"),
          seat_code: `BH-${place.key.toUpperCase()}-${String(number).padStart(3, "0")}`,
          status: "active",
        };
      });
      const inserted = await db.from("seats").insert(rows).select("id, seat_number, seat_code");
      if (inserted.error) throw inserted.error;
      seats = [...seats, ...(inserted.data ?? [])];
    }

    result.set(place.key, { ...place, sectionId: section.id, seats: seats.slice(0, place.capacity) });
  }

  return result;
}

async function verify() {
  const scope = await loadScope();
  const { data: sections, error: sectionsError } = await db
    .from("venue_sections")
    .select("id, name, slug, capacity, seats(id), ticket_prices(id, session_id, label), session_seats(id, session_id, status)")
    .eq("venue_id", scope.venue.id)
    .in("slug", PLACES.map((place) => place.slug))
    .order("sort_order");
  if (sectionsError) throw sectionsError;

  const canonicalSectionIds = new Set((sections ?? []).map((section) => section.id));
  const standardPrices = scope.prices.filter((price) => placeKeyForLabel(price.label));
  const pricesOutside = standardPrices.filter((price) => !canonicalSectionIds.has(price.section_id));
  const expectedInventory = new Map();
  for (const price of standardPrices) {
    const keyName = placeKeyForLabel(price.label);
    expectedInventory.set(`${price.session_id}:${keyName}`, true);
  }
  const expectedInventoryCount = [...expectedInventory.keys()].reduce((total, keyName) => {
    const placeKey = keyName.slice(keyName.lastIndexOf(":") + 1);
    return total + PLACES.find((place) => place.key === placeKey).capacity;
  }, 0);
  const inventoryCount = (sections ?? []).reduce(
    (total, section) => total + (section.session_seats ?? []).length,
    0,
  );

  const summary = {
    mode: "verify",
    events: scope.events.length,
    sessions: scope.sessionIds.length,
    canonicalSections: (sections ?? []).map((section) => ({
      name: section.name,
      capacity: section.capacity,
      seats: (section.seats ?? []).length,
      offers: (section.ticket_prices ?? []).length,
      inventory: (section.session_seats ?? []).length,
    })),
    prices: standardPrices.length,
    pricesOutsideCanonicalSections: pricesOutside.length,
    expectedInventory: expectedInventoryCount,
    inventory: inventoryCount,
  };

  if ((sections ?? []).length !== PLACES.length) {
    throw new Error(`Esperados ${PLACES.length} setores; encontrados ${(sections ?? []).length}`);
  }
  if (pricesOutside.length) throw new Error(`${pricesOutside.length} ofertas ainda estão fora dos setores canônicos`);
  if (inventoryCount !== expectedInventoryCount) {
    throw new Error(`Estoque esperado ${expectedInventoryCount}; encontrado ${inventoryCount}`);
  }
  console.log(JSON.stringify(summary, null, 2));
}

if (VERIFY) {
  await verify();
  process.exit(0);
}

const scope = await loadScope();
const mapping = scope.prices
  .map((price) => ({ ...price, placeKey: placeKeyForLabel(price.label) }))
  .filter((price) => price.placeKey);
const grouped = Object.fromEntries(
  PLACES.map((place) => [
    place.name,
    mapping.filter((price) => price.placeKey === place.key).map((price) => price.label),
  ]),
);

if (!APPLY) {
  console.log(JSON.stringify({
    mode: "dry-run",
    events: scope.events.length,
    sessions: scope.sessionIds.length,
    offers: mapping.length,
    targetSections: PLACES.map(({ name, capacity }) => ({ name, capacity })),
    groupedOffers: Object.fromEntries(
      Object.entries(grouped).map(([name, labels]) => [name, [...new Set(labels)]]),
    ),
  }, null, 2));
  process.exit(0);
}

const canonical = await ensureCanonicalPlaces(scope.venue.id);
const canonicalSectionIds = new Set([...canonical.values()].map((place) => place.sectionId));

const inventoryBySessionPlace = new Map();
for (const price of mapping) {
  const keyName = `${price.session_id}:${price.placeKey}`;
  if (inventoryBySessionPlace.has(keyName)) continue;
  const place = canonical.get(price.placeKey);
  const rows = place.seats.map((seat) => ({
    session_id: price.session_id,
    seat_id: seat.id,
    section_id: place.sectionId,
    status: "available",
  }));
  const inserted = await db
    .from("session_seats")
    .upsert(rows, { onConflict: "session_id,seat_id", ignoreDuplicates: true })
    .select("id, session_id, seat_id, section_id, status");
  if (inserted.error) throw inserted.error;

  const { data: inventory, error: inventoryError } = await db
    .from("session_seats")
    .select("id, session_id, seat_id, section_id, status")
    .eq("session_id", price.session_id)
    .eq("section_id", place.sectionId);
  if (inventoryError) throw inventoryError;
  inventoryBySessionPlace.set(keyName, inventory ?? []);
}

const priceById = new Map(mapping.map((price) => [price.id, price]));
const { data: reservations, error: reservationsError } = await db
  .from("reservations")
  .select("id, session_id, status, reservation_items(id, ticket_price_id, session_seat_id, seat_id, section_id, seat_code)")
  .in("session_id", scope.sessionIds)
  .order("created_at");
if (reservationsError) throw reservationsError;

const activeIndexes = new Map();
const activeTargetsByReservation = new Map();
for (const reservation of [...(reservations ?? [])].sort(
  (a, b) => Number(b.status === "active") - Number(a.status === "active"),
)) {
  const localIndexes = new Map();
  for (const item of reservation.reservation_items ?? []) {
    const price = priceById.get(item.ticket_price_id);
    if (!price) throw new Error(`Preço da reserva não encontrado: ${item.ticket_price_id}`);
    const place = canonical.get(price.placeKey);
    const keyName = `${reservation.session_id}:${price.placeKey}`;
    const inventory = inventoryBySessionPlace.get(keyName) ?? [];
    const indexMap = reservation.status === "active" ? activeIndexes : localIndexes;
    const index = indexMap.get(keyName) ?? 0;
    const target = inventory[index];
    if (!target) throw new Error(`Capacidade insuficiente para preservar reserva ${reservation.id}`);
    indexMap.set(keyName, index + 1);
    const seat = place.seats.find((candidate) => candidate.id === target.seat_id);

    const updated = await db
      .from("reservation_items")
      .update({
        session_seat_id: target.id,
        seat_id: target.seat_id,
        section_id: place.sectionId,
        seat_code: seat.seat_code,
      })
      .eq("id", item.id);
    if (updated.error) throw updated.error;

    if (reservation.status === "active") {
      const activeTargets = activeTargetsByReservation.get(reservation.id) ?? new Set();
      activeTargets.add(target.id);
      activeTargetsByReservation.set(reservation.id, activeTargets);
      const reserved = await db
        .from("session_seats")
        .update({ status: "reserved", current_reservation_id: reservation.id })
        .eq("id", target.id);
      if (reserved.error) throw reserved.error;
    }
  }
}

for (const [reservationId, targetIds] of activeTargetsByReservation) {
  const { data: reservedSeats, error: reservedSeatsError } = await db
    .from("session_seats")
    .select("id")
    .eq("status", "reserved")
    .eq("current_reservation_id", reservationId);
  if (reservedSeatsError) throw reservedSeatsError;
  const staleIds = (reservedSeats ?? [])
    .map((seat) => seat.id)
    .filter((seatId) => !targetIds.has(seatId));
  if (staleIds.length) {
    const released = await db
      .from("session_seats")
      .update({ status: "available", current_reservation_id: null })
      .in("id", staleIds);
    if (released.error) throw released.error;
  }
}

for (const price of mapping) {
  const updated = await db
    .from("ticket_prices")
    .update({ section_id: canonical.get(price.placeKey).sectionId })
    .eq("id", price.id);
  if (updated.error) throw updated.error;
}

const { data: oldSections, error: oldSectionsError } = await db
  .from("venue_sections")
  .select("id")
  .eq("venue_id", scope.venue.id);
if (oldSectionsError) throw oldSectionsError;
const oldSectionIds = (oldSections ?? [])
  .map((section) => section.id)
  .filter((sectionId) => !canonicalSectionIds.has(sectionId));

if (oldSectionIds.length) {
  const deletedInventory = await db.from("session_seats").delete().in("section_id", oldSectionIds);
  if (deletedInventory.error) throw deletedInventory.error;
  const deletedSeats = await db.from("seats").delete().in("section_id", oldSectionIds);
  if (deletedSeats.error) throw deletedSeats.error;
  const deletedSections = await db.from("venue_sections").delete().in("id", oldSectionIds);
  if (deletedSections.error) throw deletedSections.error;
}

await verify();
