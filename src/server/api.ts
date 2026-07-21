import { createHash, createHmac, randomBytes, randomInt, randomUUID } from "node:crypto";
import argon2 from "argon2";
import { CodeChallengeMethod, OAuth2Client } from "google-auth-library";
import type { PoolClient } from "pg";
import { databaseConfigured, query, transaction } from "./infrastructure/database";
import {
  ApiError,
  assertSameOrigin,
  enforceRateLimit,
  parseBody,
  requestIp,
  schemas,
  type SnapshotInput,
} from "./security";
import { passwordResetMail, sendMail, verificationMail } from "./infrastructure/email";
import { logError } from "./infrastructure/logger";
import { jsonResponse as json } from "./http/response";
import { handleOperationsRequest } from "./modules/operations/handler";
import {
  importSnapshot,
  readPublicSnapshot,
  readSnapshot,
} from "./modules/trees/snapshot-repository";

const COOKIE = "ancestors_session";
const OAUTH_COOKIE = "ancestors_google_oauth";
const sha256 = (value: string) => createHash("sha256").update(value).digest();
const normalizeEmail = (value: string) => value.trim().toLowerCase();
const codeHash = (code: string) => {
  const secret =
    process.env.EMAIL_CODE_SECRET ??
    ((process.env.AUTH_TOKEN_DELIVERY ?? "console") === "console"
      ? "ancestors-unfold-console-development-only"
      : undefined);
  if (!secret || secret.length < 16) throw new Error("MAIL_NOT_CONFIGURED");
  return createHmac("sha256", secret).update(code).digest();
};
const newCode = () => randomInt(0, 1_000_000).toString().padStart(6, "0");
const cookieNamed = (request: Request, name: string) =>
  request.headers
    .get("cookie")
    ?.split(";")
    .map((x) => x.trim())
    .find((x) => x.startsWith(`${name}=`))
    ?.slice(name.length + 1);
const cookieValue = (request: Request) => cookieNamed(request, COOKIE);
const sessionCookie = (token: string, maxAge: number) =>
  `${COOKIE}=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${process.env.SESSION_COOKIE_SECURE === "true" ? "; Secure" : ""}`;
const oauthCookie = (value: string, maxAge: number) =>
  `${OAUTH_COOKIE}=${value}; Path=/api/auth/google/callback; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${process.env.SESSION_COOKIE_SECURE === "true" ? "; Secure" : ""}`;
function googleConfig(request: Request) {
  const clientId = process.env.GOOGLE_CLIENT_ID,
    clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  if (!clientId || !clientSecret) throw new ApiError("GOOGLE_OAUTH_NOT_CONFIGURED", 503);
  const callback = `${process.env.PUBLIC_ORIGIN ?? new URL(request.url).origin}/api/auth/google/callback`;
  return { clientId, client: new OAuth2Client(clientId, clientSecret, callback) };
}
const safeRedirect = (value: string | null) =>
  value?.startsWith("/") && !value.startsWith("//") ? value : "/";

type Session = {
  id: string;
  user_id: string;
  email: string;
  full_name_en: string;
  full_name_ar: string;
};
async function authenticate(request: Request): Promise<Session | null> {
  const token = cookieValue(request);
  if (!token || !databaseConfigured) return null;
  const result = await query<Session>(
    `SELECT s.id,s.user_id,u.email,u.full_name_en,u.full_name_ar FROM app.sessions s
    JOIN app.users u ON u.id=s.user_id LEFT JOIN app.password_credentials p ON p.user_id=u.id
    WHERE s.token_hash=$1 AND s.revoked_at IS NULL AND s.idle_expires_at>now() AND s.absolute_expires_at>now()
      AND u.status='active' AND (p.user_id IS NULL OR p.credential_version=s.credential_version)`,
    [sha256(token)],
  );
  return result.rows[0] ?? null;
}

function userDto(s: Session) {
  return { id: s.user_id, email: s.email, fullNameEn: s.full_name_en, fullNameAr: s.full_name_ar };
}
async function createSession(
  client: PoolClient,
  userId: string,
  version: number,
  request: Request,
) {
  const token = randomBytes(32).toString("base64url"),
    idle = Number(process.env.SESSION_IDLE_HOURS ?? 24),
    days = Number(process.env.SESSION_ABSOLUTE_DAYS ?? 30);
  await client.query(
    `INSERT INTO app.sessions(user_id,token_hash,credential_version,idle_expires_at,absolute_expires_at,ip_address,user_agent)
    VALUES($1,$2,$3,now()+($4||' hours')::interval,now()+($5||' days')::interval,$6,$7)`,
    [
      userId,
      sha256(token),
      version,
      idle,
      days,
      requestIp(request),
      request.headers.get("user-agent")?.slice(0, 1000),
    ],
  );
  return { token, maxAge: days * 86400 };
}

async function issueVerificationCode(
  userId: string,
  email: string,
  purpose: "registration" | "email_change",
  pendingEmail: string | null,
  ip: string | null,
) {
  const code = newCode();
  await transaction(userId, null, randomUUID(), async (c) => {
    const recent = await c.query(
      "SELECT 1 FROM app.email_verification_tokens WHERE user_id=$1 AND purpose=$2 AND last_sent_at>now()-interval '60 seconds' AND consumed_at IS NULL AND invalidated_at IS NULL",
      [userId, purpose],
    );
    if (recent.rowCount) throw new ApiError("RESEND_TOO_SOON", 429);
    await c.query(
      "UPDATE app.email_verification_tokens SET invalidated_at=now() WHERE user_id=$1 AND purpose=$2 AND consumed_at IS NULL AND invalidated_at IS NULL",
      [userId, purpose],
    );
    await c.query(
      "INSERT INTO app.email_verification_tokens(user_id,token_hash,requested_ip,expires_at,purpose,pending_email,last_sent_at) VALUES($1,$2,$3,now()+interval '15 minutes',$4,$5,now())",
      [userId, codeHash(code), ip, purpose, pendingEmail],
    );
  });
  try {
    await sendMail(verificationMail(email, code, purpose));
  } catch (error) {
    await query(
      "UPDATE app.email_verification_tokens SET invalidated_at=now() WHERE user_id=$1 AND purpose=$2 AND consumed_at IS NULL AND invalidated_at IS NULL",
      [userId, purpose],
    );
    throw error;
  }
}

export async function handleApi(request: Request): Promise<Response | null> {
  const url = new URL(request.url);
  if (!url.pathname.startsWith("/api/")) return null;
  const requestId = randomUUID();
  try {
    assertSameOrigin(request);
    const operationsResponse = await handleOperationsRequest(request);
    if (operationsResponse) return operationsResponse;
    if (url.pathname === "/api/auth/google" && request.method === "GET") {
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
    if (url.pathname === "/api/auth/google/callback" && request.method === "GET") {
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
      if (
        !profile?.sub ||
        !profile.email ||
        !profile.email_verified ||
        profile.nonce !== saved.nonce
      )
        throw new ApiError("GOOGLE_IDENTITY_INVALID", 401);
      const email = normalizeEmail(profile.email);
      const login = await transaction(null, null, requestId, async (c) => {
        const identity = await c.query<{ user_id: string; status: string }>(
          `SELECT o.user_id,u.status FROM app.oauth_accounts o JOIN app.users u ON u.id=o.user_id WHERE o.provider='google' AND o.provider_account_id=$1 FOR UPDATE OF o,u`,
          [profile.sub],
        );
        let userId = identity.rows[0]?.user_id;
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
        await c.query("UPDATE app.users SET last_login_at=now() WHERE id=$1", [userId]);
        const credential = await c.query<{ credential_version: number }>(
          "SELECT credential_version FROM app.password_credentials WHERE user_id=$1",
          [userId],
        );
        return createSession(c, userId, credential.rows[0]?.credential_version ?? 1, request);
      });
      const headers = new Headers({
        location: safeRedirect(saved.redirect),
        "cache-control": "no-store",
      });
      headers.append("set-cookie", clearOauth);
      headers.append("set-cookie", sessionCookie(login.token, login.maxAge));
      return new Response(null, { status: 302, headers });
    }
    if (url.pathname === "/api/auth/register" && request.method === "POST") {
      const b = await parseBody(request, schemas.register),
        email = normalizeEmail(b.email);
      const rate = await enforceRateLimit(request, "login", email, 5, 30);
      const user = await transaction(null, null, requestId, async (c) => {
        const exists = await c.query("SELECT 1 FROM app.users WHERE email=$1", [email]);
        if (exists.rowCount) throw new Error("EMAIL_EXISTS");
        const u = await c.query<{ user_id: string }>(
          `INSERT INTO app.users(email,email_verified_at,full_name_en,full_name_ar,status) VALUES($1,NULL,$2,$3,'pending')
          RETURNING id AS user_id,email,full_name_en,full_name_ar`,
          [email, b.fullNameEn.trim(), b.fullNameAr.trim()],
        );
        await c.query("INSERT INTO app.password_credentials(user_id,password_hash) VALUES($1,$2)", [
          u.rows[0].user_id,
          await argon2.hash(b.password, { type: argon2.argon2id }),
        ]);
        await c.query(
          "INSERT INTO app.auth_attempts(user_id,attempt_type,identifier_hash,ip_address,succeeded) VALUES($1,'login',$2,$3,true)",
          [u.rows[0].user_id, rate.hash, rate.ip],
        );
        return u.rows[0];
      });
      await issueVerificationCode(user.user_id, email, "registration", null, rate.ip);
      return json({ verificationRequired: true, email }, 201);
    }
    if (url.pathname === "/api/auth/email-verification/resend" && request.method === "POST") {
      const b = await parseBody(request, schemas.resendCode),
        email = normalizeEmail(b.email),
        rate = await enforceRateLimit(request, "email_verification", email, 5, 30);
      const user = await query<{ id: string }>(
        "SELECT id FROM app.users WHERE email=$1 AND status='pending'",
        [email],
      );
      if (user.rowCount)
        await issueVerificationCode(user.rows[0].id, email, "registration", null, rate.ip);
      return json({ ok: true });
    }
    if (url.pathname === "/api/auth/email-verification/confirm" && request.method === "POST") {
      const b = await parseBody(request, schemas.emailCode),
        email = normalizeEmail(b.email);
      const rate = await enforceRateLimit(request, "email_verification", email, 8, 30);
      const verified = await transaction(null, null, requestId, async (c) => {
        const token = await c.query<{ id: string; user_id: string }>(
          `SELECT t.id,t.user_id FROM app.email_verification_tokens t JOIN app.users u ON u.id=t.user_id WHERE u.email=$1 AND u.status='pending' AND t.purpose='registration' AND t.token_hash=$2 AND t.consumed_at IS NULL AND t.invalidated_at IS NULL AND t.expires_at>now() FOR UPDATE`,
          [email, codeHash(b.code)],
        );
        if (!token.rowCount) return false;
        await c.query("UPDATE app.email_verification_tokens SET consumed_at=now() WHERE id=$1", [
          token.rows[0].id,
        ]);
        await c.query(
          "UPDATE app.email_verification_tokens SET invalidated_at=now() WHERE user_id=$1 AND id<>$2 AND consumed_at IS NULL AND invalidated_at IS NULL",
          [token.rows[0].user_id, token.rows[0].id],
        );
        const u = await c.query<Session & { credential_version: number }>(
          `UPDATE app.users SET email_verified_at=now(),status='active' WHERE id=$1 RETURNING id AS user_id,email,full_name_en,full_name_ar`,
          [token.rows[0].user_id],
        );
        const credential = await c.query<{ credential_version: number }>(
          "SELECT credential_version FROM app.password_credentials WHERE user_id=$1",
          [token.rows[0].user_id],
        );
        return {
          user: u.rows[0],
          session: await createSession(
            c,
            token.rows[0].user_id,
            credential.rows[0].credential_version,
            request,
          ),
        };
      });
      await query(
        "INSERT INTO app.auth_attempts(user_id,attempt_type,identifier_hash,ip_address,succeeded) VALUES($1,'email_verification',$2,$3,$4)",
        [verified ? verified.user.user_id : null, rate.hash, rate.ip, !!verified],
      );
      return verified
        ? json({ user: userDto(verified.user), createdAt: new Date().toISOString() }, 200, {
            "set-cookie": sessionCookie(verified.session.token, verified.session.maxAge),
          })
        : json({ code: "INVALID_OR_EXPIRED_CODE" }, 400);
    }
    if (url.pathname === "/api/auth/password-reset/request" && request.method === "POST") {
      const b = await parseBody(request, schemas.resetRequest),
        email = normalizeEmail(b.email);
      const rate = await enforceRateLimit(request, "password_reset", email, 5, 30),
        token = randomBytes(32).toString("base64url");
      const user = await query<{ id: string }>(
        "SELECT id FROM app.users WHERE email=$1 AND status='active'",
        [email],
      );
      if (user.rowCount) {
        await query(
          "UPDATE app.password_reset_tokens SET invalidated_at=now() WHERE user_id=$1 AND consumed_at IS NULL AND invalidated_at IS NULL",
          [user.rows[0].id],
        );
        await query(
          "INSERT INTO app.password_reset_tokens(user_id,token_hash,requested_ip,expires_at) VALUES($1,$2,$3,now()+interval '30 minutes')",
          [user.rows[0].id, sha256(token), rate.ip],
        );
        try {
          await sendMail(passwordResetMail(email, token));
        } catch (error) {
          console.error("Password reset email delivery failed", error);
        }
      }
      await query(
        "INSERT INTO app.auth_attempts(user_id,attempt_type,identifier_hash,ip_address,succeeded) VALUES($1,'password_reset',$2,$3,true)",
        [user.rows[0]?.id ?? null, rate.hash, rate.ip],
      );
      return json({ ok: true });
    }
    if (url.pathname === "/api/auth/password-reset/confirm" && request.method === "POST") {
      const b = await parseBody(request, schemas.resetConfirm);
      const rate = await enforceRateLimit(request, "password_reset", b.token, 8, 30);
      const reset = await transaction(null, null, requestId, async (c) => {
        const token = await c.query<{ id: string; user_id: string }>(
          `SELECT id,user_id FROM app.password_reset_tokens WHERE token_hash=$1 AND consumed_at IS NULL AND invalidated_at IS NULL AND expires_at>now() FOR UPDATE`,
          [sha256(b.token)],
        );
        if (!token.rowCount) return false;
        await c.query("UPDATE app.password_reset_tokens SET consumed_at=now() WHERE id=$1", [
          token.rows[0].id,
        ]);
        await c.query(
          "UPDATE app.password_credentials SET password_hash=$2,credential_version=credential_version+1,password_changed_at=now() WHERE user_id=$1",
          [token.rows[0].user_id, await argon2.hash(b.password, { type: argon2.argon2id })],
        );
        await c.query(
          "UPDATE app.sessions SET revoked_at=now(),revocation_reason='password_reset' WHERE user_id=$1 AND revoked_at IS NULL",
          [token.rows[0].user_id],
        );
        return true;
      });
      await query(
        "INSERT INTO app.auth_attempts(attempt_type,identifier_hash,ip_address,succeeded) VALUES('password_reset',$1,$2,$3)",
        [rate.hash, rate.ip, reset],
      );
      return reset ? json({ ok: true }) : json({ code: "INVALID_OR_EXPIRED_TOKEN" }, 400);
    }
    if (url.pathname === "/api/auth/login" && request.method === "POST") {
      const b = await parseBody(request, schemas.login),
        email = normalizeEmail(b.email);
      const rate = await enforceRateLimit(request, "login", email);
      const found = await query<
        Session & { password_hash: string; credential_version: number; status: string }
      >(
        `SELECT u.id user_id,u.email,u.full_name_en,u.full_name_ar,u.status,p.password_hash,p.credential_version
        FROM app.users u JOIN app.password_credentials p ON p.user_id=u.id WHERE u.email=$1 AND u.status IN ('active','pending')`,
        [email],
      );
      const u = found.rows[0];
      const valid = !!u && (await argon2.verify(u.password_hash, b.password));
      await query(
        "INSERT INTO app.auth_attempts(user_id,attempt_type,identifier_hash,ip_address,succeeded) VALUES($1,'login',$2,$3,$4)",
        [u?.user_id ?? null, rate.hash, rate.ip, valid],
      );
      if (!valid || !u) return json({ code: "INVALID_CREDENTIALS" }, 401);
      if (u.status === "pending") {
        try {
          await issueVerificationCode(u.user_id, email, "registration", null, rate.ip);
        } catch (error) {
          if (!(error instanceof ApiError && error.code === "RESEND_TOO_SOON")) throw error;
        }
        return json({ code: "EMAIL_NOT_VERIFIED" }, 403);
      }
      const s = await transaction(u.user_id, null, requestId, (c) =>
        createSession(c, u.user_id, u.credential_version, request),
      );
      return json({ user: userDto(u), createdAt: new Date().toISOString() }, 200, {
        "set-cookie": sessionCookie(s.token, s.maxAge),
      });
    }
    const publicTreePreview = url.pathname.match(
      /^\/api\/trees\/([0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12})\/preview$/i,
    );
    if (publicTreePreview && request.method === "GET")
      return json(await readPublicSnapshot(publicTreePreview[1]));
    const session = await authenticate(request);
    if (url.pathname === "/api/auth/session" && request.method === "GET")
      return json(session ? { user: userDto(session), createdAt: new Date().toISOString() } : null);
    if (!session) return json({ code: "UNAUTHENTICATED" }, 401);
    if (url.pathname === "/api/auth/logout" && request.method === "POST") {
      await query(
        "UPDATE app.sessions SET revoked_at=now(),revocation_reason='logout' WHERE id=$1",
        [session.id],
      );
      return json({ ok: true }, 200, { "set-cookie": sessionCookie("", 0) });
    }
    if (url.pathname === "/api/profile/email-change/request" && request.method === "POST") {
      const b = await parseBody(request, schemas.emailChangeRequest),
        email = normalizeEmail(b.email);
      const rate = await enforceRateLimit(
        request,
        "email_verification",
        `${session.user_id}:${email}`,
        5,
        30,
      );
      if (email === session.email) return json({ code: "EMAIL_UNCHANGED" }, 400);
      const exists = await query("SELECT 1 FROM app.users WHERE email=$1", [email]);
      if (exists.rowCount) return json({ code: "EMAIL_EXISTS" }, 409);
      const credential = await query<{ password_hash: string }>(
        "SELECT password_hash FROM app.password_credentials WHERE user_id=$1",
        [session.user_id],
      );
      if (
        !credential.rowCount ||
        !(await argon2.verify(credential.rows[0].password_hash, b.currentPassword))
      )
        return json({ code: "INVALID_CREDENTIALS" }, 401);
      await issueVerificationCode(session.user_id, email, "email_change", email, rate.ip);
      return json({ ok: true, email });
    }
    if (url.pathname === "/api/profile/email-change/confirm" && request.method === "POST") {
      const b = await parseBody(request, schemas.emailChangeConfirm);
      const rate = await enforceRateLimit(request, "email_verification", session.user_id, 8, 30);
      const changed = await transaction(session.user_id, session.id, requestId, async (c) => {
        const token = await c.query<{ id: string; pending_email: string }>(
          `SELECT id,pending_email FROM app.email_verification_tokens WHERE user_id=$1 AND purpose='email_change' AND token_hash=$2 AND consumed_at IS NULL AND invalidated_at IS NULL AND expires_at>now() FOR UPDATE`,
          [session.user_id, codeHash(b.code)],
        );
        if (!token.rowCount) return null;
        const duplicate = await c.query("SELECT 1 FROM app.users WHERE email=$1 AND id<>$2", [
          token.rows[0].pending_email,
          session.user_id,
        ]);
        if (duplicate.rowCount) throw new Error("EMAIL_EXISTS");
        await c.query("UPDATE app.email_verification_tokens SET consumed_at=now() WHERE id=$1", [
          token.rows[0].id,
        ]);
        await c.query(
          "UPDATE app.email_verification_tokens SET invalidated_at=now() WHERE user_id=$1 AND id<>$2 AND consumed_at IS NULL AND invalidated_at IS NULL",
          [session.user_id, token.rows[0].id],
        );
        return (
          await c.query<Session>(
            "UPDATE app.users SET email=$2,email_verified_at=now() WHERE id=$1 RETURNING id AS user_id,email,full_name_en,full_name_ar",
            [session.user_id, token.rows[0].pending_email],
          )
        ).rows[0];
      });
      await query(
        "INSERT INTO app.auth_attempts(user_id,attempt_type,identifier_hash,ip_address,succeeded) VALUES($1,'email_verification',$2,$3,$4)",
        [session.user_id, rate.hash, rate.ip, !!changed],
      );
      return changed
        ? json({ user: userDto(changed), createdAt: new Date().toISOString() })
        : json({ code: "INVALID_OR_EXPIRED_CODE" }, 400);
    }
    if (url.pathname === "/api/auth/sessions" && request.method === "GET") {
      const r = await query(
        `SELECT id,created_at,last_seen_at,idle_expires_at,absolute_expires_at,revoked_at,ip_address,user_agent FROM app.sessions WHERE user_id=$1 ORDER BY created_at DESC`,
        [session.user_id],
      );
      return json(r.rows);
    }
    const revokeSession = url.pathname.match(/^\/api\/auth\/sessions\/([0-9a-f-]+)$/);
    if (revokeSession && request.method === "DELETE") {
      await query(
        "UPDATE app.sessions SET revoked_at=now(),revocation_reason='user_revoked' WHERE id=$1 AND user_id=$2 AND revoked_at IS NULL",
        [revokeSession[1], session.user_id],
      );
      return json({ ok: true });
    }
    if (url.pathname === "/api/trees" && request.method === "GET") {
      const r = await transaction(session.user_id, session.id, requestId, (c) =>
        c.query(`WITH RECURSIVE visible_trees AS (
          SELECT t.id FROM app.family_trees t
          WHERE t.deleted_at IS NULL AND app.can_view_tree(t.id)
        ), visible_members AS (
          SELECT m.id,m.tree_id FROM app.family_members m
          JOIN visible_trees t ON t.id=m.tree_id
          WHERE m.deleted_at IS NULL
        ), lineage AS (
          SELECT m.tree_id,m.id,1 AS depth,ARRAY[m.id] AS path FROM visible_members m
          UNION ALL
          SELECT l.tree_id,child.id,l.depth+1,l.path || child.id
          FROM lineage l
          JOIN app.parent_child_relationships relationship
            ON relationship.tree_id=l.tree_id AND relationship.parent_id=l.id
            AND relationship.deleted_at IS NULL
          JOIN visible_members child
            ON child.tree_id=relationship.tree_id AND child.id=relationship.child_id
          WHERE NOT child.id=ANY(l.path)
        ), tree_stats AS (
          SELECT m.tree_id,count(*)::integer AS members,
            coalesce((SELECT max(l.depth) FROM lineage l WHERE l.tree_id=m.tree_id),0)::integer AS generations
          FROM visible_members m GROUP BY m.tree_id
        )
        SELECT t.id,t.name_en,t.name_ar,coalesce(t.description_en,'') description_en,
          coalesce(t.description_ar,'') description_ar,t.color,t.updated_at,
          coalesce(s.members,0)::integer AS members,coalesce(s.generations,0)::integer AS generations
        FROM visible_trees visible
        JOIN app.family_trees t ON t.id=visible.id
        LEFT JOIN tree_stats s ON s.tree_id=t.id
        ORDER BY t.updated_at DESC`),
      );
      return json(r.rows);
    }
    if (url.pathname === "/api/trees" && request.method === "POST") {
      const b = await parseBody(request, schemas.tree);
      const r = await transaction(session.user_id, session.id, requestId, async (c) => {
        const t = await c.query(
          `INSERT INTO app.family_trees(owner_user_id,name_en,name_ar,description_en,description_ar,color) VALUES($1,$2,$3,$4,$5,$6) RETURNING *`,
          [
            session.user_id,
            b.name_en,
            b.name_ar || null,
            b.description_en || null,
            b.description_ar || null,
            b.color || null,
          ],
        );
        await c.query(
          "INSERT INTO app.tree_memberships(tree_id,user_id,role) VALUES($1,$2,'owner')",
          [t.rows[0].id, session.user_id],
        );
        return t.rows[0];
      });
      return json(r, 201);
    }
    const snapshotMatch = url.pathname.match(/^\/api\/trees\/([0-9a-f-]+)\/snapshot$/);
    if (snapshotMatch && request.method === "GET")
      return json(await readSnapshot(session, requestId, snapshotMatch[1]));
    if (snapshotMatch && request.method === "PUT")
      return json(
        await importSnapshot(
          session,
          requestId,
          snapshotMatch[1],
          await parseBody(request, schemas.snapshot),
        ),
      );
    const grantsMatch = url.pathname.match(/^\/api\/trees\/([0-9a-f-]+)\/branch-grants$/);
    if (grantsMatch && request.method === "GET") {
      const r = await transaction(session.user_id, session.id, requestId, async (c) => {
        const allowed = await c.query(
          "SELECT 1 FROM app.tree_memberships WHERE tree_id=$1 AND user_id=$2 AND role IN ('owner','administrator') AND revoked_at IS NULL",
          [grantsMatch[1], session.user_id],
        );
        if (!allowed.rowCount) throw new Error("FORBIDDEN");
        return c.query(
          "SELECT id,user_id,root_subfamily_id,role,can_read_contacts,can_write_contacts,granted_at,expires_at FROM app.branch_grants WHERE tree_id=$1 AND revoked_at IS NULL",
          [grantsMatch[1]],
        );
      });
      return json(r.rows);
    }
    if (grantsMatch && request.method === "POST") {
      const b = await parseBody(request, schemas.branchGrant);
      const r = await transaction(session.user_id, session.id, requestId, async (c) => {
        const allowed = await c.query(
          "SELECT 1 FROM app.tree_memberships WHERE tree_id=$1 AND user_id=$2 AND role IN ('owner','administrator') AND revoked_at IS NULL",
          [grantsMatch[1], session.user_id],
        );
        if (!allowed.rowCount) throw new Error("FORBIDDEN");
        return (
          await c.query(
            `INSERT INTO app.branch_grants(user_id,tree_id,root_subfamily_id,role,can_read_contacts,can_write_contacts,granted_by,expires_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
            [
              b.userId,
              grantsMatch[1],
              b.rootSubfamilyId,
              b.role,
              b.canReadContacts,
              b.canWriteContacts,
              session.user_id,
              b.expiresAt ?? null,
            ],
          )
        ).rows[0];
      });
      return json(r, 201);
    }
    const contactsMatch = url.pathname.match(
      /^\/api\/trees\/([0-9a-f-]+)\/members\/([0-9a-f-]+)\/contacts$/,
    );
    if (contactsMatch && request.method === "GET") {
      const r = await transaction(session.user_id, session.id, requestId, async (c) => {
        const allowed = await c.query<{ allowed: boolean }>(
          "SELECT app.can_read_contacts($1,$2) allowed",
          [contactsMatch[1], contactsMatch[2]],
        );
        if (!allowed.rows[0]?.allowed) throw new Error("FORBIDDEN");
        return c.query(
          "SELECT id,contact_type,display_value,label,address,is_primary,verified_at FROM app.member_contacts WHERE tree_id=$1 AND member_id=$2 AND deleted_at IS NULL",
          [contactsMatch[1], contactsMatch[2]],
        );
      });
      return json(r.rows);
    }
    if (contactsMatch && request.method === "POST") {
      const b = await parseBody(request, schemas.contact);
      const r = await transaction(session.user_id, session.id, requestId, async (c) => {
        const allowed = await c.query<{ allowed: boolean }>(
          "SELECT app.can_write_contacts($1,$2) allowed",
          [contactsMatch[1], contactsMatch[2]],
        );
        if (!allowed.rows[0]?.allowed) throw new Error("FORBIDDEN");
        return (
          await c.query(
            `INSERT INTO app.member_contacts(tree_id,member_id,contact_type,normalized_value,display_value,label,address,is_primary,created_by,updated_by) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$9) RETURNING id,contact_type,display_value,label,address,is_primary`,
            [
              contactsMatch[1],
              contactsMatch[2],
              b.contactType,
              b.normalizedValue ?? null,
              b.displayValue,
              b.label ?? null,
              b.address ?? null,
              b.isPrimary,
              session.user_id,
            ],
          )
        ).rows[0];
      });
      return json(r, 201);
    }
    const treeMatch = url.pathname.match(/^\/api\/trees\/([0-9a-f-]+)$/);
    if (treeMatch && request.method === "PATCH") {
      const b = await parseBody(request, schemas.tree);
      const r = await transaction(session.user_id, session.id, requestId, async (c) => {
        const allowed = await c.query(
          "SELECT 1 FROM app.tree_memberships WHERE tree_id=$1 AND user_id=$2 AND role IN ('owner','administrator') AND revoked_at IS NULL",
          [treeMatch[1], session.user_id],
        );
        if (!allowed.rowCount) throw new Error("FORBIDDEN");
        return (
          await c.query(
            `UPDATE app.family_trees SET name_en=$2,name_ar=$3,description_en=$4,description_ar=$5 WHERE id=$1 RETURNING *`,
            [
              treeMatch[1],
              b.name_en,
              b.name_ar || null,
              b.description_en || null,
              b.description_ar || null,
            ],
          )
        ).rows[0];
      });
      return json(r);
    }
    if (treeMatch && request.method === "DELETE") {
      await transaction(session.user_id, session.id, requestId, async (c) => {
        const allowed = await c.query(
          "SELECT 1 FROM app.tree_memberships WHERE tree_id=$1 AND user_id=$2 AND role='owner' AND revoked_at IS NULL",
          [treeMatch[1], session.user_id],
        );
        if (!allowed.rowCount) throw new Error("FORBIDDEN");
        await c.query("UPDATE app.family_trees SET deleted_at=now() WHERE id=$1", [treeMatch[1]]);
      });
      return json({ ok: true });
    }
    if (url.pathname === "/api/migration/status") {
      const r = await query<{ count: string }>(
        "SELECT count(*)::text count FROM app.import_id_map WHERE import_batch_id=$1",
        [url.searchParams.get("batchId")],
      );
      return json({ mapped: Number(r.rows[0]?.count ?? 0) });
    }
    return json({ code: "NOT_FOUND" }, 404);
  } catch (error) {
    logError("API request failed", error, {
      requestId,
      method: request.method,
      path: url.pathname,
    });
    if (url.pathname === "/api/auth/google/callback")
      return new Response(null, {
        status: 302,
        headers: {
          location: "/auth?oauth_error=failed",
          "set-cookie": oauthCookie("", 0),
          "cache-control": "no-store",
        },
      });
    const message = error instanceof Error ? error.message : "INTERNAL_ERROR";
    if (error instanceof ApiError) return json({ code: error.code, requestId }, error.status);
    const databaseError =
      typeof error === "object" && error !== null
        ? (error as { code?: string; constraint?: string })
        : null;
    if (
      message === "EMAIL_EXISTS" ||
      (databaseError?.code === "23505" && databaseError.constraint === "users_email_uq")
    )
      return json({ code: "EMAIL_EXISTS" }, 409);
    if (message === "MAIL_NOT_CONFIGURED" || message === "MAIL_DELIVERY_FAILED")
      return json({ code: "DELIVERY_FAILED" }, 503);
    if (message === "DATABASE_NOT_CONFIGURED") return json({ code: message }, 503);
    if (message === "FORBIDDEN") return json({ code: message }, 403);
    return json({ code: "INTERNAL_ERROR", requestId }, 500);
  }
}
