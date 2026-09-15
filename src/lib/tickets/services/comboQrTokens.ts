import "server-only";

import { createHash, createHmac, timingSafeEqual } from "crypto";
import { getEnv } from "@/lib/env";

const COMBO_REDEMPTION_TOKEN_DOMAIN = "combo-redemption:v1";

export function createComboRedemptionToken(
  comboOrderId: string,
  version: number,
) {
  if (!Number.isSafeInteger(version) || version <= 0) {
    throw new Error("invalid_combo_qr_token_version");
  }

  return createHmac("sha256", getEnv().TICKET_QR_SECRET)
    .update(`${COMBO_REDEMPTION_TOKEN_DOMAIN}:${comboOrderId}:${version}`)
    .digest("base64url");
}

export function hashComboRedemptionToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

export function comboRedemptionTokenMatchesHash(
  token: string,
  expectedHash: string,
) {
  const actual = Buffer.from(hashComboRedemptionToken(token));
  const expected = Buffer.from(expectedHash);

  return actual.length === expected.length && timingSafeEqual(actual, expected);
}
