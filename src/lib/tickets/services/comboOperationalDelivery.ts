import "server-only";

import { getOrCreateOpenConversation, updateConversationAfterMessage } from "@/lib/tickets/services/conversations";
import { saveWhatsAppMessage } from "@/lib/tickets/services/messages";
import { buildWhatsAppOutboundMetadata } from "@/lib/tickets/services/outboundMessages";
import {
  claimWhatsAppOutboundDelivery,
  getWhatsAppOutboundDeliveryByIdempotencyKey,
  markWhatsAppOutboundDeliveryFailed,
  markWhatsAppOutboundDeliverySent,
  type WhatsAppOutboundDelivery,
} from "@/lib/tickets/services/whatsappOutboundDeliveries";
import { sendZapiText } from "@/lib/zapi/client";

const operationalKeys = (redemptionId: string) => [
  `combo-gate-arrival:${redemptionId}:text:v1`,
  `combo-delivery-choice:${redemptionId}:prompt:v1`,
  `combo-awaiting-preparation:${redemptionId}:text:v1`,
];

function text(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value : null;
}

function buildMessage(delivery: WhatsAppOutboundDelivery): string | null {
  const context = delivery.business_context;
  const code = text(context.redemption_code);
  const offer = text(context.offer_name);
  const quantity = Number(context.quantity);
  if (delivery.reason === "offer_preparation_started_on_arrival") {
    if (!code || !offer || !Number.isInteger(quantity) || quantity <= 0) return null;
    return [
      "*PEDIDO EM PREPARO*", "", `Pedido: ${code}`, `Oferta: ${offer}`,
      `Quantidade: ${quantity}`, "",
      "Seu pedido ja esta sendo preparado.",
      "Em breve voce recebera uma mensagem avisando quando estiver disponivel para retirada.",
    ].join("\n");
  }
  if (delivery.reason === "combo_awaiting_preparation") {
    if (!code || !offer || !Number.isInteger(quantity) || quantity <= 0) return null;
    return [
      "*PEDIDO RECEBIDO*", "", `Pedido: ${code}`, `Item: ${offer}`,
      `Quantidade: ${quantity}`, "", "Seu pedido ainda nao esta em preparo.",
      "Em breve enviaremos uma mensagem avisando quando seus produtos estiverem disponiveis para retirada.",
    ].join("\n");
  }
  if (delivery.reason === "combo_delivery_choice_requested") {
    const placeLabel = text(context.place_label);
    if (!offer || !placeLabel || !text(context.place_code) || !delivery.conversation_id) return null;
    return [
      "*ENTREGA DE BEBIDA*", "", `*Produto:* ${offer}`, "",
      `Digite *OK* para receber na sua ${placeLabel}`,
      "Digite *1* para solicitar um garcom.", "",
      "Mantenha o QR Code vermelho aberto para apresentar na entrega.",
    ].join("\n");
  }
  return null;
}

export async function deliverComboOperationalNotification(redemptionId: string) {
  for (const key of operationalKeys(redemptionId)) {
    const found = await getWhatsAppOutboundDeliveryByIdempotencyKey(key);
    if (!found.ok) return { ok: false as const, reason: "database_error" as const };
    const delivery = found.delivery;
    if (!delivery || ["sent", "superseded", "dead_letter"].includes(delivery.status)) continue;
    const claim = await claimWhatsAppOutboundDelivery(delivery.id);
    if (!claim.ok) return { ok: false as const, reason: "database_error" as const };
    if (!claim.claimed) continue;
    const claimed = claim.delivery;
    const message = buildMessage(claimed);
    if (!message || !text(claimed.business_context.combo_redemption_id)
      || claimed.business_context.combo_redemption_id !== redemptionId) {
      await markWhatsAppOutboundDeliveryFailed({
        deliveryId: claimed.id, claimToken: claimed.claim_token,
        error: "combo_operational_context_invalid",
      });
      return { ok: true as const, sent: false as const, reason: "context_invalid" as const };
    }
    let conversationId = claimed.conversation_id;
    if (!conversationId) {
      const conversation = await getOrCreateOpenConversation({ customerId: claimed.customer_id });
      if (!conversation.ok) {
        await markWhatsAppOutboundDeliveryFailed({
          deliveryId: claimed.id, claimToken: claimed.claim_token,
          error: "combo_conversation_unavailable",
        });
        return { ok: true as const, sent: false as const, reason: "conversation_unavailable" as const };
      }
      conversationId = conversation.conversation.id;
    }
    // For the prompt, the claim transaction has already persisted conversation routing.
    const send = await sendZapiText({ phone: claimed.recipient_phone, message });
    const saved = await saveWhatsAppMessage({
      conversationId,
      customerId: claimed.customer_id,
      direction: "outbound",
      messageType: "text",
      body: message,
      providerMessageId: send.ok ? send.providerMessageId : null,
      rawMetadata: buildWhatsAppOutboundMetadata({
        sendResult: send,
        messageType: "text",
        reason: claimed.reason,
        businessContext: claimed.business_context,
      }),
    });
    if (!send.ok || !saved.ok) {
      await markWhatsAppOutboundDeliveryFailed({
        deliveryId: claimed.id, claimToken: claimed.claim_token,
        error: !send.ok ? send.error : saved.error?.code ?? "whatsapp_message_persist_failed",
      });
      return {
        ok: true as const, sent: false as const,
        reason: !send.ok ? "zapi_failed" as const : "message_persist_failed" as const,
      };
    }
    const marked = await markWhatsAppOutboundDeliverySent({
      deliveryId: claimed.id, claimToken: claimed.claim_token,
      providerMessageId: send.providerMessageId,
    });
    if (!marked.ok) return { ok: false as const, reason: "database_error" as const };
    await updateConversationAfterMessage({ conversationId });
    return { ok: true as const, sent: true as const };
  }
  return { ok: true as const, sent: false as const, reason: "delivery_in_progress" as const };
}
