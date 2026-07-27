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
  { code: "01", type: "bistro", environment: "ground_floor", capacity: 6, x: 336, y: 426 },
  { code: "02", type: "bistro", environment: "ground_floor", capacity: 2, x: 352, y: 323 },
  { code: "03", type: "bistro", environment: "ground_floor", capacity: 6, x: 375, y: 356 },
  { code: "04", type: "bistro", environment: "ground_floor", capacity: 6, x: 415, y: 356 },
  { code: "05", type: "bistro", environment: "ground_floor", capacity: 6, x: 365, y: 500 },
  { code: "06", type: "bistro", environment: "ground_floor", capacity: 4, x: 373, y: 597 },
  { code: "07", type: "bistro", environment: "ground_floor", capacity: 4, x: 371, y: 691 },
  { code: "08", type: "bistro", environment: "ground_floor", capacity: 4, x: 371, y: 777 },
  { code: "09", type: "bistro", environment: "ground_floor", capacity: 6, x: 386, y: 874 },
  { code: "10", type: "bistro", environment: "ground_floor", capacity: 2, x: 358, y: 1030 },
  { code: "11", type: "bistro", environment: "ground_floor", capacity: 6, x: 387, y: 1038 },
  { code: "12", type: "bistro", environment: "ground_floor", capacity: 4, x: 434, y: 1027 },
  { code: "13", type: "bistro", environment: "ground_floor", capacity: 2, x: 460, y: 989 },

  { code: "20", type: "table", environment: "mezzanine", capacity: 8, x: 520, y: 366 },
  { code: "21", type: "table", environment: "mezzanine", capacity: 2, x: 552, y: 387 },
  { code: "22", type: "table", environment: "mezzanine", capacity: 2, x: 567, y: 336 },
  { code: "23", type: "table", environment: "mezzanine", capacity: 4, x: 578, y: 438 },
  { code: "24", type: "table", environment: "mezzanine", capacity: 4, x: 579, y: 525 },
  { code: "25", type: "table", environment: "mezzanine", capacity: 4, x: 585, y: 608 },
  { code: "26", type: "table", environment: "mezzanine", capacity: 4, x: 591, y: 710 },
  { code: "27", type: "table", environment: "mezzanine", capacity: 4, x: 599, y: 795 },
  { code: "28", type: "table", environment: "mezzanine", capacity: 4, x: 601, y: 881 },
  { code: "29", type: "table", environment: "mezzanine", capacity: 2, x: 603, y: 964 },
  { code: "30", type: "table", environment: "mezzanine", capacity: 2, x: 588, y: 1018 },
  { code: "31", type: "table", environment: "mezzanine", capacity: 2, x: 564, y: 1015 },
  { code: "32", type: "table", environment: "mezzanine", capacity: 2, x: 540, y: 1025 },
  { code: "33", type: "table", environment: "mezzanine", capacity: 2, x: 542, y: 1092 },
  { code: "40", type: "table", environment: "mezzanine", capacity: 2, x: 521, y: 291 },
  { code: "41", type: "table", environment: "mezzanine", capacity: 8, x: 597, y: 363 },
  { code: "42", type: "bistro", environment: "mezzanine", capacity: 4, x: 612, y: 507 },
  { code: "43", type: "bistro", environment: "mezzanine", capacity: 4, x: 618, y: 615 },
  { code: "44", type: "bistro", environment: "mezzanine", capacity: 4, x: 625, y: 730 },
  { code: "45", type: "bistro", environment: "mezzanine", capacity: 4, x: 634, y: 849 },
  { code: "46", type: "table", environment: "mezzanine", capacity: 8, x: 635, y: 950 },
  { code: "51", type: "table", environment: "mezzanine", capacity: 4, x: 565, y: 1166 },
  { code: "52", type: "table", environment: "mezzanine", capacity: 4, x: 542, y: 1166 },
  { code: "53", type: "bistro", environment: "mezzanine", capacity: 4, x: 515, y: 1174 },
  { code: "54", type: "table", environment: "mezzanine", capacity: 4, x: 522, y: 1248 },
  { code: "55", type: "table", environment: "mezzanine", capacity: 4, x: 541, y: 1311 },
  { code: "56", type: "table", environment: "mezzanine", capacity: 4, x: 571, y: 1302 },
] as const;

export function getOfficialTableMapPlace(code: string) {
  return OFFICIAL_TABLE_MAP_PLACES.find((place) => place.code === code) ?? null;
}

export function normalizeOfficialTableMapCode(code: string) {
  return code.trim().padStart(2, "0");
}
