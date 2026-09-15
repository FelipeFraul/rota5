import "server-only";

import { logError, logInfo } from "@/lib/logger";
import {
  deliverTicketsForOrder,
  requestTicketDeliveryPreferenceForOrder,
} from "@/lib/tickets/services/ticketDelivery";
import {
  getPaidTicketDeliveryQueueCounts,
  listDuePaidTicketDeliveryOrders,
} from "@/lib/tickets/services/whatsappOutboundDeliveries";

export async function processDuePaidTicketDeliveries({
  limit = 20,
}: {
  limit?: number;
} = {}) {
  const dueResult = await listDuePaidTicketDeliveryOrders({ limit });
  if (!dueResult.ok) {
    throw dueResult.error;
  }

  let delivered = 0;
  let deferred = 0;
  let failed = 0;

  for (const order of dueResult.orders) {
    try {
      const result =
        order.delivery_mode === "full"
          ? await deliverTicketsForOrder(order.order_id)
          : await requestTicketDeliveryPreferenceForOrder(order.order_id);

      if (result.ok && result.sent) {
        delivered += 1;
      } else if (
        result.ok &&
        !result.sent &&
        result.reason === "delivery_in_progress"
      ) {
        deferred += 1;
      } else {
        failed += 1;
        logError("Paid ticket delivery worker did not complete order", {
          orderId: order.order_id,
          deliveryMode: order.delivery_mode,
          reason: result.reason,
        });
      }
    } catch (error) {
      failed += 1;
      logError("Paid ticket delivery worker failed order", {
        orderId: order.order_id,
        deliveryMode: order.delivery_mode,
        error,
      });
    }
  }

  const countsResult = await getPaidTicketDeliveryQueueCounts();
  if (!countsResult.ok) {
    throw countsResult.error;
  }

  const result = {
    selected: dueResult.orders.length,
    delivered,
    deferred,
    failed,
    queue: countsResult.counts,
  };

  logInfo("Processed durable paid ticket delivery queue", result);
  return result;
}
