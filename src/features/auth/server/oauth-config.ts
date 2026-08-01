import { OAuth2Client } from "google-auth-library";
import { ApiError } from "@/server/security";

export function googleConfig(request: Request) {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  if (!clientId || !clientSecret) throw new ApiError("GOOGLE_OAUTH_NOT_CONFIGURED", 503);
  const callback = `${process.env.PUBLIC_ORIGIN ?? new URL(request.url).origin}/api/auth/google/callback`;
  return { clientId, client: new OAuth2Client(clientId, clientSecret, callback) };
}

export const safeRedirect = (value: string | null) =>
  value?.startsWith("/") && !value.startsWith("//") ? value : "/";
