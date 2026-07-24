import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

import { getSupabaseAdmin } from "@/lib/supabase/admin";
import {
  OFFICIAL_TABLE_MAP_HEIGHT,
  OFFICIAL_TABLE_MAP_PLACES,
  OFFICIAL_TABLE_MAP_WIDTH,
  type OfficialTableMapPlace,
} from "@/lib/tickets/tableMap/officialPlaces";
import { renderOfficialTableMap } from "@/lib/tickets/tableMap/renderOfficialTableMap";
import { getOfficialTableMapPlaces } from "@/lib/tickets/tableMap/officialPlaceCoordinates";

const previewDir = path.join(process.cwd(), ".tmp", "official-table-map");
const unavailableSample = ["03", "08", "21", "27", "41", "51"] as const;

type PersistOfficialPlacesResult =
  | { ok: true; places: readonly OfficialTableMapPlace[]; previews: string[] }
  | { ok: false; reason: "invalid_count" | "invalid_code" | "invalid_metadata" | "invalid_coordinate" | "database_error" };

function normalizePlaces(input: unknown): OfficialTableMapPlace[] | null {
  if (!Array.isArray(input) || input.length !== OFFICIAL_TABLE_MAP_PLACES.length) {
    return null;
  }

  return input.map((rawPlace) => {
    const place = rawPlace as Partial<OfficialTableMapPlace>;

    return {
      code: String(place.code ?? "").padStart(2, "0"),
      type: place.type,
      environment: place.environment,
      x: Math.round(Number(place.x)),
      y: Math.round(Number(place.y)),
      ...(Number.isFinite(Number(place.labelSize))
        ? { labelSize: Math.round(Number(place.labelSize)) }
        : {}),
    };
  }) as OfficialTableMapPlace[];
}

function validatePlaces(places: readonly OfficialTableMapPlace[] | null): PersistOfficialPlacesResult | null {
  if (!places) return { ok: false, reason: "invalid_count" };

  const originalByCode = new Map(OFFICIAL_TABLE_MAP_PLACES.map((place) => [place.code, place]));
  const codes = places.map((place) => place.code);

  if (new Set(codes).size !== OFFICIAL_TABLE_MAP_PLACES.length) {
    return { ok: false, reason: "invalid_code" };
  }

  for (const place of places) {
    const original = originalByCode.get(place.code);
    if (!original) return { ok: false, reason: "invalid_code" };
    if (place.type !== original.type || place.environment !== original.environment) {
      return { ok: false, reason: "invalid_metadata" };
    }
    if (
      !Number.isInteger(place.x) ||
      !Number.isInteger(place.y) ||
      place.x < 0 ||
      place.x > OFFICIAL_TABLE_MAP_WIDTH ||
      place.y < 0 ||
      place.y > OFFICIAL_TABLE_MAP_HEIGHT
    ) {
      return { ok: false, reason: "invalid_coordinate" };
    }
  }

  return null;
}

export async function regenerateOfficialTableMapPreviews(places: readonly OfficialTableMapPlace[]) {
  await mkdir(previewDir, { recursive: true });

  const cases: Array<[string, readonly string[]]> = [
    ["todos-disponiveis.webp", []],
    ["alguns-indisponiveis.webp", unavailableSample],
    ["todos-indisponiveis.webp", places.map((place) => place.code)],
  ];
  const previews: string[] = [];

  for (const [filename, unavailableCodes] of cases) {
    const rendered = await renderOfficialTableMap({ places, unavailableCodes });
    const targetPath = path.join(previewDir, filename);
    await writeFile(targetPath, rendered.buffer);
    previews.push(targetPath);
  }

  return previews;
}

export async function persistOfficialTableMapPlaces(input: unknown): Promise<PersistOfficialPlacesResult> {
  const places = normalizePlaces(input);
  const validation = validatePlaces(places);
  if (validation) return validation;
  if (!places) return { ok: false, reason: "invalid_count" };

  try {
    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase
      .from("official_table_map_places")
      .upsert(
        places.map((place) => ({ code: place.code, x: place.x, y: place.y })),
        { onConflict: "code" },
      )
      .select("code");

    if (error || !data || data.length !== places.length) {
      return { ok: false, reason: "database_error" };
    }
  } catch {
    return { ok: false, reason: "database_error" };
  }

  const savedPlaces = await getOfficialTableMapPlaces();
  const savedValidation = validatePlaces(savedPlaces);
  if (savedValidation) return savedValidation;

  let previews: string[] = [];
  if (process.env.NODE_ENV !== "production") {
    previews = await regenerateOfficialTableMapPreviews(savedPlaces);
  }

  return { ok: true, places: [...savedPlaces], previews };
}
