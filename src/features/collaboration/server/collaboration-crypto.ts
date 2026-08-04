import { createHash, createHmac } from "node:crypto";

function deliverySecret(): string {
  const secret =
    process.env.EMAIL_CODE_SECRET ??
    ((process.env.AUTH_TOKEN_DELIVERY ?? "console") === "console"
      ? "ancestors-unfold-console-development-only"
      : undefined);
  if (!secret || secret.length < 16) throw new Error("MAIL_NOT_CONFIGURED");
  return secret;
}

export const collaborationTokenHash = (value: string) =>
  createHash("sha256").update(value).digest();

export const normalizedInvitationEmail = (value: string) => value.trim().toLowerCase();

export const ownershipTransferCodeHash = (code: string) =>
  createHmac("sha256", deliverySecret()).update(`ownership:${code}`).digest();

export const contributorRemovalCodeHash = (challengeId: string, code: string) =>
  createHmac("sha256", deliverySecret())
    .update(`contributor-removal:${challengeId}:${code}`)
    .digest();

export const branchDeactivationCodeHash = (challengeId: string, code: string) =>
  createHmac("sha256", deliverySecret())
    .update(`branch-deactivation:${challengeId}:${code}`)
    .digest();
