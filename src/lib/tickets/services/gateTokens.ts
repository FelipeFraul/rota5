import "server-only";

import { createHash, createHmac, timingSafeEqual } from "crypto";
import { getEnv } from "@/lib/env";

export type GateSessionTokenPayload = {
  gid: string;
  phone: string;
  exp: string;
};

export type VerifyGateSessionTokenResult =
  | {
      valid: true;
      gateSessionId: string;
      validatorPhone: string;
      expiresAt: string;
    }
  | {
      valid: false;
      reason: "malformed" | "invalid_signature" | "expired";
    };

function base64UrlEncode(value: string) {
  return Buffer.from(value, "utf8").toString("base64url");
}

function base64UrlDecode(value: string) {
  return Buffer.from(value, "base64url").toString("utf8");
}

function signPayload(encodedPayload: string) {
  const env = getEnv();

  return createHmac("sha256", env.GATE_SESSION_SECRET)
    .update(encodedPayload)
    .digest("base64url");
}

function safeSignatureEquals(left: string, right: string) {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);

  return (
    leftBuffer.length === rightBuffer.length &&
    timingSafeEqual(leftBuffer, rightBuffer)
  );
}

export function createGateSessionToken(input: {
  gateSessionId: string;
  validatorPhone: string;
  expiresAt: string;
}) {
  const payload: GateSessionTokenPayload = {
    gid: input.gateSessionId,
    phone: input.validatorPhone,
    exp: input.expiresAt,
  };
  const encodedPayload = base64UrlEncode(JSON.stringify(payload));
  const signature = signPayload(encodedPayload);

  return `${encodedPayload}.${signature}`;
}

export function hashGateSessionToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

export function verifyGateSessionToken(
  token: string,
): VerifyGateSessionTokenResult {
  const [encodedPayload, signature, extra] = token.split(".");

  if (!encodedPayload || !signature || extra) {
    return {
      valid: false,
      reason: "malformed",
    };
  }

  const expectedSignature = signPayload(encodedPayload);

  if (!safeSignatureEquals(signature, expectedSignature)) {
    return {
      valid: false,
      reason: "invalid_signature",
    };
  }

  try {
    const payload = JSON.parse(base64UrlDecode(encodedPayload)) as unknown;

    if (
      !payload ||
      typeof payload !== "object" ||
      typeof (payload as GateSessionTokenPayload).gid !== "string" ||
      typeof (payload as GateSessionTokenPayload).phone !== "string" ||
      typeof (payload as GateSessionTokenPayload).exp !== "string"
    ) {
      return {
        valid: false,
        reason: "malformed",
      };
    }

    const parsedPayload = payload as GateSessionTokenPayload;

    if (new Date(parsedPayload.exp).getTime() <= Date.now()) {
      return {
        valid: false,
        reason: "expired",
      };
    }

    return {
      valid: true,
      gateSessionId: parsedPayload.gid,
      validatorPhone: parsedPayload.phone,
      expiresAt: parsedPayload.exp,
    };
  } catch {
    return {
      valid: false,
      reason: "malformed",
    };
  }
}

