import "server-only";

import { createHash } from "crypto";
import { logWarn } from "@/lib/logger";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

const RESERVATION_CREATED_PHONE_LIMIT = 5;
const RESERVATION_CREATED_PHONE_WINDOW_MINUTES = 15;
const RESERVATION_CREATED_PHONE_BLOCK_MINUTES = 15;
const RESERVATION_CHURN_PHONE_LIMIT = 5;
const RESERVATION_CHURN_PHONE_WINDOW_MINUTES = 30;
const RESERVATION_CHURN_PHONE_BLOCK_MINUTES = 30;
const RESERVATION_CREATED_SOURCE_LIMIT = 20;
const RESERVATION_CREATED_SOURCE_WINDOW_MINUTES = 15;
const RESERVATION_CREATED_SOURCE_BLOCK_MINUTES = 15;
const SESSION_TICKET_PHONE_LIMIT = 10;
const SESSION_TICKET_PHONE_WINDOW_MINUTES = 15;
const SESSION_TICKET_PHONE_BLOCK_MINUTES = 15;
const CHECKOUT_ORDER_LIMIT = 5;
const CHECKOUT_ORDER_WINDOW_MINUTES = 10;
const CHECKOUT_ORDER_BLOCK_MINUTES = 10;
const CHECKOUT_SOURCE_LIMIT = 30;
const CHECKOUT_SOURCE_WINDOW_MINUTES = 15;
const CHECKOUT_SOURCE_BLOCK_MINUTES = 15;
const DEFAULT_EVENT_TTL_HOURS = 2;

type BuyerRiskActionType =
  | "reservation_created"
  | "reservation_cancelled"
  | "reservation_expired"
  | "checkout_requested"
  | "checkout_blocked"
  | "reservation_blocked";

type BuyerRiskDecision =
  | { allowed: true }
  | {
      allowed: false;
      reason:
        | "reservation_created_phone_limit"
        | "reservation_churn_phone_limit"
        | "reservation_created_source_limit"
        | "reservation_session_ticket_limit"
        | "checkout_order_limit"
        | "checkout_source_limit";
      retryAfterMinutes: number;
    };

type BuyerRiskEventInput = {
  customerId?: string | null;
  phone?: string | null;
  sourceIdentifier?: string | null;
  eventId?: string | null;
  sessionId?: string | null;
  reservationId?: string | null;
  orderId?: string | null;
  actionType: BuyerRiskActionType;
  reason?: string | null;
  quantity?: number | null;
  metadata?: Record<string, unknown>;
  ttlMinutes?: number;
};

type ReservationRiskInput = {
  customerId: string;
  phone?: string | null;
  sourceIdentifier?: string | null;
  eventId: string;
  sessionId: string;
  quantity: number;
};

type CheckoutRiskInput = {
  customerId: string;
  phone?: string | null;
  sourceIdentifier?: string | null;
  reservationId: string;
  orderId: string;
};

function hashValue(value: string) {
  return createHash("sha256").update(value).digest("hex");
}

function normalizePhone(value?: string | null) {
  return value?.replace(/\D/g, "") || null;
}

function hashPhone(value?: string | null) {
  const normalized = normalizePhone(value);

  return normalized ? hashValue(normalized) : null;
}

function hashSource(value?: string | null) {
  const normalized = value?.trim();

  return normalized ? hashValue(normalized) : null;
}

function minutesAgo(minutes: number) {
  return new Date(Date.now() - minutes * 60_000).toISOString();
}

function minutesFromNow(minutes: number) {
  return new Date(Date.now() + minutes * 60_000).toISOString();
}

async function loadCustomerPhone(customerId: string) {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("customers")
    .select("whatsapp_phone")
    .eq("id", customerId)
    .maybeSingle<{ whatsapp_phone: string | null }>();

  if (error) {
    throw error;
  }

  return data?.whatsapp_phone ?? null;
}

async function resolvePhoneHash({
  customerId,
  phone,
}: {
  customerId?: string | null;
  phone?: string | null;
}) {
  const directHash = hashPhone(phone);

  if (directHash) {
    return directHash;
  }

  if (!customerId) {
    return null;
  }

  return hashPhone(await loadCustomerPhone(customerId));
}

function safeMetadata(metadata?: Record<string, unknown>) {
  if (!metadata) {
    return {};
  }

  const allowed: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(metadata)) {
    if (
      key.toLowerCase().includes("phone") ||
      key.toLowerCase().includes("token") ||
      key.toLowerCase().includes("payload") ||
      key.toLowerCase().includes("checkout") ||
      key.toLowerCase().includes("qr")
    ) {
      continue;
    }

    if (
      value == null ||
      typeof value === "boolean" ||
      typeof value === "number" ||
      (typeof value === "string" && value.length <= 80)
    ) {
      allowed[key] = value;
    }
  }

  return allowed;
}

async function countEvents({
  phoneHash,
  sourceHash,
  orderId,
  eventId,
  sessionId,
  actionTypes,
  sinceIso,
}: {
  phoneHash?: string | null;
  sourceHash?: string | null;
  orderId?: string | null;
  eventId?: string | null;
  sessionId?: string | null;
  actionTypes: BuyerRiskActionType[];
  sinceIso: string;
}) {
  const supabase = getSupabaseAdmin();
  let query = supabase
    .from("buyer_risk_events")
    .select("id", { count: "exact", head: true })
    .in("action_type", actionTypes)
    .gte("created_at", sinceIso);

  if (phoneHash) query = query.eq("phone_hash", phoneHash);
  if (sourceHash) query = query.eq("source_hash", sourceHash);
  if (orderId) query = query.eq("order_id", orderId);
  if (eventId) query = query.eq("event_id", eventId);
  if (sessionId) query = query.eq("session_id", sessionId);

  const { count, error } = await query;

  if (error) {
    throw error;
  }

  return count ?? 0;
}

async function sumReservationQuantity({
  phoneHash,
  eventId,
  sessionId,
  sinceIso,
}: {
  phoneHash: string;
  eventId: string;
  sessionId: string;
  sinceIso: string;
}) {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("buyer_risk_events")
    .select("quantity")
    .eq("phone_hash", phoneHash)
    .eq("event_id", eventId)
    .eq("session_id", sessionId)
    .eq("action_type", "reservation_created")
    .gte("created_at", sinceIso)
    .returns<Array<{ quantity: number | null }>>();

  if (error) {
    throw error;
  }

  return (data ?? []).reduce((total, row) => total + (row.quantity ?? 0), 0);
}

export async function recordBuyerRiskEvent(input: BuyerRiskEventInput) {
  try {
    const phoneHash = await resolvePhoneHash({
      customerId: input.customerId,
      phone: input.phone,
    });

    if (!phoneHash) {
      return;
    }

    const supabase = getSupabaseAdmin();
    const { error } = await supabase.from("buyer_risk_events").insert({
      customer_id: input.customerId ?? null,
      phone_hash: phoneHash,
      source_hash: hashSource(input.sourceIdentifier),
      event_id: input.eventId ?? null,
      session_id: input.sessionId ?? null,
      reservation_id: input.reservationId ?? null,
      order_id: input.orderId ?? null,
      action_type: input.actionType,
      reason: input.reason ?? null,
      quantity: input.quantity ?? null,
      metadata: safeMetadata(input.metadata),
      expires_at: minutesFromNow(input.ttlMinutes ?? DEFAULT_EVENT_TTL_HOURS * 60),
    });

    if (error) {
      throw error;
    }
  } catch (error) {
    logWarn("Buyer risk event record failed open", {
      actionType: input.actionType,
      error,
    });
  }
}

export async function checkReservationRisk(
  input: ReservationRiskInput,
): Promise<BuyerRiskDecision> {
  try {
    const phoneHash = await resolvePhoneHash(input);

    if (!phoneHash) {
      return { allowed: true };
    }

    const sourceHash = hashSource(input.sourceIdentifier);
    const createdCount = await countEvents({
      phoneHash,
      actionTypes: ["reservation_created"],
      sinceIso: minutesAgo(RESERVATION_CREATED_PHONE_WINDOW_MINUTES),
    });

    if (createdCount >= RESERVATION_CREATED_PHONE_LIMIT) {
      await recordBuyerRiskEvent({
        ...input,
        actionType: "reservation_blocked",
        reason: "reservation_created_phone_limit",
        ttlMinutes: RESERVATION_CREATED_PHONE_BLOCK_MINUTES,
        metadata: {
          limit: RESERVATION_CREATED_PHONE_LIMIT,
          window_minutes: RESERVATION_CREATED_PHONE_WINDOW_MINUTES,
        },
      });
      return {
        allowed: false,
        reason: "reservation_created_phone_limit",
        retryAfterMinutes: RESERVATION_CREATED_PHONE_BLOCK_MINUTES,
      };
    }

    const churnCount = await countEvents({
      phoneHash,
      actionTypes: ["reservation_cancelled", "reservation_expired"],
      sinceIso: minutesAgo(RESERVATION_CHURN_PHONE_WINDOW_MINUTES),
    });

    if (churnCount >= RESERVATION_CHURN_PHONE_LIMIT) {
      await recordBuyerRiskEvent({
        ...input,
        actionType: "reservation_blocked",
        reason: "reservation_churn_phone_limit",
        ttlMinutes: RESERVATION_CHURN_PHONE_BLOCK_MINUTES,
        metadata: {
          limit: RESERVATION_CHURN_PHONE_LIMIT,
          window_minutes: RESERVATION_CHURN_PHONE_WINDOW_MINUTES,
        },
      });
      return {
        allowed: false,
        reason: "reservation_churn_phone_limit",
        retryAfterMinutes: RESERVATION_CHURN_PHONE_BLOCK_MINUTES,
      };
    }

    if (sourceHash) {
      const sourceCount = await countEvents({
        sourceHash,
        actionTypes: ["reservation_created"],
        sinceIso: minutesAgo(RESERVATION_CREATED_SOURCE_WINDOW_MINUTES),
      });

      if (sourceCount >= RESERVATION_CREATED_SOURCE_LIMIT) {
        await recordBuyerRiskEvent({
          ...input,
          actionType: "reservation_blocked",
          reason: "reservation_created_source_limit",
          ttlMinutes: RESERVATION_CREATED_SOURCE_BLOCK_MINUTES,
          metadata: {
            limit: RESERVATION_CREATED_SOURCE_LIMIT,
            window_minutes: RESERVATION_CREATED_SOURCE_WINDOW_MINUTES,
          },
        });
        return {
          allowed: false,
          reason: "reservation_created_source_limit",
          retryAfterMinutes: RESERVATION_CREATED_SOURCE_BLOCK_MINUTES,
        };
      }
    }

    const recentQuantity = await sumReservationQuantity({
      phoneHash,
      eventId: input.eventId,
      sessionId: input.sessionId,
      sinceIso: minutesAgo(SESSION_TICKET_PHONE_WINDOW_MINUTES),
    });

    if (recentQuantity + input.quantity > SESSION_TICKET_PHONE_LIMIT) {
      await recordBuyerRiskEvent({
        ...input,
        actionType: "reservation_blocked",
        reason: "reservation_session_ticket_limit",
        ttlMinutes: SESSION_TICKET_PHONE_BLOCK_MINUTES,
        metadata: {
          limit: SESSION_TICKET_PHONE_LIMIT,
          window_minutes: SESSION_TICKET_PHONE_WINDOW_MINUTES,
        },
      });
      return {
        allowed: false,
        reason: "reservation_session_ticket_limit",
        retryAfterMinutes: SESSION_TICKET_PHONE_BLOCK_MINUTES,
      };
    }

    return { allowed: true };
  } catch (error) {
    logWarn("Buyer reservation risk check failed open", {
      customerId: input.customerId,
      error,
    });
    return { allowed: true };
  }
}

export async function recordReservationCreated(input: {
  customerId: string;
  phone?: string | null;
  sourceIdentifier?: string | null;
  eventId: string;
  sessionId: string;
  reservationId: string;
  orderId: string;
  quantity: number;
}) {
  await recordBuyerRiskEvent({
    ...input,
    actionType: "reservation_created",
  });
}

export async function recordReservationCancelled(input: {
  customerId: string;
  phone?: string | null;
  sourceIdentifier?: string | null;
  reservationId: string;
  orderId: string;
  status: "cancelled" | "expired";
}) {
  await recordBuyerRiskEvent({
    ...input,
    actionType:
      input.status === "expired" ? "reservation_expired" : "reservation_cancelled",
    reason: input.status,
  });
}

export async function checkCheckoutRisk(
  input: CheckoutRiskInput,
): Promise<BuyerRiskDecision> {
  try {
    const phoneHash = await resolvePhoneHash(input);

    if (!phoneHash) {
      return { allowed: true };
    }

    const orderCount = await countEvents({
      orderId: input.orderId,
      actionTypes: ["checkout_requested"],
      sinceIso: minutesAgo(CHECKOUT_ORDER_WINDOW_MINUTES),
    });

    if (orderCount >= CHECKOUT_ORDER_LIMIT) {
      await recordBuyerRiskEvent({
        ...input,
        actionType: "checkout_blocked",
        reason: "checkout_order_limit",
        ttlMinutes: CHECKOUT_ORDER_BLOCK_MINUTES,
        metadata: {
          limit: CHECKOUT_ORDER_LIMIT,
          window_minutes: CHECKOUT_ORDER_WINDOW_MINUTES,
        },
      });
      return {
        allowed: false,
        reason: "checkout_order_limit",
        retryAfterMinutes: CHECKOUT_ORDER_BLOCK_MINUTES,
      };
    }

    const sourceHash = hashSource(input.sourceIdentifier);

    if (sourceHash) {
      const sourceCount = await countEvents({
        sourceHash,
        actionTypes: ["checkout_requested"],
        sinceIso: minutesAgo(CHECKOUT_SOURCE_WINDOW_MINUTES),
      });

      if (sourceCount >= CHECKOUT_SOURCE_LIMIT) {
        await recordBuyerRiskEvent({
          ...input,
          actionType: "checkout_blocked",
          reason: "checkout_source_limit",
          ttlMinutes: CHECKOUT_SOURCE_BLOCK_MINUTES,
          metadata: {
            limit: CHECKOUT_SOURCE_LIMIT,
            window_minutes: CHECKOUT_SOURCE_WINDOW_MINUTES,
          },
        });
        return {
          allowed: false,
          reason: "checkout_source_limit",
          retryAfterMinutes: CHECKOUT_SOURCE_BLOCK_MINUTES,
        };
      }
    }

    await recordBuyerRiskEvent({
      ...input,
      actionType: "checkout_requested",
    });

    return { allowed: true };
  } catch (error) {
    logWarn("Buyer checkout risk check failed open", {
      customerId: input.customerId,
      orderId: input.orderId,
      error,
    });
    return { allowed: true };
  }
}
