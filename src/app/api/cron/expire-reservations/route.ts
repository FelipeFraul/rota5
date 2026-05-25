import { timingSafeEqual } from "crypto";
import { jsonError, jsonOk, unauthorized } from "@/lib/http/responses";
import { logError, logWarn } from "@/lib/logger";
import { expireReservationsAndNotify } from "@/lib/tickets/services/reservationExpiry";

export const runtime = "nodejs";

function getBearerToken(request: Request) {
  const authorization = request.headers.get("authorization") ?? "";
  return authorization.replace(/^Bearer\s+/i, "").trim();
}

function isSecretMatch(received: string, expected: string) {
  if (!received || !expected) {
    return false;
  }

  const receivedBuffer = Buffer.from(received);
  const expectedBuffer = Buffer.from(expected);

  return (
    receivedBuffer.length === expectedBuffer.length &&
    timingSafeEqual(receivedBuffer, expectedBuffer)
  );
}

async function handleExpireReservationsCron(request: Request) {
  const cronSecret = process.env.CRON_SECRET?.trim();

  if (!cronSecret) {
    logError("Reservation expiry cron is missing CRON_SECRET");
    return jsonError("Cron not configured", 503);
  }

  if (!isSecretMatch(getBearerToken(request), cronSecret)) {
    logWarn("Rejected reservation expiry cron with invalid secret");
    return unauthorized();
  }

  try {
    const result = await expireReservationsAndNotify(100);

    return jsonOk({
      ok: true,
      ...result,
    });
  } catch (error) {
    logError("Reservation expiry cron failed", { error });
    return jsonError("Internal Server Error", 500);
  }
}

export async function GET(request: Request) {
  return handleExpireReservationsCron(request);
}

export async function POST(request: Request) {
  return handleExpireReservationsCron(request);
}
