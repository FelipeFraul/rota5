import { execFileSync, spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
const MAX_FILE_LIST_CHARS = 16_000;
const MAX_FILE_BYTES = 80_000;
const MAX_TOTAL_CONTEXT_BYTES = 280_000;
const PATCH_ATTEMPTS = 2;

const issueNumber = process.env.ISSUE_NUMBER;
const issueTitle = process.env.ISSUE_TITLE ?? "";
const issueBody = process.env.ISSUE_BODY ?? "";
const repository = process.env.GITHUB_REPOSITORY;
const githubToken = process.env.GITHUB_TOKEN;
const openAiKey = process.env.OPENAI_API_KEY;
const model = process.env.OPENAI_CODEX_MODEL || "gpt-4.1";

function run(command, args, options = {}) {
  return execFileSync(command, args, {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
    ...options,
  }).trim();
}

function runResult(command, args, options = {}) {
  return spawnSync(command, args, {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
    ...options,
  });
}

function required(value, name) {
  if (!value) {
    throw new Error(`${name} is required`);
  }

  return value;
}

function comment(message) {
  required(issueNumber, "ISSUE_NUMBER");
  const result = runResult("gh", ["issue", "comment", issueNumber, "--body", message], {
    env: {
      ...process.env,
      GH_TOKEN: githubToken,
    },
  });

  if (result.status !== 0) {
    console.warn(result.stderr || result.stdout);
  }
}

function extractPrompt(body) {
  const markers = ["Solicitacao:", "Solicita\u00e7\u00e3o:"];
  const marker = markers.find((candidate) => body.includes(candidate));
  const markerIndex = marker ? body.indexOf(marker) : -1;

  if (markerIndex < 0) {
    return body.trim();
  }

  const afterMarker = body.slice(markerIndex + marker.length).trim();
  const endMarkerIndex = afterMarker.indexOf("\nFluxo seguro:");

  return (endMarkerIndex >= 0 ? afterMarker.slice(0, endMarkerIndex) : afterMarker)
    .trim()
    .replace(/^\n+|\n+$/g, "");
}

function listRepositoryFiles() {
  return run("git", ["ls-files"])
    .split(/\r?\n/)
    .filter(Boolean)
    .filter((file) => {
      if (file.startsWith(".next/")) return false;
      if (file.startsWith("node_modules/")) return false;
      if (file.endsWith(".png") || file.endsWith(".jpg") || file.endsWith(".jpeg")) {
        return false;
      }

      return true;
    });
}

function trimFileList(files) {
  let output = "";

  for (const file of files) {
    const nextOutput = `${output}${file}\n`;

    if (nextOutput.length > MAX_FILE_LIST_CHARS) {
      return output;
    }

    output = nextOutput;
  }

  return output;
}

function readContextFiles(files) {
  const chunks = [];
  let totalBytes = 0;

  for (const file of files) {
    if (!existsSync(file)) continue;

    const content = readFileSync(file, "utf8");
    const clippedContent =
      Buffer.byteLength(content, "utf8") > MAX_FILE_BYTES
        ? `${content.slice(0, MAX_FILE_BYTES)}\n\n[arquivo truncado]`
        : content;
    const nextChunk = `--- ${file}\n${clippedContent}\n`;
    totalBytes += Buffer.byteLength(nextChunk, "utf8");

    if (totalBytes > MAX_TOTAL_CONTEXT_BYTES) {
      chunks.push("[contexto truncado por tamanho]");
      break;
    }

    chunks.push(nextChunk);
  }

  return chunks.join("\n");
}

function extractTextFromOpenAIResponse(payload) {
  if (typeof payload.output_text === "string") {
    return payload.output_text.trim();
  }

  const parts = [];

  for (const item of payload.output ?? []) {
    for (const content of item.content ?? []) {
      if (typeof content.text === "string") {
        parts.push(content.text);
      }
    }
  }

  return parts.join("\n").trim();
}

async function askOpenAI({ system, user, maxOutputTokens = 8000 }) {
  required(openAiKey, "OPENAI_API_KEY");

  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${openAiKey.trim()}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      input: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
      max_output_tokens: maxOutputTokens,
    }),
  });

  const payload = await response.json().catch(() => null);

  if (!response.ok) {
    throw new Error(
      `OpenAI API failed (${response.status}): ${JSON.stringify(payload)}`,
    );
  }

  return extractTextFromOpenAIResponse(payload);
}

function stripCodeFence(text) {
  return text
    .replace(/^```(?:diff|patch)?\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();
}

function parseJsonObject(text) {
  const cleaned = stripCodeFence(text);
  const start = cleaned.indexOf("{");
  const end = cleaned.lastIndexOf("}");

  if (start < 0 || end < start) {
    throw new Error(`Model did not return JSON: ${text}`);
  }

  return JSON.parse(cleaned.slice(start, end + 1));
}

async function chooseFiles(prompt, files) {
  const text = await askOpenAI({
    system: [
      "Voce escolhe arquivos relevantes em um repositorio para implementar uma solicitacao.",
      "Responda somente JSON valido, sem markdown.",
      'Formato: {"files":["path/arquivo.ts"],"reason":"curto"}.',
      "Escolha no maximo 12 arquivos e prefira arquivos ja existentes.",
    ].join("\n"),
    user: [
      `Solicitacao:\n${prompt}`,
      "",
      "Arquivos do repositorio:",
      trimFileList(files),
    ].join("\n"),
    maxOutputTokens: 1200,
  });
  const parsed = parseJsonObject(text);
  const selected = Array.isArray(parsed.files) ? parsed.files : [];

  return selected
    .filter((file) => typeof file === "string")
    .filter((file) => files.includes(file))
    .slice(0, 12);
}

async function createPatch({ prompt, context, previousError = "" }) {
  const text = await askOpenAI({
    system: [
      "Voce e um agente de codigo senior trabalhando em um repo Next.js/TypeScript.",
      "Implemente apenas a solicitacao do usuario.",
      "Responda somente com um patch unified diff aplicavel por git apply.",
      "Nao use markdown, nao explique, nao inclua texto fora do diff.",
      "Nao altere arquivos desnecessarios.",
      "Se nao for possivel implementar com o contexto disponivel, retorne um patch que adicione comentario na Issue nao e aceitavel; em vez disso, tente o melhor ajuste seguro.",
    ].join("\n"),
    user: [
      `Solicitacao:\n${prompt}`,
      previousError ? `\nErro anterior ao aplicar/validar:\n${previousError}` : "",
      "",
      "Contexto de arquivos:",
      context,
    ].join("\n"),
    maxOutputTokens: 10_000,
  });

  return stripCodeFence(text);
}

function applyPatch(patch) {
  if (!patch.includes("diff --git") && !patch.includes("--- ")) {
    return {
      ok: false,
      error: "Resposta da IA nao parece um patch unified diff.",
    };
  }

  const result = runResult("git", ["apply", "--whitespace=fix", "-"], {
    input: patch,
  });

  return {
    ok: result.status === 0,
    error: [result.stderr, result.stdout].filter(Boolean).join("\n").trim(),
  };
}

function changedFiles() {
  return run("git", ["diff", "--name-only"])
    .split(/\r?\n/)
    .filter(Boolean);
}

function validate() {
  const commands = [
    ["npm", ["run", "typecheck"]],
    ["npm", ["run", "build"]],
  ];
  const logs = [];

  for (const [command, args] of commands) {
    const result = runResult(command, args);
    logs.push(`$ ${command} ${args.join(" ")}\n${result.stdout}\n${result.stderr}`);

    if (result.status !== 0) {
      return {
        ok: false,
        logs: logs.join("\n").slice(-12_000),
      };
    }
  }

  return {
    ok: true,
    logs: logs.join("\n").slice(-12_000),
  };
}

function createBranchName() {
  const suffix = String(issueNumber).replace(/[^0-9]/g, "") || Date.now().toString();
  return `codex/whatsapp-${suffix}`;
}

function configureGit() {
  run("git", ["config", "user.name", "black-house-codex-bot"]);
  run("git", ["config", "user.email", "black-house-codex-bot@users.noreply.github.com"]);
}

function summarizeDiff() {
  return run("git", ["diff", "--stat"]) || "Sem diff.";
}

function createPullRequest(branchName, prompt, validationLogs) {
  const diffSummary = summarizeDiff();

  run("git", ["add", "."]);
  run("git", ["commit", "-m", `Implement CODEX WhatsApp request #${issueNumber}`]);
  run("git", ["push", "--set-upstream", "origin", branchName], {
    env: {
      ...process.env,
      GITHUB_TOKEN: githubToken,
    },
  });

  const body = [
    `Implementa o pedido CODEX do WhatsApp vinculado a Issue #${issueNumber}.`,
    "",
    "Solicitacao:",
    "",
    prompt,
    "",
    "Resumo do diff:",
    "",
    "```",
    diffSummary,
    "```",
    "",
    "Validacao:",
    "",
    "```",
    validationLogs.slice(-4000),
    "```",
  ].join("\n");

  return run(
    "gh",
    [
      "pr",
      "create",
      "--title",
      `CODEX WhatsApp #${issueNumber}`,
      "--body",
      body,
      "--base",
      "main",
      "--head",
      branchName,
    ],
    {
      env: {
        ...process.env,
        GH_TOKEN: githubToken,
      },
    },
  );
}

async function main() {
  required(issueNumber, "ISSUE_NUMBER");
  required(repository, "GITHUB_REPOSITORY");
  required(githubToken, "GITHUB_TOKEN");

  if (!issueTitle.startsWith("CODEX WhatsApp #")) {
    console.log("Issue ignored because title is not a CODEX WhatsApp request.");
    return;
  }

  if (!openAiKey) {
    comment(
      [
        "Automacao CODEX pausada: falta configurar o secret `OPENAI_API_KEY` no repositorio.",
        "",
        "Depois de adicionar esse secret em GitHub > Settings > Secrets and variables > Actions, reabra/crie um novo pedido CODEX.",
      ].join("\n"),
    );
    return;
  }

  const prompt = extractPrompt(issueBody);

  if (!prompt) {
    comment("Automacao CODEX pausada: nao encontrei a solicitacao no corpo da Issue.");
    return;
  }

  comment("Automacao CODEX iniciada. Vou tentar gerar branch e PR com validacoes.");

  configureGit();
  const branchName = createBranchName();
  run("git", ["checkout", "-b", branchName]);

  const files = listRepositoryFiles();
  let selectedFiles = await chooseFiles(prompt, files);

  if (selectedFiles.length === 0) {
    selectedFiles = ["src/app/api/webhook/zapi/route.ts", "src/lib/tickets/router.ts"]
      .filter((file) => files.includes(file));
  }

  let contextFiles = [...new Set([...selectedFiles, "package.json", "src/lib/tickets/messages.ts"])]
    .filter((file) => files.includes(file));
  let context = readContextFiles(contextFiles);
  let lastError = "";

  for (let attempt = 1; attempt <= PATCH_ATTEMPTS; attempt += 1) {
    const patch = await createPatch({
      prompt,
      context,
      previousError: lastError,
    });
    const applyResult = applyPatch(patch);

    if (applyResult.ok) {
      break;
    }

    lastError = applyResult.error || "Falha desconhecida ao aplicar patch.";

    if (attempt === PATCH_ATTEMPTS) {
      comment(
        [
          "Automacao CODEX nao conseguiu aplicar o patch com seguranca.",
          "",
          "Erro:",
          "```",
          lastError.slice(-3000),
          "```",
        ].join("\n"),
      );
      process.exit(1);
    }
  }

  const filesChanged = changedFiles();

  if (filesChanged.length === 0) {
    comment("Automacao CODEX terminou sem alteracoes no codigo. Nenhum PR foi criado.");
    return;
  }

  contextFiles = [...new Set([...contextFiles, ...filesChanged])];
  context = readContextFiles(contextFiles);

  let validation = validate();

  if (!validation.ok) {
    const patch = await createPatch({
      prompt,
      context,
      previousError: validation.logs,
    });
    const applyResult = applyPatch(patch);

    if (applyResult.ok) {
      validation = validate();
    }
  }

  if (!validation.ok) {
    comment(
      [
        "Automacao CODEX gerou alteracoes, mas as validacoes falharam. Nao abri PR.",
        "",
        "Arquivos alterados:",
        filesChanged.map((file) => `- ${file}`).join("\n"),
        "",
        "Erro:",
        "```",
        validation.logs.slice(-5000),
        "```",
      ].join("\n"),
    );
    process.exit(1);
  }

  const prUrl = createPullRequest(branchName, prompt, validation.logs);

  comment(
    [
      "Automacao CODEX criou um PR para revisao:",
      prUrl,
      "",
      "Nada foi publicado em producao automaticamente.",
    ].join("\n"),
  );
}

main().catch((error) => {
  console.error(error);
  try {
    comment(
      [
        "Automacao CODEX falhou antes de criar PR.",
        "",
        "Erro:",
        "```",
        String(error?.stack || error).slice(-5000),
        "```",
      ].join("\n"),
    );
  } catch {
    // The original error is more useful than a secondary comment failure.
  }
  process.exit(1);
});
