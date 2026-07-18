import { createHash } from "node:crypto";
import { z, type ZodType } from "zod";
import { query } from "./infrastructure/database";
import { serverConfig } from "./infrastructure/config";

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

export const schemas = {
  register: z
    .object({
      email: z.string().trim().email().max(320),
      password: z.string().min(12).max(256),
      fullNameEn: z.string().trim().min(1).max(200),
      fullNameAr: z.string().trim().min(1).max(200),
    })
    .strict(),
  login: z
    .object({ email: z.string().trim().email().max(320), password: z.string().min(1).max(256) })
    .strict(),
  emailCode: z
    .object({ email: z.string().trim().email().max(320), code: z.string().regex(/^\d{6}$/) })
    .strict(),
  resendCode: z.object({ email: z.string().trim().email().max(320) }).strict(),
  emailChangeRequest: z
    .object({
      email: z.string().trim().email().max(320),
      currentPassword: z.string().min(1).max(256),
    })
    .strict(),
  emailChangeConfirm: z.object({ code: z.string().regex(/^\d{6}$/) }).strict(),
  resetRequest: z.object({ email: z.string().trim().email().max(320) }).strict(),
  resetConfirm: z
    .object({ token: z.string().min(32).max(512), password: z.string().min(12).max(256) })
    .strict(),
  tree: z
    .object({
      name_en: z.string().trim().min(1).max(200),
      name_ar: z.string().trim().max(200).optional(),
      description_en: z.string().trim().max(5000).optional(),
      description_ar: z.string().trim().max(5000).optional(),
      color: z.string().trim().max(100).optional(),
    })
    .strict(),
  shareLink: z
    .object({
      expiresInHours: z
        .number()
        .int()
        .min(1)
        .max(24 * 90)
        .default(168),
      usageLimit: z.number().int().min(1).max(100000).nullable().optional(),
    })
    .strict(),
  branchGrant: z
    .object({
      userId: z.string().uuid(),
      rootSubfamilyId: z.string().uuid(),
      role: z.enum(["branch_editor", "branch_viewer"]),
      canReadContacts: z.boolean().default(false),
      canWriteContacts: z.boolean().default(false),
      expiresAt: z.string().datetime().nullable().optional(),
    })
    .strict()
    .refine((v) => !v.canWriteContacts || v.canReadContacts),
  contact: z
    .object({
      contactType: z.enum(["email", "phone", "address", "other"]),
      displayValue: z.string().trim().min(1).max(1000),
      normalizedValue: z.string().trim().max(1000).nullable().optional(),
      label: z.string().trim().max(100).nullable().optional(),
      address: z.record(z.string(), z.unknown()).nullable().optional(),
      isPrimary: z.boolean().default(false),
    })
    .strict(),
  snapshot: z
    .object({
      batchId: z.string().uuid().optional(),
      expectedVersion: z.number().int().positive(),
      members: z
        .array(
          z
            .object({
              id: z.string().min(1).max(200),
              name_en: z.string().trim().max(200),
              name_ar: z.string().trim().max(200),
              gender: z.enum(["male", "female"]),
              birth_date: z.string().max(50).optional(),
              death_date: z.string().max(50).optional(),
              citizen_status: z.enum(["resident", "non_resident"]).optional(),
              image_url: z.string().max(2048).optional(),
              notes: z.string().max(10_000).optional(),
              father_id: z.string().max(200).optional(),
              mother_id: z.string().max(200).optional(),
              spouse_id: z.string().max(200).optional(),
              spouse_ids: z.array(z.string().max(200)).max(100).optional(),
              divorced_from: z.array(z.string().max(200)).max(100).optional(),
              is_unknown: z.boolean().optional(),
              external_children: z
                .array(
                  z
                    .object({
                      id: z.string().min(1).max(200),
                      name: z.string().trim().min(1).max(200),
                      other_parent_name: z.string().max(200).optional(),
                      birth_year: z
                        .string()
                        .regex(/^\d{1,4}$/)
                        .optional(),
                      notes: z.string().max(5000).optional(),
                    })
                    .strict(),
                )
                .max(500)
                .optional(),
              subfamily_id: z.string().max(200).optional(),
              pos_x: z.number().finite().optional(),
              pos_y: z.number().finite().optional(),
              created_at: z.string().max(50),
              updated_at: z.string().max(50),
            })
            .strict(),
        )
        .max(10_000),
      subfamilies: z
        .array(
          z
            .object({
              id: z.string().min(1).max(200),
              name_en: z.string().trim().min(1).max(200),
              name_ar: z.string().trim().max(200),
              linked_male_id: z.string().max(200).optional(),
              parent_subfamily_id: z.string().max(200).optional(),
              notes: z.string().max(10_000).optional(),
              attachments: z.array(z.unknown()).max(100).optional(),
              color: z.string().max(100).optional(),
              created_at: z.string().max(50),
              updated_at: z.string().max(50),
            })
            .strict(),
        )
        .max(2000),
    })
    .strict(),
};

export type SnapshotInput = z.infer<(typeof schemas)["snapshot"]>;
