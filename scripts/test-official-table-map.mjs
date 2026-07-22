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
  renderOfficialTableMap,
} from "../src/lib/tickets/tableMap/renderOfficialTableMap.ts";

const unavailableSample = ["03", "08", "21", "27", "42", "51"];
const outputDir = path.join(process.cwd(), ".tmp", "official-table-map");

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
});

test("coordenadas ficam dentro da imagem oficial", () => {
  for (const place of OFFICIAL_TABLE_MAP_PLACES) {
    assert.ok(place.x >= 0 && place.x <= OFFICIAL_TABLE_MAP_WIDTH, `${place.code} x fora da imagem`);
    assert.ok(place.y >= 0 && place.y <= OFFICIAL_TABLE_MAP_HEIGHT, `${place.code} y fora da imagem`);
  }
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
