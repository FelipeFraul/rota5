import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import sharp from "sharp";
import { generateTicketQrImage } from "../src/lib/tickets/services/ticketQrImage.ts";

const ticketQrImageSource = readFileSync(
  new URL("../src/lib/tickets/services/ticketQrImage.ts", import.meta.url),
  "utf8",
);

test("ticket QR image uses the Rota5 ticket_sistema template", async () => {
  assert.match(ticketQrImageSource, /public",\s*"ticket_sistema\.webp"/);
  assert.doesNotMatch(ticketQrImageSource, /<line\s+x1=/);
  assert.doesNotMatch(ticketQrImageSource, /stroke-width=/);

  const image = await generateTicketQrImage({
    ticketUrl: "https://rota5.vercel.app/tickets/test-token",
    ticketCode: "TCK-ROTA5",
    eventTitle: "Bailao Rota5",
    venueName: "Rota5",
    city: "Sorocaba",
    state: "SP",
    startsAt: "2026-08-15T23:00:00.000Z",
    holderName: "Comprador Teste",
  });
  const metadata = await sharp(image.buffer).metadata();

  assert.equal(metadata.width, 969);
  assert.equal(metadata.height, 1371);
  assert.equal(metadata.format, "png");
});
