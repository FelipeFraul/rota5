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
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import {
  decimalAmountToCents,
  extractOrderIdFromExternalReference,
} from "@/lib/tickets/services/payments";

const MAX_WEBHOOK_BYTES = 256 * 1024;
const PROVIDER = "mercado_pago";

type PaymentEventInsert = {
  provider: typeof PROVIDER;
  event_key: string;
  event_type: string | null;
  provider_payment_id: string | null;
  raw_metadata: Record<string, unknown>;
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
      return {
        ok: true as const,
        duplicate: true as const,
        id: null,
      };
    }

    return {
      ok: false as const,
      duplicate: false as const,
      id: null,
      error,
    };
  }

  return {
    ok: true as const,
    duplicate: false as const,
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
}) {
  return {
    id: String(payment.id),
    status: payment.status,
    external_reference: payment.external_reference,
    transaction_amount: payment.transaction_amount,
    date_approved: payment.date_approved,
    currency_id: payment.currency_id,
  };
}

export async function POST(request: Request) {
  const env = getEnv();
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
    logInfo("Ignored duplicate Mercado Pago payment event", {
      providerPaymentId: paymentId,
    });
    return jsonOk({ received: true, duplicate: true });
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
  const { error } = await supabase.rpc("confirm_paid_ticket_order", {
    p_order_id: orderId,
    p_provider: PROVIDER,
    p_provider_payment_id: String(payment.id),
    p_amount_cents: amountCents,
    p_paid_at: payment.date_approved ?? new Date().toISOString(),
    p_raw_metadata: buildPaymentRawMetadata(payment),
  });

  if (error) {
    logError("Failed to confirm paid ticket order from Mercado Pago webhook", {
      providerPaymentId: paymentId,
      orderId,
      code: error.code,
      message: error.message,
    });
    return jsonError("Internal Server Error", 500);
  }

  await markPaymentEventProcessed(eventInsert.id);

  logInfo("Processed approved Mercado Pago payment", {
    providerPaymentId: paymentId,
    orderId,
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
