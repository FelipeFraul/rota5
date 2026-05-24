import "server-only";

import { createHash } from "crypto";
import { createMercadoPagoPayment } from "@/lib/mercado-pago/client";
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
  provider_payment_id?: string | null;
  checkout_url: string | null;
  raw_metadata?: Record<string, unknown> | null;
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

export type PublicCheckoutOrder = {
  orderId: string;
  reservationId: string;
  status: string;
  expiresAt: string;
  amountCents: number;
  currency: "BRL";
  customerEmail: string | null;
  items: Array<{
    name: string;
    quantity: number;
    unitPriceCents: number;
  }>;
};

export type PayCheckoutInput = {
  orderId: string;
  method: "pix" | "card";
  email: string;
  identificationNumber?: string;
  token?: string;
  paymentMethodId?: string;
  installments?: number;
};

export type PayCheckoutResult =
  | {
      ok: true;
      status: string;
      providerPaymentId: string;
      qrCode?: string | null;
      ticketUrl?: string | null;
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
        | "internal_error"
        | "invalid_payment_input"
        | "payment_create_failed"
        | "payment_persist_failed";
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

function buildSelfHostedCheckoutUrl(baseUrl: string, orderId: string) {
  return buildCheckoutUrl(baseUrl, `/checkout/${encodeURIComponent(orderId)}`);
}

function buildSelfHostedPreferenceId(orderId: string) {
  return `self_hosted_${orderId}`;
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

function mapMercadoPagoPaymentStatus(status: string | undefined) {
  if (status === "approved") return "approved";
  if (status === "rejected") return "rejected";
  if (status === "cancelled") return "cancelled";
  if (status === "refunded") return "refunded";
  if (status === "expired") return "expired";

  return "pending";
}

function isEmail(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function onlyDigits(value: string | undefined) {
  return value?.replace(/\D/g, "") ?? "";
}

function buildPaymentDescription(order: PublicCheckoutOrder) {
  const firstItem = order.items[0]?.name ?? "Ingresso";

  return order.items.length > 1
    ? `${firstItem} e mais ${order.items.length - 1} item(ns)`
    : firstItem;
}

function buildSafePaymentMetadata({
  orderId,
  reservationId,
  checkoutUrl,
}: {
  orderId: string;
  reservationId: string;
  checkoutUrl: string;
}) {
  return {
    order_id: orderId,
    reservation_id: reservationId,
    checkout_url: checkoutUrl,
    checkout_type: "self_hosted",
  };
}

const ACTIVE_MERCADO_PAGO_ATTEMPT_STATUSES = new Set([
  "pending",
  "in_process",
  "approved",
  "authorized",
]);

function getCheckoutAttempt(metadata: Record<string, unknown> | null | undefined) {
  const attempt = metadata?.checkout_attempt;

  return attempt && typeof attempt === "object" && !Array.isArray(attempt)
    ? (attempt as Record<string, unknown>)
    : null;
}

function buildPaymentIdempotencyKey({
  localPaymentId,
  method,
  token,
}: {
  localPaymentId: string;
  method: "pix" | "card";
  token?: string;
}) {
  if (method === "pix") {
    return `${localPaymentId}:pix`;
  }

  const tokenHash = createHash("sha256")
    .update(token ?? "")
    .digest("hex")
    .slice(0, 24);

  return `${localPaymentId}:card:${tokenHash}`;
}

function buildTechnicalPayerEmail(orderId: string) {
  return `pedido-${orderId.toLowerCase()}@example.com`;
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

  const notificationUrl = buildCheckoutUrl(
    env.APP_BASE_URL,
    "/api/webhook/payment/mercado-pago",
  );
  const checkoutUrl = buildSelfHostedCheckoutUrl(env.APP_BASE_URL, order.id);
  const preferenceId = buildSelfHostedPreferenceId(order.id);

  const rawMetadata = buildPaymentMetadata({
    preferenceId,
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
    provider_preference_id: preferenceId,
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
      preferenceId,
      checkoutUrl,
      amountCents: totalAmountCents,
      reused: false,
    }),
  };
}

export async function getPublicCheckoutOrder(
  orderId: string,
): Promise<PublicCheckoutOrder | null> {
  const supabase = getSupabaseAdmin();
  const { data: order, error: orderError } = await supabase
    .from("orders")
    .select("*")
    .eq("id", orderId)
    .maybeSingle<CheckoutOrder>();

  if (orderError) {
    throw orderError;
  }

  if (!order || order.status !== "pending_payment") {
    return null;
  }

  const { data: reservation, error: reservationError } = await supabase
    .from("reservations")
    .select("*")
    .eq("id", order.reservation_id)
    .maybeSingle<CheckoutReservation>();

  if (reservationError) {
    throw reservationError;
  }

  if (
    !reservation ||
    reservation.status !== "active" ||
    reservation.customer_id !== order.customer_id ||
    new Date(reservation.expires_at).getTime() <= Date.now()
  ) {
    return null;
  }

  const { data: customer, error: customerError } = await supabase
    .from("customers")
    .select("id, email")
    .eq("id", order.customer_id)
    .maybeSingle<{ id: string; email: string | null }>();

  if (customerError) {
    throw customerError;
  }

  if (!customer) {
    return null;
  }

  const { data: reservationItems, error: reservationItemsError } = await supabase
    .from("reservation_items")
    .select("*")
    .eq("reservation_id", reservation.id)
    .order("seat_code", { ascending: true })
    .returns<CheckoutReservationItem[]>();

  if (reservationItemsError) {
    throw reservationItemsError;
  }

  if (!reservationItems?.length) {
    return null;
  }

  const sessionSeatIds = reservationItems.map((item) => item.session_seat_id);
  const { data: sessionSeats, error: sessionSeatsError } = await supabase
    .from("session_seats")
    .select("id, status, current_reservation_id")
    .in("id", sessionSeatIds)
    .returns<ReservedSessionSeat[]>();

  if (sessionSeatsError) {
    throw sessionSeatsError;
  }

  const seatsById = new Map((sessionSeats ?? []).map((seat) => [seat.id, seat]));
  const seatsStillReserved = reservationItems.every((item) => {
    const seat = seatsById.get(item.session_seat_id);

    return (
      seat?.status === "reserved" && seat.current_reservation_id === reservation.id
    );
  });

  if (!seatsStillReserved) {
    return null;
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

  const groupedItems = new Map<string, PublicCheckoutOrder["items"][number]>();

  for (const item of reservationItems) {
    const sectionName = sectionNames.get(item.section_id) ?? "Ingresso";
    const eventTitle = event?.title ?? "Evento";
    const unitPriceCents = item.price_cents + item.fee_cents;
    const key = `${sectionName}:${unitPriceCents}`;
    const existing = groupedItems.get(key);

    if (existing) {
      existing.quantity += 1;
    } else {
      groupedItems.set(key, {
        name: `${eventTitle} - ${sectionName}`,
        quantity: 1,
        unitPriceCents,
      });
    }
  }

  return {
    orderId: order.id,
    reservationId: reservation.id,
    status: order.status,
    expiresAt: reservation.expires_at,
    amountCents: order.total_amount_cents + order.total_fee_cents,
    currency: "BRL",
    customerEmail: customer.email,
    items: Array.from(groupedItems.values()),
  };
}

export async function paySelfHostedCheckout({
  orderId,
  method,
  email,
  identificationNumber,
  token,
  paymentMethodId,
  installments,
}: PayCheckoutInput): Promise<PayCheckoutResult> {
  const env = getEnv();
  const checkoutResult = await createCheckoutForReservation({ orderId });

  if (!checkoutResult.ok) {
    return { ok: false, reason: checkoutResult.reason };
  }

  const order = await getPublicCheckoutOrder(orderId);

  if (!order) {
    return { ok: false, reason: "order_not_payable" };
  }

  const trimmedEmail = email.trim().toLowerCase();
  const normalizedEmail = trimmedEmail || buildTechnicalPayerEmail(order.orderId);
  const cpf = onlyDigits(identificationNumber);

  if (
    (trimmedEmail && !isEmail(trimmedEmail)) ||
    !isEmail(normalizedEmail) ||
    (cpf && cpf.length !== 11)
  ) {
    return { ok: false, reason: "invalid_payment_input" };
  }

  if (method === "card" && (!token || !paymentMethodId)) {
    return { ok: false, reason: "invalid_payment_input" };
  }

  const amount = centsToDecimalAmount(order.amountCents);

  if (amount == null || amount <= 0) {
    return { ok: false, reason: "invalid_amount" };
  }

  const supabase = getSupabaseAdmin();
  const { data: pendingPayment, error: pendingPaymentError } = await supabase
    .from("payments")
    .select(
      "id, provider_preference_id, provider_payment_id, checkout_url, raw_metadata",
    )
    .eq("order_id", order.orderId)
    .eq("provider", PROVIDER)
    .eq("provider_preference_id", checkoutResult.checkout.preferenceId)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle<PendingPayment>();

  if (pendingPaymentError || !pendingPayment) {
    if (pendingPaymentError) {
      logError("Failed to load self-hosted checkout payment", {
        orderId,
        code: pendingPaymentError.code,
      });
    }

    return { ok: false, reason: "payment_persist_failed" };
  }

  const existingAttempt = getCheckoutAttempt(pendingPayment.raw_metadata);
  const existingStatus =
    typeof existingAttempt?.status === "string" ? existingAttempt.status : null;
  const existingPaymentId =
    typeof existingAttempt?.provider_payment_id === "string"
      ? existingAttempt.provider_payment_id
      : pendingPayment.provider_payment_id;
  const existingMethod =
    existingAttempt?.method === "pix" || existingAttempt?.method === "card"
      ? existingAttempt.method
      : null;

  if (
    existingPaymentId &&
    existingStatus &&
    ACTIVE_MERCADO_PAGO_ATTEMPT_STATUSES.has(existingStatus)
  ) {
    return {
      ok: true,
      status: existingStatus,
      providerPaymentId: existingPaymentId,
      qrCode:
        existingMethod === "pix" && typeof existingAttempt?.qr_code === "string"
          ? existingAttempt.qr_code
          : null,
      ticketUrl:
        existingMethod === "pix" &&
        typeof existingAttempt?.ticket_url === "string"
          ? existingAttempt.ticket_url
          : null,
    };
  }

  const externalReference = buildOrderExternalReference(order.orderId);
  const notificationUrl = buildCheckoutUrl(
    env.APP_BASE_URL,
    "/api/webhook/payment/mercado-pago",
  );
  const paymentResult = await createMercadoPagoPayment(
    {
      transaction_amount: amount,
      ...(method === "card" ? { token } : {}),
      description: buildPaymentDescription(order),
      installments: method === "card" ? installments ?? 1 : 1,
      payment_method_id: method === "pix" ? "pix" : paymentMethodId ?? "",
      payer: {
        email: normalizedEmail,
        ...(cpf
          ? {
              identification: {
                type: "CPF",
                number: cpf,
              },
            }
          : {}),
      },
      external_reference: externalReference,
      notification_url: notificationUrl,
      metadata: {
        order_id: order.orderId,
        reservation_id: order.reservationId,
      },
    },
    buildPaymentIdempotencyKey({
      localPaymentId: pendingPayment.id,
      method,
      token,
    }),
  );

  if (!paymentResult.ok) {
    logWarn("Failed to create self-hosted Mercado Pago payment", {
      orderId,
      status: paymentResult.status,
      code: paymentResult.code,
    });
    return { ok: false, reason: "payment_create_failed" };
  }

  const { payment } = paymentResult;
  const providerPaymentId = String(payment.id);
  const paymentStatus = mapMercadoPagoPaymentStatus(payment.status);
  const qrCode = payment.point_of_interaction?.transaction_data?.qr_code ?? null;
  const ticketUrl =
    payment.point_of_interaction?.transaction_data?.ticket_url ?? null;
  const safeMetadata = {
    ...buildSafePaymentMetadata({
      orderId: order.orderId,
      reservationId: order.reservationId,
      checkoutUrl: checkoutResult.checkout.checkoutUrl,
    }),
    provider_payment_id: providerPaymentId,
    status: payment.status,
    external_reference: payment.external_reference,
    transaction_amount: payment.transaction_amount,
    currency_id: payment.currency_id,
    checkout_attempt: {
      method,
      status: payment.status ?? paymentStatus,
      provider_payment_id: providerPaymentId,
      ...(method === "pix" ? { qr_code: qrCode, ticket_url: ticketUrl } : {}),
    },
  };

  const paymentPayload = {
    provider_payment_id: providerPaymentId,
    status: paymentStatus,
    amount_cents: order.amountCents,
    currency: "BRL",
    checkout_url: checkoutResult.checkout.checkoutUrl,
    raw_metadata: safeMetadata,
    updated_at: new Date().toISOString(),
  };
  const persistResult = await supabase
    .from("payments")
    .update(paymentPayload)
    .eq("id", pendingPayment.id);

  if (persistResult.error) {
    logError("Failed to persist self-hosted checkout payment", {
      orderId,
      code: persistResult.error.code,
    });
    return { ok: false, reason: "payment_persist_failed" };
  }

  return {
    ok: true,
    status: payment.status ?? paymentStatus,
    providerPaymentId,
    qrCode,
    ticketUrl,
  };
}
