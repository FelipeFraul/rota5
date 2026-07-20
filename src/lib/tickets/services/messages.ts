import "server-only";

import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { formatWhatsAppUppercase } from "@/lib/zapi/format";

type WhatsAppMessageDirection = "inbound" | "outbound";
type WhatsAppMessageType = "text" | "image" | "document" | "system";

export type TicketWhatsAppMessage = {
  id: string;
  conversation_id: string | null;
  customer_id: string | null;
  direction: WhatsAppMessageDirection;
  message_type: WhatsAppMessageType;
  body: string | null;
  provider_message_id: string | null;
  raw_metadata: Record<string, unknown>;
};

type SaveWhatsAppMessageDuplicateResult = {
  ok: false;
  duplicate: true;
};

type SaveWhatsAppMessageInput = {
  conversationId: string;
  customerId: string;
  direction: WhatsAppMessageDirection;
  messageType?: WhatsAppMessageType;
  body?: string | null;
  providerMessageId?: string | null;
  rawMetadata?: Record<string, unknown>;
};

export async function findInboundMessageByProviderId(
  providerMessageId: string,
) {
  const supabase = getSupabaseAdmin();
  const { data: message, error } = await supabase
    .from("whatsapp_messages")
    .select(
      "id, conversation_id, customer_id, direction, message_type, body, provider_message_id, raw_metadata",
    )
    .eq("direction", "inbound")
    .eq("provider_message_id", providerMessageId)
    .maybeSingle<TicketWhatsAppMessage>();

  if (error) {
    return {
      ok: false as const,
      error,
    };
  }

  return {
    ok: true as const,
    message,
  };
}

export async function countConversationMessages(conversationId: string) {
  const supabase = getSupabaseAdmin();
  const { count, error } = await supabase
    .from("whatsapp_messages")
    .select("id", { count: "exact", head: true })
    .eq("conversation_id", conversationId);

  if (error) {
    return {
      ok: false as const,
      error,
    };
  }

  return {
    ok: true as const,
    count: count ?? 0,
  };
}

export async function findSentBatchReplyMessage({
  batchId,
  sequence,
}: {
  batchId: string;
  sequence: number;
}) {
  const supabase = getSupabaseAdmin();
  const { data: message, error } = await supabase
    .from("whatsapp_messages")
    .select("id, provider_message_id")
    .eq("direction", "outbound")
    .contains("raw_metadata", {
      provider: "zapi",
      batchId,
      sequence,
      sendStatus: "sent",
    })
    .maybeSingle<{ id: string; provider_message_id: string | null }>();

  if (error) {
    return {
      ok: false as const,
      error,
    };
  }

  return {
    ok: true as const,
    message,
  };
}

export async function saveWhatsAppMessage({
  conversationId,
  customerId,
  direction,
  messageType = "text",
  body = null,
  providerMessageId = null,
  rawMetadata = {},
}: SaveWhatsAppMessageInput) {
  const supabase = getSupabaseAdmin();
  const { data: message, error } = await supabase
    .from("whatsapp_messages")
    .insert({
      conversation_id: conversationId,
      customer_id: customerId,
      direction,
      message_type: messageType,
      body:
        direction === "outbound" && body
          ? formatWhatsAppUppercase(body)
          : body,
      provider_message_id: providerMessageId,
      raw_metadata: rawMetadata,
    })
    .select(
      "id, conversation_id, customer_id, direction, message_type, body, provider_message_id, raw_metadata",
    )
    .single<TicketWhatsAppMessage>();

  if (error) {
    if (
      direction === "inbound" &&
      providerMessageId &&
      error.code === "23505"
    ) {
      return {
        ok: false as const,
        duplicate: true as const,
      } satisfies SaveWhatsAppMessageDuplicateResult;
    }

    return {
      ok: false as const,
      duplicate: false as const,
      error,
    };
  }

  return {
    ok: true as const,
    message,
  };
}
