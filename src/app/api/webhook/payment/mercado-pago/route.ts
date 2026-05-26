import { getEnv } from "@/lib/env";
import {
  badRequest,
  jsonError,
  jsonOk,
  methodNotAllowed,
  unauthorized,
} from "@/lib/http/responses";
import { logError, logInfo, logWarn } from "@/lib/logger";
import { getMercadoPagoPayment } from "@/lib/mercado-pago/client";
import {
  buildMercadoPagoEventMetadata,
  extractMercadoPagoEventType,
  extractMercadoPagoPaymentId,
  extractMercadoPagoPaymentIdFromUrl,
  parseMercadoPagoWebhookPayload,
  validateMercadoPagoWebhookSignature,
} from "@/lib/mercado-pago/webhook";
import {
  consumeRateLimit,
  rateLimitResponse,
} from "@/lib/security/rateLimit";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import {
  decimalAmountToCents,
  extractOrderIdFromExternalReference,
} from "@/lib/tickets/services/payments";
import { deliverTicketsForOrder } from "@/lib/tickets/services/ticketDelivery";

const MAX_WEBHOOK_BYTES = 256 * 1024;
const PROVIDER = "mercado_pago";

type PaymentEventInsert = {
  provider: typeof PROVIDER;
  event_key: string;
  event_type: string | null;
  provider_payment_id: string | null;
  raw_metadata: Record<string, unknown>;
};

type ConfirmPaidTicketOrderResult = {
  idempotent?: boolean;
  tickets_count?: number;
};

async function readRawBody(request: Request) {
  const contentLength = request.headers.get("content-length");

  if (contentLength && Number(contentLength) > MAX_WEBHOOK_BYTES) {
    return {
      ok: false as const,
      response: badRequest("Payload too large"),
    };
  }

  const rawBody = await request.text();

  if (new TextEncoder().encode(rawBody).byteLength > MAX_WEBHOOK_BYTES) {
    return {
      ok: false as const,
      response: badRequest("Payload too large"),
    };
  }

  return {
    ok: true as const,
    rawBody,
  };
}

async function insertPaymentEvent(event: PaymentEventInsert) {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("payment_events")
    .insert(event)
    .select("id")
    .single();

  if (error) {
    if (error.code === "23505") {
      const { data: existingEvent, error: existingEventError } = await supabase
        .from("payment_events")
        .select("id, processed_at")
        .eq("provider", event.provider)
        .eq("event_key", event.event_key)
        .single();

      if (existingEventError) {
        return {
          ok: false as const,
          duplicate: false as const,
          retryable: false as const,
          id: null,
          error: existingEventError,
        };
      }

      return {
        ok: true as const,
        duplicate: Boolean(existingEvent.processed_at),
        retryable: !existingEvent.processed_at,
        id: existingEvent.id as string,
      };
    }

    return {
      ok: false as const,
      duplicate: false as const,
      retryable: false as const,
      id: null,
      error,
    };
  }

  return {
    ok: true as const,
    duplicate: false as const,
    retryable: false as const,
    id: data.id as string,
  };
}

async function markPaymentEventProcessed(eventId: string) {
  const supabase = getSupabaseAdmin();
  const { error } = await supabase
    .from("payment_events")
    .update({ processed_at: new Date().toISOString() })
    .eq("id", eventId);

  if (error) {
    logWarn("Failed to mark Mercado Pago payment event as processed", {
      paymentEventId: eventId,
      code: error.code,
    });
  }
}

async function orderExists(orderId: string) {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("orders")
    .select("id")
    .eq("id", orderId)
    .maybeSingle();

  if (error) {
    throw error;
  }

  return Boolean(data);
}

function buildPaymentRawMetadata(payment: {
  id: string | number;
  status?: string;
  external_reference?: string | null;
  transaction_amount?: string | number | null;
  date_approved?: string | null;
  currency_id?: string | null;
  payment_method_id?: string | null;
  payment_type_id?: string | null;
}) {
  return {
    id: String(payment.id),
    status: payment.status,
    external_reference: payment.external_reference,
    transaction_amount: payment.transaction_amount,
    date_approved: payment.date_approved,
    currency_id: payment.currency_id,
    payment_method_id: payment.payment_method_id,
    payment_type_id: payment.payment_type_id,
  };
}

export async function POST(request: Request) {
  const env = getEnv();

  if (
    !request.headers.get("x-signature") ||
    !request.headers.get("x-request-id")
  ) {
    logWarn("Rejected Mercado Pago webhook without signature headers");
    return unauthorized();
  }

  const bodyResult = await readRawBody(request);

  if (!bodyResult.ok) {
    return bodyResult.response;
  }

  const payload = parseMercadoPagoWebhookPayload(bodyResult.rawBody);

  if (!payload) {
    logWarn("Rejected Mercado Pago webhook with invalid JSON");
    return badRequest("Bad Request");
  }

  const paymentId =
    extractMercadoPagoPaymentIdFromUrl(request.url) ??
    extractMercadoPagoPaymentId(payload);

  if (!paymentId) {
    logWarn("Ignored Mercado Pago webhook without payment id");
    return badRequest("Bad Request");
  }

  const signatureResult = validateMercadoPagoWebhookSignature({
    rawBody: bodyResult.rawBody,
    headers: request.headers,
    webhookSecret: env.MERCADO_PAGO_WEBHOOK_SECRET,
    paymentId,
  });

  if (!signatureResult.ok) {
    logWarn("Rejected Mercado Pago webhook with invalid signature", {
      reason: signatureResult.reason,
      providerPaymentId: paymentId,
    });
    return unauthorized();
  }

  const rateLimit = await consumeRateLimit({
    routeKey: "webhook:mercado-pago",
    limit: 120,
    windowSeconds: 60,
    request,
  });

  if (!rateLimit.allowed) {
    logWarn("Rate limited Mercado Pago webhook", {
      sourceHash: rateLimit.sourceHash,
      count: rateLimit.count,
    });
    return rateLimitResponse(rateLimit);
  }

  const eventType = extractMercadoPagoEventType(payload);
  const eventInsert = await insertPaymentEvent({
    provider: PROVIDER,
    event_key: signatureResult.requestId,
    event_type: eventType,
    provider_payment_id: paymentId,
    raw_metadata: buildMercadoPagoEventMetadata({
      payload,
      requestId: signatureResult.requestId,
      paymentId,
    }),
  });

  if (!eventInsert.ok) {
    logError("Failed to register Mercado Pago payment event", {
      providerPaymentId: paymentId,
      code: eventInsert.error.code,
    });
    return jsonError("Internal Server Error", 500);
  }

  if (eventInsert.duplicate) {
    logInfo("Ignored already processed Mercado Pago payment event", {
      providerPaymentId: paymentId,
    });
    return jsonOk({ received: true, duplicate: true });
  }

  if (eventInsert.retryable) {
    logInfo("Retrying unprocessed Mercado Pago payment event", {
      providerPaymentId: paymentId,
    });
  }

  const paymentResult = await getMercadoPagoPayment(paymentId);

  if (!paymentResult.ok) {
    logWarn("Failed to fetch Mercado Pago payment", {
      providerPaymentId: paymentId,
      code: paymentResult.code,
      status: paymentResult.status,
    });
    return jsonError("Internal Server Error", 500);
  }

  const { payment } = paymentResult;

  if (payment.status !== "approved") {
    await markPaymentEventProcessed(eventInsert.id);
    logInfo("Ignored Mercado Pago payment with non-approved status", {
      providerPaymentId: paymentId,
      paymentStatus: payment.status,
    });
    return jsonOk({
      received: true,
      ignored: true,
      reason: "payment_not_approved",
    });
  }

  const orderId = extractOrderIdFromExternalReference(
    payment.external_reference,
  );

  if (!orderId) {
    await markPaymentEventProcessed(eventInsert.id);
    logWarn("Ignored approved Mercado Pago payment with invalid reference", {
      providerPaymentId: paymentId,
      hasExternalReference: Boolean(payment.external_reference),
    });
    return jsonOk({
      received: true,
      ignored: true,
      reason: "invalid_external_reference",
    });
  }

  let exists: boolean;

  try {
    exists = await orderExists(orderId);
  } catch (error) {
    logError("Failed to verify order for Mercado Pago payment", {
      providerPaymentId: paymentId,
      error,
    });
    return jsonError("Internal Server Error", 500);
  }

  if (!exists) {
    await markPaymentEventProcessed(eventInsert.id);
    logWarn("Ignored approved Mercado Pago payment for missing order", {
      providerPaymentId: paymentId,
      orderId,
    });
    return jsonOk({
      received: true,
      ignored: true,
      reason: "order_not_found",
    });
  }

  const amountCents = decimalAmountToCents(payment.transaction_amount);

  if (amountCents == null) {
    logWarn("Rejected Mercado Pago payment with invalid amount", {
      providerPaymentId: paymentId,
    });
    return jsonError("Internal Server Error", 500);
  }

  const supabase = getSupabaseAdmin();
  const { data: confirmation, error } = await supabase.rpc(
    "confirm_paid_ticket_order",
    {
      p_order_id: orderId,
      p_provider: PROVIDER,
      p_provider_payment_id: String(payment.id),
      p_amount_cents: amountCents,
      p_paid_at: payment.date_approved ?? new Date().toISOString(),
      p_raw_metadata: buildPaymentRawMetadata(payment),
    },
  );

  if (error) {
    logError("Failed to confirm paid ticket order from Mercado Pago webhook", {
      providerPaymentId: paymentId,
      orderId,
      code: error.code,
      message: error.message,
    });
    return jsonError("Internal Server Error", 500);
  }

  const confirmationResult = confirmation as ConfirmPaidTicketOrderResult | null;
  const shouldDeliverTickets = confirmationResult?.idempotent !== true;
  const deliveryResult = shouldDeliverTickets
    ? await deliverTicketsForOrder(orderId)
    : null;

  if (deliveryResult && !deliveryResult.ok) {
    logWarn("Ticket delivery could not be prepared after payment confirmation", {
      providerPaymentId: paymentId,
      orderId,
      reason: deliveryResult.reason,
    });
  } else if (deliveryResult && !deliveryResult.sent) {
    logWarn("Ticket delivery was not sent after payment confirmation", {
      providerPaymentId: paymentId,
      orderId,
      reason: deliveryResult.reason,
      ticketsCount: deliveryResult.ticketsCount,
    });
  } else if (!shouldDeliverTickets) {
    logInfo("Skipped ticket delivery for idempotent paid order confirmation", {
      providerPaymentId: paymentId,
      orderId,
    });
  }

  await markPaymentEventProcessed(eventInsert.id);

  logInfo("Processed approved Mercado Pago payment", {
    providerPaymentId: paymentId,
    orderId,
    ticketsDelivered:
      deliveryResult?.ok && deliveryResult.sent ? deliveryResult.ticketsCount : 0,
  });

  return jsonOk({ received: true, processed: true });
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
