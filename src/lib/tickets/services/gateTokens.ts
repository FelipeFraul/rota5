import "server-only";

import { createHash, randomBytes } from "crypto";

export function createGateSessionToken() {
  return randomBytes(32).toString("base64url");
}

export function hashGateSessionToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

export function createKitchenDeviceToken() {
  return randomBytes(32).toString("base64url");
}

export function hashKitchenDeviceToken(token: string) {
  return createHash("sha256").update(`kitchen-device:${token}`).digest("hex");
}
