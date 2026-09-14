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

export async function runDuplicateOperation<T>(
  store: DuplicateOperationIdStore,
  eventId: string,
  request: (operationId: string) => Promise<T>,
) {
  const operationId = store.getOrCreate(eventId);
  const result = await request(operationId);
  store.conclude(eventId, operationId);
  return result;
}
