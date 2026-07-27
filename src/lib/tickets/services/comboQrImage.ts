import "server-only";

import path from "path";
import QRCode from "qrcode";
import sharp from "sharp";

const COMBO_TEMPLATE_PATH = path.join(process.cwd(), "public", "ticket_sistema_combo.webp");
const BEBAS_FONT_PATH = path.join(process.cwd(), "public", "fonts", "BebasNeue-Regular.ttf");
const HANDJET_FONT_PATH = path.join(process.cwd(), "public", "fonts", "Handjet-Regular.ttf");
const COMBO_WIDTH = 969;
const COMBO_HEIGHT = 1371;
const QR_SIZE = 470;
const QR_LEFT = 250;
const QR_TOP = 315;
const QR_DARK_COLOR = "#390202";

function escapeSvg(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function clean(value: string | null | undefined) {
  const trimmed = (value ?? "").trim();
  return trimmed && trimmed !== "null" && trimmed !== "undefined" ? trimmed : "";
}

function truncate(value: string | null | undefined, maxLength: number) {
  return clean(value).slice(0, maxLength);
}

function uppercase(value: string | null | undefined) {
  return clean(value).toLocaleUpperCase("pt-BR");
}

function formatComboDateTime(startsAt: string | null | undefined, timezone?: string | null) {
  const date = new Date(startsAt ?? "");
  if (!Number.isFinite(date.getTime())) return "";

  const timeZone = timezone || "America/Sao_Paulo";
  const weekday = new Intl.DateTimeFormat("pt-BR", {
    weekday: "long",
    timeZone,
  }).format(date);
  const dayMonth = new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    timeZone,
  }).format(date);
  const time = new Intl.DateTimeFormat("pt-BR", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone,
  }).format(date);

  return `${weekday} ${dayMonth} - AS ${time}`.toLocaleUpperCase("pt-BR");
}

function compactItemLines(value: string | null | undefined) {
  const items = clean(value)
    .replace(/\\n/g, "\n")
    .replace(/\s*>\s*/g, "\n")
    .split(/\r?\n/)
    .map((line) => line.trim().replace(/^[-•]\s*/, ""))
    .filter(Boolean)
    .slice(0, 4);

  return uppercase(truncate(items.join(" - "), 46));
}

async function renderTextLine({
  text,
  font,
  fontfile,
  fontSize,
}: {
  text: string;
  font: "Bebas Neue" | "Handjet";
  fontfile: string;
  fontSize: number;
}) {
  const safeText = clean(text);
  if (!safeText) return null;

  return sharp({
    text: {
      text: `<span foreground="#ffffff">${escapeSvg(safeText)}</span>`,
      font: `${font} ${fontSize}`,
      fontfile,
      rgba: true,
      dpi: 72,
    },
  })
    .png()
    .toBuffer();
}

function lineComposite(input: Buffer | null, left: number, top: number) {
  if (!input) return null;
  return { input, left, top };
}

async function buildTextComposites({
  comboName,
  comboItems,
  eventTitle,
  startsAt,
  timezone,
  buyerName,
  redemptionCode,
  tableMapPlaceCode,
}: GenerateComboQrImageInput) {
  const combo = uppercase(truncate(comboName || "COMBO ROCKBAR", 25));
  const itemLine = compactItemLines(comboItems);
  const event = uppercase(truncate(eventTitle, 34));
  const dateTime = formatComboDateTime(startsAt, timezone);
  const buyer = uppercase(truncate(buyerName || "COMPRADOR", 35));
  const code = uppercase(redemptionCode);
  const mesa = tableMapPlaceCode ? `MESA - ${uppercase(tableMapPlaceCode)}` : null;
  const composites = [
    lineComposite(await renderTextLine({ text: combo, font: "Bebas Neue", fontfile: BEBAS_FONT_PATH, fontSize: 66 }), 94, 920),
    lineComposite(await renderTextLine({ text: itemLine, font: "Handjet", fontfile: HANDJET_FONT_PATH, fontSize: 34 }), 94, 990),
    lineComposite(await renderTextLine({ text: event, font: "Handjet", fontfile: HANDJET_FONT_PATH, fontSize: 36 }), 94, 1036),
    ...(dateTime
      ? [lineComposite(await renderTextLine({ text: dateTime, font: "Handjet", fontfile: HANDJET_FONT_PATH, fontSize: 35 }), 94, 1080)]
      : []),
    lineComposite(await renderTextLine({ text: buyer, font: "Bebas Neue", fontfile: BEBAS_FONT_PATH, fontSize: 47 }), 94, 1202),
    lineComposite(await renderTextLine({ text: code, font: "Handjet", fontfile: HANDJET_FONT_PATH, fontSize: 37 }), 94, 1254),
  ].filter((item): item is { input: Buffer; left: number; top: number } => Boolean(item));

  if (mesa) {
    const mesaComposite = lineComposite(
      await renderTextLine({ text: mesa, font: "Handjet", fontfile: HANDJET_FONT_PATH, fontSize: 37 }),
      94,
      1295,
    );
    if (mesaComposite) composites.push(mesaComposite);
  }

  return composites;
}

export type GenerateComboQrImageInput = {
  qrPayload: string;
  comboName?: string | null;
  comboItems?: string | null;
  eventTitle?: string | null;
  startsAt?: string | null;
  timezone?: string | null;
  buyerName?: string | null;
  redemptionCode: string;
  tableMapPlaceCode?: string | null;
};

export async function generateComboQrImageBuffer(input: GenerateComboQrImageInput): Promise<{
  buffer: Buffer;
  mimeType: "image/png";
  filename: string;
}> {
  const qrBuffer = await QRCode.toBuffer(input.qrPayload, {
    color: {
      dark: QR_DARK_COLOR,
      light: "#FFFFFF",
    },
    errorCorrectionLevel: "M",
    margin: 2,
    scale: 8,
    type: "png",
  });
  const resizedQr = await sharp(qrBuffer)
    .resize(QR_SIZE, QR_SIZE, { fit: "contain" })
    .png()
    .toBuffer();
  const textComposites = await buildTextComposites(input);
  const buffer = await sharp(COMBO_TEMPLATE_PATH)
    .resize(COMBO_WIDTH, COMBO_HEIGHT, { fit: "fill" })
    .composite([
      { input: resizedQr, left: QR_LEFT, top: QR_TOP },
      ...textComposites,
    ])
    .png()
    .toBuffer();

  return {
    buffer,
    mimeType: "image/png",
    filename: `combo-${input.redemptionCode}.png`,
  };
}

export function comboQrImageToDataUrl(buffer: Buffer) {
  return `data:image/png;base64,${buffer.toString("base64")}`;
}

export async function generateComboQrImage(input: GenerateComboQrImageInput) {
  const image = await generateComboQrImageBuffer(input);
  return comboQrImageToDataUrl(image.buffer);
}
