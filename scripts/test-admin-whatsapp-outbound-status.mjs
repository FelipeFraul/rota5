import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import ts from "typescript";

const analytics = readFileSync(
  new URL("../src/lib/tickets/services/adminContactAnalytics.ts", import.meta.url),
  "utf8",
);
const editor = readFileSync(
  new URL("../src/app/admin/eventos/AdminEventsEditor.tsx", import.meta.url),
  "utf8",
);

function first(value) {
  return Array.isArray(value) ? value[0] ?? null : value ?? null;
}

class MockQuery {
  constructor(table, rows, calls) {
    this.table = table;
    this.rows = rows;
    this.calls = calls;
    this.filters = [];
    this.orders = [];
    this.selected = null;
    this.calls.push(this);
  }

  select(value) {
    this.selected = value;
    return this;
  }

  eq(path, value) {
    this.filters.push({ op: "eq", path, value });
    return this;
  }

  gt(path, value) {
    this.filters.push({ op: "gt", path, value });
    return this;
  }

  lt(path, value) {
    this.filters.push({ op: "lt", path, value });
    return this;
  }

  gte(path, value) {
    this.filters.push({ op: "gte", path, value });
    return this;
  }

  in(path, value) {
    this.filters.push({ op: "in", path, value });
    return this;
  }

  order(path, options) {
    this.orders.push({ path, ascending: options?.ascending !== false });
    return this;
  }

  returns() {
    return this;
  }

  async range(from, to) {
    const filtered = this.rows
      .filter((row) => this.filters.every((filter) => this.matches(row, filter)))
      .sort((left, right) => {
        for (const order of this.orders) {
          const result = String(this.valueAt(left, order.path) ?? "").localeCompare(
            String(this.valueAt(right, order.path) ?? ""),
          );
          if (result) return order.ascending ? result : -result;
        }
        return 0;
      });
    return { data: filtered.slice(from, to + 1), error: null };
  }

  matches(row, filter) {
    const value = this.valueAt(row, filter.path);
    if (filter.op === "eq") return value === filter.value;
    if (filter.op === "gt") return value > filter.value;
    if (filter.op === "lt") return value < filter.value;
    if (filter.op === "gte") return value >= filter.value;
    if (filter.op === "in") return filter.value.includes(value);
    return true;
  }

  valueAt(row, path) {
    if (path === "event_sessions.event_id") return first(row.event_sessions)?.events?.event_id ?? first(row.event_sessions)?.event_id;
    if (path === "orders.status") return first(row.orders)?.status;
    if (path === "orders.total_amount_cents") return first(row.orders)?.total_amount_cents;
    return row[path];
  }
}

async function loadAnalyticsWithRows(rowsByTable) {
  const calls = [];
  const source = analytics
    .replace('import { getSupabaseAdmin } from "@/lib/supabase/admin";', "const getSupabaseAdmin = globalThis.__adminContactAnalyticsMock.getSupabaseAdmin;")
    .replace('import { buildWhatsAppPhoneCandidates } from "@/lib/tickets/phones";', "const buildWhatsAppPhoneCandidates = globalThis.__adminContactAnalyticsMock.buildWhatsAppPhoneCandidates;");
  globalThis.__adminContactAnalyticsMock = {
    getSupabaseAdmin() {
      return {
        from(table) {
          return new MockQuery(table, rowsByTable[table] ?? [], calls);
        },
      };
    },
    buildWhatsAppPhoneCandidates(phone) {
      return phone ? [String(phone).replace(/\D/g, "")] : [];
    },
  };
  const transpiled = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.ES2022,
      target: ts.ScriptTarget.ES2022,
    },
  }).outputText;
  const analyticsModule = await import(`data:text/javascript;base64,${Buffer.from(transpiled).toString("base64")}#${Date.now()}-${Math.random()}`);
  return { analyticsModule, calls };
}

test("analytics loads outbound delivery metadata for the conversation history", () => {
  assert.match(analytics, /provider_message_id, raw_metadata/);
  assert.match(analytics, /outboundStatus\?: "sent" \| "failed" \| "unknown"/);
  assert.match(analytics, /providerMessageId\?: string \| null/);
  assert.match(analytics, /function normalizeOutboundSendStatus/);
});

test("conversation modal history is not limited to paid conversation id or current range", () => {
  assert.match(analytics, /fetchHistoryMessagesForCustomers/);
  assert.match(analytics, /\.in\("customer_id", chunk\)/);
  assert.match(analytics, /\.in\("direction", \["inbound", "outbound"\]\)/);
  assert.doesNotMatch(
    analytics,
    /historyMessagesQuery[\s\S]{0,500}\.gte\("created_at", rangeStart\.toISOString\(\)\)/,
  );
  assert.doesNotMatch(
    analytics,
    /historyOutboundMessagesQuery[\s\S]{0,500}\.gte\("created_at", rangeStart\.toISOString\(\)\)/,
  );
  assert.doesNotMatch(analytics, /const historyMessagesQuery = supabase/);
  assert.doesNotMatch(analytics, /const historyOutboundMessagesQuery = supabase/);
  assert.match(analytics, /left\.created_at\.localeCompare\(right\.created_at\) \|\| left\.id\.localeCompare\(right\.id\)/);
});

test("outbound status normalization only accepts known send_status values", () => {
  assert.match(analytics, /metadata\?\.send_status/);
  assert.match(analytics, /status === "sent" \|\| status === "failed" \? status : "unknown"/);
  assert.doesNotMatch(analytics, /sendStatus/);
});

test("admin panel labels outbound statuses without implying delivery or reading", () => {
  assert.match(editor, /Sistema · aceito pela Z-API/);
  assert.match(editor, /Falha no envio · cliente pode não ter recebido/);
  assert.match(editor, /Sistema · status desconhecido/);
  assert.match(editor, /message\.direction === "inbound"\) return "Cliente"/);
  assert.doesNotMatch(editor, /entregue/i);
  assert.doesNotMatch(editor, /lido/i);
});

test("failed outbound attempts remain visible and visually distinct", () => {
  assert.match(editor, /message\.outboundStatus === "failed"/);
  assert.match(editor, /borderColor: "#dc2626"/);
  assert.match(editor, /getMessageLabel\(message\)/);
  assert.match(editor, /message\.body/);
});

test("conversation history is scoped to displayed customers and includes paid outbound-only buyers", async () => {
  const { analyticsModule, calls } = await loadAnalyticsWithRows({
    admin_users: [],
    gate_accesses: [],
    fixed_gate_accesses: [],
    reservations: [
      {
        conversation_id: "conv-active",
        customer_id: "customer-active",
        customers: { name: "Cliente Ativo", whatsapp_phone: "15911111111" },
        event_sessions: { id: "session-1", event_id: "event-1", starts_at: "2026-07-21T20:00:00.000Z", events: { title: "Show", artist_name: null, event_id: "event-1" } },
        orders: { status: "paid", total_amount_cents: 4000 },
      },
      {
        conversation_id: null,
        customer_id: "customer-paid-outbound",
        customers: { name: "Comprador Outbound", whatsapp_phone: "15922222222" },
        event_sessions: { id: "session-2", event_id: "event-1", starts_at: "2026-07-21T21:00:00.000Z", events: { title: "Outro Show", artist_name: null, event_id: "event-1" } },
        orders: { status: "paid", total_amount_cents: 5000 },
      },
    ],
    whatsapp_messages: [
      {
        id: "m-001",
        conversation_id: "conv-active",
        customer_id: "customer-active",
        direction: "inbound",
        body: "Comprar",
        created_at: "2026-07-21T12:00:00.000Z",
        provider_message_id: "in-1",
        raw_metadata: {},
        customers: { name: "Cliente Ativo", whatsapp_phone: "15911111111" },
        conversations: { context: { state: "payment_pending" }, status: "open" },
      },
      {
        id: "m-004",
        conversation_id: "conv-active-old",
        customer_id: "customer-active",
        direction: "inbound",
        body: "Mensagem antiga",
        created_at: "2026-07-20T12:00:00.000Z",
        provider_message_id: "in-old",
        raw_metadata: {},
        customers: { name: "Cliente Ativo", whatsapp_phone: "15911111111" },
        conversations: { context: { state: "idle" }, status: "closed" },
      },
      {
        id: "m-003",
        conversation_id: null,
        customer_id: "customer-active",
        direction: "outbound",
        body: "*QRCODE DO INGRESSO*",
        created_at: "2026-07-21T12:00:00.000Z",
        provider_message_id: "out-qr",
        raw_metadata: { send_status: "failed" },
        customers: { name: "Cliente Ativo", whatsapp_phone: "15911111111" },
      },
      {
        id: "m-002",
        conversation_id: "conv-active",
        customer_id: "customer-active",
        direction: "outbound",
        body: "COMPRA APROVADA",
        created_at: "2026-07-21T12:00:00.000Z",
        provider_message_id: "out-text",
        raw_metadata: { send_status: "sent" },
        customers: { name: "Cliente Ativo", whatsapp_phone: "15911111111" },
      },
      {
        id: "m-005",
        conversation_id: null,
        customer_id: "customer-paid-outbound",
        direction: "outbound",
        body: "INGRESSO EMITIDO",
        created_at: "2026-07-21T13:00:00.000Z",
        provider_message_id: "out-paid-only",
        raw_metadata: {},
        customers: { name: "Comprador Outbound", whatsapp_phone: "15922222222" },
      },
      {
        id: "m-006",
        conversation_id: "conv-alien",
        customer_id: "customer-alien",
        direction: "outbound",
        body: "Nao deveria carregar",
        created_at: "2026-07-21T14:00:00.000Z",
        provider_message_id: "out-alien",
        raw_metadata: { send_status: "sent" },
        customers: { name: "Alheio", whatsapp_phone: "15933333333" },
      },
    ],
  });

  const result = await analyticsModule.getAdminContactActivity({
    eventIds: ["event-1"],
    includeAllContacts: false,
    range: "day",
  });

  assert.equal(result.totalMessages, 1);
  assert.equal(result.totalUniqueContacts, 1);
  assert.equal(result.contacts.length, 2);

  const active = result.contacts.find((contact) => contact.customerId === "customer-active");
  assert.ok(active);
  assert.deepEqual(
    active.conversationMessages.map((message) => [message.createdAt, message.body, message.outboundStatus ?? null]),
    [
      ["2026-07-20T12:00:00.000Z", "Mensagem antiga", null],
      ["2026-07-21T12:00:00.000Z", "Comprar", null],
      ["2026-07-21T12:00:00.000Z", "COMPRA APROVADA", "sent"],
      ["2026-07-21T12:00:00.000Z", "*QRCODE DO INGRESSO*", "failed"],
    ],
  );

  const paidOnly = result.contacts.find((contact) => contact.customerId === "customer-paid-outbound");
  assert.ok(paidOnly);
  assert.equal(paidOnly.messageCount, 1);
  assert.equal(paidOnly.lastInboundMessage, null);
  assert.equal(paidOnly.lastOutboundMessage, "INGRESSO EMITIDO");
  assert.equal(paidOnly.conversationMessages[0].outboundStatus, "unknown");

  assert.equal(result.contacts.some((contact) => contact.customerId === "customer-alien"), false);
  const historyCall = calls.find((call) =>
    call.table === "whatsapp_messages" &&
    call.filters.some((filter) => filter.op === "in" && filter.path === "customer_id"),
  );
  assert.ok(historyCall);
  assert.deepEqual(
    historyCall.filters.find((filter) => filter.op === "in" && filter.path === "customer_id").value.sort(),
    ["customer-active", "customer-paid-outbound"],
  );
  assert.doesNotMatch(historyCall.selected, /customers\(/);
  assert.doesNotMatch(historyCall.selected, /conversations\(/);
});
