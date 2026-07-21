import {
  buildInitialConversationState,
  type TicketConversationState,
  type TicketConversationStep,
} from "@/lib/tickets/conversationState";
import { TICKET_MESSAGES } from "@/lib/tickets/messages";
import { isPublicInitialExitCommand } from "@/lib/tickets/publicInitialFlow";
import {
  formatPublicHelpAnswer,
  formatPublicHelpPrompt,
  formatPublicHelpResults,
  getPublicHelpTopicById,
  isPublicHelpCommand,
  searchPublicHelpTopics,
} from "@/lib/tickets/services/publicHelp";

function normalizeHelpFlowText(value: string) {
  return value
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/\s+/g, " ");
}

export function publicHelpReturnContext(baseContext: TicketConversationState) {
  const returnState = baseContext.publicHelp?.returnState;
  const returnStep = baseContext.publicHelp?.returnStep ?? returnState;

  return {
    ...baseContext,
    step: returnStep ?? "idle",
    state: returnState ?? returnStep ?? "idle",
    publicHelp: undefined,
  };
}

export function isPublicHelpFlowState(state?: string) {
  return state === "help_topic_collecting" || state === "help_results";
}

export function hasEnoughHelpTerms(text: string) {
  return normalizeHelpFlowText(text)
    .split(" ")
    .filter((word) => word.length >= 2).length >= 2;
}

export function isPublicHelpBackIntent(text: string) {
  const normalized = normalizeHelpFlowText(text);

  return normalized === "voltar" || normalized === "volta";
}

export function buildPublicHelpCommandResponse({
  baseContext,
  text,
}: {
  baseContext: TicketConversationState;
  text: string;
}) {
  if (!isPublicHelpCommand(text)) {
    return null;
  }

  return {
    reply: formatPublicHelpPrompt(),
    nextContext: {
      ...baseContext,
      step: "help_topic_collecting" as const,
      state: "help_topic_collecting" as const,
      publicHelp: {
        returnStep: isPublicHelpFlowState(baseContext.state) ? baseContext.publicHelp?.returnStep : baseContext.step,
        returnState: isPublicHelpFlowState(baseContext.state) ? baseContext.publicHelp?.returnState : baseContext.state,
      },
    },
  };
}

export function buildPublicHelpSearchResponse({
  baseContext,
  query,
  page = 0,
  returnStep,
  returnState,
}: {
  baseContext: TicketConversationState;
  query: string;
  page?: number;
  returnStep?: TicketConversationStep;
  returnState?: TicketConversationStep;
}) {
  if (!hasEnoughHelpTerms(query)) {
    return {
      reply: [
        formatPublicHelpPrompt(),
        "",
        "Exemplos:",
        "> pagamento pix",
        "> qr invalido",
        "> reserva expirada",
      ].join("\n"),
      nextContext: {
        ...baseContext,
        step: "help_topic_collecting" as const,
        state: "help_topic_collecting" as const,
        publicHelp: {
          returnStep: returnStep ?? baseContext.publicHelp?.returnStep ?? baseContext.step,
          returnState: returnState ?? baseContext.publicHelp?.returnState ?? baseContext.state,
        },
      },
    };
  }

  const searchResult = searchPublicHelpTopics(query, page);
  const nextHelpState: TicketConversationStep = searchResult.results.length > 0
    ? "help_results"
    : "help_topic_collecting";

  return {
    reply: formatPublicHelpResults(searchResult),
    suppressTitle: true,
    nextContext: {
      ...baseContext,
      step: nextHelpState,
      state: nextHelpState,
      publicHelp: {
        query,
        hasMore: searchResult.hasMore,
        page: searchResult.page,
        returnStep: returnStep ?? baseContext.publicHelp?.returnStep ?? baseContext.step,
        returnState: returnState ?? baseContext.publicHelp?.returnState ?? baseContext.state,
        lastResults: searchResult.results.map((result) => ({
          option: result.option,
          id: result.id,
          question: result.question,
        })),
      },
    },
  };
}

export function buildPublicHelpSelectedTopicResponse({
  baseContext,
  text,
}: {
  baseContext: TicketConversationState;
  text: string;
}) {
  const selectedOption = text.trim().match(/^\d+$/) ? Number(text.trim()) : null;
  const selected = selectedOption
    ? baseContext.publicHelp?.lastResults?.find(
        (result) => result.option === selectedOption,
      )
    : null;

  if (selected) {
    const topic = getPublicHelpTopicById(selected.id);

    if (topic) {
      return {
        reply: formatPublicHelpAnswer(topic),
        nextContext: baseContext,
      };
    }
  }

  return null;
}

export function buildPublicHelpMoreResultsResponse({
  baseContext,
  text,
}: {
  baseContext: TicketConversationState;
  text: string;
}) {
  const normalizedText = normalizeHelpFlowText(text);

  if (normalizedText !== "ver mais" && normalizedText !== "mais") {
    return null;
  }

  const previousQuery = baseContext.publicHelp?.query;

  if (!previousQuery) {
    return {
      reply: formatPublicHelpPrompt(),
      nextContext: {
        ...baseContext,
        step: "help_topic_collecting" as const,
        state: "help_topic_collecting" as const,
      },
    };
  }

  if (!baseContext.publicHelp?.hasMore) {
    return {
      reply:
        "NÃƒÂ£o encontrei outros tÃƒÂ³picos para essa pesquisa. Digite outras duas palavras para uma nova busca de ajuda ou *VOLTAR* para voltar onde estava.",
      nextContext: baseContext,
    };
  }

  return buildPublicHelpSearchResponse({
    baseContext,
    query: previousQuery,
    page: (baseContext.publicHelp.page ?? 0) + 1,
  });
}

export function buildPublicHelpResultsResponse({
  baseContext,
  text,
}: {
  baseContext: TicketConversationState;
  text: string;
}) {
  if (baseContext.state !== "help_results") {
    return null;
  }

  const moreResultsResponse = buildPublicHelpMoreResultsResponse({
    baseContext,
    text,
  });

  if (moreResultsResponse) {
    return moreResultsResponse;
  }

  const selectedTopicResponse = buildPublicHelpSelectedTopicResponse({
    baseContext,
    text,
  });

  if (selectedTopicResponse) {
    return selectedTopicResponse;
  }

  return null;
}

export function buildPublicHelpFallbackSearchResponse({
  baseContext,
  text,
}: {
  baseContext: TicketConversationState;
  text: string;
}) {
  return buildPublicHelpSearchResponse({
    baseContext,
    query: text,
  });
}

export function buildPublicHelpBackResponse({
  baseContext,
  text,
}: {
  baseContext: TicketConversationState;
  text: string;
}) {
  if (!isPublicHelpBackIntent(text)) {
    return null;
  }

  return {
    reply: "Voltando ao atendimento anterior.",
    nextContext: publicHelpReturnContext(baseContext),
  };
}

export function buildPublicHelpExitResponse({ text }: { text: string }) {
  if (!isPublicInitialExitCommand(text)) {
    return null;
  }

  return {
    reply: TICKET_MESSAGES.genericHelp,
    nextContext: buildInitialConversationState(),
  };
}
