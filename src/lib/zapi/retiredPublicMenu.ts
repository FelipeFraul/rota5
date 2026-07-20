import { sanitizeWhatsAppText } from "@/lib/zapi/textEncoding";

export const RETIRED_PUBLIC_MENU_REPLACEMENT = [
  "Olá, *bem-vindo(a) à Black House*, casa de Comédia de Sorocaba!",
  "Pesquise um evento por *nome, artista, data* ou...",
  "",
  '> Para ver todos os eventos, digite "TODOS"',
  '> Para reenviar ingresso pago, digite "REENVIAR INGRESSO"',
  '> Para receber ajuda a qualquer momento, digite "AJUDA"',
  '> Para voltar à página inicial e fazer uma nova pesquisa, digite "SAIR"',
].join("\n");

function normalizeRetiredPublicMenuCandidate(value: string) {
  return sanitizeWhatsAppText(value)
    .replace(/\*/g, "")
    .replace(/\r\n/g, "\n")
    .split("\n")
    .map((line) => line.replace(/[ \t]+/g, " ").trim().toLocaleLowerCase("pt-BR"))
    .filter(Boolean);
}

export function isRetiredPublicMenu(value: string) {
  const lines = normalizeRetiredPublicMenuCandidate(value);
  const body = lines.join("\n");

  return (
    body.includes("como posso ajudar?") &&
    lines.includes("1. ver eventos") &&
    lines.includes("2. comprar ingresso") &&
    lines.includes("3. ajuda com uma compra")
  );
}

export function replaceRetiredPublicMenu(value: string) {
  if (!isRetiredPublicMenu(value)) {
    return {
      replaced: false as const,
      message: value,
    };
  }

  return {
    replaced: true as const,
    message: RETIRED_PUBLIC_MENU_REPLACEMENT,
  };
}
