import { normalizeWhatsAppPhone } from "@/lib/tickets/phones";

const DEFAULT_CODEX_REQUEST_PHONES = ["15997503836"];
const CODEX_COMMAND_PATTERN = /^codex(?:\s*[:\-]|\s+)([\s\S]*)$/i;

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
  const match = text?.trim().match(CODEX_COMMAND_PATTERN);

  if (!match) {
    return null;
  }

  const prompt = match[1]?.trim() ?? "";

  return {
    prompt,
    isEmpty: prompt.length === 0,
  };
}

export function buildCodexRequestAck({
  requestId,
  isEmpty,
}: {
  requestId: string;
  isEmpty: boolean;
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
    "Vou analisar aqui no VSCode antes de alterar qualquer coisa.",
    "",
    "Nada foi mudado automaticamente no sistema.",
  ].join("\n");
}
