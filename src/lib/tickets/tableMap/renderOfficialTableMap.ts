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

const DIGIT_SEGMENTS: Record<string, string[]> = {
  "0": ["a", "b", "c", "d", "e", "f"],
  "1": ["b", "c"],
  "2": ["a", "b", "g", "e", "d"],
  "3": ["a", "b", "g", "c", "d"],
  "4": ["f", "g", "b", "c"],
  "5": ["a", "f", "g", "c", "d"],
  "6": ["a", "f", "g", "e", "c", "d"],
  "7": ["a", "b", "c"],
  "8": ["a", "b", "c", "d", "e", "f", "g"],
  "9": ["a", "b", "c", "d", "f", "g"],
};

function buildSegmentDigitSvg({
  digit,
  x,
  y,
  width,
  height,
  color,
}: {
  digit: string;
  x: number;
  y: number;
  width: number;
  height: number;
  color: string;
}) {
  const active = new Set(DIGIT_SEGMENTS[digit] ?? []);
  const thickness = Math.max(6.5, width * 0.2 + 1);
  const radius = thickness / 2;
  const horizontalWidth = width - thickness;
  const verticalHeight = height / 2 - thickness * 1.2;
  const midY = y + height / 2 - thickness / 2;
  const bottomY = y + height - thickness;
  const rightX = x + width - thickness;
  const centerYTop = y + thickness * 0.85;
  const centerYBottom = y + height / 2 + thickness * 0.45;

  const segmentRects: Record<string, string> = {
    a: `<rect x="${x + thickness / 2}" y="${y}" width="${horizontalWidth}" height="${thickness}" rx="${radius}" fill="${color}"/>`,
    g: `<rect x="${x + thickness / 2}" y="${midY}" width="${horizontalWidth}" height="${thickness}" rx="${radius}" fill="${color}"/>`,
    d: `<rect x="${x + thickness / 2}" y="${bottomY}" width="${horizontalWidth}" height="${thickness}" rx="${radius}" fill="${color}"/>`,
    f: `<rect x="${x}" y="${centerYTop}" width="${thickness}" height="${verticalHeight}" rx="${radius}" fill="${color}"/>`,
    b: `<rect x="${rightX}" y="${centerYTop}" width="${thickness}" height="${verticalHeight}" rx="${radius}" fill="${color}"/>`,
    e: `<rect x="${x}" y="${centerYBottom}" width="${thickness}" height="${verticalHeight}" rx="${radius}" fill="${color}"/>`,
    c: `<rect x="${rightX}" y="${centerYBottom}" width="${thickness}" height="${verticalHeight}" rx="${radius}" fill="${color}"/>`,
  };

  return ["a", "b", "c", "d", "e", "f", "g"]
    .filter((segment) => active.has(segment))
    .map((segment) => segmentRects[segment])
    .join("");
}

function buildVectorLabelSvg({
  label,
  x,
  y,
  fontSize,
  color,
}: {
  label: string;
  x: number;
  y: number;
  fontSize: number;
  color: string;
}) {
  if (label === "X") {
    const width = fontSize * 1.25;
    const height = fontSize * 0.82;
    const strokeWidth = Math.max(7, fontSize * 0.17);
    const topY = y - height / 2;

    const left = x - width / 2;
    const right = x + width / 2;
    const bottom = topY + height;

    return [
      `<line x1="${left}" y1="${topY}" x2="${right}" y2="${bottom}" stroke="${color}" stroke-width="${strokeWidth}" stroke-linecap="round"/>`,
      `<line x1="${right}" y1="${topY}" x2="${left}" y2="${bottom}" stroke="${color}" stroke-width="${strokeWidth}" stroke-linecap="round"/>`,
    ].join("");
  }

  const digits = label.split("");
  const digitWidth = fontSize * 0.62;
  const digitHeight = fontSize * 0.88;
  const gap = fontSize * 0.06;
  const totalWidth = digitWidth * digits.length + gap * (digits.length - 1);
  const startX = x - totalWidth / 2;
  const startY = y - digitHeight / 2;

  return digits.map((digit, index) =>
    buildSegmentDigitSvg({
      digit,
      x: startX + index * (digitWidth + gap),
      y: startY,
      width: digitWidth,
      height: digitHeight,
      color,
    }),
  ).join("");
}

function buildLabelSvg({
  label,
  x,
  y,
  labelSize,
}: {
  label: string;
  x: number;
  y: number;
  labelSize?: number;
}) {
  const isUnavailable = label === "X";
  const fontSize = labelSize ?? (isUnavailable ? 44 : 40);
  const fill = isUnavailable ? "#dc2626" : "#064106";

  return [
    `<g data-label="${label}" transform="translate(0 0)">${buildVectorLabelSvg({ label, x, y, fontSize, color: fill })}</g>`,
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
        labelSize: place.labelSize,
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
