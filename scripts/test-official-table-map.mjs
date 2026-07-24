import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import sharp from "sharp";

import {
  clampOfficialTableMapPoint,
  exportOfficialPlacesCalibrationJson,
  originalPointToResponsivePoint,
  responsivePointToOriginalPoint,
} from "../src/lib/tickets/tableMap/calibration.ts";
import {
  OFFICIAL_TABLE_MAP_ASSET,
  OFFICIAL_TABLE_MAP_HEIGHT,
  OFFICIAL_TABLE_MAP_PLACES,
  OFFICIAL_TABLE_MAP_WIDTH,
} from "../src/lib/tickets/tableMap/officialPlaces.ts";
import {
  buildOfficialTableMapOverlaySvg,
  renderOfficialTableMap,
} from "../src/lib/tickets/tableMap/renderOfficialTableMap.ts";
import {
  persistOfficialTableMapPlaces,
} from "../src/lib/tickets/tableMap/persistOfficialPlaces.ts";
import {
  isOfficialTableMapPlaceAllowedForQuantity,
} from "../src/lib/tickets/services/officialTableMapReservations.ts";

const unavailableSample = ["03", "08", "21", "27", "42", "51"];
const outputDir = path.join(process.cwd(), ".tmp", "official-table-map");
const migrationPath = path.join(
  process.cwd(),
  "supabase",
  "migrations",
  "20260722000700_create_official_table_map_places.sql",
);
const reservationsMigrationPath = path.join(
  process.cwd(),
  "supabase",
  "migrations",
  "20260722000800_create_official_table_map_reservations.sql",
);
const routerPath = path.join(process.cwd(), "src", "lib", "tickets", "router.ts");
const availabilityServicePath = path.join(
  process.cwd(),
  "src",
  "lib",
  "tickets",
  "services",
  "officialTableMapReservations.ts",
);
const finalCoordinates = new Map([
  ["01", { x: 377, y: 450 }],
  ["02", { x: 394, y: 341 }],
  ["03", { x: 420, y: 376 }],
  ["04", { x: 465, y: 376 }],
  ["05", { x: 409, y: 528 }],
  ["06", { x: 418, y: 630 }],
  ["07", { x: 416, y: 730 }],
  ["08", { x: 416, y: 820 }],
  ["09", { x: 433, y: 923 }],
  ["10", { x: 401, y: 1087 }],
  ["11", { x: 434, y: 1096 }],
  ["12", { x: 486, y: 1084 }],
  ["13", { x: 515, y: 1044 }],
  ["20", { x: 583, y: 386 }],
  ["21", { x: 619, y: 409 }],
  ["22", { x: 635, y: 355 }],
  ["23", { x: 648, y: 462 }],
  ["24", { x: 649, y: 554 }],
  ["25", { x: 656, y: 642 }],
  ["26", { x: 662, y: 749 }],
  ["27", { x: 671, y: 839 }],
  ["28", { x: 674, y: 930 }],
  ["29", { x: 676, y: 1018 }],
  ["30", { x: 659, y: 1075 }],
  ["31", { x: 632, y: 1072 }],
  ["32", { x: 605, y: 1082 }],
  ["33", { x: 607, y: 1153 }],
  ["40", { x: 584, y: 307 }],
  ["41", { x: 669, y: 383 }],
  ["46", { x: 711, y: 1003 }],
  ["51", { x: 633, y: 1231 }],
  ["52", { x: 607, y: 1231 }],
  ["54", { x: 585, y: 1317 }],
  ["55", { x: 606, y: 1384 }],
  ["56", { x: 640, y: 1374 }],
  ["42", { x: 686, y: 535 }],
  ["43", { x: 692, y: 649 }],
  ["44", { x: 700, y: 771 }],
  ["45", { x: 710, y: 896 }],
  ["53", { x: 577, y: 1239 }],
]);

async function sha256(filePath) {
  return createHash("sha256").update(await readFile(filePath)).digest("hex");
}

test("catalogo oficial tem 40 lugares unicos e regras de tipo/ambiente", () => {
  assert.equal(OFFICIAL_TABLE_MAP_PLACES.length, 40);

  const codes = OFFICIAL_TABLE_MAP_PLACES.map((place) => place.code);
  assert.equal(new Set(codes).size, 40);
  assert.deepEqual(codes, codes.map((code) => code.padStart(2, "0")));

  const terreoBistros = OFFICIAL_TABLE_MAP_PLACES.filter(
    (place) => place.type === "bistro" && place.environment === "ground_floor",
  ).map((place) => place.code);
  const mezaninoTables = OFFICIAL_TABLE_MAP_PLACES.filter(
    (place) => place.type === "table" && place.environment === "mezzanine",
  ).map((place) => place.code);
  const mezaninoBistros = OFFICIAL_TABLE_MAP_PLACES.filter(
    (place) => place.type === "bistro" && place.environment === "mezzanine",
  ).map((place) => place.code);

  assert.deepEqual(terreoBistros, [
    "01", "02", "03", "04", "05", "06", "07", "08", "09", "10", "11", "12", "13",
  ]);
  assert.deepEqual(mezaninoTables, [
    "20", "21", "22", "23", "24", "25", "26", "27", "28", "29", "30", "31",
    "32", "33", "40", "41", "46", "51", "52", "54", "55", "56",
  ]);
  assert.deepEqual(mezaninoBistros, ["42", "43", "44", "45", "53"]);
  assert.equal(terreoBistros.length + mezaninoBistros.length, 18);
  assert.equal(mezaninoTables.length, 22);
  assert.equal(
    OFFICIAL_TABLE_MAP_PLACES.some((place) => place.type === "table" && place.environment !== "mezzanine"),
    false,
  );
  assert.equal(OFFICIAL_TABLE_MAP_PLACES.filter((place) => place.capacity === 2).length, 11);
  assert.equal(OFFICIAL_TABLE_MAP_PLACES.filter((place) => place.capacity === 4).length, 20);
  assert.equal(OFFICIAL_TABLE_MAP_PLACES.filter((place) => place.capacity === 6).length, 9);
});

test("coordenadas ficam dentro da imagem oficial", () => {
  for (const place of OFFICIAL_TABLE_MAP_PLACES) {
    assert.ok(place.x >= 0 && place.x <= OFFICIAL_TABLE_MAP_WIDTH, `${place.code} x fora da imagem`);
    assert.ok(place.y >= 0 && place.y <= OFFICIAL_TABLE_MAP_HEIGHT, `${place.code} y fora da imagem`);
  }
});

test("catalogo oficial usa as coordenadas finais calibradas", () => {
  assert.equal(finalCoordinates.size, 40);

  for (const place of OFFICIAL_TABLE_MAP_PLACES) {
    assert.deepEqual(
      { x: place.x, y: place.y },
      finalCoordinates.get(place.code),
      `${place.code} com coordenada diferente da calibracao final`,
    );
  }
});

test("filtro de mesa/bistro libera somente a capacidade compativel com a quantidade", () => {
  const placeByCapacity = new Map(
    [2, 4, 6].map((capacity) => [
      capacity,
      OFFICIAL_TABLE_MAP_PLACES.find((place) => place.capacity === capacity),
    ]),
  );

  assert.equal(isOfficialTableMapPlaceAllowedForQuantity({ place: placeByCapacity.get(2), quantity: 2 }), true);
  assert.equal(isOfficialTableMapPlaceAllowedForQuantity({ place: placeByCapacity.get(4), quantity: 2 }), false);
  assert.equal(isOfficialTableMapPlaceAllowedForQuantity({ place: placeByCapacity.get(6), quantity: 2 }), false);

  assert.equal(isOfficialTableMapPlaceAllowedForQuantity({ place: placeByCapacity.get(2), quantity: 4 }), false);
  assert.equal(isOfficialTableMapPlaceAllowedForQuantity({ place: placeByCapacity.get(4), quantity: 4 }), true);
  assert.equal(isOfficialTableMapPlaceAllowedForQuantity({ place: placeByCapacity.get(6), quantity: 4 }), false);

  assert.equal(isOfficialTableMapPlaceAllowedForQuantity({ place: placeByCapacity.get(2), quantity: 6 }), false);
  assert.equal(isOfficialTableMapPlaceAllowedForQuantity({ place: placeByCapacity.get(4), quantity: 6 }), false);
  assert.equal(isOfficialTableMapPlaceAllowedForQuantity({ place: placeByCapacity.get(6), quantity: 6 }), true);
  assert.equal(isOfficialTableMapPlaceAllowedForQuantity({ place: placeByCapacity.get(6), quantity: 7 }), false);
});

test("migration cria tabela de coordenadas oficiais com 40 sementes", async () => {
  const migration = await readFile(migrationPath, "utf8");

  assert.match(migration, /create table if not exists public\.official_table_map_places/);
  assert.match(migration, /code text primary key/);
  assert.match(migration, /check \(x >= 0 and x <= 1086\)/);
  assert.match(migration, /check \(y >= 0 and y <= 1448\)/);

  for (const [code, point] of finalCoordinates) {
    assert.match(migration, new RegExp(`\\('${code}', ${point.x}, ${point.y}\\)`));
  }
});

test("migration cria reserva global dos lugares oficiais sem acesso publico", async () => {
  const migration = await readFile(reservationsMigrationPath, "utf8");

  assert.match(migration, /create table if not exists public\.official_table_map_reservations/);
  assert.match(migration, /place_code text not null references public\.official_table_map_places\(code\)/);
  assert.match(migration, /reservation_id uuid not null unique references public\.reservations\(id\)/);
  assert.match(migration, /create unique index if not exists official_table_map_reservations_active_place_key/);
  assert.match(migration, /where status in \('active', 'paid'\)/);
  assert.match(migration, /alter table public\.official_table_map_reservations enable row level security/);
  assert.match(migration, /revoke all on public\.official_table_map_reservations from anon/);
  assert.match(migration, /grant all on public\.official_table_map_reservations to service_role/);
  assert.match(migration, /create or replace function public\.reserve_official_table_map_place/);
  assert.match(migration, /reservations_sync_official_table_map_status/);
});

test("router integra escolha opcional de mesa ao fluxo de compra", async () => {
  const router = await readFile(routerPath, "utf8");
  const availabilityService = await readFile(availabilityServicePath, "utf8");

  assert.match(router, /"selecting_table_map_place"/);
  assert.match(router, /buildOfficialTableMapAvailabilityImage/);
  assert.doesNotMatch(router, /Digite 2 para \*escolher mesa\/bistro gratuitamente\*/);
  assert.doesNotMatch(router, /Digite 2 para \*comprar outros\/mais ingressos\*/);
  assert.match(router, /Digite \*"1"\* para para finalizar a compra/);
  assert.match(router, /if \(selectedOption === 1\)[\s\S]*formatTableMapSelectionReply/);
  assert.match(router, /text\.trim\(\) === "0"/);
  assert.match(router, /reserveOfficialTableMapPlace\(/);
  assert.match(router, /cancelPendingReservationForCustomer\(\{/);
  assert.match(availabilityService, /const places = await getOfficialTableMapPlaces\(\)/);
  assert.doesNotMatch(availabilityService, /places: OFFICIAL_TABLE_MAP_PLACES/);
});

test("calibracao converte coordenadas responsivas para coordenadas originais", () => {
  const rect = { left: 100, top: 50, width: 543, height: 724 };
  const original = responsivePointToOriginalPoint({ x: 371.5, y: 412 }, rect);
  const responsive = originalPointToResponsivePoint(original, rect);

  assert.deepEqual(original, { x: 543, y: 724 });
  assert.equal(responsive.x, 371.5);
  assert.equal(responsive.y, 412);
});

test("calibracao limita movimento dentro da imagem", () => {
  assert.deepEqual(clampOfficialTableMapPoint({ x: -25, y: -10 }), { x: 0, y: 0 });
  assert.deepEqual(
    clampOfficialTableMapPoint({ x: OFFICIAL_TABLE_MAP_WIDTH + 90, y: OFFICIAL_TABLE_MAP_HEIGHT + 12 }),
    { x: OFFICIAL_TABLE_MAP_WIDTH, y: OFFICIAL_TABLE_MAP_HEIGHT },
  );
});

test("calibracao exporta os 40 lugares em JSON com codigos unicos", () => {
  const parsed = JSON.parse(exportOfficialPlacesCalibrationJson(OFFICIAL_TABLE_MAP_PLACES));

  assert.equal(parsed.length, 40);
  assert.equal(new Set(parsed.map((place) => place.code)).size, 40);
  assert.deepEqual(parsed.map((place) => place.code), OFFICIAL_TABLE_MAP_PLACES.map((place) => place.code));
  assert.equal(parsed.every((place) => Number.isInteger(place.x) && Number.isInteger(place.y)), true);
});

test("persistencia permanente rejeita alteracao de metadados oficiais", async () => {
  const invalidPlaces = OFFICIAL_TABLE_MAP_PLACES.map((place) => ({ ...place }));
  invalidPlaces[0] = { ...invalidPlaces[0], type: "table" };

  const result = await persistOfficialTableMapPlaces(invalidPlaces);

  assert.deepEqual(result, { ok: false, reason: "invalid_metadata" });
});

test("renderizador gera imagem derivada e preserva imagem original", async () => {
  const baseImagePath = path.join(process.cwd(), OFFICIAL_TABLE_MAP_ASSET);
  const beforeHash = await sha256(baseImagePath);
  const rendered = await renderOfficialTableMap({ unavailableCodes: unavailableSample });
  const metadata = await sharp(rendered.buffer).metadata();
  const afterHash = await sha256(baseImagePath);

  assert.equal(rendered.mimeType, "image/webp");
  assert.equal(rendered.filename, "mapa-mesas-render.webp");
  assert.equal(metadata.format, "webp");
  assert.equal(metadata.width, OFFICIAL_TABLE_MAP_WIDTH);
  assert.equal(metadata.height, OFFICIAL_TABLE_MAP_HEIGHT);
  assert.equal(beforeHash, afterHash);
});

test("renderizador posiciona cada texto exatamente nas coordenadas oficiais", async () => {
  const svg = await buildOfficialTableMapOverlaySvg({ places: OFFICIAL_TABLE_MAP_PLACES });

  for (const place of OFFICIAL_TABLE_MAP_PLACES) {
    const labelPattern = new RegExp(`data-label="${place.code}"`);

    assert.match(svg, labelPattern, `${place.code} nao foi renderizado no overlay`);
  }
});

test("gera imagens locais de conferencia", async () => {
  await mkdir(outputDir, { recursive: true });

  const cases = [
    ["todos-disponiveis.webp", []],
    ["alguns-indisponiveis.webp", unavailableSample],
    ["todos-indisponiveis.webp", OFFICIAL_TABLE_MAP_PLACES.map((place) => place.code)],
  ];

  for (const [filename, unavailableCodes] of cases) {
    const rendered = await renderOfficialTableMap({ unavailableCodes });
    const targetPath = path.join(outputDir, filename);
    await writeFile(targetPath, rendered.buffer);
    const metadata = await sharp(targetPath).metadata();
    assert.equal(metadata.format, "webp");
    assert.equal(metadata.width, OFFICIAL_TABLE_MAP_WIDTH);
    assert.equal(metadata.height, OFFICIAL_TABLE_MAP_HEIGHT);
    assert.ok(rendered.buffer.length > 100_000);
  }
});
