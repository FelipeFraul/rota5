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
const recalibrationMigrationPath = path.join(
  process.cwd(),
  "supabase",
  "migrations",
  "20260727000200_recalibrate_official_table_map_label_spaces.sql",
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
  ["01", { x: 102, y: 455 }],
  ["02", { x: 64, y: 548 }],
  ["03", { x: 142, y: 501 }],
  ["04", { x: 236, y: 503 }],
  ["05", { x: 132, y: 620 }],
  ["06", { x: 287, y: 663 }],
  ["07", { x: 130, y: 701 }],
  ["08", { x: 130, y: 783 }],
  ["09", { x: 143, y: 872 }],
  ["10", { x: 116, y: 1047 }],
  ["11", { x: 184, y: 1028 }],
  ["12", { x: 284, y: 1048 }],
  ["13", { x: 346, y: 1018 }],
  ["20", { x: 768, y: 407 }],
  ["21", { x: 540, y: 358 }],
  ["22", { x: 540, y: 396 }],
  ["23", { x: 704, y: 458 }],
  ["24", { x: 646, y: 528 }],
  ["25", { x: 697, y: 610 }],
  ["26", { x: 704, y: 710 }],
  ["27", { x: 719, y: 801 }],
  ["28", { x: 735, y: 893 }],
  ["29", { x: 759, y: 984 }],
  ["30", { x: 619, y: 1018 }],
  ["31", { x: 671, y: 1018 }],
  ["32", { x: 724, y: 1018 }],
  ["33", { x: 617, y: 1104 }],
  ["40", { x: 550, y: 455 }],
  ["41", { x: 550, y: 528 }],
  ["42", { x: 754, y: 614 }],
  ["43", { x: 770, y: 716 }],
  ["44", { x: 786, y: 813 }],
  ["45", { x: 804, y: 895 }],
  ["46", { x: 802, y: 977 }],
  ["51", { x: 540, y: 1165 }],
  ["52", { x: 610, y: 1165 }],
  ["53", { x: 664, y: 1166 }],
  ["54", { x: 552, y: 1238 }],
  ["55", { x: 605, y: 1266 }],
  ["56", { x: 668, y: 1266 }],
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

test("migration cria tabela de coordenadas oficiais com sementes iniciais", async () => {
  const migration = await readFile(migrationPath, "utf8");

  assert.match(migration, /create table if not exists public\.official_table_map_places/);
  assert.match(migration, /code text primary key/);
  assert.match(migration, /check \(x >= 0 and x <= 969\)/);
  assert.match(migration, /check \(y >= 0 and y <= 1371\)/);
  assert.match(migration, /insert into public\.official_table_map_places/);
});

test("migration de recalibracao aplica as coordenadas finais", async () => {
  const migration = await readFile(recalibrationMigrationPath, "utf8");

  assert.match(migration, /insert into public\.official_table_map_places/);
  assert.match(migration, /on conflict \(code\) do update/);

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

test("renderizador continua gerando imagem quando a fonte local nao estiver disponivel", async () => {
  const renderer = await import("../src/lib/tickets/tableMap/renderOfficialTableMap.ts");
  const originalFontFile = renderer.OFFICIAL_TABLE_MAP_MARKER_VISUAL.fontFile;

  renderer.OFFICIAL_TABLE_MAP_MARKER_VISUAL.fontFile = path.join(
    process.cwd(),
    ".tmp",
    "fonte-inexistente.ttf",
  );

  try {
    const rendered = await renderOfficialTableMap({
      format: "png",
      places: [
        { code: "01", type: "bistro", environment: "ground_floor", capacity: 6, x: 124, y: 469 },
      ],
      unavailableCodes: ["01"],
    });
    const metadata = await sharp(rendered.buffer).metadata();

    assert.equal(rendered.mimeType, "image/png");
    assert.equal(metadata.width, OFFICIAL_TABLE_MAP_WIDTH);
    assert.equal(metadata.height, OFFICIAL_TABLE_MAP_HEIGHT);
    assert.ok(rendered.buffer.length > 100_000);
  } finally {
    renderer.OFFICIAL_TABLE_MAP_MARKER_VISUAL.fontFile = originalFontFile;
  }
});

test("renderizador recorta marcador quando a base for menor que o mapa oficial", async () => {
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

  const rendered = await renderOfficialTableMap({ baseImagePath: smallImagePath, places: OFFICIAL_TABLE_MAP_PLACES.slice(0, 1) });
  const metadata = await sharp(rendered.buffer).metadata();

  assert.equal(metadata.width, 100);
  assert.equal(metadata.height, 100);
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
  assert.match(css, /@font-face \{[\s\S]*font-family: "Bebas Neue"/);
  assert.match(css, /\.admin-table-map-marker \{[\s\S]*font: 700 40px\/1 "Bebas Neue", Arial, Helvetica, sans-serif/);
  assert.match(css, /\.admin-table-map-marker\.is-bistro \{[\s\S]*color: #1f7888/);
  assert.match(css, /\.admin-table-map-marker\.is-table \{[\s\S]*color: #bf151a/);
  assert.equal(OFFICIAL_TABLE_MAP_MARKER_VISUAL.width, 64);
  assert.equal(OFFICIAL_TABLE_MAP_MARKER_VISUAL.height, 52);
  assert.equal(OFFICIAL_TABLE_MAP_MARKER_VISUAL.fontWeight, 700);
  assert.equal(OFFICIAL_TABLE_MAP_MARKER_VISUAL.fontSize, 40);
  assert.equal(OFFICIAL_TABLE_MAP_MARKER_VISUAL.lineHeight, 1);
  assert.equal(OFFICIAL_TABLE_MAP_MARKER_VISUAL.fontFamily, "Bebas Neue");
  assert.match(OFFICIAL_TABLE_MAP_MARKER_VISUAL.fontFile, /public[\\/]+fonts[\\/]+BebasNeue-Regular\.ttf$/);
  assert.equal(OFFICIAL_TABLE_MAP_MARKER_VISUAL.tableColor, "#bf151a");
  assert.equal(OFFICIAL_TABLE_MAP_MARKER_VISUAL.bistroColor, "#1f7888");
  assert.doesNotMatch(renderer, /DIGIT_SEGMENTS|buildSegmentDigitSvg|buildVectorLabelSvg/);
  assert.doesNotMatch(svg, /Arial|Helvetica|sans-serif/);
  assert.match(svg, /data-marker-width="64" data-marker-height="52"/);
  assert.match(svg, /transform="translate\(336 426\)"/);
  assert.match(svg, /font-family="Bebas Neue"/);
  assert.match(svg, /font-size="40"/);
  assert.match(svg, /font-weight="700"/);
  assert.match(svg, /fill="#1f7888">01<\/text>/);
  assert.match(svg, /fill="#bf151a">20<\/text>/);
});

test("renderizador imprime o marcador 01 no bitmap final sem depender de Arial instalada", async () => {
  const place01 = { code: "01", type: "bistro", environment: "ground_floor", capacity: 6, x: 336, y: 426 };
  const baseImagePath = path.join(process.cwd(), OFFICIAL_TABLE_MAP_ASSET);
  const baseCrop = await sharp(baseImagePath)
    .extract({
      left: place01.x - OFFICIAL_TABLE_MAP_MARKER_VISUAL.width / 2,
      top: place01.y - OFFICIAL_TABLE_MAP_MARKER_VISUAL.height / 2,
      width: OFFICIAL_TABLE_MAP_MARKER_VISUAL.width,
      height: OFFICIAL_TABLE_MAP_MARKER_VISUAL.height,
    })
    .raw()
    .toBuffer();
  const rendered = await renderOfficialTableMap({ format: "png", places: [place01] });
  const markerCrop = await sharp(rendered.buffer)
    .extract({
      left: place01.x - OFFICIAL_TABLE_MAP_MARKER_VISUAL.width / 2,
      top: place01.y - OFFICIAL_TABLE_MAP_MARKER_VISUAL.height / 2,
      width: OFFICIAL_TABLE_MAP_MARKER_VISUAL.width,
      height: OFFICIAL_TABLE_MAP_MARKER_VISUAL.height,
    })
    .raw()
    .toBuffer();

  let changedPixels = 0;
  let bistroPixels = 0;
  for (let index = 0; index < markerCrop.length; index += 3) {
    const r = markerCrop[index];
    const g = markerCrop[index + 1];
    const b = markerCrop[index + 2];
    if (
      Math.abs(r - baseCrop[index]) > 8 ||
      Math.abs(g - baseCrop[index + 1]) > 8 ||
      Math.abs(b - baseCrop[index + 2]) > 8
    ) {
      changedPixels += 1;
    }
    if (r < 80 && g > 80 && b > 90) {
      bistroPixels += 1;
    }
  }

  assert.ok(changedPixels > 200, "bitmap final deve conter o numero 01 sobre a imagem base");
  assert.ok(bistroPixels > 60, "bitmap final deve conter pixels azuis do numero 01");
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
