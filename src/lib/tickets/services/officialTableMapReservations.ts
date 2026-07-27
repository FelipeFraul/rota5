import "server-only";

import { logError } from "@/lib/logger";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import {
  OFFICIAL_TABLE_MAP_PLACES,
  type OfficialTableMapPlace,
  type OfficialTableMapPlaceMetadata,
} from "@/lib/tickets/tableMap/officialPlaces";
import { getOfficialTableMapPlaces } from "@/lib/tickets/tableMap/officialPlaceCoordinates";
import { renderOfficialTableMap } from "@/lib/tickets/tableMap/renderOfficialTableMap";

export type OfficialTableMapReservationPlace = Pick<
  OfficialTableMapPlaceMetadata,
  "code" | "type" | "environment" | "capacity"
>;

export type OfficialTableMapAvailability = {
  places: readonly OfficialTableMapPlace[];
  unavailableCodes: string[];
  hiddenCodes: string[];
  availablePlaces: OfficialTableMapPlace[];
  allowedPlaces: OfficialTableMapPlace[];
};

export type ReserveOfficialTableMapPlaceResult =
  | { ok: true; place: OfficialTableMapReservationPlace }
  | {
      ok: false;
      reason:
        | "place_not_found"
        | "place_not_available"
        | "reservation_not_found"
        | "reservation_not_payable"
        | "reservation_expired"
        | "order_not_found"
        | "order_not_payable"
        | "reserve_failed";
      error?: unknown;
    };

type ActivePlaceReservationRow = {
  place_code: string;
};

const PLACE_BY_CODE = new Map(
  OFFICIAL_TABLE_MAP_PLACES.map((place) => [place.code, place]),
);

function normalizeOfficialPlaceCode(input: string) {
  const digits = input.replace(/\D/g, "");
  if (!digits) return null;
  return digits.padStart(2, "0");
}

function mapReserveError(error: unknown): Extract<
  ReserveOfficialTableMapPlaceResult,
  { ok: false }
>["reason"] {
  const message =
    error && typeof error === "object" && "message" in error
      ? String((error as { message?: unknown }).message ?? "")
      : "";

  if (message.includes("place_not_found")) return "place_not_found";
  if (message.includes("place_not_available")) return "place_not_available";
  if (message.includes("reservation_not_found")) return "reservation_not_found";
  if (message.includes("reservation_not_payable")) return "reservation_not_payable";
  if (message.includes("reservation_expired")) return "reservation_expired";
  if (message.includes("order_not_found")) return "order_not_found";
  if (message.includes("order_not_payable")) return "order_not_payable";
  return "reserve_failed";
}

export function getOfficialTableMapPlaceByInput(input: string) {
  const code = normalizeOfficialPlaceCode(input);
  return code ? PLACE_BY_CODE.get(code) ?? null : null;
}

export function isOfficialTableMapPlaceAllowedForQuantity({
  place,
  quantity,
}: {
  place: OfficialTableMapPlaceMetadata;
  quantity: number;
}) {
  if (quantity <= 1) return false;
  if (quantity <= 2) return place.capacity === 2;
  if (quantity <= 3) return place.capacity === 2;
  if (quantity <= 5) return place.capacity === 2 || place.capacity === 4;
  if (quantity <= 7) return place.capacity === 2 || place.capacity === 4 || place.capacity === 6;
  return place.capacity === 2 || place.capacity === 4 || place.capacity === 6 || place.capacity === 8;
}

export async function listOfficialTableMapAvailability({
  quantity,
  sessionId,
}: {
  quantity?: number;
  sessionId?: string;
} = {}): Promise<OfficialTableMapAvailability> {
  const supabase = getSupabaseAdmin();
  const nowIso = new Date().toISOString();
  const places = await getOfficialTableMapPlaces();
  const allowedPlaces =
    typeof quantity === "number"
      ? places.filter((place) =>
          isOfficialTableMapPlaceAllowedForQuantity({ place, quantity }),
        )
      : [...places];
  const allowedCodes = new Set(allowedPlaces.map((place) => place.code));
  const { data, error } = await supabase
    .from("official_table_map_reservations")
    .select("place_code")
    .eq("session_id", sessionId ?? "")
    .or(`status.eq.paid,and(status.eq.active,expires_at.gt.${nowIso})`)
    .returns<ActivePlaceReservationRow[]>();

  if (error) {
    throw error;
  }

  const reservedCodes = Array.from(
    new Set(
      (data ?? [])
        .map((row) => row.place_code)
        .filter((code) => places.some((place) => place.code === code)),
    ),
  ).sort();
  const hiddenCodes = places
    .filter((place) => !allowedCodes.has(place.code))
    .map((place) => place.code)
    .sort();
  const unavailable = new Set(reservedCodes);

  return {
    places,
    unavailableCodes: reservedCodes,
    hiddenCodes,
    allowedPlaces,
    availablePlaces: places.filter(
      (place) => allowedCodes.has(place.code) && !unavailable.has(place.code),
    ),
  };
}

export async function buildOfficialTableMapAvailabilityImage({
  quantity,
  sessionId,
}: {
  quantity?: number;
  sessionId?: string;
} = {}) {
  const availability = await listOfficialTableMapAvailability({ quantity, sessionId });

  try {
    const rendered = await renderOfficialTableMap({
      format: "png",
      places: availability.places,
      unavailableCodes: availability.unavailableCodes,
      hiddenCodes: availability.hiddenCodes,
    });

    return {
      ...availability,
      imageUrl: `data:${rendered.mimeType};base64,${rendered.buffer.toString("base64")}`,
    };
  } catch (error) {
    logError("Failed to render official table map availability image", {
      error,
      quantity,
      sessionId,
    });
  }

  return {
    ...availability,
    imageUrl: null,
  };
}

export async function reserveOfficialTableMapPlace({
  code,
  reservationId,
  orderId,
  customerId,
}: {
  code: string;
  reservationId: string;
  orderId: string;
  customerId: string;
}): Promise<ReserveOfficialTableMapPlaceResult> {
  const place = getOfficialTableMapPlaceByInput(code);

  if (!place) {
    return { ok: false, reason: "place_not_found" };
  }

  const supabase = getSupabaseAdmin();
  const { error } = await supabase.rpc("reserve_official_table_map_place", {
    p_place_code: place.code,
    p_reservation_id: reservationId,
    p_order_id: orderId,
    p_customer_id: customerId,
  });

  if (error) {
    return { ok: false, reason: mapReserveError(error), error };
  }

  return {
    ok: true,
    place: {
      code: place.code,
      type: place.type,
      environment: place.environment,
      capacity: place.capacity,
    },
  };
}
