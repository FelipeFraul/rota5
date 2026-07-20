type LogMetadata = Record<string, unknown>;

const sensitiveKeyPattern =
  /(token|secret|key|authorization|password|access_token|service_role)/i;
const phoneKeyPattern = /(phone|whatsapp|from|to|sender|recipient|contact)/i;

function maskPhone(value: string): string {
  const digits = value.replace(/\D/g, "");

  if (digits.length < 5) {
    return "****";
  }

  return `****${digits.slice(-4)}`;
}

function sanitizeValue(key: string, value: unknown): unknown {
  if (sensitiveKeyPattern.test(key)) {
    return "[redacted]";
  }

  if (typeof value === "string") {
    if (phoneKeyPattern.test(key)) {
      return maskPhone(value);
    }

    if (value.length > 240) {
      return `${value.slice(0, 240)}...[truncated]`;
    }
  }

  if (value instanceof Error) {
    return {
      name: value.name,
      message: value.message,
    };
  }

  if (Array.isArray(value)) {
    return value.slice(0, 10).map((item) => sanitizeValue(key, item));
  }

  if (value && typeof value === "object") {
    return sanitizeMetadata(value as LogMetadata);
  }

  return value;
}

function sanitizeMetadata(metadata?: LogMetadata): LogMetadata | undefined {
  if (!metadata) {
    return undefined;
  }

  return Object.fromEntries(
    Object.entries(metadata).map(([key, value]) => [
      key,
      sanitizeValue(key, value),
    ]),
  );
}

function writeLog(
  level: "info" | "warn" | "error",
  message: string,
  metadata?: LogMetadata,
) {
  const entry = {
    level,
    message,
    timestamp: new Date().toISOString(),
    ...sanitizeMetadata(metadata),
  };

  if (level === "error") {
    console.error(JSON.stringify(entry));
    return;
  }

  if (level === "warn") {
    console.warn(JSON.stringify(entry));
    return;
  }

  console.info(JSON.stringify(entry));
}

export function logInfo(message: string, metadata?: LogMetadata) {
  writeLog("info", message, metadata);
}

export function logWarn(message: string, metadata?: LogMetadata) {
  writeLog("warn", message, metadata);
}

export function logError(message: string, metadata?: LogMetadata) {
  writeLog("error", message, metadata);
}
