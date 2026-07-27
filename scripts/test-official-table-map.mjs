import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
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
  OFFICIAL_TABLE_MAP_MARKER_VISUAL,
  OFFICIAL_TABLE_MAP_PLACES,
  OFFICIAL_TABLE_MAP_WIDTH,
} from "../src/lib/tickets/tableMap/officialPlaces.ts";
import {
  buildOfficialTableMapOverlaySvg,
  renderOfficialTableMap,
} from "../src/lib/tickets/tableMap/renderOfficialTableMap.ts";
import { persistOfficialTableMapPlaces } from "../src/lib/tickets/tableMap/persistOfficialPlaces.ts";
import {
  getOfficialTableMapPlaceByInput,
  isOfficialTableMapPlaceAllowedForQuantity,
} from "../src/lib/tickets/services/officialTableMapReservations.ts";

const outputDir = path.join(process.cwd(), ".tmp", "official-table-map");
const migrationPaths = [
  path.join(process.cwd(), "supabase", "migrations", "20260722000700_create_official_table_map_places.sql"),
  path.join(process.cwd(), "supabase", "migrations", "20260727000100_recalibrate_official_table_map_places.sql"),
  path.join(process.cwd(), "supabase", "migrations", "20260727000200_recalibrate_official_table_map_label_spaces.sql"),
];
const migrationsDir = path.join(process.cwd(), "supabase", "migrations");
const reservationsMigrationPath = path.join(process.cwd(), "supabase", "migrations", "20260722000800_create_official_table_map_reservations.sql");
const scopedReservationsMigrationPath = path.join(process.cwd(), "supabase", "migrations", "20260724000400_scope_official_table_map_reservations_by_session.sql");
const routerPath = path.join(process.cwd(), "src", "lib", "tickets", "router.ts");
const globalsCssPath = path.join(process.cwd(), "src", "app", "globals.css");
const rendererPath = path.join(process.cwd(), "src", "lib", "tickets", "tableMap", "renderOfficialTableMap.ts");
const coordinatesPath = path.join(process.cwd(), "src", "lib", "tickets", "tableMap", "officialPlaceCoordinates.ts");
const calibratorPath = path.join(process.cwd(), "src", "app", "admin", "AdminTableMapCalibrator.tsx");
const apiRoutePath = path.join(process.cwd(), "src", "app", "api", "admin", "table-map", "route.ts");
const availabilityServicePath = path.join(process.cwd(), "src", "lib", "tickets", "services", "officialTableMapReservations.ts");

const samplePlaces = OFFICIAL_TABLE_MAP_PLACES.map((place, index) => ({
  ...place,
  x: 40 + (index % 8) * 95,
  y: 80 + Math.floor(index / 8) * 210,
}));
const unavailableSample = ["03", "08", "21", "27", "41", "51"];

async function sha256(filePath) {
  return createHash("sha256").update(await readFile(filePath)).digest("hex");
}

test("catalogo oficial contem somente metadados dos 40 lugares", () => {
  assert.equal(OFFICIAL_TABLE_MAP_PLACES.length, 40);
  assert.equal(new Set(OFFICIAL_TABLE_MAP_PLACES.map((place) => place.code)).size, 40);
  assert.deepEqual(
    OFFICIAL_TABLE_MAP_PLACES.map((place) => place.code),
    OFFICIAL_TABLE_MAP_PLACES.map((place) => place.code.padStart(2, "0")),
  );
  assert.equal(OFFICIAL_TABLE_MAP_PLACES.every((place) => !("x" in place) && !("y" in place)), true);
});

test("regras de capacidade usam metadados sem depender de coordenadas", () => {
  const placeByCapacity = new Map(
    [2, 4, 6, 8].map((capacity) => [
      capacity,
      OFFICIAL_TABLE_MAP_PLACES.find((place) => place.capacity === capacity),
    ]),
  );

  assert.equal(isOfficialTableMapPlaceAllowedForQuantity({ place: placeByCapacity.get(2), quantity: 2 }), true);
  assert.equal(isOfficialTableMapPlaceAllowedForQuantity({ place: placeByCapacity.get(4), quantity: 2 }), false);
  assert.equal(isOfficialTableMapPlaceAllowedForQuantity({ place: placeByCapacity.get(4), quantity: 5 }), true);
  assert.equal(isOfficialTableMapPlaceAllowedForQuantity({ place: placeByCapacity.get(6), quantity: 7 }), true);
  assert.equal(isOfficialTableMapPlaceAllowedForQuantity({ place: placeByCapacity.get(8), quantity: 8 }), true);
  assert.equal(getOfficialTableMapPlaceByInput("9")?.code, "09");
});

test("coordenadas do mapa oficial sao lidas somente do banco", async () => {
  const coordinates = await readFile(coordinatesPath, "utf8");

  assert.match(coordinates, /\.from\("official_table_map_places"\)/);
  assert.match(coordinates, /throw new Error\(`official_table_map_places_read_failed/);
  assert.doesNotMatch(coordinates, /return OFFICIAL_TABLE_MAP_PLACES/);
  assert.doesNotMatch(coordinates, /catch[\s\S]*OFFICIAL_TABLE_MAP_PLACES/);
});

test("migrations nao inserem nem sobrescrevem coordenadas existentes", async () => {
  const migrationNames = await readdir(migrationsDir);
  const allMigrationPaths = migrationNames
    .filter((filename) => filename.endsWith(".sql"))
    .map((filename) => path.join(migrationsDir, filename));

  for (const migrationPath of allMigrationPaths) {
    const migration = await readFile(migrationPath, "utf8");

    assert.doesNotMatch(migration, /insert\s+into\s+public\.official_table_map_places/i, migrationPath);
    assert.doesNotMatch(migration, /update\s+public\.official_table_map_places/i, migrationPath);
    assert.doesNotMatch(migration, /on\s+conflict\s*\(code\)\s+do\s+update/i, migrationPath);
    assert.doesNotMatch(migration, /\bset\s+x\s*=/i, migrationPath);
    assert.doesNotMatch(migration, /\bset\s+y\s*=/i, migrationPath);
    assert.doesNotMatch(migration, /\('\d{2}',\s*\d+,\s*\d+\)/, migrationPath);
  }
});

test("migration cria apenas estrutura da tabela oficial de coordenadas", async () => {
  const migration = await readFile(migrationPaths[0], "utf8");

  assert.match(migration, /create table if not exists public\.official_table_map_places/);
  assert.match(migration, /code text primary key/);
  assert.match(migration, /check \(x >= 0 and x <= 969\)/);
  assert.match(migration, /check \(y >= 0 and y <= 1371\)/);
});

test("editor salva e recarrega usando a API sem fallback de coordenadas", async () => {
  const calibrator = await readFile(calibratorPath, "utf8");
  const apiRoute = await readFile(apiRoutePath, "utf8");

  assert.match(calibrator, /fetch\("\/api\/admin\/table-map", \{ cache: "no-store" \}\)/);
  assert.match(calibrator, /buildEmptyDraftPlaces\(places\)/);
  assert.match(calibrator, /Calibre os pontos e salve para criar os registros/);
  assert.match(calibrator, /method: "PUT"/);
  assert.match(calibrator, /body: JSON\.stringify\(\{ places: draftPlacesRef\.current \}\)/);
  assert.match(calibrator, /setLoadedPlaces\(savedPlaces\)/);
  assert.match(calibrator, /draftPlacesRef\.current = clonePlaces\(savedPlaces\)/);
  assert.match(calibrator, /await loadFinalPreview\(\)/);
  assert.doesNotMatch(calibrator, /Usando catalogo padrao como fallback/);
  assert.match(apiRoute, /message: result\.message/);
  assert.match(apiRoute, /details: result\.details/);
});

test("preview final usa exatamente o render do WhatsApp e nao aceita coordenadas do editor", async () => {
  const calibrator = await readFile(calibratorPath, "utf8");
  const apiRoute = await readFile(apiRoutePath, "utf8");

  assert.match(calibrator, /Visualizar imagem final/);
  assert.match(calibrator, /fetch\("\/api\/admin\/table-map\?preview=final", \{ cache: "no-store" \}\)/);
  assert.match(calibrator, /setPreviewImageUrl\(payload\.imageUrl\)/);
  assert.match(apiRoute, /url\.searchParams\.get\("preview"\) === "final"/);
  assert.match(apiRoute, /renderOfficialTableMap\(\{ format: "png" \}\)/);
  assert.doesNotMatch(apiRoute, /renderOfficialTableMap\(\{ format: "png",[\s\S]*places/);
});

test("persistencia rejeita metadados alterados e mostra erro real", async () => {
  const invalidPlaces = samplePlaces.map((place) => ({ ...place }));
  invalidPlaces[0] = { ...invalidPlaces[0], type: "table" };

  const result = await persistOfficialTableMapPlaces(invalidPlaces);

  assert.equal(result.ok, false);
  assert.equal(result.reason, "invalid_metadata");
  assert.match(result.message, /Metadados/);
});

test("calibracao converte e exporta coordenadas exatas do editor", () => {
  const rect = { left: 100, top: 50, width: 543, height: 724 };
  const original = responsivePointToOriginalPoint({ x: 371.5, y: 412 }, rect);
  const responsive = originalPointToResponsivePoint(original, rect);
  const parsed = JSON.parse(exportOfficialPlacesCalibrationJson(samplePlaces));

  assert.deepEqual(original, { x: 485, y: 686 });
  assert.ok(Math.abs(responsive.x - 371.5) < 0.5);
  assert.ok(Math.abs(responsive.y - 412) < 0.5);
  assert.deepEqual(clampOfficialTableMapPoint({ x: -25, y: 2000 }), { x: 0, y: OFFICIAL_TABLE_MAP_HEIGHT });
  assert.deepEqual(parsed, samplePlaces);
});

test("editor e render usam os mesmos tokens visuais e escala proporcional", async () => {
  const css = await readFile(globalsCssPath, "utf8");
  const calibrator = await readFile(calibratorPath, "utf8");
  const renderer = await readFile(rendererPath, "utf8");

  assert.match(css, /\.admin-table-map-surface \{[\s\S]*container-type: inline-size/);
  assert.doesNotMatch(css, /\.admin-table-map-marker \{[\s\S]*width: 64px/);
  assert.doesNotMatch(css, /\.admin-table-map-marker \{[\s\S]*height: 52px/);
  assert.doesNotMatch(css, /\.admin-table-map-marker \{[\s\S]*font: 700 40px/);
  assert.match(css, /\.admin-table-map-marker \{[\s\S]*transform: translate\(-50%, -50%\)/);
  assert.match(calibrator, /OFFICIAL_TABLE_MAP_MARKER_VISUAL/);
  assert.match(calibrator, /100cqw/);
  assert.match(renderer, /OFFICIAL_TABLE_MAP_MARKER_VISUAL/);
  assert.equal(OFFICIAL_TABLE_MAP_MARKER_VISUAL.width, 64);
  assert.equal(OFFICIAL_TABLE_MAP_MARKER_VISUAL.height, 52);
  assert.equal(OFFICIAL_TABLE_MAP_MARKER_VISUAL.fontFamily, "Bebas Neue");
  assert.equal(OFFICIAL_TABLE_MAP_MARKER_VISUAL.fontSize, 40);
  assert.equal(OFFICIAL_TABLE_MAP_MARKER_VISUAL.tableColor, "#bf151a");
  assert.equal(OFFICIAL_TABLE_MAP_MARKER_VISUAL.bistroColor, "#1f7888");
  assert.equal(OFFICIAL_TABLE_MAP_MARKER_VISUAL.unavailableColor, "#ffffff");
  assert.equal(OFFICIAL_TABLE_MAP_MARKER_VISUAL.unavailableTextShadowColor, "#dc2626");
});

test("renderizador posiciona overlay exatamente nos pontos recebidos", async () => {
  const svg = await buildOfficialTableMapOverlaySvg({ places: samplePlaces.slice(0, 3), unavailableCodes: ["02"] });

  for (const place of samplePlaces.slice(0, 3)) {
    assert.match(svg, new RegExp(`transform="translate\\(${place.x} ${place.y}\\)"`));
  }
  assert.match(svg, /fill="#1f7888">01<\/text>/);
  assert.match(svg, /fill="#dc2626">X<\/text>[\s\S]*fill="#ffffff">X<\/text>/);
});

test("renderizador gera imagem derivada e preserva imagem original", async () => {
  const baseImagePath = path.join(process.cwd(), OFFICIAL_TABLE_MAP_ASSET);
  const beforeHash = await sha256(baseImagePath);
  const baseMetadata = await sharp(baseImagePath).metadata();
  const rendered = await renderOfficialTableMap({ places: samplePlaces, unavailableCodes: unavailableSample });
  const metadata = await sharp(rendered.buffer).metadata();
  const afterHash = await sha256(baseImagePath);

  assert.equal(baseMetadata.width, 969);
  assert.equal(baseMetadata.height, 1371);
  assert.equal(rendered.mimeType, "image/webp");
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
    () => renderOfficialTableMap({ baseImagePath: missingPath, places: samplePlaces.slice(0, 1) }),
    /Input file is missing|unable to open/i,
  );
  await assert.rejects(
    () => renderOfficialTableMap({ baseImagePath: invalidPath, places: samplePlaces.slice(0, 1) }),
    /unsupported image format|Input buffer contains unsupported image format|source: bad seek/i,
  );
});

test("fluxo de WhatsApp continua anexando imagem quando o render retorna imageUrl", async () => {
  const availabilityService = await readFile(availabilityServicePath, "utf8");
  const router = await readFile(routerPath, "utf8");
  const reservationsMigration = await readFile(reservationsMigrationPath, "utf8");
  const scopedMigration = await readFile(scopedReservationsMigrationPath, "utf8");

  assert.match(availabilityService, /const places = await getOfficialTableMapPlaces\(\)/);
  assert.match(availabilityService, /renderOfficialTableMap\(\{[\s\S]*places: availability\.places/);
  assert.match(router, /availability\.imageUrl/);
  assert.match(router, /\.\.\.\(availability\.imageUrl[\s\S]*outboundMessages/);
  assert.match(reservationsMigration, /place_code text not null references public\.official_table_map_places\(code\)/);
  assert.match(scopedMigration, /official_table_map_reservations_active_session_place_key/);
});
