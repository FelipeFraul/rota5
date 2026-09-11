const SAO_PAULO_TIME_ZONE = "America/Sao_Paulo";

export function formatEventDate(startsAt: string) {
  const date = new Date(startsAt);
  const weekday = new Intl.DateTimeFormat("pt-BR", {
    timeZone: SAO_PAULO_TIME_ZONE,
    weekday: "long",
  }).format(date);
  const dayAndTime = new Intl.DateTimeFormat("pt-BR", {
    timeZone: SAO_PAULO_TIME_ZONE,
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  })
    .format(date)
    .replace(",", " às");

  return `${weekday.charAt(0).toLocaleUpperCase("pt-BR") + weekday.slice(1)} ${dayAndTime}`;
}

export function formatOptionLine(
  option: number | string,
  label: string,
  { preserveCase = false }: { preserveCase?: boolean } = {},
) {
  const normalizedLabel =
    preserveCase || label.length === 0
      ? label
      : label.charAt(0).toLocaleLowerCase("pt-BR") + label.slice(1);
  return `Digite *${option}* para ${normalizedLabel}`;
}

const LOWERCASE_NAME_PARTS = new Set([
  "a",
  "as",
  "com",
  "da",
  "das",
  "de",
  "do",
  "dos",
  "e",
  "em",
  "na",
  "nas",
  "no",
  "nos",
  "o",
  "os",
  "para",
  "por",
]);

function formatAnnouncementTitle(value: string) {
  return value.trim().toLocaleUpperCase("pt-BR");
}

function normalizeDisplayComparison(value: string) {
  return value
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim()
    .toLocaleUpperCase("pt-BR");
}

export function formatPublicEventTitle(title: string, artistName: string | null | undefined) {
  const trimmedTitle = title.trim();
  const trimmedArtist = artistName?.trim();

  if (!trimmedTitle) return formatAnnouncementTitle(trimmedArtist ?? "");
  if (!trimmedArtist) return formatAnnouncementTitle(trimmedTitle);

  const normalizedTitle = normalizeDisplayComparison(trimmedTitle);
  const normalizedArtist = normalizeDisplayComparison(trimmedArtist);

  if (normalizedTitle === normalizedArtist) {
    return formatAnnouncementTitle(trimmedArtist);
  }

  const escapedArtist = trimmedArtist
    .replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
    .replace(/\s+/g, "\\s+");
  const artistPrefix = new RegExp(
    `^${escapedArtist}\\s*(?:(?:-|:)\\s*|(?:em|apresenta)\\s+)`,
    "iu",
  );
  const showTitle = trimmedTitle.replace(artistPrefix, "").trim();

  return formatAnnouncementTitle(`${trimmedArtist} - ${showTitle || trimmedTitle}`);
}

export function formatPublicEventName(title: string) {
  return formatAnnouncementTitle(title.trim());
}

export function formatPublicArtistLine(
  artistName: string | null | undefined,
  artistIcon: string | null | undefined,
) {
  const trimmedArtist = artistName?.trim();

  if (!trimmedArtist) return null;

  const icon = artistIcon?.trim() || "🎤";
  return `${icon} *${formatAnnouncementTitle(trimmedArtist)}*`;
}

function capitalizeNamePart(value: string) {
  if (!value) return value;
  return value.charAt(0).toLocaleUpperCase("pt-BR") + value.slice(1);
}

export function formatProperName(value: string | null | undefined) {
  const trimmed = value?.trim();
  if (!trimmed) return "";

  return trimmed
    .toLocaleLowerCase("pt-BR")
    .split(/(\s+|-)/)
    .map((part, index) => {
      if (!part.trim() || part === "-") return part;
      if (index > 0 && LOWERCASE_NAME_PARTS.has(part)) return part;
      return part
        .split("/")
        .map((piece) => capitalizeNamePart(piece))
        .join("/");
    })
    .join("");
}

export function formatCityState(city: string, state: string) {
  return `${formatProperName(city)}/${state.trim().toLocaleUpperCase("pt-BR")}`;
}

export function formatEventLocation(input: {
  venueName?: string | null;
  city: string;
  state: string;
}) {
  const venueName = formatProperName(input.venueName);
  return venueName || formatCityState(input.city, input.state);
}
