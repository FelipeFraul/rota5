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
  { code: "01", type: "bistro", environment: "ground_floor", capacity: 6, x: 102, y: 455 },
  { code: "02", type: "bistro", environment: "ground_floor", capacity: 2, x: 64, y: 548 },
  { code: "03", type: "bistro", environment: "ground_floor", capacity: 6, x: 142, y: 501 },
  { code: "04", type: "bistro", environment: "ground_floor", capacity: 6, x: 236, y: 503 },
  { code: "05", type: "bistro", environment: "ground_floor", capacity: 6, x: 132, y: 620 },
  { code: "06", type: "bistro", environment: "ground_floor", capacity: 4, x: 287, y: 663 },
  { code: "07", type: "bistro", environment: "ground_floor", capacity: 4, x: 130, y: 701 },
  { code: "08", type: "bistro", environment: "ground_floor", capacity: 4, x: 130, y: 783 },
  { code: "09", type: "bistro", environment: "ground_floor", capacity: 6, x: 143, y: 872 },
  { code: "10", type: "bistro", environment: "ground_floor", capacity: 2, x: 116, y: 1047 },
  { code: "11", type: "bistro", environment: "ground_floor", capacity: 6, x: 184, y: 1028 },
  { code: "12", type: "bistro", environment: "ground_floor", capacity: 4, x: 284, y: 1048 },
  { code: "13", type: "bistro", environment: "ground_floor", capacity: 2, x: 346, y: 1018 },

  { code: "20", type: "table", environment: "mezzanine", capacity: 8, x: 768, y: 407 },
  { code: "21", type: "table", environment: "mezzanine", capacity: 2, x: 540, y: 358 },
  { code: "22", type: "table", environment: "mezzanine", capacity: 2, x: 540, y: 396 },
  { code: "23", type: "table", environment: "mezzanine", capacity: 4, x: 704, y: 458 },
  { code: "24", type: "table", environment: "mezzanine", capacity: 4, x: 646, y: 528 },
  { code: "25", type: "table", environment: "mezzanine", capacity: 4, x: 697, y: 610 },
  { code: "26", type: "table", environment: "mezzanine", capacity: 4, x: 704, y: 710 },
  { code: "27", type: "table", environment: "mezzanine", capacity: 4, x: 719, y: 801 },
  { code: "28", type: "table", environment: "mezzanine", capacity: 4, x: 735, y: 893 },
  { code: "29", type: "table", environment: "mezzanine", capacity: 2, x: 759, y: 984 },
  { code: "30", type: "table", environment: "mezzanine", capacity: 2, x: 619, y: 1018 },
  { code: "31", type: "table", environment: "mezzanine", capacity: 2, x: 671, y: 1018 },
  { code: "32", type: "table", environment: "mezzanine", capacity: 2, x: 724, y: 1018 },
  { code: "33", type: "table", environment: "mezzanine", capacity: 2, x: 617, y: 1104 },
  { code: "40", type: "table", environment: "mezzanine", capacity: 2, x: 550, y: 455 },
  { code: "41", type: "table", environment: "mezzanine", capacity: 8, x: 550, y: 528 },
  { code: "42", type: "bistro", environment: "mezzanine", capacity: 4, x: 754, y: 614 },
  { code: "43", type: "bistro", environment: "mezzanine", capacity: 4, x: 770, y: 716 },
  { code: "44", type: "bistro", environment: "mezzanine", capacity: 4, x: 786, y: 813 },
  { code: "45", type: "bistro", environment: "mezzanine", capacity: 4, x: 804, y: 895 },
  { code: "46", type: "table", environment: "mezzanine", capacity: 8, x: 802, y: 977 },
  { code: "51", type: "table", environment: "mezzanine", capacity: 4, x: 540, y: 1165 },
  { code: "52", type: "table", environment: "mezzanine", capacity: 4, x: 610, y: 1165 },
  { code: "53", type: "bistro", environment: "mezzanine", capacity: 4, x: 664, y: 1166 },
  { code: "54", type: "table", environment: "mezzanine", capacity: 4, x: 552, y: 1238 },
  { code: "55", type: "table", environment: "mezzanine", capacity: 4, x: 605, y: 1266 },
  { code: "56", type: "table", environment: "mezzanine", capacity: 4, x: 668, y: 1266 },
] as const;

export function getOfficialTableMapPlace(code: string) {
  return OFFICIAL_TABLE_MAP_PLACES.find((place) => place.code === code) ?? null;
}

export function normalizeOfficialTableMapCode(code: string) {
  return code.trim().padStart(2, "0");
}
