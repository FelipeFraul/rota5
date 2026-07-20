import { createClient } from "@supabase/supabase-js";

import {
  resolveIncomingMessageIntent,
  routeTicketMessage,
} from "../src/lib/tickets/router.ts";

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false } },
);
const customer = {
  id: "00000000-0000-0000-0000-000000000001",
  whatsapp_phone: "5515999999999",
  name: "Teste",
};
const conversationId = "00000000-0000-0000-0000-000000000002";
const inputs = [
  "tem show do santana",
  "santana",
  "show santana",
  "ingresso do santana",
  "quero santana",
  "tem o santana?",
  "Gui Santana",
  "alias cadastrado",
  "termoinexistentezzz",
];

async function fetchRpcCandidates(term) {
  if (!term) return { used: false, rows: [], error: null };

  const result = await supabase.rpc("search_public_events_ranked", {
    search_term: term,
    date_from: new Date().toISOString(),
    date_to: null,
    result_limit: 10,
  });

  return {
    used: true,
    error: result.error
      ? {
          code: result.error.code,
          message: result.error.message,
        }
      : null,
    rows: (result.data ?? []).map((row) => ({
      eventId: row.event_id,
      title: row.title,
      artist: row.artist_name,
      score: Number(row.score),
      sessionStatus: row.session_status,
      startsAt: row.starts_at,
    })),
  };
}

async function fetchSantanaCatalog() {
  const events = await supabase
    .from("events")
    .select("id,title,artist_name,description,city,state,status,event_sessions(id,starts_at,status)")
    .or("title.ilike.%Santana%,artist_name.ilike.%Santana%,description.ilike.%Santana%")
    .limit(20);
  const aliases = await supabase
    .from("event_aliases")
    .select("event_id,alias,events(title,artist_name,status)")
    .ilike("alias", "%Santana%")
    .limit(20);

  return {
    eventsError: events.error?.message ?? null,
    events: events.data ?? [],
    aliasesError: aliases.error?.message ?? null,
    aliases: aliases.data ?? [],
  };
}

const catalog = await fetchSantanaCatalog();
const records = [];

for (const text of inputs) {
  const intent = resolveIncomingMessageIntent({
    text,
    messageType: "text",
    conversationState: {},
  });
  const term = intent.search?.artist ?? intent.search?.city ?? "";
  const rpc = await fetchRpcCandidates(term);
  const searchCalls = [];
  globalThis.__ticketSearchEventsAudit = (input) => {
    searchCalls.push(input);
  };
  const result = await routeTicketMessage({
    customer,
    conversation: {
      id: conversationId,
      context: {},
    },
    text,
    messageType: "text",
  });
  const returnedTitles = new Set((result.nextContext.lastEvents ?? []).map((event) => event.title));

  records.push({
    originalText: text,
    normalizedText: intent.normalizedText,
    classification: intent.classification,
    confidence: intent.confidence,
    evidence: intent.evidence,
    extractedTerm: term || null,
    searchAuthorized: intent.searchAuthorized,
    searchCalls,
    queryUsed: searchCalls.length ? "searchEvents -> search_public_events_ranked" : "none",
    rpcCandidates: rpc.rows,
    excludedCandidates: rpc.rows
      .filter((row) => !returnedTitles.has(row.title))
      .map((row) => ({
        title: row.title,
        reason: "not_returned_after_availability_or_limit_filter",
        score: row.score,
      })),
    finalReply: String(result.reply ?? "").replace(/\s+/g, " ").trim().slice(0, 220),
    nextState: result.nextContext.state ?? "idle",
  });
}

console.log(JSON.stringify({
  ok: true,
  migration: {
    rpcExists: records.some((record) => record.rpcCandidates.length > 0),
    rpcName: "search_public_events_ranked",
  },
  catalog,
  records,
}, null, 2));
