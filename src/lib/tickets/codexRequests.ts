import { normalizeWhatsAppPhone } from "@/lib/tickets/phones";

const DEFAULT_CODEX_REQUEST_PHONES = ["15997503836"];
const CODEX_COMMAND_PATTERN = /^codex(?:\s*[:\-]|\s+)([\s\S]*)$/i;
export const CODEX_AUTH_REDACTED_BODY = "[CODEX_AUTH_REDACTED]";
export const CODEX_APPROVED_PREFIX = "CODEX APROVADO:";

export type CodexRequestContext = {
  previousState?: string;
  previousStep?: string;
  pendingPrompt?: string | null;
  requestedAt?: string;
};

function getAllowedCodexPhones() {
  const configuredPhones =
    process.env.CODEX_WHATSAPP_PHONES?.split(",") ?? DEFAULT_CODEX_REQUEST_PHONES;

  return configuredPhones
    .map((phone) => normalizeWhatsAppPhone(phone))
    .filter((phone): phone is string => Boolean(phone));
}

export function isAllowedCodexRequestPhone(phone: string | null | undefined) {
  const normalizedPhone = normalizeWhatsAppPhone(phone);

  return Boolean(
    normalizedPhone &&
      getAllowedCodexPhones().some((allowedPhone) => allowedPhone === normalizedPhone),
  );
}

export function parseCodexRequestCommand(text: string | null | undefined) {
  const trimmedText = text?.trim();

  if (!trimmedText) {
    return null;
  }

  if (/^codex$/i.test(trimmedText)) {
    return {
      prompt: "",
      isEmpty: true,
    };
  }

  const match = trimmedText.match(CODEX_COMMAND_PATTERN);

  if (!match) {
    return null;
  }

  const prompt = match[1]?.trim() ?? "";

  return {
    prompt,
    isEmpty: prompt.length === 0,
  };
}

export function isCodexRequestAuthPending(context: Record<string, unknown>) {
  return context.state === "codex_request_auth_pending";
}

export function isCodexRequestCollecting(context: Record<string, unknown>) {
  return context.state === "codex_request_collecting";
}

export function getCodexRequestContext(context: Record<string, unknown>) {
  const codexRequest = context.codexRequest;

  return codexRequest && typeof codexRequest === "object" && !Array.isArray(codexRequest)
    ? (codexRequest as CodexRequestContext)
    : {};
}

export function withCodexRequestAuthPending({
  context,
  pendingPrompt,
}: {
  context: Record<string, unknown>;
  pendingPrompt: string | null;
}) {
  return {
    ...context,
    state: "codex_request_auth_pending",
    step: "codex_request_auth_pending",
    codexRequest: {
      previousState: typeof context.state === "string" ? context.state : "idle",
      previousStep: typeof context.step === "string" ? context.step : "idle",
      pendingPrompt,
      requestedAt: new Date().toISOString(),
    } satisfies CodexRequestContext,
    updatedAt: new Date().toISOString(),
  };
}

export function withCodexRequestCollecting(context: Record<string, unknown>) {
  const codexRequest = getCodexRequestContext(context);

  return {
    ...context,
    state: "codex_request_collecting",
    step: "codex_request_collecting",
    codexRequest: {
      ...codexRequest,
      pendingPrompt: null,
    } satisfies CodexRequestContext,
    updatedAt: new Date().toISOString(),
  };
}

export function clearCodexRequestContext(context: Record<string, unknown>) {
  const codexRequest = getCodexRequestContext(context);
  const rest = { ...context };
  delete rest.codexRequest;

  return {
    ...rest,
    state: codexRequest.previousState ?? "idle",
    step: codexRequest.previousStep ?? "idle",
    updatedAt: new Date().toISOString(),
  };
}

export function buildCodexAuthPrompt() {
  return "Envie a palavra-chave do admin para liberar este pedido CODEX.";
}

export function buildCodexAuthInvalidReply() {
  return "Palavra-chave inválida. Envie CODEX novamente para recomeçar.";
}

export function buildCodexCollectPrompt() {
  return "Palavra-chave confirmada. Agora envie o pedido que você quer aplicar no sistema.";
}

export function buildApprovedCodexRequestBody(prompt: string) {
  return `${CODEX_APPROVED_PREFIX} ${prompt.trim()}`;
}

export function getDeploymentReference() {
  const deploymentUrl = process.env.VERCEL_URL
    ? `https://${process.env.VERCEL_URL}`
    : process.env.APP_BASE_URL;
  const commitSha = process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 8);

  return {
    deploymentUrl,
    commitSha,
  };
}

export function formatDeploymentReference() {
  const { deploymentUrl, commitSha } = getDeploymentReference();

  return [
    deploymentUrl ? `Deploy atual: ${deploymentUrl}` : null,
    commitSha ? `Commit atual: ${commitSha}` : null,
  ].filter(Boolean);
}

export function buildCodexGitHubIssueTitle(requestId: string) {
  return `CODEX WhatsApp #${requestId}`;
}

export function buildCodexGitHubIssueBody({
  requestId,
  prompt,
  phoneLast4,
}: {
  requestId: string;
  prompt: string;
  phoneLast4: string;
}) {
  const { deploymentUrl, commitSha } = getDeploymentReference();

  return [
    "Pedido recebido pelo WhatsApp e autenticado com palavra-chave do admin.",
    "",
    `Pedido: #${requestId}`,
    `Telefone: final ${phoneLast4}`,
    deploymentUrl ? `Deploy atual: ${deploymentUrl}` : null,
    commitSha ? `Commit atual: ${commitSha}` : null,
    "",
    "Solicitacao:",
    "",
    prompt.trim() || "(pedido vazio)",
    "",
    "Fluxo seguro:",
    "- Analisar o pedido",
    "- Alterar em branch/commit",
    "- Rodar validações",
    "- Fazer deploy somente depois de revisão/aprovação",
  ]
    .filter((line): line is string => line !== null)
    .join("\n");
}

export function buildCodexRequestAck({
  requestId,
  isEmpty,
  issueUrl,
  issueCreationFailed,
}: {
  requestId: string;
  isEmpty: boolean;
  issueUrl?: string | null;
  issueCreationFailed?: boolean;
}) {
  if (isEmpty) {
    return [
      "Comando CODEX recebido, mas faltou escrever o pedido.",
      "",
      'Use assim: CODEX: trocar o texto "A" por "B".',
    ].join("\n");
  }

  return [
    `Pedido CODEX recebido #${requestId}.`,
    issueUrl
      ? `Tarefa criada no GitHub: ${issueUrl}`
      : "Vou analisar aqui no VSCode antes de alterar qualquer coisa.",
    ...formatDeploymentReference(),
    ...(issueCreationFailed
      ? [
          "Atenção: não consegui criar a tarefa no GitHub. Verifique a configuração do token.",
        ]
      : []),
    "",
    "Nada foi mudado automaticamente no sistema.",
  ].join("\n");
}
