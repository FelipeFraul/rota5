import "server-only";

import { getSupabaseAdmin } from "@/lib/supabase/admin";
import type { WhatsAppOutboundMessageType } from "@/lib/tickets/services/outboundMessages";

export type WhatsAppOutboundDeliveryStatus =
  | "pending"
  | "sending"
  | "sent"
  | "failed"
  | "dead_letter"
  | "superseded";

export type WhatsAppOutboundDelivery = {
  id: string;
  idempotency_key: string;
  customer_id: string;
  conversation_id: string | null;
  recipient_phone: string;
  message_type: WhatsAppOutboundMessageType;
  reason: string;
  business_context: Record<string, unknown>;
  status: WhatsAppOutboundDeliveryStatus;
  attempt_count: number;
  provider_message_id: string | null;
  last_error: string | null;
  claimed_at: string | null;
  next_attempt_at: string | null;
  lease_expires_at: string | null;
  dead_letter_at: string | null;
  claim_token: string | null;
  sent_at: string | null;
};

export type PaidTicketDeliveryQueueCounts = {
  pending_due: number;
  failed_due: number;
  failed: number;
  sending_active: number;
  sending_expired: number;
  dead_letter: number;
  sent: number;
};

type GetOrCreateWhatsAppOutboundDeliveryInput = {
  idempotencyKey: string;
  customerId: string;
  conversationId: string | null;
  recipientPhone: string;
  messageType: WhatsAppOutboundMessageType;
  reason: string;
  businessContext: Record<string, unknown>;
};

const DELIVERY_SELECT =
  "id, idempotency_key, customer_id, conversation_id, recipient_phone, message_type, reason, business_context, status, attempt_count, provider_message_id, last_error, claimed_at, next_attempt_at, lease_expires_at, dead_letter_at, claim_token, sent_at";

export async function ensurePaidTicketDeliveryIntents({
  orderId,
  fullDelivery = false,
}: {
  orderId: string;
  fullDelivery?: boolean;
}) {
  const { data, error } = await getSupabaseAdmin().rpc(
    "ensure_paid_ticket_delivery_intents",
    {
      p_order_id: orderId,
      p_full_delivery: fullDelivery,
    },
  );

  if (error) return { ok: false as const, error };
  return { ok: true as const, intentsCount: Number(data ?? 0) };
}

export async function getOrCreateWhatsAppOutboundDelivery({
  idempotencyKey,
  customerId,
  conversationId,
  recipientPhone,
  messageType,
  reason,
  businessContext,
}: GetOrCreateWhatsAppOutboundDeliveryInput) {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("whatsapp_outbound_deliveries")
    .insert({
      idempotency_key: idempotencyKey,
      customer_id: customerId,
      conversation_id: conversationId,
      recipient_phone: recipientPhone,
      message_type: messageType,
      reason,
      business_context: businessContext,
      status: "pending",
    })
    .select(DELIVERY_SELECT)
    .single<WhatsAppOutboundDelivery>();

  if (!error) {
    return { ok: true as const, delivery: data };
  }

  if (error.code !== "23505") {
    return { ok: false as const, error };
  }

  const existing = await supabase
    .from("whatsapp_outbound_deliveries")
    .select(DELIVERY_SELECT)
    .eq("idempotency_key", idempotencyKey)
    .maybeSingle<WhatsAppOutboundDelivery>();

  if (existing.error || !existing.data) {
    return {
      ok: false as const,
      error: existing.error ?? error,
    };
  }

  return { ok: true as const, delivery: existing.data };
}

export async function claimWhatsAppOutboundDelivery(deliveryId: string) {
  const { data, error } = await getSupabaseAdmin()
    .rpc("claim_whatsapp_outbound_delivery", {
      p_delivery_id: deliveryId,
    })
    .select(DELIVERY_SELECT)
    .maybeSingle<WhatsAppOutboundDelivery>();

  if (error) {
    return { ok: false as const, error };
  }

  if (!data) {
    return { ok: true as const, claimed: false as const };
  }

  if (!data.claim_token) {
    return {
      ok: false as const,
      error: { code: "claim_token_missing" },
    };
  }

  return {
    ok: true as const,
    claimed: true as const,
    delivery: { ...data, claim_token: data.claim_token },
  };
}

export async function markWhatsAppOutboundDeliverySent({
  deliveryId,
  claimToken,
  providerMessageId,
}: {
  deliveryId: string;
  claimToken?: string;
  providerMessageId?: string | null;
}) {
  if (!claimToken) {
    const sentAt = new Date().toISOString();
    const { data, error } = await getSupabaseAdmin()
      .from("whatsapp_outbound_deliveries")
      .update({
        status: "sent",
        provider_message_id: providerMessageId ?? null,
        last_error: null,
        sent_at: sentAt,
        updated_at: sentAt,
      })
      .eq("id", deliveryId)
      .eq("status", "sending")
      .select("id, sent_at")
      .maybeSingle<{ id: string; sent_at: string | null }>();

    if (error) return { ok: false as const, error };
    if (!data) {
      return {
        ok: false as const,
        conflict: true as const,
        reason: "invalid_state" as const,
      };
    }

    return { ok: true as const, sentAt: data.sent_at ?? sentAt };
  }

  const { data, error } = await getSupabaseAdmin()
    .rpc("mark_whatsapp_outbound_delivery_sent", {
      p_delivery_id: deliveryId,
      p_claim_token: claimToken,
      p_provider_message_id: providerMessageId ?? null,
    })
    .select(DELIVERY_SELECT)
    .maybeSingle<WhatsAppOutboundDelivery>();

  if (error) return { ok: false as const, error };
  if (!data) {
    return {
      ok: false as const,
      conflict: true as const,
      reason: "invalid_state" as const,
    };
  }

  return {
    ok: true as const,
    sentAt: data.sent_at ?? new Date().toISOString(),
  };
}

export async function markWhatsAppOutboundDeliveryFailed({
  deliveryId,
  claimToken,
  error,
}: {
  deliveryId: string;
  claimToken?: string;
  error: string;
}) {
  if (!claimToken) {
    const { data, error: updateError } = await getSupabaseAdmin()
      .from("whatsapp_outbound_deliveries")
      .update({
        status: "failed",
        last_error: error,
        updated_at: new Date().toISOString(),
      })
      .eq("id", deliveryId)
      .eq("status", "sending")
      .select("id")
      .maybeSingle<{ id: string }>();

    if (updateError) return { ok: false as const, error: updateError };
    if (!data) {
      return {
        ok: false as const,
        conflict: true as const,
        reason: "invalid_state" as const,
      };
    }

    return { ok: true as const, status: "failed" as const };
  }

  const { data, error: updateError } = await getSupabaseAdmin()
    .rpc("mark_whatsapp_outbound_delivery_failed", {
      p_delivery_id: deliveryId,
      p_claim_token: claimToken,
      p_error: error,
    })
    .select(DELIVERY_SELECT)
    .maybeSingle<WhatsAppOutboundDelivery>();

  if (updateError) return { ok: false as const, error: updateError };
  if (!data) {
    return {
      ok: false as const,
      conflict: true as const,
      reason: "invalid_state" as const,
    };
  }

  return { ok: true as const, status: data.status };
}

export async function listDuePaidTicketDeliveryOrders({
  limit = 20,
}: {
  limit?: number;
} = {}) {
  const { data, error } = await getSupabaseAdmin().rpc(
    "list_due_paid_ticket_delivery_orders",
    { p_limit: limit },
  );

  if (error) return { ok: false as const, error };
  return {
    ok: true as const,
    orders: (data ?? []) as Array<{
      order_id: string;
      delivery_mode: "full" | "choice";
    }>,
  };
}

export async function getPaidTicketDeliveryQueueCounts() {
  const { data, error } = await getSupabaseAdmin().rpc(
    "get_paid_ticket_delivery_queue_counts",
  );

  if (error) return { ok: false as const, error };
  return { ok: true as const, counts: data as PaidTicketDeliveryQueueCounts };
}
