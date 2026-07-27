import path from "node:path";
import sharp from "sharp";

import {
  OFFICIAL_TABLE_MAP_ASSET,
  OFFICIAL_TABLE_MAP_HEIGHT,
  type OfficialTableMapPlace,
  OFFICIAL_TABLE_MAP_WIDTH,
  normalizeOfficialTableMapCode,
} from "@/lib/tickets/tableMap/officialPlaces";
import { getOfficialTableMapPlaces } from "@/lib/tickets/tableMap/officialPlaceCoordinates";

export type RenderOfficialTableMapInput = {
  unavailableCodes?: readonly string[];
  hiddenCodes?: readonly string[];
  baseImagePath?: string;
  format?: "webp" | "png";
  places?: readonly OfficialTableMapPlace[];
};

export type RenderedOfficialTableMap = {
  buffer: Buffer;
  mimeType: "image/webp" | "image/png";
  filename: string;
};

export const OFFICIAL_TABLE_MAP_MARKER_VISUAL = {
  width: 64,
  height: 52,
  fontFamily: "Arial, Helvetica, sans-serif",
  fontWeight: 700,
  fontSize: 40,
  lineHeight: 1,
  tableColor: "#bf151a",
  bistroColor: "#1f7888",
  unavailableColor: "#dc2626",
  textShadowColor: "#ffffff",
} as const;

function escapeSvgText(text: string) {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function buildLabelSvg({
  label,
  x,
  y,
  type,
}: {
  label: string;
  x: number;
  y: number;
  type: OfficialTableMapPlace["type"];
}) {
  const isUnavailable = label === "X";
  const visual = OFFICIAL_TABLE_MAP_MARKER_VISUAL;
  const fill = isUnavailable
    ? visual.unavailableColor
    : type === "bistro"
      ? visual.bistroColor
      : visual.tableColor;
  const text = escapeSvgText(label);

  return [
    `<g data-label="${text}" data-marker-width="${visual.width}" data-marker-height="${visual.height}" transform="translate(${x} ${y})">`,
    `<rect x="${-visual.width / 2}" y="${-visual.height / 2}" width="${visual.width}" height="${visual.height}" rx="4" fill="transparent"/>`,
    ...[
      [-1, -1],
      [1, -1],
      [-1, 1],
      [1, 1],
    ].map(([dx, dy]) =>
      `<text x="${dx}" y="${dy}" text-anchor="middle" dominant-baseline="central" font-family="${visual.fontFamily}" font-size="${visual.fontSize}" font-weight="${visual.fontWeight}" fill="${visual.textShadowColor}">${text}</text>`,
    ),
    `<text x="0" y="0" text-anchor="middle" dominant-baseline="central" font-family="${visual.fontFamily}" font-size="${visual.fontSize}" font-weight="${visual.fontWeight}" fill="${fill}">${text}</text>`,
    "</g>",
  ].join("");
}

export async function buildOfficialTableMapOverlaySvg({
  unavailableCodes = [],
  hiddenCodes = [],
  places,
}: Pick<RenderOfficialTableMapInput, "hiddenCodes" | "unavailableCodes" | "places"> = {}) {
  const resolvedPlaces = places ?? await getOfficialTableMapPlaces();
  const unavailable = new Set(
    unavailableCodes.map((code) => normalizeOfficialTableMapCode(code)),
  );
  const hidden = new Set(
    hiddenCodes.map((code) => normalizeOfficialTableMapCode(code)),
  );
  const labels = resolvedPlaces
    .filter((place) => !hidden.has(place.code))
    .map((place) =>
      buildLabelSvg({
        label: unavailable.has(place.code) ? "X" : place.code,
        x: place.x,
        y: place.y,
        type: place.type,
      }),
    ).join("");

  return [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${OFFICIAL_TABLE_MAP_WIDTH}" height="${OFFICIAL_TABLE_MAP_HEIGHT}" viewBox="0 0 ${OFFICIAL_TABLE_MAP_WIDTH} ${OFFICIAL_TABLE_MAP_HEIGHT}">`,
    labels,
    "</svg>",
  ].join("");
}

export async function renderOfficialTableMap({
  unavailableCodes = [],
  hiddenCodes = [],
  baseImagePath = path.join(process.cwd(), OFFICIAL_TABLE_MAP_ASSET),
  format = "webp",
  places,
}: RenderOfficialTableMapInput = {}): Promise<RenderedOfficialTableMap> {
  const svg = await buildOfficialTableMapOverlaySvg({
    hiddenCodes,
    unavailableCodes,
    places,
  });
  const image = sharp(baseImagePath).composite([
    {
      input: Buffer.from(svg),
      left: 0,
      top: 0,
    },
  ]);
  const buffer = format === "png"
    ? await image.png().toBuffer()
    : await image.webp({ quality: 95 }).toBuffer();

  return {
    buffer,
    mimeType: format === "png" ? "image/png" : "image/webp",
    filename: `mapa-mesas-render.${format}`,
  };
}
