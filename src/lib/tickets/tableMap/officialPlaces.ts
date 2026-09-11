export type OfficialTableMapPlaceType = "bistr?" | "table";
export type OfficialTableMapEnvironment = "ground_floor" | "mezzanine";

export type OfficialTableMapPlace = {
  code: string;
  type: OfficialTableMapPlaceType;
  environment: OfficialTableMapEnvironment;
  capacity: 2 | 4 | 6 | 8;
  x: number;
  y: number;
  labelSize?: number;
};

export type OfficialTableMapPlaceMetadata = Omit<OfficialTableMapPlace, "x" | "y" | "labelSize">;

export const OFFICIAL_TABLE_MAP_WIDTH = 969;
export const OFFICIAL_TABLE_MAP_HEIGHT = 1371;
export const OFFICIAL_TABLE_MAP_ASSET = "public/mapa_mesas.webp";

export const OFFICIAL_TABLE_MAP_MARKER_VISUAL = {
  width: 64,
  height: 52,
  fontFamily: "Bebas Neue",
  fontWeight: 700,
  fontSize: 40,
  lineHeight: 1,
  tableColor: "#bf151a",
  bistroColor: "#1f7888",
  unavailableColor: "#ffffff",
  textShadowColor: "#ffffff",
  unavailableTextShadowColor: "#dc2626",
} as const;

export const OFFICIAL_TABLE_MAP_PLACES: readonly OfficialTableMapPlaceMetadata[] = [
  { code: "01", type: "bistr?", environment: "ground_floor", capacity: 6 },
  { code: "02", type: "bistr?", environment: "ground_floor", capacity: 2 },
  { code: "03", type: "bistr?", environment: "ground_floor", capacity: 6 },
  { code: "04", type: "bistr?", environment: "ground_floor", capacity: 6 },
  { code: "05", type: "bistr?", environment: "ground_floor", capacity: 6 },
  { code: "06", type: "bistr?", environment: "ground_floor", capacity: 4 },
  { code: "07", type: "bistr?", environment: "ground_floor", capacity: 4 },
  { code: "08", type: "bistr?", environment: "ground_floor", capacity: 4 },
  { code: "09", type: "bistr?", environment: "ground_floor", capacity: 6 },
  { code: "10", type: "bistr?", environment: "ground_floor", capacity: 2 },
  { code: "11", type: "bistr?", environment: "ground_floor", capacity: 6 },
  { code: "12", type: "bistr?", environment: "ground_floor", capacity: 4 },
  { code: "13", type: "bistr?", environment: "ground_floor", capacity: 2 },

  { code: "20", type: "table", environment: "mezzanine", capacity: 8 },
  { code: "21", type: "table", environment: "mezzanine", capacity: 2 },
  { code: "22", type: "table", environment: "mezzanine", capacity: 2 },
  { code: "23", type: "table", environment: "mezzanine", capacity: 4 },
  { code: "24", type: "table", environment: "mezzanine", capacity: 4 },
  { code: "25", type: "table", environment: "mezzanine", capacity: 4 },
  { code: "26", type: "table", environment: "mezzanine", capacity: 4 },
  { code: "27", type: "table", environment: "mezzanine", capacity: 4 },
  { code: "28", type: "table", environment: "mezzanine", capacity: 4 },
  { code: "29", type: "table", environment: "mezzanine", capacity: 2 },
  { code: "30", type: "table", environment: "mezzanine", capacity: 2 },
  { code: "31", type: "table", environment: "mezzanine", capacity: 2 },
  { code: "32", type: "table", environment: "mezzanine", capacity: 2 },
  { code: "33", type: "table", environment: "mezzanine", capacity: 2 },
  { code: "40", type: "table", environment: "mezzanine", capacity: 2 },
  { code: "41", type: "table", environment: "mezzanine", capacity: 8 },
  { code: "42", type: "bistr?", environment: "mezzanine", capacity: 4 },
  { code: "43", type: "bistr?", environment: "mezzanine", capacity: 4 },
  { code: "44", type: "bistr?", environment: "mezzanine", capacity: 4 },
  { code: "45", type: "bistr?", environment: "mezzanine", capacity: 4 },
  { code: "46", type: "table", environment: "mezzanine", capacity: 8 },
  { code: "51", type: "table", environment: "mezzanine", capacity: 4 },
  { code: "52", type: "table", environment: "mezzanine", capacity: 4 },
  { code: "53", type: "bistr?", environment: "mezzanine", capacity: 4 },
  { code: "54", type: "table", environment: "mezzanine", capacity: 4 },
  { code: "55", type: "table", environment: "mezzanine", capacity: 4 },
  { code: "56", type: "table", environment: "mezzanine", capacity: 4 },
] as const;

export function getOfficialTableMapPlace(code: string) {
  return OFFICIAL_TABLE_MAP_PLACES.find((place) => place.code === code) ?? null;
}

export function normalizeOfficialTableMapCode(code: string) {
  return code.trim().padStart(2, "0");
}
