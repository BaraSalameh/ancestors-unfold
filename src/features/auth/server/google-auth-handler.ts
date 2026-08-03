import { createHash, randomBytes } from "node:crypto";
import { CodeChallengeMethod } from "google-auth-library";
import { transaction } from "@/shared/server/database";
import { ApiError } from "@/server/security";
import {
  cookieNamed,
  createSession,
  googleConfig,
  normalizeEmail,
  oauthCookie,
  OAUTH_COOKIE,
  safeRedirect,
  sessionCookie,
} from "@/features/auth/server";

export async function handleGoogleAuthRequest(
  request: Request,
  url: URL,
  requestId: string,
): Promise<Response | undefined> {
  if (url.pathname === "/api/auth/google" && request.method === "GET")
    return startGoogleAuth(request, url);
  if (url.pathname === "/api/auth/google/callback" && request.method === "GET")
    return completeGoogleAuth(request, url, requestId);
  return undefined;
}

function startGoogleAuth(request: Request, url: URL): Response {
  const { client } = googleConfig(request);
  const state = randomBytes(32).toString("base64url"),
    nonce = randomBytes(32).toString("base64url"),
    verifier = randomBytes(48).toString("base64url");
  const stored = Buffer.from(
    JSON.stringify({
      state,
      nonce,
      verifier,
      redirect: safeRedirect(url.searchParams.get("redirect")),
    }),
  ).toString("base64url");
  const location = client.generateAuthUrl({
    access_type: "online",
    scope: ["openid", "email", "profile"],
    state,
    nonce,
    code_challenge: createHash("sha256").update(verifier).digest("base64url"),
    code_challenge_method: CodeChallengeMethod.S256,
    prompt: "select_account",
  });
  return new Response(null, {
    status: 302,
    headers: { location, "set-cookie": oauthCookie(stored, 600), "cache-control": "no-store" },
  });
}

async function completeGoogleAuth(
  request: Request,
  url: URL,
  requestId: string,
): Promise<Response> {
  const clearOauth = oauthCookie("", 0),
    raw = cookieNamed(request, OAUTH_COOKIE);
  let saved: { state: string; nonce: string; verifier: string; redirect: string };
  try {
    saved = JSON.parse(Buffer.from(raw ?? "", "base64url").toString("utf8"));
  } catch {
    return new Response(null, {
      status: 302,
      headers: { location: "/auth?oauth_error=invalid_state", "set-cookie": clearOauth },
    });
  }
  const code = url.searchParams.get("code");
  if (!code || url.searchParams.get("state") !== saved.state)
    return new Response(null, {
      status: 302,
      headers: { location: "/auth?oauth_error=cancelled", "set-cookie": clearOauth },
    });
  const { clientId, client } = googleConfig(request);
  const { tokens } = await client.getToken({ code, codeVerifier: saved.verifier });
  if (!tokens.id_token) throw new ApiError("GOOGLE_ID_TOKEN_MISSING", 401);
  const profile = (
    await client.verifyIdToken({ idToken: tokens.id_token, audience: clientId })
  ).getPayload();
  if (!profile?.sub || !profile.email || !profile.email_verified || profile.nonce !== saved.nonce)
    throw new ApiError("GOOGLE_IDENTITY_INVALID", 401);
  const email = normalizeEmail(profile.email);
  const login = await transaction(null, null, requestId, async (c) => {
    const identity = await c.query<{ user_id: string; status: string }>(
      `SELECT o.user_id,u.status FROM app.oauth_accounts o JOIN app.users u ON u.id=o.user_id WHERE o.provider='google' AND o.provider_account_id=$1 FOR UPDATE OF o,u`,
      [profile.sub],
    );
    let userId = identity.rows[0]?.user_id;
    const firstGoogleLogin = !userId;
    if (identity.rows[0] && ["suspended", "deleted"].includes(identity.rows[0].status))
      throw new ApiError("ACCOUNT_UNAVAILABLE", 403);
    if (!userId) {
      const existing = await c.query<{ id: string; status: string }>(
        "SELECT id,status FROM app.users WHERE email=$1 FOR UPDATE",
        [email],
      );
      if (existing.rows[0] && ["suspended", "deleted"].includes(existing.rows[0].status))
        throw new ApiError("ACCOUNT_UNAVAILABLE", 403);
      userId = existing.rows[0]?.id;
      if (!userId) {
        const name = profile.name?.trim() || email.split("@")[0];
        userId = (
          await c.query<{ id: string }>(
            `INSERT INTO app.users(email,email_verified_at,full_name_en,full_name_ar,status) VALUES($1,now(),$2,$2,'active') RETURNING id`,
            [email, name],
          )
        ).rows[0].id;
      } else {
        await c.query(
          "UPDATE app.users SET email_verified_at=COALESCE(email_verified_at,now()),status='active',updated_at=now() WHERE id=$1",
          [userId],
        );
        await c.query(
          "UPDATE app.email_verification_tokens SET invalidated_at=now() WHERE user_id=$1 AND consumed_at IS NULL AND invalidated_at IS NULL",
          [userId],
        );
      }
      await c.query(
        `INSERT INTO app.oauth_accounts(user_id,provider,provider_account_id,provider_email,provider_email_verified,profile) VALUES($1,'google',$2,$3,true,$4::jsonb)`,
        [userId, profile.sub, email, JSON.stringify(profile)],
      );
    } else {
      await c.query(
        "UPDATE app.oauth_accounts SET provider_email=$2,provider_email_verified=true,profile=$3::jsonb,updated_at=now() WHERE provider='google' AND provider_account_id=$1",
        [profile.sub, email, JSON.stringify(profile)],
      );
    }
    const account = (
      await c.query<{
        id: string;
        email: string;
        full_name_en: string;
        full_name_ar: string;
        profile_gender: "male" | "female" | null;
      }>("SELECT id,email,full_name_en,full_name_ar,profile_gender FROM app.users WHERE id=$1", [
        userId,
      ])
    ).rows[0];
    await c.query("SELECT app.set_request_context($1,NULL,$2)", [userId, requestId]);
    await c.query("UPDATE app.users SET last_login_at=now() WHERE id=$1", [userId]);
    const credential = await c.query<{ credential_version: number }>(
      "SELECT credential_version FROM app.password_credentials WHERE user_id=$1",
      [userId],
    );
    const createdSession = await createSession(
      c,
      userId,
      credential.rows[0]?.credential_version ?? 1,
      request,
      firstGoogleLogin,
    );
    return { ...createdSession, profileComplete: account.profile_gender !== null };
  });
  const headers = new Headers({
    location: login.profileComplete ? safeRedirect(saved.redirect) : "/profile",
    "cache-control": "no-store",
  });
  headers.append("set-cookie", clearOauth);
  headers.append("set-cookie", sessionCookie(login.token, login.maxAge));
  return new Response(null, { status: 302, headers });
}
