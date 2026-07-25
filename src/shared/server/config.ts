import { z } from "zod";

const booleanString = z.enum(["true", "false"]).transform((value) => value === "true");
const positiveInteger = (fallback: number) => z.coerce.number().int().positive().default(fallback);

const environmentSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  DATABASE_URL: z.string().min(1).optional(),
  DATABASE_SSL: booleanString.default("true"),
  SESSION_COOKIE_SECURE: booleanString.default("false"),
  SESSION_IDLE_HOURS: positiveInteger(24),
  SESSION_ABSOLUTE_DAYS: positiveInteger(30),
  PUBLIC_ORIGIN: z.string().url().optional(),
  TRUST_PROXY: booleanString.default("false"),
  MAX_REQUEST_BYTES: positiveInteger(1_000_000),
  REQUIRED_MIGRATIONS: positiveInteger(4),
  AUTH_TOKEN_DELIVERY: z.enum(["console", "smtp", "resend"]).default("console"),
});

const parsed = environmentSchema.safeParse(process.env);
if (!parsed.success) {
  throw new Error(
    `INVALID_SERVER_CONFIGURATION: ${parsed.error.issues.map((i) => i.path.join(".")).join(", ")}`,
  );
}

if (
  parsed.data.NODE_ENV === "production" &&
  parsed.data.PUBLIC_ORIGIN?.startsWith("https://") &&
  !parsed.data.SESSION_COOKIE_SECURE
) {
  throw new Error("INVALID_SERVER_CONFIGURATION: SESSION_COOKIE_SECURE must be true for HTTPS");
}

export const serverConfig = parsed.data;
