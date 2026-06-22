import { createClient } from "@supabase/supabase-js";

const APPLY = process.argv.includes("--apply");

function normalize(value) {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

function isStandardOffer(label) {
  return new Set([
    "cadeira individual (todos pagam meia)",
    "1ª fileira (com balcao) - cadeira individual",
    "poltrona+mesa 2 lugares (1 deste vale para 2)",
    "poltrona+mesa 4 lugares (1 deste vale para 4)",
    "cadeira individual (inteira)",
  ]).has(normalize(label));
}

function capacityForSpecial(label) {
  const value = normalize(label);
  if (value.includes("mesa 2 lugares") || value.includes("mesa 4 lugares")) return 1;
  if (value.includes("fileira") || value.includes("combo premium")) return 5;
  return 15;
}

const db = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const { data: venue, error: venueError } = await db
  .from("venues")
  .select("id")
  .ilike("name", "Black House")
  .ilike("city", "Sorocaba")
  .maybeSingle();
if (venueError || !venue) throw venueError ?? new Error("Black House não encontrada");

const { data: events, error: eventsError } = await db
  .from("events")
  .select("id, event_sessions(id)")
  .eq("venue_id", venue.id);
if (eventsError) throw eventsError;
const sessionIds = (events ?? []).flatMap((event) => event.event_sessions ?? []).map((session) => session.id);

const { data: prices, error: pricesError } = await db
  .from("ticket_prices")
  .select("id, session_id, section_id, label, price_cents, venue_sections(name, slug)")
  .in("session_id", sessionIds);
if (pricesError) throw pricesError;

const specials = (prices ?? [])
  .filter((price) => !isStandardOffer(price.label))
  .map((price) => ({ ...price, capacity: capacityForSpecial(price.label) }));
const specialPriceIds = specials.map((price) => price.id);

const { data: referencedItems, error: referencesError } = await db
  .from("reservation_items")
  .select("id, reservation_id, ticket_price_id")
  .in("ticket_price_id", specialPriceIds);
if (referencesError) throw referencesError;

const summary = {
  mode: APPLY ? "apply" : "dry-run",
  specials: specials.map((price) => ({
    label: price.label,
    capacity: price.capacity,
    priceCents: price.price_cents,
  })),
  totalSpecialCapacity: specials.reduce((total, price) => total + price.capacity, 0),
  referencedReservationItems: (referencedItems ?? []).length,
};

if (!APPLY) {
  console.log(JSON.stringify(summary, null, 2));
  process.exit(0);
}

if ((referencedItems ?? []).length) {
  throw new Error("Há itens de reserva ligados às ofertas especiais; migração interrompida");
}

const sourcePairs = new Map();
for (const price of specials) {
  const targetSlug = `special-offer-${price.id}`;
  const currentSection = Array.isArray(price.venue_sections)
    ? price.venue_sections[0]
    : price.venue_sections;
  if (currentSection?.slug === targetSlug) continue;

  sourcePairs.set(`${price.session_id}:${price.section_id}`, {
    sessionId: price.session_id,
    sectionId: price.section_id,
  });

  const createdSection = await db
    .from("venue_sections")
    .insert({
      venue_id: venue.id,
      name: "Assento / item especial",
      slug: targetSlug,
      capacity: price.capacity,
      has_numbered_seats: false,
      sort_order: 100,
      status: "active",
    })
    .select("id")
    .single();
  if (createdSection.error) throw createdSection.error;

  const seatRows = Array.from({ length: price.capacity }, (_, index) => ({
    venue_id: venue.id,
    section_id: createdSection.data.id,
    row_label: null,
    seat_number: String(index + 1).padStart(3, "0"),
    seat_code: `BH-SPECIAL-${price.id.slice(0, 8).toUpperCase()}-${String(index + 1).padStart(3, "0")}`,
    status: "active",
  }));
  const createdSeats = await db.from("seats").insert(seatRows).select("id");
  if (createdSeats.error) throw createdSeats.error;

  const createdInventory = await db.from("session_seats").insert(
    createdSeats.data.map((seat) => ({
      session_id: price.session_id,
      seat_id: seat.id,
      section_id: createdSection.data.id,
      status: "available",
    })),
  );
  if (createdInventory.error) throw createdInventory.error;

  const updatedPrice = await db
    .from("ticket_prices")
    .update({ section_id: createdSection.data.id })
    .eq("id", price.id);
  if (updatedPrice.error) throw updatedPrice.error;
}

for (const { sessionId, sectionId } of sourcePairs.values()) {
  const { count, error } = await db
    .from("ticket_prices")
    .select("id", { count: "exact", head: true })
    .eq("session_id", sessionId)
    .eq("section_id", sectionId);
  if (error) throw error;
  if (count === 0) {
    const deleted = await db
      .from("session_seats")
      .delete()
      .eq("session_id", sessionId)
      .eq("section_id", sectionId);
    if (deleted.error) throw deleted.error;
  }
}

const { data: emptySpecialSections, error: emptySectionsError } = await db
  .from("venue_sections")
  .select("id, ticket_prices(id)")
  .eq("venue_id", venue.id)
  .eq("name", "Assento / item especial");
if (emptySectionsError) throw emptySectionsError;

for (const section of emptySpecialSections ?? []) {
  if ((section.ticket_prices ?? []).length) continue;
  const deletedInventory = await db.from("session_seats").delete().eq("section_id", section.id);
  if (deletedInventory.error) throw deletedInventory.error;
  const deletedSeats = await db.from("seats").delete().eq("section_id", section.id);
  if (deletedSeats.error) throw deletedSeats.error;
  const deletedSection = await db.from("venue_sections").delete().eq("id", section.id);
  if (deletedSection.error) throw deletedSection.error;
}

console.log(JSON.stringify(summary, null, 2));
