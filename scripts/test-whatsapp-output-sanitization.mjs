import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { sanitizeWhatsAppText } from "../src/lib/zapi/textEncoding.ts";

test("sanitizeWhatsAppText repairs mojibake and removes non-ascii output characters", () => {
  const input =
    "Ola, bem-vindo(a) ao Rota5! \u{1f920}\n" +
    "Show: Joao e Cia \u2014 Sabado, 15/08 as 22:00\n" +
    "Texto corrompido: N\u00c3\u00a3o dispon\u00c3\u00advel \u00a0 \uFFFD\n" +
    "> Digite *MEU INGRESSO* para receber";

  const result = sanitizeWhatsAppText(input);

  assert.equal(
    result,
    [
      "Ola, bem-vindo(a) ao Rota5!",
      "Show: Joao e Cia - Sabado, 15/08 as 22:00",
      "Texto corrompido: Nao disponivel",
      "> Digite *MEU INGRESSO* para receber",
    ].join("\n"),
  );
  assert.doesNotMatch(result, /[^\x09\x0a\x0d\x20-\x7e]/);
});

test("all central WhatsApp outbound persistence uses the same sanitizer", () => {
  const client = readFileSync(
    new URL("../src/lib/zapi/client.ts", import.meta.url),
    "utf8",
  );
  const messages = readFileSync(
    new URL("../src/lib/tickets/services/messages.ts", import.meta.url),
    "utf8",
  );

  assert.match(client, /import \{ sanitizeWhatsAppText \}/);
  assert.match(client, /function sanitizeZapiText/);
  assert.match(messages, /import \{ sanitizeWhatsAppText \}/);
  assert.match(messages, /formatWhatsAppUppercase\(sanitizeWhatsAppText\(body\)\)/);
});
