export type OfficialTableMapPlaceType = "bistro" | "table";
export type OfficialTableMapEnvironment = "ground_floor" | "mezzanine";

export type OfficialTableMapPlace = {
  code: string;
  type: OfficialTableMapPlaceType;
  environment: OfficialTableMapEnvironment;
  capacity: 2 | 4 | 6;
  x: number;
  y: number;
  labelSize?: number;
};

export const OFFICIAL_TABLE_MAP_WIDTH = 1086;
export const OFFICIAL_TABLE_MAP_HEIGHT = 1448;
export const OFFICIAL_TABLE_MAP_ASSET = "public/mapa_mesas.webp";

export const OFFICIAL_TABLE_MAP_PLACES: readonly OfficialTableMapPlace[] = [
  { code: "01", type: "bistro", environment: "ground_floor", capacity: 2, x: 377, y: 450 },
  { code: "02", type: "bistro", environment: "ground_floor", capacity: 2, x: 394, y: 341 },
  { code: "03", type: "bistro", environment: "ground_floor", capacity: 2, x: 420, y: 376 },
  { code: "04", type: "bistro", environment: "ground_floor", capacity: 2, x: 465, y: 376 },
  { code: "05", type: "bistro", environment: "ground_floor", capacity: 2, x: 409, y: 528 },
  { code: "06", type: "bistro", environment: "ground_floor", capacity: 2, x: 418, y: 630 },
  { code: "07", type: "bistro", environment: "ground_floor", capacity: 2, x: 416, y: 730 },
  { code: "08", type: "bistro", environment: "ground_floor", capacity: 2, x: 416, y: 820 },
  { code: "09", type: "bistro", environment: "ground_floor", capacity: 2, x: 433, y: 923 },
  { code: "10", type: "bistro", environment: "ground_floor", capacity: 2, x: 401, y: 1087 },
  { code: "11", type: "bistro", environment: "ground_floor", capacity: 2, x: 434, y: 1096 },
  { code: "12", type: "bistro", environment: "ground_floor", capacity: 4, x: 486, y: 1084 },
  { code: "13", type: "bistro", environment: "ground_floor", capacity: 4, x: 515, y: 1044 },

  { code: "20", type: "table", environment: "mezzanine", capacity: 4, x: 583, y: 386 },
  { code: "21", type: "table", environment: "mezzanine", capacity: 4, x: 619, y: 409 },
  { code: "22", type: "table", environment: "mezzanine", capacity: 4, x: 635, y: 355 },
  { code: "23", type: "table", environment: "mezzanine", capacity: 4, x: 648, y: 462 },
  { code: "24", type: "table", environment: "mezzanine", capacity: 4, x: 649, y: 554 },
  { code: "25", type: "table", environment: "mezzanine", capacity: 4, x: 656, y: 642 },
  { code: "26", type: "table", environment: "mezzanine", capacity: 4, x: 662, y: 749 },
  { code: "27", type: "table", environment: "mezzanine", capacity: 4, x: 671, y: 839 },
  { code: "28", type: "table", environment: "mezzanine", capacity: 4, x: 674, y: 930 },
  { code: "29", type: "table", environment: "mezzanine", capacity: 4, x: 676, y: 1018 },
  { code: "30", type: "table", environment: "mezzanine", capacity: 4, x: 659, y: 1075 },
  { code: "31", type: "table", environment: "mezzanine", capacity: 4, x: 632, y: 1072 },
  { code: "32", type: "table", environment: "mezzanine", capacity: 4, x: 605, y: 1082 },
  { code: "33", type: "table", environment: "mezzanine", capacity: 4, x: 607, y: 1153 },
  { code: "40", type: "table", environment: "mezzanine", capacity: 6, x: 584, y: 307 },
  { code: "41", type: "table", environment: "mezzanine", capacity: 6, x: 669, y: 383 },
  { code: "46", type: "table", environment: "mezzanine", capacity: 6, x: 711, y: 1003 },
  { code: "51", type: "table", environment: "mezzanine", capacity: 6, x: 633, y: 1231 },
  { code: "52", type: "table", environment: "mezzanine", capacity: 6, x: 607, y: 1231 },
  { code: "54", type: "table", environment: "mezzanine", capacity: 6, x: 585, y: 1317 },
  { code: "55", type: "table", environment: "mezzanine", capacity: 6, x: 606, y: 1384 },
  { code: "56", type: "table", environment: "mezzanine", capacity: 6, x: 640, y: 1374 },

  { code: "42", type: "bistro", environment: "mezzanine", capacity: 4, x: 686, y: 535 },
  { code: "43", type: "bistro", environment: "mezzanine", capacity: 4, x: 692, y: 649 },
  { code: "44", type: "bistro", environment: "mezzanine", capacity: 4, x: 700, y: 771 },
  { code: "45", type: "bistro", environment: "mezzanine", capacity: 4, x: 710, y: 896 },
  { code: "53", type: "bistro", environment: "mezzanine", capacity: 6, x: 577, y: 1239 },
] as const;

export function getOfficialTableMapPlace(code: string) {
  return OFFICIAL_TABLE_MAP_PLACES.find((place) => place.code === code) ?? null;
}

export function normalizeOfficialTableMapCode(code: string) {
  return code.trim().padStart(2, "0");
}
