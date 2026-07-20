import type { TicketConversationState } from "@/lib/tickets/conversationState";

function normalizePublicInitialText(value: string) {
  return value
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/\s+/g, " ");
}

export function isPublicInitialExitCommand(text: string) {
  const normalized = normalizePublicInitialText(text);

  return (
    normalized === "sair" ||
    normalized === "cancela" ||
    normalized === "cancelar" ||
    normalized === "apagar" ||
    normalized === "encerrar" ||
    normalized === "logout"
  );
}

export function isPublicInitialAllEventsCommand(text: string) {
  const normalized = normalizePublicInitialText(text);

  return normalized === "todos";
}

export function isPublicInitialTicketResendCommand(text: string) {
  const normalized = normalizePublicInitialText(text);

  return normalized === "reenviar ingresso";
}

export function isPublicInitialHelpCommand(text: string) {
  const normalized = normalizePublicInitialText(text);

  return normalized === "ajuda";
}

export function publicInitialHelpContext(
  baseContext: TicketConversationState,
): TicketConversationState {
  return {
    ...baseContext,
    publicInitialHelpSent: true,
  };
}
