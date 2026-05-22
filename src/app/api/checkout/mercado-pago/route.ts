import { timingSafeEqual } from "crypto";
import { getEnv } from "@/lib/env";
import {
  badRequest,
  jsonError,
  jsonOk,
  methodNotAllowed,
  unauthorized,
} from "@/lib/http/responses";
import { logError, logWarn } from "@/lib/logger";
import {
  createMercadoPagoPreference,
  type MercadoPagoPreferenceItem,
} from "@/lib/mercado-pago/client";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import {
  buildOrderExternalReference,
  centsToDecimalAmount,
} from "@/lib/tickets/services/payments";

const PROVIDER = "mercado_pago";
const MAX_CHECKOUT_BYTES = 32 * 1024;
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

type CheckoutOrder = {
  id: string;
  reservation_id: string;
  customer_id: string;
  status: string;
  total_amount_cents: number;
  total_fee_cents: number;
  currency: string;
  external_reference: string | null;
};

type CheckoutReservation = {
  id: string;
  customer_id: string;
  session_id: string;
  status: string;
  expires_at: string;
};

type CheckoutReservationItem = {
  id: string;
  seat_id: string;
  section_id: string;
  seat_code: string;
  ticket_type: string;
  price_cents: number;
  fee_cents: number;
  currency: string;
};

type PendingPayment = {
  id: string;
  provider_preference_id: string | null;
  checkout_url: string | null;
};

function isSecretMatch(received: string | null, expected: string) {
  if (!received) {
    return false;
  }

  const receivedBuffer = Buffer.from(received);
  const expectedBuffer = Buffer.from(expected);

  return (
    receivedBuffer.length === expectedBuffer.length &&
    timingSafeEqual(receivedBuffer, expectedBuffer)
  );
}

async function readCheckoutBody(request: Request) {
  const contentLength = request.headers.get("content-length");

  if (contentLength && Number(contentLength) > MAX_CHECKOUT_BYTES) {
    return {
      ok: false as const,
      response: badRequest("Bad Request"),
    };
  }

  const rawBody = await request.text();

  if (new TextEncoder().encode(rawBody).byteLength > MAX_CHECKOUT_BYTES) {
    return {
      ok: false as const,
      response: badRequest("Bad Request"),
    };
  }

  try {
    const body = JSON.parse(rawBody) as unknown;

    if (!body || typeof body !== "object") {
      return {
        ok: false as const,
        response: badRequest("Bad Request"),
      };
    }

    return {
      ok: true as const,
      body: body as Record<string, unknown>,
    };
  } catch {
    return {
      ok: false as const,
      response: badRequest("Bad Request"),
    };
  }
}

function normalizeBaseUrl(baseUrl: string) {
  return baseUrl.replace(/\/+$/, "");
}

function buildCheckoutUrl(baseUrl: string, path: string) {
  return `${normalizeBaseUrl(baseUrl)}${path}`;
}

function buildPaymentMetadata({
  preferenceId,
  checkoutUrl,
  externalReference,
  notificationUrl,
  expiresAt,
}: {
  preferenceId: string;
  checkoutUrl: string;
  externalReference: string;
  notificationUrl: string;
  expiresAt: string;
}) {
  return {
    provider: PROVIDER,
    preference_id: preferenceId,
    checkout_url: checkoutUrl,
    external_reference: externalReference,
    notification_url: notificationUrl,
    expires_at: expiresAt,
  };
}

export async function POST(request: Request) {
  const checkoutSecret = process.env.CHECKOUT_INTERNAL_SECRET;

  if (
    !checkoutSecret ||
    !isSecretMatch(request.headers.get("x-checkout-secret"), checkoutSecret)
  ) {
    logWarn("Rejected Mercado Pago checkout request with invalid secret");
    return unauthorized();
  }

  const env = getEnv();

  const bodyResult = await readCheckoutBody(request);

  if (!bodyResult.ok) {
    return bodyResult.response;
  }

  const orderId = bodyResult.body.order_id;

  if (typeof orderId !== "string" || !UUID_PATTERN.test(orderId)) {
    return badRequest("Bad Request");
  }

  const supabase = getSupabaseAdmin();
  const { data: order, error: orderError } = await supabase
    .from("orders")
    .select("*")
    .eq("id", orderId)
    .maybeSingle<CheckoutOrder>();

  if (orderError) {
    logError("Failed to load checkout order", {
      orderId,
      code: orderError.code,
    });
    return jsonError("Internal Server Error", 500);
  }

  if (!order) {
    return badRequest("order_not_found");
  }

  if (order.status !== "pending_payment") {
    return badRequest("order_not_payable");
  }

  const { data: reservation, error: reservationError } = await supabase
    .from("reservations")
    .select("*")
    .eq("id", order.reservation_id)
    .maybeSingle<CheckoutReservation>();

  if (reservationError) {
    logError("Failed to load checkout reservation", {
      orderId,
      code: reservationError.code,
    });
    return jsonError("Internal Server Error", 500);
  }

  if (!reservation) {
    return badRequest("reservation_not_found");
  }

  if (reservation.customer_id !== order.customer_id) {
    return badRequest("reservation_not_payable");
  }

  if (reservation.status !== "active") {
    return badRequest("reservation_not_payable");
  }

  if (new Date(reservation.expires_at).getTime() <= Date.now()) {
    return badRequest("reservation_expired");
  }

  const { data: customer, error: customerError } = await supabase
    .from("customers")
    .select("id, email, name")
    .eq("id", order.customer_id)
    .maybeSingle();

  if (customerError) {
    logError("Failed to load checkout customer", {
      orderId,
      code: customerError.code,
    });
    return jsonError("Internal Server Error", 500);
  }

  if (!customer) {
    return badRequest("customer_not_found");
  }

  const { data: reservationItems, error: reservationItemsError } = await supabase
    .from("reservation_items")
    .select("*")
    .eq("reservation_id", reservation.id)
    .order("seat_code", { ascending: true })
    .returns<CheckoutReservationItem[]>();

  if (reservationItemsError) {
    logError("Failed to load checkout reservation items", {
      orderId,
      code: reservationItemsError.code,
    });
    return jsonError("Internal Server Error", 500);
  }

  if (!reservationItems || reservationItems.length === 0) {
    return badRequest("reservation_items_not_found");
  }

  const { data: session } = await supabase
    .from("event_sessions")
    .select("id, event_id")
    .eq("id", reservation.session_id)
    .maybeSingle<{ id: string; event_id: string }>();

  const { data: event } = session?.event_id
    ? await supabase
        .from("events")
        .select("id, title")
        .eq("id", session.event_id)
        .maybeSingle<{ id: string; title: string }>()
    : { data: null };

  const sectionIds = Array.from(
    new Set(reservationItems.map((item) => item.section_id)),
  );
  const { data: sections } =
    sectionIds.length > 0
      ? await supabase
          .from("venue_sections")
          .select("id, name")
          .in("id", sectionIds)
          .returns<Array<{ id: string; name: string }>>()
      : { data: [] };
  const sectionNames = new Map(
    (sections ?? []).map((section) => [section.id, section.name]),
  );

  const externalReference = buildOrderExternalReference(order.id);

  if (order.external_reference !== externalReference) {
    const { error: externalReferenceError } = await supabase
      .from("orders")
      .update({ external_reference: externalReference })
      .eq("id", order.id);

    if (externalReferenceError) {
      logError("Failed to update checkout order external reference", {
        orderId,
        code: externalReferenceError.code,
      });
      return jsonError("Internal Server Error", 500);
    }
  }

  const { data: reusablePayment, error: reusablePaymentError } = await supabase
    .from("payments")
    .select("id, provider_preference_id, checkout_url")
    .eq("order_id", order.id)
    .eq("provider", PROVIDER)
    .eq("status", "pending")
    .not("provider_preference_id", "is", null)
    .not("checkout_url", "is", null)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle<PendingPayment>();

  if (reusablePaymentError) {
    logError("Failed to load reusable checkout payment", {
      orderId,
      code: reusablePaymentError.code,
    });
    return jsonError("Internal Server Error", 500);
  }

  const totalAmountCents = order.total_amount_cents + order.total_fee_cents;

  if (reusablePayment?.provider_preference_id && reusablePayment.checkout_url) {
    return jsonOk({
      order_id: order.id,
      reservation_id: reservation.id,
      provider: PROVIDER,
      preference_id: reusablePayment.provider_preference_id,
      checkout_url: reusablePayment.checkout_url,
      expires_at: reservation.expires_at,
      amount_cents: totalAmountCents,
      currency: "BRL",
    });
  }

  const items: MercadoPagoPreferenceItem[] = [];

  for (const item of reservationItems) {
    const unitPrice = centsToDecimalAmount(item.price_cents + item.fee_cents);

    if (unitPrice == null) {
      logWarn("Rejected checkout with invalid reservation item amount", {
        orderId,
        reservationItemId: item.id,
      });
      return jsonError("Internal Server Error", 500);
    }

    const sectionName = sectionNames.get(item.section_id) ?? "Setor";
    const eventTitle = event?.title ?? "Ingresso";

    items.push({
      title: `${eventTitle} - ${sectionName} - Assento ${item.seat_code}`,
      quantity: 1,
      unit_price: unitPrice,
      currency_id: "BRL" as const,
    });
  }

  const notificationUrl = buildCheckoutUrl(
    env.APP_BASE_URL,
    "/api/webhook/payment/mercado-pago",
  );
  const preferenceResult = await createMercadoPagoPreference({
    items,
    external_reference: externalReference,
    notification_url: notificationUrl,
    back_urls: {
      success: buildCheckoutUrl(env.APP_BASE_URL, "/checkout/success"),
      failure: buildCheckoutUrl(env.APP_BASE_URL, "/checkout/failure"),
      pending: buildCheckoutUrl(env.APP_BASE_URL, "/checkout/pending"),
    },
    expires: true,
    expiration_date_from: new Date().toISOString(),
    expiration_date_to: reservation.expires_at,
    metadata: {
      order_id: order.id,
      reservation_id: reservation.id,
    },
  });

  if (!preferenceResult.ok) {
    logWarn("Failed to create Mercado Pago preference", {
      orderId,
      code: preferenceResult.code,
      status: preferenceResult.status,
    });
    return jsonError("Internal Server Error", 500);
  }

  const checkoutUrl =
    preferenceResult.preference.init_point ??
    preferenceResult.preference.sandbox_init_point;

  if (!checkoutUrl) {
    logWarn("Mercado Pago preference did not include a checkout URL", {
      orderId,
      preferenceId: preferenceResult.preference.id,
    });
    return jsonError("Internal Server Error", 500);
  }

  const rawMetadata = buildPaymentMetadata({
    preferenceId: preferenceResult.preference.id,
    checkoutUrl,
    externalReference,
    notificationUrl,
    expiresAt: reservation.expires_at,
  });

  const { data: pendingPayment, error: pendingPaymentError } = await supabase
    .from("payments")
    .select("id")
    .eq("order_id", order.id)
    .eq("provider", PROVIDER)
    .eq("status", "pending")
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle<{ id: string }>();

  if (pendingPaymentError) {
    logError("Failed to load pending checkout payment", {
      orderId,
      code: pendingPaymentError.code,
    });
    return jsonError("Internal Server Error", 500);
  }

  const paymentPayload = {
    provider_preference_id: preferenceResult.preference.id,
    status: "pending",
    amount_cents: totalAmountCents,
    currency: "BRL",
    checkout_url: checkoutUrl,
    raw_metadata: rawMetadata,
    updated_at: new Date().toISOString(),
  };

  const paymentResult = pendingPayment?.id
    ? await supabase
        .from("payments")
        .update(paymentPayload)
        .eq("id", pendingPayment.id)
    : await supabase.from("payments").insert({
        order_id: order.id,
        provider: PROVIDER,
        ...paymentPayload,
      });

  if (paymentResult.error) {
    logError("Failed to persist pending checkout payment", {
      orderId,
      code: paymentResult.error.code,
    });
    return jsonError("Internal Server Error", 500);
  }

  return jsonOk({
    order_id: order.id,
    reservation_id: reservation.id,
    provider: PROVIDER,
    preference_id: preferenceResult.preference.id,
    checkout_url: checkoutUrl,
    expires_at: reservation.expires_at,
    amount_cents: totalAmountCents,
    currency: "BRL",
  });
}

export function GET() {
  return methodNotAllowed(["POST"]);
}

export function PUT() {
  return methodNotAllowed(["POST"]);
}

export function PATCH() {
  return methodNotAllowed(["POST"]);
}

export function DELETE() {
  return methodNotAllowed(["POST"]);
}
