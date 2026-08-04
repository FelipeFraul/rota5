export const ROTA5_PRESENTATION_INDIVIDUAL_TICKETS_ONLY = true;
export const ROTA5_PRESENTATION_TABLE_MAP_ENABLED = false;
export const ROTA5_PRESENTATION_COURTESY_ENABLED = false;

export function isRota5PresentationTableLikeSectionName(name: string) {
  return /\b(?:mesa|mesas|bistr[oô]|bistro)\b/i.test(name);
}
