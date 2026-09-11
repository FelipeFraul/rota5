const WINDOWS_1252_SPECIAL_BYTES = new Map<string, number>([
  ["€", 0x80],
  ["‚", 0x82],
  ["ƒ", 0x83],
  ["„", 0x84],
  ["…", 0x85],
  ["†", 0x86],
  ["‡", 0x87],
  ["ˆ", 0x88],
  ["‰", 0x89],
  ["Š", 0x8a],
  ["‹", 0x8b],
  ["Œ", 0x8c],
  ["Ž", 0x8e],
  ["‘", 0x91],
  ["’", 0x92],
  ["“", 0x93],
  ["”", 0x94],
  ["•", 0x95],
  ["–", 0x96],
  ["—", 0x97],
  ["˜", 0x98],
  ["™", 0x99],
  ["š", 0x9a],
  ["›", 0x9b],
  ["œ", 0x9c],
  ["ž", 0x9e],
  ["Ÿ", 0x9f],
]);

const UTF8_DECODER = new TextDecoder("utf-8", { fatal: true });

function encodeWindows1252(value: string) {
  const bytes: number[] = [];

  for (const character of value) {
    const specialByte = WINDOWS_1252_SPECIAL_BYTES.get(character);
    if (specialByte !== undefined) {
      bytes.push(specialByte);
      continue;
    }

    const codePoint = character.codePointAt(0);
    if (codePoint === undefined || codePoint > 0xff) return null;
    bytes.push(codePoint);
  }

  return Uint8Array.from(bytes);
}

function decodeMojibakeLayer(value: string) {
  const bytes = encodeWindows1252(value);
  if (!bytes) return value;

  try {
    return UTF8_DECODER.decode(bytes);
  } catch {
    return value;
  }
}

function mojibakeMarkerCount(value: string) {
  return value.match(/[ÃÂâðïƒÅ�]|[\u0080-\u009f]/g)?.length ?? 0;
}

function repairMojibakeToken(value: string) {
  const originalMarkerCount = mojibakeMarkerCount(value);
  if (originalMarkerCount === 0) return value;

  let repaired = value;

  for (let layer = 0; layer < 3; layer += 1) {
    const decoded = decodeMojibakeLayer(repaired);
    if (decoded === repaired) break;
    repaired = decoded;
  }

  return mojibakeMarkerCount(repaired) === 0 ? repaired : value;
}

function normalizeLine(value: string) {
  return value
    .replace(/\u00a0/g, " ")
    .replace(/[\u2018\u2019\u201a\u201b]/g, "'")
    .replace(/[\u201c\u201d\u201e\u201f]/g, '"')
    .replace(/[\u2010-\u2015]/g, "-")
    .replace(/\u2026/g, "...")
    .replace(/\u00d7/g, "x")
    // Preserve Portuguese diacritics (á, ç, ã, etc.) for WhatsApp output.
    // Remove only control characters outside tabs and printable Unicode text.
    .replace(/[^\x09\x20-\x7e\u00a0-\u00ff]/g, "")
    .replace(/[ \t]+/g, " ")
    .trimEnd();
}

export function sanitizeWhatsAppText(value: string) {
  return value
    .split(/(\s+)/)
    .map((part) => (part.trim() ? repairMojibakeToken(part) : part))
    .join("")
    .replace(/[\u0080-\u009f]/g, "")
    .replace(/\uFFFD/g, "")
    .split(/\r?\n/)
    .map((line) => normalizeLine(line))
    .join("\n")
    .trim();
}
