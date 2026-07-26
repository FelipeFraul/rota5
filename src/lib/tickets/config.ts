export const DEFAULT_COMBO_OFFER_DELAY_MINUTES = 10;

export function getComboOfferDelayMinutes() {
  const configured = Number(process.env.COMBO_OFFER_DELAY_MINUTES);

  return Number.isInteger(configured) && configured > 0
    ? configured
    : DEFAULT_COMBO_OFFER_DELAY_MINUTES;
}
