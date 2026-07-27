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
  OFFICIAL_TABLE_MAP_MARKER_VISUAL,
  renderOfficialTableMap,
} from "../src/lib/tickets/tableMap/renderOfficialTableMap.ts";
import {
  persistOfficialTableMapPlaces,
} from "../src/lib/tickets/tableMap/persistOfficialPlaces.ts";
import {
  getOfficialTableMapPlaceByInput,
  isOfficialTableMapPlaceAllowedForQuantity,
} from "../src/lib/tickets/services/officialTableMapReservations.ts";

const unavailableSample = ["03", "08", "21", "27", "41", "51"];
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
const scopedReservationsMigrationPath = path.join(
  process.cwd(),
  "supabase",
  "migrations",
  "20260724000400_scope_official_table_map_reservations_by_session.sql",
);
const routerPath = path.join(process.cwd(), "src", "lib", "tickets", "router.ts");
const globalsCssPath = path.join(process.cwd(), "src", "app", "globals.css");
const tableMapRendererPath = path.join(
  process.cwd(),
  "src",
  "lib",
  "tickets",
  "tableMap",
  "renderOfficialTableMap.ts",
);
const availabilityServicePath = path.join(
  process.cwd(),
  "src",
  "lib",
  "tickets",
  "services",
  "officialTableMapReservations.ts",
);
const finalCoordinates = new Map([
  ["01", { x: 336, y: 426 }],
  ["02", { x: 352, y: 323 }],
  ["03", { x: 375, y: 356 }],
  ["04", { x: 415, y: 356 }],
  ["05", { x: 365, y: 500 }],
  ["06", { x: 373, y: 597 }],
  ["07", { x: 371, y: 691 }],
  ["08", { x: 371, y: 777 }],
  ["09", { x: 386, y: 874 }],
  ["10", { x: 358, y: 1030 }],
  ["11", { x: 387, y: 1038 }],
  ["12", { x: 434, y: 1027 }],
  ["13", { x: 460, y: 989 }],
  ["20", { x: 520, y: 366 }],
  ["21", { x: 552, y: 387 }],
  ["22", { x: 567, y: 336 }],
  ["23", { x: 578, y: 438 }],
  ["24", { x: 579, y: 525 }],
  ["25", { x: 585, y: 608 }],
  ["26", { x: 591, y: 710 }],
  ["27", { x: 599, y: 795 }],
  ["28", { x: 601, y: 881 }],
  ["29", { x: 603, y: 964 }],
  ["30", { x: 588, y: 1018 }],
  ["31", { x: 564, y: 1015 }],
  ["32", { x: 540, y: 1025 }],
  ["33", { x: 542, y: 1092 }],
  ["40", { x: 521, y: 291 }],
  ["41", { x: 597, y: 363 }],
  ["46", { x: 635, y: 950 }],
  ["51", { x: 565, y: 1166 }],
  ["52", { x: 542, y: 1166 }],
  ["54", { x: 522, y: 1248 }],
  ["55", { x: 541, y: 1311 }],
  ["56", { x: 571, y: 1302 }],
  ["42", { x: 612, y: 507 }],
  ["43", { x: 618, y: 615 }],
  ["44", { x: 625, y: 730 }],
  ["45", { x: 634, y: 849 }],
  ["53", { x: 515, y: 1174 }],
]);

async function sha256(filePath) {
  return createHash("sha256").update(await readFile(filePath)).digest("hex");
}

test("catalogo oficial tem 40 lugares disponiveis unicos e regras de tipo/ambiente", () => {
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
  assert.equal(terreoBistros.length, 13);
  assert.equal(mezaninoTables.length, 22);
  assert.equal(mezaninoBistros.length, 5);
  assert.equal(
    OFFICIAL_TABLE_MAP_PLACES.some((place) => place.type === "table" && place.environment !== "mezzanine"),
    false,
  );
  assert.deepEqual(
    OFFICIAL_TABLE_MAP_PLACES.filter((place) => place.type === "table" && place.capacity === 2).map((place) => place.code),
    ["21", "22", "29", "30", "31", "32", "33", "40"],
  );
  assert.deepEqual(
    OFFICIAL_TABLE_MAP_PLACES.filter((place) => place.type === "table" && place.capacity === 4).map((place) => place.code),
    ["23", "24", "25", "26", "27", "28", "51", "52", "54", "55", "56"],
  );
  assert.deepEqual(
    OFFICIAL_TABLE_MAP_PLACES.filter((place) => place.type === "table" && place.capacity === 8).map((place) => place.code),
    ["20", "41", "46"],
  );
  assert.deepEqual(
    OFFICIAL_TABLE_MAP_PLACES.filter((place) => place.type === "bistro" && place.capacity === 2).map((place) => place.code),
    ["02", "10", "13"],
  );
  assert.deepEqual(
    OFFICIAL_TABLE_MAP_PLACES.filter((place) => place.type === "bistro" && place.capacity === 4).map((place) => place.code),
    ["06", "07", "08", "12", "42", "43", "44", "45", "53"],
  );
  assert.deepEqual(
    OFFICIAL_TABLE_MAP_PLACES.filter((place) => place.type === "bistro" && place.capacity === 6).map((place) => place.code),
    ["01", "03", "04", "05", "09", "11"],
  );
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

test("filtro de mesa/bistro libera capacidades conforme quantidade de ingressos", () => {
  const placeByCapacity = new Map(
    [2, 4, 6, 8].map((capacity) => [
      capacity,
      OFFICIAL_TABLE_MAP_PLACES.find((place) => place.capacity === capacity),
    ]),
  );

  assert.equal(isOfficialTableMapPlaceAllowedForQuantity({ place: placeByCapacity.get(2), quantity: 2 }), true);
  assert.equal(isOfficialTableMapPlaceAllowedForQuantity({ place: placeByCapacity.get(4), quantity: 2 }), false);
  assert.equal(isOfficialTableMapPlaceAllowedForQuantity({ place: placeByCapacity.get(6), quantity: 2 }), false);
  assert.equal(isOfficialTableMapPlaceAllowedForQuantity({ place: placeByCapacity.get(8), quantity: 2 }), false);

  assert.equal(isOfficialTableMapPlaceAllowedForQuantity({ place: placeByCapacity.get(2), quantity: 3 }), true);
  assert.equal(isOfficialTableMapPlaceAllowedForQuantity({ place: placeByCapacity.get(4), quantity: 3 }), false);

  assert.equal(isOfficialTableMapPlaceAllowedForQuantity({ place: placeByCapacity.get(2), quantity: 4 }), true);
  assert.equal(isOfficialTableMapPlaceAllowedForQuantity({ place: placeByCapacity.get(4), quantity: 4 }), true);
  assert.equal(isOfficialTableMapPlaceAllowedForQuantity({ place: placeByCapacity.get(6), quantity: 4 }), false);
  assert.equal(isOfficialTableMapPlaceAllowedForQuantity({ place: placeByCapacity.get(8), quantity: 4 }), false);

  assert.equal(isOfficialTableMapPlaceAllowedForQuantity({ place: placeByCapacity.get(2), quantity: 5 }), true);
  assert.equal(isOfficialTableMapPlaceAllowedForQuantity({ place: placeByCapacity.get(4), quantity: 5 }), true);
  assert.equal(isOfficialTableMapPlaceAllowedForQuantity({ place: placeByCapacity.get(6), quantity: 5 }), false);

  assert.equal(isOfficialTableMapPlaceAllowedForQuantity({ place: placeByCapacity.get(2), quantity: 6 }), true);
  assert.equal(isOfficialTableMapPlaceAllowedForQuantity({ place: placeByCapacity.get(4), quantity: 6 }), true);
  assert.equal(isOfficialTableMapPlaceAllowedForQuantity({ place: placeByCapacity.get(6), quantity: 6 }), true);
  assert.equal(isOfficialTableMapPlaceAllowedForQuantity({ place: placeByCapacity.get(8), quantity: 6 }), false);

  assert.equal(isOfficialTableMapPlaceAllowedForQuantity({ place: placeByCapacity.get(2), quantity: 7 }), true);
  assert.equal(isOfficialTableMapPlaceAllowedForQuantity({ place: placeByCapacity.get(4), quantity: 7 }), true);
  assert.equal(isOfficialTableMapPlaceAllowedForQuantity({ place: placeByCapacity.get(6), quantity: 7 }), true);
  assert.equal(isOfficialTableMapPlaceAllowedForQuantity({ place: placeByCapacity.get(8), quantity: 7 }), false);

  assert.equal(isOfficialTableMapPlaceAllowedForQuantity({ place: placeByCapacity.get(2), quantity: 8 }), true);
  assert.equal(isOfficialTableMapPlaceAllowedForQuantity({ place: placeByCapacity.get(4), quantity: 8 }), true);
  assert.equal(isOfficialTableMapPlaceAllowedForQuantity({ place: placeByCapacity.get(6), quantity: 8 }), true);
  assert.equal(isOfficialTableMapPlaceAllowedForQuantity({ place: placeByCapacity.get(8), quantity: 8 }), true);
});

test("codigo de mesa ou bistro aceita entrada sem zero a esquerda", () => {
  assert.equal(getOfficialTableMapPlaceByInput("9")?.code, "09");
  assert.equal(getOfficialTableMapPlaceByInput("09")?.code, "09");
});

test("migration cria tabela de coordenadas oficiais com as sementes historicas", async () => {
  const migration = await readFile(migrationPath, "utf8");

  assert.match(migration, /create table if not exists public\.official_table_map_places/);
  assert.match(migration, /code text primary key/);
  assert.match(migration, /check \(x >= 0 and x <= 969\)/);
  assert.match(migration, /check \(y >= 0 and y <= 1371\)/);

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

test("migration corrige reservas oficiais para escopo por sessao", async () => {
  const migration = await readFile(scopedReservationsMigrationPath, "utf8");
  const availabilityService = await readFile(availabilityServicePath, "utf8");
  const router = await readFile(routerPath, "utf8");

  assert.match(migration, /add column if not exists event_id uuid references public\.events\(id\)/);
  assert.match(migration, /add column if not exists session_id uuid references public\.event_sessions\(id\)/);
  assert.match(migration, /drop index if exists public\.official_table_map_reservations_active_place_key/);
  assert.match(migration, /official_table_map_reservations_active_session_place_key/);
  assert.match(migration, /on public\.official_table_map_reservations\(session_id, place_code\)/);
  assert.match(migration, /where existing\.session_id = v_reservation\.session_id/);
  assert.match(migration, /event_id,\s*session_id,\s*reservation_id/);
  assert.match(availabilityService, /\.eq\("session_id", sessionId \?\? ""\)/);
  assert.match(router, /buildOfficialTableMapAvailabilityImage\(\{\s*quantity:[\s\S]*sessionId: cart\.sessionId/);
});

test("router integra escolha opcional de mesa ao fluxo de compra", async () => {
  const router = await readFile(routerPath, "utf8");
  const availabilityService = await readFile(availabilityServicePath, "utf8");

  assert.match(router, /"selecting_table_map_place"/);
  assert.match(router, /buildOfficialTableMapAvailabilityImage/);
  assert.match(router, /availability\.imageUrl/);
  assert.doesNotMatch(router, /Digite 2 para \*escolher mesa\/bistro gratuitamente\*/);
  assert.doesNotMatch(router, /Digite 2 para \*comprar outros\/mais ingressos\*/);
  assert.match(router, /Digite \*1\* para finalizar a compra/);
  assert.match(router, /if \(selectedOption === 1\)[\s\S]*formatTableMapSelectionReply/);
  assert.match(router, /🔴 Mesa 🔵 Bistrô alta/);
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

  assert.deepEqual(original, { x: 485, y: 686 });
  assert.ok(Math.abs(responsive.x - 371.5) < 0.5);
  assert.ok(Math.abs(responsive.y - 412) < 0.5);
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
  const baseMetadata = await sharp(baseImagePath).metadata();
  const rendered = await renderOfficialTableMap({ unavailableCodes: unavailableSample });
  const metadata = await sharp(rendered.buffer).metadata();
  const afterHash = await sha256(baseImagePath);

  assert.equal(baseMetadata.width, 969);
  assert.equal(baseMetadata.height, 1371);
  assert.equal(rendered.mimeType, "image/webp");
  assert.equal(rendered.filename, "mapa-mesas-render.webp");
  assert.equal(metadata.format, "webp");
  assert.equal(metadata.width, OFFICIAL_TABLE_MAP_WIDTH);
  assert.equal(metadata.height, OFFICIAL_TABLE_MAP_HEIGHT);
  assert.equal(beforeHash, afterHash);
});

test("renderizador rejeita imagem ausente ou invalida", async () => {
  await mkdir(outputDir, { recursive: true });
  const missingPath = path.join(outputDir, "mapa-ausente.webp");
  const invalidPath = path.join(outputDir, "mapa-invalido.webp");
  await writeFile(invalidPath, "nao e imagem");

  await assert.rejects(
    () => renderOfficialTableMap({ baseImagePath: missingPath }),
    /Input file is missing|unable to open/i,
  );
  await assert.rejects(
    () => renderOfficialTableMap({ baseImagePath: invalidPath }),
    /unsupported image format|Input buffer contains unsupported image format|source: bad seek/i,
  );
});

test("renderizador propaga falha do sharp quando overlay nao cabe na base", async () => {
  await mkdir(outputDir, { recursive: true });
  const smallImagePath = path.join(outputDir, "mapa-pequeno.webp");
  await sharp({
    create: {
      width: 100,
      height: 100,
      channels: 3,
      background: "#000000",
    },
  }).webp().toFile(smallImagePath);

  await assert.rejects(
    () => renderOfficialTableMap({ baseImagePath: smallImagePath }),
    /Image to composite must have same dimensions or smaller/,
  );
});

test("falha de render do mapa nao impede continuidade do fluxo", async () => {
  const availabilityService = await readFile(availabilityServicePath, "utf8");
  const router = await readFile(routerPath, "utf8");

  assert.match(availabilityService, /try \{[\s\S]*renderOfficialTableMap/);
  assert.match(availabilityService, /catch \(error\) \{[\s\S]*logError\("Failed to render official table map availability image"/);
  assert.match(availabilityService, /imageUrl: null/);
  assert.match(router, /\.\.\.\(availability\.imageUrl[\s\S]*outboundMessages/);
  assert.match(router, /: \{\}\)/);
});

test("renderizador posiciona cada texto exatamente nas coordenadas oficiais", async () => {
  const svg = await buildOfficialTableMapOverlaySvg({ places: OFFICIAL_TABLE_MAP_PLACES });

  for (const place of OFFICIAL_TABLE_MAP_PLACES) {
    const labelPattern = new RegExp(`data-label="${place.code}"`);

    assert.match(svg, labelPattern, `${place.code} nao foi renderizado no overlay`);
  }
});

test("renderizador usa a mesma referencia visual dos marcadores do editor", async () => {
  const css = await readFile(globalsCssPath, "utf8");
  const renderer = await readFile(tableMapRendererPath, "utf8");
  const svg = await buildOfficialTableMapOverlaySvg({
    places: [
      { code: "01", type: "bistro", environment: "ground_floor", capacity: 6, x: 336, y: 426 },
      { code: "20", type: "table", environment: "mezzanine", capacity: 8, x: 520, y: 366 },
    ],
  });

  assert.match(css, /\.admin-table-map-marker \{[\s\S]*width: 64px/);
  assert.match(css, /\.admin-table-map-marker \{[\s\S]*height: 52px/);
  assert.match(css, /\.admin-table-map-marker \{[\s\S]*transform: translate\(-50%, -50%\)/);
  assert.match(css, /\.admin-table-map-marker \{[\s\S]*font: 700 40px\/1 Arial, Helvetica, sans-serif/);
  assert.equal(OFFICIAL_TABLE_MAP_MARKER_VISUAL.width, 64);
  assert.equal(OFFICIAL_TABLE_MAP_MARKER_VISUAL.height, 52);
  assert.equal(OFFICIAL_TABLE_MAP_MARKER_VISUAL.fontWeight, 700);
  assert.equal(OFFICIAL_TABLE_MAP_MARKER_VISUAL.fontSize, 40);
  assert.equal(OFFICIAL_TABLE_MAP_MARKER_VISUAL.lineHeight, 1);
  assert.equal(OFFICIAL_TABLE_MAP_MARKER_VISUAL.fontFamily, "Arial, Helvetica, sans-serif");
  assert.equal(OFFICIAL_TABLE_MAP_MARKER_VISUAL.tableColor, "#bf151a");
  assert.equal(OFFICIAL_TABLE_MAP_MARKER_VISUAL.bistroColor, "#1f7888");
  assert.doesNotMatch(renderer, /DIGIT_SEGMENTS|buildSegmentDigitSvg|buildVectorLabelSvg/);
  assert.match(svg, /data-marker-width="64" data-marker-height="52"/);
  assert.match(svg, /transform="translate\(336 426\)"/);
  assert.match(svg, /font-family="Arial, Helvetica, sans-serif"/);
  assert.match(svg, /font-size="40"/);
  assert.match(svg, /font-weight="700"/);
  assert.match(svg, /fill="#1f7888">01<\/text>/);
  assert.match(svg, /fill="#bf151a">20<\/text>/);
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
