import "server-only";

import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { validateGateSessionToken } from "@/lib/tickets/services/gateSessions";

type MaybeArray<T> = T | T[] | null;

type GateTicketRow = {
  id: string;
  ticket_code: string;
  status: string;
  issued_at: string;
  used_at: string | null;
  cancelled_at: string | null;
  session_id: string;
  reservation_items: MaybeArray<{ seat_code: string }>;
  venue_sections: MaybeArray<{ name: string }>;
  event_sessions: MaybeArray<{
    starts_at: string;
    event_id: string;
    events: MaybeArray<{ title: string }>;
  }>;
};

function first<T>(value: MaybeArray<T>) {
  return Array.isArray(value) ? value[0] ?? null : value;
}

export async function consultGateTicket(input: {
  gateSessionToken: string;
  ticketCode: string;
}) {
  const gateSession = await validateGateSessionToken(input.gateSessionToken);

  if (!gateSession.valid) {
    return { ok: false as const, reason: "invalid_gate_session" as const };
  }

  const { eventId, sessionId } = gateSession.gateSession;
  if (!eventId && !sessionId) {
    return { ok: false as const, reason: "invalid_gate_scope" as const };
  }

  const supabase = getSupabaseAdmin();
  let query = supabase
    .from("tickets")
    .select(
      "id, ticket_code, status, issued_at, used_at, cancelled_at, session_id, reservation_items(seat_code), venue_sections(name), event_sessions!inner(starts_at, event_id, events(title))",
    )
    .eq("ticket_code", input.ticketCode.trim().toUpperCase());

  query = sessionId
    ? query.eq("session_id", sessionId)
    : query.eq("event_sessions.event_id", eventId as string);

  const { data, error } = await query.maybeSingle<GateTicketRow>();
  if (error) throw error;
  if (!data) return { ok: false as const, reason: "not_found" as const };

  const session = first(data.event_sessions);
  const event = first(session?.events ?? null);
  const section = first(data.venue_sections);
  const reservationItem = first(data.reservation_items);

  const { data: validations, error: validationsError } = await supabase
    .from("ticket_validation_events")
    .select("result, created_at")
    .eq("ticket_id", data.id)
    .order("created_at", { ascending: false })
    .limit(5)
    .returns<Array<{ result: string; created_at: string }>>();

  if (validationsError) throw validationsError;

  return {
    ok: true as const,
    ticket: {
      code: data.ticket_code,
      status: data.status,
      eventTitle: event?.title ?? "Evento",
      startsAt: session?.starts_at ?? null,
      section: section?.name ?? null,
      seat: reservationItem?.seat_code ?? null,
      issuedAt: data.issued_at,
      usedAt: data.used_at,
      cancelledAt: data.cancelled_at,
      validations: (validations ?? []).map((validation) => ({
        result: validation.result,
        createdAt: validation.created_at,
      })),
    },
  };
}
