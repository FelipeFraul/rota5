import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const MESSAGE_FILES = [
  "src/lib/tickets/router.ts",
  "src/lib/tickets/services/ticketDelivery.ts",
  "src/lib/tickets/services/adminLoginFlow.ts",
  "src/lib/tickets/services/publicHelpFlow.ts",
  "src/app/api/admin/events/route.ts",
  "src/app/api/admin/combo-offers/[offerId]/route.ts",
  "src/app/admin/eventos/dashboard/AdminDashboardSection.tsx",
];

const MOJIBAKE_PATTERN =
  /Ã(?:[\u0080-\u00bf]|ƒ|‚|Â|¢|Å|Æ|â)|Â(?:[\u0080-\u00bf]|º|ª|°)|â(?:€|‚)|�/;

test("mensagens publicas e administrativas nao contem mojibake", () => {
  const failures = [];

  for (const file of MESSAGE_FILES) {
    const lines = readFileSync(new URL(`../${file}`, import.meta.url), "utf8")
      .split(/\r?\n/);

    lines.forEach((line, index) => {
      if (MOJIBAKE_PATTERN.test(line)) {
        failures.push(`${file}:${index + 1}:${line.trim()}`);
      }
    });
  }

  assert.deepEqual(failures, []);
});
