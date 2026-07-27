export type OfficialTableMapPlaceType = "bistro" | "table";
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

export const OFFICIAL_TABLE_MAP_WIDTH = 969;
export const OFFICIAL_TABLE_MAP_HEIGHT = 1371;
export const OFFICIAL_TABLE_MAP_ASSET = "public/mapa_mesas.webp";

export const OFFICIAL_TABLE_MAP_PLACES: readonly OfficialTableMapPlace[] = [
  { code: "01", type: "bistro", environment: "ground_floor", capacity: 6, x: 124, y: 469 },
  { code: "02", type: "bistro", environment: "ground_floor", capacity: 2, x: 92, y: 558 },
  { code: "03", type: "bistro", environment: "ground_floor", capacity: 6, x: 187, y: 505 },
  { code: "04", type: "bistro", environment: "ground_floor", capacity: 6, x: 281, y: 506 },
  { code: "05", type: "bistro", environment: "ground_floor", capacity: 6, x: 166, y: 621 },
  { code: "06", type: "bistro", environment: "ground_floor", capacity: 4, x: 324, y: 665 },
  { code: "07", type: "bistro", environment: "ground_floor", capacity: 4, x: 166, y: 701 },
  { code: "08", type: "bistro", environment: "ground_floor", capacity: 4, x: 166, y: 782 },
  { code: "09", type: "bistro", environment: "ground_floor", capacity: 6, x: 178, y: 871 },
  { code: "10", type: "bistro", environment: "ground_floor", capacity: 2, x: 144, y: 1044 },
  { code: "11", type: "bistro", environment: "ground_floor", capacity: 6, x: 218, y: 1028 },
  { code: "12", type: "bistro", environment: "ground_floor", capacity: 4, x: 328, y: 1044 },
  { code: "13", type: "bistro", environment: "ground_floor", capacity: 2, x: 383, y: 1011 },

  { code: "20", type: "table", environment: "mezzanine", capacity: 8, x: 735, y: 376 },
  { code: "21", type: "table", environment: "mezzanine", capacity: 2, x: 573, y: 363 },
  { code: "22", type: "table", environment: "mezzanine", capacity: 2, x: 572, y: 400 },
  { code: "23", type: "table", environment: "mezzanine", capacity: 4, x: 697, y: 472 },
  { code: "24", type: "table", environment: "mezzanine", capacity: 4, x: 666, y: 526 },
  { code: "25", type: "table", environment: "mezzanine", capacity: 4, x: 718, y: 610 },
  { code: "26", type: "table", environment: "mezzanine", capacity: 4, x: 727, y: 709 },
  { code: "27", type: "table", environment: "mezzanine", capacity: 4, x: 743, y: 801 },
  { code: "28", type: "table", environment: "mezzanine", capacity: 4, x: 759, y: 893 },
  { code: "29", type: "table", environment: "mezzanine", capacity: 2, x: 784, y: 983 },
  { code: "30", type: "table", environment: "mezzanine", capacity: 2, x: 637, y: 1039 },
  { code: "31", type: "table", environment: "mezzanine", capacity: 2, x: 687, y: 1039 },
  { code: "32", type: "table", environment: "mezzanine", capacity: 2, x: 739, y: 1039 },
  { code: "33", type: "table", environment: "mezzanine", capacity: 2, x: 637, y: 1108 },
  { code: "40", type: "table", environment: "mezzanine", capacity: 2, x: 592, y: 455 },
  { code: "41", type: "table", environment: "mezzanine", capacity: 8, x: 596, y: 526 },
  { code: "42", type: "bistro", environment: "mezzanine", capacity: 4, x: 796, y: 614 },
  { code: "43", type: "bistro", environment: "mezzanine", capacity: 4, x: 812, y: 716 },
  { code: "44", type: "bistro", environment: "mezzanine", capacity: 4, x: 828, y: 813 },
  { code: "45", type: "bistro", environment: "mezzanine", capacity: 4, x: 846, y: 895 },
  { code: "46", type: "table", environment: "mezzanine", capacity: 8, x: 844, y: 977 },
  { code: "51", type: "table", environment: "mezzanine", capacity: 4, x: 582, y: 1166 },
  { code: "52", type: "table", environment: "mezzanine", capacity: 4, x: 642, y: 1166 },
  { code: "53", type: "bistro", environment: "mezzanine", capacity: 4, x: 693, y: 1167 },
  { code: "54", type: "table", environment: "mezzanine", capacity: 4, x: 592, y: 1238 },
  { code: "55", type: "table", environment: "mezzanine", capacity: 4, x: 643, y: 1266 },
  { code: "56", type: "table", environment: "mezzanine", capacity: 4, x: 706, y: 1267 },
] as const;

export function getOfficialTableMapPlace(code: string) {
  return OFFICIAL_TABLE_MAP_PLACES.find((place) => place.code === code) ?? null;
}

export function normalizeOfficialTableMapCode(code: string) {
  return code.trim().padStart(2, "0");
}
