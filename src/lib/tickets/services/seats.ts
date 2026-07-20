import "server-only";

import { Buffer } from "node:buffer";

import { getSupabaseAdmin } from "@/lib/supabase/admin";

const DEFAULT_AVAILABLE_SEATS_LIMIT = 20;
const AVAILABLE_SEATS_QUERY_LIMIT_MULTIPLIER = 5;

export type AvailableSeat = {
  sessionSeatId: string;
  seatId: string;
  seatCode: string;
  rowLabel?: string | null;
  seatNumber: string;
  mapX?: number | null;
  mapY?: number | null;
};

export type AvailableSeatList = {
  seats: AvailableSeat[];
  totalAvailableCount: number;
  limit: number;
  hasMore: boolean;
};

export type SeatMapSeat = AvailableSeat & {
  status: string;
  isAvailable: boolean;
};

export type SeatMap = {
  seats: SeatMapSeat[];
  availableSeats: SeatMapSeat[];
  totalSeatsCount: number;
  totalAvailableCount: number;
};

export type ValidatedSeatForReservation = {
  sessionSeatId: string;
  seatId: string;
  sectionId: string;
  seatCode: string;
  rowLabel?: string | null;
  seatNumber: string;
};

type SessionSeatRow = {
  id: string;
  seat_id: string;
  status?: string;
  seats: {
    seat_code: string;
    section_id: string;
    row_label: string | null;
    seat_number: string;
    map_x: number | string | null;
    map_y: number | string | null;
    status?: string;
  } | null;
  venue_sections: { status: string; venues: { status: string } | null } | null;
};

type ValidationSessionSeatRow = SessionSeatRow & {
  section_id: string;
  status: string;
};

function normalizeLimit(limit?: number) {
  if (!Number.isInteger(limit) || !limit || limit <= 0) {
    return DEFAULT_AVAILABLE_SEATS_LIMIT;
  }

  return Math.min(limit, DEFAULT_AVAILABLE_SEATS_LIMIT);
}

function parseNumericSeatNumber(value: string) {
  return /^\d+$/.test(value) ? Number(value) : null;
}

function compareNullableText(left?: string | null, right?: string | null) {
  return (left ?? "").localeCompare(right ?? "", "pt-BR", {
    numeric: true,
    sensitivity: "base",
  });
}

function sortSeats<T extends Pick<AvailableSeat, "rowLabel" | "seatNumber" | "seatCode">>(
  left: T,
  right: T,
) {
  const rowCompare = compareNullableText(left.rowLabel, right.rowLabel);

  if (rowCompare !== 0) {
    return rowCompare;
  }

  const leftNumber = parseNumericSeatNumber(left.seatNumber);
  const rightNumber = parseNumericSeatNumber(right.seatNumber);

  if (leftNumber !== null && rightNumber !== null && leftNumber !== rightNumber) {
    return leftNumber - rightNumber;
  }

  const seatNumberCompare = compareNullableText(left.seatNumber, right.seatNumber);

  if (seatNumberCompare !== 0) {
    return seatNumberCompare;
  }

  return compareNullableText(left.seatCode, right.seatCode);
}

function toNullableNumber(value: number | string | null) {
  if (value === null || typeof value === "number") {
    return value;
  }

  const parsed = Number(value);

  return Number.isFinite(parsed) ? parsed : null;
}

export async function listAvailableSeats({
  sessionId,
  sectionId,
  limit,
}: {
  sessionId: string;
  sectionId: string;
  limit?: number;
}): Promise<AvailableSeatList> {
  const supabase = getSupabaseAdmin();
  const normalizedLimit = normalizeLimit(limit);
  const candidateLimit = normalizedLimit * AVAILABLE_SEATS_QUERY_LIMIT_MULTIPLIER;
  const { data, error, count } = await supabase
    .from("session_seats")
    .select(
      "id, seat_id, seats!inner(seat_code, section_id, row_label, seat_number, map_x, map_y), venue_sections!inner(status, venues!inner(status))",
      { count: "exact" },
    )
    .eq("session_id", sessionId)
    .eq("section_id", sectionId)
    .eq("status", "available")
    .eq("seats.status", "active")
    .eq("seats.section_id", sectionId)
    .eq("venue_sections.status", "active")
    .eq("venue_sections.venues.status", "active")
    .limit(candidateLimit)
    .returns<SessionSeatRow[]>();

  if (error) {
    throw error;
  }

  const seats = (data ?? [])
    .flatMap((row) => {
      if (!row.seats) {
        return [];
      }

      return [
        {
          sessionSeatId: row.id,
          seatId: row.seat_id,
          seatCode: row.seats.seat_code,
          rowLabel: row.seats.row_label,
          seatNumber: row.seats.seat_number,
          mapX: toNullableNumber(row.seats.map_x),
          mapY: toNullableNumber(row.seats.map_y),
        },
      ];
    })
    .sort(sortSeats)
    .slice(0, normalizedLimit);

  const totalAvailableCount = count ?? seats.length;

  return {
    seats,
    totalAvailableCount,
    limit: normalizedLimit,
    hasMore: totalAvailableCount > seats.length,
  };
}

export async function listSeatMap({
  sessionId,
  sectionId,
}: {
  sessionId: string;
  sectionId: string;
}): Promise<SeatMap> {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("session_seats")
    .select(
      "id, seat_id, status, seats!inner(seat_code, section_id, row_label, seat_number, map_x, map_y, status), venue_sections!inner(status, venues!inner(status))",
    )
    .eq("session_id", sessionId)
    .eq("section_id", sectionId)
    .eq("seats.section_id", sectionId)
    .eq("venue_sections.status", "active")
    .eq("venue_sections.venues.status", "active")
    .returns<SessionSeatRow[]>();

  if (error) {
    throw error;
  }

  const seats = (data ?? [])
    .flatMap((row): SeatMapSeat[] => {
      if (!row.seats) {
        return [];
      }

      const status = row.status ?? "unknown";
      const seatStatus = row.seats.status ?? "active";
      const isAvailable = status === "available" && seatStatus === "active";

      return [
        {
          sessionSeatId: row.id,
          seatId: row.seat_id,
          seatCode: row.seats.seat_code,
          rowLabel: row.seats.row_label,
          seatNumber: row.seats.seat_number,
          mapX: toNullableNumber(row.seats.map_x),
          mapY: toNullableNumber(row.seats.map_y),
          status,
          isAvailable,
        },
      ];
    })
    .sort(sortSeats);

  const availableSeats = seats.filter((seat) => seat.isAvailable);

  return {
    seats,
    availableSeats,
    totalSeatsCount: seats.length,
    totalAvailableCount: availableSeats.length,
  };
}

function escapeSvg(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function buildRowBasedSeatMapPoints(seats: SeatMapSeat[]) {
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
  const seatGap = 52;
  const rowGap = 64;
  const leftPadding = 76;
  const topPadding = 112;
  const width = Math.max(480, leftPadding + maxSeatsInRow * seatGap + 48);
  const height = Math.max(320, topPadding + sortedRows.length * rowGap + 76);
  const points = sortedRows.flatMap(([rowLabel, rowSeats], rowIndex) => {
    const sortedSeats = [...rowSeats].sort(sortSeats);

    return sortedSeats.map((seat, seatIndex) => ({
      seat,
      rowLabel,
      x: leftPadding + seatIndex * seatGap,
      y: topPadding + rowIndex * rowGap,
    }));
  });

  return { points, width, height, hasCoordinateMap: false };
}

function buildCoordinateSeatMapPoints(seats: SeatMapSeat[]) {
  const positionedSeats = seats.filter(
    (seat) => seat.mapX !== null && seat.mapX !== undefined && seat.mapY !== null && seat.mapY !== undefined,
  );

  if (positionedSeats.length < Math.max(1, Math.ceil(seats.length * 0.8))) {
    return null;
  }

  const xs = positionedSeats.map((seat) => seat.mapX as number);
  const ys = positionedSeats.map((seat) => seat.mapY as number);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);
  const scale = 54;
  const leftPadding = 76;
  const topPadding = 210;
  const width = Math.max(760, leftPadding + (maxX - minX + 1) * scale + 120);
  const height = Math.max(320, topPadding + (maxY - minY + 1) * scale + 92);

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

export function buildSeatMapImageDataUrl({
  sectionName,
  seatMap,
}: {
  sectionName: string;
  seatMap: SeatMap;
}) {
  const mapPoints =
    buildCoordinateSeatMapPoints(seatMap.seats) ??
    buildRowBasedSeatMapPoints(seatMap.seats);
  const rowLabels = new Map<string, number>();

  for (const point of mapPoints.points) {
    if (!point.rowLabel || rowLabels.has(point.rowLabel)) {
      continue;
    }

    rowLabels.set(point.rowLabel, point.y);
  }

  const svg = [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${mapPoints.width}" height="${mapPoints.height}" viewBox="0 0 ${mapPoints.width} ${mapPoints.height}">`,
    `<rect width="100%" height="100%" fill="#ffffff"/>`,
    ...(mapPoints.hasCoordinateMap
      ? [
          `<text x="${mapPoints.width / 2}" y="88" text-anchor="middle" fill="#111827" font-family="Georgia, serif" font-size="30" font-weight="700">PALCO</text>`,
        ]
      : [
          `<text x="28" y="38" fill="#111827" font-family="Arial, sans-serif" font-size="24" font-weight="700">${escapeSvg(sectionName.toLocaleUpperCase("pt-BR"))}</text>`,
          `<circle cx="34" cy="70" r="13" fill="#43a047"/><text x="54" y="76" fill="#374151" font-family="Arial, sans-serif" font-size="18">Livre</text>`,
          `<circle cx="134" cy="70" r="13" fill="#bdbdbd"/><text x="154" y="76" fill="#374151" font-family="Arial, sans-serif" font-size="18">Ocupado</text>`,
        ]),
    ...Array.from(rowLabels.entries()).map(
      ([rowLabel, y]) =>
        `<text x="28" y="${y + 7}" fill="#111827" font-family="Arial, sans-serif" font-size="22" font-weight="700">${escapeSvg(rowLabel)}</text>`,
    ),
    ...mapPoints.points.map(({ seat, x, y }) => {
      const fill = seat.isAvailable ? "#43a047" : "#bdbdbd";
      const label = seat.seatCode;

      return [
        `<circle cx="${x}" cy="${y}" r="20" fill="${fill}"/>`,
        `<text x="${x}" y="${y + 4}" text-anchor="middle" fill="#ffffff" font-family="Arial, sans-serif" font-size="11" font-weight="700">${escapeSvg(label)}</text>`,
      ].join("");
    }),
    `</svg>`,
  ].join("");

  return `data:image/svg+xml;base64,${Buffer.from(svg).toString("base64")}`;
}

export async function getValidatedSeatForReservation({
  sessionId,
  sectionId,
  seatId,
}: {
  sessionId: string;
  sectionId: string;
  seatId: string;
}): Promise<ValidatedSeatForReservation | null> {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("session_seats")
    .select(
      "id, seat_id, section_id, status, seats!inner(seat_code, section_id, row_label, seat_number, map_x, map_y), venue_sections!inner(status, venues!inner(status))",
    )
    .eq("session_id", sessionId)
    .eq("section_id", sectionId)
    .eq("seat_id", seatId)
    .eq("status", "available")
    .eq("seats.status", "active")
    .eq("seats.section_id", sectionId)
    .eq("venue_sections.status", "active")
    .eq("venue_sections.venues.status", "active")
    .maybeSingle<ValidationSessionSeatRow>();

  if (error) {
    throw error;
  }

  if (!data?.seats) {
    return null;
  }

  return {
    sessionSeatId: data.id,
    seatId: data.seat_id,
    sectionId: data.section_id,
    seatCode: data.seats.seat_code,
    rowLabel: data.seats.row_label,
    seatNumber: data.seats.seat_number,
  };
}
