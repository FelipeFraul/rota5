import { getSupabaseAdmin } from "@/lib/supabase/admin";
import {
  OFFICIAL_TABLE_MAP_HEIGHT,
  OFFICIAL_TABLE_MAP_PLACES,
  OFFICIAL_TABLE_MAP_WIDTH,
  type OfficialTableMapPlace,
} from "@/lib/tickets/tableMap/officialPlaces";

type CoordinateRow = {
  code: string;
  x: number;
  y: number;
};

function coordinatesAreValid(places: readonly OfficialTableMapPlace[]) {
  if (places.length !== OFFICIAL_TABLE_MAP_PLACES.length) return false;
  if (new Set(places.map((place) => place.code)).size !== OFFICIAL_TABLE_MAP_PLACES.length) return false;

  return places.every((place) =>
    Number.isInteger(place.x) &&
    Number.isInteger(place.y) &&
    place.x >= 0 &&
    place.x <= OFFICIAL_TABLE_MAP_WIDTH &&
    place.y >= 0 &&
    place.y <= OFFICIAL_TABLE_MAP_HEIGHT
  );
}

export async function getOfficialTableMapPlaces() {
  try {
    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase
      .from("official_table_map_places")
      .select("code,x,y")
      .order("code", { ascending: true })
      .returns<CoordinateRow[]>();

    if (error || !data || data.length !== OFFICIAL_TABLE_MAP_PLACES.length) {
      return OFFICIAL_TABLE_MAP_PLACES;
    }

    const coordinatesByCode = new Map(
      data.map((row) => [
        row.code.padStart(2, "0"),
        { x: Math.round(Number(row.x)), y: Math.round(Number(row.y)) },
      ]),
    );
    const merged = OFFICIAL_TABLE_MAP_PLACES.map((place) => {
      const coordinates = coordinatesByCode.get(place.code);
      return coordinates ? { ...place, ...coordinates } : place;
    });

    return coordinatesAreValid(merged) ? merged : OFFICIAL_TABLE_MAP_PLACES;
  } catch {
    return OFFICIAL_TABLE_MAP_PLACES;
  }
}
