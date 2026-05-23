import {
  badRequest,
  jsonOk,
  methodNotAllowed,
} from "@/lib/http/responses";
import { validateGateSessionToken } from "@/lib/tickets/services/gateSessions";

type ScanPayload = {
  gateSessionToken?: unknown;
  ticketToken?: unknown;
};

async function readScanPayload(request: Request) {
  try {
    const payload = (await request.json()) as unknown;

    if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
      return null;
    }

    const { gateSessionToken, ticketToken } = payload as ScanPayload;

    if (
      typeof gateSessionToken !== "string" ||
      !gateSessionToken.trim() ||
      typeof ticketToken !== "string" ||
      !ticketToken.trim()
    ) {
      return null;
    }

    return {
      gateSessionToken: gateSessionToken.trim(),
      ticketToken: ticketToken.trim(),
    };
  } catch {
    return null;
  }
}

export async function POST(request: Request) {
  const payload = await readScanPayload(request);

  if (!payload) {
    return badRequest("Bad request");
  }

  const gateSession = await validateGateSessionToken(payload.gateSessionToken);

  if (!gateSession.valid) {
    return jsonOk({
      received: false,
      validationPending: true,
      reason: gateSession.reason,
      message: "Sessão de portaria inválida ou expirada.",
    });
  }

  return jsonOk({
    received: true,
    validationPending: true,
    message: "Leitura recebida. A validação real será ativada no próximo passo.",
  });
}

export function GET() {
  return methodNotAllowed(["POST"]);
}

export function PUT() {
  return methodNotAllowed(["POST"]);
}

export function PATCH() {
  return methodNotAllowed(["POST"]);
}

export function DELETE() {
  return methodNotAllowed(["POST"]);
}

