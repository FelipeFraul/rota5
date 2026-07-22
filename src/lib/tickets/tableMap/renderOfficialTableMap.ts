import path from "node:path";
import sharp from "sharp";

import {
  OFFICIAL_TABLE_MAP_ASSET,
  OFFICIAL_TABLE_MAP_HEIGHT,
  OFFICIAL_TABLE_MAP_PLACES,
  OFFICIAL_TABLE_MAP_WIDTH,
  normalizeOfficialTableMapCode,
} from "@/lib/tickets/tableMap/officialPlaces";

export type RenderOfficialTableMapInput = {
  unavailableCodes?: readonly string[];
  baseImagePath?: string;
  format?: "webp" | "png";
};

export type RenderedOfficialTableMap = {
  buffer: Buffer;
  mimeType: "image/webp" | "image/png";
  filename: string;
};

function escapeXml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
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
  const isUnavailable = label === "XX";
  const fontSize = labelSize ?? (isUnavailable ? 24 : 22);
  const fill = isUnavailable ? "#dc2626" : "#111827";
  const stroke = isUnavailable ? "#7f1d1d" : "#f8fafc";
  const strokeWidth = isUnavailable ? 5 : 4;

  return [
    `<text x="${x}" y="${y}" text-anchor="middle" dominant-baseline="central" font-family="Arial, Helvetica, sans-serif" font-size="${fontSize}" font-weight="900" fill="${fill}" stroke="${stroke}" stroke-width="${strokeWidth}" paint-order="stroke fill">${escapeXml(label)}</text>`,
  ].join("");
}

export async function renderOfficialTableMap({
  unavailableCodes = [],
  baseImagePath = path.join(process.cwd(), OFFICIAL_TABLE_MAP_ASSET),
  format = "webp",
}: RenderOfficialTableMapInput = {}): Promise<RenderedOfficialTableMap> {
  const unavailable = new Set(
    unavailableCodes.map((code) => normalizeOfficialTableMapCode(code)),
  );
  const labels = OFFICIAL_TABLE_MAP_PLACES.map((place) =>
    buildLabelSvg({
      label: unavailable.has(place.code) ? "XX" : place.code,
      x: place.x,
      y: place.y,
      labelSize: place.labelSize,
    }),
  ).join("");
  const svg = [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${OFFICIAL_TABLE_MAP_WIDTH}" height="${OFFICIAL_TABLE_MAP_HEIGHT}" viewBox="0 0 ${OFFICIAL_TABLE_MAP_WIDTH} ${OFFICIAL_TABLE_MAP_HEIGHT}">`,
    labels,
    "</svg>",
  ].join("");
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
