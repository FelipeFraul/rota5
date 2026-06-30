import { createHash, randomBytes, randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

function parseEnv(path) {
  return Object.fromEntries(
    readFileSync(path, "utf8")
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => line && !line.startsWith("#") && line.includes("="))
      .map((line) => {
        const index = line.indexOf("=");
        const value = line.slice(index + 1).trim().replace(/^(['"])(.*)\1$/, "$2");
        return [line.slice(0, index).trim(), value];
      }),
  );
}

const env = { ...parseEnv(".env"), ...process.env };
const service = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});
const anon = createClient(env.SUPABASE_URL, env.SUPABASE_ANON_KEY, {
  auth: { persistSession: false },
});
const prefix = `AUDIT-COMBO-${Date.now()}`;
const createdOrderIds = [];
const createdRedemptionIds = [];
let gateSessionId;

function hash(value) {
  return createHash("sha256").update(value).digest("hex");
}

function assert(condition, label, details) {
  if (!condition) throw new Error(`${label}${details ? `: ${details}` : ""}`);
  console.log(`ok - ${label}`);
}

async function insert(table, value) {
  const { data, error } = await service.from(table).insert(value).select("*").single();
  if (error) throw new Error(`${table}: ${error.message}`);
  return data;
}

async function rpc(client, redemption, tokenHash, eventId, sessionId) {
  const { data, error } = await client.rpc("validate_combo_redemption", {
    p_redemption_id: redemption.id,
    p_qr_token_hash: tokenHash,
    p_kitchen_session_id: gateSessionId,
    p_kitchen_label: "Auditoria",
    p_validator_identifier: "audit",
    p_event_id: eventId,
    p_session_id: sessionId,
    p_metadata: { source: "controlled_security_audit" },
  });
  return { data, error };
}

async function createRedemption(source, suffix) {
  const order = await insert("combo_orders", {
    offer_id: source.offer_id,
    customer_id: source.customer_id,
    event_id: source.event_id,
    session_id: source.session_id,
    status: "paid",
    quantity: 1,
    unit_amount_cents: 1,
    total_amount_cents: 1,
    currency: "BRL",
    external_reference: `${prefix}-${suffix}`,
    checkout_token_hash: hash(randomBytes(32).toString("hex")),
    checkout_expires_at: new Date(Date.now() + 48 * 60 * 60_000).toISOString(),
    paid_at: new Date().toISOString(),
    raw_metadata: { audit: true },
  });
  createdOrderIds.push(order.id);
  const token = randomBytes(32).toString("base64url");
  const redemption = await insert("combo_redemptions", {
    combo_order_id: order.id,
    customer_id: source.customer_id,
    event_id: source.event_id,
    session_id: source.session_id,
    offer_name: `${prefix} Oferta`,
    quantity: 1,
    qr_token_hash: hash(token),
    redemption_code: `${prefix}-${suffix}`.slice(0, 80),
    status: "issued",
    raw_metadata: { kitchen_status: "pending", audit: true },
  });
  createdRedemptionIds.push(redemption.id);
  return { ...redemption, tokenHash: hash(token) };
}

async function markReady(redemption) {
  const { error } = await service
    .from("combo_redemptions")
    .update({
      raw_metadata: {
        kitchen_status: "preparing",
        ready_notified_at: new Date().toISOString(),
        audit: true,
      },
    })
    .eq("id", redemption.id);
  if (error) throw error;
}

async function cleanup() {
  if (createdRedemptionIds.length) {
    await service.from("combo_redemption_events").delete().in("combo_redemption_id", createdRedemptionIds);
  }
  if (createdOrderIds.length) await service.from("combo_orders").delete().in("id", createdOrderIds);
  if (gateSessionId) await service.from("gate_sessions").delete().eq("id", gateSessionId);
}

try {
  const { data: source, error: sourceError } = await service
    .from("combo_orders")
    .select("offer_id, customer_id, event_id, session_id")
    .not("offer_id", "is", null)
    .limit(1)
    .single();
  if (sourceError || !source) throw new Error("Nenhum pedido-base de combo disponível para auditoria controlada.");

  const gate = await insert("gate_sessions", {
    event_id: source.event_id,
    session_id: source.session_id,
    gate_label: "Auditoria",
    validator_phone: "15997503836",
    validator_name: prefix,
    token_hash: hash(randomBytes(32).toString("hex")),
    status: "active",
    expires_at: new Date(Date.now() + 48 * 60 * 60_000).toISOString(),
    created_by_admin_phone: "15997503836",
  });
  gateSessionId = gate.id;

  const first = await createRedemption(source, "A");
  const anonymous = await rpc(anon, first, first.tokenHash, source.event_id, source.session_id);
  assert(
    Boolean(anonymous.error),
    "anon não executa RPC privilegiada de resgate",
    JSON.stringify({ data: anonymous.data, error: anonymous.error }),
  );

  let result = await rpc(service, first, hash("token-errado"), source.event_id, source.session_id);
  assert(result.data?.result === "not_found" && !result.data?.allowed, "QR adulterado é recusado");

  result = await rpc(service, first, first.tokenHash, source.event_id, source.session_id);
  assert(result.data?.result === "awaiting_preparation" && !result.data?.allowed, "pedido pendente não é entregue");

  await markReady(first);
  result = await rpc(service, first, first.tokenHash, randomUUID(), source.session_id);
  assert(result.data?.result === "wrong_event" && !result.data?.allowed, "evento incorreto é recusado");
  result = await rpc(service, first, first.tokenHash, source.event_id, randomUUID());
  assert(result.data?.result === "wrong_session" && !result.data?.allowed, "sessão incorreta é recusada");
  result = await rpc(service, first, first.tokenHash, source.event_id, source.session_id);
  assert(result.data?.result === "allowed" && result.data?.allowed, "combo pronto é consumido");
  result = await rpc(service, first, first.tokenHash, source.event_id, source.session_id);
  assert(result.data?.result === "already_used" && !result.data?.allowed, "segunda leitura é recusada");

  const concurrent = await createRedemption(source, "B");
  await markReady(concurrent);
  const concurrentResults = await Promise.all([
    rpc(service, concurrent, concurrent.tokenHash, source.event_id, source.session_id),
    rpc(service, concurrent, concurrent.tokenHash, source.event_id, source.session_id),
  ]);
  const decisions = concurrentResults.map(({ data }) => data?.result).sort();
  assert(
    decisions.join(",") === "allowed,already_used",
    "leituras simultâneas permitem exatamente uma entrega",
    decisions.join(","),
  );

  const { data: persisted } = await service
    .from("combo_redemptions")
    .select("status, used_at, raw_metadata")
    .eq("id", concurrent.id)
    .single();
  assert(persisted?.status === "used" && Boolean(persisted.used_at), "estado final entregue é persistido");
  assert(!JSON.stringify(persisted).includes(concurrent.tokenHash.slice(0, 24)), "metadados não duplicam segredo do QR");
} finally {
  await cleanup();
}
