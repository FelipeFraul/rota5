export type EffectiveVenue = {
  name: string;
  address?: string | null;
};

export function resolveEffectiveVenue<T extends EffectiveVenue>(
  sessionVenue: T | null | undefined,
  eventVenue: T | null | undefined,
) {
  return sessionVenue ?? eventVenue ?? null;
}
