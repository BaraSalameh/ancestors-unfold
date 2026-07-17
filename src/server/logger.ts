const sensitiveKeys = /authorization|cookie|password|token|secret|code|profile|contact/i;

function redact(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(redact);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(
    Object.entries(value).map(([key, entry]) => [
      key,
      sensitiveKeys.test(key) ? "[REDACTED]" : redact(entry),
    ]),
  );
}

function redactRecord(value: Record<string, unknown>): Record<string, unknown> {
  return redact(value) as Record<string, unknown>;
}

export function logError(message: string, error: unknown, context: Record<string, unknown> = {}) {
  const detail = error instanceof Error ? { name: error.name, message: error.message } : { error };
  const event = { level: "error", message, ...redactRecord(context), ...redactRecord(detail) };
  if (process.env.NODE_ENV === "production") console.error(JSON.stringify(event));
  else console.error(message, event);
}
