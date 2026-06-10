import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const DEFAULT_REPOSITORY = "FelipeFraul/ticketeira";
const STATE_DIR = resolve(".codex-whatsapp-runner");
const STATE_FILE = resolve(STATE_DIR, "state.json");
const POLL_SECONDS = Number(process.env.CODEX_RUNNER_POLL_SECONDS ?? 60);
const RUN_ONCE = process.argv.includes("--once");
const REPOSITORY =
  process.env.CODEX_RUNNER_REPOSITORY ||
  process.env.GITHUB_ISSUES_REPOSITORY ||
  DEFAULT_REPOSITORY;

function run(command, args, options = {}) {
  return spawnSync(command, args, {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
    ...options,
  });
}

function runOrThrow(command, args, options = {}) {
  const result = run(command, args, options);

  if (result.status !== 0) {
    throw new Error(
      [
        `$ ${command} ${args.join(" ")}`,
        result.stdout,
        result.stderr,
      ].filter(Boolean).join("\n"),
    );
  }

  return result.stdout.trim();
}

function loadState() {
  if (!existsSync(STATE_FILE)) {
    return {
      processedIssues: {},
    };
  }

  try {
    const state = JSON.parse(readFileSync(STATE_FILE, "utf8"));

    return {
      processedIssues:
        state.processedIssues && typeof state.processedIssues === "object"
          ? state.processedIssues
          : {},
    };
  } catch {
    return {
      processedIssues: {},
    };
  }
}

function saveState(state) {
  mkdirSync(STATE_DIR, { recursive: true });
  writeFileSync(STATE_FILE, `${JSON.stringify(state, null, 2)}\n`);
}

function extractPrompt(body) {
  const markers = ["Solicitacao:", "Solicita\u00e7\u00e3o:"];
  const marker = markers.find((candidate) => body.includes(candidate));

  if (!marker) {
    return body.trim();
  }

  const afterMarker = body.slice(body.indexOf(marker) + marker.length).trim();
  const endMarkerIndex = afterMarker.indexOf("\nFluxo seguro:");

  return (endMarkerIndex >= 0 ? afterMarker.slice(0, endMarkerIndex) : afterMarker)
    .trim();
}

function listPendingIssues(state) {
  const output = runOrThrow("gh", [
    "issue",
    "list",
    "--repo",
    REPOSITORY,
    "--state",
    "open",
    "--search",
    "CODEX WhatsApp # in:title",
    "--json",
    "number,title,body,url,createdAt",
    "--limit",
    "20",
  ]);
  const issues = JSON.parse(output);

  return issues.filter((issue) => !state.processedIssues[String(issue.number)]);
}

function commentIssue(number, body) {
  const result = run("gh", [
    "issue",
    "comment",
    String(number),
    "--repo",
    REPOSITORY,
    "--body",
    body,
  ]);

  if (result.status !== 0) {
    console.warn(result.stderr || result.stdout);
  }
}

function buildCodexPrompt(issue, prompt) {
  return [
    "Voce esta executando um pedido CODEX recebido pelo WhatsApp.",
    "",
    `Issue GitHub: ${issue.url}`,
    `Numero da Issue: #${issue.number}`,
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
    "9. Comente na Issue o commit, deploy e resumo.",
    "",
    "Nao use OpenAI API key. Use apenas esta sessao local do Codex.",
    "Nao faca alteracoes destrutivas. Se houver conflito ou duvida real, pare e comente na Issue.",
  ].join("\n");
}

function runCodex(issue, prompt) {
  const codexPrompt = buildCodexPrompt(issue, prompt);

  return run("codex", [
    "exec",
    "--cd",
    process.cwd(),
    "--sandbox",
    "workspace-write",
    "--ask-for-approval",
    "never",
    "-",
  ], {
    input: codexPrompt,
  });
}

function processIssue(issue, state) {
  const prompt = extractPrompt(issue.body ?? "");

  if (!prompt) {
    commentIssue(issue.number, "Runner local CODEX: nao encontrei o pedido no corpo da Issue.");
    state.processedIssues[String(issue.number)] = {
      status: "failed",
      reason: "missing_prompt",
      updatedAt: new Date().toISOString(),
    };
    saveState(state);
    return;
  }

  console.log(`Processando Issue #${issue.number}: ${issue.title}`);
  commentIssue(
    issue.number,
    "Runner local CODEX iniciou a execucao neste computador. Nada sera feito por OpenAI API key.",
  );

  const result = runCodex(issue, prompt);
  const ok = result.status === 0;
  const logs = [result.stdout, result.stderr].filter(Boolean).join("\n").slice(-6000);

  state.processedIssues[String(issue.number)] = {
    status: ok ? "completed" : "failed",
    updatedAt: new Date().toISOString(),
  };
  saveState(state);

  if (!ok) {
    commentIssue(
      issue.number,
      [
        "Runner local CODEX falhou.",
        "",
        "Ultimos logs:",
        "```",
        logs,
        "```",
      ].join("\n"),
    );
    return;
  }

  commentIssue(
    issue.number,
    [
      "Runner local CODEX terminou a execucao.",
      "",
      "Confira o historico da conversa/commits/deploy para o resultado final.",
    ].join("\n"),
  );
}

function ensureTools() {
  for (const command of ["gh", "codex", "git"]) {
    const result = run(command, ["--version"]);

    if (result.status !== 0) {
      throw new Error(`Comando obrigatorio indisponivel: ${command}`);
    }
  }
}

async function main() {
  ensureTools();

  do {
    const state = loadState();
    const issues = listPendingIssues(state);

    if (issues.length === 0) {
      console.log(`Nenhum pedido CODEX pendente. Proxima checagem em ${POLL_SECONDS}s.`);
    }

    for (const issue of issues) {
      processIssue(issue, state);
    }

    if (RUN_ONCE) {
      break;
    }

    await new Promise((resolveTimeout) => setTimeout(resolveTimeout, POLL_SECONDS * 1000));
  } while (true);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
