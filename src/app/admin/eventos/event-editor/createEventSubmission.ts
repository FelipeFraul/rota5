export function createEventSubmissionController(
  createOperationId: () => string = () => crypto.randomUUID(),
) {
  const operationId = createOperationId();

  return {
    operationId,
    async run<T>(
      request: (operationId: string) => Promise<T>,
      onSettled: () => void,
    ) {
      try {
        return await request(operationId);
      } finally {
        onSettled();
      }
    },
  };
}

export type CreateEventSubmissionController = ReturnType<typeof createEventSubmissionController>;
