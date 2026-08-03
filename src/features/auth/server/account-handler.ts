import argon2 from "argon2";
import { query, transaction } from "@/shared/server/database";
import { jsonResponse as json } from "@/shared/http/response";
import { ApiError, enforceRateLimit, parseBody, requestIp, schemas } from "@/server/security";
import {
  canDeleteContributorAccount,
  deleteContributorIdentity,
  provisionOwnedTree,
} from "@/features/collaboration/server";
import { hashEmailCode as codeHash, normalizeEmail } from "./auth-crypto";
import { sessionCookie } from "./auth-cookies";
import { authSessionDto, type Session } from "./session-service";
import { issueVerificationCode } from "./verification-service";

export async function handleAccountRequest(
  request: Request,
  url: URL,
  session: Session,
  requestId: string,
): Promise<Response | undefined> {
  if (url.pathname === "/api/profile/email-change/request" && request.method === "POST")
    return requestEmailChange(request, session);
  if (url.pathname === "/api/profile" && request.method === "PATCH")
    return updateProfile(request, session, requestId);
  if (url.pathname === "/api/profile/deletion-code/request" && request.method === "POST")
    return requestDeletionCode(request, session, requestId);
  if (url.pathname === "/api/profile" && request.method === "DELETE")
    return deleteAccount(request, session, requestId);
  if (url.pathname === "/api/profile/email-change/confirm" && request.method === "POST")
    return confirmEmailChange(request, session, requestId);
  return undefined;
}

async function requestEmailChange(request: Request, session: Session): Promise<Response> {
  const b = await parseBody(request, schemas.emailChangeRequest),
    email = normalizeEmail(b.email);
  const owner = await query(
    `SELECT 1 FROM app.tree_memberships
         WHERE user_id=$1 AND role='owner' AND revoked_at IS NULL`,
    [session.user_id],
  );
  if (!owner.rowCount) return json({ code: "CONTRIBUTOR_EMAIL_CHANGE_FORBIDDEN" }, 403);
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
    return json({ code: "INCORRECT_PASSWORD" }, 401);
  await issueVerificationCode(session.user_id, email, "email_change", email, rate.ip);
  return json({ ok: true, email });
}

async function updateProfile(
  request: Request,
  session: Session,
  requestId: string,
): Promise<Response> {
  const body = await parseBody(request, schemas.profileNames);
  const completedGender = body.gender ?? session.profile_gender;
  if (!completedGender) throw new ApiError("INVALID_INPUT");
  const updated = await transaction(session.user_id, session.id, requestId, async (client) => {
    const profile = await client.query<Session>(
      `UPDATE app.users SET full_name_en=$2,full_name_ar=$3,
               profile_gender=COALESCE($4::app.gender,profile_gender),updated_at=now()
             WHERE id=$1 AND status='active'
             RETURNING id AS user_id,email,full_name_en,full_name_ar,profile_gender`,
      [session.user_id, body.fullNameEn, body.fullNameAr, completedGender],
    );
    if (body.gender)
      await client.query(
        `UPDATE app.family_members SET gender=$2,updated_by=$1,updated_at=now(),
                 version=version+1
               WHERE linked_user_id=$1 AND deleted_at IS NULL AND gender<>$2`,
        [session.user_id, body.gender],
      );
    if (!session.profile_gender) {
      const account = profile.rows[0];
      await provisionOwnedTree(client, {
        id: account.user_id,
        email: account.email,
        full_name_en: account.full_name_en,
        full_name_ar: account.full_name_ar,
        profile_gender: completedGender,
      });
    }
    return profile;
  });
  return json(await authSessionDto(updated.rows[0], requestId));
}

async function requestDeletionCode(
  request: Request,
  session: Session,
  requestId: string,
): Promise<Response> {
  await parseBody(request, schemas.deleteContributorAccountRequest);
  const roles = await transaction(session.user_id, session.id, requestId, async (client) => {
    const membership = await client.query<{ role: string }>(
      `SELECT role FROM app.tree_memberships
           WHERE user_id=$1 AND revoked_at IS NULL FOR UPDATE`,
      [session.user_id],
    );
    if (!canDeleteContributorAccount(membership.rows.map(({ role }) => role)))
      throw new ApiError("OWNER_ACCOUNT_DELETE_FORBIDDEN", 403);
    return membership.rows;
  });
  if (!roles.length) throw new ApiError("CONTRIBUTOR_ACCOUNT_DELETE_FORBIDDEN", 403);
  const token = await issueVerificationCode(
    session.user_id,
    session.email,
    "account_deletion",
    null,
    requestIp(request),
  );
  return json({ expiresAt: token.expires_at }, 201);
}

async function deleteAccount(
  request: Request,
  session: Session,
  requestId: string,
): Promise<Response> {
  const body = await parseBody(request, schemas.deleteContributorAccount);
  const rate = await enforceRateLimit(request, "email_verification", session.user_id, 8, 30);
  const deleted = await transaction(session.user_id, session.id, requestId, async (client) => {
    const membership = await client.query<{ role: string }>(
      `SELECT role FROM app.tree_memberships
           WHERE user_id=$1 AND revoked_at IS NULL FOR UPDATE`,
      [session.user_id],
    );
    if (!canDeleteContributorAccount(membership.rows.map(({ role }) => role)))
      throw new ApiError("OWNER_ACCOUNT_DELETE_FORBIDDEN", 403);
    const token = await client.query<{ id: string }>(
      `SELECT id FROM app.email_verification_tokens
           WHERE user_id=$1 AND purpose='account_deletion' AND token_hash=$2
             AND consumed_at IS NULL AND invalidated_at IS NULL AND expires_at>now()
           FOR UPDATE`,
      [session.user_id, codeHash(body.code)],
    );
    if (!token.rowCount) return false;
    await client.query("UPDATE app.email_verification_tokens SET consumed_at=now() WHERE id=$1", [
      token.rows[0].id,
    ]);
    const recordedActivity = await client.query(
      `INSERT INTO app.tree_activity(
             tree_id,branch_id,actor_user_id,subject_user_id,
             action_type,target_type,target_id
           )
           SELECT m.tree_id,g.root_subfamily_id,$1,$1,
             'contributor_account_deleted','user',$1
           FROM app.tree_memberships m
           LEFT JOIN LATERAL (
             SELECT root_subfamily_id FROM app.branch_grants
             WHERE tree_id=m.tree_id AND user_id=m.user_id AND revoked_at IS NULL
             ORDER BY granted_at DESC LIMIT 1
           ) g ON true
           WHERE m.user_id=$1 AND m.role<>'owner' AND m.revoked_at IS NULL`,
      [session.user_id],
    );
    if (!recordedActivity.rowCount)
      throw new ApiError("ACCOUNT_CANCELLATION_ACTIVITY_NOT_RECORDED", 500);
    await deleteContributorIdentity(client, session.user_id, session.user_id);
    return true;
  });
  await query(
    "INSERT INTO app.auth_attempts(user_id,attempt_type,identifier_hash,ip_address,succeeded) VALUES($1,'email_verification',$2,$3,$4)",
    [session.user_id, rate.hash, rate.ip, deleted],
  );
  return deleted
    ? json({ ok: true }, 200, { "set-cookie": sessionCookie("", 0) })
    : json({ code: "INVALID_OR_EXPIRED_CODE" }, 400);
}

async function confirmEmailChange(
  request: Request,
  session: Session,
  requestId: string,
): Promise<Response> {
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
        "UPDATE app.users SET email=$2,email_verified_at=now() WHERE id=$1 RETURNING id AS user_id,email,full_name_en,full_name_ar,profile_gender",
        [session.user_id, token.rows[0].pending_email],
      )
    ).rows[0];
  });
  await query(
    "INSERT INTO app.auth_attempts(user_id,attempt_type,identifier_hash,ip_address,succeeded) VALUES($1,'email_verification',$2,$3,$4)",
    [session.user_id, rate.hash, rate.ip, !!changed],
  );
  return changed
    ? json(await authSessionDto(changed, requestId))
    : json({ code: "INVALID_OR_EXPIRED_CODE" }, 400);
}
