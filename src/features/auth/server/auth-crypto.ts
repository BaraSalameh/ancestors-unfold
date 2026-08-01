import { createHash, createHmac, randomInt } from "node:crypto";

export const hashSessionToken = (value: string) => createHash("sha256").update(value).digest();

export const normalizeEmail = (value: string) => value.trim().toLowerCase();

export function hashEmailCode(code: string) {
  const secret =
    process.env.EMAIL_CODE_SECRET ??
    ((process.env.AUTH_TOKEN_DELIVERY ?? "console") === "console"
      ? "ancestors-unfold-console-development-only"
      : undefined);
  if (!secret || secret.length < 16) throw new Error("MAIL_NOT_CONFIGURED");
  return createHmac("sha256", secret).update(code).digest();
}

export const newEmailCode = () => randomInt(0, 1_000_000).toString().padStart(6, "0");
