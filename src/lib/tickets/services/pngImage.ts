import "server-only";

import { Buffer } from "node:buffer";
import { deflateSync } from "node:zlib";

const PNG_SIGNATURE = Buffer.from([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
]);

const CRC_TABLE = new Uint32Array(256);

for (let index = 0; index < CRC_TABLE.length; index += 1) {
  let value = index;

  for (let bit = 0; bit < 8; bit += 1) {
    value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
  }

  CRC_TABLE[index] = value >>> 0;
}

export type RgbaColor = [number, number, number, number];

type TextOptions = {
  scale?: number;
  color?: RgbaColor;
  align?: "left" | "center";
};

const FONT: Record<string, string[]> = {
  "0": ["111", "101", "101", "101", "101", "101", "111"],
  "1": ["010", "110", "010", "010", "010", "010", "111"],
  "2": ["111", "001", "001", "111", "100", "100", "111"],
  "3": ["111", "001", "001", "111", "001", "001", "111"],
  "4": ["101", "101", "101", "111", "001", "001", "001"],
  "5": ["111", "100", "100", "111", "001", "001", "111"],
  "6": ["111", "100", "100", "111", "101", "101", "111"],
  "7": ["111", "001", "001", "010", "010", "010", "010"],
  "8": ["111", "101", "101", "111", "101", "101", "111"],
  "9": ["111", "101", "101", "111", "001", "001", "111"],
  A: ["01110", "10001", "10001", "11111", "10001", "10001", "10001"],
  B: ["11110", "10001", "10001", "11110", "10001", "10001", "11110"],
  C: ["01111", "10000", "10000", "10000", "10000", "10000", "01111"],
  D: ["11110", "10001", "10001", "10001", "10001", "10001", "11110"],
  E: ["11111", "10000", "10000", "11110", "10000", "10000", "11111"],
  F: ["11111", "10000", "10000", "11110", "10000", "10000", "10000"],
  G: ["01111", "10000", "10000", "10011", "10001", "10001", "01111"],
  H: ["10001", "10001", "10001", "11111", "10001", "10001", "10001"],
  I: ["111", "010", "010", "010", "010", "010", "111"],
  J: ["00111", "00010", "00010", "00010", "10010", "10010", "01100"],
  K: ["10001", "10010", "10100", "11000", "10100", "10010", "10001"],
  L: ["10000", "10000", "10000", "10000", "10000", "10000", "11111"],
  M: ["10001", "11011", "10101", "10101", "10001", "10001", "10001"],
  N: ["10001", "11001", "10101", "10011", "10001", "10001", "10001"],
  O: ["01110", "10001", "10001", "10001", "10001", "10001", "01110"],
  P: ["11110", "10001", "10001", "11110", "10000", "10000", "10000"],
  Q: ["01110", "10001", "10001", "10001", "10101", "10010", "01101"],
  R: ["11110", "10001", "10001", "11110", "10100", "10010", "10001"],
  S: ["01111", "10000", "10000", "01110", "00001", "00001", "11110"],
  T: ["11111", "00100", "00100", "00100", "00100", "00100", "00100"],
  U: ["10001", "10001", "10001", "10001", "10001", "10001", "01110"],
  V: ["10001", "10001", "10001", "10001", "10001", "01010", "00100"],
  W: ["10001", "10001", "10001", "10101", "10101", "10101", "01010"],
  X: ["10001", "10001", "01010", "00100", "01010", "10001", "10001"],
  Y: ["10001", "10001", "01010", "00100", "00100", "00100", "00100"],
  Z: ["11111", "00001", "00010", "00100", "01000", "10000", "11111"],
  " ": ["0", "0", "0", "0", "0", "0", "0"],
  "-": ["0", "0", "0", "111", "0", "0", "0"],
};

function crc32(buffer: Buffer) {
  let crc = 0xffffffff;

  for (const byte of buffer) {
    crc = CRC_TABLE[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  }

  return (crc ^ 0xffffffff) >>> 0;
}

function pngChunk(type: string, data: Buffer) {
  const typeBuffer = Buffer.from(type, "ascii");
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length, 0);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([typeBuffer, data])), 0);

  return Buffer.concat([length, typeBuffer, data, crc]);
}

function normalizeColor(color: RgbaColor): RgbaColor {
  return color.map((channel) =>
    Math.max(0, Math.min(255, Math.round(channel))),
  ) as RgbaColor;
}

export class PngCanvas {
  readonly width: number;
  readonly height: number;
  private readonly data: Uint8ClampedArray;

  constructor(width: number, height: number, background: RgbaColor = [255, 255, 255, 255]) {
    this.width = Math.max(1, Math.floor(width));
    this.height = Math.max(1, Math.floor(height));
    this.data = new Uint8ClampedArray(this.width * this.height * 4);
    this.clear(background);
  }

  clear(color: RgbaColor) {
    const [red, green, blue, alpha] = normalizeColor(color);

    for (let index = 0; index < this.data.length; index += 4) {
      this.data[index] = red;
      this.data[index + 1] = green;
      this.data[index + 2] = blue;
      this.data[index + 3] = alpha;
    }
  }

  setPixel(x: number, y: number, color: RgbaColor) {
    const pixelX = Math.floor(x);
    const pixelY = Math.floor(y);

    if (
      pixelX < 0 ||
      pixelY < 0 ||
      pixelX >= this.width ||
      pixelY >= this.height
    ) {
      return;
    }

    const [red, green, blue, alpha] = normalizeColor(color);
    const index = (pixelY * this.width + pixelX) * 4;
    this.data[index] = red;
    this.data[index + 1] = green;
    this.data[index + 2] = blue;
    this.data[index + 3] = alpha;
  }

  fillCircle(centerX: number, centerY: number, radius: number, color: RgbaColor) {
    const minX = Math.floor(centerX - radius);
    const maxX = Math.ceil(centerX + radius);
    const minY = Math.floor(centerY - radius);
    const maxY = Math.ceil(centerY + radius);
    const radiusSquared = radius * radius;

    for (let y = minY; y <= maxY; y += 1) {
      for (let x = minX; x <= maxX; x += 1) {
        const dx = x - centerX;
        const dy = y - centerY;

        if (dx * dx + dy * dy <= radiusSquared) {
          this.setPixel(x, y, color);
        }
      }
    }
  }

  fillRect(x: number, y: number, width: number, height: number, color: RgbaColor) {
    const startX = Math.floor(x);
    const startY = Math.floor(y);
    const endX = Math.ceil(x + width);
    const endY = Math.ceil(y + height);

    for (let pixelY = startY; pixelY < endY; pixelY += 1) {
      for (let pixelX = startX; pixelX < endX; pixelX += 1) {
        this.setPixel(pixelX, pixelY, color);
      }
    }
  }

  measureText(text: string, scale = 2) {
    return text
      .toLocaleUpperCase("pt-BR")
      .split("")
      .reduce((width, character) => {
        const glyph = FONT[character] ?? FONT[" "];
        const glyphWidth = Math.max(...glyph.map((row) => row.length));
        return width + glyphWidth * scale + scale;
      }, 0);
  }

  drawText(
    text: string,
    x: number,
    y: number,
    { scale = 2, color = [17, 24, 39, 255], align = "left" }: TextOptions = {},
  ) {
    const normalizedText = text.toLocaleUpperCase("pt-BR");
    let cursorX = align === "center" ? x - this.measureText(normalizedText, scale) / 2 : x;

    for (const character of normalizedText) {
      const glyph = FONT[character] ?? FONT[" "];
      const glyphWidth = Math.max(...glyph.map((row) => row.length));

      glyph.forEach((row, rowIndex) => {
        row.split("").forEach((pixel, columnIndex) => {
          if (pixel !== "1") return;

          this.fillRect(
            cursorX + columnIndex * scale,
            y + rowIndex * scale,
            scale,
            scale,
            color,
          );
        });
      });

      cursorX += glyphWidth * scale + scale;
    }
  }

  toPngBuffer() {
    const rawRows: Buffer[] = [];

    for (let y = 0; y < this.height; y += 1) {
      const rowStart = y * this.width * 4;
      const rowEnd = rowStart + this.width * 4;
      rawRows.push(Buffer.from([0]), Buffer.from(this.data.slice(rowStart, rowEnd)));
    }

    const ihdr = Buffer.alloc(13);
    ihdr.writeUInt32BE(this.width, 0);
    ihdr.writeUInt32BE(this.height, 4);
    ihdr[8] = 8;
    ihdr[9] = 6;
    ihdr[10] = 0;
    ihdr[11] = 0;
    ihdr[12] = 0;

    return Buffer.concat([
      PNG_SIGNATURE,
      pngChunk("IHDR", ihdr),
      pngChunk("IDAT", deflateSync(Buffer.concat(rawRows))),
      pngChunk("IEND", Buffer.alloc(0)),
    ]);
  }
}

export function toPngDataUrl(buffer: Buffer) {
  return `data:image/png;base64,${buffer.toString("base64")}`;
}
