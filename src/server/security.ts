import { createHash } from "node:crypto";
import type { ZodType } from "zod";
import { query } from "@/shared/server/database";
import { serverConfig } from "@/shared/server/config";

export class ApiError extends Error {
  constructor(
    public code: string,
    public status = 400,
  ) {
    super(code);
  }
}

export function assertJsonRequest(request: Request) {
  const length = Number(request.headers.get("content-length") ?? 0);
  const max = serverConfig.MAX_REQUEST_BYTES;
  if (length > max) throw new ApiError("PAYLOAD_TOO_LARGE", 413);
  if (!request.headers.get("content-type")?.toLowerCase().startsWith("application/json"))
    throw new ApiError("UNSUPPORTED_MEDIA_TYPE", 415);
}

export function assertSameOrigin(request: Request) {
  if (["GET", "HEAD", "OPTIONS"].includes(request.method)) return;
  const origin = request.headers.get("origin");
  const expected = serverConfig.PUBLIC_ORIGIN ?? new URL(request.url).origin;
  if (!origin || origin !== expected) throw new ApiError("CSRF_REJECTED", 403);
}

export async function parseBody<T>(request: Request, schema: ZodType<T>): Promise<T> {
  assertJsonRequest(request);
  let value: unknown;
  try {
    value = await request.json();
  } catch {
    throw new ApiError("INVALID_JSON");
  }
  const result = schema.safeParse(value);
  if (!result.success) throw new ApiError("INVALID_INPUT");
  return result.data;
}

export function requestIp(request: Request): string | null {
  if (serverConfig.TRUST_PROXY)
    return request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null;
  return null;
}

export async function enforceRateLimit(
  request: Request,
  type: "login" | "password_reset" | "totp" | "email_verification",
  identifier: string,
  limit = 8,
  minutes = 15,
) {
  const hash = createHash("sha256").update(identifier.trim().toLowerCase()).digest();
  const ip = requestIp(request);
  const result = await query<{ count: string }>(
    `SELECT count(*)::text count FROM app.auth_attempts
    WHERE attempt_type=$1 AND occurred_at > now()-($2||' minutes')::interval
      AND (identifier_hash=$3 OR ($4::inet IS NOT NULL AND ip_address=$4::inet))`,
    [type, minutes, hash, ip],
  );
  if (Number(result.rows[0]?.count) >= limit) throw new ApiError("RATE_LIMITED", 429);
  return { hash, ip };
}

export { schemas, type SnapshotInput } from "./schemas";
