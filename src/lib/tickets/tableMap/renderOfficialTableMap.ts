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
  fontFamily: "Bebas Neue",
  fontFile: path.join(process.cwd(), "public", "fonts", "BebasNeue-Regular.ttf"),
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

async function renderMarkerText({
  color,
  text,
}: {
  color: string;
  text: string;
}) {
  const visual = OFFICIAL_TABLE_MAP_MARKER_VISUAL;

  return sharp({
    text: {
      text: `<span foreground="${color}">${escapeSvgText(text)}</span>`,
      font: `${visual.fontFamily} ${visual.fontSize}`,
      fontfile: visual.fontFile,
      width: visual.width,
      align: "center",
      rgba: true,
      dpi: 72,
    },
  })
    .png()
    .toBuffer();
}

async function renderMarkerImage({
  label,
  type,
}: {
  label: string;
  type: OfficialTableMapPlace["type"];
}) {
  const visual = OFFICIAL_TABLE_MAP_MARKER_VISUAL;
  const isUnavailable = label === "X";
  const fill = isUnavailable
    ? visual.unavailableColor
    : type === "bistro"
      ? visual.bistroColor
      : visual.tableColor;
  const shadow = await renderMarkerText({ color: visual.textShadowColor, text: label });
  const foreground = await renderMarkerText({ color: fill, text: label });
  const shadowMetadata = await sharp(shadow).metadata();
  const foregroundMetadata = await sharp(foreground).metadata();
  const shadowLeft = Math.round((visual.width - (shadowMetadata.width ?? visual.width)) / 2);
  const foregroundLeft = Math.round((visual.width - (foregroundMetadata.width ?? visual.width)) / 2);
  const shadowTop = Math.round((visual.height - (shadowMetadata.height ?? visual.height)) / 2);
  const foregroundTop = Math.round((visual.height - (foregroundMetadata.height ?? visual.height)) / 2);
  const shadowOffsets = [
    { left: -1, top: -1 },
    { left: 1, top: -1 },
    { left: -1, top: 1 },
    { left: 1, top: 1 },
  ];

  return sharp({
    create: {
      width: visual.width,
      height: visual.height,
      channels: 4,
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    },
  })
    .composite([
      ...shadowOffsets.map((offset) => ({ input: shadow, left: shadowLeft + offset.left, top: shadowTop + offset.top })),
      { input: foreground, left: foregroundLeft, top: foregroundTop },
    ])
    .png()
    .toBuffer();
}

async function buildOfficialTableMapMarkerComposites({
  hiddenCodes = [],
  unavailableCodes = [],
  places,
}: Pick<RenderOfficialTableMapInput, "hiddenCodes" | "unavailableCodes" | "places"> = {}) {
  const resolvedPlaces = places ?? await getOfficialTableMapPlaces();
  const unavailable = new Set(
    unavailableCodes.map((code) => normalizeOfficialTableMapCode(code)),
  );
  const hidden = new Set(
    hiddenCodes.map((code) => normalizeOfficialTableMapCode(code)),
  );
  const visual = OFFICIAL_TABLE_MAP_MARKER_VISUAL;
  const composites = await Promise.all(
    resolvedPlaces
      .filter((place) => !hidden.has(place.code))
      .map(async (place) => ({
        input: await renderMarkerImage({
          label: unavailable.has(place.code) ? "X" : place.code,
          type: place.type,
        }),
        left: Math.round(place.x - visual.width / 2),
        top: Math.round(place.y - visual.height / 2),
      })),
  );

  return composites;
}

export async function renderOfficialTableMap({
  unavailableCodes = [],
  hiddenCodes = [],
  baseImagePath = path.join(process.cwd(), OFFICIAL_TABLE_MAP_ASSET),
  format = "webp",
  places,
}: RenderOfficialTableMapInput = {}): Promise<RenderedOfficialTableMap> {
  const markerComposites = await buildOfficialTableMapMarkerComposites({
    hiddenCodes,
    unavailableCodes,
    places,
  });
  const image = sharp(baseImagePath).composite(markerComposites);
  const buffer = format === "png"
    ? await image.png().toBuffer()
    : await image.webp({ quality: 95 }).toBuffer();

  return {
    buffer,
    mimeType: format === "png" ? "image/png" : "image/webp",
    filename: `mapa-mesas-render.${format}`,
  };
}
