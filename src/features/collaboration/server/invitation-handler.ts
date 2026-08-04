import { randomBytes } from "node:crypto";

import { transaction } from "@/shared/server/database";
import { contributorInvitationMail, sendMail } from "@/shared/server/email";
import { jsonResponse as json } from "@/shared/http/response";
import { ApiError, parseBody, schemas } from "@/server/security";
import { collaborationTokenHash, normalizedInvitationEmail } from "./collaboration-crypto";
import { requireTreeOwner } from "./authorization";
import type { CollaborationSession } from "./types";

export async function handleInvitationRequest(
  request: Request,
  url: URL,
  session: CollaborationSession,
  requestId: string,
): Promise<Response | undefined> {
  const invitations = url.pathname.match(/^\/api\/trees\/([0-9a-f-]+)\/invitations$/);
  if (invitations && request.method === "GET")
    return listInvitations(invitations[1], session, requestId);
  if (invitations && request.method === "POST")
    return createInvitation(request, invitations[1], session, requestId);
  const cancel = url.pathname.match(/^\/api\/invitations\/([0-9a-f-]+)\/cancel$/);
  if (cancel && request.method === "POST") return cancelInvitation(cancel[1], session, requestId);
  const resend = url.pathname.match(/^\/api\/invitations\/([0-9a-f-]+)\/resend$/);
  if (resend && request.method === "POST") return resendInvitation(resend[1], session, requestId);
  return undefined;
}

async function listInvitations(
  treeId: string,
  session: CollaborationSession,
  requestId: string,
): Promise<Response> {
  const result = await transaction(session.user_id, session.id, requestId, async (client) => {
    await requireTreeOwner(client, treeId, session.user_id);
    return client.query(
      `SELECT i.id,i.branch_id,i.invited_name_en,i.invited_name_ar,i.invited_email,i.position_label,
          i.status,i.expires_at,i.created_at,b.name_en branch_name_en,b.name_ar branch_name_ar
         FROM app.contributor_invitations i JOIN app.subfamilies b ON b.id=i.branch_id
         WHERE i.tree_id=$1 ORDER BY i.created_at DESC`,
      [treeId],
    );
  });
  return json(result.rows);
}

async function createInvitation(
  request: Request,
  treeId: string,
  session: CollaborationSession,
  requestId: string,
): Promise<Response> {
  const body = await parseBody(request, schemas.invitation);
  const email = normalizedInvitationEmail(body.email);
  const token = randomBytes(32).toString("base64url");
  const created = await transaction(session.user_id, session.id, requestId, async (client) => {
    await requireTreeOwner(client, treeId, session.user_id);
    const existing = await client.query("SELECT 1 FROM app.users WHERE email=$1", [email]);
    if (existing.rowCount) throw new ApiError("INVITEE_ALREADY_REGISTERED", 409);
    const branch = (
      await client.query<{ name_en: string; tree_name: string }>(
        `SELECT b.name_en,t.name_en tree_name FROM app.subfamilies b
           JOIN app.family_trees t ON t.id=b.tree_id
           WHERE b.id=$1 AND b.tree_id=$2 AND b.status='active' AND b.deleted_at IS NULL`,
        [body.branchId, treeId],
      )
    ).rows[0];
    if (!branch) throw new ApiError("BRANCH_UNAVAILABLE", 409);
    const assigned = await client.query(
      `SELECT 1 FROM app.branch_grants WHERE tree_id=$1 AND root_subfamily_id=$2
         AND role='branch_editor' AND revoked_at IS NULL`,
      [treeId, body.branchId],
    );
    if (assigned.rowCount) throw new ApiError("BRANCH_ALREADY_ASSIGNED", 409);
    const member = (
      await client.query<{ name_en: string; name_ar: string; position_label: string | null }>(
        `SELECT
             COALESCE(NULLIF(name_en,''),name_ar) name_en,
             COALESCE(NULLIF(name_ar,''),name_en) name_ar,
             position_label
           FROM app.family_members
           WHERE id=$1 AND tree_id=$2 AND linked_user_id IS NULL AND deleted_at IS NULL`,
        [body.existingFamilyMemberId, treeId],
      )
    ).rows[0];
    if (!member) throw new ApiError("FAMILY_MEMBER_UNAVAILABLE", 409);
    const row = (
      await client.query(
        `INSERT INTO app.contributor_invitations(
            tree_id,branch_id,inviter_user_id,invited_name_en,invited_name_ar,
            invited_email,position_label,existing_family_member_id,token_hash,expires_at
          ) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,now()+interval '7 days') RETURNING *`,
        [
          treeId,
          body.branchId,
          session.user_id,
          member.name_en,
          member.name_ar,
          email,
          member.position_label,
          body.existingFamilyMemberId,
          collaborationTokenHash(token),
        ],
      )
    ).rows[0];
    await client.query(
      `INSERT INTO app.tree_activity(
           tree_id,branch_id,actor_user_id,action_type,target_type,target_id,
           subject_name_en,subject_name_ar,target_name_en,target_name_ar
         ) VALUES($1,$2,$3,'invitation_sent','invitation',$4,$5,$6,$7,$8)`,
      [
        treeId,
        body.branchId,
        session.user_id,
        row.id,
        member.name_en,
        member.name_ar,
        branch.name_en,
        null,
      ],
    );
    return { row, branch };
  });
  await sendMail(
    contributorInvitationMail(email, token, created.branch.tree_name, created.branch.name_en),
  );
  return json(created.row, 201);
}

async function cancelInvitation(
  invitationId: string,
  session: CollaborationSession,
  requestId: string,
): Promise<Response> {
  await transaction(session.user_id, session.id, requestId, async (client) => {
    const invitation = (
      await client.query<{
        tree_id: string;
        branch_id: string;
        invited_name_en: string;
        invited_name_ar: string;
      }>(
        `SELECT tree_id,branch_id,invited_name_en,invited_name_ar
           FROM app.contributor_invitations WHERE id=$1`,
        [invitationId],
      )
    ).rows[0];
    if (!invitation) throw new ApiError("NOT_FOUND", 404);
    await requireTreeOwner(client, invitation.tree_id, session.user_id);
    const cancelled = await client.query(
      `UPDATE app.contributor_invitations SET status='cancelled',updated_at=now()
         WHERE id=$1 AND status='pending' RETURNING id`,
      [invitationId],
    );
    if (!cancelled.rowCount) throw new ApiError("INVALID_INVITATION", 409);
    await client.query(
      `INSERT INTO app.tree_activity(
           tree_id,branch_id,actor_user_id,action_type,target_type,target_id,
           subject_name_en,subject_name_ar
         ) VALUES($1,$2,$3,'invitation_cancelled','invitation',$4,$5,$6)`,
      [
        invitation.tree_id,
        invitation.branch_id,
        session.user_id,
        invitationId,
        invitation.invited_name_en,
        invitation.invited_name_ar,
      ],
    );
  });
  return json({ ok: true });
}

async function resendInvitation(
  invitationId: string,
  session: CollaborationSession,
  requestId: string,
): Promise<Response> {
  const token = randomBytes(32).toString("base64url");
  const invitation = await transaction(session.user_id, session.id, requestId, async (client) => {
    const row = (
      await client.query<{
        tree_id: string;
        branch_id: string;
        invited_email: string;
        tree_name: string;
        branch_name: string;
        invited_name_en: string;
        invited_name_ar: string;
        updated_at: string;
      }>(
        `SELECT i.tree_id,i.branch_id,i.invited_email,i.invited_name_en,
              i.invited_name_ar,i.updated_at,
              t.name_en tree_name,b.name_en branch_name
             FROM app.contributor_invitations i
             JOIN app.family_trees t ON t.id=i.tree_id
             JOIN app.subfamilies b ON b.id=i.branch_id AND b.tree_id=i.tree_id
             WHERE i.id=$1 AND i.status='pending' AND i.expires_at>now()
             FOR UPDATE OF i`,
        [invitationId],
      )
    ).rows[0];
    if (!row) throw new ApiError("INVALID_INVITATION", 409);
    await requireTreeOwner(client, row.tree_id, session.user_id);
    if (new Date(row.updated_at).getTime() > Date.now() - 60_000)
      throw new ApiError("RESEND_TOO_SOON", 429);
    await client.query(
      `UPDATE app.contributor_invitations
           SET token_hash=$2,expires_at=now()+interval '7 days',updated_at=now()
           WHERE id=$1`,
      [invitationId, collaborationTokenHash(token)],
    );
    await client.query(
      `INSERT INTO app.tree_activity(
            tree_id,branch_id,actor_user_id,action_type,target_type,target_id,
            subject_name_en,subject_name_ar,target_name_en
          ) VALUES($1,$2,$3,'invitation_resent','invitation',$4,$5,$6,$7)`,
      [
        row.tree_id,
        row.branch_id,
        session.user_id,
        invitationId,
        row.invited_name_en,
        row.invited_name_ar,
        row.branch_name,
      ],
    );
    return row;
  });
  await sendMail(
    contributorInvitationMail(
      invitation.invited_email,
      token,
      invitation.tree_name,
      invitation.branch_name,
    ),
  );
  return json({ ok: true });
}
