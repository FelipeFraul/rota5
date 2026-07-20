import "server-only";

import { pbkdf2Sync, randomBytes, timingSafeEqual } from "crypto";

const GATE_ACCESS_HASH_ALGORITHM = "pbkdf2_sha256";
const GATE_ACCESS_HASH_ITERATIONS = 210_000;
const GATE_ACCESS_HASH_KEY_LENGTH = 32;

export const GATE_ACCESS_REDACTED_BODY = "[GATE_ACCESS_REDACTED]";

function fixedTimeEqual(left: string, right: string) {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);

  return (
    leftBuffer.length === rightBuffer.length &&
    timingSafeEqual(leftBuffer, rightBuffer)
  );
}

export function hashGateAccessPassphrase(passphrase: string): string {
  const salt = randomBytes(16).toString("hex");
  const digest = pbkdf2Sync(
    passphrase,
    salt,
    GATE_ACCESS_HASH_ITERATIONS,
    GATE_ACCESS_HASH_KEY_LENGTH,
    "sha256",
  ).toString("hex");

  return `${GATE_ACCESS_HASH_ALGORITHM}$${GATE_ACCESS_HASH_ITERATIONS}$${salt}$${digest}`;
}

export function verifyGateAccessPassphrase(passphrase: string, hash: string) {
  const [algorithm, iterationsRaw, salt, expectedDigest] = hash.split("$");

  if (
    algorithm !== GATE_ACCESS_HASH_ALGORITHM ||
    !iterationsRaw ||
    !salt ||
    !expectedDigest
  ) {
    return false;
  }

  const iterations = Number(iterationsRaw);

  if (!Number.isInteger(iterations) || iterations <= 0) {
    return false;
  }

  const digest = pbkdf2Sync(
    passphrase,
    salt,
    iterations,
    Math.max(expectedDigest.length / 2, GATE_ACCESS_HASH_KEY_LENGTH),
    "sha256",
  ).toString("hex");

  return fixedTimeEqual(digest, expectedDigest);
}
