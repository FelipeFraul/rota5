import "server-only";

import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { buildAggregatedWhatsAppText } from "@/lib/tickets/services/whatsappBatchCore";

export type WhatsAppMessageBatchAppendResult = {
  batchId: string;
  status: "collecting" | "processing" | "processed" | "cancelled";
  shouldProcessNow: boolean;
};

export type WhatsAppMessageBatchMessage = {
  id: string;
  body: string | null;
  messageType: "text" | "image" | "document" | "system";
  createdAt: string;
};

type BatchRpcRow = {
  batch_id: string;
  batch_status: "collecting" | "processing" | "processed" | "cancelled";
  should_process_now: boolean;
};

type ClaimedBatchRpcRow = {
  batch_id: string;
  conversation_id: string;
};

type BatchMessageJoinRow = {
  position: number;
  whatsapp_messages: {
    id: string;
    body: string | null;
    message_type: "text" | "image" | "document" | "system";
    created_at: string;
  } | null;
};

export async function appendInboundMessageToBatch({
  conversationId,
  messageId,
  isActionable,
}: {
  conversationId: string;
  messageId: string;
  isActionable: boolean;
}) {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .rpc("append_whatsapp_message_batch", {
      batch_conversation_id: conversationId,
      batch_message_id: messageId,
      message_is_actionable: isActionable,
      collect_seconds: 30,
      max_window_seconds: 30,
    })
    .returns<BatchRpcRow[]>();

  if (error) {
    return {
      ok: false as const,
      error,
    };
  }

  const rows = Array.isArray(data) ? data : [];
  const row = rows[0];

  if (!row) {
    return {
      ok: false as const,
      error: new Error("append_whatsapp_message_batch_returned_no_rows"),
    };
  }

  return {
    ok: true as const,
    batch: {
      batchId: row.batch_id,
      status: row.batch_status,
      shouldProcessNow: row.should_process_now,
    } satisfies WhatsAppMessageBatchAppendResult,
  };
}

export async function claimDueWhatsAppMessageBatches({
  limit = 20,
}: { limit?: number } = {}) {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .rpc("claim_due_whatsapp_message_batches", {
      batch_limit: limit,
    })
    .returns<ClaimedBatchRpcRow[]>();

  if (error) {
    return {
      ok: false as const,
      error,
    };
  }

  return {
    ok: true as const,
    batches: (Array.isArray(data) ? data : []).map((row: ClaimedBatchRpcRow) => ({
      batchId: row.batch_id,
      conversationId: row.conversation_id,
    })),
  };
}

export async function listWhatsAppBatchMessages(batchId: string) {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("whatsapp_message_batch_messages")
    .select("position, whatsapp_messages(id, body, message_type, created_at)")
    .eq("batch_id", batchId)
    .order("position", { ascending: true })
    .returns<BatchMessageJoinRow[]>();

  if (error) {
    return {
      ok: false as const,
      error,
    };
  }

  return {
    ok: true as const,
    messages: (data ?? [])
      .map((row) => row.whatsapp_messages)
      .filter((message): message is NonNullable<BatchMessageJoinRow["whatsapp_messages"]> =>
        Boolean(message),
      )
      .map((message) => ({
        id: message.id,
        body: message.body,
        messageType: message.message_type,
        createdAt: message.created_at,
      } satisfies WhatsAppMessageBatchMessage)),
  };
}

export { buildAggregatedWhatsAppText };

export async function finishWhatsAppMessageBatch({
  batchId,
  status = "processed",
}: {
  batchId: string;
  status?: "processed" | "cancelled";
}) {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase.rpc("finish_whatsapp_message_batch", {
    target_batch_id: batchId,
    final_status: status,
  });

  if (error) {
    return {
      ok: false as const,
      error,
    };
  }

  return {
    ok: true as const,
    applied: Boolean(data),
  };
}
