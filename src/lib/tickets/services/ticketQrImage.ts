import "server-only";

import path from "path";
import QRCode from "qrcode";
import sharp from "sharp";

const TICKET_TEMPLATE_PATH = path.join(process.cwd(), "public", "ticket_sistema.webp");
const BEBAS_FONT_PATH = path.join(process.cwd(), "public", "fonts", "BebasNeue-Regular.ttf");
const HANDJET_FONT_PATH = path.join(process.cwd(), "public", "fonts", "Handjet-Regular.ttf");
const TICKET_WIDTH = 969;
const TICKET_HEIGHT = 1371;
const QR_SIZE = 430;
const QR_LEFT = 270;
const QR_TOP = 322;

function escapeSvg(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function truncate(value: string | null | undefined, maxLength: number) {
  return (value ?? "").trim().slice(0, maxLength);
}

function uppercase(value: string | null | undefined) {
  return (value ?? "").trim().toLocaleUpperCase("pt-BR");
}

function formatTicketDateTime(startsAt: string) {
  const date = new Date(startsAt);
  if (!Number.isFinite(date.getTime())) return "DATA A CONFIRMAR";

  const weekday = new Intl.DateTimeFormat("pt-BR", {
    weekday: "long",
    timeZone: "America/Sao_Paulo",
  }).format(date);
  const dayMonth = new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    timeZone: "America/Sao_Paulo",
  }).format(date);
  const time = new Intl.DateTimeFormat("pt-BR", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: "America/Sao_Paulo",
  }).format(date);

  return `${weekday} ${dayMonth} - às ${time}`.toLocaleUpperCase("pt-BR");
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
  return sharp({
    text: {
      text: `<span foreground="#ffffff">${escapeSvg(text)}</span>`,
      font: `${font} ${fontSize}`,
      fontfile,
      rgba: true,
      dpi: 72,
    },
  })
    .png()
    .toBuffer();
}

function lineComposite(input: Buffer, left: number, top: number) {
  return { input, left, top };
}

async function buildTextComposites({
  eventTitle,
  venueName,
  city,
  state,
  startsAt,
  holderName,
  ticketCode,
  tableMapPlaceCode,
}: {
  eventTitle?: string;
  venueName?: string | null;
  city?: string;
  state?: string;
  startsAt: string;
  holderName?: string | null;
  ticketCode: string;
  tableMapPlaceCode?: string | null;
}) {
  const event = uppercase(truncate(eventTitle, 25));
  const venue = uppercase(venueName || "ROCKBAR PUB");
  const cityStateText = city && state ? `${city}/${state}` : (city ?? state ?? "");
  const cityState = uppercase(cityStateText);
  const dateTime = formatTicketDateTime(startsAt);
  const holder = uppercase(truncate(holderName || "INGRESSO ROCKBAR", 35));
  const code = uppercase(ticketCode);
  const mesa = tableMapPlaceCode ? `MESA - ${uppercase(tableMapPlaceCode)}` : null;
  const composites = [
    lineComposite(await renderTextLine({ text: event, font: "Bebas Neue", fontfile: BEBAS_FONT_PATH, fontSize: 70 }), 94, 930),
    lineComposite(await renderTextLine({ text: venue, font: "Handjet", fontfile: HANDJET_FONT_PATH, fontSize: 39 }), 94, 1008),
    lineComposite(await renderTextLine({ text: cityState, font: "Handjet", fontfile: HANDJET_FONT_PATH, fontSize: 39 }), 94, 1048),
    lineComposite(await renderTextLine({ text: dateTime, font: "Handjet", fontfile: HANDJET_FONT_PATH, fontSize: 37 }), 94, 1090),
    {
      input: Buffer.from(`<svg width="${TICKET_WIDTH}" height="${TICKET_HEIGHT}" viewBox="0 0 ${TICKET_WIDTH} ${TICKET_HEIGHT}" xmlns="http://www.w3.org/2000/svg"><line x1="94" y1="1155" x2="714" y2="1155" stroke="#ffffff" stroke-width="5" /></svg>`),
      left: 0,
      top: 0,
    },
    lineComposite(await renderTextLine({ text: holder, font: "Bebas Neue", fontfile: BEBAS_FONT_PATH, fontSize: 47 }), 94, 1181),
    lineComposite(await renderTextLine({ text: code, font: "Handjet", fontfile: HANDJET_FONT_PATH, fontSize: 37 }), 94, 1235),
  ];

  if (mesa) {
    composites.push(
      lineComposite(await renderTextLine({ text: mesa, font: "Handjet", fontfile: HANDJET_FONT_PATH, fontSize: 37 }), 94, 1276),
    );
  }

  return composites;
}

export async function generateTicketQrImage({
  ticketUrl,
  ticketCode,
  eventTitle,
  venueName,
  city,
  state,
  startsAt,
  holderName,
  tableMapPlaceCode,
}: {
  ticketUrl: string;
  ticketCode: string;
  eventTitle?: string;
  venueName?: string | null;
  city?: string;
  state?: string;
  startsAt?: string;
  holderName?: string | null;
  tableMapPlaceCode?: string | null;
}): Promise<{
  buffer: Buffer;
  mimeType: "image/png";
  filename: string;
}> {
  const qrBuffer = await QRCode.toBuffer(ticketUrl, {
    color: {
      dark: "#000000",
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
  const textComposites = await buildTextComposites({
    eventTitle,
    venueName,
    city,
    state,
    startsAt: startsAt ?? "",
    holderName,
    ticketCode,
    tableMapPlaceCode,
  });
  const buffer = await sharp(TICKET_TEMPLATE_PATH)
    .resize(TICKET_WIDTH, TICKET_HEIGHT, { fit: "fill" })
    .composite([
      { input: resizedQr, left: QR_LEFT, top: QR_TOP },
      ...textComposites,
    ])
    .png()
    .toBuffer();

  return {
    buffer,
    mimeType: "image/png",
    filename: `ticket-${ticketCode}.png`,
  };
}

export function ticketQrImageToDataUrl(buffer: Buffer) {
  return `data:image/png;base64,${buffer.toString("base64")}`;
}
