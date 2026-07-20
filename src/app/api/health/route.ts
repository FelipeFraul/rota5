import { jsonOk, methodNotAllowed } from "@/lib/http/responses";

export function GET() {
  return jsonOk({
    status: "ok",
    service: "whatsapp-ticketing",
    timestamp: new Date().toISOString(),
  });
}

export function POST() {
  return methodNotAllowed(["GET"]);
}

export function PUT() {
  return methodNotAllowed(["GET"]);
}

export function PATCH() {
  return methodNotAllowed(["GET"]);
}

export function DELETE() {
  return methodNotAllowed(["GET"]);
}
