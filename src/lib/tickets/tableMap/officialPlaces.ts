export type OfficialTableMapPlaceType = "bistro" | "table";
export type OfficialTableMapEnvironment = "ground_floor" | "mezzanine";

export type OfficialTableMapPlace = {
  code: string;
  type: OfficialTableMapPlaceType;
  environment: OfficialTableMapEnvironment;
  x: number;
  y: number;
  labelSize?: number;
};

export const OFFICIAL_TABLE_MAP_WIDTH = 1086;
export const OFFICIAL_TABLE_MAP_HEIGHT = 1448;
export const OFFICIAL_TABLE_MAP_ASSET = "public/mapa_mesas.webp";

export const OFFICIAL_TABLE_MAP_PLACES: readonly OfficialTableMapPlace[] = [
  { code: "01", type: "bistro", environment: "ground_floor", x: 81, y: 454 },
  { code: "02", type: "bistro", environment: "ground_floor", x: 118, y: 343 },
  { code: "03", type: "bistro", environment: "ground_floor", x: 204, y: 386 },
  { code: "04", type: "bistro", environment: "ground_floor", x: 320, y: 386 },
  { code: "05", type: "bistro", environment: "ground_floor", x: 188, y: 521 },
  { code: "06", type: "bistro", environment: "ground_floor", x: 194, y: 626 },
  { code: "07", type: "bistro", environment: "ground_floor", x: 194, y: 729 },
  { code: "08", type: "bistro", environment: "ground_floor", x: 191, y: 834 },
  { code: "09", type: "bistro", environment: "ground_floor", x: 235, y: 922 },
  { code: "10", type: "bistro", environment: "ground_floor", x: 146, y: 1108 },
  { code: "11", type: "bistro", environment: "ground_floor", x: 241, y: 1108 },
  { code: "12", type: "bistro", environment: "ground_floor", x: 393, y: 1092 },
  { code: "13", type: "bistro", environment: "ground_floor", x: 463, y: 1043 },

  { code: "20", type: "table", environment: "mezzanine", x: 664, y: 386 },
  { code: "21", type: "table", environment: "mezzanine", x: 759, y: 405 },
  { code: "22", type: "table", environment: "mezzanine", x: 808, y: 343 },
  { code: "23", type: "table", environment: "mezzanine", x: 836, y: 462 },
  { code: "24", type: "table", environment: "mezzanine", x: 846, y: 556 },
  { code: "25", type: "table", environment: "mezzanine", x: 852, y: 653 },
  { code: "26", type: "table", environment: "mezzanine", x: 858, y: 752 },
  { code: "27", type: "table", environment: "mezzanine", x: 870, y: 849 },
  { code: "28", type: "table", environment: "mezzanine", x: 892, y: 938 },
  { code: "29", type: "table", environment: "mezzanine", x: 909, y: 1023 },
  { code: "30", type: "table", environment: "mezzanine", x: 872, y: 1086 },
  { code: "31", type: "table", environment: "mezzanine", x: 786, y: 1086 },
  { code: "32", type: "table", environment: "mezzanine", x: 721, y: 1088 },
  { code: "33", type: "table", environment: "mezzanine", x: 747, y: 1165 },
  { code: "40", type: "table", environment: "mezzanine", x: 667, y: 306 },
  { code: "41", type: "table", environment: "mezzanine", x: 899, y: 387 },
  { code: "46", type: "table", environment: "mezzanine", x: 1001, y: 990 },
  { code: "51", type: "table", environment: "mezzanine", x: 810, y: 1238 },
  { code: "52", type: "table", environment: "mezzanine", x: 718, y: 1238 },
  { code: "54", type: "table", environment: "mezzanine", x: 675, y: 1344 },
  { code: "55", type: "table", environment: "mezzanine", x: 744, y: 1410 },
  { code: "56", type: "table", environment: "mezzanine", x: 825, y: 1410 },

  { code: "42", type: "bistro", environment: "mezzanine", x: 945, y: 527 },
  { code: "43", type: "bistro", environment: "mezzanine", x: 959, y: 649 },
  { code: "44", type: "bistro", environment: "mezzanine", x: 977, y: 768 },
  { code: "45", type: "bistro", environment: "mezzanine", x: 986, y: 878 },
  { code: "53", type: "bistro", environment: "mezzanine", x: 654, y: 1238 },
] as const;

export function getOfficialTableMapPlace(code: string) {
  return OFFICIAL_TABLE_MAP_PLACES.find((place) => place.code === code) ?? null;
}

export function normalizeOfficialTableMapCode(code: string) {
  return code.trim().padStart(2, "0");
}
