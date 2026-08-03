import argon2 from "argon2";
import { query, transaction } from "@/shared/server/database";
import { jsonResponse as json } from "@/shared/http/response";
import { ApiError, enforceRateLimit, parseBody, schemas } from "@/server/security";
import { acceptRegistrationInvitation, provisionOwnedTree } from "@/features/collaboration/server";
import {
  hashEmailCode as codeHash,
  hashSessionToken as sha256,
  normalizeEmail,
} from "./auth-crypto";
import { sessionCookie } from "./auth-cookies";
import { authSessionDto, createSession, type Session } from "./session-service";
import { issueVerificationCode } from "./verification-service";

export async function handleRegistrationRequest(
  request: Request,
  url: URL,
  requestId: string,
): Promise<Response | undefined> {
  if (url.pathname === "/api/auth/register" && request.method === "POST")
    return registerAccount(request, requestId);
  if (url.pathname === "/api/auth/email-verification/resend" && request.method === "POST")
    return resendVerification(request);
  if (url.pathname === "/api/auth/email-verification/confirm" && request.method === "POST")
    return confirmRegistration(request, requestId);
  return undefined;
}

async function registerAccount(request: Request, requestId: string): Promise<Response> {
  const b = await parseBody(request, schemas.register),
    email = normalizeEmail(b.email);
  const rate = await enforceRateLimit(request, "login", email, 5, 30);
  const user = await transaction(null, null, requestId, async (c) => {
    const exists = await c.query("SELECT 1 FROM app.users WHERE email=$1", [email]);
    if (exists.rowCount) throw new Error("EMAIL_EXISTS");
    let invitationId: string | null = null;
    if (b.invitationToken) {
      const invitation = await c.query<{ id: string }>(
        `SELECT app.registration_invitation_id($1,$2) id`,
        [sha256(b.invitationToken), email],
      );
      if (!invitation.rows[0]?.id) throw new ApiError("INVALID_INVITATION", 409);
      invitationId = invitation.rows[0].id;
    }
    const u = await c.query<{ user_id: string }>(
      `INSERT INTO app.users(
            email,email_verified_at,full_name_en,full_name_ar,profile_gender,status,
            registration_invitation_id
          ) VALUES($1,NULL,$2,$3,$4,'pending',$5)
          RETURNING id AS user_id,email,full_name_en,full_name_ar`,
      [email, b.fullNameEn.trim(), b.fullNameAr.trim(), b.gender, invitationId],
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

async function resendVerification(request: Request): Promise<Response> {
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

async function confirmRegistration(request: Request, requestId: string): Promise<Response> {
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
    const u = await c.query<
      Session & {
        credential_version: number;
        registration_invitation_id: string | null;
        profile_gender: "male" | "female";
      }
    >(
      `UPDATE app.users SET email_verified_at=now(),status='active'
           WHERE id=$1
           RETURNING id AS user_id,email,full_name_en,full_name_ar,profile_gender,
             registration_invitation_id`,
      [token.rows[0].user_id],
    );
    const account = {
      id: u.rows[0].user_id,
      email: u.rows[0].email,
      full_name_en: u.rows[0].full_name_en,
      full_name_ar: u.rows[0].full_name_ar,
      profile_gender: u.rows[0].profile_gender,
    };
    await c.query("SELECT app.set_request_context($1,NULL,$2)", [token.rows[0].user_id, requestId]);
    if (u.rows[0].registration_invitation_id)
      await acceptRegistrationInvitation(c, account, u.rows[0].registration_invitation_id);
    else await provisionOwnedTree(c, account);
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
    ? json(await authSessionDto(verified.user, requestId), 200, {
        "set-cookie": sessionCookie(verified.session.token, verified.session.maxAge),
      })
    : json({ code: "INVALID_OR_EXPIRED_CODE" }, 400);
}
