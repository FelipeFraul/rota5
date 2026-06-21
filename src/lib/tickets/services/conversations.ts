import "server-only";

import { getSupabaseAdmin } from "@/lib/supabase/admin";

export type TicketConversation = {
  id: string;
  customer_id: string;
  status: "open" | "closed";
  context: Record<string, unknown>;
  last_message_at: string | null;
};

type GetOrCreateOpenConversationInput = {
  customerId: string;
};

export async function getOrCreateOpenConversation({
  customerId,
}: GetOrCreateOpenConversationInput) {
  const supabase = getSupabaseAdmin();
  const { data: existingConversation, error: existingConversationError } =
    await supabase
      .from("conversations")
      .select("id, customer_id, status, context, last_message_at")
      .eq("customer_id", customerId)
      .eq("status", "open")
      .order("last_message_at", { ascending: false, nullsFirst: false })
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle<TicketConversation>();

  if (existingConversationError) {
    return {
      ok: false as const,
      error: existingConversationError,
    };
  }

  if (existingConversation) {
    return {
      ok: true as const,
      conversation: existingConversation,
    };
  }

  const { data: conversation, error: insertError } = await supabase
    .from("conversations")
    .insert({
      customer_id: customerId,
      status: "open",
      context: {},
    })
    .select("id, customer_id, status, context, last_message_at")
    .single<TicketConversation>();

  if (insertError) {
    return {
      ok: false as const,
      error: insertError,
    };
  }

  return {
    ok: true as const,
    conversation,
  };
}

export async function updateConversationAfterMessage({
  conversationId,
  context,
}: {
  conversationId: string;
  context?: Record<string, unknown>;
}) {
  const supabase = getSupabaseAdmin();
  const payload = {
    last_message_at: new Date().toISOString(),
    ...(context ? { context } : {}),
  };
  const { error } = await supabase
    .from("conversations")
    .update(payload)
    .eq("id", conversationId);

  if (error) {
    return {
      ok: false as const,
      error,
    };
  }

  return {
    ok: true as const,
  };
}

export async function reconcileConversationDelivery({
  conversationId,
  generationId,
  context,
}: {
  conversationId: string;
  generationId: string;
  context: Record<string, unknown>;
}) {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("conversations")
    .update({ context })
    .eq("id", conversationId)
    .contains("context", {
      deliveryGuard: { generationId },
    })
    .select("id")
    .maybeSingle<{ id: string }>();

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
