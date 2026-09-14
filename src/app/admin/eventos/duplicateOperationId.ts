export function createDuplicateOperationIdStore(
  createOperationId: () => string = () => crypto.randomUUID(),
) {
  const pendingByEventId = new Map<string, string>();

  return {
    getOrCreate(eventId: string) {
      const pending = pendingByEventId.get(eventId);
      if (pending) return pending;

      const operationId = createOperationId();
      pendingByEventId.set(eventId, operationId);
      return operationId;
    },

    conclude(eventId: string, operationId: string) {
      if (pendingByEventId.get(eventId) === operationId) {
        pendingByEventId.delete(eventId);
      }
    },
  };
}

export type DuplicateOperationIdStore = ReturnType<typeof createDuplicateOperationIdStore>;

const CONCLUSIVE_PRE_MUTATION_STATUSES = new Set([400, 401, 403, 404]);

export function shouldConcludeDuplicateOperation(status: number, dataOk: boolean) {
  if (status >= 200 && status < 300 && dataOk) return true;

  // The duplicate POST returns these statuses before calling duplicateAdminEvent:
  // invalid idempotency key, unauthenticated session, CSRF/ownership denial, or
  // source event unavailable. Every other failure remains ambiguous for retry.
  return CONCLUSIVE_PRE_MUTATION_STATUSES.has(status);
}

export type DuplicateOperationOutcome<T> = {
  value: T;
  conclude: boolean;
};

export async function runDuplicateOperation<T>(
  store: DuplicateOperationIdStore,
  eventId: string,
  request: (operationId: string) => Promise<DuplicateOperationOutcome<T>>,
) {
  const operationId = store.getOrCreate(eventId);
  const outcome = await request(operationId);
  if (outcome.conclude) store.conclude(eventId, operationId);
  return outcome.value;
}
