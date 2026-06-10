import { spawnSync } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import { join, resolve } from "node:path";
import { createClient } from "@supabase/supabase-js";

const APPROVED_PREFIX = "CODEX APROVADO:";
const STATE_DIR = resolve(".codex-whatsapp-runner");
const STATE_FILE = resolve(STATE_DIR, "state.json");
const POLL_SECONDS = Number(process.env.CODEX_RUNNER_POLL_SECONDS ?? 60);
const RUN_ONCE = process.argv.includes("--once");
const CHECK_ONLY = process.argv.includes("--check");
const DEFAULT_CODEX_PHONE = "15997503836";
let codexCommand = process.env.CODEX_CLI_PATH || "codex";

function loadEnvFile(filePath) {
  if (!existsSync(filePath)) return;

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

  if (!digits) return null;
  if (!digits.startsWith("55") && (digits.length === 10 || digits.length === 11)) {
    return `55${digits}`;
  }

  return digits;
}

function run(command, args, options = {}) {
  return spawnSync(command, args, {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
    ...options,
  });
}

function findBundledCodexCommand() {
  const userProfile = process.env.USERPROFILE;

  if (!userProfile) {
    return null;
  }

  const extensionsDir = join(userProfile, ".vscode", "extensions");

  if (!existsSync(extensionsDir)) {
    return null;
  }

  return findCodexUnder(extensionsDir);
}

function findCodexUnder(directory) {
  let entries;

  try {
    entries = readdirSync(directory, { withFileTypes: true });
  } catch {
    return null;
  }

  for (const entry of entries) {
    const fullPath = join(directory, entry.name);

    if (entry.isFile() && entry.name.toLowerCase() === "codex.exe") {
      return fullPath;
    }

    if (entry.isDirectory()) {
      const found = findCodexUnder(fullPath);

      if (found) {
        return found;
      }
    }
  }

  return null;
}

function required(value, name) {
  if (!value) {
    throw new Error(`${name} is required`);
  }

  return value;
}

function loadState() {
  if (!existsSync(STATE_FILE)) {
    return {
      processedRequests: {},
    };
  }

  try {
    const state = JSON.parse(readFileSync(STATE_FILE, "utf8"));

    return {
      processedRequests:
        state.processedRequests && typeof state.processedRequests === "object"
          ? state.processedRequests
          : {},
    };
  } catch {
    return {
      processedRequests: {},
    };
  }
}

function saveState(state) {
  mkdirSync(STATE_DIR, { recursive: true });
  writeFileSync(STATE_FILE, `${JSON.stringify(state, null, 2)}\n`);
}

function buildSupabase() {
  loadEnvFile(resolve(".env"));
  loadEnvFile(resolve(".env.local"));

  return createClient(
    required(process.env.SUPABASE_URL, "SUPABASE_URL"),
    required(process.env.SUPABASE_SERVICE_ROLE_KEY, "SUPABASE_SERVICE_ROLE_KEY"),
    {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
    },
  );
}

function getAllowedPhones() {
  const configuredPhones =
    process.env.CODEX_WHATSAPP_PHONES?.split(",") ?? [DEFAULT_CODEX_PHONE];

  return configuredPhones
    .map((phone) => normalizeWhatsAppPhone(phone))
    .filter(Boolean);
}

async function listPendingRequests(supabase, state) {
  const allowedPhones = getAllowedPhones();
  const { data, error } = await supabase
    .from("whatsapp_messages")
    .select("id, body, created_at, customers!inner(whatsapp_phone, name)")
    .eq("direction", "inbound")
    .eq("message_type", "system")
    .ilike("body", `${APPROVED_PREFIX}%`)
    .in("customers.whatsapp_phone", allowedPhones)
    .order("created_at", { ascending: true })
    .limit(20);

  if (error) {
    throw error;
  }

  return (data ?? []).filter((request) => {
    const shortId = request.id.slice(0, 8);

    const processedById = state.processedRequests[request.id];
    const processedByShortId = state.processedRequests[shortId];

    return (
      processedById?.status !== "completed" &&
      processedByShortId?.status !== "completed"
    );
  });
}

function extractPrompt(body) {
  return (body ?? "").replace(/^CODEX APROVADO:\s*/i, "").trim();
}

function buildCodexPrompt(request, prompt) {
  const requestId = request.id.slice(0, 8);
  const phone = request.customers?.whatsapp_phone ?? "";

  return [
    "Voce esta executando um pedido CODEX recebido pelo WhatsApp.",
    "",
    `Pedido CODEX: #${requestId}`,
    `Telefone final: ${phone.slice(-4)}`,
    "",
    "Pedido do usuario:",
    prompt,
    "",
    "Execute o trabalho de ponta a ponta neste repositorio:",
    "1. Analise o codigo.",
    "2. Implemente somente o pedido.",
    "3. Rode `node node_modules\\typescript\\bin\\tsc --noEmit`.",
    "4. Rode `node node_modules\\next\\dist\\bin\\next build --webpack`.",
    "5. Se tudo passar, faca commit com uma mensagem curta.",
    "6. Faca `git push origin main`.",
    "7. Faca deploy com `cmd /c vercel --prod`.",
    "8. Verifique `https://site-phi-seven-72.vercel.app/api/health`.",
    "",
    "Nao use OpenAI API key. Use apenas esta sessao local do Codex.",
    "Nao faca alteracoes destrutivas. Se houver conflito ou duvida real, pare e explique no resultado.",
  ].join("\n");
}

function runCodex(request, prompt) {
  return run(codexCommand, [
    "exec",
    "--cd",
    process.cwd(),
    "--sandbox",
    "workspace-write",
    "-",
  ], {
    input: buildCodexPrompt(request, prompt),
  });
}

function ensureTools() {
  let codexResult = run(codexCommand, ["--version"]);

  if (codexResult.status !== 0 && codexCommand === "codex") {
    const bundledCodex = findBundledCodexCommand();

    if (bundledCodex) {
      codexCommand = bundledCodex;
      codexResult = run(codexCommand, ["--version"]);
    }
  }

  if (codexResult.status !== 0) {
    throw new Error(
      [
        "Comando obrigatorio indisponivel: codex",
        "Instale/abra a extensao do ChatGPT/Codex no VSCode ou defina CODEX_CLI_PATH com o caminho do codex.exe.",
      ].join("\n"),
    );
  }

  for (const command of ["git"]) {
    const result = run(command, ["--version"]);

    if (result.status !== 0) {
      throw new Error(`Comando obrigatorio indisponivel: ${command}`);
    }
  }

  console.log(`Usando Codex CLI: ${codexCommand}`);
}

function markProcessed(state, request, status, extra = {}) {
  state.processedRequests[request.id] = {
    status,
    updatedAt: new Date().toISOString(),
    ...extra,
  };
  saveState(state);
}

function processRequest(request, state) {
  const requestId = request.id.slice(0, 8);
  const prompt = extractPrompt(request.body);

  if (!prompt) {
    console.log(`Pedido #${requestId} ignorado: corpo vazio.`);
    markProcessed(state, request, "failed", { reason: "empty_prompt" });
    return;
  }

  if (CHECK_ONLY) {
    console.log(`Pedido pendente #${requestId}: ${prompt}`);
    return;
  }

  console.log(`Processando pedido CODEX #${requestId}.`);
  const result = runCodex(request, prompt);
  const ok = result.status === 0;
  const logs = [result.stdout, result.stderr].filter(Boolean).join("\n").slice(-6000);

  if (!ok) {
    console.error(`Pedido #${requestId} falhou.\n${logs}`);
    markProcessed(state, request, "failed", { logs });
    return;
  }

  console.log(`Pedido #${requestId} concluido.`);
  markProcessed(state, request, "completed", { logs });
}

async function main() {
  ensureTools();
  const supabase = buildSupabase();

  do {
    const state = loadState();

    try {
      const requests = await listPendingRequests(supabase, state);

      if (requests.length === 0) {
        console.log(`Nenhum pedido CODEX pendente. Proxima checagem em ${POLL_SECONDS}s.`);
      }

      for (const request of requests) {
        processRequest(request, state);
      }
    } catch (error) {
      console.error(
        [
          `Falha ao consultar pedidos CODEX. Vou tentar novamente em ${POLL_SECONDS}s.`,
          String(error?.message || error),
        ].join("\n"),
      );

      if (RUN_ONCE || CHECK_ONLY) {
        process.exitCode = 1;
        break;
      }
    }

    if (RUN_ONCE || CHECK_ONLY) {
      break;
    }

    await new Promise((resolveTimeout) => setTimeout(resolveTimeout, POLL_SECONDS * 1000));
  } while (true);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
