export function normalizeWhatsAppPhone(phone: string | null | undefined) {
  const digits = phone?.replace(/\D/g, "") ?? "";

  if (!digits) return null;

  if (!digits.startsWith("55") && (digits.length === 10 || digits.length === 11)) {
    return `55${digits}`;
  }

  return digits;
}

export function buildWhatsAppPhoneCandidates(phone: string | null | undefined) {
  const normalized = normalizeWhatsAppPhone(phone);
  if (!normalized) return [];

  const candidates = new Set([normalized]);
  const digits = phone?.replace(/\D/g, "") ?? "";

  if (digits && digits !== normalized) {
    candidates.add(digits);
  }

  if (normalized.startsWith("55") && (normalized.length === 12 || normalized.length === 13)) {
    candidates.add(normalized.slice(2));
  }

  return [...candidates];
}
