export const COMBO_OFFER_CRON_WINDOW_MINUTES = 1;

export function getMinimumComboOfferCustomOffsetMinutes() {
  return COMBO_OFFER_CRON_WINDOW_MINUTES;
}

export function normalizeComboOfferCustomOffsetMinutes(value: number) {
  const minutes = Number.isFinite(value) ? Math.trunc(value) : 0;

  return Math.max(getMinimumComboOfferCustomOffsetMinutes(), minutes);
}

export function formatComboOfferAfterPurchaseTiming(minutes: number) {
  const safeMinutes = normalizeComboOfferCustomOffsetMinutes(minutes);

  if (safeMinutes >= 1440 && safeMinutes % 1440 === 0) return `${safeMinutes / 1440}d apos compra`;
  if (safeMinutes >= 60 && safeMinutes % 60 === 0) return `${safeMinutes / 60}h apos compra`;
  return `${safeMinutes} min apos compra`;
}
