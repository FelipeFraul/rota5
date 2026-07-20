import "server-only";

const TICKET_ORDER_REFERENCE_PREFIX = "ticket_order_";

export function buildOrderExternalReference(orderId: string) {
  return `${TICKET_ORDER_REFERENCE_PREFIX}${orderId}`;
}

export function extractOrderIdFromExternalReference(
  externalReference: string | null | undefined,
): string | null {
  if (!externalReference?.startsWith(TICKET_ORDER_REFERENCE_PREFIX)) {
    return null;
  }

  const orderId = externalReference.slice(TICKET_ORDER_REFERENCE_PREFIX.length);

  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    orderId,
  )
    ? orderId
    : null;
}

export function decimalAmountToCents(amount: number | string | null | undefined) {
  if (amount == null) {
    return null;
  }

  const value = typeof amount === "number" ? amount.toFixed(2) : amount.trim();
  const match = value.match(/^(\d+)(?:\.(\d{1,2}))?$/);

  if (!match) {
    return null;
  }

  const reais = Number(match[1]);
  const cents = Number((match[2] ?? "").padEnd(2, "0"));

  if (!Number.isSafeInteger(reais) || !Number.isSafeInteger(cents)) {
    return null;
  }

  return reais * 100 + cents;
}

export function centsToDecimalAmount(cents: number) {
  if (!Number.isSafeInteger(cents) || cents < 0) {
    return null;
  }

  return Number((cents / 100).toFixed(2));
}
