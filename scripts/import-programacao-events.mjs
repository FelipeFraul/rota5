import { readFile } from "node:fs/promises";
import { createClient } from "@supabase/supabase-js";

const APPLY = process.argv.includes("--apply");
const SUMMARY = process.argv.includes("--summary");
const VERIFY = process.argv.includes("--verify");
const VENUE = "Black House";
const CITY = "Sorocaba";
const STATE = "SP";

function normalize(value) {
  return value
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

function slugify(value) {
  return normalize(value)
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function parseMoney(value) {
  const amount = Number(value.replace(/[^0-9,]/g, "").replace(",", "."));
  if (!Number.isFinite(amount) || amount < 0) throw new Error(`Preço inválido: ${value}`);
  return Math.round(amount * 100);
}

function inferTicketType(label) {
  const text = normalize(label);
  if (/\b(meia|estudante|senior|idoso|pcd|professor)\b/.test(text)) return "half";
  if (/\b(cortesia|gratis|gratuito|free)\b/.test(text)) return "free";
  if (/\b(promocional|promo)\b/.test(text)) return "promotional";
  return "full";
}

function capacityFor(label) {
  const text = normalize(label);
  if (text.includes("mesa 2 lugares")) return 1;
  if (text.includes("mesa 4 lugares")) return 1;
  if (/\b1[^a-z0-9]?\s*fileira\b/.test(text)) return 5;
  return 15;
}

function parseDate(value) {
  const match = normalize(value).match(
    /^(\d{1,2})\s+(jun|jul)\s+-?\s*(\d{4}).*?(\d{1,2}):(\d{2})$/,
  );
  if (!match) throw new Error(`Data inválida: ${value}`);
  const [, day, monthName, year, hour, minute] = match;
  const month = monthName === "jun" ? "06" : "07";
  return new Date(
    `${year}-${month}-${day.padStart(2, "0")}T${hour.padStart(2, "0")}:${minute}:00-03:00`,
  ).toISOString();
}

function parseProgramacao(source) {
  return source
    .split(/^---\s*$/m)
    .map((block) => block.trim())
    .filter(Boolean)
    .map((block) => {
      const lines = block.split(/\r?\n/).map((line) => line.trim());
      const nonempty = lines.filter(Boolean);
      const [title, artistName, dateLine] = nonempty;
      if (!title || !artistName || !dateLine) throw new Error(`Bloco incompleto: ${block.slice(0, 80)}`);

      let cursor = 3;
      let imageUrl = null;
      if (/^https?:\/\//i.test(nonempty[cursor] ?? "")) {
        imageUrl = nonempty[cursor];
        cursor += 1;
      } else if (normalize(nonempty[cursor] ?? "").includes("deixa sem foto")) {
        cursor += 1;
      }

      const offerStart = nonempty.findIndex(
        (line, index) => index >= cursor && /^R\$\s*[\d.,]+$/i.test(nonempty[index + 1] ?? ""),
      );
      if (offerStart < 0) throw new Error(`Ingressos não encontrados em ${title}`);

      const description = nonempty.slice(cursor, offerStart).join("\n\n") || null;
      const offers = [];
      for (let index = offerStart; index < nonempty.length; index += 2) {
        const label = nonempty[index];
        const price = nonempty[index + 1];
        if (!label || !price || !/^R\$\s*[\d.,]+$/i.test(price)) {
          throw new Error(`Oferta inválida em ${title}: ${label ?? "fim do arquivo"}`);
        }
        offers.push({
          label,
          priceCents: parseMoney(price),
          feeCents: 0,
          capacity: capacityFor(label),
          ticketType: inferTicketType(label),
        });
      }

      return {
        title,
        artistName,
        startsAt: parseDate(dateLine),
        imageUrl,
        description,
        status: imageUrl ? "published" : "draft",
        offers,
      };
    });
}

function assertProgramacao(events) {
  if (events.length !== 26) throw new Error(`Esperados 26 eventos; encontrados ${events.length}`);
  const keys = new Set();
  for (const event of events) {
    const key = `${normalize(event.title)}|${event.startsAt}`;
    if (keys.has(key)) throw new Error(`Evento duplicado no arquivo: ${event.title}`);
    keys.add(key);
    if (!event.offers.length) throw new Error(`Evento sem ingresso: ${event.title}`);
    for (const offer of event.offers) {
      const label = normalize(offer.label);
      if (/\b1[^a-z0-9]?\s*fileira\b/.test(label) && offer.capacity !== 5) {
        throw new Error(`Capacidade incorreta para primeira fileira: ${event.title}`);
      }
      if (label.includes("mesa 2 lugares") && offer.capacity !== 1) {
        throw new Error(`Capacidade incorreta para mesa de 2: ${event.title}`);
      }
      if (label.includes("mesa 4 lugares") && offer.capacity !== 1) {
        throw new Error(`Capacidade incorreta para mesa de 4: ${event.title}`);
      }
    }
  }
  const drafts = events.filter((event) => event.status === "draft");
  if (drafts.length !== 3) throw new Error(`Esperados 3 rascunhos; encontrados ${drafts.length}`);
}

async function cleanupPartial(db, ids) {
  if (ids.sessionIds.length) await db.from("session_seats").delete().in("session_id", ids.sessionIds);
  if (ids.sectionIds.length) {
    await db.from("ticket_prices").delete().in("section_id", ids.sectionIds);
    await db.from("seats").delete().in("section_id", ids.sectionIds);
  }
  if (ids.sessionIds.length) await db.from("event_sessions").delete().in("id", ids.sessionIds);
  if (ids.sectionIds.length) await db.from("venue_sections").delete().in("id", ids.sectionIds);
  if (ids.eventId) await db.from("events").delete().eq("id", ids.eventId);
}

async function insertEvent(db, event, venueId, admin) {
  const ids = { eventId: null, sessionIds: [], sectionIds: [] };
  try {
    const { data: createdEvent, error: eventError } = await db
      .from("events")
      .insert({
        title: event.title,
        artist_name: event.artistName,
        description: event.description,
        city: CITY,
        state: STATE,
        venue_id: venueId,
        image_url: event.imageUrl,
        status: "draft",
        created_by_admin_user_id: admin.id,
        created_by_admin_phone: admin.phone,
      })
      .select("id")
      .single();
    if (eventError) throw eventError;
    ids.eventId = createdEvent.id;

    const { data: session, error: sessionError } = await db
      .from("event_sessions")
      .insert({
        event_id: createdEvent.id,
        venue_id: venueId,
        starts_at: event.startsAt,
        status: "scheduled",
      })
      .select("id")
      .single();
    if (sessionError) throw sessionError;
    ids.sessionIds.push(session.id);

    for (const [index, offer] of event.offers.entries()) {
      const baseSlug = slugify(`${event.title}-${offer.label}`) || `entrada-${index + 1}`;
      const slug = `${baseSlug}-${createdEvent.id.slice(0, 8)}`;
      const { data: section, error: sectionError } = await db
        .from("venue_sections")
        .insert({
          venue_id: venueId,
          name: offer.label,
          slug,
          capacity: offer.capacity,
          has_numbered_seats: false,
          sort_order: index,
          status: "active",
        })
        .select("id")
        .single();
      if (sectionError) throw sectionError;
      ids.sectionIds.push(section.id);

      const { error: priceError } = await db.from("ticket_prices").insert({
        session_id: session.id,
        section_id: section.id,
        ticket_type: offer.ticketType,
        label: offer.label,
        price_cents: offer.priceCents,
        fee_cents: 0,
        currency: "BRL",
        status: "active",
      });
      if (priceError) throw priceError;

      const seatRows = Array.from({ length: offer.capacity }, (_, seatIndex) => ({
        venue_id: venueId,
        section_id: section.id,
        row_label: null,
        seat_number: String(seatIndex + 1),
        seat_code: `${slug.toUpperCase()}-${String(seatIndex + 1).padStart(4, "0")}`,
        status: "active",
      }));
      const { data: seats, error: seatsError } = await db
        .from("seats")
        .insert(seatRows)
        .select("id, section_id");
      if (seatsError) throw seatsError;

      const { error: inventoryError } = await db.from("session_seats").insert(
        seats.map((seat) => ({
          session_id: session.id,
          seat_id: seat.id,
          section_id: seat.section_id,
          status: "available",
        })),
      );
      if (inventoryError) throw inventoryError;
    }

    if (event.status === "published") {
      const { error: sessionPublishError } = await db
        .from("event_sessions")
        .update({ status: "sales_open" })
        .eq("id", session.id);
      if (sessionPublishError) throw sessionPublishError;
      const { error: eventPublishError } = await db
        .from("events")
        .update({ status: "published" })
        .eq("id", createdEvent.id);
      if (eventPublishError) throw eventPublishError;
    }

    return { eventId: createdEvent.id, sessionId: session.id };
  } catch (error) {
    await cleanupPartial(db, ids);
    throw error;
  }
}

const source = await readFile(new URL("../programacao.md", import.meta.url), "utf8");
const events = parseProgramacao(source);
assertProgramacao(events);

const preview = events.map((event) => ({
  title: event.title,
  artist: event.artistName,
  startsAt: event.startsAt,
  status: event.status,
  offers: event.offers.map((offer) => ({
    label: offer.label,
    price: offer.priceCents / 100,
    capacity: offer.capacity,
  })),
}));

if (!APPLY && !VERIFY) {
  console.log(JSON.stringify(
    SUMMARY
      ? {
          mode: "dry-run",
          count: events.length,
          published: events.filter((event) => event.status === "published").length,
          drafts: events.filter((event) => event.status === "draft").map((event) => event.title),
          venue: VENUE,
          offers: events.reduce((total, event) => total + event.offers.length, 0),
          inventoryUnits: events.reduce(
            (total, event) => total + event.offers.reduce((sum, offer) => sum + offer.capacity, 0),
            0,
          ),
        }
      : { mode: "dry-run", count: events.length, venue: VENUE, preview },
    null,
    2,
  ));
  process.exit(0);
}

const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) throw new Error("SUPABASE_URL/SUPABASE_SERVICE_ROLE_KEY ausentes");
const db = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });

const { data: admins, error: adminError } = await db
  .from("admin_users")
  .select("id, phone, role, status")
  .eq("status", "active");
if (adminError) throw adminError;
if (admins.length !== 1 || admins[0].role !== "root") {
  throw new Error(`Esperado exatamente um Diretor ativo; encontrados ${admins.length}`);
}
const admin = admins[0];

let { data: venue, error: venueError } = await db
  .from("venues")
  .select("id")
  .ilike("name", VENUE)
  .ilike("city", CITY)
  .ilike("state", STATE)
  .limit(1)
  .maybeSingle();
if (venueError) throw venueError;
if (!venue && VERIFY) throw new Error("Black House não encontrada na verificação");
if (!venue) {
  const created = await db
    .from("venues")
    .insert({ name: VENUE, city: CITY, state: STATE, status: "active" })
    .select("id")
    .single();
  if (created.error) throw created.error;
  venue = created.data;
}

if (VERIFY) {
  const expectedByTitle = new Map(events.map((event) => [event.title, event]));
  const { data: storedEvents, error: storedEventsError } = await db
    .from("events")
    .select("id, title, artist_name, description, city, state, venue_id, image_url, status, created_by_admin_user_id, created_by_admin_phone")
    .in("title", [...expectedByTitle.keys()])
    .eq("venue_id", venue.id)
    .eq("created_by_admin_user_id", admin.id);
  if (storedEventsError) throw storedEventsError;
  if (storedEvents.length !== events.length) {
    throw new Error(`Esperados ${events.length} eventos gravados; encontrados ${storedEvents.length}`);
  }

  const eventIds = storedEvents.map((event) => event.id);
  const { data: sessions, error: sessionsError } = await db
    .from("event_sessions")
    .select("id, event_id, starts_at, status, venue_id")
    .in("event_id", eventIds);
  if (sessionsError) throw sessionsError;
  if (sessions.length !== events.length) throw new Error(`Esperadas 26 sessões; encontradas ${sessions.length}`);

  const sessionIds = sessions.map((session) => session.id);
  const { data: prices, error: pricesError } = await db
    .from("ticket_prices")
    .select("session_id, section_id, label, ticket_type, price_cents, fee_cents, status, venue_sections(name, capacity)")
    .in("session_id", sessionIds);
  if (pricesError) throw pricesError;
  const expectedOfferCount = events.reduce((sum, event) => sum + event.offers.length, 0);
  if (prices.length !== expectedOfferCount) {
    throw new Error(`Esperados ${expectedOfferCount} preços; encontrados ${prices.length}`);
  }

  const { count: inventoryCount, error: inventoryError } = await db
    .from("session_seats")
    .select("id", { count: "exact", head: true })
    .in("session_id", sessionIds)
    .eq("status", "available");
  if (inventoryError) throw inventoryError;
  const expectedInventory = events.reduce(
    (sum, event) => sum + event.offers.reduce((subtotal, offer) => subtotal + offer.capacity, 0),
    0,
  );
  if (inventoryCount !== expectedInventory) {
    throw new Error(`Esperado estoque ${expectedInventory}; encontrado ${inventoryCount}`);
  }

  for (const stored of storedEvents) {
    const expected = expectedByTitle.get(stored.title);
    if (!expected) throw new Error(`Evento inesperado: ${stored.title}`);
    if (
      stored.artist_name !== expected.artistName ||
      stored.city !== CITY ||
      stored.state !== STATE ||
      stored.status !== expected.status ||
      stored.image_url !== expected.imageUrl ||
      stored.created_by_admin_phone !== admin.phone
    ) throw new Error(`Dados divergentes no evento: ${stored.title}`);

    const session = sessions.find((item) => item.event_id === stored.id);
    const expectedSessionStatus = expected.status === "published" ? "sales_open" : "scheduled";
    if (
      !session ||
      new Date(session.starts_at).getTime() !== new Date(expected.startsAt).getTime() ||
      session.status !== expectedSessionStatus ||
      session.venue_id !== venue.id
    ) throw new Error(`Sessão divergente no evento: ${stored.title}`);

    const storedPrices = prices.filter((price) => price.session_id === session.id);
    if (storedPrices.length !== expected.offers.length) {
      throw new Error(`Quantidade de ofertas divergente em ${stored.title}`);
    }
    for (const offer of expected.offers) {
      const price = storedPrices.find((item) => item.label === offer.label);
      if (
        !price ||
        price.price_cents !== offer.priceCents ||
        price.fee_cents !== 0 ||
        price.status !== "active" ||
        price.venue_sections?.capacity !== offer.capacity
      ) throw new Error(`Oferta divergente em ${stored.title}: ${offer.label}`);
    }
  }

  console.log(JSON.stringify({
    verified: true,
    events: storedEvents.length,
    published: storedEvents.filter((event) => event.status === "published").length,
    drafts: storedEvents.filter((event) => event.status === "draft").map((event) => event.title),
    sessions: sessions.length,
    offers: prices.length,
    availableInventory: inventoryCount,
    feeCents: 0,
    venue: `${VENUE} - ${CITY}/${STATE}`,
    ownerPhoneLast4: admin.phone.slice(-4),
  }, null, 2));
  process.exit(0);
}

const results = [];
for (const event of events) {
  const { data: sameTitle, error: duplicateError } = await db
    .from("events")
    .select("id, title, event_sessions!inner(starts_at)")
    .ilike("title", event.title)
    .eq("city", CITY);
  if (duplicateError) throw duplicateError;
  const duplicate = (sameTitle ?? []).find((candidate) =>
    candidate.event_sessions?.some(
      (session) => new Date(session.starts_at).getTime() === new Date(event.startsAt).getTime(),
    ),
  );
  if (duplicate) {
    results.push({ title: event.title, status: "skipped_existing", eventId: duplicate.id });
    continue;
  }

  const created = await insertEvent(db, event, venue.id, admin);
  results.push({ title: event.title, status: "created", publication: event.status, ...created });
  console.log(`CREATED ${event.title}`);
}

console.log(JSON.stringify({ mode: "applied", count: results.length, results }, null, 2));
