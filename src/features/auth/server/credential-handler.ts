import { randomBytes } from "node:crypto";
import argon2 from "argon2";
import { query, transaction } from "@/shared/server/database";
import { passwordResetMail, sendMail } from "@/shared/server/email";
import { jsonResponse as json } from "@/shared/http/response";
import { ApiError, enforceRateLimit, parseBody, schemas } from "@/server/security";
import { hashSessionToken as sha256, normalizeEmail } from "./auth-crypto";
import { sessionCookie } from "./auth-cookies";
import { authSessionDto, createSession, type Session } from "./session-service";
import { issueVerificationCode } from "./verification-service";

export async function handleCredentialRequest(
  request: Request,
  url: URL,
  requestId: string,
): Promise<Response | undefined> {
  if (url.pathname === "/api/auth/password-reset/request" && request.method === "POST")
    return requestPasswordReset(request);
  if (url.pathname === "/api/auth/password-reset/confirm" && request.method === "POST")
    return confirmPasswordReset(request, requestId);
  if (url.pathname === "/api/auth/login" && request.method === "POST")
    return loginWithPassword(request, requestId);
  return undefined;
}

async function requestPasswordReset(request: Request): Promise<Response> {
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

async function confirmPasswordReset(request: Request, requestId: string): Promise<Response> {
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
      `INSERT INTO app.password_credentials AS credentials(user_id,password_hash)
           VALUES($1,$2)
           ON CONFLICT (user_id) DO UPDATE SET
             password_hash=EXCLUDED.password_hash,
             credential_version=credentials.credential_version+1,
             password_changed_at=now(),updated_at=now()`,
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

async function loginWithPassword(request: Request, requestId: string): Promise<Response> {
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
  return json(await authSessionDto(u, requestId), 200, {
    "set-cookie": sessionCookie(s.token, s.maxAge),
  });
}
