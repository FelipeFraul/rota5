import "server-only";

import { logError, logWarn } from "@/lib/logger";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { buildInitialConversationState } from "@/lib/tickets/conversationState";
import { TICKET_MESSAGES } from "@/lib/tickets/messages";
import { saveWhatsAppMessage } from "@/lib/tickets/services/messages";
import { buildWhatsAppOutboundMetadata } from "@/lib/tickets/services/outboundMessages";
import { sendZapiText } from "@/lib/zapi/client";
import { sanitizeWhatsAppText } from "@/lib/zapi/textEncoding";

const DEFAULT_FINALIZE_AFTER_MINUTES = 30;
const FINALIZER_REASON = "conversation_inactivity_closed";

type ConversationCandidateRow = {
  id: string;
  customer_id: string;
  context: Record<string, unknown>;
  last_message_at: string | null;
};

type FinalizerConversationRow = ConversationCandidateRow & {
  whatsapp_phone: string;
};

type FinalizerMessageRow = {
  conversation_id: string | null;
  raw_metadata: Record<string, unknown> | null;
};

function getCutoffIso(finalizeAfterMinutes: number) {
  const boundedMinutes =
    Number.isFinite(finalizeAfterMinutes) && finalizeAfterMinutes > 0
      ? finalizeAfterMinutes
      : DEFAULT_FINALIZE_AFTER_MINUTES;

  return new Date(Date.now() - boundedMinutes * 60_000).toISOString();
}

function getConfiguredFinalizeAfterMinutes() {
  const configured = Number(process.env.CONVERSATION_INACTIVITY_TTL_MINUTES);

  return Number.isInteger(configured) && configured > 0
    ? configured
    : DEFAULT_FINALIZE_AFTER_MINUTES;
}

function finalizedConversationIds(messages: FinalizerMessageRow[]) {
  const finalized = new Set<string>();

  for (const message of messages) {
    if (!message.conversation_id) continue;
    if (
      message.raw_metadata?.reason === FINALIZER_REASON &&
      message.raw_metadata?.send_status === "sent"
    ) {
      finalized.add(message.conversation_id);
    }
  }

  return finalized;
}

async function loadDueConversationRows({
  limit,
  finalizeAfterMinutes,
}: {
  limit: number;
  finalizeAfterMinutes: number;
}) {
  const cutoff = getCutoffIso(finalizeAfterMinutes);
  const { data: candidates, error } = await getSupabaseAdmin()
    .from("conversations")
    .select("id, customer_id, context, last_message_at")
    .eq("status", "open")
    .not("last_message_at", "is", null)
    .lte("last_message_at", cutoff)
    .order("last_message_at", { ascending: true })
    .limit(Math.max(1, Math.min(limit * 3, 150)))
    .returns<ConversationCandidateRow[]>();

  if (error) {
    throw error;
  }

  const rows = candidates ?? [];
  const conversationIds = rows.map((row) => row.id);

  if (conversationIds.length === 0) {
    return [];
  }

  const supabase = getSupabaseAdmin();
  const customerIds = [...new Set(rows.map((row) => row.customer_id))];
  const { data: customers, error: customersError } = await supabase
    .from("customers")
    .select("id, whatsapp_phone")
    .in("id", customerIds)
    .returns<Array<{ id: string; whatsapp_phone: string }>>();

  if (customersError) {
    throw customersError;
  }

  const phonesByCustomerId = new Map(
    (customers ?? [])
      .filter((customer) => customer.whatsapp_phone)
      .map((customer) => [customer.id, customer.whatsapp_phone]),
  );

  const { data: messages, error: messagesError } = await supabase
    .from("whatsapp_messages")
    .select("conversation_id, raw_metadata")
    .in("conversation_id", conversationIds)
    .eq("direction", "outbound")
    .returns<FinalizerMessageRow[]>();

  if (messagesError) {
    throw messagesError;
  }

  const finalized = finalizedConversationIds(messages ?? []);

  return rows
    .map((row): FinalizerConversationRow | null => {
      const whatsappPhone = phonesByCustomerId.get(row.customer_id);

      if (!whatsappPhone || finalized.has(row.id)) {
        return null;
      }

      return {
        ...row,
        whatsapp_phone: whatsappPhone,
      };
    })
    .filter((row): row is FinalizerConversationRow => row !== null)
    .slice(0, limit);
}

async function closeConversationAfterFinalizer(conversationId: string) {
  const { error } = await getSupabaseAdmin()
    .from("conversations")
    .update({
      status: "closed",
      context: buildInitialConversationState(),
      last_message_at: new Date().toISOString(),
    })
    .eq("id", conversationId)
    .eq("status", "open");

  if (error) {
    throw error;
  }
}

async function finalizeConversation({
  row,
  finalizeAfterMinutes,
}: {
  row: FinalizerConversationRow;
  finalizeAfterMinutes: number;
}) {
  const phone = row.whatsapp_phone;
  const body = sanitizeWhatsAppText(TICKET_MESSAGES.conversationClosed);
  const sendResult = await sendZapiText({ phone, message: body });
  const outboundResult = await saveWhatsAppMessage({
    conversationId: row.id,
    customerId: row.customer_id,
    direction: "outbound",
    messageType: "text",
    body,
    providerMessageId: sendResult.ok ? sendResult.providerMessageId : null,
    rawMetadata: buildWhatsAppOutboundMetadata({
      sendResult,
      messageType: "text",
      reason: FINALIZER_REASON,
      businessContext: {
        inactivity_after_minutes: finalizeAfterMinutes,
      },
    }),
  });

  if (!outboundResult.ok) {
    logError("Failed to save conversation inactivity finalizer", {
      conversationId: row.id,
      code: outboundResult.error?.code,
    });
    return { closed: false, failed: true };
  }

  if (!sendResult.ok) {
    logWarn("Conversation inactivity finalizer send failed", {
      conversationId: row.id,
      phoneLast4: phone.slice(-4),
      error: sendResult.error,
    });
    return { closed: false, failed: true };
  }

  await closeConversationAfterFinalizer(row.id);
  return { closed: true, failed: false };
}

export async function finalizeInactiveWhatsAppConversations({
  limit = 20,
  finalizeAfterMinutes = getConfiguredFinalizeAfterMinutes(),
}: {
  limit?: number;
  finalizeAfterMinutes?: number;
} = {}) {
  const rows = await loadDueConversationRows({ limit, finalizeAfterMinutes });
  let closed = 0;
  let failed = 0;

  for (const row of rows) {
    try {
      const result = await finalizeConversation({ row, finalizeAfterMinutes });
      if (result.closed) closed += 1;
      if (result.failed) failed += 1;
    } catch (error) {
      failed += 1;
      logError("Failed to finalize inactive WhatsApp conversation", {
        conversationId: row.id,
        error,
      });
    }
  }

  return {
    checked: rows.length,
    closed,
    failed,
  };
}
