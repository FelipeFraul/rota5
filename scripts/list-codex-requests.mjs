import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { createClient } from "@supabase/supabase-js";

const APPROVED_PREFIX = "CODEX APROVADO:";

function loadEnvFile(filePath) {
  if (!existsSync(filePath)) {
    return;
  }

  const content = readFileSync(filePath, "utf8");

  for (const line of content.split(/\r?\n/)) {
    const trimmed = line.trim();

    if (!trimmed || trimmed.startsWith("#") || !trimmed.includes("=")) {
      continue;
    }

    const index = trimmed.indexOf("=");
    const key = trimmed.slice(0, index).trim();
    let value = trimmed.slice(index + 1).trim();

    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }

    process.env[key] ??= value;
  }
}

function normalizeWhatsAppPhone(phone) {
  const digits = phone?.replace(/\D/g, "") ?? "";

  if (!digits) {
    return null;
  }

  if (!digits.startsWith("55") && (digits.length === 10 || digits.length === 11)) {
    return `55${digits}`;
  }

  return digits;
}

function getArgValue(name) {
  const inlineArg = process.argv.find((arg) => arg.startsWith(`${name}=`));

  if (inlineArg) {
    return inlineArg.slice(name.length + 1);
  }

  const index = process.argv.indexOf(name);

  return index >= 0 ? process.argv[index + 1] : null;
}

loadEnvFile(resolve(".env"));
loadEnvFile(resolve(".env.local"));

const supabaseUrl = process.env.SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const phone = normalizeWhatsAppPhone(
  getArgValue("--phone") ?? process.env.CODEX_WHATSAPP_PHONE,
);
const limit = Number(getArgValue("--limit") ?? 20);

if (!supabaseUrl || !serviceRoleKey) {
  throw new Error("SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY sao obrigatorios.");
}

if (!phone) {
  throw new Error("Informe --phone ou CODEX_WHATSAPP_PHONE para consulta.");
}

const supabase = createClient(supabaseUrl, serviceRoleKey, {
  auth: {
    persistSession: false,
    autoRefreshToken: false,
  },
});

const { data, error } = await supabase
  .from("whatsapp_messages")
  .select("id, body, created_at, customers!inner(whatsapp_phone, name)")
  .eq("direction", "inbound")
  .eq("message_type", "system")
  .eq("customers.whatsapp_phone", phone)
  .ilike("body", `${APPROVED_PREFIX}%`)
  .order("created_at", { ascending: false })
  .limit(Number.isFinite(limit) && limit > 0 ? limit : 20);

if (error) {
  throw error;
}

if (!data?.length) {
  console.log(`Nenhum pedido CODEX aprovado encontrado para ${phone}.`);
} else {
  for (const request of data) {
    const requestId = request.id.slice(0, 8);
    const createdAt = new Date(request.created_at).toLocaleString("pt-BR", {
      timeZone: "America/Sao_Paulo",
    });
    const body = request.body ?? "";
    const prompt = body.replace(/^CODEX APROVADO:\s*/i, "").trim();

    console.log(`#${requestId} - ${createdAt}`);
    console.log(prompt || "(pedido vazio)");
    console.log("");
  }
}
