import "server-only";

import { logError, logInfo } from "@/lib/logger";
import { deliverComboOrder } from "@/lib/tickets/services/comboOffers";
import { deliverComboReadyNotification } from "@/lib/tickets/services/comboRedemptions";
import {
  getPaidComboDeliveryQueueCounts,
  listDuePaidComboDeliveryTasks,
} from "@/lib/tickets/services/whatsappOutboundDeliveries";

export async function processDuePaidComboDeliveries({
  limit = 20,
}: {
  limit?: number;
} = {}) {
  const due = await listDuePaidComboDeliveryTasks({ limit });
  if (!due.ok) throw due.error;

  let delivered = 0;
  let deferred = 0;
  let failed = 0;

  for (const task of due.tasks) {
    try {
      const result = task.delivery_kind === "paid"
        ? await deliverComboOrder(task.entity_id)
        : await deliverComboReadyNotification(task.entity_id);
      if (result.ok && result.sent) delivered += 1;
      else if (result.ok && !result.sent && result.reason === "delivery_in_progress") deferred += 1;
      else {
        failed += 1;
        logError("Paid combo delivery worker did not complete task", {
          entityId: task.entity_id,
          deliveryKind: task.delivery_kind,
          reason: result.reason,
        });
      }
    } catch (error) {
      failed += 1;
      logError("Paid combo delivery worker failed task", {
        entityId: task.entity_id,
        deliveryKind: task.delivery_kind,
        error,
      });
    }
  }

  const counts = await getPaidComboDeliveryQueueCounts();
  if (!counts.ok) throw counts.error;
  const result = { selected: due.tasks.length, delivered, deferred, failed, queue: counts.counts };
  logInfo("Processed durable paid combo delivery queue", result);
  return result;
}
