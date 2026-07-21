import "server-only";

export type WhatsAppOutboundSendStatus = "sent" | "failed";

export type WhatsAppOutboundMessageType = "text" | "image";

type WhatsAppOutboundSendResult =
  | {
      ok: true;
      providerMessageId?: string | null;
    }
  | {
      ok: false;
      error: unknown;
    };

export type BuildWhatsAppOutboundMetadataInput = {
  sendResult: WhatsAppOutboundSendResult;
  messageType: WhatsAppOutboundMessageType;
  reason: string;
  businessContext?: Record<string, unknown>;
};

export function buildWhatsAppOutboundMetadata({
  sendResult,
  messageType,
  reason,
  businessContext = {},
}: BuildWhatsAppOutboundMetadataInput) {
  return {
    provider: "zapi",
    message_type: messageType,
    send_status: (sendResult.ok ? "sent" : "failed") satisfies WhatsAppOutboundSendStatus,
    reason,
    ...businessContext,
    ...(sendResult.ok ? {} : { error: sendResult.error }),
  };
}
