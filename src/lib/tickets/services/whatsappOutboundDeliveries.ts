import "server-only";

import { getSupabaseAdmin } from "@/lib/supabase/admin";
import type { WhatsAppOutboundMessageType } from "@/lib/tickets/services/outboundMessages";

export type WhatsAppOutboundDeliveryStatus =
  | "pending"
  | "sending"
  | "sent"
  | "failed";

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
  sent_at: string | null;
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
  "id, idempotency_key, customer_id, conversation_id, recipient_phone, message_type, reason, business_context, status, attempt_count, provider_message_id, last_error, claimed_at, sent_at";

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

  return {
    ok: true as const,
    claimed: true as const,
    delivery: data,
  };
}

export async function markWhatsAppOutboundDeliverySent({
  deliveryId,
  providerMessageId,
}: {
  deliveryId: string;
  providerMessageId?: string | null;
}) {
  const { data, error } = await getSupabaseAdmin()
    .from("whatsapp_outbound_deliveries")
    .update({
      status: "sent",
      provider_message_id: providerMessageId ?? null,
      last_error: null,
      sent_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq("id", deliveryId)
    .eq("status", "sending")
    .select("id")
    .maybeSingle<{ id: string }>();

  if (error) return { ok: false as const, error };
  if (!data) {
    return {
      ok: false as const,
      conflict: true as const,
      reason: "invalid_state" as const,
    };
  }

  return { ok: true as const };
}

export async function markWhatsAppOutboundDeliveryFailed({
  deliveryId,
  error,
}: {
  deliveryId: string;
  error: string;
}) {
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

  return { ok: true as const };
}
