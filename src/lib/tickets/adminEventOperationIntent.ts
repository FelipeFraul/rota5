import { randomUUID } from "node:crypto";

export type AdminEventOperationDraft = Record<string, unknown>;

export function ensureAdminEventOperationId(
  draft: AdminEventOperationDraft,
  createOperationId: () => string = randomUUID,
) {
  if (typeof draft.operationId === "string" && draft.operationId) return draft;
  return { ...draft, operationId: createOperationId() };
}

export function renewAdminEventOperationId(
  draft: AdminEventOperationDraft,
  createOperationId: () => string = randomUUID,
) {
  const renewed = { ...draft };
  delete renewed.operationId;
  delete renewed.pendingStatus;
  return { ...renewed, operationId: createOperationId() };
}

export async function runAdminEventOperationIntent<T extends { ok: boolean }>(
  draft: AdminEventOperationDraft,
  operation: (operationId: string) => Promise<T>,
) {
  if (typeof draft.operationId !== "string" || !draft.operationId) {
    return { status: "missing_operation_id" as const, draft };
  }

  try {
    const result = await operation(draft.operationId);
    if (!result.ok) return { status: "retry" as const, draft, result };
    return { status: "success" as const, result: result as Extract<T, { ok: true }> };
  } catch (error) {
    return { status: "retry" as const, draft, error };
  }
}
