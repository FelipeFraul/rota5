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
    normalized === "new" ||
    normalized === "sair" ||
    normalized === "cancela" ||
    normalized === "cancelar" ||
    normalized === "apagar" ||
    normalized === "encerrar" ||
    normalized === "logout"
  );
}

export function isPublicInitialNewCommand(text: string) {
  return normalizePublicInitialText(text) === "new";
}

export function isPublicInitialAllEventsCommand(text: string) {
  const normalized = normalizePublicInitialText(text);

  return normalized === "all" || normalized === "todos";
}

export function isPublicInitialNextEventCommand(text: string) {
  const normalized = normalizePublicInitialText(text);

  return normalized === "show";
}

export function isPublicInitialTicketResendCommand(text: string) {
  const normalized = normalizePublicInitialText(text);

  return (
    normalized === "again" ||
    normalized === "reenviar" ||
    normalized === "reenviar ingresso"
  );
}

export function isPublicInitialHelpCommand(text: string) {
  const normalized = normalizePublicInitialText(text);

  return normalized === "help" || normalized === "ajuda";
}

export function publicInitialHelpContext(
  baseContext: TicketConversationState,
): TicketConversationState {
  return {
    ...baseContext,
    publicInitialHelpSent: true,
  };
}
