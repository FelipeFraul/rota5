import "server-only";

import QRCode from "qrcode";

export async function generateTicketQrImage({
  ticketUrl,
  ticketCode,
}: {
  ticketUrl: string;
  ticketCode: string;
  eventTitle?: string;
}): Promise<{
  buffer: Buffer;
  mimeType: "image/png";
  filename: string;
}> {
  const buffer = await QRCode.toBuffer(ticketUrl, {
    errorCorrectionLevel: "M",
    margin: 2,
    scale: 8,
    type: "png",
  });

  return {
    buffer,
    mimeType: "image/png",
    filename: `ticket-${ticketCode}.png`,
  };
}

export function ticketQrImageToDataUrl(buffer: Buffer) {
  return `data:image/png;base64,${buffer.toString("base64")}`;
}
