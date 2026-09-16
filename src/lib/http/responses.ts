import { NextResponse } from "next/server";

type JsonBody = Record<string, unknown>;

export function jsonOk(body: JsonBody = {}) {
  return NextResponse.json(body, { status: 200 });
}

export function jsonError(message: string, status = 500, details?: JsonBody) {
  return NextResponse.json(
    {
      error: {
        message,
        ...(details ? { details } : {}),
      },
    },
    { status },
  );
}

export function unauthorized(message = "Unauthorized") {
  return jsonError(message, 401);
}

export function tooManyRequests(retryAfterSeconds = 60) {
  return NextResponse.json(
    {
      error: {
        message: "Too many requests",
      },
    },
    {
      status: 429,
      headers: {
        "Retry-After": String(retryAfterSeconds),
      },
    },
  );
}

export function serviceUnavailable(message = "Service unavailable") {
  return jsonError(message, 503);
}

export function badRequest(message = "Bad request", details?: JsonBody) {
  return jsonError(message, 400, details);
}

export function methodNotAllowed(allowedMethods: string[]) {
  return NextResponse.json(
    {
      error: {
        message: "Method not allowed",
      },
    },
    {
      status: 405,
      headers: {
        Allow: allowedMethods.join(", "),
      },
    },
  );
}
