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
    normalized === "zero bala" ||
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
  const normalized = normalizePublicInitialText(text);

  return normalized === "zero bala" || normalized === "new";
}

export function isPublicInitialAllEventsCommand(text: string) {
  const normalized = normalizePublicInitialText(text);

  return normalized === "cambada" || normalized === "all" || normalized === "todos";
}

export function isPublicInitialNextEventCommand(text: string) {
  const normalized = normalizePublicInitialText(text);

  return normalized === "bailao" || normalized === "show";
}

export function isPublicInitialTicketResendCommand(text: string) {
  const normalized = normalizePublicInitialText(text);

  return (
    normalized === "again" ||
    normalized === "manda" ||
    normalized === "reenviar" ||
    normalized === "reenviar ingresso"
  );
}

export function isPublicInitialHelpCommand(text: string) {
  const normalized = normalizePublicInitialText(text);

  return normalized === "da uma mao" || normalized === "help" || normalized === "ajuda";
}

export function publicInitialHelpContext(
  baseContext: TicketConversationState,
): TicketConversationState {
  return {
    ...baseContext,
    publicInitialHelpSent: true,
  };
}
