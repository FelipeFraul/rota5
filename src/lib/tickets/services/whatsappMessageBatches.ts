import "server-only";

import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { buildAggregatedWhatsAppText } from "@/lib/tickets/services/whatsappBatchCore";

export type WhatsAppMessageBatchAppendResult = {
  batchId: string;
  status: WhatsAppMessageBatchStatus;
  shouldProcessNow: boolean;
};

export type WhatsAppMessageBatchStatus =
  | "collecting"
  | "processing"
  | "processed"
  | "cancelled"
  | "failed";

export type WhatsAppMessageBatchMessage = {
  id: string;
  body: string | null;
  messageType: "text" | "image" | "document" | "system";
  createdAt: string;
};

type BatchRpcRow = {
  batch_id: string;
  batch_status: WhatsAppMessageBatchStatus;
  should_process_now: boolean;
};

type ClaimedBatchRpcRow = {
  batch_id: string;
  conversation_id: string;
  attempt_count: number;
};

type RescheduledBatchRpcRow = {
  rescheduled: boolean;
  failed: boolean;
  attempt_count: number;
  next_attempt_at: string | null;
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

function isRpcCompatibilityError(error: { code?: string; message?: string } | null | undefined) {
  return (
    error?.code === "42702" ||
    error?.code === "PGRST203" ||
    /ambiguous|overload/i.test(error?.message ?? "")
  );
}

function addSeconds(date: Date, seconds: number) {
  return new Date(date.getTime() + seconds * 1000);
}

function minDate(a: Date, b: Date) {
  return a.getTime() <= b.getTime() ? a : b;
}

async function appendInboundMessageToBatchFallback({
  conversationId,
  messageId,
  isActionable,
}: {
  conversationId: string;
  messageId: string;
  isActionable: boolean;
}) {
  const supabase = getSupabaseAdmin();
  const now = new Date();

  const { data: existingBatch, error: selectError } = await supabase
    .from("whatsapp_message_batches")
    .select("id, first_message_at")
    .eq("conversation_id", conversationId)
    .eq("status", "collecting")
    .order("first_message_at", { ascending: true })
    .limit(1)
    .maybeSingle<{ id: string; first_message_at: string }>();

  if (selectError) {
    return { ok: false as const, error: selectError };
  }

  let batchId: string;
  let nextPosition = 1;

  if (!existingBatch) {
    const processAfter = addSeconds(now, 30).toISOString();
    const { data: insertedBatch, error: insertBatchError } = await supabase
      .from("whatsapp_message_batches")
      .insert({
        conversation_id: conversationId,
        first_message_at: now.toISOString(),
        last_message_at: now.toISOString(),
        process_after: processAfter,
      })
      .select("id")
      .single<{ id: string }>();

    if (insertBatchError) {
      return { ok: false as const, error: insertBatchError };
    }

    batchId = insertedBatch.id;
  } else {
    const firstMessageAtValue = existingBatch.first_message_at;
    batchId = existingBatch.id;
    const { count, error: countError } = await supabase
      .from("whatsapp_message_batch_messages")
      .select("id", { count: "exact", head: true })
      .eq("batch_id", batchId);

    if (countError) {
      return { ok: false as const, error: countError };
    }

    nextPosition = (count ?? 0) + 1;

    const firstMessageAt = new Date(firstMessageAtValue);
    const processAfter = minDate(addSeconds(now, 30), addSeconds(firstMessageAt, 30));
    const { error: updateBatchError } = await supabase
      .from("whatsapp_message_batches")
      .update({
        last_message_at: now.toISOString(),
        process_after: processAfter.toISOString(),
      })
      .eq("id", batchId);

    if (updateBatchError) {
      return { ok: false as const, error: updateBatchError };
    }
  }

  const { error: linkError } = await supabase
    .from("whatsapp_message_batch_messages")
    .insert({
      batch_id: batchId,
      whatsapp_message_id: messageId,
      position: nextPosition,
    });

  if (linkError && linkError.code !== "23505") {
    return { ok: false as const, error: linkError };
  }

  if (isActionable) {
    const { error: cancelError } = await supabase
      .from("whatsapp_message_batches")
      .update({
        status: "cancelled",
        cancelled_at: now.toISOString(),
        process_after: now.toISOString(),
      })
      .eq("id", batchId)
      .eq("status", "collecting");

    if (cancelError) {
      return { ok: false as const, error: cancelError };
    }

    return {
      ok: true as const,
      batch: {
        batchId,
        status: "cancelled" as const,
        shouldProcessNow: true,
      },
    };
  }

  return {
    ok: true as const,
    batch: {
      batchId,
      status: "collecting" as const,
      shouldProcessNow: false,
    },
  };
}

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
    if (isRpcCompatibilityError(error)) {
      return appendInboundMessageToBatchFallback({
        conversationId,
        messageId,
        isActionable,
      });
    }

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

async function claimDueWhatsAppMessageBatchesFallback({
  limit,
  processingTimeoutSeconds,
  maxAttempts,
}: {
  limit: number;
  processingTimeoutSeconds: number;
  maxAttempts: number;
}) {
  const supabase = getSupabaseAdmin();
  const now = new Date();
  const timeoutCutoff = addSeconds(now, -processingTimeoutSeconds);
  const { data: candidates, error } = await supabase
    .from("whatsapp_message_batches")
    .select(
      "id, conversation_id, status, process_after, claimed_at, processing_started_at, updated_at, next_attempt_at, attempt_count",
    )
    .in("status", ["collecting", "processing"])
    .order("process_after", { ascending: true })
    .limit(Math.min(Math.max(limit * 4, limit), 100))
    .returns<
      {
        id: string;
        conversation_id: string;
        status: "collecting" | "processing";
        process_after: string | null;
        claimed_at: string | null;
        processing_started_at: string | null;
        updated_at: string | null;
        next_attempt_at: string | null;
        attempt_count: number;
      }[]
    >();

  if (error) {
    return { ok: false as const, error };
  }

  const due = (candidates ?? [])
    .filter((batch) => {
      if (batch.attempt_count >= maxAttempts) return false;

      const nextAttemptAt = batch.next_attempt_at ? new Date(batch.next_attempt_at) : null;

      if (batch.status === "collecting") {
        const processAfter = batch.process_after ? new Date(batch.process_after) : null;
        return Boolean(
          processAfter &&
            processAfter <= now &&
            (!nextAttemptAt || nextAttemptAt <= now),
        );
      }

      const startedAt = new Date(
        batch.processing_started_at ?? batch.claimed_at ?? batch.updated_at ?? 0,
      );
      return startedAt <= timeoutCutoff && (!nextAttemptAt || nextAttemptAt <= now);
    })
    .slice(0, limit);

  const batches = [];

  for (const batch of due) {
    const nextAttemptCount = batch.attempt_count + 1;
    const { data: updatedRows, error: updateError } = await supabase
      .from("whatsapp_message_batches")
      .update({
        status: "processing",
        claimed_at: now.toISOString(),
        processing_started_at: now.toISOString(),
        attempt_count: nextAttemptCount,
        last_error_code: null,
        last_error_at: null,
      })
      .eq("id", batch.id)
      .in("status", ["collecting", "processing"])
      .select("id, conversation_id, attempt_count")
      .returns<{ id: string; conversation_id: string; attempt_count: number }[]>();

    if (updateError) {
      return { ok: false as const, error: updateError };
    }

    const updated = updatedRows?.[0];

    if (updated) {
      batches.push({
        batchId: updated.id,
        conversationId: updated.conversation_id,
        attemptCount: updated.attempt_count,
      });
    }
  }

  return { ok: true as const, batches };
}

export async function claimDueWhatsAppMessageBatches({
  limit = 20,
  processingTimeoutSeconds = 300,
  maxAttempts = 3,
}: {
  limit?: number;
  processingTimeoutSeconds?: number;
  maxAttempts?: number;
} = {}) {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .rpc("claim_due_whatsapp_message_batches", {
      batch_limit: limit,
      processing_timeout_seconds: processingTimeoutSeconds,
      max_attempts: maxAttempts,
    })
    .returns<ClaimedBatchRpcRow[]>();

  if (error) {
    if (isRpcCompatibilityError(error)) {
      return claimDueWhatsAppMessageBatchesFallback({
        limit,
        processingTimeoutSeconds,
        maxAttempts,
      });
    }

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
      attemptCount: row.attempt_count,
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
  errorCode = null,
}: {
  batchId: string;
  status?: "processed" | "cancelled" | "failed";
  errorCode?: string | null;
}) {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase.rpc("finish_whatsapp_message_batch", {
    target_batch_id: batchId,
    final_status: status,
    error_code: errorCode,
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

export async function rescheduleWhatsAppMessageBatch({
  batchId,
  retryAfterSeconds,
  errorCode,
  maxAttempts = 3,
}: {
  batchId: string;
  retryAfterSeconds: number;
  errorCode: string;
  maxAttempts?: number;
}) {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .rpc("reschedule_whatsapp_message_batch", {
      target_batch_id: batchId,
      retry_after_seconds: retryAfterSeconds,
      error_code: errorCode,
      max_attempts: maxAttempts,
    })
    .returns<RescheduledBatchRpcRow[]>();

  if (error) {
    if (isRpcCompatibilityError(error)) {
      const supabase = getSupabaseAdmin();
      const now = new Date();
      const { data: currentBatch, error: selectError } = await supabase
        .from("whatsapp_message_batches")
        .select("id, attempt_count, process_after, cancelled_at")
        .eq("id", batchId)
        .eq("status", "processing")
        .maybeSingle<{
          id: string;
          attempt_count: number;
          process_after: string | null;
          cancelled_at: string | null;
        }>();

      if (selectError) {
        return { ok: false as const, error: selectError };
      }

      if (!currentBatch) {
        return {
          ok: true as const,
          rescheduled: false,
          failed: false,
          attemptCount: 0,
          nextAttemptAt: null,
        };
      }

      const failed = currentBatch.attempt_count >= maxAttempts;
      const nextAttemptAt = failed ? null : addSeconds(now, retryAfterSeconds).toISOString();
      const { error: updateError } = await supabase
        .from("whatsapp_message_batches")
        .update({
          status: failed ? "failed" : "collecting",
          processing_started_at: null,
          next_attempt_at: nextAttemptAt,
          process_after: failed ? currentBatch.process_after : nextAttemptAt,
          cancelled_at: failed ? now.toISOString() : currentBatch.cancelled_at,
          last_error_code: errorCode.slice(0, 80),
          last_error_at: now.toISOString(),
        })
        .eq("id", batchId)
        .eq("status", "processing");

      if (updateError) {
        return { ok: false as const, error: updateError };
      }

      return {
        ok: true as const,
        rescheduled: !failed,
        failed,
        attemptCount: currentBatch.attempt_count,
        nextAttemptAt,
      };
    }

    return {
      ok: false as const,
      error,
    };
  }

  const row = (Array.isArray(data) ? data : [])[0];

  return {
    ok: true as const,
    rescheduled: Boolean(row?.rescheduled),
    failed: Boolean(row?.failed),
    attemptCount: row?.attempt_count ?? 0,
    nextAttemptAt: row?.next_attempt_at ?? null,
  };
}
