import {
  badRequest,
  jsonOk,
  methodNotAllowed,
} from "@/lib/http/responses";
import { validateGateSessionToken } from "@/lib/tickets/services/gateSessions";

async function readToken(request: Request) {
  try {
    const payload = (await request.json()) as unknown;

    if (
      !payload ||
      typeof payload !== "object" ||
      Array.isArray(payload) ||
      typeof (payload as { token?: unknown }).token !== "string" ||
      !(payload as { token: string }).token.trim()
    ) {
      return null;
    }

    return (payload as { token: string }).token.trim();
  } catch {
    return null;
  }
}

export async function POST(request: Request) {
  const token = await readToken(request);

  if (!token) {
    return badRequest("Bad request");
  }

  const result = await validateGateSessionToken(token);

  return jsonOk(result);
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

