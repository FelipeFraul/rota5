import "server-only";

import { Buffer } from "node:buffer";

import {
  listSeatMap,
  type SeatMap,
  type SeatMapSeat,
} from "@/lib/tickets/services/seats";
import { PngCanvas, toPngDataUrl, type RgbaColor } from "@/lib/tickets/services/pngImage";

const AVAILABLE_COLOR: RgbaColor = [67, 160, 71, 255];
const UNAVAILABLE_COLOR: RgbaColor = [189, 189, 189, 255];
const TEXT_COLOR: RgbaColor = [17, 24, 39, 255];
const WHITE: RgbaColor = [255, 255, 255, 255];

type SeatPoint = {
  seat: SeatMapSeat;
  rowLabel: string;
  x: number;
  y: number;
};

type SeatPointMap = {
  points: SeatPoint[];
  width: number;
  height: number;
  hasCoordinateMap: boolean;
};

type GenerateSeatMapImageInput = {
  sessionId: string;
  sectionId: string;
  title?: string;
  stageLabel?: string;
};

type RenderSeatMapImageInput = {
  seatMap: SeatMap;
  title?: string;
  stageLabel?: string;
};

function compareNullableText(left?: string | null, right?: string | null) {
  return (left ?? "").localeCompare(right ?? "", "pt-BR", {
    numeric: true,
    sensitivity: "base",
  });
}

function parseNumericSeatNumber(value: string) {
  return /^\d+$/.test(value) ? Number(value) : null;
}

function sortSeats<T extends Pick<SeatMapSeat, "rowLabel" | "seatNumber" | "seatCode">>(
  left: T,
  right: T,
) {
  const rowCompare = compareNullableText(left.rowLabel, right.rowLabel);

  if (rowCompare !== 0) return rowCompare;

  const leftNumber = parseNumericSeatNumber(left.seatNumber);
  const rightNumber = parseNumericSeatNumber(right.seatNumber);

  if (leftNumber !== null && rightNumber !== null && leftNumber !== rightNumber) {
    return leftNumber - rightNumber;
  }

  const seatNumberCompare = compareNullableText(left.seatNumber, right.seatNumber);

  return seatNumberCompare !== 0
    ? seatNumberCompare
    : compareNullableText(left.seatCode, right.seatCode);
}

function hasUsableCoordinateMap(seats: SeatMapSeat[]) {
  const positionedSeats = seats.filter(
    (seat) =>
      seat.mapX !== null &&
      seat.mapX !== undefined &&
      seat.mapY !== null &&
      seat.mapY !== undefined,
  );

  return positionedSeats.length >= Math.max(1, Math.ceil(seats.length * 0.8));
}

function buildCoordinateSeatMapPoints(seats: SeatMapSeat[], stageLabel?: string): SeatPointMap | null {
  if (!hasUsableCoordinateMap(seats)) return null;

  const positionedSeats = seats.filter(
    (seat) =>
      seat.mapX !== null &&
      seat.mapX !== undefined &&
      seat.mapY !== null &&
      seat.mapY !== undefined,
  );
  const xs = positionedSeats.map((seat) => seat.mapX as number);
  const ys = positionedSeats.map((seat) => seat.mapY as number);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);
  const scale = 58;
  const leftPadding = 92;
  const topPadding = stageLabel ? 170 : 92;
  const width = Math.max(760, leftPadding + (maxX - minX + 1) * scale + 120);
  const height = Math.max(360, topPadding + (maxY - minY + 1) * scale + 96);

  return {
    width,
    height,
    hasCoordinateMap: true,
    points: positionedSeats.sort(sortSeats).map((seat) => ({
      seat,
      rowLabel: seat.rowLabel?.trim() || "",
      x: leftPadding + ((seat.mapX as number) - minX) * scale,
      y: topPadding + ((seat.mapY as number) - minY) * scale,
    })),
  };
}

function buildRowBasedSeatMapPoints(seats: SeatMapSeat[], title?: string, stageLabel?: string): SeatPointMap {
  const rows = new Map<string, SeatMapSeat[]>();

  for (const seat of seats) {
    const row = seat.rowLabel?.trim() || "Assentos";
    rows.set(row, [...(rows.get(row) ?? []), seat]);
  }

  const sortedRows = Array.from(rows.entries()).sort(([left], [right]) =>
    compareNullableText(left, right),
  );
  const maxSeatsInRow = Math.max(
    1,
    ...sortedRows.map(([, rowSeats]) => rowSeats.length),
  );
  const seatGap = 58;
  const rowGap = 66;
  const leftPadding = 92;
  const titleOffset = title ? 48 : 0;
  const stageOffset = stageLabel ? 74 : 0;
  const topPadding = 112 + titleOffset + stageOffset;
  const width = Math.max(560, leftPadding + maxSeatsInRow * seatGap + 84);
  const height = Math.max(360, topPadding + sortedRows.length * rowGap + 84);

  return {
    width,
    height,
    hasCoordinateMap: false,
    points: sortedRows.flatMap(([rowLabel, rowSeats], rowIndex) =>
      [...rowSeats].sort(sortSeats).map((seat, seatIndex) => ({
        seat,
        rowLabel,
        x: leftPadding + seatIndex * seatGap,
        y: topPadding + rowIndex * rowGap,
      })),
    ),
  };
}

function buildSeatPointMap(input: RenderSeatMapImageInput) {
  return (
    buildCoordinateSeatMapPoints(input.seatMap.seats, input.stageLabel) ??
    buildRowBasedSeatMapPoints(input.seatMap.seats, input.title, input.stageLabel)
  );
}

function drawLegend(canvas: PngCanvas, x: number, y: number) {
  canvas.fillCircle(x, y, 13, AVAILABLE_COLOR);
  canvas.drawText("LIVRE", x + 24, y - 9, { scale: 3, color: [55, 65, 81, 255] });
  canvas.fillCircle(x + 146, y, 13, UNAVAILABLE_COLOR);
  canvas.drawText("OCUPADO", x + 170, y - 9, { scale: 3, color: [55, 65, 81, 255] });
}

function drawSeat(canvas: PngCanvas, point: SeatPoint) {
  const fill = point.seat.isAvailable ? AVAILABLE_COLOR : UNAVAILABLE_COLOR;
  const label = point.seat.seatCode;
  const textScale = label.length <= 2 ? 3 : 2;
  const textY = point.y - Math.round((7 * textScale) / 2);

  canvas.fillCircle(point.x, point.y, 22, fill);
  canvas.drawText(label, point.x, textY, {
    scale: textScale,
    color: WHITE,
    align: "center",
  });
}

export function renderSeatMapImage(input: RenderSeatMapImageInput) {
  if (input.seatMap.seats.length === 0) {
    throw new Error("seat_map_empty");
  }

  const map = buildSeatPointMap(input);
  const canvas = new PngCanvas(map.width, map.height, WHITE);
  const rowLabels = new Map<string, number>();

  if (input.title) {
    canvas.drawText(input.title, 28, 28, { scale: 4, color: TEXT_COLOR });
  }

  if (input.stageLabel) {
    canvas.drawText(input.stageLabel, map.width / 2, input.title ? 92 : 46, {
      scale: 5,
      color: TEXT_COLOR,
      align: "center",
    });
  }

  drawLegend(canvas, 34, input.title || input.stageLabel ? 92 : 56);

  for (const point of map.points) {
    if (!point.rowLabel || rowLabels.has(point.rowLabel)) continue;
    rowLabels.set(point.rowLabel, point.y);
  }

  for (const [rowLabel, y] of rowLabels.entries()) {
    canvas.drawText(rowLabel, 28, y - 9, { scale: 4, color: TEXT_COLOR });
  }

  for (const point of map.points) {
    drawSeat(canvas, point);
  }

  return canvas.toPngBuffer();
}

export function buildSeatMapPngDataUrl(input: RenderSeatMapImageInput) {
  return toPngDataUrl(renderSeatMapImage(input));
}

export async function generateSeatMapImage(input: GenerateSeatMapImageInput): Promise<{
  buffer: Buffer;
  mimeType: "image/png";
  filename: string;
}> {
  const seatMap = await listSeatMap({
    sessionId: input.sessionId,
    sectionId: input.sectionId,
  });
  const buffer = renderSeatMapImage({
    seatMap,
    title: input.title,
    stageLabel: input.stageLabel,
  });

  return {
    buffer,
    mimeType: "image/png",
    filename: `seat-map-${input.sessionId}-${input.sectionId}.png`,
  };
}
