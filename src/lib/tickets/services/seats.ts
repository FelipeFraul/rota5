import "server-only";

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
  seats: {
    seat_code: string;
    section_id: string;
    row_label: string | null;
    seat_number: string;
    map_x: number | string | null;
    map_y: number | string | null;
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

function sortSeats(left: AvailableSeat, right: AvailableSeat) {
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
