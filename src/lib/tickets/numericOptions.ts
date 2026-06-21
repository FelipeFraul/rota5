export type NumericPromptContext = {
  generationId: string;
  issuedAt: string;
  validOptions: number[];
  messageIds: string[];
};

export type DeliveryGuardContext = {
  generationId: string;
  startedAt: string;
};

const FORMAT_OPTION_LINE_PATTERN = /^\s*Digite\s+(\d+)\s+para\b/gimu;
const TICKET_OPTION_LINE_PATTERN = /^\s*Digite\s+(\d+)\s+\*/gimu;
const HELP_OPTION_LINE_PATTERN = /^\s*>\s*(\d+)\.\s+/gmu;

function collectMatches(text: string, pattern: RegExp, options: Set<number>) {
  for (const match of text.matchAll(pattern)) {
    const option = Number(match[1]);

    if (Number.isInteger(option) && option > 0) {
      options.add(option);
    }
  }
}

export function extractNumericOptions(text: string) {
  const options = new Set<number>();

  collectMatches(text, FORMAT_OPTION_LINE_PATTERN, options);
  collectMatches(text, TICKET_OPTION_LINE_PATTERN, options);
  collectMatches(text, HELP_OPTION_LINE_PATTERN, options);

  return [...options].sort((left, right) => left - right);
}

export function parseStrictNumericReply(text: string | null | undefined) {
  const trimmed = text?.trim() ?? "";

  return /^\d+$/u.test(trimmed) ? Number(trimmed) : null;
}

export function getDeliveryGuard(context: Record<string, unknown>) {
  const value = context.deliveryGuard;

  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }

  const guard = value as Partial<DeliveryGuardContext>;

  return typeof guard.generationId === "string" &&
    typeof guard.startedAt === "string"
    ? (guard as DeliveryGuardContext)
    : null;
}

export function getNumericPrompt(context: Record<string, unknown>) {
  const value = context.numericPrompt;

  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }

  const prompt = value as Partial<NumericPromptContext>;

  if (
    typeof prompt.generationId !== "string" ||
    typeof prompt.issuedAt !== "string" ||
    !Array.isArray(prompt.validOptions) ||
    !Array.isArray(prompt.messageIds)
  ) {
    return null;
  }

  return {
    generationId: prompt.generationId,
    issuedAt: prompt.issuedAt,
    validOptions: prompt.validOptions.filter(
      (option): option is number => Number.isInteger(option) && option > 0,
    ),
    messageIds: prompt.messageIds.filter(
      (messageId): messageId is string =>
        typeof messageId === "string" && messageId.length > 0,
    ),
  } satisfies NumericPromptContext;
}

export function getRetiredNumericMessageIds(context: Record<string, unknown>) {
  const value = context.retiredNumericMessageIds;

  if (!Array.isArray(value)) {
    return [];
  }

  return value.filter(
    (messageId): messageId is string =>
      typeof messageId === "string" && messageId.length > 0,
  );
}

export function withoutDeliveryMetadata(context: Record<string, unknown>) {
  const rest = { ...context };
  delete rest.deliveryGuard;
  delete rest.numericPrompt;

  return rest;
}

export function withoutDeliveryGuard(context: Record<string, unknown>) {
  const rest = { ...context };
  delete rest.deliveryGuard;

  return rest;
}
