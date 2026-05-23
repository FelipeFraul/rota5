import "server-only";

import {
  createMercadoPagoPreference,
  type MercadoPagoPreferenceItem,
} from "@/lib/mercado-pago/client";
import { getEnv } from "@/lib/env";
import { logError, logWarn } from "@/lib/logger";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import {
  buildOrderExternalReference,
  centsToDecimalAmount,
} from "@/lib/tickets/services/payments";

const PROVIDER = "mercado_pago";

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
  session_seat_id: string;
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

type ReservedSessionSeat = {
  id: string;
  status: string;
  current_reservation_id: string | null;
};

export type CheckoutForReservation = {
  orderId: string;
  reservationId: string;
  provider: "mercado_pago";
  preferenceId: string;
  checkoutUrl: string;
  expiresAt: string;
  amountCents: number;
  currency: "BRL";
  reused: boolean;
};

export type CreateCheckoutForReservationResult =
  | {
      ok: true;
      checkout: CheckoutForReservation;
    }
  | {
      ok: false;
      reason:
        | "order_not_found"
        | "order_not_payable"
        | "reservation_not_found"
        | "reservation_not_payable"
        | "reservation_expired"
        | "customer_not_found"
        | "reservation_items_not_found"
        | "reservation_seats_not_reserved"
        | "checkout_amount_mismatch"
        | "invalid_amount"
        | "preference_create_failed"
        | "preference_missing_checkout_url"
        | "payment_persist_failed"
        | "internal_error";
    };

export type CreateCheckoutForReservationInput = {
  orderId: string;
  reservationId?: string;
  customerId?: string;
};

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

function checkoutPayload({
  order,
  reservation,
  preferenceId,
  checkoutUrl,
  amountCents,
  reused,
}: {
  order: CheckoutOrder;
  reservation: CheckoutReservation;
  preferenceId: string;
  checkoutUrl: string;
  amountCents: number;
  reused: boolean;
}): CheckoutForReservation {
  return {
    orderId: order.id,
    reservationId: reservation.id,
    provider: PROVIDER,
    preferenceId,
    checkoutUrl,
    expiresAt: reservation.expires_at,
    amountCents,
    currency: "BRL",
    reused,
  };
}

async function validateReservationSeats({
  reservationId,
  reservationItems,
}: {
  reservationId: string;
  reservationItems: CheckoutReservationItem[];
}) {
  const supabase = getSupabaseAdmin();
  const sessionSeatIds = reservationItems.map((item) => item.session_seat_id);
  const { data, error } = await supabase
    .from("session_seats")
    .select("id, status, current_reservation_id")
    .in("id", sessionSeatIds)
    .returns<ReservedSessionSeat[]>();

  if (error) {
    throw error;
  }

  const seatsById = new Map((data ?? []).map((seat) => [seat.id, seat]));

  return reservationItems.every((item) => {
    const seat = seatsById.get(item.session_seat_id);

    return (
      seat?.status === "reserved" && seat.current_reservation_id === reservationId
    );
  });
}

export async function createCheckoutForReservation({
  orderId,
  reservationId,
  customerId,
}: CreateCheckoutForReservationInput): Promise<CreateCheckoutForReservationResult> {
  const env = getEnv();
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
    return { ok: false, reason: "internal_error" };
  }

  if (!order) {
    return { ok: false, reason: "order_not_found" };
  }

  if (customerId && order.customer_id !== customerId) {
    return { ok: false, reason: "order_not_payable" };
  }

  if (reservationId && order.reservation_id !== reservationId) {
    return { ok: false, reason: "order_not_payable" };
  }

  if (order.status !== "pending_payment") {
    return { ok: false, reason: "order_not_payable" };
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
    return { ok: false, reason: "internal_error" };
  }

  if (!reservation) {
    return { ok: false, reason: "reservation_not_found" };
  }

  if (reservationId && reservation.id !== reservationId) {
    return { ok: false, reason: "reservation_not_payable" };
  }

  if (
    reservation.customer_id !== order.customer_id ||
    (customerId && reservation.customer_id !== customerId)
  ) {
    return { ok: false, reason: "reservation_not_payable" };
  }

  if (reservation.status !== "active") {
    return { ok: false, reason: "reservation_not_payable" };
  }

  if (new Date(reservation.expires_at).getTime() <= Date.now()) {
    return { ok: false, reason: "reservation_expired" };
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
    return { ok: false, reason: "internal_error" };
  }

  if (!customer) {
    return { ok: false, reason: "customer_not_found" };
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
    return { ok: false, reason: "internal_error" };
  }

  if (!reservationItems || reservationItems.length === 0) {
    return { ok: false, reason: "reservation_items_not_found" };
  }

  try {
    const seatsStillReserved = await validateReservationSeats({
      reservationId: reservation.id,
      reservationItems,
    });

    if (!seatsStillReserved) {
      return { ok: false, reason: "reservation_seats_not_reserved" };
    }
  } catch (error) {
    logError("Failed to validate reserved checkout seats", {
      orderId,
      error,
    });
    return { ok: false, reason: "internal_error" };
  }

  const totalAmountCents = order.total_amount_cents + order.total_fee_cents;
  const itemTotalAmountCents = reservationItems.reduce(
    (total, item) => total + item.price_cents + item.fee_cents,
    0,
  );

  if (itemTotalAmountCents !== totalAmountCents) {
    logWarn("Rejected checkout with mismatched order and item totals", {
      orderId,
      orderTotalAmountCents: totalAmountCents,
      itemTotalAmountCents,
    });
    return { ok: false, reason: "checkout_amount_mismatch" };
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
      return { ok: false, reason: "internal_error" };
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
    return { ok: false, reason: "internal_error" };
  }

  if (reusablePayment?.provider_preference_id && reusablePayment.checkout_url) {
    return {
      ok: true,
      checkout: checkoutPayload({
        order,
        reservation,
        preferenceId: reusablePayment.provider_preference_id,
        checkoutUrl: reusablePayment.checkout_url,
        amountCents: totalAmountCents,
        reused: true,
      }),
    };
  }

  const items: MercadoPagoPreferenceItem[] = [];

  for (const item of reservationItems) {
    const unitPrice = centsToDecimalAmount(item.price_cents + item.fee_cents);

    if (unitPrice == null) {
      logWarn("Rejected checkout with invalid reservation item amount", {
        orderId,
        reservationItemId: item.id,
      });
      return { ok: false, reason: "invalid_amount" };
    }

    const sectionName = sectionNames.get(item.section_id) ?? "Setor";
    const eventTitle = event?.title ?? "Ingresso";

    items.push({
      title: `${eventTitle} - ${sectionName} - Assento ${item.seat_code}`,
      quantity: 1,
      unit_price: unitPrice,
      currency_id: "BRL",
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
    return { ok: false, reason: "preference_create_failed" };
  }

  const checkoutUrl =
    preferenceResult.preference.init_point ??
    preferenceResult.preference.sandbox_init_point;

  if (!checkoutUrl) {
    logWarn("Mercado Pago preference did not include a checkout URL", {
      orderId,
      preferenceId: preferenceResult.preference.id,
    });
    return { ok: false, reason: "preference_missing_checkout_url" };
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
    return { ok: false, reason: "internal_error" };
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
    return { ok: false, reason: "payment_persist_failed" };
  }

  return {
    ok: true,
    checkout: checkoutPayload({
      order,
      reservation,
      preferenceId: preferenceResult.preference.id,
      checkoutUrl,
      amountCents: totalAmountCents,
      reused: false,
    }),
  };
}
