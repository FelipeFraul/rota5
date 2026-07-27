import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import sharp from "sharp";
import {
  generateComboQrImage,
  generateComboQrImageBuffer,
} from "../src/lib/tickets/services/comboQrImage.ts";

const comboOffersSource = readFileSync(
  new URL("../src/lib/tickets/services/comboOffers.ts", import.meta.url),
  "utf8",
);
const comboRedemptionsSource = readFileSync(
  new URL("../src/lib/tickets/services/comboRedemptions.ts", import.meta.url),
  "utf8",
);
const comboQrImageSource = readFileSync(
  new URL("../src/lib/tickets/services/comboQrImage.ts", import.meta.url),
  "utf8",
);

async function rawPixels(buffer) {
  const image = sharp(buffer);
  const metadata = await image.metadata();
  const raw = await image.removeAlpha().raw().toBuffer();
  return { metadata, raw };
}

test("combo QR image renders the complete combo template, not only a QR", async () => {
  const image = await generateComboQrImageBuffer({
    qrPayload: "combo:11111111-1111-4111-8111-111111111111:payloadTokenForTest123",
    comboName: "Combo Smirnoff",
    comboItems: "Vodka Smirnoff\nRed Bull\nGelo",
    eventTitle: "U2 Cover Rio",
    startsAt: "2026-08-01T23:00:00.000Z",
    timezone: "America/Sao_Paulo",
    buyerName: "Felipe Fraul",
    redemptionCode: "CMB-12345678",
    tableMapPlaceCode: "32",
  });
  const { metadata, raw } = await rawPixels(image.buffer);

  assert.equal(metadata.width, 969);
  assert.equal(metadata.height, 1371);
  assert.equal(metadata.format, "png");

  const templatePixelIndex = (100 * 969 + 100) * 3;
  const templatePixel = [
    raw[templatePixelIndex],
    raw[templatePixelIndex + 1],
    raw[templatePixelIndex + 2],
  ];
  assert.notDeepEqual(templatePixel, [255, 255, 255]);
});

test("combo QR uses #390202 as the dark QR color", async () => {
  const image = await generateComboQrImageBuffer({
    qrPayload: "combo:22222222-2222-4222-8222-222222222222:payloadTokenForTest456",
    comboName: "Combo",
    comboItems: "Item",
    eventTitle: "Evento",
    startsAt: "2026-08-01T23:00:00.000Z",
    timezone: "America/Sao_Paulo",
    buyerName: "Comprador",
    redemptionCode: "CMB-22222222",
  });
  const { raw } = await rawPixels(image.buffer);
  let darkQrPixels = 0;

  for (let index = 0; index < raw.length; index += 3) {
    const red = raw[index];
    const green = raw[index + 1];
    const blue = raw[index + 2];

    if (red >= 50 && red <= 65 && green <= 8 && blue <= 8) {
      darkQrPixels += 1;
    }
  }

  assert.ok(darkQrPixels > 10_000);
});

test("combo QR image supports missing buyer name and missing table", async () => {
  const dataUrl = await generateComboQrImage({
    qrPayload: "combo:33333333-3333-4333-8333-333333333333:payloadTokenForTest789",
    comboName: "Combo Sem Mesa",
    comboItems: "",
    eventTitle: "Evento",
    startsAt: "2026-08-01T23:00:00.000Z",
    timezone: "America/Sao_Paulo",
    buyerName: "",
    redemptionCode: "CMB-33333333",
    tableMapPlaceCode: null,
  });

  assert.match(dataUrl, /^data:image\/png;base64,/);
});

test("combo QR image skips absent event and absent description without empty sharp text", async () => {
  const image = await generateComboQrImageBuffer({
    qrPayload: "combo:44444444-4444-4444-8444-444444444444:payloadTokenForTest000",
    comboName: null,
    comboItems: null,
    eventTitle: null,
    startsAt: null,
    timezone: "America/Sao_Paulo",
    buyerName: null,
    redemptionCode: "CMB-00000000",
    tableMapPlaceCode: null,
  });
  const metadata = await sharp(image.buffer).metadata();

  assert.equal(metadata.width, 969);
  assert.equal(metadata.height, 1371);
});

test("combo QR image renders offer description items and does not render quantity", () => {
  assert.match(comboQrImageSource, /const itemLine = compactItemLines\(comboItems\)/);
  assert.match(comboQrImageSource, /items\.join\(" - "\)/);
  assert.doesNotMatch(comboQrImageSource, /quantity/i);
});

test("combo QR image keeps date and divider separated", () => {
  assert.match(comboQrImageSource, /fontSize:\s*35 \}\), 94, 1080/);
  assert.doesNotMatch(comboQrImageSource, /<line x1=/);
});

test("combo QR image truncates long combo buyer and event text", () => {
  assert.match(comboQrImageSource, /truncate\(comboName \|\| "COMBO ROCKBAR", 25\)/);
  assert.match(comboQrImageSource, /truncate\(eventTitle, 34\)/);
  assert.match(comboQrImageSource, /truncate\(buyerName \|\| "COMPRADOR", 35\)/);
});

test("combo delivery preserves the QR payload and uses buyer data", () => {
  assert.match(comboOffersSource, /customers\(whatsapp_phone,\s*name\)/);
  assert.match(comboOffersSource, /const qrPayload = `combo:\$\{redemptionId\}:\$\{token\}`/);
  assert.match(comboOffersSource, /qrPayload,\s*\n\s*comboName:/);
  assert.match(comboOffersSource, /buyerName:\s*order\.customers\.name/);
  assert.match(comboOffersSource, /tableMapPlaceCode/);
});

test("operational combo resend uses the newly rotated token", () => {
  assert.match(comboRedemptionsSource, /const newQrToken = randomBytes\(32\)\.toString\("base64url"\)/);
  assert.match(comboRedemptionsSource, /qrPayload:\s*`combo:\$\{redemption\.id\}:\$\{newQrToken\}`/);
  assert.match(comboRedemptionsSource, /buyerName:\s*customer\.name/);
});
