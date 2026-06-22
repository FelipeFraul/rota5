const PROTECTED_PART_PATTERN =
  /https?:\/\/\S+|`[^`\n]*`|\*\*[^*\n]+\*\*|(?<!\*)\*[^*\n]+\*(?!\*)/giu;
const UPPERCASE_RUN_PATTERN =
  /(?<![\p{L}\p{N}_])(?:[\p{Lu}\p{M}\d][\p{Lu}\p{M}\d%+&/ªº-]*)(?:[ \t]+[\p{Lu}\p{M}\d][\p{Lu}\p{M}\d%+&/ªº-]*)*(?![\p{L}\p{N}_])/gu;

function isUppercaseText(value: string) {
  const letters = value.match(/\p{L}/gu) ?? [];

  return (
    letters.length >= 2 &&
    letters.every((letter) => letter === letter.toLocaleUpperCase("pt-BR"))
  );
}

function protectParts(value: string) {
  const protectedParts: string[] = [];
  const text = value.replace(PROTECTED_PART_PATTERN, (part) => {
    const index = protectedParts.push(part) - 1;
    return `\uE000${index}\uE001`;
  });

  return {
    text,
    restore(formatted: string) {
      return formatted.replace(/\uE000(\d+)\uE001/gu, (_, index: string) => {
        return protectedParts[Number(index)] ?? "";
      });
    },
  };
}

function formatUnprotectedText(value: string) {
  return value
    .split(/(\r?\n)/u)
    .map((line) => {
      if (/^\r?\n$/u.test(line)) {
        return line;
      }

      if (isUppercaseText(line)) {
        return line.replace(/^(\s*)(.*?)(\s*)$/u, "$1*$2*$3");
      }

      return line.replace(UPPERCASE_RUN_PATTERN, (candidate) => {
        return isUppercaseText(candidate) ? `*${candidate}*` : candidate;
      });
    })
    .join("");
}

function isSystemActionLine(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return false;

  if (/^Digite\s+\d+\s+para\b/iu.test(trimmed)) return false;
  if (/^Digite\s+"/iu.test(trimmed)) return true;
  if (/"(?:Voltar|Cancelar|Sair|Confirmar|Sim|N[aã]o)"/iu.test(trimmed)) return true;
  if (/^Digite\s+(?:CONFIRMAR|CANCELAR|VOLTAR|SAIR|SIM|N(?:ÃO|AO))\b/iu.test(trimmed)) return true;
  if (/^Digite\s+[\p{Lu}\p{M}\s]{2,}\s+para\b/u.test(trimmed)) return true;
  if (/^Responda\b/iu.test(trimmed)) return true;

  return false;
}

export function formatSystemActionLines(value: string) {
  return value
    .split(/(\r?\n)/u)
    .map((part) => {
      if (/^\r?\n$/u.test(part) || !isSystemActionLine(part)) return part;

      const leading = part.match(/^\s*/u)?.[0] ?? "";
      const trailing = part.match(/\s*$/u)?.[0] ?? "";
      const content = part.trim().replace(/^\*{1,2}|\*{1,2}$/gu, "");

      return `${leading}**${content.toLocaleUpperCase("pt-BR")}**${trailing}`;
    })
    .join("");
}

/** Adds WhatsApp bold markers to uppercase text in every outbound message. */
export function formatWhatsAppUppercase(value: string) {
  const protectedValue = protectParts(value);

  return protectedValue.restore(formatUnprotectedText(protectedValue.text));
}
