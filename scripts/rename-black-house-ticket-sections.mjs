import { createClient } from "@supabase/supabase-js";

const APPLY = process.argv.includes("--apply");

const SECTION_RENAMES = [
  {
    from: ["Cadeira Individual (TODOS pagam meia)", "Cadeira meia"],
    to: "Cadeira meia",
    slug: "cadeira-individual-todos-pagam-meia",
  },
  {
    from: ["1ª FILEIRA (com balcão)", "1ª Fileira"],
    to: "1ª Fileira",
    slug: "primeira-fileira-com-balcao",
  },
  {
    from: ["Poltrona+Mesa 2 lugares", "Mesa 2 lugares"],
    to: "Mesa 2 lugares",
    slug: "poltrona-mesa-2-lugares",
  },
  {
    from: ["Poltrona+Mesa 4 lugares", "Mesa 4 lugares"],
    to: "Mesa 4 lugares",
    slug: "poltrona-mesa-4-lugares",
  },
  {
    from: ["Cadeira Individual (Inteira)", "Cadeira inteira"],
    to: "Cadeira inteira",
    slug: "cadeira-individual-inteira",
  },
];

const TICKET_LABELS = [
  {
    aliases: ["Cadeira Individual (TODOS pagam meia)", "Cadeira meia"],
    label: "Cadeira Individual (TODOS pagam meia)",
  },
  {
    aliases: [
      "1ª FILEIRA (com balcão)",
      "1ª Fileira",
      "1ª FILEIRA (com balcão) - cadeira Individual",
    ],
    label: "1ª FILEIRA (com balcão) - cadeira Individual",
  },
  {
    aliases: [
      "Poltrona+Mesa 2 lugares",
      "Mesa 2 lugares",
      "Poltrona+Mesa 2 lugares (1 deste vale para 2)",
    ],
    label: "Poltrona+Mesa 2 lugares (1 deste vale para 2)",
  },
  {
    aliases: [
      "Poltrona+Mesa 4 lugares",
      "Mesa 4 lugares",
      "Poltrona+Mesa 4 lugares (1 deste vale para 4)",
    ],
    label: "Poltrona+Mesa 4 lugares (1 deste vale para 4)",
  },
  {
    aliases: ["Cadeira Individual (Inteira)", "Cadeira inteira"],
    label: "Cadeira Individual (Inteira)",
  },
];

const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) throw new Error("SUPABASE_URL/SUPABASE_SERVICE_ROLE_KEY ausentes");

const db = createClient(url, key, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const { data: venue, error: venueError } = await db
  .from("venues")
  .select("id, name")
  .ilike("name", "Black House")
  .ilike("city", "Sorocaba")
  .maybeSingle();

if (venueError || !venue) {
  throw venueError ?? new Error("Black House não encontrada");
}

const { data: sections, error: sectionsError } = await db
  .from("venue_sections")
  .select("id, name, slug")
  .eq("venue_id", venue.id)
  .or(
    SECTION_RENAMES.flatMap((item) => [
      `slug.eq.${item.slug}`,
      ...item.from.map((name) => `name.eq.${name}`),
    ]).join(","),
  )
  .order("sort_order");

if (sectionsError) throw sectionsError;

const sectionUpdates = [];
for (const section of sections ?? []) {
  const match = SECTION_RENAMES.find(
    (item) => item.slug === section.slug || item.from.includes(section.name),
  );
  if (!match || section.name === match.to) continue;
  sectionUpdates.push({ id: section.id, from: section.name, to: match.to });
}

const { data: prices, error: pricesError } = await db
  .from("ticket_prices")
  .select("id, label")
  .in("label", [...new Set(TICKET_LABELS.flatMap((item) => item.aliases))]);

if (pricesError) throw pricesError;

const priceUpdates = [];
for (const price of prices ?? []) {
  const match = TICKET_LABELS.find((item) => item.aliases.includes(price.label));
  if (!match || price.label === match.label) continue;
  priceUpdates.push({ id: price.id, from: price.label, to: match.label });
}

if (!APPLY) {
  console.log(
    JSON.stringify(
      {
        mode: "dry-run",
        sectionsToRename: sectionUpdates.length,
        ticketLabelsToRename: priceUpdates.length,
        sectionUpdates,
        ticketLabelSamples: priceUpdates.slice(0, 20),
      },
      null,
      2,
    ),
  );
  process.exit(0);
}

for (const update of sectionUpdates) {
  const { error } = await db
    .from("venue_sections")
    .update({ name: update.to })
    .eq("id", update.id);
  if (error) throw error;
}

for (const update of priceUpdates) {
  const { error } = await db
    .from("ticket_prices")
    .update({ label: update.to })
    .eq("id", update.id);
  if (error) throw error;
}

const { data: renamedSections, error: renamedSectionsError } = await db
  .from("venue_sections")
  .select("name")
  .eq("venue_id", venue.id)
  .in("name", SECTION_RENAMES.map((item) => item.to));
if (renamedSectionsError) throw renamedSectionsError;

const { data: renamedPrices, error: renamedPricesError } = await db
  .from("ticket_prices")
  .select("label")
  .in("label", TICKET_LABELS.map((item) => item.label));
if (renamedPricesError) throw renamedPricesError;

console.log(
  JSON.stringify(
    {
      mode: "applied",
      sectionsRenamed: sectionUpdates.length,
      ticketLabelsRenamed: priceUpdates.length,
      sectionNames: [...new Set((renamedSections ?? []).map((row) => row.name))],
      ticketLabels: [...new Set((renamedPrices ?? []).map((row) => row.label))],
    },
    null,
    2,
  ),
);
