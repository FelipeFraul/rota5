import type { WhatsAppMessageBatchMessage } from "@/lib/tickets/services/whatsappMessageBatches";

export function buildAggregatedWhatsAppText(messages: WhatsAppMessageBatchMessage[]) {
  return messages
    .map((message) => message.body?.trim())
    .filter((body): body is string => Boolean(body))
    .join(". ")
    .replace(/\s+\./g, ".")
    .replace(/\.{2,}/g, ".")
    .trim();
}
